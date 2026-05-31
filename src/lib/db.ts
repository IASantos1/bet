/**
 * PostgreSQL connection pool and query helpers for BET62APOSTA.
 *
 * Import the `pool` export for raw queries, or use the typed helper
 * functions for the most common data-access patterns.
 */

import pg from 'pg';

const { Pool } = pg;

// ── Connection pool ──────────────────────────────────────────────────────────

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host:     process.env.PGHOST,
  port:     process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user:     process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

// ── Types ────────────────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  role: 'user' | 'admin';
  name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  balance: string; // NUMERIC comes back as string from pg
  free_bet_balance: string;
  kyc_verified: boolean;
  email_verified: boolean;
  birth_date: string | null;
  created_at: Date;
  updated_at: Date;
  self_exclusion_until: Date | null;
  cooling_off_until: Date | null;
  saved_iban: string | null;
  saved_account_holder: string | null;
  self_exclusion_reason: string | null;
}

export interface DbFixture {
  id: string;
  id_api: string;
  league_id: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  kickoff: Date | null;
  status: string | null;
  minute: number | null;
  home_score: number | null;
  away_score: number | null;
  sport: string;
  source: string;
  last_odds_snapshot_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbOddsSnapshot {
  id: string;
  fixture_id: string;
  bookmaker: string;
  market: string;
  market_type: string;
  line: string | null;
  value: string | null;
  odds: string;
  source: string;
  created_at: Date;
}

export interface DbBet {
  id: string;
  user_id: string;
  bet_type: string;
  stake: string;
  potential_win: string;
  total_odds: string;
  status: string;
  is_free_bet: boolean;
  winnings: string | null;
  selections: unknown;
  total_stake: string | null;
  potential_return: string | null;
  cashout_value: string | null;
  cashout_at: Date | null;
  settled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── Helper functions ─────────────────────────────────────────────────────────

/**
 * Fetch a user row by primary key.
 */
export async function getUserById(userId: string): Promise<DbUser | null> {
  const { rows } = await pool.query<DbUser>(
    'SELECT * FROM users WHERE id = $1 LIMIT 1',
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * Fetch a user row by email address (case-insensitive).
 */
export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const { rows } = await pool.query<DbUser>(
    'SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1',
    [email],
  );
  return rows[0] ?? null;
}

/**
 * Fetch the profile associated with a user.
 */
export async function getProfileByUserId(userId: string): Promise<DbProfile | null> {
  const { rows } = await pool.query<DbProfile>(
    'SELECT * FROM profiles WHERE user_id = $1 LIMIT 1',
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * Fetch a single fixture by its internal UUID.
 */
export async function getFixtureById(fixtureId: string): Promise<DbFixture | null> {
  const { rows } = await pool.query<DbFixture>(
    'SELECT * FROM fixtures WHERE id = $1 LIMIT 1',
    [fixtureId],
  );
  return rows[0] ?? null;
}

/**
 * Fetch fixtures for a given league, ordered by kickoff descending.
 * @param leagueId  Internal league UUID.
 * @param limit     Maximum rows to return (default 50).
 */
export async function getFixturesByLeague(
  leagueId: string,
  limit = 50,
): Promise<DbFixture[]> {
  const { rows } = await pool.query<DbFixture>(
    `SELECT * FROM fixtures
     WHERE league_id = $1
     ORDER BY kickoff DESC
     LIMIT $2`,
    [leagueId, limit],
  );
  return rows;
}

/**
 * Fetch currently live fixtures, optionally filtered by sport.
 * @param sport  Sport slug (e.g. 'football'). Pass null/undefined for all sports.
 * @param limit  Maximum rows to return (default 100).
 */
export async function getLiveFixtures(
  sport?: string | null,
  limit = 100,
): Promise<DbFixture[]> {
  const liveStatuses = ['1H', '2H', 'ET', 'PEN', 'LIVE', 'INPLAY', 'HT'];
  const placeholders = liveStatuses.map((_, i) => `$${i + 1}`).join(', ');

  if (sport) {
    const { rows } = await pool.query<DbFixture>(
      `SELECT * FROM fixtures
       WHERE status = ANY(ARRAY[${placeholders}])
         AND sport = $${liveStatuses.length + 1}
       ORDER BY kickoff ASC
       LIMIT $${liveStatuses.length + 2}`,
      [...liveStatuses, sport, limit],
    );
    return rows;
  }

  const { rows } = await pool.query<DbFixture>(
    `SELECT * FROM fixtures
     WHERE status = ANY(ARRAY[${placeholders}])
     ORDER BY kickoff ASC
     LIMIT $${liveStatuses.length + 1}`,
    [...liveStatuses, limit],
  );
  return rows;
}

/**
 * Fetch upcoming (not-yet-started) fixtures, optionally filtered by sport.
 * @param sport  Sport slug. Pass null/undefined for all sports.
 * @param limit  Maximum rows to return (default 100).
 */
export async function getUpcomingFixtures(
  sport?: string | null,
  limit = 100,
): Promise<DbFixture[]> {
  if (sport) {
    const { rows } = await pool.query<DbFixture>(
      `SELECT * FROM fixtures
       WHERE status IN ('NS', 'TBD', 'SCHEDULED')
         AND kickoff > NOW()
         AND sport = $1
       ORDER BY kickoff ASC
       LIMIT $2`,
      [sport, limit],
    );
    return rows;
  }

  const { rows } = await pool.query<DbFixture>(
    `SELECT * FROM fixtures
     WHERE status IN ('NS', 'TBD', 'SCHEDULED')
       AND kickoff > NOW()
     ORDER BY kickoff ASC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

/**
 * Fetch the most recent odds snapshots for a fixture, one row per
 * bookmaker/market/market_type/line/value combination.
 */
export async function getLatestOdds(fixtureId: string): Promise<DbOddsSnapshot[]> {
  const { rows } = await pool.query<DbOddsSnapshot>(
    `SELECT DISTINCT ON (bookmaker, market, market_type, line, value)
            *
     FROM   odds_snapshots
     WHERE  fixture_id = $1
     ORDER  BY bookmaker, market, market_type, line, value, created_at DESC`,
    [fixtureId],
  );
  return rows;
}

/**
 * Fetch bets placed by a user, newest first.
 * @param userId  User UUID.
 * @param limit   Maximum rows to return (default 50).
 */
export async function getUserBets(userId: string, limit = 50): Promise<DbBet[]> {
  const { rows } = await pool.query<DbBet>(
    `SELECT * FROM bets
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

/**
 * Return the current balance for a user (from the profiles table).
 * Returns null if the profile does not exist.
 */
export async function getUserBalance(userId: string): Promise<number | null> {
  const { rows } = await pool.query<{ balance: string }>(
    'SELECT balance FROM profiles WHERE user_id = $1 LIMIT 1',
    [userId],
  );
  if (!rows[0]) return null;
  return parseFloat(rows[0].balance);
}

/**
 * Atomically add `amount` to a user's balance (use a negative value to deduct).
 * Returns the new balance, or null if the profile was not found.
 */
export async function updateUserBalance(
  userId: string,
  amount: number,
): Promise<number | null> {
  const { rows } = await pool.query<{ balance: string }>(
    `UPDATE profiles
     SET balance    = balance + $1,
         updated_at = NOW()
     WHERE user_id  = $2
     RETURNING balance`,
    [amount, userId],
  );
  if (!rows[0]) return null;
  return parseFloat(rows[0].balance);
}

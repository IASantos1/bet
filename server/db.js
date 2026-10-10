import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  email           TEXT    NOT NULL UNIQUE,
  name            TEXT    NOT NULL,
  birthdate       TEXT    NOT NULL,
  phone           TEXT,
  password_hash   TEXT    NOT NULL,
  role            TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  balance_cents   INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  excluded_until  TEXT,
  created_at      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL
);

-- Wallet ledger: every balance change is recorded here with the resulting balance.
CREATE TABLE IF NOT EXISTS transactions (
  id                  INTEGER PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  type                TEXT    NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'withdrawal_refund', 'bet', 'payout', 'refund', 'casino_out', 'casino_in', 'admin_credit', 'admin_debit', 'bonus_convert', 'chargeback', 'casino_bet', 'casino_win', 'free_spin_win', 'cashout', 'affiliate_commission', 'affiliate_reversal')),
  amount_cents        INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  description         TEXT    NOT NULL,
  ref                 TEXT,
  created_at          TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, id);

-- Identity documents a player sends for verification (KYC); the administrator approves or rejects them.
CREATE TABLE IF NOT EXISTS kyc_documents (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL,
  file_name   TEXT    NOT NULL,
  mime_type   TEXT    NOT NULL,
  file_size   INTEGER NOT NULL,
  data        BLOB    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TEXT    NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_kyc_user ON kyc_documents(user_id, id);

CREATE TABLE IF NOT EXISTS withdrawals (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  iban         TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   TEXT    NOT NULL,
  decided_at   TEXT
);

-- Stripe deposits (session_id = the PaymentIntent id): one row per deposit; credited once, when Stripe says it is paid.
CREATE TABLE IF NOT EXISTS stripe_payments (
  id             INTEGER PRIMARY KEY,
  session_id     TEXT    NOT NULL UNIQUE,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  currency       TEXT    NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'pending',
  payment_intent TEXT,
  method         TEXT,
  entity         TEXT,
  reference      TEXT,
  expires_at     TEXT,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_stripe_user ON stripe_payments(user_id, id);

-- Settings changed in the admin (key → JSON value), read by the server while it runs.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY,
  sport       TEXT    NOT NULL,
  competition TEXT    NOT NULL,
  home        TEXT    NOT NULL,
  away        TEXT    NOT NULL,
  start_time  TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finished', 'cancelled')),
  home_score  INTEGER,
  away_score  INTEGER,
  clock       TEXT,
  result      TEXT    CHECK (result IN ('1', 'X', '2')),
  featured    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status, start_time);

-- Priced selections per market (see server/markets.js). Odds are integer hundredths (2.15 -> 215).
CREATE TABLE IF NOT EXISTS selections (
  id        INTEGER PRIMARY KEY,
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  market    TEXT    NOT NULL DEFAULT '1x2' CHECK (market IN ('1x2', 'dc', 'dnb', 'ou', 'btts', 'ml', 'hcp', 'gou', 'ghcp', 'goe', 'pw', 'pou', 'phcp', 'poe', 'pbtts', 'cs', 'oe', 'tou', 'x')),
  code      TEXT    NOT NULL,
  odds_x100 INTEGER NOT NULL CHECK (odds_x100 > 100),
  active    INTEGER NOT NULL DEFAULT 1,
  UNIQUE (event_id, market, code)
);

CREATE TABLE IF NOT EXISTS bets (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  type            TEXT    NOT NULL CHECK (type IN ('single', 'multiple', 'builder')),
  stake_cents     INTEGER NOT NULL CHECK (stake_cents > 0),
  total_odds      REAL    NOT NULL,
  potential_cents INTEGER NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'void', 'cashout')),
  payout_cents    INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL,
  settled_at      TEXT,
  -- How the bet was paid for (real / bonus / free bet) and what of its payout was real money.
  real_stake_cents    INTEGER,
  bonus_stake_cents   INTEGER NOT NULL DEFAULT 0,
  freebet_stake_cents INTEGER NOT NULL DEFAULT 0,
  bonus_id            INTEGER,
  freebet_id          INTEGER,
  protected           INTEGER NOT NULL DEFAULT 0,
  real_payout_cents   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id, id);

CREATE TABLE IF NOT EXISTS bet_legs (
  id           INTEGER PRIMARY KEY,
  bet_id       INTEGER NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
  event_id     INTEGER NOT NULL REFERENCES events(id),
  selection_id INTEGER NOT NULL REFERENCES selections(id),
  market       TEXT    NOT NULL DEFAULT '1x2',
  code         TEXT    NOT NULL,
  odds_x100    INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'void'))
);
CREATE INDEX IF NOT EXISTS idx_bet_legs_event ON bet_legs(event_id, status);
CREATE INDEX IF NOT EXISTS idx_bet_legs_bet ON bet_legs(bet_id);

-- Promotions (server/promotions.js). A bonus is promotional money kept apart from the real balance
-- (never withdrawable) until its rollover is met; ref makes each grant unique (deposit / week).
CREATE TABLE IF NOT EXISTS bonuses (
  id                      INTEGER PRIMARY KEY,
  user_id                 INTEGER NOT NULL REFERENCES users(id),
  kind                    TEXT    NOT NULL CHECK (kind IN ('welcome', 'reload', 'cashback')),
  ref                     TEXT    NOT NULL UNIQUE,
  status                  TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
  deposit_cents           INTEGER NOT NULL DEFAULT 0,
  amount_cents            INTEGER NOT NULL CHECK (amount_cents > 0),
  balance_cents           INTEGER NOT NULL CHECK (balance_cents >= 0),
  rollover_target_cents   INTEGER NOT NULL,
  rollover_progress_cents INTEGER NOT NULL DEFAULT 0,
  min_odds_x100           INTEGER NOT NULL DEFAULT 100,
  max_count_cents         INTEGER,
  period                  TEXT,
  expires_at              TEXT    NOT NULL,
  created_at              TEXT    NOT NULL,
  ended_at                TEXT,
  cancel_reason           TEXT
);
CREATE INDEX IF NOT EXISTS idx_bonuses_user ON bonuses(user_id, status);

-- Free bets: a stake the player places without paying it (only the net winnings are paid).
CREATE TABLE IF NOT EXISTS freebets (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
  source        TEXT    NOT NULL,
  ref           TEXT    NOT NULL UNIQUE,
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'cancelled')),
  min_odds_x100 INTEGER NOT NULL DEFAULT 100,
  expires_at    TEXT    NOT NULL,
  created_at    TEXT    NOT NULL,
  used_at       TEXT,
  bet_id        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_freebets_user ON freebets(user_id, status);

-- Promotional ledger (bonus and free-bet money, rollover); (type, ref) unique so nothing is applied twice.
CREATE TABLE IF NOT EXISTS promo_ledger (
  id                  INTEGER PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  bonus_id            INTEGER,
  freebet_id          INTEGER,
  type                TEXT    NOT NULL,
  amount_cents        INTEGER NOT NULL,
  balance_after_cents INTEGER,
  description         TEXT    NOT NULL,
  ref                 TEXT,
  created_at          TEXT    NOT NULL,
  UNIQUE (type, ref)
);
CREATE INDEX IF NOT EXISTS idx_promo_ledger_user ON promo_ledger(user_id, id);

-- Every promotion decision (granted / refused and why), for the administrator.
CREATE TABLE IF NOT EXISTS promo_log (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  campaign   TEXT    NOT NULL,
  ref        TEXT,
  outcome    TEXT    NOT NULL,
  reason     TEXT,
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_promo_log_user ON promo_log(user_id, id);

-- Casino (BigBang, seamless wallet): every balance move the provider sends, once per transaction_id.
CREATE TABLE IF NOT EXISTS casino_moves (
  id                  INTEGER PRIMARY KEY,
  transaction_id      TEXT    NOT NULL UNIQUE,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  spins_id            INTEGER,
  amount_cents        INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  round_id            TEXT,
  type                TEXT,
  round_end           INTEGER,
  game                TEXT,
  game_id             INTEGER,
  provider            TEXT,
  created_at          TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_casino_moves_user ON casino_moves(user_id, id);

-- Casino free spins: a separate balance (spins × spin value) played only in the eligible games;
-- what it holds above the value granted is paid as real money when it closes.
CREATE TABLE IF NOT EXISTS casino_spins (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  ref             TEXT    NOT NULL UNIQUE,
  status          TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'expired', 'cancelled')),
  spins           INTEGER NOT NULL,
  spin_value_cents INTEGER NOT NULL,
  value_cents     INTEGER NOT NULL,
  balance_cents   INTEGER NOT NULL CHECK (balance_cents >= 0),
  games           TEXT    NOT NULL,
  deposit_cents   INTEGER NOT NULL DEFAULT 0,
  paid_cents      INTEGER NOT NULL DEFAULT 0,
  expires_at      TEXT    NOT NULL,
  created_at      TEXT    NOT NULL,
  ended_at        TEXT,
  cancel_reason   TEXT
);
CREATE INDEX IF NOT EXISTS idx_casino_spins_user ON casino_spins(user_id, status);

-- Cash outs done (audit): what was paid, the fair value at that moment and what the player had seen.
CREATE TABLE IF NOT EXISTS cashouts (
  id           INTEGER PRIMARY KEY,
  bet_id       INTEGER NOT NULL UNIQUE REFERENCES bets(id),
  user_id      INTEGER NOT NULL REFERENCES users(id),
  stake_cents  INTEGER NOT NULL,
  value_cents  INTEGER NOT NULL,
  fair_cents   INTEGER NOT NULL,
  seen_cents   INTEGER NOT NULL,
  live         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL
);

-- Settlement audit log: every result or void applied to an event, by whom and with what effect.
CREATE TABLE IF NOT EXISTS settlements (
  id           INTEGER PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id),
  action       TEXT    NOT NULL CHECK (action IN ('result', 'void')),
  home_score   INTEGER,
  away_score   INTEGER,
  bets_settled INTEGER NOT NULL DEFAULT 0,
  payout_cents INTEGER NOT NULL DEFAULT 0,
  source       TEXT    NOT NULL CHECK (source IN ('feed', 'admin', 'engine')),
  user_id      INTEGER REFERENCES users(id),
  note         TEXT,
  created_at   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_settlements_event ON settlements(event_id);

-- Affiliate programme (affiliates.js). One profile per player: the referral code is the server's.
CREATE TABLE IF NOT EXISTS affiliate_profiles (
  id                          INTEGER PRIMARY KEY,
  user_id                     INTEGER NOT NULL UNIQUE REFERENCES users(id),
  referral_code               TEXT    NOT NULL UNIQUE,
  status                      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'blocked')),
  admin_status                TEXT    CHECK (admin_status IN ('suspended', 'blocked')),
  admin_reason                TEXT,
  first_qualifying_deposit_at TEXT,
  clicks                      INTEGER NOT NULL DEFAULT 0,
  created_at                  TEXT    NOT NULL,
  updated_at                  TEXT    NOT NULL
);

-- Who brought each player: one attribution per referred player, never replaced by a later link.
CREATE TABLE IF NOT EXISTS referral_attributions (
  id                INTEGER PRIMARY KEY,
  affiliate_user_id INTEGER NOT NULL REFERENCES users(id),
  referred_user_id  INTEGER NOT NULL UNIQUE REFERENCES users(id),
  referral_code     TEXT    NOT NULL,
  source            TEXT    NOT NULL DEFAULT 'link',
  ip_hash           TEXT,
  status            TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'qualified', 'rejected')),
  reason            TEXT,
  attributed_at     TEXT    NOT NULL,
  CHECK (affiliate_user_id <> referred_user_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_affiliate ON referral_attributions(affiliate_user_id, attributed_at);

-- One commission per referred player and per deposit, in cents; paid through the wallet ledger.
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id                  INTEGER PRIMARY KEY,
  affiliate_user_id   INTEGER NOT NULL REFERENCES users(id),
  referred_user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id),
  deposit_tx_id       INTEGER NOT NULL UNIQUE REFERENCES transactions(id),
  deposit_ref         TEXT    NOT NULL UNIQUE,
  deposit_cents       INTEGER NOT NULL CHECK (deposit_cents > 0),
  rate_bps            INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  commission_cents    INTEGER NOT NULL CHECK (commission_cents >= 0),
  status              TEXT    NOT NULL CHECK (status IN ('pending', 'approved', 'paid', 'reversed', 'rejected')),
  review_reason       TEXT,
  approved_by         INTEGER REFERENCES users(id),
  approved_at         TEXT,
  paid_by             INTEGER REFERENCES users(id),
  paid_at             TEXT,
  payout_tx_id        INTEGER REFERENCES transactions(id),
  reversed_cents      INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aff_comm_affiliate ON affiliate_commissions(affiliate_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_aff_comm_status ON affiliate_commissions(status, created_at);

-- Audit trail of the programme (append-only: the triggers refuse changes and deletions).
CREATE TABLE IF NOT EXISTS affiliate_audit (
  id            INTEGER PRIMARY KEY,
  actor_user_id INTEGER,
  action        TEXT    NOT NULL,
  entity_type   TEXT    NOT NULL,
  entity_id     TEXT,
  result        TEXT    NOT NULL,
  metadata      TEXT,
  created_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aff_audit_entity ON affiliate_audit(entity_type, entity_id);
CREATE TRIGGER IF NOT EXISTS affiliate_audit_no_update BEFORE UPDATE ON affiliate_audit BEGIN SELECT RAISE(ABORT, 'affiliate_audit is append-only'); END;
CREATE TRIGGER IF NOT EXISTS affiliate_audit_no_delete BEFORE DELETE ON affiliate_audit BEGIN SELECT RAISE(ABORT, 'affiliate_audit is append-only'); END;
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Additive migrations for databases created by earlier versions. */
function migrate(db) {
  const pay = new Set(db.prepare('PRAGMA table_info(stripe_payments)').all().map((c) => c.name));
  for (const c of ['method', 'entity', 'reference', 'expires_at']) if (!pay.has(c)) db.exec(`ALTER TABLE stripe_payments ADD COLUMN ${c} TEXT`);
  const cols = new Set(db.prepare('PRAGMA table_info(events)').all().map((c) => c.name));
  // Events imported from an external data feed: where they came from and their id there.
  if (!cols.has('source')) db.exec("ALTER TABLE events ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  if (!cols.has('external_id')) db.exec('ALTER TABLE events ADD COLUMN external_id TEXT');
  if (!cols.has('odds_next_at')) db.exec('ALTER TABLE events ADD COLUMN odds_next_at TEXT');
  // Provider team ids, used for the club badges served by the provider's image proxy.
  if (!cols.has('home_team_ext')) db.exec('ALTER TABLE events ADD COLUMN home_team_ext TEXT');
  if (!cols.has('league_ext')) db.exec('ALTER TABLE events ADD COLUMN league_ext TEXT');
  if (!cols.has('away_team_ext')) db.exec('ALTER TABLE events ADD COLUMN away_team_ext TEXT');
  // When the current in-play price was received (live odds over the provider's WebSocket).
  if (!cols.has('live_odds_at')) db.exec('ALTER TABLE events ADD COLUMN live_odds_at TEXT');
  // When the provider first reported the match postponed (voided after 48 h without a new date).
  if (!cols.has('postponed_at')) db.exec('ALTER TABLE events ADD COLUMN postponed_at TEXT');
  if (!cols.has('home_country')) db.exec('ALTER TABLE events ADD COLUMN home_country TEXT');
  if (!cols.has('away_country')) db.exec('ALTER TABLE events ADD COLUMN away_country TEXT');
  // Live scoreboard details that do not fit the score/clock columns (tennis: set, point, server).
  if (!cols.has('live_detail')) db.exec('ALTER TABLE events ADD COLUMN live_detail TEXT');
  if (!cols.has('reg_home_score')) db.exec('ALTER TABLE events ADD COLUMN reg_home_score INTEGER');
  if (!cols.has('reg_away_score')) db.exec('ALTER TABLE events ADD COLUMN reg_away_score INTEGER');
  // Tennis: games won over every set (games markets) and whether the match ended in a retirement.
  if (!cols.has('home_games')) db.exec('ALTER TABLE events ADD COLUMN home_games INTEGER');
  if (!cols.has('away_games')) db.exec('ALTER TABLE events ADD COLUMN away_games INTEGER');
  if (!cols.has('retired')) db.exec('ALTER TABLE events ADD COLUMN retired INTEGER NOT NULL DEFAULT 0');
  // Score per period ([[home, away], …]: games per set in tennis, goals per half in football), for
  // the period markets; ht_home / ht_away hold the football half-time score seen in play.
  if (!cols.has('period_scores')) db.exec('ALTER TABLE events ADD COLUMN period_scores TEXT');
  if (!cols.has('ht_home')) db.exec('ALTER TABLE events ADD COLUMN ht_home INTEGER');
  if (!cols.has('ht_away')) db.exec('ALTER TABLE events ADD COLUMN ht_away INTEGER');
  // Second odds source (PropLine): when its in-play price was last confirmed, and when the score
  // last changed (a price must be newer than the last goal to be offered in play).
  if (!cols.has('pl_live_at')) db.exec('ALTER TABLE events ADD COLUMN pl_live_at TEXT');
  if (!cols.has('score_at')) db.exec('ALTER TABLE events ADD COLUMN score_at TEXT');
  // WinHouse: last time seen in a list, last clock minute, when it left the live list, ice-hockey
  // overtime seen; review_reason sends a match to the operator (Admin → Liquidação).
  for (const [c, type] of [['wh_seen_at', 'TEXT'], ['wh_minute', 'REAL'], ['wh_missing_since', 'TEXT'], ['wh_overtime', 'INTEGER NOT NULL DEFAULT 0'], ['review_reason', 'TEXT'],
    // Red cards of each side in play (from the match tracker), for the event cards.
    ['red_home', 'INTEGER'], ['red_away', 'INTEGER'], ['cards_at', 'TEXT']]) {
    if (!cols.has(c)) db.exec(`ALTER TABLE events ADD COLUMN ${c} ${type}`);
  }

  // Markets beyond 1X2: selections gain a market column (the table is rebuilt, keeping ids so
  // bet legs stay linked) and bet legs record the market they were placed on.
  const selCols = new Set(db.prepare('PRAGMA table_info(selections)').all().map((c) => c.name));
  if (!selCols.has('market')) {
    rebuild(db, 'selections', `INSERT INTO selections (id, event_id, market, code, odds_x100, active)
      SELECT id, event_id, '1x2', code, odds_x100, active FROM selections_old`);
  }
  // Match-winner market for other sports ('ml') and tennis handicaps / games totals: the market
  // CHECK is widened by a rebuild.
  const selSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'selections'").get()?.sql || '';
  if (!selSql.includes("'x'")) {
    rebuild(db, 'selections', `INSERT INTO selections (id, event_id, market, code, odds_x100, active)
      SELECT id, event_id, market, code, odds_x100, active FROM selections_old`);
  }
  // Which source priced a selection: NULL = the main provider (Bzzoiro), 'pl' = PropLine. Each
  // source only closes its own prices; a goal or the kick-off closes everything.
  if (!new Set(db.prepare('PRAGMA table_info(selections)').all().map((c) => c.name)).has('src')) {
    db.exec('ALTER TABLE selections ADD COLUMN src TEXT');
  }
  // Provider event ids matched to our events (PropLine has its own ids and team spellings).
  db.exec(`CREATE TABLE IF NOT EXISTS provider_links (
    provider TEXT NOT NULL, provider_event_id TEXT NOT NULL, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    sport_key TEXT NOT NULL, swapped INTEGER NOT NULL DEFAULT 0, matched_at TEXT NOT NULL,
    PRIMARY KEY (provider, provider_event_id)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_provider_links_event ON provider_links(event_id)');
  const legCols = new Set(db.prepare('PRAGMA table_info(bet_legs)').all().map((c) => c.name));
  if (!legCols.has('market')) db.exec("ALTER TABLE bet_legs ADD COLUMN market TEXT NOT NULL DEFAULT '1x2'");

  // Casino (aggregator Agent API): the player's code there.
  const userCols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  if (!userCols.has('casino_user_code')) db.exec('ALTER TABLE users ADD COLUMN casino_user_code INTEGER');
  // Single wallet: 1 while the player's balance is in the casino (a game is open).
  if (!userCols.has('casino_active')) db.exec('ALTER TABLE users ADD COLUMN casino_active INTEGER NOT NULL DEFAULT 0');
  // Admin panel: free-bet wallet, ban, identity verification (KYC) state.
  if (!userCols.has('freebet_cents')) db.exec('ALTER TABLE users ADD COLUMN freebet_cents INTEGER NOT NULL DEFAULT 0');
  if (!userCols.has('banned_at')) db.exec('ALTER TABLE users ADD COLUMN banned_at TEXT');
  if (!userCols.has('kyc_status')) db.exec("ALTER TABLE users ADD COLUMN kyc_status TEXT NOT NULL DEFAULT 'not_submitted'");
  // Profile: bank details for withdrawals, tax number, account preferences (JSON).
  for (const c of ['nif', 'iban', 'iban_name', 'prefs']) if (!userCols.has(c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} TEXT`);
  // Promotions: blocked by the administrator (abuse); responsible-gaming limits (JSON, see limits.js).
  if (!userCols.has('promo_blocked')) db.exec('ALTER TABLE users ADD COLUMN promo_blocked INTEGER NOT NULL DEFAULT 0');
  if (!userCols.has('limits')) db.exec('ALTER TABLE users ADD COLUMN limits TEXT');
  // How each bet was paid for (real / bonus / free bet) and what of its payout was real money.
  const betCols = new Set(db.prepare('PRAGMA table_info(bets)').all().map((c) => c.name));
  for (const [c, type] of [['real_stake_cents', 'INTEGER'], ['bonus_stake_cents', 'INTEGER NOT NULL DEFAULT 0'], ['freebet_stake_cents', 'INTEGER NOT NULL DEFAULT 0'],
    ['bonus_id', 'INTEGER'], ['freebet_id', 'INTEGER'], ['protected', 'INTEGER NOT NULL DEFAULT 0'], ['real_payout_cents', 'INTEGER']]) {
    if (!betCols.has(c)) db.exec(`ALTER TABLE bets ADD COLUMN ${c} ${type}`);
  }
  // A deposit made with the player's consent to a deposit bonus (1) or declining it (0).
  if (!pay.has('promo_opt')) db.exec('ALTER TABLE stripe_payments ADD COLUMN promo_opt INTEGER NOT NULL DEFAULT 1');
  // Free-bet balance given by the administrator before free bets were tokens: moved to a token.
  const legacy = db.prepare('SELECT id, freebet_cents FROM users WHERE freebet_cents > 0').all();
  for (const u of legacy) {
    db.prepare(`INSERT OR IGNORE INTO freebets (user_id, amount_cents, source, ref, expires_at, created_at) VALUES (?, ?, 'admin', ?, ?, ?)`)
      .run(u.id, u.freebet_cents, `legacy:${u.id}`, new Date(Date.now() + 30 * 86_400_000).toISOString(), new Date().toISOString());
    db.prepare('UPDATE users SET freebet_cents = 0 WHERE id = ?').run(u.id);
  }
  // Active sessions list: which browser / device opened each one.
  const sessCols = new Set(db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name));
  if (!sessCols.has('user_agent')) db.exec('ALTER TABLE sessions ADD COLUMN user_agent TEXT');
  // A hash of the address a session was opened from (affiliate fraud signals; never the address itself).
  if (!sessCols.has('ip_hash')) db.exec('ALTER TABLE sessions ADD COLUMN ip_hash TEXT');

  // Ledger types for casino transfers and admin adjustments. SQLite cannot alter a CHECK, so older databases get the
  // table rebuilt with the same rows.
  // Bet builder bets (several legs on one match).
  // Bet builder bets and cashed-out bets ('cashout'): the bets table is rebuilt with every column it has.
  const betsSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bets'").get()?.sql || '';
  if (betsSql && (!betsSql.includes("'builder'") || !betsSql.includes("'cashout'"))) rebuildKeeping(db, 'bets');
  const txSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'").get()?.sql || '';
  if (!txSql.includes("'affiliate_commission'")) {
    rebuild(db, 'transactions', `INSERT INTO transactions (id, user_id, type, amount_cents, balance_after_cents, description, ref, created_at)
      SELECT id, user_id, type, amount_cents, balance_after_cents, description, ref, created_at FROM transactions_old`);
  }
}

/** rebuild() copying every column the old table and the new definition have in common. */
function rebuildKeeping(db, table) {
  const before = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  // The new definition's columns: read from SCHEMA through a scratch in-memory table.
  const def = SCHEMA.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`))?.[1] || '';
  const after = def.split('\n').map((l) => /^\s{2}([a-z_]+)\s/.exec(l)?.[1]).filter(Boolean);
  const cols = before.filter((c) => after.includes(c)).join(', ');
  rebuild(db, table, `INSERT INTO ${table} (${cols}) SELECT ${cols} FROM ${table}_old`);
}

/** Recreates a table from SCHEMA (to change constraints SQLite cannot ALTER), copying its rows. */
function rebuild(db, table, copySql) {
  db.exec('PRAGMA foreign_keys = OFF');
  // Keep other tables' foreign keys pointing at the name, not at the renamed old table.
  db.exec('PRAGMA legacy_alter_table = ON');
  db.exec('BEGIN');
  try {
    db.exec(`ALTER TABLE ${table} RENAME TO ${table}_old`);
    // Indexes keep their names across a rename; drop them so SCHEMA can recreate them.
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL").all(`${table}_old`)) {
      db.exec(`DROP INDEX ${name}`);
    }
    db.exec(SCHEMA);
    db.exec(copySql);
    db.exec(`DROP TABLE ${table}_old`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA legacy_alter_table = OFF');
    db.exec('PRAGMA foreign_keys = ON');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external ON events(source, external_id) WHERE external_id IS NOT NULL');
}

/** Runs fn inside a write transaction; rolls back if it throws. Must not be nested. */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();

/** A setting saved in the admin, or `fallback` when none is saved. */
export function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .run(key, JSON.stringify(value), new Date().toISOString());
}

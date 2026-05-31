import type http from 'http';
import type pg from 'pg';
import { randomId } from '../lib/crypto';
import { readJsonBody, sendJson, badRequest, unauthorized } from '../lib/http';
import { requireUser } from '../lib/auth';

type PlaceBetBody = {
  type?: 'single' | 'multi';
  stake?: number;
  use_freebet?: boolean;
  bets?: Array<{ event_id: string | number; selection: string; odd: number; stake?: number }>;
};

function toNumber(v: any): number {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function getProfile(pool: pg.Pool, userId: string): Promise<{ balance: number; free_bet_balance: number }> {
  const r = await pool.query(`SELECT balance, free_bet_balance FROM profiles WHERE user_id = $1 LIMIT 1`, [userId]);
  const row = r.rows?.[0] || {};
  const balance = toNumber(row.balance);
  const free = toNumber(row.free_bet_balance);
  return { balance, free_bet_balance: free };
}

async function updateProfile(pool: pg.Pool, userId: string, balance: number, freeBet: number): Promise<void> {
  await pool.query(
    `UPDATE profiles SET balance = $2, free_bet_balance = $3, updated_at = NOW() WHERE user_id = $1`,
    [userId, balance, freeBet],
  );
}

export async function handleBetRoutes(
  pool: pg.Pool,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/promotions/freebets') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const p = await getProfile(pool, u.id);
    sendJson(res, 200, { amount_eur: p.free_bet_balance });
    return true;
  }

  if (req.method === 'GET' && path === '/api/bets') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const r = await pool.query(
      `SELECT id, bet_type, stake, potential_win, total_odds, status, is_free_bet, winnings, selections, created_at
       FROM bets
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [u.id],
    );

    const out = (r.rows || []).map((b: any) => {
      const selections = b.selections && typeof b.selections === 'object' ? b.selections : [];
      const arr = Array.isArray(selections) ? selections : [];
      const first = arr[0] || {};
      return {
        id: String(b.id),
        type: String(b.bet_type || ''),
        stake: toNumber(b.stake),
        potential_win: toNumber(b.potential_win),
        total_odds: toNumber(b.total_odds),
        status: String(b.status || 'pending'),
        is_freebet: b.is_free_bet ? 1 : 0,
        selection: first.selection ? String(first.selection) : '',
        odd: toNumber(first.odd),
        event_id: first.event_id != null ? first.event_id : null,
        team_match: first.team_match ? String(first.team_match) : '',
        league: first.league ? String(first.league) : '',
        selections: arr,
        created_at: b.created_at ? new Date(b.created_at).toISOString() : new Date().toISOString(),
      };
    });

    sendJson(res, 200, out);
    return true;
  }

  if (req.method === 'POST' && path === '/api/bets') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const body = await readJsonBody<PlaceBetBody>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;
    const type = body.type === 'multi' ? 'multi' : 'single';
    const bets = Array.isArray(body.bets) ? body.bets : [];
    if (bets.length === 0) return badRequest(res, 'No selections'), true;

    const totalOdds = bets.reduce((p, b) => p * Math.max(1, toNumber(b.odd)), 1);
    const payloadSelections = bets.map((b) => ({
      event_id: b.event_id,
      selection: String(b.selection || ''),
      odd: toNumber(b.odd),
      stake: b.stake != null ? toNumber(b.stake) : undefined,
      team_match: String((b as any).team_match || ''),
      league: String((b as any).league || ''),
      home_team: (b as any).home_team ? String((b as any).home_team) : undefined,
      away_team: (b as any).away_team ? String((b as any).away_team) : undefined,
    }));

    const stake =
      type === 'single'
        ? payloadSelections.reduce((s, x) => s + Math.max(0, toNumber(x.stake)), 0)
        : Math.max(0, toNumber(body.stake));
    if (!stake || stake <= 0) return badRequest(res, 'Invalid stake'), true;

    const profile = await getProfile(pool, u.id);
    const useFree = Boolean(body.use_freebet);
    if (useFree) {
      if (profile.free_bet_balance < stake) return badRequest(res, 'Saldo freebet insuficiente'), true;
    } else {
      if (profile.balance < stake) return badRequest(res, 'Saldo insuficiente'), true;
    }

    const potentialWin = stake * totalOdds;
    const betId = randomId(16);
    await pool.query(
      `INSERT INTO bets (id, user_id, bet_type, stake, potential_win, total_odds, status, is_free_bet, selections, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8::jsonb, NOW(), NOW())`,
      [betId, u.id, type, stake, potentialWin, totalOdds, useFree, JSON.stringify(payloadSelections)],
    );

    if (useFree) {
      await updateProfile(pool, u.id, profile.balance, profile.free_bet_balance - stake);
    } else {
      await updateProfile(pool, u.id, profile.balance - stake, profile.free_bet_balance);
    }

    sendJson(res, 200, { success: true, id: betId });
    return true;
  }

  const cashoutMatch = path.match(/^\/api\/bets\/([^/]+)\/cashout$/);
  if (cashoutMatch && req.method === 'POST') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const betId = cashoutMatch[1] || '';

    const r = await pool.query(
      `SELECT id, stake, status FROM bets WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [betId, u.id],
    );
    const b = r.rows?.[0];
    if (!b) return badRequest(res, 'Bet not found'), true;
    if (String(b.status) !== 'pending') return badRequest(res, 'Cashout indisponível'), true;

    const stake = toNumber(b.stake);
    const cashoutValue = Math.max(0, stake * 0.8);
    await pool.query(
      `UPDATE bets SET status = 'cashed_out', cashout_value = $2, cashout_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [betId, cashoutValue],
    );

    const profile = await getProfile(pool, u.id);
    await updateProfile(pool, u.id, profile.balance + cashoutValue, profile.free_bet_balance);
    sendJson(res, 200, { success: true, cashoutValue });
    return true;
  }

  return false;
}


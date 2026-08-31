import type http from 'http';
import type pg from 'pg';
import { randomId } from '../lib/crypto';
import { readJsonBody, sendJson, badRequest, unauthorized, resolveIdempotencyKey } from '../lib/http';
import { requireUser } from '../lib/auth';
import { WalletError, withTransaction, opReserveForBet, opCashout } from '../lib/ledger';
import { validateBetRequest, BetRejectedError, makeH2HOddsResolver } from '../lib/bettingEngine';
import { applyBonusWagering } from '../lib/bonusService';
import type { EventsService } from './events';

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

function handleWalletError(res: http.ServerResponse, e: unknown): boolean {
  if (e instanceof WalletError) {
    const status = e.code === 'INSUFFICIENT_FUNDS' || e.code === 'INVALID_AMOUNT' ? 400 : e.code === 'NOT_FOUND' ? 404 : 409;
    sendJson(res, status, { error: e.message, code: e.code });
    return true;
  }
  if (e instanceof BetRejectedError) {
    sendJson(res, 400, { error: e.message, code: e.code, details: e.details });
    return true;
  }
  return false;
}

async function getFreeBetBalance(pool: pg.Pool, userId: string): Promise<number> {
  const r = await pool.query(`SELECT free_bet_balance FROM profiles WHERE user_id = $1 LIMIT 1`, [userId]);
  return toNumber(r.rows?.[0]?.free_bet_balance);
}

export async function handleBetRoutes(
  pool: pg.Pool,
  events: EventsService,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/promotions/freebets') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    sendJson(res, 200, { amount_eur: await getFreeBetBalance(pool, u.id) });
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

  // POST /api/bets — atomically: create the bet ticket AND reserve the stake in the ledger.
  // Either both happen or neither does (spec §21 "Atomic Bet Transaction"). The idempotency key
  // (client-supplied, or a body hash fallback) means a double-submit of the exact same betslip
  // reserves the stake once, not twice (spec §48).
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

    const useFree = Boolean(body.use_freebet);
    const potentialWin = stake * totalOdds;
    const betId = randomId(16);
    const idempotencyKey = resolveIdempotencyKey(req, body, null);

    try {
      // Betting Engine (spec §20): odds/limit checks run before a single euro is reserved.
      await validateBetRequest({
        legs: payloadSelections.map((s) => ({ eventId: String(s.event_id ?? ''), selection: s.selection, odd: s.odd })),
        stake,
        totalOdds,
        resolveOdds: makeH2HOddsResolver((eventId) => events.getEventOdds(eventId)),
      });

      const result = await withTransaction(pool, async (client) => {
        const reservation = await opReserveForBet(client, { userId: u.id, amount: stake, idempotencyKey, betId, useBonus: useFree });
        if (!reservation.replayed) {
          await client.query(
            `INSERT INTO bets (id, user_id, bet_type, stake, potential_win, total_odds, status, is_free_bet, selections, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8::jsonb, NOW(), NOW())`,
            [betId, u.id, type, stake, potentialWin, totalOdds, useFree, JSON.stringify(payloadSelections)],
          );
        }
        return reservation;
      });
      if (!result.replayed) {
        await applyBonusWagering(pool, u.id, stake, totalOdds).catch(() => null);
      }
      sendJson(res, 200, { success: true, id: betId, balance: result.wallet.available });
    } catch (e) {
      if (!handleWalletError(res, e)) throw e;
    }
    return true;
  }

  // POST /api/bets/:id/cashout — atomically: mark the bet cashed out AND settle the ledger.
  const cashoutMatch = path.match(/^\/api\/bets\/([^/]+)\/cashout$/);
  if (cashoutMatch && req.method === 'POST') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const betId = cashoutMatch[1] || '';

    const r = await pool.query(`SELECT id, stake, status FROM bets WHERE id = $1 AND user_id = $2 LIMIT 1`, [betId, u.id]);
    const b = r.rows?.[0];
    if (!b) return badRequest(res, 'Bet not found'), true;
    if (String(b.status) !== 'pending') return badRequest(res, 'Cashout indisponível'), true;

    const stake = toNumber(b.stake);
    const cashoutValue = round2(Math.max(0, stake * 0.8));
    const idempotencyKey = resolveIdempotencyKey(req, {}, `cashout:${betId}`);

    try {
      const result = await withTransaction(pool, async (client) => {
        const settled = await opCashout(client, { userId: u.id, stake, cashoutValue, idempotencyKey, betId });
        if (!settled.replayed) {
          await client.query(
            `UPDATE bets SET status = 'cashed_out', cashout_value = $2, cashout_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'pending'`,
            [betId, cashoutValue],
          );
        }
        return settled;
      });
      sendJson(res, 200, { success: true, cashoutValue, balance: result.wallet.available });
    } catch (e) {
      if (!handleWalletError(res, e)) throw e;
    }
    return true;
  }

  return false;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

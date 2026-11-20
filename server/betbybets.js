// BETBY player bets we offer and settle ourselves (WinHouse has no player markets). Deliberately a small,
// self-contained system next to the main multi-leg engine: one single-selection bet per row, its market
// snapshot kept so settlement never depends on BETBY still carrying the game. The stake moves through the
// normal wallet (wallet.js postTransaction); settlement reads GOAL API (goalapi.js matchReport) and the
// grader (playermarkets.js) when our event finishes. Safety: no GOAL data -> the bet is voided (refunded),
// never settled wrong.

import { tx, nowIso } from './db.js';
import { HttpError } from './security.js';
import { postTransaction } from './wallet.js';
import { gradePlayerMarket, MARKET_KINDS } from './playermarkets.js';

const GRACE_VOID_MS = 3 * 3600_000; // finished this long with no GOAL data -> void (refund)

export function createBetbyBets(db, { goalApi = null, betby = null, limits = {}, log = () => {} } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS betby_bets (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    event_id TEXT NOT NULL,
    event_name TEXT,
    sport TEXT,
    betby_event_id TEXT,
    market_id TEXT,
    market_kind TEXT NOT NULL,
    market_name TEXT,
    player TEXT NOT NULL,
    side TEXT,
    odds_x100 INTEGER NOT NULL,
    stake_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'void')),
    payout_cents INTEGER NOT NULL DEFAULT 0,
    confidence TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    settled_at TEXT
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_betby_bets_open ON betby_bets (status, event_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_betby_bets_user ON betby_bets (user_id, created_at)');

  const minStake = limits.minStakeCents ?? 20;
  const maxStake = limits.maxStakeCents ?? 100_000;
  const maxPayout = limits.maxPayoutCents ?? 5_000_000;

  const insert = db.prepare(`INSERT INTO betby_bets
    (user_id, event_id, event_name, sport, betby_event_id, market_id, market_kind, market_name, player, side, odds_x100, stake_cents, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  /**
   * Places one BETBY player bet. `sel` carries the chosen market snapshot (kind, player, side, odd) plus
   * the stake. The odd is re-checked against the live BETBY market when the collector is available, so a
   * tampered price is rejected. The stake is debited from the wallet in the same transaction as the insert.
   */
  function place(user, sel = {}) {
    const stakeCents = Math.round(Number(sel.stakeCents));
    if (!Number.isFinite(stakeCents) || stakeCents < minStake) throw new HttpError(400, `Aposta mínima €${(minStake / 100).toFixed(2)}.`);
    if (stakeCents > maxStake) throw new HttpError(400, `Aposta máxima €${(maxStake / 100).toFixed(2)}.`);
    if (!MARKET_KINDS[sel.marketKind]) throw new HttpError(400, 'Mercado inválido.');
    if (!sel.player || typeof sel.player !== 'string') throw new HttpError(400, 'Jogador em falta.');
    const ev = db.prepare('SELECT id, sport, home, away, status FROM events WHERE id = ?').get(String(sel.eventId));
    if (!ev) throw new HttpError(404, 'Jogo não encontrado.');
    if (ev.sport !== 'futebol') throw new HttpError(400, 'Mercados de jogador só no futebol.');
    if (ev.status !== 'scheduled' && ev.status !== 'live') throw new HttpError(409, 'Jogo já encerrado.');

    // Confirm the odd and the player against the live BETBY market (anti-tamper). The odd may only be taken
    // at or below what BETBY shows now; a blocked or vanished selection is refused.
    let oddsX100 = Math.round(Number(sel.odds) * 100);
    if (betby?.on) {
      const m = betby.matchEvent({ sport: ev.sport, home: ev.home, away: ev.away, start: ev.start_time });
      if (!m) throw new HttpError(409, 'Jogo sem correspondência na BETBY.');
      // The caller passed the market id/outcome; re-read it live (handled by the route, which awaits the async fetch).
      const live = sel._liveMarkets || null;
      const market = Array.isArray(live) ? live.find((x) => String(x.marketId) === String(sel.marketId) && x.kind === sel.marketKind) : null;
      const outcome = market?.outcomes.find((o) => o.name && o.name === sel.player);
      if (!market || !outcome) throw new HttpError(409, 'Mercado/jogador já não disponível na BETBY.');
      if (outcome.blocked) throw new HttpError(409, 'Seleção suspensa.');
      if (!(outcome.odd > 1)) throw new HttpError(409, 'Odd indisponível.');
      if (oddsX100 > Math.round(outcome.odd * 100)) oddsX100 = Math.round(outcome.odd * 100); // never above BETBY
      sel.side = market.marketType && m.swapped ? sel.side : sel.side; // keep caller side
      sel.betbyEventId = m.event.id;
      sel.marketName = market.marketName;
    }
    if (!Number.isFinite(oddsX100) || oddsX100 <= 100) throw new HttpError(400, 'Odd inválida.');
    if (Math.floor((stakeCents * oddsX100) / 100) > maxPayout) throw new HttpError(400, 'Ganho possível acima do limite.');

    return tx(db, () => {
      postTransaction(db, user.id, -stakeCents, 'bet', `Aposta BETBY: ${sel.player} — ${sel.marketName || MARKET_KINDS[sel.marketKind].label}`, null);
      const info = insert.run(user.id, ev.id, `${ev.home} - ${ev.away}`, ev.sport, sel.betbyEventId || null, String(sel.marketId || ''),
        sel.marketKind, sel.marketName || MARKET_KINDS[sel.marketKind].label, sel.player, sel.side || null, oddsX100, stakeCents, nowIso());
      return Number(info.lastInsertRowid);
    });
  }

  /** Settles one open bet from the GOAL API match report. Pays a win, refunds a void; waits (grace) with no data. */
  async function settleOne(bet) {
    const ev = db.prepare('SELECT id, sport, home, away, status, updated_at FROM events WHERE id = ?').get(bet.event_id);
    if (!ev) return 'skip';
    if (ev.status === 'cancelled') return finish(bet, 'void', 0, 'Jogo cancelado');
    if (ev.status !== 'finished') return 'wait';
    const report = goalApi ? await goalApi.matchReport({ id: ev.id, sport: ev.sport, home: ev.home, away: ev.away }).catch(() => null) : null;
    const g = gradePlayerMarket({ kind: bet.market_kind, player: bet.player, side: bet.side }, report, { finished: true });
    if (g.result === 'WON') return finish(bet, 'won', Math.floor((bet.stake_cents * bet.odds_x100) / 100), g.reason, g.confidence);
    if (g.result === 'LOST') return finish(bet, 'lost', 0, g.reason, g.confidence);
    if (g.result === 'VOID') return finish(bet, 'void', bet.stake_cents, g.reason);
    // PENDING: GOAL API has no data yet. Wait out the grace, then void (refund) rather than settle blind.
    const finishedFor = Date.now() - Date.parse(ev.updated_at || '');
    if (Number.isFinite(finishedFor) && finishedFor > GRACE_VOID_MS) return finish(bet, 'void', bet.stake_cents, 'GOAL API sem dados do jogo');
    return 'wait';
  }

  function finish(bet, status, payoutCents, note, confidence = null) {
    return tx(db, () => {
      const cur = db.prepare("SELECT status FROM betby_bets WHERE id = ?").get(bet.id);
      if (!cur || cur.status !== 'open') return cur?.status || 'skip';
      if (payoutCents > 0) postTransaction(db, bet.user_id, payoutCents, 'payout', `Aposta BETBY #${bet.id}: ${status === 'won' ? 'ganha' : 'devolvida'} — ${bet.player}`, `betbybet:${bet.id}`);
      db.prepare("UPDATE betby_bets SET status = ?, payout_cents = ?, note = ?, confidence = ?, settled_at = ? WHERE id = ?")
        .run(status, payoutCents, note || null, confidence, nowIso(), bet.id);
      log(`aposta #${bet.id} ${status} (${bet.player}) → €${(payoutCents / 100).toFixed(2)}`);
      return status;
    });
  }

  /** Settles every open bet whose game has ended. Returns a tally. */
  async function settleOpen() {
    const open = db.prepare(`SELECT b.* FROM betby_bets b JOIN events e ON e.id = b.event_id
      WHERE b.status = 'open' AND e.status IN ('finished', 'cancelled')`).all();
    const tally = { won: 0, lost: 0, void: 0, wait: 0 };
    for (const bet of open) { const r = await settleOne(bet).catch(() => 'wait'); if (tally[r] != null) tally[r] += 1; }
    return tally;
  }

  const listForUser = (userId, limit = 50) => db.prepare('SELECT * FROM betby_bets WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit);
  const status = () => {
    const row = db.prepare("SELECT COUNT(*) n, SUM(status='open') open, SUM(status='won') won, SUM(status='lost') lost, SUM(status='void') v FROM betby_bets").get();
    return { total: row.n, open: row.open || 0, won: row.won || 0, lost: row.lost || 0, void: row.v || 0 };
  };

  return { place, settleOne, settleOpen, listForUser, status };
}

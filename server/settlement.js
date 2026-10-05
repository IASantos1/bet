// Settlement engine: keeps every bet moving to a final state without manual work, and tells the
// operator what needs a decision.
//
// Runs every minute (index.js):
//   1. Safety net — any finished or cancelled event that still has open bet legs is settled
//      (e.g. the process stopped half-way, or a result was set outside the normal paths).
//   2. Postponed matches — a match the provider reported postponed and that has not been
//      rescheduled within POSTPONED_VOID_HOURS (default 48 h) is voided: stakes are refunded.
//
// Needing attention (admin → Liquidação): live for too long, overdue without a result, postponed
// (with the time left before the automatic void). The operator settles them with a final score or
// voids them; every action lands in the settlements log with who did it.
//
// Results themselves come from the data feed (feed.js) or from the admin panel.

import { nowIso, tx } from './db.js';
import { settleEvent } from './betting.js';

const H = 3_600_000;

export function createSettlementEngine(db, {
  postponedVoidHours = 48, stuckLiveHours = 4, overdueHours = 3, log = () => {},
} = {}) {
  const state = { lastRun: null, lastResult: null, lastError: null };

  function runOnce() {
    const now = Date.now();
    let settled = 0;
    let voided = 0;

    const pending = db.prepare(
      `SELECT DISTINCT e.id FROM events e JOIN bet_legs l ON l.event_id = e.id AND l.status = 'open'
        WHERE e.status IN ('finished', 'cancelled')`
    ).all();
    for (const { id } of pending) {
      settled += tx(db, () => settleEvent(db, id, { source: 'engine', note: 'Liquidação de segurança (apostas em aberto)' })) > 0 ? 1 : 0;
    }

    const stale = db.prepare(
      `SELECT id FROM events WHERE status IN ('scheduled', 'live') AND postponed_at IS NOT NULL AND postponed_at <= ?`
    ).all(new Date(now - postponedVoidHours * H).toISOString());
    for (const { id } of stale) {
      tx(db, () => {
        db.prepare("UPDATE events SET status = 'cancelled', updated_at = ? WHERE id = ?").run(nowIso(), id);
        settleEvent(db, id, { source: 'engine', note: `Adiado há mais de ${postponedVoidHours} h sem nova data — apostas anuladas` });
      });
      voided += 1;
    }

    state.lastRun = nowIso();
    state.lastResult = { settled, voided };
    if (settled || voided) log(`liquidação: ${settled} eventos liquidados, ${voided} anulados`);
    return state.lastResult;
  }

  /** Events that need an operator decision, with what is at stake on each. */
  function queue() {
    const now = Date.now();
    const rows = db.prepare(
      `SELECT e.*, COUNT(DISTINCT l.bet_id) AS open_bets, COALESCE(SUM(b.stake_cents), 0) AS open_stake,
              COALESCE(SUM(b.potential_cents), 0) AS open_potential
         FROM events e
         LEFT JOIN bet_legs l ON l.event_id = e.id AND l.status = 'open'
         LEFT JOIN bets b ON b.id = l.bet_id
        WHERE (e.status IN ('scheduled', 'live') AND e.review_reason IS NOT NULL)
           OR (e.status = 'live' AND e.start_time <= ?)
           OR (e.status = 'scheduled' AND e.postponed_at IS NOT NULL)
           OR (e.status = 'scheduled' AND e.start_time <= ?)
        GROUP BY e.id
        ORDER BY e.start_time`
    ).all(new Date(now - stuckLiveHours * H).toISOString(), new Date(now - overdueHours * H).toISOString());
    return rows.map((e) => {
      let reason;
      if (e.review_reason) reason = e.review_reason;
      else if (e.postponed_at) {
        const left = Math.max(0, new Date(e.postponed_at).getTime() + postponedVoidHours * H - now);
        reason = `Adiado — anulação automática em ${Math.ceil(left / H)} h se não tiver nova data`;
      } else if (e.status === 'live') reason = `Ao vivo há mais de ${stuckLiveHours} h sem resultado`;
      else reason = `Devia ter começado há mais de ${overdueHours} h e não tem resultado`;
      return {
        id: e.id, home: e.home, away: e.away, competition: e.competition, startTime: e.start_time, status: e.status,
        source: e.source, homeScore: e.home_score, awayScore: e.away_score, reason,
        openBets: e.open_bets, openStake: e.open_stake / 100, openPotential: e.open_potential / 100,
      };
    });
  }

  function summary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const since = today.toISOString();
    const open = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(stake_cents), 0) AS s, COALESCE(SUM(potential_cents), 0) AS p FROM bets WHERE status = 'open'").get();
    const settledToday = db.prepare(
      "SELECT COUNT(*) AS n, COALESCE(SUM(stake_cents), 0) AS s, COALESCE(SUM(payout_cents), 0) AS p FROM bets WHERE status <> 'open' AND settled_at >= ?"
    ).get(since);
    return {
      openBets: open.n, openStake: open.s / 100, maxLiability: open.p / 100,
      settledToday: settledToday.n, stakesSettledToday: settledToday.s / 100, paidToday: settledToday.p / 100,
      marginToday: (settledToday.s - settledToday.p) / 100,
      lastRun: state.lastRun, lastResult: state.lastResult, postponedVoidHours,
    };
  }

  function history(limit = 50) {
    return db.prepare(
      `SELECT s.*, e.home, e.away, e.competition, u.name AS user_name FROM settlements s
         JOIN events e ON e.id = s.event_id LEFT JOIN users u ON u.id = s.user_id
        ORDER BY s.id DESC LIMIT ?`
    ).all(limit).map((s) => ({
      id: s.id, eventId: s.event_id, match: `${s.home} vs ${s.away}`, competition: s.competition, action: s.action,
      score: s.action === 'result' ? `${s.home_score} - ${s.away_score}` : null, betsSettled: s.bets_settled,
      payout: s.payout_cents / 100, source: s.source, user: s.user_name, note: s.note, createdAt: s.created_at,
    }));
  }

  function start(everyMs = 60_000) {
    const tick = () => {
      try { runOnce(); } catch (err) {
        state.lastError = err.message;
        log(`liquidação: ${err.message}`);
      }
    };
    tick();
    const timer = setInterval(tick, everyMs);
    return () => clearInterval(timer);
  }

  return { runOnce, queue, summary, history, start };
}

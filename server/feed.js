// Football data feed from sports.bzzoiro.com (API v2).
//
// Keeps the `events` / `selections` tables in step with the provider:
//   - fixtures: upcoming matches for the next N days, with consensus 1X2 odds (pre-match only)
//   - live:     score and minute of matches in play; markets are suspended in play because the
//               provider only prices matches before kick-off
//   - results:  once a match is finished its result is written and open bets are settled;
//               cancelled/abandoned matches are voided and stakes refunded
//
// The response parsing is deliberately tolerant (several field spellings, paginated or plain
// lists) so a small upstream change does not stop the platform; anything unusable is skipped.

import { nowIso, tx } from './db.js';
import { resultCode, settleEvent } from './betting.js';

const SOURCE = 'bzzoiro';

// ---------- normalisation ----------

const first = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');
const name = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? first(v.name, v.short_name) : undefined);
const toInt = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.trunc(Number(v)));

export function listOf(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  return first(data.results, data.events, data.data, data.items) || [];
}

/** Maps the provider's status vocabulary onto ours. */
export function mapStatus(raw) {
  const s = String(raw || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (!s || ['notstarted', 'upcoming', 'scheduled', 'ns', 'tbd', 'fixture'].includes(s)) return 'scheduled';
  if (['finished', 'ended', 'ft', 'aet', 'ap', 'afterpenalties', 'fulltime', 'complete', 'completed'].includes(s)) return 'finished';
  if (['postponed', 'delayed', 'suspended', 'interrupted', 'unresolved'].includes(s)) return 'postponed';
  if (['cancelled', 'canceled', 'abandoned', 'walkover', 'awarded', 'removed'].includes(s)) return 'cancelled';
  return 'live'; // inprogress, live, 1sthalf, halftime, 2ndhalf, extratime, penalties, …
}

export function normalizeEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const id = first(ev.id, ev.event_id);
  const home = first(name(ev.home_team), ev.home_team_name, name(ev.home), ev.home_name, name(ev.teams?.home));
  const away = first(name(ev.away_team), ev.away_team_name, name(ev.away), ev.away_name, name(ev.teams?.away));
  const start = first(ev.event_date, ev.date, ev.kickoff, ev.start_time, ev.start_at, ev.datetime);
  if (id === undefined || !home || !away || !start || Number.isNaN(new Date(start).getTime())) return null;
  const league = first(name(ev.league), ev.league_name, name(ev.competition), name(ev.tournament), 'Futebol');
  const minute = toInt(first(ev.current_minute, ev.minute, ev.elapsed));
  const period = first(ev.period, ev.status_detail);
  const teamId = (v) => { const n = toInt(v); return n !== null && n > 0 ? String(n) : null; };
  return {
    externalId: String(id),
    home: String(home).slice(0, 80),
    away: String(away).slice(0, 80),
    startTime: new Date(start).toISOString(),
    competition: String(league).slice(0, 80),
    status: mapStatus(first(ev.status, ev.state, ev.match_status)),
    homeScore: toInt(first(ev.home_score, ev.score?.home, ev.scores?.home, ev.home_goals)),
    awayScore: toInt(first(ev.away_score, ev.score?.away, ev.scores?.away, ev.away_goals)),
    clock: minute !== null ? `${minute}'` : /half.?time|^ht$/i.test(String(period || '')) ? 'Intervalo' : null,
    homeTeamId: teamId(first(ev.home_team?.id, ev.home_team_id, ev.home?.id, ev.teams?.home?.id)),
    awayTeamId: teamId(first(ev.away_team?.id, ev.away_team_id, ev.away?.id, ev.teams?.away?.id)),
  };
}

/** Consensus 1X2 prices from /events/{id}/odds/ → { '1': 2.1, X: 3.3, '2': 3.5 } (null when absent). */
export function normalizeOdds(data) {
  const o = data?.odds || data || {};
  const price = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 1 ? Math.round(n * 100) : null;
  };
  return {
    odds: { 1: price(first(o.home_win, o.home, o['1'])), X: price(first(o.draw, o.X, o.x)), 2: price(first(o.away_win, o.away, o['2'])) },
    nextUpdateAt: data?.next_update_at || null,
  };
}

const OUTCOME_CODE = { HOME: '1', DRAW: 'X', AWAY: '2', 1: '1', X: 'X', 2: '2' };

/** One row of the /odds/ feed (consensus on a free key) → { eventId, code, oddsX100, updatedAt } or null. */
export function normalizeOddsRow(r) {
  if (!r || typeof r !== 'object') return null;
  const market = String(first(r.market, r.market_slug, '1x2')).toLowerCase();
  if (!['1x2', 'match_result', 'match_winner', 'h2h'].includes(market)) return null;
  const period = String(first(r.period, 'ft')).toLowerCase();
  if (!['ft', 'full_time', 'fulltime', 'full-time', 'match'].includes(period)) return null;
  const eventId = first(r.event_id, r.event?.id, typeof r.event === 'number' || typeof r.event === 'string' ? r.event : undefined);
  const code = OUTCOME_CODE[String(first(r.outcome, r.selection, '')).toUpperCase()];
  const n = Number(first(r.decimal_odds, r.odds, r.price));
  if (eventId === undefined || !code || !Number.isFinite(n) || n <= 1) return null;
  return { eventId: String(eventId), code, oddsX100: Math.round(n * 100), updatedAt: first(r.updated_at, r.last_seen_at) || null };
}

// ---------- feed ----------

export function createFeed(db, {
  token, baseUrl = 'https://sports.bzzoiro.com/api/v2', days = 3, maxOddsCalls = 60, maxResultCalls = 40,
  fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  const state = { enabled: !!token, running: false, last: {}, lastError: null, lastErrorAt: null, oddsCursor: null };

  async function get(path, params = {}) {
    const url = new URL(`${baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const res = await fetchImpl(url, {
      headers: { Authorization: `Token ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = JSON.stringify(await res.json()).slice(0, 200); } catch { /* not JSON */ }
      throw new Error(`HTTP ${res.status} em ${url.pathname} ${detail}`.trim());
    }
    return res.json();
  }

  async function getAll(path, params, maxPages = 10) {
    const out = [];
    for (let page = 0; page < maxPages; page++) {
      const data = await get(path, { ...params, limit: 200, offset: page * 200 });
      const rows = listOf(data);
      out.push(...rows);
      if (rows.length < 200 || (data && typeof data === 'object' && !Array.isArray(data) && !data.next && data.count !== undefined && out.length >= data.count)) break;
    }
    return out;
  }

  // ---------- db helpers ----------

  const findEvent = db.prepare('SELECT * FROM events WHERE source = ? AND external_id = ?');

  function upsertFixture(ev) {
    const row = findEvent.get(SOURCE, ev.externalId);
    const ts = nowIso();
    if (!row) {
      if (ev.status !== 'scheduled' && ev.status !== 'live') return null;
      const { lastInsertRowid } = db.prepare(
        `INSERT INTO events (sport, competition, home, away, start_time, status, home_score, away_score, clock, source, external_id,
                             home_team_ext, away_team_ext, created_at, updated_at)
         VALUES ('futebol', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(ev.competition, ev.home, ev.away, ev.startTime, ev.status === 'live' ? 'live' : 'scheduled',
        ev.status === 'live' ? ev.homeScore ?? 0 : null, ev.status === 'live' ? ev.awayScore ?? 0 : null,
        ev.status === 'live' ? ev.clock : null, SOURCE, ev.externalId, ev.homeTeamId ?? null, ev.awayTeamId ?? null, ts, ts);
      return { id: Number(lastInsertRowid), created: true };
    }
    if (row.status === 'finished' || row.status === 'cancelled') return { id: row.id, closed: true };
    db.prepare(
      `UPDATE events SET competition = ?, home = ?, away = ?, start_time = ?, home_team_ext = COALESCE(?, home_team_ext),
         away_team_ext = COALESCE(?, away_team_ext), updated_at = ? WHERE id = ?`
    ).run(ev.competition, ev.home, ev.away, ev.startTime, ev.homeTeamId ?? null, ev.awayTeamId ?? null, ts, row.id);
    return { id: row.id };
  }

  function writeOdds(eventId, odds) {
    const upsert = db.prepare(
      `INSERT INTO selections (event_id, code, odds_x100, active) VALUES (?, ?, ?, 1)
       ON CONFLICT (event_id, code) DO UPDATE SET odds_x100 = excluded.odds_x100, active = 1`
    );
    const off = db.prepare('UPDATE selections SET active = 0 WHERE event_id = ? AND code = ?');
    for (const code of ['1', 'X', '2']) {
      if (odds[code]) upsert.run(eventId, code, odds[code]);
      else off.run(eventId, code);
    }
  }

  const suspendMarkets = (eventId) => db.prepare('UPDATE selections SET active = 0 WHERE event_id = ?').run(eventId);

  function finish(eventId, home, away) {
    db.prepare(
      "UPDATE events SET status = 'finished', home_score = ?, away_score = ?, result = ?, clock = 'Final', updated_at = ? WHERE id = ?"
    ).run(home, away, resultCode(home, away), nowIso(), eventId);
    return settleEvent(db, eventId);
  }

  function cancel(eventId) {
    db.prepare("UPDATE events SET status = 'cancelled', updated_at = ? WHERE id = ?").run(nowIso(), eventId);
    return settleEvent(db, eventId);
  }

  /** Applies a finished / cancelled / postponed status from the provider. Returns settled bet count. */
  function applyTerminal(row, ev) {
    if (ev.status === 'finished' && ev.homeScore !== null && ev.awayScore !== null) return tx(db, () => finish(row.id, ev.homeScore, ev.awayScore));
    if (ev.status === 'cancelled') return tx(db, () => cancel(row.id));
    if (ev.status === 'postponed') {
      // No price while the new date is unknown; the fixtures sync reopens it when a date is set.
      tx(db, () => {
        suspendMarkets(row.id);
        db.prepare("UPDATE events SET status = 'scheduled', clock = NULL, start_time = ?, odds_next_at = NULL, updated_at = ? WHERE id = ?")
          .run(ev.startTime, nowIso(), row.id);
      });
    }
    return 0;
  }

  // ---------- syncs ----------

  async function syncFixtures() {
    const from = new Date();
    const to = new Date(Date.now() + days * 86_400_000);
    const fixtures = (await getAll('/events/', {
      status: 'upcoming', date_from: from.toISOString().slice(0, 10), date_to: to.toISOString().slice(0, 10),
    })).map(normalizeEvent).filter(Boolean);

    let created = 0;
    for (const ev of fixtures) {
      const r = tx(db, () => upsertFixture(ev));
      if (r?.created) created += 1;
    }

    // Odds, cheapest first: one call to the bulk feed for every line re-read since last time. Matches it
    // has not priced yet (or every due match, if the bulk feed failed) fall back to one call each.
    let bulk = null;
    try { bulk = await syncOdds(); } catch (err) { log(`odds (lote): ${err.message}`); }
    const now = nowIso();
    const due = db.prepare(
      `SELECT id, external_id FROM events WHERE source = ? AND status = 'scheduled' AND start_time > ?
         AND (odds_next_at IS NULL OR odds_next_at <= ?)
         ${bulk ? 'AND NOT EXISTS (SELECT 1 FROM selections s WHERE s.event_id = events.id AND s.active = 1)' : ''}
       ORDER BY start_time LIMIT ?`
    ).all(SOURCE, now, now, maxOddsCalls);
    let priced = bulk ? bulk.events : 0;
    for (const row of due) {
      try {
        const { odds, nextUpdateAt } = normalizeOdds(await get(`/events/${encodeURIComponent(row.external_id)}/odds/`));
        const next = nextUpdateAt && new Date(nextUpdateAt) > new Date() ? nextUpdateAt : new Date(Date.now() + 30 * 60_000).toISOString();
        tx(db, () => {
          if (odds['1'] && odds['2']) { writeOdds(row.id, odds); priced += 1; } else suspendMarkets(row.id);
          db.prepare('UPDATE events SET odds_next_at = ? WHERE id = ?').run(next, row.id);
        });
      } catch (err) {
        log(`odds ${row.external_id}: ${err.message}`);
      }
    }
    return { fixtures: fixtures.length, created, priced };
  }

  /** Bulk consensus 1X2 prices from /odds/, incrementally via updated_after. Returns counts. */
  async function syncOdds() {
    const rows = (await getAll('/odds/', { market: '1x2', updated_after: state.oddsCursor ?? undefined }, 25))
      .map(normalizeOddsRow).filter(Boolean);
    const byEvent = new Map();
    let cursor = state.oddsCursor;
    for (const r of rows) {
      if (!byEvent.has(r.eventId)) byEvent.set(r.eventId, {});
      byEvent.get(r.eventId)[r.code] = r.oddsX100;
      if (r.updatedAt && (!cursor || r.updatedAt > cursor)) cursor = r.updatedAt;
    }
    const now = nowIso();
    const upsert = db.prepare(
      `INSERT INTO selections (event_id, code, odds_x100, active) VALUES (?, ?, ?, 1)
       ON CONFLICT (event_id, code) DO UPDATE SET odds_x100 = excluded.odds_x100, active = 1`
    );
    let events = 0;
    tx(db, () => {
      for (const [ext, prices] of byEvent) {
        const row = findEvent.get(SOURCE, ext);
        // Pre-match prices only: never (re)open a market that has kicked off.
        if (!row || row.status !== 'scheduled' || row.start_time <= now) continue;
        const existing = new Set(db.prepare('SELECT code FROM selections WHERE event_id = ? AND active = 1').all(row.id).map((s) => s.code));
        // A first price needs both sides; later rows may update one outcome at a time.
        if (!existing.size && !(prices['1'] && prices['2'])) continue;
        for (const [code, x100] of Object.entries(prices)) upsert.run(row.id, code, x100);
        events += 1;
      }
    });
    state.oddsCursor = cursor;
    return { rows: rows.length, events };
  }

  async function syncLive() {
    const live = listOf(await get('/events/live/')).map(normalizeEvent).filter(Boolean);
    let updated = 0;
    for (const ev of live) {
      const r = tx(db, () => {
        let row = findEvent.get(SOURCE, ev.externalId);
        if (!row) {
          const ins = upsertFixture({ ...ev, status: 'live' });
          if (!ins) return null;
          row = { id: ins.id, status: 'live' };
        }
        if (row.status === 'finished' || row.status === 'cancelled') return null;
        if (ev.status === 'finished' || ev.status === 'cancelled' || ev.status === 'postponed') return { terminal: row };
        db.prepare("UPDATE events SET status = 'live', home_score = ?, away_score = ?, clock = ?, updated_at = ? WHERE id = ?")
          .run(ev.homeScore ?? 0, ev.awayScore ?? 0, ev.clock, nowIso(), row.id);
        suspendMarkets(row.id); // pre-match prices only: never leave a stale price open in play
        return { id: row.id };
      });
      if (r?.terminal) applyTerminal(r.terminal, ev);
      if (r) updated += 1;
    }
    return { live: live.length, updated };
  }

  async function syncResults() {
    // Matches that should have started, and live ones: ask the provider how they stand.
    const rows = db.prepare(
      `SELECT * FROM events WHERE source = ? AND status IN ('scheduled', 'live') AND start_time <= ?
       ORDER BY start_time LIMIT ?`
    ).all(SOURCE, nowIso(), maxResultCalls);
    let settledEvents = 0;
    let settledBets = 0;
    for (const row of rows) {
      try {
        const ev = normalizeEvent(await get(`/events/${encodeURIComponent(row.external_id)}/`));
        if (!ev) continue;
        if (ev.status === 'finished' || ev.status === 'cancelled' || ev.status === 'postponed') {
          const n = applyTerminal(row, ev);
          if (ev.status !== 'postponed') { settledEvents += 1; settledBets += n; }
        } else if (ev.status === 'scheduled' && ev.startTime !== row.start_time) {
          db.prepare('UPDATE events SET start_time = ?, updated_at = ? WHERE id = ?').run(ev.startTime, nowIso(), row.id);
        }
      } catch (err) {
        log(`resultado ${row.external_id}: ${err.message}`);
      }
    }
    return { checked: rows.length, settledEvents, settledBets };
  }

  async function run(kind, fn) {
    if (!state.enabled) return { skipped: 'sem token' };
    try {
      const result = await fn();
      state.last[kind] = { at: nowIso(), ...result };
      return result;
    } catch (err) {
      state.lastError = `${kind}: ${err.message}`;
      state.lastErrorAt = nowIso();
      log(state.lastError);
      return { error: err.message };
    }
  }

  async function syncAll() {
    if (state.running) return { skipped: 'sincronização em curso' };
    state.running = true;
    try {
      return {
        fixtures: await run('fixtures', syncFixtures),
        live: await run('live', syncLive),
        results: await run('results', syncResults),
      };
    } finally {
      state.running = false;
    }
  }

  /** Starts the polling loops; returns a stop function. */
  function start({ liveMs = 30_000, fixturesMs = 10 * 60_000, resultsMs = 2 * 60_000 } = {}) {
    if (!state.enabled) return () => {};
    const guard = (kind, fn) => async () => {
      if (state.running) return;
      state.running = true;
      try { await run(kind, fn); } finally { state.running = false; }
    };
    const timers = [
      setInterval(guard('live', syncLive), liveMs),
      setInterval(guard('fixtures', syncFixtures), fixturesMs),
      setInterval(guard('results', syncResults), resultsMs),
    ];
    syncAll();
    return () => timers.forEach(clearInterval);
  }

  const status = () => ({
    provider: 'sports.bzzoiro.com', enabled: state.enabled, running: state.running,
    last: state.last, lastError: state.lastError, lastErrorAt: state.lastErrorAt,
    events: db.prepare("SELECT status, COUNT(*) AS n FROM events WHERE source = ? GROUP BY status").all(SOURCE)
      .reduce((acc, r) => ({ ...acc, [r.status]: r.n }), {}),
  });

  return { syncFixtures, syncOdds, syncLive, syncResults, syncAll, start, status };
}

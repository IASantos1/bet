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
    leagueId: teamId(first(ev.league?.id, ev.league_id, ev.competition?.id, ev.tournament?.id)),
    homeTeamId: teamId(first(ev.home_team?.id, ev.home_team_id, ev.home?.id, ev.teams?.home?.id)),
    awayTeamId: teamId(first(ev.away_team?.id, ev.away_team_id, ev.away?.id, ev.teams?.away?.id)),
    liveWs: ev.live_websocket === true,
  };
}

const toX100 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 1 ? Math.round(n * 100) : null;
};

// The eleven consensus keys of /events/{id}/odds/ → our market|code.
const EVENT_ODDS_KEYS = [
  ['1x2|1', ['home_win', 'home', '1']], ['1x2|X', ['draw', 'X', 'x']], ['1x2|2', ['away_win', 'away', '2']],
  ['ou|O1.5', ['over_15_goals']], ['ou|U1.5', ['under_15_goals']],
  ['ou|O2.5', ['over_25_goals']], ['ou|U2.5', ['under_25_goals']],
  ['ou|O3.5', ['over_35_goals']], ['ou|U3.5', ['under_35_goals']],
  ['btts|Y', ['btts_yes']], ['btts|N', ['btts_no']],
];
export const EVENT_ODDS_COVERED = EVENT_ODDS_KEYS.map(([k]) => k);

/** Consensus prices from /events/{id}/odds/ → { prices: { '1x2|1': 210, 'ou|O2.5': 185, … }, nextUpdateAt }. */
export function normalizeOdds(data) {
  const o = data?.odds || data || {};
  const prices = {};
  for (const [key, names] of EVENT_ODDS_KEYS) {
    const v = toX100(first(...names.map((n) => o[n])));
    if (v) prices[key] = v;
  }
  return { prices, nextUpdateAt: data?.next_update_at || null };
}

// Markets requested from the bulk /odds/ feed (its `market` vocabulary).
export const BULK_MARKETS = ['1x2', 'over_under_15', 'over_under_25', 'over_under_35', 'btts', 'double_chance', 'draw_no_bet'];

/** Maps the provider's (market, outcome) to our market|code, or null. */
export function mapMarket(rawMarket, rawOutcome) {
  const m = String(rawMarket || '').toLowerCase();
  const out = String(rawOutcome || '');
  const up = out.toUpperCase();
  if (['1x2', 'match_result', 'match_winner', 'h2h'].includes(m)) {
    const code = { HOME: '1', DRAW: 'X', AWAY: '2', 1: '1', X: 'X', 2: '2' }[up];
    return code ? `1x2|${code}` : null;
  }
  const ou = /^over_under_(\d)(\d)$/.exec(m);
  if (ou) {
    const line = `${ou[1]}.${ou[2]}`;
    return up === 'OVER' ? `ou|O${line}` : up === 'UNDER' ? `ou|U${line}` : null;
  }
  if (m === 'btts' || m === 'both_teams_to_score') return up === 'YES' ? 'btts|Y' : up === 'NO' ? 'btts|N' : null;
  if (m === 'double_chance') return ['1X', '12', 'X2'].includes(up) ? `dc|${up}` : null;
  if (m === 'draw_no_bet' || m === 'dnb') {
    const code = { HOME: '1', AWAY: '2', 1: '1', 2: '2' }[up];
    return code ? `dnb|${code}` : null;
  }
  return null;
}

/** One row of the /odds/ feed → { eventId, key: 'market|code', oddsX100, updatedAt, book } or null. */
export function normalizeOddsRow(r) {
  if (!r || typeof r !== 'object') return null;
  const period = String(first(r.period, 'ft')).toLowerCase();
  if (!['ft', 'full_time', 'fulltime', 'full-time', 'match'].includes(period)) return null;
  const eventId = first(r.event_id, r.event?.id, typeof r.event === 'number' || typeof r.event === 'string' ? r.event : undefined);
  const key = mapMarket(first(r.market, r.market_slug, '1x2'), first(r.outcome, r.selection, ''));
  const x100 = toX100(first(r.decimal_odds, r.odds, r.price));
  if (eventId === undefined || !key || !x100) return null;
  return {
    eventId: String(eventId), key, oddsX100: x100, updatedAt: first(r.updated_at, r.last_seen_at) || null,
    book: String(first(r.bookmaker_slug, r.bookmaker?.slug, 'consensus')),
  };
}

const STAT_LABELS = [
  ['ball_possession', 'Posse de bola', '%'], ['xg', 'Golos esperados (xG)', ''], ['total_shots', 'Remates', ''],
  ['shots_on_target', 'Remates à baliza', ''], ['big_chances', 'Grandes oportunidades', ''], ['corner_kicks', 'Cantos', ''],
  ['fouls', 'Faltas', ''], ['offsides', 'Foras de jogo', ''], ['yellow_cards', 'Cartões amarelos', ''], ['red_cards', 'Cartões vermelhos', ''],
];

/** /events/{id}/stats/ → [{ key, label, home, away, unit }] with only the stats the match reported. */
export function normalizeStats(data) {
  const home = data?.stats?.home || data?.home || {};
  const away = data?.stats?.away || data?.away || {};
  const val = (v) => (v && typeof v === 'object' ? first(v.actual, v.value, v.total) : v);
  return STAT_LABELS
    .map(([key, label, unit]) => ({ key, label, unit, home: val(home[key]), away: val(away[key]) }))
    .filter((s) => s.home !== undefined && s.home !== null && s.away !== undefined && s.away !== null)
    .map((s) => ({ ...s, home: Number(s.home), away: Number(s.away) }));
}

/** /events/{id}/incidents/ → [{ minute, type: goal|yellow|red|sub|var, side, player, detail }]. */
export function normalizeIncidents(data) {
  return listOf(Array.isArray(data?.incidents) ? data.incidents : data).map((i) => {
    const raw = String(first(i.type, i.incident_type, i.incidentType, '')).toLowerCase();
    const cls = String(first(i.card_type, i.incident_class, i.incidentClass, i.class, '')).toLowerCase();
    let type = null;
    if (raw.includes('goal')) type = 'goal';
    else if (raw.includes('card')) type = cls.includes('red') ? 'red' : 'yellow';
    else if (raw.includes('sub')) type = 'sub';
    else if (raw.includes('var')) type = 'var';
    if (!type || i.rescinded === true) return null;
    const home = first(i.is_home, i.isHome, i.home);
    const side = home === true ? 'home' : home === false ? 'away' : String(first(i.team, i.side, '')).toLowerCase() || null;
    return {
      minute: toInt(first(i.minute, i.time, i.min)), type, side: side === 'home' || side === 'away' ? side : null,
      player: first(name(i.player), i.player_name, name(i.player_in)) || null, detail: first(i.text, cls) || null,
    };
  }).filter(Boolean).sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
}

// ---------- feed ----------

export function createFeed(db, {
  token, baseUrl = 'https://sports.bzzoiro.com/api/v2', days = 3, maxOddsCalls = 60, maxResultCalls = 40,
  fetchImpl = globalThis.fetch, log = () => {}, liveSocket = null,
} = {}) {
  const state = {
    enabled: !!token, running: false, last: {}, lastError: null, lastErrorAt: null, oddsCursors: {},
    // Latest price per event|outcome per bookmaker. On a free key the feed sends only the
    // "consensus" row; with Football Unlimited it sends every book, and we average them.
    books: new Map(),
  };

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
                             home_team_ext, away_team_ext, league_ext, created_at, updated_at)
         VALUES ('futebol', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(ev.competition, ev.home, ev.away, ev.startTime, ev.status === 'live' ? 'live' : 'scheduled',
        ev.status === 'live' ? ev.homeScore ?? 0 : null, ev.status === 'live' ? ev.awayScore ?? 0 : null,
        ev.status === 'live' ? ev.clock : null, SOURCE, ev.externalId, ev.homeTeamId ?? null, ev.awayTeamId ?? null, ev.leagueId ?? null, ts, ts);
      return { id: Number(lastInsertRowid), created: true };
    }
    if (row.status === 'finished' || row.status === 'cancelled') return { id: row.id, closed: true };
    db.prepare(
      `UPDATE events SET competition = ?, home = ?, away = ?, start_time = ?, home_team_ext = COALESCE(?, home_team_ext),
         away_team_ext = COALESCE(?, away_team_ext), league_ext = COALESCE(?, league_ext), updated_at = ? WHERE id = ?`
    ).run(ev.competition, ev.home, ev.away, ev.startTime, ev.homeTeamId ?? null, ev.awayTeamId ?? null, ev.leagueId ?? null, ts, row.id);
    return { id: row.id };
  }

  const upsertSel = db.prepare(
    `INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT (event_id, market, code) DO UPDATE SET odds_x100 = excluded.odds_x100, active = 1`
  );
  const offSel = db.prepare('UPDATE selections SET active = 0 WHERE event_id = ? AND market = ? AND code = ?');

  /** Writes { 'market|code': x100 }; keys in `covered` but absent from `prices` are closed. */
  function writeOdds(eventId, prices, covered = []) {
    for (const [key, x100] of Object.entries(prices)) {
      const [market, code] = key.split('|');
      upsertSel.run(eventId, market, code, x100);
    }
    for (const key of covered) {
      if (prices[key]) continue;
      const [market, code] = key.split('|');
      offSel.run(eventId, market, code);
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
        const { prices, nextUpdateAt } = normalizeOdds(await get(`/events/${encodeURIComponent(row.external_id)}/odds/`));
        const next = nextUpdateAt && new Date(nextUpdateAt) > new Date() ? nextUpdateAt : new Date(Date.now() + 30 * 60_000).toISOString();
        tx(db, () => {
          if (prices['1x2|1'] && prices['1x2|2']) { writeOdds(row.id, prices, EVENT_ODDS_COVERED); priced += 1; } else suspendMarkets(row.id);
          db.prepare('UPDATE events SET odds_next_at = ? WHERE id = ?').run(next, row.id);
        });
      } catch (err) {
        log(`odds ${row.external_id}: ${err.message}`);
      }
    }
    return { fixtures: fixtures.length, created, priced };
  }

  /**
   * Bulk consensus prices from /odds/, one call per market and incrementally via updated_after.
   * Returns counts; throws only if every market failed (then callers fall back per match).
   */
  async function syncOdds() {
    const rows = [];
    let failures = 0;
    for (const market of BULK_MARKETS) {
      try {
        const got = (await getAll('/odds/', { market, updated_after: state.oddsCursors[market] ?? undefined }, 25))
          .map(normalizeOddsRow).filter(Boolean);
        let cursor = state.oddsCursors[market];
        for (const r of got) if (r.updatedAt && (!cursor || r.updatedAt > cursor)) cursor = r.updatedAt;
        state.oddsCursors[market] = cursor;
        rows.push(...got);
      } catch (err) {
        failures += 1;
        log(`odds (lote, ${market}): ${err.message}`);
        if (market === '1x2') throw err; // without match result there is nothing to offer
      }
    }
    if (failures === BULK_MARKETS.length) throw new Error('feed de odds indisponível');

    const byEvent = new Map();
    for (const r of rows) {
      const bookKey = `${r.eventId}|${r.key}`;
      if (!state.books.has(bookKey)) state.books.set(bookKey, new Map());
      state.books.get(bookKey).set(r.book, r.oddsX100);
      if (!byEvent.has(r.eventId)) byEvent.set(r.eventId, new Set());
      byEvent.get(r.eventId).add(r.key);
    }
    const now = nowIso();
    let events = 0;
    tx(db, () => {
      for (const [ext, keys] of byEvent) {
        const row = findEvent.get(SOURCE, ext);
        // Pre-match prices only: never (re)open a market that has kicked off.
        if (!row || row.status !== 'scheduled' || row.start_time <= now) continue;
        const prices = {};
        for (const key of keys) {
          const quotes = state.books.get(`${ext}|${key}`);
          // The provider's own consensus wins; otherwise the mean across the books quoting it.
          prices[key] = quotes.has('consensus')
            ? quotes.get('consensus')
            : Math.round([...quotes.values()].reduce((a, b) => a + b, 0) / quotes.size);
        }
        const has1x2 = db.prepare("SELECT 1 FROM selections WHERE event_id = ? AND market = '1x2' AND active = 1").get(row.id);
        // A match opens only with both sides of its result; after that any market may update alone.
        if (!has1x2 && !(prices['1x2|1'] && prices['1x2|2'])) continue;
        writeOdds(row.id, prices);
        events += 1;
      }
    });
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
        const home = ev.homeScore ?? 0;
        const away = ev.awayScore ?? 0;
        const scoreChanged = row.status === 'live' && (row.home_score !== home || row.away_score !== away);
        db.prepare("UPDATE events SET status = 'live', home_score = ?, away_score = ?, clock = ?, updated_at = ? WHERE id = ?")
          .run(home, away, ev.clock, nowIso(), row.id);
        // Pre-match prices never carry into play. Only an in-play price from the live socket
        // (live_odds_at) keeps the market open, and a goal voids that too.
        if (row.status !== 'live' || scoreChanged || !row.live_odds_at) {
          suspendMarkets(row.id);
          db.prepare('UPDATE events SET live_odds_at = NULL WHERE id = ?').run(row.id);
        }
        return { id: row.id };
      });
      if (r?.terminal) applyTerminal(r.terminal, ev);
      if (r) updated += 1;
    }
    liveSocket?.track(live.filter((ev) => ev.liveWs && ev.status === 'live').map((ev) => ev.externalId));
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
    liveSocket: liveSocket ? liveSocket.status() : { enabled: false },
    last: state.last, lastError: state.lastError, lastErrorAt: state.lastErrorAt,
    events: db.prepare("SELECT status, COUNT(*) AS n FROM events WHERE source = ? GROUP BY status").all(SOURCE)
      .reduce((acc, r) => ({ ...acc, [r.status]: r.n }), {}),
  });

  // Match page extras (stats + timeline), cached briefly so many viewers cost one request.
  const extrasCache = new Map();
  async function matchExtras(externalId, { live = false } = {}) {
    const hit = extrasCache.get(externalId);
    if (hit && Date.now() - hit.at < (live ? 30_000 : 5 * 60_000)) return hit.data;
    const [stats, incidents] = await Promise.all([
      get(`/events/${encodeURIComponent(externalId)}/stats/`).then(normalizeStats).catch(() => []),
      get(`/events/${encodeURIComponent(externalId)}/incidents/`).then(normalizeIncidents).catch(() => []),
    ]);
    const data = { stats, incidents };
    extrasCache.set(externalId, { at: Date.now(), data });
    if (extrasCache.size > 500) extrasCache.delete(extrasCache.keys().next().value);
    return data;
  }

  return { syncFixtures, syncOdds, syncLive, syncResults, syncAll, start, status, matchExtras };
}

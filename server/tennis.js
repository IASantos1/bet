// Tennis data feed from sports.bzzoiro.com (Tennis API v2, needs the Sports Addon).
//
// Keeps ATP/WTA matches in the `events` table as sport 'tenis', source 'bzzoiro-tennis':
//   - fixtures: matches of the next N days with the match-winner price (market 1x2, codes 1/2)
//   - live:     sets and current score of matches in play; the market is closed in play because
//               the price only comes pre-match
//   - results:  finished matches settle on the winner; walkovers, cancellations and retirements
//               before a set was completed are voided; a retirement after that settles on the
//               player who advances
//
// Players' countries are kept for flags; the player ids let the match page show rankings.

import { nowIso, tx } from './db.js';
import { settleEvent } from './betting.js';
import { listOf } from './feed.js';
import { twoWayPrices, createLivePriceGate, lineMarketPrices, parsePeriods } from './sports.js';

/**
 * Games won by each player over the match, from "6-4, 3-6, 7-6(5)". Null unless every set played
 * is there (the count matches the sets score), so a partial score never settles a games market.
 */
export function matchGames(m) {
  const sets = parsePeriods(m?.setsDetail);
  if (!sets.length || sets.length !== (m.homeSets ?? -1) + (m.awaySets ?? -1)) return null;
  return { home: sets.reduce((t, [h]) => t + h, 0), away: sets.reduce((t, [, a]) => t + a, 0) };
}

/** Sets / games markets the provider prices before the match (none of them in play). */
export const TENNIS_LINE_MARKETS = { OU_SETS: 'ou', SET_HCP: 'hcp', OU_GAMES: 'gou', GAMES_HCP: 'ghcp', OE_GAMES: 'goe' };

export const TENNIS_SOURCE = 'bzzoiro-tennis';

const first = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');
const toInt = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.trunc(Number(v)));
const odds100 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 1 && n < 1000 ? Math.round(n * 100) : null;
};
const countryCode = (v) => (typeof v === 'string' && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : null);

export function mapTennisStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s || s === 'scheduled' || s === 'notstarted' || s === 'not_started') return 'scheduled';
  if (s === 'live' || s === 'inprogress' || s === 'in_progress' || s === 'interrupted') return 'live';
  if (s === 'finished' || s === 'ended' || s === 'retired') return s === 'retired' ? 'retired' : 'finished';
  if (s === 'walkover') return 'walkover';
  if (s === 'postponed') return 'postponed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  return 'scheduled';
}

const player = (p) => (p && typeof p === 'object' ? {
  id: toInt(p.id), name: String(first(p.name, p.short_name, '')).slice(0, 80), country: countryCode(first(p.country_code, p.country)),
} : { id: null, name: '', country: null });

/** One match from /matches/ or /matches/{id}/. */
export function normalizeTennisMatch(m) {
  if (!m || typeof m !== 'object') return null;
  const p1 = player(m.player1);
  const p2 = player(m.player2);
  const start = first(m.match_date, m.date, m.start_time);
  if (m.id === undefined || !p1.name || !p2.name || !start || Number.isNaN(new Date(start).getTime())) return null;
  const t = m.tournament && typeof m.tournament === 'object' ? m.tournament : {};
  const tournament = String(first(t.name, typeof m.tournament === 'string' ? m.tournament : null, 'Ténis'));
  const circuit = first(t.circuit, m.circuit) || null;
  const competition = [circuit && !tournament.toUpperCase().includes(String(circuit).toUpperCase()) ? circuit : null, tournament, m.round_name]
    .filter(Boolean).join(' · ');
  return {
    externalId: String(m.id),
    home: p1.name, away: p2.name, homeId: p1.id, awayId: p2.id, homeCountry: p1.country, awayCountry: p2.country,
    startTime: new Date(start).toISOString(),
    competition: competition.slice(0, 80),
    tournamentId: toInt(t.id), circuit: circuit ? String(circuit).toUpperCase() : null, surface: first(t.surface, m.surface) || null,
    status: mapTennisStatus(m.status),
    homeSets: toInt(m.player1_sets), awaySets: toInt(m.player2_sets),
    setsDetail: typeof m.sets_detail === 'string' ? m.sets_detail.slice(0, 60) : null,
    winnerId: toInt(m.winner_id),
    odds1: odds100(m.odds_player1), odds2: odds100(m.odds_player2),
  };
}

// ---------- match page ----------

const STAT_LABELS = {
  aces: 'Ases', double_faults: 'Duplas faltas', first_serve_pct: '1.º serviço (%)', first_serve_percentage: '1.º serviço (%)',
  first_serve_points_won_pct: 'Pontos ganhos no 1.º serviço (%)', first_serve_won_pct: 'Pontos ganhos no 1.º serviço (%)',
  second_serve_points_won_pct: 'Pontos ganhos no 2.º serviço (%)', second_serve_won_pct: 'Pontos ganhos no 2.º serviço (%)',
  break_points_saved: 'Break points salvos', break_points_converted: 'Break points convertidos', break_points_won: 'Break points ganhos',
  winners: 'Winners', unforced_errors: 'Erros não forçados', total_points_won: 'Pontos ganhos', points_won: 'Pontos ganhos',
  service_games_won: 'Jogos de serviço ganhos', return_points_won: 'Pontos ganhos na resposta', max_points_in_row: 'Máx. pontos seguidos',
  service_points_won: 'Pontos ganhos no serviço',
};
const humanize = (k) => STAT_LABELS[k] || k.replace(/_/g, ' ').replace(/\bpct\b|percentage/g, '(%)').replace(/^./, (c) => c.toUpperCase());

/** Per-set statistics from /matches/{id}/ → [{ set, stats: [{ label, home, away, unit }] }]. */
export function normalizeTennisStats(m) {
  const raw = first(m?.statistics, m?.stats, m?.set_stats, m?.sets_statistics);
  if (!raw || typeof raw !== 'object') return [];
  const entries = Array.isArray(raw)
    ? raw.map((x, i) => [first(x.set, x.set_number, x.period, i + 1), x])
    : Object.entries(raw);
  return entries.map(([set, x]) => {
    const a = first(x?.player1, x?.home, x?.p1) || {};
    const b = first(x?.player2, x?.away, x?.p2) || {};
    const stats = Object.keys(a)
      .filter((k) => Number.isFinite(Number(a[k])) && Number.isFinite(Number(b[k])) && a[k] !== null && b[k] !== null && typeof a[k] !== 'boolean')
      .map((k) => ({ key: k, label: humanize(k), home: Number(a[k]), away: Number(b[k]), unit: /pct|percentage/.test(k) ? '%' : '' }));
    const label = /^(0|all|total|match)$/i.test(String(set)) ? 'Encontro' : `Set ${set}`;
    return { set: label, stats };
  }).filter((s) => s.stats.length);
}

const matchRow = (m, pid) => {
  const n = normalizeTennisMatch(m);
  if (!n) return null;
  const won = n.winnerId !== null && pid !== null ? n.winnerId === pid : null;
  return {
    eventId: toInt(m.id), date: n.startTime, home: n.home, away: n.away, competition: n.competition,
    score: n.setsDetail || (n.homeSets !== null ? `${n.homeSets}-${n.awaySets}` : null), winnerId: n.winnerId, won,
  };
};

/** /matches/{id}/h2h/ → meetings and each player's recent form (shape read tolerantly). */
export function normalizeTennisH2H(data, homeId, awayId) {
  if (!data || typeof data !== 'object') return null;
  const meetings = listOf(first(data.meetings, data.previous_meetings, data.h2h, data.matches, data.results))
    .map((m) => matchRow(m, homeId)).filter(Boolean).slice(0, 10);
  const form = (...keys) => {
    for (const k of keys) {
      const v = k.split('.').reduce((o, p) => (o ? o[p] : undefined), data);
      if (Array.isArray(v) || v?.results) return listOf(v);
    }
    return [];
  };
  const homeForm = form('player1_form', 'player1_recent', 'player1_last_matches', 'form.player1', 'recent_form.player1', 'player1.recent')
    .map((m) => matchRow(m, homeId)).filter(Boolean).slice(0, 5);
  const awayForm = form('player2_form', 'player2_recent', 'player2_last_matches', 'form.player2', 'recent_form.player2', 'player2.recent')
    .map((m) => matchRow(m, awayId)).filter(Boolean).slice(0, 5);
  let homeWins = toInt(first(data.player1_wins, data.p1_wins, data.summary?.player1_wins));
  let awayWins = toInt(first(data.player2_wins, data.p2_wins, data.summary?.player2_wins));
  if (homeWins === null) homeWins = meetings.filter((m) => m.winnerId !== null && m.winnerId === homeId).length;
  if (awayWins === null) awayWins = meetings.filter((m) => m.winnerId !== null && m.winnerId === awayId).length;
  if (!meetings.length && !homeForm.length && !awayForm.length && !homeWins && !awayWins) return null;
  return { total: toInt(first(data.total_matches, data.total)) ?? meetings.length, homeWins, awayWins, meetings, homeForm, awayForm };
}

/** /predictions/?match= → probabilities 0–100. */
export function normalizeTennisPrediction(data, homeId) {
  const p = listOf(data)[0] || (data && data.player1_win_prob !== undefined ? data : null);
  if (!p) return null;
  const pc = (v) => (Number.isFinite(Number(v)) && v !== null ? Math.round(Number(v) * 1000) / 10 : null);
  const home = pc(p.player1_win_prob);
  const away = pc(p.player2_win_prob);
  if (home === null && away === null) return null;
  const winner = toInt(p.predicted_winner_id);
  return {
    home, away, draw: null,
    predicted: winner === null ? null : winner === homeId ? 'home' : 'away',
    confidence: pc(p.confidence),
  };
}

// ---------- feed ----------

export function createTennisFeed(db, {
  token, baseUrl = 'https://sports.bzzoiro.com/tennis/api/v2', days = 3, maxResultCalls = 40, maxOddsCalls = 40,
  maxLiveOddsCalls = 25, liveOddsMaxAge = 180, prematchOddsSeconds = 60, fetchImpl = globalThis.fetch, log = () => {}, liveSocket = null,
} = {}) {
  const state = { enabled: !!token, running: false, last: {}, lastError: null, lastErrorAt: null, addonMissing: false };

  async function get(path, params = {}) {
    const url = new URL(`${baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const res = await fetchImpl(url, {
      headers: { Authorization: `Token ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 402) {
      state.addonMissing = true;
      throw new Error('A conta não tem o Sports Addon (necessário para o ténis).');
    }
    if (!res.ok) {
      let detail = '';
      try { detail = JSON.stringify(await res.json()).slice(0, 200); } catch { /* not JSON */ }
      throw new Error(`HTTP ${res.status} em ${url.pathname} ${detail}`.trim());
    }
    state.addonMissing = false;
    return res.json();
  }

  async function getAll(path, params, maxPages = 10) {
    const out = [];
    for (let page = 0; page < maxPages; page++) {
      const data = await get(path, { ...params, limit: 200, offset: page * 200 });
      const rows = listOf(data);
      out.push(...rows);
      if (rows.length < 200 || !data?.next) break;
    }
    return out;
  }

  const findEvent = db.prepare('SELECT * FROM events WHERE source = ? AND external_id = ?');
  const upsertSel = db.prepare(
    `INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT (event_id, market, code) DO UPDATE SET odds_x100 = excluded.odds_x100, active = 1`
  );
  const suspend = (eventId) => db.prepare('UPDATE selections SET active = 0 WHERE event_id = ?').run(eventId);

  function upsert(m) {
    const row = findEvent.get(TENNIS_SOURCE, m.externalId);
    const ts = nowIso();
    if (!row) {
      if (m.status !== 'scheduled' && m.status !== 'live') return null;
      const { lastInsertRowid } = db.prepare(
        `INSERT INTO events (sport, competition, home, away, start_time, status, home_score, away_score, clock, source, external_id,
                             home_team_ext, away_team_ext, league_ext, home_country, away_country, created_at, updated_at)
         VALUES ('tenis', ?, ?, ?, ?, 'scheduled', NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(m.competition, m.home, m.away, m.startTime, TENNIS_SOURCE, m.externalId,
        m.homeId ? String(m.homeId) : null, m.awayId ? String(m.awayId) : null, m.circuit, m.homeCountry, m.awayCountry, ts, ts);
      return { ...findEvent.get(TENNIS_SOURCE, m.externalId), created: true };
    }
    if (row.status === 'finished' || row.status === 'cancelled') return { ...row, closed: true };
    db.prepare(
      `UPDATE events SET competition = ?, home = ?, away = ?, start_time = ?, home_country = COALESCE(?, home_country),
         away_country = COALESCE(?, away_country), league_ext = COALESCE(?, league_ext), updated_at = ? WHERE id = ?`
    ).run(m.competition, m.home, m.away, m.startTime, m.homeCountry, m.awayCountry, m.circuit, ts, row.id);
    return findEvent.get(TENNIS_SOURCE, m.externalId);
  }

  const hasLineMarkets = db.prepare("SELECT 1 FROM selections WHERE event_id = ? AND market <> '1x2' AND active = 1 LIMIT 1");

  /** Prices from the match list when it carries them; otherwise /matches/{id}/odds/ (syncOdds). */
  function writePrices(row, m) {
    if (row.status !== 'scheduled' || m.status !== 'scheduled') return false;
    // /odds/ (syncOdds) also brings the sets / games markets; once it has, its winner price stays.
    if (!m.odds1 || !m.odds2 || hasLineMarkets.get(row.id)) return false;
    upsertSel.run(row.id, '1x2', '1', m.odds1);
    upsertSel.run(row.id, '1x2', '2', m.odds2);
    return true;
  }

  const oddsPrices = (data, since = null) => twoWayPrices(data, ['odds_player1', 'odds_home'], ['odds_player2', 'odds_away'], { market: '1x2', since });

  function applyPrices(eventId, prices) {
    db.prepare('UPDATE selections SET active = 0 WHERE event_id = ?').run(eventId);
    for (const [key, v] of Object.entries(prices)) upsertSel.run(eventId, ...key.split('|'), v);
  }

  /** Upcoming matches without a list price, soonest first, each asked every 10 min (3 in the last hour). */
  async function syncOdds() {
    const now = Date.now();
    const rows = db.prepare(
      `SELECT * FROM events WHERE source = ? AND status = 'scheduled' AND start_time > ? AND postponed_at IS NULL
         AND (odds_next_at IS NULL OR odds_next_at <= ?) ORDER BY start_time LIMIT ?`
    ).all(TENNIS_SOURCE, new Date(now).toISOString(), new Date(now).toISOString(), maxOddsCalls);
    let priced = 0;
    for (const row of rows) {
      let next = prematchOddsSeconds;
      try {
        const data = await get(`/matches/${encodeURIComponent(row.external_id)}/odds/`);
        const prices = { ...oddsPrices(data), ...lineMarketPrices(data, TENNIS_LINE_MARKETS) };
        if (new Date(row.start_time).getTime() - now < 3_600_000) next = prematchOddsSeconds / 2;
        tx(db, () => applyPrices(row.id, prices));
        if (Object.keys(prices).length) priced += 1;
      } catch (err) {
        log(`ténis odds ${row.external_id}: ${err.message}`);
      }
      db.prepare('UPDATE events SET odds_next_at = ? WHERE id = ?').run(new Date(now + next * 1000).toISOString(), row.id);
    }
    return { oddsChecked: rows.length, oddsPriced: priced };
  }

  const gate = createLivePriceGate(liveOddsMaxAge * 1000);
  const currentPrices = (eventId) => Object.fromEntries(
    db.prepare('SELECT market, code, odds_x100 FROM selections WHERE event_id = ?').all(eventId).map((r) => [`${r.market}|${r.code}`, r.odds_x100])
  );

  /**
   * In play, every 30 s: bookmaker prices updated after the start and in the last minutes; failing
   * that, the match price (from /odds/ or the live list) while it keeps moving — see
   * createLivePriceGate. With neither the market stays closed.
   */
  async function syncLiveOdds(listPrices = new Map()) {
    const rows = db.prepare(`SELECT * FROM events WHERE source = ? AND status = 'live' ORDER BY start_time LIMIT ?`).all(TENNIS_SOURCE, maxLiveOddsCalls);
    let open = 0;
    for (const row of rows) {
      // The live socket's own price is newer than anything REST has: leave the market to it.
      if (liveSocket?.hasFreshOdds?.(row.external_id)) { open += 1; continue; }
      let data = null;
      try {
        data = await get(`/matches/${encodeURIComponent(row.external_id)}/odds/`);
      } catch (err) {
        log(`ténis odds ao vivo ${row.external_id}: ${err.message}`);
      }
      const since = Math.max(Date.now() - liveOddsMaxAge * 1000, new Date(row.start_time).getTime());
      const fresh = data ? oddsPrices(data, since) : {};
      const fromOdds = data ? oddsPrices(data, 'untimed') : {};
      const any = Object.keys(fromOdds).length ? fromOdds : listPrices.get(row.external_id) || {};
      tx(db, () => {
        const verdict = gate(row.id, { fresh, any, previous: currentPrices(row.id) });
        if (!verdict) {
          suspend(row.id);
          db.prepare('UPDATE events SET live_odds_at = NULL WHERE id = ?').run(row.id);
          return;
        }
        applyPrices(row.id, verdict.prices);
        db.prepare('UPDATE events SET live_odds_at = ? WHERE id = ?').run(new Date(verdict.at).toISOString(), row.id);
        open += 1;
      });
    }
    return { liveOddsChecked: rows.length, liveMarketsOpen: open };
  }

  const voidMatch = (row, note) => {
    db.prepare("UPDATE events SET status = 'cancelled', clock = ?, updated_at = ? WHERE id = ?").run(note, nowIso(), row.id);
    return settleEvent(db, row.id, { source: 'feed', note });
  };

  /**
   * Final status from the provider. Scores are sets; when a retirement leaves the sets level the
   * advancing player is credited with the deciding set so the settlement follows the winner.
   */
  function applyTerminal(row, m) {
    if (m.status === 'walkover') return tx(db, () => voidMatch(row, 'Walkover — apostas anuladas'));
    if (m.status === 'cancelled') return tx(db, () => voidMatch(row, 'Cancelado — apostas anuladas'));
    if (m.status === 'postponed') {
      tx(db, () => {
        suspend(row.id);
        db.prepare(`UPDATE events SET status = 'scheduled', clock = NULL, start_time = ?, postponed_at = COALESCE(postponed_at, ?), updated_at = ? WHERE id = ?`)
          .run(m.startTime, nowIso(), nowIso(), row.id);
      });
      return 0;
    }
    if (m.status !== 'finished' && m.status !== 'retired') return 0;
    let home = m.homeSets ?? 0;
    let away = m.awaySets ?? 0;
    const winner = m.winnerId !== null && m.winnerId === m.homeId ? '1' : m.winnerId !== null && m.winnerId === m.awayId ? '2' : null;
    if (m.status === 'retired' && home + away === 0) return tx(db, () => voidMatch(row, 'Desistência antes do fim do 1.º set — apostas anuladas'));
    if (m.status === 'retired' && !winner) return 0; // who advances is not known yet
    if (winner === '1' && home <= away) home = away + 1;
    if (winner === '2' && away <= home) away = home + 1;
    if (home === away) return 0; // no winner yet: ask again on the next pass
    const clock = m.status === 'retired' ? `Desistência · ${m.setsDetail || ''}`.trim() : m.setsDetail || 'Final';
    const games = matchGames(m);
    return tx(db, () => {
      db.prepare(`UPDATE events SET status = 'finished', home_score = ?, away_score = ?, result = ?, clock = ?, home_games = ?, away_games = ?,
          retired = ?, updated_at = ? WHERE id = ?`)
        .run(home, away, home > away ? '1' : '2', clock.slice(0, 60), games?.home ?? null, games?.away ?? null,
          m.status === 'retired' ? 1 : 0, nowIso(), row.id);
      return settleEvent(db, row.id, { source: 'feed' });
    });
  }

  async function syncFixtures() {
    const from = new Date();
    const to = new Date(Date.now() + days * 86_400_000);
    const matches = (await getAll('/matches/', { date_from: from.toISOString().slice(0, 10), date_to: to.toISOString().slice(0, 10) }))
      .map(normalizeTennisMatch).filter(Boolean);
    let created = 0;
    let priced = 0;
    for (const m of matches) {
      tx(db, () => {
        const row = upsert(m);
        if (!row || row.closed) return;
        if (row.created) created += 1;
        if (writePrices(row, m)) priced += 1;
      });
    }
    const odds = await syncOdds();
    return { matches: matches.length, created, priced: priced + odds.oddsPriced, oddsChecked: odds.oddsChecked };
  }

  async function syncLive() {
    const live = listOf(await get('/matches/live/')).map(normalizeTennisMatch).filter(Boolean);
    let updated = 0;
    for (const m of live) {
      const terminal = tx(db, () => {
        const row = upsert({ ...m, status: m.status === 'scheduled' ? 'live' : m.status });
        if (!row || row.closed) return null;
        if (!['live', 'scheduled'].includes(m.status)) return row;
        // A match followed on the WebSocket has a point-by-point score; the REST poll only opens it.
        if (!liveSocket?.isFollowing(m.externalId)) {
          // Without the point-by-point feed the set in play comes from the set scores.
          const sets = String(m.setsDetail || '').split(',').map((x) => x.trim().match(/^(\d+)\s*-\s*(\d+)/)).filter(Boolean).map((x) => [Number(x[1]), Number(x[2])]);
          const detail = JSON.stringify({ set: sets.length || 1, point: null, server: null, sets });
          db.prepare("UPDATE events SET status = 'live', home_score = ?, away_score = ?, clock = ?, live_detail = ?, postponed_at = NULL, updated_at = ? WHERE id = ?")
            .run(m.homeSets ?? 0, m.awaySets ?? 0, m.setsDetail, detail, nowIso(), row.id);
        } else db.prepare("UPDATE events SET status = 'live', postponed_at = NULL WHERE id = ?").run(row.id);
        updated += 1;
        return null;
      });
      if (terminal) applyTerminal(terminal, m);
    }
    // Point-by-point scoreboard for the matches in play (WebSocket addon).
    liveSocket?.track(live.filter((m) => m.status === 'live' || m.status === 'scheduled').map((m) => m.externalId));
    const listPrices = new Map(live.filter((m) => m.odds1 && m.odds2).map((m) => [m.externalId, { '1x2|1': m.odds1, '1x2|2': m.odds2 }]));
    const inPlay = await syncLiveOdds(listPrices);
    return { live: live.length, updated, ...inPlay };
  }

  async function syncResults() {
    const rows = db.prepare(
      `SELECT * FROM events WHERE source = ? AND status IN ('scheduled', 'live') AND start_time <= ? ORDER BY start_time LIMIT ?`
    ).all(TENNIS_SOURCE, nowIso(), maxResultCalls);
    let settledEvents = 0;
    let settledBets = 0;
    for (const row of rows) {
      try {
        const m = normalizeTennisMatch(await get(`/matches/${encodeURIComponent(row.external_id)}/`));
        if (!m) continue;
        if (['finished', 'retired', 'walkover', 'cancelled'].includes(m.status)) {
          const before = db.prepare('SELECT status FROM events WHERE id = ?').get(row.id).status;
          const n = applyTerminal(row, m);
          if (db.prepare('SELECT status FROM events WHERE id = ?').get(row.id).status !== before) { settledEvents += 1; settledBets += n; }
        } else if (m.status === 'postponed') applyTerminal(row, m);
        else if (m.status === 'scheduled' && (m.startTime !== row.start_time || row.postponed_at)) {
          db.prepare('UPDATE events SET start_time = ?, postponed_at = NULL, updated_at = ? WHERE id = ?').run(m.startTime, nowIso(), row.id);
        }
      } catch (err) {
        log(`ténis ${row.external_id}: ${err.message}`);
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
      return { fixtures: await run('fixtures', syncFixtures), live: await run('live', syncLive), results: await run('results', syncResults) };
    } finally {
      state.running = false;
    }
  }

  function start({ liveMs = 5_000, fixturesMs = 10 * 60_000, resultsMs = 2 * 60_000, oddsMs = 15_000 } = {}) {
    if (!state.enabled) return () => {};
    // One lock per loop: a slow fixtures import never holds back the live score (every few seconds).
    const busy = new Set();
    const guard = (kind, fn) => async () => {
      if (busy.has(kind) || (state.addonMissing && kind !== 'fixtures')) return;
      busy.add(kind);
      try { await run(kind, fn); } finally { busy.delete(kind); }
    };
    const timers = [
      setInterval(guard('live', syncLive), liveMs),
      setInterval(guard('fixtures', syncFixtures), fixturesMs),
      setInterval(guard('odds', syncOdds), oddsMs),
      setInterval(guard('results', syncResults), resultsMs),
    ];
    syncAll();
    return () => timers.forEach(clearInterval);
  }

  const status = () => ({
    provider: 'sports.bzzoiro.com (ténis)', enabled: state.enabled, running: state.running, addonMissing: state.addonMissing,
    last: state.last, lastError: state.lastError, lastErrorAt: state.lastErrorAt,
    events: db.prepare('SELECT status, COUNT(*) AS n FROM events WHERE source = ? GROUP BY status').all(TENNIS_SOURCE)
      .reduce((acc, r) => ({ ...acc, [r.status]: r.n }), {}),
  });

  // ---------- match page ----------

  const cache = new Map();
  const cached = async (key, ttl, fn) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.data;
    const data = await fn();
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 800) cache.delete(cache.keys().next().value);
    return data;
  };

  /** Per-set statistics (live or finished). */
  function matchExtras(externalId, { live = false } = {}) {
    return cached(`x:${externalId}`, live ? 30_000 : 5 * 60_000, async () => {
      const m = await get(`/matches/${encodeURIComponent(externalId)}/`);
      return { sets: normalizeTennisStats(m), setsDetail: typeof m?.sets_detail === 'string' ? m.sets_detail : null };
    });
  }

  const ranking = (p) => {
    const r = p?.current_ranking;
    return r && typeof r === 'object' ? { position: toInt(r.position), points: toInt(r.points), type: r.type || null } : null;
  };

  function rankings(circuit) {
    const type = circuit === 'WTA' ? 'WTA' : 'ATP';
    return cached(`r:${type}`, 30 * 60_000, async () => ({
      type,
      rows: listOf(await get('/rankings/', { type, limit: 20 })).map((r) => ({
        position: toInt(r.position), points: toInt(r.points), playerId: toInt(r.player?.id),
        player: String(first(r.player?.name, '')).slice(0, 60), country: countryCode(r.player?.country_code),
      })).filter((r) => r.player),
    }));
  }

  /** H2H + recent form, model prediction and the players' rankings. */
  function matchInsights(row) {
    const homeId = toInt(row.home_team_ext);
    const awayId = toInt(row.away_team_ext);
    return cached(`i:${row.external_id}`, 10 * 60_000, async () => {
      const ext = encodeURIComponent(row.external_id);
      const playerInfo = (id) => (id ? cached(`p:${id}`, 60 * 60_000, () => get(`/players/${id}/`)).catch(() => null) : null);
      const [h2h, prediction, homeP, awayP, table] = await Promise.all([
        get(`/matches/${ext}/h2h/`).then((d) => normalizeTennisH2H(d, homeId, awayId)).catch(() => null),
        get('/predictions/', { match: row.external_id }).then((d) => normalizeTennisPrediction(d, homeId)).catch(() => null),
        playerInfo(homeId), playerInfo(awayId),
        rankings(row.league_ext).catch(() => null),
      ]);
      return {
        h2h, prediction,
        rankings: table ? {
          type: table.type, rows: table.rows,
          home: ranking(homeP) || table.rows.find((r) => r.playerId === homeId) || null,
          away: ranking(awayP) || table.rows.find((r) => r.playerId === awayId) || null,
        } : null,
        homeTeamId: homeId, awayTeamId: awayId,
      };
    });
  }

  const rawOdds = (externalId) => get(`/matches/${encodeURIComponent(externalId)}/odds/`);

  return { rawOdds, syncFixtures, syncOdds, syncLive, syncLiveOdds, syncResults, syncAll, start, status, matchExtras, matchInsights };
}

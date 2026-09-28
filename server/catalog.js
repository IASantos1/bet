// Market catalogue: asks the data provider what it really returns, sport by sport.
//
// The provider documents "every market" on its odds endpoints but not a closed list, and its
// football coverage varies by league (Full vs Lite). So instead of trusting a commercial list, this
// samples real upcoming and live games of each sport, reads their odds payloads and aggregates
// sport → market kind → family → period → lines → selections → bookmakers → pre-match/live.
// The operator runs it from the admin panel; the result says which markets can be wired.

import { nowIso } from './db.js';

const first = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');
const isPrice = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));

/** Markets Bet62 already offers, per sport (market kinds in the provider's vocabulary). */
export const WIRED = {
  futebol: ['1x2', 'match_winner', 'home_win', 'draw', 'away_win', 'over_under', 'btts', 'double_chance', 'draw_no_bet'],
  tenis: ['WINNER', 'odds_player1', 'OU_SETS', 'SET_HCP', 'OU_GAMES', 'GAMES_HCP', 'OE_GAMES'],
  basquetebol: ['WINNER', 'odds_home'],
  hoquei: ['1X2', 'DNB', 'odds_home'],
  dardos: ['WINNER', 'odds_player1'],
  esports: ['WINNER', 'odds_home'],
};

function entry(map, key, base) {
  if (!map.has(key)) map.set(key, { ...base, lines: new Set(), selections: new Set(), bookmakers: new Set(), events: new Set(), pre: 0, live: 0 });
  return map.get(key);
}

/** Folds one odds payload into `map` (whatever of the known shapes it has). */
export function analyzePayload(map, data, { eventId, live }) {
  if (!data || typeof data !== 'object') return;
  const mark = (e) => {
    if (!e.events.has(eventId)) { e.events.add(eventId); if (live) e.live += 1; else e.pre += 1; }
  };

  // Sports Pack shape: markets: [{ market_kind, market_family, market_line, market_period, selections, bookmakers: [{ prices }] }]
  if (Array.isArray(data.markets)) {
    for (const m of data.markets) {
      const kind = String(first(m.market_kind, m.kind, m.market, '?'));
      const family = String(first(m.market_family, m.family, kind));
      const period = String(first(m.market_period, m.period, 'FT'));
      const e = entry(map, `${kind}|${family}|${period}`, { kind, family, period, source: 'markets' });
      if (m.market_line !== null && m.market_line !== undefined) e.lines.add(String(m.market_line));
      for (const s of Array.isArray(m.selections) ? m.selections : []) e.selections.add(String(s));
      for (const b of Array.isArray(m.bookmakers) ? m.bookmakers : []) {
        e.bookmakers.add(String(first(b.bookmaker_slug, b.bookmaker, '?')));
        for (const s of Object.keys(b.prices || {})) e.selections.add(s);
      }
      mark(e);
    }
  } else if (data.markets && typeof data.markets === 'object') {
    // Object keyed by market name: { markets: { '1x2': { home, draw, away }, ... } }
    for (const [kind, v] of Object.entries(data.markets)) {
      const e = entry(map, `${kind}|${kind}|FT`, { kind, family: kind, period: 'FT', source: 'markets{}' });
      if (v && typeof v === 'object') for (const s of Object.keys(v)) e.selections.add(s);
      mark(e);
    }
  }

  // Match-winner flattened per bookmaker: bookmakers: [{ bookmaker, odds_home, odds_draw, odds_away … }]
  if (Array.isArray(data.bookmakers) && data.bookmakers.length) {
    const e = entry(map, 'WINNER|bookmakers|FT', { kind: 'WINNER', family: 'bookmakers (vencedor)', period: 'FT', source: 'bookmakers' });
    for (const b of data.bookmakers) {
      e.bookmakers.add(String(first(b.bookmaker_slug, b.bookmaker, '?')));
      for (const k of Object.keys(b)) if (/^odds_/.test(k) && isPrice(b[k])) e.selections.add(k);
    }
    mark(e);
  }

  // Row lists (football bulk /odds/): [{ market, outcome, period, bookmaker, decimal_odds }]
  const rows = Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : null;
  if (rows) {
    for (const r of rows) {
      if (!r || typeof r !== 'object' || r.market === undefined) continue;
      const kind = String(r.market);
      const period = String(first(r.period, 'ft'));
      const e = entry(map, `${kind}|${kind}|${period}`, { kind, family: kind, period, source: 'rows' });
      if (r.line !== undefined && r.line !== null) e.lines.add(String(r.line));
      if (r.outcome !== undefined) e.selections.add(String(r.outcome));
      e.bookmakers.add(String(first(r.bookmaker_slug, r.bookmaker?.slug, r.bookmaker, 'consensus')));
      mark(e);
    }
  }

  // Flat prices at the top level (football consensus /events/{id}/odds/, tennis /matches/{id}/odds/).
  const flat = data.odds && typeof data.odds === 'object' && !Array.isArray(data.odds) ? data.odds : data;
  const keys = Object.keys(flat).filter((k) => isPrice(flat[k]) && !/(^|_)id$|count|^event|^match/.test(k));
  if (keys.length) {
    const e = entry(map, 'flat|consenso|FT', { kind: 'flat', family: 'preço de consenso', period: 'FT', source: 'flat' });
    for (const k of keys) e.selections.add(k);
    mark(e);
  }
}

const LIMIT = (set, n) => { const a = [...set]; return a.length > n ? [...a.slice(0, n), `… +${a.length - n}`] : a; };

export function createMarketCatalog(db, providers, { log = () => {} } = {}) {
  let last = null;
  let running = false;

  /** providers: [{ sport, source, rawOdds(ext), extra?(ext) → payloads[] }] */
  async function run({ sample = 12, liveSample = 5 } = {}) {
    if (running) return last;
    running = true;
    try {
      const sports = [];
      let calls = 0;
      for (const p of providers) {
        if (!p.enabled()) { sports.push({ sport: p.sport, disabled: true, markets: [] }); continue; }
        const pick = (status, n) => db.prepare(
          `SELECT id, external_id, competition FROM events WHERE source = ? AND status = ? ${status === 'scheduled' ? 'AND start_time > ?' : ''}
            ORDER BY start_time LIMIT ?`
        ).all(...(status === 'scheduled' ? [p.source, status, nowIso(), n] : [p.source, status, n]));
        const games = [...pick('scheduled', sample).map((g) => ({ ...g, live: false })), ...pick('live', liveSample).map((g) => ({ ...g, live: true }))];
        const map = new Map();
        const errors = [];
        for (const g of games) {
          const payloads = [];
          try { payloads.push(await p.rawOdds(g.external_id)); calls += 1; } catch (err) { errors.push(`${g.external_id}: ${err.message}`); }
          for (const extra of p.extra ? p.extra(g.external_id) : []) {
            try { payloads.push(await extra); calls += 1; } catch { /* optional (e.g. a plan without it) */ }
          }
          for (const d of payloads) analyzePayload(map, d, { eventId: g.id, live: g.live });
        }
        const wired = new Set((WIRED[p.sport] || []).map((k) => k.toLowerCase()));
        sports.push({
          sport: p.sport, sampled: games.length, sampledLive: games.filter((g) => g.live).length,
          leagues: [...new Set(games.map((g) => g.competition))].slice(0, 12),
          errors: errors.slice(0, 5),
          markets: [...map.values()].map((e) => ({
            kind: e.kind, family: e.family, period: e.period, source: e.source,
            lines: LIMIT(e.lines, 12), selections: LIMIT(e.selections, 14), bookmakers: e.bookmakers.size,
            events: e.events.size, pre: e.pre, live: e.live,
            wired: wired.has(e.kind.toLowerCase()) || [...e.selections].some((s) => wired.has(String(s).toLowerCase())),
          })).sort((a, b) => b.events - a.events || a.kind.localeCompare(b.kind)),
        });
      }
      last = { at: nowIso(), calls, sports };
      log(`catálogo de mercados: ${calls} pedidos`);
      return last;
    } finally {
      running = false;
    }
  }

  return { run, last: () => last, running: () => running };
}


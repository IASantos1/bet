// Ready-made bets on the sports page, drawn at random from the pre-match board:
//   builders  "Construa o seu ganho": one football match, three legs settled together (bet builder):
//             the full-time result, one more market (both teams to score, cards, corners, shots
//             on target, team to score first) and goals over / under 1.5–3.5.
//   accas     "Apostas vencedoras": four favourites from different matches (full-time result /
//             winner): football of today, then of the next days; other sports only to complete the six.
// A draw is kept for a few minutes (it would reshuffle on every refresh otherwise); a card whose
// match started or whose prices closed is dropped, and the prices shown are always the current ones.
import { MARKETS, selectionLabel, splitSpecial } from './markets.js';
import { config } from './config.js';

const TZ = 'Europe/Lisbon';
const dayOf = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));

// The second builder leg: markets that sit alongside a full-time result without contradicting it
// or following from it (double chance always does one or the other, so it is left out).
const SECOND = [
  { key: 'btts', name: 'Ambas as equipas marcam', match: (s) => s.market === 'btts' },
  { key: 'cards', name: 'Cartões', match: (s) => s.market === 'x' && /cart(ã|a)o|cartões|cards?\b|booking/i.test(splitSpecial(s.code)?.group || '') },
  { key: 'corners', name: 'Cantos', match: (s) => s.market === 'x' && /cantos?|corners?/i.test(splitSpecial(s.code)?.group || '') },
  { key: 'shots', name: 'Remates à baliza', match: (s) => s.market === 'x' && /remates?|shots?/i.test(splitSpecial(s.code)?.group || '') },
  { key: 'first', name: 'Equipa a marcar primeiro', match: (s) => s.market === 'x' && /(primeir|first).*(gol|goal|marc|scor)|(marc|scor).*(primeir|first)/i.test(splitSpecial(s.code)?.group || '') },
];
const GOAL_LINES = new Set(['O1.5', 'U1.5', 'O2.5', 'U2.5', 'O3.5', 'U3.5']);

/** Bet builder price: the legs multiplied, less the margin for their correlation. */
export const builderOdds = (oddsList) => Math.round(oddsList.reduce((a, o) => a * o, 1) * config.builderFactor * 100) / 100;

/** Legs that cannot stand together in one builder (one makes the other impossible or certain). */
export function builderConflict(legs) {
  const markets = legs.map((l) => (l.market === 'x' ? `x${splitSpecial(l.code)?.id}` : l.market));
  if (new Set(markets).size !== markets.length) return 'Duas seleções do mesmo mercado.';
  const has = (m) => legs.find((l) => l.market === m);
  if (has('1x2') && has('dc')) return 'Resultado final e dupla hipótese não podem ser combinados.';
  const btts = has('btts');
  const ou = has('ou');
  // Both teams scoring means at least two goals.
  if (btts?.code === 'Y' && ou && /^U[01](\.5)?$/.test(ou.code)) return 'Ambas marcam e menos de 1.5 golos não podem ser combinados.';
  return null;
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
const shuffle = (arr, rng) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function createFeatured(db, { ttlMs = 10 * 60_000, retryMs = 60_000, rng = Math.random, now = () => Date.now() } = {}) {
  let cache = null; // { at, builders, accas } — selection ids only; prices and labels are read fresh

  const upcoming = (fromMs, untilMs) => db.prepare(`SELECT id, sport, competition, home, away, start_time FROM events
      WHERE status = 'scheduled' AND start_time > ? AND start_time < ? ORDER BY start_time`)
    .all(new Date(fromMs).toISOString(), new Date(untilMs).toISOString());
  const selectionsOf = (eventId) => db.prepare('SELECT id, market, code, odds_x100 FROM selections WHERE event_id = ? AND active = 1').all(eventId);

  function drawBuilders(t) {
    const out = [];
    const events = shuffle(upcoming(t + 10 * 60_000, t + 48 * 3600_000).filter((e) => e.sport === 'futebol'), rng);
    for (const e of events) {
      if (out.length >= 6) break;
      const sels = selectionsOf(e.id);
      // A result that is not a long shot (the card should look like a real bet).
      const results = sels.filter((s) => s.market === '1x2' && s.odds_x100 <= 500);
      const goals = sels.filter((s) => s.market === 'ou' && GOAL_LINES.has(s.code));
      const seconds = SECOND.map((m) => ({ m, sels: sels.filter(m.match) })).filter((x) => x.sels.length);
      if (!results.length || !goals.length || !seconds.length) continue;
      for (let tries = 0; tries < 6; tries++) {
        const second = pick(seconds, rng);
        const legs = [pick(results, rng), pick(second.sels, rng), pick(goals, rng)];
        if (!builderConflict(legs)) { out.push({ eventId: e.id, legs: legs.map((l) => l.id), second: second.m.name }); break; }
      }
    }
    return out;
  }

  /**
   * Four-leg multiples, football first:
   *   1. football games of today (as many cards as they fill);
   *   2. football of the next days (tomorrow first) for the cards still missing;
   *   3. only then whole cards of one other sport each (tennis, then basketball, then the rest),
   *      today's games first.
   * A card never mixes sports; a match is in one card only.
   */
  function drawAccas(t) {
    const today = dayOf(new Date(t).toISOString());
    const tomorrow = dayOf(new Date(t + 86_400_000).toISOString());
    const favourite = (e) => {
      const sels = selectionsOf(e.id).filter((s) => s.market === '1x2' || s.market === 'ml');
      const main = sels.some((s) => s.market === '1x2') ? '1x2' : 'ml';
      const best = sels.filter((s) => s.market === main && s.code !== 'X' && s.odds_x100 >= 115 && s.odds_x100 <= 195).sort((a, b) => a.odds_x100 - b.odds_x100)[0];
      return best ? { eventId: e.id, sel: best.id, sport: e.sport, today: dayOf(e.start_time) === today, tomorrow: dayOf(e.start_time) === tomorrow } : null;
    };
    const pool = upcoming(t + 10 * 60_000, t + 4 * 86_400_000).map(favourite).filter(Boolean);
    const used = new Set();
    const cards = [];
    // As many four-leg cards as `list` fills (unused matches only), up to six in all.
    const fill = (list, todayOnly) => {
      const free = shuffle(list.filter((c) => !used.has(c.eventId)), rng);
      while (cards.length < 6 && free.length >= 4) {
        const legs = free.splice(0, 4);
        legs.forEach((c) => used.add(c.eventId));
        cards.push({ legs: legs.map((c) => c.sel), today: todayOnly, sport: legs[0].sport });
      }
    };
    const football = pool.filter((c) => c.sport === 'futebol');
    fill(football.filter((c) => c.today), true);
    // Then tomorrow's football, then the days after (a card may join the two when one runs short).
    fill(football.filter((c) => c.tomorrow), false);
    fill(football.filter((c) => !c.today), false);
    const others = ['tenis', 'basquetebol', ...new Set(pool.map((c) => c.sport).filter((sp) => !['futebol', 'tenis', 'basquetebol'].includes(sp)))];
    for (const sp of others) {
      if (cards.length >= 6) break;
      const list = pool.filter((c) => c.sport === sp);
      fill(list.filter((c) => c.today), true);
      fill(list, false);
    }
    return cards;
  }

  // Current prices and labels; null when a leg closed or its match started.
  const getLeg = db.prepare(`SELECT s.id, s.market, s.code, s.odds_x100, s.active, e.id AS event_id, e.sport, e.competition, e.home, e.away, e.start_time, e.status
      FROM selections s JOIN events e ON e.id = s.event_id WHERE s.id = ?`);
  function legView(id) {
    const r = getLeg.get(id);
    if (!r || !r.active || r.status !== 'scheduled' || new Date(r.start_time).getTime() <= now()) return null;
    const x = r.market === 'x' ? splitSpecial(r.code) : null;
    return {
      selectionId: r.id, eventId: r.event_id, market: r.market, code: r.code, odds: r.odds_x100 / 100,
      marketName: x ? x.group : MARKETS[r.market]?.name || r.market, label: selectionLabel(r.market, r.code, r.home, r.away),
      sport: r.sport, competition: r.competition, home: r.home, away: r.away, startTime: r.start_time,
    };
  }
  const resolve = (ids) => { const legs = ids.map(legView); return legs.every(Boolean) ? legs : null; };

  function get(retry = true) {
    const t = now();
    // A short draw (right after a restart the board is still filling: games' pages, with markets like
    // both teams to score, are read over the first minutes) is tried again after a minute, not kept 10.
    const full = cache && cache.builders.length >= 6 && cache.accas.length >= 6;
    if (!cache || t - cache.at > (full ? ttlMs : retryMs)) cache = { at: t, builders: drawBuilders(t), accas: drawAccas(t) };
    let builders = cache.builders.map((b) => ({ ...b, legs: resolve(b.legs) })).filter((b) => b.legs);
    let accas = cache.accas.map((a) => ({ ...a, legs: resolve(a.legs) })).filter((a) => a.legs);
    // Cards dropped (a match started, a price closed): draw again rather than show fewer.
    if (retry && (builders.length < cache.builders.length || accas.length < cache.accas.length)) {
      cache = null;
      return get(false);
    }
    builders = builders.map((b) => {
      const l = b.legs[0];
      return { eventId: b.eventId, match: `${l.home} × ${l.away}`, competition: l.competition, startTime: l.startTime, legs: b.legs, odds: builderOdds(b.legs.map((x) => x.odds)) };
    });
    accas = accas.map((a) => ({
      today: a.today, legs: a.legs, odds: Math.round(a.legs.reduce((p, l) => p * l.odds, 1) * 100) / 100,
      lastStart: a.legs.map((l) => l.startTime).sort().at(-1),
    }));
    return { builders, accas, builderFactor: config.builderFactor };
  }

  return { get, reset: () => { cache = null; } };
}

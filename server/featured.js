// Ready-made bets on the sports page, drawn at random from the pre-match board:
//   builders  "Construa o seu ganho": one football match, three legs settled together (bet builder):
//             the full-time result, one more market (both teams to score, cards, corners, shots
//             on target, team to score first) and goals over / under 1.5–3.5.
//   accas     "Apostas vencedoras": four favourites from different matches (full-time result /
//             winner), the first cards with today's games only, the rest with today's and tomorrow's.
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

export function createFeatured(db, { ttlMs = 10 * 60_000, rng = Math.random, now = () => Date.now() } = {}) {
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

  function drawAccas(t) {
    const today = dayOf(new Date(t).toISOString());
    const tomorrow = dayOf(new Date(t + 86_400_000).toISOString());
    const favourite = (e) => {
      const sels = selectionsOf(e.id).filter((s) => s.market === '1x2' || s.market === 'ml');
      const main = sels.some((s) => s.market === '1x2') ? '1x2' : 'ml';
      const best = sels.filter((s) => s.market === main && s.code !== 'X' && s.odds_x100 >= 115 && s.odds_x100 <= 195).sort((a, b) => a.odds_x100 - b.odds_x100)[0];
      return best ? { eventId: e.id, sel: best.id, sport: e.sport } : null;
    };
    const pool = upcoming(t + 10 * 60_000, t + 3 * 86_400_000).map((e) => ({ e, day: dayOf(e.start_time) }))
      .filter((x) => x.day === today || x.day === tomorrow);
    const todays = shuffle(pool.filter((x) => x.day === today), rng).map((x) => favourite(x.e)).filter(Boolean);
    const both = shuffle(pool, rng).map((x) => favourite(x.e)).filter(Boolean);
    const used = new Set();
    const cards = [];
    // Four legs, preferring different sports in a card.
    const take = (list) => {
      const legs = [];
      const sports = new Set();
      for (const pass of [true, false]) {
        for (const c of list) {
          if (legs.length >= 4) break;
          if (used.has(c.eventId) || legs.includes(c) || (pass && sports.has(c.sport))) continue;
          legs.push(c);
          sports.add(c.sport);
        }
      }
      if (legs.length < 4) return null;
      legs.forEach((c) => used.add(c.eventId));
      return legs.map((c) => c.sel);
    };
    for (let i = 0; i < 6; i++) {
      // The first three with today's games; then today's and tomorrow's (or when today runs out).
      const legs = (i < 3 && take(todays)) || take(both);
      if (legs) cards.push({ legs, today: i < 3 });
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
    if (!cache || t - cache.at > ttlMs) cache = { at: t, builders: drawBuilders(t), accas: drawAccas(t) };
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

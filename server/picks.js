// "Melhores escolhas" on a football match page: ready-made bet builders of three legs on that match,
// each with a price boost (10% "Boost", or 20% "Super Boost" on the two longest), as the big books
// show them.
//
// The legs come from different kinds of market (result, first half, goals, corners, shots, cards),
// all settled from the result or the match tracker's counts (no leg left to void), never two of one kind in a card, and the cards differ from each other: a pair of
// markets is used once at most when the match has enough of them. Every leg tells the same story —
// the favourite (when there is a clear one) winning, goals, the "over" of a statistic — so no card
// contradicts itself, and each leg is priced low to middling (a line near 1.70 is chosen) so the
// total stays between 2.00 and 15.
//
// A draw is kept per match for 10 minutes (seeded by the match, so a refresh shows the same cards);
// prices and labels are read fresh. The boost is the server's: a builder bet placed from a card
// (pickKey) is checked against the current cards and priced with it (betting.js), and the number
// of bets placed on a card shows as "🔥 100+".
import { config } from './config.js';
import { selectionLabel, splitSpecial } from './markets.js';
import { builderConflict, impliedLeg } from './featured.js';

export const BOOST_PCT = 10;
export const SUPER_BOOST_PCT = 20;
const MAX_CARDS = 8;
const MIN_ODDS = 2;
const MAX_ODDS = 15;

// A small seeded random generator (the same match draws the same cards).
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const x = (s) => (s.market === 'x' ? splitSpecial(s.code) : null);
// "Mais de (9.5)" / "Mais de 9.5" → 9.5 (an "over" line of a provider market).
const overLine = (label) => { const m = /^mais de\s*\(?\s*([\d.]+)\s*\)?$/i.exec(String(label || '').trim()); return m ? Number(m[1]) : null; };
// Of several lines, the one priced nearest 1.70 (not a long shot, not a certainty).
const nearest = (list) => list.filter((s) => s.odds_x100 >= 125 && s.odds_x100 <= 260)
  .sort((a, b) => Math.abs(a.odds_x100 - 170) - Math.abs(b.odds_x100 - 170))[0] || null;

/**
 * The market kinds a card can draw from, for one match: [{ key, group, name, sel }]. `fav` is the
 * favourite's side ('1' / '2') or null; `team(n)` its name.
 */
export function pickFamilies(sels, { fav, team }) {
  const out = [];
  const add = (key, group, name, sel) => { if (sel) out.push({ key, group, name, sel }); };
  const group = (re) => sels.filter((s) => re.test(x(s)?.group || ''));
  const overOf = (list) => nearest(list.filter((s) => overLine(x(s).label) !== null));
  const sideOf = (list) => list.find((s) => x(s).label.trim().toLowerCase() === fav && s.odds_x100 <= 350) || null;
  if (fav) {
    add('result', 'result', 'Resultado Final', sels.find((s) => s.market === '1x2' && s.code === fav && s.odds_x100 <= 260));
    add('dc', 'result', 'Hipótese Dupla', sels.find((s) => s.market === 'dc' && s.code === (fav === '1' ? '1X' : 'X2') && s.odds_x100 >= 115));
    add('htResult', 'half', 'Resultado da 1ª Parte', sideOf(group(/^(1° Tempo - 1x2|1\.ª Parte · 1X2)$/i)));
    add('teamGoals', 'goals', `${team(fav)} Total de Golos`, nearest(sels.filter((s) => s.market === 'tou' && s.code.startsWith(`${fav}O`))));
    add('teamCorners', 'corners', `${team(fav)} Cantos Mais/Menos`, overOf(group(new RegExp(`^Cantos · Total ${fav}$`, 'i'))));
    add('teamShots', 'shots', `${team(fav)} Remates na baliza`, overOf(group(new RegExp(`^Remates à Baliza · Total ${fav}$`, 'i'))));
  }
  add('btts', 'btts', 'Ambas as Equipas Marcam', sels.find((s) => s.market === 'btts' && s.code === 'Y' && s.odds_x100 <= 260));
  add('goals', 'goals', 'Total de Golos Mais/Menos', nearest(sels.filter((s) => s.market === 'ou' && /^O[123]\.5$/.test(s.code))));
  add('htGoals', 'halfGoals', 'Total de Golos Mais/Menos - 1ª Parte', overOf(group(/^(1° Tempo - Total de Golos - Mais \/ Menos|1\.ª Parte · Total)$/i)));
  add('corners', 'corners', 'Cantos Mais/Menos', overOf(group(/^Cantos · Total$/i)));
  add('shots', 'shots', 'Remates na baliza', overOf(group(/^Remates à Baliza · Total$/i)));
  add('cards', 'cards', 'Cartões Amarelos Mais/Menos', overOf(group(/^Cartões Amarelos · Total$/i)));
  return out;
}

/** The builder price of these legs (implied legs at 1.00), with a boost of `pct` %. */
export function pickOdds(legs, pct = 0) {
  const product = legs.reduce((a, l) => a * (impliedLeg(l, legs) ? 1 : l.odds_x100 / 100), 1);
  return Math.round(product * config.builderFactor * (1 + pct / 100) * 100) / 100;
}

/**
 * Up to eight cards of three legs from `families`, each pair of market kinds used once at most
 * (twice when the match has too few kinds for that), at most three cards per kind, the total
 * (before the boost) between 2.00 and 15. → [{ families: [family…], odds }]
 */
export function drawCards(families, rng) {
  const combos = [];
  for (let i = 0; i < families.length; i++) for (let j = i + 1; j < families.length; j++) for (let k = j + 1; k < families.length; k++) {
    const set = [families[i], families[j], families[k]];
    if (new Set(set.map((f) => f.group)).size < 3) continue;
    const legs = set.map((f) => f.sel);
    if (builderConflict(legs)) continue;
    const odds = pickOdds(legs);
    if (odds < MIN_ODDS || odds > MAX_ODDS) continue;
    combos.push({ families: set, odds });
  }
  for (let i = combos.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [combos[i], combos[j]] = [combos[j], combos[i]]; }
  const cards = [];
  const uses = new Map();
  const pairs = new Map();
  const pairKeys = (c) => { const k = c.families.map((f) => f.key).sort(); return [`${k[0]}|${k[1]}`, `${k[0]}|${k[2]}`, `${k[1]}|${k[2]}`]; };
  for (const maxPair of [1, 2]) {
    for (const c of combos) {
      if (cards.length >= MAX_CARDS) break;
      if (cards.includes(c)) continue;
      if (c.families.some((f) => (uses.get(f.key) || 0) >= 3)) continue;
      if (pairKeys(c).some((p) => (pairs.get(p) || 0) >= maxPair)) continue;
      cards.push(c);
      for (const f of c.families) uses.set(f.key, (uses.get(f.key) || 0) + 1);
      for (const p of pairKeys(c)) pairs.set(p, (pairs.get(p) || 0) + 1);
    }
  }
  return cards;
}

const keyOf = (ids) => [...ids].map(Number).sort((a, b) => a - b).join('-');
// "🔥 100+": the bets placed on a card, rounded down to a step (none under 10).
const POPULAR_STEPS = [1000, 500, 300, 100, 50, 25, 10];
export const popularLabel = (n) => { const s = POPULAR_STEPS.find((v) => n >= v); return s ? `${s}+` : null; };

export function createMatchPicks(db, { ttlMs = 10 * 60_000, now = () => Date.now() } = {}) {
  if (!db.prepare('PRAGMA table_info(bets)').all().some((c) => c.name === 'pick_key')) db.exec('ALTER TABLE bets ADD COLUMN pick_key TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS bets_pick_key ON bets (pick_key)');
  const cache = new Map(); // eventId → { at, cards: [{ ids, pct }] }
  const eventOf = db.prepare("SELECT id, sport, home, away, status, start_time FROM events WHERE id = ?");
  const selsOf = db.prepare('SELECT id, market, code, odds_x100 FROM selections WHERE event_id = ? AND active = 1');
  const countOf = db.prepare('SELECT COUNT(*) AS n FROM bets WHERE pick_key = ?');

  const open = (e) => e && e.sport === 'futebol' && e.status === 'scheduled' && new Date(e.start_time).getTime() > now();

  function draw(e) {
    const sels = selsOf.all(e.id);
    const result = sels.filter((s) => s.market === '1x2' && (s.code === '1' || s.code === '2')).sort((a, b) => a.odds_x100 - b.odds_x100)[0];
    // A clear favourite: priced 2.60 or less (else the cards stay on goals and statistics).
    const fav = result && result.odds_x100 <= 260 ? result.code : null;
    const team = (n) => (n === '1' ? e.home : e.away);
    const day = new Date(now()).toISOString().slice(0, 10);
    const rng = seeded([...`${e.id}|${day}`].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261));
    const cards = drawCards(pickFamilies(sels, { fav, team }), rng);
    // The two longest get the Super Boost.
    const supers = new Set([...cards].sort((a, b) => b.odds - a.odds).slice(0, 2).filter((c) => c.odds >= 2.4));
    return cards.map((c) => ({ ids: c.families.map((f) => f.sel.id), names: c.families.map((f) => f.name), pct: supers.has(c) ? SUPER_BOOST_PCT : BOOST_PCT }));
  }

  function cardsOf(eventId) {
    const e = eventOf.get(Number(eventId));
    if (!open(e)) return { e, cards: [] };
    let c = cache.get(e.id);
    if (!c || now() - c.at > ttlMs) { c = { at: now(), cards: draw(e) }; cache.set(e.id, c); }
    return { e, cards: c.cards };
  }

  /** The match's cards with current prices: [{ key, pct, super, legs, odds, boosted, popular }]. */
  function forEvent(eventId) {
    const { e, cards } = cardsOf(eventId);
    const out = [];
    for (const card of cards) {
      const rows = card.ids.map((id) => db.prepare('SELECT id, market, code, odds_x100, active FROM selections WHERE id = ?').get(id));
      if (rows.some((r) => !r || !r.active)) continue;
      const key = keyOf(card.ids);
      out.push({
        key, pct: card.pct, super: card.pct >= SUPER_BOOST_PCT,
        legs: rows.map((r, i) => {
          const sp = x(r);
          return {
            selectionId: r.id, eventId: e.id, market: r.market, code: r.code, odds: r.odds_x100 / 100, marketName: card.names[i],
            label: sp ? sp.label.replace(/\s*\(\s*([\d.]+)\s*\)\s*$/, ' $1').trim() : selectionLabel(r.market, r.code, e.home, e.away),
          };
        }),
        odds: pickOdds(rows), boosted: pickOdds(rows, card.pct), popular: popularLabel(countOf.get(key).n),
      });
    }
    return out;
  }

  /** The boost of a builder placed from card `key` on these selections: { key, pct }, or null when it is no longer offered. */
  function boostOf(key, selectionIds) {
    const first = db.prepare('SELECT event_id FROM selections WHERE id = ?').get(Number(selectionIds[0]));
    if (!first || keyOf(selectionIds) !== String(key)) return null;
    const card = cardsOf(first.event_id).cards.find((c) => keyOf(c.ids) === String(key));
    return card ? { key: keyOf(card.ids), pct: card.pct } : null;
  }

  return { forEvent, boostOf, reset: () => cache.clear() };
}

// How Bet62 lays out the casino: the providers in the house order, the games shown first on the
// lobby and the filter tabs (each one a rule over a game's name / kind, since the game provider
// gives no tags of its own). Kept apart from the BigBang client so the layout can change alone.

/** Name / spelling reduced to letters and digits: "Play'n GO" → "playngo", "Gonzo's Quest™" → "gonzosquest". */
export const compact = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

/**
 * The house order of providers (the first 20 rows of the lobby); any other provider comes after them,
 * alphabetically. Each is recognised under the spellings game aggregators use.
 */
export const PROVIDER_ORDER = [
  ['Pragmatic Play', /^pragmatic(?!.*live)/],
  ['Evolution', /^evolution/],
  ['Playtech', /^playtech/],
  ['Games Global', /^(gamesglobal|microgaming)/],
  ["Play'n GO", /^playngo/],
  ['Hacksaw Gaming', /^hacksaw/],
  ['Light & Wonder', /^(lightwonder|lightandwonder|lnw|scientificgames)/],
  ['NetEnt', /^netent/],
  ['Nolimit City', /^nolimit/],
  ['BGaming', /^bgaming/],
  ['Relax Gaming', /^relax/],
  ['Push Gaming', /^push(gaming)?$/],
  ['Red Tiger', /^redtiger/],
  ['Yggdrasil', /^yggdrasil/],
  ['Amusnet', /^(amusnet|egt)/],
  ['TaDa Gaming', /^tada/],
  ['Spribe', /^spribe/],
  ['Evoplay', /^evoplay/],
  ['Playson', /^playson/],
  ['SmartSoft Gaming', /^smartsoft/],
];

/** A provider's place in the house order (0 = first), or Infinity when it is not in it. */
export function providerRank(...names) {
  for (const n of names) {
    const c = compact(n);
    if (!c) continue;
    const i = PROVIDER_ORDER.findIndex(([, re]) => re.test(c));
    if (i >= 0) return i;
  }
  return Infinity;
}

/**
 * The house names for the providers of the list ("NetEnt", not "Net Ent"; "Games Global" for
 * Microgaming), when one provider alone takes that place; the others keep their own name.
 */
export function houseNames(providers) {
  const byRank = new Map();
  for (const p of providers) {
    const r = providerRank(p.name, p.id);
    if (r !== Infinity) byRank.set(r, [...(byRank.get(r) || []), p]);
  }
  for (const [r, list] of byRank) if (list.length === 1) list[0].name = PROVIDER_ORDER[r][0];
  return providers;
}

/** Providers in the house order, then the others alphabetically. */
export const sortProviders = (providers) => [...providers]
  .sort((a, b) => providerRank(a.name, a.id) - providerRank(b.name, b.id) || a.name.localeCompare(b.name));

/**
 * The games shown first on the lobby, in this order (each once, when the catalogue has it). A title
 * matches exactly (accents, signs and case aside), from the named provider when there is one; the
 * live tables any provider has ("Roleta Europeia ao Vivo"…) take the most popular live table of the kind.
 */
const T = (title, prov = null) => ({ key: compact(title), prov });
const L = (re) => ({ live: re });
export const FEATURED = [
  T('Gates of Olympus', /pragmatic/), T('Sweet Bonanza', /pragmatic/), T('Gates of Olympus 1000', /pragmatic/),
  T('Gates of Olympus Super Scatter', /pragmatic/), T('Big Bass Splash', /pragmatic|reelkingdom/), T('Big Bass Bonanza', /pragmatic|reelkingdom/),
  T('Starlight Princess', /pragmatic/), T('Sugar Rush', /pragmatic/), T('Sweet Bonanza 1000', /pragmatic/),
  T('The Dog House Megaways', /pragmatic/), T('Book of Dead', /playngo/), T('Legacy of Dead', /playngo/),
  T('Wolf Gold', /pragmatic/), T('Madame Destiny Megaways', /pragmatic/), T("Joker's Jewels", /pragmatic/),
  T('Starburst', /netent/), T("Gonzo's Quest", /netent/), T('Wanted Dead or a Wild', /hacksaw/), T('Le Cowboy', /hacksaw/),
  T('Money Train 3', /relax/), T('Aviator', /spribe/), T('JetX', /smartsoft/), T('Crazy Time', /evolution/),
  T('Lightning Roulette', /evolution/), T('Monopoly Live', /evolution/),
  L(/(european|europeia).*(roulette|roleta)|(roulette|roleta).*(european|europeia)/i), L(/blackjack/i), L(/baccarat|bacar/i),
  T('Immersive Roulette', /evolution/), T('Mega Moolah', /gamesglobal|microgaming/),
];

/** The featured games found in `list` (most popular first), in the FEATURED order, none twice. */
export function featuredGames(popular) {
  const out = [];
  const taken = new Set();
  const provOf = (g) => `${compact(g.provider)}|${compact(g.providerId)}`;
  for (const f of FEATURED) {
    let pick = null;
    if (f.live) pick = popular.find((g) => g.type === 'live' && !taken.has(g.id) && f.live.test(g.name));
    else {
      const same = popular.filter((g) => !taken.has(g.id) && compact(g.name) === f.key);
      pick = same.find((g) => f.prov?.test(provOf(g))) || same[0] || null;
    }
    if (pick) { out.push(pick); taken.add(pick.id); }
  }
  return out;
}

// ---------- the filter tabs ----------
const has = (re) => (g) => re.test(g.name);
const TABLE = /\b(roulette|roleta|blackjack|black jack|baccarat|bacar[aá]|poker|craps|sic ?bo|dragon ?tiger|teen ?patti|andar ?bahar|hold'?em|casino war|red dog|pai gow)/i;
const CRASH = /\b(aviator|aviatrix|jet ?x\d*|spaceman|crash|zeppelin|space ?xy|limbo|balloon)\b/i;
const INSTANT = /\b(mines?|plinko|dice|keno|hi-?lo|goal|hotline|mini roulette|scratch|coin ?flip|tower|limbo|bingo|penalty)\b/i;
const PROGRESSIVE = /mega moolah|mega fortune|divine fortune|hall of gods|arabian nights|major millions|wowpot|king cashalot|age of the gods|jackpot giant|gladiator jackpot|beach life|treasure nile|wheel of wishes|mega vault|superpot|jackpot king|mega jackpot/i;
const JACKPOT = /jackpot|moolah|mega fortune|divine fortune|hall of gods|major millions|wowpot|millionaire|mega joker|cash collect/i;
// No volatility comes with the catalogue: the slots known as high volatility.
const HIGH_VOL = /wanted dead or a wild|money train|gates of olympus|sweet bonanza|starlight princess|sugar rush|san quentin|\bmental\b|tombstone|fire in the hole|chaos crew|le bandit|le cowboy|dead or alive|book of dead|legacy of dead|rise of olympus|razor shark|bonanza megaways|extra chilli|white rabbit|danger high voltage|deadwood|punk rocker|infectious 5|xways hoarder|das xboot|itero|stack ?em|duel at dawn|hand of anubis|rip city|dork unit|wild west gold|zeus vs hades|big bass|dog house|madame destiny|book of shadows|immortal romance|jammin jars|temple tumble|dead canary|cursed seas|fruit party|wild booster|5 lions|great rhino megaways|buffalo king megaways|tsar wars|outsourced|road rage|beheaded|misery mining/i;

/**
 * The tabs, in the order the player sees them. "populares" and "novos" are orders over every game;
 * the others keep the games that match (none of them sorts). "exclusivos" are the games the
 * operator marks as Bet62's own (the setting casino.exclusive: a list of game ids).
 */
export const CATEGORIES = [
  ['populares', 'Populares', null],
  ['novos', 'Novos Jogos', null],
  ['slots', 'Slots', (g) => g.type !== 'live' && g.type !== 'crash' && !TABLE.test(g.name) && !CRASH.test(g.name) && !INSTANT.test(g.name)],
  ['ao-vivo', 'Casino ao Vivo', (g) => g.type === 'live'],
  ['roleta', 'Roleta', has(/roulette|roleta|roulett/i)],
  ['blackjack', 'Blackjack', has(/black ?jack/i)],
  ['baccarat', 'Baccarat', has(/baccarat|bacar[aá]/i)],
  ['crash', 'Jogos Crash', (g) => g.type === 'crash' || CRASH.test(g.name)],
  ['jackpots', 'Jackpots', (g) => JACKPOT.test(g.name) || PROGRESSIVE.test(g.name)],
  ['megaways', 'Megaways', has(/megaways/i)],
  ['instantaneos', 'Jogos Instantâneos', (g) => g.type !== 'live' && (INSTANT.test(g.name) || (/^spribe/.test(compact(g.provider)) && g.type !== 'crash'))],
  ['mesa', 'Jogos de Mesa', (g) => g.type !== 'live' && TABLE.test(g.name)],
  ['exclusivos', 'Jogos Exclusivos', (g, ctx) => !!ctx?.exclusive?.has(g.id)],
  ['alta-volatilidade', 'Jogos de Alta Volatilidade', (g) => g.type !== 'live' && HIGH_VOL.test(g.name)],
  ['jackpot-progressivo', 'Jogos de Jackpot Progressivo', (g) => PROGRESSIVE.test(g.name)],
];
export const categoryOf = (key) => CATEGORIES.find(([k]) => k === key) || null;

// ---------- no game twice ----------
const COPY_WORDS = /\b(premium|standard|mobile|desktop|hd|new)\b|\(.*?\)/gi;
/** A game's name as a key: copies ("Starburst (Premium)", "Starburst™") give the same one. */
export const titleKey = (name) => compact(String(name || '').replace(COPY_WORDS, ' '));

/**
 * One copy of each slot across providers: the same title under two providers (an aggregator often
 * lists a studio's games under its parent as well, e.g. Reel Kingdom's under Pragmatic Play) shows
 * once, from the provider first in the house order, then the copy with artwork. Tables keep one per
 * provider (a "Blackjack" from two studios is two games), and so do short or generic titles.
 */
export function dropCrossDuplicates(games) {
  const best = new Map();
  const keyOf = (g) => {
    if (g.type !== 'slot' || TABLE.test(g.name)) return null;
    const k = titleKey(g.name);
    return k.length >= 6 ? k : null;
  };
  const better = (a, b) => {
    const ra = providerRank(a.provider, a.providerId);
    const rb = providerRank(b.provider, b.providerId);
    if (ra !== rb) return ra < rb;
    if (!!a.image !== !!b.image) return !!a.image;
    return a.id < b.id;
  };
  for (const g of games) {
    const k = keyOf(g);
    if (!k) continue;
    const cur = best.get(k);
    if (!cur || better(g, cur)) best.set(k, g);
  }
  return games.filter((g) => { const k = keyOf(g); return !k || best.get(k) === g; });
}

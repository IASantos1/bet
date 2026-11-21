// The clubs whose scorers appear on the "Jogadores em destaque" cards, by priority tier (1 first, then
// 2, then the Brazilian sides). Only players from these clubs are featured, one card per club. Names are
// matched loosely by whole words (accents and case ignored), with the short forms teams are listed under.

const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Reserve / women / youth sides are never the first team, even when the name contains the club's.
const BLOCK = new Set(['ii', 'iii', 'b', 'c', 'u16', 'u17', 'u18', 'u19', 'u20', 'u21', 'u23', 'w', 'women', 'woman', 'fem', 'feminin', 'feminino', 'feminina', 'femenino', 'sub', 'reserve', 'reserves', 'youth', 'castilla', 'juvenil', 'juniores', 'juniors', 'amateure', 'amateur']);

// [tier, key, [ required-token-sets (OR) ], [ excluded tokens ] ]
const CLUBS = [
  // ---- Tier 1 ----
  [1, 'real madrid', [['real', 'madrid']]],
  [1, 'barcelona', [['barcelona'], ['barca']]],
  [1, 'atletico madrid', [['atletico', 'madrid'], ['atletico', 'de', 'madrid']]],
  [1, 'man united', [['manchester', 'united'], ['man', 'united'], ['man', 'utd'], ['manchester', 'utd']]],
  [1, 'man city', [['manchester', 'city'], ['man', 'city']]],
  [1, 'liverpool', [['liverpool']]],
  [1, 'arsenal', [['arsenal']]],
  [1, 'chelsea', [['chelsea']]],
  [1, 'tottenham', [['tottenham'], ['spurs']]],
  [1, 'bayern', [['bayern']]],
  [1, 'dortmund', [['dortmund']]],
  [1, 'psg', [['psg'], ['paris', 'saint'], ['paris', 'germain'], ['paris', 'sg']]],
  [1, 'juventus', [['juventus'], ['juve']]],
  [1, 'ac milan', [['milan']], ['inter']],
  [1, 'inter', [['internazionale'], ['inter', 'milan'], ['inter', 'milano'], ['inter']], ['miami', 'internacional']],
  [1, 'napoli', [['napoli']]],
  [1, 'benfica', [['benfica']]],
  [1, 'porto', [['porto']], ['portimonense', 'portsmouth', 'portmore']],
  [1, 'ajax', [['ajax']]],
  [1, 'sporting cp', [['sporting', 'cp'], ['sporting', 'lisbon'], ['sporting', 'lisboa'], ['sporting', 'clube', 'portugal']]],
  // ---- Tier 2 ----
  [2, 'real sociedad', [['real', 'sociedad']]],
  [2, 'villarreal', [['villarreal']]],
  [2, 'real betis', [['betis']]],
  [2, 'celta', [['celta']]],
  [2, 'osasuna', [['osasuna']]],
  [2, 'aston villa', [['aston', 'villa']]],
  [2, 'brighton', [['brighton']]],
  [2, 'west ham', [['west', 'ham']]],
  [2, 'wolves', [['wolverhampton'], ['wolves']]],
  [2, 'crystal palace', [['crystal', 'palace']]],
  [2, 'brentford', [['brentford']]],
  [2, 'freiburg', [['freiburg'], ['sc', 'freiburg']]],
  [2, 'mainz', [['mainz']]],
  [2, 'hoffenheim', [['hoffenheim']]],
  [2, 'werder bremen', [['werder'], ['bremen']]],
  [2, 'union berlin', [['union', 'berlin']]],
  [2, 'lazio', [['lazio']]],
  [2, 'fiorentina', [['fiorentina']]],
  [2, 'torino', [['torino']]],
  [2, 'bologna', [['bologna']]],
  [2, 'atalanta', [['atalanta']]],
  [2, 'lille', [['lille'], ['losc']]],
  [2, 'nice', [['nice']]],
  [2, 'rennes', [['rennes']]],
  [2, 'strasbourg', [['strasbourg']]],
  [2, 'braga', [['braga']]],
  [2, 'vitoria guimaraes', [['vitoria', 'guimaraes'], ['guimaraes']]],
  [2, 'az alkmaar', [['alkmaar']]],
  [2, 'utrecht', [['utrecht']]],
  [2, 'gent', [['gent'], ['kaa', 'gent']]],
  // ---- Tier 3 (Brazil) ----
  [3, 'flamengo', [['flamengo']]],
  [3, 'palmeiras', [['palmeiras']]],
  [3, 'sao paulo', [['sao', 'paulo']]],
  [3, 'corinthians', [['corinthians']]],
  [3, 'santos', [['santos']]],
  [3, 'vasco', [['vasco']]],
  [3, 'fluminense', [['fluminense']]],
  [3, 'botafogo', [['botafogo']]],
  [3, 'gremio', [['gremio']]],
  [3, 'internacional', [['internacional']]],
  [3, 'atletico mineiro', [['atletico', 'mineiro'], ['mineiro'], ['atletico', 'mg']]],
  [3, 'cruzeiro', [['cruzeiro']]],
];

/** The club a team name belongs to (for the featured-scorer whitelist), or null. { tier, key }. */
export function matchClub(name) {
  const toks = strip(name).split(' ').filter(Boolean);
  if (!toks.length || toks.some((t) => BLOCK.has(t))) return null;
  const set = new Set(toks);
  for (const [tier, key, sets, not] of CLUBS) {
    if (not && not.some((t) => set.has(t))) continue;
    if (sets.some((req) => req.every((t) => set.has(t)))) return { tier, key };
  }
  return null;
}

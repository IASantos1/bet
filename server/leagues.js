// Competition priority per sport: 1 = top (big leagues, majors), 2 = strong, 9 = the rest.
// Drives the order of the live page and which events make the home page carousels: big
// leagues first in every sport, and football first of all.

// Football names repeat across countries (Egypt's "Premier League", Ecuador's "Serie A",
// Austria's "Bundesliga"): when the name carries a country ("England. Premier League"), the
// league only counts for the countries listed with it. Names without a country are taken as is.
// Names are compared without accents and in lower case.
const C = {
  eng: /^(england|inglaterra)$/, esp: /^(spain|espanha|espana)$/, ita: /^(italy|italia)$/,
  ger: /^(germany|alemanha)$/, fra: /^(france|franca)$/, por: /^portugal$/, bra: /^(brazil|brasil)$/,
  ned: /^(netherlands|holanda|paises baixos)$/, bel: /^(belgium|belgica)$/, tur: /^(turkey|turquia|turkiye)$/,
  usa: /^(usa|united states|eua|estados unidos)$/, mex: /^(mexico)$/, sco: /^(scotland|escocia)$/,
  ksa: /^(saudi arabia|arabia saudita)$/, arg: /^(argentina)$/,
};
const INTL = /^(international|internacional|world|mundo|europe|europa|uefa|fifa|conmebol|south america|america do sul)$/;

const FOOTBALL = [
  [1, /\b(uefa )?champions league\b/, [INTL], /\b(afc|caf|concacaf|ofc|asian|africa)/],
  [1, /premier league/, [C.eng]],
  [1, /\bla ?liga\b|primera divisi[oó]n/, [C.esp]],
  [1, /\bs[eé]rie a\b/, [C.ita, C.bra]],
  [1, /\bbundesliga\b/, [C.ger]],
  [1, /\bligue 1\b/, [C.fra]],
  [1, /liga portugal|primeira liga|liga betclic/, [C.por]],
  [1, /brasileir/],
  [1, /world cup|copa do mundo|mundial|\beuro(pean championship)?\b|copa am[eé]rica|nations league|libertadores/, [INTL], /qualif|eliminat/],
  [2, /world cup|copa do mundo|\beuro(pean championship)?\b/],
  [2, /europa league|conference league/, [INTL]],
  [2, /eredivisie/, [C.ned]],
  [2, /ta[çc]a de portugal|ta[çc]a da liga/, [C.por]],
  [2, /fa cup|efl cup|carabao|\bchampionship\b/, [C.eng]],
  [2, /copa del rey|segunda divisi[oó]n|la ?liga 2/, [C.esp]],
  [2, /coppa italia|\bs[eé]rie b\b/, [C.ita, C.bra]],
  [2, /\bdfb|2\. bundesliga/, [C.ger]],
  [2, /coupe de france|ligue 2/, [C.fra]],
  [2, /\bpro league\b/, [C.bel, C.ksa]],
  [2, /s[uü]per lig/, [C.tur]],
  [2, /\bmls\b|major league soccer/, [C.usa]],
  [2, /liga mx/, [C.mex]],
  [2, /premiership/, [C.sco]],
  [2, /saudi|roshn/],
  [2, /liga profesional|primera divisi[oó]n/, [C.arg]],
  [2, /sudamericana|copa do brasil|copa del rey|supercopa|supercoppa|supercup|community shield/],
];

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function footballTier(competition) {
  const name = norm(competition);
  // "England. Premier League" / "Inglaterra · Premier League": the first part is the country.
  const m = /^([^.·:]+?)\s*[.·:]\s+(.+)$/.exec(name);
  const country = m ? m[1].trim() : null;
  for (const [tier, re, countries, not] of FOOTBALL) {
    if (!re.test(name) || (not && not.test(name))) continue;
    if (countries && country && !countries.some((c) => c.test(country))) continue;
    return tier;
  }
  return 9;
}

const TIERS = {
  tenis: [
    [1, /australian open|roland garros|french open|wimbledon|us open|atp finals|wta finals|davis cup|billie jean king/i],
    [2, /masters|1000|500|olymp/i],
  ],
  basquetebol: [
    [1, /\bnba\b|euroleague|euroliga/i],
    [2, /acb|liga endesa|eurocup|ncaa|lega|bbl|lnb|fiba|nbb|liga portuguesa/i],
  ],
  hoquei: [
    [1, /\bnhl\b/i],
    [2, /khl|shl|liiga|del\b|nla|national league|champions hockey|olymp|world championship/i],
  ],
  dardos: [
    [1, /world (darts )?championship|premier league|world matchplay|world grand prix|grand slam|uk open|players championship finals|world masters|european championship/i],
    [2, /world series|masters|open\b/i],
  ],
  esports: [
    [1, /\bmajor\b|iem|blast|esl pro league|pgl/i],
    [2, /esl|cct|epl|thunderpick|betboom|skyesports|perfect world/i],
  ],
};

export function leagueTier(sport, competition) {
  if (sport === 'futebol') return footballTier(competition);
  const name = String(competition || '');
  for (const [tier, re] of TIERS[sport] || []) if (re.test(name)) return tier;
  return 9;
}

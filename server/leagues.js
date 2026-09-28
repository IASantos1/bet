// Competition priority per sport: 1 = top (big leagues, majors), 2 = strong, 9 = the rest.
// Drives the order of the live page and which events make the home page carousels: big
// leagues first in every sport, and football first of all.

const TIERS = {
  futebol: [
    [1, /champions league|premier league|la ?liga|serie a|bundesliga|ligue 1|liga portugal|primeira liga|liga betclic|world cup|mundial|euro(pean championship)?\b|copa am[eé]rica|nations league|libertadores|brasileir|s[ée]rie a/i],
    [2, /europa league|conference league|eredivisie|ta[çc]a de portugal|fa cup|copa del rey|coppa italia|dfb|coupe de france|efl cup|championship|pro league|super lig|mls|sudamericana|saudi|liga mx|scottish premiership/i],
  ],
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
  const name = String(competition || '');
  for (const [tier, re] of TIERS[sport] || []) if (re.test(name)) return tier;
  return 9;
}

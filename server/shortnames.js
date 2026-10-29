// The short name a team is shown by ("Sporting Clube de Portugal" → "Sporting CP"). The full name
// stays everywhere else (the database, settlement, badges, kits); only the screen shows this one.
// Names are compared without accents, in lower case and without "FC" / "AFC" around them.

const SHORT = {
  // Portugal
  'sporting clube de portugal': 'Sporting CP', 'sport lisboa e benfica': 'Benfica', 'futebol clube do porto': 'FC Porto',
  'sporting clube de braga': 'SC Braga', 'vitoria sport clube': 'Vitória SC', 'vitoria de guimaraes': 'Vitória SC',
  'vitoria guimaraes': 'Vitória SC', 'estrela da amadora': 'Estrela Amadora', 'futebol clube de famalicao': 'Famalicão',
  // England
  'manchester united': 'Man United', 'manchester city': 'Man City', 'wolverhampton wanderers': 'Wolves', wolverhampton: 'Wolves',
  'brighton & hove albion': 'Brighton', 'brighton and hove albion': 'Brighton', 'tottenham hotspur': 'Tottenham',
  'nottingham forest': "Nott'm Forest", 'west ham united': 'West Ham', 'newcastle united': 'Newcastle', 'leicester city': 'Leicester',
  'queens park rangers': 'QPR', 'sheffield wednesday': 'Sheffield Wed', 'sheffield united': 'Sheffield Utd',
  'west bromwich albion': 'West Brom', 'afc bournemouth': 'Bournemouth',
  // France
  'paris saint-germain': 'Paris SG', 'paris saint germain': 'Paris SG', 'olympique lyonnais': 'Lyon',
  'olympique de marseille': 'Marseille', 'olympique marseille': 'Marseille',
  // Spain
  'atletico de madrid': 'Atlético Madrid', 'club atletico de madrid': 'Atlético Madrid', 'athletic club de bilbao': 'Athletic Bilbao',
  'real sociedad de futbol': 'Real Sociedad', 'deportivo alaves': 'Alavés', 'rcd espanyol de barcelona': 'Espanyol',
  // Germany
  'borussia monchengladbach': "M'gladbach", 'borussia dortmund': 'Dortmund', 'bayern munchen': 'Bayern', 'bayern munich': 'Bayern',
  'bayer 04 leverkusen': 'Leverkusen', 'eintracht frankfurt': 'Frankfurt', 'tsg 1899 hoffenheim': 'Hoffenheim', 'tsg hoffenheim': 'Hoffenheim',
  'rasenballsport leipzig': 'RB Leipzig',
  // Italy
  internazionale: 'Inter', 'internazionale milano': 'Inter', 'inter milan': 'Inter',
  // Brazil, Argentina
  'clube de regatas do flamengo': 'Flamengo', 'sociedade esportiva palmeiras': 'Palmeiras', 'sport club corinthians paulista': 'Corinthians',
  'sao paulo futebol clube': 'São Paulo', 'club atletico river plate': 'River Plate', 'club atletico boca juniors': 'Boca Juniors',
};

const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/^(fc|afc)\s+|\s+(fc|afc)$/g, '').replace(/\s+/g, ' ').trim();

// A long name not listed: the club-type words around it go ("Club Atlético Lanús" → "Lanús").
const LONG = 18;
const AFFIX = [/^(club atl[eé]tico|club deportivo|clube atl[eé]tico|sport club|esporte clube|associa[cç][aã]o desportiva)\s+/i,
  /\s+(football club|f[uú]tbol club|futebol clube)$/i];

/** The name to show for a team when shorter than the full one, else null. */
export function shortTeam(name) {
  const full = String(name || '').trim();
  const listed = SHORT[plain(full)];
  if (listed) return listed === full ? null : listed;
  if (full.length <= LONG) return null;
  const cut = AFFIX.reduce((s, re) => s.replace(re, ''), full).trim();
  return cut && cut !== full ? cut : null;
}

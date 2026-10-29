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
  'gremio foot-ball porto alegrense': 'Grêmio', 'clube de regatas vasco da gama': 'Vasco da Gama', 'clube atletico mineiro': 'Atlético-MG',
  'sport club internacional': 'Internacional', 'fluminense football club': 'Fluminense', 'cruzeiro esporte clube': 'Cruzeiro',
  'botafogo de futebol e regatas': 'Botafogo', 'santos futebol clube': 'Santos', 'esporte clube bahia': 'Bahia',
  'club atletico independiente': 'Independiente', 'racing club de avellaneda': 'Racing Club',
};

const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/^(fc|afc)\s+|\s+(fc|afc)$/g, '').replace(/\s+/g, ' ').trim();

// Any other long name is shortened step by step, stopping as soon as it fits (LONG letters):
// years go ("TSG 1899 Hoffenheim"), the club-type words become their letters ("Esporte Clube Bahia" →
// "EC Bahia", "Club Atlético Lanús" → "CA Lanús"), common words their short form ("United" → "Utd",
// "Universidad" → "U."), and last "de / do / da" in the middle. What is still long wraps on screen.
// An age or women's mark at the end ("U21", "(F)", "II") always stays.
const LONG = 16;

// Club-type phrases (accents and case ignored) → their letters; a "de / do…" after them goes too.
const PHRASES = [
  ['club social y deportivo', 'CSD'], ['turn und sportverein', 'TSV'], ['verein fur bewegungsspiele', 'VfB'],
  ['clube de regatas', 'CR'], ['real club deportivo', 'RCD'], ['sport lisboa e', 'SL'],
  ['football club', 'FC'], ['futebol clube', 'FC'], ['futbol club', 'FC'], ['fussball club', 'FC'], ['fussballclub', 'FC'],
  ['club de futbol', 'CF'], ['clube de futebol', 'CF'], ['sport club', 'SC'], ['sporting club', 'SC'], ['sporting clube', 'SC'],
  ['sport clube', 'SC'], ['esporte clube', 'EC'], ['esporte club', 'EC'], ['sociedade esportiva', 'SE'], ['sociedade desportiva', 'SD'],
  ['club atletico', 'CA'], ['clube atletico', 'CA'], ['club deportivo', 'CD'], ['clube desportivo', 'CD'], ['club sportivo', 'CS'],
  ['associacao desportiva', 'AD'], ['associacao atletica', 'AA'], ['associacao academica', 'AA'], ['associacao esportiva', 'AE'],
  ['associazione calcio', 'AC'], ['associazione sportiva', 'AS'], ['societa sportiva', 'SS'], ['unione sportiva', 'US'],
  ['athletic club', 'AC'], ['real club', 'RC'], ['sportverein', 'SV'], ['sportclub', 'SC'], ['grupo desportivo', 'GD'],
  ['gremio foot-ball', 'Grêmio'], ['clube atletico', 'CA'], ['club atletico', 'CA'], ['futbol kulubu', 'FK'], ['futbolny klub', 'FK'],
].map(([words, abbr]) => [words.split(' '), abbr]).sort((a, b) => b[0].length - a[0].length);
const WORDS = {
  united: 'Utd', saint: 'St', sankt: 'St', athletic: 'Ath.', atletico: 'Atl.', deportivo: 'Dep.', deportes: 'Dep.',
  desportivo: 'Desp.', borussia: 'B.', olympique: 'O.', universidad: 'U.', universitario: 'Univ.',
  universitatea: 'U.', university: 'Univ.', internacional: 'Inter', independiente: 'Indep.', academy: 'Acad.', academia: 'Acad.',
  calcio: '', club: '', clube: '', futebol: '', football: '', futbol: '',
};
const LINK = new Set(['de', 'do', 'da', 'dos', 'das', 'del']);
const MARK = /^(u-?\d{2}|ii|iii|iv|b|w|women|res\.?|reserves|\([a-z]{1,2}\))$/i;
const key = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.,]/g, '').replace(/ß/g, 'ss');
const fits = (t) => t.join(' ').length <= LONG;

function shorten(full) {
  let t = full.split(/\s+/).filter(Boolean);
  const marks = [];
  while (t.length > 1 && MARK.test(t[t.length - 1])) marks.unshift(t.pop());
  const steps = [
    (w) => w.filter((x, i) => !(i && /^\d{2,4}$/.test(x))),
    (w) => {
      const out = [];
      for (let i = 0; i < w.length;) {
        const hit = PHRASES.find(([p]) => p.every((x, j) => key(w[i + j] || '') === x));
        if (!hit) { out.push(w[i]); i += 1; continue; }
        out.push(hit[1]);
        i += hit[0].length;
        if (i < w.length - 1 && LINK.has(key(w[i]))) i += 1;
      }
      return out;
    },
    (w) => { const out = w.map((x) => (key(x) in WORDS ? WORDS[key(x)] : x)).filter(Boolean); return out.length ? out : w; },
    (w) => (w.length > 2 ? w.filter((x, i) => !i || i === w.length - 1 || !LINK.has(key(x))) : w),
  ];
  for (const step of steps) {
    if (fits([...t, ...marks])) break;
    t = step(t);
  }
  return [...t, ...marks].join(' ');
}

/** The name to show for a team when shorter than the full one, else null. Tennis: the first name's initial. */
export function shortTeam(name, sport = '') {
  const full = String(name || '').trim();
  if (!full) return null;
  if (sport === 'tenis') {
    const m = full.length > LONG && !full.includes('/') && full.match(/^(\S)\S*\s+(.+)$/);
    return m ? `${m[1].toUpperCase()}. ${m[2]}` : null;
  }
  // The listed clubs also with a mark after them ("Borussia Mönchengladbach II" → "M'gladbach II").
  const words = full.split(/\s+/);
  const marks = [];
  while (words.length > 1 && MARK.test(words[words.length - 1])) marks.unshift(words.pop());
  const listed = SHORT[plain(words.join(' '))];
  if (listed) return [listed, ...marks].join(' ') === full ? null : [listed, ...marks].join(' ');
  if (full.length <= LONG) return null;
  const cut = shorten(full);
  return cut && cut !== full ? cut : null;
}

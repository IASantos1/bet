import fs from 'fs';

const sources = [
  { key: 'england', league: 'england-premier-league', country: 'England', url: 'https://en.wikipedia.org/wiki/Premier_League' },
  { key: 'england', league: 'england-championship', country: 'England', url: 'https://en.wikipedia.org/wiki/English_Football_League_Championship' },
  { key: 'brazil', league: 'brazil-serie-a', country: 'Brazil', url: 'https://en.wikipedia.org/wiki/Campeonato_Brasileiro_S%C3%A9rie_A' },
  { key: 'brazil', league: 'brazil-serie-b', country: 'Brazil', url: 'https://en.wikipedia.org/wiki/Campeonato_Brasileiro_S%C3%A9rie_B' },
  { key: 'germany', league: 'bundesliga', country: 'Germany', url: 'https://en.wikipedia.org/wiki/Bundesliga' },
  { key: 'germany', league: '2-bundesliga', country: 'Germany', url: 'https://en.wikipedia.org/wiki/2._Bundesliga' },
  { key: 'spain', league: 'la-liga', country: 'Spain', url: 'https://en.wikipedia.org/wiki/La_Liga' },
  { key: 'spain', league: 'segunda-division', country: 'Spain', url: 'https://en.wikipedia.org/wiki/Segunda_Divisi%C3%B3n' },
  { key: 'italy', league: 'serie-a', country: 'Italy', url: 'https://en.wikipedia.org/wiki/Serie_A' },
  { key: 'italy', league: 'serie-b', country: 'Italy', url: 'https://en.wikipedia.org/wiki/Serie_B' },
  { key: 'france', league: 'ligue-1', country: 'France', url: 'https://en.wikipedia.org/wiki/Ligue_1' },
  { key: 'france', league: 'ligue-2', country: 'France', url: 'https://en.wikipedia.org/wiki/Ligue_2' },
  { key: 'portugal', league: 'primeira-liga', country: 'Portugal', url: 'https://en.wikipedia.org/wiki/Primeira_Liga' },
  { key: 'portugal', league: 'liga-portugal-2', country: 'Portugal', url: 'https://en.wikipedia.org/wiki/Liga_Pro' },
  { key: 'netherlands', league: 'eredivisie', country: 'Netherlands', url: 'https://en.wikipedia.org/wiki/Eredivisie' },
  { key: 'netherlands', league: 'eerstedivisie', country: 'Netherlands', url: 'https://en.wikipedia.org/wiki/Eerste_Divisie' },
  { key: 'argentina', league: 'primera-division', country: 'Argentina', url: 'https://en.wikipedia.org/wiki/Primera_Divisi%C3%B3n_(Argentina)' },
  { key: 'argentina', league: 'primera-nacional', country: 'Argentina', url: 'https://en.wikipedia.org/wiki/Primera_Nacional' },
  { key: 'belgium', league: 'jupiler-pro-league', country: 'Belgium', url: 'https://en.wikipedia.org/wiki/Belgian_Pro_League' },
  { key: 'belgium', league: 'challenger-pro-league', country: 'Belgium', url: 'https://en.wikipedia.org/wiki/Challenger_Pro_League' },
  { key: 'scotland', league: 'scottish-premiership', country: 'Scotland', url: 'https://en.wikipedia.org/wiki/Scottish_Premiership' },
  { key: 'scotland', league: 'scottish-championship', country: 'Scotland', url: 'https://en.wikipedia.org/wiki/Scottish_Championship' },
  { key: 'mexico', league: 'liga-mx', country: 'Mexico', url: 'https://en.wikipedia.org/wiki/Liga_MX' },
  { key: 'mexico', league: 'ascenso-mx', country: 'Mexico', url: 'https://en.wikipedia.org/wiki/Ascenso_MX' },
  { key: 'japan', league: 'j1-league', country: 'Japan', url: 'https://en.wikipedia.org/wiki/J1_League' },
  { key: 'japan', league: 'j2-league', country: 'Japan', url: 'https://en.wikipedia.org/wiki/J2_League' },
  { key: 'usa', league: 'mls', country: 'United States', url: 'https://en.wikipedia.org/wiki/Major_League_Soccer' },
  { key: 'usa', league: 'usl-championship', country: 'United States', url: 'https://en.wikipedia.org/wiki/USL_Championship' },
];

const isClubLike = (name) => {
  const n = String(name || '').trim();
  if (!n) return false;
  if (n.length < 3 || n.length > 60) return false;
  const bad = [
    'premier league','bundesliga','serie a','serie b','la liga','liga mx','ascenso mx','championship','premiership','league','cup','uefa','fifa','association','season','current champions',
    'broadcast','edit links','relegation','promotion','soccer','mls','espn','bbc','fox','tsn','rds','dazn','apple tv','copa mx','copa do brasil','pro league','challenger pro league','j1 league','j2 league',
    'stadium','arena','park','field','center','centre','sports','tv','channel','match'
  ];
  const tokens = [' fc',' cf',' sc',' ac ',' as ',' afc',' united',' city',' town',' real ',' deportivo',' sporting',' atlético',' atletico',' athletic',' sv ',' fk ',' nk ',' sk ',' rc ',' kv ',' kaa ',' krc ',' rsc ',' cd ',' sd ',' cr '];
  const exceptions = new Set(['arsenal','chelsea','everton','liverpool','benfica','porto','braga','valencia','sevilla','fenerbahce','galatasaray','ajax','psv','twente','heerenveen','parma','verona','udinese','nantes','bordeaux','monaco','rennes','angers','bologna','spezia']);
  const nl = n.toLowerCase();
  if (bad.some((b) => nl.includes(b))) return false;
  const hasSpace = /\s/.test(n);
  const personNameRegex = /^[A-Z][a-zÀ-ÿ]+(\s[A-Z][a-zÀ-ÿ]+)+$/;
  if (personNameRegex.test(n)) return false;
  if (!(hasSpace || tokens.some((t) => nl.includes(t)) || exceptions.has(nl))) return false;
  return /^[A-Za-zÀ-ÿ .,'&()-]+$/.test(n);
};

const extractClubs = (html) => {
  const names = new Set();
  const anchorRegex = /<a[^>]+>([^<]+)<\/a>/g;
  let m;
  while ((m = anchorRegex.exec(html)) !== null) {
    const name = m[1];
    if (isClubLike(name)) names.add(name.trim());
    if (names.size > 120) break;
  }
  const list = Array.from(names);
  list.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return list.slice(0, 40);
};

const result = {};
for (const c of sources) {
  try {
    const r = await fetch(c.url);
    const html = r.ok ? await r.text() : '';
    const clubs = extractClubs(html);
    const div1 = clubs.slice(0, 20);
    const div2 = clubs.slice(20, 40);
    result[c.league] = {
      league: c.league,
      country: c.country,
      divisions: { '1': div1, '2': div2 },
    };
    console.log(`Collected ${c.league}: d1=${div1.length}, d2=${div2.length}`);
  } catch (e) {
    console.warn(`Failed to collect ${c.league}: ${String(e && e.message || e)}`);
    result[c.league] = {
      league: c.league,
      country: c.country,
      divisions: { '1': [], '2': [] },
    };
  }
}

fs.writeFileSync('clubs.json', JSON.stringify(result, null, 2), 'utf-8');
console.log('clubs.json written at project root');

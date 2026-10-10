// Basketball and ice hockey: the countries Bet62 covers, with every league WinHouse lists for them
// (as football has its first and second divisions, footballdivisions.js). WinHouse names a league
// "<Country>. <League>" ("Germany. BBL", "Sweden. SHL"), or by itself for the big international
// ones ("NBA", "Euroleague", "KHL"); names are compared loosely (lower case, letters and digits).
// Women's, youth and virtual competitions stay out through the usual filters.

/** "Germany. BBL" → "germanybbl". */
const key = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

/** The country as the sidebar shows it (English, as WinHouse writes it) → how WinHouse writes it. */
const ALIASES = {
  Argentina: ['argentina'], Australia: ['australia'], Austria: ['austria'], Belarus: ['belarus'], Brazil: ['brazil'],
  Bulgaria: ['bulgaria'], China: ['china'], Croatia: ['croatia'], 'Czech Republic': ['czechrepublic', 'czechia'],
  Denmark: ['denmark'], England: ['england', 'greatbritain', 'unitedkingdom'], Finland: ['finland'], France: ['france'],
  Germany: ['germany'], Greece: ['greece'], Israel: ['israel'], Italy: ['italy'], Japan: ['japan'], Lithuania: ['lithuania'],
  Mexico: ['mexico'], Netherlands: ['netherlands', 'holland'], Norway: ['norway'], Philippines: ['philippines'], Poland: ['poland'], Portugal: ['portugal'], Romania: ['romania'],
  Russia: ['russia'], Serbia: ['serbia'], Slovakia: ['slovakia'], Slovenia: ['slovenia'], 'South Korea': ['southkorea', 'korea', 'korearepublic'],
  Spain: ['spain'], Sweden: ['sweden'], Switzerland: ['switzerland'], Turkey: ['turkey', 'turkiye'],
  'United States': ['usa', 'unitedstates'], Europe: ['europe'], World: ['world', 'international'],
};

/**
 * Per sport: the countries covered, and the leagues WinHouse names without a country (the start of
 * the name → its country). Europe gathers the continental cups; World (Internacional) the national
 * teams' tournaments and friendlies.
 */
const SPORTS = {
  basquetebol: {
    countries: ['Germany', 'Argentina', 'Australia', 'Austria', 'Brazil', 'Bulgaria', 'Czech Republic', 'South Korea', 'Croatia',
      'Slovenia', 'Spain', 'United States', 'Europe', 'Philippines', 'France', 'Greece', 'England', 'World', 'Israel', 'Italy',
      'Japan', 'Lithuania', 'Mexico', 'Poland', 'Portugal', 'Romania', 'Serbia', 'Turkey', 'China'],
    bare: [
      [/^(nba|wnba|ncaa|gleague|nbagleague)/, 'United States'],
      [/^(euroleague|eurocup|aba|adriatic|basketballchampionsleague|championsleague|fibaeurope|fibachampionsleague|enbl|eurobasket|europeannorth)/, 'Europe'],
      [/^(fiba|worldcup|olympic|friendl|clubfriendl|americup|asiacup|afrobasket)/, 'World'],
    ],
  },
  hoquei: {
    countries: ['Germany', 'Austria', 'Belarus', 'Czech Republic', 'Denmark', 'Slovakia', 'United States', 'Europe', 'Finland',
      'France', 'World', 'Poland', 'Russia', 'Sweden', 'Switzerland'],
    bare: [
      [/^(nhl|ahl|echl|ncaa)/, 'United States'],
      [/^(khl|vhl)/, 'Russia'],
      [/^(icehockeyleague|icehl|ebel|erstebank)/, 'Austria'],
      [/^(championshockeyleague|chl|eurohockeytour|spenglercup|continentalcup|alpshockeyleague|alpsl)/, 'Europe'],
      [/^(iihf|worldchampionship|olympic|friendl|wintergames)/, 'World'],
    ],
  },
  voleibol: {
    countries: ['Germany', 'Austria', 'Czech Republic', 'Finland', 'France', 'Italy', 'Netherlands', 'Poland', 'Turkey',
      'Brazil', 'Portugal', 'Europe', 'World'],
    bare: [
      [/^(cev|championsleague|europeanchampionship|eurovolley)/, 'Europe'],
      [/^(fivb|nationsleague|vnl|worldchampionship|worldcup|olympic|clubworldchampionship|friendl)/, 'World'],
    ],
  },
  andebol: {
    countries: ['Germany', 'Denmark', 'Slovenia', 'Spain', 'Europe', 'France', 'World', 'Norway', 'Sweden', 'Portugal'],
    bare: [
      [/^(ehf|championsleague|europeanleague|europeancup|europeanchampionship|euro20)/, 'Europe'],
      [/^(ihf|worldchampionship|olympic|friendl|superglobe)/, 'World'],
    ],
  },
  futsal: {
    countries: ['Brazil', 'Spain', 'Portugal'],
    bare: [],
  },
};

/**
 * Badminton, table tennis and darts are played in tournaments, not national leagues: every one is
 * shown, under the country that hosts it when its name says so ("China Smash", "Swiss Darts
 * Trophy", "Arctic Open" in Finland), else under Internacional.
 */
const HOSTS = [
  [/china|chinese/, 'China'], [/swiss|switzerland/, 'Switzerland'], [/arctic|finland|finnish/, 'Finland'],
  [/german|germany/, 'Germany'], [/denmark|danish/, 'Denmark'], [/dutch|netherlands/, 'Netherlands'], [/french|france|paris/, 'France'],
  [/england|english|london|wales|welsh|blackpool/, 'England'], [/scotland|scottish/, 'Scotland'], [/ireland|irish/, 'Ireland'],
  [/japan|tokyo/, 'Japan'], [/korea|seoul/, 'South Korea'], [/india/, 'India'], [/indonesia/, 'Indonesia'], [/malaysia/, 'Malaysia'],
  [/thailand|thai/, 'Thailand'], [/singapore/, 'Singapore'], [/hongkong/, 'Hong Kong'], [/taipei|taiwan/, 'Chinese Taipei'],
  [/spain|spanish/, 'Spain'], [/portugal|portuguese/, 'Portugal'], [/poland|polish/, 'Poland'], [/czech/, 'Czech Republic'],
  [/austria/, 'Austria'], [/belgi/, 'Belgium'], [/sweden|swedish/, 'Sweden'], [/norway|norwegian|nordic/, 'Norway'],
  [/slovenia/, 'Slovenia'], [/hungar/, 'Hungary'], [/croatia/, 'Croatia'], [/italy|italian/, 'Italy'], [/usa|unitedstates|america/, 'United States'],
  [/canada/, 'Canada'], [/australia/, 'Australia'], [/newzealand/, 'New Zealand'], [/bahrain/, 'Bahrain'], [/saudi/, 'Saudi Arabia'],
  [/qatar/, 'Qatar'], [/macau|macao/, 'Macau'], [/europe/, 'Europe'],
];
const TOURNAMENT_SPORTS = new Set(['badminton', 'tenismesa', 'dardos']);
// Youth leagues named without a youth word (Russia's MHL, Canada's junior leagues).
const NOT = /^(russia)?(mhl|ohl|whl|qmjhl|ushl)/;

/** The sports with a country → leagues tree built this way (the first ones are also filtered by it). */
export const FILTERED_SPORTS = Object.keys(SPORTS);
export const COUNTRY_SPORTS = [...FILTERED_SPORTS, ...TOURNAMENT_SPORTS];

/** The country (as the sidebar shows it) of a league or tournament of this sport, or null when not covered. */
export function leagueCountry(sport, name) {
  const k = key(name);
  if (TOURNAMENT_SPORTS.has(sport)) return k ? HOSTS.find(([re]) => re.test(k))?.[1] || 'World' : null;
  const s = SPORTS[sport];
  if (!s || !k || NOT.test(k)) return null;
  for (const country of s.countries) {
    for (const a of ALIASES[country]) if (k.startsWith(a) && k.length > a.length) return country;
  }
  for (const [re, country] of s.bare) if (re.test(k)) return country;
  return null;
}

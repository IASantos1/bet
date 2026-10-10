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
  Mexico: ['mexico'], Philippines: ['philippines'], Poland: ['poland'], Portugal: ['portugal'], Romania: ['romania'],
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
};
// Youth leagues named without a youth word (Russia's MHL, Canada's junior leagues).
const NOT = /^(russia)?(mhl|ohl|whl|qmjhl|ushl)/;

/** The sports with a country → leagues tree built this way. */
export const COUNTRY_SPORTS = Object.keys(SPORTS);

/** The country (as the sidebar shows it) of a basketball / ice hockey league, or null when not covered. */
export function leagueCountry(sport, name) {
  const s = SPORTS[sport];
  const k = key(name);
  if (!s || !k || NOT.test(k)) return null;
  for (const country of s.countries) {
    for (const a of ALIASES[country]) if (k.startsWith(a) && k.length > a.length) return country;
  }
  for (const [re, country] of s.bare) if (re.test(k)) return country;
  return null;
}

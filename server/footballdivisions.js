// Football: the first and second division of each country Bet62 covers. WinHouse names a league
// "<Country>. <League>" ("England. Championship", "Spain. Segunda Division"); the exact names vary
// (sponsors, seasons, "Apertura" / "Clausura"), so each country lists the ways its top two tiers are
// written, compared loosely (lower case, letters and digits only). Women's, youth and virtual
// competitions stay out through the usual filters.

/** "England. Premier League" → "englandpremierleague". */
const key = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

// A league name may end with its stage: still the same division.
const STAGE = '(apertura|clausura|playoffs?|playout|championshipround|championshipgroup|relegationround|relegationgroup|regularseason|firstphase|secondphase|finalphase|championship|relegation)?';

/**
 * [country as the sidebar shows it (English, as WinHouse writes it), the ways WinHouse writes the
 * country, first-division names, second-division names]. Names are keys (see `key`).
 */
const D = [
  ['Germany', ['germany'], ['bundesliga'], ['2bundesliga', 'bundesliga2', 'secondbundesliga']],
  ['Angola', ['angola'], ['girabola', 'primeiradivisao', 'premierleague'], ['segundadivisao', 'segundadivisaoangola']],
  ['Saudi Arabia', ['saudiarabia'], ['proleague', 'premierleague', 'roshnsaudileague', 'saudiproleague'], ['firstdivision', 'division1', '1stdivision', 'firstdivisionleague', 'yelloleague']],
  ['Argentina', ['argentina'], ['primeradivision', 'ligaprofesional', 'ligaprofesionaldefutbol'], ['primerabnacional', 'primeranacional']],
  ['Australia', ['australia'], ['aleague', 'aleaguemen'], ['australianchampionship', 'championship']],
  ['Austria', ['austria'], ['bundesliga', 'admiralbundesliga'], ['2liga', 'ersteliga', '2ndliga', 'secondliga']],
  ['Bahrain', ['bahrain'], ['premierleague', 'eliteleague', 'kingdomleague'], ['seconddivision', 'division2', '2nddivision', 'firstdivision']],
  ['Belgium', ['belgium'], ['jupilerleague', 'proleague', 'firstdivisiona', 'jupilerproleague'], ['challengerproleague', 'firstdivisionb', '1bproleague', 'proleague2']],
  ['Belarus', ['belarus'], ['premierleague', 'vysshayaliga', 'highestleague'], ['firstleague', '1stleague', 'pershayaliga', 'division1']],
  ['Bosnia and Herzegovina', ['bosniaandherzegovina', 'bosniaherzegovina', 'bosnia'], ['premierleague', 'premijerliga'], ['firstleaguefbih', 'firstleaguers', 'firstleague', '1stleague', 'prvaligafbih', 'prvaligars']],
  ['Brazil', ['brazil'], ['campeonatobrasileiroseriea', 'seriea', 'brasileiraoseriea'], ['campeonatobrasileiroserieb', 'serieb', 'brasileiraoserieb']],
  ['Bulgaria', ['bulgaria'], ['parvaliga', 'firstleague', '1stleague', 'efbetliga', 'firstprofessionalleague'], ['vtoraliga', 'secondleague', '2ndleague', 'secondprofessionalleague']],
  ['Canada', ['canada'], ['premierleague', 'canadianpremierleague'], []],
  ['Kazakhstan', ['kazakhstan'], ['premierleague'], ['firstdivision', '1stdivision', 'firstleague', 'division1']],
  ['Czech Republic', ['czechrepublic', 'czechia'], ['chanceliga', 'firstleague', '1liga', 'fortunaliga', '1stleague'], ['chancenarodniliga', 'fnl', 'nationalfootballleague', '2liga', 'secondleague', '2ndleague', 'fortunanarodniliga']],
  ['Chile', ['chile'], ['primeradivision', 'campeonatonacional'], ['primerab', 'ligadeascenso', 'primerabdivision']],
  ['China', ['china'], ['superleague', 'csl', 'chinesesuperleague'], ['leagueone', 'chinaleagueone', 'jialeague', 'league1', 'firstleague']],
  ['Cyprus', ['cyprus'], ['firstdivision', '1stdivision', 'division1', 'cytaleague'], ['seconddivision', '2nddivision', 'division2']],
  ['Colombia', ['colombia'], ['categoriaprimeraa', 'primeraa', 'ligabetplay'], ['categoriaprimerab', 'primerab', 'torneobetplay']],
  ['South Korea', ['southkorea', 'korearepublic', 'korea'], ['kleague1', 'kleague', 'kleagueclassic'], ['kleague2', 'kleaguechallenge']],
  ['Costa Rica', ['costarica'], ['primeradivision', 'ligapromerica', 'ligafpd'], ['segundadivision', 'ligadeascenso', 'ligadeascensocr']],
  ['Croatia', ['croatia'], ['hnl', '1hnl', 'prvahnl', 'supersporthnl', 'firstleague', '1stleague'], ['prvanl', '1nl', '2hnl', 'druganl', 'secondleague', '2ndleague', 'firstnl']],
  ['Denmark', ['denmark'], ['superliga', '3fsuperliga'], ['1stdivision', 'firstdivision', '1division', 'nordicbetliga']],
  ['Egypt', ['egypt'], ['premierleague'], ['seconddivision', '2nddivision', 'secondleague', 'division2', 'seconddivisiona']],
  ['Ecuador', ['ecuador'], ['seriea', 'ligapro', 'ligaproseriea'], ['serieb', 'ligaproserieb']],
  ['Scotland', ['scotland'], ['premiership', 'premierleague'], ['championship']],
  ['Slovakia', ['slovakia'], ['superliga', 'nikeliga', 'fortunaliga', '1liga', 'firstleague'], ['2liga', 'secondleague', '2ndleague', 'monacobetliga']],
  ['Slovenia', ['slovenia'], ['prvaliga', '1snl', 'firstleague', '1stleague', 'prvaligatelemach'], ['2snl', 'drugaliga', 'secondleague', '2ndleague']],
  ['Spain', ['spain'], ['laliga', 'primeradivision', 'laligaea'], ['segundadivision', 'laliga2', 'laligahypermotion']],
  ['United States', ['usa', 'unitedstates'], ['mls', 'majorleaguesoccer'], ['uslchampionship', 'usl']],
  ['Estonia', ['estonia'], ['meistriliiga', 'premiumliiga'], ['esiliiga']],
  ['Finland', ['finland'], ['veikkausliiga'], ['ykkonen', 'ykkosliiga']],
  ['France', ['france'], ['ligue1'], ['ligue2']],
  ['Georgia', ['georgia'], ['erovnuliliga', 'umaglesiliga', 'crystalbeterovnuliliga'], ['erovnuliliga2', 'liga2', 'pirveliliga']],
  ['Greece', ['greece'], ['superleague', 'superleague1', 'stoiximansuperleague'], ['superleague2', 'footballleague', 'superleague2north', 'superleague2south']],
  ['Guatemala', ['guatemala'], ['ligamayor', 'ligananacional', 'primeradivision'], ['primeradivisionascenso', 'segundadivision']],
  ['Honduras', ['honduras'], ['ligananacional', 'ligasalvavidas', 'primeradivision'], ['ligadeascenso', 'segundadivision']],
  ['Hungary', ['hungary'], ['nbi', 'otpbankliga', 'nb1', 'firstleague'], ['nbii', 'nb2', 'merkantilbankliga', 'secondleague']],
  ['Faroe Islands', ['faroeislands', 'faroe'], ['premierleague', 'effodeildin', 'betrideildin'], ['1deild', 'firstdivision', '1stdivision']],
  ['India', ['india'], ['superleague', 'isl', 'indiansuperleague'], ['ileague', 'ileague1']],
  ['Indonesia', ['indonesia'], ['liga1', 'superleague', 'bri liga1'.replace(/\s/g, '')], ['liga2', 'championship']],
  ['England', ['england'], ['premierleague'], ['championship']],
  ['Iran', ['iran'], ['proleague', 'persiangulfproleague', 'persiangulfleague'], ['azadeganleague', 'division1', 'firstdivision']],
  ['Ireland', ['ireland', 'republicofireland'], ['premierdivision', 'premierleague'], ['firstdivision', '1stdivision']],
  ['Northern Ireland', ['northernireland'], ['premiership', 'nifl premiership'.replace(/\s/g, ''), 'premierleague'], ['championship', 'niflchampionship']],
  ['Iceland', ['iceland'], ['urvalsdeild', 'bestadeild', 'premierleague'], ['1deild', 'lengjudeild', 'division1', 'firstdivision']],
  ['Israel', ['israel'], ['premierleague', 'ligathaal', 'ligathaal'], ['leumitleague', 'ligaleumit', 'nationalleague']],
  ['Italy', ['italy'], ['seriea'], ['serieb']],
  ['Jamaica', ['jamaica'], ['premierleague', 'jpl'], []],
  ['Japan', ['japan'], ['jleague', 'j1league', 'jleaguedivision1', 'jleague1'], ['j2league', 'jleaguedivision2', 'jleague2']],
  ['Jordan', ['jordan'], ['proleague', 'premierleague'], ['firstdivision', 'division1', '1stdivision']],
  ['Kuwait', ['kuwait'], ['premierleague', 'proleague', 'stars league'.replace(/\s/g, '')], ['divisiona', 'firstdivision', 'division1']],
  ['Luxembourg', ['luxembourg'], ['nationaldivision', 'bglligue', 'divisionnationale'], ['promotiondhonneur', 'promotionhonneur']],
  ['North Macedonia', ['northmacedonia', 'macedonia'], ['firstleague', '1stleague', 'prvaliga', 'firstmacedonianleague'], ['secondleague', '2ndleague', 'vtoraliga']],
  ['Morocco', ['morocco'], ['botolapro', 'botola', 'botolapro1'], ['botola2', 'botolapro2']],
  ['Mexico', ['mexico'], ['ligamx'], ['ligadeexpansion', 'ligaexpansionmx', 'expansionmx', 'ascensomx']],
  ['Montenegro', ['montenegro'], ['firstleague', '1stleague', 'prvaliga', '1cfl'], ['secondleague', '2ndleague', 'drugaliga', '2cfl']],
  ['Nicaragua', ['nicaragua'], ['primeradivision', 'ligaprimera'], ['segundadivision']],
  ['Nigeria', ['nigeria'], ['professionalleague', 'npfl', 'premierleague'], ['nationalleague', 'nnl']],
  ['Norway', ['norway'], ['eliteserien'], ['1divisjon', 'obosligaen', 'firstdivision', '1stdivision']],
  ['New Zealand', ['newzealand'], ['nationalleague', 'premiership', 'nationalleaguechampionship'], []],
  ['Wales', ['wales'], ['premierleague', 'cymrupremier', 'jdcymrupremier'], ['cymrunorth', 'cymrusouth', 'championship']],
  ['Netherlands', ['netherlands', 'holland'], ['eredivisie'], ['eerstedivisie', 'keukenkampioendivisie']],
  ['Panama', ['panama'], ['ligapanamenadefutbol', 'lpf', 'primeradivision', 'ligapanamena'], ['ligaprom', 'segundadivision']],
  ['Paraguay', ['paraguay'], ['primeradivision', 'divisionprofesional'], ['divisionintermedia', 'segundadivision']],
  ['Peru', ['peru'], ['liga1', 'primeradivision', 'ligaprofesional'], ['liga2', 'segundadivision']],
  ['Poland', ['poland'], ['ekstraklasa'], ['1liga', 'iliga', 'liga1', 'firstleague', '1stleague']],
  ['Portugal', ['portugal'], ['primeiraliga', 'ligaportugal', 'ligaportugalbetclic', 'ligabetclic'], ['segundaliga', 'ligaportugal2', 'ligaportugal2meusuper']],
  ['Qatar', ['qatar'], ['starsleague', 'qsl', 'qatarstarsleague'], ['divisionone', 'seconddivision', 'qsldivision2', 'firstdivision']],
  ['Romania', ['romania'], ['liga1', 'superliga', 'ligai'], ['liga2', 'ligaii']],
  ['Serbia', ['serbia'], ['superliga', 'mozzartbetsuperliga'], ['1stleague', 'firstleague', 'prvaliga']],
  ['Singapore', ['singapore'], ['premierleague', 'singaporepremierleague'], []],
  ['Sweden', ['sweden'], ['allsvenskan'], ['superettan']],
  ['Switzerland', ['switzerland'], ['superleague'], ['challengeleague']],
  ['Thailand', ['thailand'], ['thaileague1', 'league1', 'premierleague', 'thaileague'], ['thaileague2', 'league2']],
  ['Tanzania', ['tanzania'], ['premierleague', 'ligikuu'], ['championship', 'firstleague', 'championshipleague']],
  ['Tunisia', ['tunisia'], ['ligue1', 'ligueprofessionnelle1'], ['ligue2', 'ligueprofessionnelle2']],
  ['Turkey', ['turkey', 'turkiye'], ['superliga', 'superlig'], ['1lig', 'firstleague', '1stleague', 'tff1lig']],
  ['Ukraine', ['ukraine'], ['premierleague', 'upl'], ['persholiha', 'pershaliha', 'firstleague', '1stleague']],
  ['Uruguay', ['uruguay'], ['primeradivision'], ['segundadivision', 'segundadivisionprofesional']],
  ['Uzbekistan', ['uzbekistan'], ['superleague'], ['proleague', 'firstleague', 'proleagueb']],
  ['Venezuela', ['venezuela'], ['primeradivision', 'ligafutve'], ['segundadivision', 'ligafutve2']],
  ['Vietnam', ['vietnam'], ['vleague1', 'vleague', 'vleague1'], ['vleague2', 'firstdivision']],
];

const rules = D.map(([country, aliases, first, second]) => ({
  country,
  aliases,
  tiers: [first, second].map((names) => (names.length ? new RegExp(`^(${[...new Set(names)].join('|')})${STAGE}$`) : null)),
}));

/** The countries covered, as the sidebar shows them. */
export const DIVISION_COUNTRIES = rules.map((r) => r.country);

/**
 * The country and division (1 or 2) of a league, from its name ("England. Championship" → England, 2);
 * null when it is not one of the covered divisions.
 */
export function divisionOf(name) {
  const k = key(name);
  for (const r of rules) {
    for (const a of r.aliases) {
      if (!k.startsWith(a)) continue;
      const rest = k.slice(a.length);
      for (let i = 0; i < r.tiers.length; i++) if (r.tiers[i]?.test(rest)) return { country: r.country, division: i + 1 };
    }
  }
  return null;
}

/** The same for a name already reduced to a key (leagueKey). */
export const divisionOfKey = (k) => divisionOf(k);

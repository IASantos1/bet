// National teams (UEFA Nations League, qualifiers, friendlies…): the feed names them in English; the
// site shows them in Portuguese, with the country's flag in place of a club badge or a shirt. Only what
// is shown changes: the stored names (and so settlement, matching, logs) stay the feed's English ones.

/** English name (and the variants feeds use) → [flagcdn.com code, Portuguese name]. */
const NATIONS = [
  // Europe
  [['portugal'], 'pt', 'Portugal'], [['spain'], 'es', 'Espanha'], [['france'], 'fr', 'França'], [['germany'], 'de', 'Alemanha'],
  [['italy'], 'it', 'Itália'], [['england'], 'gb-eng', 'Inglaterra'], [['scotland'], 'gb-sct', 'Escócia'], [['wales'], 'gb-wls', 'País de Gales'],
  [['northern ireland'], 'gb-nir', 'Irlanda do Norte'], [['ireland', 'republic of ireland', 'rep of ireland', 'eire'], 'ie', 'Irlanda'],
  [['netherlands', 'holland'], 'nl', 'Países Baixos'], [['belgium'], 'be', 'Bélgica'], [['luxembourg'], 'lu', 'Luxemburgo'],
  [['switzerland'], 'ch', 'Suíça'], [['austria'], 'at', 'Áustria'], [['denmark'], 'dk', 'Dinamarca'], [['sweden'], 'se', 'Suécia'],
  [['norway'], 'no', 'Noruega'], [['finland'], 'fi', 'Finlândia'], [['iceland'], 'is', 'Islândia'], [['faroe islands', 'faroe'], 'fo', 'Ilhas Faroé'],
  [['poland'], 'pl', 'Polónia'], [['czech republic', 'czechia'], 'cz', 'Chéquia'], [['slovakia'], 'sk', 'Eslováquia'],
  [['hungary'], 'hu', 'Hungria'], [['romania'], 'ro', 'Roménia'], [['bulgaria'], 'bg', 'Bulgária'], [['greece'], 'gr', 'Grécia'],
  [['turkey', 'turkiye'], 'tr', 'Turquia'], [['cyprus'], 'cy', 'Chipre'], [['malta'], 'mt', 'Malta'], [['croatia'], 'hr', 'Croácia'],
  [['serbia'], 'rs', 'Sérvia'], [['slovenia'], 'si', 'Eslovénia'], [['bosnia and herzegovina', 'bosnia herzegovina', 'bosnia & herzegovina', 'bosnia'], 'ba', 'Bósnia e Herzegovina'],
  [['montenegro'], 'me', 'Montenegro'], [['north macedonia', 'macedonia', 'fyr macedonia'], 'mk', 'Macedónia do Norte'], [['albania'], 'al', 'Albânia'],
  [['kosovo'], 'xk', 'Kosovo'], [['ukraine'], 'ua', 'Ucrânia'], [['belarus'], 'by', 'Bielorrússia'], [['russia'], 'ru', 'Rússia'],
  [['moldova'], 'md', 'Moldávia'], [['georgia'], 'ge', 'Geórgia'], [['armenia'], 'am', 'Arménia'], [['azerbaijan'], 'az', 'Azerbaijão'],
  [['kazakhstan'], 'kz', 'Cazaquistão'], [['israel'], 'il', 'Israel'], [['lithuania'], 'lt', 'Lituânia'], [['latvia'], 'lv', 'Letónia'],
  [['estonia'], 'ee', 'Estónia'], [['andorra'], 'ad', 'Andorra'], [['san marino'], 'sm', 'São Marino'], [['gibraltar'], 'gi', 'Gibraltar'],
  [['liechtenstein'], 'li', 'Listenstaine'],
  // Americas
  [['brazil'], 'br', 'Brasil'], [['argentina'], 'ar', 'Argentina'], [['uruguay'], 'uy', 'Uruguai'], [['paraguay'], 'py', 'Paraguai'],
  [['chile'], 'cl', 'Chile'], [['colombia'], 'co', 'Colômbia'], [['peru'], 'pe', 'Peru'], [['ecuador'], 'ec', 'Equador'],
  [['bolivia'], 'bo', 'Bolívia'], [['venezuela'], 've', 'Venezuela'], [['mexico'], 'mx', 'México'], [['usa', 'united states', 'united states of america'], 'us', 'Estados Unidos'],
  [['canada'], 'ca', 'Canadá'], [['costa rica'], 'cr', 'Costa Rica'], [['panama'], 'pa', 'Panamá'], [['honduras'], 'hn', 'Honduras'],
  [['jamaica'], 'jm', 'Jamaica'], [['el salvador'], 'sv', 'El Salvador'], [['guatemala'], 'gt', 'Guatemala'], [['haiti'], 'ht', 'Haiti'],
  // Africa
  [['morocco'], 'ma', 'Marrocos'], [['algeria'], 'dz', 'Argélia'], [['tunisia'], 'tn', 'Tunísia'], [['egypt'], 'eg', 'Egito'],
  [['nigeria'], 'ng', 'Nigéria'], [['ghana'], 'gh', 'Gana'], [['senegal'], 'sn', 'Senegal'], [['cameroon'], 'cm', 'Camarões'],
  [['ivory coast', "cote d'ivoire", 'cote divoire'], 'ci', 'Costa do Marfim'], [['south africa'], 'za', 'África do Sul'], [['angola'], 'ao', 'Angola'],
  [['mozambique'], 'mz', 'Moçambique'], [['cape verde', 'cabo verde'], 'cv', 'Cabo Verde'], [['guinea-bissau', 'guinea bissau'], 'gw', 'Guiné-Bissau'],
  [['mali'], 'ml', 'Mali'], [['burkina faso'], 'bf', 'Burkina Faso'], [['dr congo', 'congo dr', 'democratic republic of congo'], 'cd', 'RD Congo'],
  // Asia / Oceania
  [['japan'], 'jp', 'Japão'], [['south korea', 'korea republic', 'korea'], 'kr', 'Coreia do Sul'], [['saudi arabia'], 'sa', 'Arábia Saudita'],
  [['iran', 'ir iran'], 'ir', 'Irão'], [['qatar'], 'qa', 'Catar'], [['australia'], 'au', 'Austrália'], [['china', 'china pr'], 'cn', 'China'],
  [['united arab emirates', 'uae'], 'ae', 'Emirados Árabes Unidos'], [['iraq'], 'iq', 'Iraque'], [['new zealand'], 'nz', 'Nova Zelândia'],
];

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.’']/g, "'").replace(/\s+/g, ' ').trim();
const BY_NAME = new Map();
for (const [names, flag, pt] of NATIONS) for (const n of names) BY_NAME.set(fold(n), { flag, pt });

// "Portugal U21", "Spain (W)", "Italy Women"…: the age group or women's side, kept in Portuguese.
const SUFFIXES = [
  [/\s*\(?\bu[- ]?(\d{2})\)?$/i, (m) => ` Sub-${m[1]}`],
  [/\s*\((?:w|women)\)$|\s+(?:women|w)$/i, () => ' (F)'],
];

/** A national team's Portuguese name and flag, or null when the name is not a country's. */
export function nationOf(name) {
  let base = fold(name).replace(/\s+national team$/, '');
  let suffix = '';
  for (const [re, fmt] of SUFFIXES) {
    const m = base.match(re);
    if (m) { suffix = fmt(m) + suffix; base = base.slice(0, m.index).trim(); }
  }
  const n = BY_NAME.get(base);
  return n ? { pt: n.pt + suffix, flag: `https://flagcdn.com/w80/${n.flag}.png` } : null;
}

/**
 * Both sides of a game, when both are national teams (a club is never named just "Portugal"):
 * { home, away } with their Portuguese names and flags; else null (club games are left as they are).
 */
export function nationalSides(home, away) {
  const h = nationOf(home), a = nationOf(away);
  return h && a ? { home: h, away: a } : null;
}

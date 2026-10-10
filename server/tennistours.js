// Tennis on the tours: every ATP, WTA and Challenger tournament (WTA 125 counts as a Challenger),
// singles, doubles and qualifying, whatever week it is. WinHouse names them "ATP. Shanghai",
// "WTA. Wuhan. Qualification", "ATP. Challenger. Braga. Doubles", "WTA. Challenger. Samsun"…
// The sidebar shows them under ATP / WTA / Challengers, as "Pequim WTA - Pares", with the host
// country's flag. ITF ("World Tennis"), UTR and exhibitions are not tours.

/** The sidebar groups, in this order. */
export const TOUR_GROUPS = ['ATP', 'WTA', 'Challengers'];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const NOT_TOUR = /world ?tennis|\bitf\b|\butr\b|exhibition|exibic|legends|senior|junior|\bu\d{2}\b/;

// Host city (as WinHouse writes it, compared without accents and case) → [ISO country, Portuguese name].
const CITY = {
  // Grand Slams and the finals
  'australian open': ['au', 'Open da Austrália'], 'roland garros': ['fr', 'Roland Garros'], 'french open': ['fr', 'Roland Garros'],
  wimbledon: ['gb', 'Wimbledon'], 'us open': ['us', 'US Open'], 'atp finals': ['it', 'ATP Finals'], 'wta finals': ['sa', 'WTA Finals'],
  'next gen finals': ['sa', 'Next Gen Finals'], 'davis cup': [null, 'Taça Davis'], 'billie jean king cup': [null, 'Taça Billie Jean King'],
  'united cup': ['au', 'United Cup'], 'laver cup': [null, 'Laver Cup'], olympics: [null, 'Jogos Olímpicos'],
  // Asia / Oceania
  beijing: ['cn', 'Pequim'], shanghai: ['cn', 'Shanghai'], wuhan: ['cn', 'Wuhan'], chengdu: ['cn', 'Chengdu'], zhuhai: ['cn', 'Zhuhai'],
  ningbo: ['cn', 'Ningbo'], guangzhou: ['cn', 'Cantão'], shenzhen: ['cn', 'Shenzhen'], suzhou: ['cn', 'Suzhou'], wuning: ['cn', 'Wuning'],
  jiujiang: ['cn', 'Jiujiang'], hangzhou: ['cn', 'Hangzhou'], zhangjiagang: ['cn', 'Zhangjiagang'],
  'hong kong': ['hk', 'Hong Kong'], tokyo: ['jp', 'Tóquio'], osaka: ['jp', 'Osaka'], yokohama: ['jp', 'Yokohama'],
  kobe: ['jp', 'Kobe'], matsuyama: ['jp', 'Matsuyama'], seoul: ['kr', 'Seul'], busan: ['kr', 'Busan'], gwangju: ['kr', 'Gwangju'],
  taipei: ['tw', 'Taipé'], kaohsiung: ['tw', 'Kaohsiung'], bangkok: ['th', 'Banguecoque'], nonthaburi: ['th', 'Nonthaburi'], 'hua hin': ['th', 'Hua Hin'],
  singapore: ['sg', 'Singapura'], 'kuala lumpur': ['my', 'Kuala Lumpur'], manila: ['ph', 'Manila'], jakarta: ['id', 'Jacarta'],
  pune: ['in', 'Pune'], bengaluru: ['in', 'Bangalore'], bangalore: ['in', 'Bangalore'], chennai: ['in', 'Chennai'], mumbai: ['in', 'Mumbai'],
  'new delhi': ['in', 'Nova Deli'], delhi: ['in', 'Nova Deli'], almaty: ['kz', 'Almaty'], astana: ['kz', 'Astana'], tashkent: ['uz', 'Tashkent'],
  samarkand: ['uz', 'Samarcanda'], doha: ['qa', 'Doha'], dubai: ['ae', 'Dubai'], 'abu dhabi': ['ae', 'Abu Dhabi'], riyadh: ['sa', 'Riade'],
  jeddah: ['sa', 'Jeddah'], 'sharm el sheikh': ['eg', 'Sharm el-Sheikh'], brisbane: ['au', 'Brisbane'], adelaide: ['au', 'Adelaide'],
  hobart: ['au', 'Hobart'], sydney: ['au', 'Sydney'], canberra: ['au', 'Camberra'], melbourne: ['au', 'Melbourne'], darwin: ['au', 'Darwin'],
  auckland: ['nz', 'Auckland'], burnie: ['au', 'Burnie'], playford: ['au', 'Playford'],
  // Europe
  paris: ['fr', 'Paris'], lyon: ['fr', 'Lyon'], marseille: ['fr', 'Marselha'], montpellier: ['fr', 'Montpellier'], metz: ['fr', 'Metz'],
  rouen: ['fr', 'Rouen'], strasbourg: ['fr', 'Estrasburgo'], 'aix en provence': ['fr', 'Aix-en-Provence'], bordeaux: ['fr', 'Bordéus'],
  orleans: ['fr', 'Orleães'], brest: ['fr', 'Brest'], roanne: ['fr', 'Roanne'], poitiers: ['fr', 'Poitiers'], mouilleron: ['fr', 'Mouilleron-le-Captif'],
  'saint tropez': ['fr', 'Saint-Tropez'], cherbourg: ['fr', 'Cherbourg'], quimper: ['fr', 'Quimper'], limoges: ['fr', 'Limoges'], nantes: ['fr', 'Nantes'],
  madrid: ['es', 'Madrid'], barcelona: ['es', 'Barcelona'], valencia: ['es', 'Valência'], mallorca: ['es', 'Maiorca'], marbella: ['es', 'Marbella'],
  villena: ['es', 'Villena'], vilhena: ['es', 'Villena'], seville: ['es', 'Sevilha'], sevilla: ['es', 'Sevilha'], alicante: ['es', 'Alicante'],
  murcia: ['es', 'Múrcia'], zaragoza: ['es', 'Saragoça'], 'gran canaria': ['es', 'Gran Canaria'], tenerife: ['es', 'Tenerife'], girona: ['es', 'Girona'],
  'san sebastian': ['es', 'São Sebastião'], bilbao: ['es', 'Bilbau'], oviedo: ['es', 'Oviedo'], alcala: ['es', 'Alcalá'],
  lisbon: ['pt', 'Lisboa'], lisboa: ['pt', 'Lisboa'], porto: ['pt', 'Porto'], braga: ['pt', 'Braga'], estoril: ['pt', 'Estoril'],
  oeiras: ['pt', 'Oeiras'], maia: ['pt', 'Maia'], guimaraes: ['pt', 'Guimarães'], 'porto open': ['pt', 'Porto'],
  rome: ['it', 'Roma'], roma: ['it', 'Roma'], milan: ['it', 'Milão'], turin: ['it', 'Turim'], florence: ['it', 'Florença'], naples: ['it', 'Nápoles'],
  napoli: ['it', 'Nápoles'], palermo: ['it', 'Palermo'], parma: ['it', 'Parma'], bergamo: ['it', 'Bérgamo'], genoa: ['it', 'Génova'],
  cagliari: ['it', 'Cagliari'], bari: ['it', 'Bari'], perugia: ['it', 'Perúgia'], todi: ['it', 'Todi'], verona: ['it', 'Verona'], como: ['it', 'Como'],
  trieste: ['it', 'Trieste'], brescia: ['it', 'Brescia'], olbia: ['it', 'Olbia'], ortisei: ['it', 'Ortisei'], 'san marino': ['sm', 'São Marino'],
  london: ['gb', 'Londres'], 'queens club': ['gb', "Queen's"], queens: ['gb', "Queen's"], eastbourne: ['gb', 'Eastbourne'], birmingham: ['gb', 'Birmingham'],
  nottingham: ['gb', 'Nottingham'], ilkley: ['gb', 'Ilkley'], surbiton: ['gb', 'Surbiton'], glasgow: ['gb', 'Glasgow'], edinburgh: ['gb', 'Edimburgo'],
  dublin: ['ie', 'Dublin'], halle: ['de', 'Halle'], hamburg: ['de', 'Hamburgo'], munich: ['de', 'Munique'], stuttgart: ['de', 'Estugarda'],
  berlin: ['de', 'Berlim'], 'bad homburg': ['de', 'Bad Homburg'], cologne: ['de', 'Colónia'], koln: ['de', 'Colónia'], heilbronn: ['de', 'Heilbronn'],
  ismaning: ['de', 'Ismaning'], eckental: ['de', 'Eckental'], braunschweig: ['de', 'Braunschweig'], 'neu ulm': ['de', 'Neu-Ulm'],
  vienna: ['at', 'Viena'], wien: ['at', 'Viena'], kitzbuhel: ['at', 'Kitzbühel'], linz: ['at', 'Linz'], salzburg: ['at', 'Salzburgo'], mauthausen: ['at', 'Mauthausen'],
  basel: ['ch', 'Basileia'], geneva: ['ch', 'Genebra'], gstaad: ['ch', 'Gstaad'], lugano: ['ch', 'Lugano'], biel: ['ch', 'Biel'],
  rotterdam: ['nl', 'Roterdão'], 's hertogenbosch': ['nl', "'s-Hertogenbosch"], hertogenbosch: ['nl', "'s-Hertogenbosch"], amersfoort: ['nl', 'Amersfoort'],
  antwerp: ['be', 'Antuérpia'], brussels: ['be', 'Bruxelas'], mons: ['be', 'Mons'], ottignies: ['be', 'Ottignies'], luxembourg: ['lu', 'Luxemburgo'],
  stockholm: ['se', 'Estocolmo'], bastad: ['se', 'Båstad'], copenhagen: ['dk', 'Copenhaga'], oslo: ['no', 'Oslo'], helsinki: ['fi', 'Helsínquia'],
  tampere: ['fi', 'Tampere'], prague: ['cz', 'Praga'], ostrava: ['cz', 'Ostrava'], brno: ['cz', 'Brno'], prostejov: ['cz', 'Prostějov'],
  bratislava: ['sk', 'Bratislava'], budapest: ['hu', 'Budapeste'], warsaw: ['pl', 'Varsóvia'], krakow: ['pl', 'Cracóvia'], szczecin: ['pl', 'Szczecin'],
  poznan: ['pl', 'Poznań'], wroclaw: ['pl', 'Breslávia'], gdynia: ['pl', 'Gdynia'], bucharest: ['ro', 'Bucareste'], cluj: ['ro', 'Cluj-Napoca'],
  iasi: ['ro', 'Iași'], sibiu: ['ro', 'Sibiu'], sofia: ['bg', 'Sófia'], belgrade: ['rs', 'Belgrado'], 'novi sad': ['rs', 'Novi Sad'],
  zagreb: ['hr', 'Zagreb'], umag: ['hr', 'Umag'], split: ['hr', 'Split'], zadar: ['hr', 'Zadar'], ljubljana: ['si', 'Liubliana'], portoroz: ['si', 'Portorož'],
  'banja luka': ['ba', 'Banja Luka'], sarajevo: ['ba', 'Sarajevo'], skopje: ['mk', 'Skopje'], athens: ['gr', 'Atenas'], thessaloniki: ['gr', 'Salónica'],
  istanbul: ['tr', 'Istambul'], antalya: ['tr', 'Antália'], samsun: ['tr', 'Samsun'], ankara: ['tr', 'Ancara'], izmir: ['tr', 'Esmirna'],
  bodrum: ['tr', 'Bodrum'], tbilisi: ['ge', 'Tbilisi'], moscow: ['ru', 'Moscovo'], 'st petersburg': ['ru', 'São Petersburgo'], kyiv: ['ua', 'Kiev'],
  tallinn: ['ee', 'Tallinn'], vilnius: ['lt', 'Vilnius'], riga: ['lv', 'Riga'],
  'monte carlo': ['mc', 'Monte Carlo'], 'monte-carlo': ['mc', 'Monte Carlo'], monaco: ['mc', 'Mónaco'],
  // Americas
  'indian wells': ['us', 'Indian Wells'], miami: ['us', 'Miami'], cincinnati: ['us', 'Cincinnati'], washington: ['us', 'Washington'],
  atlanta: ['us', 'Atlanta'], 'winston salem': ['us', 'Winston-Salem'], houston: ['us', 'Houston'], dallas: ['us', 'Dallas'], delray: ['us', 'Delray Beach'],
  'delray beach': ['us', 'Delray Beach'], newport: ['us', 'Newport'], charleston: ['us', 'Charleston'], austin: ['us', 'Austin'], 'san diego': ['us', 'San Diego'],
  cleveland: ['us', 'Cleveland'], chicago: ['us', 'Chicago'], 'new haven': ['us', 'New Haven'], 'new york': ['us', 'Nova Iorque'], phoenix: ['us', 'Phoenix'],
  sarasota: ['us', 'Sarasota'], tallahassee: ['us', 'Tallahassee'], 'little rock': ['us', 'Little Rock'], knoxville: ['us', 'Knoxville'],
  charlottesville: ['us', 'Charlottesville'], champaign: ['us', 'Champaign'], columbus: ['us', 'Columbus'], lexington: ['us', 'Lexington'],
  tiburon: ['us', 'Tiburon'], fairfield: ['us', 'Fairfield'], 'las vegas': ['us', 'Las Vegas'], orlando: ['us', 'Orlando'], 'monterrey': ['mx', 'Monterrey'],
  toronto: ['ca', 'Toronto'], montreal: ['ca', 'Montreal'], granby: ['ca', 'Granby'], drummondville: ['ca', 'Drummondville'], calgary: ['ca', 'Calgary'],
  vancouver: ['ca', 'Vancouver'], acapulco: ['mx', 'Acapulco'], 'los cabos': ['mx', 'Los Cabos'], merida: ['mx', 'Mérida'], guadalajara: ['mx', 'Guadalajara'],
  'mexico city': ['mx', 'Cidade do México'], puebla: ['mx', 'Puebla'], 'buenos aires': ['ar', 'Buenos Aires'], cordoba: ['ar', 'Córdoba'],
  rosario: ['ar', 'Rosário'], tucuman: ['ar', 'Tucumán'], 'rio de janeiro': ['br', 'Rio de Janeiro'], rio: ['br', 'Rio de Janeiro'], 'sao paulo': ['br', 'São Paulo'],
  florianopolis: ['br', 'Florianópolis'], 'campinas': ['br', 'Campinas'], 'porto alegre': ['br', 'Porto Alegre'], brasilia: ['br', 'Brasília'],
  santiago: ['cl', 'Santiago'], antofagasta: ['cl', 'Antofagasta'], 'vina del mar': ['cl', 'Viña del Mar'], concepcion: ['cl', 'Concepción'],
  lima: ['pe', 'Lima'], arequipa: ['pe', 'Arequipa'], bogota: ['co', 'Bogotá'], cali: ['co', 'Cali'], medellin: ['co', 'Medellín'], quito: ['ec', 'Quito'],
  guayaquil: ['ec', 'Guayaquil'], 'santa cruz': ['bo', 'Santa Cruz'], 'la paz': ['bo', 'La Paz'], asuncion: ['py', 'Assunção'], montevideo: ['uy', 'Montevideu'],
  'punta del este': ['uy', 'Punta del Este'], 'santo domingo': ['do', 'Santo Domingo'], 'cap cana': ['do', 'Cap Cana'], 'san jose': ['cr', 'San José'],
  // Africa
  casablanca: ['ma', 'Casablanca'], marrakech: ['ma', 'Marraquexe'], rabat: ['ma', 'Rabat'], tunis: ['tn', 'Tunes'], monastir: ['tn', 'Monastir'],
  cairo: ['eg', 'Cairo'], kigali: ['rw', 'Kigali'], 'cape town': ['za', 'Cidade do Cabo'], johannesburg: ['za', 'Joanesburgo'], nairobi: ['ke', 'Nairobi'],
};

/**
 * A tour tournament from its name (or its loose key, as the league filter compares them): its group,
 * host city (Portuguese), country and whether it is doubles / qualifying; null when it is not on the
 * ATP / WTA / Challenger tours.
 */
export function tourOf(name) {
  const raw = String(name || '');
  const n = norm(raw);
  if (!n || NOT_TOUR.test(n)) return null;
  const flat = n.replace(/[^a-z0-9]+/g, '');
  const atp = /^atp/.test(flat);
  const wta = /^wta/.test(flat);
  const challenger = /challenger/.test(flat) || /^wta ?125/.test(n) || /^wta125/.test(flat);
  if (!atp && !wta && !challenger) return null;
  const doubles = /doubles|pares|duplas|dobles/.test(flat);
  const qualifying = /qualif|qual\b/.test(n) || /qualification/.test(flat);
  const women = wta || /\bwomen\b|feminin/.test(n);
  // The city: the name's parts that are not the tour, the draw or "Women".
  const parts = raw.includes('.') ? raw.split('.') : [raw];
  const city = parts.map((p) => p.trim())
    .filter((p) => p && !/^(atp|wta)(\s*\d+k?)?$/i.test(p) && !/^(challenger|doubles|qualification|qualifying|women|men|singles)$/i.test(p))
    .join(' ').replace(/\b(atp|wta)\b/ig, '').replace(/\s+/g, ' ').trim();
  const place = lookupCity(city);
  const group = challenger ? 'Challengers' : atp ? 'ATP' : 'WTA';
  const tour = challenger ? (women ? 'WTA Challenger' : 'Challenger') : atp ? 'ATP' : 'WTA';
  const named = place?.[1] || city;
  // Team events and finals carry no tour suffix ("Taça Davis", "ATP Finals").
  const event = /ta[cç]a|cup|finals|olímp/i.test(named) && !challenger ? named : `${named} ${tour}`.trim();
  const label = `${event}${doubles ? ' - Pares' : ''}${qualifying ? ' - Qual.' : ''}`;
  return { group, tour, city: named, country: place?.[0] || null, doubles, qualifying, women, label };
}

function lookupCity(city) {
  const k = norm(city).replace(/[^a-z0-9]+/g, ' ').replace(/\b\d+\b/g, '').trim();
  if (!k) return null;
  if (CITY[k]) return CITY[k];
  // "Wuning 3", "Monastir 2", "Shenzhen Longhua": the first word(s) that name a city.
  const words = k.split(' ');
  for (let i = words.length - 1; i > 0; i--) { const c = CITY[words.slice(0, i).join(' ')]; if (c) return c; }
  return null;
}

/** For the sidebar: the city's Portuguese name keeps the number of a second week ("Wuning 3"). */
export function tourLabel(name) {
  const t = tourOf(name);
  if (!t) return null;
  const num = /\b(\d)\b/.exec(String(name).replace(/\b(atp|wta)\s*\d+k?\b/ig, ''))?.[1];
  return num && !t.label.includes(num) ? t.label.replace(t.city, `${t.city} ${num}`) : t.label;
}

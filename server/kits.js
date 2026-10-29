// Kit colours set by the house for teams the badge provider (teamlogos.js) gives none for: the home
// shirt's body, its collar / cuffs, and optionally stripes or sleeves of another colour. Not the
// official kits: their colours, drawn as the site's plain shirt (public/app.js jerseySvg).
// Names are compared without accents, in lower case and without "FC" / "AFC" around them.

const K = (body, trim, { stripes = null, sleeves = null } = {}) => [body, trim, stripes ? `stripes:${stripes}` : sleeves ? `sleeves:${sleeves}` : null].filter(Boolean);

export const KITS = {
  // Premier League
  arsenal: K('#ef0107', '#ffffff', { sleeves: '#ffffff' }),
  'aston villa': K('#670e36', '#95bfe5', { sleeves: '#95bfe5' }),
  bournemouth: K('#da291c', '#000000', { stripes: '#000000' }),
  'afc bournemouth': K('#da291c', '#000000', { stripes: '#000000' }),
  brentford: K('#e30613', '#ffffff', { stripes: '#ffffff' }),
  brighton: K('#0057b8', '#ffffff', { stripes: '#ffffff' }),
  'brighton & hove albion': K('#0057b8', '#ffffff', { stripes: '#ffffff' }),
  'brighton and hove albion': K('#0057b8', '#ffffff', { stripes: '#ffffff' }),
  burnley: K('#6c1d45', '#99d6ea', { sleeves: '#99d6ea' }),
  chelsea: K('#034694', '#ffffff'),
  'crystal palace': K('#1b458f', '#c4122e', { stripes: '#c4122e' }),
  everton: K('#003399', '#ffffff'),
  fulham: K('#ffffff', '#000000'),
  'leeds united': K('#ffffff', '#1d428a'),
  leeds: K('#ffffff', '#1d428a'),
  liverpool: K('#c8102e', '#ffffff'),
  'manchester city': K('#6cabdd', '#ffffff'),
  'man city': K('#6cabdd', '#ffffff'),
  'manchester united': K('#da291c', '#ffffff'),
  'man united': K('#da291c', '#ffffff'),
  'man utd': K('#da291c', '#ffffff'),
  newcastle: K('#ffffff', '#241f20', { stripes: '#241f20' }),
  'newcastle united': K('#ffffff', '#241f20', { stripes: '#241f20' }),
  'nottingham forest': K('#dd0000', '#ffffff'),
  "nott'm forest": K('#dd0000', '#ffffff'),
  sunderland: K('#eb172b', '#ffffff', { stripes: '#ffffff' }),
  tottenham: K('#ffffff', '#132257'),
  'tottenham hotspur': K('#ffffff', '#132257'),
  'west ham': K('#7a263a', '#1bb1e7', { sleeves: '#1bb1e7' }),
  'west ham united': K('#7a263a', '#1bb1e7', { sleeves: '#1bb1e7' }),
  wolves: K('#fdb913', '#231f20'),
  'wolverhampton wanderers': K('#fdb913', '#231f20'),
  wolverhampton: K('#fdb913', '#231f20'),
};

const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/^(fc|afc)\s+|\s+(fc|afc)$/g, '').replace(/\s+/g, ' ').trim();

/** The house's kit for a team (football), or null. */
export const houseKit = (sport, name) => (sport === 'futebol' ? KITS[plain(name)] || null : null);

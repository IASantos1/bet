// League tiers & priority — used by:
//   1. Frontend: order Leagues/Events on the listing (P1 shows FIRST).
//   2. Backend: proximity refresh multiplier (P1 = more frequent than default bucket).
//   3. Future: market availability filters, max bet limits, risk controls,
//      match-tracker activation, live-stream eligibility.
// The PulseScore onexbet feed only carries free-text league names, so tier matching
// is done by CASE-INSENSITIVE substring + token list (explicitly avoid slug matching
// because PulseScore often formats as `Brazil. Campeonato Pernambucano U20`, not slug).

export type LeagueTier = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export const LEAGUE_TIER_META: Record<LeagueTier, {
  priority: number;        // Sort key — lower = more important
  label: string;
  defaultRefreshMs: number;   // Baseline refresh when no time-bucket overrides
  liveRefreshMs: number;      // Target refresh when already LIVE
  maxBetEur: number;          // Baseline max stake for a single h2h leg (risk engine uses as ceiling)
  markets: 'full' | 'standard' | 'minimal';
  matchTracker: boolean;
  liveStream: boolean;
}> = {
  P1: { priority: 100, label: 'Tier 1 — Mundial / Top 5 + UEFA', defaultRefreshMs: 2_000,  liveRefreshMs: 1_000, maxBetEur: 100_000, markets: 'full',     matchTracker: true,  liveStream: true  },
  P2: { priority: 200, label: 'Tier 2 — Primeiras divisões fortes',     defaultRefreshMs: 5_000,  liveRefreshMs: 2_000, maxBetEur:  50_000, markets: 'full',     matchTracker: true,  liveStream: false },
  P3: { priority: 300, label: 'Tier 3 — Segundas divisões / Ásia',      defaultRefreshMs: 10_000, liveRefreshMs: 5_000, maxBetEur:  20_000, markets: 'standard', matchTracker: true,  liveStream: false },
  P4: { priority: 400, label: 'Tier 4 — Restantes primeiras / Copas',   defaultRefreshMs: 30_000, liveRefreshMs: 10_000, maxBetEur:   5_000, markets: 'standard', matchTracker: false, liveStream: false },
  P5: { priority: 500, label: 'Tier 5 — Regionais / Amador / Fantasia', defaultRefreshMs: 60_000, liveRefreshMs: 20_000, maxBetEur:   1_000, markets: 'minimal',  matchTracker: false, liveStream: false },
};

/* Tier P1 — Máxima prioridade (100)
 * Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions, Europa + Liga Portugal
 * (top 5 europeus + competições UEFA top + Primeira Liga no TOP como usuário pediu) */
const TIER_P1: readonly string[] = [
  // UEFA inter-club
  'UEFA Champions League', 'UEFA Europa League', 'UEFA Conference League', 'UEFA Super Cup',
  'UEFA Nations League', 'UEFA European Championship', 'EURO',
  // Top 5 Europeus
  'Premier League', 'La Liga', 'LaLiga', 'Serie A', 'Bundesliga', 'Ligue 1',
  // Liga Portugal (Tier 1 como usuário pediu)
  'Liga Portugal', 'Primeira Liga', 'Portugal. Primeira Liga', 'Portugal - Primeira Liga',
  // FIFA
  'World Cup', 'FIFA World Cup', 'Copa do Mundo',
  // ATP / WTA Slams — tennis
  'Wimbledon', 'Australian Open', 'Roland Garros', 'French Open', 'US Open',
  'ATP Finals', 'WTA Finals',
  // Basketball
  'NBA', 'EuroLeague Basketball', 'EuroLeague', 'EuroCup Basketball',
  // NFL / MLB / NHL top (US)
  'National Football League', 'NFL', 'Major League Baseball', 'MLB',
  'National Hockey League', 'NHL',
];

/* Tier P2 — Alta (80)
 * Brasileirão, Eredivisie, Belgian Pro, MLS, Liga MX, Saudi */
const TIER_P2: readonly string[] = [
  'Brasileirão', 'Brasileirao', 'Brazil. Serie A', 'Brazil. Campeonato Brasileiro', 'Campeonato Brasileiro',
  'Eredivisie', 'Netherlands. Eredivisie',
  'Belgian Pro League', 'Belgium. Jupiler League',
  'Major League Soccer', 'MLS',
  'Liga MX', 'Mexico. Liga MX',
  'Saudi Pro League', 'Saudi. Pro League', 'Saudi Professional League',
  'Serie A Brasil', 'Brasileirão Série B', 'Serie B Brazil',
  // Tennis ATP 1000/WTA 1000
  'ATP Masters', 'Masters 1000', 'WTA 1000',
  // Internacionais
  'Copa América', 'Copa Libertadores', 'Libertadores', 'Copa Sudamericana',
  // Europeus secundários
  'Scottish Premiership', 'Turkish Super Lig', 'Super Lig',
  // Basquete internacional
  'ACB', 'Liga ACB', 'Liga Endesa', 'Turkish Airlines EuroLeague', 'G League',
  // Baseball top internacional
  'NPB', 'Japan. NPB', 'KBO',
];

/* Tier P3 — Média (60)
 * Championship, Série B Itália, Bundesliga 2, J1, K League, Eliteserien, Allsvenskan */
const TIER_P3: readonly string[] = [
  'Championship', 'EFL Championship',
  'Serie B Italy', 'Italy. Serie B', 'Serie B',
  'Bundesliga 2', '2. Bundesliga',
  'J1 League', 'J.League', 'Japan. J1 League',
  'K League', 'K League 1', 'South Korea. K League',
  'Eliteserien', 'Norway. Eliteserien',
  'Allsvenskan', 'Sweden. Allsvenskan',
  // ATP 500/250, WTA 500/250
  'ATP 500', 'ATP 250', 'WTA 500', 'WTA 250',
  // Outros europeus
  'Greek Super League', 'Greece. Super League',
  'Russian Premier League', 'Russia. Premier League', 'RPL',
  'Ukrainian Premier League',
  'Danish Superliga', 'Czech First League', 'Croatian First League',
  'Swiss Super League', 'Austria. Bundesliga', 'Switzerland. SuperLeague',
  'Israel. Premier League',
  // Basquete
  'Lega Basket Serie A', 'Germany. Basketball Bundesliga', 'BBL',
  'France. LNB Pro A', 'Pro A',
  'Turkish BSL', 'Adriatic League ABA',
  // Hóquei top europeu
  'KHL', 'Kontinental Hockey League', 'SHL', 'Swedish Hockey League',
  'Liiga', 'Finnish Elite League', 'DEL', 'German Ice Hockey League',
  // Voleibol / Andebol top
  'CEV Champions League Volleyball', 'EHF Champions League Handball',
  // MMA
  'UFC', 'Bellator', 'ONE Championship', 'PFL',
];

/*  Tier P4 — Baixa (40): usa tokens abaixo, mas tb incluímos alguns nomes
    explícitos de primeiras divisões menores europeias / copas nacionais.
    (qualquer coisa que não for P1/P2/P3 e não for amador/regional) */
const TIER_P4: readonly string[] = [
  'League Two', 'League One', 'EFL Cup', 'FA Cup', 'Copa do Brasil',
  'Copa del Rey', 'Copa Italia', 'Coupe de France', 'DFB Pokal', 'Taça de Portugal',
  'KNVB Beker', 'Belgian Cup', 'Spanish Super Cup', 'Italian Super Cup',
  'Community Shield', 'Supercopa do Brasil',
  // Segunda / terceira divisões de países P2/P3
  'Segunda Division', 'Segunda División',
  // Outros primeiros divisões (Américas Central, África, Oceania)
  'Primera Division', 'Paraguay. Primera Division', 'Venezuela. Primera Division',
  'Uruguay. Primera Division', 'Bolivia. Primera Division', 'Peru. Liga 1',
  'Chile. Primera Division', 'Colombia. Liga BetPlay', 'Ecuador. Serie A',
  // Copa Africana de Nações, Asiática
  'AFC Asian Cup', 'CAF Africa Cup', 'Africa Cup of Nations', 'CAN',
  // ATP Challenger / WTA 125
  'ATP Challenger', 'Challenger Tour', 'WTA 125',
  // NCAA — US college sports (são competições profissionais de fato, não amador)
];

// Fallback catch-all: substring match against league name.
function _findByNeedles(nameLower: string, needles: readonly string[]): boolean {
  for (const n of needles) {
    if (n.length === 0) continue;
    if (nameLower.includes(n.toLowerCase())) return true;
  }
  return false;
}

// Negative P5 markers (if ANY matches, force P5 regardless of above).
// These are the categories the user explicitly wants to avoid (fictional, youth,
// amateur, cyber, short-football etc.) — matches the server-side blocklist
// but we keep a copy here so frontend tier labels stay accurate too.
const P5_MARKERS: readonly RegExp[] = [
  /\bu(?:1[6-9]|2[0-5])\b/i,
  /\b(?:women|feminino|ladies|woman)\b|\(w\)/i,
  /cyber/i,
  /short football|division\s*[0-9]*x[0-9]+|socca world cup/i,
  /\b(ncaa|naia|student league|6x6|fifa 23|nba 2k|nhl 26|ipbl|3hl|rhl|tbl)\b/i,
  /table basketball/i,
];

export function getLeagueTier(leagueRaw: string | null | undefined): LeagueTier {
  const raw = String(leagueRaw || '').trim();
  if (!raw) return 'P5';
  const lower = raw.toLowerCase();

  // Force P5 for amateur/youth/fictional first (so "NCAA Women" — which is also in P4
  // positive list — lands at P5 because of the women marker — aligned with user request).
  for (const re of P5_MARKERS) if (re.test(raw)) return 'P5';

  if (_findByNeedles(lower, TIER_P1)) return 'P1';
  if (_findByNeedles(lower, TIER_P2)) return 'P2';
  if (_findByNeedles(lower, TIER_P3)) return 'P3';
  if (_findByNeedles(lower, TIER_P4)) return 'P4';
  // Anything not matched → P4 (we only drop to P5 when negative markers above match)
  return 'P4';
}

export function getLeaguePriority(league: string | null | undefined): number {
  return LEAGUE_TIER_META[getLeagueTier(league)].priority;
}

export function getTierMeta(league: string | null | undefined) {
  return LEAGUE_TIER_META[getLeagueTier(league)];
}

/** Blend proximity bucket interval with league-tier refresh multiplier — used by the
 *  backend prematchProximityTick. Higher-tier leagues always refresh at least as often
 *  as the time bucket alone would imply (e.g. a Champions League 6 hours out does not
 *  wait 15m like every other match, it pulls on the P2 cadence).
 *  Rule: final = min(bucketRefreshEveryMs, tierMeta.defaultRefreshMs)
 *  Explicit match with the spec the user provided: P1 1s, P2 2s, P3 5s, P4 10s, P5 20-30s */
export function blendRefreshInterval(bucketRefreshEveryMs: number, league: string | null | undefined): number {
  const tier = getLeagueTier(league);
  const tierMin = LEAGUE_TIER_META[tier].defaultRefreshMs;
  return Math.min(bucketRefreshEveryMs, tierMin);
}

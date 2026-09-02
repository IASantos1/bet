// ─────────────────────────────────────────────────────────────────────────
// Dynamic market tabs for PulseScore-backed sports (tennis/volleyball/rugby/mma/ice-hockey/
// handball/basketball/baseball)
// ─────────────────────────────────────────────────────────────────────────
// PulseScore market keys carry a per-line/per-period suffix generated server-side
// (server/services/pulsescore.ts: ou_2.5, hcp_-1, game_hcp_-3.5, htft_1s, ...) that a static
// predefined GROUPS list (TENNIS_GROUPS/VOLLEYBALL_GROUPS/RUGBY_GROUPS in ../constants/marketConfig)
// can never fully enumerate — a match with a "1st set total games" line of 9.5 produces a key like
// "total_games_9.5_1s" that no fixed list could have predicted. Soccer's own SubOddsModel.tsx logic
// already solves this by scanning the EVENT'S OWN market keys instead of a fixed list;
// classifyTennisMarket/classifyVolleyballMarket/classifyRugbyMarket + buildDynamicMarketTabs below
// apply that same approach so every market the backend actually sent for a given event gets a tab,
// not just the small hand-picked subset those static GROUPS constants happened to name.
//
// Kept in its own dependency-free module (no React, no '@/shared/*') so it can be unit-tested
// directly against real PulseScore sample data without pulling in the rest of SubOddsModel.tsx.

export type MarketTabGroup = { title: string; keys: string[] };

/** Extracts a "1º Set"/"2º Set"/... bucket title from a PulseScore period-suffixed key ending in
 *  `_1s`..`_5s` (tennis/volleyball sets), or null if the key has no set suffix. */
export function setPeriodBucket(key: string): string | null {
  const m = /_([1-5])s$/.exec(key);
  return m ? `${m[1]}º Set` : null;
}

/** Same as setPeriodBucket but for `_1h`/`_2h` (half) suffixes (soccer/rugby). */
export function halfPeriodBucket(key: string): string | null {
  const m = /_([12])h$/.exec(key);
  if (!m) return null;
  return m[1] === '1' ? '1º Tempo' : '2º Tempo';
}

export const TENNIS_BUCKET_ORDER = ['Vencedor', 'Total de Jogos', 'Handicap', 'Placar Exato', 'Par/Ímpar', 'Totais'];
export function classifyTennisMarket(key: string): string {
  const setBucket = setPeriodBucket(key);
  if (setBucket) return setBucket;
  if (key === 'h2h') return 'Vencedor';
  if (key.startsWith('total_games')) return 'Total de Jogos';
  if (key.startsWith('game_hcp') || key.startsWith('hcp')) return 'Handicap';
  if (key.startsWith('correct_score')) return 'Placar Exato';
  if (key.startsWith('odd_even')) return 'Par/Ímpar';
  if (key.startsWith('ou_')) return 'Totais';
  return 'Especiais';
}

export const VOLLEYBALL_BUCKET_ORDER = ['Vencedor', 'Totais', 'Handicap', 'Placar Exato', 'Par/Ímpar'];
export function classifyVolleyballMarket(key: string): string {
  const setBucket = setPeriodBucket(key);
  if (setBucket) return setBucket;
  if (key === 'h2h') return 'Vencedor';
  if (key.startsWith('ou_')) return 'Totais';
  if (key.startsWith('hcp')) return 'Handicap';
  if (key.startsWith('correct_score')) return 'Placar Exato';
  if (key.startsWith('odd_even')) return 'Par/Ímpar';
  return 'Especiais';
}

export const RUGBY_BUCKET_ORDER = ['Resultados', 'Dupla Chance', 'Totais', 'Handicap', 'HT/FT', 'Corrida até Pontos', 'Par/Ímpar', 'Primeiro a Marcar'];
export function classifyRugbyMarket(key: string): string {
  const halfBucket = halfPeriodBucket(key);
  if (halfBucket) return halfBucket;
  if (key === 'h2h') return 'Resultados';
  if (key.startsWith('dc')) return 'Dupla Chance';
  if (key.startsWith('dnb')) return 'Resultados';
  if (key.startsWith('ou_')) return 'Totais';
  if (key.startsWith('htft')) return 'HT/FT';
  if (key.startsWith('ehcp') || key.startsWith('hcp')) return 'Handicap';
  if (key.startsWith('race_to_points')) return 'Corrida até Pontos';
  if (key.startsWith('odd_even')) return 'Par/Ímpar';
  if (key.startsWith('first_to_score')) return 'Primeiro a Marcar';
  return 'Especiais';
}

// MMA quirk (confirmed in real samples): plain "mma"-league fights (e.g. Muay Thai) carry no
// MATCH_RESULT market at all — only a 2-way "Win (2Way)" market (OTHER canonicalMarket, slugs to
// "win_2way" via the rawName fallback in server/services/pulsescore.ts). It's functionally the
// match-winner market for those fights, so it's bucketed with h2h under "Vencedor" rather than
// falling into "Especiais" alongside genuinely secondary markets like "Fight To Go The Distance".
export const MMA_BUCKET_ORDER = ['Vencedor', 'Dupla Chance', 'Totais'];
export function classifyMmaMarket(key: string): string {
  if (key === 'h2h' || key.startsWith('win_2way')) return 'Vencedor';
  if (key.startsWith('dc')) return 'Dupla Chance';
  if (key.startsWith('ou_')) return 'Totais';
  return 'Especiais';
}

/** Ice hockey period-naming quirk (CONFIRMED in a real sample): unlike every other sport, which
 *  sticks to ONE naming style for its periods, ice hockey mixes FIRST_HALF/SECOND_HALF (periods
 *  1-2, suffix `_1h`/`_2h`) with THIRD_PERIOD (period 3, suffix `_3p`) in the very same match.
 *  setPeriodBucket/halfPeriodBucket only recognize one suffix letter each, so this extracts ANY
 *  trailing numbered-period suffix regardless of its unit letter and labels it uniformly
 *  ("1º Período"/"2º Período"/"3º Período") rather than splitting periods 1-2 into "Tempo" tabs
 *  and period 3 into a differently-named one. */
function periodOrdinalBucket(key: string): string | null {
  const m = /_([1-7])[a-z]$/.exec(key);
  return m ? `${m[1]}º Período` : null;
}

export const ICE_HOCKEY_BUCKET_ORDER = ['Vencedor', 'Dupla Chance', 'Empate Anula Aposta', 'Totais', 'Handicap', 'Ambas Marcam', 'Placar Exato', 'Par/Ímpar', 'Primeiro a Marcar'];
export function classifyIceHockeyMarket(key: string): string {
  const periodBucket = periodOrdinalBucket(key);
  if (periodBucket) return periodBucket;
  if (key === 'h2h') return 'Vencedor';
  if (key.startsWith('dc')) return 'Dupla Chance';
  if (key.startsWith('dnb')) return 'Empate Anula Aposta';
  if (key.startsWith('ou_')) return 'Totais';
  if (key.startsWith('hcp')) return 'Handicap';
  if (key.startsWith('btts')) return 'Ambas Marcam';
  if (key.startsWith('correct_score')) return 'Placar Exato';
  if (key.startsWith('odd_even')) return 'Par/Ímpar';
  if (key.startsWith('first_to_score')) return 'Primeiro a Marcar';
  return 'Especiais';
}

export const HANDBALL_BUCKET_ORDER = ['Vencedor', 'Dupla Chance', 'Empate Anula Aposta', 'Totais', 'Handicap', 'Par/Ímpar'];
export function classifyHandballMarket(key: string): string {
  const halfBucket = halfPeriodBucket(key);
  if (halfBucket) return halfBucket;
  if (key === 'h2h') return 'Vencedor';
  if (key.startsWith('dc')) return 'Dupla Chance';
  if (key.startsWith('dnb')) return 'Empate Anula Aposta';
  if (key.startsWith('ou_')) return 'Totais';
  if (key.startsWith('ehcp') || key.startsWith('hcp')) return 'Handicap';
  if (key.startsWith('odd_even')) return 'Par/Ímpar';
  return 'Especiais';
}

/** Basketball quarter-suffix bucket: matches trailing `_1q`..`_4q` (FIRST_QUARTER..FOURTH_QUARTER).
 *  Kept separate from halfPeriodBucket/periodOrdinalBucket because basketball events (CONFIRMED in
 *  a real single-event sample) carry BOTH half-based markets (FIRST_HALF, suffix `_1h`) AND
 *  quarter-based markets (FIRST_QUARTER, suffix `_1q`) CONCURRENTLY for the same match — unlike ice
 *  hockey, which only ever alternates naming style across different, non-overlapping periods.
 *  Reusing the shared ordinal-only periodOrdinalBucket here would incorrectly merge a "1st half"
 *  market and a "1st quarter" market into the same tab. */
export function quarterPeriodBucket(key: string): string | null {
  const m = /_([1-4])q$/.exec(key);
  return m ? `${m[1]}º Quarto` : null;
}

export const BASKETBALL_BUCKET_ORDER = ['Vencedor', 'Dupla Chance', 'Empate Anula Aposta', 'Totais', 'Handicap', 'Corrida até Pontos', 'Par/Ímpar'];
export function classifyBasketballMarket(key: string): string {
  const halfBucket = halfPeriodBucket(key);
  if (halfBucket) return halfBucket;
  const quarterBucket = quarterPeriodBucket(key);
  if (quarterBucket) return quarterBucket;
  if (key === 'h2h') return 'Vencedor';
  if (key.startsWith('dc') || key.startsWith('regular_time_double_chance')) return 'Dupla Chance';
  if (key.startsWith('dnb')) return 'Empate Anula Aposta';
  if (key.startsWith('ou_')) return 'Totais';
  if (key.startsWith('ehcp') || key.startsWith('hcp')) return 'Handicap';
  if (key.startsWith('race_to_points')) return 'Corrida até Pontos';
  if (key.startsWith('odd_even')) return 'Par/Ímpar';
  return 'Especiais';
}

/** Baseball's "innings" period suffixes (CONFIRMED in a real sample): periodSuffix() in
 *  server/services/pulsescore.ts turns FIRST_INNING/SECOND_INNING/.../NINTH_INNING into `_1i`.._9i`,
 *  and the "first 5 innings" market (FIRST_FIVE_INNINGS, a shape unique to baseball that doesn't fit
 *  the generic ordinal_unit pattern) into a distinct `_f5i` suffix — this extracts either into its
 *  own bucket title. */
export function inningPeriodBucket(key: string): string | null {
  if (key.endsWith('_f5i')) return 'Primeiras 5 Innings';
  const m = /_([1-9])i$/.exec(key);
  return m ? `${m[1]}º Inning` : null;
}

// Baseball quirk (CONFIRMED in a real single-event sample): a large block of individual
// player-prop markets (canonicalMarket OTHER, rawName always prefixed "Players' stats
// Pitchers."/"Players' stats Batters.") slug via the rawName fallback in
// server/services/pulsescore.ts to keys reliably starting with "players_stats" — bucketed together
// under their own tab rather than scattered across "Especiais" alongside genuinely miscellaneous
// markets like "First Home Run" or "Highest Scoring Inning".
export const BASEBALL_BUCKET_ORDER = ['Vencedor', 'Dupla Chance', 'Empate Anula Aposta', 'Totais', 'Handicap', 'Par/Ímpar', 'Estatísticas de Jogadores'];
export function classifyBaseballMarket(key: string): string {
  const inningBucket = inningPeriodBucket(key);
  if (inningBucket) return inningBucket;
  if (key === 'h2h') return 'Vencedor';
  if (key.startsWith('dc')) return 'Dupla Chance';
  if (key.startsWith('dnb')) return 'Empate Anula Aposta';
  if (key.startsWith('ou_')) return 'Totais';
  if (key.startsWith('hcp')) return 'Handicap';
  if (key.startsWith('odd_even')) return 'Par/Ímpar';
  if (key.startsWith('players_stats')) return 'Estatísticas de Jogadores';
  return 'Especiais';
}

/** Buckets `keys` via `classify`, orders named buckets per `bucketOrder` (any bucket discovered
 *  dynamically but not in that list — e.g. "3º Set" in a match that went the distance — is appended
 *  before the "Especiais" catch-all), and builds a "Todos" tab deduped by title (mirrors soccer's
 *  own dedupe-by-title logic in SubOddsModel.tsx, so a market that resolves to the same display
 *  title as another doesn't show twice under "Todos"). */
export function buildDynamicMarketTabs(
  keys: string[],
  classify: (key: string) => string,
  bucketOrder: string[],
  getTitle: (key: string) => string,
): MarketTabGroup[] {
  const buckets = new Map<string, string[]>();
  for (const k of keys) {
    const b = classify(k);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(k);
  }
  const named = new Set(bucketOrder);
  const dynamicExtra = Array.from(buckets.keys()).filter((b) => !named.has(b) && b !== 'Especiais').sort();
  const fullOrder = [...bucketOrder, ...dynamicExtra, 'Especiais'];

  const allOrdered = fullOrder.flatMap((b) => buckets.get(b) || []);
  const seenTitles = new Set<string>();
  const todos: string[] = [];
  for (const k of allOrdered) {
    const t = getTitle(k).toLowerCase().trim();
    if (seenTitles.has(t)) continue;
    seenTitles.add(t);
    todos.push(k);
  }

  const tabs: MarketTabGroup[] = [{ title: 'Todos', keys: todos }];
  for (const b of fullOrder) {
    const ks = buckets.get(b);
    if (ks && ks.length > 0) tabs.push({ title: b, keys: ks });
  }
  return tabs;
}

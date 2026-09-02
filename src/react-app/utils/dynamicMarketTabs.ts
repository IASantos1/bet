// ─────────────────────────────────────────────────────────────────────────
// Dynamic market tabs for PulseScore-backed sports (tennis/volleyball/rugby)
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

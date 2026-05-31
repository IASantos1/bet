import { Market } from '@/shared/types';

export function freezeMarkets(
  markets: Market[], 
  reason: Market['suspended_reason']
): Market[] {
  return markets.map(m => ({
    ...m,
    suspended: true,
    suspended_reason: reason,
    selections: m.selections.map(s => ({
      ...s,
      suspended: true
    }))
  }));
}

export function unfreezeWithNewOdds(
  markets: Market[],
  newMarkets: Market[]
): Market[] {
  // Map new markets by key for easy lookup
  const newMarketsMap = new Map(newMarkets.map(m => [m.key, m]));

  return markets.map(m => {
    const newMarket = newMarketsMap.get(m.key);
    
    // Only unfreeze if we have new odds/data for this market
    if (newMarket) {
        return {
            ...newMarket,
            suspended: false,
            suspended_reason: undefined,
            selections: newMarket.selections.map(s => ({
                ...s,
                suspended: false
            }))
        };
    }
    
    // Otherwise keep it suspended (safety first)
    return m;
  });
}


import { useState, useEffect, useMemo } from 'react';
import { OddButton } from '../base/OddButton';
import { useSportsOdds } from '../../hooks/useSportsOdds';

interface ExpandedMarketsModalProps {
  match: any;
  isOpen: boolean;
  onClose: () => void;
  onSelectOdd?: (bet: any) => void;
  inline?: boolean;
}

export function ExpandedMarketsModal({
  match,
  isOpen,
  onClose,
  onSelectOdd: _onSelectOdd,
  inline = false,
}: ExpandedMarketsModalProps) {
  const [selectedCategory, setSelectedCategory] = useState('popular');
  const [specialMarkets, setSpecialMarkets] = useState<any[]>([]);
  const [loadingSpecial, setLoadingSpecial] = useState(false);
  const { getOddsForMatch } = useSportsOdds();

  // Guard against missing match or id
  const odds = useMemo(() => {
    if (!match?.id) return null;
    try {
      return getOddsForMatch(match.id);
    } catch (err) {
      console.error('Error fetching odds:', err);
      return null;
    }
  }, [match?.id, getOddsForMatch]);

  const categorizedMarkets = useMemo(() => {
    if (!odds?.markets) return { popular: [], goals: [], special: [] };

    const popular = odds.markets.filter((m: any) =>
      ['h2h', 'match_winner', 'spreads', 'totals'].includes(m.key)
    );

    const goals = odds.markets.filter((m: any) =>
      m.key.includes('goal') ||
      m.key.includes('total') ||
      m.key.includes('over_under')
    );

    const special = odds.markets.filter((m: any) =>
      !popular.includes(m) && !goals.includes(m)
    );

    return { popular, goals, special };
  }, [odds]);

  const handleCategoryChange = async (category: string) => {
    setSelectedCategory(category);

    if (category === 'special' && specialMarkets.length === 0 && !loadingSpecial) {
      setLoadingSpecial(true);
      try {
        const markets = await fetchSpecialMarkets(match.id);
        setSpecialMarkets(markets);
      } catch (err) {
        console.error('Erro ao buscar mercados especiais:', err);
      } finally {
        setLoadingSpecial(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setSelectedCategory('popular');
      setSpecialMarkets([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentMarkets =
    categorizedMarkets[selectedCategory as keyof typeof categorizedMarkets] ||
    [];

  // Inline mode
  if (inline) {
    return (
      <div className="w-full">
        {/* Match Header */}
        <div className="bg-gray-900/70 border border-gray-800/60 rounded-lg p-3 md:p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {match.isLive && (
                <span className="flex items-center gap-1 bg-red-500/20 text-red-400 text-[8px] font-bold px-2 py-0.5 rounded-full">
                  <span className="w-1 h-1 bg-red-400 rounded-full animate-pulse"></span>
                  AO VIVO
                </span>
              )}
              <span className="text-amber-500/70 text-[10px] font-medium">{match.league}</span>
            </div>
            {match.isLive && match.homeScore !== undefined && (
              <span className="text-white font-black text-base">
                {match.homeScore} - {match.awayScore}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <p className="text-white font-bold text-xs md:text-sm">{match.homeTeam}</p>
              <p className="text-gray-400 font-semibold text-xs md:text-sm">{match.awayTeam}</p>
            </div>
            {!match.isLive && match.time && (
              <div className="text-right">
                <p className="text-amber-400 font-bold text-xs">{match.time}</p>
                {match.startTime && (
                  <p className="text-gray-500 text-[9px]">
                    {new Date(match.startTime).toLocaleDateString('pt-PT', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {[
            { key: 'popular', label: 'Popular', icon: 'ri-star-line' },
            { key: 'goals', label: 'Golos', icon: 'ri-football-line' },
            { key: 'special', label: 'Especiais', icon: 'ri-magic-line' },
          ].map((cat) => (
            <button
              key={cat.key}
              onClick={() => handleCategoryChange(cat.key)}
              className={`flex items-center gap-1 px-2.5 md:px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-semibold whitespace-nowrap cursor-pointer transition-all
                ${
                  selectedCategory === cat.key
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                    : 'bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-gray-300 border border-gray-700/50'
                }`}
            >
              <i className={`${cat.icon} text-[10px] md:text-xs`}></i>
              {cat.label}
              <span
                className={`ml-0.5 text-[8px] px-1 py-0.5 rounded-full ${
                  selectedCategory === cat.key ? 'bg-white/20' : 'bg-gray-700/60'
                }`}
              >
                {categorizedMarkets[cat.key as keyof typeof categorizedMarkets]?.length || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Markets List */}
        <div className="space-y-2">
          {currentMarkets.map((market: any) => (
            <div
              key={market.key}
              className="bg-gray-900/50 border border-gray-800/50 rounded-lg p-2.5 md:p-3"
            >
              <h3 className="text-[10px] font-bold text-amber-400/80 mb-2 uppercase tracking-wider">
                {market.key.replace(/_/g, ' ')}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                {market.outcomes?.map((outcome: any) => (
                  <OddButton
                    key={outcome.name}
                    label={outcome.name}
                    odd={outcome.price}
                    matchId={String(match.id)}
                  />
                ))}
              </div>
            </div>
          ))}

          {loadingSpecial && selectedCategory === 'special' && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}

          {currentMarkets.length === 0 && !loadingSpecial && (
            <div className="text-center py-10">
              <div className="w-10 h-10 flex items-center justify-center bg-gray-800/30 rounded-xl mx-auto mb-2">
                <i className="ri-information-line text-xl text-gray-700"></i>
              </div>
              <p className="text-gray-500 text-xs font-medium">Nenhum mercado disponível</p>
              <p className="text-gray-600 text-[10px] mt-0.5">Tente outra categoria</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback: overlay modal
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-gray-950 border border-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-3 md:p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm md:text-base font-bold text-white">Todos os Mercados</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-lg text-gray-400"></i>
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-amber-500/70 mb-0.5">{match.league}</p>
              <p className="font-semibold text-white text-xs">
                {match.homeTeam} vs {match.awayTeam}
              </p>
            </div>
            {match.isLive && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-400">
                <span className="w-1 h-1 bg-red-400 rounded-full animate-pulse"></span>
                AO VIVO
              </span>
            )}
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-1.5 px-3 md:px-4 py-2 border-b border-gray-800 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {[
            { key: 'popular', label: 'Popular' },
            { key: 'goals', label: 'Golos' },
            { key: 'special', label: 'Especiais' },
          ].map((cat) => (
            <button
              key={cat.key}
              onClick={() => handleCategoryChange(cat.key)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold whitespace-nowrap cursor-pointer transition-all
                ${
                  selectedCategory === cat.key
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
            >
              {cat.label} ({categorizedMarkets[cat.key as keyof typeof categorizedMarkets]?.length || 0})
            </button>
          ))}
        </div>

        {/* Markets */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4">
          <div className="space-y-2.5">
            {currentMarkets.map((market: any) => (
              <div
                key={market.key}
                className="bg-gray-900/50 border border-gray-800/50 rounded-lg p-2.5 md:p-3"
              >
                <h3 className="text-[10px] font-bold text-amber-400/80 mb-2 uppercase tracking-wider">
                  {market.key.replace(/_/g, ' ')}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  {market.outcomes?.map((outcome: any) => (
                    <OddButton
                      key={outcome.name}
                      label={outcome.name}
                      odd={outcome.price}
                      matchId={String(match.id)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {currentMarkets.length === 0 && (
              <div className="text-center py-8">
                <i className="ri-information-line text-2xl text-gray-700 mb-1.5"></i>
                <p className="text-gray-500 text-xs">Nenhum mercado disponível</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Mock implementation – replace with real API call when available
async function fetchSpecialMarkets(_matchId: string): Promise<any[]> {
  try {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 300));
    // Return empty array as placeholder
    return [];
  } catch (err) {
    console.error('Failed to fetch special markets:', err);
    return [];
  }
}

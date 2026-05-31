import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import MatchMarkets from './MatchMarkets';
import MatchStatsDashboard from './MatchStatsDashboard';
import MatchStandings from './MatchStandings';

type MarketsCategory = 'resultado' | 'total_gols' | 'escanteios' | 'handicap' | 'ambas_marcam';
type ActiveTab = 'mercados' | 'stats';
type StatsTab = 'resultados' | 'classificações';

export default function MatchMarketsModal({
  match,
  isOpen,
  onClose,
  initialCategory = 'resultado',
  onAddSelection,
  isSelected,
}: {
  match: any;
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: MarketsCategory;
  onAddSelection: (selection: string, odd: number, market: string) => void;
  isSelected: (selection: string) => boolean;
}) {
  const { theme } = useTheme();
  const [category, setCategory] = useState<MarketsCategory>(initialCategory);
  const [activeTab, setActiveTab] = useState<ActiveTab>('mercados');
  const [statsTab, setStatsTab] = useState<StatsTab>('resultados');

  useEffect(() => {
    if (!isOpen) return;
    setCategory(initialCategory);
    setActiveTab('mercados');
    setStatsTab('resultados');
  }, [isOpen, initialCategory]);

  const subtitle = useMemo(() => {
    if (match?.isLive) return 'Ao vivo';
    const time = match?.time ? String(match.time) : '';
    if (time) return `Hoje • ${time}`;
    return 'Hoje';
  }, [match]);

  if (!isOpen) return null;

  const categoryTabs: Array<{ key: MarketsCategory; label: string }> = [
    { key: 'resultado', label: 'Resultado' },
    { key: 'total_gols', label: 'Total de Gols' },
    { key: 'escanteios', label: 'Escanteios' },
    { key: 'handicap', label: 'Handicap' },
    { key: 'ambas_marcam', label: 'Ambas Marcam' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className={`w-full sm:max-w-4xl max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border flex flex-col ${
          theme === 'dark' ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-white'
        }`}
      >
        <div className={`px-4 py-3 border-b ${theme === 'dark' ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0 flex items-center justify-center gap-3">
              <span className={`text-sm sm:text-base font-semibold truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {match?.homeTeam || 'Time A'}
              </span>
              <button
                onClick={() => setActiveTab((prev) => (prev === 'mercados' ? 'stats' : 'mercados'))}
                className={`w-9 h-9 rounded-full border flex items-center justify-center cursor-pointer transition ${
                  activeTab === 'stats'
                    ? 'bg-red-600 border-red-500 text-white'
                    : theme === 'dark'
                      ? 'bg-gray-900 hover:bg-gray-800 border-gray-800 text-white'
                      : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-900'
                }`}
                title={activeTab === 'stats' ? 'Voltar aos Mercados' : 'Estatísticas'}
              >
                <i className="ri-bar-chart-box-line text-lg"></i>
              </button>
              <span className={`text-sm sm:text-base font-semibold truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {match?.awayTeam || 'Time B'}
              </span>
            </div>

            <button
              onClick={onClose}
              className={`w-9 h-9 rounded-lg border flex items-center justify-center cursor-pointer transition ${
                theme === 'dark' ? 'bg-gray-900 hover:bg-gray-800 border-gray-800' : 'bg-white hover:bg-gray-50 border-gray-200'
              }`}
              aria-label="Fechar"
            >
              <i className={`ri-close-line text-xl ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}></i>
            </button>
          </div>

          <p className={`text-center text-xs mt-2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>{subtitle}</p>

          <div className="flex justify-center gap-4 mt-3 overflow-x-auto pb-2 scrollbar-hide">
            {categoryTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setCategory(t.key)}
                className={`text-sm whitespace-nowrap pb-2 transition-all cursor-pointer ${
                  category === t.key
                    ? theme === 'dark'
                      ? 'text-white border-b-2 border-red-500'
                      : 'text-gray-900 border-b-2 border-red-600'
                    : theme === 'dark'
                      ? 'text-gray-400 hover:text-white'
                      : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {activeTab === 'mercados' && (
            <MatchMarkets match={match} onAddSelection={onAddSelection} isSelected={isSelected} activeCategory={category} />
          )}

          {activeTab === 'stats' && (
            <div className="space-y-6">
              <div className="flex justify-center gap-4">
                {(['Resultados', 'Classificações'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setStatsTab(tab.toLowerCase() as StatsTab)}
                    className={`px-4 py-1 text-sm rounded-t-lg transition cursor-pointer ${
                      statsTab === (tab.toLowerCase() as StatsTab)
                        ? 'bg-red-600 text-white'
                        : theme === 'dark'
                          ? 'bg-gray-900 text-gray-400 hover:text-white'
                          : 'bg-gray-100 text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {statsTab === 'resultados' && (
                <MatchStatsDashboard match={match} onOpenMarkets={() => setActiveTab('mercados')} />
              )}

              {statsTab === 'classificações' && (
                <MatchStandings match={match} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

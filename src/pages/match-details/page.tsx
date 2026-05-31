import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '../../components/feature/Header';
import { Footer } from '../../components/feature/Footer';
import { MobileBottomNav } from '../../components/feature/MobileBottomNav';
import { useTheme } from '../../contexts/ThemeContext';
import { useLiveMatches } from '../../hooks/useLiveMatches';
import { useUpcomingMatches } from '../../hooks/useUpcomingMatches';
import { useLiveEventsConnector } from '../../hooks/useLiveEventsConnector';
import { SkeletonLoader } from '../../components/base/SkeletonLoader';

// ✅ LAZY LOADING: Componentes pesados carregam sob demanda
const MatchStatsDashboard = lazy(() => import('./components/MatchStatsDashboard'));
const MatchMarketsModal = lazy(() => import('./components/MatchMarketsModal'));

/**
 * @typedef {Object} BetSelection
 * @property {number} id
 * @property {string} homeTeam
 * @property {string} awayTeam
 * @property {string} selection
 * @property {number} odd
 * @property {string} league
 * @property {string} [market]
 * @property {string} [matchId]
 */

export default function MatchDetailsPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const [toasts, setToasts] = useState([]);
  const [selections, setSelections] = useState<any[]>([]);
  const [marketsOpen, setMarketsOpen] = useState(false);

  // Conectar à API de eventos ao vivo
  const { lastEvent } = useLiveEventsConnector(true);

  // ✅ PRÉ-CARREGAMENTO: Buscar dados críticos primeiro
  const { matches: liveMatches, loading: loadingLive } = useLiveMatches({
    autoRefresh: true,
    interval: 5000,
  });
  const { matches: upcomingMatches, loading: loadingUpcoming } = useUpcomingMatches({
    autoRefresh: true,
    interval: 30000,
  });

  const [fallbackMatch, setFallbackMatch] = useState<any | null>(null);

  const match = useMemo(() => {
    const allMatches = [...(liveMatches || []), ...(upcomingMatches || [])];
    const found = allMatches.find((m) => String(m.id) === matchId);

    if (!found) {
      console.log(`⚠️ Jogo ${matchId} não encontrado nas listagens`);
    } else {
      console.log(
        `✅ Jogo encontrado: ${found.homeTeam} vs ${found.awayTeam}`,
        {
          status: found.status,
          score: `${found.homeScore} - ${found.awayScore}`,
          minute: found.minute || found.status?.elapsed,
        }
      );
    }

    return found;
  }, [liveMatches, upcomingMatches, matchId]);

  useEffect(() => {
    let cancelled = false;
    async function fetchFallback() {
      if (match || !matchId) return;
      try {
        const mod = await import('../../services/sportsDataHub');
        const details = await mod.getMatchDetails(String(matchId));
        if (!cancelled) setFallbackMatch(details);
      } catch {
        if (!cancelled) setFallbackMatch(null);
      }
    }
    fetchFallback();
    return () => {
      cancelled = true;
    };
  }, [match, matchId]);

  const resolvedMatch = match || fallbackMatch;

  const isLive = useMemo(() => {
    return !!liveMatches?.some((m) => String(m.id) === matchId);
  }, [liveMatches, matchId]);

  const showToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2000);
  }, []);

  useEffect(() => {
    if (lastEvent && lastEvent.matchId === matchId) {
      if (lastEvent.type === 'VAR_STARTED') {
        showToast('⚠️ VAR em análise');
      } else if (lastEvent.type === 'VAR_ENDED') {
        showToast('✅ VAR concluído');
      } else if (lastEvent.type === 'GOAL') {
        showToast('⚽ GOLO!');
      }
    }
  }, [lastEvent, matchId, showToast]);

  const isSelected = useCallback(
    (selection: string) => {
      if (!resolvedMatch) return false;
      return selections.some(
        (s) =>
          s.homeTeam === resolvedMatch.homeTeam &&
          s.awayTeam === resolvedMatch.awayTeam &&
          s.selection === selection,
      );
    },
    [resolvedMatch, selections],
  );

  const handleAddSelection = useCallback(
    (selection: string, odd: number, marketName: string) => {
      if (!resolvedMatch) return;
      const exists = selections.some(
        (s) =>
          s.homeTeam === resolvedMatch.homeTeam &&
          s.awayTeam === resolvedMatch.awayTeam &&
          s.selection === selection,
      );
      if (exists) {
        showToast('Já no boletim!');
        return;
      }
      setSelections((prev) => [
        ...prev,
        {
          id: Date.now(),
          homeTeam: resolvedMatch.homeTeam,
          awayTeam: resolvedMatch.awayTeam,
          selection,
          odd,
          league: resolvedMatch.league,
          market: marketName,
          matchId: String(resolvedMatch.id || resolvedMatch.fixtureId || ''),
        },
      ]);
      showToast('Adicionado ao boletim!');
    },
    [resolvedMatch, selections, showToast],
  );

  const isLoading = loadingLive || loadingUpcoming;

  // ✅ SKELETON LOADER enquanto carrega
  if (isLoading && !match) {
    return (
      <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-950' : 'bg-gray-100'}`}>
        <Header activeTab="sports" onSportsClick={() => {}} onLiveClick={() => {}} />
        <div className="pt-14 lg:pt-16 px-3 py-4">
          <SkeletonLoader type="card" count={1} />
          <div className="mt-4">
            <SkeletonLoader type="market" count={3} />
          </div>
        </div>
      </div>
    );
  }

  if (!match && !isLoading) {
    return (
      <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-950' : 'bg-gray-100'}`}>
        <Header activeTab="sports" onSportsClick={() => {}} onLiveClick={() => {}} />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <i className="ri-error-warning-line text-6xl text-amber-500 mb-4"></i>
            <p
              className={`font-semibold text-lg mb-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}
            >
              Jogo não encontrado
            </p>
            <p
              className={`text-sm mb-4 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Este jogo pode ter terminado ou não está mais disponível
            </p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg cursor-pointer transition-colors whitespace-nowrap"
            >
              Voltar à página inicial
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-950' : 'bg-gray-100'}`}>
      <Header activeTab={isLive ? 'live' : 'sports'} onSportsClick={() => {}} onLiveClick={() => {}} />
      <main className="pt-14 lg:pt-16 pb-20 lg:pb-8">
        {/* Back Button */}
        <div className="px-3 py-2">
          <button
            onClick={() => navigate(-1)}
            className={`flex items-center gap-1.5 px-3 py-2 ${
              theme === 'dark'
                ? 'bg-gray-800/80 hover:bg-gray-700 text-white border-gray-700/50'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300'
            } text-xs font-semibold rounded-lg cursor-pointer transition-colors border whitespace-nowrap`}
          >
            <i className="ri-arrow-left-line text-sm"></i>
            Voltar
          </button>
        </div>

        <div className="px-3 py-4">
          <Suspense fallback={<SkeletonLoader type="stats" count={1} />}>
            <MatchStatsDashboard match={resolvedMatch} onOpenMarkets={() => setMarketsOpen(true)} />
          </Suspense>
        </div>

        <Suspense fallback={null}>
          <MatchMarketsModal
            match={resolvedMatch}
            isOpen={marketsOpen}
            onClose={() => setMarketsOpen(false)}
            onAddSelection={handleAddSelection}
            isSelected={isSelected}
          />
        </Suspense>

        <Footer />
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        onHomeClick={() => navigate('/')}
        onLiveClick={() => navigate('/')}
      />

      {/* Toasts */}
      <div className="fixed top-14 right-2 z-50 space-y-1.5 max-w-xs">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`${theme === 'dark' ? 'bg-gray-800 border-amber-500/30' : 'bg-white border-amber-300'} border px-3 py-2 rounded-lg shadow-2xl animate-slide-in-right`}
          >
            <div className="flex items-center gap-1.5">
              <i className="ri-check-circle-fill text-amber-400 text-xs"></i>
              <span className={`text-[10px] font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-700'}`}>
                {toast.message}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

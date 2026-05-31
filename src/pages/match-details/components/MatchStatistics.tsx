import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { 
  fetchMultiSportStats, 
  detectSportType, 
  extractGameId,
  type SportType,
  type StatItem 
} from '../../../services/multiSportStatsApi';
import { apiFetch } from '../../../services/backendClient';

interface MatchStatisticsProps {
  match: any;
  isLive: boolean;
}

// Interface para classificação
interface StandingTeam {
  rank: number;
  teamId: number;
  teamName: string;
  teamLogo: string;
  points: number;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  form?: string;
}

// Nomes dos desportos em português
const sportNames: Record<SportType, string> = {
  football: 'Futebol',
  basketball: 'Basquetebol',
  hockey: 'Hóquei',
  baseball: 'Basebol',
  rugby: 'Rúgbi',
  volleyball: 'Vôlei',
  mma: 'MMA',
  handball: 'Andebol',
  afl: 'AFL',
  formula1: 'Fórmula 1',
};

const createSeededRandom = (key: string) => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return () => {
    hash = (hash * 9301 + 49297) % 233280;
    return hash / 233280;
  };
};

const getMockStats = (sport: SportType, match: any): StatItem[] => {
  const key = `${sport}-${match?.id ?? match?.fixtureId ?? ''}-${match?.homeTeam ?? ''}-${match?.awayTeam ?? ''}`;
  const rand = createSeededRandom(key);
  switch (sport) {
    case 'football':
      return [
        { name: 'Posse de Bola', home: Math.floor(rand() * 30) + 35, away: 0, icon: 'ri-pie-chart-line', isPercentage: true },
        { name: 'Remates', home: Math.floor(rand() * 12) + 3, away: Math.floor(rand() * 12) + 3, icon: 'ri-focus-3-line' },
        { name: 'Remates à Baliza', home: Math.floor(rand() * 6) + 1, away: Math.floor(rand() * 6) + 1, icon: 'ri-crosshair-2-line' },
        { name: 'Cantos', home: Math.floor(rand() * 8), away: Math.floor(rand() * 8), icon: 'ri-flag-line' },
        { name: 'Faltas', home: Math.floor(rand() * 15) + 5, away: Math.floor(rand() * 15) + 5, icon: 'ri-error-warning-line' },
        { name: 'Cartões Amarelos', home: Math.floor(rand() * 4), away: Math.floor(rand() * 4), icon: 'ri-rectangle-fill' },
        { name: 'Foras de Jogo', home: Math.floor(rand() * 5), away: Math.floor(rand() * 5), icon: 'ri-user-forbid-line' },
        { name: 'Passes', home: Math.floor(rand() * 300) + 200, away: Math.floor(rand() * 300) + 200, icon: 'ri-share-forward-line' },
      ].map(s => s.name === 'Posse de Bola' ? { ...s, away: 100 - s.home } : s);

    case 'basketball':
      return [
        { name: 'Pontos Q1', home: Math.floor(rand() * 15) + 20, away: Math.floor(rand() * 15) + 20, icon: 'ri-basketball-line' },
        { name: 'Pontos Q2', home: Math.floor(rand() * 15) + 20, away: Math.floor(rand() * 15) + 20, icon: 'ri-basketball-line' },
        { name: 'Ressaltos', home: Math.floor(rand() * 20) + 25, away: Math.floor(rand() * 20) + 25, icon: 'ri-arrow-up-circle-line' },
        { name: 'Assistências', home: Math.floor(rand() * 15) + 10, away: Math.floor(rand() * 15) + 10, icon: 'ri-hand-heart-line' },
        { name: 'Roubos', home: Math.floor(rand() * 8) + 2, away: Math.floor(rand() * 8) + 2, icon: 'ri-hand-coin-line' },
        { name: 'Bloqueios', home: Math.floor(rand() * 6) + 1, away: Math.floor(rand() * 6) + 1, icon: 'ri-shield-line' },
        { name: 'Turnovers', home: Math.floor(rand() * 10) + 5, away: Math.floor(rand() * 10) + 5, icon: 'ri-refresh-line' },
        { name: '% Lançamentos', home: Math.floor(rand() * 20) + 40, away: Math.floor(rand() * 20) + 40, icon: 'ri-percent-line', isPercentage: true },
      ];

    case 'hockey':
      return [
        { name: 'Remates', home: Math.floor(rand() * 20) + 15, away: Math.floor(rand() * 20) + 15, icon: 'ri-focus-3-line' },
        { name: 'Defesas', home: Math.floor(rand() * 20) + 10, away: Math.floor(rand() * 20) + 10, icon: 'ri-shield-line' },
        { name: 'Power Plays', home: Math.floor(rand() * 5), away: Math.floor(rand() * 5), icon: 'ri-flashlight-line' },
        { name: 'Penalidades', home: Math.floor(rand() * 8) + 2, away: Math.floor(rand() * 8) + 2, icon: 'ri-error-warning-line' },
        { name: 'Face-offs Ganhos', home: Math.floor(rand() * 30) + 20, away: Math.floor(rand() * 30) + 20, icon: 'ri-refresh-line' },
        { name: 'Hits', home: Math.floor(rand() * 25) + 10, away: Math.floor(rand() * 25) + 10, icon: 'ri-boxing-line' },
        { name: 'Bloqueios', home: Math.floor(rand() * 15) + 5, away: Math.floor(rand() * 15) + 5, icon: 'ri-shield-cross-line' },
      ];

    case 'baseball':
      return [
        { name: 'Corridas', home: Math.floor(rand() * 8), away: Math.floor(rand() * 8), icon: 'ri-run-line' },
        { name: 'Rebatidas', home: Math.floor(rand() * 12) + 3, away: Math.floor(rand() * 12) + 3, icon: 'ri-baseball-line' },
        { name: 'Erros', home: Math.floor(rand() * 3), away: Math.floor(rand() * 3), icon: 'ri-error-warning-line' },
        { name: 'Home Runs', home: Math.floor(rand() * 3), away: Math.floor(rand() * 3), icon: 'ri-home-line' },
        { name: 'RBIs', home: Math.floor(rand() * 6), away: Math.floor(rand() * 6), icon: 'ri-user-add-line' },
        { name: 'Strikeouts', home: Math.floor(rand() * 10) + 3, away: Math.floor(rand() * 10) + 3, icon: 'ri-close-circle-line' },
        { name: 'Walks', home: Math.floor(rand() * 5), away: Math.floor(rand() * 5), icon: 'ri-walk-line' },
      ];

    case 'rugby':
      return [
        { name: 'Tries', home: Math.floor(rand() * 5), away: Math.floor(rand() * 5), icon: 'ri-rugby-line' },
        { name: 'Conversões', home: Math.floor(rand() * 5), away: Math.floor(rand() * 5), icon: 'ri-check-double-line' },
        { name: 'Penalidades', home: Math.floor(rand() * 4), away: Math.floor(rand() * 4), icon: 'ri-error-warning-line' },
        { name: 'Tackles', home: Math.floor(rand() * 80) + 60, away: Math.floor(rand() * 80) + 60, icon: 'ri-shield-line' },
        { name: 'Metros Ganhos', home: Math.floor(rand() * 200) + 150, away: Math.floor(rand() * 200) + 150, icon: 'ri-ruler-line' },
        { name: 'Passes', home: Math.floor(rand() * 100) + 80, away: Math.floor(rand() * 100) + 80, icon: 'ri-share-forward-line' },
        { name: 'Turnovers', home: Math.floor(rand() * 10) + 5, away: Math.floor(rand() * 10) + 5, icon: 'ri-refresh-line' },
      ];

    case 'volleyball':
      return [
        { name: 'Pontos Set 1', home: Math.floor(rand() * 10) + 20, away: Math.floor(rand() * 10) + 20, icon: 'ri-volleyball-line' },
        { name: 'Pontos Set 2', home: Math.floor(rand() * 10) + 20, away: Math.floor(rand() * 10) + 20, icon: 'ri-volleyball-line' },
        { name: 'Aces', home: Math.floor(rand() * 8) + 2, away: Math.floor(rand() * 8) + 2, icon: 'ri-star-line' },
        { name: 'Bloqueios', home: Math.floor(rand() * 10) + 5, away: Math.floor(rand() * 10) + 5, icon: 'ri-shield-line' },
        { name: 'Ataques', home: Math.floor(rand() * 40) + 30, away: Math.floor(rand() * 40) + 30, icon: 'ri-sword-line' },
        { name: 'Erros', home: Math.floor(rand() * 15) + 5, away: Math.floor(rand() * 15) + 5, icon: 'ri-error-warning-line' },
      ];

    case 'mma':
      return [
        { name: 'Golpes Totais', home: Math.floor(rand() * 80) + 30, away: Math.floor(rand() * 80) + 30, icon: 'ri-boxing-line' },
        { name: 'Golpes Significativos', home: Math.floor(rand() * 50) + 20, away: Math.floor(rand() * 50) + 20, icon: 'ri-fire-line' },
        { name: 'Takedowns', home: Math.floor(rand() * 5), away: Math.floor(rand() * 5), icon: 'ri-arrow-down-circle-line' },
        { name: 'Submissões Tent.', home: Math.floor(rand() * 3), away: Math.floor(rand() * 3), icon: 'ri-lock-line' },
        { name: 'Controlo (seg)', home: Math.floor(rand() * 120) + 30, away: Math.floor(rand() * 120) + 30, icon: 'ri-time-line' },
        { name: 'Golpes Cabeça', home: Math.floor(rand() * 40) + 15, away: Math.floor(rand() * 40) + 15, icon: 'ri-user-line' },
      ];

    case 'handball':
      return [
        { name: 'Golos 1ª Parte', home: Math.floor(rand() * 10) + 10, away: Math.floor(rand() * 10) + 10, icon: 'ri-basketball-line' },
        { name: 'Golos 2ª Parte', home: Math.floor(rand() * 10) + 10, away: Math.floor(rand() * 10) + 10, icon: 'ri-basketball-line' },
        { name: 'Remates', home: Math.floor(rand() * 20) + 20, away: Math.floor(rand() * 20) + 20, icon: 'ri-focus-3-line' },
        { name: 'Defesas', home: Math.floor(rand() * 10) + 5, away: Math.floor(rand() * 10) + 5, icon: 'ri-shield-line' },
        { name: '% Eficácia', home: Math.floor(rand() * 20) + 50, away: Math.floor(rand() * 20) + 50, icon: 'ri-percent-line', isPercentage: true },
        { name: 'Faltas', home: Math.floor(rand() * 10) + 5, away: Math.floor(rand() * 10) + 5, icon: 'ri-error-warning-line' },
      ];

    case 'afl':
      return [
        { name: 'Goals', home: Math.floor(rand() * 10) + 8, away: Math.floor(rand() * 10) + 8, icon: 'ri-football-line' },
        { name: 'Behinds', home: Math.floor(rand() * 8) + 4, away: Math.floor(rand() * 8) + 4, icon: 'ri-subtract-line' },
        { name: 'Disposals', home: Math.floor(rand() * 100) + 250, away: Math.floor(rand() * 100) + 250, icon: 'ri-hand-coin-line' },
        { name: 'Marks', home: Math.floor(rand() * 30) + 50, away: Math.floor(rand() * 30) + 50, icon: 'ri-check-line' },
        { name: 'Tackles', home: Math.floor(rand() * 20) + 40, away: Math.floor(rand() * 20) + 40, icon: 'ri-shield-line' },
        { name: 'Inside 50s', home: Math.floor(rand() * 20) + 35, away: Math.floor(rand() * 20) + 35, icon: 'ri-focus-2-line' },
      ];

    default:
      return [
        { name: 'Ataques', home: Math.floor(rand() * 50) + 30, away: Math.floor(rand() * 50) + 30, icon: 'ri-sword-line' },
        { name: 'Defesas', home: Math.floor(rand() * 30) + 10, away: Math.floor(rand() * 30) + 10, icon: 'ri-shield-line' },
        { name: 'Posse', home: Math.floor(rand() * 30) + 35, away: 0, icon: 'ri-pie-chart-line', isPercentage: true },
        { name: 'Faltas', home: Math.floor(rand() * 15) + 5, away: Math.floor(rand() * 15) + 5, icon: 'ri-error-warning-line' },
      ].map(s => s.name === 'Posse' ? { ...s, away: 100 - s.home } : s);
  }
};

export default function MatchStatistics({ match: _match, isLive }: MatchStatisticsProps) {
  const { theme } = useTheme();
  const [stats, setStats] = useState<StatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'api' | 'mock'>('mock');
  const [sportType, setSportType] = useState<SportType>('football');
  
  // ✅ NOVO: Estado para classificação da liga
  const [standings, setStandings] = useState<StandingTeam[]>([]);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [showStandings, setShowStandings] = useState(true);

  // Buscar estatísticas reais da API
  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const sport = detectSportType(_match);
      setSportType(sport);
      console.log(`[STATS] Desporto detectado:`, sport, '| Match keys:', Object.keys(_match || {}));

      const rawId = _match.id || _match.fixtureId;
      const gameId = extractGameId(rawId);
      console.log('[STATS] gameId extraído:', gameId, '(tipo:', typeof gameId, ')');

      if (!gameId) {
        console.warn('[STATS] ID do jogo não encontrado → usando mock');
        setStats(getMockStats(sport, _match));
        setDataSource('mock');
        return;
      }

      console.log(`[STATS] Buscando estatísticas reais: ${sport} (ID: ${gameId})`);

      const apiStats = await fetchMultiSportStats(sport, gameId);
      console.log('[STATS] Resposta completa da API:', apiStats);

      if (Array.isArray(apiStats) && apiStats.length > 0) {
        console.log('[STATS] Sucesso - métricas carregadas:', apiStats.length);
        setStats(apiStats);
        setDataSource('api');
      } else {
        console.warn('[STATS] API retornou vazio ou inválido → fallback mock');
        setStats(getMockStats(sport, _match));
        setDataSource('mock');
      }
    } catch (err: any) {
      console.error('[STATS] Falha total:', err?.message || err);
      setError(`Erro: ${err?.message || 'Falha na API de estatísticas'}`);
      const sport = detectSportType(_match);
      setStats(getMockStats(sport, _match));
      setDataSource('mock');
    } finally {
      setLoading(false);
    }
  }, [_match]);

  // ✅ NOVO: Buscar classificação da liga
  const fetchStandings = useCallback(async () => {
    if (sportType !== 'football') {
      console.log(`[STANDINGS] Classificação não disponível para`, sportType);
      return;
    }
    
    const leagueId = _match.leagueId || _match.league?.id;
    if (!leagueId) {
      console.warn('[STANDINGS] leagueId não encontrado no match');
      return;
    }

    setLoadingStandings(true);
    try {
      const currentYear = new Date().getFullYear();
      console.log(`[STANDINGS] Buscando classificação: league=${leagueId}, seasons=${currentYear} / ${currentYear - 1}`);

      let response = await apiFetch(
        `/stats/standings?sport=football&league=${leagueId}&season=${currentYear}`,
        { method: 'GET' }
      );

      if (!response?.standings?.length) {
        response = await apiFetch(
          `/stats/standings?sport=football&league=${leagueId}&season=${currentYear - 1}`,
          { method: 'GET' }
        );
      }

      const list = response?.standings || [];
      console.log(`[STANDINGS] Carregadas ${Array.isArray(list) ? list.length : 0} equipas para league ${leagueId}`);

      if (Array.isArray(list) && list.length > 0) {
        setStandings(list as StandingTeam[]);
      } else {
        setStandings([]);
      }
    } catch (err) {
      console.error('[STANDINGS] Erro ao buscar classificação:', err);
    } finally {
      setLoadingStandings(false);
    }
  }, [_match, sportType]);

  // Buscar estatísticas ao montar e quando o jogo mudar
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ✅ Buscar classificação
  useEffect(() => {
    fetchStandings();
  }, [fetchStandings]);

  // Auto-refresh para jogos ao vivo
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      fetchStats();
    }, 30000); // Atualizar a cada 30 segundos

    return () => clearInterval(interval);
  }, [isLive, fetchStats]);

  const StatBar = ({ stat }: { stat: StatItem }) => {
    const total = stat.home + stat.away;
    const homePercent = total > 0 ? (stat.home / total) * 100 : 50;

    return (
      <div className={`p-3 rounded-xl ${theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            {stat.isPercentage ? `${stat.home}%` : stat.home}
          </span>
          <div className="flex items-center gap-1.5">
            <i className={`${stat.icon || 'ri-bar-chart-line'} text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}></i>
            <span className={`text-[10px] font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{stat.name}</span>
          </div>
          <span className={`text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            {stat.isPercentage ? `${stat.away}%` : stat.away}
          </span>
        </div>
        <div className={`h-2 rounded-full overflow-hidden flex ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}>
          <div 
            className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-500"
            style={{ width: `${homePercent}%` }}
          ></div>
          <div 
            className="h-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-500"
            style={{ width: `${100 - homePercent}%` }}
          ></div>
        </div>
      </div>
    );
  };

  // ✅ CORRIGIDO: Componente de classificação com botão mais visível
  const StandingsTable = () => {
    if (sportType !== 'football') return null;

    // Se não tem dados, mostrar botão para carregar
    if (standings.length === 0 && !loadingStandings) {
      return (
        <div className={`mt-4 rounded-xl border overflow-hidden ${theme === 'dark' ? 'bg-gray-900/70 border-gray-800/50' : 'bg-white border-gray-200'}`}>
          <button
            onClick={fetchStandings}
            className={`w-full flex items-center justify-center gap-3 p-6 cursor-pointer transition-colors ${
              theme === 'dark' 
                ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 border-b border-amber-500/20' 
                : 'bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 border-b border-amber-200'
            }`}
          >
            <div className={`w-12 h-12 flex items-center justify-center rounded-xl ${
              theme === 'dark' ? 'bg-amber-500/20' : 'bg-amber-100'
            }`}>
              <i className="ri-trophy-fill text-amber-500 text-xl"></i>
            </div>
            <div className="text-left">
              <h3 className={`font-bold text-base ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Ver Classificação da Liga
              </h3>
              <p className={`text-xs ${
                theme === 'dark' ? 'text-amber-400/80' : 'text-amber-600'
              }`}>
                Clique para carregar a tabela classificativa
              </p>
            </div>
            <i className={`ri-arrow-right-s-line text-2xl ${
              theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
            }`}></i>
          </button>
        </div>
      );
    }

    if (standings.length === 0) return null;

    const homeTeamId = _match.homeTeamId || _match.homeTeam?.id;
    const awayTeamId = _match.awayTeamId || _match.awayTeam?.id;

    const homeTeamRank = standings.find(t => 
      (homeTeamId && t.teamId === homeTeamId) ||
      t.teamName.toLowerCase().includes(_match.homeTeam?.toLowerCase()?.split(' ')[0]) ||
      _match.homeTeam?.toLowerCase().includes(t.teamName.toLowerCase().split(' ')[0])
    )?.rank;
    
    const awayTeamRank = standings.find(t => 
      (awayTeamId && t.teamId === awayTeamId) ||
      t.teamName.toLowerCase().includes(_match.awayTeam?.toLowerCase()?.split(' ')[0]) ||
      _match.awayTeam?.toLowerCase().includes(t.teamName.toLowerCase().split(' ')[0])
    )?.rank;

    return (
      <div className={`mt-4 rounded-xl border overflow-hidden ${theme === 'dark' ? 'bg-gray-900/70 border-gray-800/50' : 'bg-white border-gray-200'}`}>
        {/* Header - MAIS VISÍVEL */}
        <button
          onClick={() => setShowStandings(!showStandings)}
          className={`w-full flex items-center justify-between p-4 cursor-pointer transition-colors ${
            theme === 'dark' 
              ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 border-b border-amber-500/20' 
              : 'bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 border-b border-amber-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 flex items-center justify-center rounded-xl ${
              theme === 'dark' ? 'bg-amber-500/20' : 'bg-amber-100'
            }`}>
              <i className="ri-trophy-fill text-amber-500 text-xl"></i>
            </div>
            <div className="text-left">
              <h3 className={`font-bold text-sm ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                📊 Classificação - {_match.league}
              </h3>
              <p className={`text-[10px] ${
                theme === 'dark' ? 'text-amber-400/80' : 'text-amber-600'
              }`}>
                {standings.length} equipas • Temporada {new Date().getFullYear()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
              theme === 'dark' ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
            }`}>
              {showStandings ? 'OCULTAR' : 'MOSTRAR'}
            </span>
            <i className={`ri-arrow-${showStandings ? 'up' : 'down'}-s-line text-xl ${
              theme === 'dark' ? 'text-amber-400' : 'text-amber-600'
            }`}></i>
          </div>
        </button>

        {showStandings && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-[10px]">
              <thead>
                <tr className={theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-50'}>
                  <th className={`px-2 py-2 text-left font-semibold ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>#</th>
                  <th className={`px-2 py-2 text-left font-semibold ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>Equipa</th>
                  <th className={`px-2 py-2 text-center font-semibold ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>J</th>
                  <th className={`px-2 py-2 text-center font-semibold ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>V</th>
                  <th className={`px-2 py-2 text-center font-semibold ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>E</th>
                  <th className={`px-2 py-2 text-center font-semibold ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>D</th>
                  <th className={`px-2 py-2 text-center font-semibold ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>GM</th>
                  <th className={`px-2 py-2 text-center font-semibold ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>GS</th>
                  <th className={`px-2 py-2 text-center font-semibold ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>DG</th>
                  <th className={`px-2 py-2 text-center font-semibold ${
                    theme === 'dark' ? 'text-amber-400' : 'text-amber-600'
                  }`}>Pts</th>
                  <th className={`px-2 py-2 text-center font-semibold ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>Forma</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((team) => {
                  const isHomeTeam = team.rank === homeTeamRank;
                  const isAwayTeam = team.rank === awayTeamRank;
                  const isHighlighted = isHomeTeam || isAwayTeam;
                  
                  // Cores de zona (Champions, Europa, Descida)
                  let zoneColor = '';
                  if (team.rank <= 4) zoneColor = 'border-l-2 border-l-green-500';
                  else if (team.rank <= 6) zoneColor = 'border-l-2 border-l-blue-500';
                  else if (team.rank > standings.length - 3) zoneColor = 'border-l-2 border-l-red-500';

                  return (
                    <tr 
                      key={team.teamId}
                      className={`
                        ${zoneColor}
                        ${isHighlighted 
                          ? theme === 'dark' 
                            ? 'bg-amber-500/10' 
                            : 'bg-amber-50' 
                          : ''
                        }
                        ${theme === 'dark' ? 'border-gray-800' : 'border-gray-100'} border-b last:border-b-0
                        transition-colors
                      `}
                    >
                      <td className={`px-2 py-2 font-bold ${
                        theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        {team.rank}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <img 
                            src={team.teamLogo} 
                            alt={team.teamName}
                            className="w-4 h-4 object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://cdn-icons-png.flaticon.com/512/1165/1165187.png';
                            }}
                          />
                          <span className={`font-semibold truncate max-w-[100px] ${
                            isHighlighted 
                              ? theme === 'dark' ? 'text-amber-400' : 'text-amber-600'
                              : theme === 'dark' ? 'text-white' : 'text-gray-900'
                          }`}>
                            {team.teamName}
                          </span>
                          {isHomeTeam && (
                            <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-red-500/20 text-red-400">CASA</span>
                          )}
                          {isAwayTeam && (
                            <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-amber-500/20 text-amber-400">FORA</span>
                          )}
                        </div>
                      </td>
                      <td className={`px-2 py-2 text-center ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                      }`}>{team.played}</td>
                      <td className={`px-2 py-2 text-center text-green-500 font-medium`}>{team.won}</td>
                      <td className={`px-2 py-2 text-center ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                      }`}>{team.draw}</td>
                      <td className={`px-2 py-2 text-center text-red-500 font-medium`}>{team.lost}</td>
                      <td className={`px-2 py-2 text-center ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                      }`}>{team.goalsFor}</td>
                      <td className={`px-2 py-2 text-center ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                      }`}>{team.goalsAgainst}</td>
                      <td className={`px-2 py-2 text-center font-medium ${
                        team.goalsDiff > 0 ? 'text-green-500' : team.goalsDiff < 0 ? 'text-red-500' : theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        {team.goalsDiff > 0 ? '+' : ''}{team.goalsDiff}
                      </td>
                      <td className={`px-2 py-2 text-center font-black ${
                        theme === 'dark' ? 'text-amber-400' : 'text-amber-600'
                      }`}>{team.points}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-0.5">
                          {team.form?.split('').slice(-5).map((result, idx) => (
                            <span 
                              key={idx}
                              className={`w-4 h-4 flex items-center justify-center rounded text-[8px] font-bold text-white ${
                                result === 'W' ? 'bg-green-500' :
                                result === 'D' ? 'bg-gray-500' :
                                result === 'L' ? 'bg-red-500' : 'bg-gray-600'
                              }`}
                            >
                              {result === 'W' ? 'V' : result === 'D' ? 'E' : result === 'L' ? 'D' : '-'}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Legenda das zonas */}
            <div className={`flex items-center justify-center gap-4 p-3 border-t ${
              theme === 'dark' ? 'border-gray-800 bg-gray-900/50' : 'border-gray-100 bg-gray-50'
            }`}>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className={`text-[9px] ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>Champions League</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className={`text-[9px] ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>Europa League</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span className={`text-[9px] ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>Zona de Descida</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className={`flex items-center justify-center p-8 rounded-xl ${theme === 'dark' ? 'bg-gray-900/70' : 'bg-white'}`}>
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className={`text-sm font-medium ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>
              A carregar estatísticas...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`flex items-center justify-between p-4 rounded-xl ${
        theme === 'dark' ? 'bg-gray-900/70 border border-gray-800/50' : 'bg-white border border-gray-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${
            theme === 'dark' ? 'bg-red-500/10' : 'bg-red-50'
          }`}>
            <i className="ri-bar-chart-box-line text-red-500 text-lg"></i>
          </div>
          <div>
            <h3 className={`font-bold text-sm ${
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}>
              Estatísticas - {sportNames[sportType]}
            </h3>
            <p className={`text-[10px] ${
              theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
            }`}>
              {dataSource === 'api' ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                  Dados em tempo real via API
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                  Dados estimados
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLive && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span className={`text-[10px] font-medium ${
                theme === 'dark' ? 'text-green-400' : 'text-green-600'
              }`}>Live</span>
            </div>
          )}
          <button
            onClick={fetchStats}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              theme === 'dark' ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
            title="Atualizar estatísticas"
          >
            <i className="ri-refresh-line text-sm"></i>
          </button>
        </div>
      </div>

      {/* Team Legend */}
      <div className="flex items-center justify-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-red-500 to-red-600"></div>
          <span className={`text-xs font-medium ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
          }`}>{_match.homeTeam}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-amber-500 to-amber-600"></div>
          <span className={`text-xs font-medium ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
          }`}>{_match.awayTeam}</span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className={`p-3 rounded-xl ${
          theme === 'dark' 
            ? 'bg-red-500/10 border border-red-500/20' 
            : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            <i className={`ri-error-warning-line text-sm ${
              theme === 'dark' ? 'text-red-400' : 'text-red-600'
            }`}></i>
            <p className={`text-[11px] ${
              theme === 'dark' ? 'text-red-400' : 'text-red-700'
            }`}>{error}</p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="space-y-2">
        {stats.map((stat, index) => (
          <StatBar key={`${stat.name}-${index}`} stat={stat} />
        ))}
      </div>

      {/* ✅ NOVO: Classificação da Liga */}
      {loadingStandings ? (
        <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-900/70' : 'bg-white'}`}>
          <div className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            <span className={`text-xs ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>A carregar classificação...</span>
          </div>
        </div>
      ) : (
        <StandingsTable />
      )}

      {/* Data Source Info */}
      <div className={`p-4 rounded-xl ${
        dataSource === 'api' 
          ? theme === 'dark' ? 'bg-green-500/5 border border-green-500/20' : 'bg-green-50 border border-green-200'
          : theme === 'dark' ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'
      }`}>
        <div className="flex items-start gap-2">
          <i className={`ri-information-line text-sm ${
            dataSource === 'api'
              ? theme === 'dark' ? 'text-green-400' : 'text-green-600'
              : theme === 'dark' ? 'text-amber-400' : 'text-amber-600'
          }`}></i>
          <p className={`text-[11px] ${
            dataSource === 'api'
              ? theme === 'dark' ? 'text-green-400/80' : 'text-green-700'
              : theme === 'dark' ? 'text-amber-400/80' : 'text-amber-700'
          }`}>
            {dataSource === 'api' 
              ? `Estatísticas oficiais da API-Football para ${sportNames[sportType]}. Atualizadas automaticamente a cada 30 segundos durante jogos ao vivo.`
              : `Estatísticas baseadas em dados históricos e análise preditiva para ${sportNames[sportType]}. Os valores reais podem variar durante o jogo.`
            }
          </p>
        </div>
      </div>
    </div>
  );
}

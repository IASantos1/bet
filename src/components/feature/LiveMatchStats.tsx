import { useMatchStatistics } from '../../hooks/useMatchStatistics';
import type { SportType } from '../../types/sports';
import LiveMatchStatsBasketball from './LiveMatchStatsBasketball';
import LiveMatchStatsBaseball from './LiveMatchStatsBaseball';
import LiveMatchStatsHockey from './LiveMatchStatsHockey';
import { useLiveMatches } from '../../hooks/useLiveMatches';

interface LiveMatchStatsProps {
  matchId: string;
  sport: SportType;
}

export default function LiveMatchStats({ matchId, sport }: LiveMatchStatsProps) {
  // ✅ Buscar dados do jogo para passar ao componente de basquetebol
  const { matches } = useLiveMatches({
    autoRefresh: false,
    interval: 15000,
    useWebSocket: true,
  });
  const currentMatch = matches.find(m => String(m.id) === String(matchId));

  // Always call the hook first (for football)
  const { statistics, loading, error } = useMatchStatistics(matchId);

  // ✅ Route to sport-specific component AFTER calling hooks
  if (sport === 'basketball') {
    return (
      <LiveMatchStatsBasketball 
        matchId={matchId}
        homeTeam={currentMatch?.homeTeam}
        awayTeam={currentMatch?.awayTeam}
        currentQuarter={currentMatch?.status === 'Q1' ? 1 : currentMatch?.status === 'Q2' ? 2 : currentMatch?.status === 'Q3' ? 3 : currentMatch?.status === 'Q4' ? 4 : 2}
        homeScore={currentMatch?.homeScore ?? 0}
        awayScore={currentMatch?.awayScore ?? 0}
      />
    );
  }
  
  if (sport === 'baseball') {
    return <LiveMatchStatsBaseball matchId={matchId} />;
  }
  
  if (sport === 'hockey') {
    return <LiveMatchStatsHockey matchId={matchId} />;
  }

  // Default football stats (existing component)
  if (loading) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-500"></div>
        </div>
      </div>
    );
  }

  if (error || !statistics) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-600 text-center">
          Estatísticas não disponíveis
        </p>
      </div>
    );
  }

  const stats = statistics as any;

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-800">
          <i className="ri-football-line text-teal-500 mr-2"></i>
          Estatísticas do Jogo
        </h4>
      </div>

      {/* Possession */}
      {stats.possession && (
        <div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{stats.possession.home}%</span>
            <span className="font-medium">Posse de Bola</span>
            <span>{stats.possession.away}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="flex h-full">
              <div
                className="bg-teal-500"
                style={{ width: `${stats.possession.home}%` }}
              ></div>
              <div className="bg-orange-500 flex-1"></div>
            </div>
          </div>
        </div>
      )}

      {/* Shots */}
      {stats.shots && (
        <div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{stats.shots.home}</span>
            <span className="font-medium">Remates</span>
            <span>{stats.shots.away}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="flex h-full">
              <div
                className="bg-teal-500"
                style={{
                  width: `${
                    (stats.shots.home / (stats.shots.home + stats.shots.away)) *
                    100
                  }%`,
                }}
              ></div>
              <div className="bg-orange-500 flex-1"></div>
            </div>
          </div>
        </div>
      )}

      {/* Shots on Target */}
      {stats.shotsOnTarget && (
        <div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{stats.shotsOnTarget.home}</span>
            <span className="font-medium">Remates à Baliza</span>
            <span>{stats.shotsOnTarget.away}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="flex h-full">
              <div
                className="bg-teal-500"
                style={{
                  width: `${
                    (stats.shotsOnTarget.home /
                      (stats.shotsOnTarget.home + stats.shotsOnTarget.away)) *
                    100
                  }%`,
                }}
              ></div>
              <div className="bg-orange-500 flex-1"></div>
            </div>
          </div>
        </div>
      )}

      {/* Corners */}
      {stats.corners && (
        <div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{stats.corners.home}</span>
            <span className="font-medium">Cantos</span>
            <span>{stats.corners.away}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="flex h-full">
              <div
                className="bg-teal-500"
                style={{
                  width: `${
                    (stats.corners.home /
                      (stats.corners.home + stats.corners.away)) *
                    100
                  }%`,
                }}
              ></div>
              <div className="bg-orange-500 flex-1"></div>
            </div>
          </div>
        </div>
      )}

      {/* Fouls */}
      {stats.fouls && (
        <div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{stats.fouls.home}</span>
            <span className="font-medium">Faltas</span>
            <span>{stats.fouls.away}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="flex h-full">
              <div
                className="bg-red-500"
                style={{
                  width: `${
                    (stats.fouls.home / (stats.fouls.home + stats.fouls.away)) *
                    100
                  }%`,
                }}
              ></div>
              <div className="bg-orange-500 flex-1"></div>
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      {(stats.yellowCards || stats.redCards) && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200">
          <div className="text-center">
            <div className="text-xs text-gray-600 mb-1">Cartões Amarelos</div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm font-semibold">{stats.yellowCards?.home || 0}</span>
              <div className="w-4 h-5 bg-yellow-400 rounded-sm"></div>
              <span className="text-sm font-semibold">{stats.yellowCards?.away || 0}</span>
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-600 mb-1">Cartões Vermelhos</div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm font-semibold">{stats.redCards?.home || 0}</span>
              <div className="w-4 h-5 bg-red-500 rounded-sm"></div>
              <span className="text-sm font-semibold">{stats.redCards?.away || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

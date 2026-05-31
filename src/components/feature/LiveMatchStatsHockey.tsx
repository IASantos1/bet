import { useMatchStatistics } from '../../hooks/useMatchStatistics';

interface LiveMatchStatsHockeyProps {
  matchId: string;
}

export default function LiveMatchStatsHockey({ matchId }: LiveMatchStatsHockeyProps) {
  const { statistics, loading, error } = useMatchStatistics(matchId);

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
          <i className="ri-hockey-puck-line text-teal-500 mr-2"></i>
          Estatísticas do Jogo
        </h4>
      </div>

      {/* Shots */}
      <div>
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>{stats.shots?.home || 0}</span>
          <span className="font-medium">Remates</span>
          <span>{stats.shots?.away || 0}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className="flex h-full">
            <div
              className="bg-teal-500"
              style={{
                width: `${
                  ((stats.shots?.home || 0) /
                    ((stats.shots?.home || 0) + (stats.shots?.away || 0) || 1)) *
                  100
                }%`,
              }}
            ></div>
            <div className="bg-orange-500 flex-1"></div>
          </div>
        </div>
      </div>

      {/* Saves */}
      <div>
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>{stats.saves?.home || 0}</span>
          <span className="font-medium">Defesas</span>
          <span>{stats.saves?.away || 0}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className="flex h-full">
            <div
              className="bg-teal-500"
              style={{
                width: `${
                  ((stats.saves?.home || 0) /
                    ((stats.saves?.home || 0) + (stats.saves?.away || 0) || 1)) *
                  100
                }%`,
              }}
            ></div>
            <div className="bg-orange-500 flex-1"></div>
          </div>
        </div>
      </div>

      {/* Faceoffs */}
      <div>
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>{stats.faceoffs?.home || 0}</span>
          <span className="font-medium">Faceoffs Ganhos</span>
          <span>{stats.faceoffs?.away || 0}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className="flex h-full">
            <div
              className="bg-teal-500"
              style={{
                width: `${
                  ((stats.faceoffs?.home || 0) /
                    ((stats.faceoffs?.home || 0) + (stats.faceoffs?.away || 0) || 1)) *
                  100
                }%`,
              }}
            ></div>
            <div className="bg-orange-500 flex-1"></div>
          </div>
        </div>
      </div>

      {/* Power Plays */}
      <div>
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>{stats.powerPlays?.home || 0}</span>
          <span className="font-medium">Power Plays</span>
          <span>{stats.powerPlays?.away || 0}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className="flex h-full">
            <div
              className="bg-teal-500"
              style={{
                width: `${
                  ((stats.powerPlays?.home || 0) /
                    ((stats.powerPlays?.home || 0) + (stats.powerPlays?.away || 0) || 1)) *
                  100
                }%`,
              }}
            ></div>
            <div className="bg-orange-500 flex-1"></div>
          </div>
        </div>
      </div>

      {/* Penalties */}
      {(stats.penalties?.home || stats.penalties?.away) && (
        <div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{stats.penalties?.home || 0}</span>
            <span className="font-medium">Penalidades</span>
            <span>{stats.penalties?.away || 0}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="flex h-full">
              <div
                className="bg-red-500"
                style={{
                  width: `${
                    ((stats.penalties?.home || 0) /
                      ((stats.penalties?.home || 0) + (stats.penalties?.away || 0) || 1)) *
                    100
                  }%`,
                }}
              ></div>
              <div className="bg-orange-500 flex-1"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useMatchStatistics } from '../../hooks/useMatchStatistics';

interface LiveMatchStatsBaseballProps {
  matchId: string;
}

export default function LiveMatchStatsBaseball({ matchId }: LiveMatchStatsBaseballProps) {
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
          <i className="ri-ball-pen-line text-teal-500 mr-2"></i>
          Estatísticas do Jogo
        </h4>
      </div>

      {/* Runs */}
      <div>
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>{stats.runs?.home || 0}</span>
          <span className="font-medium">Corridas</span>
          <span>{stats.runs?.away || 0}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className="flex h-full">
            <div
              className="bg-teal-500"
              style={{
                width: `${
                  ((stats.runs?.home || 0) /
                    ((stats.runs?.home || 0) + (stats.runs?.away || 0) || 1)) *
                  100
                }%`,
              }}
            ></div>
            <div className="bg-orange-500 flex-1"></div>
          </div>
        </div>
      </div>

      {/* Hits */}
      <div>
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>{stats.hits?.home || 0}</span>
          <span className="font-medium">Rebatidas</span>
          <span>{stats.hits?.away || 0}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className="flex h-full">
            <div
              className="bg-teal-500"
              style={{
                width: `${
                  ((stats.hits?.home || 0) /
                    ((stats.hits?.home || 0) + (stats.hits?.away || 0) || 1)) *
                  100
                }%`,
              }}
            ></div>
            <div className="bg-orange-500 flex-1"></div>
          </div>
        </div>
      </div>

      {/* Errors */}
      <div>
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>{stats.errors?.home || 0}</span>
          <span className="font-medium">Erros</span>
          <span>{stats.errors?.away || 0}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className="flex h-full">
            <div
              className="bg-red-500"
              style={{
                width: `${
                  ((stats.errors?.home || 0) /
                    ((stats.errors?.home || 0) + (stats.errors?.away || 0) || 1)) *
                  100
                }%`,
              }}
            ></div>
            <div className="bg-orange-500 flex-1"></div>
          </div>
        </div>
      </div>

      {/* Strikeouts */}
      <div>
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>{stats.strikeouts?.home || 0}</span>
          <span className="font-medium">Strikeouts</span>
          <span>{stats.strikeouts?.away || 0}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className="flex h-full">
            <div
              className="bg-teal-500"
              style={{
                width: `${
                  ((stats.strikeouts?.home || 0) /
                    ((stats.strikeouts?.home || 0) + (stats.strikeouts?.away || 0) || 1)) *
                  100
                }%`,
              }}
            ></div>
            <div className="bg-orange-500 flex-1"></div>
          </div>
        </div>
      </div>

      {/* Home Runs */}
      {(stats.homeRuns?.home || stats.homeRuns?.away) && (
        <div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{stats.homeRuns?.home || 0}</span>
            <span className="font-medium">Home Runs</span>
            <span>{stats.homeRuns?.away || 0}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="flex h-full">
              <div
                className="bg-teal-500"
                style={{
                  width: `${
                    ((stats.homeRuns?.home || 0) /
                      ((stats.homeRuns?.home || 0) + (stats.homeRuns?.away || 0) || 1)) *
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

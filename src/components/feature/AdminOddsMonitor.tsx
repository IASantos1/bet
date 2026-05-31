import { useState, useEffect } from 'react';
import { apiCache } from '../../services/apiCache';

interface OddsUpdateLog {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  timestamp: Date;
  isLive: boolean;
  oldOdds: { home: number; draw: number | null; away: number };
  newOdds: { home: number; draw: number | null; away: number };
  changePercentage: number;
}

interface MatchUpdateInfo {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  lastUpdate: Date;
  updateCount: number;
  isLive: boolean;
  currentInterval: number;
  nextUpdate: Date;
  currentOdds: { home: number; draw: number | null; away: number };
}

/* --------------------------------------------------------------------------
   Global storage (in‑memory) for logs and match information.
   -------------------------------------------------------------------------- */
const oddsUpdateLogs: OddsUpdateLog[] = [];
const matchUpdateInfo = new Map<string, MatchUpdateInfo>();

/* --------------------------------------------------------------------------
   Helper - safely calculate percentage change.
   Prevents division-by-zero and NaN results.
   -------------------------------------------------------------------------- */
function calculateChange(
  newVal: number,
  oldVal: number
): number {
  if (oldVal === 0) {
    // If the old value is 0 we cannot calculate a relative change;
    // treat it as 100% change if the new value is different.
    return newVal === 0 ? 0 : 100;
  }
  return Math.abs(((newVal - oldVal) / oldVal) * 100);
}

/* --------------------------------------------------------------------------
   Register an odds update.
   -------------------------------------------------------------------------- */
const _logOddsUpdate = (
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  oldOdds: { home: number; draw: number | null; away: number },
  newOdds: { home: number; draw: number | null; away: number },
  isLive: boolean
) => {
  try {
    const changeHome = calculateChange(newOdds.home, oldOdds.home);
    const changeAway = calculateChange(newOdds.away, oldOdds.away);
    const changeDraw =
      oldOdds.draw !== null && newOdds.draw !== null
        ? calculateChange(newOdds.draw, oldOdds.draw)
        : 0;

    const maxChange = Math.max(changeHome, changeAway, changeDraw);

    const log: OddsUpdateLog = {
      matchId,
      homeTeam,
      awayTeam,
      timestamp: new Date(),
      isLive,
      oldOdds,
      newOdds,
      changePercentage: maxChange,
    };

    oddsUpdateLogs.unshift(log);

    // Keep only the latest 100 entries
    if (oddsUpdateLogs.length > 100) {
      oddsUpdateLogs.pop();
    }
  } catch (e) {
    // In production we could forward this to a monitoring service
    console.error('Failed to log odds update', e);
  }
}

/* --------------------------------------------------------------------------
   Register / update match information.
   -------------------------------------------------------------------------- */
const _updateMatchInfo = (
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  isLive: boolean,
  currentInterval: number,
  currentOdds: { home: number; draw: number | null; away: number }
) => {
  try {
    const now = new Date();
    const existing = matchUpdateInfo.get(matchId);

    if (existing) {
      existing.lastUpdate = now;
      existing.updateCount += 1;
      existing.isLive = isLive;
      existing.currentInterval = currentInterval;
      existing.nextUpdate = new Date(now.getTime() + currentInterval);
      existing.currentOdds = currentOdds;
    } else {
      matchUpdateInfo.set(matchId, {
        matchId,
        homeTeam,
        awayTeam,
        lastUpdate: now,
        updateCount: 1,
        isLive,
        currentInterval,
        nextUpdate: new Date(now.getTime() + currentInterval),
        currentOdds,
      });
    }
  } catch (e) {
    console.error('Failed to update match info', e);
  }
}

/* --------------------------------------------------------------------------
   AdminOddsMonitor component.
   -------------------------------------------------------------------------- */
function AdminOddsMonitor() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'logs' | 'matches' | 'cache'>('matches');
  const [logs, setLogs] = useState<OddsUpdateLog[]>([]);
  const [matches, setMatches] = useState<MatchUpdateInfo[]>([]);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [filterLive, setFilterLive] = useState<boolean | null>(null);

  /* ------------------------------------------------------------------------
     Pull the latest data every second while the monitor is open.
     ------------------------------------------------------------------------ */
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setLogs([...oddsUpdateLogs]);
      setMatches(Array.from(matchUpdateInfo.values()));
      try {
        setCacheStats(apiCache.getStats());
      } catch (e) {
        console.error('Failed to fetch cache stats', e);
        setCacheStats(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  /* ------------------------------------------------------------------------
     Utility formatters.
     ------------------------------------------------------------------------ */
  const formatTime = (date: Date) =>
    date.toLocaleTimeString('pt-PT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const formatTimeSince = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s atrás`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}min atrás`;
    return `${Math.floor(seconds / 3600)}h atrás`;
  };

  const formatInterval = (ms: number) => {
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    return `${Math.floor(ms / 60000)}min`;
  };

  const filteredLogs =
    filterLive === null ? logs : logs.filter((log) => log.isLive === filterLive);
  const filteredMatches =
    filterLive === null ? matches : matches.filter((m) => m.isLive === filterLive);

  /* ------------------------------------------------------------------------
     Render when the monitor is closed.
     ------------------------------------------------------------------------ */
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-50 bg-gradient-to-r from-purple-600 to-purple-700 text-white px-4 py-3 rounded-xl shadow-2xl hover:from-purple-500 hover:to-purple-600 transition-all cursor-pointer flex items-center gap-2 border border-purple-400/30"
      >
        <i className="ri-line-chart-line text-xl" />
        <div className="flex flex-col items-start">
          <span className="text-xs font-bold">Monitor Admin</span>
          <span className="text-[10px] text-purple-200">Odds em Tempo Real</span>
        </div>
      </button>
    );
  }

  /* ------------------------------------------------------------------------
     Main UI – tabs, filters and content.
     ------------------------------------------------------------------------ */
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col border border-purple-500/30">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg flex items-center justify-center">
              <i className="ri-line-chart-line text-white text-xl" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Monitor de Odds - Administrador</h2>
              <p className="text-xs text-gray-400">
                Monitoramento em tempo real das atualizações de odds
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-4 pt-4 border-b border-gray-700/50">
          <button
            onClick={() => setActiveTab('matches')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'matches' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <i className="ri-football-line mr-2" />
            Jogos ({matches.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'logs' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <i className="ri-history-line mr-2" />
            Histórico ({logs.length})
          </button>
          <button
            onClick={() => setActiveTab('cache')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'cache' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <i className="ri-database-2-line mr-2" />
            Cache
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 bg-gray-800/50 flex items-center gap-2">
          <span className="text-xs text-gray-400">Filtrar:</span>
          <button
            onClick={() => setFilterLive(null)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filterLive === null ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilterLive(true)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filterLive === true ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full inline-block mr-1 animate-pulse" />
            Ao Vivo
          </button>
          <button
            onClick={() => setFilterLive(false)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filterLive === false ? 'bg-amber-600 text-black' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Pré-Jogo
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Matches Tab */}
          {activeTab === 'matches' && (
            <div className="space-y-2">
              {filteredMatches.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <i className="ri-football-line text-4xl mb-2" />
                  <p>Nenhum jogo monitorado</p>
                </div>
              ) : (
                filteredMatches.map((match) => {
                  const timeUntilNext = Math.max(0, match.nextUpdate.getTime() - Date.now());
                  const progress = ((match.currentInterval - timeUntilNext) / match.currentInterval) * 100;

                  return (
                    <div key={match.matchId} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {match.isLive ? (
                              <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                                AO VIVO
                              </span>
                            ) : (
                              <span className="bg-amber-600 text-black text-[10px] font-bold px-2 py-0.5 rounded">
                                PRÉ-JOGO
                              </span>
                            )}
                            <span className="text-xs text-gray-400">ID: {match.matchId}</span>
                          </div>
                          <div className="text-sm font-semibold text-white">
                            {match.homeTeam} vs {match.awayTeam}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-400 mb-1">Atualizações</div>
                          <div className="text-lg font-bold text-purple-400">{match.updateCount}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-gray-900/50 rounded-lg p-2">
                          <div className="text-[10px] text-gray-500 mb-1">Casa</div>
                          <div className="text-sm font-bold text-white">{match.currentOdds.home.toFixed(2)}</div>
                        </div>
                        {match.currentOdds.draw && (
                          <div className="bg-gray-900/50 rounded-lg p-2">
                            <div className="text-[10px] text-gray-500 mb-1">Empate</div>
                            <div className="text-sm font-bold text-white">{match.currentOdds.draw.toFixed(2)}</div>
                          </div>
                        )}
                        <div className="bg-gray-900/50 rounded-lg p-2">
                          <div className="text-[10px] text-gray-500 mb-1">Fora</div>
                          <div className="text-sm font-bold text-white">{match.currentOdds.away.toFixed(2)}</div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">Última atualização:</span>
                          <span className="text-white font-medium">{formatTimeSince(match.lastUpdate)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">Intervalo:</span>
                          <span className="text-purple-400 font-medium">{formatInterval(match.currentInterval)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">Próxima atualização:</span>
                          <span className="text-emerald-400 font-medium">{formatInterval(timeUntilNext)}</span>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-2">
                          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-1000"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <div className="space-y-2">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <i className="ri-history-line text-4xl mb-2" />
                  <p>Nenhuma atualização registada</p>
                </div>
              ) : (
                filteredLogs.map((log, idx) => (
                  <div key={idx} className="bg-gray-800/50 border border-gray-700 rounded-xl p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {log.isLive ? (
                            <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">LIVE</span>
                          ) : (
                            <span className="bg-amber-600 text-black text-[9px] font-bold px-1.5 py-0.5 rounded">
                              PRÉ
                            </span>
                          )}
                          <span className="text-xs text-gray-400">{formatTime(log.timestamp)}</span>
                          {log.changePercentage >= 5 && (
                            <span className="bg-amber-500/20 text-amber-400 text-[9px] font-bold px-1.5 py-0.5 rounded">
                              MUDANÇA SIGNIFICATIVA
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-medium text-white">{log.homeTeam} vs {log.awayTeam}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Variação</div>
                        <div
                          className={`text-sm font-bold ${
                            log.changePercentage >= 5 ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {log.changePercentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <div className="text-gray-500 mb-1">Casa</div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">{log.oldOdds.home.toFixed(2)}</span>
                          <i className="ri-arrow-right-line text-gray-600" />
                          <span className="text-white font-medium">{log.newOdds.home.toFixed(2)}</span>
                        </div>
                      </div>
                      {log.oldOdds.draw !== null && log.newOdds.draw !== null && (
                        <div>
                          <div className="text-gray-500 mb-1">Empate</div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">{log.oldOdds.draw.toFixed(2)}</span>
                            <i className="ri-arrow-right-line text-gray-600" />
                            <span className="text-white font-medium">{log.newOdds.draw.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="text-gray-500 mb-1">Fora</div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">{log.oldOdds.away.toFixed(2)}</span>
                          <i className="ri-arrow-right-line text-gray-600" />
                          <span className="text-white font-medium">{log.newOdds.away.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Cache Tab */}
          {activeTab === 'cache' && cacheStats && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3">
                  <div className="text-xs text-gray-400 mb-1">Total Requisições</div>
                  <div className="text-2xl font-bold text-white">{cacheStats.totalRequests}</div>
                </div>
                <div className="bg-gray-800/50 border border-emerald-500/30 rounded-xl p-3">
                  <div className="text-xs text-gray-400 mb-1">Cache Hits</div>
                  <div className="text-2xl font-bold text-emerald-400">{cacheStats.cacheHits}</div>
                </div>
                <div className="bg-gray-800/50 border border-red-500/30 rounded-xl p-3">
                  <div className="text-xs text-gray-400 mb-1">Cache Misses</div>
                  <div className="text-2xl font-bold text-red-400">{cacheStats.cacheMisses}</div>
                </div>
                <div className="bg-gray-800/50 border border-purple-500/30 rounded-xl p-3">
                  <div className="text-xs text-gray-400 mb-1">Hit Rate</div>
                  <div className="text-2xl font-bold text-purple-400">{cacheStats.hitRate}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3">
                  <div className="text-xs text-gray-400 mb-1">Requisições Evitadas</div>
                  <div className="text-xl font-bold text-emerald-400">{cacheStats.requestsAvoided}</div>
                </div>
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3">
                  <div className="text-xs text-gray-400 mb-1">Tamanho Cache</div>
                  <div className="text-xl font-bold text-white">{cacheStats.memoryCacheSize}</div>
                </div>
              </div>

              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <h3 className="text-sm font-bold text-white mb-3">Estatísticas Avançadas</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Requisições Desduplicadas:</span>
                    <span className="text-white font-medium">{cacheStats.deduplicatedRequests}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Sincronizações Entre Abas:</span>
                    <span className="text-white font-medium">{cacheStats.crossTabSyncs}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Itens Pré-carregados:</span>
                    <span className="text-white font-medium">{cacheStats.preloadedItems}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Requisições em Voo:</span>
                    <span className="text-white font-medium">{cacheStats.inflightRequests}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Chaves Populares Rastreadas:</span>
                    <span className="text-white font-medium">{cacheStats.trackedPopularKeys}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">ID da Aba:</span>
                    <span className="text-purple-400 font-mono text-[10px]">{cacheStats.tabId}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Export as named export
export { AdminOddsMonitor };

// Also export as default for compatibility
export default AdminOddsMonitor;

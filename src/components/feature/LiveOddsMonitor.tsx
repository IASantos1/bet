
import { useState, useEffect } from 'react';
import { useApiFallback } from '../../hooks/useApiFallback';
import { useOddsAlerts } from '../../hooks/useOddsAlerts';
import { useLiveMatches } from '../../hooks/useLiveMatches';
import { processOddsUpdate } from '../../services/oddsAlerts';

interface LiveOddsMonitorProps {
  isVisible?: boolean;
  onClose?: () => void;
}

/**
 * Painel de Monitorização em Tempo Real das Odds ao Vivo
 * - Mostra estado das APIs (principal e fallback)
 * - Exibe movimentos de odds em tempo real
 * - Permite configurar alertas personalizados
 */
export function LiveOddsMonitor({ isVisible = true, onClose }: LiveOddsMonitorProps) {
  const [activeTab, setActiveTab] = useState<'monitor' | 'alerts' | 'apis'>('monitor');
  const [isExpanded, setIsExpanded] = useState(false);
  
  const { api1Health, api2Health, metrics, resetApi1, resetApi2, checkApi1Health, checkApi2Health, isAnyApiDown, activeApi } = useApiFallback();
  const { activeAlerts, triggeredAlerts, recentMovements, stats, config, updateConfig, removeAlert, markAsNotified, clearAll, hasNewAlerts, clearNewAlerts } = useOddsAlerts();
  const { matches: liveMatches } = useLiveMatches({ autoRefresh: true, interval: 5000, useWebSocket: true });

  // Processar atualizações de odds
  useEffect(() => {
    if (!liveMatches || liveMatches.length === 0) return;

    liveMatches.forEach(match => {
      if (match.odds) {
        processOddsUpdate(
          match.id,
          match.homeTeam,
          match.awayTeam,
          match.league,
          match.odds
        );
      }
    });
  }, [liveMatches]);

  // Limpar indicador de novos alertas quando visualizar
  useEffect(() => {
    if (activeTab === 'alerts' && hasNewAlerts) {
      clearNewAlerts();
    }
  }, [activeTab, hasNewAlerts, clearNewAlerts]);

  // Formatar tempo relativo
  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  // Cor baseada na direção do movimento
  const getMovementColor = (direction: 'up' | 'down') => {
    return direction === 'up' ? 'text-emerald-400' : 'text-red-400';
  };

  // Cor baseada na saúde da API
  const getHealthColor = (isHealthy: boolean, isCircuitOpen: boolean) => {
    if (isCircuitOpen) return 'text-red-500';
    if (!isHealthy) return 'text-amber-500';
    return 'text-emerald-500';
  };

  // Ícone baseado no tipo de alerta
  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'steam_move': return 'ri-fire-line';
      case 'value_bet': return 'ri-money-dollar-circle-line';
      case 'threshold': return 'ri-flag-line';
      case 'variation': return 'ri-arrow-left-right-line';
      default: return 'ri-notification-line';
    }
  };

  // Cor baseada no tipo de alerta
  const getAlertColor = (type: string) => {
    switch (type) {
      case 'steam_move': return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
      case 'value_bet': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'threshold': return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case 'variation': return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
    }
  };

  if (!isVisible) return null;

  // Versão compacta (minimizada)
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 bg-zinc-900/95 backdrop-blur-sm rounded-xl border shadow-2xl cursor-pointer transition-all hover:scale-105 ${
          isAnyApiDown ? 'border-red-500/50 ring-2 ring-red-500/20' : 'border-amber-500/30'
        } ${hasNewAlerts ? 'animate-pulse' : ''}`}
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isAnyApiDown ? 'bg-red-500' : 'bg-emerald-500'} animate-pulse`}></div>
          <span className="text-white font-medium text-sm">Monitor Odds</span>
        </div>
        
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <i className="ri-arrow-up-down-line text-amber-400"></i>
            <span className="text-zinc-300">{stats.totalMovements}</span>
          </div>
          
          {stats.steamMoves > 0 && (
            <div className="flex items-center gap-1">
              <i className="ri-fire-line text-orange-400"></i>
              <span className="text-orange-400">{stats.steamMoves}</span>
            </div>
          )}
          
          {triggeredAlerts.length > 0 && (
            <div className="flex items-center gap-1 bg-red-500/20 px-2 py-0.5 rounded-full">
              <i className="ri-notification-3-line text-red-400"></i>
              <span className="text-red-400 font-semibold">{triggeredAlerts.length}</span>
            </div>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[420px] max-h-[600px] bg-zinc-900/98 backdrop-blur-sm rounded-xl border border-amber-500/30 shadow-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-600/20 to-orange-600/20 border-b border-amber-500/20">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${isAnyApiDown ? 'bg-red-500' : 'bg-emerald-500'} animate-pulse`}></div>
          <span className="font-bold text-white">Monitor de Odds em Tempo Real</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(false)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <i className="ri-subtract-line"></i>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <i className="ri-close-line"></i>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-700/50">
        <button
          onClick={() => setActiveTab('monitor')}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'monitor' 
              ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5' 
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <i className="ri-line-chart-line"></i>
          Movimentos
          {stats.totalMovements > 0 && (
            <span className="bg-zinc-700 px-1.5 py-0.5 rounded text-[10px]">{stats.totalMovements}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'alerts' 
              ? 'text-orange-400 border-b-2 border-orange-400 bg-orange-400/5' 
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <i className="ri-notification-3-line"></i>
          Alertas
          {triggeredAlerts.length > 0 && (
            <span className="bg-red-500 text-white px-1.5 py-0.5 rounded text-[10px] animate-pulse">{triggeredAlerts.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('apis')}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'apis' 
              ? 'text-teal-400 border-b-2 border-teal-400 bg-teal-400/5' 
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <i className="ri-server-line"></i>
          APIs
          {isAnyApiDown && (
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Tab: Monitor de Movimentos */}
        {activeTab === 'monitor' && (
          <>
            {/* Estatísticas rápidas */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-white">{stats.totalMovements}</div>
                <div className="text-[10px] text-zinc-500">Movimentos</div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-emerald-400">{stats.upMoves}</div>
                <div className="text-[10px] text-zinc-500">Subidas</div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-red-400">{stats.downMoves}</div>
                <div className="text-[10px] text-zinc-500">Descidas</div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-orange-400">{stats.steamMoves}</div>
                <div className="text-[10px] text-zinc-500">Steam</div>
              </div>
            </div>

            {/* Lista de movimentos recentes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400">Movimentos Recentes</span>
                <span className="text-[10px] text-zinc-500">Média: {stats.averageChange}</span>
              </div>

              {recentMovements.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  <i className="ri-line-chart-line text-3xl mb-2 block opacity-50"></i>
                  A aguardar movimentos de odds...
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                  {recentMovements.slice(0, 20).map((movement, idx) => (
                    <div
                      key={`${movement.matchId}-${movement.market}-${idx}`}
                      className={`bg-zinc-800/30 rounded-lg p-2.5 border-l-2 ${
                        movement.isSteamMove 
                          ? 'border-orange-500 bg-orange-500/5' 
                          : movement.isValueBet 
                            ? 'border-emerald-500 bg-emerald-500/5'
                            : movement.direction === 'up' 
                              ? 'border-emerald-500/50' 
                              : 'border-red-500/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {movement.isSteamMove && (
                              <span className="bg-orange-500/20 text-orange-400 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                <i className="ri-fire-line"></i>
                                STEAM
                              </span>
                            )}
                            {movement.isValueBet && (
                              <span className="bg-emerald-500/20 text-emerald-400 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                <i className="ri-money-dollar-circle-line"></i>
                                VALUE
                              </span>
                            )}
                            <span className="text-[10px] text-zinc-500">{formatTimeAgo(movement.timestamp)}</span>
                          </div>
                          <div className="text-xs text-white font-medium truncate">
                            {movement.homeTeam} vs {movement.awayTeam}
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate">{movement.league}</div>
                        </div>
                        
                        <div className="text-right">
                          <div className="flex items-center gap-1.5">
                            <span className="text-zinc-500 text-xs">{movement.previousOdd.toFixed(2)}</span>
                            <i className={`ri-arrow-right-line text-zinc-600 text-[10px]`}></i>
                            <span className={`font-bold text-sm ${getMovementColor(movement.direction)}`}>
                              {movement.currentOdd.toFixed(2)}
                            </span>
                          </div>
                          <div className={`text-[10px] font-medium ${getMovementColor(movement.direction)}`}>
                            {movement.direction === 'up' ? '+' : ''}{movement.changePercent.toFixed(1)}%
                          </div>
                          <div className="text-[9px] text-zinc-600 uppercase">{movement.market}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab: Alertas */}
        {activeTab === 'alerts' && (
          <>
            {/* Configurações rápidas */}
            <div className="bg-zinc-800/30 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300">Configurações de Alertas</span>
                <button
                  onClick={clearAll}
                  className="text-[10px] text-red-400 hover:text-red-300 cursor-pointer"
                >
                  Limpar todos
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enableSteamMoveAlerts}
                    onChange={(e) => updateConfig({ enableSteamMoveAlerts: e.target.checked })}
                    className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-700 text-amber-500 focus:ring-amber-500/50"
                  />
                  <span className="text-[11px] text-zinc-400">Steam Moves</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enableValueBetAlerts}
                    onChange={(e) => updateConfig({ enableValueBetAlerts: e.target.checked })}
                    className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-700 text-amber-500 focus:ring-amber-500/50"
                  />
                  <span className="text-[11px] text-zinc-400">Value Bets</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enableVariationAlerts}
                    onChange={(e) => updateConfig({ enableVariationAlerts: e.target.checked })}
                    className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-700 text-amber-500 focus:ring-amber-500/50"
                  />
                  <span className="text-[11px] text-zinc-400">Variações ({config.variationThreshold}%+)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enableThresholdAlerts}
                    onChange={(e) => updateConfig({ enableThresholdAlerts: e.target.checked })}
                    className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-700 text-amber-500 focus:ring-amber-500/50"
                  />
                  <span className="text-[11px] text-zinc-400">Thresholds</span>
                </label>
              </div>
            </div>

            {/* Alertas disparados */}
            {triggeredAlerts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-red-400">Alertas Disparados</span>
                  <span className="bg-red-500/20 text-red-400 text-[10px] px-1.5 py-0.5 rounded-full">{triggeredAlerts.length}</span>
                </div>
                
                <div className="space-y-1.5">
                  {triggeredAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-lg p-2.5 border ${getAlertColor(alert.type)} animate-pulse`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <i className={`${getAlertIcon(alert.type)} text-lg`}></i>
                          <div>
                            <div className="text-xs font-medium text-white">
                              {alert.homeTeam} vs {alert.awayTeam}
                            </div>
                            <div className="text-[10px] text-zinc-400">
                              {alert.type === 'steam_move' && `Steam Move: ${alert.variationPercent?.toFixed(1)}%`}
                              {alert.type === 'value_bet' && `Value Bet: ${alert.currentValue.toFixed(2)}`}
                              {alert.type === 'threshold' && `${alert.market} ${alert.condition} ${alert.targetValue}`}
                              {alert.type === 'variation' && `Variação: ${alert.variationPercent?.toFixed(1)}%`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => markAsNotified(alert.id)}
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-white cursor-pointer"
                            title="Marcar como visto"
                          >
                            <i className="ri-check-line text-sm"></i>
                          </button>
                          <button
                            onClick={() => removeAlert(alert.id)}
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400 cursor-pointer"
                            title="Remover"
                          >
                            <i className="ri-close-line text-sm"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Alertas ativos */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-400">Alertas Ativos</span>
                <span className="bg-zinc-700 text-zinc-400 text-[10px] px-1.5 py-0.5 rounded-full">{activeAlerts.length}</span>
              </div>
              
              {activeAlerts.length === 0 ? (
                <div className="text-center py-6 text-zinc-500 text-sm">
                  <i className="ri-notification-off-line text-2xl mb-2 block opacity-50"></i>
                  Nenhum alerta configurado
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {activeAlerts.filter(a => !a.triggeredAt).map((alert) => (
                    <div
                      key={alert.id}
                      className="bg-zinc-800/30 rounded-lg p-2.5 border border-zinc-700/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-medium text-white">
                            {alert.homeTeam} vs {alert.awayTeam}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {alert.market} • {alert.condition} {alert.targetValue}
                          </div>
                        </div>
                        <button
                          onClick={() => removeAlert(alert.id)}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400 cursor-pointer"
                        >
                          <i className="ri-close-line text-sm"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab: Estado das APIs */}
        {activeTab === 'apis' && (
          <>
            {/* API 1 - API-Football */}
            <div className={`rounded-lg p-3 border ${api1Health.isCircuitOpen ? 'border-red-500/50 bg-red-500/5' : api1Health.isHealthy ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${getHealthColor(api1Health.isHealthy, api1Health.isCircuitOpen)} ${api1Health.isHealthy && !api1Health.isCircuitOpen ? 'animate-pulse' : ''}`} 
                       style={{ backgroundColor: api1Health.isCircuitOpen ? '#ef4444' : api1Health.isHealthy ? '#10b981' : '#f59e0b' }}></div>
                  <span className="font-medium text-white text-sm">{api1Health.name}</span>
                  {api1Health.isCircuitOpen && (
                    <span className="bg-red-500/20 text-red-400 text-[9px] font-bold px-1.5 py-0.5 rounded">CIRCUIT OPEN</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={checkApi1Health}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-white cursor-pointer"
                    title="Verificar saúde"
                  >
                    <i className="ri-refresh-line text-sm"></i>
                  </button>
                  {api1Health.isCircuitOpen && (
                    <button
                      onClick={resetApi1}
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-700 text-amber-400 hover:text-amber-300 cursor-pointer"
                      title="Reset circuit breaker"
                    >
                      <i className="ri-restart-line text-sm"></i>
                    </button>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-white">{api1Health.totalRequests}</div>
                  <div className="text-[10px] text-zinc-500">Requisições</div>
                </div>
                <div>
                  <div className={`text-lg font-bold ${api1Health.successRate >= 90 ? 'text-emerald-400' : api1Health.successRate >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                    {api1Health.successRate.toFixed(0)}%
                  </div>
                  <div className="text-[10px] text-zinc-500">Sucesso</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-sky-400">{Math.round(metrics.api1.averageLatency)}ms</div>
                  <div className="text-[10px] text-zinc-500">Latência</div>
                </div>
              </div>
              
              {api1Health.lastError && (
                <div className="mt-2 text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1 truncate">
                  <i className="ri-error-warning-line mr-1"></i>
                  {api1Health.lastError}
                </div>
              )}
            </div>

            {/* API 2 - The Odds API */}
            <div className={`rounded-lg p-3 border ${api2Health.isCircuitOpen ? 'border-red-500/50 bg-red-500/5' : api2Health.isHealthy ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${api2Health.isHealthy && !api2Health.isCircuitOpen ? 'animate-pulse' : ''}`}
                       style={{ backgroundColor: api2Health.isCircuitOpen ? '#ef4444' : api2Health.isHealthy ? '#10b981' : '#f59e0b' }}></div>
                  <span className="font-medium text-white text-sm">{api2Health.name}</span>
                  {api2Health.isCircuitOpen && (
                    <span className="bg-red-500/20 text-red-400 text-[9px] font-bold px-1.5 py-0.5 rounded">CIRCUIT OPEN</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={checkApi2Health}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-white cursor-pointer"
                    title="Verificar saúde"
                  >
                    <i className="ri-refresh-line text-sm"></i>
                  </button>
                  {api2Health.isCircuitOpen && (
                    <button
                      onClick={resetApi2}
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-700 text-amber-400 hover:text-amber-300 cursor-pointer"
                      title="Reset circuit breaker"
                    >
                      <i className="ri-restart-line text-sm"></i>
                    </button>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-white">{api2Health.totalRequests}</div>
                  <div className="text-[10px] text-zinc-500">Requisições</div>
                </div>
                <div>
                  <div className={`text-lg font-bold ${api2Health.successRate >= 90 ? 'text-emerald-400' : api2Health.successRate >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                    {api2Health.successRate.toFixed(0)}%
                  </div>
                  <div className="text-[10px] text-zinc-500">Sucesso</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-sky-400">{Math.round(metrics.api2.averageLatency)}ms</div>
                  <div className="text-[10px] text-zinc-500">Latência</div>
                </div>
              </div>
              
              {api2Health.lastError && (
                <div className="mt-2 text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1 truncate">
                  <i className="ri-error-warning-line mr-1"></i>
                  {api2Health.lastError}
                </div>
              )}
            </div>

            {/* Circuit Breaker Info */}
            <div className="bg-zinc-800/30 rounded-lg p-3">
              <div className="text-xs font-medium text-zinc-400 mb-2">Circuit Breaker</div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Threshold de Falhas</span>
                  <span className="text-zinc-300">{metrics.circuitBreakerConfig.failureThreshold}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Tempo de Recuperação</span>
                  <span className="text-zinc-300">{metrics.circuitBreakerConfig.recoveryTimeout / 1000}s</span>
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-zinc-700/50">
                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                  <i className="ri-information-line"></i>
                  <span>
                    API ativa: <span className={`font-medium ${activeApi === 'both' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {activeApi === 'both' ? 'Ambas' : activeApi === 'api1' ? 'API-Football' : 'The Odds API'}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

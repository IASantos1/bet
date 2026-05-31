import { useState, useEffect } from 'react';
import { cacheOrchestrator } from '../../services/cache/cacheOrchestrator';

/**
 * 📊 Monitor de Saúde do Cache
 * Exibe métricas em tempo real dos serviços de cache
 */
export default function CacheHealthMonitor() {
  const [metrics, setMetrics] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateMetrics = () => {
      setMetrics(cacheOrchestrator.getConsolidatedMetrics());
      setHealth(cacheOrchestrator.healthCheck());
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, 3000);

    return () => clearInterval(interval);
  }, []);

  if (!metrics || !health) return null;

  const getHealthColor = (healthy: boolean) => 
    healthy ? 'text-green-500' : 'text-red-500';

  const getHealthIcon = (healthy: boolean) => 
    healthy ? '✓' : '⚠';

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="fixed bottom-24 right-6 z-50 w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
        title="Métricas de Cache"
      >
        <i className="ri-dashboard-line text-white text-xl"></i>
      </button>

      {/* Painel de métricas */}
      {isVisible && (
        <div className="fixed bottom-40 right-6 z-50 w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <i className="ri-dashboard-line text-white text-xl"></i>
              <h3 className="text-white font-semibold">Cache Monitor</h3>
            </div>
            <button
              onClick={() => setIsVisible(false)}
              className="text-white hover:bg-white/20 rounded-lg w-8 h-8 flex items-center justify-center transition-colors"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>

          {/* Conteúdo */}
          <div className="p-4 max-h-96 overflow-y-auto">
            {/* Status Geral */}
            <div className={`mb-4 p-3 rounded-lg ${health.overall.healthy ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-2xl ${getHealthColor(health.overall.healthy)}`}>
                  {getHealthIcon(health.overall.healthy)}
                </span>
                <span className="font-semibold text-gray-800">Status Geral</span>
              </div>
              <p className="text-sm text-gray-600">{health.overall.message}</p>
            </div>

            {/* Métricas Consolidadas */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-xs text-blue-600 font-medium mb-1">Taxa de Acerto</div>
                <div className="text-2xl font-bold text-blue-700">
                  {metrics.overall.overallHitRate.toFixed(1)}%
                </div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-xs text-purple-600 font-medium mb-1">Tamanho Total</div>
                <div className="text-2xl font-bold text-purple-700">
                  {metrics.overall.totalCacheSize}
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-xs text-green-600 font-medium mb-1">Cache Hits</div>
                <div className="text-2xl font-bold text-green-700">
                  {metrics.overall.totalHits}
                </div>
              </div>
              <div className="bg-orange-50 rounded-lg p-3">
                <div className="text-xs text-orange-600 font-medium mb-1">Cache Misses</div>
                <div className="text-2xl font-bold text-orange-700">
                  {metrics.overall.totalMisses}
                </div>
              </div>
            </div>

            {/* Serviços Individuais */}
            <div className="space-y-3">
              {/* Odds Cache */}
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <i className="ri-line-chart-line text-blue-600"></i>
                    <span className="font-semibold text-gray-800">Odds</span>
                  </div>
                  <span className={`text-lg ${getHealthColor(health.odds.healthy)}`}>
                    {getHealthIcon(health.odds.healthy)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500">Hit Rate</div>
                    <div className="font-semibold text-gray-800">
                      {metrics.odds.hitRate.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Hits</div>
                    <div className="font-semibold text-gray-800">{metrics.odds.hits}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Tamanho</div>
                    <div className="font-semibold text-gray-800">{health.odds.size}</div>
                  </div>
                </div>
              </div>

              {/* Events Cache */}
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <i className="ri-trophy-line text-green-600"></i>
                    <span className="font-semibold text-gray-800">Eventos</span>
                  </div>
                  <span className={`text-lg ${getHealthColor(health.events.healthy)}`}>
                    {getHealthIcon(health.events.healthy)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500">Hit Rate</div>
                    <div className="font-semibold text-gray-800">
                      {metrics.events.hitRate.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Hits</div>
                    <div className="font-semibold text-gray-800">{metrics.events.hits}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Tamanho</div>
                    <div className="font-semibold text-gray-800">{health.events.size}</div>
                  </div>
                </div>
              </div>

              {/* User Cache */}
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <i className="ri-user-line text-purple-600"></i>
                    <span className="font-semibold text-gray-800">Utilizador</span>
                  </div>
                  <span className={`text-lg ${getHealthColor(health.user.healthy)}`}>
                    {getHealthIcon(health.user.healthy)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500">Hit Rate</div>
                    <div className="font-semibold text-gray-800">
                      {metrics.user.hitRate.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Hits</div>
                    <div className="font-semibold text-gray-800">{metrics.user.hits}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Tamanho</div>
                    <div className="font-semibold text-gray-800">{health.user.size}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  cacheOrchestrator.cleanupExpired();
                  alert('Cache expirado limpo!');
                }}
                className="flex-1 px-3 py-2 bg-orange-100 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-200 transition-colors whitespace-nowrap"
              >
                Limpar Expirado
              </button>
              <button
                onClick={() => {
                  cacheOrchestrator.resetAllMetrics();
                  alert('Métricas resetadas!');
                }}
                className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors whitespace-nowrap"
              >
                Resetar Métricas
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

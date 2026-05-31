/**
 * 📊 Componente de Monitorização de Cache em Tempo Real
 * Exibe estatísticas e métricas do sistema de cache
 */

import React, { useState, useEffect } from 'react';
import { cacheManager, CacheStrategy } from '../../services/cache/cacheManager';

interface CacheStats {
  memorySize: number;
  strategies: Record<string, {
    hits: number;
    misses: number;
    evictions: number;
    hitRate: string;
    lastUpdate: string;
  }>;
}

export const CacheMonitor: React.FC = () => {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateStats = () => {
      const currentStats = cacheManager.getStats() as CacheStats;
      setStats(currentStats);
    };

    updateStats();
    const interval = setInterval(updateStats, 3000);

    return () => clearInterval(interval);
  }, []);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 w-12 h-12 bg-teal-500 text-white rounded-full shadow-lg hover:bg-teal-600 transition-colors flex items-center justify-center z-50"
        title="Mostrar estatísticas de cache"
      >
        <i className="ri-dashboard-line text-xl"></i>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 max-h-[600px] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-gradient-to-r from-teal-500 to-teal-600 text-white p-4 rounded-t-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <i className="ri-dashboard-line text-xl"></i>
          <h3 className="font-bold text-lg">Monitor de Cache</h3>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="w-8 h-8 hover:bg-white/20 rounded-full transition-colors flex items-center justify-center"
        >
          <i className="ri-close-line text-xl"></i>
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="p-4 space-y-4">
          {/* Resumo Geral */}
          <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg p-4 border border-teal-200">
            <div className="flex items-center gap-2 mb-3">
              <i className="ri-database-2-line text-teal-600 text-lg"></i>
              <h4 className="font-semibold text-gray-800">Resumo Geral</h4>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 border border-teal-100">
                <div className="text-xs text-gray-500 mb-1">Itens em Memória</div>
                <div className="text-2xl font-bold text-teal-600">{stats.memorySize}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-teal-100">
                <div className="text-xs text-gray-500 mb-1">Estratégias Ativas</div>
                <div className="text-2xl font-bold text-teal-600">
                  {Object.keys(stats.strategies).length}
                </div>
              </div>
            </div>
          </div>

          {/* Odds ao Vivo */}
          {stats.strategies[CacheStrategy.LIVE_ODDS] && (
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
              <div className="flex items-center gap-2 mb-3">
                <i className="ri-pulse-line text-red-600 text-lg"></i>
                <h4 className="font-semibold text-gray-800">Odds ao Vivo</h4>
                <span className="ml-auto text-xs bg-red-500 text-white px-2 py-1 rounded-full">
                  TTL: 2s
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white rounded p-2 border border-red-100">
                  <div className="text-xs text-gray-500">Hits</div>
                  <div className="font-bold text-red-600">
                    {stats.strategies[CacheStrategy.LIVE_ODDS].hits}
                  </div>
                </div>
                <div className="bg-white rounded p-2 border border-red-100">
                  <div className="text-xs text-gray-500">Misses</div>
                  <div className="font-bold text-red-600">
                    {stats.strategies[CacheStrategy.LIVE_ODDS].misses}
                  </div>
                </div>
                <div className="bg-white rounded p-2 border border-red-100">
                  <div className="text-xs text-gray-500">Taxa de Hit</div>
                  <div className="font-bold text-red-600">
                    {stats.strategies[CacheStrategy.LIVE_ODDS].hitRate}
                  </div>
                </div>
                <div className="bg-white rounded p-2 border border-red-100">
                  <div className="text-xs text-gray-500">Evictions</div>
                  <div className="font-bold text-red-600">
                    {stats.strategies[CacheStrategy.LIVE_ODDS].evictions}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Jogos do Dia */}
          {stats.strategies[CacheStrategy.DAILY_MATCHES] && (
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-3">
                <i className="ri-football-line text-blue-600 text-lg"></i>
                <h4 className="font-semibold text-gray-800">Jogos do Dia</h4>
                <span className="ml-auto text-xs bg-blue-500 text-white px-2 py-1 rounded-full">
                  TTL: 20s
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white rounded p-2 border border-blue-100">
                  <div className="text-xs text-gray-500">Hits</div>
                  <div className="font-bold text-blue-600">
                    {stats.strategies[CacheStrategy.DAILY_MATCHES].hits}
                  </div>
                </div>
                <div className="bg-white rounded p-2 border border-blue-100">
                  <div className="text-xs text-gray-500">Misses</div>
                  <div className="font-bold text-blue-600">
                    {stats.strategies[CacheStrategy.DAILY_MATCHES].misses}
                  </div>
                </div>
                <div className="bg-white rounded p-2 border border-blue-100">
                  <div className="text-xs text-gray-500">Taxa de Hit</div>
                  <div className="font-bold text-blue-600">
                    {stats.strategies[CacheStrategy.DAILY_MATCHES].hitRate}
                  </div>
                </div>
                <div className="bg-white rounded p-2 border border-blue-100">
                  <div className="text-xs text-gray-500">Evictions</div>
                  <div className="font-bold text-blue-600">
                    {stats.strategies[CacheStrategy.DAILY_MATCHES].evictions}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tabelas */}
          {stats.strategies[CacheStrategy.STANDINGS] && (
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
              <div className="flex items-center gap-2 mb-3">
                <i className="ri-trophy-line text-green-600 text-lg"></i>
                <h4 className="font-semibold text-gray-800">Tabelas</h4>
                <span className="ml-auto text-xs bg-green-500 text-white px-2 py-1 rounded-full">
                  TTL: 5min
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white rounded p-2 border border-green-100">
                  <div className="text-xs text-gray-500">Hits</div>
                  <div className="font-bold text-green-600">
                    {stats.strategies[CacheStrategy.STANDINGS].hits}
                  </div>
                </div>
                <div className="bg-white rounded p-2 border border-green-100">
                  <div className="text-xs text-gray-500">Misses</div>
                  <div className="font-bold text-green-600">
                    {stats.strategies[CacheStrategy.STANDINGS].misses}
                  </div>
                </div>
                <div className="bg-white rounded p-2 border border-green-100">
                  <div className="text-xs text-gray-500">Taxa de Hit</div>
                  <div className="font-bold text-green-600">
                    {stats.strategies[CacheStrategy.STANDINGS].hitRate}
                  </div>
                </div>
                <div className="bg-white rounded p-2 border border-green-100">
                  <div className="text-xs text-gray-500">Evictions</div>
                  <div className="font-bold text-green-600">
                    {stats.strategies[CacheStrategy.STANDINGS].evictions}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Conteúdo Estático */}
          {stats.strategies[CacheStrategy.STATIC_CONTENT] && (
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
              <div className="flex items-center gap-2 mb-3">
                <i className="ri-file-text-line text-purple-600 text-lg"></i>
                <h4 className="font-semibold text-gray-800">Conteúdo Estático</h4>
                <span className="ml-auto text-xs bg-purple-500 text-white px-2 py-1 rounded-full">
                  TTL: 1h
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white rounded p-2 border border-purple-100">
                  <div className="text-xs text-gray-500">Hits</div>
                  <div className="font-bold text-purple-600">
                    {stats.strategies[CacheStrategy.STATIC_CONTENT].hits}
                  </div>
                </div>
                <div className="bg-white rounded p-2 border border-purple-100">
                  <div className="text-xs text-gray-500">Misses</div>
                  <div className="font-bold text-purple-600">
                    {stats.strategies[CacheStrategy.STATIC_CONTENT].misses}
                  </div>
                </div>
                <div className="bg-white rounded p-2 border border-purple-100">
                  <div className="text-xs text-gray-500">Taxa de Hit</div>
                  <div className="font-bold text-purple-600">
                    {stats.strategies[CacheStrategy.STATIC_CONTENT].hitRate}
                  </div>
                </div>
                <div className="bg-white rounded p-2 border border-purple-100">
                  <div className="text-xs text-gray-500">Evictions</div>
                  <div className="font-bold text-purple-600">
                    {stats.strategies[CacheStrategy.STATIC_CONTENT].evictions}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-2">
            <button
              onClick={() => cacheManager.clearAll()}
              className="flex-1 bg-red-500 text-white py-2 px-4 rounded-lg hover:bg-red-600 transition-colors text-sm font-medium flex items-center justify-center gap-2"
            >
              <i className="ri-delete-bin-line"></i>
              Limpar Cache
            </button>
            <button
              onClick={() => setStats(cacheManager.getStats() as CacheStats)}
              className="flex-1 bg-teal-500 text-white py-2 px-4 rounded-lg hover:bg-teal-600 transition-colors text-sm font-medium flex items-center justify-center gap-2"
            >
              <i className="ri-refresh-line"></i>
              Atualizar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

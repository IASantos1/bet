
import { useState, useEffect } from 'react';
import { useApiCache } from '../../hooks/useApiCache';

interface CacheStatsDisplayProps {
  showDetails?: boolean;
}

/**
 * Componente para exibir estatísticas do cache de API
 * Inclui: Sincronização entre abas, Pré-carregamento, Desduplicação
 */
export function CacheStatsDisplay({ showDetails = false }: CacheStatsDisplayProps) {
  const { stats, popularKeys, clearCache, refreshStats } = useApiCache();
  const [isExpanded, setIsExpanded] = useState(showDetails);
  const [activeTab, setActiveTab] = useState<'geral' | 'avancado'>('geral');
  const [syncPulse, setSyncPulse] = useState(false);
  const [lastSyncCount, setLastSyncCount] = useState(0);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // Efeito de pulso quando há sincronização entre abas
  useEffect(() => {
    if (stats.crossTabSyncs > lastSyncCount && lastSyncCount > 0) {
      setSyncPulse(true);
      const t = setTimeout(() => setSyncPulse(false), 1200);
      return () => clearTimeout(t);
    }
    setLastSyncCount(stats.crossTabSyncs);
  }, [stats.crossTabSyncs, lastSyncCount]);

  const hitRateValue = parseFloat(stats.hitRate);
  const hitRateColor = hitRateValue >= 70
    ? 'text-emerald-400'
    : hitRateValue >= 40
      ? 'text-amber-400'
      : 'text-red-400';

  const hitRateBg = hitRateValue >= 70
    ? 'bg-emerald-500'
    : hitRateValue >= 40
      ? 'bg-amber-500'
      : 'bg-red-500';

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={`fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-zinc-800/90 backdrop-blur-sm rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 transition-all cursor-pointer ${syncPulse ? 'ring-2 ring-teal-400/50' : ''}`}
      >
        <i className="ri-database-2-line text-emerald-400"></i>
        <span>Cache: <span className={hitRateColor}>{stats.hitRate}</span></span>
        <span className="text-zinc-500">|</span>
        <span className="text-emerald-400">{stats.requestsAvoided}</span>
        <span className="text-zinc-500">evitadas</span>
        {stats.crossTabSyncs > 0 && (
          <>
            <span className="text-zinc-500">|</span>
            <span className={`flex items-center gap-1 ${syncPulse ? 'text-teal-400' : 'text-zinc-400'}`}>
              <i className="ri-links-line"></i>
              {stats.crossTabSyncs}
            </span>
          </>
        )}
        {stats.deduplicatedRequests > 0 && (
          <>
            <span className="text-zinc-500">|</span>
            <span className="text-orange-400 flex items-center gap-1">
              <i className="ri-git-merge-line"></i>
              {stats.deduplicatedRequests}
            </span>
          </>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 w-80 bg-zinc-900/95 backdrop-blur-sm rounded-xl border border-zinc-700 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <i className="ri-database-2-line text-emerald-400"></i>
          <span className="font-medium text-white text-sm">Cache Avançado</span>
          {syncPulse && (
            <span className="flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
            </span>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          <i className="ri-close-line"></i>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-700">
        <button
          onClick={() => setActiveTab('geral')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${activeTab === 'geral' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5' : 'text-zinc-400 hover:text-zinc-200'}`}
        >
          Geral
        </button>
        <button
          onClick={() => setActiveTab('avancado')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${activeTab === 'avancado' ? 'text-teal-400 border-b-2 border-teal-400 bg-teal-400/5' : 'text-zinc-400 hover:text-zinc-200'}`}
        >
          Avançado
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {activeTab === 'geral' && (
          <>
            {/* Taxa de Acerto */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Taxa de Acerto</span>
              <span className={`font-bold text-lg ${hitRateColor}`}>{stats.hitRate}</span>
            </div>

            {/* Barra de progresso */}
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${hitRateBg}`}
                style={{ width: stats.hitRate }}
              />
            </div>

            {/* Grid de stats */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="bg-zinc-800/50 rounded-lg p-2.5">
                <div className="text-[10px] text-zinc-500 mb-0.5">Requisições</div>
                <div className="text-base font-semibold text-white">{stats.totalRequests}</div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2.5">
                <div className="text-[10px] text-zinc-500 mb-0.5">Cache Hits</div>
                <div className="text-base font-semibold text-emerald-400">{stats.cacheHits}</div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2.5">
                <div className="text-[10px] text-zinc-500 mb-0.5">Cache Misses</div>
                <div className="text-base font-semibold text-amber-400">{stats.cacheMisses}</div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2.5">
                <div className="text-[10px] text-zinc-500 mb-0.5">Em Memória</div>
                <div className="text-base font-semibold text-sky-400">{stats.memoryCacheSize}</div>
              </div>
            </div>

            {/* Economia */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
              <div className="flex items-center gap-2 text-emerald-400">
                <i className="ri-leaf-line"></i>
                <span className="text-xs font-medium">{stats.estimatedSavings}</span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'avancado' && (
          <>
            {/* Sincronização entre abas */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-links-line text-teal-400"></i>
                </div>
                Sincronização entre Abas
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Sincronizações</span>
                  <span className={`font-semibold ${stats.crossTabSyncs > 0 ? 'text-teal-400' : 'text-zinc-500'}`}>
                    {stats.crossTabSyncs}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">ID da Aba</span>
                  <span className="text-zinc-500 font-mono text-[10px]">{stats.tabId.slice(0, 16)}...</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 pt-1 border-t border-zinc-700/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
                  Dados partilhados automaticamente entre abas
                </div>
              </div>
            </div>

            {/* Desduplicação */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-git-merge-line text-orange-400"></i>
                </div>
                Desduplicação de Requisições
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Requisições desduplicadas</span>
                  <span className={`font-semibold ${stats.deduplicatedRequests > 0 ? 'text-orange-400' : 'text-zinc-500'}`}>
                    {stats.deduplicatedRequests}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Em voo agora</span>
                  <span className={`font-semibold ${stats.inflightRequests > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                    {stats.inflightRequests}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 pt-1 border-t border-zinc-700/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                  Requisições duplicadas são fundidas automaticamente
                </div>
              </div>
            </div>

            {/* Pré-carregamento */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-rocket-line text-violet-400"></i>
                </div>
                Pré-carregamento Inteligente
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Itens pré-carregados</span>
                  <span className={`font-semibold ${stats.preloadedItems > 0 ? 'text-violet-400' : 'text-zinc-500'}`}>
                    {stats.preloadedItems}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Chaves rastreadas</span>
                  <span className="text-zinc-300 font-semibold">{stats.trackedPopularKeys}</span>
                </div>

                {/* Top chaves populares */}
                {popularKeys.length > 0 && (
                  <div className="pt-2 border-t border-zinc-700/50 space-y-1">
                    <div className="text-[10px] text-zinc-500 font-medium">Mais acedidas:</div>
                    {popularKeys.map((pk, i) => (
                      <div key={pk.key} className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400 truncate max-w-[160px]">
                          <span className="text-zinc-600 mr-1">{i + 1}.</span>
                          {pk.key}
                        </span>
                        <span className="text-zinc-500 whitespace-nowrap ml-2">{pk.accessCount}x</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 pt-1 border-t border-zinc-700/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"></span>
                  Dados populares renovados antes de expirar
                </div>
              </div>
            </div>
          </>
        )}

        {/* Ações */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={refreshStats}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line"></i>
            Atualizar
          </button>
          <button
            onClick={clearCache}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs text-red-400 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-delete-bin-line"></i>
            Limpar
          </button>
        </div>
      </div>
    </div>
  );
}

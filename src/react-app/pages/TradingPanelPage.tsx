import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';

type TradingEvent = {
  id: string;
  match: string;
  league: string;
  sport: string;
  event_date: string;
  trading_status: 'pending' | 'approved' | 'suspended' | null;
  manual_odds: { home?: number; draw?: number; away?: number } | null;
  home_odd?: number | null;
  draw_odd?: number | null;
  away_odd?: number | null;
  is_live?: number | null;
};

export default function TradingPanelPage() {
  const { darkMode, isOperator } = useApp();
  const [events, setEvents] = useState<TradingEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'suspended'>('all');
  const [sportFilter, setSportFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingOdds, setEditingOdds] = useState<{ home: string; draw: string; away: string } | null>(null);
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Robo de Limpeza Automática
  const [autoClean, setAutoClean] = useState(true);
  const [cleanerActivity, setCleanerActivity] = useState<string>('Inativo');

  // Robo de Correção de Odds
  const [showRobotConfig, setShowRobotConfig] = useState(false);
  const [robotConfig, setRobotConfig] = useState({
    margin: 7,       // %
    homeBoost: 10,   // % (fallback)
    awayPenalty: 5,  // % (fallback)
    smartMode: true,
  });
  const [robotRunning, setRobotRunning] = useState(false);
  const [robotProgress, setRobotProgress] = useState(0);

  // Carrega eventos
  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      if (sportFilter !== 'all') params.set('sport', sportFilter);
      if (bulkFrom) params.set('from', bulkFrom);
      if (bulkTo) params.set('to', bulkTo);

      const res = await apiFetch<TradingEvent[]>(`/api/trading/events?${params}`);
      setEvents(res || []);
    } catch (err) {
      console.error('Erro ao carregar eventos:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, sportFilter, bulkFrom, bulkTo]);

  // Eventos visíveis após filtro
  const visibleEvents = (() => {
    if (!events.length) return [];
    let filtered = events;

    if (filter !== 'all') {
      filtered = filtered.filter(ev => ev.trading_status === filter);
    }

    if (sportFilter !== 'all') {
      filtered = filtered.filter(ev => ev.sport.toLowerCase() === sportFilter.toLowerCase());
    }

    return filtered;
  })();

  // Tabela de ajuste inteligente baseado na diferença de probabilidade
  const getSmartAdjustment = (probHome: number, probAway: number) => {
    const diff = Math.abs(probHome - probAway) * 100;
    const isHomeFav = probHome >= probAway;

    if (diff <= 5.99) return { boost: 8, penalty: 4 };
    if (diff <= 15.99) return isHomeFav ? { boost: 10, penalty: 5 } : { boost: 8, penalty: 4 };
    if (diff <= 25.99) return isHomeFav ? { boost: 12, penalty: 6 } : { boost: 8, penalty: 4 };
    return isHomeFav ? { boost: 15, penalty: 7 } : { boost: 6, penalty: 3 };
  };

  // Função principal do robô de odds
  const runOddsRobot = async () => {
    const candidates = selectedIds.size > 0
      ? visibleEvents.filter(e => selectedIds.has(e.id))
      : visibleEvents;

    if (!candidates.length) {
      alert('Nenhum evento selecionado ou visível para processar.');
      return;
    }

    const count = candidates.length;
    const modeText = robotConfig.smartMode ? 'INTELIGENTE (baseado em força)' : 'MANUAL';
    if (!confirm(`Executar robô ${modeText} em ${count} evento(s)?`)) return;

    setRobotRunning(true);
    setRobotProgress(0);
    let success = 0;
    let failed = 0;

    try {
      for (let i = 0; i < candidates.length; i++) {
        const ev = candidates[i];

        // 1. Pegar odds fonte (prioriza manual > importadas)
        const src = ev.manual_odds || {};
        const h = Number(src.home ?? ev.home_odd ?? 0);
        const d = Number(src.draw ?? ev.draw_odd ?? 0);
        const a = Number(src.away ?? ev.away_odd ?? 0);

        if (h <= 1 || a <= 1) {
          failed++;
          continue; // ignora odds inválidas
        }

        const hasDraw = d > 1.01;

        // 2. Converter para probabilidades implícitas
        const pH = 1 / h;
        const pA = 1 / a;
        const pD = hasDraw ? 1 / d : 0;

        let sum = pH + pA + pD;
        let cleanPH = pH / sum;
        let cleanPA = pA / sum;
        let cleanPD = hasDraw ? pD / sum : 0;

        // 3. Correção de empate excessivo (evita mercados quebrados)
        const MAX_DRAW = 0.40;
        if (hasDraw && cleanPD > MAX_DRAW) {
          const oldRatio = cleanPH / (cleanPH + cleanPA);
          cleanPD = 0.26;
          const remaining = 1 - cleanPD;
          cleanPH = remaining * oldRatio;
          cleanPA = remaining * (1 - oldRatio);
        }

        // 4. Decidir ajustes
        let boost = robotConfig.homeBoost;
        let penalty = robotConfig.awayPenalty;

        if (robotConfig.smartMode) {
          const adj = getSmartAdjustment(cleanPH, cleanPA);
          boost = adj.boost;
          penalty = adj.penalty;
        }

        // 5. Aplicar boost/penalidade
        let adjPH = cleanPH * (1 + boost / 100);
        let adjPA = cleanPA * (1 - penalty / 100);
        let adjPD = cleanPD;

        // 6. Re-normalizar para 100%
        sum = adjPH + adjPA + adjPD;
        adjPH /= sum;
        adjPA /= sum;
        if (hasDraw) adjPD /= sum;

        // 7. Aplicar margem (overround)
        const target = 1 + robotConfig.margin / 100;
        const newH = Number((1 / (adjPH * target)).toFixed(2));
        const newA = Number((1 / (adjPA * target)).toFixed(2));
        const newD = hasDraw ? Number((1 / (adjPD * target)).toFixed(2)) : 0;

        // 8. Enviar para o backend
        const manualOdds = { home: newH, away: newA, ...(hasDraw && { draw: newD }) };

        await apiFetch('/api/trading/decision', {
          method: 'POST',
          body: JSON.stringify({
            eventId: ev.id,
            status: ev.trading_status || 'pending',
            manualOdds,
          }),
        });

        success++;
        setRobotProgress(Math.round(((i + 1) / candidates.length) * 100));
      }

      alert(`Robô concluído!\nSucesso: ${success}\nFalhas: ${failed}`);
      loadEvents(); // Recarrega tudo
    } catch (err) {
      console.error('Erro no robô:', err);
      alert('Erro ao processar alguns eventos.');
    } finally {
      setRobotRunning(false);
      setRobotProgress(0);
      setShowRobotConfig(false);
    }
  };

  // Auto-limpeza de eventos vazios
  useEffect(() => {
    if (!autoClean || !events.length) {
      setCleanerActivity('Inativo');
      return;
    }

    setCleanerActivity('Monitorando...');

    const timer = setInterval(async () => {
      const toSuspend = events.filter(ev => {
        if (ev.trading_status === 'suspended') return false;
        if (ev.manual_odds?.home || ev.manual_odds?.away) return false; // respeita manual
        return Number(ev.home_odd ?? 0) === 0 && Number(ev.away_odd ?? 0) === 0;
      });

      if (!toSuspend.length) return;

      setCleanerActivity(`Corrigindo ${toSuspend.length} eventos vazios...`);

      for (const ev of toSuspend) {
        try {
          await apiFetch('/api/trading/decision', {
            method: 'POST',
            body: JSON.stringify({ eventId: ev.id, status: 'suspended' }),
          });
        } catch {
          // ignore
        }
      }

      setCleanerActivity(`Suspendeu ${toSuspend.length} eventos vazios`);
      setTimeout(() => setCleanerActivity('Monitorando...'), 4000);
      loadEvents();
    }, 15000); // checa a cada 15 segundos

    return () => clearInterval(timer);
  }, [autoClean, events, loadEvents]);

  // Carrega eventos
  useEffect(() => {
    if (isOperator) loadEvents();
  }, [isOperator, loadEvents]);


  const computeMargin = (ev: TradingEvent) => {
    const h = Number(ev.manual_odds?.home ?? ev.home_odd ?? 0);
    const d = Number(ev.manual_odds?.draw ?? ev.draw_odd ?? 0);
    const a = Number(ev.manual_odds?.away ?? ev.away_odd ?? 0);

    const prices = [h, d, a].filter(v => v > 1.01);
    if (!prices.length) return null;

    const overround = prices.reduce((sum, v) => sum + 1 / v, 0);
    return Number(((overround - 1) * 100).toFixed(2));
  };

  const handleDecision = async (
    eventId: string,
    status: 'approved' | 'suspended',
    manualOdds?: { home: number; draw?: number; away: number }
  ) => {
    try {
      await apiFetch('/api/trading/decision', {
        method: 'POST',
        body: JSON.stringify({ eventId, status, manualOdds }),
      });

      setEvents(prev =>
        prev.map(e =>
          e.id === eventId ? { ...e, trading_status: status, manual_odds: manualOdds || e.manual_odds } : e
        )
      );

      if (!manualOdds) setExpandedId(null);
      setEditingOdds(null);
    } catch (err) {
      alert('Erro ao salvar decisão');
    }
  };

  const handleBulkDecision = async (status: 'approved' | 'suspended') => {
    if (!selectedIds.size) return;
    if (!confirm(`Tem certeza que deseja marcar ${selectedIds.size} eventos como ${status}?`)) return;

    setBulkLoading(true);
    try {
        const ids = Array.from(selectedIds);
        // Process in chunks or one by one
        for (const id of ids) {
            await apiFetch('/api/trading/decision', {
                method: 'POST',
                body: JSON.stringify({ eventId: id, status }),
            });
        }
        
        setEvents(prev => prev.map(e => selectedIds.has(e.id) ? { ...e, trading_status: status } : e));
        setSelectedIds(new Set());
    } catch (error) {
        console.error('Erro em ação em massa:', error);
        alert('Erro ao processar ação em massa');
    } finally {
        setBulkLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
      if (selectedIds.size === visibleEvents.length) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(visibleEvents.map(e => e.id)));
      }
  };

  const startEditing = (ev: TradingEvent) => {
      setExpandedId(ev.id);
      setEditingOdds({
          home: String(ev.manual_odds?.home ?? ev.home_odd ?? ''),
          draw: String(ev.manual_odds?.draw ?? ev.draw_odd ?? ''),
          away: String(ev.manual_odds?.away ?? ev.away_odd ?? ''),
      });
  };

  const saveManualOdds = async (eventId: string) => {
      if (!editingOdds) return;
      const h = parseFloat(editingOdds.home);
      const d = parseFloat(editingOdds.draw);
      const a = parseFloat(editingOdds.away);
      
      if (isNaN(h) || isNaN(a)) {
          alert('Odds inválidas');
          return;
      }
      
      await handleDecision(eventId, 'approved', { home: h, draw: isNaN(d) ? undefined : d, away: a });
  };

  if (!isOperator) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-center">
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-yellow-900/40 text-yellow-200' : 'bg-yellow-100 text-yellow-800'}`}>
          <h2 className="text-xl font-bold mb-2">Acesso Restrito</h2>
          <p>Você precisa ser operador para acessar o Painel de Trading.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Cabeçalho + Filtros */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Painel de Trading</h1>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => setAutoClean(!autoClean)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  autoClean
                    ? 'bg-blue-600/20 border-blue-600 text-blue-400'
                    : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'
                }`}
              >
                <span className={`w-3 h-3 rounded-full ${autoClean ? 'bg-blue-400 animate-pulse' : 'bg-gray-500'}`} />
                {autoClean ? 'Robô de Limpeza Ativo' : 'Robô Inativo'}
              </button>
              {autoClean && (
                <span className="text-sm text-gray-400 font-mono">[{cleanerActivity}]</span>
              )}
            </div>
          </div>

          {/* Botão Robô de Odds */}
          <button
            onClick={() => setShowRobotConfig(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-md transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37z" />
            </svg>
            Robô de Odds
          </button>
        </div>

        {/* Filters & Bulk Tools */}
        <div className={`p-4 rounded-lg mb-6 ${darkMode ? 'bg-gray-900' : 'bg-white shadow'}`}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <select 
                        value={filter} 
                        onChange={(e) => setFilter(e.target.value as any)}
                        className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}`}
                    >
                        <option value="all">Todos</option>
                        <option value="pending">Pendentes</option>
                        <option value="approved">Aprovados</option>
                        <option value="suspended">Suspensos</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Esporte</label>
                    <select 
                        value={sportFilter} 
                        onChange={(e) => setSportFilter(e.target.value)}
                        className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}`}
                    >
                        <option value="all">Todos</option>
                        <option value="soccer">Futebol</option>
                        <option value="basketball">Basquete</option>
                        <option value="tennis">Tênis</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Data (De/Até)</label>
                    <div className="flex gap-2">
                        <input 
                            type="date" 
                            value={bulkFrom} 
                            onChange={e => setBulkFrom(e.target.value)}
                            className={`w-1/2 p-2 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}`}
                        />
                        <input 
                            type="date" 
                            value={bulkTo} 
                            onChange={e => setBulkTo(e.target.value)}
                            className={`w-1/2 p-2 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}`}
                        />
                    </div>
                </div>
                <div className="flex gap-2">
                    {selectedIds.size > 0 && (
                        <>
                            <button 
                                onClick={() => handleBulkDecision('approved')}
                                disabled={bulkLoading}
                                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm flex-1"
                            >
                                Aprovar ({selectedIds.size})
                            </button>
                            <button 
                                onClick={() => handleBulkDecision('suspended')}
                                disabled={bulkLoading}
                                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm flex-1"
                            >
                                Suspender ({selectedIds.size})
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>

        {/* Modal Config Robô */}
        {showRobotConfig && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className={`w-full max-w-lg p-6 rounded-xl shadow-2xl ${darkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}>
              <h3 className="text-xl font-bold mb-5 flex items-center gap-3">
                <svg className="w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Configuração do Robô de Odds
              </h3>
              
              <div className="space-y-4 mb-6">
                <div>
                    <label className="block text-sm font-medium mb-1">Margem da Casa (%)</label>
                    <input 
                        type="range" min="1" max="20" step="0.5"
                        value={robotConfig.margin}
                        onChange={e => setRobotConfig({...robotConfig, margin: Number(e.target.value)})}
                        className="w-full"
                    />
                    <div className="text-right text-xs opacity-70">{robotConfig.margin}%</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Boost Casa (%)</label>
                        <input 
                            type="number"
                            value={robotConfig.homeBoost}
                            onChange={e => setRobotConfig({...robotConfig, homeBoost: Number(e.target.value)})}
                            className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}`}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Penalidade Visitante (%)</label>
                        <input 
                            type="number"
                            value={robotConfig.awayPenalty}
                            onChange={e => setRobotConfig({...robotConfig, awayPenalty: Number(e.target.value)})}
                            className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}`}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox"
                        id="smartMode"
                        checked={robotConfig.smartMode}
                        onChange={e => setRobotConfig({...robotConfig, smartMode: e.target.checked})}
                        className="w-4 h-4 rounded text-purple-600"
                    />
                    <label htmlFor="smartMode" className="text-sm font-medium">Modo Inteligente (Ajuste dinâmico baseado na probabilidade)</label>
                </div>
              </div>

              {robotRunning && (
                  <div className="mb-4">
                      <div className="h-2 w-full bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-purple-500 transition-all duration-300"
                            style={{ width: `${robotProgress}%` }}
                          />
                      </div>
                      <div className="text-center text-xs mt-1">{robotProgress}% concluído</div>
                  </div>
              )}

              <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setShowRobotConfig(false)}
                    disabled={robotRunning}
                    className="px-4 py-2 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                      Cancelar
                  </button>
                  <button 
                    onClick={runOddsRobot}
                    disabled={robotRunning}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium disabled:opacity-50"
                  >
                      {robotRunning ? 'Executando...' : 'Executar Robô'}
                  </button>
              </div>
            </div>
          </div>
        )}

        {/* Events Table */}
        <div className={`overflow-x-auto rounded-lg ${darkMode ? 'bg-gray-900' : 'bg-white shadow'}`}>
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className={`border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                        <th className="p-4 w-10">
                            <input 
                                type="checkbox" 
                                checked={visibleEvents.length > 0 && selectedIds.size === visibleEvents.length}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 rounded"
                            />
                        </th>
                        <th className="p-4">Evento</th>
                        <th className="p-4 text-center">Odds Atuais</th>
                        <th className="p-4 text-center">Margem</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-right">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={6} className="p-8 text-center text-gray-500">Carregando eventos...</td></tr>
                    ) : visibleEvents.length === 0 ? (
                        <tr><td colSpan={6} className="p-8 text-center text-gray-500">Nenhum evento encontrado.</td></tr>
                    ) : (
                        visibleEvents.map(ev => (
                            <div key={ev.id} className="contents">
                                <tr className={`border-b last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${selectedIds.has(ev.id) ? (darkMode ? 'bg-blue-900/20' : 'bg-blue-50') : ''} ${darkMode ? 'border-gray-800' : 'border-gray-100'}`}>
                                    <td className="p-4">
                                        <input 
                                            type="checkbox"
                                            checked={selectedIds.has(ev.id)}
                                            onChange={() => toggleSelect(ev.id)}
                                            className="w-4 h-4 rounded"
                                        />
                                    </td>
                                    <td className="p-4">
                                        <div className="font-medium text-lg">{ev.match}</div>
                                        <div className="text-xs text-gray-500">
                                            {ev.league} • {new Date(ev.event_date).toLocaleString()} • {ev.sport}
                                            {ev.is_live ? <span className="ml-2 text-red-500 font-bold">• AO VIVO</span> : ''}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex justify-center gap-2 font-mono text-sm">
                                        <span className={`flex justify-center items-center w-[70px] py-2 rounded font-bold ${ev.manual_odds ? 'bg-red-600 text-yellow-400 border border-yellow-400' : 'bg-red-600 text-white'}`}>
                                          {ev.manual_odds?.home ?? ev.home_odd ?? '-'}
                                        </span>
                                        <span className={`flex justify-center items-center w-[70px] py-2 rounded font-bold ${ev.manual_odds ? 'bg-red-600 text-yellow-400 border border-yellow-400' : 'bg-red-600 text-white'}`}>
                                          {ev.manual_odds?.draw ?? ev.draw_odd ?? '-'}
                                        </span>
                                        <span className={`flex justify-center items-center w-[70px] py-2 rounded font-bold ${ev.manual_odds ? 'bg-red-600 text-yellow-400 border border-yellow-400' : 'bg-red-600 text-white'}`}>
                                          {ev.manual_odds?.away ?? ev.away_odd ?? '-'}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="text-xs font-mono text-gray-400">{computeMargin(ev)}%</span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                            ${ev.trading_status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 
                                              ev.trading_status === 'suspended' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 
                                              'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                            {ev.trading_status === 'approved' ? 'Aprovado' : 
                                             ev.trading_status === 'suspended' ? 'Suspenso' : 'Pendente'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right space-x-2">
                                        <button 
                                            onClick={() => startEditing(ev)}
                                            className="text-blue-500 hover:text-blue-400 text-sm font-medium"
                                        >
                                            Editar
                                        </button>
                                        {ev.trading_status !== 'approved' && (
                                            <button 
                                                onClick={() => handleDecision(ev.id, 'approved')}
                                                className="text-green-500 hover:text-green-400 text-sm font-medium"
                                            >
                                                Aprovar
                                            </button>
                                        )}
                                        {ev.trading_status !== 'suspended' && (
                                            <button 
                                                onClick={() => handleDecision(ev.id, 'suspended')}
                                                className="text-red-500 hover:text-red-400 text-sm font-medium"
                                            >
                                                Suspender
                                            </button>
                                        )}
                                    </td>
                                </tr>
                                {expandedId === ev.id && editingOdds && (
                                    <tr className={`bg-gray-50 dark:bg-gray-800/50`}>
                                        <td colSpan={6} className="p-4">
                                            <div className="flex items-end gap-4 max-w-2xl mx-auto">
                                                <div className="flex-1">
                                                    <label className="block text-xs text-gray-500 mb-1">Casa</label>
                                                    <input 
                                                        type="number" step="0.01"
                                                        value={editingOdds.home}
                                                        onChange={e => setEditingOdds({...editingOdds, home: e.target.value})}
                                                        className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-xs text-gray-500 mb-1">Empate</label>
                                                    <input 
                                                        type="number" step="0.01"
                                                        value={editingOdds.draw}
                                                        onChange={e => setEditingOdds({...editingOdds, draw: e.target.value})}
                                                        className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-xs text-gray-500 mb-1">Fora</label>
                                                    <input 
                                                        type="number" step="0.01"
                                                        value={editingOdds.away}
                                                        onChange={e => setEditingOdds({...editingOdds, away: e.target.value})}
                                                        className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                                                    />
                                                </div>
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => saveManualOdds(ev.id)}
                                                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                                    >
                                                        Salvar
                                                    </button>
                                                    <button 
                                                        onClick={() => setExpandedId(null)}
                                                        className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </div>
                        ))
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}

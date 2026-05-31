import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/react-app/contexts/AppContext';
import { Settings } from '@/react-app/components/Settings';
import { apiFetch } from '@/react-app/utils/api';

type Tab = 'overview' | 'risk' | 'users' | 'bets' | 'payments' | 'reports' | 'odds' | 'settings' | 'api';

interface User { id: string; email: string; is_operator: number }
interface Bet { id: string; user_id: string; amount: number; potential_win: number; status: string; created_at: string }
interface OddsEvent { id: string; home_team: string; away_team: string; league: string; home_odd: number; draw_odd: number; away_odd: number; is_live: number; sport: string }
interface Withdrawal { id: string; user_id: string; amount: number; status: string; method: string; created_at: string }

const NAV: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview',  label: 'Visão Geral',          icon: '📊' },
  { key: 'odds',      label: 'Painel de Odds',        icon: '🎯' },
  { key: 'api',       label: 'API Diagnóstico',       icon: '🔑' },
  { key: 'bets',      label: 'Apostas em Tempo Real', icon: '⚡' },
  { key: 'risk',      label: 'Gestão de Risco',       icon: '🛡️' },
  { key: 'users',     label: 'Utilizadores',          icon: '👥' },
  { key: 'payments',  label: 'Pagamentos',            icon: '💳' },
  { key: 'reports',   label: 'Relatórios',            icon: '📈' },
  { key: 'settings',  label: 'Configurações',         icon: '⚙️' },
];

function Badge({ v, color = 'gray' }: { v: React.ReactNode; color?: string }) {
  const c: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700', red: 'bg-red-100 text-red-700',
    green: 'bg-green-100 text-green-700', blue: 'bg-blue-100 text-blue-700',
    yellow: 'bg-yellow-100 text-yellow-800',
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${c[color] || c.gray}`}>{v}</span>;
}

function StatCard({ label, value, sub, color = 'blue' }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  const border: Record<string, string> = { blue: 'border-blue-500', red: 'border-red-500', green: 'border-green-500', yellow: 'border-yellow-500' };
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg p-4 border-l-4 ${border[color] || border.blue} shadow-sm`}>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

const SPORTS = ['soccer', 'basketball', 'tennis', 'ice-hockey', 'baseball'];

type ProbeResult = {
  label: string;
  url: string;
  status: number;
  ok: boolean;
  ms: number;
  keys: string[];
  sample: string;
  error?: string;
};

function ApiDiagTab({ darkMode }: { darkMode: boolean }) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [sport, setSport] = useState('soccer');
  const [matchId, setMatchId] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [error, setError] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const runTests = async () => {
    const key = apiKey.trim();
    if (!key) { setError('Insere a chave API antes de testar.'); return; }
    setError('');
    setResults([]);
    setLoading(true);
    try {
      const data = await apiFetch<{ results: ProbeResult[] }>('/api/admin/test-sports-key', {
        method: 'POST',
        body: JSON.stringify({ key, sport, matchId: matchId.trim() || undefined }),
      });
      setResults(data?.results || []);
    } catch (e: any) {
      setError(e?.message || 'Erro ao contactar o servidor.');
    } finally {
      setLoading(false);
    }
  };

  const card = `rounded-xl border p-4 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} shadow-sm`;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🔑 API Diagnóstico — SportsApiPro</h1>
      </div>

      {/* Key input */}
      <div className={card}>
        <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-gray-400">Chave API (x-api-key)</h2>
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Cole a tua chave SportsApiPro aqui…"
              className={`w-full px-3 py-2.5 rounded-lg border text-sm font-mono pr-10 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-2 focus:ring-red-500`}
            />
            <button
              type="button"
              onClick={() => setShowKey(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        <p className={`mt-2 text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          A chave é enviada ao backend (Railway) para testar os endpoints. Não é guardada no browser.
        </p>
      </div>

      {/* Sport + Match ID */}
      <div className={`${card} grid grid-cols-1 sm:grid-cols-2 gap-4`}>
        <div>
          <label className="block text-xs font-semibold mb-1 text-gray-400 uppercase tracking-wide">Desporto</label>
          <select
            value={sport}
            onChange={e => setSport(e.target.value)}
            className={`w-full px-3 py-2.5 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-red-500`}
          >
            {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1 text-gray-400 uppercase tracking-wide">Match ID <span className="normal-case font-normal">(opcional — para testar odds)</span></label>
          <input
            type="text"
            value={matchId}
            onChange={e => setMatchId(e.target.value)}
            placeholder="Ex: 1234567"
            className={`w-full px-3 py-2.5 rounded-lg border text-sm font-mono ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-2 focus:ring-red-500`}
          />
          <p className={`mt-1 text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Copia um ID de evento do Painel de Odds acima para testar odds específicas.</p>
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={runTests}
        disabled={loading}
        className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {loading
          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>A testar endpoints…</span></>
          : '▶  Testar Todos os Endpoints'}
      </button>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-400">Resultados</h2>
          {results.map((r, i) => (
            <div key={i} className={`rounded-xl border overflow-hidden ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                type="button"
                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left ${darkMode ? 'bg-gray-800 hover:bg-gray-750' : 'bg-white hover:bg-gray-50'}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold ${r.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {r.ok ? '✓' : '✗'}
                  </span>
                  <span className="truncate font-semibold">{r.label}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${r.ok ? (darkMode ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-700') : (darkMode ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700')}`}>
                    HTTP {r.status || 'ERR'}
                  </span>
                  <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{r.ms}ms</span>
                  <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{expandedIdx === i ? '▲' : '▼'}</span>
                </div>
              </button>

              {expandedIdx === i && (
                <div className={`px-4 pb-4 border-t text-xs space-y-3 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="pt-3">
                    <span className="font-semibold text-gray-400 uppercase tracking-wide">URL</span>
                    <p className={`mt-1 font-mono break-all ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{r.url}</p>
                  </div>
                  {r.error && (
                    <div>
                      <span className="font-semibold text-red-400 uppercase tracking-wide">Erro</span>
                      <p className="mt-1 text-red-500 font-mono">{r.error}</p>
                    </div>
                  )}
                  {r.keys.length > 0 && (
                    <div>
                      <span className="font-semibold text-gray-400 uppercase tracking-wide">Chaves JSON topo</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.keys.map(k => (
                          <span key={k} className={`px-2 py-0.5 rounded font-mono ${darkMode ? 'bg-gray-700 text-teal-300' : 'bg-teal-50 text-teal-700 border border-teal-200'}`}>{k}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.sample && (
                    <div>
                      <span className="font-semibold text-gray-400 uppercase tracking-wide">Prévia da resposta</span>
                      <pre className={`mt-1 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all leading-relaxed ${darkMode ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-700 border border-gray-200'}`}>
                        {r.sample}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Summary */}
          <div className={`rounded-xl p-4 text-sm ${darkMode ? 'bg-gray-800' : 'bg-gray-50 border border-gray-200'}`}>
            <div className="flex gap-6">
              <span><span className="font-bold text-green-600">{results.filter(r => r.ok).length}</span> <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>OK</span></span>
              <span><span className="font-bold text-red-600">{results.filter(r => !r.ok).length}</span> <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Erro</span></span>
              <span><span className="font-bold">{Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length)}ms</span> <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>média</span></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const AdminPanel: React.FC = () => {
  const { darkMode, setShowAdminPanel } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers]             = useState<User[]>([]);
  const [bets, setBets]               = useState<Bet[]>([]);
  const [oddsEvents, setOddsEvents]   = useState<OddsEvent[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [metrics, setMetrics]         = useState<any>({});
  const [alerts, setAlerts]           = useState<any[]>([]);
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [oddsFilter, setOddsFilter]   = useState<'all' | 'missing' | 'live'>('all');
  const [oddsSearch, setOddsSearch]   = useState('');
  const [editingOdds, setEditingOdds] = useState<string | null>(null);
  const [oddsEdit, setOddsEdit]       = useState({ home: '', draw: '', away: '' });

  const load = useCallback(async (t: Tab) => {
    try {
      if (t === 'overview' || t === 'reports') {
        const [mu, mo] = await Promise.allSettled([
          apiFetch<any>('/api/metrics/users'), apiFetch<any>('/api/metrics/odds'),
        ]);
        setMetrics({ ...(mu.status === 'fulfilled' ? mu.value : {}), ...(mo.status === 'fulfilled' ? mo.value : {}) });
      }
      if (t === 'users')    { const d = await apiFetch<User[]>('/api/admin/users').catch(() => []); setUsers(Array.isArray(d) ? d : []); }
      if (t === 'bets')     { const d = await apiFetch<any>('/api/admin/bets').catch(() => ({ bets: [] })); setBets(Array.isArray(d) ? d : (d?.bets || [])); }
      if (t === 'payments') { const d = await apiFetch<any>('/api/admin/withdrawals').catch(() => ({ withdrawals: [] })); setWithdrawals(Array.isArray(d) ? d : (d?.withdrawals || [])); }
      if (t === 'risk')     { const d = await apiFetch<any>('/api/admin/alerts').catch(() => ({ alerts: [] })); setAlerts(Array.isArray(d) ? d : (d?.alerts || [])); }
      if (t === 'odds')     { setLoadingOdds(true); const d = await apiFetch<any>('/api/admin/odds').catch(() => ({ events: [] })); setOddsEvents(Array.isArray(d) ? d : (d?.events || [])); setLoadingOdds(false); }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  const toggleOperator = async (userId: string, val: boolean) => {
    await apiFetch(`/api/admin/users/${userId}/toggle-operator`, { method: 'POST', body: JSON.stringify({ is_operator: val }) }).catch(() => {});
    setUsers(u => u.map(x => x.id === userId ? { ...x, is_operator: val ? 1 : 0 } : x));
  };

  const saveOdds = async (id: string) => {
    await apiFetch(`/api/admin/odds/${id}`, {
      method: 'POST',
      body: JSON.stringify({ home_odd: parseFloat(oddsEdit.home), draw_odd: parseFloat(oddsEdit.draw), away_odd: parseFloat(oddsEdit.away) }),
    }).catch(() => {});
    setOddsEvents(ev => ev.map(e => e.id === id ? { ...e, home_odd: parseFloat(oddsEdit.home), draw_odd: parseFloat(oddsEdit.draw), away_odd: parseFloat(oddsEdit.away) } : e));
    setEditingOdds(null);
  };

  const filteredOdds = oddsEvents
    .filter(e => { if (oddsFilter === 'missing') return e.home_odd <= 0; if (oddsFilter === 'live') return e.is_live === 1; return true; })
    .filter(e => !oddsSearch || `${e.home_team} ${e.away_team} ${e.league}`.toLowerCase().includes(oddsSearch.toLowerCase()));

  return (
    <div className={`flex h-screen overflow-hidden ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <aside className={`w-56 flex-shrink-0 flex flex-col ${darkMode ? 'bg-gray-800' : 'bg-white'} border-r ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="font-bold text-red-600 text-lg">Admin</span>
          <button onClick={() => setShowAdminPanel(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV.map(n => (
            <button key={n.key} onClick={() => setTab(n.key)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${tab === n.key ? 'bg-red-600 text-white' : darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}>
              <span>{n.icon}</span><span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-1">
          <button onClick={() => { setShowAdminPanel(false); navigate('/admin/kyc'); }} className={`w-full text-left px-3 py-1.5 rounded text-xs ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}>KYC</button>
          <button onClick={() => { setShowAdminPanel(false); navigate('/metrics'); }} className={`w-full text-left px-3 py-1.5 rounded text-xs ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}>Métricas do Sistema</button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-6xl mx-auto">

          {tab === 'overview' && (
            <div>
              <h1 className="text-2xl font-bold mb-6">Visão Geral</h1>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard label="Utilizadores"  value={metrics.users ?? '—'} color="blue" />
                <StatCard label="Total Apostas" value={metrics.bets ?? '—'} color="green" />
                <StatCard label="Eventos"       value={metrics.events ?? '—'} color="yellow" />
                <StatCard label="Odds Activas"  value={metrics.imported_odds ?? '—'} sub="eventos com h2h" color="red" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm`}>
                  <h3 className="font-semibold mb-3">Acesso Rápido</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {NAV.filter(n => n.key !== 'overview').map(n => (
                      <button key={n.key} onClick={() => setTab(n.key)}
                        className={`p-3 rounded-lg text-sm flex items-center gap-2 ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'}`}>
                        <span>{n.icon}</span><span className="truncate">{n.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm`}>
                  <h3 className="font-semibold mb-3">Estado do Sistema</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Live eventos</span><Badge v={metrics.live ?? '—'} color="green" /></div>
                    <div className="flex justify-between"><span>Cobertura odds</span><Badge v={metrics.events > 0 ? `${Math.round((metrics.imported_odds / metrics.events) * 100)}%` : '—'} color="blue" /></div>
                    <div className="flex justify-between"><span>API-Football</span><Badge v="Activo" color="green" /></div>
                    <div className="flex justify-between"><span>odds-api.io</span><Badge v="Fallback" color="yellow" /></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'odds' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold">Painel de Odds</h1>
                <button onClick={() => load('odds')} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">🔄 Refresh</button>
              </div>
              <div className={`rounded-lg p-3 mb-4 text-xs ${darkMode ? 'bg-gray-800 text-gray-300' : 'bg-blue-50 text-blue-800'}`}>
                <strong>Pipeline:</strong> API-Football (1xBet priority) → odds-api.io fallback → DB <code>events.home_odd</code> → <code>/api/events/by-sport</code> → Frontend cards
              </div>
              <div className="flex gap-2 mb-3 flex-wrap">
                <input value={oddsSearch} onChange={e => setOddsSearch(e.target.value)} placeholder="Pesquisar..."
                  className={`px-3 py-2 rounded-lg border text-sm flex-1 min-w-36 ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
                {(['all', 'missing', 'live'] as const).map(f => (
                  <button key={f} onClick={() => setOddsFilter(f)}
                    className={`px-3 py-2 rounded-lg text-sm ${oddsFilter === f ? 'bg-red-600 text-white' : darkMode ? 'bg-gray-700' : 'bg-white border border-gray-300'}`}>
                    {f === 'all' ? 'Todos' : f === 'missing' ? '⚠️ Sem Odds' : '🔴 Ao Vivo'}
                  </button>
                ))}
              </div>
              <div className="text-xs text-gray-500 mb-2">{filteredOdds.length} eventos</div>
              {loadingOdds ? <div className="text-center py-12 text-gray-400">A carregar...</div> : (
                <div className={`rounded-lg overflow-hidden border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <table className="w-full text-sm">
                    <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Jogo</th>
                        <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Liga</th>
                        <th className="text-center px-3 py-2 font-medium">Casa</th>
                        <th className="text-center px-3 py-2 font-medium">Empate</th>
                        <th className="text-center px-3 py-2 font-medium">Fora</th>
                        <th className="text-center px-3 py-2 font-medium">Estado</th>
                        <th className="text-center px-3 py-2 font-medium">✏️</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOdds.slice(0, 200).map(e => (
                        <tr key={e.id} className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                          <td className="px-3 py-2 text-xs truncate max-w-[160px]">{e.home_team} vs {e.away_team}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 hidden md:table-cell truncate max-w-[120px]">{e.league}</td>
                          {editingOdds === e.id ? (
                            <>
                              <td className="px-1 py-1"><input value={oddsEdit.home}  onChange={ev => setOddsEdit(o => ({...o, home:  ev.target.value}))} className="w-14 px-1 py-0.5 border rounded text-center text-xs" /></td>
                              <td className="px-1 py-1"><input value={oddsEdit.draw}  onChange={ev => setOddsEdit(o => ({...o, draw:  ev.target.value}))} className="w-14 px-1 py-0.5 border rounded text-center text-xs" /></td>
                              <td className="px-1 py-1"><input value={oddsEdit.away}  onChange={ev => setOddsEdit(o => ({...o, away:  ev.target.value}))} className="w-14 px-1 py-0.5 border rounded text-center text-xs" /></td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2 text-center"><span className={e.home_odd > 0 ? 'text-green-600 font-semibold' : 'text-gray-400'}>{e.home_odd > 0 ? e.home_odd.toFixed(2) : '-'}</span></td>
                              <td className="px-3 py-2 text-center"><span className={e.draw_odd > 0 ? 'text-yellow-600 font-semibold' : 'text-gray-400'}>{e.draw_odd > 0 ? e.draw_odd.toFixed(2) : '-'}</span></td>
                              <td className="px-3 py-2 text-center"><span className={e.away_odd > 0 ? 'text-blue-600 font-semibold' : 'text-gray-400'}>{e.away_odd > 0 ? e.away_odd.toFixed(2) : '-'}</span></td>
                            </>
                          )}
                          <td className="px-3 py-2 text-center">{e.is_live ? <Badge v="Live" color="red" /> : <Badge v="Pré" color="gray" />}</td>
                          <td className="px-3 py-2 text-center">
                            {editingOdds === e.id ? (
                              <div className="flex gap-1 justify-center">
                                <button onClick={() => saveOdds(e.id)} className="px-2 py-0.5 bg-green-600 text-white rounded text-xs">✓</button>
                                <button onClick={() => setEditingOdds(null)} className="px-2 py-0.5 bg-gray-400 text-white rounded text-xs">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingOdds(e.id); setOddsEdit({ home: String(e.home_odd || ''), draw: String(e.draw_odd || ''), away: String(e.away_odd || '') }); }}
                                className={`px-2 py-0.5 rounded text-xs ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>✏️</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'risk' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Gestão de Risco</h1>
                <button onClick={() => { setShowAdminPanel(false); navigate('/admin/risk'); }} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Página Completa →</button>
              </div>
              <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm`}>
                <h3 className="font-semibold mb-3">Alertas</h3>
                {alerts.length === 0 ? <p className="text-gray-500 text-sm">Sem alertas activos.</p>
                  : alerts.map((a: any, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-t border-gray-100 dark:border-gray-700 first:border-0">
                      <Badge v={a.level || 'info'} color={a.level === 'high' ? 'red' : a.level === 'medium' ? 'yellow' : 'blue'} />
                      <div className="text-sm">{a.message || a.description || JSON.stringify(a)}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {tab === 'users' && (
            <div>
              <h1 className="text-2xl font-bold mb-6">Utilizadores <span className="text-base font-normal text-gray-400">({users.length})</span></h1>
              <div className={`rounded-lg overflow-hidden border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <table className="w-full text-sm">
                  <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Email</th>
                      <th className="text-left px-4 py-2 font-medium hidden md:table-cell">ID</th>
                      <th className="text-center px-4 py-2 font-medium">Operador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                        <td className="px-4 py-2">{u.email}</td>
                        <td className="px-4 py-2 text-xs text-gray-400 font-mono hidden md:table-cell">{u.id}</td>
                        <td className="px-4 py-2 text-center">
                          <input type="checkbox" checked={!!u.is_operator} onChange={e => toggleOperator(u.id, e.target.checked)} className="w-4 h-4 cursor-pointer" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'bets' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Apostas em Tempo Real</h1>
                <button onClick={() => load('bets')} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">🔄 Refresh</button>
              </div>
              {bets.length === 0 ? (
                <div className={`rounded-lg p-8 text-center text-gray-400 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>Sem apostas recentes.</div>
              ) : (
                <div className={`rounded-lg overflow-hidden border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <table className="w-full text-sm">
                    <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">ID</th>
                        <th className="text-left px-4 py-2 font-medium">Utilizador</th>
                        <th className="text-right px-4 py-2 font-medium">Valor</th>
                        <th className="text-right px-4 py-2 font-medium">Ganho Pot.</th>
                        <th className="text-center px-4 py-2 font-medium">Estado</th>
                        <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bets.map(b => (
                        <tr key={b.id} className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                          <td className="px-4 py-2 text-xs font-mono text-gray-400">{b.id?.slice(0, 8)}…</td>
                          <td className="px-4 py-2 text-xs font-mono">{b.user_id?.slice(0, 8)}…</td>
                          <td className="px-4 py-2 text-right font-semibold">€{Number(b.amount).toFixed(2)}</td>
                          <td className="px-4 py-2 text-right text-green-600">€{Number(b.potential_win).toFixed(2)}</td>
                          <td className="px-4 py-2 text-center"><Badge v={b.status} color={b.status === 'won' ? 'green' : b.status === 'lost' ? 'red' : b.status === 'pending' ? 'yellow' : 'gray'} /></td>
                          <td className="px-4 py-2 text-xs text-gray-400 hidden md:table-cell">{new Date(b.created_at).toLocaleString('pt-PT')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'payments' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Pagamentos</h1>
                <div className="flex gap-2">
                  <button onClick={() => { setShowAdminPanel(false); navigate('/admin/withdrawals'); }} className={`px-4 py-2 rounded-lg text-sm ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>Levantamentos</button>
                  <button onClick={() => { setShowAdminPanel(false); navigate('/admin/payouts'); }} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Payouts →</button>
                </div>
              </div>
              {withdrawals.length === 0 ? (
                <div className={`rounded-lg p-8 text-center text-gray-400 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>Sem levantamentos pendentes.</div>
              ) : (
                <div className={`rounded-lg overflow-hidden border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <table className="w-full text-sm">
                    <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Utilizador</th>
                        <th className="text-right px-4 py-2 font-medium">Valor</th>
                        <th className="text-center px-4 py-2 font-medium">Método</th>
                        <th className="text-center px-4 py-2 font-medium">Estado</th>
                        <th className="text-left px-4 py-2 font-medium">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawals.map(w => (
                        <tr key={w.id} className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                          <td className="px-4 py-2 text-xs font-mono">{w.user_id?.slice(0, 8)}…</td>
                          <td className="px-4 py-2 text-right font-semibold">€{Number(w.amount).toFixed(2)}</td>
                          <td className="px-4 py-2 text-center">{w.method}</td>
                          <td className="px-4 py-2 text-center"><Badge v={w.status} color={w.status === 'approved' ? 'green' : w.status === 'pending' ? 'yellow' : 'red'} /></td>
                          <td className="px-4 py-2 text-xs text-gray-400">{new Date(w.created_at).toLocaleString('pt-PT')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'reports' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Relatórios</h1>
                <button onClick={() => load('reports')} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">🔄 Actualizar</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard label="Total Utilizadores" value={metrics.users ?? '—'} color="blue" />
                <StatCard label="Total Apostas"      value={metrics.bets ?? '—'} color="green" />
                <StatCard label="Eventos na DB"      value={metrics.events ?? '—'} color="yellow" />
                <StatCard label="Eventos c/ Odds"    value={metrics.imported_odds ?? '—'} color="red" />
                <StatCard label="Jogos ao Vivo"      value={metrics.live ?? '—'} color="green" />
                <StatCard label="Cobertura Odds"     value={metrics.events > 0 ? `${Math.round((metrics.imported_odds / metrics.events) * 100)}%` : '—'} color="blue" />
              </div>
            </div>
          )}

          {tab === 'api' && <ApiDiagTab darkMode={darkMode} />}

          {tab === 'settings' && (
            <div>
              <h1 className="text-2xl font-bold mb-6">Configurações</h1>
              <div className="max-w-xl"><Settings /></div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default AdminPanel;

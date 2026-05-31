import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, Users, Activity, AlertTriangle, ShieldAlert, Banknote,
  FileBarChart, Settings, RefreshCw, Trash2, PlayCircle, ArrowUpRight,
  ArrowDownRight, Eye, FileText, Database, Zap, TrendingUp, TrendingDown
} from 'lucide-react';

type Dashboard = {
  users: { total: number; active24h: number };
  deposits: { today: number; total: number; count24h: number };
  withdrawals: { pendingAmount: number; pendingCount: number; paid7d: number };
  bets: {
    openCount: number; openStake: number; openExposure: number;
    settled24h: number; stake24h: number; payout24h: number;
    ggr24h: number; margin24h: number;
  };
  kyc: { pending: number };
  events: { live: number; total: number };
  house: { liability: number };
  alerts: Array<{ id: number; type: string; message: string; created_at: string }>;
  topExposure: Array<{
    id: number; user_id: string; username?: string;
    stake: number; potential_win: number; odd: number;
    type: string; created_at: string;
  }>;
  ggrSeries: Array<{ d: string; staked: number; payout: number }>;
  generatedAt: string;
};

const fmtEUR = (n: number) => `€${Number(n || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (n: number) => Number(n || 0).toLocaleString('pt-PT');
const fmtPct = (n: number) => `${Number(n || 0).toFixed(1)}%`;

export default function MetricsPage() {
  const { darkMode, isOperator, addNotification } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch<Dashboard>('/api/admin/dashboard', { cache: 'no-store' });
      setData(j);
    } catch (e: any) {
      setErr(e?.status === 403 ? 'Sem permissão (operador requerido)' : (e?.message || 'Erro a carregar'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv); }, []);

  const card = darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900';
  const sub = darkMode ? 'text-gray-400' : 'text-gray-500';

  const ggrColor = data && data.bets.ggr24h >= 0 ? 'text-green-500' : 'text-red-500';
  const ggrIcon = data && data.bets.ggr24h >= 0 ? TrendingUp : TrendingDown;

  // Mini sparkline as inline SVG
  const sparkline = useMemo(() => {
    const series = data?.ggrSeries || [];
    if (series.length < 2) return null;
    const ggr = series.map(s => Number(s.staked || 0) - Number(s.payout || 0));
    const min = Math.min(...ggr, 0), max = Math.max(...ggr, 1);
    const range = max - min || 1;
    const w = 220, h = 50;
    const step = w / (ggr.length - 1);
    const pts = ggr.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');
    const last = ggr[ggr.length - 1];
    const color = last >= 0 ? '#10b981' : '#ef4444';
    return (
      <svg width={w} height={h} className="overflow-visible">
        <polyline fill="none" stroke={color} strokeWidth="2" points={pts} />
        {ggr.map((v, i) => (
          <circle key={i} cx={i * step} cy={h - ((v - min) / range) * h} r="2.5" fill={color} />
        ))}
      </svg>
    );
  }, [data?.ggrSeries]);

  const runAction = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    try {
      const r = await fn();
      addNotification({ type: 'success', message: r?.message || `${label} OK` });
      await load();
    } catch (e: any) {
      addNotification({ type: 'error', message: e?.message || `Erro: ${label}` });
    } finally { setBusy(null); }
  };

  if (!isOperator) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className={`p-6 rounded-lg ${card}`}>
          <h2 className="text-2xl font-bold mb-2">Painel Operacional</h2>
          <p className={sub}>Esta área é restrita a operadores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Painel do Operador</h1>
            <p className={`text-sm ${sub}`}>
              {data?.generatedAt ? `Atualizado às ${new Date(data.generatedAt).toLocaleTimeString('pt-PT')}` : 'A carregar…'}
              {loading && ' · a sincronizar'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={load} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${darkMode ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-white hover:bg-gray-100 text-gray-900 border border-gray-200'}`}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar
            </button>
            <button
              onClick={() => runAction('Cron executado', () => apiFetch('/api/cron/run', { method: 'POST' }))}
              disabled={busy !== null}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              <PlayCircle size={16} /> Executar cron
            </button>
            <button
              onClick={() => {
                if (!confirm('Limpar cache de eventos/odds? Os jogos serão recarregados na próxima sincronização.')) return;
                runAction('Cache limpa', () => apiFetch('/api/admin/cache/clear', { method: 'POST' }));
              }}
              disabled={busy !== null}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${darkMode ? 'bg-yellow-700 hover:bg-yellow-800 text-white' : 'bg-yellow-500 hover:bg-yellow-600 text-white'}`}
            >
              <Trash2 size={16} /> Limpar cache
            </button>
          </div>
        </div>

        {err && (
          <div className={`p-3 rounded ${darkMode ? 'bg-red-900/40 text-red-200' : 'bg-red-100 text-red-800'}`}>{err}</div>
        )}

        {/* Top KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI card={card} sub={sub} icon={<Banknote size={18} />} label="GGR 24h" big={fmtEUR(data?.bets.ggr24h || 0)}
               extra={<span className={`flex items-center gap-1 text-xs ${ggrColor}`}>{ggrIcon === TrendingUp ? <TrendingUp size={12}/> : <TrendingDown size={12}/>} margem {fmtPct(data?.bets.margin24h || 0)}</span>}/>
          <KPI card={card} sub={sub} icon={<ArrowDownRight size={18} className="text-green-500"/>} label="Depósitos 24h"
               big={fmtEUR(data?.deposits.today || 0)}
               extra={<span className="text-xs">{fmtInt(data?.deposits.count24h || 0)} transações</span>}/>
          <KPI card={card} sub={sub} icon={<ArrowUpRight size={18} className="text-orange-500"/>} label="Levantamentos pendentes"
               big={fmtEUR(data?.withdrawals.pendingAmount || 0)}
               extra={<span className="text-xs">{fmtInt(data?.withdrawals.pendingCount || 0)} pedidos</span>}/>
          <KPI card={card} sub={sub} icon={<AlertTriangle size={18} className="text-red-500"/>} label="Exposição aberta"
               big={fmtEUR(data?.bets.openExposure || 0)}
               extra={<span className="text-xs">{fmtInt(data?.bets.openCount || 0)} apostas em aberto</span>}/>
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI card={card} sub={sub} icon={<Wallet size={18}/>} label="Passivo (saldo total clientes)" big={fmtEUR(data?.house.liability || 0)} />
          <KPI card={card} sub={sub} icon={<Users size={18}/>} label="Utilizadores"
               big={fmtInt(data?.users.total || 0)}
               extra={<span className="text-xs">{fmtInt(data?.users.active24h || 0)} ativos 24h</span>}/>
          <KPI card={card} sub={sub} icon={<Activity size={18} className="text-red-500"/>} label="Eventos ao vivo"
               big={fmtInt(data?.events.live || 0)}
               extra={<span className="text-xs">de {fmtInt(data?.events.total || 0)} total</span>}/>
          <KPI card={card} sub={sub} icon={<ShieldAlert size={18} className="text-yellow-500"/>} label="KYC pendentes"
               big={fmtInt(data?.kyc.pending || 0)}
               extra={<button onClick={() => navigate('/admin/kyc')} className="text-xs underline text-blue-500">Rever →</button>}/>
        </div>

        {/* GGR sparkline + cashflow */}
        <div className={`p-4 rounded-lg border ${card}`}>
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <div className={`text-sm ${sub}`}>GGR — últimos 7 dias</div>
              <div className={`text-2xl font-bold ${ggrColor}`}>{fmtEUR(data?.bets.ggr24h || 0)}</div>
              <div className={`text-xs ${sub}`}>
                Apostas 24h: {fmtEUR(data?.bets.stake24h || 0)} · Pagos 24h: {fmtEUR(data?.bets.payout24h || 0)} · {fmtInt(data?.bets.settled24h || 0)} liquidadas
              </div>
            </div>
            <div className="flex-shrink-0">{sparkline}</div>
          </div>
        </div>

        {/* Two-column: Top exposure + Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top exposure */}
          <div className={`rounded-lg border ${card}`}>
            <div className={`px-4 py-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-between`}>
              <h3 className="font-bold flex items-center gap-2"><AlertTriangle size={16} className="text-orange-500"/> Maior exposição em aberto</h3>
              <button onClick={() => navigate('/admin/risk')} className="text-xs text-blue-500 hover:underline">Ver risco →</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={`text-xs uppercase ${darkMode ? 'bg-gray-700/50 text-gray-400' : 'bg-gray-50 text-gray-600'}`}>
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-right">Stake</th>
                    <th className="px-3 py-2 text-right">Cota</th>
                    <th className="px-3 py-2 text-right">Pot. ganho</th>
                    <th className="px-3 py-2 text-right">Risco</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.topExposure || []).map(b => (
                    <tr key={b.id} className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                      <td className="px-3 py-2 font-mono text-xs">#{b.id}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium truncate max-w-[140px]">{b.username || b.user_id.slice(0, 8)}</div>
                        <div className={`text-[10px] ${sub}`}>{b.type}</div>
                      </td>
                      <td className="px-3 py-2 text-right">{fmtEUR(b.stake)}</td>
                      <td className="px-3 py-2 text-right font-mono">{Number(b.odd).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-bold">{fmtEUR(b.potential_win)}</td>
                      <td className="px-3 py-2 text-right text-red-500 font-bold">{fmtEUR(b.potential_win - b.stake)}</td>
                    </tr>
                  ))}
                  {(!data?.topExposure || data.topExposure.length === 0) && (
                    <tr><td colSpan={6} className={`px-3 py-6 text-center ${sub}`}>Sem apostas em aberto.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Risk alerts */}
          <div className={`rounded-lg border ${card}`}>
            <div className={`px-4 py-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-between`}>
              <h3 className="font-bold flex items-center gap-2"><AlertTriangle size={16} className="text-red-500"/> Alertas recentes</h3>
              <button onClick={() => navigate('/admin/risk')} className="text-xs text-blue-500 hover:underline">Ver todos →</button>
            </div>
            <div className="p-2 space-y-1 max-h-[280px] overflow-y-auto">
              {(data?.alerts || []).map(a => (
                <div key={a.id} className={`p-2 rounded text-sm ${darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}`}>
                  <div className="flex items-start gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                      /high|critical|sharp/i.test(a.type) ? 'bg-red-600 text-white' :
                      /warn|medium/i.test(a.type) ? 'bg-yellow-600 text-white' :
                      'bg-blue-600 text-white'
                    }`}>{a.type}</span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{a.message}</div>
                      <div className={`text-[10px] ${sub}`}>{new Date(a.created_at).toLocaleString('pt-PT')}</div>
                    </div>
                  </div>
                </div>
              ))}
              {(!data?.alerts || data.alerts.length === 0) && (
                <div className={`p-6 text-center text-sm ${sub}`}>Nenhum alerta — tudo calmo.</div>
              )}
            </div>
          </div>
        </div>

        {/* Quick actions grid */}
        <div>
          <h3 className={`text-sm font-bold uppercase tracking-wider mb-2 ${sub}`}>Operação</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ActionCard card={card} sub={sub} icon={<ShieldAlert size={20}/>} title="KYC"
              badge={data?.kyc.pending || 0} subtitle="Aprovar identidade dos clientes"
              onClick={() => navigate('/admin/kyc')} />
            <ActionCard card={card} sub={sub} icon={<Banknote size={20}/>} title="Levantamentos"
              badge={data?.withdrawals.pendingCount || 0} subtitle="Aprovar/rejeitar pagamentos"
              onClick={() => navigate('/admin/withdrawals')} />
            <ActionCard card={card} sub={sub} icon={<AlertTriangle size={20} className="text-red-500"/>} title="Risco"
              subtitle="Sharps, padrões suspeitos"
              onClick={() => navigate('/admin/risk')} />
            <ActionCard card={card} sub={sub} icon={<Banknote size={20} className="text-green-500"/>} title="Pagamentos clientes"
              subtitle="Histórico de pagamentos"
              onClick={() => navigate('/admin/payouts')} />
            <ActionCard card={card} sub={sub} icon={<Eye size={20}/>} title="Trading"
              subtitle="Mercados e cotas manuais"
              onClick={() => navigate('/trading-panel')} />
            <ActionCard card={card} sub={sub} icon={<FileText size={20}/>} title="As Minhas Apostas"
              subtitle="Vista de cliente"
              onClick={() => navigate('/my-bets')} />
            <ActionCard card={card} sub={sub} icon={<FileBarChart size={20}/>} title="Histórico financeiro"
              subtitle="Carteira / movimentos"
              onClick={() => navigate('/wallet')} />
            <ActionCard card={card} sub={sub} icon={<Settings size={20}/>} title="Perfil"
              subtitle="Conta e definições"
              onClick={() => navigate('/profile')} />
          </div>
        </div>

        {/* System actions */}
        <div className={`p-4 rounded-lg border ${card}`}>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-3">Sistema</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <button
              disabled={busy !== null}
              onClick={() => runAction('Ligas atualizadas', () => apiFetch('/api/admin/leagues/refresh', { method: 'POST' }))}
              className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium border ${darkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'} disabled:opacity-50`}
            >
              <Database size={16}/> Atualizar ligas/competições
            </button>
            <button
              disabled={busy !== null}
              onClick={() => runAction('Cron executado', () => apiFetch('/api/cron/run', { method: 'POST' }))}
              className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium border ${darkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'} disabled:opacity-50`}
            >
              <Zap size={16}/> Forçar sync de odds (cron)
            </button>
            <button
              disabled={busy !== null}
              onClick={() => {
                if (!confirm('Limpar cache de eventos/odds?')) return;
                runAction('Cache limpa', () => apiFetch('/api/admin/cache/clear', { method: 'POST' }));
              }}
              className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium border ${darkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'} disabled:opacity-50`}
            >
              <Trash2 size={16}/> Limpar cache (events/odds)
            </button>
          </div>
          {busy && <div className={`mt-2 text-xs ${sub}`}>A executar: {busy}…</div>}
        </div>
      </div>
    </div>
  );
}

function KPI({ card, sub, icon, label, big, extra }: {
  card: string; sub: string; icon: React.ReactNode; label: string; big: string; extra?: React.ReactNode;
}) {
  return (
    <div className={`p-3 rounded-lg border ${card}`}>
      <div className={`flex items-center gap-2 text-xs ${sub}`}>{icon}<span className="uppercase tracking-wider">{label}</span></div>
      <div className="text-xl md:text-2xl font-bold mt-1 leading-tight">{big}</div>
      {extra && <div className="mt-1">{extra}</div>}
    </div>
  );
}

function ActionCard({ card, sub, icon, title, subtitle, badge, onClick }: {
  card: string; sub: string; icon: React.ReactNode; title: string; subtitle: string; badge?: number; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border text-left transition-all hover:scale-[1.02] hover:shadow-md ${card}`}
    >
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-md bg-red-600/10 text-red-500">{icon}</div>
        {badge && badge > 0 ? (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">{badge}</span>
        ) : null}
      </div>
      <div className="font-bold mt-2">{title}</div>
      <div className={`text-xs ${sub}`}>{subtitle}</div>
    </button>
  );
}

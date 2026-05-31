import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';
import { getSportFromLeague, getSportIcon, translateSelection } from '@/shared/helpers';

type LiveData = {
  isLive: boolean;
  status: string | null;
  elapsed: number | null;
  home_score: number | null;
  away_score: number | null;
  home_logo: string | null;
  away_logo: string | null;
  event_date: string | null;
};

type Selection = {
  event_id: string | number;
  team_match: string;
  league: string;
  selection: string;
  odd: number;
  status: string;
  home_team?: string;
  away_team?: string;
  live?: LiveData;
};

type MyBet = {
  id: number;
  event_id: number;
  team_match: string;
  team_home?: string;
  team_away?: string;
  league: string;
  selection: string;
  odd: number;
  stake: number;
  potential_win: number;
  status: string;
  created_at?: string;
  cashoutAvailable?: boolean;
  cashoutValue?: number;
  cashoutBlocked?: boolean;
  cashoutBlockedReason?: string;
  currentOdd?: number;
  type?: string;
  is_freebet?: number;
  selections?: Selection[];
  live?: LiveData;
};

const BLOCK_REASONS: Record<string, string> = {
  market_suspended: 'Mercado suspenso',
  odds_frozen: 'Odds congeladas',
  critical_phase: 'Lance crítico — fim de jogo',
  incident_cooldown: 'Lance crítico — golo/penálti',
  odds_too_low: 'Aposta quase ganha',
  event_finished: 'Evento terminado',
  no_live_odds: 'Sem odds ao vivo',
};

function formatMatchDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dows = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return `${dows[d.getDay()]}. ${day}/${month}`;
  } catch { return ''; }
}

function formatMatchTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
}

function periodLabel(elapsed: number | null, status: string | null): string {
  if (status) {
    const upper = status.toUpperCase();
    if (upper === 'HT') return 'Intervalo';
    if (upper === 'ET' || upper === 'AET') return 'Prol.';
    if (upper === 'PEN') return 'Penáltis';
    if (upper === 'FT' || upper === 'FINISHED') return 'Final';
  }
  if (typeof elapsed === 'number') {
    return elapsed > 45 ? '2ª parte' : '1ª parte';
  }
  return '';
}

function statusPill(status: string): { label: string; bg: string; text: string } {
  switch (status) {
    case 'won':
    case 'ganha':
      return { label: 'Ganhos', bg: 'bg-green-600', text: 'text-white' };
    case 'lost':
    case 'perdida':
      return { label: 'Perdida', bg: 'bg-red-600', text: 'text-white' };
    case 'cashed_out':
      return { label: 'Cashout', bg: 'bg-yellow-500', text: 'text-black' };
    case 'pending':
    default:
      return { label: 'Em aberto', bg: 'bg-gray-600', text: 'text-white' };
  }
}

function MatchBlock({ live, homeTeam, awayTeam, selectionStatus }:
  { live?: LiveData | null; homeTeam: string; awayTeam: string; selectionStatus?: string }) {
  const { darkMode } = useApp();
  const isLive = !!live?.isLive;
  const isFinished = selectionStatus === 'won' || selectionStatus === 'lost' ||
    (live?.status && ['FT', 'AET', 'PEN', 'FINISHED', 'ENDED'].includes(String(live.status).toUpperCase()));
  const showScore = isLive || isFinished || (live && (live.home_score != null || live.away_score != null));
  const dateLabel = formatMatchDate(live?.event_date);
  const timeLabel = formatMatchTime(live?.event_date);

  const borderClass = isLive
    ? 'border-red-500'
    : darkMode ? 'border-gray-700' : 'border-gray-200';
  const labelText = isLive ? 'text-red-500' : (darkMode ? 'text-gray-400' : 'text-gray-500');

  return (
    <div className={`rounded-lg border ${borderClass} px-4 py-3 mt-2 relative ${darkMode ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
      {/* Top label: minute+period for live, date for resolved/upcoming */}
      <div className={`text-xs font-semibold text-center mb-2 ${labelText} flex items-center justify-center gap-2`}>
        {isLive ? (
          <>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span>{live?.elapsed != null ? `${live.elapsed}'` : 'AO VIVO'} • {periodLabel(live?.elapsed ?? null, live?.status ?? null)}</span>
          </>
        ) : showScore ? (
          <span>{dateLabel}</span>
        ) : (
          <span>{dateLabel}</span>
        )}
      </div>

      {/* Teams + score (or kickoff time when upcoming) */}
      {showScore ? (
        <div className="flex items-center justify-center gap-3">
          <span className={`font-semibold text-right flex-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {homeTeam}
          </span>
          <span className={`px-3 py-1 rounded-md font-bold tabular-nums text-sm ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-900'}`}>
            {live?.home_score ?? 0} - {live?.away_score ?? 0}
          </span>
          <span className={`font-semibold text-left flex-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {awayTeam}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3">
          <span className={`font-semibold text-right flex-1 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            {homeTeam}
          </span>
          <span className={`text-sm font-medium tabular-nums ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {timeLabel || 'vs'}
          </span>
          <span className={`font-semibold text-left flex-1 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            {awayTeam}
          </span>
        </div>
      )}
    </div>
  );
}

function BetLeg({ bet, sel }: { bet: MyBet; sel: Selection }) {
  const { darkMode } = useApp();
  const sport = getSportFromLeague(sel.league || '');
  const sportIcon = getSportIcon(sport);
  const homeTeam = sel.home_team || sel.team_match.split(' vs ')[0] || '';
  const awayTeam = sel.away_team || sel.team_match.split(' vs ')[1] || '';
  const accentText = bet.status === 'lost' ? 'text-red-500'
    : bet.status === 'won' ? 'text-green-600'
    : darkMode ? 'text-white' : 'text-gray-900';

  // Per-leg status icon (✓ won, ✗ lost, … pending)
  const legIcon = sel.status === 'won' ? <span className="text-green-500">✓</span>
    : sel.status === 'lost' ? <span className="text-red-500">✗</span>
    : <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>···</span>;

  return (
    <div className={`px-4 py-3 ${darkMode ? 'border-b border-gray-700/60' : 'border-b border-gray-200'} last:border-b-0`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <img src={sportIcon} alt={sport} className="w-5 h-5 mt-0.5 opacity-80 shrink-0" />
          <div className="min-w-0">
            <div className={`font-bold leading-tight truncate ${accentText}`}>
              {translateSelection(sel.selection)}
            </div>
            <div className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Resultado (Tempo Regulamentar)
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-base font-bold tabular-nums ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {Number(sel.odd).toFixed(2)}
          </span>
          <span className="w-5 h-5 flex items-center justify-center text-sm">{legIcon}</span>
        </div>
      </div>

      <MatchBlock
        live={sel.live}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        selectionStatus={sel.status}
      />
    </div>
  );
}

function SingleBetLeg({ bet }: { bet: MyBet }) {
  const { darkMode } = useApp();
  const sport = getSportFromLeague(bet.league || '');
  const sportIcon = getSportIcon(sport);
  const homeTeam = bet.team_home || bet.team_match.split(' vs ')[0] || '';
  const awayTeam = bet.team_away || bet.team_match.split(' vs ')[1] || '';
  const oddChanged = bet.currentOdd && Math.abs(bet.currentOdd - bet.odd) > 0.01;
  const accentText = bet.status === 'lost' ? 'text-red-500'
    : bet.status === 'won' ? 'text-green-600'
    : darkMode ? 'text-white' : 'text-gray-900';

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <img src={sportIcon} alt={sport} className="w-5 h-5 mt-0.5 opacity-80 shrink-0" />
          <div className="min-w-0">
            <div className={`font-bold leading-tight ${accentText}`}>
              {translateSelection(bet.selection)}
            </div>
            <div className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {bet.league || 'Resultado'}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          {oddChanged && (
            <div className={`text-xs line-through ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {Number(bet.odd).toFixed(2)}
            </div>
          )}
          <div className={`text-lg font-bold tabular-nums ${oddChanged ? 'text-orange-500' : (darkMode ? 'text-white' : 'text-gray-900')}`}>
            {(oddChanged ? bet.currentOdd : bet.odd)?.toFixed(2)}
          </div>
        </div>
      </div>

      <MatchBlock
        live={bet.live}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        selectionStatus={bet.status}
      />
    </div>
  );
}

function CashoutPanel({ bet, onCashout, processing }:
  { bet: MyBet; onCashout: (bet: MyBet) => void; processing: boolean }) {
  const { darkMode } = useApp();
  if (bet.status !== 'pending' || bet.type === 'multi') return null;
  if (!bet.cashoutAvailable && !bet.cashoutBlocked) return null;

  const value = bet.cashoutValue ?? 0;
  const blocked = !!bet.cashoutBlocked;
  const reason = bet.cashoutBlockedReason ? BLOCK_REASONS[bet.cashoutBlockedReason] || 'Indisponível' : '';

  if (blocked) {
    return (
      <div className={`mx-4 mb-4 mt-2 p-3 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs">⏸</span>
            <div>
              <div className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Cash Out indisponível
              </div>
              <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                {reason}
              </div>
            </div>
          </div>
          <div className={`px-3 py-1 rounded text-sm font-mono opacity-50 ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>
            €{value.toFixed(2)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-4 mt-2">
      <button
        onClick={() => onCashout(bet)}
        disabled={processing}
        className={`w-full py-2.5 px-4 rounded-lg flex items-center justify-center gap-3 transition-all ${
          processing
            ? 'bg-gray-600 cursor-not-allowed opacity-70'
            : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white shadow-md hover:shadow-lg'
        }`}
      >
        {processing ? (
          <span className="text-sm font-semibold">A processar...</span>
        ) : (
          <>
            <span className="text-sm font-bold">Cash Out</span>
            <span className="bg-black/25 px-2 py-0.5 rounded text-xs font-mono">€{value.toFixed(2)}</span>
          </>
        )}
      </button>
    </div>
  );
}

export default function MyBetsPage() {
  const { darkMode, user, addNotification, notifications } = useApp();
  const [bets, setBets] = useState<MyBet[]>([]);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'ativas' | 'encerradas' | 'ganhas'>('ativas');

  const loadBets = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    apiFetch<MyBet[]>('/api/bets', { signal, cache: 'no-store' })
      .then((data: MyBet[]) => setBets(Array.isArray(data) ? data : []))
      .catch((err: any) => {
        const msg = String(err?.message || 'Erro ao carregar apostas');
        const aborted = err && (err.name === 'AbortError' || msg.includes('ERR_ABORTED'));
        if (!aborted && !msg.includes('401') && !notifications.some(n => n.message === msg)) {
          addNotification({ type: 'error', message: msg });
        }
      })
      .finally(() => setLoading(false));
  }, [addNotification, notifications]);

  const handleCashout = async (bet: MyBet) => {
    if (processingId || !bet.cashoutValue) return;
    if (!window.confirm(`Confirmar Cash Out de €${bet.cashoutValue.toFixed(2)}?`)) return;
    setProcessingId(bet.id);
    try {
      const res: any = await apiFetch(`/api/bets/${bet.id}/cashout`, { method: 'POST' });
      addNotification({ type: 'success', message: `Cash Out de €${(res?.amount ?? bet.cashoutValue).toFixed(2)} efectuado!` });
      loadBets();
    } catch (e: any) {
      addNotification({ type: 'error', message: e.message || 'Erro no cashout' });
    } finally {
      setProcessingId(null);
    }
  };

  const onRefresh = useCallback(() => loadBets(), [loadBets]);

  useEffect(() => {
    if (!user) return;
    const ac = new AbortController();
    loadBets(ac.signal);
    window.addEventListener('bets:refresh', onRefresh as EventListener);
    const iv = setInterval(() => loadBets(), 15000); // 15s for live cashout updates
    return () => {
      ac.abort();
      window.removeEventListener('bets:refresh', onRefresh as EventListener);
      clearInterval(iv);
    };
  }, [user, loadBets, onRefresh]);

  const filteredBets = useMemo(() => {
    if (tab === 'ativas') return bets.filter(b => b.status === 'pending');
    if (tab === 'ganhas') return bets.filter(b => b.status === 'won' || b.status === 'cashed_out');
    return bets.filter(b => b.status === 'lost');
  }, [bets, tab]);

  const counts = useMemo(() => ({
    ativas: bets.filter(b => b.status === 'pending').length,
    encerradas: bets.filter(b => b.status === 'lost').length,
    ganhas: bets.filter(b => b.status === 'won' || b.status === 'cashed_out').length,
  }), [bets]);

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-100'} pb-20`}>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className={`text-2xl font-bold mb-5 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          As Minhas Apostas
        </h1>

        {/* Tabs: Ativas | Encerradas | Ganhas */}
        <div className={`flex items-center gap-6 mb-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          {([
            ['ativas', 'Ativas', counts.ativas],
            ['encerradas', 'Encerradas', counts.encerradas],
            ['ganhas', 'Ganhas', counts.ganhas],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-3 text-sm font-semibold transition-colors relative ${
                tab === key
                  ? (darkMode ? 'text-white' : 'text-gray-900')
                  : (darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700')
              }`}
            >
              {label} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
              {tab === key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
            </button>
          ))}
        </div>

        {!user ? (
          <div className={`text-center py-10 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Faça login para ver as suas apostas
          </div>
        ) : loading && bets.length === 0 ? (
          <div className={`text-center py-10 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>A carregar…</div>
        ) : filteredBets.length === 0 ? (
          <div className={`text-center py-10 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {tab === 'ativas' ? 'Sem apostas em aberto'
              : tab === 'ganhas' ? 'Ainda sem apostas ganhas'
              : 'Sem apostas perdidas'}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBets.map((bet) => {
              const pill = statusPill(bet.status);
              const isMulti = bet.type === 'multi';
              const totalOdd = isMulti ? Number(bet.odd) : Number(bet.odd);

              return (
                <div
                  key={bet.id}
                  className={`rounded-xl overflow-hidden border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} shadow-sm`}
                >
                  {/* Card header: Múltipla badge or Single header + status pill */}
                  <div className={`flex items-center justify-between px-4 py-3 ${darkMode ? 'border-b border-gray-700' : 'border-b border-gray-200'}`}>
                    <div className="flex items-center gap-2">
                      {isMulti ? (
                        <>
                          <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            Múltipla ({bet.selections?.length || 0})
                          </span>
                          <div className="flex gap-1">
                            {bet.selections?.map((s, i) => (
                              <span key={i} className="w-4 h-4 inline-flex items-center justify-center rounded-full text-xs font-bold"
                                style={{
                                  background: s.status === 'won' ? '#16a34a' : s.status === 'lost' ? '#dc2626' : '#6b7280',
                                  color: 'white',
                                }}
                              >{s.status === 'won' ? '✓' : s.status === 'lost' ? '✗' : '·'}</span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Aposta simples • {bet.league || ''}
                        </span>
                      )}
                    </div>
                    <span className={`px-2.5 py-1 rounded text-xs font-bold ${pill.bg} ${pill.text}`}>
                      {pill.label}
                    </span>
                  </div>

                  {/* Legs */}
                  {isMulti && bet.selections
                    ? bet.selections.map((sel, idx) => (
                        <BetLeg key={idx} bet={bet} sel={sel} />
                      ))
                    : <SingleBetLeg bet={bet} />
                  }

                  {/* Cashout */}
                  <CashoutPanel bet={bet} onCashout={handleCashout} processing={processingId === bet.id} />

                  {/* Footer: cota total / montante / ganhos */}
                  <div className={`px-4 py-3 ${darkMode ? 'bg-gray-900/40 border-t border-gray-700' : 'bg-gray-50 border-t border-gray-200'} space-y-1.5`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Cota total</span>
                      <span className={`text-sm font-bold tabular-nums px-2 py-0.5 rounded ${
                        bet.status === 'pending' ? 'bg-yellow-400 text-black'
                        : bet.status === 'won' ? 'bg-green-100 text-green-800'
                        : bet.status === 'cashed_out' ? 'bg-yellow-100 text-yellow-800'
                        : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                      }`}>{totalOdd.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Montante</span>
                      <span className={`text-sm font-semibold tabular-nums ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {Number(bet.stake).toFixed(2)} €
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {bet.status === 'won' ? 'Ganhos'
                          : bet.status === 'cashed_out' ? 'Cashout'
                          : bet.status === 'lost' ? 'Perda'
                          : 'Retorno potencial'}
                      </span>
                      <span className={`text-sm font-bold tabular-nums ${
                        bet.status === 'lost' ? 'text-red-500'
                        : bet.status === 'won' ? 'text-green-600'
                        : darkMode ? 'text-green-400' : 'text-green-600'
                      }`}>
                        {(bet.status === 'cashed_out' ? (bet.cashoutValue || 0)
                          : bet.status === 'lost' ? 0
                          : bet.potential_win).toFixed(2)} €
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

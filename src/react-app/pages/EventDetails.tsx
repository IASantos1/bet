import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useApp } from '@/react-app/contexts/AppContext'
import { apiFetch } from '@/react-app/utils/api'
import { BetSlip } from '@/react-app/components/BetSlip'
import { Sidebar } from '@/react-app/components/Sidebar'
import { MemoSubOddsModel } from '@/react-app/components/SubOddsModel'
import { useLiveFeed } from '@/react-app/hooks/useLiveFeed'
import { useMergedEvents } from '@/react-app/hooks/useMergedEvents'
import { useSportsEvents } from '@/react-app/hooks/useSportsEvents'
import { useUpcomingCache } from '@/react-app/hooks/useUpcomingCache'
import { useTopLeagues } from '@/react-app/hooks/useTopLeagues'
// import { useEventLiveUpdates } from '@/react-app/hooks/useEventLiveUpdates' // Removed
import { labelOutcome } from '@/shared/helpers'

interface RosterPlayer { full_name: string; position?: string }
interface EventRoster { league: string; home: { team: string; players: RosterPlayer[] }; away: { team: string; players: RosterPlayer[] } }

export default function EventDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { darkMode, addToBetSlip, selectedCategory, showMobileSidebar, setShowMobileSidebar } = useApp()
  const [event, setEvent] = useState<any>(null)
  const [roster, setRoster] = useState<EventRoster | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Data for Sidebar
  const { live, pregame, loading: eventsLoading } = useSportsEvents(selectedCategory || null);
  const { upcomingEvents } = useUpcomingCache(pregame);

  // WebSocket Live Feed (Fetch all for consistent Sidebar)
  const { liveEvents: wsLiveEvents } = useLiveFeed(selectedCategory || 'all');

  // Merge HTTP + WS for Sidebar
  const mergedSidebarLive = useMergedEvents(live, wsLiveEvents);
  const activeTopLeagues = useTopLeagues(mergedSidebarLive, upcomingEvents);

  // --- Find event in locally loaded events (avoids CF Worker call) ---
  // Ready when the main events fetch (with odds) has completed
  const localEventsReady = !eventsLoading && (live.length > 0 || pregame.length > 0 || upcomingEvents.length > 0);

  const localFoundEvent = useMemo(() => {
    if (!id) return null;
    // Search live first, then pregame directly (avoids race with useUpcomingCache), then upcomingEvents cache
    const all = [...live, ...pregame, ...upcomingEvents];
    return all.find((e: any) =>
      String(e.id) === String(id) ||
      String(e.external_event_id) === String(id)
    ) || null;
  }, [id, live, pregame, upcomingEvents]);

  // Use local event as soon as it's available (instant load, no API call needed)
  useEffect(() => {
    if (localFoundEvent) {
      setEvent(localFoundEvent);
      setLoading(false);
      setError(null);
    }
  }, [localFoundEvent]);

  // --- Merge HTTP + WS + Placeholder Odds (Current Event) ---
  const mergedEventList = useMergedEvents(event ? [event] : [], wsLiveEvents);
  
  const displayEvent = useMemo(() => {
     if (!event) return null;
     // Robust matching: Try ID, External ID, or Fixture ID
     return mergedEventList.find((e: any) => 
        String(e.id) === String(event.id) || 
        String(e.external_event_id) === String(event.id) ||
        String(e.fixture?.id) === String(event.id)
     ) || event;
  }, [mergedEventList, event]);

  // --- Real-time Score Updates (Removed - using Polling via useLiveFeed) ---
  // const { liveUpdates, isConnected: wsConnected } = useEventLiveUpdates(id);

  // Use displayEvent for helpers where possible, but keep existing helpers consistent

  // --- Helpers ---
  const handleLabelOutcome = useCallback((market: string, name: string) => {
    return labelOutcome(market, name, displayEvent?.home_team, displayEvent?.away_team);
  }, [displayEvent]);

  const applyMarginClamp = useCallback((_mk: string, v: number) => {
    if (!(v > 0)) return v;
    const isLive = Number(displayEvent?.is_live || 0) === 1 ||
      ['1H','2H','HT','ET','BT','P','LIVE','AT','ST','Q1','Q2','Q3','Q4','OT'].includes(
        String(displayEvent?.status ?? displayEvent?.fixture?.status?.short ?? '').toUpperCase().trim()
      );
    const elapsed = Number(displayEvent?.elapsed ?? displayEvent?.fixture?.status?.elapsed ?? 0) || 0;
    const timerStr = String((displayEvent as any)?.timer || displayEvent?.fixture?.status?.timer || '');
    const minute = parseInt(timerStr.replace(/[^\d]/g, ''), 10) || elapsed;
    let cap = 40;
    if (isLive) {
      if (minute < 60) cap = 20;
      else if (minute < 70) cap = 20;
      else if (minute < 80) cap = 28;
      else if (minute < 85) cap = 33;
      else cap = 40;
    }
    return Math.min(v, cap);
  }, [displayEvent])
  const cleanTeam = (name: string) => String(name || '').replace(/\sU\d+$/, '').trim()
  const formatScore = (val: any) => {
    if (val == null) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      if (val.startsWith('{')) {
        try { const p = JSON.parse(val); return p.home ?? p.total ?? p.score ?? 0; } catch { return 0; }
      }
      const n = parseFloat(val);
      return isNaN(n) ? 0 : n;
    }
    return val?.total ?? val?.score ?? val?.current ?? 0;
  };

  const parseGoals = (goals: any) => {
    if (!goals) return { home: 0, away: 0 };
    if (typeof goals === 'string') {
      try { const p = JSON.parse(goals); return { home: p.home ?? 0, away: p.away ?? 0 }; } catch { return { home: 0, away: 0 }; }
      return { home: 0, away: 0 };
    }
    return { home: formatScore(goals.home), away: formatScore(goals.away) };
  };

  const [realtimeOdds, setRealtimeOdds] = useState<any | null>(null);
  const [oddsSuspended, setOddsSuspended] = useState(false);
  const [oddsSuspendedReason, setOddsSuspendedReason] = useState<string>('');

  // --- Fetch Event (fallback: only when local events are ready but event not found) ---
  useEffect(() => {
    if (!id) return;
    // Already found locally → no API call needed
    if (localFoundEvent) return;
    // Local events not loaded yet → stay loading, wait for local resolution
    if (!localEventsReady) return;
    
    // Local events are loaded and event not found → try API (proxy cache / CF Worker)
    const ac = new AbortController();
    
    const fetchEvent = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<any>(`/api/events/${id}`, { signal: ac.signal });
        if (data && (data.id || data.home_team)) {
          setEvent(data);
          if (data.roster) setRoster(data.roster);
        } else {
          setError('Evento não encontrado ou indisponível.');
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') setError('Evento não encontrado ou indisponível.');
      } finally { setLoading(false); }
    };

    fetchEvent();
    return () => ac.abort();
  }, [id, localFoundEvent, localEventsReady]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let inflight = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      if (inflight) {
        timeoutId = setTimeout(tick, 1500);
        return;
      }
      inflight = true;
      try {
        const sportParam = (displayEvent as any)?.sport ? `&sport=${encodeURIComponent(String((displayEvent as any).sport))}` : '';
        const data = await apiFetch<any>(`/api/events/${id}/odds?realtime=1&markets=full${sportParam}`, { cache: 'no-store' });
        if (!cancelled && data) {
          if (data.markets && Object.keys(data.markets).length > 0) setRealtimeOdds(data.markets);
          setOddsSuspended(!!data.suspended);
          setOddsSuspendedReason(String(data.suspended_reason || ''));
        }
      } catch { /* silent */ }
      inflight = false;
      const st = String(((displayEvent as any)?.status?.short || (displayEvent as any)?.fixture?.status?.short || (displayEvent as any)?.status || '')).toUpperCase().trim();
      const stLong = String((displayEvent as any)?.fixture?.status?.long || (displayEvent as any)?.status_long || '').toUpperCase();
      const live = Number((displayEvent as any)?.is_live || 0) === 1 || ['LIVE','1H','2H','HT','ET','P','PEN','Q1','Q2','Q3','Q4','OT','P1','P2','P3','S1','S2','S3','S4','S5','IN_PROGRESS'].includes(st) || /IN\s*PLAY|HALF|SET|QUARTER|INNING/.test(stLong);
      timeoutId = setTimeout(tick, live ? 5000 : 60_000);
    };

    tick();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [id, displayEvent]);

  const onSelect = useCallback((label: string, odd: number) => {
    if (!displayEvent) return;
    addToBetSlip({
      id: String(Date.now() + Math.random()),
      event_id: Number(displayEvent.id),
      match: `${displayEvent.home_team} vs ${displayEvent.away_team}`,
      selection: label,
      odd: odd,
      stake: 0,
      league: displayEvent.league_name || displayEvent.league || displayEvent.sport_title || 'Desporto'
    });
  }, [displayEvent, addToBetSlip]);

  if (loading) return <div className="p-8 text-center"><div className="animate-spin h-8 w-8 border-4 border-red-600 border-t-transparent rounded-full mx-auto"></div></div>;
  if (error || !displayEvent) return <div className="p-8 text-center text-red-600">{error || 'Evento não encontrado'}</div>;

  const statusShort = typeof displayEvent.status === 'object' ? displayEvent.status?.short : displayEvent.status;
  const statusKey = String(statusShort || displayEvent?.fixture?.status?.short || '').toUpperCase().trim();
  const liveStatuses = new Set([
    'LIVE', '1H', '2H', 'HT', 'ET', 'BT', 'P',
    'Q1', 'Q2', 'Q3', 'Q4', 'OT',
    'P1', 'P2', 'P3',
    'S1', 'S2', 'S3', 'S4', 'S5',
    'IN', 'IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'IN8', 'IN9',
    'IN_PROGRESS',
  ]);
  const isLive = displayEvent.is_live === 1 || liveStatuses.has(statusKey);
  // Status checks take priority: HT/ET/PEN must never show a running minute
  const liveTimer = (() => {
    if (statusKey === 'HT') return 'HT';
    if (statusKey === 'ET') return 'ET';
    if (statusKey === 'PEN' || statusKey === 'P') return 'PEN';
    const statusLongRaw = String((displayEvent as any)?.fixture?.status?.long ?? (displayEvent as any)?.status_long ?? '').toUpperCase();
    if (/HALF\s*TIME|INTERVAL/.test(statusLongRaw)) return 'HT';
    if (/EXTRA\s*TIME/.test(statusLongRaw)) return 'ET';
    const raw = String((displayEvent as any)?.timer || displayEvent?.fixture?.status?.timer || '').trim();
    if (!raw) return '';
    if (raw.includes(':')) return raw;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return '';
    return `${Math.floor(n)}'`;
  })();
  const liveElapsed = Number((displayEvent as any)?.elapsed ?? displayEvent?.fixture?.status?.elapsed ?? 0) || 0;

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      
      {/* Mobile Sidebar Portal */}
      {showMobileSidebar && createPortal(
          <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMobileSidebar(false)} />
              <div className={`absolute left-0 top-0 bottom-0 w-64 ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-xl overflow-y-auto transform transition-transform duration-300`}>
                  <Sidebar dynamicTopItems={activeTopLeagues} />
              </div>
          </div>,
          document.body
      )}

      {/* Full Screen Goal Animation */}
      {displayEvent?.lastGoal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="text-6xl md:text-9xl font-black text-yellow-400 animate-bounce drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)]">
            GOL!!!
          </div>
        </div>
      )}

      <div className="w-full flex items-start gap-4">
        {/* Left Sidebar */}
        <aside className={`hidden lg:block w-64 shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto ${darkMode ? 'bg-gray-800' : 'bg-white'} border-r ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="p-4 space-y-4">
             <Sidebar dynamicTopItems={activeTopLeagues} />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 pb-20 mt-4">
          {/* Match Header — score, teams, status (no pitch here) */}
          {(() => {
            const g = parseGoals(displayEvent.goals);
            const homeTeam = cleanTeam(displayEvent.home_team);
            const awayTeam = cleanTeam(displayEvent.away_team);
            const sportKey = String((displayEvent as any)?.sport || '').toLowerCase();
            const isTennis = sportKey.includes('tennis') || sportKey.includes('tênis') || sportKey.includes('tenis');

            const tennisScore = (() => {
              if (!isTennis) return null;
              const raw = (displayEvent as any)?.score;
              let obj: any = null;
              if (typeof raw === 'string') {
                const str = raw.trim();
                if (str && (str.startsWith('{') || str.startsWith('['))) {
                  try { obj = JSON.parse(str); } catch { obj = null; }
                }
              } else if (raw && typeof raw === 'object') {
                obj = raw;
              }
              if (!obj || typeof obj !== 'object') return null;

              const toNumOrNull = (v: any): number | null => {
                const n = Number(v);
                return Number.isFinite(n) ? n : null;
              };
              const readSetPair = (v: any): { home: number | null; away: number | null } => {
                if (!v || typeof v !== 'object') return { home: null, away: null };
                return { home: toNumOrNull(v.home), away: toNumOrNull(v.away) };
              };
              // Parse sets from multiple possible API key patterns
              const setsRoot = obj.sets || obj.set || obj;
              const readSet = (i: number) => {
                const keys = [`s${i}`, `set${i}`, `set_${i}`, `S${i}`];
                for (const k of keys) {
                  const v = setsRoot[k];
                  if (v && typeof v === 'object') return readSetPair(v);
                }
                return readSetPair(null);
              };
              const sets = [readSet(1), readSet(2), readSet(3), readSet(4), readSet(5)];
              let last = 0;
              for (let i = 0; i < sets.length; i++) {
                const s = sets[i];
                if (s.home != null || s.away != null) last = i + 1;
              }
              // Also derive from statusKey e.g. "S4" = 4th set in progress
              const statusSetNum = (() => {
                const m = /^S(\d)$/.exec(statusKey);
                return m ? Number(m[1]) : 0;
              })();
              const currentSet = last === 0 ? (statusSetNum || 1) : Math.min(5, Math.max(statusSetNum, last + 1));
              const count = Math.max(2, Math.min(5, currentSet));
              return { sets, count, currentSet };
            })();

            const tennisSetLabel = (() => {
              if (!isTennis || !isLive) return '';
              const m = /^S(\d)$/.exec(statusKey);
              const fromStatus = m ? Number(m[1]) : 0;
              const n = fromStatus || tennisScore?.currentSet || 0;
              return n >= 1 && n <= 5 ? `${n}º SET` : '';
            })();
            return (
              <div className={`relative rounded-xl overflow-hidden mb-4 px-4 py-5 flex flex-col items-center gap-2 ${darkMode ? 'bg-gray-800' : 'bg-white'} border ${darkMode ? 'border-gray-700' : 'border-gray-200'} shadow`}>
                {isLive && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
                    </span>
                    <span className="text-[11px] font-black text-red-600 uppercase tracking-widest">{tennisSetLabel || 'Ao Vivo'}</span>
                    {statusShort && <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'} uppercase`}>{statusShort}</span>}
                    {(liveTimer || liveElapsed > 0) && (
                      <span className="text-[11px] font-bold bg-red-600 text-white px-2 py-0.5 rounded">
                        {liveTimer || `${liveElapsed}'`}
                      </span>
                    )}
                  </div>
                )}
                <div className="w-full flex flex-col items-center gap-3">
                  <div className="w-full flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-sm md:text-base truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{homeTeam}</p>
                      {displayEvent.league_name && (
                        <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{displayEvent.league_name}</p>
                      )}
                    </div>
                    <button
                      onClick={() => navigate(`/event/${id}/stats`)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border ${
                        darkMode
                          ? 'bg-gray-700 text-white border-gray-600 hover:bg-gray-600'
                          : 'bg-white text-gray-900 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                    </button>
                    <div className="flex-1 min-w-0 text-right">
                      <p className={`font-bold text-sm md:text-base truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{awayTeam}</p>
                      {!isLive && displayEvent.date && (
                        <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{new Date(displayEvent.date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    {isLive ? (
                      isTennis && tennisScore ? (
                        <div className={`rounded-xl overflow-hidden border ${darkMode ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-gray-50'} w-full max-w-[420px]`}>
                          <div className={`grid items-center ${tennisScore.count === 2 ? 'grid-cols-[1fr_auto_auto]' : tennisScore.count === 3 ? 'grid-cols-[1fr_auto_auto_auto]' : tennisScore.count === 4 ? 'grid-cols-[1fr_auto_auto_auto_auto]' : 'grid-cols-[1fr_auto_auto_auto_auto_auto]'} px-3 py-2 gap-x-2`}>
                            <div />
                            {Array.from({ length: tennisScore.count }, (_, i) => (
                              <div key={i} className={`text-[10px] font-black text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>S{i + 1}</div>
                            ))}
                            <div className={`text-sm font-black truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{homeTeam}</div>
                            {Array.from({ length: tennisScore.count }, (_, i) => (
                              <div key={i} className={`text-sm font-black text-center tabular-nums ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                {tennisScore.sets[i]?.home ?? ''}
                              </div>
                            ))}
                            <div className={`text-sm font-black truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{awayTeam}</div>
                            {Array.from({ length: tennisScore.count }, (_, i) => (
                              <div key={i} className={`text-sm font-black text-center tabular-nums ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                {tennisScore.sets[i]?.away ?? ''}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className={`font-black text-3xl md:text-4xl tabular-nums ${darkMode ? 'text-white' : 'text-gray-900'}`}>{g.home} - {g.away}</span>
                      )
                    ) : (
                      <span className={`font-black text-xl ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>VS</span>
                    )}
                  </div>
                </div>
                {displayEvent.lastGoal && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                    <div className="text-4xl md:text-7xl font-black text-yellow-400 animate-bounce drop-shadow-[0_4px_4px_rgba(0,0,0,0.9)]">GOL!!!</div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Suspension reason banner */}
          {oddsSuspended && (() => {
            const r = String(oddsSuspendedReason || '').toUpperCase();
            const label = /GOAL|GOL|CHANCE|ATTACK|DANGER/.test(r)
              ? 'Grande Chance de Gol'
              : /VAR/.test(r)
              ? 'Revisão VAR'
              : /PENALT|PENALTY/.test(r)
              ? 'Pênalti'
              : null;
            return (
              <div className={`mb-3 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold ${label === 'Revisão VAR' ? 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-400' : label === 'Grande Chance de Gol' ? 'bg-red-600/20 border border-red-500/40 text-red-400' : label === 'Pênalti' ? 'bg-orange-500/20 border border-orange-500/40 text-orange-400' : 'bg-gray-700/50 border border-gray-600 text-gray-300'}`}>
                <span className="animate-pulse w-2 h-2 rounded-full bg-current inline-block" />
                {label ? `Odds suspensas — ${label}` : 'Odds Suspensas'}
              </div>
            );
          })()}

          {/* Odds */}
          <MemoSubOddsModel
            event={{ ...displayEvent, suspended: oddsSuspended, suspendReason: oddsSuspendedReason }}
            darkMode={darkMode}
            markets={realtimeOdds || (displayEvent as any).markets || (displayEvent as any).odds || null}
            eventOdds={realtimeOdds || (displayEvent as any).markets || (displayEvent as any).odds || null}
            onSelect={onSelect}
            labelOutcome={handleLabelOutcome}
            applyMarginClamp={applyMarginClamp}
            suspendedMarkets={[]}
            liveEvents={[]}
            liveTimer={liveTimer || (liveElapsed > 0 ? `${liveElapsed}` : '')}
            isLive={isLive}
          />
        </main>

        {/* Right Sidebar */}
        <aside className={`hidden xl:block w-80 shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto ${darkMode ? 'bg-gray-800' : 'bg-white'} border-l ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="p-4 space-y-4">
              <BetSlip />
              {roster && (
                <div className={`p-3 rounded-2xl ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
                  <div className={`font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Plantel 2025-26</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{roster.home.team}</div>
                      <ul className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm space-y-1`}>{roster.home.players.map((p,i)=> (<li key={i}>{p.full_name}{p.position ? ` (${p.position})` : ''}</li>))}</ul>
                    </div>
                    <div>
                      <div className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{roster.away.team}</div>
                      <ul className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm space-y-1`}>{roster.away.players.map((p,i)=> (<li key={i}>{p.full_name}{p.position ? ` (${p.position})` : ''}</li>))}</ul>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </aside>
      </div>
    </div>
  )
}

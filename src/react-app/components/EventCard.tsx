import { OddButton } from '@/react-app/components/OddButton';
import { useMemo, useState, memo, useEffect, useRef, Fragment } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';
import { formatLeagueHeader, abbreviateTeamName, getSportFromLeague, getSportIcon, labelOutcome } from '@/shared/helpers';
import type { LiveScore, SuspendedMarket } from '@/shared/types';
import type { LiveCardSignals } from '@/react-app/hooks/useBatchMarketSignals';
import { useTrend } from '@/react-app/hooks/useTrend';

// ── Module-level clock singleton ──────────────────────────────────────────────
// One shared interval drives all live cards; no per-card timers.
let _clockTick = 0;
const _clockSubs = new Set<() => void>();
let _clockTimer: ReturnType<typeof setInterval> | null = null;
function _subClock(fn: () => void) {
  _clockSubs.add(fn);
  if (!_clockTimer) {
    _clockTimer = setInterval(() => {
      _clockTick++;
      _clockSubs.forEach(f => { try { f(); } catch { /* */ } });
    }, 20_000);
  }
  return () => {
    _clockSubs.delete(fn);
    if (_clockSubs.size === 0 && _clockTimer) { clearInterval(_clockTimer); _clockTimer = null; }
  };
}

// Football period clock — estimates current minute from kick-off time when
// the API (Statpal) does not return an elapsed field.
// `lastSeenAt` = Date.now() when the event data was last received from the API.
// We add the minutes elapsed since then so the badge ticks forward between polls.
function computeFootballClock(
  eventDate: string | undefined,
  apiElapsed: number,
  apiTimer: string,
  statusU: string,
  lastSeenAt?: number,
): string {
  if (statusU === 'HT') return 'HT';
  if (statusU === 'ET' || statusU === 'ET1' || statusU === 'ET2') return 'ET';
  if (statusU === 'PEN' || statusU === 'P') return 'PEN';

  // Minutes elapsed since the API last refreshed this event's data.
  const msSinceUpdate = lastSeenAt && lastSeenAt > 0 ? Math.max(0, Date.now() - lastSeenAt) : 0;
  const tickAdj = Math.floor(msSinceUpdate / 60_000);

  const baseMin = apiElapsed > 0
    ? apiElapsed
    : (apiTimer ? (parseInt(apiTimer.replace(/[^0-9]/g, ''), 10) || 0) : 0);

  if (baseMin > 0) {
    // Advance by time-since-last-update so the clock ticks between API polls.
    return `${baseMin + tickAdj}'`;
  }

  // Fallback: derive minute entirely from kick-off timestamp.
  if (!eventDate) return '';
  const kickoff = new Date(eventDate).getTime();
  if (!Number.isFinite(kickoff) || kickoff <= 0) return '';
  const totalMins = Math.floor((Date.now() - kickoff) / 60_000);
  if (totalMins < 0) return '';
  if (totalMins <= 46) return `${Math.min(totalMins, 45)}'`;
  if (totalMins <= 61) return 'HT';
  if (totalMins <= 106) return `${Math.min(45 + (totalMins - 61), 90)}'`;
  return '90+';
}
// ─────────────────────────────────────────────────────────────────────────────

const normalizeSport = (s: string) => {
  const v = String(s || '').toLowerCase();
  if (v.includes('football') && !v.includes('american')) return 'soccer';
  if (v.includes('american') && v.includes('football')) return 'american-football';
  if (v.includes('ice') && v.includes('hockey')) return 'ice-hockey';
  return v.replace(/\s+/g, '-');
};

interface EventCardProps { 
  event: any; // Allow both Event (shared) and LegacyEvent
  onOpenEvent: (event: any) => void;
  liveScore?: LiveScore;
  suspension?: SuspendedMarket;
  signals?: LiveCardSignals;
}

export function EventCard({ event, onOpenEvent, suspension, signals }: EventCardProps) { 
  const { darkMode, addNotification, addToBetSlip } = useApp(); 
  const [isHovered, setIsHovered] = useState(false);

  // Scroll-vs-tap detection: only navigate if the user didn't scroll
  const touchScrollRef = useRef<{ y: number; moved: boolean }>({ y: 0, moved: false });

  // Robustly extract event ID (support both structures)
  const eventId = event.id || event.fixture?.id;
  
  // Robustly extract team names
  const homeTeamName = event.home_team || event.teams?.home?.name || (event.match ? event.match.split(' vs ')[0] : '') || (event.match ? event.match.split(' - ')[0] : '') || 'Home Team';
  const awayTeamName = event.away_team || event.teams?.away?.name || (event.match ? event.match.split(' vs ')[1] : '') || (event.match ? event.match.split(' - ')[1] : '') || 'Away Team';
  
  const eventLeague = event.league?.name || event.league || 'Unknown League'; // Handle object or string
  const eventSport = event.sport;
  const sport = eventSport ? normalizeSport(eventSport) : getSportFromLeague(typeof eventLeague === 'string' ? eventLeague : (eventLeague?.name || ''));

  // Removed useRealtimeOdds hook
  
  // Helpers
  const handleLabelOutcome = (market: string, name: string) => {
    return labelOutcome(market, name, homeTeamName, awayTeamName);
  };

  // Simplified data access (since we poll fresh events)
  const currentMarkets = useMemo(() => {
      let raw: any = (event as any)?.markets ?? (event as any)?.odds;
      if (typeof raw === 'string') {
        const s = raw.trim();
        if (s) {
          if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
            try {
              const j = JSON.parse(s);
              raw = typeof j === 'string' ? JSON.parse(j) : j;
            } catch { void 0; }
          }
        }
      }
      if (Array.isArray(raw)) return raw;
      if (raw && typeof raw === 'object') {
        return Object.entries(raw).map(([key, v]: [string, any]) => {
          if (Array.isArray(v)) return { key, selections: v };
          if (v && typeof v === 'object') {
            const selections =
              Array.isArray(v.selections) ? v.selections :
              Array.isArray(v.outcomes) ? v.outcomes :
              Array.isArray(v.values) ? v.values :
              [];
            return { key, ...v, selections };
          }
          return { key, selections: [] };
        });
      }
      return [];
  }, [event]);

  const eventTime = useMemo(() => {
    if (!event.event_date) return '';
    const d = new Date(event.event_date);
    const h = d.getHours();
    const m = d.getMinutes();
    const pad = (n: number) => String(n).padStart(2, '0');
    return m === 0 ? `${h}h` : `${h}h${pad(m)}`;
  }, [event.event_date]);

  const eventDayMonth = useMemo(() => {
    if (!event.event_date) return '';
    const d = new Date(event.event_date);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  }, [event.event_date]);

  const isLiveEvent = useMemo(() => {
    if (Number(event?.is_live || 0) === 1) return true;
    const rawSt = event?.status;
    const status = (rawSt && typeof rawSt === 'object'
      ? String((rawSt as any).short ?? (rawSt as any).code ?? '')
      : String(rawSt ?? event?.fixture?.status?.short ?? '')
    ).toUpperCase().trim();
    const liveStatuses = new Set([
      '1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE',
      'AT', 'ST',
      'Q1', 'Q2', 'Q3', 'Q4', 'OT',
      'P1', 'P2', 'P3',
      'SO',
      'S1', 'S2', 'S3', 'S4', 'S5',
      'IN', 'IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'IN8', 'IN9',
      'IN_PROGRESS',
      '2MW', '2MIN',
    ]);
    return liveStatuses.has(status);
  }, [event]);

  // Subscribe to the module-level clock for live soccer — so the minute badge
  // updates every 20 s without per-card timers.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    if (!isLiveEvent || sport !== 'soccer') return;
    return _subClock(() => setClockTick(t => t + 1));
  }, [isLiveEvent, sport]);

  const isFinishedEvent = useMemo(() => {
    const statusRaw = String(event?.status ?? event?.fixture?.status?.short ?? event?.fixture?.status?.long ?? '');
    const statusKey = statusRaw
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9_]+/g, '');
    const finishedKeys = new Set(['FT', 'AET', 'FT_PEN', 'FTPEN', 'AWD', 'WO', 'ABD', 'CANC', 'PST', 'FIN', 'FINAL', 'FINISHED', 'ENDED']);
    if (finishedKeys.has(statusKey)) return true;
    if (/MATCHFINISHED|FULLTIME|GAMEOVER|ENCERRAD|TERMINAD/.test(statusKey)) return true;
    return false;
  }, [event]);

  const cleanTeam = (s: string) => {
    const raw = String(s || '');
    const head = raw.split(',')[0] || raw;
    return abbreviateTeamName(head.trim());
  };

  const tennisScore = useMemo(() => {
    if (sport !== 'tennis') return null;
    const raw = (event as any)?.score;
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

    const toNumOrNull = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const readSetPair = (v: any): { home: number | null; away: number | null } => {
      if (!v || typeof v !== 'object') return { home: null, away: null };
      return { home: toNumOrNull(v.home), away: toNumOrNull(v.away) };
    };

    const setsRoot = obj.sets || obj.set || {};
    const maxIdx = (() => {
      if (!setsRoot || typeof setsRoot !== 'object') return 0;
      let m = 0;
      for (const k of Object.keys(setsRoot)) {
        const mm = /^(?:s|set)\s*(\d{1,2})$/i.exec(String(k).trim());
        if (!mm) continue;
        const n = Number(mm[1]);
        if (Number.isFinite(n) && n > m) m = n;
      }
      return Math.min(10, Math.max(0, m));
    })();
    const sets: Array<{ home: number | null; away: number | null }> = [];
    for (let i = 1; i <= maxIdx; i++) {
      const v = (setsRoot as any)[`s${i}`] ?? (setsRoot as any)[`set${i}`] ?? (setsRoot as any)[`S${i}`] ?? (setsRoot as any)[`SET${i}`];
      sets.push(readSetPair(v));
    }

    const normalizePoint = (v: any): '15' | '30' | '40' | 'AD' | null => {
      const s = String(v ?? '').trim().toUpperCase();
      if (s === '15' || s === '30' || s === '40') return s as any;
      if (s === 'A' || s === 'AD' || s === 'ADV' || s === 'ADVANTAGE') return 'AD';
      const n = Number(s);
      if (Number.isFinite(n) && (n === 15 || n === 30 || n === 40)) return String(n) as any;
      return null;
    };

    const pointRoot = obj.point || obj.points || obj.currentPoint || obj.current_point || {};
    const pHome = normalizePoint(pointRoot.home ?? pointRoot.h ?? obj.pointHome ?? obj.homePoint);
    const pAway = normalizePoint(pointRoot.away ?? pointRoot.a ?? obj.pointAway ?? obj.awayPoint);

    const hasAnySet = sets.some((s) => s.home != null || s.away != null);

    return { hasAnySet, sets, pHome, pAway };
  }, [event, sport]);

  // useTrend hook imported from @/react-app/hooks/useTrend

  // Get odds strictly from markets[] (Golden Rule)
  const h2hMarket = currentMarkets?.find((m: any) => m.key === 'h2h');
  
  // Robustly handle 'outcomes' (DB format) vs 'selections' (Frontend format)
  const selections = h2hMarket?.selections || h2hMarket?.outcomes;
  
  // const cleanStr = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // const hRef = cleanStr(homeTeamName);
  // const aRef = cleanStr(awayTeamName);

  const hhSelection = selections?.find((s: any) => {
    const lbl = handleLabelOutcome('h2h', s.label || s.name || s.outcome || '');
    return lbl === 'Casa';
  });

  const ddSelection = selections?.find((s: any) => {
    const lbl = handleLabelOutcome('h2h', s.label || s.name || s.outcome || '');
    return lbl === 'Empate';
  });

  const aaSelection = selections?.find((s: any) => {
    const lbl = handleLabelOutcome('h2h', s.label || s.name || s.outcome || '');
    return lbl === 'Fora';
  });

  const pickOdd = (v: any) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const s = String(v).trim().replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  const rawHh = pickOdd(hhSelection?.odd || hhSelection?.price || hhSelection?.value) || pickOdd((event as any)?.home_odd);
  const rawDd = pickOdd(ddSelection?.odd || ddSelection?.price || ddSelection?.value) || pickOdd((event as any)?.draw_odd);
  const rawAa = pickOdd(aaSelection?.odd || aaSelection?.price || aaSelection?.value) || pickOdd((event as any)?.away_odd);

  const capOdd = (v: number): number => {
    if (!(v > 0)) return v;
    const elapsed = Number((event as any).elapsed ?? (event as any).fixture?.status?.elapsed ?? 0) || 0;
    const timerStr = String((event as any).timer || (event as any).fixture?.status?.timer || '');
    const minute = parseInt(timerStr.replace(/[^\d]/g, ''), 10) || elapsed;
    let cap = 40;
    if (isLiveEvent) {
      if (minute < 70) cap = 20;
      else if (minute < 80) cap = 28;
      else if (minute < 85) cap = 33;
      else cap = 40;
    }
    return Math.min(v, cap);
  };

  const hh = capOdd(rawHh);
  const dd = capOdd(rawDd);
  const aa = capOdd(rawAa);

  const homeTrend = useTrend(hh);
  const drawTrend = useTrend(dd);
  const awayTrend = useTrend(aa);

  // Market suspended check
  const isH2hSuspended = h2hMarket?.suspended ?? false;
  const h2hReason = h2hMarket?.suspended_reason;
  const marketSuspended = isH2hSuspended ? { reason: h2hReason || 'SUSPENSO' } : undefined;

  // Add bet handler
  const addPrimary = (label: string, price: number, selectionSuspended?: boolean) => {
    if (!(price > 0)) { addNotification({ type: 'warning', message: 'Odd indisponível' }); return; }
    
    // Map label to standard selection names if needed
    let selection = label;
    if (label === 'Casa') selection = 'Home';
    if (label === 'Empate') selection = 'Draw';
    if (label === 'Fora') selection = 'Away';

    const idStr = `ev-${eventId}-${selection.toLowerCase()}`;
    addToBetSlip({ 
      id: idStr, 
      event_id: eventId, 
      match: String(event.match || `${homeTeamName} vs ${awayTeamName}`), 
      selection: selection, 
      market: 'Resultado Final', // Explicit market name
      odd: price, 
      stake: 0,
      league: typeof eventLeague === 'string' ? eventLeague : (eventLeague?.name || ''),
      sport: (eventSport ? normalizeSport(eventSport) : getSportFromLeague(typeof eventLeague === 'string' ? eventLeague : (eventLeague?.name || ''))),
      suspended: selectionSuspended,
      market_suspended: isH2hSuspended
    });
  };

  // Check if we have valid odds locally, even if realtime thinks it's suspended
  const hasLocalOdds = currentMarkets && currentMarkets.length > 0;

  const apiVarActive = !!signals?.varActive;
  const isSuspended = apiVarActive || ((!!suspension || (event as any).oddsFrozen || event.suspended) && !hasLocalOdds);

  const suspendReason = apiVarActive
    ? 'VAR'
    : (suspension?.reason || (event as any).suspendReason || ((event as any).oddsFrozen ? 'EVENT_FROZEN' : 'SUSPENSO'));

  const apiCritState = useMemo(() => {
    if (apiVarActive) return 'var_review' as const
    const c = signals?.cta
    if (!c || c === 'idle') return 'idle' as const
    return c as any
  }, [apiVarActive, signals?.cta])

  // ─────────────────────────────────────────────────────────────────────
  // Critical-event state machine — listing card
  // ─────────────────────────────────────────────────────────────────────
  type CritState = 'idle' | 'big_chance' | 'var_review' | 'var_penalty' | 'goal' | 'penalty' | 'cards';
  const [critState, setCritState] = useState<CritState>('idle');
  const lastEventIdRef = useRef<string>('');
  const lastNotifCritRef = useRef<string>('');   // dedup toast notifications

  const liveEventList: any[] = useMemo(() => {
    const a = (event as any)?.events;
    if (Array.isArray(a)) return a;
    const b = (event as any)?.fixture?.events;
    return Array.isArray(b) ? b : [];
  }, [event]);

  // Duration config per state
  const CRIT_DURATIONS: Record<CritState, number> = {
    idle: 0, goal: 18000, var_penalty: 25000, penalty: 20000,
    var_review: 30000, big_chance: 12000, cards: 10000,
  };

  // Notification messages per state
  const CRIT_NOTIF: Partial<Record<CritState, string>> = {
    goal:        '⚽ GOL! Odds bloqueadas.',
    var_review:  '📺 Revisão VAR em curso.',
    var_penalty: '🎯 VAR: Pênalti confirmado!',
    penalty:     '🎯 Pênalti marcado!',
    big_chance:  '🔥 Grande chance de gol!',
    cards:       '🟨 Cartão mostrado.',
  };

  // ODD suspend reason per crit state
  const CRIT_TO_REASON: Partial<Record<CritState, string>> = {
    goal:        'GOAL',
    var_review:  'VAR',
    var_penalty: 'VAR_PENALTY',
    penalty:     'PENALTY',
    big_chance:  'CHANCE',
    cards:       'CARD',
  };

  useEffect(() => {
    if (!isLiveEvent || liveEventList.length === 0) return;
    const latest = liveEventList[liveEventList.length - 1];
    if (!latest) return;
    const id = `${latest?.timer || latest?.minute || latest?.time?.elapsed || ''}|${latest?.type || ''}|${latest?.detail || ''}|${latest?.player?.name || latest?.player || ''}`;
    if (id === lastEventIdRef.current) return;
    lastEventIdRef.current = id;

    const text = `${latest?.type || ''} ${latest?.detail || ''} ${latest?.text || ''}`.toLowerCase();
    let next: CritState | null = null;
    if (/(var.*pen|pen.*var|p[eê]nalti.*confirmad|penalty.*confirmed)/.test(text)) next = 'var_penalty';
    else if (/\bvar\b|video.*assist|review/.test(text)) next = 'var_review';
    else if (/\b(goal|gol)\b/.test(text) && !/disallow|cancel|anulad|missed|own/.test(text)) next = 'goal';
    else if (/pen[aâ]lti|penalty/.test(text)) next = 'penalty';
    else if (/cart[aã]o|card|yellow|red/.test(text)) next = 'cards';
    else if (/big.*chance|grande.*chance|great.*chance|big_chance/.test(text)) next = 'big_chance';

    if (next) {
      setCritState(next);
      const dur = CRIT_DURATIONS[next] || 10000;
      const t = setTimeout(() => setCritState('idle'), dur);
      return () => clearTimeout(t);
    }
  }, [liveEventList, isLiveEvent]);

  useEffect(() => {
    if (!isLiveEvent) return;
    const effectiveCrit: CritState = apiCritState !== 'idle' ? (apiCritState as CritState) : critState;
    if (effectiveCrit === 'idle') return;
    const key = `${eventId}|${effectiveCrit}`;
    if (lastNotifCritRef.current === key) return;
    lastNotifCritRef.current = key;
    const msg = CRIT_NOTIF[effectiveCrit];
    if (!msg) return;
    const matchStr = String((event as any)?.match || `${homeTeamName} vs ${awayTeamName}`);
    addNotification({ type: 'info', message: `${matchStr}: ${msg}` });
  }, [addNotification, apiCritState, critState, event, eventId, homeTeamName, awayTeamName, isLiveEvent]);
  const apostaJaActive = useMemo(() => {
    if (!isLiveEvent) return false;
    if (hh > 0 && hh <= 1.01) return true;
    if (dd > 0 && dd <= 1.01) return true;
    if (aa > 0 && aa <= 1.01) return true;
    return false;
  }, [isLiveEvent, hh, dd, aa]);

  // Choose the favourite (lowest non-zero odd) for one-tap betting
  const favBet = useMemo(() => {
    const opts: { label: 'Casa' | 'Empate' | 'Fora'; odd: number }[] = [];
    if (hh > 0) opts.push({ label: 'Casa', odd: hh });
    if (dd > 0) opts.push({ label: 'Empate', odd: dd });
    if (aa > 0) opts.push({ label: 'Fora', odd: aa });
    if (opts.length === 0) return null;
    return opts.reduce((m, x) => x.odd < m.odd ? x : m, opts[0]);
  }, [hh, dd, aa]);

  return (
    <div 
      className={`border rounded-lg p-3 transition-all duration-300 ${ 
        darkMode ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' : 'bg-white border-gray-200 hover:border-red-400 hover:shadow-lg' 
      } ${isHovered ? 'scale-[1.02]' : ''}`} 
      onMouseEnter={() => setIsHovered(true)} 
      onMouseLeave={() => setIsHovered(false)} 
      onTouchStart={(e) => {
        touchScrollRef.current = { y: e.touches[0].clientY, moved: false };
      }}
      onTouchMove={(e) => {
        if (Math.abs(e.touches[0].clientY - touchScrollRef.current.y) > 10) {
          touchScrollRef.current.moved = true;
        }
      }}
      onClick={() => {
        if (touchScrollRef.current.moved) {
          touchScrollRef.current.moved = false;
          return;
        }
        onOpenEvent(event);
      }}
    > 
      <div className="flex flex-col sm:flex-row justify-between items-start"> 
         <div className="flex-1 w-full sm:w-auto mb-3 sm:mb-0"> 
        <div className="flex items-center gap-2 mb-1">
         {(() => {
          const { flag, country, league: formattedLeague, flagUrl } = formatLeagueHeader(event);
          const sportIcon = getSportIcon(sport);
          
          const leagueLabel = sport === 'cricket' ? 'Críquete' : formattedLeague;

          return (
            <span className={`flex items-center gap-2 text-xs font-din ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
               <div className="relative w-6 h-6 flex-shrink-0">
                    <img src={sportIcon} alt={sport} className="w-full h-full object-contain p-0.5 opacity-90" />
                    {(flagUrl || flag) && (
                        <span className={`absolute -bottom-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full shadow-sm border ${darkMode ? 'border-gray-800 bg-gray-700' : 'border-white bg-white'} overflow-hidden`}>
                            {flagUrl ? <img src={flagUrl} alt={country} className="w-full h-full object-cover" /> : <span className="text-[10px]">{flag}</span>}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold uppercase tracking-tight">{leagueLabel}</span>
                    {country && <span className="opacity-70 font-normal hidden sm:inline">· {country}</span>}
                    
                    <div className="flex items-center gap-1 ml-1 pl-1 border-l border-gray-300 dark:border-gray-600">
                        {eventDayMonth && <span className="opacity-80 text-[10px]">{eventDayMonth}</span>}
                        {sport === 'tennis' && eventTime && <span className="opacity-80 text-[10px]">{eventTime}</span>}
                    </div>
                </div>
            </span>
          );
        })()}
       </div>
           
      
      <div className="flex items-center gap-3 w-full">
        <button 
          onPointerDown={(e) => { e.stopPropagation(); onOpenEvent(event); }}
          onClick={(e: ReactMouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onOpenEvent(event); }} 
          className={`text-left w-full ${darkMode ? 'text-white hover:text-red-300' : 'text-gray-900 hover:text-red-700'} underline-offset-2 hover:underline overflow-hidden`} 
        > 
          {sport === 'tennis' ? (
            <span className="relative flex items-center gap-2 w-full justify-start">
              <div className="flex flex-col gap-1.5 min-w-0 flex-1 pr-14">
                {(() => {
                  const statusShort = String(event?.status ?? event?.fixture?.status?.short ?? '').toUpperCase().trim();
                  const statusLong = String(event?.fixture?.status?.long ?? (event as any)?.status_long ?? '').toUpperCase().trim();
                  const setNumFromStatus = (() => {
                    const m1 = statusShort.match(/^S(\d{1,2})$/);
                    if (m1) return Number(m1[1]);
                    const m2 = statusLong.match(/\bSET\s*(\d{1,2})\b/);
                    if (m2) return Number(m2[1]);
                    const m3 = statusShort.match(/\bSET\s*(\d{1,2})\b/);
                    if (m3) return Number(m3[1]);
                    const m4 = statusShort.match(/\b(\d{1,2})(?:ST|ND|RD|TH)\s+SET\b/);
                    if (m4) return Number(m4[1]);
                    const m5 = statusLong.match(/\b(\d{1,2})(?:ST|ND|RD|TH)\s+SET\b/);
                    if (m5) return Number(m5[1]);
                    return 0;
                  })();

                  const setsAll = tennisScore?.sets || [];
                  let maxWithAny = 0;
                  for (let i = 0; i < Math.min(10, setsAll.length); i++) {
                    const s = setsAll[i];
                    if (!s) continue;
                    if (s.home != null || s.away != null) maxWithAny = i + 1;
                  }

                  const maxCols = 5;
                  const cols =
                    isLiveEvent
                      ? Math.min(maxCols, Math.max(1, setNumFromStatus || 1, maxWithAny))
                      : Math.min(maxCols, maxWithAny);
                  const showSets = cols > 0 && (isLiveEvent || !!tennisScore?.hasAnySet);
                  const sets = Array.from({ length: cols }, (_, i) => setsAll[i] || { home: null, away: null });

                  return (
                    <div
                      className="grid gap-x-1 gap-y-1 items-center tabular-nums"
                      style={{
                        gridTemplateColumns: showSets ? `minmax(0,1fr) repeat(${cols}, 1.25rem) auto` : `minmax(0,1fr) auto`,
                      }}
                    >
                      {showSets ? (
                        <>
                          <span />
                          {Array.from({ length: cols }).map((_, i) => (
                            <span key={`hdr-s-${i + 1}`} className={`text-[10px] font-bold text-right ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                              {`S${i + 1}`}
                            </span>
                          ))}
                          <span />
                        </>
                      ) : null}

                      {(['home', 'away'] as const).map((side) => {
                        const name = side === 'home' ? homeTeamName : awayTeamName;
                        const point = side === 'home' ? tennisScore?.pHome : tennisScore?.pAway;
                        return (
                          <Fragment key={side}>
                            <span className="text-sm font-semibold truncate leading-tight min-w-0">
                              {String(name || '').split(',')[0].trim() || '-'}
                            </span>
                            {showSets
                              ? sets.map((s, idx) => {
                                  const val = side === 'home' ? s.home : s.away;
                                  return (
                                    <span key={`${side}-s-${idx}`} className={`text-right text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                      {val ?? ''}
                                    </span>
                                  );
                                })
                              : null}
                            {isLiveEvent && point ? (
                              <span className={`ml-1 px-1 rounded text-[10px] font-extrabold ${darkMode ? 'bg-gray-700 text-gray-100' : 'bg-gray-200 text-gray-900'}`}>
                                {point}
                              </span>
                            ) : (
                              <span />
                            )}
                          </Fragment>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {(() => {
                if (!isLiveEvent) {
                  return (
                    <span className={`text-xs font-bold shrink-0 px-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {'vs'}
                    </span>
                  );
                }

                const statusShort = String(event?.status ?? event?.fixture?.status?.short ?? '').toUpperCase().trim();
                const statusLong = String(event?.fixture?.status?.long ?? (event as any)?.status_long ?? '').toUpperCase().trim();
                const setNumFromStatus = (() => {
                  const m1 = statusShort.match(/^S(\d{1,2})$/);
                  if (m1) return Number(m1[1]);
                  const m2 = statusLong.match(/\bSET\s*(\d{1,2})\b/);
                  if (m2) return Number(m2[1]);
                  const m3 = statusShort.match(/\bSET\s*(\d{1,2})\b/);
                  if (m3) return Number(m3[1]);
                  const m4 = statusShort.match(/\b(\d{1,2})(?:ST|ND|RD|TH)\s+SET\b/);
                  if (m4) return Number(m4[1]);
                  const m5 = statusLong.match(/\b(\d{1,2})(?:ST|ND|RD|TH)\s+SET\b/);
                  if (m5) return Number(m5[1]);
                  return 0;
                })();
                const setLabel = setNumFromStatus >= 1 ? `${setNumFromStatus}º SET` : '';
                const timerRaw = String((event as any).timer || (event as any).fixture?.status?.timer || '').trim();
                // For live soccer, use the advancing clock so the badge never lags behind the API poll.
                const timer = (sport === 'soccer' && isLiveEvent)
                  ? computeFootballClock(
                      String((event as any)?.event_date || (event as any)?.fixture?.date || ''),
                      Number((event as any).elapsed ?? (event as any).fixture?.status?.elapsed ?? 0) || 0,
                      timerRaw,
                      statusU,
                      Number((event as any)?.__lastSeenAt || 0) || undefined,
                    )
                  : timerRaw;

                return (
                  <span className="absolute right-0 top-0 flex flex-col items-end gap-0.5">
                    {setLabel ? (
                      <span className="text-[10px] font-bold text-red-600 bg-red-600/10 rounded px-1 leading-tight">{setLabel}</span>
                    ) : (
                      <span className="text-xs font-bold text-red-600">AO VIVO</span>
                    )}
                    {timer ? (
                      <span className="text-[10px] font-bold text-[#39FF14]">{timer}</span>
                    ) : null}
                  </span>
                );
              })()}
            </span>
          ) : (
            <span className="flex items-center gap-2 w-full justify-start">
              <div className="flex items-center gap-2 min-w-0 max-w-[46%]">
                <span className="text-sm font-semibold truncate leading-tight">{cleanTeam(homeTeamName)}</span>
              </div>

              {(() => {
              const rawHome = (event as any).goals?.home ?? (event as any).golsCasa ?? (event as any).score_home;
              const rawAway = (event as any).goals?.away ?? (event as any).golsFora ?? (event as any).score_away;

              const formatScore = (val: any) => {
                if (val === null || val === undefined) return undefined;
                if (typeof val === 'object') {
                  const picks = [(val as any).total, (val as any).score, (val as any).current, (val as any).goals];
                  for (const p of picks) {
                    if (p === null || p === undefined) continue;
                    const n = Number(p);
                    if (Number.isFinite(n)) return n;
                  }
                  return undefined;
                }
                const n = Number(val);
                if (Number.isFinite(n)) return n;
                return undefined;
              };

              let homeScore = formatScore(rawHome);
              let awayScore = formatScore(rawAway);
              let forceTimer: string = '';

              if (isLiveEvent && (homeScore === undefined || awayScore === undefined) && (event as any).score) {
                const s = (event as any).score;
                if (typeof s === 'string') {
                  const str = s.trim();
                  if (str) {
                    if (str.includes('{') || str.includes(':')) {
                      try {
                        const j = JSON.parse(str);
                        const hn = Number(j?.home);
                        const an = Number(j?.away);
                        if (homeScore === undefined && Number.isFinite(hn)) homeScore = hn;
                        if (awayScore === undefined && Number.isFinite(an)) awayScore = an;
                      } catch { void 0 }
                    } else {
                      if (/pen/i.test(str)) forceTimer = 'PEN';
                      const m = str.match(/(\d+)\s*[-:]\s*(\d+)/);
                      if (m) {
                        const hs = Number(m[1]);
                        const awayStr = String(m[2] || '').trim();
                        let as = Number(awayStr);

                        if (sport === 'soccer' && awayStr.length >= 3 && Number.isFinite(hs) && Number.isFinite(as) && as > 9) {
                          const tryLens = [2, 3];
                          for (const minLen of tryLens) {
                            if (awayStr.length <= minLen) continue;
                            const awayPart = awayStr.slice(0, -minLen);
                            const minPart = awayStr.slice(-minLen);
                            const awayN = Number(awayPart);
                            const minN = Number(minPart);
                            if (!Number.isFinite(awayN) || !Number.isFinite(minN)) continue;
                            if (awayN < 0 || awayN > 9) continue;
                            if (minLen === 2 && minN > 99) continue;
                            if (minLen === 3 && minN < 100) continue;
                            if (minN < 0 || minN > 130) continue;
                            as = awayN;
                            break;
                          }
                        }

                        if (homeScore === undefined && Number.isFinite(hs)) homeScore = hs;
                        if (awayScore === undefined && Number.isFinite(as)) awayScore = as;
                      }
                    }
                  }
                } else if (typeof s === 'object') {
                  const hn = Number((s as any)?.home);
                  const an = Number((s as any)?.away);
                  if (homeScore === undefined && Number.isFinite(hn)) homeScore = hn;
                  if (awayScore === undefined && Number.isFinite(an)) awayScore = an;
                }
              }

              let scoreStr = '';
              if (isLiveEvent && homeScore !== undefined && awayScore !== undefined) {
                scoreStr = `${homeScore}-${awayScore}`;
              } else if (isLiveEvent && event.score) {
                let displayScore: any = event.score;
                if (typeof displayScore === 'string' && (displayScore.includes('{') || displayScore.includes(':'))) {
                  try {
                    const parsed = JSON.parse(displayScore);
                    const hn = Number(parsed?.home);
                    const an = Number(parsed?.away);
                    if (Number.isFinite(hn) && Number.isFinite(an)) {
                      displayScore = `${hn}-${an}`;
                    }
                  } catch {
                    displayScore = String(displayScore);
                  }
                } else if (typeof displayScore === 'object' && displayScore?.home !== undefined) {
                  const hn = Number(displayScore?.home);
                  const an = Number(displayScore?.away);
                  if (Number.isFinite(hn) && Number.isFinite(an)) {
                    displayScore = `${hn}-${an}`;
                  } else {
                    displayScore = '';
                  }
                }
                scoreStr = String(displayScore);
              }

              const elapsed = Number((event as any).elapsed ?? (event as any).fixture?.status?.elapsed ?? (event as any).status?.elapsed ?? 0) || 0;
              const timer = String((event as any).timer || (event as any).fixture?.status?.timer || '').trim();
              const statusShort = (() => {
                const raw = (event as any).status;
                if (raw && typeof raw === 'object') return String((raw as any).short ?? (raw as any).code ?? '');
                return String(raw ?? (event as any).fixture?.status?.short ?? '');
              })().trim();
              const statusLong = String((event as any).fixture?.status?.long ?? (event as any).status_long ?? (event as any).status?.long ?? '').trim();
              const statusU = statusShort.toUpperCase();

              const derivedTimer = (() => {
                const candidate = String(statusLong || statusShort || '').trim();
                const cu = candidate.toUpperCase();

                if (sport === 'tennis') return '';

                if (sport === 'soccer') {
                  if (forceTimer) return forceTimer;
                  // Rare statuses that computeFootballClock doesn't handle
                  if (statusU === 'AT' || statusU === 'ST') return statusU;
                  if (/HALF\s*TIME|INTERVAL/.test(cu)) return 'HT';
                  if (/EXTRA\s*TIME/.test(cu)) return 'ET';
                  if (/^PEN/.test(cu) && statusU !== '1H' && statusU !== '2H') return 'PEN';
                  // Uses API elapsed + kick-off estimate when Statpal gives no minute.
                  // __lastSeenAt lets the clock advance between API polls.
                  return computeFootballClock(
                    String((event as any)?.event_date || (event as any)?.fixture?.date || ''),
                    elapsed,
                    timer,
                    statusU,
                    Number((event as any)?.__lastSeenAt || 0) || undefined,
                  );
                }

                if (sport === 'basketball') {
                  if (timer && /:/.test(timer)) return timer;
                  // statusShort takes priority (most reliable)
                  if (statusU === 'Q1' || statusU === 'Q2' || statusU === 'Q3' || statusU === 'Q4') return statusU;
                  if (statusU === 'OT') return 'OT';
                  if (statusU === 'HT') return 'HT';
                  // Fallback: parse statusLong e.g. "First Quarter", "1st Quarter", "Q1"
                  if (/\b(1ST|FIRST)\b.*QUARTER|QUARTER.*\b(1ST|FIRST)\b|^Q1$/.test(cu)) return 'Q1';
                  if (/\b(2ND|SECOND)\b.*QUARTER|QUARTER.*\b(2ND|SECOND)\b|^Q2$/.test(cu)) return 'Q2';
                  if (/\b(3RD|THIRD)\b.*QUARTER|QUARTER.*\b(3RD|THIRD)\b|^Q3$/.test(cu)) return 'Q3';
                  if (/\b(4TH|FOURTH)\b.*QUARTER|QUARTER.*\b(4TH|FOURTH)\b|^Q4$/.test(cu)) return 'Q4';
                  if (/\bOVERTIME\b|\bOT\b/.test(cu)) return 'OT';
                  if (/\bHALF\s*TIME\b/.test(cu)) return 'HT';
                  return '';
                }

                if (sport === 'ice-hockey') {
                  if (timer && /:/.test(timer)) return timer;
                  if (statusU === 'P1' || statusU === 'P2' || statusU === 'P3' || statusU === 'OT' || statusU === 'SO') return statusU;
                  if (cu === 'P1' || cu === 'P2' || cu === 'P3' || cu === 'OT' || cu === 'SO') return cu;
                  return '';
                }

                if (sport === 'american-football') {
                  if (timer && /:/.test(timer)) return timer;
                  if (statusU === '2MW' || statusU === '2MIN') return '2MIN';
                  if (statusU === 'Q1' || statusU === 'Q2' || statusU === 'Q3' || statusU === 'Q4' || statusU === 'OT' || statusU === 'HT') return statusU;
                  if (cu === 'Q1' || cu === 'Q2' || cu === 'Q3' || cu === 'Q4' || cu === 'OT' || cu === 'HT') return cu;
                  return '';
                }

                if (sport === 'baseball') {
                  if (/\b(TOP|BOTTOM)\b/i.test(candidate) || /\b(1ST|2ND|3RD|4TH|5TH|6TH|7TH|8TH|9TH)\b/i.test(candidate)) return candidate;
                  return '';
                }

                if (!candidate) return '';
                if (cu === 'LIVE' || cu === 'INPLAY' || cu === 'IN PLAY' || cu === 'PLAYING') return '';
                if (/\b(TOP|BOTTOM)\b/i.test(candidate) || /\b(1ST|2ND|3RD|4TH|5TH|6TH|7TH|8TH|9TH)\b/i.test(candidate)) return candidate;
                if (cu === 'Q1' || cu === 'Q2' || cu === 'Q3' || cu === 'Q4') return candidate;
                if (cu === 'P1' || cu === 'P2' || cu === 'P3') return candidate;
                return candidate.length <= 8 ? candidate : '';
              })();

              const displayTimer = derivedTimer;

              if (isLiveEvent) {
                return (
                  <span className="flex flex-col items-center shrink-0 px-1 gap-0.5">
                    <span className="text-xs font-bold text-red-600">{scoreStr || 'AO VIVO'}</span>
                    {displayTimer && (
                      <span
                        className="text-[10px] font-bold rounded px-1 leading-tight"
                        style={sport === 'soccer'
                          ? { color: '#39FF14', background: 'rgba(57,255,20,0.12)' }
                          : { color: '#ef4444', background: 'rgba(239,68,68,0.10)' }}
                      >{displayTimer}</span>
                    )}
                  </span>
                );
              }

              return (
                <span className={`text-xs font-bold shrink-0 px-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  {eventTime || 'vs'}
                </span>
              );
            })()}
           
            <div className="flex items-center gap-2 min-w-0 max-w-[46%]">
              <span className="text-sm font-semibold truncate leading-tight">{cleanTeam(awayTeamName)}</span>
            </div>
          </span>
          )}
        </button>
        
      </div>
          
         </div> 
        <div className="text-left sm:text-right mt-2 sm:mt-0 w-full sm:w-auto">
          {(() => {
          const hasPrimary = (hh > 0) || (dd > 0) || (aa > 0);
          const isTwoWaySport = ['basketball', 'tennis', 'american-football', 'baseball', 'mma', 'volleyball', 'handball', 'ice-hockey', 'hockey', 'cricket'].includes(sport);
          const showDraw = !isTwoWaySport && dd > 0;
          const gridCols = showDraw ? 'grid-cols-3' : 'grid-cols-2';
          
          if (!hasPrimary) {
              return (
                  <div className={`grid ${gridCols} gap-2 w-full sm:w-[320px] lg:w-[400px] opacity-50 cursor-not-allowed`}>
                      <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700 rounded p-2 h-[50px]">
                           <span className="text-xs text-gray-500 font-bold">-</span>
                      </div>
                      {showDraw && (
                         <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700 rounded p-2 h-[50px]">
                             <span className="text-xs text-gray-500 font-bold">-</span>
                        </div>
                      )}
                       <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700 rounded p-2 h-[50px]">
                           <span className="text-xs text-gray-500 font-bold">-</span>
                      </div>
                  </div>
              );
          }
            
            if (isFinishedEvent) {
              return (
                <div className="w-full sm:w-[320px] lg:w-[400px]">
                  <div className={`w-full h-12 rounded-lg flex items-center justify-center gap-2 font-black text-sm uppercase tracking-widest border
                    ${darkMode
                      ? 'bg-gray-700/70 border-gray-600 text-gray-300'
                      : 'bg-gray-100 border-gray-300 text-gray-600'}`}
                  >
                    <span className="text-base opacity-80">⏹</span>
                    <span>Fim de Jogo</span>
                  </div>
                </div>
              );
            }

            const effectiveCrit: CritState = apiCritState !== 'idle' ? (apiCritState as CritState) : critState

            // Odds are blocked during any critical event OR explicit suspension
            const isOddsBlocked = isSuspended || (effectiveCrit !== 'idle' && isLiveEvent)
            const blockReason: string = isSuspended
              ? (suspendReason === 'VAR' ? 'VAR' : suspendReason === 'EVENT_FROZEN' ? 'GOAL' : 'SUSPENSO')
              : (CRIT_TO_REASON[effectiveCrit] || 'SUSPENSO')

            // Suspension object passed to OddButton
            const critSuspended = isOddsBlocked ? { reason: blockReason } : undefined

            // CTA banner — shown during any active critical state
            if (effectiveCrit !== 'idle' && isLiveEvent) {
              const cfgMap: Record<string, { label: string; bg: string; ring: string; anim: string; clickable: boolean }> = {
                goal:        { label: '⚽ GOL!',                    bg: 'from-emerald-500 to-green-600',   ring: 'ring-emerald-300', anim: 'animate-bounce',  clickable: false },
                big_chance:  { label: '🔥 GRANDE CHANCE',           bg: 'from-orange-500 to-amber-600',    ring: 'ring-orange-300',  anim: 'animate-pulse',   clickable: true  },
                var_review:  { label: '📺 REVISÃO VAR',             bg: 'from-indigo-600 to-purple-700',   ring: 'ring-purple-300',  anim: 'animate-pulse',   clickable: false },
                var_penalty: { label: '🎯 VAR: PÊNALTI CONFIRMADO', bg: 'from-yellow-500 to-amber-600',    ring: 'ring-yellow-300',  anim: 'animate-pulse',   clickable: false },
                penalty:     { label: '🎯 PÊNALTI',                 bg: 'from-orange-500 to-red-600',      ring: 'ring-orange-300',  anim: 'animate-pulse',   clickable: false },
                cards:       { label: '🟨 CARTÕES',                 bg: 'from-yellow-500 to-amber-600',    ring: 'ring-yellow-300',  anim: '',                clickable: true  },
              }
              const cfg = cfgMap[effectiveCrit] || cfgMap.big_chance
              const canClick = cfg.clickable && !!favBet && !isSuspended
              return (
                <div className="w-full sm:w-[320px] lg:w-[400px]">
                  <button
                    disabled={!canClick}
                    onClick={canClick ? (e) => { e.stopPropagation(); addPrimary(favBet!.label, favBet!.odd); } : undefined}
                    className={`w-full h-12 rounded-lg font-black text-sm uppercase tracking-wider text-white shadow-lg
                      bg-gradient-to-r ${cfg.bg} ring-2 ${cfg.ring} ring-opacity-60 ${cfg.anim}
                      transition-all duration-200 flex items-center justify-center gap-2
                      ${canClick ? 'hover:scale-[1.02] active:scale-95 cursor-pointer' : 'cursor-default opacity-95'}`}
                  >
                    <span>{cfg.label}</span>
                    {canClick && favBet && (
                      <span className="ml-1 opacity-80 text-xs normal-case font-bold">
                        {favBet.label} {favBet.odd.toFixed(2)}
                      </span>
                    )}
                  </button>
                </div>
              );
            }

            if (apostaJaActive && !isSuspended) {
              return (
                <div className="w-full sm:w-[320px] lg:w-[400px]">
                  <div
                    className="w-full h-12 rounded-lg font-black text-sm uppercase tracking-wider text-white shadow-lg
                      bg-gradient-to-r from-red-600 to-rose-700 ring-2 ring-red-400 ring-opacity-50 animate-pulse
                      flex items-center justify-center gap-2 cursor-default select-none"
                  >
                    <span>⚡ APOSTA JÁ</span>
                  </div>
                </div>
              );
            }

            return (
              <div className={`grid ${gridCols} gap-2 relative transition-opacity duration-300 w-full sm:w-[320px] lg:w-[400px] ${isOddsBlocked ? 'opacity-70' : ''}`}>
                {sport === 'tennis' ? (
                  <>
                    {(hh > 0) ? (
                      <div className="flex flex-col gap-1">
                        <OddButton
                          label="Casa"
                          teamName={String(homeTeamName || '').split(',')[0].trim()}
                          price={hh}
                          trend={homeTrend}
                          onClick={(e) => { e.stopPropagation(); addPrimary('Casa', hh, hhSelection?.suspended); }}
                          className="w-full h-full min-h-[44px] px-2 py-1 rounded-lg bg-red-600 text-white hover:opacity-90 flex items-center justify-between gap-1"
                          suspended={critSuspended || marketSuspended || (hhSelection?.suspended ? { reason: 'SUSPENSO' } : undefined)}
                        />
                      </div>
                    ) : <div />}

                    {(aa > 0) ? (
                      <div className="flex flex-col gap-1">
                        <OddButton
                          label="Fora"
                          teamName={String(awayTeamName || '').split(',')[0].trim()}
                          price={aa}
                          trend={awayTrend}
                          onClick={(e) => { e.stopPropagation(); addPrimary('Fora', aa, aaSelection?.suspended); }}
                          className="w-full h-full min-h-[44px] px-2 py-1 rounded-lg bg-red-600 text-white hover:opacity-90 flex items-center justify-between gap-1"
                          suspended={critSuspended || marketSuspended || (aaSelection?.suspended ? { reason: 'SUSPENSO' } : undefined)}
                        />
                      </div>
                    ) : <div />}
                  </>
                ) : (
                  <>
                    {(hh > 0) ? (
                      <OddButton
                        label="Casa"
                        price={hh}
                        trend={homeTrend}
                        onClick={(e) => { e.stopPropagation(); addPrimary('Casa', hh, hhSelection?.suspended); }}
                        className="w-full h-full min-h-[44px] px-2 py-1 rounded-lg bg-red-600 text-white hover:opacity-90 flex items-center justify-between gap-1"
                        suspended={critSuspended || marketSuspended || (hhSelection?.suspended ? { reason: 'SUSPENSO' } : undefined)}
                      />
                    ) : <div />}

                    {showDraw && (
                      <OddButton
                        label="Empate"
                        price={dd}
                        trend={drawTrend}
                        onClick={(e) => { e.stopPropagation(); addPrimary('Empate', dd, ddSelection?.suspended); }}
                        className="w-full h-full min-h-[44px] px-2 py-1 rounded-lg bg-red-600 text-white hover:opacity-90 flex items-center justify-between gap-1"
                        suspended={critSuspended || marketSuspended || (ddSelection?.suspended ? { reason: 'SUSPENSO' } : undefined)}
                      />
                    )}

                    {(aa > 0) ? (
                      <OddButton
                        label="Fora"
                        price={aa}
                        trend={awayTrend}
                        onClick={(e) => { e.stopPropagation(); addPrimary('Fora', aa, aaSelection?.suspended); }}
                        className="w-full h-full min-h-[44px] px-2 py-1 rounded-lg bg-red-600 text-white hover:opacity-90 flex items-center justify-between gap-1"
                        suspended={critSuspended || marketSuspended || (aaSelection?.suspended ? { reason: 'SUSPENSO' } : undefined)}
                      />
                    ) : <div />}
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div> 
  ); 
}

export const MemoEventCard = memo(EventCard);
export default MemoEventCard;

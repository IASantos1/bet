import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch } from '../utils/api';

const __DBG_URL = (import.meta.env.DEV && (import.meta as any).env?.VITE_DEBUG_SERVER_URL)
  ? String((import.meta as any).env.VITE_DEBUG_SERVER_URL)
  : '';
const __DBG_SESSION = (import.meta.env.DEV && (import.meta as any).env?.VITE_DEBUG_SESSION)
  ? String((import.meta as any).env.VITE_DEBUG_SESSION)
  : '';
const __dbg = (hypothesisId: string, msg: string, data: any) => {
  try {
    if (!__DBG_URL || !__DBG_SESSION) return;
    fetch(__DBG_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: __DBG_SESSION, runId: 'pre', hypothesisId, location: 'src/react-app/hooks/useLiveFeed.ts', msg, data, ts: Date.now() }),
    }).catch(() => null);
  } catch {
    void 0;
  }
};

// Helper for robust outcome matching
const getOutcome = (outcomes: any[], keys: string[]) => 
    outcomes.find(o => 
      keys.includes(String(o.id).toLowerCase()) || 
      keys.includes(String(o.name).toLowerCase()) ||
      keys.includes(String(o.outcome).toLowerCase()) ||
      keys.includes(String(o.id)) || 
      keys.includes(String(o.name)) ||
      keys.includes(String(o.outcome))
    );

const getVal = (o: any) => {
    if (!o) return undefined;
    return o.price ?? o.value ?? o.odd;
};

const parseJsonLoose = (v: any) => {
    if (v === null || v === undefined) return v;
    if (typeof v !== 'string') return v;
    const s = v.trim();
    if (!s) return undefined;
    if (!((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']')))) return v;
    try {
        const j = JSON.parse(s);
        if (typeof j === 'string') {
            const s2 = j.trim();
            if ((s2.startsWith('{') && s2.endsWith('}')) || (s2.startsWith('[') && s2.endsWith(']'))) {
                try { return JSON.parse(s2); } catch { return j; }
            }
        }
        return j;
    } catch {
        return v;
    }
};

const parseLiveEvent = (item: any) => {
    if (!item) return null;
    const rawId = String(item.external_event_id || item.id || item.fixture?.id || '').trim();

    // Safety: Hide Finished/Abnormal statuses from Live Feed
    const status = String(item.fixture?.status?.short || item.status?.short || item.status || '').toUpperCase().trim();
    if (['FT', 'AET', 'PEN', 'FT_PEN', 'FIN', 'FINAL', 'ENDED', 'AOT', 'AP', 'POST', 'SUSP', 'TBD', 'WO', 'ABD', 'AWD', 'CANC', 'NS_CANC'].includes(status)) {
        __dbg('H5', 'drop-finished', { id: rawId, status });
        return null;
    }
    
    // Safety: Filter out "Live" events that are actually old (> 5h)
    const dstr = item.event_date || item.fixture?.date;
    if (dstr) {
        const d = new Date(dstr);
        const now = Date.now();
        if (!Number.isNaN(d.getTime())) {
             const diff = now - d.getTime();
             const isYearOff = diff > 300 * 24 * 60 * 60 * 1000;
             if (isYearOff) {
                 const dYearAdj = new Date(d);
                 dYearAdj.setFullYear(new Date(now).getFullYear());
                 if (dYearAdj.getTime() < now - 5 * 60 * 60 * 1000) {
                     __dbg('H5', 'drop-old-year-adjusted', { id: rawId, dstr: String(dstr || ''), now });
                     return null;
                 }
             } else {
                 if (d.getTime() < now - 5 * 60 * 60 * 1000) {
                     __dbg('H5', 'drop-old', { id: rawId, dstr: String(dstr || ''), now });
                     return null;
                 }
             }
        }
    }
    
    const teams =
      item.teams ||
      (item.home && item.away
        ? { home: { name: item.home.name, logo: item.home.logo }, away: { name: item.away.name, logo: item.away.logo } }
        : (item.home_team && item.away_team
          ? {
              home: { name: item.home_team, logo: item.home_team_logo || '' },
              away: { name: item.away_team, logo: item.away_team_logo || '' }
            }
          : null));
    const fixture =
      item.fixture ||
      {
        id: item.external_event_id || item.id,
        date: item.event_date || item.date,
        status: item.status && typeof item.status === 'object' ? item.status : { short: item.status || 'LIVE', elapsed: item.elapsed || 0, timer: item.timer || '' },
      };

    if (!teams || !teams.home?.name || !teams.away?.name) {
      __dbg('H3', 'drop-no-teams', { id: rawId, home: String(item.home_team || item.teams?.home?.name || ''), away: String(item.away_team || item.teams?.away?.name || '') });
      return null;
    }

    let h = item.home_odd;
    let d = item.draw_odd;
    let a = item.away_odd;

    const sportRaw = String(item.sport || '');
    const sportL = sportRaw.toLowerCase();
    const isSoccer = sportL.includes('soccer') || (sportL.includes('football') && !sportL.includes('american'));

    // Handle odds array (backend <-> frontend mismatch fix)
    let oddsObj = item.odds;
    if (Array.isArray(oddsObj)) {
        // Convert to object
        const newOdds: any = {};
        oddsObj.forEach((m: any) => {
            if (m.key) newOdds[m.key] = m;
        });
        oddsObj = newOdds;
        item.odds = oddsObj;
    }

    const marketsRaw = item.markets ?? item.odds;
    const markets = parseJsonLoose(marketsRaw);

    if ((!h || !d || !a) && oddsObj) {
        const marketKey = Object.keys(oddsObj).find(k => 
            k === '1x2' || k === 'h2h' || k === 'match_winner' || k === 'FT_1X2'
        );
        
        if (marketKey) {
            let outcomes = oddsObj[marketKey];
            // Handle both { outcomes: [...] } and [...] formats
            if (!Array.isArray(outcomes) && outcomes?.outcomes) {
                outcomes = outcomes.outcomes;
            }
            
            if (Array.isArray(outcomes)) {
                const hName = (item.home_team || item.teams?.home?.name || '').toLowerCase();
                const aName = (item.away_team || item.teams?.away?.name || '').toLowerCase();
                
                const home = getOutcome(outcomes, ['1', 'home', 'casa', hName].filter(k => k && k.length > 1));
                const draw = getOutcome(outcomes, ['x', 'draw', 'empate']);
                const away = getOutcome(outcomes, ['2', 'away', 'fora', aName].filter(k => k && k.length > 1));
                
                if (home) h = getVal(home);
                if (draw) d = getVal(draw);
                if (away) a = getVal(away);
            }
        }
    }

    const parseScore = (v: any) => {
        if (v === null || v === undefined) return { home: null, away: null };
        if (typeof v === 'string') {
            const s = v.trim();
            if (!s) return { home: null, away: null };
            if (s.includes('{') || s.includes(':')) {
                try {
                    const j = JSON.parse(s);
                    const hn = Number(j?.home);
                    const an = Number(j?.away);
                    return {
                        home: Number.isFinite(hn) ? hn : null,
                        away: Number.isFinite(an) ? an : null
                    };
                } catch {
                    return { home: null, away: null };
                }
            }
            const m = s.match(/(\d+)\s*[-:]\s*(\d+)/);
            if (m) {
                const home = Number(m[1]);
                const awayStr = String(m[2] || '').trim();
                let away = Number(awayStr);
                if (isSoccer && Number.isFinite(home) && awayStr.length >= 3 && Number.isFinite(away) && away > 9) {
                    const mins = [2, 3];
                    for (const minLen of mins) {
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
                        away = awayN;
                        break;
                    }
                }
                return { home: Number.isFinite(home) ? home : null, away: Number.isFinite(away) ? away : null };
            }
            return { home: null, away: null };
        }
        if (typeof v === 'object') {
            const hn = Number((v as any)?.home);
            const an = Number((v as any)?.away);
            return { home: Number.isFinite(hn) ? hn : null, away: Number.isFinite(an) ? an : null };
        }
        return { home: null, away: null };
    };

    const rawScore = item.score ?? item.goals;
    const scoreObj = parseScore(rawScore);

    const ev: any = {
        ...item,
        id: String(item.external_event_id || item.id || fixture.id || ''),
        external_event_id: String(item.external_event_id || item.id || fixture.id || ''),
        is_live: Number(item.is_live || 1) === 1,
        home_team: teams.home.name,
        away_team: teams.away.name,
        league: item.league?.name || item.league || '',
        league_name: item.league?.name || item.league || '',
        home_odd: Number(h || 0),
        draw_odd: Number(d || 0),
        away_odd: Number(a || 0),
        fixture: {
            ...fixture,
            status: fixture?.status || { short: 'LIVE', elapsed: 0, timer: '' }
        },
        teams,
        score: rawScore,
        goals: scoreObj,
        markets: markets
    };
    const st = String(ev.fixture?.status?.short || '').toUpperCase().trim();
    const stLong = String(ev.fixture?.status?.long || ev.status_long || '').toUpperCase();
    if (st === 'HT' || /HALF\s*TIME|INTERVAL/.test(stLong)) {
      ev.fixture.status = { ...(ev.fixture.status || {}), short: 'HT', elapsed: 0, timer: '' };
      ev.timer = '';
      ev.elapsed = 0;
    }
    // #region debug-point D:client-merge-odds-clock
    fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sessionId:"live-delay-clock",runId:"pre",hypothesisId:"D",location:"src/react-app/hooks/useLiveFeed.ts:parseLiveEvent",msg:"[DEBUG] client parse/merge",data:{id:ev.id,sport:String(ev.sport||""),status:String(ev.fixture?.status?.short||""),elapsed:Number(ev.fixture?.status?.elapsed||0),timer:String(ev.fixture?.status?.timer||""),homeOdd:Number(ev.home_odd||0),drawOdd:Number(ev.draw_odd||0),awayOdd:Number(ev.away_odd||0),src:{rawTimer:String(item.timer||item.fixture?.status?.timer||""),rawElapsed:Number(item.elapsed||item.fixture?.status?.elapsed||0),eventDate:String(item.event_date||item.fixture?.date||""),homeOdd:Number(item.home_odd||0),drawOdd:Number(item.draw_odd||0),awayOdd:Number(item.away_odd||0)}},ts:Date.now()})}).catch(()=>{});
    // #endregion
    return ev;
};

// ── Module-level live-feed cache ──────────────────────────────────────────────
// Keyed by sport string. Survives remounts so /live → / → /live is instant.
const _liveCache = new Map<string, { map: Map<string, any>; ts: number }>();
const _LIVE_FRESH_MS = 30_000;
// ─────────────────────────────────────────────────────────────────────────────

export function useLiveFeed(sport?: string) {
  const _sportKey = sport || 'all';
  const _lEntry = _liveCache.get(_sportKey);
  const _lFresh = _lEntry != null && Date.now() - _lEntry.ts < _LIVE_FRESH_MS;

  const [eventsMap, setEventsMap] = useState<Map<string, any>>(() =>
    _lFresh ? new Map(_lEntry!.map) : new Map()
  );
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(Date.now());
  // True once the feed has produced its first response (poll or WS snapshot),
  // even if empty — lets consumers know the live source has settled.
  const [hasLoaded, setHasLoaded] = useState(_lFresh);

  const wsUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/api/live/ws?sport=${encodeURIComponent(String(sport || 'all'))}`;
  }, [sport]);

  // Poll function
  const fetchLiveEvents = useCallback(async () => {
      try {
          const url = `/api/events/by-sport?sports=${sport || 'all'}&realtime=1&include=odds&markets=full&only=live&days=0`;
          const data = await apiFetch<any>(url, { cache: 'no-store' });
          
          const list = Array.isArray(data) ? data : (data && Array.isArray(data.live) ? data.live : null);
          if (!list) return;
          setHasLoaded(true);
          if (list.length === 0) {
            __dbg('H2', 'poll-empty', { sport: String(sport || 'all') });
            setLastUpdatedAt(Date.now());
            return;
          }
          __dbg('H2', 'poll-data', { sport: String(sport || 'all'), count: list.length });

          const now = Date.now();
          const graceMs = 120_000;
          setEventsMap((prev) => {
              const next = new Map<string, any>(prev);
              const seen = new Set<string>();

              list.forEach((raw: any) => {
                  const parsed = parseLiveEvent(raw);
                  if (parsed) {
                      const id = String(parsed.id || parsed.external_event_id || parsed.fixture?.id);
                      if (!id) return;
                      const prevVal = next.get(id);
                      const merged = { ...(prevVal || {}), ...parsed, __lastSeenAt: now };
                      const pn = Number((parsed as any)?.home_odd || 0);
                      const qn = Number((parsed as any)?.draw_odd || 0);
                      const rn = Number((parsed as any)?.away_odd || 0);
                      const ph = Number((prevVal as any)?.home_odd || 0);
                      const qh = Number((prevVal as any)?.draw_odd || 0);
                      const rh = Number((prevVal as any)?.away_odd || 0);
                      if (pn <= 1 && ph > 1) merged.home_odd = ph;
                      if (qn <= 1 && qh > 1) merged.draw_odd = qh;
                      if (rn <= 1 && rh > 1) merged.away_odd = rh;
                      const mkEmpty = (m: any) => {
                        if (!m) return true;
                        if (typeof m === 'string') {
                          const s = m.trim();
                          return !s || s === '{}' || s === 'null' || s === '[]';
                        }
                        if (typeof m === 'object') {
                          if (Array.isArray(m)) return m.length === 0;
                          return Object.keys(m).length === 0;
                        }
                        return true;
                      };
                      if (mkEmpty((parsed as any).markets) && !mkEmpty((prevVal as any)?.markets)) {
                        merged.markets = (prevVal as any).markets;
                      }
                      next.set(id, merged);
                      seen.add(id);
                  }
              });

              for (const [id, ev] of next.entries()) {
                  const lastSeen = Number((ev as any)?.__lastSeenAt || 0);
                  if (!lastSeen) continue;
                  if (now - lastSeen > graceMs) next.delete(id);
              }
              _liveCache.set(_sportKey, { map: next, ts: now });
              return next;
          });
          setLastUpdatedAt(now);
      } catch (err) {
          console.error('[useLiveFeed] Polling error:', err);
          // Don't disconnect, just retry next time
      }
  }, [sport]);

  useEffect(() => {
    let cancelled = false;
    let inflight = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;
    let wsOk = false;
    let pingId: ReturnType<typeof setInterval> | null = null;
    const idleMs = 60_000;
    let lastInteractionAt = Date.now();
    let hiddenAt = typeof document !== 'undefined' && document.hidden ? Date.now() : 0;
    let wakeInFlight = false;
    const log = (hypothesisId: string, msg: string, data: any) => {
      fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sessionId:"live-delay-clock",runId:"pre",hypothesisId,location:"src/react-app/hooks/useLiveFeed.ts",msg:`[DEBUG] ${msg}`,data,ts:Date.now()})}).catch(()=>{});
    };

    const loop = async () => {
      if (cancelled) return;
      if (wsOk) return;
      if (inflight) {
        timeoutId = setTimeout(loop, 1500);
        return;
      }
      inflight = true;
      try {
        log('A', 'poll tick (ws not ok)', { sport: String(sport || 'all') });
        await fetchLiveEvents();
      } finally {
        inflight = false;
        timeoutId = setTimeout(loop, 10_000);
      }
    };

    const runWakeRefresh = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (wakeInFlight) return;
      wakeInFlight = true;
      fetchLiveEvents()
        .catch(() => void 0)
        .finally(() => {
          wakeInFlight = false;
        });
    };

    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      const now = Date.now();
      const idleFor = hiddenAt > 0 ? now - hiddenAt : now - lastInteractionAt;
      hiddenAt = 0;
      lastInteractionAt = now;
      if (idleFor >= 3000) runWakeRefresh();
    };

    const onActivity = () => {
      const now = Date.now();
      const idleFor = now - lastInteractionAt;
      lastInteractionAt = now;
      if (idleFor >= idleMs) runWakeRefresh();
    };
    const onFocus = () => onActivity();

    const startWs = () => {
      if (!wsUrl || typeof WebSocket === 'undefined') return;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        ws = null;
        return;
      }

      ws.onopen = () => {
        wsOk = true;
        setIsConnected(true);
        __dbg('H1', 'ws-open', { url: wsUrl, sport: String(sport || 'all') });
        log('A', 'ws open', { url: wsUrl, sport: String(sport || 'all') });
        fetchLiveEvents().catch(() => void 0);
        if (pingId) clearInterval(pingId);
        pingId = setInterval(() => {
          try { ws?.send(JSON.stringify({ type: 'ping', ts: Date.now() })); } catch { void 0; }
        }, 15_000);
      };
      ws.onclose = () => {
        wsOk = false;
        setIsConnected(false);
        __dbg('H1', 'ws-close', { url: wsUrl, sport: String(sport || 'all') });
        log('A', 'ws close', { url: wsUrl, sport: String(sport || 'all') });
        if (pingId) { clearInterval(pingId); pingId = null; }
        loop();
      };
      ws.onerror = () => {
        wsOk = false;
        setIsConnected(false);
        __dbg('H1', 'ws-error', { url: wsUrl, sport: String(sport || 'all') });
        log('A', 'ws error', { url: wsUrl, sport: String(sport || 'all') });
        if (pingId) { clearInterval(pingId); pingId = null; }
        loop();
      };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String((evt as any)?.data || ''));
          if (msg?.type === 'snapshot' && Array.isArray(msg?.live)) {
            const now = Date.now();
            const graceMs = 120_000;
            setHasLoaded(true);
            if (msg.live.length === 0) {
              __dbg('H1', 'ws-snapshot-empty', { sport: String(sport || 'all') });
              setLastUpdatedAt(now);
              return;
            }
            __dbg('H1', 'ws-snapshot', { sport: String(sport || 'all'), count: msg.live.length });
            log('A', 'ws snapshot', { sport: String(sport || 'all'), count: msg.live.length });
            setEventsMap((prev) => {
              const next = new Map<string, any>(prev);
              const seen = new Set<string>();
              msg.live.forEach((raw: any) => {
                const parsed = parseLiveEvent(raw);
                if (parsed) {
                  const id = String(parsed.id || parsed.external_event_id || parsed.fixture?.id);
                  if (!id) return;
                  const prevVal = next.get(id);
                  const merged = { ...(prevVal || {}), ...parsed, __lastSeenAt: now };
                  const pn = Number((parsed as any)?.home_odd || 0);
                  const qn = Number((parsed as any)?.draw_odd || 0);
                  const rn = Number((parsed as any)?.away_odd || 0);
                  const ph = Number((prevVal as any)?.home_odd || 0);
                  const qh = Number((prevVal as any)?.draw_odd || 0);
                  const rh = Number((prevVal as any)?.away_odd || 0);
                  if (pn <= 1 && ph > 1) merged.home_odd = ph;
                  if (qn <= 1 && qh > 1) merged.draw_odd = qh;
                  if (rn <= 1 && rh > 1) merged.away_odd = rh;
                  const mkEmpty = (m: any) => {
                    if (!m) return true;
                    if (typeof m === 'string') {
                      const s = m.trim();
                      return !s || s === '{}' || s === 'null' || s === '[]';
                    }
                    if (typeof m === 'object') {
                      if (Array.isArray(m)) return m.length === 0;
                      return Object.keys(m).length === 0;
                    }
                    return true;
                  };
                  if (mkEmpty((parsed as any).markets) && !mkEmpty((prevVal as any)?.markets)) {
                    merged.markets = (prevVal as any).markets;
                  }
                  next.set(id, merged);
                  seen.add(id);
                }
              });
              for (const [id, ev] of next.entries()) {
                const lastSeen = Number((ev as any)?.__lastSeenAt || 0);
                if (!lastSeen) continue;
                if (now - lastSeen > graceMs) next.delete(id);
              }
              _liveCache.set(_sportKey, { map: next, ts: now });
              return next;
            });
            setLastUpdatedAt(now);
            return;
          }
          if (msg?.type === 'pong') return;
        } catch { void 0; }
      };
    };

    startWs();
    loop();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
      window.addEventListener('pointerdown', onActivity);
      window.addEventListener('keydown', onActivity);
      window.addEventListener('touchstart', onActivity);
      window.addEventListener('wheel', onActivity);
    }

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (pingId) clearInterval(pingId);
      if (ws) {
        try { ws.close(); } catch { void 0; }
        ws = null;
      }
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('pointerdown', onActivity);
        window.removeEventListener('keydown', onActivity);
        window.removeEventListener('touchstart', onActivity);
        window.removeEventListener('wheel', onActivity);
      }
    };
  }, [fetchLiveEvents, wsUrl]);

  const liveEvents = useMemo(() => {
    return Array.from(eventsMap.values());
  }, [eventsMap]);

  return { 
    liveEvents, 
    events: liveEvents, 
    isConnected,
    hasLoaded,
    lastUpdatedAt, 
    reconnect: fetchLiveEvents // Manual refresh
  };
}

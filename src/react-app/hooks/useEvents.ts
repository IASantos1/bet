import { useState, useEffect, useRef, useCallback } from 'react'; 
import { EventSchema } from '@/shared/types'; 
import type { Event } from '@/shared/types'; 
import { apiFetch } from '@/react-app/utils/api';
 
export function useEvents(category?: string) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const lastRef = useRef<Event[]>([]);
  const loadedRef = useRef<boolean>(false);
  const inflightRef = useRef<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);
  
  const normalizeTeam = (s: string) => String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const matchUID = (home: string, away: string, date: string | null | undefined) =>
    `${normalizeTeam(home)}-vs-${normalizeTeam(away)}-${String(date || '').slice(0, 10)}`;
  const scoreEvent = (e: Event) =>
    (Number(e.home_odd || 0) > 0 ? 1 : 0) +
    (Number(e.draw_odd || 0) > 0 ? 1 : 0) +
    (Number(e.away_odd || 0) > 0 ? 1 : 0) +
    (Number(e.is_live || 0) === 1 ? 1 : 0);
  const dedupEvents = (list: Event[]): Event[] => {
    const by = new Map<string, Event>();
    for (const e of list) {
      const k = matchUID(String(e.home_team || ''), String(e.away_team || ''), e.event_date);
      const prev = by.get(k);
      if (!prev) { by.set(k, e); continue; }
      const sPrev = scoreEvent(prev);
      const sCur = scoreEvent(e);
      if (sCur > sPrev) by.set(k, e);
    }
    return Array.from(by.values());
  };
  
  const fetchEvents = useCallback(async () => {
    try {
      if (inflightRef.current) {
        try { abortRef.current?.abort(); } catch { /* no-op */ }
      }
      inflightRef.current = true;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      if (lastRef.current.length === 0) setLoading(true);
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        setLoading(false);
        return;
      }
      const cacheKey = category ? `odds_cache_${category}_v4` : 'events_cache_v4';
      const eq = (a: Event[], b: Event[]) => {
        const da = dedupEvents(a);
        const db = dedupEvents(b);
        if (da.length !== db.length) return false;
        const key = (e: Event) => matchUID(String(e.home_team||''), String(e.away_team||''), String(e.event_date||''));
        const mapA = new Map(da.map(e => [key(e), e]));
        for (const e of db) {
          const k = key(e);
          const x = mapA.get(k);
          if (!x) return false;
          if (
            Number(e.home_odd||0) !== Number(x.home_odd||0) ||
            Number(e.draw_odd||0) !== Number(x.draw_odd||0) ||
            Number(e.away_odd||0) !== Number(x.away_odd||0)
          ) return false;
        }
        return true;
      };
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = EventSchema.array().safeParse(JSON.parse(cached));
          if (parsed.success && Array.isArray(parsed.data) && parsed.data.length > 0) {
            const now = Date.now();
            const finishedStatuses = ['FT', 'AET', 'PEN', 'Finished', 'Match Finished', 'AOT', 'AP', 'Ended', 'Final', 'WO', 'ABD', 'AWD'];
            const filteredRaw = parsed.data.filter((e) => {
              const status = (e as any).fixture?.status?.short || (e as any).status || '';
              if (finishedStatuses.includes(status)) return false;

              const live = Number(e.is_live || 0) === 1 || ['1H','2H','HT','ET','P','LIVE','Q1','Q2','Q3','Q4','OT','BT','S1','S2','S3','S4','S5','P1','P2','P3','IN1','IN2','IN3','IN4','IN5','IN6','IN7','IN8','IN9'].includes(status);
              const ds = String(e.event_date || '');
              const t = Date.parse(ds);
              const validDate = Number.isFinite(t);

              // Fix for Year Discrepancy (2025 vs 2026)
              // If event is > 300 days old (e.g. 2025 date vs 2026 system), assume it's this year
              let targetTime = t;
              if (validDate) {
                  const diff = now - t;
                  const isYearOff = diff > 300 * 24 * 60 * 60 * 1000; // ~300 days
                  if (isYearOff) {
                      const dYearAdj = new Date(t);
                      dYearAdj.setFullYear(new Date(now).getFullYear());
                      targetTime = dYearAdj.getTime();
                  }
              }

              if (live) {
                 // Stricter: Allow live events up to 5h old
                 if (validDate && targetTime < now - 5 * 60 * 60 * 1000) return false;
                 return true;
              }
              // Stricter: Allow pre-match events up to 2.5 hours in the past
              // (e.g. if status update is delayed but game started)
              const past = validDate && targetTime < now - 2.5 * 60 * 60 * 1000;
              return !past;
            });
            console.log('[useEvents] Filtered:', filteredRaw.length, 'Original:', parsed.data.length);
            const filtered = dedupEvents(filteredRaw);
            if (!eq(filtered, lastRef.current)) {
              setEvents(filtered);
              lastRef.current = filtered;
            }
          }
        }
      } catch { void 0 }
      const nowMs = Date.now();
      const fromIso = new Date(nowMs - (2 * 24 * 60 * 60 * 1000)).toISOString();
      const toIso = new Date(nowMs + (30 * 24 * 60 * 60 * 1000)).toISOString();
      const sportTokens = new Set([
        'soccer-all','soccer','football','basketball','american-football','handball','mma','formula-1','formula1','ice-hockey','icehockey','hockey','rugby','volleyball','baseball','afl','nba','nfl',
        'futebol','basquetebol','ténis','tenis','hóquei','futebol americano','beisebol','voleibol','rúgbi','rugbi'
      ]);
      let token = String(category || '').toLowerCase();

      // Normalize Portuguese to English keys
      if (token === 'futebol') token = 'soccer';
      if (token === 'basquetebol') token = 'basketball';
      if (token === 'futebol americano') token = 'american-football';
      if (token === 'handebol') token = 'handball';
      if (token === 'hóquei') token = 'hockey';
      if (token === 'rúgbi' || token === 'rugbi') token = 'rugby';
      if (token === 'voleibol') token = 'volleyball';
      if (token === 'beisebol') token = 'baseball';
      if (token === 'ténis' || token === 'tenis') token = 'tennis';
      if (token === 'fórmula 1' || token === 'formula 1') token = 'formula1';
      
      const isAll = token === 'all-sports' || token === 'todos' || token === 'all';
      
      // RESTRICTION: Only allow fetch if it's 'all' or in our supported list
      if (!isAll && !sportTokens.has(token) && !token.startsWith('soccer')) {
         // If it's a specific league (e.g. 'basketball-nba'), we check if the prefix is supported
         const supportedPrefixes = ['soccer','basketball','american','handball','mma','formula','ice','rugby','volleyball','baseball','afl','nba','nfl'];
         if (!supportedPrefixes.some(p => token.startsWith(p))) {
           setLoading(false);
           return;
         }
      }

      const apiBase = import.meta.env.VITE_API_BASE || '';
      let path = (category && (sportTokens.has(token) || isAll))
        ? (isAll ? `${apiBase}/api/featured-games` : `${apiBase}/api/events/by-sport?sports=${encodeURIComponent(token)}`)
        : `${apiBase}/api/events-range?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
      if (!import.meta.env.DEV && path.includes(`${apiBase}/api/events-range`)) {
        path = `${apiBase}/api/events`;
      }
      
      // Request server-side join
      if (path.includes('?')) path += '&include=odds&requireOdds=1';
      else path += '?include=odds&requireOdds=1';

      const data = await apiFetch<any>(path, { cache: 'no-store', signal: ctrl.signal });
      console.log('[useEvents] Raw API data:', data);
      // Handle API response formats:
      // 1. { response: [...] } - API-Football style
      // 2. { live: [...], pregame: [...] } - Custom Backend Split style
      // 3. [...] - Flat array
      let arr: any[] = [];
      if (Array.isArray((data as any)?.response)) {
          arr = (data as any).response;
      } else if ((data as any)?.live && Array.isArray((data as any).live)) {
          // Merge live and pregame
          console.log('[useEvents] Merging split response:', (data as any).live.length, 'live', (data as any).pregame?.length, 'pregame');
          arr = [...((data as any).live || []), ...((data as any).pregame || [])];
      } else if (Array.isArray(data)) {
          arr = data;
      }
      console.log('[useEvents] Parsed array length:', arr.length);
        const nowIso = new Date().toISOString();
        
        // Backend now handles odds join, so we map directly
        const mapEvents = (list: any[]): Event[] => {
          const norm = (s: string) => String(s || '');
          const out: Event[] = [] as any;
          for (const g of list) {
            const id = Number((g as any)?.id ?? (g as any)?.game?.id ?? (g as any)?.fixture?.id ?? 0);
            const dateStr = String((g as any)?.date ?? (g as any)?.fixture?.date ?? (g as any)?.event_date ?? '');
            const leagueName = String((g as any)?.league?.name ?? (g as any)?.competition?.name ?? (g as any)?.league ?? '');
            const teams = (g as any)?.teams ?? (g as any)?.participants ?? {};
            const home = norm((teams as any)?.home?.name ?? (g as any)?.home ?? (g as any)?.home_team ?? '');
            const away = norm((teams as any)?.away?.name ?? (g as any)?.away ?? (g as any)?.away_team ?? '');
            const pickPrice = (o: any) => { const p = Number(((o||{})?.price ?? (o||{})?.odd ?? (o||{})?.value ?? 0)); return Number.isFinite(p) ? p : 0 };
            const labelOf = (o: any) => String(((o||{})?.label ?? (o||{})?.name ?? (o||{})?.outcome ?? '')).toLowerCase();
            const h2hArr = Array.isArray((g as any)?.markets?.h2h) ? (g as any)?.markets?.h2h : (Array.isArray((g as any)?.odds?.h2h) ? (g as any)?.odds?.h2h : []);
            const findOdd = (labels: string[]) => {
              const it = h2hArr.find((x: any) => labels.includes(labelOf(x)));
              return it ? pickPrice(it) : 0;
            };
            const spreadsArr = Array.isArray((g as any)?.markets?.handicap) ? (g as any)?.markets?.handicap : (Array.isArray((g as any)?.markets?.spreads) ? (g as any)?.markets?.spreads : (Array.isArray((g as any)?.odds?.handicap) ? (g as any)?.odds?.handicap : (Array.isArray((g as any)?.odds?.spreads) ? (g as any)?.odds?.spreads : [])));
            const totalsArr = Array.isArray((g as any)?.markets?.totals) ? (g as any)?.markets?.totals : (Array.isArray((g as any)?.odds?.totals) ? (g as any)?.odds?.totals : []);
            const normMarket = (arr: any[]) => Array.isArray(arr) ? arr.map((o: any) => ({ label: String((o?.label ?? o?.name ?? o?.outcome ?? '') || ''), price: pickPrice(o), point: o?.point })).filter((x: any) => x.label && Number(x.price) > 0) : [];
            
            if (!home && !away && (g.match || g.team_match)) {
               // Fallback if structure is flat (backend normalized)
               const parts = String(g.match || g.team_match).split(' vs ');
               if (parts.length === 2) {
                 out.push({
                   ...g,
                   id: id || Math.floor(Math.random()*1e9),
                   home_team: g.home_team || parts[0],
                   away_team: g.away_team || parts[1],
                   event_date: dateStr || nowIso,
                   created_at: g.created_at || nowIso,
                   updated_at: g.updated_at || nowIso
                 });
                 continue;
               }
            }

            if (!home || !away) {
              if (g.home_team && g.away_team) {
                out.push(g as Event);
              }
              continue;
            }

          out.push({
            id: id || Math.floor(Math.random()*1e9),
            match: `${home} vs ${away}`,
            league: leagueName || token,
            home_team: home,
            away_team: away,
            home_odd: Number(g.home_odd || 0) || findOdd(['home','casa']),
            draw_odd: Number(g.draw_odd || 0) || findOdd(['draw','empate']),
              away_odd: Number(g.away_odd || 0) || findOdd(['away','fora']),
              event_date: dateStr || nowIso,
              is_live: Number(g.is_live || 0),
              score: g.score || null,
              elapsed: g.elapsed || (g.fixture as any)?.status?.elapsed || (g as any)?.elapsed || null,
              status: (g.fixture as any)?.status?.short || g.status || null,
              sport: g.sport || 'soccer',
              created_at: nowIso,
              updated_at: nowIso,
              markets: (g.markets && (Array.isArray((g as any)?.markets?.h2h) || Array.isArray((g as any)?.markets?.handicap) || Array.isArray((g as any)?.markets?.totals)))
                ? g.markets
                : {
                    h2h: normMarket(h2hArr),
                    handicap: normMarket(spreadsArr),
                    totals: normMarket(totalsArr)
                  }
            } as Event);
          }
          return out;
        };

        const base = mapEvents(arr);
        if (Array.isArray(base)) {
          const now = Date.now();
          const finishedStatuses = ['FT', 'AET', 'PEN', 'Finished', 'Match Finished', 'AOT', 'AP', 'Ended', 'Final', 'WO', 'ABD', 'AWD'];
          const filteredRaw = base.filter((e) => {
            const status = (e as any).fixture?.status?.short || (e as any).status || '';
            if (finishedStatuses.includes(status)) return false;

            const live = Number(e.is_live || 0) === 1 || ['1H','2H','HT','ET','P','LIVE','Q1','Q2','Q3','Q4','OT','BT','S1','S2','S3','S4','S5','P1','P2','P3','IN1','IN2','IN3','IN4','IN5','IN6','IN7','IN8','IN9'].includes(status);
            const ds = String(e.event_date || '');
            const t = Date.parse(ds);
            const validDate = Number.isFinite(t);

            // Fix for Year Discrepancy (2025 vs 2026)
            // If event is > 300 days old (e.g. 2025 date vs 2026 system), assume it's this year
            let targetTime = t;
            if (validDate) {
                const diff = now - t;
                const isYearOff = diff > 300 * 24 * 60 * 60 * 1000; // ~300 days
                if (isYearOff) {
                    const dYearAdj = new Date(t);
                    dYearAdj.setFullYear(new Date(now).getFullYear());
                    targetTime = dYearAdj.getTime();
                }
            }

            if (live) {
                // Stricter: Allow live events up to 5h old
                if (validDate && targetTime < now - 5 * 60 * 60 * 1000) return false;
                return true;
            }

            // Stricter: Allow pre-match events up to 2.5 hours in the past
            // (e.g. if status update is delayed but game started)
            const past = validDate && targetTime < now - 2.5 * 60 * 60 * 1000;
            return !past;
          });
          const filtered = dedupEvents(filteredRaw);
          const key = (e: any) => {
            const ext = e?.external_event_id;
            const fixId = e?.fixture?.id;
            if (ext) return String(ext);
            if (fixId) return String(fixId);
            return matchUID(String(e.home_team || ''), String(e.away_team || ''), String(e.event_date || ''));
          };
          const mkEmpty = (raw: any) => {
            if (!raw) return true;
            if (typeof raw === 'string') {
              const s = raw.trim();
              return !s || s === '{}' || s === 'null' || s === '[]';
            }
            if (typeof raw === 'object') {
              if (Array.isArray(raw)) return raw.length === 0;
              return Object.keys(raw).length === 0;
            }
            return true;
          };
          const prevMap = new Map(lastRef.current.map((e) => [key(e as any), e as any]));
          const stable = filtered.map((e: any) => {
            const p = prevMap.get(key(e));
            if (!p) return e;
            const hn = Number(e?.home_odd || 0);
            const dn = Number(e?.draw_odd || 0);
            const an = Number(e?.away_odd || 0);
            const hp = Number(p?.home_odd || 0);
            const dp = Number(p?.draw_odd || 0);
            const ap = Number(p?.away_odd || 0);
            const nextAny = hn > 1 || dn > 1 || an > 1;
            const prevAny = hp > 1 || dp > 1 || ap > 1;
            const nextMarketsEmpty = mkEmpty(e?.markets ?? e?.odds);
            const prevMarketsEmpty = mkEmpty(p?.markets ?? p?.odds);
            let out: any = e;
            if (!nextAny && prevAny) {
              out = { ...out, home_odd: p.home_odd, draw_odd: p.draw_odd, away_odd: p.away_odd };
            }
            if (nextMarketsEmpty && !prevMarketsEmpty) {
              out = { ...out, markets: p.markets, odds: p.odds };
            }
            return out;
          });
          if (!eq(stable, lastRef.current)) {
            setEvents(stable);
            lastRef.current = stable;
            try { localStorage.setItem(cacheKey, JSON.stringify(stable)); } catch { void 0 }
          }
        }
    } catch (error: any) {
      const msg = String(error?.message || '');
      const isAbort = error?.name === 'AbortError' || /Abort|ERR_ABORTED|ERR_CANCELED/i.test(msg) || /Failed to fetch/i.test(msg);
      if (!isAbort && (typeof document === 'undefined' || document.visibilityState !== 'hidden')) {
        // console.error('Error fetching events:', error);
       }//
    } finally {
      setLoading(false);
      loadedRef.current = true;
      inflightRef.current = false;
    }
  }, [category]);

  useEffect(() => {
    const t = setTimeout(() => { fetchEvents(); }, 200);
    return () => { clearTimeout(t); };
  }, [fetchEvents]);

  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => { setLoading(false); }, 2000);
      return () => { clearTimeout(t); };
    }
  }, [loading]);

  useEffect(() => {
    const tok = String(category || '').toLowerCase();
    const isAll = tok === 'all-sports' || tok === 'todos' || tok === 'all';
    const shouldPoll = isAll || 
      tok.startsWith('soccer') || 
      tok.startsWith('football') || 
      tok.startsWith('basket') || 
      tok.includes('ice') || 
      tok.includes('handball') || 
      tok.includes('rugby') || 
      tok.includes('volleyball') || 
      tok.includes('mma') || 
      tok.includes('formula') || 
      tok === 'afl' || 
      tok === 'baseball' || 
      tok === 'nba' || 
      tok === 'nfl' || 
      tok === 'american-football';

    if (!shouldPoll) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const hasLive = lastRef.current.some(e => Number(e.is_live) === 1);
    if (!hasLive) return;
    let stopped = false;
    let timer: any = null;
    const loop = () => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        timer = setTimeout(loop, 3000);
        return;
      }
      fetchEvents();
      timer = setTimeout(loop, 3000);
    };
    timer = setTimeout(loop, 3000);
    return () => { stopped = true; try { clearTimeout(timer); } catch { /* no-op */ } };
  }, [category, fetchEvents]);

  useEffect(() => {
    const cacheKey = category ? `odds_cache_${category}_v4` : 'events_cache_v4';
    const eq = (a: Event[], b: Event[]) => {
      const da = dedupEvents(a);
      const db = dedupEvents(b);
      if (da.length !== db.length) return false;
      const key = (e: Event) => matchUID(String(e.home_team||''), String(e.away_team||''), String(e.event_date||''));
      const mapA = new Map(da.map(e => [key(e), e]));
      for (const e of db) {
        const k = key(e);
        const x = mapA.get(k);
        if (!x) return false;
        if (
          Number(e.home_odd||0) !== Number(x.home_odd||0) ||
          Number(e.draw_odd||0) !== Number(x.draw_odd||0) ||
          Number(e.away_odd||0) !== Number(x.away_odd||0)
        ) return false;
      }
      return true;
    };
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = EventSchema.array().safeParse(JSON.parse(cached));
        if (parsed.success && Array.isArray(parsed.data) && parsed.data.length > 0) {
          const now = Date.now();
          const filteredRaw = parsed.data.filter((e) => {
            const ds = String(e.event_date || '');
            const t = Date.parse(ds);
            const past = Number.isFinite(t) && t < now;
            return !past;
          });
          const filtered = dedupEvents(filteredRaw);
          if (!eq(filtered, lastRef.current)) {
            setEvents(filtered);
            lastRef.current = filtered;
          }
          setLoading(false);
        }
      }
    } catch { void 0 }
  }, [category]);

  return { events, loading, refetch: fetchEvents };
}

import { useState, useEffect, useRef } from 'react';
import { Event } from '../../shared/types';
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
      body: JSON.stringify({ sessionId: __DBG_SESSION, runId: 'pre', hypothesisId, location: 'src/react-app/hooks/useSportsEvents.ts', msg, data, ts: Date.now() }),
    }).catch(() => null);
  } catch {
    void 0;
  }
};

const normalizeTeam = (s: string) =>
  String(s || '')
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

  const isTodayAdjusted = (evt: Event): boolean => {
    const raw = (evt.event_date || (evt as any).fixture?.date) as string | undefined;
    if (!raw) return true;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return true;

    const now = Date.now();
    let t = d.getTime();
    const diff = now - t;

    if (Math.abs(diff) > 300 * 24 * 60 * 60 * 1000) {
      const dAdj = new Date(d);
      dAdj.setFullYear(new Date(now).getFullYear());
      t = dAdj.getTime();
    }

    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const startAfterWindow = new Date(startToday.getTime() + 14 * 24 * 60 * 60 * 1000).getTime();

    return t >= startToday.getTime() && t < startAfterWindow;
  };

const dedupEvents = (list: Event[]): Event[] => {
  if (!list || list.length === 0) return [];
  const by = new Map<string, Event>();
  for (const e of list) {
    if (!e) continue;
    // Optimization: Use ID if available, otherwise fallback to complex key
    // Handle 'undefined' teams safely
    const home = e.home_team || (e.teams?.home?.name) || 'Home';
    const away = e.away_team || (e.teams?.away?.name) || 'Away';
    const date = e.event_date || (e.fixture?.date);
    const ext = (e as any)?.external_event_id;
    const fixId = (e as any)?.fixture?.id;
    const k = ext ? String(ext) : (fixId ? String(fixId) : matchUID(String(home), String(away), String(date)));
    
    const prev = by.get(k);
    if (!prev) {
      by.set(k, e);
      continue;
    }
    const sPrev = scoreEvent(prev);
    const sCur = scoreEvent(e);
    if (sCur > sPrev) by.set(k, e);
  }
  return Array.from(by.values());
};

const shouldHideEvent = (evt: Event) => {
  const home = String((evt as any)?.home_team || (evt as any)?.teams?.home?.name || '').trim();
  const away = String((evt as any)?.away_team || (evt as any)?.teams?.away?.name || '').trim();
  if (!home || !away) return true;
  const lh = home.toLowerCase();
  const la = away.toLowerCase();
  if (lh === 'undefined' || la === 'undefined') return true;
  if (lh === 'home team' || la === 'away team') return true;
  return false;
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

const normalizeMarkets = (evt: Event): Event => {
  const e: any = evt as any;
  const marketsRaw = e.markets ?? e.odds;
  const marketsParsed = parseJsonLoose(marketsRaw);
  const oddsParsed = parseJsonLoose(e.odds);
  if (marketsParsed === marketsRaw && oddsParsed === e.odds) return evt;
  return { ...(evt as any), markets: marketsParsed ?? e.markets, odds: oddsParsed ?? e.odds };
};

type OnlyMode = 'live' | 'pregame' | 'both';

// ── Module-level in-memory cache ──────────────────────────────────────────────
// Survives React remounts so navigating between / and /live is instant.
interface _SCacheEntry { live: Event[]; pregame: Event[]; ts: number; }
const _sCache = new Map<string, _SCacheEntry>();
const _S_FRESH_MS = 45_000; // 45 s — matches the polling interval
// ─────────────────────────────────────────────────────────────────────────────

export function useSportsEvents(
  category: string | null,
  opts?: { only?: OnlyMode; days?: number; enabled?: boolean; requireOdds?: boolean },
) {
  // Compute cache key here so useState lazy-initialisers can use it.
  const _safeCategory0 = typeof category === 'string' && category ? category : 'all';
  const _cacheKey0 = `sportsEvents:${_safeCategory0}:v1`;
  const _cacheEntry0 = _sCache.get(_cacheKey0);
  const _hasFresh0 = _cacheEntry0 != null && Date.now() - _cacheEntry0.ts < _S_FRESH_MS;

  const [live, setLive] = useState<Event[]>(() => _hasFresh0 ? _cacheEntry0!.live : []);
  const [pregame, setPregame] = useState<Event[]>(() => _hasFresh0 ? _cacheEntry0!.pregame : []);
  const [loading, setLoading] = useState(!_hasFresh0);
  // `ready` flips true only after the first *network* response (not cache),
  // so consumers can hold a stable first render until real data has settled.
  const [ready, setReady] = useState(_hasFresh0);

  // Stable primitive to avoid opts object causing effect re-runs
  const onlyMode: OnlyMode = opts?.only || 'both';

  const abortRef = useRef<AbortController | null>(null);
  const isFirstLoadRef = useRef(true);
  const triedAllFallbackRef = useRef(false);
  const lastLiveRef = useRef<Event[]>([]);
  const lastPregameRef = useRef<Event[]>([]);

  // Helper for deep equality check to prevent flickering
  const eq = (a: Event[], b: Event[]) => {
    if (a.length !== b.length) return false;
    const key = (e: Event) => {
      const ext = (e as any)?.external_event_id;
      const fixId = (e as any)?.fixture?.id;
      if (ext) return String(ext);
      if (fixId) return String(fixId);
      return matchUID(String(e.home_team||''), String(e.away_team||''), String(e.event_date||''));
    };
    const scoreSig = (e: any) => {
      const gh = Number(e?.goals?.home);
      const ga = Number(e?.goals?.away);
      const home = Number.isFinite(gh) ? gh : null;
      const away = Number.isFinite(ga) ? ga : null;
      const s = e?.score;
      const rawScore = typeof s === 'string' ? s : (s && typeof s === 'object' ? `${s.home ?? ''}-${s.away ?? ''}` : '');
      return `${String(rawScore || '')}|${String(home ?? '')}-${String(away ?? '')}`;
    };
    const elapsedSig = (e: any) => {
      const el = Number(e?.elapsed ?? e?.fixture?.status?.elapsed ?? 0);
      const t = String(e?.fixture?.status?.timer ?? '');
      return `${Number.isFinite(el) ? el : 0}|${t}`;
    };
    const mapA = new Map(a.map(e => [key(e), e]));
    for (const e of b) {
      const k = key(e);
      const x = mapA.get(k);
      if (!x) return false;
      if (
        Number(e.home_odd||0) !== Number(x.home_odd||0) ||
        Number(e.draw_odd||0) !== Number(x.draw_odd||0) ||
        Number(e.away_odd||0) !== Number(x.away_odd||0) ||
        e.is_live !== x.is_live ||
        (e.fixture?.status?.short || e.status) !== (x.fixture?.status?.short || x.status) ||
        elapsedSig(e) !== elapsedSig(x) ||
        scoreSig(e) !== scoreSig(x)
      ) return false;
    }
    return true;
  };

  const updateState = (newLive: Event[], newPregame: Event[]) => {
    const now = Date.now();
    const key = (e: Event) => {
      const ext = (e as any)?.external_event_id;
      const fixId = (e as any)?.fixture?.id;
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
    const mergeMarkets = (prevRaw: any, nextRaw: any): any => {
      const prev = prevRaw && typeof prevRaw === 'object' && !Array.isArray(prevRaw) ? prevRaw : null;
      const next = nextRaw && typeof nextRaw === 'object' && !Array.isArray(nextRaw) ? nextRaw : null;
      if (!prev && !next) return nextRaw;
      if (!prev) return nextRaw;
      if (!next) return prevRaw;
      const out: any = { ...prev };
      for (const [k, v] of Object.entries(next)) {
        if (Array.isArray(v)) {
          if (v.length > 0) out[k] = v;
          else if (!(k in out)) out[k] = v;
        } else if (v && typeof v === 'object') {
          const pv = (out as any)[k];
          if (pv && typeof pv === 'object' && !Array.isArray(pv)) out[k] = { ...pv, ...(v as any) };
          else out[k] = v;
        } else {
          if (v != null && v !== '') out[k] = v;
        }
      }
      return out;
    };
    const stabilize = (next: Event[], prev: Event[], opts: { graceMs: number; keepMissing: boolean }) => {
      if (!prev.length) return next.map((e) => ({ ...(e as any), __lastSeenAt: now })) as any;
      const prevMap = new Map(prev.map((e) => [key(e), e]));
      const seen = new Set<string>();
      const out = next.map((e) => {
        const p = prevMap.get(key(e));
        const k = key(e);
        seen.add(k);
        if (!p) return { ...(e as any), __lastSeenAt: now } as any;
        const hn = Number((e as any)?.home_odd || 0);
        const dn = Number((e as any)?.draw_odd || 0);
        const an = Number((e as any)?.away_odd || 0);
        const hp = Number((p as any)?.home_odd || 0);
        const dp = Number((p as any)?.draw_odd || 0);
        const ap = Number((p as any)?.away_odd || 0);
        const nextMarketsRaw = (e as any)?.markets ?? (e as any)?.odds;
        const prevMarketsRaw = (p as any)?.markets ?? (p as any)?.odds;
        const nextMarketsEmpty = mkEmpty(nextMarketsRaw);
        const prevMarketsEmpty = mkEmpty(prevMarketsRaw);
        const merged: any = { ...(p as any), ...(e as any), __lastSeenAt: now };
        if (hn <= 1 && hp > 1) merged.home_odd = (p as any).home_odd;
        if (dn <= 1 && dp > 1) merged.draw_odd = (p as any).draw_odd;
        if (an <= 1 && ap > 1) merged.away_odd = (p as any).away_odd;
        if (nextMarketsEmpty && !prevMarketsEmpty) {
          merged.markets = (p as any).markets;
          merged.odds = (p as any).odds;
        } else if (!nextMarketsEmpty && !prevMarketsEmpty) {
          merged.markets = mergeMarkets((p as any).markets, (e as any).markets);
          merged.odds = mergeMarkets((p as any).odds, (e as any).odds);
        }
        return merged as Event;
      });
      if (opts.keepMissing && opts.graceMs > 0) {
        for (const p of prev) {
          const k = key(p);
          if (seen.has(k)) continue;
          const lastSeen = Number((p as any)?.__lastSeenAt || 0);
          if (!lastSeen) continue;
          if (now - lastSeen > opts.graceMs) continue;
          out.push(p);
        }
      }
      return out;
    };

    const liveStable = stabilize(newLive, lastLiveRef.current, { graceMs: 5 * 60_000, keepMissing: true }).filter((e: any) => Number((e as any)?.is_live || 0) === 1);
    const preStable = stabilize(newPregame, lastPregameRef.current, { graceMs: 60 * 60_000, keepMissing: true }).filter((e: any) => Number((e as any)?.is_live || 0) !== 1);

    if (!eq(liveStable, lastLiveRef.current)) {
      setLive(liveStable);
      lastLiveRef.current = liveStable;
    }
    if (!eq(preStable, lastPregameRef.current)) {
      setPregame(preStable);
      lastPregameRef.current = preStable;
    }
  };

  // Fallback para 'all' se category for nulo
  const safeCategory = typeof category === 'string' && category ? category : 'all';
  const cacheKey = `sportsEvents:${safeCategory}:v1`;

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    let isActive = true;
    const enabled = opts?.enabled !== false;
    const daysOverrideRaw = typeof opts?.days === 'number' && Number.isFinite(opts.days) ? Math.floor(opts.days) : null;
    const daysOverride = daysOverrideRaw == null ? null : Math.max(0, Math.min(14, daysOverrideRaw));
    const only: OnlyMode = onlyMode;
    const idleMs = 60_000;
    let lastInteractionAt = Date.now();
    let hiddenAt = typeof document !== 'undefined' && document.hidden ? Date.now() : 0;
    let wakeInFlight = false;

    // Only reset the readiness gate when no fresh in-memory data exists.
    // With a hot module cache the UI shows stale data instantly; don't flash blank.
    const _memEntry = _sCache.get(cacheKey);
    const _memFresh = _memEntry != null && Date.now() - _memEntry.ts < _S_FRESH_MS;
    if (!_memFresh) setReady(false);

    if (!enabled) {
      setLoading(false);
      setReady(true);
      updateState([], []);
      return () => {
        isActive = false;
        controller.abort();
      };
    }

    let hadCache = false;
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const cached = JSON.parse(raw) as { live?: Event[]; pregame?: Event[] };
          const cachedLive = Array.isArray(cached?.live) ? cached.live : [];
          const cachedPregame = Array.isArray(cached?.pregame) ? cached.pregame : [];
          if (cachedLive.length || cachedPregame.length) {
            hadCache = true;
            updateState(cachedLive, cachedPregame);
            setLoading(false);
          }
        }
      } catch { void 0; }
    }

    if (isFirstLoadRef.current && !hadCache) setLoading(true);

    const fetchData = async () => {
      // Evita buscar dados se aba estiver oculta (exceto primeira carga)
      if (typeof document !== 'undefined' && document.hidden && !isFirstLoadRef.current) return;

      try {
        const params = new URLSearchParams();
        let rawSport = 'all';
        let sportParam = 'all';
        let leagueFilter = '';

        if (import.meta.env.DEV) console.log('[events] fetching category:', safeCategory);

        // Parse da categoria
        if (safeCategory && safeCategory !== 'all') {
          const token = safeCategory.toLowerCase();
          if (token.includes('|')) {
            const parts = token.split('|'); // sport|country|league
            rawSport = parts[0];
            if (parts.length >= 3) {
              leagueFilter = parts[2].toLowerCase().replace(/\s+/g, '-');
            }
          } else {
            rawSport = token;
          }
        } 
 
        // Normaliza nomes de esportes para chave API 
        if ( 
          rawSport.includes('futebol') || 
          rawSport.includes('soccer') || 
          rawSport.includes('liga') || 
          rawSport.includes('serie a') || 
          rawSport.includes('copa') || 
          rawSport.includes('seleções') 
        ) { 
          sportParam = 
            rawSport.includes('americano') || rawSport.includes('american') 
              ? 'american-football' 
              : 'soccer'; 
        } else if (rawSport.includes('basquete') || rawSport.includes('basketball') || rawSport.includes('nba')) { 
          sportParam = 'basketball'; 
        } else if (rawSport.includes('ténis') || rawSport.includes('tenis') || rawSport.includes('tennis')) { 
          sportParam = 'tennis'; 
        } else if (rawSport.includes('hóquei') || rawSport.includes('hockey') || rawSport.includes('nhl') || rawSport.includes('ice-hockey')) { 
          sportParam = 'ice-hockey'; 
        } else if (rawSport.includes('mma') || rawSport.includes('ufc')) { 
          sportParam = 'mma'; 
        } else if (rawSport.includes('fórmula') || rawSport.includes('formula')) { 
          sportParam = 'formula1'; 
        } else if (rawSport.includes('rugby') || rawSport.includes('rúgbi')) { 
          sportParam = 'rugby'; 
        } else if (rawSport.includes('voleibol') || rawSport.includes('volleyball')) { 
          sportParam = 'volleyball'; 
        } else if (rawSport.includes('beisebol') || rawSport.includes('baseball')) { 
          sportParam = 'baseball'; 
        } else if (rawSport.includes('handebol') || rawSport.includes('handball')) { 
          sportParam = 'handball'; 
        } else if (rawSport.includes('afl')) { 
          sportParam = 'afl'; 
        } else { 
          sportParam = rawSport === 'soccer-all' || rawSport === 'todos' ? 'all' : rawSport; 
        } 
 
        params.set('sports', sportParam); 
        if (leagueFilter) {
          // Backend faz LIKE, então passamos um fragmento “limpo” sem hífens artificiais
          const cleanLeague = leagueFilter.replace(/-+/g, ' ').replace(/\s+/g, ' ').trim();
          params.set('league', cleanLeague);
        }
        params.set('include', 'odds');
        params.set('realtime', only === 'pregame' ? '0' : '1');
        params.set('only', only);
        const requireOdds = opts?.requireOdds !== false;
        if (requireOdds) params.set('requireOdds', '1');
        const days =
          daysOverride != null
            ? String(daysOverride)
            : (only === 'live'
                ? '0'
                : (sportParam === 'all' ? '2' : '7'));
        params.set('days', days);

                const url = `/api/events/by-sport?${params.toString()}`;
        __dbg('H2', 'http-fetch-start', { category: String(safeCategory || ''), sports: String(sportParam || ''), league: leagueFilter || null, url });
        let data = await apiFetch<any>(url, { signal: controller.signal, timeout: only === 'pregame' ? 20000 : 12000 });

        let liveCount = Array.isArray(data?.live) ? data.live.length : 0;
        let pregameCount = Array.isArray(data?.pregame) ? data.pregame.length : 0;

        const hasStructuredInitial = Array.isArray(data?.live) || Array.isArray(data?.pregame);
        const hasAnyStructuredInitial = liveCount > 0 || pregameCount > 0;
        if (!triedAllFallbackRef.current && safeCategory !== 'all' && hasStructuredInitial && !hasAnyStructuredInitial) {
          triedAllFallbackRef.current = true;
          const p2 = new URLSearchParams();
          p2.set('sports', 'all');
          p2.set('include', 'odds');
          p2.set('realtime', only === 'live' ? '1' : '0');
          p2.set('only', only);
          if (requireOdds) p2.set('requireOdds', '1');
          const days2 =
            daysOverride != null
              ? String(daysOverride)
              : (only === 'live'
                  ? '0'
                  : (sportParam === 'all' ? '2' : '7'));
          p2.set('days', days2);
          data = await apiFetch<any>(`/api/events/by-sport?${p2.toString()}`, { signal: controller.signal, timeout: only === 'pregame' ? 20000 : 12000 });
          liveCount = Array.isArray(data?.live) ? data.live.length : 0;
          pregameCount = Array.isArray(data?.pregame) ? data.pregame.length : 0;
          __dbg('H2', 'http-fetch-fallback-all', { from: String(safeCategory || ''), liveCount, pregameCount });
        }
        __dbg('H2', 'http-fetch-done', { category: String(safeCategory || ''), sports: String(sportParam || ''), liveCount, pregameCount });

        /*
        console.log('[useSportsEvents] API Response:', { 
          liveCount, 
          pregameCount 
        });
        */

        if (!isActive) return; 

        const hasStructured = Array.isArray(data?.live) || Array.isArray(data?.pregame);
        if (hasStructured) { 
          const rawLive = (data.live || []) as Event[];
          const rawPregame = (data.pregame || []) as Event[];
          
          let liveEvents = dedupEvents(rawLive).filter(e => !shouldHideEvent(e)).map(normalizeMarkets);
          let pregameEvents = dedupEvents(rawPregame).filter(e => !shouldHideEvent(e)).map(normalizeMarkets);  

          // Fallback dev
          if (
            import.meta.env.DEV &&
            liveEvents.length === 0 &&
            pregameEvents.length === 0 &&
            (rawLive.length > 0 || rawPregame.length > 0)
          ) {
            liveEvents = dedupEvents(rawLive).map(normalizeMarkets);
            pregameEvents = dedupEvents(rawPregame).map(normalizeMarkets);
          }

          const isGameActive = (e: Event) => {
             const status = (e as any)?.status ?? (e as any)?.fixture?.status;
             const sRaw =
               (typeof status === 'object' && status !== null)
                 ? ((status as any).short ?? (status as any).long)
                 : status;
             const sRaw2 = sRaw ?? (e as any)?.fixture?.status?.short ?? (e as any)?.fixture?.status?.long ?? '';
             const su = String(sRaw2 || '').toUpperCase().trim();
             if (!su) return true;
             const s = su.replace(/[^A-Z0-9_]+/g, '');
             const done =
               s === 'FT' || s.startsWith('FT') ||
               s === 'AET' ||
               s === 'PEN' || s === 'FTPEN' || s === 'FT_PEN' ||
               s === 'FIN' || s === 'FINAL' || s === 'FINISHED' || s === 'ENDED' || s === 'FIM' ||
               s === 'PST' || s === 'POST' ||
               s === 'CANC' || s === 'CANCELLED' || s === 'CANCELED' ||
               s === 'ABD' || s === 'ABANDONED' || s === 'WO' || s === 'AWD' || s === 'AWARDED' ||
               /MATCHFINISHED|FULLTIME|GAMEOVER|ENCERRAD|TERMINAD/.test(s);
             return !done;
          };
          
          liveEvents = liveEvents.filter(isGameActive);
          pregameEvents = pregameEvents.filter(isGameActive);

                  const hasPrimaryOdds = (e: Event) => {
                    const h = Number((e as any)?.home_odd || 0);
                    const a = Number((e as any)?.away_odd || 0);
                    if (h > 1 && a > 1) return true;

                    const mkRaw = (e as any)?.markets ?? (e as any)?.odds;
                    const mkObj =
                      mkRaw && typeof mkRaw === 'object' && !Array.isArray(mkRaw)
                        ? mkRaw
                        : null;
                    const mkArr = Array.isArray(mkRaw) ? mkRaw : [];

                    const h2hMarket =
                      (mkObj ? ((mkObj as any).h2h || (mkObj as any)['1x2'] || (mkObj as any).main || (mkObj as any).match_winner) : null) ||
                      mkArr.find((m: any) => {
                        const k = String(m?.key || '');
                        return k === 'h2h' || k === '1x2' || k === 'main' || k === 'match_winner';
                      });

                    const sels = Array.isArray(h2hMarket)
                      ? h2hMarket
                      : (h2hMarket?.selections || h2hMarket?.outcomes || h2hMarket?.values || []);
                    const ok = Array.isArray(sels)
                      ? sels.filter((s: any) => Number(s?.odd || s?.price || s?.value || 0) > 1).length
                      : 0;
                    return ok >= 2;
                  };

          const sportKey = (e: Event) => String((e as any)?.sport || '').toLowerCase().trim();
          const blockedSports = new Set(['horse-racing', 'esports', 'e-sports', 'e-sport', 'gaming']);
          const isAllowedSport = (e: Event) => !blockedSports.has(sportKey(e));

          liveEvents = liveEvents.filter(isAllowedSport);
          pregameEvents = pregameEvents.filter(isAllowedSport);

          const preferOdds = (arr: Event[], max: number) => {
            const withOdds = arr.filter(hasPrimaryOdds);
            const withoutOdds = arr.filter((e) => !hasPrimaryOdds(e));
            return [...withOdds, ...withoutOdds].slice(0, max);
          };
          
          const isUpcomingFetch = only === 'pregame' && safeCategory === 'all' && daysOverride != null && Number(daysOverride) >= 7;
          if (isUpcomingFetch) {
            const finalPregame = preferOdds(pregameEvents.filter(isTodayAdjusted), 300);
            updateState([], finalPregame);
            _sCache.set(cacheKey, { live: [], pregame: finalPregame, ts: Date.now() });
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem(cacheKey, JSON.stringify({ live: [], pregame: finalPregame }));
              } catch { void 0; }
            }
            return;
          }

                  const filteredLive = liveEvents; 
                  const pregameBase = preferOdds(pregameEvents.filter(isTodayAdjusted), safeCategory === 'all' ? 120 : 60);

                  const sportRank = (s: string) => {
                    const k = s;
                    if (k === 'soccer') return 1;
                    if (k === 'tennis') return 2;
                    if (k === 'basketball') return 3;
                    if (k === 'ice-hockey') return 4;
                    if (k === 'volleyball') return 5;
                    if (k === 'handball') return 6;
                    if (k === 'american-football') return 7;
                    if (k === 'mma') return 8;
                    if (k === 'formula1') return 9;
                    if (k === 'golf') return 10;
                    if (k === 'cricket') return 98;
                    if (k === 'baseball') return 99;
                    return 50;
                  };
                  const startMs = (e: Event) => {
                    const raw = (e as any)?.event_date || (e as any)?.fixture?.date;
                    const t = raw ? new Date(raw).getTime() : 0;
                    return Number.isFinite(t) ? t : 0;
                  };
                  const limitPregameAll = (arr: Event[], max: number) => {
                    if (safeCategory !== 'all') return arr.slice(0, max);
                    const caps = new Map<string, number>([
                      ['soccer', 25],
                      ['tennis', 10],
                      ['basketball', 8],
                      ['ice-hockey', 6],
                      ['volleyball', 6],
                      ['handball', 6],
                      ['american-football', 6],
                      ['mma', 6],
                      ['formula1', 4],
                      ['golf', 4],
                      ['cricket', 5],
                      ['baseball', 5],
                    ]);
                    const used = new Map<string, number>();
                    const sorted = [...arr].sort((a, b) => {
                      const ar = sportRank(sportKey(a));
                      const br = sportRank(sportKey(b));
                      if (ar !== br) return ar - br;
                      const ao = hasPrimaryOdds(a) ? 1 : 0;
                      const bo = hasPrimaryOdds(b) ? 1 : 0;
                      if (ao !== bo) return bo - ao;
                      const at = startMs(a);
                      const bt = startMs(b);
                      if (at && bt && at !== bt) return at - bt;
                      return String((a as any)?.league || '').localeCompare(String((b as any)?.league || ''), 'pt-PT');
                    });

                    const out: Event[] = [];
                    for (const e of sorted) {
                      if (out.length >= max) break;
                      const sk = sportKey(e);
                      const cap = caps.get(sk);
                      if (typeof cap === 'number') {
                        const cur = used.get(sk) || 0;
                        if (cur >= cap) continue;
                        used.set(sk, cur + 1);
                      }
                      out.push(e);
                    }
                    return out;
                  };

                  const pregameMax = safeCategory === 'all' ? 45 : 60;
                  const filteredPregame = limitPregameAll(pregameBase, pregameMax);
          const maxLive = safeCategory === 'all' ? 100 : 60;
          const finalLive = preferOdds(filteredLive, maxLive * 2).filter(hasPrimaryOdds).slice(0, maxLive);
          
          const finalPregame = filteredPregame;

          if (import.meta.env.DEV) console.log('[events] loaded live:', finalLive.length, 'pregame:', finalPregame.length);
          updateState(finalLive, finalPregame);
          _sCache.set(cacheKey, { live: finalLive, pregame: finalPregame, ts: Date.now() });
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(cacheKey, JSON.stringify({ live: finalLive, pregame: finalPregame }));
            } catch { void 0; }
          }
          return; 
        } else if (Array.isArray(data) && data.length > 0) {
            // FLAT ARRAY FALLBACK (API returning simple list)
            const list = data as Event[];
            const liveEvents = list.filter(e => Number(e.is_live) === 1);
            const pregameEvents = list.filter(e => Number(e.is_live) !== 1);
            
            // Apply same filters
            const dedupedLive = dedupEvents(liveEvents).filter(e => !shouldHideEvent(e)).map(normalizeMarkets);
            const dedupedPregame = dedupEvents(pregameEvents).filter(e => !shouldHideEvent(e)).map(normalizeMarkets);
            
            const isGameActive = (e: Event) => {
                const status = (e as any)?.status ?? (e as any)?.fixture?.status;
                const sRaw =
                  (typeof status === 'object' && status !== null)
                    ? ((status as any).short ?? (status as any).long)
                    : status;
                const sRaw2 = sRaw ?? (e as any)?.fixture?.status?.short ?? (e as any)?.fixture?.status?.long ?? '';
                const su = String(sRaw2 || '').toUpperCase().trim();
                if (!su) return true;
                const s = su.replace(/[^A-Z0-9_]+/g, '');
                const done =
                  s === 'FT' || s.startsWith('FT') ||
                  s === 'AET' ||
                  s === 'PEN' || s === 'FTPEN' || s === 'FT_PEN' ||
                  s === 'FIN' || s === 'FINAL' || s === 'FINISHED' || s === 'ENDED' || s === 'FIM' ||
                  s === 'PST' || s === 'POST' ||
                  s === 'CANC' || s === 'CANCELLED' || s === 'CANCELED' ||
                  s === 'ABD' || s === 'ABANDONED' || s === 'WO' || s === 'AWD' || s === 'AWARDED' ||
                  /MATCHFINISHED|FULLTIME|GAMEOVER|ENCERRAD|TERMINAD/.test(s);
                return !done;
            };

            const activeLive = dedupedLive.filter(isGameActive);
            const activePregame = dedupedPregame.filter(isGameActive);

            const hasPrimaryOdds = (e: Event) => {
              const h = Number((e as any)?.home_odd || 0);
              const a = Number((e as any)?.away_odd || 0);
              if (h > 1 && a > 1) return true;
              const mkRaw = (e as any)?.markets ?? (e as any)?.odds;
              const mkObj =
                mkRaw && typeof mkRaw === 'object' && !Array.isArray(mkRaw)
                  ? mkRaw
                  : null;
              const mkArr = Array.isArray(mkRaw) ? mkRaw : [];
              const h2hMarket =
                (mkObj ? ((mkObj as any).h2h || (mkObj as any)['1x2'] || (mkObj as any).main || (mkObj as any).match_winner) : null) ||
                mkArr.find((m: any) => {
                  const k = String(m?.key || '');
                  return k === 'h2h' || k === '1x2' || k === 'main' || k === 'match_winner';
                });
              const sels = Array.isArray(h2hMarket)
                ? h2hMarket
                : (h2hMarket?.selections || h2hMarket?.outcomes || h2hMarket?.values || []);
              const ok = Array.isArray(sels)
                ? sels.filter((s: any) => Number(s?.odd || s?.price || s?.value || 0) > 1).length
                : 0;
              return ok >= 2;
            };
            const preferOdds = (arr: Event[], max: number) => {
              const withOdds = arr.filter(hasPrimaryOdds);
              const withoutOdds = arr.filter((e) => !hasPrimaryOdds(e));
              return [...withOdds, ...withoutOdds].slice(0, max);
            };

            const blockedSports = new Set(['horse-racing', 'esports', 'e-sports', 'e-sport', 'gaming']);
            const sportKey = (e: Event) => String((e as any)?.sport || '').toLowerCase().trim();
            const isAllowedSport = (e: Event) => !blockedSports.has(sportKey(e));

            const maxLive = safeCategory === 'all' ? 100 : 60;
            const finalLive = preferOdds(activeLive.filter(isAllowedSport), maxLive * 2).filter(hasPrimaryOdds).slice(0, maxLive);
            const pregameBase = preferOdds(activePregame.filter(isTodayAdjusted), 80);

            const sportRank = (s: string) => {
              const k = s;
              if (k === 'soccer') return 1;
              if (k === 'tennis') return 2;
              if (k === 'basketball') return 3;
              if (k === 'ice-hockey') return 4;
              if (k === 'volleyball') return 5;
              if (k === 'handball') return 6;
              if (k === 'american-football') return 7;
              if (k === 'mma') return 8;
              if (k === 'formula1') return 9;
              if (k === 'golf') return 10;
              if (k === 'cricket') return 98;
              if (k === 'baseball') return 99;
              return 50;
            };
            const startMs = (e: Event) => {
              const raw = (e as any)?.event_date || (e as any)?.fixture?.date;
              const t = raw ? new Date(raw).getTime() : 0;
              return Number.isFinite(t) ? t : 0;
            };

            const limitPregameAll = (arr: Event[], max: number) => {
              if (safeCategory !== 'all') return arr.slice(0, max);
              const caps = new Map<string, number>([
                ['soccer', 25],
                ['tennis', 10],
                ['basketball', 8],
                ['ice-hockey', 6],
                ['volleyball', 6],
                ['handball', 6],
                ['american-football', 6],
                ['mma', 6],
                ['formula1', 4],
                ['golf', 4],
                ['cricket', 5],
                ['baseball', 5],
              ]);
              const used = new Map<string, number>();
              const sorted = [...arr].sort((a, b) => {
                const ar = sportRank(sportKey(a));
                const br = sportRank(sportKey(b));
                if (ar !== br) return ar - br;
                const ao = hasPrimaryOdds(a) ? 1 : 0;
                const bo = hasPrimaryOdds(b) ? 1 : 0;
                if (ao !== bo) return bo - ao;
                const at = startMs(a);
                const bt = startMs(b);
                if (at && bt && at !== bt) return at - bt;
                return String((a as any)?.league || '').localeCompare(String((b as any)?.league || ''), 'pt-PT');
              });

              const out: Event[] = [];
              for (const e of sorted) {
                if (out.length >= max) break;
                const sk = sportKey(e);
                const cap = caps.get(sk);
                if (typeof cap === 'number') {
                  const cur = used.get(sk) || 0;
                  if (cur >= cap) continue;
                  used.set(sk, cur + 1);
                }
                out.push(e);
              }
              return out;
            };

            const pregameMax = safeCategory === 'all' ? 45 : 60;
            const finalPregame = limitPregameAll(pregameBase, pregameMax);

            updateState(finalLive, finalPregame);
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem(cacheKey, JSON.stringify({ live: finalLive, pregame: finalPregame }));
              } catch { void 0; }
            }
            return;
        }
 
        if (isFirstLoadRef.current && !hadCache) {
          __dbg('H2', 'http-empty-first-load', { category: String(safeCategory || ''), sports: String(sportParam || '') });
          updateState([], []);
        }
        return;
      } catch (err: any) { 
        if (controller.signal.aborted) return; 
        __dbg('H2', 'http-fetch-error', { category: String(safeCategory || ''), message: String(err?.message || err), name: String(err?.name || '' ) });
      } finally { 
        if (isActive) { 
          setLoading(false); 
          setReady(true);
          isFirstLoadRef.current = false; 
        } 
      } 
    }; 

    const runWakeRefresh = () => {
      if (!isActive) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (wakeInFlight) return;
      wakeInFlight = true;
      fetchData().finally(() => {
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
 
    // Initial fetch
    fetchData();

            const intervalTime = safeCategory === 'all' ? 10_000 : 15_000;
    let timeoutId: NodeJS.Timeout;

    const scheduleNext = () => {
      timeoutId = setTimeout(() => {
        if (isActive && !document.hidden) {
          fetchData().finally(scheduleNext);
        } else if (isActive) {
          // If hidden, check again in 3s (but don't fetch)
          scheduleNext();
        }
      }, intervalTime);
    };

    // Start loop
    scheduleNext();

    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
      window.addEventListener('pointerdown', onActivity);
      window.addEventListener('keydown', onActivity);
      window.addEventListener('touchstart', onActivity);
      window.addEventListener('wheel', onActivity);
    }

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
      controller.abort();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('pointerdown', onActivity);
        window.removeEventListener('keydown', onActivity);
        window.removeEventListener('touchstart', onActivity);
        window.removeEventListener('wheel', onActivity);
      }
    };
  }, [safeCategory, onlyMode, opts?.days, opts?.enabled, opts?.requireOdds]); 
 
  return { live, pregame, loading, ready }; 
}

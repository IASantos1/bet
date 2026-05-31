
import { useMemo } from 'react';
import type { Event } from '../../shared/types';

const normalizeTeam = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const eventDateKey = (e: any) => {
  const raw = e?.event_date ?? e?.fixture?.date ?? e?.date;
  return String(raw || '').slice(0, 10);
};

const matchUID = (e: any) => {
  const home = e?.home_team ?? e?.teams?.home?.name ?? '';
  const away = e?.away_team ?? e?.teams?.away?.name ?? '';
  return `${normalizeTeam(home)}-vs-${normalizeTeam(away)}-${eventDateKey(e)}`;
};

const mergeKeyOf = (e: any) => {
  const ext = e?.external_event_id ?? e?.externalId ?? e?.externalID;
  const fixId = e?.fixture?.id;
  const id = e?.id;
  return String(ext || fixId || matchUID(e) || id || '').trim();
};

const isNonEmptyObj = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0;
const isNonEmptyMarkets = (v: any) => (Array.isArray(v) ? v.length > 0 : isNonEmptyObj(v));

const isNonEmptyString = (v: any) => typeof v === 'string' && v.trim().length > 0;

const hasAnyOdds = (e: any) => {
  const h = Number(e?.home_odd || 0);
  const d = Number(e?.draw_odd || 0);
  const a = Number(e?.away_odd || 0);
  if (h > 1 && a > 1) return true;
  if (d > 1) return true;
  const mk = e?.markets ?? e?.odds;
  return isNonEmptyMarkets(mk);
};

const pickTimer = (wsTimer: any, httpTimer: any) => {
  if (isNonEmptyString(wsTimer)) return String(wsTimer).trim();
  if (isNonEmptyString(httpTimer)) return String(httpTimer).trim();
  return '';
};

const pickElapsed = (wsElapsed: any, httpElapsed: any) => {
  const w = Number(wsElapsed);
  const h = Number(httpElapsed);
  const wOk = Number.isFinite(w) && w > 0;
  const hOk = Number.isFinite(h) && h > 0;
  if (wOk) return w;
  if (hOk) return h;
  if (Number.isFinite(w)) return w;
  if (Number.isFinite(h)) return h;
  return 0;
};

const statusKeyOf = (e: any) => {
  const raw =
    (typeof e?.status === 'string' ? e.status : (e?.status?.short ?? e?.status?.long)) ??
    e?.fixture?.status?.short ??
    e?.fixture?.status?.long ??
    '';
  return String(raw || '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9_]+/g, '');
};

/**
 * Merges HTTP Snapshot events with Real-time WebSocket events.
 * 
 * @param httpEvents - List of events fetched via HTTP (snapshot)
 * @param wsEvents - List of events from WebSocket (live updates)
 * @returns Merged list of events with WS data taking priority
 */
export function useMergedEvents(
  httpEvents: Event[] = [], 
  wsEvents: Event[] = []
) {
  // Merge HTTP + WS + Placeholders
  const merged = useMemo(() => {
    const map = new Map<string, Event>();
    const index = new Map<string, string>();

    const indexAliases = (canonical: string, e: any) => {
      const add = (k: any) => {
        const s = String(k || '').trim();
        if (!s) return;
        if (!index.has(s)) index.set(s, canonical);
      };
      add(canonical);
      add(e?.id);
      add(e?.external_event_id);
      add(e?.fixture?.id);
      add(matchUID(e));
    };
    
    // Base: HTTP Events
    httpEvents.forEach(e => {
      const canonical = mergeKeyOf(e);
      if (!canonical) return;
      map.set(canonical, e);
      indexAliases(canonical, e);
    });
    
    // Overlay: WS Events (Prefer HTTP for odds/markets)
    wsEvents.forEach(e => {
      const canonical =
        index.get(String(e?.id || '').trim()) ||
        index.get(String(e?.external_event_id || '').trim()) ||
        index.get(String(e?.fixture?.id || '').trim()) ||
        index.get(matchUID(e)) ||
        mergeKeyOf(e);
      if (!canonical) return;

      const httpEvt = map.get(canonical);
      
      const httpMarkets = (httpEvt as any)?.markets ?? (httpEvt as any)?.odds;
      const wsMarkets = (e as any)?.markets ?? (e as any)?.odds;
      const markets =
        isNonEmptyMarkets(httpMarkets) ? httpMarkets : isNonEmptyMarkets(wsMarkets) ? wsMarkets : (httpEvt as any)?.odds ?? {};

      const httpHomeOdd = Number((httpEvt as any)?.home_odd || 0);
      const httpDrawOdd = Number((httpEvt as any)?.draw_odd || 0);
      const httpAwayOdd = Number((httpEvt as any)?.away_odd || 0);
      const wsHomeOdd = Number((e as any)?.home_odd || 0);
      const wsDrawOdd = Number((e as any)?.draw_odd || 0);
      const wsAwayOdd = Number((e as any)?.away_odd || 0);

      const mergedEvt: Event = {
        ...(httpEvt || {}),
        ...e,
        id: (httpEvt as any)?.id || (e as any)?.id || (e as any)?.external_event_id || (e as any)?.fixture?.id,
        external_event_id: (httpEvt as any)?.external_event_id || (e as any)?.external_event_id || (httpEvt as any)?.id || (e as any)?.id,
        odds: isNonEmptyObj((httpEvt as any)?.odds) ? (httpEvt as any)?.odds : isNonEmptyObj((e as any).odds) ? (e as any).odds : {},
        home_odd: httpHomeOdd > 1 ? httpHomeOdd : wsHomeOdd > 1 ? wsHomeOdd : httpHomeOdd || wsHomeOdd || 0,
        draw_odd: httpDrawOdd > 1 ? httpDrawOdd : wsDrawOdd > 1 ? wsDrawOdd : httpDrawOdd || wsDrawOdd || 0,
        away_odd: httpAwayOdd > 1 ? httpAwayOdd : wsAwayOdd > 1 ? wsAwayOdd : httpAwayOdd || wsAwayOdd || 0,
        markets,
        elapsed: pickElapsed((e as any)?.elapsed ?? (e as any)?.fixture?.status?.elapsed, (httpEvt as any)?.elapsed ?? (httpEvt as any)?.fixture?.status?.elapsed),
        timer: pickTimer((e as any)?.timer ?? (e as any)?.fixture?.status?.timer, (httpEvt as any)?.timer ?? (httpEvt as any)?.fixture?.status?.timer),
      } as Event;

      map.set(canonical, mergedEvt);
      indexAliases(canonical, mergedEvt);
    });

    return Array.from(map.values()).filter(e => {
        // FILTER: Remove fake events
        const h = (e.home_team || '').trim();
        const a = (e.away_team || '').trim();
        if (!h || !a || h === 'undefined' || a === 'undefined' || h === 'Home Team' || a === 'Away Team') return false;
        if (e.id === 'undefined' || !e.id) return false;

        const st = statusKeyOf(e);
        const isLive = Number((e as any).is_live) === 1 || st === 'LIVE' || ['1H','2H','HT','ET','P','Q1','Q2','Q3','Q4','OT','IN'].includes(st);
        if (isLive && !hasAnyOdds(e)) return false;
        return true;
    }).sort((a, b) => {
      const aStatus = statusKeyOf(a);
      const bStatus = statusKeyOf(b);
      const aLive = Number((a as any).is_live) === 1 || aStatus === 'LIVE' || ['1H','2H','HT','ET','P','Q1','Q2','Q3','Q4','OT','IN'].includes(aStatus);
      const bLive = Number((b as any).is_live) === 1 || bStatus === 'LIVE' || ['1H','2H','HT','ET','P','Q1','Q2','Q3','Q4','OT','IN'].includes(bStatus);
      
      if (aLive && !bLive) return -1;
      if (!aLive && bLive) return 1;
      return new Date(a.event_date || 0).getTime() - new Date(b.event_date || 0).getTime();
    });
  }, [httpEvents, wsEvents]);

  return merged;
}

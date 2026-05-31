import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/react-app/contexts/AppContext';
import { useSportsEvents } from '@/react-app/hooks/useSportsEvents';
import { useLiveFeed } from '../hooks/useLiveFeed';
import { useMergedEvents } from '../hooks/useMergedEvents';
import EventCard from '../components/EventCard';
import { Sidebar } from '../components/Sidebar';
import { BannerCarousel } from '../components/BannerCarousel';
import WorldCupBanner from '../components/WorldCupBanner';
import { BetSlip } from '../components/BetSlip';
import { useNavigate } from 'react-router-dom';
import { getSportIcon } from '../../shared/helpers';
import { useEventSearch } from '../hooks/useEventSearch';
import { useUpcomingCache } from '../hooks/useUpcomingCache';
import { useGroupedEvents } from '../hooks/useGroupedEvents';
import { useTopLeagues } from '../hooks/useTopLeagues';
import type { Event } from '../../shared/types';

interface HomeProps {
  mode?: 'home' | 'live';
}

const normalizeTeamKey = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const matchUID = (home: string, away: string, dateIso: string) => {
  const h = normalizeTeamKey(home);
  const a = normalizeTeamKey(away);
  const d = String(dateIso || '').slice(0, 10);
  return `${h}::${a}::${d}`;
};

const mergeKeyOf = (e: any) => {
  const ext = e?.external_event_id;
  const fix = e?.fixture?.id;
  const id = e?.id;
  if (ext) return String(ext);
  if (fix) return String(fix);
  if (id) return String(id);
  return matchUID(String(e?.home_team || e?.teams?.home?.name || ''), String(e?.away_team || e?.teams?.away?.name || ''), String(e?.event_date || e?.fixture?.date || ''));
};

const statusKeyOf = (e: any) =>
  String(e?.status?.short ?? e?.status?.long ?? e?.status ?? e?.fixture?.status?.short ?? e?.fixture?.status?.long ?? '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9_]+/g, '');

const isFinishedEvent = (e: any) => {
  const k = statusKeyOf(e);
  const done = new Set(['FT', 'AET', 'FT_PEN', 'FTPEN', 'AWD', 'WO', 'ABD', 'CANC', 'PST', 'FIN', 'FINAL', 'FINISHED', 'ENDED']);
  if (done.has(k)) return true;
  if (/MATCHFINISHED|FULLTIME|GAMEOVER|ENCERRAD|TERMINAD/.test(k)) return true;
  return false;
};

function Home({ mode = 'home' }: HomeProps) {
  const { darkMode, selectedCategory, setSelectedCategory, showMobileSidebar, setShowMobileSidebar, addToBetSlip } = useApp();
  const navigate = useNavigate();

  // Copa do Mundo inline filter mode
  const isWorldCupMode = selectedCategory === 'copa-do-mundo';

  // Dados principais
  const isMainSports =
    !selectedCategory ||
    selectedCategory === 'all' ||
    selectedCategory === 'soccer-all' ||
    selectedCategory === 'todos';

  // Copa mode: fetch all events (client filters WC leagues); requireOdds=1 is on by default
  const apiCategory = isWorldCupMode ? 'all' : (selectedCategory || 'all');
  const apiDays = isWorldCupMode ? 30 : (mode === 'home' && isMainSports ? 7 : undefined);

  const { live: httpLive, pregame, loading: eventsLoading, ready: eventsReady } = useSportsEvents(
    apiCategory,
    {
      only: mode === 'home' ? 'pregame' : mode === 'live' ? 'live' : 'both',
      days: apiDays,
    },
  );

  const todayKey = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const { pregame: pregame7Days, ready: pregame7Ready } = useSportsEvents('all', {
    only: 'pregame',
    days: 8,
    enabled: mode === 'live',
    requireOdds: false,
  });
  void eventsLoading;
  const showBanner = mode === 'home';
  
  const { liveEvents: wsLiveEvents, hasLoaded: liveFeedLoaded } = useLiveFeed('all');
  const mergedLive = useMergedEvents(httpLive, wsLiveEvents);
  const processedLive = useMemo(() => {
    const map = new Map<string, Event>();
    for (const ev of mergedLive) {
      if (isFinishedEvent(ev)) continue;
      map.set(mergeKeyOf(ev), ev);
    }
    return Array.from(map.values());
  }, [mergedLive]);

  const { upcomingEvents } = useUpcomingCache(pregame);

  // Busca
  const { query, setQuery } = useEventSearch();

  // ── Reveal gate ────────────────────────────────────────────────
  // Em vez de mostrar jogos a "pingar" um a um, esperamos que TODAS as
  // fontes de dados assentem (rede HTTP real + feed ao vivo + próximos 7
  // dias) e revelamos tudo de uma só vez, num bloco estável com fade-in.
  const [revealed, setRevealed] = useState(false);

  // ── Copa do Mundo data source ───────────────────────────────────
  const [copaMatches, setCopaMatches] = useState<any[]>([]);
  const [copaLoading, setCopaLoading] = useState(false);
  const [copaOddsMap, setCopaOddsMap] = useState<Record<string, { home: number; draw: number; away: number }>>({});

  useEffect(() => {
    if (!isWorldCupMode) { setCopaMatches([]); setCopaOddsMap({}); return; }
    let cancelled = false;
    setCopaLoading(true);
    setCopaMatches([]);
    setCopaOddsMap({});

    const isPlaceholder = (name: string) => {
      if (!name || name.length < 2) return true;
      if (name.includes('/')) return true;          // "3A/3B/3C/3D"
      if (/^\d[A-Z]/.test(name)) return true;       // "2A", "1C"
      if (/^[A-HW]\d/.test(name)) return true;      // "G1", "W73", "H2"
      return false;
    };

    fetch('/api/world-cup-2026/matches?limit=200')
      .then(r => r.json())
      .then(async (data: any) => {
        if (cancelled) return;
        const all: any[] = Array.isArray(data?.matches) ? data.matches : [];
        const real = all.filter(m =>
          !isPlaceholder(m.home_team) && !isPlaceholder(m.away_team)
        );
        real.sort((a, b) =>
          new Date(a.event_date || 0).getTime() - new Date(b.event_date || 0).getTime()
        );
        setCopaMatches(real);

        // Fetch odds per match in background (concurrency 5)
        const queue = [...real];
        const worker = async () => {
          while (queue.length) {
            if (cancelled) return;
            const m = queue.shift();
            if (!m) break;
            const id = String(m.id || '').trim();
            if (!id) continue;
            try {
              const r = await fetch(`/api/events/${encodeURIComponent(id)}/odds?sport=soccer`);
              if (!r.ok || cancelled) continue;
              const d = await r.json().catch(() => null);
              if (!d || cancelled) continue;
              const home = Number(d.home || 0);
              const draw = Number(d.draw || 0);
              const away = Number(d.away || 0);
              if (home > 1.01 && away > 1.01) {
                setCopaOddsMap(prev => ({ ...prev, [id]: { home, draw, away } }));
              }
            } catch { /* ignore */ }
          }
        };
        await Promise.all(Array.from({ length: 5 }, worker));
      })
      .catch(() => { if (!cancelled) setCopaMatches([]); })
      .finally(() => { if (!cancelled) setCopaLoading(false); });

    return () => { cancelled = true; };
  }, [isWorldCupMode]);

  // Merge fetched odds into Copa matches
  const copaMatchesEnriched = useMemo(() => {
    if (!isWorldCupMode || Object.keys(copaOddsMap).length === 0) return copaMatches;
    return copaMatches.map(m => {
      const id = String(m.id || '');
      const o = copaOddsMap[id];
      if (!o) return m;
      return { ...m, home_odd: o.home, draw_odd: o.draw, away_odd: o.away };
    });
  }, [copaMatches, copaOddsMap, isWorldCupMode]);

  // Re-engaja a porta sempre que muda o modo ou a categoria.
  useEffect(() => {
    setRevealed(false);
  }, [mode, selectedCategory]);

  useEffect(() => {
    if (revealed) return;

    // Copa mode: reveal when copa fetch finishes
    if (isWorldCupMode) {
      if (!copaLoading) {
        const t = setTimeout(() => setRevealed(true), 150);
        return () => clearTimeout(t);
      }
      return;
    }

    // A fonte primária (HTTP) tem de ter respondido pela rede (não só cache).
    const primaryReady = eventsReady;
    // Em "ao vivo" também esperamos o feed ao vivo e os próximos 7 dias.
    const liveSourcesReady = mode === 'live' ? (liveFeedLoaded && pregame7Ready) : true;

    if (primaryReady && liveSourcesReady) {
      // Pequena janela de assentamento para o merge final entrar num único lote.
      const settleMs = mode === 'live' ? 350 : 150;
      const t = setTimeout(() => setRevealed(true), settleMs);
      return () => clearTimeout(t);
    }
  }, [revealed, eventsReady, liveFeedLoaded, pregame7Ready, mode, isWorldCupMode, copaLoading]);

  // Tecto de segurança: nunca segurar o ecrã mais do que 6s.
  useEffect(() => {
    const cap = setTimeout(() => setRevealed(true), 6000);
    return () => clearTimeout(cap);
  }, [mode, selectedCategory]);

  // Agrupamento
  const activeTopLeagues = useTopLeagues(processedLive, upcomingEvents);

  // Separate Lists for Live and Upcoming
  const sortedUpcoming = useMemo(() => {
    const liveIds = new Set(processedLive.map(e => mergeKeyOf(e)));
    return upcomingEvents
      .filter(e => {
        if (liveIds.has(mergeKeyOf(e))) return false;

        // Strict validity check
        const h = (e.home_team || '').trim();
        const a = (e.away_team || '').trim();
        if (!h || !a || h === 'undefined' || a === 'undefined' || h === 'Home Team' || a === 'Away Team') return false;
        if (e.id === 'undefined' || !e.id) return false;

        const homeOdd = Number((e as any)?.home_odd || 0);
        const awayOdd = Number((e as any)?.away_odd || 0);
        if (homeOdd > 1.01 && awayOdd > 1.01) return true;

        let mk: any = (e as any)?.markets ?? (e as any)?.odds;
        if (typeof mk === 'string') {
          const s = mk.trim();
          if (s && ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']')))) {
            try { mk = JSON.parse(s); } catch { void 0; }
          }
        }
        if (mk && typeof mk === 'object' && !Array.isArray(mk)) {
          const h2h = (mk as any).h2h || (mk as any)['1x2'] || (mk as any).main || (mk as any).match_winner;
          const sels = Array.isArray(h2h) ? h2h : (h2h?.selections || h2h?.outcomes || h2h?.values || []);
          if (Array.isArray(sels)) {
            const ok = sels.filter((s: any) => Number(s?.odd ?? s?.price ?? s?.value ?? 0) > 1.01).length;
            if (ok >= 2) return true;
          }
        }
        
        return false;
      })
      .sort((a, b) => {
        const ta = new Date(a.event_date || a.start_time || a.fixture?.date || 0).getTime();
        const tb = new Date(b.event_date || b.start_time || b.fixture?.date || 0).getTime();
        return ta - tb; // Ascending: Soonest first
      });
  }, [processedLive, upcomingEvents]);

  const sortedUpcoming7Days = useMemo(() => {
    if (mode !== 'live') return [];
    const liveIds = new Set(processedLive.map(e => mergeKeyOf(e)));
    const list = Array.isArray(pregame7Days) ? pregame7Days : [];
    return list
      .filter(e => {
        if (!e) return false;
        if (liveIds.has(mergeKeyOf(e))) return false;
        const rawDate = (e as any)?.event_date ?? (e as any)?.start_time ?? (e as any)?.fixture?.date ?? '';
        const m = typeof rawDate === 'string' ? rawDate.match(/\d{4}-\d{2}-\d{2}/) : null;
        const dayKey = m?.[0] || '';
        if (dayKey && dayKey === todayKey) return false;
        const h = (e.home_team || '').trim();
        const a = (e.away_team || '').trim();
        if (!h || !a || h === 'undefined' || a === 'undefined' || h === 'Home Team' || a === 'Away Team') return false;
        if (e.id === 'undefined' || !e.id) return false;
        const homeOdd = Number((e as any)?.home_odd || 0);
        const awayOdd = Number((e as any)?.away_odd || 0);
        if (homeOdd > 1.01 && awayOdd > 1.01) return true;
        const mk = (e as any)?.markets ?? (e as any)?.odds;
        if (mk && typeof mk === 'object' && !Array.isArray(mk)) return Object.keys(mk).length > 0;
        if (Array.isArray(mk)) return mk.length > 0;
        return false;
      })
      .sort((a, b) => {
        const ta = new Date(a.event_date || a.start_time || a.fixture?.date || 0).getTime();
        const tb = new Date(b.event_date || b.start_time || b.fixture?.date || 0).getTime();
        return ta - tb;
      });
  }, [mode, processedLive, pregame7Days, todayKey]);

  const featuredUpcomingGroups = useMemo(() => {
    if (mode !== 'home') return [];
    if (!isMainSports) return [];
    const normalizeSport = (raw: any) => {
      const s = String(raw || '').toLowerCase().trim();
      if (s.includes('soccer') || (s.includes('football') && !s.includes('american')) || s.includes('futebol')) return 'soccer';
      if (s.includes('tennis') || s.includes('tenis') || s.includes('ténis')) return 'tennis';
      if (s.includes('basketball') || s.includes('basquete')) return 'basketball';
      if (s.includes('ice-hockey') || s.includes('ice hockey') || s.includes('hockey') || s.includes('hóquei')) return 'ice-hockey';
      if (s.includes('baseball') || s.includes('beisebol')) return 'baseball';
      return s || 'other';
    };
    const leagueNameOf = (e: any) => {
      const l = e?.league;
      const raw = typeof l === 'string' ? l : l?.name;
      return String(raw || e?.league_name || '').toLowerCase().trim();
    };
    const countryOf = (e: any) => String(e?.country || '').toLowerCase().trim();
    const importanceScore = (sport: string, e: any) => {
      const league = leagueNameOf(e);
      const country = countryOf(e);
      const name = `${country} ${league}`;
      if (sport === 'soccer') {
        if (/champions|uefa\s*champions|ucl/.test(name)) return 120;
        if (/premier\s*league|epl/.test(name)) return 115;
        if (/la\s*liga|laliga|primera/.test(name)) return 110;
        if (/serie\s*a\b/.test(name) && /ital/i.test(name)) return 110;
        if (/bundesliga/.test(name)) return 105;
        if (/ligue\s*1/.test(name)) return 100;
        if (/brasil|brazil|brasileir|campeonato\s*brasileiro|serie\s*a\b/.test(name)) return 108;
        if (/copa\s*do\s*brasil/.test(name)) return 95;
        if (/libertadores|sudamericana/.test(name)) return 92;
        return 10;
      }
      if (sport === 'tennis') {
        if (/grand\s*slam|wimbledon|roland|australian|us\s*open/.test(name)) return 110;
        if (/atp\b/.test(name)) return 100;
        if (/wta\b/.test(name)) return 95;
        if (/challenger/.test(name)) return 70;
        return 10;
      }
      if (sport === 'basketball') {
        if (/\bnba\b/.test(name)) return 110;
        if (/euroleague/.test(name)) return 95;
        if (/ncaa/.test(name)) return 80;
        return 10;
      }
      if (sport === 'ice-hockey') {
        if (/\bnhl\b/.test(name)) return 110;
        if (/\bshl\b/.test(name)) return 85;
        if (/\bkhl\b/.test(name)) return 80;
        return 10;
      }
      if (sport === 'baseball') {
        if (/\bmlb\b/.test(name)) return 110;
        return 10;
      }
      return 0;
    };
    const bySport = (events: Event[]) => {
      const out = new Map<string, Event[]>();
      for (const e of events) {
        const sport = normalizeSport((e as any)?.sport);
        if (!out.has(sport)) out.set(sport, []);
        out.get(sport)!.push(e);
      }
      return out;
    };
    const pickQuota = (events: Event[], sport: string, limit: number) => {
      const minScoreBySport: Record<string, number> = {
        'soccer': 90,
        'tennis': 70,
        'basketball': 70,
        'ice-hockey': 80,
        'baseball': 90,
      };
      const minScore = minScoreBySport[sport] ?? 0;
      const items = [...events]
        .map((e) => {
          const start = new Date((e as any).event_date || (e as any).start_time || (e as any).fixture?.date || 0).getTime();
          return { e, start, score: importanceScore(sport, e) };
        })
        .sort((a, b) => (b.score - a.score) || (a.start - b.start));
      const picked: Event[] = [];
      const preferred = items.filter((x) => x.score >= minScore);
      for (const it of preferred) {
        if (picked.length >= limit) break;
        picked.push(it.e);
      }
      if (picked.length < limit) {
        const pickedSet = new Set(picked.map((e) => mergeKeyOf(e)));
        const fallback = items
          .filter((x) => !pickedSet.has(mergeKeyOf(x.e)))
          .sort((a, b) => a.start - b.start);
        for (const it of fallback) {
          if (picked.length >= limit) break;
          picked.push(it.e);
        }
      }
      return picked;
    };
    const source = sortedUpcoming as Event[];
    const m = bySport(source);
    const quotas: Array<{ sport: string; label: string; limit: number }> = [
      { sport: 'soccer', label: 'Futebol', limit: 15 },
      { sport: 'tennis', label: 'Ténis', limit: 10 },
      { sport: 'basketball', label: 'Basquetebol', limit: 10 },
      { sport: 'ice-hockey', label: 'Hóquei', limit: 5 },
      { sport: 'baseball', label: 'Beisebol', limit: 5 },
    ];
    const groups: Array<[string, Event[]]> = [];
    for (const q of quotas) {
      const list = m.get(q.sport) || [];
      const picked = pickQuota(list, q.sport, q.limit);
      if (picked.length) groups.push([q.label, picked]);
    }
    return groups;
  }, [isMainSports, mode, sortedUpcoming]);

  // Strict separation: Desporto = pregame only | AO VIVO = live only
  const displayedLive    = mode === 'live' ? processedLive : [];
  const displayedUpcoming = useMemo(() => {
    // Copa mode: use enriched Copa data (real teams + fetched odds)
    if (isWorldCupMode) return copaMatchesEnriched;
    return mode === 'home' ? sortedUpcoming : [];
  }, [mode, sortedUpcoming, isWorldCupMode, copaMatchesEnriched]);

  const groupedLive = useGroupedEvents(displayedLive, query);
  const groupedUpcoming = useGroupedEvents(displayedUpcoming, query);
  const groupedNext7 = useGroupedEvents(mode === 'live' ? (sortedUpcoming7Days as Event[]) : [], query);

  const MAX_EVENTS = mode === 'live' ? 120 : 60; // live≤120, pregame≤60

  const limitedUpcoming = useMemo(() => {
    if (mode === 'home' && isMainSports && featuredUpcomingGroups.length > 0) {
      return featuredUpcomingGroups;
    }
    let remaining = MAX_EVENTS;
    const result: [string, Event[]][] = [];

    for (const [league, events] of groupedUpcoming) {
      if (remaining <= 0) break;
      const take = Math.min(events.length, remaining);
      if (take > 0) {
        result.push([league, events.slice(0, take)]);
        remaining -= take;
      }
    }
    return result;
  }, [groupedUpcoming, MAX_EVENTS, mode, isMainSports, featuredUpcomingGroups]);

  const limitedNext7 = useMemo(() => {
    if (mode !== 'live') return [];
    let remaining = 300;
    const result: [string, Event[]][] = [];
    for (const [league, events] of groupedNext7) {
      if (remaining <= 0) break;
      const take = Math.min(events.length, remaining);
      if (take > 0) {
        result.push([league, events.slice(0, take)]);
        remaining -= take;
      }
    }
    return result;
  }, [groupedNext7, mode]);

  const noSearchResults = useMemo(() => {
    if (!query.trim()) return false;
    const liveCount = groupedLive.reduce((acc, [, ev]) => acc + ev.length, 0);
    const upCount = limitedUpcoming.reduce((acc, [, ev]) => acc + ev.length, 0);
    const next7Count = limitedNext7.reduce((acc, [, ev]) => acc + ev.length, 0);
    return liveCount + upCount + next7Count === 0;
  }, [groupedLive, limitedUpcoming, limitedNext7, query]);

  const upcomingIsFeatured = mode === 'home' && isMainSports && featuredUpcomingGroups.length > 0;

  const handleOpenEvent = (event: Event) => {
    navigate(`/event/${event.id}`);
  };

  const multiplesSource = displayedUpcoming;

  const multipleBanners = useMemo(() => {
    type Pick = { event: Event; selection: string; market: string; odd: number };
    type Banner = { id: string; picks: Pick[]; totalOdd: number; legsOddStr: string };

    const normalizeOdd = (v: any) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      if (n <= 1.01) return 0;
      if (n > 200) return 0;
      return n;
    };

    const getMarkets = (ev: any) => Array.isArray(ev?.markets) ? ev.markets : [];

    const pickFromEvent = (ev: Event): Pick | null => {
      const sport = String((ev as any).sport || 'soccer');
      const markets = getMarkets(ev);

      const findMarket = (keys: string[]) => {
        for (const k of keys) {
          const hit = markets.find((m: any) => String(m?.key || '').toLowerCase() === k);
          if (hit) return hit;
        }
        return null;
      };

      const pickSelection = (market: any, pref: (s: any) => boolean): { selection: any; odd: number } | null => {
        const sels = Array.isArray(market?.selections) ? market.selections : Array.isArray(market?.outcomes) ? market.outcomes : [];
        const ranked = sels
          .map((s: any) => ({ s, odd: normalizeOdd(s?.odd ?? s?.price) }))
          .filter((x: any) => x.odd > 0);
        const preferred = ranked.filter((x: any) => pref(x.s));
        const pool = preferred.length ? preferred : ranked;
        if (!pool.length) return null;
        const best = pool.reduce((m: any, x: any) => x.odd < m.odd ? x : m, pool[0]);
        return { selection: best.s, odd: best.odd };
      };

      const homeName = String((ev as any)?.home_team || '').trim();
      const awayName = String((ev as any)?.away_team || '').trim();

      const makePick = (market: any, selection: any, odd: number): Pick | null => {
        const mkKey = String(market?.key || '').toLowerCase().trim();
        const marketName =
          (mkKey === 'h2h' || mkKey === 'moneyline' || mkKey === 'ml' || mkKey === 'winner')
            ? 'Resultado Final'
            : (String(market?.name || market?.key || '').trim() || 'Mercado');

        const rawSel = String(selection?.label || selection?.name || '').trim();
        const t = rawSel.toLowerCase();
        const selLabel =
          t === 'casa' || t === 'home'
            ? (homeName || rawSel)
            : (t === 'fora' || t === 'away'
              ? (awayName || rawSel)
              : rawSel || 'Seleção');
        if (!odd) return null;
        return { event: ev, selection: selLabel, market: marketName, odd };
      };

      if (sport === 'soccer') {
        const btts = findMarket(['btts', 'bt_ts', 'both_teams_to_score']);
        if (btts) {
          const picked = pickSelection(btts, (s) => /^(sim|yes)$/i.test(String(s?.label || s?.name || '').trim()));
          if (picked && picked.odd >= 1.35 && picked.odd <= 2.75) return makePick(btts, picked.selection, picked.odd);
        }

        const totals = markets.find((m: any) => /ou|totals|total|goals/i.test(String(m?.key || m?.name || '')));
        if (totals) {
          const picked = pickSelection(
            totals,
            (s) => {
              const t = String(s?.label || s?.name || '').toLowerCase();
              return (t.includes('2.5') || t.includes('+2.5')) && (t.includes('over') || t.includes('mais') || t.startsWith('+'));
            },
          );
          if (picked && picked.odd >= 1.15 && picked.odd <= 2.40) return makePick(totals, picked.selection, picked.odd);
        }
      }

      const h2h = findMarket(['h2h', 'moneyline', 'ml']);
      if (h2h) {
        const picked = pickSelection(h2h, (s) => {
          const t = String(s?.label || s?.name || '').toLowerCase();
          if (t.includes('empate') || t === 'x' || t === 'draw') return false;
          return true;
        });
        if (picked && picked.odd >= 1.15 && picked.odd <= 3.50) return makePick(h2h, picked.selection, picked.odd);
      }

      const homeOdd = normalizeOdd((ev as any).home_odd);
      const awayOdd = normalizeOdd((ev as any).away_odd);
      const opts = [
        { selection: homeName || 'Casa', odd: homeOdd },
        { selection: awayName || 'Fora', odd: awayOdd },
      ].filter((x) => x.odd > 0);
      if (opts.length >= 2) {
        const best = opts.reduce((m, x) => x.odd < m.odd ? x : m, opts[0]);
        return { event: ev, selection: best.selection, market: 'Resultado Final', odd: best.odd };
      }
      return null;
    };

    const candidates = multiplesSource
      .filter((e) => e && e.id != null)
      .filter((e) => String((e as any).home_team || '').trim() && String((e as any).away_team || '').trim())
      .map((e) => {
        const start = new Date((e as any).event_date || (e as any).start_time || (e as any).fixture?.date || 0).getTime();
        const sport = String((e as any).sport || 'soccer');
        return { e, start, sport };
      })
      .sort((a, b) => {
        const sa = a.sport === 'soccer' ? 0 : 1;
        const sb = b.sport === 'soccer' ? 0 : 1;
        if (sa !== sb) return sa - sb;
        return a.start - b.start;
      })
      .map((x) => x.e);

    const banners: Banner[] = [];
    let cursor = 0;

    // Strict pass: each banner = exactly 3 legs (2 low-odds + 1 high-odds).
    for (let i = 0; i < 3; i++) {
      const picks: Pick[] = [];
      const used = new Set<string | number>();
      let lowCount = 0;
      let highCount = 0;
      let guard = 0;
      while (picks.length < 3 && guard < candidates.length * 2) {
        const ev = candidates[cursor % Math.max(1, candidates.length)];
        cursor++;
        guard++;
        const key = String(ev?.id);
        if (used.has(key)) continue;
        const pick = pickFromEvent(ev);
        if (!pick) continue;

        const odd = Number(pick.odd || 0);
        const isLow = odd > 1.01 && odd < 2.0;
        const isHigh = odd >= 2.5 && odd <= 3.5;
        if (!isLow && !isHigh) continue;
        if (isLow && lowCount >= 2) continue;
        if (isHigh && highCount >= 1) continue;

        used.add(key);
        picks.push(pick);
        if (isLow) lowCount += 1;
        if (isHigh) highCount += 1;
      }
      if (picks.length === 3 && lowCount === 2 && highCount === 1) {
        const totalOdd = picks.reduce((acc, p) => acc * p.odd, 1);
        const legsOddStr = picks.map((p) => p.odd.toFixed(2)).join(' × ');
        banners.push({ id: `multi_${i}`, picks, totalOdd, legsOddStr });
      }
    }

    // Relaxed fallback: if the strict mix never materialises (e.g. no high-odds
    // leg available), still build 3-leg banners from any valid picks so the
    // "Múltiplas em destaque" carousel never disappears.
    if (banners.length === 0) {
      let fbCursor = 0;
      for (let i = 0; i < 3; i++) {
        const picks: Pick[] = [];
        const used = new Set<string | number>();
        let guard = 0;
        while (picks.length < 3 && guard < candidates.length * 2) {
          const ev = candidates[fbCursor % Math.max(1, candidates.length)];
          fbCursor++;
          guard++;
          const key = String(ev?.id);
          if (used.has(key)) continue;
          const pick = pickFromEvent(ev);
          if (!pick) continue;
          const odd = Number(pick.odd || 0);
          if (odd <= 1.01 || odd > 3.5) continue;
          used.add(key);
          picks.push(pick);
        }
        if (picks.length === 3) {
          const totalOdd = picks.reduce((acc, p) => acc * p.odd, 1);
          const legsOddStr = picks.map((p) => p.odd.toFixed(2)).join(' × ');
          banners.push({ id: `multi_fb_${i}`, picks, totalOdd, legsOddStr });
        }
      }
    }

    return banners;
  }, [multiplesSource]);

  const MultipleCarousel = ({ instanceKey }: { instanceKey: string }) => {
    const [idx, setIdx] = useState(0);
    const slides = multipleBanners.length ? multipleBanners : [];
    if (!slides.length) return null;

    const go = (next: number) => {
      const n = slides.length;
      setIdx(((next % n) + n) % n);
    };

    return (
      <div className={`rounded-xl border overflow-hidden ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-red-600 font-black">🔥</span>
            <span className="text-sm font-extrabold uppercase tracking-wider">Múltiplas em destaque</span>
          </div>
        </div>

        <div
          className="relative w-full overflow-hidden"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={(e) => {
            (e.currentTarget as any).__swipeX = e.clientX;
            (e.currentTarget as any).__swipeId = e.pointerId;
            try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch { void 0 }
          }}
          onPointerUp={(e) => {
            const startX = Number((e.currentTarget as any).__swipeX || 0);
            const dx = e.clientX - startX;
            (e.currentTarget as any).__swipeX = 0;
            try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch { void 0 }
            if (Math.abs(dx) < 40) return;
            if (dx > 0) go(idx - 1);
            else go(idx + 1);
          }}
          onPointerCancel={(e) => {
            (e.currentTarget as any).__swipeX = 0;
            try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch { void 0 }
          }}
        >
          <div
            className="flex transition-transform duration-500"
            style={{ transform: `translateX(-${idx * 100}%)` }}
          >
            {slides.map((b) => (
              <div key={`${instanceKey}_${b.id}`} className="w-full shrink-0 p-4">
                <div className={`rounded-xl border p-5 ${darkMode ? 'bg-gray-950/40 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black uppercase tracking-wider">Múltipla de 3 eventos</div>
                      <div className={`text-xs mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Odd total: {b.legsOddStr}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider opacity-70">Odds final</div>
                      <div className="text-2xl font-black text-red-600 tabular-nums">{b.totalOdd.toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3 min-h-[180px]">
                    {b.picks.map((p, i) => (
                      <div key={`${instanceKey}_${b.id}_leg_${i}`} className={`rounded-lg px-3 py-3 border ${darkMode ? 'border-gray-800 bg-gray-900/40' : 'border-gray-200 bg-white'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-black truncate">{i + 1}) {(p.event as any).home_team} vs {(p.event as any).away_team}</div>
                            <div className={`text-[11px] truncate ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{p.market} — {p.selection}</div>
                          </div>
                          <div className="text-right shrink-0">
                            {(() => {
                              const raw = (p.event as any)?.event_date || (p.event as any)?.fixture?.date;
                              const ms = raw ? new Date(raw).getTime() : 0;
                              if (!Number.isFinite(ms) || ms <= 0) return null;
                              const d = new Date(ms);
                              const pad = (n: number) => String(n).padStart(2, '0');
                              const dt = `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}h${pad(d.getMinutes())}`;
                              return <div className={`text-[10px] font-bold opacity-70 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{dt}</div>;
                            })()}
                            <div className="text-xs font-black tabular-nums">{p.odd.toFixed(2)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-xs font-bold">
                      TOTAL DA MÚLTIPLA: <span className="text-red-600">{b.totalOdd.toFixed(2)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        for (let i = 0; i < b.picks.length; i++) {
                          const p = b.picks[i];
                          addToBetSlip({
                            id: `${p.event.id}|${p.market}|${p.selection}|${instanceKey}`,
                            event_id: p.event.id,
                            match: String((p.event as any).match || `${(p.event as any).home_team} vs ${(p.event as any).away_team}`),
                            selection: p.selection,
                            market: p.market,
                            odd: p.odd,
                            stake: 0,
                            league: String((p.event as any).league || ''),
                            sport: String((p.event as any).sport || ''),
                            suspended: Boolean((p.event as any).suspended),
                            market_suspended: false,
                          });
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider"
                    >
                      Aporte agora
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 px-4 pb-3">
          {slides.map((_, i) => (
            <button
              key={`${instanceKey}_dot_${i}`}
              type="button"
              onClick={(e) => { e.stopPropagation(); go(i); }}
              className={`h-2 rounded-full transition-all ${i === idx ? 'w-6 bg-red-600' : `w-2 ${darkMode ? 'bg-gray-700' : 'bg-gray-300'}`}`}
              aria-label={`Ir para múltipla ${i + 1}`}
            />
          ))}
        </div>
      </div>
    );
  };

  const showDebug = false; // Debug disabled by user request

  // WARNING: Conditional Hook Call Fixed
  // Previous: useEffect inside conditional block if (processedLive.length > 0 ...)
  // Now: useEffect always called, logic inside
  const [hasEverHadEvents, setHasEverHadEvents] = useState(false);
  const [showIntro] = useState(false);

  useEffect(() => {
    if ((processedLive.length > 0 || upcomingEvents.length > 0) && !hasEverHadEvents) {
      setHasEverHadEvents(true);
    }
  }, [processedLive, upcomingEvents, hasEverHadEvents]);

  // Caso não apareça nada (primeira carga, sem eventos) - REMOVIDO POR SOLICITAÇÃO
  // if (!loading && !hasEverHadEvents && groupedLive.length === 0 && limitedUpcoming.length === 0) { ... }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-[#121212] text-white' : 'bg-gray-50 text-gray-900'}`}>
      {showIntro && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black">
          <div className="absolute inset-0 bg-gradient-to-b from-black via-[#0b0b10] to-black"></div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,0,60,0.10)_0%,transparent_55%)]"></div>

          <div className="relative z-10 flex flex-col items-center px-6">
            <div className="text-6xl font-extrabold tracking-[0.22em]">
              <span className="text-white">BET</span>
              <span className="text-red-600">62</span>
            </div>
            <div className="mt-5 flex items-center gap-3 text-white/70">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
              <div className="text-xs uppercase tracking-[0.25em]">Carregando</div>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {/* DEBUG PANEL */}
      {showDebug && (
        <div className="bg-red-900/80 text-white p-2 text-xs font-mono fixed bottom-0 left-0 z-50 w-full">
            DEBUG: Mode={mode} | 
            HTTP Live={httpLive.length} | 
            Processed Live={processedLive.length} | 
            Pregame Raw={pregame.length} | 
            Upcoming Cache={upcomingEvents.length} |
            Sorted Upcoming={sortedUpcoming.length} |
            Display Live={displayedLive.length} |
            Display Upcoming={displayedUpcoming.length}
        </div>
      )}

      {/* Mobile Sidebar Overlay */}

      <div className="flex items-start gap-4 w-full px-2 py-6">
        {/* Sidebar */}
        <aside className={`hidden lg:block w-72 shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto ${darkMode ? 'bg-[#0c1110] border-[#1e2d28]' : 'bg-white border-gray-200'} border-r`}>
          <div className="p-4 space-y-5">
            {/* Busca */}
            <input
              type="text"
              placeholder="Buscar jogos, ligas..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-gray-100 border-gray-300 placeholder-gray-500'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            <Sidebar dynamicTopItems={activeTopLeagues} />
          </div>
        </aside>

        {/* Mobile Sidebar */}
        {showMobileSidebar && createPortal(
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowMobileSidebar(false)} />
            <div className={`absolute left-0 top-0 bottom-0 w-80 ${darkMode ? 'bg-gray-900' : 'bg-white'} shadow-2xl overflow-y-auto`}>
              <div className="p-5 space-y-5">
                <input
                  type="text"
                  placeholder="Buscar jogos..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-300'}`}
                />
                <Sidebar dynamicTopItems={activeTopLeagues} />
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Conteúdo principal */}
        <main className="flex-1 min-w-0 space-y-8">
          {/* Banners — apenas quando NÃO está no modo Copa */}
          {showBanner && !isWorldCupMode && <BannerCarousel />}
          {showBanner && !isWorldCupMode && <WorldCupBanner variant="compact" />}

          {/* Cabeçalho Copa do Mundo inline */}
          {isWorldCupMode && (
            <div className="space-y-4">
              <WorldCupBanner variant="compact" />
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🏆</span>
                  <h2
                    className="text-xl font-black uppercase tracking-wide"
                    style={{
                      background: 'linear-gradient(90deg, #ffd040, #f5a623)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    Copa do Mundo 2026
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/10"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Fechar
                </button>
              </div>
            </div>
          )}

          {/* Eventos */}
          <section id="events">
            {!isWorldCupMode && (
            <div className="flex items-center gap-3 mb-5">
              {mode === 'live' ? (
                <>
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-red-600"></span>
                  </span>
                  <h2 className="text-2xl font-bold uppercase tracking-wide text-red-500">Ao Vivo</h2>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold uppercase tracking-wide">Pré-Jogos</h2>
                </>
              )}
            </div>
            )}

            {!revealed ? (
              <div className="text-center py-20">
                <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-gray-500">Carregando eventos...</p>
              </div>
            ) : (groupedLive.length > 0 || limitedUpcoming.length > 0 || limitedNext7.length > 0) ? (
              <div className="space-y-12 events-reveal">
                {/* LIVE SECTION — shown only in mode='live' */}
                {groupedLive.length > 0 && (
                  <div className="space-y-6">
                     <div className="space-y-8">
                        {(() => {
                          let globalIdx = 0;
                          return groupedLive.map(([league, events]) => (
                            <div key={`live-${league}`} className="space-y-4">
                            <div className={`px-5 py-3 rounded-xl font-bold text-sm uppercase tracking-wider flex items-center gap-4 ${darkMode ? 'bg-red-900/20 border border-red-900/50 text-red-100' : 'bg-red-50 border border-red-100 text-red-800'}`}>
                              {(() => {
                                const firstEvent = events[0] || {};
                                const leagueObj = firstEvent.league as any;
                                const leagueNameRaw = (typeof leagueObj === 'string' ? leagueObj : leagueObj?.name) || league;
                                const countryRaw = firstEvent.country || '';
                                const sport = firstEvent.sport || 'soccer';
                                const icon = getSportIcon(sport);
                                
                                const displayText = (countryRaw && leagueNameRaw && countryRaw !== leagueNameRaw) 
                                  ? `${countryRaw} - ${leagueNameRaw}` 
                                  : (leagueNameRaw || countryRaw || 'Unknown League');

                                return (
                                  <>
                                    <img src={icon} alt={sport} className="w-7 h-7 object-contain" />
                                    <span>{displayText}</span>
                                  </>
                                );
                              })()}
                            </div>
                            <div className="flex flex-col gap-4">
                              {(() => {
                                const out: any[] = [];
                                for (const ev of events) {
                                  out.push(
                                    <EventCard
                                      key={mergeKeyOf(ev)}
                                      event={ev}
                                      onOpenEvent={() => handleOpenEvent(ev)}
                                    />,
                                  );
                                  globalIdx++;
                                }
                                return out;
                              })()}
                            </div>
                            </div>
                          ));
                        })()}
                     </div>
                  </div>
                )}

                {limitedNext7.length > 0 && (
                  <div className="space-y-6">
                     {groupedLive.length > 0 && (
                        <div className="flex items-center gap-3 px-2 pt-4 border-t border-gray-700/50">
                           <h2 className="text-xl font-bold uppercase tracking-wide">Próximos 7 dias</h2>
                        </div>
                     )}
                     <div className="space-y-8">
                        {(() => {
                          return limitedNext7.map(([league, events]) => (
                            <div key={`next7-${league}`} className="space-y-4">
                            <div className={`px-5 py-3 rounded-xl font-bold text-sm uppercase tracking-wider flex items-center gap-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>
                              {(() => {
                                const firstEvent = events[0] || {};
                                const leagueObj = (firstEvent as any).league as any;
                                const leagueNameRaw = (typeof leagueObj === 'string' ? leagueObj : leagueObj?.name) || league;
                                const countryRaw = (firstEvent as any).country || '';
                                const sport = (firstEvent as any).sport || 'soccer';
                                const icon = getSportIcon(sport);
                                
                                const displayText = (countryRaw && leagueNameRaw && countryRaw !== leagueNameRaw) 
                                  ? `${countryRaw} - ${leagueNameRaw}` 
                                  : (leagueNameRaw || countryRaw || 'Unknown League');

                                return (
                                  <>
                                    <img src={icon} alt={sport} className="w-7 h-7 object-contain" />
                                    <span>{displayText}</span>
                                  </>
                                );
                              })()}
                            </div>
                            <div className="flex flex-col gap-4">
                              {(() => {
                                const out: any[] = [];
                                for (const ev of events) {
                                  out.push(
                                    <EventCard
                                      key={`next7_${mergeKeyOf(ev)}`}
                                      event={ev}
                                      onOpenEvent={() => handleOpenEvent(ev)}
                                    />,
                                  );
                                }
                                return out;
                              })()}
                            </div>
                            </div>
                          ));
                        })()}
                     </div>
                  </div>
                )}

                {/* UPCOMING SECTION */}
                {limitedUpcoming.length > 0 && (
                  <div className="space-y-6">
                     {groupedLive.length > 0 && (
                        <div className="flex items-center gap-3 px-2 pt-4 border-t border-gray-700/50">
                           <h2 className="text-xl font-bold uppercase tracking-wide">Próximos Jogos</h2>
                        </div>
                     )}
                     
                     <div className="space-y-8">
                        {(() => {
                          let globalIdx = 0;
                          let inserted = false;
                          return limitedUpcoming.map(([league, events]) => (
                            <div key={`pre-${league}`} className="space-y-4">
                            <div className={`px-5 py-3 rounded-xl font-bold text-sm uppercase tracking-wider flex items-center gap-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>
                              {(() => {
                                const firstEvent = events[0] || {};
                                const sport = firstEvent.sport || 'soccer';
                                const icon = getSportIcon(sport);
                                if (upcomingIsFeatured) {
                                  return (
                                    <>
                                      <img src={icon} alt={sport} className="w-7 h-7 object-contain" />
                                      <span>{league}</span>
                                    </>
                                  );
                                }

                                const leagueObj = firstEvent.league as any;
                                const leagueNameRaw = (typeof leagueObj === 'string' ? leagueObj : leagueObj?.name) || league;
                                const countryRaw = firstEvent.country || '';
                                const displayText = (countryRaw && leagueNameRaw && countryRaw !== leagueNameRaw) 
                                  ? `${countryRaw} - ${leagueNameRaw}` 
                                  : (leagueNameRaw || countryRaw || 'Unknown League');

                                return (
                                  <>
                                    <img src={icon} alt={sport} className="w-7 h-7 object-contain" />
                                    <span>{displayText}</span>
                                  </>
                                );
                              })()}
                            </div>
                            <div className="flex flex-col gap-4">
                              {(() => {
                                const out: any[] = [];
                                for (const ev of events) {
                                  out.push(
                                    <EventCard
                                      key={mergeKeyOf(ev)}
                                      event={ev}
                                      onOpenEvent={() => handleOpenEvent(ev)}
                                    />,
                                  );
                                  globalIdx++;
                                  if (mode === 'home' && !inserted && globalIdx === 2) {
                                    inserted = true;
                                    out.push(<MultipleCarousel key="pre_multi_once" instanceKey="pre_once" />);
                                  }
                                }
                                return out;
                              })()}
                            </div>
                            </div>
                          ));
                        })()}
                     </div>
                  </div>
                )}
              </div>
            ) : noSearchResults ? (
              <div className="text-center py-12 rounded-xl border border-gray-800 bg-gray-900/30">
                <p className="text-gray-300">Sem resultados para a busca.</p>
                <button
                  onClick={() => setQuery('')}
                  className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium"
                >
                  Limpar busca
                </button>
              </div>
            ) : null}
          </section>
        </main>

        {/* BetSlip lateral */}
        <aside className={`hidden xl:block w-96 shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto ${darkMode ? 'bg-[#0c1110] border-[#1e2d28]' : 'bg-white border-gray-200'} border-l`}>
          <div className="p-5">
            <BetSlip />
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Home;

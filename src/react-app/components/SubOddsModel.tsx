import { useMemo, memo, useState, useEffect, useRef } from 'react'
import { fairOddsTwoWay, formatFairOdd } from '@/shared/fairOdds'
import { OddButton } from './OddButton'
import { useMarketSignals } from '../hooks/useMarketSignals'
import { 
  MARKET_CONFIG, 
  MARKET_GROUPS, 
  BASKETBALL_GROUPS, 
  TENNIS_GROUPS, 
  VOLLEYBALL_GROUPS, 
  AFL_GROUPS, 
  BASEBALL_GROUPS, 
  FORMULA1_GROUPS, 
  AMERICAN_FOOTBALL_GROUPS, 
  HANDBALL_GROUPS, 
  ICE_HOCKEY_GROUPS, 
  MMA_GROUPS, 
  RUGBY_GROUPS 
} from '../constants/marketConfig'

export interface MarketItem {
  label: string
  odd: number
  selection?: string
  name?: string
  header?: string
  handicap?: string
}

export interface Markets {
  [key: string]: MarketItem[]
}

// Single odd row: label outside (left), red button (right)
const OddRow = memo(({ item, onSelect, suspended, compact }: {
  item: MarketItem
  onSelect: (label: string, odd: number) => void
  suspended?: string
  compact?: boolean
}) => {
  const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable');
  const prevRef = useRef(Number(item.odd));

  const val = Number(item.odd);
  const isSusp = !!suspended;
  const priceStr = val > 0 ? val.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--';

  if (val !== prevRef.current) {
    setTrend(val > prevRef.current ? 'up' : 'down');
    prevRef.current = val;
  }

  useEffect(() => {
    if (trend !== 'stable') {
      const t = setTimeout(() => setTrend('stable'), 5000);
      return () => clearTimeout(t);
    }
  }, [trend]);

  return (
    <div className={`flex items-center justify-between gap-2 w-full ${compact ? 'py-1' : 'py-1.5'}`}>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate leading-tight">
        {item.label}
      </span>
      <div className="relative flex-shrink-0">
        <button
          onClick={isSusp ? undefined : () => onSelect(String(item.selection || item.label), val)}
          disabled={isSusp}
          className={`
            min-w-[72px] md:min-w-[80px] h-11 px-3 rounded-lg font-bold text-sm tabular-nums
            transition-all duration-200 flex items-center justify-center gap-1
            ${isSusp
              ? 'bg-gray-600/40 text-gray-400 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-500 active:scale-95 shadow-sm'
            }
            ${trend === 'up' ? 'ring-2 ring-green-400' : trend === 'down' ? 'ring-2 ring-gray-400' : ''}
          `}
        >
          {!isSusp && trend === 'up' && <span className="text-green-300 text-[10px]">▲</span>}
          {!isSusp && trend === 'down' && <span className="text-gray-300 text-[10px]">▼</span>}
          {isSusp
            ? <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            : <span className={trend === 'up' ? 'text-green-200' : trend === 'down' ? 'text-gray-300' : 'text-white'}>
                {priceStr}
              </span>
          }
        </button>
        {isSusp && suspended && suspended !== 'EVENT_FROZEN' && (
          <div className="absolute -top-2 right-0 z-20 pointer-events-none">
            <span className={`text-[9px] px-1.5 py-0.5 rounded shadow-sm font-bold uppercase tracking-wider whitespace-nowrap
              ${suspended === 'GOAL' ? 'bg-red-600/90 text-white' :
                suspended === 'VAR' ? 'bg-yellow-600/90 text-white' :
                suspended === 'CARD' ? 'bg-orange-600/90 text-white' :
                suspended === 'CHANCE' ? 'bg-rose-600/90 text-white' :
                suspended === 'PENALTY' ? 'bg-orange-600/90 text-white' :
                'bg-gray-600/90 text-gray-200'}`}
            >
              {suspended === 'GOAL' ? 'GOL' : suspended === 'VAR' ? 'VAR' : suspended === 'CARD' ? 'CARTÃO' : suspended === 'CHANCE' ? 'CHANCE' : suspended === 'PENALTY' ? 'PÊNALTI' : suspended}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

// MarketCard wrapper
const MarketCard = memo(({ title, darkMode, children, noPad }: {
  title: string
  darkMode: boolean
  children: React.ReactNode
  noPad?: boolean
}) => (
  <div className={`rounded-xl border ${darkMode ? 'bg-gray-900/50 border-gray-700' : 'bg-white border-gray-200'} overflow-hidden`}>
    <div className={`flex items-center gap-1.5 px-3 py-2.5 border-b ${darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'}`}>
      <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</span>
      <span className="text-gray-400 text-sm cursor-help" title="Informação sobre este mercado">ⓘ</span>
    </div>
    <div className={noPad ? '' : 'px-3 py-2'}>
      {children}
    </div>
  </div>
));

// Button group with pagination — uses OddRow layout
const MarketButtonGroup = memo(({ items, onSelect, suspendedReason, columns, darkMode }: {
  items: MarketItem[]
  onSelect: (label: string, odd: number) => void
  suspendedReason?: string
  columns?: number
  darkMode?: boolean
}) => {
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 6;
  const isLong = items.length > LIMIT + 2;
  const display = isLong && !showAll ? items.slice(0, LIMIT) : items;

  if (columns === 2 && display.length <= 4) {
    return (
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-2 gap-x-3 gap-y-0">
          {display.map((it, idx) => (
            <OddRow key={`${it.label}-${idx}`} item={it} onSelect={onSelect} suspended={suspendedReason} />
          ))}
        </div>
        {isLong && (
          <button onClick={() => setShowAll(!showAll)} className="self-center text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 py-1.5 px-4 bg-gray-100 dark:bg-gray-800 rounded-full transition-colors mt-1">
            {showAll ? 'Mostrar Menos' : `Mostrar Mais (${items.length - LIMIT})`}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {display.map((it, idx) => (
        <div key={`${it.label}-${idx}`}>
          {idx > 0 && <div className={`h-px ${darkMode ? 'bg-gray-700/50' : 'bg-gray-100'}`} />}
          <OddRow item={it} onSelect={onSelect} suspended={suspendedReason} />
        </div>
      ))}
      {isLong && (
        <button onClick={() => setShowAll(!showAll)} className="self-center text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 py-1.5 px-4 bg-gray-100 dark:bg-gray-800 rounded-full transition-colors mt-2">
          {showAll ? 'Mostrar Menos' : `Mostrar Mais (${items.length - LIMIT})`}
        </button>
      )}
    </div>
  );
});

export function SubOddsModel({
  event,
  darkMode,
  markets,
  eventOdds,
  onSelect,
  labelOutcome,
  applyMarginClamp,
  suspendedMarkets,
  liveEvents,
  liveTimer,
  isLive,
}: {
  event: any
  darkMode: boolean
  markets: Markets | null
  eventOdds: Record<string, any[]> | null
  onSelect: (label: string, odd: number) => void
  labelOutcome: (market: string, name: string) => string
  applyMarginClamp: (mk: string, v: number) => number
  suspendedMarkets?: { eventId: number; marketId: string; reason: string }[]
  liveEvents?: any[]
  liveTimer?: string
  isLive?: boolean
}) {
  const home = useMemo(() => String(event?.home_team || (event?.match || '').split(' vs ')[0] || ''), [event])
  const away = useMemo(() => String(event?.away_team || (event?.match || '').split(' vs ')[1] || ''), [event])
  const isGlobalSuspended = (event as any)?.oddsFrozen || (event as any)?.suspended || false;

  const suspendedMap = useMemo(() => {
    const m = new Map<string, string>();
    if (suspendedMarkets) {
      for (const s of suspendedMarkets) {
        m.set(s.marketId, s.reason);
      }
    }
    return m;
  }, [suspendedMarkets]);

  const signalsEventId =
    (event as any)?.id ??
    (event as any)?.fixture?.id ??
    (event as any)?.match_id ??
    (event as any)?.external_event_id ??
    null

  const marketSignals = useMarketSignals({
    eventId: signalsEventId,
    sport: (event as any)?.sport,
    isLive: !!isLive,
  })

  const apiCritState = useMemo(() => {
    if (marketSignals.varActive) return 'var_review' as const
    const c = marketSignals.cta
    if (c === 'idle') return 'idle' as const
    return c as any
  }, [marketSignals.cta, marketSignals.varActive])

  const getSuspendedReason = (marketKey?: string) => {
    if (isGlobalSuspended) return 'EVENT_FROZEN';
    const effective = apiCritState !== 'idle' ? apiCritState : critState
    if (effective !== 'idle') {
      if (effective === 'var_review' || effective === 'var_penalty') return 'VAR';
      if (effective === 'goal') return 'GOAL';
      if (effective === 'big_chance') return 'CHANCE';
      if (effective === 'penalty') return 'PENALTY';
      if (effective === 'cards') return 'CARD';
    }
    return marketKey ? suspendedMap.get(marketKey) : undefined;
  };

  const toBadgeReason = (susp?: string) => {
    if (!susp || susp === 'EVENT_FROZEN') return 'SUSPENSO'
    if (susp === 'VAR') return 'VAR'
    if (susp === 'GOAL') return 'GOAL'
    if (susp === 'CHANCE') return 'CHANCE'
    if (susp === 'PENALTY') return 'PENALTY'
    if (susp === 'CARD') return 'CARD'
    return 'SUSPENSO'
  }

  // Current live score — used to block impossible correct-score outcomes
  const currentGoals = useMemo(() => {
    const goals = (event as any)?.goals;
    if (!goals) return null;
    const g = typeof goals === 'string' ? (() => { try { return JSON.parse(goals); } catch { return null; } })() : goals;
    if (!g) return null;
    const h = Number(g.home ?? 0); const a = Number(g.away ?? 0);
    return (h > 0 || a > 0) ? { home: h, away: a } : null;
  }, [event]);

  // --- Lógica de Odds Principais ---
  const h2hInternalItems = useMemo(() => {
    const raw =
      (eventOdds && (eventOdds as any)['h2h']) ||
      (eventOdds && (eventOdds as any)['h2h_3_way']) ||
      (eventOdds && (eventOdds as any)['main']) ||
      (eventOdds && (eventOdds as any)['1x2']) ||
      (eventOdds && (eventOdds as any)['match_winner']);
    const list = Array.isArray(raw) ? raw : (raw?.outcomes || raw?.values || []);
    const isSuspended = raw?.suspended === true || raw?.status === 'suspended';

    const sportKey = String((event as any)?.sport || '').toLowerCase();
    const isSoccer = sportKey === 'soccer' || (sportKey.includes('football') && !sportKey.includes('american'));
    const homeTeam = (() => {
      const a = String((event as any)?.home_team || '').trim();
      if (a) return a;
      const b = String((event as any)?.teams?.home?.name || '').trim();
      if (b) return b;
      const c = String((event as any)?.home?.name || '').trim();
      if (c) return c;
      const m = String((event as any)?.match || '').split(' vs ');
      return String(m?.[0] || '').trim();
    })();
    const awayTeam = (() => {
      const a = String((event as any)?.away_team || '').trim();
      if (a) return a;
      const b = String((event as any)?.teams?.away?.name || '').trim();
      if (b) return b;
      const c = String((event as any)?.away?.name || '').trim();
      if (c) return c;
      const m = String((event as any)?.match || '').split(' vs ');
      return String(m?.[1] || '').trim();
    })();
    const homeName = homeTeam.toLowerCase().trim();
    const awayName = awayTeam.toLowerCase().trim();

    const norm = (v: any) =>
      String(v ?? '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');

    const soccerType = (o: any): 'home' | 'draw' | 'away' | '' => {
      const rawName = norm(o?.label || o?.outcome || o?.name || o?.value || '');
      const rawSel = norm(o?.selection || o?.id || o?.key || o?.side || '');
      const s = norm(`${rawSel} ${rawName}`.trim());
      if (!s) return '';
      if (s === 'x' || s.includes(' draw') || s === 'draw' || s.includes(' empate') || s === 'empate' || s.includes(' tie') || s === 'tie') return 'draw';
      if (s === '1' || s.includes(' home') || s === 'home' || s.includes(' casa') || s === 'casa' || s.includes(' mandante') || s === 'mandante') return 'home';
      if (s === '2' || s.includes(' away') || s === 'away' || s.includes(' fora') || s === 'fora' || s.includes(' visitante') || s === 'visitante') return 'away';
      if (homeName && (s.includes(homeName) || homeName.includes(s))) return 'home';
      if (awayName && (s.includes(awayName) || awayName.includes(s))) return 'away';
      return '';
    };
    
    const mapped = list.map((o: any) => {
      const v0 = Number(o?.odd || 0)
      const v = applyMarginClamp('h2h', v0)
      const rawName = String(o?.label || o?.outcome || o?.name || o?.value || '')
      const t = isSoccer ? soccerType(o) : ''
      const lbl = isSoccer
        ? (t === 'home' ? (homeTeam || 'Casa') : t === 'draw' ? 'Empate' : t === 'away' ? (awayTeam || 'Fora') : labelOutcome('h2h', rawName))
        : labelOutcome('h2h', rawName)
      const key = isSoccer && t ? t : lbl
      const slot = isSoccer ? (t === 'home' ? 0 : t === 'draw' ? 1 : t === 'away' ? 2 : 9) : 9
      return { label: lbl, odd: v, selection: lbl, name: key, header: String(slot) } as MarketItem
    }).filter((x: MarketItem) => (isSuspended && x.label) || (x.label && x.odd > 0))
    
    const by = new Map<string, MarketItem>();
    for (const it of mapped) {
       const key = String(it.name || it.label || '');
       const prev = by.get(key);
       if (!prev || it.odd > prev.odd) by.set(key, it);
    }
    const deduped = Array.from(by.values());
    const getSlot = (it: MarketItem) => {
      const n = Number((it as any)?.header ?? 9);
      return Number.isFinite(n) ? n : 9;
    };
    return deduped
      .map((it) => ({ ...it, header: undefined }))
      .sort((a, b) => getSlot(a) - getSlot(b))
  }, [event, eventOdds, applyMarginClamp, labelOutcome])

  const resultadoRegulamentar = useMemo(() => {
     if (h2hInternalItems.length > 0) return h2hInternalItems;
     const h0 = Number(event?.home_odd || 0)
     const d0 = Number(event?.draw_odd || 0)
     const a0 = Number(event?.away_odd || 0)
     const items: MarketItem[] = []
     if (h0 > 0) items.push({ label: 'Casa', odd: h0 })
     if (d0 > 0) items.push({ label: 'Empate', odd: d0 })
     if (a0 > 0) items.push({ label: 'Fora', odd: a0 })
     if (items.length > 0) return items

     const sport = String(event?.sport || '').toLowerCase();
     if (sport === 'soccer' || (sport.includes('football') && !sport.includes('american'))) {
       return [
         { label: 'Casa', odd: 0 },
         { label: 'Empate', odd: 0 },
         { label: 'Fora', odd: 0 },
       ] as MarketItem[];
     }

     return [] as MarketItem[]
  }, [event, h2hInternalItems])

  const doubleChanceItems = useMemo(() => {
    const raw = (eventOdds && (eventOdds as any)['double_chance']);
    const list = Array.isArray(raw) ? raw : (raw?.outcomes || raw?.values || []);
    const isSuspended = raw?.suspended === true || raw?.status === 'suspended';

    const mapped = list.map((o: any) => {
      const v0 = Number(o?.value || o?.odd || 0)
      const v = applyMarginClamp('double_chance', v0)
      const lbl = labelOutcome('double_chance', String(o?.outcome || o?.name || ''))
      return { label: lbl, odd: v } as MarketItem
    }).filter((x: MarketItem) => (isSuspended && x.label) || (x.label && x.odd > 0))
    if (mapped.length > 0) return mapped
    
    const base = resultadoRegulamentar
    if (!base || base.length < 2) return []
    const inv = base.map((it) => { const o = Number(it.odd || 0); return (o > 0) ? (1 / o) : 0 })
    const sum = inv.reduce((x, y) => x + y, 0) || 1
    const pHome = (inv[0] || 0) / sum
    const pDraw = (inv[1] || 0) / sum
    const pAway = (inv[2] || 0) / sum
    const oneX = applyMarginClamp('double_chance', pHome + pDraw > 0 ? (1 / (pHome + pDraw)) : 0)
    const xTwo = applyMarginClamp('double_chance', pAway + pDraw > 0 ? (1 / (pAway + pDraw)) : 0)
    const oneTwo = applyMarginClamp('double_chance', pHome + pAway > 0 ? (1 / (pHome + pAway)) : 0)
    const out: MarketItem[] = []
    if (oneX > 0) out.push({ label: '1X', odd: oneX })
    if (xTwo > 0) out.push({ label: 'X2', odd: xTwo })
    if (oneTwo > 0) out.push({ label: '12', odd: oneTwo })
    return out
  }, [eventOdds, applyMarginClamp, labelOutcome, resultadoRegulamentar])

  // --- Generic extraction ---
  const normalizedMarkets = useMemo(() => {
      const mk: any = markets as any;
      if (!mk) return null;
      if (typeof mk === 'string') {
        const t = mk.trim();
        if (!t || t === '{}' || t === 'null') return null;
        try {
          const o = JSON.parse(t);
          return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
        } catch {
          return null;
        }
      }
      return mk && typeof mk === 'object' && !Array.isArray(mk) ? mk : null;
  }, [markets]);

  const getMarketItems = (key: string, labelKey?: string) => {
      if (normalizedMarkets) {
        if ((normalizedMarkets as any)[key] && (normalizedMarkets as any)[key]!.length > 0) return (normalizedMarkets as any)[key]!;
        if (key === 'spreads' && (normalizedMarkets as any)['handicap'] && (normalizedMarkets as any)['handicap']!.length > 0) {
          return (normalizedMarkets as any)['handicap']!;
        }
      }

      let raw = (eventOdds && (eventOdds as any)[key]);
      if ((!raw || (Array.isArray(raw) && raw.length === 0)) && key === 'spreads') {
        raw = (eventOdds && (eventOdds as any)['handicap']);
      }
      if ((!raw || (Array.isArray(raw) && raw.length === 0)) && key === 'handicap') {
        raw = (eventOdds && (eventOdds as any)['spreads']);
      }
      const list = Array.isArray(raw) ? raw : (raw?.outcomes || raw?.values || []);
      const isSuspended = raw?.suspended === true || raw?.status === 'suspended';

      const mapped = list.map((o: any) => {
        const v0 = Number(o?.odd || 0)
        const v = applyMarginClamp(key, v0)
        const rawName = o?.label || o?.outcome || o?.name || o?.value || ''
        const lbl = labelOutcome(labelKey || key, String(rawName))
        const hcRaw = o?.point ?? o?.handicap ?? o?.line ?? o?.total ?? o?.spread ?? null
        const hc = hcRaw === null || hcRaw === undefined ? undefined : String(hcRaw)
        return { label: lbl, odd: v, name: String(rawName), handicap: hc } as MarketItem
      }).filter((x: MarketItem) => (isSuspended && x.label) || (x.label && x.odd > 1.01 && x.odd < 25))
      const n = (s: any) => {
        if (s === null || s === undefined) return NaN
        const x = String(s).trim().replace(',', '.')
        const v = parseFloat(x)
        return Number.isFinite(v) ? v : NaN
      }
      return mapped.sort((a: MarketItem, b: MarketItem) => {
        const ap = n(a.handicap)
        const bp = n(b.handicap)
        if (Number.isFinite(ap) && Number.isFinite(bp) && ap !== bp) return ap - bp
        return Number(a.odd) - Number(b.odd)
      });
  }

  const getMarketTitle = (key: string, sport?: string) => {
      const periodKey = /^period_(\d)_(h2h|totals)$/.exec(key);
      if (periodKey) {
        const n = Number(periodKey[1]);
        const kind = periodKey[2];
        if (n >= 1 && n <= 3) {
          if (kind === 'h2h') return `${n}º Período - Vencedor`;
          if (kind === 'totals') return `${n}º Período - Totais`;
        }
      }

      if (key === 'h2h') {
          const s = (sport || '').toLowerCase();
          if (s.includes('rugby') || s.includes('union') || s.includes('league')) return 'Vencedor da Partida';
          if (s.includes('tennis') || s.includes('tênis')) return 'Vencedor da Partida';
          if (s.includes('basketball') || s.includes('basquete')) return 'Vencedor';
          if (s.includes('mma') || s.includes('ufc') || s.includes('mixed martial arts') || s.includes('luta')) return 'Vencedor da Luta';
          return MARKET_CONFIG['h2h']?.title || 'Resultado Final';
      }

      const raw = (eventOdds && (eventOdds as any)[key]);
      if (raw && raw.sub_category) return raw.sub_category;
      if (key === 'totals') {
          const s = (sport || '').toLowerCase();
          if (s.includes('tennis') || s.includes('tênis')) return 'Total de Games na Partida';
          if (s.includes('basketball') || s.includes('basquete')) return 'Total de Pontos';
          if (s.includes('ice-hockey') || s.includes('hockey') || s.includes('hóquei')) return 'Total de Golos';
      }
      if (key === 'spreads') {
          const s = (sport || '').toLowerCase();
          if (s.includes('basketball') || s.includes('basquete')) return 'Handicap de Pontos';
          if (s.includes('american') || s.includes('nfl') || s.includes('football')) return 'Handicap';
          if (s.includes('baseball') || s.includes('mlb')) return 'Linha de Corrida';
      }
      return MARKET_CONFIG[key]?.title || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  const totalsItems = useMemo(() => getMarketItems('totals'), [eventOdds, markets, normalizedMarkets])
  const bttsItems = useMemo(() => {
    const raw = getMarketItems('btts')
    // 1) If API returned BTTS, force order: "Não" (esquerdo) → "Sim" (direito)
    if (raw.length > 0) {
      const nao = raw.find((x: MarketItem) => /n[aã]o/i.test(String(x.label)))
      const sim = raw.find((x: MarketItem) => /sim|yes/i.test(String(x.label)))
      const ordered: MarketItem[] = []
      if (nao) ordered.push({ ...nao, label: 'Não' })
      if (sim) ordered.push({ ...sim, label: 'Sim' })
      if (ordered.length === 2) return ordered
      return raw
    }
    // 2) Fallback — Calcular BTTS via fórmula P(BTTS) = P(A marca) × P(B marca)
    //    Usando Poisson com gols esperados derivados de h2h + totals (over 2.5)
    const base = resultadoRegulamentar
    if (!base || base.length < 2) return []
    const h0 = Number(base.find(b => /casa|home/i.test(b.label))?.odd || 0)
    const d0 = Number(base.find(b => /empate|draw/i.test(b.label))?.odd || 0)
    const a0 = Number(base.find(b => /fora|away/i.test(b.label))?.odd || 0)
    if (h0 <= 1 || a0 <= 1) return []

    // Probabilidades implícitas normalizadas (remove margem)
    const inv = [1 / h0, d0 > 1 ? 1 / d0 : 0, 1 / a0]
    const sum = inv.reduce((x, y) => x + y, 0) || 1
    const pH = inv[0] / sum
    const pA = inv[2] / sum

    // Estimativa de λ total: usa over 2.5 se disponível, senão 2.6 (média futebol)
    let lambdaTotal = 2.6
    const o25 = totalsItems.find((t: MarketItem) => /2[.,]5/.test(String(t.label)) && /acima|over|mais/i.test(String(t.label)))
    if (o25 && Number(o25.odd) > 1.01) {
      const pOver25 = 1 / Number(o25.odd)
      // Mapeamento aproximado P(over 2.5) → λ via Poisson invertida (tabela)
      if (pOver25 > 0.70) lambdaTotal = 3.4
      else if (pOver25 > 0.60) lambdaTotal = 3.0
      else if (pOver25 > 0.50) lambdaTotal = 2.7
      else if (pOver25 > 0.40) lambdaTotal = 2.4
      else if (pOver25 > 0.30) lambdaTotal = 2.1
      else lambdaTotal = 1.8
    }

    // Distribui λ entre casa e fora baseado na força relativa (h2h)
    const ratio = (pH + 0.5 * (1 - pH - pA)) / Math.max(0.1, (pH + pA + (1 - pH - pA)))
    const lambdaHome = lambdaTotal * Math.max(0.35, Math.min(0.65, ratio))
    const lambdaAway = lambdaTotal - lambdaHome

    // P(time marca) = 1 - e^(-λ) (Poisson: prob de >= 1 gol)
    const pHomeScores = 1 - Math.exp(-lambdaHome)
    const pAwayScores = 1 - Math.exp(-lambdaAway)

    // P(BTTS) = P(A marca) × P(B marca)
    const pBTTS = pHomeScores * pAwayScores
    if (pBTTS <= 0.05 || pBTTS >= 0.95) return []

    // Aplica margem de 5% (típico de bookmaker conservador)
    const MARGIN = 1.05
    const oddSim = (1 / pBTTS) / MARGIN
    const oddNao = (1 / (1 - pBTTS)) / MARGIN

    if (oddSim < 1.05 || oddSim > 20 || oddNao < 1.05 || oddNao > 20) return []

    return [
      { label: 'Não', odd: Math.round(oddNao * 100) / 100 },
      { label: 'Sim', odd: Math.round(oddSim * 100) / 100 },
    ] as MarketItem[]
  }, [eventOdds, markets, normalizedMarkets, resultadoRegulamentar, totalsItems])

  // ─────────────────────────────────────────────────────────────────────
  // CRITICAL EVENT STATE MACHINE — replaces 1X2 buttons during key moments
  // ─────────────────────────────────────────────────────────────────────
  type CritState = 'idle' | 'big_chance' | 'var_review' | 'var_penalty' | 'goal' | 'penalty' | 'cards';
  const [critState, setCritState] = useState<CritState>('idle');
  const lastEventIdRef = useRef<string>('');

  // Watch live events and trigger critical state on goal/var/big-chance/penalty
  useEffect(() => {
    if (!isLive || !Array.isArray(liveEvents) || liveEvents.length === 0) return;
    const sp = String((event as any)?.sport || '').toLowerCase()
    const allow = sp.includes('soccer') || (sp.includes('football') && !sp.includes('american')) || sp.includes('futebol')
    if (!allow) return
    const latest = liveEvents[liveEvents.length - 1];
    if (!latest) return;
    const id = `${latest?.timer || latest?.minute || latest?.time?.elapsed || ''}|${latest?.type || ''}|${latest?.detail || ''}|${latest?.player?.name || latest?.player || ''}`;
    if (id === lastEventIdRef.current) return;
    lastEventIdRef.current = id;

    const text = `${latest?.type || ''} ${latest?.detail || ''} ${latest?.text || ''} ${latest?.comments || ''}`.toLowerCase();
    let next: CritState | null = null;
    // Order matters: most-specific first
    if (/(var.*pen|pen.*var|p[eê]nalti.*confirmad|penalty.*confirmed)/.test(text)) next = 'var_penalty';
    else if (/\bvar\b|video.*assist|review/.test(text)) next = 'var_review';
    else if (/\b(goal|gol)\b/.test(text) && !/disallow|cancel|anulad|missed|own/.test(text)) next = 'goal';
    else if (/pen[aâ]lti|penalty/.test(text)) next = 'penalty';
    else if (/cart[aã]o|card|yellow|red/.test(text)) next = 'cards';
    else if (/big.*chance|grande.*chance|great.*chance|big_chance|gc\b/.test(text)) next = 'big_chance';

    if (next) {
      setCritState(next);
      // Phase duration: goal is most prominent
      const dur = next === 'goal' ? 12000 : next === 'var_penalty' ? 10000 : 8000;
      const t = setTimeout(() => setCritState('idle'), dur);
      return () => clearTimeout(t);
    }
  }, [liveEvents, isLive]);

  const apostaJaActive = useMemo(() => {
    if (!isLive) return false;
    const sportKey = String((event as any)?.sport || '').toLowerCase();
    const isSoccer = sportKey === 'soccer' || (sportKey.includes('football') && !sportKey.includes('american'));
    if (!isSoccer) return false;
    let h = 0, a = 0;
    const goals = (event as any)?.goals;
    if (goals && typeof goals === 'object') {
      h = Number(goals.home ?? goals.localteam_score ?? 0);
      a = Number(goals.away ?? goals.visitorteam_score ?? 0);
    } else if (typeof goals === 'string') {
      try { const g = JSON.parse(goals); h = Number(g.home || 0); a = Number(g.away || 0); } catch { h = 0; a = 0; }
    }
    const diff = Math.abs(h - a);
    const minute = parseInt(String(liveTimer || '').replace(/[^\d]/g, ''), 10) || 0;
    const fav = resultadoRegulamentar
      .map((x) => Number(x.odd))
      .filter((x) => Number.isFinite(x) && x > 1)
      .reduce((m, x) => (x < m ? x : m), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(fav)) return false;
    if (fav <= 1.2) return true;
    if (minute >= 75 && diff >= 2 && fav <= 1.35) return true;
    return false;
  }, [isLive, event, liveTimer, resultadoRegulamentar]);

  // --- Render each market as a card ---
  const renderMarketContent = (key: string) => {
      if (key !== 'h2h' && ['h2h_3_way', '1x2', 'main', 'match_winner'].includes(key)) {
          if (resultadoRegulamentar.length > 0) return null;
      }

      // H2H — 3-column side-by-side layout (Casa | Empate | Fora)
      // Replaced by single full-width button when:
      //   • critical event detected (goal/var/big_chance/var_penalty)
      //   • match decided ("Aposta Já": odd≤1.01, 2-0 at 80', or 3+ goal diff)
      if (key === 'h2h') {
          if (resultadoRegulamentar.length === 0) return null;
          const title = getMarketTitle('h2h', event?.sport);
          const susp = getSuspendedReason('h2h');
          const isSusp = !!susp;

          // ── "Aposta Já" mode (single big red button) ──────────────────
          if (apostaJaActive && !isSusp) {
            const fav = resultadoRegulamentar.reduce((m, x) => (Number(x.odd) > 0 && Number(x.odd) < Number(m.odd) ? x : m), resultadoRegulamentar[0]);
            const favOdd = Number(fav?.odd) || 0;
            const favStr = favOdd > 0 ? favOdd.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--';
            const disabled = !(favOdd > 0);
            return (
              <MarketCard title={title} darkMode={darkMode} noPad>
                <div className="p-3">
                  <button
                    onClick={disabled ? undefined : () => fav && onSelect(fav.label, favOdd)}
                    disabled={disabled}
                    className={`w-full h-16 rounded-xl font-black text-xl uppercase tracking-wider text-white shadow-lg
                      bg-gradient-to-r from-red-600 to-rose-700 ring-4 ring-red-400 ring-opacity-50 animate-pulse
                      transition-all duration-200 ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-95'}
                      flex items-center justify-center gap-3`}
                  >
                    <span>⚡ APOSTA JÁ</span>
                    {fav && <span className="text-base opacity-90">{fav.label} @ {favStr}</span>}
                  </button>
                </div>
              </MarketCard>
            );
          }

          // ── Normal 3-column layout ────────────────────────────────────
          return (
            <MarketCard title={title} darkMode={darkMode} noPad>
              <div className="grid grid-cols-3 gap-2 p-3">
                {resultadoRegulamentar.map((item, i) => {
                  const val = Number(item.odd);
                  const disabled = isSusp || !(val > 0);
                  return (
                    <OddButton
                      key={i}
                      label={String(item.label || '')}
                      price={val}
                      trend="stable"
                      onClick={() => onSelect(String(item.selection || item.label), val)}
                      className="w-full h-full min-h-[48px] px-2 py-2 rounded-lg bg-red-600 text-white hover:opacity-90 flex items-center justify-between gap-1"
                      suspended={disabled ? { reason: toBadgeReason(susp) } : undefined}
                    />
                  );
                })}
              </div>
            </MarketCard>
          );
      }
      
      // Double Chance — layout horizontal lado a lado (igual a Resultado Final)
      if (key === 'double_chance') {
          if (doubleChanceItems.length === 0) return null;
          const title = getMarketTitle('double_chance', event?.sport);
          const susp = getSuspendedReason('double_chance');
          const isSusp = !!susp;
          const cols = doubleChanceItems.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
          return (
            <MarketCard title={title} darkMode={darkMode} noPad>
              <div className={`grid ${cols} gap-2 p-3`}>
                {doubleChanceItems.map((item: any, i: number) => {
                  const val = Number(item.odd);
                  const disabled = isSusp || !(val > 0);
                  return (
                    <OddButton
                      key={i}
                      label={String(item.label || '')}
                      price={val}
                      trend="stable"
                      onClick={() => onSelect(String(item.selection || item.label), val)}
                      className="w-full h-full min-h-[48px] px-2 py-2 rounded-lg bg-red-600 text-white hover:opacity-90 flex items-center justify-between gap-1"
                      suspended={disabled ? { reason: toBadgeReason(susp) } : undefined}
                    />
                  );
                })}
              </div>
            </MarketCard>
          );
      }

      // Empate Anula Aposta (DNB) — layout horizontal 2 colunas lado a lado
      if (key === 'dnb' || key === 'draw_no_bet') {
          const dnbItems = getMarketItems(key);
          if (dnbItems.length === 0) return null;
          const title = getMarketTitle(key, event?.sport);
          const susp = getSuspendedReason(key);
          const isSusp = !!susp;
          const cols = dnbItems.length <= 2 ? 'grid-cols-2' : 'grid-cols-3';
          return (
            <MarketCard title={title} darkMode={darkMode} noPad>
              <div className={`grid ${cols} gap-2 p-3`}>
                {dnbItems.map((item: any, i: number) => {
                  const val = Number(item.odd);
                  const disabled = isSusp || !(val > 0);
                  return (
                    <OddButton
                      key={i}
                      label={String(item.label || '')}
                      price={val}
                      trend="stable"
                      onClick={() => onSelect(String(item.selection || item.label), val)}
                      className="w-full h-full min-h-[48px] px-2 py-2 rounded-lg bg-red-600 text-white hover:opacity-90 flex items-center justify-between gap-1"
                      suspended={disabled ? { reason: toBadgeReason(susp) } : undefined}
                    />
                  );
                })}
              </div>
            </MarketCard>
          );
      }

      // 1º/2º Tempo — layout horizontal 3 colunas lado a lado (Casa | Empate | Fora)
      const HALF_RESULT_KEYS = new Set(['first_half_h2h','second_half_h2h','1st_half','2nd_half','half_time_result','first_half_result']);
      if (HALF_RESULT_KEYS.has(key)) {
          const halfItems = getMarketItems(key);
          if (halfItems.length === 0) return null;
          const title = getMarketTitle(key, event?.sport);
          const susp = getSuspendedReason(key);
          const isSusp = !!susp;
          const order = (lbl: string) => {
            const l = String(lbl || '').toLowerCase();
            if (l === 'casa' || l.includes('casa') || l === 'home' || l === '1') return 1;
            if (l === 'empate' || l.includes('empate') || l === 'draw' || l === 'x' || l === 'tie') return 2;
            if (l === 'fora' || l.includes('fora') || l === 'away' || l === '2') return 3;
            return 9;
          };
          const ordered = [...halfItems].sort((a, b) => order(a.label) - order(b.label));
          const cols = ordered.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
          return (
            <MarketCard title={title} darkMode={darkMode} noPad>
              <div className={`grid ${cols} gap-2 p-3`}>
                {ordered.map((item, i) => {
                  const val = Number(item.odd);
                  const disabled = isSusp || !(val > 0);
                  return (
                    <OddButton
                      key={i}
                      label={String(item.label || '')}
                      price={val}
                      trend="stable"
                      onClick={() => onSelect(String(item.selection || item.label), val)}
                      className="w-full h-full min-h-[48px] px-2 py-2 rounded-lg bg-red-600 text-white hover:opacity-90 flex items-center justify-between gap-1"
                      suspended={disabled ? { reason: toBadgeReason(susp) } : undefined}
                    />
                  );
                })}
              </div>
            </MarketCard>
          );
      }

      // Spreads/Handicap (inclui Puck Line / Run Line)
      if (key === 'spreads' || key === 'handicap' || key === 'puck_line' || key === 'run_line') {
          const baseItems = getMarketItems(key)
          if (baseItems.length === 0) return null;
          const title = getMarketTitle(key, event?.sport);
          const susp = getSuspendedReason(key);
          
          const parseHandicap = (s: string) => {
            const l = String(s || '')
            const numM = /([+-]?\s*[0-9]+(?:\.[0-9]+)?|[+-]?\s*[0-9]+(?:,[0-9]+)?)/.exec(l)
            const val = numM ? Number(String(numM[1]).replace(',', '.').replace(/\s+/g,'')) : NaN
            const hk = String(home || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
            const ak = String(away || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
            const lk = l.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
            const isHome = /casa|home/i.test(l) || (hk && lk.includes(hk))
            const isAway = /fora|away/i.test(l) || (ak && lk.includes(ak))
            const team = isHome ? 'home' : (isAway ? 'away' : '')
            return { team, val }
          }
          const sportKey = String(event?.sport || '').toLowerCase()
          const maxAbsHandicap = sportKey.includes('soccer') || sportKey.includes('football') ? 3.5 : 30
          const parsed = baseItems.map((x: MarketItem) => {
            const p = parseHandicap(String(x.label || ''))
            if (!p.team || !Number.isFinite(p.val)) return null
            if (Math.abs(p.val) > maxAbsHandicap) return null
            if (!(Number(x.odd) > 1.01 && Number(x.odd) < 25)) return null
            const signLabel = `${p.val >= 0 ? '+' : ''}${p.val}`
            const lbl = signLabel.replace(',', '.')
            const teamName = p.team === 'home' ? (home || 'Casa') : (away || 'Fora')
            const absKey = String(Math.abs(p.val)).replace(',', '.')
            return { team: p.team as 'home' | 'away', absKey, line: lbl, odd: x.odd, selection: `${teamName} ${lbl}` }
          }).filter(Boolean) as { team: 'home'|'away'; absKey: string; line: string; odd: number; selection: string }[]

          const homeMap = new Map<string, { line: string; odd: number; selection: string }>();
          const awayMap = new Map<string, { line: string; odd: number; selection: string }>();

          for (const p of parsed) {
            const rec = { line: p.line, odd: p.odd, selection: p.selection };
            if (p.team === 'home') homeMap.set(p.absKey, rec);
            else awayMap.set(p.absKey, rec);
          }

          const allLines = Array.from(new Set([...homeMap.keys(), ...awayMap.keys()]))
            .filter((x) => Number.isFinite(Number(String(x).replace(',', '.'))))
            .sort((a, b) => Number(String(a).replace(',', '.')) - Number(String(b).replace(',', '.')));

          if (allLines.length === 0) return null;

          const renderBtn = (item: { line: string; odd: number; selection: string } | undefined) => {
            if (!item) return <div className="w-28" />;
            const priceStr = Number(item.odd) > 0
              ? Number(item.odd).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : '--';
            const blocked = !!susp;
            return (
              <button
                onClick={blocked ? undefined : () => onSelect(item.selection, item.odd)}
                disabled={blocked}
                className={`w-28 h-12 rounded-lg font-bold tabular-nums transition-all duration-200 relative
                  ${blocked ? 'bg-gray-600/40 text-gray-400 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-500 active:scale-95'}`}
              >
                <div className="flex flex-col items-center justify-center leading-[1.05]">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider">
                    {item.line}
                  </span>
                  <span className="text-sm font-black">{priceStr}</span>
                </div>
              </button>
            );
          };

          return (
            <MarketCard title={title} darkMode={darkMode} noPad>
              <div className={`grid grid-cols-[1fr_auto_auto] items-center`}>
                <div className={`text-[11px] font-bold uppercase tracking-wider px-3 py-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Linha</div>
                <div className={`text-[11px] font-bold uppercase tracking-wider px-3 py-2 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{home || 'Casa'}</div>
                <div className={`text-[11px] font-bold uppercase tracking-wider px-3 py-2 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{away || 'Fora'}</div>
                {allLines.map((absKey, i) => {
                  const h = homeMap.get(absKey);
                  const a = awayMap.get(absKey);
                  const rowBg = i % 2 === 0
                    ? (darkMode ? 'bg-gray-800/30' : 'bg-gray-50/80')
                    : '';
                  return (
                    <div key={absKey} className="contents">
                      <div className={`px-3 py-2 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-700'} ${rowBg}`}>
                        {absKey}
                      </div>
                      <div className={`px-2 py-2 flex justify-center ${rowBg}`}>{renderBtn(h)}</div>
                      <div className={`px-2 py-2 flex justify-center ${rowBg}`}>{renderBtn(a)}</div>
                    </div>
                  );
                })}
              </div>
            </MarketCard>
          );
      }

      // Totals (gols, cantos, cartões, períodos/quartos/innings/sets/games)
      const TOTALS_KEYS = new Set(['totals','corners_total','cards_total','goals_total','team_totals','match_goals','match_total_games','total_sets','current_set_totals','set_1_totals','set_2_totals','set_3_totals','corners_2_way','cards_in_match','innings_totals','inning_totals']);
      if (TOTALS_KEYS.has(key) || /_totals$/.test(key) || /_total$/.test(key) || /^total_/.test(key) || /over.under/i.test(key)) {
          if (totalsItems.length === 0 && (key !== 'totals' ? getMarketItems(key).length === 0 : true)) return null;
          
          const targetItems = key === 'totals' ? totalsItems : getMarketItems(key);
          
          const formatTotalNumber = (label: string) => {
            const m = /([0-9]+(?:\.[0-9]+)?|[0-9]+(?:,[0-9]+)?)/.exec(String(label || ''))
            if (!m) return ''
            const raw = String(m[1]).replace(',', '.')
            const n = parseFloat(raw)
            const s = String(event?.sport || '').toLowerCase()
            const normalizeHalf = s.includes('soccer') || s.includes('football')
            return normalizeHalf && Number.isFinite(n) && Number.isInteger(n) ? String(n + 0.5) : raw
          }
          const maxLine = (() => {
            if (key !== 'totals') return 999
            const s = String(event?.sport || '').toLowerCase()
            return (s.includes('soccer') || s.includes('football')) ? 5.5 : 999
          })();
          const okLine = (lbl: string) => {
            const n = Number(lbl);
            if (!Number.isFinite(n)) return false;
            if (n < 0) return false;
            if (n > maxLine) return false;
            return true;
          };

          const isOver = (lbl: string) => /acima|over|mais/i.test(String(lbl || ''))
          const isUnder = (lbl: string) => /abaixo|under|menos/i.test(String(lbl || ''))
          const toLine = (x: MarketItem) => {
            const line = String(x.handicap || formatTotalNumber(x.label) || '').trim()
            return line
          }

          const over = targetItems
            .filter((x: MarketItem) => isOver(String(x.label)))
            .map((x: MarketItem) => {
              const line = toLine(x)
              return { ...x, handicap: line, selection: line ? `Acima de ${line}` : x.label } as MarketItem
            })
            .filter((x: MarketItem) => okLine(String(x.handicap || '')) && Number(x.odd) > 1.01 && Number(x.odd) < 25)
            .sort((a: MarketItem, b: MarketItem) => Number(a.handicap) - Number(b.handicap));

          const under = targetItems
            .filter((x: MarketItem) => isUnder(String(x.label)))
            .map((x: MarketItem) => {
              const line = toLine(x)
              return { ...x, handicap: line, selection: line ? `Abaixo de ${line}` : x.label } as MarketItem
            })
            .filter((x: MarketItem) => okLine(String(x.handicap || '')) && Number(x.odd) > 1.01 && Number(x.odd) < 25)
            .sort((a: MarketItem, b: MarketItem) => Number(a.handicap) - Number(b.handicap));
             
          if (over.length === 0 && under.length === 0) return null;

          const title = getMarketTitle(key, event?.sport);
          const susp = getSuspendedReason(key);

          // Pair over/under by line value
          const overMap = new Map<string, MarketItem>(over.map((x: MarketItem) => [String(x.handicap || ''), x] as [string, MarketItem]));
          const underMap = new Map<string, MarketItem>(under.map((x: MarketItem) => [String(x.handicap || ''), x] as [string, MarketItem]));
          const allLines = Array.from(new Set([...over.map((x: MarketItem) => String(x.handicap || '')), ...under.map((x: MarketItem) => String(x.handicap || ''))]))
            .sort((a, b) => Number(a) - Number(b));

          return (
            <MarketCard title={title} darkMode={darkMode} noPad>
              <div className={`grid grid-cols-[1fr_auto_auto] items-center`}>
                <div className={`text-[11px] font-bold uppercase tracking-wider px-3 py-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Linha</div>
                <div className={`text-[11px] font-bold uppercase tracking-wider px-3 py-2 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Acima</div>
                <div className={`text-[11px] font-bold uppercase tracking-wider px-3 py-2 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Abaixo</div>
                {allLines.map((line, i) => {
                  const o = overMap.get(line);
                  const u = underMap.get(line);
                  // ── Fair odds (no-vig) for this line ──
                  const fair = (o && u && Number(o.odd) > 1 && Number(u.odd) > 1)
                    ? fairOddsTwoWay(Number(o.odd), Number(u.odd))
                    : null;
                  const rowBg = i % 2 === 0
                    ? (darkMode ? 'bg-gray-800/30' : 'bg-gray-50/80')
                    : '';
                  const renderBtn = (item: MarketItem | undefined, side: 'a' | 'b') => {
                    if (!item) return <div className="w-24" />;
                    const f = fair ? fair[side] : null;
                    const sideLabel = side === 'a' ? 'Acima de' : 'Abaixo de';
                    const priceStr = Number(item.odd) > 0 ? Number(item.odd).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--';
                    return (
                      <button
                        onClick={susp ? undefined : () => onSelect(String(item.selection || item.label), item.odd)}
                        disabled={!!susp}
                        title={f ? `Odd justa: ${formatFairOdd(f.fair)}${f.isValue ? ` · valor +${(f.edge * 100).toFixed(1)}%` : ''}` : undefined}
                        className={`w-24 h-12 rounded-lg font-bold tabular-nums transition-all duration-200 relative
                          ${susp ? 'bg-gray-600/40 text-gray-400 cursor-not-allowed'
                            : f?.isValue
                              ? 'bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95 ring-1 ring-emerald-300'
                              : 'bg-red-600 text-white hover:bg-red-500 active:scale-95'}`}
                      >
                        <div className="flex flex-col items-center justify-center leading-[1.05]">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider">
                            {sideLabel} {line}
                          </span>
                          <span className="text-sm font-black">{priceStr}</span>
                        </div>
                        {f?.isValue && (
                          <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-black text-[8px] font-black px-1 py-0.5 rounded-full leading-none shadow">
                            ★
                          </span>
                        )}
                      </button>
                    );
                  };
                  return (
                    <div key={line} className={`contents`}>
                      <div className={`px-3 py-2 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-700'} ${rowBg} flex flex-col`}>
                        <span>{line}</span>
                        {fair && (
                          <span className={`text-[9px] font-normal mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            justo: {formatFairOdd(fair.a.fair)}/{formatFairOdd(fair.b.fair)}
                            {fair.margin > 0 && <span className="ml-1 opacity-70">· vig {(fair.margin * 100).toFixed(1)}%</span>}
                          </span>
                        )}
                      </div>
                      <div className={`px-2 py-2 flex justify-center ${rowBg}`}>{renderBtn(o, 'a')}</div>
                      <div className={`px-2 py-2 flex justify-center ${rowBg}`}>{renderBtn(u, 'b')}</div>
                    </div>
                  );
                })}
              </div>
            </MarketCard>
          )
      }

      // BTTS
      if (key === 'btts') {
          if (bttsItems.length === 0) return null;
          const title = getMarketTitle('btts', event?.sport);
          const susp = getSuspendedReason('btts');
          return (
            <MarketCard title={title} darkMode={darkMode}>
              <MarketButtonGroup items={bttsItems} onSelect={onSelect} suspendedReason={susp} columns={2} darkMode={darkMode} />
            </MarketCard>
          )
      }

      // Correct Score — 3 columns: Casa wins | Empates | Fora wins
      if (key === 'correct_score' || key === 'exact_score' || key === 'score') {
        const rawItems = getMarketItems(key);
        if (!rawItems || rawItems.length === 0) return null;
        const title = getMarketTitle(key, event?.sport);
        const susp = getSuspendedReason(key);
        const isSusp = !!susp;

        // Parse label like "1-0" → { h: 1, a: 0 }
        const parseScore = (label: string) => {
          const m = /(\d+)\s*[-:]\s*(\d+)/.exec(String(label || ''));
          if (!m) return null;
          return { h: parseInt(m[1]), a: parseInt(m[2]) };
        };

        const baseMax = 3;
        const liveMax =
          currentGoals
            ? Math.max(baseMax, Number(currentGoals.home) + 1, Number(currentGoals.away) + 1)
            : baseMax;
        const maxGoal = Math.max(baseMax, Math.min(7, liveMax));

        const scoredItems = rawItems
          .map((it: any) => ({ it, s: parseScore(String(it.label)) }))
          .filter((x: any) => x.s && x.s.h <= maxGoal && x.s.a <= maxGoal) as Array<{ it: any; s: { h: number; a: number } }>;

        scoredItems.sort((a, b) => (a.s.h + a.s.a) - (b.s.h + b.s.a) || a.s.h - b.s.h || a.s.a - b.s.a);

        const homeWins: typeof rawItems = [];
        const draws: typeof rawItems = [];
        const awayWins: typeof rawItems = [];

        for (const { it, s } of scoredItems) {
          if (s.h > s.a) homeWins.push(it);
          else if (s.h === s.a) draws.push(it);
          else awayWins.push(it);
        }

        const maxRows = Math.max(homeWins.length, draws.length, awayWins.length);
        const colData = [
          { label: 'Casa', items: homeWins, color: 'text-blue-400' },
          { label: 'Empate', items: draws, color: 'text-yellow-400' },
          { label: 'Fora', items: awayWins, color: 'text-red-400' },
        ];

        return (
          <MarketCard title={title} darkMode={darkMode} noPad>
            <div className="grid grid-cols-3 gap-3 p-3">
              {colData.map(col => (
                <div key={col.label} className="flex flex-col">
                  <div className={`text-[10px] font-extrabold uppercase tracking-wider text-center py-1.5 ${col.color} ${darkMode ? 'bg-gray-800/60' : 'bg-gray-50'} rounded-lg`}>
                    {col.label}
                  </div>
                  <div className="flex flex-col gap-3 mt-2">
                    {Array.from({ length: maxRows }).map((_, i) => {
                      const item = col.items[i];
                      if (!item) return <div key={i} className="h-12" />;
                      const val = Number(item.odd);
                      const priceStr = val > 0 ? val.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--';
                      // Block scores that are impossible given the current live score
                      const parsedLabel = parseScore(String(item.label));
                      const isImpossible = !isSusp && currentGoals !== null && parsedLabel !== null &&
                        (parsedLabel.h < currentGoals.home || parsedLabel.a < currentGoals.away);
                      const isBlocked = isSusp || isImpossible;
                      return (
                        <button
                          key={i}
                          onClick={isBlocked ? undefined : () => onSelect(item.label, val)}
                          disabled={isBlocked}
                          title={isImpossible ? 'Resultado impossível dado o marcador actual' : undefined}
                          className={`w-full h-12 rounded-xl font-black tabular-nums transition-all duration-200 flex flex-col items-center justify-center leading-[1.05] ${
                            isBlocked ? 'bg-gray-600/40 text-gray-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-500 active:scale-95'
                          } ${isImpossible ? 'opacity-40' : ''}`}
                        >
                          <span className="text-[12px] font-extrabold">{item.label}</span>
                          <span className="text-base">
                            {isImpossible ? (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              priceStr
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </MarketCard>
        );
      }

      // Generic
      const items = getMarketItems(key);
      if (!items || items.length === 0) return null;

      const title = getMarketTitle(key, event?.sport);
      const susp = getSuspendedReason(key);
      const isSusp = !!susp;

      const looksThreeWay = (() => {
        if (items.length !== 3) return false;
        const ls = items.map((x: MarketItem) => String(x.label || '').toLowerCase());
        const hasHome = ls.some((x: string) => x === 'casa' || x.includes('casa') || x === 'home' || x === '1');
        const hasDraw = ls.some((x: string) => x === 'empate' || x.includes('empate') || x === 'draw' || x === 'x' || x === 'tie');
        const hasAway = ls.some((x: string) => x === 'fora' || x.includes('fora') || x === 'away' || x === '2');
        const keyOk = key === 'h2h' || /(^|_)h2h($|_)/.test(key) || key.includes('result');
        return keyOk && hasHome && hasDraw && hasAway;
      })();

      if (looksThreeWay) {
        const order = (lbl: string) => {
          const l = String(lbl || '').toLowerCase();
          if (l === 'casa' || l.includes('casa') || l === 'home' || l === '1') return 1;
          if (l === 'empate' || l.includes('empate') || l === 'draw' || l === 'x' || l === 'tie') return 2;
          if (l === 'fora' || l.includes('fora') || l === 'away' || l === '2') return 3;
          return 9;
        };
        const ordered = [...items].sort((a, b) => order(a.label) - order(b.label));
        return (
          <MarketCard title={title} darkMode={darkMode} noPad>
            <div className="grid grid-cols-3 gap-2 p-3">
              {ordered.map((item, i) => {
                const val = Number(item.odd);
                const disabled = isSusp || !(val > 0);
                return (
                  <OddButton
                    key={i}
                    label={String(item.label || '')}
                    price={val}
                    trend="stable"
                    onClick={() => onSelect(String(item.selection || item.label), val)}
                    className="w-full h-full min-h-[48px] px-2 py-2 rounded-lg bg-red-600 text-white hover:opacity-90 flex items-center justify-between gap-1"
                    suspended={disabled ? { reason: toBadgeReason(susp) } : undefined}
                  />
                );
              })}
            </div>
          </MarketCard>
        );
      }
      
      return (
        <MarketCard key={key} title={title} darkMode={darkMode}>
          <MarketButtonGroup items={items} onSelect={onSelect} suspendedReason={susp} darkMode={darkMode} />
        </MarketCard>
      )
  }

  // --- Group logic ---
  const finalGroups = useMemo(() => {
      const s = (event?.sport || '').toLowerCase();
      const isSoccer = s.includes('soccer') || s.includes('futebol');
      if (isSoccer) {
          const blocked = new Set(['main', '1x2', 'match_winner']);
          const allKeys = Object.keys(eventOdds || {}).filter(k => !blocked.has(k));
          const hasContent = (k: string) => {
              const items = getMarketItems(k);
              return !!items && items.length > 0;
          };
          const rawKeys = allKeys.filter(hasContent);
          const keyPriority = (k: string) => {
            const lk = k.toLowerCase();
            const pref = [
              'h2h',
              'double_chance',
              'totals',
              'btts',
              'handicap',
              'spreads',
              'half_time_full_time',
              'htft',
              'correct_score',
              'corners_total',
              'cards_total',
            ];
            const idx = pref.findIndex((x) => x === lk);
            return idx >= 0 ? idx : 999;
          };
          const dedupe = new Map<string, { key: string; pr: number; len: number }>();
          for (const k of rawKeys) {
            const titleKey = getMarketTitle(k, event?.sport).toLowerCase().trim();
            const pr = keyPriority(k);
            const len = String(k).length;
            const prev = dedupe.get(titleKey);
            if (!prev || pr < prev.pr || (pr === prev.pr && len < prev.len)) {
              dedupe.set(titleKey, { key: k, pr, len });
            }
          }
          const keys = Array.from(dedupe.values()).sort((a, b) => a.pr - b.pr || a.len - b.len).map((x) => x.key);

          const buckets: Record<string, string[]> = {
              Todos: [],
              Resultados: [],
              'Dupla Chance': [],
              Gols: [],
              Especiais: [],
              Handicap: [],
              '1º Tempo': [],
              '2º Tempo': [],
              'HT/FT': [],
              'Placar correto': [],
              Escanteio: [],
              Cartão: [],
              Asiático: [],
              Jogadores: [],
          };

          const assigned = new Set<string>();
          const add = (tab: keyof typeof buckets, k: string) => {
              if (assigned.has(k)) return;
              buckets[tab].push(k);
              assigned.add(k);
          };

          for (const k of keys) {
              const lk = k.toLowerCase();

              if (/corner|corners|escanteio/.test(lk)) add('Escanteio', k);
              else if (/card|cards|yellow|red|cart[aã]o/.test(lk)) add('Cartão', k);
              else if (/correct_score|score_exact|placar/.test(lk)) add('Placar correto', k);
              else if (/half_time_full_time|htft|half.*full/.test(lk)) add('HT/FT', k);
              else if (/^first_half_|firsthalf|1st_half|^1st_/.test(lk)) add('1º Tempo', k);
              else if (/^second_half_|secondhalf|2nd_half|^2nd_/.test(lk)) add('2º Tempo', k);
              else if (lk === 'spreads' || /asian|asi[aá]tico|ah_?/.test(lk)) add('Asiático', k);
              else if (/handicap/.test(lk)) add('Handicap', k);
              else if (/player_|scorer|goal_scorer|jogador/.test(lk)) add('Jogadores', k);
              else if (/double_chance|dnb|draw_no_bet/.test(lk)) add('Dupla Chance', k);
              else if (/totals|btts|goal|goals|team_totals|minute_goals|exact_goals|goal_range|odd_even|next_goal|first_goal|last_goal/.test(lk)) add('Gols', k);
              else if (/h2h|result|winner|winning|margin|match_winner/.test(lk)) add('Resultados', k);
              else add('Especiais', k);
          }

          const allOrdered = [
            ...buckets['Resultados'],
            ...buckets['Dupla Chance'],
            ...buckets['Gols'],
            ...buckets['Especiais'],
            ...buckets['Handicap'],
            ...buckets['1º Tempo'],
            ...buckets['2º Tempo'],
            ...buckets['HT/FT'],
            ...buckets['Placar correto'],
            ...buckets['Escanteio'],
            ...buckets['Cartão'],
            ...buckets['Asiático'],
            ...buckets['Jogadores'],
          ];
          const seen = new Set<string>();
          buckets['Todos'] = allOrdered.filter((k) => {
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });

          const FIXED_TABS: Array<{ title: string; keys: string[] }> = [
              { title: 'Todos', keys: buckets['Todos'] },
              { title: 'Resultados', keys: buckets['Resultados'] },
              { title: 'Dupla Chance', keys: buckets['Dupla Chance'] },
              { title: 'Gols', keys: buckets['Gols'] },
              { title: 'Especiais', keys: buckets['Especiais'] },
              { title: 'Handicap', keys: buckets['Handicap'] },
              { title: '1º Tempo', keys: buckets['1º Tempo'] },
              { title: '2º Tempo', keys: buckets['2º Tempo'] },
              { title: 'HT/FT', keys: buckets['HT/FT'] },
              { title: 'Placar correto', keys: buckets['Placar correto'] },
              { title: 'Escanteio', keys: buckets['Escanteio'] },
              { title: 'Cartão', keys: buckets['Cartão'] },
              { title: 'Asiático', keys: buckets['Asiático'] },
              { title: 'Jogadores', keys: buckets['Jogadores'] },
          ];

          return FIXED_TABS;
      }

      const isBasketball = s.includes('basketball') || s.includes('basquete') || s.includes('nba');
      const isTennis = s.includes('tennis') || s.includes('tênis') || s.includes('atp') || s.includes('wta');
      const isBaseball = s.includes('baseball') || s.includes('beisebol') || s.includes('mlb');
      const isIceHockey = s.includes('ice hockey') || s.includes('hóquei') || s.includes('nhl');

      if (isBasketball) return BASKETBALL_GROUPS;
      if (isTennis) return TENNIS_GROUPS;
      if (isBaseball) return BASEBALL_GROUPS;
      if (isIceHockey) return ICE_HOCKEY_GROUPS;

      const keysWithCategory = Object.keys(eventOdds || {}).filter(k => {
          if (k === 'main' || k === '1x2' || k === 'match_winner' || k === 'spreads') return false;
          return !!(eventOdds as any)[k]?.category;
      });
      const uniqueCategories = new Set(keysWithCategory.map(k => (eventOdds as any)[k].category));
      
      if (uniqueCategories.size >= 2) {
          const categoryMap = new Map<string, Set<string>>();
          const ORDERED_CATEGORIES = [
              "Mercado Raiz",
              "Mercados de Resultado",
              "Mercados de Gols",
              "Mercados Temporais",
              "Mercados Estatísticos",
              "Mercados de Jogadores",
              "Mercados Especiais"
          ];

          for (const key of keysWithCategory) {
              const cat = (eventOdds as any)[key].category;
              if (cat === 'Outros Mercados') continue;
              if (!categoryMap.has(cat)) categoryMap.set(cat, new Set());
              categoryMap.get(cat)!.add(key);
          }

          const groups = [];
          for (const catName of ORDERED_CATEGORIES) {
              if (categoryMap.has(catName)) {
                  groups.push({ title: catName, keys: Array.from(categoryMap.get(catName)!) });
                  categoryMap.delete(catName);
              }
          }
          for (const [catName, keys] of categoryMap.entries()) {
              groups.push({ title: catName, keys: Array.from(keys) });
          }
          return groups;
      }

      const isVolleyball = s.includes('volleyball') || s.includes('vôlei') || s.includes('volei');
      const isAFL = s.includes('afl') || s.includes('australian football') || s.includes('futebol australiano');
      const isF1 = s.includes('formula 1') || s.includes('f1') || s.includes('formula one') || s.includes('automobilismo') || s.includes('motor sports');
      const isAmericanFootball = s.includes('american football') || s.includes('futebol americano') || s.includes('nfl');
      const isHandball = s.includes('handball') || s.includes('handebol');
      const isMMA = s.includes('mma') || s.includes('ufc') || s.includes('mixed martial arts') || s.includes('luta');
      const isRugby = s.includes('rugby') || s.includes('union') || s.includes('league');
      
      let BASE_GROUPS = MARKET_GROUPS;
      if (isVolleyball) BASE_GROUPS = VOLLEYBALL_GROUPS;
      else if (isAFL) BASE_GROUPS = AFL_GROUPS;
      else if (isF1) BASE_GROUPS = FORMULA1_GROUPS;
      else if (isAmericanFootball) BASE_GROUPS = AMERICAN_FOOTBALL_GROUPS;
      else if (isHandball) BASE_GROUPS = HANDBALL_GROUPS;
      else if (isMMA) BASE_GROUPS = MMA_GROUPS;
      else if (isRugby) BASE_GROUPS = RUGBY_GROUPS;

      return BASE_GROUPS;
  }, [event?.sport, eventOdds]);

  const [activeTab, setActiveTab] = useState(() => {
     const s = (event?.sport || '').toLowerCase();
     const isSoccer = s.includes('soccer') || s.includes('futebol');
     const isBasketball = s.includes('basketball') || s.includes('basquete') || s.includes('nba');
     const isTennis = s.includes('tennis') || s.includes('tênis') || s.includes('atp') || s.includes('wta');
     const isVolleyball = s.includes('volleyball') || s.includes('vôlei') || s.includes('volei');
     const isAFL = s.includes('afl') || s.includes('australian football') || s.includes('futebol australiano');
     const isBaseball = s.includes('baseball') || s.includes('beisebol') || s.includes('mlb');
     const isF1 = s.includes('formula 1') || s.includes('f1') || s.includes('formula one') || s.includes('automobilismo') || s.includes('motor sports');
     const isAmericanFootball = s.includes('american football') || s.includes('futebol americano') || s.includes('nfl');
     const isHandball = s.includes('handball') || s.includes('handebol');
     const isIceHockey = s.includes('ice hockey') || s.includes('hóquei') || s.includes('nhl');
     const isMMA = s.includes('mma') || s.includes('ufc') || s.includes('mixed martial arts') || s.includes('luta');
     
     if (isSoccer) return 'Todos';
     if (isBasketball) return BASKETBALL_GROUPS[0].title;
     if (isTennis) return TENNIS_GROUPS[0].title;
     if (isVolleyball) return VOLLEYBALL_GROUPS[0].title;
     if (isAFL) return AFL_GROUPS[0].title;
     if (isBaseball) return BASEBALL_GROUPS[0].title;
     if (isF1) return FORMULA1_GROUPS[0].title;
     if (isAmericanFootball) return AMERICAN_FOOTBALL_GROUPS[0].title;
     if (isHandball) return HANDBALL_GROUPS[0].title;
     if (isIceHockey) return ICE_HOCKEY_GROUPS[0].title;
     if (isMMA) return MMA_GROUPS[0].title;
     return MARKET_GROUPS[0].title;
  });
  
  useEffect(() => {
      if (!finalGroups.find(g => g.title === activeTab)) {
          setActiveTab(finalGroups[0].title);
      }
  }, [finalGroups, activeTab]);

  return (
    <div className={`${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'} rounded-2xl p-2 md:p-3`}>
      
      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto pb-2 mb-4 gap-2 no-scrollbar">
         {(() => {
             const s = (event?.sport || '').toLowerCase();
             const isSoccer = s.includes('soccer') || s.includes('futebol');
             const groups = isSoccer
                 ? finalGroups
                 : finalGroups.filter(group => group.keys.some(k => renderMarketContent(k) !== null));
             return groups.map((group) => (
                 <button
                     key={group.title}
                     onClick={() => setActiveTab(group.title)}
                     className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                         activeTab === group.title
                             ? 'bg-red-600 text-white'
                             : (darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200')
                     }`}
                 >
                     {group.title}
                 </button>
             ));
         })()}
      </div>

      <div className="space-y-3">
        {finalGroups.map((group, idx) => {
            if (group.title !== activeTab) return null;

            const content = group.keys.map(k => ({ key: k, node: renderMarketContent(k) })).filter(x => x.node !== null);
            
            if (content.length === 0) {
                 return (
                     <div key={idx} className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                         Nenhum mercado disponível nesta categoria.
                     </div>
                 );
            }

            return (
                <div key={idx} className="market-group animate-fadeIn">
                    <div className="space-y-3">
                        {content.map(c => <div key={c.key}>{c.node}</div>)}
                    </div>
                </div>
            )
        })}
      </div>
    </div>
  )

}

export const MemoSubOddsModel = memo(SubOddsModel)

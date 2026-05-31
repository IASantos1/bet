import { OddButton } from '@/react-app/components/OddButton';
import { useMemo, useState, memo, useEffect } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { useApp } from '@/react-app/contexts/AppContext'; 
import { formatLeagueHeader, abbreviateTeamName, getSportFromLeague, getSportIcon, translateSelection } from '@/shared/helpers';
import type { Event, LiveScore, SuspendedMarket } from '@/shared/types'; 

const normalizeSport = (s: string) => {
  const v = String(s || '').toLowerCase();
  if (v.includes('football') && !v.includes('american')) return 'soccer';
  if (v.includes('american') && v.includes('football')) return 'american-football';
  if (v.includes('ice') && v.includes('hockey')) return 'ice-hockey';
  return v.replace(/\s+/g, '-');
};

interface EventCardProps { 
  event: Event; 
  isFavorite: boolean; 
  onToggleFavorite: (eventId: number) => void; 
  onOpenEvent: (event: Event) => void;
  liveScore?: LiveScore;
  suspension?: SuspendedMarket;
}

export function EventCard({ event, onOpenEvent, liveScore, suspension }: EventCardProps) { 
  const { darkMode, addNotification, addToBetSlip } = useApp(); 
  const [isHovered, setIsHovered] = useState(false); 

  
  
  


 

  

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

  

  
  const [markets, setMarkets] = useState<Record<string, any>>(event.markets || event.odds || {});
  
  // Update markets if event updates
  useEffect(() => {
    // Prioritize odds if it looks like a live update (has h2h and is not empty)
    // or if markets is missing.
    if (event.odds && Object.keys(event.odds).length > 0) {
        setMarkets(event.odds);
    } else if (event.markets) {
        setMarkets(event.markets);
    } else {
        setMarkets({});
    }
  }, [event.markets, event.odds]);
  
  const cleanTeam = (s: string) => {
    const raw = String(s || '');
    const head = raw.split(',')[0] || raw;
    return abbreviateTeamName(head.trim());
  };

  // Use refs to track previous values without triggering re-renders themselves, 
  // but use state for the trend to trigger render.
  const useTrend = (val: number) => {
      const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable');
      const prev = useMemo(() => ({ value: val }), []); // Stable ref container

      if (val !== prev.value) {
          if (val > prev.value) setTrend('up');
          else if (val < prev.value) setTrend('down');
          prev.value = val;
      }

      // Auto-reset trend effect
      useEffect(() => {
          if (trend !== 'stable') {
              const t = setTimeout(() => setTrend('stable'), 5000);
              return () => clearTimeout(t);
          }
      }, [trend]);

      return trend;
  }

  const hh = Number(event.home_odd || 0);
  const dd = Number(event.draw_odd || 0);
  const aa = Number(event.away_odd || 0);

  const homeTrend = useTrend(hh);
  const drawTrend = useTrend(dd);
  const awayTrend = useTrend(aa);

  

  
 
  return (
    <div 
      className={`border rounded-lg p-3 transition-all duration-300 ${ 
        darkMode ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' : 'bg-white border-gray-200 hover:border-red-400 hover:shadow-lg' 
      } ${isHovered ? 'scale-[1.02]' : ''}`} 
      onMouseEnter={() => setIsHovered(true)} 
      onMouseLeave={() => setIsHovered(false)} 
      onClick={() => onOpenEvent(event)}
    > 
      <div className="flex flex-col sm:flex-row justify-between items-start mb-3"> 
         <div className="flex-1"> 
        <div className="flex items-center gap-2 mb-1">
         {(() => {
          const { flag, country, league: formattedLeague, flagUrl } = formatLeagueHeader(event);
          const sport = event.sport ? normalizeSport(event.sport) : getSportFromLeague(event.league || '');
          const sportIcon = getSportIcon(sport);
          
          const leagueLabel = sport === 'cricket' ? 'Críquete' : formattedLeague;

          return (
            <span className={`flex items-center gap-2 text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
               <div className="relative w-5 h-5 flex-shrink-0">
                    <img src={sportIcon} alt={sport} className="w-full h-full object-contain p-0.5 opacity-90" />
                    {(flagUrl || flag) && (
                        <span className={`absolute -bottom-1 -right-1 flex items-center justify-center w-3.5 h-3.5 rounded-full shadow-sm border ${darkMode ? 'border-gray-800 bg-gray-700' : 'border-white bg-white'} overflow-hidden`}>
                            {flagUrl ? <img src={flagUrl} alt={country} className="w-full h-full object-cover" /> : <span className="text-[9px]">{flag}</span>}
                        </span>
                    )}
                </div>
                <span>
                    {country} {country && leagueLabel ? '·' : ''} {leagueLabel} {eventDayMonth ? ` - ${eventDayMonth}` : ''}
                </span>
            </span>
          );
        })()}
       </div>
           
      
      <div className="flex items-center gap-3">
        <button 
          onClick={(e: ReactMouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onOpenEvent(event); }} 
          className={`text-left ${darkMode ? 'text-white hover:text-red-300' : 'text-gray-900 hover:text-red-700'} underline-offset-2 hover:underline`} 
        > 
          <span className="inline-flex items-center gap-2">
            <span className="text-sm font-semibold">{cleanTeam(event.home_team || (event.match?.split(' vs ')[0] || ''))}</span>
           {(() => {
             // Determine score to display
             // Priority: 1. liveScore prop, 2. event.goals (WS), 3. event.golsCasa/Fora (Legacy), 4. event.score (String)
             const rawHome = liveScore?.golsCasa ?? event.goals?.home ?? event.golsCasa;
             const rawAway = liveScore?.golsFora ?? event.goals?.away ?? event.golsFora;
             
             const formatScore = (val: any) => {
                 if (val === null || val === undefined) return undefined;
                 if (typeof val === 'object') {
                     // Handle API-Sports basketball/other sports object format
                     // { quarter_1, ..., total }
                     return val.total ?? val.score ?? val.current ?? 0;
                 }
                 return val;
             };

             const homeScore = formatScore(rawHome);
             const awayScore = formatScore(rawAway);
             const time = liveScore?.minuto ?? event.fixture?.status?.elapsed ?? (event.fixture as any)?.elapsed;
             
             if (homeScore !== undefined && awayScore !== undefined) {
                 return (
                    <span className="text-sm font-bold text-red-600 animate-pulse">
                        {homeScore}-{awayScore}
                        {time && <span className="text-xs ml-1 font-normal text-gray-500 dark:text-gray-400">({time}')</span>}
                    </span>
                 );
             }
             
             if (event.is_live === 1 && event.score) {
                 // Ensure event.score is not an object
                 const displayScore = typeof event.score === 'object' ? formatScore(event.score) : event.score;
                 return (
                    <span className="text-sm font-bold text-red-600 animate-pulse">
                        {displayScore}
                    </span>
                 );
             }
             
             return <span className="text-xs font-normal">{eventTime || 'vs'}</span>;
           })()}
            <span className="text-sm font-semibold">{cleanTeam(event.away_team || (event.match?.split(' vs ')[1] || ''))}</span>
           </span>
        </button>
        
      </div>
          
         </div> 
        <div className="text-left sm:text-right mt-2 sm:mt-0 w-full sm:w-auto">
          {(() => {
            let rawH2h = markets?.h2h;
            // Fallback for API-Sports array format
            if (!rawH2h && Array.isArray(markets)) {
                 const matchWinner = markets.find((m: any) => m.id === 1 || m.name === 'Match Winner' || m.name === '1x2' || m.name === 'Vencedor do Encontro');
                 if (matchWinner) rawH2h = matchWinner.outcomes || matchWinner.values;
            }

            const h2h = Array.isArray(rawH2h) ? rawH2h : (rawH2h?.outcomes || []);
            const isH2hSuspended = rawH2h?.suspended === true || rawH2h?.status === 'suspended';

            const labelOf = (o: any) => String(o?.label ?? o?.name ?? o?.outcome ?? '');
            const priceOf = (o: any) => { const p = Number((o?.price ?? o?.odd ?? o?.value ?? 0)); return Number.isFinite(p) ? p : 0 };
            const getOdd = (lbl: string) => {
              const aliases: Record<string, string[]> = {
                  'Casa': ['Home', '1'],
                  'Empate': ['Draw', 'X'],
                  'Fora': ['Away', '2']
              };
              const targets = [lbl, ...(aliases[lbl] || [])];
              const it = h2h.find((x: any) => targets.includes(labelOf(x)));
              return it ? priceOf(it) : 0;
            };
            
            const _hh = getOdd('Casa') || Number(event.home_odd || 0);
            const _dd = getOdd('Empate') || Number(event.draw_odd || 0);
            const _aa = getOdd('Fora') || Number(event.away_odd || 0);
            
            const hasPrimary = (_hh > 0) || (_dd > 0) || (_aa > 0) || isH2hSuspended;
            if (!hasPrimary) {
                return (
                    <div className="flex gap-2 justify-end opacity-50 cursor-not-allowed">
                        <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700 rounded p-2 min-w-[60px] h-[50px]">
                             <span className="text-xs text-gray-500 font-bold">-</span>
                        </div>
                         <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700 rounded p-2 min-w-[60px] h-[50px]">
                             <span className="text-xs text-gray-500 font-bold">-</span>
                        </div>
                         <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700 rounded p-2 min-w-[60px] h-[50px]">
                             <span className="text-xs text-gray-500 font-bold">-</span>
                        </div>
                    </div>
                );
            }
            
            const addPrimary = (label: string, price: number) => {
              if (!(price > 0)) { addNotification({ type: 'warning', message: 'Odd indisponível' }); return; }
              const idStr = `ev-${event.id}-${label.toLowerCase()}`;
              addToBetSlip({ 
                id: idStr, 
                event_id: event.id, 
                match: String(event.match || `${event.home_team} vs ${event.away_team}`), 
                selection: label, 
                odd: price, 
                stake: 0,
                league: event.league,
                sport: (event.sport ? normalizeSport(event.sport) : getSportFromLeague(event.league || ''))
              });
              try { localStorage.setItem(`event_odds_${event.id}`, JSON.stringify({ sport: getSportFromLeague(event.league || '') })); } catch { /* no-op */ }
            };
            
            const isSuspended = !!suspension || event.oddsFrozen || event.suspended;
            const suspendReason = suspension?.reason || (event.oddsFrozen ? 'EVENT_FROZEN' : 'SUSPENDED');
            const marketSuspended = isH2hSuspended ? { reason: 'SUSPENSO' } : undefined;
            
            return (
              <div className={`flex gap-2 sm:gap-3 justify-between sm:justify-end relative transition-opacity duration-300 w-full sm:w-auto ${isSuspended ? 'opacity-50 pointer-events-none select-none' : ''}`}>
                {isSuspended && (
                   <div className="absolute inset-0 flex items-center justify-center z-10">
                      <span className="bg-red-600/90 text-white text-[10px] sm:text-xs px-2 py-1 rounded shadow-sm font-bold uppercase tracking-wider backdrop-blur-sm border border-red-500">
                        {suspendReason === 'EVENT_FROZEN' ? 'GOL/VAR' : (suspendReason === 'LOW_LIQUIDITY' ? 'LIQUIDEZ' : (suspendReason === 'RISK_MARGIN' ? 'RISCO' : 'SUSPENSO'))}
                      </span>
                   </div>
                )}
                {(_hh > 0 || isH2hSuspended) ? (
                  <OddButton 
                    label="Casa"
                    price={_hh}
                    trend={homeTrend}
                    onClick={(e) => { e.stopPropagation(); addPrimary('Casa', _hh); }}
                    className="w-full sm:w-auto flex-1 sm:flex-none px-2 sm:px-4 lg:px-5 py-2 rounded-lg sm:min-w-[140px] lg:min-w-[180px] bg-red-600 text-white hover:opacity-90 flex items-center justify-between gap-1 sm:gap-2"
                    teamName={cleanTeam(event.home_team || (event.match?.split(' vs ')[0] || 'Casa'))}
                    suspended={marketSuspended}
                  />
                ) : null}
                {(_dd > 0 || isH2hSuspended) ? (
                  <OddButton 
                    label="Empate"
                    price={_dd}
                    trend={drawTrend}
                    onClick={(e) => { e.stopPropagation(); addPrimary('Empate', _dd); }}
                    className="w-full sm:w-auto flex-1 sm:flex-none px-2 sm:px-4 lg:px-5 py-2 rounded-lg sm:min-w-[140px] lg:min-w-[180px] bg-gray-600 text-white hover:opacity-90 flex items-center justify-between gap-1 sm:gap-2"
                    teamName="Empate"
                    suspended={marketSuspended}
                  />
                ) : null}
                {(_aa > 0 || isH2hSuspended) ? (
                  <OddButton 
                    label="Fora"
                    price={_aa}
                    trend={awayTrend}
                    onClick={(e) => { e.stopPropagation(); addPrimary('Fora', _aa); }}
                    className="w-full sm:w-auto flex-1 sm:flex-none px-2 sm:px-4 lg:px-5 py-2 rounded-lg sm:min-w-[140px] lg:min-w-[180px] bg-gray-900 text-white hover:opacity-90 flex items-center justify-between gap-1 sm:gap-2"
                    teamName={cleanTeam(event.away_team || (event.match?.split(' vs ')[1] || 'Fora'))}
                    suspended={marketSuspended}
                  />
                ) : null}
              </div>
            );
          })()}
        </div>
          </div> 
      <div className="mt-1"></div>

      {(() => {
        const arr = (k: string) => {
          const v = markets?.[k];
          return Array.isArray(v) ? v : [];
        };
        const pickPrice = (o: any) => {
          const p = Number((o?.price ?? o?.odd ?? o?.value ?? 0));
          return Number.isFinite(p) ? p : 0;
        };
        const pickName = (o: any) => String(o?.name ?? o?.label ?? o?.outcome ?? '');
        const h2h = arr('h2h');
        const hasPrimaryRow = (Number(event.home_odd||0) > 0) || (Number(event.draw_odd||0) > 0) || (Number(event.away_odd||0) > 0);
        const any = h2h.length;
        if (!any && !hasPrimaryRow) return null;
        const addSel = (label: string, price: number) => {
          if (!(price > 0)) { addNotification({ type: 'warning', message: 'Odd indisponível' }); return; }
          const idStr = `ev-${event.id}-${label.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;
          addToBetSlip({ 
            id: idStr, 
            event_id: event.id, 
            match: String(event.match || `${event.home_team} vs ${event.away_team}`), 
            selection: label, 
            odd: price, 
            stake: 0,
            league: event.league,
            sport: getSportFromLeague(event.league || '')
          });
          try { localStorage.setItem(`event_odds_${event.id}`, JSON.stringify({ sport: getSportFromLeague(event.league || '') })); } catch { void 0 }
        };
        const clsH2H = (n: string) => {
          const nm = String(n || '').toLowerCase();
          if (nm.includes('casa') || nm.includes('home')) return 'bg-red-600';
          if (nm.includes('empate') || nm.includes('draw')) return 'bg-gray-600';
          if (nm.includes('fora') || nm.includes('away')) return 'bg-gray-900';
          return 'bg-red-700';
        };
        const renderH2H = (!hasPrimaryRow && any > 0 ? h2h.slice(0, 3) : []).map((o: any, i: number) => {
          const name = pickName(o);
          const p = pickPrice(o);
          const translatedName = translateSelection(name);
          const label = `Resultado ${translatedName}`;
          const cls = clsH2H(name);
          const trend = o.trend || 'stable';
          return (
            <OddButton 
              key={`h2h-${i}`}
              label={label}
              price={p}
              trend={trend}
              onClick={(e) => { e.stopPropagation(); addSel(translatedName, p); }}
              className={`px-3 sm:px-4 lg:px-5 py-1 sm:py-2 rounded-lg min-w-[120px] sm:min-w-[160px] lg:min-w-[200px] ${cls} text-white hover:opacity-90 flex items-center justify-between gap-2`}
              teamName={translatedName}
            />
          );
        });
        return (
          <div className="mt-2 flex items-center justify-end gap-2 sm:gap-3 flex-wrap">
            {renderH2H.length > 0 && (
              <span className="text-xs font-semibold opacity-70 mr-1">Resultado (H2H)</span>
            )}
            {renderH2H}
          </div>
        );
      })()}

      
    </div> 
  ); 
}

export const MemoEventCard = memo(EventCard)

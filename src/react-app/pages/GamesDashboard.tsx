import { useEffect, useMemo, useState } from 'react';
import { Event } from '@/shared/types';
import { apiFetch } from '../utils/api';
import { getSportFromLeague, abbreviateTeamName } from '@/shared/helpers';
import { useLiveFeed } from '../hooks/useLiveFeed';
import { useMergedEvents } from '../hooks/useMergedEvents';
import { useApp } from '@/react-app/contexts/AppContext';
import { OddButton } from '@/react-app/components/OddButton';
import { useTrend } from '@/react-app/hooks/useTrend';

const normalizeSport = (s: string) => {
  const v = String(s || '').toLowerCase();
  if (v.includes('football') && !v.includes('american')) return 'soccer';
  if (v.includes('american') && v.includes('football')) return 'american-football';
  if (v.includes('ice') && v.includes('hockey')) return 'ice-hockey';
  return v.replace(/\s+/g, '-');
};

const pad = (n: number) => String(n).padStart(2, '0');
const formatTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  return m === 0 ? `${h}h` : `${h}h${pad(m)}`;
};

const normalizeStatusKey = (v: any) =>
  String(v ?? '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9_]+/g, '');

const FINISHED_STATUSES_FRONT = new Set([
  'FT', 'AET', 'FT_PEN', 'FTPEN',
  'AWD', 'WO', 'ABD',
  'FIN', 'FINAL', 'FINISHED', 'ENDED',
  'AOT', 'AP'
]);

const normalizeTeamKey = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const rowKeyOf = (ev: any) => {
  const ext = ev?.external_event_id;
  const fix = ev?.fixture?.id;
  const id = ev?.id;
  if (ext) return String(ext);
  if (fix) return String(fix);
  if (id) return String(id);
  const home = ev?.home_team ?? ev?.teams?.home?.name ?? '';
  const away = ev?.away_team ?? ev?.teams?.away?.name ?? '';
  const date = String(ev?.event_date ?? ev?.fixture?.date ?? '').slice(0, 10);
  return `${normalizeTeamKey(home)}-vs-${normalizeTeamKey(away)}-${date}`;
};
const labelOf = (o: any) => {
  const v = o?.label ?? o?.name ?? o?.outcome ?? (typeof o?.value === 'string' ? o.value : '');
  return String(v).toLowerCase();
};
const priceOf = (o: any) => {
  const p = Number(o?.price ?? o?.odd ?? (typeof o?.value === 'number' ? o.value : undefined) ?? 0);
  return Number.isFinite(p) && p > 1 ? p : 0;
};

// Helper Component for Odds Button in Table
const TableOddButton = ({ label, price, event, selectionLabel, marketSuspended }: any) => {
    const { addToBetSlip, addNotification } = useApp();
    const trend = useTrend(price);
    
    const handleClick = (e: any) => {
        e.stopPropagation();
        if (!(price > 0)) {
            addNotification({ type: 'warning', message: 'Odd indisponível' });
            return;
        }
        
        // Construct bet object
        const homeName = event.home_team || event.teams?.home?.name || 'Home';
        const awayName = event.away_team || event.teams?.away?.name || 'Away';
        
        let selection = selectionLabel;
        if (selectionLabel === 'Casa') selection = 'Home';
        if (selectionLabel === 'Empate') selection = 'Draw';
        if (selectionLabel === 'Fora') selection = 'Away';
        
        const eventLeague = event.league?.name || event.league || '';
        const eventSport = event.sport || getSportFromLeague(eventLeague);
        const eventId = event.id || event.fixture?.id;

        addToBetSlip({
            id: `ev-${eventId}-${selection.toLowerCase()}`,
            event_id: eventId,
            match: `${homeName} vs ${awayName}`,
            selection,
            market: 'Resultado Final',
            odd: price,
            stake: 0,
            league: typeof eventLeague === 'string' ? eventLeague : (eventLeague?.name || ''),
            sport: normalizeSport(eventSport),
            market_suspended: marketSuspended
        });
    };

    if (!(price > 0)) return <span className="text-gray-400">-</span>;

    return (
        <OddButton 
            label={label} 
            price={price} 
            trend={trend} 
            onClick={handleClick}
            className="w-full min-w-[60px] h-[32px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/30 border border-gray-200 dark:border-gray-600 flex items-center justify-between gap-1 transition-colors"
            suspended={marketSuspended ? { reason: 'SUSPENSO' } : undefined}
        />
    );
};

export default function GamesDashboard() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const { liveEvents: wsLiveEvents, isConnected } = useLiveFeed('all');

  const fetchEvents = async () => {
    try {
      const data = await apiFetch<any>(
        '/api/events/by-sport?sports=all&include=odds&only=both&days=3&realtime=0&requireOdds=1',
        { cache: 'no-store', timeout: 20000 },
      );
      
      let raw: Event[] = [];
      if (Array.isArray(data)) {
        raw = data;
      } else if (Array.isArray(data?.response)) {
        raw = data.response;
      } else if (data?.live || data?.pregame) {
        raw = [...(data.live || []), ...(data.pregame || [])];
      }
      
      const finishedStatuses = ['FT', 'AET', 'PEN', 'Finished', 'Match Finished', 'AOT', 'AP', 'Ended', 'Final', 'WO', 'ABD', 'AWD'];
      const now = Date.now();

      const arr = raw.filter(ev => {
         const status = (ev as any).fixture?.status?.short || (ev as any).status;
         if (finishedStatuses.includes(status)) {
            const dstr = ev.event_date || (ev as any).fixture?.date;
            const d = dstr ? new Date(dstr) : null;
            if (d && !Number.isNaN(d.getTime()) && d.getTime() < now - 8 * 60 * 60 * 1000) {
                return false;
            }
         }
         // Filter out old live events
         const isLive = Number(ev.is_live) === 1 || ['1H','2H','HT','ET','P','LIVE'].includes(status);
         if (isLive) {
            const dstr = ev.event_date || (ev as any).fixture?.date;
            const d = dstr ? new Date(dstr) : null;
            if (d && !Number.isNaN(d.getTime()) && d.getTime() < now - 12 * 60 * 60 * 1000) {
                return false;
            }
            return true;
         }
         // Filter out old pre-game
         const dstr = ev.event_date || (ev as any).fixture?.date;
         const d = dstr ? new Date(dstr) : null;
         if (d && !Number.isNaN(d.getTime()) && d.getTime() < now - 6 * 60 * 60 * 1000) {
             return false;
         }
         return true;
      });

      setEvents(arr);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    // Removed polling setInterval as requested ("nao vamos usar polling")
  }, []);

  // Use robust merge hook
  const mergedEvents = useMergedEvents(events, wsLiveEvents);

  const processRow = (ev: any) => {
      const markets = ev.markets || ev.odds || {};
      let h2hRaw = markets.h2h || markets.main || markets['1x2'] || null;
      
      // Normalize h2h structure
      if (h2hRaw && !Array.isArray(h2hRaw)) {
          if (Array.isArray(h2hRaw.outcomes)) h2hRaw = h2hRaw.outcomes;
          else if (Array.isArray(markets['1x2']?.outcomes)) h2hRaw = markets['1x2'].outcomes;
      }
      const h2h = Array.isArray(h2hRaw) ? h2hRaw : [];
      
      const canon = (s: string) => s.replace(/[\s.\-_,]/g, '').toLowerCase();
      const findBy = (labels: string[]) => {
        const it = h2h.find((x: any) => {
          const lb = labelOf(x);
          return labels.includes(lb) || canon(lb) === canon(labels[0] || '');
        });
        return it ? priceOf(it) : 0;
      };

      let homeOdd = Number(ev.home_odd || 0) || findBy(['home', 'casa', '1']);
      let awayOdd = Number(ev.away_odd || 0) || findBy(['away', 'fora', '2']);
      let drawOdd = Number(ev.draw_odd || 0) || findBy(['draw', 'empate', 'x']);

      // Fallback for array position if names fail
      if (!(homeOdd > 0) && h2h.length >= 2) homeOdd = priceOf(h2h[0]);
      if (!(awayOdd > 0) && h2h.length >= 2) awayOdd = priceOf(h2h[1]); // Often away is 2nd in 2-way, or 3rd in 3-way?
      // Actually usually: 1, X, 2. So Home=0, Draw=1, Away=2.
      // But for 2-way: Home=0, Away=1.
      if (!(drawOdd > 0) && h2h.length === 3) drawOdd = priceOf(h2h[1]);
      if (!(awayOdd > 0) && h2h.length === 3) awayOdd = priceOf(h2h[2]);

      const statusRaw =
        ev.status?.short ||
        ev.status?.long ||
        (typeof ev.status === 'string' ? ev.status : '') ||
        ev.fixture?.status?.short ||
        ev.fixture?.status?.long ||
        'NS';
      const statusShort = String(statusRaw || 'NS');
      const statusKey = normalizeStatusKey(statusShort);
      const isFinished = FINISHED_STATUSES_FRONT.has(statusKey) || /MATCHFINISHED|FULLTIME|GAMEOVER/.test(statusKey);
      const eventTime = ev.event_date || ev.date || ev.fixture?.date;
      const eventMs = eventTime ? new Date(eventTime).getTime() : 0;
      const now = Date.now();
      // Stale: has is_live=1 but started more than 5h ago and no active status
      const isStale = eventMs > 0 && eventMs < now - 5 * 60 * 60 * 1000;

      const sportRaw = (ev as any)?.sport;
      const sport = sportRaw ? normalizeSport(sportRaw) : getSportFromLeague(String(ev.league || ev.league?.name || ''));
      
      return {
        rawEvent: ev,
        sport,
        competition: String(ev.league?.name || ev.league || 'Unknown League'),
        home: abbreviateTeamName(String(ev.home_team || ev.home || ev.teams?.home?.name || (ev.match ? ev.match.split(' vs ')[0] : '') || 'Home')),
        away: abbreviateTeamName(String(ev.away_team || ev.away || ev.teams?.away?.name || (ev.match ? ev.match.split(' vs ')[1] : '') || 'Away')),
        time: formatTime(eventTime),
        homeOdd,
        drawOdd,
        awayOdd,
        status: statusShort,
        elapsed: ev.elapsed ?? ev.fixture?.status?.elapsed ?? 0,
        isLive: !isFinished && !isStale && (ev.is_live === 1 || ev.is_live === true || ['1H','2H','HT','ET','P','LIVE','Q1','Q2','Q3','Q4','OT','BT','IN','IN_PROGRESS'].includes(statusKey))
      };
  };

  const rows = useMemo(() => (mergedEvents || []).map(processRow), [mergedEvents]);

  // Separate Live and Pregame
  const liveRows = rows.filter(r => r.isLive);
  const pregameRows = rows.filter(r => !r.isLive);

  const groupedPregame = useMemo(() => {
    return pregameRows.reduce((acc: Record<string, Record<string, any[]>>, r: any) => {
      if (!acc[r.sport]) acc[r.sport] = {};
      if (!acc[r.sport][r.competition]) acc[r.sport][r.competition] = [];
      acc[r.sport][r.competition].push(r);
      return acc;
    }, {});
  }, [pregameRows]);

  return (
    <div className="p-4 space-y-8">
      {/* LIVE SECTION */}
      <div>
        <div className="flex items-center gap-4 mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-600 animate-pulse"></span>
                Ao Vivo
            </h2>
            <div className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="opacity-70">{isConnected ? 'WS Conectado' : 'Reconectando...'}</span>
            </div>
        </div>

        {liveRows.length > 0 ? (
            <div className="overflow-x-auto border rounded-lg shadow-sm">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase font-semibold text-gray-500">
                        <tr>
                            <th className="px-3 py-2 text-left">Jogo</th>
                            <th className="px-3 py-2 text-center w-16">Min</th>
                            <th className="px-3 py-2 text-center w-20">1</th>
                            <th className="px-3 py-2 text-center w-20">X</th>
                            <th className="px-3 py-2 text-center w-20">2</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {liveRows.map((row, i) => (
                            <tr key={rowKeyOf(row.rawEvent) || i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                <td className="px-3 py-2">
                                    <div className="font-bold">{row.home}</div>
                                    <div className="font-bold">{row.away}</div>
                                    <div className="text-xs text-gray-400 mt-0.5">{row.competition}</div>
                                </td>
                                <td className="px-3 py-2 text-center font-mono text-red-600 font-bold">
                                    {row.elapsed}'
                                </td>
                                <td className="px-3 py-2">
                                    <TableOddButton label="1" price={row.homeOdd} event={row.rawEvent} selectionLabel="Casa" />
                                </td>
                                <td className="px-3 py-2">
                                    <TableOddButton label="X" price={row.drawOdd} event={row.rawEvent} selectionLabel="Empate" />
                                </td>
                                <td className="px-3 py-2">
                                    <TableOddButton label="2" price={row.awayOdd} event={row.rawEvent} selectionLabel="Fora" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ) : (
            <div className="p-8 text-center text-gray-400 border rounded-lg border-dashed">
                Nenhum jogo ao vivo no momento.
            </div>
        )}
      </div>

      {/* PREGAME SECTION */}
      {Object.entries(groupedPregame).map(([sport, competitions]) => (
        <div key={sport} className="space-y-4">
          <h2 className="text-lg font-bold capitalize border-b pb-2">{sport}</h2>
          {Object.entries(competitions).map(([competition, games]) => (
            <div key={competition} className="bg-white dark:bg-gray-900 rounded-lg border shadow-sm overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b text-xs font-bold uppercase text-gray-500">
                {competition}
              </div>
              <table className="w-full text-sm">
                 <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {games.map((row: any, i: number) => (
                        <tr key={rowKeyOf(row.rawEvent) || i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                             <td className="px-3 py-2 w-16 text-xs text-gray-400 text-center">
                                {row.time}
                             </td>
                             <td className="px-3 py-2">
                                <div className="flex flex-col sm:flex-row sm:gap-2">
                                    <span>{row.home}</span>
                                    <span className="hidden sm:inline text-gray-300">-</span>
                                    <span>{row.away}</span>
                                </div>
                             </td>
                             <td className="px-3 py-2 w-20">
                                <TableOddButton label="1" price={row.homeOdd} event={row.rawEvent} selectionLabel="Casa" />
                             </td>
                             <td className="px-3 py-2 w-20">
                                <TableOddButton label="X" price={row.drawOdd} event={row.rawEvent} selectionLabel="Empate" />
                             </td>
                             <td className="px-3 py-2 w-20">
                                <TableOddButton label="2" price={row.awayOdd} event={row.rawEvent} selectionLabel="Fora" />
                             </td>
                        </tr>
                    ))}
                 </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
      
      {loading && (
          <div className="fixed inset-0 bg-white/50 dark:bg-black/50 flex items-center justify-center z-50">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
          </div>
      )}
    </div>
  );
}

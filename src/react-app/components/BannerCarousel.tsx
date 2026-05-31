import { useState, useEffect, useCallback } from "react";
import { useApp } from "@/react-app/contexts/AppContext";
import { apiFetch } from "@/react-app/utils/api";
import { useNavigate } from "react-router-dom";

interface BannerEvent {
  id: string;
  home: string;
  away: string;
  league: string;
  country: string;
  sport: string;
  time: string;
  isLive: boolean;
  liveClock: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeOdd: number;
  drawOdd: number;
  awayOdd: number;
  ou25Over: number | null;
  ou25Under: number | null;
  bttsYes: number | null;
  goalsHome: number | null;
  goalsAway: number | null;
  elapsedMin: number;
}

const SPORT_COLORS: Record<string, { from: string; to: string; accent: string }> = {
  soccer:           { from: '#0a1628', to: '#0f2d1a', accent: '#16a34a' },
  basketball:       { from: '#0a1628', to: '#1a1000', accent: '#f59e0b' },
  tennis:           { from: '#0a1628', to: '#0f2510', accent: '#84cc16' },
  handball:         { from: '#0a1628', to: '#1a0a00', accent: '#f97316' },
  volleyball:       { from: '#0a1628', to: '#0f0a28', accent: '#8b5cf6' },
  'ice-hockey':     { from: '#0a1628', to: '#001a28', accent: '#38bdf8' },
  default:          { from: '#0a1628', to: '#1a0a1a', accent: '#e11d48' },
};

function SportBg({ sport }: { sport: string }) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('basket')) return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220" className="absolute inset-0 w-full h-full object-cover opacity-15">
      <rect width="400" height="220" fill="none"/>
      <circle cx="200" cy="110" r="70" stroke="#f59e0b" strokeWidth="3" fill="none"/>
      <line x1="200" y1="40" x2="200" y2="180" stroke="#f59e0b" strokeWidth="2"/>
      <line x1="130" y1="110" x2="270" y2="110" stroke="#f59e0b" strokeWidth="2"/>
      <rect x="20" y="60" width="60" height="100" rx="4" stroke="#f59e0b" strokeWidth="2" fill="none"/>
      <rect x="320" y="60" width="60" height="100" rx="4" stroke="#f59e0b" strokeWidth="2" fill="none"/>
    </svg>
  );
  if (s.includes('tennis')) return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220" className="absolute inset-0 w-full h-full object-cover opacity-15">
      <rect x="40" y="30" width="320" height="160" rx="6" stroke="#84cc16" strokeWidth="2" fill="none"/>
      <line x1="200" y1="30" x2="200" y2="190" stroke="#84cc16" strokeWidth="2"/>
      <line x1="40" y1="110" x2="360" y2="110" stroke="#84cc16" strokeWidth="1.5"/>
      <line x1="40" y1="80" x2="360" y2="80" stroke="#84cc16" strokeWidth="1" strokeDasharray="4 4"/>
      <line x1="40" y1="140" x2="360" y2="140" stroke="#84cc16" strokeWidth="1" strokeDasharray="4 4"/>
    </svg>
  );
  // Default soccer field
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220" className="absolute inset-0 w-full h-full object-cover opacity-15">
      <rect x="20" y="20" width="360" height="180" rx="6" stroke="#16a34a" strokeWidth="2" fill="none"/>
      <line x1="200" y1="20" x2="200" y2="200" stroke="#16a34a" strokeWidth="1.5"/>
      <circle cx="200" cy="110" r="35" stroke="#16a34a" strokeWidth="1.5" fill="none"/>
      <rect x="20" y="70" width="55" height="80" rx="3" stroke="#16a34a" strokeWidth="1.5" fill="none"/>
      <rect x="325" y="70" width="55" height="80" rx="3" stroke="#16a34a" strokeWidth="1.5" fill="none"/>
      <rect x="20" y="90" width="25" height="40" rx="2" stroke="#16a34a" strokeWidth="1" fill="none"/>
      <rect x="355" y="90" width="25" height="40" rx="2" stroke="#16a34a" strokeWidth="1" fill="none"/>
    </svg>
  );
}

function TeamLogo({ src, name }: { src: string | null; name: string }) {
  const [ok, setOk] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');

  useEffect(() => { setOk(false); }, [src]);

  if (src && ok) {
    return (
      <div className="w-14 h-14 rounded-full bg-black/40 border border-white/20 flex items-center justify-center overflow-hidden shadow-lg">
        <img src={src} alt={name} className="w-12 h-12 object-contain" onError={() => setOk(false)} onLoad={() => setOk(true)} />
      </div>
    );
  }

  if (src && !ok) {
    return (
      <div className="w-14 h-14 rounded-full bg-black/40 border border-white/20 flex items-center justify-center overflow-hidden shadow-lg">
        <img src={src} alt={name} className="w-12 h-12 object-contain hidden" onLoad={() => setOk(true)} onError={() => setOk(false)} />
        <span className="text-white font-bold text-base">{initials}</span>
      </div>
    );
  }

  return (
    <div className="w-14 h-14 rounded-full bg-black/40 border border-white/20 flex items-center justify-center shadow-lg">
      <span className="text-white font-bold text-base">{initials}</span>
    </div>
  );
}

function OddChip({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  if (!value || value <= 1) return null;
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center bg-black/50 hover:bg-white/10 active:scale-95 border border-white/20 hover:border-white/40 rounded-lg px-3 py-2 transition-all duration-150 min-w-[52px] cursor-pointer"
    >
      <span className="text-white/60 text-[10px] font-medium mb-0.5">{label}</span>
      <span className="text-white font-bold text-sm">{value.toFixed(2)}</span>
    </button>
  );
}

export function BannerCarousel() {
  const { addToBetSlip, addNotification } = useApp();
  const navigate = useNavigate();
  const [events, setEvents] = useState<BannerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);

  const handleBet = useCallback((ev: BannerEvent, label: string, odd: number) => {
    if (!odd || odd <= 1) return;
    addToBetSlip({
      id: `banner-${ev.id}-${label}`,
      event_id: ev.id,
      match: `${ev.home} vs ${ev.away}`,
      selection: label,
      odd,
      stake: 0,
      league: ev.league,
      sport: ev.sport,
    });
    addNotification({ type: 'success', message: `${label} adicionado ao boletim!` });
  }, [addToBetSlip, addNotification]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch<any>(
          '/api/events/by-sport?sports=all&include=odds&realtime=1&only=live&days=0&requireOdds=1',
          { cache: 'no-store', timeout: 12000 },
        );
        const live    = Array.isArray(data?.live)    ? data.live    : [];
        const pregame = Array.isArray(data?.pregame) ? data.pregame : [];

        // Prioritize live events with odds, then pregame with odds, then all
        const score = (e: any) => {
          let s = 0;
          if (Number(e.is_live) === 1) s += 100;
          if (Number(e.home_odd) > 1) s += 50;
          const topLeagues = ['premier league','champions league','la liga','serie a','bundesliga','ligue 1','copa','euro','nations league','championship','primeira liga'];
          const leagueName = String(e.league?.name || e.league || '').toLowerCase();
          if (topLeagues.some(l => leagueName.includes(l))) s += 40;
          return s;
        };

        const all = [...live, ...pregame].sort((a, b) => score(b) - score(a));

        const mapped: BannerEvent[] = [];
        for (const e of all) {
          const home = e.home_team || e.home || '';
          const away = e.away_team || e.away || '';
          if (!home || !away) continue;

          const rawDate = e.event_date || e.date || '';
          const d = rawDate ? new Date(rawDate) : null;
          const now = new Date();
          if (d) {
            let adj = d;
            if (Math.abs(now.getTime() - d.getTime()) > 300 * 86400_000) {
              adj = new Date(d);
              adj.setFullYear(now.getFullYear());
            }
            if (adj.getTime() < now.getTime() - 3 * 3600_000) continue;
          }

          // Parse markets for OU/BTTS
          let ou25Over: number | null = null, ou25Under: number | null = null, bttsYes: number | null = null;
          const markets = Array.isArray(e.markets) ? e.markets : [];
          for (const m of markets) {
            const key = String(m?.key || '').toLowerCase();
            if ((key.includes('ou_2') || key.includes('ou_2_5')) && m.selections) {
              for (const s of m.selections) {
                const lbl = String(s?.label || '').toLowerCase();
                if (lbl.includes('mais') || lbl.includes('over'))  ou25Over  = Number(s.odd) || ou25Over;
                if (lbl.includes('menos') || lbl.includes('under')) ou25Under = Number(s.odd) || ou25Under;
              }
            }
            if (key === 'btts' && m.selections) {
              for (const s of m.selections) {
                const lbl = String(s?.label || '').toLowerCase();
                if (lbl === 'sim' || lbl === 'yes') bttsYes = Number(s.odd) || bttsYes;
              }
            }
          }

          const timeStr = d
            ? new Intl.DateTimeFormat('pt-PT', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(
                (() => { const adj = new Date(d); if (Math.abs(now.getTime() - d.getTime()) > 300*86400_000) adj.setFullYear(now.getFullYear()); return adj; })()
              ).toUpperCase()
            : '';

          const goalsHome = e.goals?.home ?? null;
          const goalsAway = e.goals?.away ?? null;
          const elapsedMin = Number(e.elapsed ?? e.fixture?.status?.elapsed ?? 0) || 0;
          const statusShort = String(e.status ?? e.fixture?.status?.short ?? '').trim();
          const statusLong = String(e.fixture?.status?.long ?? e.status_long ?? e.statusLong ?? '').trim();
          const timerRaw = String(e.timer ?? e.fixture?.status?.timer ?? '').trim();
          const statusU = statusShort.toUpperCase();
          const liveClock = (() => {
            if (timerRaw) return timerRaw;
            if (statusU === 'HT') return 'HT';
            if (statusU === 'BT' || statusU === 'INT') return 'Intervalo';
            if (elapsedMin > 0) return `${elapsedMin}'`;
            const cand = statusLong || statusShort;
            if (!cand) return '';
            if (/\b(TOP|BOTTOM)\b/i.test(cand) || /\b(1ST|2ND|3RD|4TH|5TH|6TH|7TH|8TH|9TH)\b/i.test(cand)) return cand;
            if (statusU === 'LIVE') return '';
            return cand.length <= 10 ? cand : '';
          })();

          mapped.push({
            id: String(e.id || e.external_event_id || `${home}-${away}`),
            home, away,
            league: String(e.league?.name || e.league || 'Liga'),
            country: String(e.country || ''),
            sport: String(e.sport || 'soccer'),
            time: timeStr,
            isLive: Number(e.is_live) === 1,
            liveClock,
            homeLogo: e.home_team_logo || null,
            awayLogo: e.away_team_logo || null,
            homeOdd:  Number(e.home_odd) || 0,
            drawOdd:  Number(e.draw_odd) || 0,
            awayOdd:  Number(e.away_odd) || 0,
            ou25Over, ou25Under, bttsYes,
            goalsHome,
            goalsAway,
            elapsedMin,
          });

          if (mapped.length >= 6) break;
        }

        if (mapped.length > 0) setEvents(mapped);
      } catch { /* keep empty */ } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Auto-advance
  useEffect(() => {
    if (events.length < 2) return;
    const t = setInterval(() => setActiveIdx(i => (i + 1) % events.length), 6000);
    return () => clearInterval(t);
  }, [events.length]);

  if (loading) return (
    <div className="w-full h-48 rounded-2xl bg-gray-900/50 animate-pulse border border-gray-800" />
  );

  if (events.length === 0) {
    return <PromoBanners />;
  }

  const ev = events[activeIdx];
  const colors = SPORT_COLORS[ev.sport] || SPORT_COLORS.default;

  return (
    <div className="w-full space-y-3">
      {/* Main Featured Banner */}
      <div
        className="relative w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl cursor-pointer"
        style={{ background: `linear-gradient(135deg, ${colors.from} 0%, ${colors.to} 100%)`, minHeight: 200 }}
        onClick={() => navigate(`/event/${ev.id}`)}
      >
        {/* Sport field background */}
        <div className="absolute inset-0 pointer-events-none">
          <SportBg sport={ev.sport} />
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/40 pointer-events-none" />

        {/* Shine animation */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-y-0 -left-full w-1/3 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shine_4s_ease-in-out_infinite]" />
        </div>

        <div className="relative z-10 p-5 flex flex-col h-full" style={{ minHeight: 200 }}>
          {/* Top row: league + live badge */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-white/50 text-xs font-medium uppercase tracking-wider truncate max-w-[160px]">
                {ev.country ? `${ev.country} · ` : ''}{ev.league}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {ev.isLive && (
                <span className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
                  AO VIVO
                </span>
              )}
              {!ev.isLive && ev.time && (
                <span className="text-white/50 text-xs font-medium">{ev.time}</span>
              )}
            </div>
          </div>

          {/* Teams */}
          <div className="flex items-center justify-between flex-1 gap-4 mb-4">
            {/* Home team */}
            <div className="flex flex-col items-center gap-2 flex-1">
              <TeamLogo src={ev.homeLogo} name={ev.home} />
              <span className="text-white font-bold text-sm text-center leading-tight max-w-[100px] line-clamp-2">{ev.home}</span>
            </div>

            {/* Score / VS */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              {ev.isLive && ev.goalsHome !== null && ev.goalsAway !== null ? (
                <>
                  <span className="text-white text-2xl font-black tabular-nums">{ev.goalsHome} – {ev.goalsAway}</span>
                  {ev.liveClock && (
                    <span className="text-red-400 text-xs font-bold bg-black/30 px-2 py-0.5 rounded">{ev.liveClock}</span>
                  )}
                  <span className="flex h-2 w-2 relative mt-0.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                </>
              ) : (
                <>
                  <span className="text-white/40 text-xs font-bold tracking-widest">VS</span>
                  {ev.isLive && (
                    <span className="text-red-400 text-xs font-bold animate-pulse">
                      ● {ev.liveClock || 'AO VIVO'}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Away team */}
            <div className="flex flex-col items-center gap-2 flex-1">
              <TeamLogo src={ev.awayLogo} name={ev.away} />
              <span className="text-white font-bold text-sm text-center leading-tight max-w-[100px] line-clamp-2">{ev.away}</span>
            </div>
          </div>

          {/* Odds row */}
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <OddChip label="1" value={ev.homeOdd} onClick={() => handleBet(ev, `1 - ${ev.home}`, ev.homeOdd)} />
            {ev.drawOdd > 1 && <OddChip label="X" value={ev.drawOdd} onClick={() => handleBet(ev, 'X - Empate', ev.drawOdd)} />}
            <OddChip label="2" value={ev.awayOdd} onClick={() => handleBet(ev, `2 - ${ev.away}`, ev.awayOdd)} />
            {ev.ou25Over && <OddChip label="+2.5" value={ev.ou25Over} onClick={() => handleBet(ev, 'Mais 2.5 Golos', ev.ou25Over!)} />}
            {ev.bttsYes && <OddChip label="AM" value={ev.bttsYes} onClick={() => handleBet(ev, 'Ambas Marcam - Sim', ev.bttsYes!)} />}
          </div>
        </div>
      </div>

      {/* Thumbnail row */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {events.map((e, i) => {
          const c = SPORT_COLORS[e.sport] || SPORT_COLORS.default;
          return (
            <button
              key={e.id}
              onClick={() => setActiveIdx(i)}
              className={`flex-none flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 transition-all duration-200 min-w-[140px] text-left ${
                i === activeIdx
                  ? 'border-white/40 bg-white/10 shadow-lg'
                  : 'border-white/10 bg-black/30 hover:bg-white/5'
              }`}
            >
              {e.isLive && (
                <span className="text-red-400 text-[9px] font-bold uppercase tracking-wider">● Ao Vivo</span>
              )}
              <span className="text-white text-xs font-semibold leading-tight truncate w-full">{e.home}</span>
              <span className="text-white/40 text-[10px]">vs</span>
              <span className="text-white text-xs font-semibold leading-tight truncate w-full">{e.away}</span>
              {e.homeOdd > 1 && (
                <div className="flex gap-1 mt-1">
                  <span className="text-white/70 text-[10px]">{e.homeOdd.toFixed(2)}</span>
                  {e.drawOdd > 1 && <span className="text-white/70 text-[10px]">· {e.drawOdd.toFixed(2)}</span>}
                  {e.awayOdd > 1 && <span className="text-white/70 text-[10px]">· {e.awayOdd.toFixed(2)}</span>}
                </div>
              )}
              {/* Active indicator */}
              {i === activeIdx && (
                <div className="w-full h-0.5 rounded-full mt-1" style={{ background: c.accent }} />
              )}
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes shine {
          0% { left: -100%; }
          50% { left: 200%; }
          100% { left: 200%; }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
    </div>
  );
}

// ── Promotional banners (shown when no event data available) ──────────────
function PromoBanners() {
  const promos = [
    {
      id: 'p1',
      title: 'Bónus de Boas-Vindas',
      subtitle: 'Depósito mínimo 10€',
      highlight: '100% até 100€',
      tag: 'OFERTA',
      color: '#16a34a',
      bg: 'from-[#0a2010] to-[#0f2d1a]',
    },
    {
      id: 'p2',
      title: 'Apostas ao Vivo',
      subtitle: 'Odds em tempo real',
      highlight: '+ 10.000 Eventos',
      tag: 'AO VIVO',
      color: '#e11d48',
      bg: 'from-[#1a0010] to-[#2d0010]',
    },
    {
      id: 'p3',
      title: 'Multi-Aposta',
      subtitle: 'Combine seleções',
      highlight: 'Odds Aumentadas',
      tag: 'BOOST',
      color: '#f59e0b',
      bg: 'from-[#1a1000] to-[#2d1a00]',
    },
    {
      id: 'p4',
      title: 'Cashout Disponível',
      subtitle: 'Levante quando quiser',
      highlight: 'Controle Total',
      tag: 'CASHOUT',
      color: '#38bdf8',
      bg: 'from-[#00101a] to-[#001a28]',
    },
    {
      id: 'p5',
      title: 'Pagamento Seguro',
      subtitle: 'MBway · Multibanco · Cartão',
      highlight: 'Depósito Imediato',
      tag: 'PAGAMENTO',
      color: '#8b5cf6',
      bg: 'from-[#0a001a] to-[#15002d]',
    },
  ];

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
      {promos.map(p => (
        <div
          key={p.id}
          className={`flex-none rounded-2xl bg-gradient-to-br ${p.bg} border border-white/10 p-4 min-w-[200px] flex flex-col gap-2 shadow-lg`}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full w-fit" style={{ background: p.color + '33', color: p.color }}>
            {p.tag}
          </span>
          <p className="text-white font-bold text-sm leading-tight">{p.title}</p>
          <p className="text-white/50 text-xs">{p.subtitle}</p>
          <p className="font-black text-base mt-auto" style={{ color: p.color }}>{p.highlight}</p>
        </div>
      ))}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

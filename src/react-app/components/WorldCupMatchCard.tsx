import { useNavigate } from 'react-router-dom';
import { useApp } from '@/react-app/contexts/AppContext';

const FLAG: Record<string, string> = {
  'Mexico': '🇲🇽', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷',
  'Czech Republic': '🇨🇿', 'Czechia': '🇨🇿',
  'Canada': '🇨🇦', 'Bosnia and Herzegovina': '🇧🇦', 'Bosnia & Herzegovina': '🇧🇦',
  'Qatar': '🇶🇦', 'Switzerland': '🇨🇭',
  'Brazil': '🇧🇷', 'Morocco': '🇲🇦', 'Haiti': '🇭🇹', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'USA': '🇺🇸', 'United States': '🇺🇸', 'Paraguay': '🇵🇾',
  'Australia': '🇦🇺', 'Türkiye': '🇹🇷', 'Turkey': '🇹🇷',
  'Germany': '🇩🇪', "Curaçao": '🇨🇼', "Côte d'Ivoire": '🇨🇮', 'Ecuador': '🇪🇨',
  'Netherlands': '🇳🇱', 'Japan': '🇯🇵', 'Sweden': '🇸🇪', 'Tunisia': '🇹🇳',
  'Belgium': '🇧🇪', 'Egypt': '🇪🇬', 'Iran': '🇮🇷', 'New Zealand': '🇳🇿',
  'Spain': '🇪🇸', 'Cabo Verde': '🇨🇻', 'Saudi Arabia': '🇸🇦', 'Uruguay': '🇺🇾',
  'France': '🇫🇷', 'Senegal': '🇸🇳', 'Iraq': '🇮🇶', 'Norway': '🇳🇴',
  'Argentina': '🇦🇷', 'Algeria': '🇩🇿', 'Austria': '🇦🇹', 'Jordan': '🇯🇴',
  'Portugal': '🇵🇹', 'DR Congo': '🇨🇩', 'Uzbekistan': '🇺🇿', 'Colombia': '🇨🇴',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatia': '🇭🇷', 'Ghana': '🇬🇭', 'Panama': '🇵🇦',
};

function flag(name: string) {
  if (!name) return '🏳️';
  return FLAG[name] || FLAG[name.toLowerCase()] || '🏳️';
}

function groupFromLeague(league: string) {
  const m = league.match(/Group\s+([A-L])/i);
  return m ? `Grupo ${m[1].toUpperCase()}` : '';
}

interface Props {
  event: any;
}

export default function WorldCupMatchCard({ event }: Props) {
  const navigate = useNavigate();
  const { betSlip, addToBetSlip, addNotification } = useApp();

  const home = event?.home_team || event?.teams?.home?.name || 'Casa';
  const away = event?.away_team || event?.teams?.away?.name || 'Fora';
  const league = String(event?.league?.name || event?.league || '');
  const group = groupFromLeague(league);
  const dateRaw = event?.event_date || event?.fixture?.date || '';
  const dateObj = dateRaw ? new Date(dateRaw) : null;
  const eventId = String(event?.id || event?.fixture?.id || '');

  const homeOdd = Number(event?.home_odd || 0);
  const drawOdd = Number(event?.draw_odd || 0);
  const awayOdd = Number(event?.away_odd || 0);
  const hasOdds = homeOdd > 1.01 && awayOdd > 1.01;

  const dateStr = dateObj
    ? dateObj.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }).toUpperCase()
    : '';
  const timeStr = dateObj
    ? dateObj.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
    : '';

  const isActive = (sel: string) =>
    betSlip.some((b) => b.event_id === eventId && b.selection === sel);

  const handleBet = (e: React.MouseEvent, label: string, selKey: string, odd: number) => {
    e.stopPropagation();
    if (!eventId || odd <= 1.01) return;
    const idStr = `ev-${eventId}-${selKey}`;
    addToBetSlip({
      id: idStr,
      event_id: eventId,
      match: `${home} vs ${away}`,
      selection: selKey,
      market: 'Resultado Final',
      odd,
      stake: 0,
      league: typeof league === 'string' ? league : '',
      sport: 'soccer',
      suspended: false,
      market_suspended: false,
    } as any);
    addNotification({ type: 'success', message: `${label} @ ${odd.toFixed(2)} adicionado!` });
  };

  const OddsBtn = ({
    label,
    selKey,
    odd,
  }: {
    label: string;
    selKey: string;
    odd: number;
  }) => {
    const active = isActive(selKey);
    return (
      <button
        type="button"
        onClick={(e) => handleBet(e, label, selKey, odd)}
        className="flex flex-col items-center justify-center w-[54px] h-[48px] rounded-xl transition-all active:scale-95"
        style={{
          background: active
            ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
            : 'rgba(255,215,80,0.09)',
          border: active
            ? '1px solid rgba(220,38,38,0.8)'
            : '1px solid rgba(255,215,80,0.24)',
          boxShadow: active ? '0 0 14px rgba(220,38,38,0.45)' : 'none',
        }}
      >
        <span className="text-[9px] font-bold text-amber-200/50 uppercase leading-none mb-0.5">
          {label}
        </span>
        <span
          className="text-sm font-black leading-none tabular-nums"
          style={{ color: active ? '#fff' : '#ffd060' }}
        >
          {odd.toFixed(2)}
        </span>
      </button>
    );
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => eventId && navigate(`/event/${eventId}`)}
      onKeyDown={(e) => e.key === 'Enter' && eventId && navigate(`/event/${eventId}`)}
      className="w-full text-left rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
      style={{
        background: 'linear-gradient(135deg, rgba(26,14,2,0.99) 0%, rgba(14,7,0,0.99) 100%)',
        border: '1px solid rgba(255,215,80,0.20)',
        boxShadow: '0 4px 22px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,80,0.09)',
      }}
    >
      {/* Header row */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ borderBottom: '1px solid rgba(255,215,80,0.09)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black tracking-widest text-amber-300/65 uppercase">
            {dateStr}
          </span>
          {timeStr && (
            <span className="text-[10px] font-bold text-amber-100/40">· {timeStr}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {group && (
            <span
              className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(212,151,43,0.15)',
                border: '1px solid rgba(255,215,80,0.28)',
                color: '#ffd87a',
              }}
            >
              {group}
            </span>
          )}
          <span className="text-[10px] font-bold text-amber-200/30 uppercase tracking-wide">
            🌍 Copa 2026
          </span>
        </div>
      </div>

      {/* Main: teams + odds */}
      <div className="flex items-center px-4 py-4 gap-3">
        <div className="flex-1 flex flex-col items-center gap-1.5">
          <span className="text-3xl leading-none">{flag(home)}</span>
          <span className="text-xs font-bold text-white/90 text-center leading-tight max-w-[80px]">
            {home}
          </span>
        </div>

        <div className="flex flex-col items-center gap-2 shrink-0">
          {hasOdds ? (
            <div className="flex items-center gap-1.5">
              <OddsBtn label="1" selKey="Home" odd={homeOdd} />
              {drawOdd > 1.01 && <OddsBtn label="X" selKey="Draw" odd={drawOdd} />}
              <OddsBtn label="2" selKey="Away" odd={awayOdd} />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                {['1', 'X', '2'].map((l) => (
                  <div
                    key={l}
                    className="flex flex-col items-center justify-center w-[54px] h-[48px] rounded-xl"
                    style={{
                      background: 'rgba(255,215,80,0.04)',
                      border: '1px solid rgba(255,215,80,0.10)',
                    }}
                  >
                    <span className="text-[9px] font-bold text-amber-200/25 uppercase leading-none mb-0.5">
                      {l}
                    </span>
                    <span className="text-sm font-black text-amber-200/18 leading-none">—</span>
                  </div>
                ))}
              </div>
              <span
                className="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full"
                style={{
                  background: 'rgba(212,151,43,0.10)',
                  border: '1px solid rgba(255,215,80,0.18)',
                  color: '#ffd060',
                }}
              >
                ⏳ Odds em breve
              </span>
            </>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center gap-1.5">
          <span className="text-3xl leading-none">{flag(away)}</span>
          <span className="text-xs font-bold text-white/90 text-center leading-tight max-w-[80px]">
            {away}
          </span>
        </div>
      </div>

      {/* Bottom chips */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderTop: '1px solid rgba(255,215,80,0.06)' }}
      >
        {['Resultado', 'Mais/Menos', 'Ambas Marcam'].map((m) => (
          <span
            key={m}
            className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.25)',
            }}
          >
            {m}
          </span>
        ))}
        {hasOdds && (
          <span
            className="ml-auto text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(34,197,94,0.10)',
              border: '1px solid rgba(34,197,94,0.28)',
              color: '#4ade80',
            }}
          >
            ✓ Odds disponíveis
          </span>
        )}
      </div>
    </div>
  );
}

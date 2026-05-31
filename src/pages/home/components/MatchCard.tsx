import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCachedLogo, cacheLogo } from '../../../services/logoCache';
import { useTheme } from '../../../contexts/ThemeContext';
import OddsBlockedOverlay from '../../../components/feature/OddsBlockedOverlay';
import { useMatchIncidents } from '../../../hooks/useMatchIncidents';
import { useMatchScore, useMatchOdds } from '../../../hooks/useLiveScoresWebSocket';

interface Match {
  id?: string | number;
  fixtureId?: string | number;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  time?: string;
  startTime?: string;
  league?: string;
  minute?: string | number;
  period?: string;
  elapsed?: number | null;
  statusShort?: string;
  odds?: {
    home?: number;
    draw?: number;
    away?: number;
  };
  homeTeamLogo?: string;
  awayTeamLogo?: string;
}

interface Selection {
  homeTeam: string;
  awayTeam: string;
  selection: string;
}

interface MatchCardProps {
  match: Match;
  isLive?: boolean;
  selections: Selection[];
  onAddSelection: (match: Match, selection: string, odd: number, market?: string) => void;
  onOpenMarkets: (match: Match) => void;
  index?: number;
  showLogos?: boolean;
}

// ✅ Detectar tipo de desporto
const detectSportType = (match: Match): 'soccer' | 'basketball' | 'hockey' | 'baseball' | 'volleyball' | 'other' => {
  const sport = (match.sport || '').toLowerCase();
  const league = (match.league || '').toLowerCase();

  // ✅ PRIORIDADE 1: Verificar sport field primeiro
  if (sport === 'basketball' || sport.includes('basket')) {
    return 'basketball';
  }

  if (sport === 'icehockey' || sport.includes('hockey')) {
    return 'hockey';
  }

  if (sport === 'baseball' || sport.includes('baseball')) {
    return 'baseball';
  }

  if (sport === 'volleyball' || sport.includes('volley')) {
    return 'volleyball';
  }

  if (sport === 'soccer' || sport === 'football' || sport.includes('futebol')) {
    return 'soccer';
  }

  // ✅ PRIORIDADE 2: Verificar league field
  if (league.includes('nba') || league.includes('ncaa basketball') || 
      league.includes('euroleague') || league.includes('basketball') ||
      league.includes('acb') || league.includes('bbl') || league.includes('cba')) {
    return 'basketball';
  }

  if (league.includes('nhl') || league.includes('khl') || 
      league.includes('shl') || league.includes('liiga') || league.includes('hockey')) {
    return 'hockey';
  }

  if (league.includes('mlb') || league.includes('npb') || 
      league.includes('kbo') || league.includes('baseball')) {
    return 'baseball';
  }

  if (league.includes('volley') || league.includes('vôlei')) {
    return 'volleyball';
  }

  if (league.includes('liga') || league.includes('league') || league.includes('serie') ||
      league.includes('bundesliga') || league.includes('ligue') || league.includes('premier') ||
      league.includes('champions') || league.includes('europa') || league.includes('copa')) {
    return 'soccer';
  }

  return 'other';
};

// Logos dos desportos
const sportIcons: Record<string, string> = {
  soccer: 'ri-football-line',
  basketball: 'ri-basketball-line',
  icehockey: 'ri-hockey-puck-line',
  hockey: 'ri-hockey-puck-line',
  americanfootball: 'ri-football-line',
  tennis: 'ri-ping-pong-line',
  baseball: 'ri-baseball-line',
  volleyball: 'ri-volleyball-line',
  rugby: 'ri-rugby-line',
  mma: 'ri-boxing-line',
  formula1: 'ri-steering-2-line',
  handball: 'ri-basketball-line',
};

// hook de relógio não utilizado removido

// Gerar iniciais da equipa
const getTeamInitials = (teamName: string) => {
  const words = teamName.split(' ');
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return teamName.substring(0, 2).toUpperCase();
};

// Gerar cor baseada no nome
const getTeamColor = (teamName: string) => {
  const colors = [
    { bg: 'bg-gradient-to-br from-red-600 to-red-800', ring: 'ring-red-500/30' },
    { bg: 'bg-gradient-to-br from-blue-600 to-blue-800', ring: 'ring-blue-500/30' },
    { bg: 'bg-gradient-to-br from-green-600 to-green-800', ring: 'ring-green-500/30' },
    { bg: 'bg-gradient-to-br from-amber-600 to-amber-800', ring: 'ring-amber-500/30' },
    { bg: 'bg-gradient-to-br from-purple-600 to-purple-800', ring: 'ring-purple-500/30' },
    { bg: 'bg-gradient-to-br from-cyan-600 to-cyan-800', ring: 'ring-cyan-500/30' },
    { bg: 'bg-gradient-to-br from-rose-600 to-rose-800', ring: 'ring-rose-500/30' },
    { bg: 'bg-gradient-to-br from-emerald-600 to-emerald-800', ring: 'ring-emerald-500/30' },
    { bg: 'bg-gradient-to-br from-orange-600 to-orange-800', ring: 'ring-orange-500/30' },
    { bg: 'bg-gradient-to-br from-teal-600 to-teal-800', ring: 'ring-teal-500/30' },
  ];
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// Componente de badge da equipa
const TeamBadge = ({
  teamName,
  teamLogo,
  size = 'md',
  showLogo = false
}: {
  teamName: string;
  teamLogo?: string;
  size?: 'sm' | 'md';
  showLogo?: boolean;
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  const initials = getTeamInitials(teamName);
  const color = getTeamColor(teamName);
  const sizeClasses = size === 'sm'
    ? 'w-6 h-6 text-[8px]'
    : 'w-8 h-8 text-[10px]';

  useEffect(() => {
    if (!teamLogo || !showLogo) {
      setIsLoading(false);
      return;
    }

    const loadLogo = async () => {
      try {
        const cached = await getCachedLogo(teamLogo);
        if (cached) {
          setCachedUrl(cached);
          setIsLoading(false);
          return;
        }
        setCachedUrl(teamLogo);
        setIsLoading(false);
        cacheLogo(teamLogo).then((base64) => {
          if (base64) setCachedUrl(base64);
        });
      } catch {
        setCachedUrl(teamLogo);
        setIsLoading(false);
      }
    };

    loadLogo();
  }, [teamLogo, showLogo]);

  const shouldShowLogo = showLogo && cachedUrl && !hasError;

  return (
    <div className={`${sizeClasses} flex items-center justify-center flex-shrink-0 overflow-hidden relative`}>
      {isLoading && showLogo && (
        <div className="absolute inset-0 bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 animate-pulse rounded-full">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        </div>
      )}

      {shouldShowLogo ? (
        <img
          src={cachedUrl!}
          alt={teamName}
          className={`w-full h-full object-contain transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
      ) : !isLoading && (
        <div className={`w-full h-full ${color.bg} rounded-full flex items-center justify-center`}>
          <span className="font-bold text-white drop-shadow-sm">{initials}</span>
        </div>
      )}

      {hasError && (
        <div className={`w-full h-full ${color.bg} rounded-full flex items-center justify-center`}>
          <span className="font-bold text-white drop-shadow-sm">{initials}</span>
        </div>
      )}
    </div>
  );
};

// ✅ Componente de relógio - SIMPLIFICADO
const LiveClock = React.memo(({
  isLive,
  currentPeriod,
  currentMinute,
  theme
}: {
  isLive: boolean;
  currentPeriod: string;
  currentMinute: number;
  theme: string;
}) => {
  if (!isLive) return null;

  const showMinute = ['P1', 'P2', 'P3', 'PRO', '1H', '2H', 'ET', 'Q1', 'Q2', 'Q3', 'Q4', 'OT', 'OT1', 'OT2', 'S1', 'S2', 'S3', 'S4', 'S5', 'IN', 'IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'IN8', 'IN9'].includes(currentPeriod);
  const isPaused = currentPeriod === 'INT' || currentPeriod === 'PEN';

  return (
    <div
      className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-all duration-300 ${
        theme === 'dark' ? 'bg-red-500/20 border border-red-500/30' : 'bg-red-50 border border-red-200'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-red-400 animate-pulse'}`}></span>
      <span className={`text-[9px] font-bold ${isPaused ? 'text-amber-400' : theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
        {currentPeriod || 'LIVE'}
      </span>
      {showMinute && currentMinute > 0 && (
        <span className={`text-[9px] font-semibold tabular-nums ${theme === 'dark' ? 'text-red-300' : 'text-red-500'}`}>
          {currentMinute}&apos;
        </span>
      )}
    </div>
  );
});

LiveClock.displayName = 'LiveClock';

// ✅ NOVO: Componente de Placar - SEMPRE VISÍVEL
const ScoreDisplay = React.memo(({
  homeScore,
  awayScore,
  isLive,
  theme,
  size = 'md'
}: {
  homeScore?: number;
  awayScore?: number;
  isLive: boolean;
  theme: string;
  size?: 'sm' | 'md';
}) => {
  const hasScore = homeScore !== undefined && awayScore !== undefined;

  if (!isLive) return null;

  if (hasScore) {
    return (
      <div className={`flex items-center gap-1 ${size === 'sm' ? '' : ''}`}>
        <span className={`font-black ${size === 'sm' ? 'text-sm' : 'text-base'} ${theme === 'dark' ? 'text-white' : 'text-gray-900'} px-2 py-0.5 rounded ${theme === 'dark' ? 'bg-white/10' : 'bg-gray-100'}`}>
          {homeScore}-{awayScore}
        </span>
      </div>
    );
  }

  return (
    <span className={`text-[10px] font-bold ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
      LIVE
    </span>
  );
});

ScoreDisplay.displayName = 'ScoreDisplay';

// ✅ NOVO: Indicador de conexão WebSocket
const WebSocketIndicator = React.memo(({ isConnected, theme }: { isConnected: boolean; theme: string }) => (
  <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-semibold ${
    isConnected 
      ? theme === 'dark' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
      : theme === 'dark' ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-50 text-amber-600'
  }`}>
    <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
    {isConnected ? 'LIVE' : 'SYNC'}
  </div>
));

WebSocketIndicator.displayName = 'WebSocketIndicator';

export default function MatchCard({
  match,
  isLive = false,
  selections,
  onAddSelection,
  onOpenMarkets: _onOpenMarkets,
  index = 0,
  showLogos = false,
}: MatchCardProps) {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const shouldShowLogos = showLogos || isLive || index < 80;
  const sportType = useMemo(() => detectSportType(match), [match]);
  const isSoccer = sportType === 'soccer';

  // ✅ Hook para incidentes - APENAS FUTEBOL AO VIVO
  const { incidents } = useMatchIncidents(String(match.id || ''), {
    sport: match.sport,
    isLive: isLive,
    fixtureId: match.fixtureId || match.id,
  });
  const activeIncident = isSoccer && isLive && incidents.length > 0 ? incidents[incidents.length - 1] : null;

  // ID estável
  const matchKey = useMemo(() => {
    const baseId = match.id ? String(match.id) : `${match.homeTeam}-${match.awayTeam}`;
    return `match-${baseId}-${index}`;
  }, [match.id, match.homeTeam, match.awayTeam, index]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ✅ WEBSOCKET: Placar em tempo real SEM polling
  // ═══════════════════════════════════════════════════════════════════════════

  const {
    homeScore: wsHomeScore,
    awayScore: wsAwayScore,
    minute: wsMinute,
    period: wsPeriod,
    isConnected: wsConnected,
    hasScoreChanged,
  } = useMatchScore({
    matchId: String(match.id || ''),
    initialScore: {
      home: match.homeScore ?? 0,
      away: match.awayScore ?? 0,
    },
    initialMinute: match.elapsed ?? (match.minute ? Number(match.minute) : 0),
    initialPeriod: match.statusShort || match.period || '',
  });

  // ✅ WEBSOCKET: Odds em tempo real
  const {
    odds: wsOdds,
    oddsDirection,
    isConnected: _oddsConnected,
  } = useMatchOdds({
    matchId: String(match.id || ''),
    initialOdds: {
      home: match.odds?.home || 0,
      draw: match.odds?.draw || 0,
      away: match.odds?.away || 0,
    },
  });

  // ✅ Usar dados do WebSocket se disponíveis, senão usar props
  const displayHomeScore = isLive ? wsHomeScore : (match.homeScore ?? 0);
  const displayAwayScore = isLive ? wsAwayScore : (match.awayScore ?? 0);
  const displayMinute = isLive ? wsMinute : (match.elapsed ?? (match.minute ? Number(match.minute) : 0));
  const displayPeriod = isLive ? wsPeriod : (match.statusShort || match.period || 'LIVE');
  const displayOdds = useMemo(
    () => ({
      home: wsOdds.home > 0 ? wsOdds.home : (match.odds?.home || 0),
      draw: wsOdds.draw > 0 ? wsOdds.draw : (match.odds?.draw ?? 0),
      away: wsOdds.away > 0 ? wsOdds.away : (match.odds?.away || 0),
    }),
    [wsOdds, match.odds]
  );

  // ✅ FUNÇÕES AUXILIARES
  const getDisplayOdd = useCallback((type: 'home' | 'draw' | 'away'): number => {
    return displayOdds[type] || 0;
  }, [displayOdds]);

  const hasValidDraw = useMemo(() => {
    return isSoccer && displayOdds.draw > 1;
  }, [isSoccer, displayOdds.draw]);

  const drawOdd = useMemo(() => {
    return displayOdds.draw || 0;
  }, [displayOdds.draw]);

  const isSelected = useCallback((selection: string): boolean => {
    return selections.some(
      (s) =>
        s.homeTeam === match.homeTeam &&
        s.awayTeam === match.awayTeam &&
        s.selection === selection
    );
  }, [selections, match.homeTeam, match.awayTeam]);

  const handleCardClick = useCallback(() => {
    const matchId = match.id || match.fixtureId;
    if (matchId) {
      navigate(`/match/${matchId}`);
    }
  }, [match.id, match.fixtureId, navigate]);

  // ✅ Componente de botão de odd com setas e bloqueio
  const OddBtn = React.memo(({
    label,
    selection,
    odd,
    compact = false,
    marketName = '1X2',
    oddKey,
    isBlocked = false,
  }: {
    label: string;
    selection: string;
    odd: number;
    compact?: boolean;
    marketName?: string;
    oddKey?: 'home' | 'draw' | 'away';
    isBlocked?: boolean;
  }) => {
    if (!odd || odd <= 1) return null;
    const active = isSelected(selection);

    const direction = oddKey ? oddsDirection[oddKey] : undefined;
    const isFlashing = !!direction;

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (isBlocked) return;
          try {
            onAddSelection(match, selection, odd, marketName);
          } catch (err) {
            console.error('Error adding selection:', err);
          }
        }}
        disabled={isBlocked}
        className={`
          relative flex-1 flex flex-col items-center justify-center overflow-hidden
          ${compact ? 'min-h-[28px] px-1.5 py-0.5' : 'min-h-[32px] px-2 py-1'} rounded-lg transition-all duration-300
          ${isBlocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
          ${active
            ? 'bg-red-600 text-white shadow-lg shadow-red-600/40 scale-[1.02]'
            : theme === 'dark'
              ? 'bg-red-900/50 hover:bg-red-800/60 text-white border border-red-700/50 hover:border-red-500/60'
              : 'bg-red-100 hover:bg-red-200 text-red-800 border border-red-300 hover:border-red-400'}
          ${isFlashing && direction === 'up' ? 'ring-2 ring-emerald-400 bg-emerald-500/20' : ''}
          ${isFlashing && direction === 'down' ? 'ring-2 ring-red-400 bg-red-500/20' : ''}
        `}
      >
        <span className={`
            text-[7px] font-semibold leading-none uppercase tracking-wide
            ${active ? 'text-white/80' : theme === 'dark' ? 'text-red-300/80' : 'text-red-600/80'}
          `}>
          {label}
        </span>

        <div className="flex items-center justify-center gap-0.5 mt-0.5">
          {isFlashing && direction === 'down' && (
            <i className="ri-arrow-down-s-fill text-[12px] text-red-400 animate-bounce"></i>
          )}

          <span className={`font-black leading-tight ${compact ? 'text-[10px]' : 'text-xs'} transition-colors duration-300 ${
            isFlashing && direction === 'up' ? 'text-emerald-400' : ''
          } ${isFlashing && direction === 'down' ? 'text-red-400' : ''}`}>
            {odd.toFixed(2)}
          </span>

          {isFlashing && direction === 'up' && (
            <i className="ri-arrow-up-s-fill text-[12px] text-emerald-400 animate-bounce"></i>
          )}
        </div>

        {isFlashing && (
          <div className={`absolute inset-0 pointer-events-none ${
            direction === 'up'
              ? 'bg-gradient-to-t from-emerald-500/30 to-transparent'
              : 'bg-gradient-to-b from-red-500/30 to-transparent'
          } animate-pulse`}></div>
        )}
      </button>
    );
  });

  OddBtn.displayName = 'OddBtn';

  const animationDelay = `${index * 80}ms`;
  const hasValidOdds = displayOdds.home > 1 || displayOdds.away > 1;

  const oddsBlocked =
    !!activeIncident &&
    ['VAR', 'goal_chance', 'penalty', 'red_card'].includes(activeIncident.type);

  return (
    <div
      key={matchKey}
      onClick={handleCardClick}
      className={`group rounded-xl overflow-hidden transition-all duration-300 border relative cursor-pointer
        ${theme === 'dark'
          ? 'bg-gray-800/60 border-gray-700/40 hover:border-gray-600/60'
          : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'}
        hover:shadow-xl hover:shadow-black/10
        ${hasScoreChanged ? 'ring-2 ring-emerald-400 animate-pulse' : ''}
        animate-card-entrance`}
      style={{ animationDelay }}
    >
      {/* Desktop */}
      <div className="hidden sm:block">
        <div className="flex items-stretch">
          {/* Coluna lateral */}
          <div className={`flex flex-col items-center justify-center min-w-[56px] px-2 py-3 ${theme === 'dark' ? 'bg-black/20 border-white/5' : 'bg-gray-50 border-gray-100'} border-r`}>
            <div className={`w-7 h-7 rounded-lg ${theme === 'dark' ? 'bg-black/30' : 'bg-gray-200'} flex items-center justify-center mb-1.5`}>
              <i className={`${sportIcons[match.sport] || 'ri-football-line'} text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}></i>
            </div>
            {isLive ? (
              <div className="flex flex-col items-center gap-1">
                {/* ✅ Placar com animação de golo */}
                <span className={`font-black text-base px-2 py-0.5 rounded transition-all duration-500 ${
                  hasScoreChanged 
                    ? 'bg-emerald-500 text-white scale-110 animate-bounce' 
                    : theme === 'dark' ? 'text-white bg-white/10' : 'text-gray-900 bg-gray-100'
                }`}>
                  {displayHomeScore}-{displayAwayScore}
                </span>
                {/* ✅ Indicador WebSocket */}
                <WebSocketIndicator isConnected={wsConnected} theme={theme} />
              </div>
            ) : (
              <>
                <span className={`text-[11px] font-bold ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`}>
                  {match.time || '--:--'}
                </span>
                {match.startTime && (
                  <span className={`text-[9px] mt-0.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    {new Date(match.startTime).toLocaleDateString('pt-PT', {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Conteúdo principal */}
          <div className="flex-1 py-2.5 px-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center mb-2">
                  <span className={`text-[9px] font-semibold truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    {match.league}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <TeamBadge
                      teamName={match.homeTeam}
                      teamLogo={match.homeTeamLogo}
                      size="sm"
                      showLogo={shouldShowLogos}
                    />
                    <span className={`text-[11px] font-bold truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{match.homeTeam}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TeamBadge
                      teamName={match.awayTeam}
                      teamLogo={match.awayTeamLogo}
                      size="sm"
                      showLogo={shouldShowLogos}
                    />
                    <span className={`text-[11px] font-semibold truncate ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>{match.awayTeam}</span>
                  </div>
                </div>
              </div>

              {/* Odds com relógio */}
              <div className="flex flex-col items-end gap-1.5">
                {/* ✅ Relógio com minuto do WebSocket */}
                {isLive && (
                  <div
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-all duration-300 ${
                      theme === 'dark' ? 'bg-red-500/20 border border-red-500/30' : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${displayPeriod === 'INT' ? 'bg-amber-400' : 'bg-red-400 animate-pulse'}`}></span>
                    <span className={`text-[9px] font-bold ${displayPeriod === 'INT' ? 'text-amber-400' : theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
                      {displayPeriod || 'LIVE'}
                    </span>
                    {displayMinute > 0 && (
                      <span className={`text-[9px] font-semibold tabular-nums ${theme === 'dark' ? 'text-red-300' : 'text-red-500'}`}>
                        {displayMinute}&apos;
                      </span>
                    )}
                  </div>
                )}

                {hasValidOdds ? (
                  <div
                    className="w-[200px] lg:w-[240px] relative"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {activeIncident && (
                      <OddsBlockedOverlay incident={activeIncident} compact />
                    )}

                    <div className="flex gap-1.5">
                      <OddBtn
                        label="1"
                        selection={match.homeTeam}
                        odd={getDisplayOdd('home')}
                        marketName={isSoccer ? '1X2' : 'Vencedor'}
                        oddKey="home"
                        isBlocked={oddsBlocked}
                      />
                      {hasValidDraw && (
                        <OddBtn
                          label="X"
                          selection="Empate"
                          odd={drawOdd}
                          marketName="1X2"
                          oddKey="draw"
                          isBlocked={oddsBlocked}
                        />
                      )}
                      <OddBtn
                        label="2"
                        selection={match.awayTeam}
                        odd={getDisplayOdd('away')}
                        marketName={isSoccer ? '1X2' : 'Vencedor'}
                        oddKey="away"
                        isBlocked={oddsBlocked}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-amber-500 text-[10px] font-semibold">
                    Odds temporariamente indisponíveis
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ MOBILE */}
      <div className="sm:hidden p-2.5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div className={`w-5 h-5 rounded-md ${theme === 'dark' ? 'bg-black/30' : 'bg-gray-100'} flex items-center justify-center`}>
              <i className={`${sportIcons[match.sport] || 'ri-football-line'} text-[10px] ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}></i>
            </div>

            {isLive ? (
              <div className="flex items-center gap-1.5">
                {/* ✅ Placar com animação */}
                <span className={`font-black text-sm px-2 py-0.5 rounded transition-all duration-500 ${
                  hasScoreChanged 
                    ? 'bg-emerald-500 text-white scale-110' 
                    : theme === 'dark' ? 'text-white bg-white/10' : 'text-gray-900 bg-gray-100'
                }`}>
                  {displayHomeScore}-{displayAwayScore}
                </span>
                <WebSocketIndicator isConnected={wsConnected} theme={theme} />
              </div>
            ) : (
              <>
                <span className={`text-[10px] font-bold ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`}>
                  {match.time || '--:--'}
                </span>
                {match.startTime && (
                  <span className={`text-[9px] ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    {new Date(match.startTime).toLocaleDateString('pt-PT', {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Relógio no mobile */}
          {isLive && (
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${
                theme === 'dark' ? 'bg-red-500/20 border border-red-500/30' : 'bg-red-50 border border-red-200'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${displayPeriod === 'INT' ? 'bg-amber-400' : 'bg-red-400 animate-pulse'}`}></span>
              <span className={`text-[9px] font-bold ${displayPeriod === 'INT' ? 'text-amber-400' : theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
                {displayPeriod || 'LIVE'}
              </span>
              {displayMinute > 0 && (
                <span className={`text-[9px] font-semibold tabular-nums ${theme === 'dark' ? 'text-red-300' : 'text-red-500'}`}>
                  {displayMinute}&apos;
                </span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5 mb-2.5">
          <div className="flex items-center gap-2">
            <TeamBadge
              teamName={match.homeTeam}
              teamLogo={match.homeTeamLogo}
              size="sm"
              showLogo={shouldShowLogos}
            />
            <span className={`text-[11px] font-bold truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{match.homeTeam}</span>
          </div>
          <div className="flex items-center gap-2">
            <TeamBadge
              teamName={match.awayTeam}
              teamLogo={match.awayTeamLogo}
              size="sm"
              showLogo={shouldShowLogos}
            />
            <span className={`text-[11px] font-semibold truncate ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>{match.awayTeam}</span>
          </div>
        </div>

        {/* Odds Mobile com bloqueio */}
        {hasValidOdds ? (
          <div className="w-full relative" onClick={(e) => e.stopPropagation()}>
            {activeIncident && (
              <OddsBlockedOverlay incident={activeIncident} compact />
            )}

            <div className="flex gap-1.5">
              <OddBtn
                label="1"
                selection={match.homeTeam}
                odd={getDisplayOdd('home')}
                marketName={isSoccer ? '1X2' : 'Vencedor'}
                oddKey="home"
                isBlocked={oddsBlocked}
              />
              {hasValidDraw && (
                <OddBtn
                  label="X"
                  selection="Empate"
                  odd={drawOdd}
                  marketName="1X2"
                  oddKey="draw"
                  isBlocked={oddsBlocked}
                />
              )}
              <OddBtn
                label="2"
                selection={match.awayTeam}
                odd={getDisplayOdd('away')}
                marketName={isSoccer ? '1X2' : 'Vencedor'}
                oddKey="away"
                isBlocked={oddsBlocked}
              />
            </div>
          </div>
        ) : (
          <div className="text-amber-500 text-[10px] font-semibold">
            Odds temporariamente indisponíveis
          </div>
        )}
      </div>
    </div>
  );
}

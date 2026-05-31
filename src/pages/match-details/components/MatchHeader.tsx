
import { useTheme } from '../../../contexts/ThemeContext';
import { useState, useEffect, useRef } from 'react';

interface MatchHeaderProps {
  match: any;
  isLive: boolean;
}

const sportIcons: Record<string, string> = {
  Futebol: 'ri-football-line',
  Basquetebol: 'ri-basketball-line',
  Hóquei: 'ri-hockey-puck-line',
  NFL: 'ri-football-line',
  Basebol: 'ri-ball-pen-line',
  Voleibol: 'ri-basketball-line',
  Rúgbi: 'ri-football-line',
  MMA: 'ri-boxing-line',
  'Fórmula 1': 'ri-steering-2-line',
  Handebol: 'ri-basketball-line',
  AFL: 'ri-football-line',
};

const getTeamInitials = (teamName: string) => {
  const words = teamName.split(' ');
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return teamName.substring(0, 2).toUpperCase();
};

const getTeamColor = (teamName: string) => {
  const colors = [
    'from-red-600 to-red-800',
    'from-blue-600 to-blue-800',
    'from-green-600 to-green-800',
    'from-amber-600 to-amber-800',
    'from-purple-600 to-purple-800',
    'from-cyan-600 to-cyan-800',
    'from-rose-600 to-rose-800',
    'from-emerald-600 to-emerald-800',
  ];
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export default function MatchHeader({
  match,
  isLive,
}: MatchHeaderProps) {
  const { theme } = useTheme();

  // ✅ Estado para o relógio ao vivo
  const [liveMinute, setLiveMinute] = useState(0);
  const [livePeriod, setLivePeriod] = useState('');

  // ✅ NOVO: Estado para animação de atualização do placar
  const [scoreUpdated, setScoreUpdated] = useState<'home' | 'away' | null>(null);
  const [_lastRefresh, setLastRefresh] = useState(Date.now());
  const previousScoreRef = useRef({ home: match.homeScore, away: match.awayScore });

  // ✅ Detectar mudanças no placar e animar
  useEffect(() => {
    if (!isLive) return;

    const prevHome = previousScoreRef.current.home;
    const prevAway = previousScoreRef.current.away;

    if (match.homeScore !== undefined && match.awayScore !== undefined) {
      if (prevHome !== undefined && match.homeScore > prevHome) {
        setScoreUpdated('home');
        setTimeout(() => setScoreUpdated(null), 3000);
      } else if (prevAway !== undefined && match.awayScore > prevAway) {
        setScoreUpdated('away');
        setTimeout(() => setScoreUpdated(null), 3000);
      }

      previousScoreRef.current = { home: match.homeScore, away: match.awayScore };
    }
  }, [match.homeScore, match.awayScore, isLive]);

  // ✅ Atualizar relógio a cada segundo
  useEffect(() => {
    if (!isLive) return;

    const updateClock = () => {
      const period = match.status?.short || match.statusShort || '';
      const periodLong = match.status?.long || match.statusLong || match.timer || '';

      // INTERVALO: STOP no relógio
      if (period === 'HT' || period === 'BT' || period === 'INT') {
        setLiveMinute(45);
        setLivePeriod('INT');
        return;
      }

      if (/\b(top|bottom)\b/i.test(String(periodLong || ''))) {
        setLiveMinute(0);
        setLivePeriod(String(periodLong));
        setLastRefresh(Date.now());
        return;
      }

      // Usar minuto da API se disponível
      const apiMinute = match.minute || match.elapsed || match.status?.elapsed;
      if (apiMinute) {
        setLiveMinute(parseInt(apiMinute, 10));
      }

      // Determinar período
      if (period === '1H' || period === 'LIVE' || period === 'P1') {
        setLivePeriod('P1');
      } else if (period === '2H' || period === 'P2') {
        setLivePeriod('P2');
      } else if (period === 'ET' || period === 'PRO') {
        setLivePeriod('PRO');
      } else if (
        period === 'Q1' ||
        period === 'Q2' ||
        period === 'Q3' ||
        period === 'Q4'
      ) {
        setLivePeriod(period);
      } else {
        setLivePeriod(period || 'LIVE');
      }

      setLastRefresh(Date.now());
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);

    return () => clearInterval(interval);
  }, [
    isLive,
    match.status,
    match.minute,
    match.elapsed,
    match.statusShort,
  ]);

  return (
    <div
      className={`mx-3 rounded-2xl overflow-hidden ${
        theme === 'dark'
          ? 'bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border border-gray-800/50'
          : 'bg-white border border-gray-200 shadow-lg'
      }`}
    >
      {/* Top Bar */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 ${
          theme === 'dark'
            ? 'bg-black/30 border-b border-gray-800/50'
            : 'bg-gray-50 border-b border-gray-200'
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-6 h-6 flex items-center justify-center rounded-md ${
              theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'
            }`}
          >
            <i
              className={`${sportIcons[match.sport] || 'ri-football-line'} text-xs ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}
            ></i>
          </div>
          <span
            className={`text-xs font-medium ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}
          >
            {match.league}
          </span>
        </div>

        {isLive ? (
          <div className="flex items-center gap-2">
            {/* Badge AO VIVO */}
            <span className="flex items-center gap-1 bg-red-500/20 text-red-400 text-[10px] font-bold px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse"></span>
              AO VIVO
            </span>

            {/* ✅ INDICADOR DE INTERVALO */}
            {livePeriod === 'INT' ? (
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg animate-pulse ${
                  theme === 'dark'
                    ? 'bg-gradient-to-r from-amber-500/30 to-orange-500/30 border border-amber-500/50'
                    : 'bg-gradient-to-r from-amber-200 to-orange-200 border border-amber-400'
                }`}
              >
                <i
                  className={`ri-pause-circle-fill text-sm ${
                    theme === 'dark' ? 'text-amber-400' : 'text-amber-700'
                  }`}
                ></i>
                <span
                  className={`text-xs font-black uppercase tracking-wider ${
                    theme === 'dark' ? 'text-amber-400' : 'text-amber-700'
                  }`}
                >
                  INTERVALO
                </span>
              </div>
            ) : livePeriod && (
              <span
                className={`text-xs font-bold px-2 py-1 rounded-md ${
                  theme === 'dark' ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {livePeriod}
              </span>
            )}

            {/* ✅ RELÓGIO COM INDICADOR DE ATUALIZAÇÃO */}
            <div className="flex items-center gap-1">
              {(() => {
                const clockText = (() => {
                  if (livePeriod === 'INT') return `45'`;
                  if (liveMinute > 0) return `${liveMinute}'`;
                  if (/\b(top|bottom)\b/i.test(livePeriod)) return livePeriod;
                  return '';
                })();
                if (!clockText) return null;
                return (
                  <span
                    className={`text-xs font-bold ${
                      theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}
                  >
                    {clockText}
                  </span>
                );
              })()}
              {/* Seta de atualização animada */}
              <i
                className={`ri-refresh-line text-[10px] ${
                  theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
                } animate-spin`}
                style={{ animationDuration: '2s' }}
              ></i>
            </div>
          </div>
        ) : (
          <div className="text-right">
            <span
              className={`text-xs font-bold ${
                theme === 'dark' ? 'text-amber-400' : 'text-amber-600'
              }`}
            >
              {match.time}
            </span>
            {match.date && (
              <span
                className={`text-[10px] ml-2 ${
                  theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                {new Date(match.date).toLocaleDateString('pt-PT', {
                  day: '2-digit',
                  month: '2-digit',
                })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Teams Section */}
      <div className="px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          {/* Home Team */}
          <div className="flex-1 text-center">
            <div
              className={`w-16 h-16 mx-auto rounded-full bg-gradient-to-br ${getTeamColor(
                match.homeTeam,
              )} flex items-center justify-center shadow-lg mb-3 ${
                scoreUpdated === 'home' ? 'ring-4 ring-emerald-400 animate-pulse' : ''
              }`}
            >
              {match.homeTeamLogo ? (
                <img
                  src={match.homeTeamLogo}
                  alt={match.homeTeam}
                  className="w-12 h-12 object-contain"
                />
              ) : (
                <span className="text-white font-black text-lg">
                  {getTeamInitials(match.homeTeam)}
                </span>
              )}
            </div>
            <h3
              className={`font-bold text-sm ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}
            >
              {match.homeTeam}
            </h3>
            <span
              className={`text-[10px] ${
                theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
              }`}
            >
              Casa
            </span>
          </div>

          {/* Score / VS */}
          <div className="flex flex-col items-center">
            {isLive && match.homeScore !== undefined ? (
              <div className="relative">
                {/* ✅ PLACAR COM ANIMAÇÃO DE ATUALIZAÇÃO */}
                <div
                  className={`text-4xl font-black ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  } flex items-center gap-2`}
                >
                  <span
                    className={`transition-all duration-300 ${
                      scoreUpdated === 'home' ? 'text-emerald-400 scale-125' : ''
                    }`}
                  >
                    {match.homeScore}
                  </span>
                  <span
                    className={`text-xl ${
                      theme === 'dark' ? 'text-gray-600' : 'text-gray-400'
                    }`}
                  >
                    -
                  </span>
                  <span
                    className={`transition-all duration-300 ${
                      scoreUpdated === 'away' ? 'text-emerald-400 scale-125' : ''
                    }`}
                  >
                    {match.awayScore}
                  </span>
                </div>

                {/* ✅ Indicador de golo */}
                {scoreUpdated && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-bounce">
                    <i className="ri-football-line"></i>
                    GOLO!
                  </div>
                )}

                {/* ✅ Setas de atualização em tempo real */}
                <div className="flex items-center justify-center gap-1 mt-1">
                  <i
                    className={`ri-arrow-up-s-line text-xs ${
                      theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
                    } animate-bounce`}
                    style={{ animationDelay: '0ms' }}
                  ></i>
                  <span
                    className={`text-[8px] ${
                      theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                    }`}
                  >
                    tempo real
                  </span>
                  <i
                    className={`ri-arrow-down-s-line text-xs ${
                      theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
                    } animate-bounce`}
                    style={{ animationDelay: '150ms' }}
                  ></i>
                </div>
              </div>
            ) : (
              <div
                className={`text-2xl font-black ${
                  theme === 'dark' ? 'text-gray-600' : 'text-gray-300'
                }`}
              >
                VS
              </div>
            )}
          </div>

          {/* Away Team */}
          <div className="flex-1 text-center">
            <div
              className={`w-16 h-16 mx-auto rounded-full bg-gradient-to-br ${getTeamColor(
                match.awayTeam,
              )} flex items-center justify-center shadow-lg mb-3 ${
                scoreUpdated === 'away' ? 'ring-4 ring-emerald-400 animate-pulse' : ''
              }`}
            >
              {match.awayTeamLogo ? (
                <img
                  src={match.awayTeamLogo}
                  alt={match.awayTeam}
                  className="w-12 h-12 object-contain"
                />
              ) : (
                <span className="text-white font-black text-lg">
                  {getTeamInitials(match.awayTeam)}
                </span>
              )}
            </div>
            <h3
              className={`font-bold text-sm ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}
            >
              {match.awayTeam}
            </h3>
            <span
              className={`text-[10px] ${
                theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
              }`}
            >
              Fora
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

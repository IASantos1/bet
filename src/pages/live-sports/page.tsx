

import { useState, useMemo } from 'react';
import { Header } from '../../components/feature/Header';
import { Footer } from '../../components/feature/Footer';
import { SportsMenu } from '../../components/feature/SportsMenu';
import { useLiveMatches } from '../../hooks/useLiveMatches';
import { useUpcomingMatches } from '../../hooks/useUpcomingMatches';
import { OddButton } from '../../components/base/OddButton';
import { BettingSlipSidebar } from '../../components/feature/BettingSlipSidebar';
import { useNavigate } from 'react-router-dom';
import type { Match } from '../../types/sports';
import { useLiveMatchesAutoRefresh } from '../../hooks/useLiveMatchesAutoRefresh';
import { AutoRefreshIndicator } from '../../components/feature/AutoRefreshIndicator';
import { useSmoothTransition } from '../../hooks/useSmoothTransition';
import { useTheme } from '../../contexts/ThemeContext';
import { useBets } from '../../hooks/useBets';

// ✅ LOGOS DOS DESPORTOS (sem ténis)
const sportLogos: Record<string, string> = {
  soccer: 'https://cdn-icons-png.flaticon.com/512/1165/1165187.png',
  football: 'https://cdn-icons-png.flaticon.com/512/1165/1165187.png',
  basketball: 'https://cdn-icons-png.flaticon.com/512/889/889455.png',
  icehockey: 'https://cdn-icons-png.flaticon.com/512/3311/3311579.png',
  'ice-hockey': 'https://cdn-icons-png.flaticon.com/512/3311/3311579.png',
  hockey: 'https://cdn-icons-png.flaticon.com/512/3311/3311579.png',
  americanfootball: 'https://cdn-icons-png.flaticon.com/512/1165/1165120.png',
  'american-football': 'https://cdn-icons-png.flaticon.com/512/1165/1165120.png',
  nfl: 'https://cdn-icons-png.flaticon.com/512/1165/1165120.png',
  baseball: 'https://cdn-icons-png.flaticon.com/512/889/889442.png',
  volleyball: 'https://cdn-icons-png.flaticon.com/512/889/889468.png',
  rugby: 'https://cdn-icons-png.flaticon.com/512/889/889459.png',
  mma: 'https://cdn-icons-png.flaticon.com/512/2503/2503380.png',
  boxing: 'https://cdn-icons-png.flaticon.com/512/2503/2503380.png',
  formula1: 'https://cdn-icons-png.flaticon.com/512/2418/2418779.png',
  motorsport: 'https://cdn-icons-png.flaticon.com/512/2418/2418779.png',
  handball: 'https://cdn-icons-png.flaticon.com/512/889/889447.png',
  cricket: 'https://cdn-icons-png.flaticon.com/512/889/889438.png',
  golf: 'https://cdn-icons-png.flaticon.com/512/889/889450.png',
  esports: 'https://cdn-icons-png.flaticon.com/512/3612/3612569.png',
};

// ✅ Calcular minuto do jogo baseado no horário de início
function calculateMatchMinute(startTime: string, sport: string): string {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  const elapsedMs = now - start;
  
  if (elapsedMs < 0) return '';
  
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  
  // Lógica por desporto
  if (sport === 'soccer' || sport === 'football') {
    if (elapsedMinutes <= 45) return `${elapsedMinutes}'`;
    if (elapsedMinutes <= 60) return 'INT';
    if (elapsedMinutes <= 105) return `${elapsedMinutes - 15}'`;
    return '90+';
  }
  
  if (sport === 'basketball') {
    const quarterLength = 12;
    const quarter = Math.floor(elapsedMinutes / (quarterLength + 2)) + 1;
    const minuteInQuarter = elapsedMinutes % (quarterLength + 2);
    
    if (quarter > 4) return '4Q';
    if (minuteInQuarter > quarterLength) return `${quarter}Q INT`;
    return `${quarter}Q ${minuteInQuarter}'`;
  }
  
  if (sport === 'icehockey' || sport === 'hockey') {
    const periodLength = 20;
    const period = Math.floor(elapsedMinutes / (periodLength + 15)) + 1;
    const minuteInPeriod = elapsedMinutes % (periodLength + 15);
    
    if (period > 3) return '3P';
    if (minuteInPeriod > periodLength) return `${period}P INT`;
    return `${period}P ${Math.min(minuteInPeriod, periodLength)}'`;
  }
  
  if (sport === 'americanfootball') {
    const quarterLength = 15;
    const quarter = Math.floor(elapsedMinutes / (quarterLength + 5)) + 1;
    
    if (quarter > 4) return '4Q';
    return `${quarter}Q`;
  }
  
  if (sport === 'baseball') {
    const inningLength = 8;
    const inning = Math.floor(elapsedMinutes / inningLength) + 1;
    
    if (inning > 9) return '9ª';
    return `${inning}ª`;
  }
  
  return `${elapsedMinutes}'`;
}

// ✅ NOVO: Formatar placar baseado no tipo de desporto
function formatScoreByType(homeScore: number | undefined, awayScore: number | undefined, _sport: string): { home: string; away: string } {
  if (homeScore === undefined || awayScore === undefined) {
    return { home: '-', away: '-' };
  }
  
  // Para basquetebol, os placares já vêm corretos da API (ex: 88-73)
  // Apenas garantir que mostramos o valor real
  return { 
    home: String(homeScore), 
    away: String(awayScore) 
  };
}

export default function LiveSportsPage() {
  const { matches: liveOnlyMatches, loading } = useLiveMatches();
  const { matches: upcomingMatches } = useUpcomingMatches({ autoRefresh: true, interval: 30000, hoursAhead: 72 });
  const [selectedSport, setSelectedSport] = useState<string>('all');
  const [isBettingSlipOpen, setIsBettingSlipOpen] = useState(false);
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { selections, addSelection, removeSelection, clearSelections } = useBets();

  // ✅ Atualização automática de jogos ao vivo a cada 3 segundos
  const { matches: liveMatches, isLive, lastUpdate, forceRefresh: _forceRefresh } = useLiveMatchesAutoRefresh(
    async () => {
      // Buscar jogos ao vivo atualizados
      const response = await fetch('/api/matches/live');
      return response.json();
    },
    true
  );

  // ✅ Transição suave sem flickering
  const { displayData: _displayMatches, isTransitioning } = useSmoothTransition({
    data: liveMatches,
    compareKey: (matches) => matches.map((m: any) => `${m.fixture.id}:${m.goals?.home}-${m.goals?.away}`).join(','),
  });

  // Filtrar jogos por desporto
  const combinedMatches = useMemo(() => {
    const now = Date.now();
    const startSoonMin = 30 * 60 * 1000;
    const startSoonMax = 60 * 60 * 1000;

    const startTimeMs = (m: any) => {
      const d = new Date(m?.startTime || m?.event_date || '');
      const t = d.getTime();
      return Number.isFinite(t) ? t : 0;
    };

    const baseLive = Array.isArray(liveOnlyMatches) ? liveOnlyMatches : [];
    const baseUpcoming = Array.isArray(upcomingMatches) ? upcomingMatches : [];
    const liveIds = new Set(baseLive.map((m: any) => String(m?.id || '')));

    const startingSoon = baseUpcoming
      .filter((m: any) => {
        const t = startTimeMs(m);
        if (!t) return false;
        const diff = t - now;
        return diff >= startSoonMin && diff <= startSoonMax;
      })
      .filter((m: any) => !liveIds.has(String(m?.id || '')));

    const merged = [...baseLive, ...startingSoon].sort((a: any, b: any) => {
      const aLive = a?.isLive ? 1 : 0;
      const bLive = b?.isLive ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      const at = startTimeMs(a);
      const bt = startTimeMs(b);
      if (at && bt && at !== bt) return at - bt;
      return String(a?.league || '').localeCompare(String(b?.league || ''), 'pt-PT');
    });

    return merged.slice(0, 150);
  }, [liveOnlyMatches, upcomingMatches]);

  const filteredMatches = useMemo(() => {
    if (selectedSport === 'all') return combinedMatches;
    return combinedMatches.filter(m => m.sport === selectedSport);
  }, [combinedMatches, selectedSport]);

  // Calcular ligas ativas a partir dos jogos atuais
  const activeLeagues = useMemo(() => {
    const leagueCounts: Record<string, { league: string; sport: string; count: number }> = {};
    (combinedMatches || []).forEach((m: any) => {
      const key = m.league || '';
      if (!key) return;
      if (!leagueCounts[key]) {
        leagueCounts[key] = { league: key, sport: m.sport || 'football', count: 0 };
      }
      leagueCounts[key].count += 1;
    });
    return Object.values(leagueCounts);
  }, [combinedMatches]);

  // Agrupar por desporto
  const groupedMatches = useMemo(() => {
    const groups: Record<string, Match[]> = {};
    filteredMatches.forEach(match => {
      if (!groups[match.sport]) {
        groups[match.sport] = [];
      }
      groups[match.sport].push(match);
    });
    return groups;
  }, [filteredMatches]);

  const getSportName = (sport: string) => {
    const names: Record<string, string> = {
      soccer: 'Futebol',
      basketball: 'Basquetebol',
      volleyball: 'Voleibol',
      handball: 'Andebol',
      icehockey: 'Hóquei no Gelo',
      'ice-hockey': 'Hóquei no Gelo',
      baseball: 'Basebol',
      americanfootball: 'Futebol Americano',
      'american-football': 'Futebol Americano',
      mma: 'MMA',
      formula1: 'Fórmula 1',
      rugby: 'Rugby',
      esports: 'eSports'
    };
    return names[sport] || sport;
  };

  const getSportLogo = (sport: string) => {
    return sportLogos[sport.toLowerCase()] || sportLogos['soccer'];
  };

  const handleNavigateToDetails = (matchId: string) => {
    navigate(`/jogo/${matchId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* ✅ Indicador de atualização ao vivo */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">
            Jogos ao Vivo
          </h1>
          <AutoRefreshIndicator 
            isLive={isLive} 
            lastUpdate={lastUpdate}
            showDetails
          />
        </div>

        {/* ✅ Transição suave de conteúdo */}
        <div 
          className={`transition-opacity duration-300 ${
            isTransitioning ? 'opacity-90' : 'opacity-100'
          }`}
        >
          {/* Menu de desportos */}
          <SportsMenu
            onSelectLeague={() => {}}
            onSelectSport={setSelectedSport}
            selectedLeague={null}
            selectedSport={selectedSport}
            isDarkMode={theme === 'dark'}
            activeLeagues={activeLeagues as any}
          />

          {/* Loading */}
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-3 text-gray-600">A carregar jogos ao vivo...</p>
            </div>
          )}

          {/* Sem jogos */}
          {!loading && Object.keys(groupedMatches).length === 0 && (
            <div className="text-center py-12">
              <i className="ri-live-line text-5xl text-gray-400 mb-3"></i>
              <p className="text-gray-600">Nenhum jogo ao vivo no momento</p>
              <p className="text-gray-400 text-sm mt-2">Os jogos aparecerão aqui quando começarem</p>
            </div>
          )}

          {/* Jogos agrupados por desporto */}
          {!loading && Object.entries(groupedMatches).map(([sport, sportMatches]) => (
            <div key={sport} className="mb-8">
              {/* Cabeçalho do desporto */}
              {(() => {
                const liveCount = sportMatches.filter((m) => !!m.isLive).length;
                const soonCount = sportMatches.length - liveCount;
                const badgeText = soonCount > 0 ? `${liveCount} AO VIVO + ${soonCount} A COMEÇAR` : `${sportMatches.length} AO VIVO`;
                return (
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 flex items-center justify-center">
                  <img 
                    src={getSportLogo(sport)} 
                    alt={getSportName(sport)}
                    className="w-8 h-8 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
                <h2 className="text-xl font-bold">{getSportName(sport)}</h2>
                <span className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-sm font-semibold">
                  {badgeText}
                </span>
              </div>
                );
              })()}

              {/* Lista de jogos */}
              <div className="space-y-3">
                {sportMatches.map(match => {
                  const now = Date.now();
                  const start = match.startTime ? new Date(match.startTime).getTime() : 0;
                  const isStartingSoon = !match.isLive && start && start > now && (start - now) >= 30 * 60 * 1000 && (start - now) <= 60 * 60 * 1000;
                  const matchMinute = match.startTime ? calculateMatchMinute(match.startTime, sport) : '';
                  const formattedScore = formatScoreByType(match.homeScore, match.awayScore, sport);
                  
                  return (
                    <div key={match.id} className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow">
                      {/* Header do jogo */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <img 
                            src={getSportLogo(sport)} 
                            alt={sport}
                            className="w-5 h-5 object-contain opacity-60"
                          />
                          <div className="flex items-center gap-2">
                            {isStartingSoon ? (
                              <>
                                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                                <span className="text-sm font-semibold text-amber-700">A COMEÇAR</span>
                              </>
                            ) : (
                              <>
                                <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                                <span className="text-sm font-semibold text-red-600">AO VIVO</span>
                              </>
                            )}
                          </div>
                          {!isStartingSoon && matchMinute && (
                            <span className="text-xs font-bold text-white bg-red-600 px-2 py-0.5 rounded">
                              {matchMinute}
                            </span>
                          )}
                          {/* ✅ CORRIGIDO: Placar formatado corretamente por desporto */}
                          {!isStartingSoon && match.homeScore !== undefined && match.awayScore !== undefined && (
                            <span className="text-sm font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                              {formattedScore.home} - {formattedScore.away}
                            </span>
                          )}
                          <span className="text-sm text-gray-600">{match.league}</span>
                        </div>
                        {/* BOTÃO MERCADOS - ÚNICO */}
                        <button
                          onClick={() => handleNavigateToDetails(String(match.id))}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg text-sm font-semibold hover:bg-teal-100 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-bar-chart-box-line"></i>
                          Mercados
                        </button>
                      </div>

                      {/* EQUIPAS COM LOGOS (sem círculos) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="space-y-3">
                          {/* Equipa da casa */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 flex items-center justify-center">
                                {match.homeTeamLogo ? (
                                  <img 
                                    src={match.homeTeamLogo} 
                                    alt={match.homeTeam}
                                    className="w-8 h-8 object-contain"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                    }}
                                  />
                                ) : null}
                                <div className={`w-8 h-8 bg-teal-500 rounded-full flex items-center justify-center ${match.homeTeamLogo ? 'hidden' : ''}`}>
                                  <span className="text-white font-bold text-xs">
                                    {match.homeTeam.substring(0, 2).toUpperCase()}
                                  </span>
                                </div>
                              </div>
                              <span className="font-semibold text-gray-900">{match.homeTeam}</span>
                            </div>
                            {/* ✅ CORRIGIDO: Placar grande formatado corretamente */}
                            <span className="text-2xl font-bold text-gray-900">{formattedScore.home}</span>
                          </div>
                          
                          {/* Equipa visitante */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 flex items-center justify-center">
                                {match.awayTeamLogo ? (
                                  <img 
                                    src={match.awayTeamLogo} 
                                    alt={match.awayTeam}
                                    className="w-8 h-8 object-contain"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                    }}
                                  />
                                ) : null}
                                <div className={`w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center ${match.awayTeamLogo ? 'hidden' : ''}`}>
                                  <span className="text-white font-bold text-xs">
                                    {match.awayTeam.substring(0, 2).toUpperCase()}
                                  </span>
                                </div>
                              </div>
                              <span className="font-semibold text-gray-900">{match.awayTeam}</span>
                            </div>
                            {/* ✅ CORRIGIDO: Placar grande formatado corretamente */}
                            <span className="text-2xl font-bold text-gray-900">{formattedScore.away}</span>
                          </div>
                        </div>

                        {/* Odds principais */}
                        <div className="flex items-center">
                          <div className="grid grid-cols-3 gap-2 w-full">
                            {match.odds && (
                              <>
                                <OddButton
                                  label="1"
                                  odd={match.odds.home}
                                  matchId={String(match.id)}
                                  onClick={() =>
                                    addSelection({
                                      id: match.id,
                                      homeTeam: match.homeTeam,
                                      awayTeam: match.awayTeam,
                                      selection: '1',
                                      odd: match.odds.home,
                                      league: match.league,
                                    } as any)
                                  }
                                />
                                {match.odds.draw && (
                                  <OddButton
                                    label="X"
                                    odd={match.odds.draw}
                                    matchId={String(match.id)}
                                    onClick={() =>
                                      addSelection({
                                        id: match.id,
                                        homeTeam: match.homeTeam,
                                        awayTeam: match.awayTeam,
                                        selection: 'X',
                                        odd: match.odds.draw!,
                                        league: match.league,
                                      } as any)
                                    }
                                  />
                                )}
                                <OddButton
                                  label="2"
                                  odd={match.odds.away}
                                  matchId={String(match.id)}
                                  onClick={() =>
                                    addSelection({
                                      id: match.id,
                                      homeTeam: match.homeTeam,
                                      awayTeam: match.awayTeam,
                                      selection: '2',
                                      odd: match.odds.away,
                                      league: match.league,
                                    } as any)
                                  }
                                />
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </main>

      <Footer />

      {/* Boletim de apostas */}
      <BettingSlipSidebar
        selections={selections as any}
        onRemoveSelection={(id) => removeSelection(String(id))}
        onClearAll={clearSelections}
        isOpen={isBettingSlipOpen}
        onClose={() => setIsBettingSlipOpen(false)}
      />

      {/* Botão flutuante do boletim */}
      <button
        onClick={() => setIsBettingSlipOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-teal-600 text-white rounded-full shadow-lg flex items-center justify-center z-30 cursor-pointer hover:bg-teal-700 transition-colors"
      >
        <i className="ri-file-list-3-line text-2xl"></i>
      </button>
    </div>
  );
}

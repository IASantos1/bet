import { useState, useMemo } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface League {
  league: string;
  sport: string;
  count: number;
}

interface SportsMenuProps {
  onSelectLeague: (league: string | null) => void;
  onSelectSport: (sport: string | null) => void;
  selectedLeague: string | null;
  selectedSport: string | null;
  isDarkMode?: boolean;
  activeLeagues?: League[];
}

// ✅ DESPORTOS COM EMOJIS
const SPORTS = [
  { key: 'soccer', name: 'Futebol', emoji: '⚽' },
  { key: 'basketball', name: 'Basquetebol', emoji: '🏀' },
  { key: 'ice-hockey', name: 'Hóquei', emoji: '🏒' },
  { key: 'baseball', name: 'Basebol', emoji: '⚾' },
  { key: 'tennis', name: 'Ténis', emoji: '🎾' },
  { key: 'cricket', name: 'Críquete', emoji: '🏏' },
  { key: 'golf', name: 'PGA Tour', emoji: '🏌' },
  { key: 'horse-racing', name: 'Corridas de Cavalos', emoji: '🏇' },
  { key: 'rugby', name: 'Rugby', emoji: '🏉' },
  { key: 'volleyball', name: 'Vôlei', emoji: '🏐' },
  { key: 'mma', name: 'MMA', emoji: '🥊' },
  { key: 'handball', name: 'Andebol', emoji: '🤾' },
  { key: 'afl', name: 'AFL', emoji: '🏈' },
  { key: 'formula1', name: 'F1', emoji: '🏎️' },
];

const SPORT_ICON_URL_BY_KEY: Record<string, string> = {
  soccer: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/26bd.svg',
  basketball: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c0.svg',
  'ice-hockey': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3d2.svg',
  baseball: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/26be.svg',
  tennis: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3be.svg',
  cricket: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3cf.svg',
  golf: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3cc.svg',
  'horse-racing': 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c7.svg',
  rugby: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c9.svg',
  volleyball: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3d0.svg',
  mma: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f94a.svg',
  handball: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f93e.svg',
  afl: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3c8.svg',
  formula1: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f3ce.svg',
};

// ✅ PAÍSES COM BANDEIRAS OFICIAIS (URLs de imagens redondas)
const COUNTRY_FLAGS: Record<string, string> = {
  'Inglaterra': 'https://flagcdn.com/w40/gb-eng.png',
  'Espanha': 'https://flagcdn.com/w40/es.png',
  'Itália': 'https://flagcdn.com/w40/it.png',
  'Alemanha': 'https://flagcdn.com/w40/de.png',
  'França': 'https://flagcdn.com/w40/fr.png',
  'Portugal': 'https://flagcdn.com/w40/pt.png',
  'Holanda': 'https://flagcdn.com/w40/nl.png',
  'Brasil': 'https://flagcdn.com/w40/br.png',
  'Argentina': 'https://flagcdn.com/w40/ar.png',
  'Japão': 'https://flagcdn.com/w40/jp.png',
  'Arábia Saudita': 'https://flagcdn.com/w40/sa.png',
  'EUA': 'https://flagcdn.com/w40/us.png',
  'México': 'https://flagcdn.com/w40/mx.png',
  'Turquia': 'https://flagcdn.com/w40/tr.png',
  'Bélgica': 'https://flagcdn.com/w40/be.png',
  'Escócia': 'https://flagcdn.com/w40/gb-sct.png',
  'Europa': 'https://flagcdn.com/w40/eu.png',
  'Internacional': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Flag_of_the_United_Nations.svg/40px-Flag_of_the_United_Nations.svg.png',
};

// ✅ ÍCONES DAS LIGAS PARA TOP COMPETIÇÕES
const LEAGUE_ICONS: Record<string, string> = {
  'Champions League': '🏆',
  'UEFA Champions League': '🏆',
  'Premier League': '🦁',
  'La Liga': '🇪🇸',
  'Serie A': '🇮🇹',
  'Bundesliga': '🇩🇪',
  'Ligue 1': '🇫🇷',
  'Liga Portugal': '🇵🇹',
  'Primeira Liga': '🇵🇹',
  'Europa League': '🥈',
  'UEFA Europa League': '🥈',
  'Conference League': '🥉',
  'Brasileirão': '🇧🇷',
  'Brazil Serie A': '🇧🇷',
  'Liga Argentina': '🇦🇷',
  'MLS': '🇺🇸',
  'Liga MX': '🇲🇽',
  'Eredivisie': '🇳🇱',
  'NBA': '🏀',
  'NHL': '🏒',
  'MLB': '⚾',
  'UFC': '🥊',
  'F1 Championship': '🏎️',
  'AFL Premiership': '🏈',
  'Championship': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'J-League': '🇯🇵',
  'J1 League': '🇯🇵',
  'Saudi Pro League': '🇸🇦',
  'Super Lig': '🇹🇷',
  'Jupiler Pro League': '🇧🇪',
  'Scottish Premiership': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
};

// ✅ PAÍSES COM BANDEIRAS E LIGAS DE FUTEBOL
const FOOTBALL_COUNTRIES = [
  { 
    country: 'Inglaterra', 
    leagues: ['Premier League', 'Championship', 'League One', 'League Two', 'FA Cup', 'EFL Cup', 'Carabao Cup'] 
  },
  { 
    country: 'Espanha', 
    leagues: ['La Liga', 'La Liga 2', 'Segunda División', 'Copa del Rey'] 
  },
  { 
    country: 'Itália', 
    leagues: ['Serie A', 'Serie B', 'Coppa Italia'] 
  },
  { 
    country: 'Alemanha', 
    leagues: ['Bundesliga', '2. Bundesliga', 'DFB Pokal'] 
  },
  { 
    country: 'França', 
    leagues: ['Ligue 1', 'Ligue 2', 'Coupe de France'] 
  },
  { 
    country: 'Portugal', 
    leagues: ['Liga Portugal', 'Primeira Liga', 'Liga Portugal 2', 'Taça de Portugal'] 
  },
  { 
    country: 'Holanda', 
    leagues: ['Eredivisie', 'Eerste Divisie', 'KNVB Cup'] 
  },
  { 
    country: 'Brasil', 
    leagues: ['Brasileirão', 'Brazil Serie A', 'Série B', 'Brazil Serie B', 'Copa do Brasil'] 
  },
  { 
    country: 'Argentina', 
    leagues: ['Liga Profesional', 'Liga Argentina', 'Copa Argentina'] 
  },
  { 
    country: 'Japão', 
    leagues: ['J1 League', 'J2 League', 'J-League', 'J3 League', 'Emperor Cup', 'Japan'] 
  },
  { 
    country: 'Arábia Saudita', 
    leagues: ['Saudi Pro League', 'Saudi First Division'] 
  },
  { 
    country: 'EUA', 
    leagues: ['MLS', 'USL Championship', 'US Open Cup'] 
  },
  { 
    country: 'México', 
    leagues: ['Liga MX', 'Liga MX Expansion', 'Copa MX'] 
  },
  { 
    country: 'Turquia', 
    leagues: ['Süper Lig', 'Super Lig', 'Turkish 1. Lig', 'Turkish Cup'] 
  },
  { 
    country: 'Bélgica', 
    leagues: ['Jupiler Pro League', 'Belgian First Division B'] 
  },
  { 
    country: 'Escócia', 
    leagues: ['Scottish Premiership', 'Scottish Championship', 'Scottish Cup'] 
  },
  { 
    country: 'Europa', 
    leagues: ['Champions League', 'UEFA Champions League', 'Europa League', 'UEFA Europa League', 'Conference League', 'UEFA Super Cup'] 
  },
  { 
    country: 'Internacional', 
    leagues: ['Copa do Mundo', 'Copa América', 'Euro', 'Nations League', 'Amigáveis', 'Copa Libertadores', 'Copa Sudamericana'] 
  },
];

// ✅ NOVO: LIGAS PRINCIPAIS PARA OUTROS DESPORTOS
const SPORT_LEAGUES: Record<string, string[]> = {
  'ice-hockey': [
    'NHL',
    'KHL',
    'SHL',
    'Liiga',
    'DEL',
    'Champions Hockey League',
  ],
  baseball: [
    'MLB',
    'NPB',
    'KBO League',
    'World Baseball Classic',
  ],
  rugby: [
    'Six Nations',
    'Rugby Championship',
    'Premiership Rugby',
    'Top 14',
    'United Rugby Championship',
    'Super Rugby',
    'NRL',
    'Super League',
  ],
  volleyball: [
    'Superliga Masculina',
    'Superliga Feminina',
    'Serie A1',
    'SuperLega',
    'PlusLiga',
    'Sultanlar Ligi',
    'V.League',
    'FIVB World Championship',
    'Nations League',
    'CEV Champions League',
  ],
  mma: [
    'UFC',
    'Bellator MMA',
    'PFL',
    'ONE Championship',
    'RIZIN',
    'KSW',
  ],
  handball: [
    'Bundesliga',
    'Ligue Nationale de Handball',
    'Liga ASOBAL',
    'Herre Håndboldligaen',
    'EHF Champions League',
  ],
  afl: [
    'AFL Premiership',
    'AFL Finals',
    'AFLW',
  ],
  formula1: [
    'F1 World Championship',
    'F1 Sprint',
  ],
};

// ✅ LIGAS PRIORITÁRIAS PARA TOP COMPETIÇÕES (ordem de prioridade)
const TOP_LEAGUES_PRIORITY = [
  'Champions League',
  'Premier League',
  'La Liga',
  'Serie A',
  'Bundesliga',
  'Ligue 1',
  'Liga Portugal',
  'Europa League',
  'Brasileirão',
  'NBA',
  'NHL',
  'MLB',
  'UFC',
  'F1 Championship',
  'AFL Premiership',
];

export function SportsMenu({
  onSelectLeague,
  onSelectSport,
  selectedLeague,
  selectedSport,
  isDarkMode: _isDarkMode = true,
  activeLeagues = [],
}: SportsMenuProps) {
  const { theme } = useTheme();
  const [expandedSport, setExpandedSport] = useState<string | null>(null);
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
  const [sportsExpanded, setSportsExpanded] = useState(true);
  const [showOnlyWithEvents, _setShowOnlyWithEvents] = useState(false);

  // ✅ TOP 5 COMPETIÇÕES AUTOMÁTICAS (PRÉ-JOGOS + AO VIVO)
  const topCompetitions = useMemo(() => {
    const availableTop: League[] = [];
    
    for (const priorityLeague of TOP_LEAGUES_PRIORITY) {
      const found = activeLeagues.find(l => 
        l.league.toLowerCase().includes(priorityLeague.toLowerCase()) ||
        priorityLeague.toLowerCase().includes(l.league.toLowerCase())
      );
      if (found && found.count > 0) {
        availableTop.push(found);
      }
      if (availableTop.length >= 5) break;
    }
    
    return availableTop;
  }, [activeLeagues]);

  // Agrupar ligas por desporto
  const leaguesBySport = useMemo(() => {
    return activeLeagues.reduce((acc, league) => {
      const sportKey = league.sport.toLowerCase()
        .replace('futebol', 'soccer')
        .replace('basquetebol', 'basketball')
        .replace('hóquei', 'ice-hockey')
        .replace('basebol', 'baseball')
        .replace('ténis', 'tennis')
        .replace('tênis', 'tennis')
        .replace('críquete', 'cricket')
        .replace('criquete', 'cricket')
        .replace('pga tour', 'golf')
        .replace('golfe', 'golf')
        .replace('corridas de cavalos', 'horse-racing')
        .replace('corrida de cavalos', 'horse-racing')
        .replace('vôlei', 'volleyball')
        .replace('voleibol', 'volleyball')
        .replace('andebol', 'handball')
        .replace('fórmula 1', 'formula1')
        .replace('rúgbi', 'rugby');
      if (!acc[sportKey]) acc[sportKey] = [];
      acc[sportKey].push(league);
      return acc;
    }, {} as Record<string, League[]>);
  }, [activeLeagues]);

  // Contar eventos por desporto
  const countBySport = useMemo(() => {
    const counts: Record<string, number> = {};
    SPORTS.forEach(sport => {
      const leagues = leaguesBySport[sport.key] || [];
      counts[sport.key] = leagues.reduce((sum, l) => sum + l.count, 0);
    });
    return counts;
  }, [leaguesBySport]);

  // Total de eventos
  const totalEvents = useMemo(() => {
    return Object.values(countBySport).reduce((sum, count) => sum + count, 0);
  }, [countBySport]);

  // ✅ NOVO: Desportos com eventos
  const sportsWithEvents = useMemo(() => {
    return SPORTS.filter(sport => countBySport[sport.key] > 0);
  }, [countBySport]);

  // ✅ NOVO: Desportos sem eventos
  const sportsWithoutEvents = useMemo(() => {
    return SPORTS.filter(sport => countBySport[sport.key] === 0);
  }, [countBySport]);

  // ✅ NOVO: Filtrar ligas de outros desportos
  const getLeaguesForSport = (sportKey: string) => {
    const sportLeagues = leaguesBySport[sportKey] || [];
    const knownLeagues = SPORT_LEAGUES[sportKey] || [];
    
    return sportLeagues.filter(l => 
      knownLeagues.some(kl => 
        l.league.toLowerCase().includes(kl.toLowerCase()) ||
        kl.toLowerCase().includes(l.league.toLowerCase())
      )
    );
  };

  // Filtrar ligas de futebol por país
  const getLeaguesForCountry = (countryLeagues: string[]) => {
    const footballLeagues = leaguesBySport['soccer'] || [];
    return footballLeagues.filter(l => 
      countryLeagues.some(cl => 
        l.league.toLowerCase().includes(cl.toLowerCase()) ||
        cl.toLowerCase().includes(l.league.toLowerCase())
      )
    );
  };

  const handleSportClick = (sportKey: string) => {
    if (expandedSport === sportKey) {
      setExpandedSport(null);
      setExpandedCountry(null);
    } else {
      setExpandedSport(sportKey);
      setExpandedCountry(null);
    }
  };

  const handleCountryClick = (country: string) => {
    if (expandedCountry === country) {
      setExpandedCountry(null);
    } else {
      setExpandedCountry(country);
    }
  };

  const handleLeagueClick = (league: string) => {
    onSelectLeague(selectedLeague === league ? null : league);
    onSelectSport(null);
  };

  const handleSportFilter = (sportKey: string) => {
    onSelectSport(selectedSport === sportKey ? null : sportKey);
    onSelectLeague(null);
  };

  // ✅ Obter ícone da liga
  const getLeagueIcon = (leagueName: string): string => {
    for (const [key, icon] of Object.entries(LEAGUE_ICONS)) {
      if (leagueName.toLowerCase().includes(key.toLowerCase()) || 
          key.toLowerCase().includes(leagueName.toLowerCase())) {
        return icon;
      }
    }
    return '⚽';
  };

  // ✅ NOVO: Renderizar item de desporto
  const renderSportItem = (sport: typeof SPORTS[0], hasEvents: boolean) => {
    const sportCount = countBySport[sport.key] || 0;
    const isExpanded = expandedSport === sport.key;
    const isFootball = sport.key === 'soccer';
    const sportLeagues = isFootball ? [] : getLeaguesForSport(sport.key);

    return (
      <div key={sport.key}>
        {/* Cabeçalho do Desporto */}
        <button
          onClick={() => {
            if (hasEvents) {
              if (isFootball) {
                handleSportClick(sport.key);
              } else if (sportLeagues.length > 0) {
                handleSportClick(sport.key);
              } else {
                handleSportFilter(sport.key);
              }
            }
          }}
          disabled={!hasEvents}
          className={`w-full px-3 py-2.5 pl-5 flex items-center justify-between transition-all ${
            hasEvents ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
          } ${
            selectedSport === sport.key || isExpanded
              ? theme === 'dark'
                ? 'bg-gray-800/70 text-white'
                : 'bg-gray-100 text-gray-900'
              : hasEvents
                ? theme === 'dark'
                  ? 'hover:bg-gray-800/40 text-gray-300'
                  : 'hover:bg-gray-50 text-gray-700'
                : theme === 'dark'
                  ? 'text-gray-600'
                  : 'text-gray-400'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <img
              src={SPORT_ICON_URL_BY_KEY[sport.key] || SPORT_ICON_URL_BY_KEY.soccer}
              alt=""
              aria-hidden={true}
              className={`w-4 h-4 object-contain ${!hasEvents ? 'grayscale opacity-50' : ''}`}
            />
            <span className="text-xs font-semibold">{sport.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {hasEvents ? (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                theme === 'dark' 
                  ? 'bg-emerald-500/20 text-emerald-400' 
                  : 'bg-emerald-100 text-emerald-600'
              }`}>
                {sportCount}
              </span>
            ) : (
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                theme === 'dark' ? 'bg-gray-800 text-gray-600' : 'bg-gray-200 text-gray-400'
              }`}>
                0
              </span>
            )}
            {hasEvents && (isFootball || sportLeagues.length > 0) && (
              <i className={`ri-arrow-${isExpanded || selectedSport === sport.key ? 'down' : 'right'}-s-line text-xs opacity-50`}></i>
            )}
          </div>
        </button>

        {/* ✅ PAÍSES (apenas para Futebol) */}
        {isFootball && isExpanded && hasEvents && (
          <div className={`${theme === 'dark' ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
            {FOOTBALL_COUNTRIES.map((countryData) => {
              const countryLeagues = getLeaguesForCountry(countryData.leagues);
              const countryCount = countryLeagues.reduce((sum, l) => sum + l.count, 0);
              const isCountryExpanded = expandedCountry === countryData.country;
              const flagUrl = COUNTRY_FLAGS[countryData.country];

              if (countryCount === 0) return null;

              return (
                <div key={countryData.country}>
                  {/* País com bandeira oficial redonda */}
                  <button
                    onClick={() => handleCountryClick(countryData.country)}
                    className={`w-full px-3 py-2 pl-8 flex items-center justify-between transition-all cursor-pointer ${
                      isCountryExpanded
                        ? theme === 'dark'
                          ? 'bg-gray-800/50 text-white'
                          : 'bg-gray-100 text-gray-900'
                        : theme === 'dark'
                          ? 'hover:bg-gray-800/30 text-gray-400'
                          : 'hover:bg-gray-100 text-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* ✅ NOVO: Bandeira oficial redonda */}
                      {flagUrl ? (
                        <img 
                          src={flagUrl} 
                          alt={countryData.country}
                          className="w-5 h-5 rounded-full object-cover border border-gray-600/30"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="text-sm">🌍</span>
                      )}
                      <span className="text-[11px] font-medium">{countryData.country}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                        theme === 'dark' ? 'bg-gray-800 text-gray-500' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {countryCount}
                      </span>
                      <i className={`ri-arrow-${isCountryExpanded ? 'down' : 'right'}-s-line text-[10px] opacity-50`}></i>
                    </div>
                  </button>

                  {/* ✅ LIGAS DO PAÍS */}
                  {isCountryExpanded && (
                    <div className={`${theme === 'dark' ? 'bg-gray-900/70' : 'bg-gray-100'}`}>
                      {countryLeagues.map((league) => (
                        <button
                          key={league.league}
                          onClick={() => handleLeagueClick(league.league)}
                          className={`w-full px-3 py-1.5 pl-14 flex items-center justify-between transition-all cursor-pointer ${
                            selectedLeague === league.league
                              ? theme === 'dark'
                                ? 'bg-red-600/15 text-red-300'
                                : 'bg-red-50 text-red-700'
                              : theme === 'dark'
                                ? 'hover:bg-gray-800/40 text-gray-500'
                                : 'hover:bg-gray-200 text-gray-600'
                          }`}
                        >
                          <span className="text-[10px] font-medium truncate">{league.league}</span>
                          <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${
                            theme === 'dark' ? 'bg-gray-800 text-gray-600' : 'bg-gray-300 text-gray-500'
                          }`}>
                            {league.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ✅ NOVO: LIGAS (para outros desportos) */}
        {!isFootball && isExpanded && sportLeagues.length > 0 && hasEvents && (
          <div className={`${theme === 'dark' ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
            {sportLeagues.map((league) => (
              <button
                key={league.league}
                onClick={() => handleLeagueClick(league.league)}
                className={`w-full px-3 py-1.5 pl-10 flex items-center justify-between transition-all cursor-pointer ${
                  selectedLeague === league.league
                    ? theme === 'dark'
                      ? 'bg-red-600/15 text-red-300'
                      : 'bg-red-50 text-red-700'
                    : theme === 'dark'
                      ? 'hover:bg-gray-800/40 text-gray-500'
                      : 'hover:bg-gray-200 text-gray-600'
                }`}
              >
                <span className="text-[10px] font-medium truncate">{league.league}</span>
                <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${
                  theme === 'dark' ? 'bg-gray-800 text-gray-600' : 'bg-gray-300 text-gray-500'
                }`}>
                  {league.count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="py-2">
      {/* ✅ TOP COMPETIÇÕES (5 ligas automáticas - PRÉ-JOGOS + AO VIVO) */}
      <div className="mb-3">
        <div className={`px-3 py-2 flex items-center gap-2 ${
          theme === 'dark' ? 'text-red-400' : 'text-red-600'
        }`}>
          <span className="text-sm">⭐</span>
          <span className="text-xs font-bold uppercase tracking-wide">Top Competições</span>
        </div>
        
        <div className="space-y-0.5">
          {topCompetitions.map((league) => (
            <button
              key={league.league}
              onClick={() => handleLeagueClick(league.league)}
              className={`w-full px-3 py-2 pl-6 flex items-center justify-between transition-all cursor-pointer ${
                selectedLeague === league.league
                  ? theme === 'dark'
                    ? 'bg-red-600/20 text-red-300 border-l-2 border-red-400'
                    : 'bg-red-50 text-red-700 border-l-2 border-red-500'
                  : theme === 'dark'
                    ? 'hover:bg-gray-800/50 text-gray-300'
                    : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{getLeagueIcon(league.league)}</span>
                <span className="text-xs font-medium truncate">{league.league}</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-600'
              }`}>
                {league.count}
              </span>
            </button>
          ))}
          
          {topCompetitions.length === 0 && (
            <div className={`px-3 py-3 text-center text-xs ${
              theme === 'dark' ? 'text-gray-600' : 'text-gray-400'
            }`}>
              Nenhum evento disponível
            </div>
          )}
        </div>
      </div>

      {/* ✅ SEPARADOR */}
      <div className={`mx-3 border-t ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}></div>

      {/* ✅ BOTÃO DESPORTOS EXPANSÍVEL */}
      <div className="mt-3">
        <button
          onClick={() => setSportsExpanded(!sportsExpanded)}
          className={`w-full px-3 py-2.5 flex items-center justify-between transition-all cursor-pointer ${
            sportsExpanded
              ? theme === 'dark'
                ? 'bg-gradient-to-r from-red-600/20 to-red-500/10 text-red-300'
                : 'bg-gradient-to-r from-red-50 to-red-100 text-red-700'
              : theme === 'dark'
                ? 'hover:bg-gray-800/40 text-gray-300'
                : 'hover:bg-gray-50 text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-6 h-6 flex items-center justify-center rounded-lg ${
              sportsExpanded 
                ? theme === 'dark' ? 'bg-red-600/30' : 'bg-red-100'
                : theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'
            }`}>
              <i className={`ri-apps-2-line text-sm ${sportsExpanded ? 'text-red-300' : ''}`}></i>
            </div>
            <span className="text-xs font-bold">Todos os Desportos</span>
          </div>
          <div className="flex items-center gap-2">
            {totalEvents > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                theme === 'dark' ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-600'
              }`}>
                {totalEvents}
              </span>
            )}
            <i className={`ri-arrow-${sportsExpanded ? 'up' : 'down'}-s-line text-sm opacity-60`}></i>
          </div>
        </button>

        {/* ✅ LISTA DE DESPORTOS (expansível) */}
        {sportsExpanded && (
          <div className={`${theme === 'dark' ? 'bg-gray-900/30' : 'bg-gray-50/50'}`}>
            {/* ✅ Desportos COM eventos */}
            {sportsWithEvents.length > 0 && (
              <>
                <div className={`px-3 py-1.5 flex items-center gap-2 ${
                  theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
                }`}>
                  <i className="ri-checkbox-circle-fill text-xs"></i>
                  <span className="text-[10px] font-semibold uppercase tracking-wide">
                    Com Eventos ({sportsWithEvents.length})
                  </span>
                </div>
                {sportsWithEvents.map((sport) => renderSportItem(sport, true))}
              </>
            )}

            {/* ✅ Desportos SEM eventos (se não estiver filtrado) */}
            {!showOnlyWithEvents && sportsWithoutEvents.length > 0 && (
              <>
                <div className={`px-3 py-1.5 mt-2 flex items-center gap-2 border-t ${
                  theme === 'dark' ? 'border-gray-800 text-gray-600' : 'border-gray-200 text-gray-400'
                }`}>
                  <i className="ri-close-circle-line text-xs"></i>
                  <span className="text-[10px] font-semibold uppercase tracking-wide">
                    Sem Eventos ({sportsWithoutEvents.length})
                  </span>
                </div>
                {sportsWithoutEvents.map((sport) => renderSportItem(sport, false))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Mensagem se não houver eventos */}
      {activeLeagues.length === 0 && (
        <div className="px-3 py-8 text-center">
          <span className="text-2xl mb-2 block">⚽</span>
          <p className={`text-[11px] ${theme === 'dark' ? 'text-gray-600' : 'text-gray-500'}`}>
            Nenhum evento disponível
          </p>
        </div>
      )}
    </div>
  );
}

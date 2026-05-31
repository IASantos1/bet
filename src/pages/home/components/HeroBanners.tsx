
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getCachedLogo, cacheLogo } from '../../../services/logoCache';
import { useTheme } from '../../../contexts/ThemeContext';

interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  isLive: boolean;
  score?: { home: number; away: number };
  minute?: string;
  odds?: {
    home?: number;
    draw?: number;
    away?: number;
  };
  homeTeamLogo?: string;
  awayTeamLogo?: string;
}

interface HeroBannersProps {
  featuredMatches: Array<{ match: Match; isLive: boolean; style: any }>;
  onSelectMatch: (match: Match) => void;
  onAddSelection: (match: Match, selection: string, odd: number, market?: string) => void;
}

// Imagens específicas para cada desporto mostrando o cenário/campo do jogo
const sportImageMap: Record<string, string> = {
  'Futebol': 'https://readdy.ai/api/search-image?query=professional%20football%20soccer%20pitch%20stadium%20aerial%20view%20green%20grass%20field%20with%20white%20lines%20and%20goals%20empty%20field%20dramatic%20lighting%20cinematic%20atmosphere&width=400&height=250&seq=footballfield2024&orientation=landscape',
  'Basquetebol': 'https://readdy.ai/api/search-image?query=indoor%20basketball%20court%20wooden%20parquet%20floor%20with%20orange%20and%20white%20painted%20lines%20free%20throw%20lane%20three%20point%20arc%20NBA%20professional%20arena%20empty%20court%20top%20view%20dramatic%20spotlight%20lighting&width=400&height=250&seq=basketcourtwood2025&orientation=landscape',
  'Basketball': 'https://readdy.ai/api/search-image?query=indoor%20basketball%20court%20wooden%20parquet%20floor%20with%20orange%20and%20white%20painted%20lines%20free%20throw%20lane%20three%20point%20arc%20NBA%20professional%20arena%20empty%20court%20top%20view%20dramatic%20spotlight%20lighting&width=400&height=250&seq=basketcourtwood2025&orientation=landscape',
  'Hóquei': 'https://readdy.ai/api/search-image?query=professional%20ice%20hockey%20rink%20white%20ice%20surface%20with%20red%20and%20blue%20painted%20lines%20face%20off%20circles%20NHL%20arena%20empty%20rink%20dramatic%20lighting%20cinematic%20atmosphere&width=400&height=250&seq=hockeyrink2024&orientation=landscape',
  'Basebol': 'https://readdy.ai/api/search-image?query=professional%20baseball%20diamond%20field%20green%20grass%20brown%20dirt%20infield%20bases%20home%20plate%20MLB%20stadium%20empty%20field%20dramatic%20lighting%20cinematic%20atmosphere&width=400&height=250&seq=baseballfield2024&orientation=landscape',
  'NFL': 'https://readdy.ai/api/search-image?query=professional%20american%20football%20field%20green%20grass%20with%20white%20yard%20lines%20hash%20marks%20end%20zones%20NFL%20stadium%20empty%20field%20dramatic%20lighting%20cinematic%20atmosphere&width=400&height=250&seq=nflfield2024&orientation=landscape',
  'MMA': 'https://readdy.ai/api/search-image?query=UFC%20octagon%20cage%20MMA%20fighting%20ring%20canvas%20floor%20with%20sponsor%20logos%20empty%20arena%20dramatic%20red%20lighting%20cinematic%20atmosphere&width=400&height=250&seq=mmaoctagon2024&orientation=landscape',
  'Rúgbi': 'https://readdy.ai/api/search-image?query=professional%20rugby%20pitch%20green%20grass%20field%20with%20white%20lines%20try%20zones%20goal%20posts%20stadium%20empty%20field%20dramatic%20lighting%20cinematic%20atmosphere&width=400&height=250&seq=rugbyfield2024&orientation=landscape',
  'Voleibol': 'https://readdy.ai/api/search-image?query=professional%20volleyball%20court%20indoor%20arena%20wooden%20floor%20with%20colored%20boundary%20lines%20net%20in%20center%20empty%20court%20dramatic%20lighting%20cinematic%20atmosphere&width=400&height=250&seq=volleyballcourt2024&orientation=landscape',
  'Fórmula 1': 'https://readdy.ai/api/search-image?query=formula%20one%20F1%20race%20track%20circuit%20asphalt%20with%20red%20and%20white%20curbs%20starting%20grid%20pit%20lane%20dramatic%20lighting%20cinematic%20atmosphere&width=400&height=250&seq=f1track2024&orientation=landscape',
  'Handebol': 'https://readdy.ai/api/search-image?query=professional%20handball%20court%20indoor%20arena%20wooden%20floor%20with%20colored%20lines%20goal%20areas%20empty%20court%20dramatic%20lighting%20cinematic%20atmosphere&width=400&height=250&seq=handballcourt2024&orientation=landscape',
  'AFL': 'https://readdy.ai/api/search-image?query=AFL%20australian%20football%20oval%20field%20green%20grass%20stadium%20goal%20posts%20empty%20field%20dramatic%20lighting%20cinematic%20atmosphere&width=400&height=250&seq=aflfield2024&orientation=landscape',
  'Ténis': 'https://readdy.ai/api/search-image?query=professional%20tennis%20court%20hard%20court%20surface%20with%20white%20lines%20service%20boxes%20net%20in%20center%20empty%20court%20dramatic%20lighting%20cinematic%20atmosphere&width=400&height=250&seq=tenniscourt2024&orientation=landscape',
};

const defaultSportImage = 'https://readdy.ai/api/search-image?query=aerial%20view%20of%20professional%20sports%20stadium%20arena%20empty%20field%20dramatic%20night%20lighting%20dark%20cinematic%20atmosphere%20top%20down%20view&width=400&height=250&seq=sportdefault1&orientation=landscape';

// ✅ NOVO: Componente de Logo Oficial da Equipa (sem iniciais/círculos)
const TeamOfficialLogo = ({ 
  teamName, 
  teamLogo, 
  size = 'md' 
}: { 
  teamName: string; 
  teamLogo?: string;
  size?: 'sm' | 'md' | 'lg' 
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  // Carregar logo do cache ou fazer download
  useEffect(() => {
    if (!teamLogo) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    const loadLogo = async () => {
      try {
        // Tentar obter do cache primeiro
        const cached = await getCachedLogo(teamLogo);
        if (cached) {
          setCachedUrl(cached);
          setIsLoading(false);
          return;
        }

        // Se não estiver em cache, usar URL original e guardar em background
        setCachedUrl(teamLogo);
        setIsLoading(false);
        
        // Guardar no cache em background
        cacheLogo(teamLogo).then((base64) => {
          if (base64) setCachedUrl(base64);
        });
      } catch {
        setCachedUrl(teamLogo);
        setIsLoading(false);
      }
    };

    loadLogo();
  }, [teamLogo]);
  
  const showLogo = cachedUrl && !hasError;
  
  return (
    <div className={`${sizeClasses[size]} flex items-center justify-center flex-shrink-0 overflow-hidden relative`}>
      {/* Skeleton loading */}
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-r from-gray-600 via-gray-500 to-gray-600 animate-pulse rounded-lg" />
      )}
      
      {showLogo ? (
        <img 
          src={cachedUrl} 
          alt={teamName}
          className={`w-full h-full object-contain transition-opacity duration-300 drop-shadow-lg ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
      ) : !isLoading && (
        // ✅ Fallback: ícone genérico de escudo em vez de iniciais
        <div className="w-full h-full flex items-center justify-center bg-white/10 rounded-lg backdrop-blur-sm">
          <i className="ri-shield-line text-white/60 text-lg"></i>
        </div>
      )}
    </div>
  );
};

// Componente de imagem de fundo com skeleton loading
const BannerBackgroundImage = ({ 
  src, 
  alt, 
  sport 
}: { 
  src: string; 
  alt: string;
  sport: string;
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="absolute inset-0">
      {/* Skeleton loading animado */}
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-gray-700 to-gray-800">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              <span className="text-white/40 text-[10px] font-medium">{sport}</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Imagem real */}
      {!hasError && (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
      )}
      
      {/* Fallback gradient quando há erro */}
      {hasError && (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />
      )}
    </div>
  );
};

const FloatingParticles = ({ color }: { color: string }) => (
  <>
    {[...Array(4)].map((_, i) => (
      <div
        key={i}
        className={`absolute w-0.5 h-0.5 ${color} rounded-full opacity-50 animate-float-particle`}
        style={{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animationDelay: `${i * 0.6}s`,
          animationDuration: `${3 + Math.random() * 2}s`,
        }}
      />
    ))}
  </>
);

export const HeroBanners: React.FC<HeroBannersProps> = ({ featuredMatches, onSelectMatch, onAddSelection }) => {
  const { theme } = useTheme();
  
  const handleMatchClick = (match: Match) => {
    onSelectMatch(match);
  };

  const handleOddClick = (e: React.MouseEvent, match: Match, selection: string, odd: number) => {
    e.stopPropagation();
    onAddSelection(match, selection, odd, '1X2');
  };

  const getSportImage = (sport: string) => {
    // Verificar variações do nome do desporto
    const normalizedSport = sport.toLowerCase();
    
    if (normalizedSport.includes('basquet') || normalizedSport.includes('basket') || normalizedSport === 'nba') {
      return sportImageMap['Basquetebol'];
    }
    if (normalizedSport.includes('futebol') || normalizedSport.includes('soccer') || normalizedSport.includes('football')) {
      if (normalizedSport.includes('americano') || normalizedSport === 'nfl') {
        return sportImageMap['NFL'];
      }
      return sportImageMap['Futebol'];
    }
    if (normalizedSport.includes('hóquei') || normalizedSport.includes('hockey') || normalizedSport === 'nhl') {
      return sportImageMap['Hóquei'];
    }
    if (normalizedSport.includes('basebol') || normalizedSport.includes('baseball') || normalizedSport === 'mlb') {
      return sportImageMap['Basebol'];
    }
    if (normalizedSport.includes('mma') || normalizedSport.includes('ufc') || normalizedSport.includes('boxe')) {
      return sportImageMap['MMA'];
    }
    if (normalizedSport.includes('rúgbi') || normalizedSport.includes('rugby')) {
      return sportImageMap['Rúgbi'];
    }
    if (normalizedSport.includes('volei') || normalizedSport.includes('volleyball')) {
      return sportImageMap['Voleibol'];
    }
    if (normalizedSport.includes('fórmula') || normalizedSport.includes('formula') || normalizedSport.includes('f1')) {
      return sportImageMap['Fórmula 1'];
    }
    if (normalizedSport.includes('handebol') || normalizedSport.includes('handball')) {
      return sportImageMap['Handebol'];
    }
    if (normalizedSport.includes('ténis') || normalizedSport.includes('tennis')) {
      return sportImageMap['Ténis'];
    }
    if (normalizedSport.includes('afl')) {
      return sportImageMap['AFL'];
    }
    
    return sportImageMap[sport] || defaultSportImage;
  };

  return (
    <div className="relative space-y-1.5 w-full max-w-full">
      {/* Banner Promocional - Ultra Compacto */}
      <Link
        to="/promocoes"
        className="group block relative overflow-hidden rounded-lg cursor-pointer animate-banner-entrance w-full"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-amber-600 via-red-500 to-amber-600 animate-gradient-shift" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-shimmer" />
        </div>
        <FloatingParticles color="bg-yellow-300" />

        <div className="relative flex items-center justify-between px-3 py-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-6 h-6 flex items-center justify-center bg-white/20 backdrop-blur-sm rounded-md animate-float-y">
                <i className="ri-gift-2-fill text-white text-xs"></i>
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="bg-white/20 backdrop-blur-sm text-white text-[7px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  🔥 BÓNUS
                </span>
                <p className="text-white font-bold text-[10px] leading-tight truncate">
                  100% até €200 no 1º depósito
                </p>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 ml-2">
            <div className="px-2 py-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-md text-white text-[9px] font-bold whitespace-nowrap transition-all group-hover:scale-105 flex items-center gap-1 border border-white/20">
              <span>Ver Ofertas</span>
              <i className="ri-arrow-right-line text-[9px]"></i>
            </div>
          </div>
        </div>
      </Link>

      {/* Banners de Destaque - Com logos oficiais */}
      <div className="relative w-full">
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide w-full">
          {featuredMatches && featuredMatches.length > 0 && featuredMatches.map((featured, index) => {
            const match = featured.match;
            return (
              <div
                key={match.id}
                className={`relative flex-shrink-0 w-[72vw] md:w-[280px] h-[130px] md:h-[140px] rounded-xl overflow-hidden cursor-pointer group snap-start shadow-lg animate-banner-entrance ${
                  theme === 'light' ? 'ring-1 ring-gray-200' : ''
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
                onClick={() => handleMatchClick(match)}
              >
                {/* Imagem de fundo com skeleton loading */}
                <BannerBackgroundImage
                  src={getSportImage(match.sport)}
                  alt={`${match.sport} field`}
                  sport={match.sport}
                />

                {/* Overlay escuro com gradiente para contraste */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/30" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40" />

                {/* Conteúdo do banner */}
                <div className="relative h-full flex flex-col justify-between p-2.5 md:p-3 z-10">
                  {/* Topo - Liga + Badge Live */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {match.isLive && (
                        <div className="flex items-center gap-0.5 bg-red-500 px-1.5 py-0.5 rounded shadow-lg shadow-red-500/50">
                          <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                          <span className="text-white text-[7px] font-bold uppercase">Live</span>
                        </div>
                      )}
                      <span className="text-white/70 text-[9px] font-medium truncate bg-black/30 px-1.5 py-0.5 rounded backdrop-blur-sm">{match.league}</span>
                    </div>
                    {/* Placar ao vivo */}
                    {match.isLive && match.score && (
                      <div className="bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-lg border border-white/20">
                        <span className="text-white font-black text-sm leading-tight">
                          {match.score.home}-{match.score.away}
                        </span>
                        {match.minute && (
                          <span className="text-amber-400 text-[8px] ml-1 font-semibold">{match.minute}&apos;</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ✅ NOVO: Centro - Equipas com logos oficiais (sem iniciais/círculos) */}
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <TeamOfficialLogo 
                        teamName={match.homeTeam} 
                        teamLogo={match.homeTeamLogo}
                        size="lg" 
                      />
                      <span className="text-white font-bold text-[10px] md:text-xs text-center truncate max-w-[80px] drop-shadow-lg leading-tight">
                        {match.homeTeam}
                      </span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-white/50 text-[10px] font-bold">VS</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <TeamOfficialLogo 
                        teamName={match.awayTeam} 
                        teamLogo={match.awayTeamLogo}
                        size="lg" 
                      />
                      <span className="text-white/90 font-bold text-[10px] md:text-xs text-center truncate max-w-[80px] drop-shadow-lg leading-tight">
                        {match.awayTeam}
                      </span>
                    </div>
                  </div>

                  {/* Fundo - Odds vermelhas */}
                  {match.odds && (
                    <div className="flex gap-1.5">
                      {match.odds.home && (
                        <button
                          onClick={(e) => handleOddClick(e, match, '1', match.odds!.home!)}
                          className="flex-1 min-h-[30px] flex flex-col items-center justify-center px-1.5 py-0.5 rounded-lg transition-all duration-200 cursor-pointer bg-red-600 hover:bg-red-700 text-white border border-red-600 active:scale-95"
                        >
                          <span className="text-[8px] font-semibold leading-none text-white/80">1</span>
                          <span className="font-black text-xs leading-tight">{match.odds.home.toFixed(2)}</span>
                        </button>
                      )}
                      {match.odds.draw !== undefined && match.odds.draw !== null && (
                        <button
                          onClick={(e) => handleOddClick(e, match, 'X', match.odds!.draw!)}
                          className="flex-1 min-h-[30px] flex flex-col items-center justify-center px-1.5 py-0.5 rounded-lg transition-all duration-200 cursor-pointer bg-red-600 hover:bg-red-700 text-white border border-red-600 active:scale-95"
                        >
                          <span className="text-[8px] font-semibold leading-none text-white/80">X</span>
                          <span className="font-black text-xs leading-tight">{match.odds.draw.toFixed(2)}</span>
                        </button>
                      )}
                      {match.odds.away && (
                        <button
                          onClick={(e) => handleOddClick(e, match, '2', match.odds!.away!)}
                          className="flex-1 min-h-[30px] flex flex-col items-center justify-center px-1.5 py-0.5 rounded-lg transition-all duration-200 cursor-pointer bg-red-600 hover:bg-red-700 text-white border border-red-600 active:scale-95"
                        >
                          <span className="text-[8px] font-semibold leading-none text-white/80">2</span>
                          <span className="font-black text-xs leading-tight">{match.odds.away.toFixed(2)}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Shimmer hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

import { useMemo } from 'react';

interface EventBannerImageProps {
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league?: string;
}

const sportThemes = {
  football: {
    colors: ['#10b981', '#059669', '#047857'],
    icon: '⚽',
    gradient: 'from-emerald-600 via-green-600 to-teal-700',
  },
  basketball: {
    colors: ['#f97316', '#ea580c', '#c2410c'],
    icon: '🏀',
    gradient: 'from-orange-600 via-orange-700 to-red-600',
  },
  hockey: {
    colors: ['#3b82f6', '#2563eb', '#1d4ed8'],
    icon: '🏒',
    gradient: 'from-blue-600 via-blue-700 to-indigo-700',
  },
  tennis: {
    colors: ['#eab308', '#ca8a04', '#a16207'],
    icon: '🎾',
    gradient: 'from-yellow-600 via-yellow-700 to-amber-700',
  },
  baseball: {
    colors: ['#dc2626', '#b91c1c', '#991b1b'],
    icon: '⚾',
    gradient: 'from-red-600 via-red-700 to-rose-700',
  },
  volleyball: {
    colors: ['#8b5cf6', '#7c3aed', '#6d28d9'],
    icon: '🏐',
    gradient: 'from-violet-600 via-purple-600 to-purple-700',
  },
  handball: {
    colors: ['#06b6d4', '#0891b2', '#0e7490'],
    icon: '🤾',
    gradient: 'from-cyan-600 via-cyan-700 to-teal-600',
  },
  rugby: {
    colors: ['#84cc16', '#65a30d', '#4d7c0f'],
    icon: '🏉',
    gradient: 'from-lime-600 via-green-600 to-green-700',
  },
  default: {
    colors: ['#6366f1', '#4f46e5', '#4338ca'],
    icon: '🏆',
    gradient: 'from-indigo-600 via-indigo-700 to-blue-700',
  },
};

export const EventBannerImage: React.FC<EventBannerImageProps> = ({
  homeTeam,
  awayTeam,
  sport,
  league,
}) => {
  const theme = useMemo(() => {
    const sportKey = sport.toLowerCase();
    return sportThemes[sportKey as keyof typeof sportThemes] || sportThemes.default;
  }, [sport]);

  const getInitials = (teamName: string) => {
    const words = teamName.trim().split(' ');
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return words
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  };

  const homeInitials = getInitials(homeTeam);
  const awayInitials = getInitials(awayTeam);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Gradiente de fundo animado */}
      <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient} animate-gradient-shift`} />
      
      {/* Padrão de fundo com opacidade */}
      <div className="absolute inset-0 opacity-10">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Orbes de luz animados */}
      <div className="absolute top-0 left-1/4 w-32 h-32 bg-white/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-40 h-40 bg-white/15 rounded-full blur-3xl animate-pulse delay-1000" />

      {/* Ícone do desporto gigante no centro */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20">
        <div className="text-[120px] md:text-[140px] transform rotate-12 animate-float">
          {theme.icon}
        </div>
      </div>

      {/* Escudos das equipas */}
      <div className="absolute inset-0 flex items-center justify-between px-4 md:px-8">
        {/* Escudo Casa */}
        <div className="relative group">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-white/10 backdrop-blur-sm rounded-lg border-2 border-white/30 flex items-center justify-center transform -rotate-6 group-hover:rotate-0 transition-transform duration-300">
            <div className="text-white font-bold text-xl md:text-2xl drop-shadow-lg">
              {homeInitials}
            </div>
          </div>
          {/* Brilho */}
          <div className="absolute inset-0 bg-white/20 rounded-lg blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>

        {/* VS no centro */}
        <div className="relative">
          <div className="w-12 h-12 md:w-14 md:h-14 bg-white/20 backdrop-blur-md rounded-full border-2 border-white/40 flex items-center justify-center shadow-2xl">
            <span className="text-white font-black text-sm md:text-base drop-shadow-lg">VS</span>
          </div>
          {/* Anéis rotativos */}
          <div className="absolute inset-0 border-2 border-white/30 rounded-full animate-spin-slow" />
          <div className="absolute inset-0 border-2 border-white/20 rounded-full animate-spin-reverse" style={{ animationDuration: '8s' }} />
        </div>

        {/* Escudo Fora */}
        <div className="relative group">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-white/10 backdrop-blur-sm rounded-lg border-2 border-white/30 flex items-center justify-center transform rotate-6 group-hover:rotate-0 transition-transform duration-300">
            <div className="text-white font-bold text-xl md:text-2xl drop-shadow-lg">
              {awayInitials}
            </div>
          </div>
          {/* Brilho */}
          <div className="absolute inset-0 bg-white/20 rounded-lg blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>
      </div>

      {/* Partículas flutuantes */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white/40 rounded-full animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${3 + Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Overlay escuro para melhor contraste do texto */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-black/40" />

      {/* Liga no topo */}
      {league && (
        <div className="absolute top-2 left-2 md:top-3 md:left-3">
          <div className="bg-white/10 backdrop-blur-md px-2 py-1 rounded-md border border-white/20">
            <span className="text-white/90 text-[10px] md:text-xs font-medium drop-shadow">
              {league}
            </span>
          </div>
        </div>
      )}

      {/* Ícone do desporto no canto */}
      <div className="absolute top-2 right-2 md:top-3 md:right-3">
        <div className="w-8 h-8 md:w-10 md:h-10 bg-white/10 backdrop-blur-md rounded-full border border-white/20 flex items-center justify-center">
          <span className="text-lg md:text-xl">{theme.icon}</span>
        </div>
      </div>
    </div>
  );
};

import { useTheme } from '../../contexts/ThemeContext';

interface SkeletonLoaderProps {
  type?: 'card' | 'list' | 'stats' | 'market';
  count?: number;
}

/**
 * ✅ SKELETON LOADER - Componente reutilizável para loading states
 * Melhora a percepção de velocidade mostrando estrutura enquanto carrega
 */
export function SkeletonLoader({ type = 'card', count = 1 }: SkeletonLoaderProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const baseClass = isDark ? 'bg-gray-800' : 'bg-gray-200';
  const shimmerClass = 'animate-pulse';

  // ✅ Skeleton para cartão de jogo
  const MatchCardSkeleton = () => (
    <div className={`${isDark ? 'bg-gray-900/50' : 'bg-white'} rounded-lg p-3 ${shimmerClass}`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`h-3 w-24 ${baseClass} rounded`}></div>
        <div className={`h-3 w-16 ${baseClass} rounded`}></div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 ${baseClass} rounded-full`}></div>
          <div className={`h-4 flex-1 ${baseClass} rounded`}></div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 ${baseClass} rounded-full`}></div>
          <div className={`h-4 flex-1 ${baseClass} rounded`}></div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className={`h-10 ${baseClass} rounded`}></div>
        <div className={`h-10 ${baseClass} rounded`}></div>
        <div className={`h-10 ${baseClass} rounded`}></div>
      </div>
    </div>
  );

  // ✅ Skeleton para lista
  const ListSkeleton = () => (
    <div className={`${isDark ? 'bg-gray-900/50' : 'bg-white'} rounded-lg p-4 ${shimmerClass}`}>
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-10 h-10 ${baseClass} rounded-full`}></div>
              <div className="flex-1 space-y-2">
                <div className={`h-4 w-3/4 ${baseClass} rounded`}></div>
                <div className={`h-3 w-1/2 ${baseClass} rounded`}></div>
              </div>
            </div>
            <div className={`h-8 w-16 ${baseClass} rounded`}></div>
          </div>
        ))}
      </div>
    </div>
  );

  // ✅ Skeleton para estatísticas
  const StatsSkeleton = () => (
    <div className={`${isDark ? 'bg-gray-900/50' : 'bg-white'} rounded-lg p-4 ${shimmerClass}`}>
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-2">
              <div className={`h-3 w-32 ${baseClass} rounded`}></div>
              <div className={`h-3 w-16 ${baseClass} rounded`}></div>
            </div>
            <div className={`h-2 w-full ${baseClass} rounded-full overflow-hidden`}>
              <div className={`h-full ${isDark ? 'bg-gray-700' : 'bg-gray-300'} rounded-full`} style={{ width: '60%' }}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ✅ Skeleton para mercado de apostas
  const MarketSkeleton = () => (
    <div className={`${isDark ? 'bg-gray-900/50' : 'bg-white'} rounded-lg p-4 ${shimmerClass}`}>
      <div className={`h-5 w-40 ${baseClass} rounded mb-3`}></div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className={`h-16 ${baseClass} rounded-lg`}></div>
        ))}
      </div>
    </div>
  );

  const renderSkeleton = () => {
    switch (type) {
      case 'card':
        return <MatchCardSkeleton />;
      case 'list':
        return <ListSkeleton />;
      case 'stats':
        return <StatsSkeleton />;
      case 'market':
        return <MarketSkeleton />;
      default:
        return <MatchCardSkeleton />;
    }
  };

  return (
    <>
      {[...Array(count)].map((_, i) => (
        <div key={i} className={i > 0 ? 'mt-2' : ''}>
          {renderSkeleton()}
        </div>
      ))}
    </>
  );
}

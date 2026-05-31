import { useEffect, useState } from 'react';

interface LiveIndicatorProps {
  isLive: boolean;
  lastUpdate: Date | null;
  className?: string;
}

/**
 * Indicador discreto de atualização em tempo real
 * Mostra status sem interromper a experiência do utilizador
 */
export function LiveIndicator({ isLive, lastUpdate, className = '' }: LiveIndicatorProps) {
  const [timeAgo, setTimeAgo] = useState<string>('');

  useEffect(() => {
    if (!lastUpdate) return;

    const updateTimeAgo = () => {
      const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
      
      if (seconds < 5) {
        setTimeAgo('agora');
      } else if (seconds < 60) {
        setTimeAgo(`há ${seconds}s`);
      } else {
        const minutes = Math.floor(seconds / 60);
        setTimeAgo(`há ${minutes}m`);
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 1000);

    return () => clearInterval(interval);
  }, [lastUpdate]);

  if (!lastUpdate) return null;

  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      <div className="flex items-center gap-1.5">
        <div
          className={`w-2 h-2 rounded-full transition-all duration-300 ${
            isLive
              ? 'bg-green-500 animate-pulse shadow-lg shadow-green-500/50'
              : 'bg-gray-400'
          }`}
        />
        <span className={`font-medium ${isLive ? 'text-green-600' : 'text-gray-500'}`}>
          {isLive ? 'AO VIVO' : 'Offline'}
        </span>
      </div>
      <span className="text-gray-400">•</span>
      <span className="text-gray-500">{timeAgo}</span>
    </div>
  );
}

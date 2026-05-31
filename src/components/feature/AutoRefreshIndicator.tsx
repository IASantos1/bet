import { useEffect, useState } from 'react';
import { LiveIndicator } from './LiveIndicator';

interface AutoRefreshIndicatorProps {
  isLive: boolean;
  lastUpdate: Date | null;
  className?: string;
  showDetails?: boolean;
}

/**
 * Indicador de atualização automática com animação suave
 * Mostra status de conexão e última atualização
 */
export function AutoRefreshIndicator({
  isLive,
  lastUpdate,
  className = '',
  showDetails = false,
}: AutoRefreshIndicatorProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Mostrar indicador após primeira atualização
    if (lastUpdate) {
      setIsVisible(true);
    }
  }, [lastUpdate]);

  if (!isVisible) return null;

  return (
    <div
      className={`transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      } ${className}`}
    >
      <LiveIndicator isLive={isLive} lastUpdate={lastUpdate} />
      
      {showDetails && lastUpdate && (
        <div className="mt-1 text-xs text-gray-400">
          Atualização automática a cada 3s
        </div>
      )}
    </div>
  );
}

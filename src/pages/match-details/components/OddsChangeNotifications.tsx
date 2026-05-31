
import { useState, useEffect } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { processOddsUpdate, type OddsMovement } from '../../../services/oddsAlerts';

interface OddsChangeNotificationsProps {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  odds: {
    home: number;
    draw: number;
    away: number;
  };
}

interface NotificationItem {
  id: string;
  movement: OddsMovement;
  visible: boolean;
}

export default function OddsChangeNotifications({
  matchId,
  homeTeam,
  awayTeam,
  league,
  odds
}: OddsChangeNotificationsProps) {
  const { theme } = useTheme();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Processar atualizações de odds
  useEffect(() => {
    if (odds.home && odds.draw && odds.away) {
      const movements = processOddsUpdate(
        matchId,
        homeTeam,
        awayTeam,
        league,
        odds
      );

      // Adicionar novas notificações
      movements.forEach(movement => {
        const id = `${movement.matchId}_${movement.market}_${Date.now()}`;
        setNotifications(prev => [
          { id, movement, visible: true },
          ...prev.slice(0, 9) // Manter máximo 10
        ]);

        // Auto-remover após 5 segundos
        setTimeout(() => {
          setNotifications(prev => 
            prev.map(n => n.id === id ? { ...n, visible: false } : n)
          );
          setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
          }, 300);
        }, 5000);
      });
    }
  }, [odds, matchId, homeTeam, awayTeam, league]);

  const getMarketLabel = (market: string) => {
    switch (market) {
      case 'home': return homeTeam;
      case 'draw': return 'Empate';
      case 'away': return awayTeam;
      case 'over': return 'Mais';
      case 'under': return 'Menos';
      default: return market;
    }
  };

  return (
    <>
      {/* Floating Notifications - Apenas notificações flutuantes */}
      <div className="fixed top-20 right-3 z-50 space-y-2 max-w-xs pointer-events-none">
        {notifications.filter(n => n.visible).map(({ id, movement }) => (
          <div
            key={id}
            className={`pointer-events-auto transform transition-all duration-300 ${
              movement.isSteamMove || movement.isValueBet
                ? theme === 'dark'
                  ? 'bg-gradient-to-r from-amber-900/95 to-orange-900/95 border-amber-500/50'
                  : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-400'
                : theme === 'dark'
                  ? 'bg-gray-800/95 border-gray-700/50'
                  : 'bg-white/95 border-gray-200'
            } border rounded-xl shadow-2xl backdrop-blur-sm overflow-hidden animate-slide-in-right`}
          >
            <div className="px-3 py-2.5">
              <div className="flex items-start gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  movement.direction === 'up'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  <i className={`${movement.direction === 'up' ? 'ri-arrow-up-line' : 'ri-arrow-down-line'} text-lg`}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {movement.isSteamMove && (
                      <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-[9px] font-bold rounded uppercase">
                        Steam
                      </span>
                    )}
                    {movement.isValueBet && (
                      <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[9px] font-bold rounded uppercase">
                        Value
                      </span>
                    )}
                    <span className={`text-[10px] font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      Odd Atualizada
                    </span>
                  </div>
                  <p className={`text-xs font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} truncate`}>
                    {getMarketLabel(movement.market)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'} line-through`}>
                      {movement.previousOdd.toFixed(2)}
                    </span>
                    <i className={`ri-arrow-right-line text-xs ${theme === 'dark' ? 'text-gray-600' : 'text-gray-300'}`}></i>
                    <span className={`text-sm font-bold ${
                      movement.direction === 'up' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {movement.currentOdd.toFixed(2)}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      movement.direction === 'up'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {movement.direction === 'up' ? '+' : ''}{movement.changePercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className={`h-1 ${
              movement.direction === 'up' ? 'bg-green-500' : 'bg-red-500'
            } animate-shrink-width`}></div>
          </div>
        ))}
      </div>

      {/* Animation Styles */}
      <style>{`
        @keyframes slide-in-right {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes shrink-width {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
        
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
        
        .animate-shrink-width {
          animation: shrink-width 5s linear forwards;
        }
      `}</style>
    </>
  );
}


import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';

interface MobileBottomNavProps {
  onLiveClick?: () => void;
  onHomeClick?: () => void;
  onBetSlipClick?: () => void;
  betCount?: number;
}

export function MobileBottomNav({ onLiveClick, onHomeClick, onBetSlipClick, betCount = 0 }: MobileBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const navItems = useMemo(() => [
    { id: 'home', path: '/', icon: 'ri-home', label: 'Início', color: 'amber' },
    { id: 'live', path: '/desportos-ao-vivo', icon: 'ri-live', label: 'Ao Vivo', color: 'red', hasIndicator: true },
    { id: 'promo', path: '/promocoes', icon: 'ri-gift', label: 'Promoções', color: 'amber' },
    { id: 'wallet', path: '/carteira', icon: 'ri-wallet-3', label: 'Carteira', color: 'teal' },
    { id: 'profile', path: '/perfil', icon: 'ri-user', label: 'Perfil', color: 'amber' },
  ], []);

  // Determinar índice ativo baseado no path
  useEffect(() => {
    const index = navItems.findIndex(item => {
      if (item.path === '/') return path === '/';
      return path.startsWith(item.path);
    });
    if (index !== -1) setActiveIndex(index);
  }, [path, navItems]);

  const handleNavClick = (item: typeof navItems[0], index: number) => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    setActiveIndex(index);

    // Animação de transição
    setTimeout(() => {
      if (item.id === 'home' && onHomeClick) {
        onHomeClick();
      } else {
        navigate(item.path);
      }
      setIsAnimating(false);
    }, 150);
  };

  const handleBetSlip = () => {
    if (onBetSlipClick) {
      onBetSlipClick();
    }
  };

  const getColorClasses = (color: string, isActive: boolean) => {
    if (!isActive) return 'text-gray-500';
    switch (color) {
      case 'red': return 'text-red-400';
      case 'teal': return 'text-teal-400';
      default: return 'text-amber-400';
    }
  };

  const getBgClasses = (color: string, isActive: boolean) => {
    if (!isActive) return '';
    switch (color) {
      case 'red': return 'bg-red-500/15';
      case 'teal': return 'bg-teal-500/15';
      default: return 'bg-amber-500/15';
    }
  };

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-950/98 backdrop-blur-lg border-t border-amber-500/20 safe-area-bottom">
      {/* Indicador de slide animado */}
      <div 
        className="absolute top-0 h-0.5 bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-300 ease-out"
        style={{ 
          width: `${100 / navItems.length}%`,
          left: `${(activeIndex / navItems.length) * 100}%`
        }}
      />
      
      <div className="flex items-center justify-around h-14 px-1">
        {navItems.map((item, index) => {
          const isActive = activeIndex === index;
          
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item, index)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full cursor-pointer transition-all duration-300 ${
                getColorClasses(item.color, isActive)
              } ${isAnimating && activeIndex === index ? 'scale-90' : 'scale-100'}`}
            >
              <div className={`w-7 h-7 flex items-center justify-center rounded-xl transition-all duration-300 relative ${
                getBgClasses(item.color, isActive)
              } ${isActive ? 'scale-110' : 'scale-100'}`}>
                <i className={`${item.icon}-${isActive ? 'fill' : 'line'} text-lg transition-all duration-200`}></i>
                {item.hasIndicator && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                )}
              </div>
              <span className={`text-[9px] font-semibold leading-none transition-all duration-200 ${
                isActive ? 'opacity-100 translate-y-0' : 'opacity-70 translate-y-0.5'
              }`}>
                {item.label}
              </span>
              
              {/* Efeito de ripple ao clicar */}
              {isActive && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full ${
                    item.color === 'red' ? 'bg-red-500/10' : item.color === 'teal' ? 'bg-teal-500/10' : 'bg-amber-500/10'
                  } animate-ping opacity-0`}></div>
                </div>
              )}
            </button>
          );
        })}

        {/* Boletim - sempre visível */}
        <button
          onClick={handleBetSlip}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full cursor-pointer transition-all duration-300 text-gray-500 hover:text-gray-400 relative"
        >
          <div className="w-7 h-7 flex items-center justify-center rounded-xl relative">
            <i className="ri-file-list-3-line text-lg"></i>
            {betCount > 0 && (
              <span className="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] bg-gradient-to-r from-amber-500 to-amber-400 rounded-full flex items-center justify-center px-1 shadow-lg shadow-amber-500/30 animate-bounce">
                <span className="text-[9px] font-bold text-gray-900 leading-none">{betCount > 9 ? '9+' : betCount}</span>
              </span>
            )}
          </div>
          <span className="text-[9px] font-semibold leading-none opacity-70">Boletim</span>
        </button>
      </div>
    </nav>
  );
}

export default MobileBottomNav;

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/react-app/contexts/AppContext';
import { BetSlip } from './BetSlip';
import { ChevronDown } from 'lucide-react';

export function MobileBetSlip() {
  const { betSlip, darkMode } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const totalOdds = useMemo(
    () => betSlip.reduce((acc, b) => acc * b.odd, 1),
    [betSlip]
  );

  // Close when betslip is empty
  useEffect(() => {
    if (betSlip.length === 0 && isOpen) {
      setIsOpen(false);
    }
  }, [betSlip.length]);

  if (betSlip.length === 0) return null;

  const handleOpen = () => {
    setIsOpen(true);
    // Small delay to allow render before animation
    requestAnimationFrame(() => setIsAnimating(true));
  };

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(() => setIsOpen(false), 300); // Match transition duration
  };

  return (
    <div className="xl:hidden">
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          className="fixed bottom-24 right-4 z-50 w-16 h-16 rounded-full bg-yellow-400 text-gray-900 shadow-lg flex flex-col items-center justify-center font-bold hover:scale-110 transition-transform active:scale-95 border-2 border-yellow-500 animate-bounce"
          style={{ animationDuration: '2s' }}
        >
          <span className="relative flex items-center justify-center">
            <span className="text-xs font-black">{betSlip.length} sel</span>
            <span className="absolute -top-3.5 -right-4 w-3 h-3 bg-red-600 rounded-full animate-ping"></span>
          </span>
          <span className="text-[11px] font-black tabular-nums leading-none mt-0.5">
            @{totalOdds.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </button>
      )}

      {/* Overlay */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col justify-end isolate">
          {/* Backdrop */}
          <div 
            className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
            onClick={handleClose}
          />
          
          {/* Bottom Sheet */}
          <div 
            className={`relative w-full max-h-[85vh] overflow-hidden flex flex-col rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out ${
              darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
            } ${isAnimating ? 'translate-y-0' : 'translate-y-full'}`}
          >
            {/* Header */}
            <div 
                className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b shrink-0 cursor-pointer ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}
                onClick={handleClose}
            >
              <div className="flex items-center gap-2">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto absolute top-2 left-1/2 -translate-x-1/2"></div>
                <h3 className="font-bold text-lg mt-2">Boletim de Aposta <span className="text-sm font-normal opacity-70">({betSlip.length})</span></h3>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); handleClose(); }}
                className={`p-2 rounded-full mt-2 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                <ChevronDown size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto overscroll-contain pb-safe">
              <BetSlip />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

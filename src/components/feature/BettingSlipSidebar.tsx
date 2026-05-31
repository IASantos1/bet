import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import BettingSlip from './BettingSlip';

interface BettingSlipSidebarProps {
  /** List of selections (provided by the page) */
  selections: {
    id: number;
    homeTeam: string;
    awayTeam: string;
    selection: string;
    odd: number;
    league?: string;
    market?: string;
    // Any additional fields used for display are accepted via index signature
    [key: string]: any;
  }[];
  /** Remove a selection by its id */
  onRemoveSelection: (id: number) => void;
  /** Clear all selections */
  onClearAll: () => void;
  /** Dark mode flag – kept for styling compatibility */
  isDarkMode?: boolean;
  /** Optional modal control for mobile usage */
  isOpen?: boolean;
  onClose?: () => void;
  /** Mobile specific props */
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

/**
 * Sidebar component that displays the betting slip.
 * It works both as a permanent sidebar (desktop) and as a modal (mobile).
 */
export function BettingSlipSidebar({
  selections,
  onRemoveSelection,
  onClearAll,
  isDarkMode: _isDarkMode = true,
  isOpen = true,
  onClose = () => {},
  isMobileOpen = false,
  onCloseMobile = () => {},
}: BettingSlipSidebarProps) {
  useTheme();
  const [isAnimating, setIsAnimating] = useState(false);

  // Trigger animation when mobile opens
  useState(() => {
    if (isMobileOpen) {
      setTimeout(() => setIsAnimating(true), 10);
    } else {
      setIsAnimating(false);
    }
  });

  const closeMobileBettingSlip = () => {
    setIsAnimating(false);
    setTimeout(() => {
      onCloseMobile();
    }, 300);
  };

  if (!isOpen && !isMobileOpen) return null;

  return (
    <>
      {/* Desktop Sidebar */}
      {isOpen && (
        <div className="hidden lg:block fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-900 shadow-2xl z-40 border-l border-gray-200 dark:border-gray-800">
          <BettingSlip 
            isOpen={isOpen}
            onClose={onClose}
            selections={selections}
            onRemoveSelection={onRemoveSelection}
            onClearAll={onClearAll}
          />
        </div>
      )}

      {/* Mobile Bottom Sheet */}
      {isMobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
            onClick={closeMobileBettingSlip}
          />

          {/* Bottom Sheet */}
          <div
            className={`lg:hidden fixed inset-x-0 bottom-0 bg-white dark:bg-gray-900 z-50 rounded-t-2xl shadow-2xl transition-transform duration-300 ${
              isAnimating ? 'translate-y-0' : 'translate-y-full'
            }`}
            style={{ 
              height: 'calc(100vh - 40px)',
              maxHeight: 'calc(100vh - 40px)'
            }}
          >
            {/* Handle Bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1 bg-gray-300 dark:bg-gray-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                  <i className="ri-file-list-3-line text-white text-lg"></i>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">Boletim</h3>
                  {selections.length > 0 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {selections.length} {selections.length === 1 ? 'seleção' : 'seleções'}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={closeMobileBettingSlip}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <i className="ri-close-line text-xl text-gray-600 dark:text-gray-400"></i>
              </button>
            </div>

            {/* Content with proper height calculation */}
            <div 
              className="overflow-y-auto"
              style={{ 
                height: 'calc(100vh - 40px - 60px)',
                paddingBottom: '120px'
              }}
            >
              <BettingSlip 
                isOpen={true}
                onClose={closeMobileBettingSlip}
                selections={selections}
                onRemoveSelection={onRemoveSelection}
                onClearAll={onClearAll}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}

import type { MouseEvent as ReactMouseEvent } from 'react';

export type OddSuspendReason = 'GOAL' | 'VAR' | 'VAR_PENALTY' | 'PENALTY' | 'CHANCE' | 'CARD' | 'SUSPENSO' | string

interface OddButtonProps {
  label: string;
  price: number;
  onClick: (e: ReactMouseEvent) => void;
  className?: string;
  teamName?: string;
  suspended?: { reason: OddSuspendReason };
  trend?: 'up' | 'down' | 'stable';
}

const REASON_CONFIG: Record<string, { bg: string; text: string; label: string; pulse: boolean }> = {
  GOAL:        { bg: 'bg-emerald-600/95 border-emerald-400', text: 'text-white', label: '⚽ GOL',          pulse: true  },
  VAR:         { bg: 'bg-purple-700/95 border-purple-400',   text: 'text-white', label: '📺 VAR',           pulse: true  },
  VAR_PENALTY: { bg: 'bg-amber-600/95 border-amber-400',     text: 'text-white', label: '🎯 VAR PÊNALTI',   pulse: true  },
  PENALTY:     { bg: 'bg-orange-600/95 border-orange-400',   text: 'text-white', label: '🎯 PÊNALTI',       pulse: true  },
  CHANCE:      { bg: 'bg-rose-600/95 border-rose-400',       text: 'text-white', label: '🔥 GRANDE CHANCE', pulse: true  },
  CARD:        { bg: 'bg-yellow-500/95 border-yellow-300',   text: 'text-gray-900', label: '🟨 CARTÃO',     pulse: false },
  SUSPENSO:    { bg: 'bg-gray-700/90 border-gray-500',       text: 'text-gray-200', label: '🔒 SUSPENSO',  pulse: false },
}

function getReasonCfg(reason: string) {
  return REASON_CONFIG[reason] || REASON_CONFIG['SUSPENSO']
}

export function OddButton({ label, price, onClick, className = '', teamName, suspended, trend = 'stable' }: OddButtonProps) {
  const isSuspended = !!suspended
  const priceStr = Number.isFinite(price) && price > 0
    ? price.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '--'

  const cfg = isSuspended ? getReasonCfg(suspended!.reason) : null

  return (
    <div className="relative w-full h-full">
      <button
        onClick={isSuspended ? undefined : onClick}
        disabled={isSuspended}
        className={`
          ${className}
          transition-all duration-300
          ${isSuspended ? 'opacity-60 cursor-not-allowed select-none' : ''}
        `}
      >
        <div className="flex justify-between items-center w-full px-1">
          <span className="text-[11px] sm:text-sm font-normal text-left truncate flex-1 min-w-0 mr-1">
            {teamName || label}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isSuspended && trend === 'up' && (
              <span className="text-green-300 animate-bounce text-[10px] sm:text-xs">▲</span>
            )}
            {!isSuspended && trend === 'down' && (
              <span className="text-black dark:text-gray-400 animate-bounce text-[10px] sm:text-xs">▼</span>
            )}
            <span className={`text-sm sm:text-base font-bold tabular-nums ${
              isSuspended ? 'text-gray-400' :
              trend === 'up' ? 'text-green-200' :
              trend === 'down' ? 'text-black dark:text-gray-400' : 'text-white'
            }`}>
              {priceStr}
            </span>
          </div>
        </div>
      </button>

      {/* Suspended overlay */}
      {isSuspended && cfg && (
        <div className={`
          absolute inset-0 rounded-lg flex flex-col items-center justify-center gap-0.5 pointer-events-none
          border ${cfg.bg} ${cfg.pulse ? 'animate-pulse' : ''}
          backdrop-blur-[2px] z-10
        `}>
          <span className={`text-[10px] font-black uppercase tracking-widest leading-none ${cfg.text}`}>
            {cfg.label}
          </span>
        </div>
      )}
    </div>
  )
}

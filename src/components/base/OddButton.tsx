
import { useState, useEffect, useRef } from 'react';
import { useVarControl } from '../../hooks/useVarControl';

interface OddButtonProps {
  odd: number;
  label: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  matchId?: string;
}

export const OddButton = ({ 
  odd, 
  label, 
  selected = false, 
  onClick, 
  disabled = false,
  matchId = ''
}: OddButtonProps) => {
  const [isIncreasing, setIsIncreasing] = useState<boolean | null>(null);
  const { isLocked, lockReason } = useVarControl(matchId);
  
  // ✅ NOVO: Usar ref para rastrear a odd anterior REAL
  const lastOddRef = useRef(odd);
  const changeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Estado de transição para bloqueio/desbloqueio suave
  const [lockTransition, setLockTransition] = useState<'idle' | 'locking' | 'locked' | 'unlocking'>('idle');
  const prevLockedRef = useRef(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ CORRIGIDO: Detectar mudanças de odds corretamente
  useEffect(() => {
    // Verificar se a odd mudou significativamente (mais de 0.01)
    const oddDiff = Math.abs(odd - lastOddRef.current);
    
    if (oddDiff >= 0.01) {
      console.log(`📊 Odd mudou: ${lastOddRef.current.toFixed(2)} → ${odd.toFixed(2)} (${label})`);
      
      // Determinar direção
      const increasing = odd > lastOddRef.current;
      setIsIncreasing(increasing);
      
      // Atualizar ref DEPOIS de definir o estado
      lastOddRef.current = odd;

      // Limpar timer anterior
      if (changeTimerRef.current) {
        clearTimeout(changeTimerRef.current);
      }

      // Remover seta após 3 segundos
      changeTimerRef.current = setTimeout(() => {
        setIsIncreasing(null);
      }, 3000);
    }

    return () => {
      if (changeTimerRef.current) {
        clearTimeout(changeTimerRef.current);
      }
    };
  }, [odd, label]);

  // Gerir transição suave de bloqueio/desbloqueio
  useEffect(() => {
    const wasLocked = prevLockedRef.current;
    
    if (isLocked && !wasLocked) {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      setLockTransition('locking');
      transitionTimerRef.current = setTimeout(() => {
        setLockTransition('locked');
      }, 400);
    } else if (!isLocked && wasLocked) {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      setLockTransition('unlocking');
      transitionTimerRef.current = setTimeout(() => {
        setLockTransition('idle');
      }, 400);
    }
    
    prevLockedRef.current = isLocked;
    
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, [isLocked]);

  const isDisabled = disabled || isLocked;
  const showLockOverlay = isLocked || lockTransition === 'locking' || lockTransition === 'unlocking';

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`
        relative overflow-hidden rounded-lg px-4 py-3 whitespace-nowrap
        transition-all duration-300 ease-out
        ${selected 
          ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg scale-105' 
          : isDisabled
          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
          : 'bg-white hover:bg-red-50 text-gray-900 border border-gray-200 hover:border-red-500 cursor-pointer'
        }
        ${isIncreasing === true ? 'ring-2 ring-green-400 bg-green-50/50' : ''}
        ${isIncreasing === false ? 'ring-2 ring-red-400 bg-red-50/60' : ''}
        ${lockTransition === 'locking' ? 'scale-[0.97]' : ''}
        ${lockTransition === 'unlocking' ? 'scale-[1.02]' : ''}
      `}
      title={isLocked ? lockReason || 'Mercado bloqueado' : undefined}
    >
      {/* Overlay VAR com transição suave */}
      {showLockOverlay && (
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-400 ease-out ${
          lockTransition === 'locking' ? 'animate-overlay-fade-blur-in' :
          lockTransition === 'unlocking' ? 'animate-overlay-fade-blur-out' :
          'opacity-100'
        }`}>
          <div className="absolute inset-0 bg-red-600/25 backdrop-blur-[2px]" />
          <i className={`ri-lock-line text-red-500 text-lg relative z-10 ${
            lockTransition === 'locking' ? 'animate-lock-icon-bounce' : ''
          }`}></i>
        </div>
      )}

      <div className={`flex flex-col items-center gap-1 transition-all duration-300 ${
        showLockOverlay ? 'opacity-40 blur-[1px]' : 'opacity-100 blur-0'
      }`}>
        <span className="text-xs font-medium opacity-80">{label}</span>
        <span className="text-lg font-bold flex items-center gap-1">
          {odd.toFixed(2)}
          {isIncreasing === true && (
            <i className="ri-arrow-up-line text-green-600 text-base font-bold animate-bounce"></i>
          )}
          {isIncreasing === false && (
            <i className="ri-arrow-down-line text-red-600 text-base font-bold animate-bounce"></i>
          )}
        </span>
      </div>
    </button>
  );
};

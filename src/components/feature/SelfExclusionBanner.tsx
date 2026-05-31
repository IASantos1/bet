
import { useEffect, useState } from 'react';
import { useProfile } from '../../hooks/useProfile';

export default function SelfExclusionBanner() {
  const { profile, isSelfExcluded, isCoolingOff, getExclusionTimeRemaining, getCoolingOffTimeRemaining } = useProfile();
  const [timeRemaining, setTimeRemaining] = useState<{ days: number; hours: number; minutes: number } | null>(null);
  const [coolingTimeRemaining, setCoolingTimeRemaining] = useState<{ hours: number; minutes: number } | null>(null);

  useEffect(() => {
    const updateTime = () => {
      setTimeRemaining(getExclusionTimeRemaining());
      setCoolingTimeRemaining(getCoolingOffTimeRemaining());
    };

    updateTime();
    const interval = setInterval(updateTime, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [profile, getExclusionTimeRemaining, getCoolingOffTimeRemaining]);

  const isExcluded = isSelfExcluded();
  const isCooling = isCoolingOff();

  if (!isExcluded && !isCooling) return null;

  if (isExcluded && timeRemaining) {
    return (
      <div className="bg-gradient-to-r from-red-600 to-red-700 text-white py-3 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <i className="ri-shield-user-line text-xl"></i>
            </div>
            <div>
              <div className="font-bold">Auto-Exclusão Ativa</div>
              <div className="text-sm text-red-100">
                A sua conta está temporariamente suspensa por motivos de jogo responsável.
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-red-200">Tempo restante</div>
            <div className="font-bold text-lg">
              {timeRemaining.days > 0 && `${timeRemaining.days}d `}
              {timeRemaining.hours}h {timeRemaining.minutes}m
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isCooling && coolingTimeRemaining) {
    return (
      <div className="bg-gradient-to-r from-red-600 to-red-700 text-white py-3 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gray-900/20 rounded-full flex items-center justify-center">
              <i className="ri-time-line text-xl"></i>
            </div>
            <div>
              <div className="font-bold">Período de Reflexão Ativo</div>
              <div className="text-sm text-red-100">
                Está em pausa temporária. Pode navegar mas não pode fazer apostas.
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-red-100">Tempo restante</div>
            <div className="font-bold text-lg">
              {coolingTimeRemaining.hours}h {coolingTimeRemaining.minutes}m
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

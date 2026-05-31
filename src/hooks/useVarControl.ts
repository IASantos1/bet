import { useState, useEffect } from 'react';
import { isMarketLocked, getLockReason } from '../services/varMarketController';

export const useVarControl = (matchId: string) => {
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState<string | null>(null);

  useEffect(() => {
    // Verificar estado inicial
    setIsLocked(isMarketLocked(matchId));
    setLockReason(getLockReason(matchId));

    const handleLock = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail.matchId === matchId) {
        setIsLocked(true);
        setLockReason(customEvent.detail.reason);
      }
    };

    const handleUnlock = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail.matchId === matchId) {
        setIsLocked(false);
        setLockReason(null);
      }
    };

    window.addEventListener('market-locked', handleLock);
    window.addEventListener('market-unlocked', handleUnlock);

    return () => {
      window.removeEventListener('market-locked', handleLock);
      window.removeEventListener('market-unlocked', handleUnlock);
    };
  }, [matchId]);

  return { isLocked, lockReason };
};

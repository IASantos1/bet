import { useEffect, useRef, useState } from 'react';

export const useTrend = (val: number) => {
  const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable');
  const prevRef = useRef<number>(val);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevRef.current;

    if (!Number.isFinite(val) || val <= 0) {
      prevRef.current = val;
      return;
    }

    if (Number.isFinite(prev) && prev > 0 && val !== prev) {
      setTrend(val > prev ? 'up' : 'down');
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setTrend('stable'), 3000);
    }

    prevRef.current = val;

    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    };
  }, [val]);

  return trend;
};

import { useState, useEffect, useRef } from 'react';
import type { Event } from '@/shared/types';

const CACHE_KEY = 'home:pregame:v2';

export function useUpcomingCache(pregame: Event[]) {
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const pregameLenRef = useRef(-1);
  const pregameRef = useRef<Event[]>(pregame);

  // Keep ref in sync without triggering effects
  pregameRef.current = pregame;

  // Load from localStorage cache on first mount only
  useEffect(() => {
    try {
      const cachedStr = localStorage.getItem(CACHE_KEY);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr) as Event[];
        const now = Date.now();
        const validCached = cached.filter(evt => {
          const dstr = evt.event_date || evt.fixture?.date;
          const d = dstr ? new Date(dstr) : null;
          if (d && !Number.isNaN(d.getTime())) {
            let targetTime = d.getTime();
            const diff = now - targetTime;
            if (diff > 300 * 24 * 60 * 60 * 1000) {
              const dYearAdj = new Date(d);
              dYearAdj.setFullYear(new Date(now).getFullYear());
              targetTime = dYearAdj.getTime();
            }
            if (targetTime < now - 2.5 * 60 * 60 * 1000) return false;
          }
          return true;
        });
        if (validCached.length > 0) {
          setUpcomingEvents(validCached);
        }
      }
    } catch { /* no-op */ }
  }, []); // mount only

  // Sync when pregame length changes (stable dep)
  useEffect(() => {
    const current = pregameRef.current;
    if (current.length === 0) return;
    if (pregameLenRef.current === current.length) return;
    pregameLenRef.current = current.length;
    setUpcomingEvents(current);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(current));
    } catch { /* no-op */ }
  }, [pregame.length]); // only when count changes

  return { upcomingEvents };
}

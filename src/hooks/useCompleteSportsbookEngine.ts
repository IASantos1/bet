
/**
 * Hook React para o Complete Sportsbook Engine
 * Conecta o motor unificado de odds (pré-jogo + ao vivo) aos componentes
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  completeSportsbookEngine,
  type MatchState,
  type Odds,
} from '../services/engine/completeSportsbookEngine';

interface UseCompleteSportsbookEngineOptions {
  autoStart?: boolean;
}

interface UseCompleteSportsbookEngineReturn {
  odds: Odds | null;
  mode: 'PRE_MATCH' | 'LIVE' | null;
  margin: number;
  overround: number;
  minutesToStart?: number;
  currentMinute?: number;
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  updateState: (state: Partial<MatchState>) => void;
  getOddsChange: (market: 'home' | 'draw' | 'away') => 'up' | 'down' | 'stable';
}

/**
 * Custom hook that connects the Complete Sportsbook Engine to React components.
 *
 * @param initialState - The initial match state (or null if not ready yet).
 * @param options.autoStart - If true (default) the engine starts automatically when the hook mounts.
 *
 * @returns An object with the current odds, match mode, margin, overround, timing info,
 *          engine running state and control helpers.
 */
export function useCompleteSportsbookEngine(
  initialState: MatchState | null,
  options: UseCompleteSportsbookEngineOptions = {}
): UseCompleteSportsbookEngineReturn {
  const { autoStart = true } = options;

  const [odds, setOdds] = useState<Odds | null>(null);
  const [mode, setMode] = useState<'PRE_MATCH' | 'LIVE' | null>(null);
  const [margin, setMargin] = useState(0);
  const [overround, setOverround] = useState(0);
  const [minutesToStart, setMinutesToStart] = useState<number | undefined>();
  const [currentMinute, setCurrentMinute] = useState<number | undefined>();
  const [isRunning, setIsRunning] = useState(false);
  const [previousOdds, setPreviousOdds] = useState<Odds | null>(null);

  // Keep a mutable reference to the latest state to avoid stale closures.
  const stateRef = useRef<MatchState | null>(initialState);
  stateRef.current = initialState;

  /**
   * Engine snapshot handler.
   * Updates hook state only when the snapshot belongs to the current match.
   */
  const handleUpdate = useCallback(
    (snapshot: any) => {
      if (!stateRef.current || snapshot.matchId !== stateRef.current.matchId) return;

      // Preserve the previous odds before overwriting.
      setPreviousOdds(odds);
      setOdds(snapshot.odds);
      setMode(snapshot.mode);
      setMargin(snapshot.margin);
      setOverround(snapshot.overround);
      setMinutesToStart(snapshot.minutesToStart);
      setCurrentMinute(snapshot.currentMinute);
      setIsRunning(true);
    },
    [odds] // `odds` is a dependency because we need the latest value for previousOdds.
  );

  // Subscribe to engine updates.
  useEffect(() => {
    const unsubscribe = completeSportsbookEngine.subscribe(handleUpdate);
    return () => {
      unsubscribe();
    };
  }, [handleUpdate]);

  // Auto‑start the engine when the component mounts (if enabled).
  useEffect(() => {
    if (!initialState || !autoStart) return;

    try {
      completeSportsbookEngine.start(initialState);
      setIsRunning(true);
    } catch (err) {
      console.error('Failed to start CompleteSportsbookEngine:', err);
    }

    // Cleanup on unmount.
    return () => {
      try {
        completeSportsbookEngine.stop(initialState.matchId);
      } catch (err) {
        console.error('Failed to stop CompleteSportsbookEngine on cleanup:', err);
      }
      setIsRunning(false);
    };
    // We depend on `initialState?.matchId` because the engine cares about the match identifier.
  }, [initialState, autoStart]);

  /** Starts the engine for the current match state. */
  const start = useCallback(() => {
    if (!stateRef.current) {
      console.warn('useCompleteSportsbookEngine: start called with no match state.');
      return;
    }
    try {
      completeSportsbookEngine.start(stateRef.current);
      setIsRunning(true);
    } catch (err) {
      console.error('Failed to start engine:', err);
    }
  }, []);

  /** Stops the engine for the current match state. */
  const stop = useCallback(() => {
    if (!stateRef.current) {
      console.warn('useCompleteSportsbookEngine: stop called with no match state.');
      return;
    }
    try {
      completeSportsbookEngine.stop(stateRef.current.matchId);
      setIsRunning(false);
    } catch (err) {
      console.error('Failed to stop engine:', err);
    }
  }, []);

  /** Merges a partial state into the current match state and notifies the engine. */
  const updateState = useCallback((partialState: Partial<MatchState>) => {
    if (!stateRef.current) {
      console.warn('useCompleteSportsbookEngine: updateState called with no match state.');
      return;
    }
    const newState = { ...stateRef.current, ...partialState };
    stateRef.current = newState;
    try {
      completeSportsbookEngine.updateState(newState);
    } catch (err) {
      console.error('Failed to update engine state:', err);
    }
  }, []);

  /**
   * Determines whether odds for a given market have moved up, down or stayed stable.
   */
  const getOddsChange = useCallback(
    (market: 'home' | 'draw' | 'away'): 'up' | 'down' | 'stable' => {
      if (!odds || !previousOdds) return 'stable';

      const current = odds[market];
      const prev = previousOdds[market];

      const diff = current - prev;
      if (Math.abs(diff) < 0.02) return 'stable';
      return diff > 0 ? 'up' : 'down';
    },
    [odds, previousOdds]
  );

  return {
    odds,
    mode,
    margin,
    overround,
    minutesToStart,
    currentMinute,
    isRunning,
    start,
    stop,
    updateState,
    getOddsChange,
  };
}

export default useCompleteSportsbookEngine;

/**
 * Hook React para o Live Odds Market Engine
 * Conecta o motor de odds ao vivo com os componentes da UI
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  liveOddsEngine,
  type LiveMatchInput,
  type LiveOddsSnapshot,
  type PressureMetrics,
  type OddsMovement,
  type EngineState,
} from '../services/engine/liveOddsMarketEngine';

interface UseLiveOddsEngineOptions {
  autoStart?: boolean;
  intervalMs?: number;
}

interface UseLiveOddsEngineReturn {
  odds: LiveOddsSnapshot | null;
  previousOdds: LiveOddsSnapshot | null;
  pressure: PressureMetrics | null;
  history: OddsMovement[];
  momentum: 'home' | 'away' | 'neutral';
  marketStatus: 'open' | 'paused' | 'suspended' | 'closed';
  pauseReason?: string;
  confidence: number;
  margin: number;
  isRunning: boolean;
  cycleCount: number;
  start: () => Promise<void>;
  stop: () => void;
  refresh: () => Promise<void>;
  getOddsChange: (
    market: 'home' | 'draw' | 'away' | 'over25' | 'bttsYes'
  ) => 'up' | 'down' | 'stable';
}

export function useLiveOddsEngine(
  match: LiveMatchInput | null,
  options: UseLiveOddsEngineOptions = {}
): UseLiveOddsEngineReturn {
  const { autoStart = true, intervalMs = 5000 } = options; // ✅ Reduzido para 5 segundos

  const [odds, setOdds] = useState<LiveOddsSnapshot | null>(null);
  const [previousOdds, setPreviousOdds] = useState<LiveOddsSnapshot | null>(null);
  const [pressure, setPressure] = useState<PressureMetrics | null>(null);
  const [history, setHistory] = useState<OddsMovement[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const matchRef = useRef(match);

  // Keep ref up‑to‑date
  matchRef.current = match;

  // Callback para atualizações do engine
  const handleUpdate = useCallback((state: EngineState) => {
    if (!matchRef.current || state.fixtureId !== matchRef.current.fixtureId) return;

    setOdds(state.currentOdds);
    setPreviousOdds(state.previousOdds);
    setPressure(state.pressure);
    setHistory([...state.history]);
    setIsRunning(state.isRunning);
    setCycleCount(state.cycleCount);
  }, []);

  // Subscrever ao engine
  useEffect(() => {
    const unsubscribe = liveOddsEngine.subscribe(handleUpdate);
    return () => {
      unsubscribe();
    };
  }, [handleUpdate]);

  // Auto‑start - Só iniciar se tiver fixtureId
  useEffect(() => {
    // ✅ CRÍTICO: Verificar se tem fixtureId antes de iniciar
    if (!match || !match.fixtureId || !autoStart) {
      return;
    }

    // Verificar se o match tem status definido
    if (!match.status || !match.status.short) return;

    const isLive = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'].includes(match.status.short);
    if (!isLive) return;

    // Verificar se já está a correr
    const existingState = liveOddsEngine.getState(match.fixtureId);
    if (existingState?.isRunning) {
      setOdds(existingState.currentOdds);
      setPreviousOdds(existingState.previousOdds);
      setPressure(existingState.pressure);
      setHistory([...existingState.history]);
      setIsRunning(true);
      setCycleCount(existingState.cycleCount);
      return;
    }

    console.log(`🎯 Iniciando Live Odds Engine para jogo ${match.fixtureId} (intervalo: ${intervalMs}ms)`);
    liveOddsEngine.startMatch(match, intervalMs);

    // Não parar automaticamente ao desmontar para manter cache
  }, [match, autoStart, intervalMs]);

  // Atualização em tempo real - Atualizar match data quando score ou tempo mudam
  useEffect(() => {
    if (!match || !match.fixtureId || !isRunning) return;
    
    console.log(`🔄 Atualizando dados do jogo ${match.fixtureId}:`, {
      score: `${match.score?.home || 0} - ${match.score?.away || 0}`,
      elapsed: match.status?.elapsed,
      period: match.status?.short
    });
    
    liveOddsEngine.updateMatch(match);
  }, [match, isRunning]);

  const start = useCallback(async () => {
    if (!match || !match.fixtureId) return;
    await liveOddsEngine.startMatch(match, intervalMs);
  }, [match, intervalMs]);

  const stop = useCallback(() => {
    if (!match || !match.fixtureId) return;
    liveOddsEngine.stopMatch(match.fixtureId);
  }, [match]);

  const refresh = useCallback(async () => {
    if (!match || !match.fixtureId) return;
    await liveOddsEngine.updateMatch(match);
  }, [match]);

  const getOddsChange = useCallback(
    (
      market: 'home' | 'draw' | 'away' | 'over25' | 'bttsYes'
    ): 'up' | 'down' | 'stable' => {
      if (!odds || !previousOdds) return 'stable';

      const current =
        market === 'over25'
          ? odds.over25
          : market === 'bttsYes'
          ? odds.bttsYes
          : odds[market];
      const prev =
        market === 'over25'
          ? previousOdds.over25
          : market === 'bttsYes'
          ? previousOdds.bttsYes
          : previousOdds[market];

      const diff = current - prev;
      if (Math.abs(diff) < 0.02) return 'stable';
      return diff > 0 ? 'up' : 'down';
    },
    [odds, previousOdds]
  );

  return {
    odds,
    previousOdds,
    pressure,
    history,
    momentum: odds?.momentum || 'neutral',
    marketStatus: odds?.marketStatus || 'open',
    pauseReason: odds?.pauseReason,
    confidence: odds?.confidence || 0,
    margin: odds?.margin || 0,
    isRunning,
    cycleCount,
    start,
    stop,
    refresh,
    getOddsChange,
  };
}

export default useLiveOddsEngine;

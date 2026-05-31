
import { useState, useEffect, useCallback, useRef } from 'react';
import type { SportType } from '../types/sports';

/**
 * ✅ SISTEMA DE CONTROLE DE FIM DE JOGO
 * 
 * - Faltando 50s: Odds BLOQUEIAM
 * - Faltando 10s: Mostra "EVENTO FINALIZADO"
 * - 0s: Jogo SOME da lista
 */

export interface MatchEndState {
  isOddsBlocked: boolean;      // true quando falta <= 50s
  isEventFinished: boolean;    // true quando falta <= 10s
  shouldRemove: boolean;       // true quando tempo = 0
  remainingSeconds: number;    // segundos restantes
  statusLabel: string;         // label para exibir
}

// Duração total por desporto (em segundos)
const SPORT_DURATIONS: Partial<Record<SportType, number>> = {
  football: 90 * 60,
  basketball: 48 * 60,
  baseball: 0,
  hockey: 60 * 60,
  rugby: 80 * 60,
  volleyball: 0,
  formula1: 0,
  mma: 25 * 60,
  nfl: 60 * 60,
  afl: 80 * 60,
  handball: 60 * 60,
};

// Tempo de acréscimo médio por desporto (em segundos)
const INJURY_TIME: Partial<Record<SportType, number>> = {
  football: 5 * 60,
  basketball: 0,
  baseball: 0,
  hockey: 0,
  rugby: 2 * 60,
  volleyball: 0,
  formula1: 0,
  mma: 0,
  nfl: 0,
  afl: 0,
  handball: 0,
};

/**
 * Calcula segundos restantes baseado no status e tempo atual
 */
function calculateRemainingSeconds(
  sport: SportType,
  status: string,
  currentMinute: number,
  _period?: string
): number {
  const totalDuration = SPORT_DURATIONS[sport] ?? 0;
  const injuryTime = INJURY_TIME[sport] ?? 0;
  
  // Desportos sem tempo fixo
  if (totalDuration === 0) {
    return Infinity; // Nunca bloqueia automaticamente
  }

  const currentSeconds = currentMinute * 60;
  
  // Futebol
  if (sport === 'football') {
    if (status === '1H') {
      // Primeira parte - longe do fim
      return (45 * 60) - currentSeconds + (45 * 60) + injuryTime;
    } else if (status === '2H') {
      // Segunda parte
      return Math.max(0, (90 * 60 + injuryTime) - currentSeconds);
    } else if (status === 'HT') {
      // Intervalo
      return (45 * 60) + injuryTime;
    }
  }
  
  // Basquetebol
  if (sport === 'basketball') {
    const quarterDuration = 12 * 60; // 12 minutos por quarto
    const quartersPlayed = status === 'Q1' ? 0 : status === 'Q2' ? 1 : status === 'Q3' ? 2 : status === 'Q4' ? 3 : 4;
    const remainingQuarters = 4 - quartersPlayed - 1;
    const currentQuarterRemaining = quarterDuration - (currentMinute * 60);
    return Math.max(0, currentQuarterRemaining + (remainingQuarters * quarterDuration));
  }
  
  // Hóquei
  if (sport === 'hockey') {
    const periodDuration = 20 * 60; // 20 minutos por período
    const periodsPlayed = status === 'P1' ? 0 : status === 'P2' ? 1 : status === 'P3' ? 2 : 3;
    const remainingPeriods = 3 - periodsPlayed - 1;
    const currentPeriodRemaining = periodDuration - (currentMinute * 60);
    return Math.max(0, currentPeriodRemaining + (remainingPeriods * periodDuration));
  }
  
  // Outros desportos com tempo fixo
  return Math.max(0, totalDuration + injuryTime - currentSeconds);
}

/**
 * Hook para controlar o estado de fim de jogo
 */
export function useMatchEndTimer(
  matchId: string,
  sport: SportType,
  status: string,
  currentMinute: number,
  isLive: boolean
): MatchEndState {
  const [state, setState] = useState<MatchEndState>({
    isOddsBlocked: false,
    isEventFinished: false,
    shouldRemove: false,
    remainingSeconds: Infinity,
    statusLabel: ''
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const updateState = useCallback(() => {
    if (!isLive) {
      setState({
        isOddsBlocked: false,
        isEventFinished: false,
        shouldRemove: false,
        remainingSeconds: Infinity,
        statusLabel: ''
      });
      return;
    }

    const remaining = calculateRemainingSeconds(sport, status, currentMinute);
    
    // ✅ Faltando 50s: Odds BLOQUEIAM
    const isOddsBlocked = remaining <= 50;
    
    // ✅ Faltando 10s: EVENTO FINALIZADO
    const isEventFinished = remaining <= 10;
    
    // ✅ 0s: Jogo SOME
    const shouldRemove = remaining <= 0;

    let statusLabel = '';
    if (shouldRemove) {
      statusLabel = 'REMOVENDO...';
    } else if (isEventFinished) {
      statusLabel = 'EVENTO FINALIZADO';
    } else if (isOddsBlocked) {
      statusLabel = `ODDS BLOQUEADAS (${remaining}s)`;
    }

    setState({
      isOddsBlocked,
      isEventFinished,
      shouldRemove,
      remainingSeconds: remaining,
      statusLabel
    });
  }, [sport, status, currentMinute, isLive]);

  useEffect(() => {
    updateState();
    
    // Atualizar a cada segundo
    intervalRef.current = setInterval(updateState, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [updateState]);

  return state;
}

/**
 * Hook para gerenciar múltiplos jogos
 */
export function useMatchesEndTimer(
  matches: Array<{
    id: string;
    sport: SportType;
    status: string;
    currentMinute?: number;
    isLive: boolean;
  }>
): Map<string, MatchEndState> {
  const [states, setStates] = useState<Map<string, MatchEndState>>(new Map());

  useEffect(() => {
    const newStates = new Map<string, MatchEndState>();

    matches.forEach(match => {
      const remaining = calculateRemainingSeconds(
        match.sport,
        match.status,
        match.currentMinute || 0
      );

      const isOddsBlocked = match.isLive && remaining <= 50;
      const isEventFinished = match.isLive && remaining <= 10;
      const shouldRemove = match.isLive && remaining <= 0;

      let statusLabel = '';
      if (shouldRemove) {
        statusLabel = 'REMOVENDO...';
      } else if (isEventFinished) {
        statusLabel = 'EVENTO FINALIZADO';
      } else if (isOddsBlocked) {
        statusLabel = `BLOQUEADO (${remaining}s)`;
      }

      newStates.set(match.id, {
        isOddsBlocked,
        isEventFinished,
        shouldRemove,
        remainingSeconds: remaining,
        statusLabel
      });
    });

    setStates(newStates);
  }, [matches]);

  // Atualizar a cada segundo
  useEffect(() => {
    const interval = setInterval(() => {
      setStates(prev => {
        const updated = new Map(prev);
        updated.forEach((state, id) => {
          if (state.remainingSeconds > 0 && state.remainingSeconds !== Infinity) {
            const newRemaining = Math.max(0, state.remainingSeconds - 1);
            const isOddsBlocked = newRemaining <= 50;
            const isEventFinished = newRemaining <= 10;
            const shouldRemove = newRemaining <= 0;

            let statusLabel = '';
            if (shouldRemove) {
              statusLabel = 'REMOVENDO...';
            } else if (isEventFinished) {
              statusLabel = 'EVENTO FINALIZADO';
            } else if (isOddsBlocked) {
              statusLabel = `BLOQUEADO (${newRemaining}s)`;
            }

            updated.set(id, {
              isOddsBlocked,
              isEventFinished,
              shouldRemove,
              remainingSeconds: newRemaining,
              statusLabel
            });
          }
        });
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return states;
}

export default useMatchEndTimer;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎣 Hook React para WebSocket de Placares em Tempo Real
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Hook que conecta componentes React ao WebSocket de placares.
 * Elimina polling - recebe atualizações instantâneas via WebSocket.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  liveScoresWS, 
  LiveScoreUpdate, 
  LiveOddsUpdate, 
  LiveIncident 
} from '../services/websocket/liveScoresWebSocket';
import type { Match } from '../types/sports';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

interface UseLiveScoresOptions {
  matchIds?: string[];
  onScoreUpdate?: (update: LiveScoreUpdate) => void;
  onOddsUpdate?: (update: LiveOddsUpdate) => void;
  onIncident?: (incident: LiveIncident) => void;
}

interface UseLiveScoresReturn {
  isConnected: boolean;
  scores: Map<string, { home: number; away: number; minute: number; period: string }>;
  odds: Map<string, { home: number; draw: number; away: number }>;
  incidents: LiveIncident[];
  lastUpdate: number;
  registerMatches: (matches: Match[]) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export function useLiveScoresWebSocket(
  options: UseLiveScoresOptions = {}
): UseLiveScoresReturn {
  const { matchIds, onScoreUpdate, onOddsUpdate, onIncident } = options;

  // Estado
  const [isConnected, setIsConnected] = useState(false);
  const [scores, setScores] = useState<Map<string, { home: number; away: number; minute: number; period: string }>>(new Map());
  const [odds, setOdds] = useState<Map<string, { home: number; draw: number; away: number }>>(new Map());
  const [incidents, setIncidents] = useState<LiveIncident[]>([]);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // Refs para callbacks
  const onScoreUpdateRef = useRef(onScoreUpdate);
  const onOddsUpdateRef = useRef(onOddsUpdate);
  const onIncidentRef = useRef(onIncident);

  // Atualizar refs
  useEffect(() => {
    onScoreUpdateRef.current = onScoreUpdate;
    onOddsUpdateRef.current = onOddsUpdate;
    onIncidentRef.current = onIncident;
  }, [onScoreUpdate, onOddsUpdate, onIncident]);

  // ═══════════════════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  const handleScoreUpdate = useCallback((update: LiveScoreUpdate) => {
    // Filtrar por matchIds se especificado
    if (matchIds && !matchIds.includes(update.matchId)) return;

    setScores(prev => {
      const newScores = new Map(prev);
      newScores.set(update.matchId, {
        home: update.homeScore,
        away: update.awayScore,
        minute: update.minute,
        period: update.period,
      });
      return newScores;
    });

    setLastUpdate(Date.now());
    onScoreUpdateRef.current?.(update);
  }, [matchIds]);

  const handleOddsUpdate = useCallback((update: LiveOddsUpdate) => {
    if (matchIds && !matchIds.includes(update.matchId)) return;

    setOdds(prev => {
      const newOdds = new Map(prev);
      newOdds.set(update.matchId, update.odds);
      return newOdds;
    });

    setLastUpdate(Date.now());
    onOddsUpdateRef.current?.(update);
  }, [matchIds]);

  const handleIncident = useCallback((incident: LiveIncident) => {
    if (matchIds && !matchIds.includes(incident.matchId)) return;

    setIncidents(prev => [...prev.slice(-50), incident]); // Manter últimos 50
    setLastUpdate(Date.now());
    onIncidentRef.current?.(incident);
  }, [matchIds]);

  const handleConnectionChange = useCallback((state: { connected: boolean }) => {
    setIsConnected(state.connected);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIÇÕES
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    // Subscrever eventos
    const unsubScore = liveScoresWS.on('score_update', handleScoreUpdate);
    const unsubOdds = liveScoresWS.on('odds_update', handleOddsUpdate);
    const unsubIncident = liveScoresWS.on('incident', handleIncident);
    const unsubConnection = liveScoresWS.on('connection_change', handleConnectionChange);

    // Estado inicial
    setIsConnected(liveScoresWS.getConnectionState().connected);

    // Cleanup
    return () => {
      unsubScore();
      unsubOdds();
      unsubIncident();
      unsubConnection();
    };
  }, [handleScoreUpdate, handleOddsUpdate, handleIncident, handleConnectionChange]);

  // ═══════════════════════════════════════════════════════════════════════════
  // API
  // ═══════════════════════════════════════════════════════════════════════════

  const registerMatches = useCallback((matches: Match[]) => {
    liveScoresWS.registerMatches(matches);
  }, []);

  return {
    isConnected,
    scores,
    odds,
    incidents,
    lastUpdate,
    registerMatches,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK PARA JOGO INDIVIDUAL
// ═══════════════════════════════════════════════════════════════════════════

interface UseMatchScoreOptions {
  matchId: string;
  initialScore?: { home: number; away: number };
  initialMinute?: number;
  initialPeriod?: string;
}

interface UseMatchScoreReturn {
  homeScore: number;
  awayScore: number;
  minute: number;
  period: string;
  isConnected: boolean;
  lastGoal: LiveIncident | null;
  hasScoreChanged: boolean;
}

export function useMatchScore(options: UseMatchScoreOptions): UseMatchScoreReturn {
  const { matchId: _matchId, initialScore, initialMinute = 0, initialPeriod = '' } = options;

  const [homeScore, setHomeScore] = useState(initialScore?.home ?? 0);
  const [awayScore, setAwayScore] = useState(initialScore?.away ?? 0);
  const [minute, setMinute] = useState(initialMinute);
  const [period, setPeriod] = useState(initialPeriod);
  const [lastGoal] = useState<LiveIncident | null>(null);
  const [hasScoreChanged] = useState(false);
  const isConnected = false;

  const initialScoreHome = initialScore?.home;
  const initialScoreAway = initialScore?.away;

  // Atualizar com valores iniciais quando mudam
  useEffect(() => {
    if (initialScoreHome !== undefined && initialScoreAway !== undefined) {
      setHomeScore(initialScoreHome);
      setAwayScore(initialScoreAway);
    }
  }, [initialScoreHome, initialScoreAway]);

  useEffect(() => {
    setMinute(initialMinute);
  }, [initialMinute]);

  useEffect(() => {
    setPeriod(initialPeriod);
  }, [initialPeriod]);

  return {
    homeScore,
    awayScore,
    minute,
    period,
    isConnected,
    lastGoal,
    hasScoreChanged,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK PARA ODDS EM TEMPO REAL
// ═══════════════════════════════════════════════════════════════════════════

interface UseMatchOddsOptions {
  matchId: string;
  initialOdds?: { home: number; draw: number; away: number };
}

interface UseMatchOddsReturn {
  odds: { home: number; draw: number; away: number };
  oddsDirection: { home?: 'up' | 'down'; draw?: 'up' | 'down'; away?: 'up' | 'down' };
  isConnected: boolean;
}

export function useMatchOdds(options: UseMatchOddsOptions): UseMatchOddsReturn {
  const { matchId: _matchId, initialOdds } = options;

  const [odds, setOdds] = useState(initialOdds || { home: 0, draw: 0, away: 0 });
  const oddsDirection: { home?: 'up' | 'down'; draw?: 'up' | 'down'; away?: 'up' | 'down' } = {};
  const isConnected = false;

  const previousOddsRef = useRef(odds);
  const initialOddsHome = initialOdds?.home;
  const initialOddsDraw = initialOdds?.draw;
  const initialOddsAway = initialOdds?.away;

  // Atualizar com valores iniciais
  useEffect(() => {
    if (
      initialOddsHome !== undefined ||
      initialOddsDraw !== undefined ||
      initialOddsAway !== undefined
    ) {
      const nextOdds = {
        home: initialOddsHome ?? 0,
        draw: initialOddsDraw ?? 0,
        away: initialOddsAway ?? 0,
      };
      setOdds(nextOdds);
      previousOddsRef.current = nextOdds;
    }
  }, [initialOddsHome, initialOddsDraw, initialOddsAway]);

  return {
    odds,
    oddsDirection,
    isConnected,
  };
}

export default useLiveScoresWebSocket;

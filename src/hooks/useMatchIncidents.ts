
import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../services/backendClient';

export interface MatchIncident {
  id: string;
  time: number;
  type: 'goal' | 'own_goal' | 'yellow_card' | 'red_card' | 'yellow_red' | 'substitution' | 'VAR' | 'penalty' | 'penalty_awarded' | 'missed_penalty' | 'disallowed_goal' | 'goal_chance' | 'injury';
  team: 'home' | 'away';
  player?: string;
  assist?: string;
  description: string;
  color: string;
  icon: string;
  label: string;
  duration: number;
  startedAt: number;
}

interface MatchIncidentsOptions {
  sport?: string;
  isLive?: boolean;
  fixtureId?: string | number;
}

const INCIDENT_META: Record<string, { color: string; icon: string; label: string; duration: [number, number] }> = {
  goal:            { color: 'from-green-500 to-green-700',   icon: 'ri-football-line',      label: 'GOL!',                duration: [8000,  4000]  },
  own_goal:        { color: 'from-orange-500 to-orange-700', icon: 'ri-football-line',      label: 'GOL CONTRA',          duration: [8000,  4000]  },
  penalty:         { color: 'from-red-600 to-red-800',       icon: 'ri-focus-3-line',       label: 'PENÁLTI',             duration: [45000, 15000] },
  penalty_awarded: { color: 'from-red-500 to-red-700',       icon: 'ri-focus-3-line',       label: 'PENÁLTI ASSINALADO',  duration: [30000, 15000] },
  missed_penalty:  { color: 'from-gray-500 to-gray-700',     icon: 'ri-close-circle-line',  label: 'PENÁLTI FALHADO',     duration: [10000, 5000]  },
  disallowed_goal: { color: 'from-amber-500 to-orange-600',  icon: 'ri-video-line',         label: 'GOL ANULADO (VAR)',   duration: [30000, 15000] },
  VAR:             { color: 'from-amber-500 to-orange-600',  icon: 'ri-video-line',         label: 'REVISÃO VAR',         duration: [60000, 60000] },
  yellow_card:     { color: 'from-yellow-400 to-yellow-500', icon: 'ri-file-forbid-line',   label: 'CARTÃO AMARELO',      duration: [15000, 10000] },
  yellow_red:      { color: 'from-orange-500 to-red-600',    icon: 'ri-file-forbid-line',   label: '2º AMARELO / VERMELHO', duration: [20000, 10000] },
  red_card:        { color: 'from-red-700 to-red-900',       icon: 'ri-close-circle-line',  label: 'CARTÃO VERMELHO',     duration: [20000, 10000] },
  substitution:    { color: 'from-blue-500 to-blue-700',     icon: 'ri-refresh-line',       label: 'SUBSTITUIÇÃO',        duration: [10000, 5000]  },
  injury:          { color: 'from-purple-500 to-purple-700', icon: 'ri-hospital-line',      label: 'LESÃO',               duration: [15000, 10000] },
  goal_chance:     { color: 'from-red-500 to-red-700',       icon: 'ri-football-line',      label: 'GRANDE OPORTUNIDADE', duration: [15000, 15000] },
};

function makeDuration(base: number, extra: number): number {
  return base + Math.random() * extra;
}

export const useMatchIncidents = (
  matchId: string,
  options: MatchIncidentsOptions = {}
) => {
  const { sport = 'football', isLive = false } = options;
  const [incidents, setIncidents] = useState<MatchIncident[]>([]);
  const [apiIncidents, setApiIncidents] = useState<any[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastIncidentTimeRef = useRef<number>(0);
  const processedIdsRef = useRef<Set<string>>(new Set());
  const lastFetchedCountRef = useRef<number>(0);

  const isSoccer = sport?.toLowerCase().includes('soccer') ||
                   sport?.toLowerCase().includes('football') ||
                   sport?.toLowerCase().includes('futebol');

  const shouldTrackIncidents = isSoccer && isLive && !!matchId;

  const showIncident = useCallback((incident: MatchIncident) => {
    if (processedIdsRef.current.has(incident.id)) return;
    processedIdsRef.current.add(incident.id);
    setIncidents(prev => [...prev.filter(i => i.id !== incident.id), incident]);
    setTimeout(() => {
      setIncidents(prev => prev.filter(i => i.id !== incident.id));
    }, incident.duration);
  }, []);

  const fetchRealIncidents = useCallback(async () => {
    if (!shouldTrackIncidents) return;
    try {
      const resp = await apiFetch(`/api/events/${encodeURIComponent(matchId)}/incidents`, { method: 'GET' });

      const rawList: any[] = Array.isArray(resp?.incidents) ? resp.incidents : [];

      if (rawList.length === 0) return;

      setApiIncidents(rawList);

      const newOnes = rawList.slice(lastFetchedCountRef.current);
      lastFetchedCountRef.current = rawList.length;

      // Show the most recent new incident (avoid flooding UI)
      const priority = ['goal', 'own_goal', 'penalty', 'VAR', 'disallowed_goal', 'penalty_awarded',
                        'missed_penalty', 'red_card', 'yellow_red', 'yellow_card', 'substitution', 'injury'];

      const sorted = [...newOnes].sort((a, b) => {
        const ai = priority.indexOf(a.type);
        const bi = priority.indexOf(b.type);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      for (const inc of sorted.slice(0, 2)) {
        const meta = INCIDENT_META[inc.type];
        if (!meta) continue;

        const incident: MatchIncident = {
          id: String(inc.id),
          time: Number(inc.minute ?? 0),
          type: inc.type as MatchIncident['type'],
          team: inc.team === 'home' ? 'home' : 'away',
          player: inc.player ?? undefined,
          assist: inc.assist ?? undefined,
          description: inc.description ?? meta.label,
          color: meta.color,
          icon: meta.icon,
          label: meta.label,
          duration: makeDuration(meta.duration[0], meta.duration[1]),
          startedAt: Date.now(),
        };

        showIncident(incident);
        console.log(`⚽ [INCIDENTS] ${incident.label} @ ${incident.time}' — ${incident.player ?? '?'}`);
      }

      // Big chances from stats (stat id 24)
      if (resp?.bigChances) {
        const { home, away } = resp.bigChances;
        const totalNew = (home || 0) + (away || 0);
        if (totalNew > 0) {
          const chanceId = `chance-${matchId}-${totalNew}`;
          if (!processedIdsRef.current.has(chanceId)) {
            const meta = INCIDENT_META['goal_chance'];
            const side = (home ?? 0) >= (away ?? 0) ? 'home' : 'away';
            const incident: MatchIncident = {
              id: chanceId,
              time: 0,
              type: 'goal_chance',
              team: side,
              description: `Grande oportunidade de golo (${home} casa / ${away} fora)`,
              color: meta.color,
              icon: meta.icon,
              label: meta.label,
              duration: makeDuration(meta.duration[0], meta.duration[1]),
              startedAt: Date.now(),
            };
            showIncident(incident);
          }
        }
      }
    } catch (err) {
      console.error('❌ [INCIDENTS] Erro ao buscar incidentes:', err);
    }
  }, [matchId, shouldTrackIncidents, showIncident]);

  // Simulated fallback — only fires when API returns no real data
  const generateSimulatedIncident = useCallback((): MatchIncident | null => {
    if (!shouldTrackIncidents) return null;
    const now = Date.now();
    if (now - lastIncidentTimeRef.current < 45000) return null;
    if (Math.random() > 0.05) return null;

    const pool = [
      { type: 'VAR',        weight: 0.15 },
      { type: 'goal_chance', weight: 0.40 },
      { type: 'penalty',    weight: 0.10 },
      { type: 'yellow_card', weight: 0.25 },
      { type: 'red_card',   weight: 0.10 },
    ] as const;

    let cum = 0;
    const rnd = Math.random();
    let chosen = pool[0];
    for (const p of pool) {
      cum += p.weight;
      if (rnd <= cum) { chosen = p; break; }
    }

    const meta = INCIDENT_META[chosen.type]!;
    const incident: MatchIncident = {
      id: `sim-${matchId}-${now}`,
      time: Math.floor(Math.random() * 90) + 1,
      type: chosen.type as MatchIncident['type'],
      team: Math.random() > 0.5 ? 'home' : 'away',
      description: meta.label,
      color: meta.color,
      icon: meta.icon,
      label: meta.label,
      duration: makeDuration(meta.duration[0], meta.duration[1]),
      startedAt: now,
    };

    lastIncidentTimeRef.current = now;
    return incident;
  }, [matchId, shouldTrackIncidents]);

  useEffect(() => {
    if (!shouldTrackIncidents) return;

    fetchRealIncidents();

    intervalRef.current = setInterval(async () => {
      await fetchRealIncidents();

      // Fallback simulation only when no real incidents arrived
      if (apiIncidents.length === 0) {
        const sim = generateSimulatedIncident();
        if (sim) showIncident(sim);
      }
    }, 15000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [matchId, shouldTrackIncidents, fetchRealIncidents, generateSimulatedIncident, showIncident]);

  return {
    incidents,
    apiIncidents,
    isTracking: shouldTrackIncidents,
  };
};

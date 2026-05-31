
import { useState, useEffect, useCallback } from 'react';
import {
  startPolling,
  stopPolling,
  isConnected,
  getStats,
  setPollingInterval
} from '../services/liveEventsConnector';

interface LiveEventData {
  matchId: string;
  type: string;
  event?: any;
  team?: string;
  player?: string;
}

interface ConnectorStats {
  isConnected: boolean;
  isPolling: boolean;
  pollCount: number;
  errorCount: number;
  lastPollTime: number | null;
  activeMatchesCount: number;
}

export const useLiveEventsConnector = (autoStart: boolean = false) => {
  const [connected, setConnected] = useState(isConnected());
  const [stats, setStats] = useState<ConnectorStats>(getStats());
  const [lastEvent, setLastEvent] = useState<LiveEventData | null>(null);

  // Atualizar estatísticas periodicamente
  useEffect(() => {
    const updateStats = () => {
      setStats(getStats());
      setConnected(isConnected());
    };

    const interval = setInterval(updateStats, 2000);
    return () => clearInterval(interval);
  }, []);

  // Escutar eventos ao vivo
  useEffect(() => {
    const handleLiveEvent = (event: Event) => {
      const customEvent = event as CustomEvent<LiveEventData>;
      setLastEvent(customEvent.detail);
    };

    const handleConnected = () => {
      setConnected(true);
      setStats(getStats());
    };

    const handleDisconnected = () => {
      setConnected(false);
      setStats(getStats());
    };

    window.addEventListener('live-event', handleLiveEvent);
    window.addEventListener('live-events-connected', handleConnected);
    window.addEventListener('live-events-disconnected', handleDisconnected);

    return () => {
      window.removeEventListener('live-event', handleLiveEvent);
      window.removeEventListener('live-events-connected', handleConnected);
      window.removeEventListener('live-events-disconnected', handleDisconnected);
    };
  }, []);

  // Auto-iniciar se configurado
  useEffect(() => {
    if (autoStart && !connected) {
      startPolling();
    }
  }, [autoStart, connected]);

  const start = useCallback((interval?: number) => {
    if (interval) {
      setPollingInterval(interval);
    }
    startPolling();
  }, []);

  const stop = useCallback(() => {
    stopPolling();
  }, []);

  return {
    connected,
    stats,
    lastEvent,
    start,
    stop
  };
};

export default useLiveEventsConnector;

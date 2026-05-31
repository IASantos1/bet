
import { useState, useEffect, useCallback } from 'react';
import {
  onAlert,
  onMovement,
  getActiveAlerts,
  getTriggeredAlerts,
  getRecentMovements,
  getMovementStats,
  getConfig,
  updateConfig,
  createThresholdAlert,
  createVariationAlert,
  removeAlert,
  markAlertAsNotified,
  clearAllAlerts,
  type OddsAlert,
  type OddsMovement,
  type AlertConfig,
} from '../services/oddsAlerts';

interface UseOddsAlertsReturn {
  // Alertas
  activeAlerts: OddsAlert[];
  triggeredAlerts: OddsAlert[];
  
  // Movimentos
  recentMovements: OddsMovement[];
  
  // Estatísticas
  stats: ReturnType<typeof getMovementStats>;
  
  // Configuração
  config: AlertConfig;
  updateConfig: (config: Partial<AlertConfig>) => void;
  
  // Ações
  createThresholdAlert: typeof createThresholdAlert;
  createVariationAlert: typeof createVariationAlert;
  removeAlert: (alertId: string) => void;
  markAsNotified: (alertId: string) => void;
  clearAll: () => void;
  
  // Estado
  hasNewAlerts: boolean;
  clearNewAlerts: () => void;
}

export function useOddsAlerts(): UseOddsAlertsReturn {
  const [activeAlerts, setActiveAlerts] = useState<OddsAlert[]>([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState<OddsAlert[]>([]);
  const [recentMovements, setRecentMovements] = useState<OddsMovement[]>([]);
  const [stats, setStats] = useState(getMovementStats());
  const [config, setConfig] = useState<AlertConfig>(getConfig());
  const [hasNewAlerts, setHasNewAlerts] = useState(false);

  // Atualizar estado quando há novos alertas
  useEffect(() => {
    const unsubAlert = onAlert((_alert) => {
      setActiveAlerts(getActiveAlerts());
      setTriggeredAlerts(getTriggeredAlerts());
      setStats(getMovementStats());
      setHasNewAlerts(true);
    });

    const unsubMovement = onMovement((_movement) => {
      setRecentMovements(getRecentMovements(50));
      setStats(getMovementStats());
    });

    // Carregar estado inicial
    setActiveAlerts(getActiveAlerts());
    setTriggeredAlerts(getTriggeredAlerts());
    setRecentMovements(getRecentMovements(50));
    setStats(getMovementStats());

    return () => {
      unsubAlert();
      unsubMovement();
    };
  }, []);

  const handleUpdateConfig = useCallback((newConfig: Partial<AlertConfig>) => {
    updateConfig(newConfig);
    setConfig(getConfig());
  }, []);

  const handleRemoveAlert = useCallback((alertId: string) => {
    removeAlert(alertId);
    setActiveAlerts(getActiveAlerts());
    setTriggeredAlerts(getTriggeredAlerts());
    setStats(getMovementStats());
  }, []);

  const handleMarkAsNotified = useCallback((alertId: string) => {
    markAlertAsNotified(alertId);
    setTriggeredAlerts(getTriggeredAlerts());
  }, []);

  const handleClearAll = useCallback(() => {
    clearAllAlerts();
    setActiveAlerts([]);
    setTriggeredAlerts([]);
    setStats(getMovementStats());
  }, []);

  const clearNewAlerts = useCallback(() => {
    setHasNewAlerts(false);
  }, []);

  return {
    activeAlerts,
    triggeredAlerts,
    recentMovements,
    stats,
    config,
    updateConfig: handleUpdateConfig,
    createThresholdAlert,
    createVariationAlert,
    removeAlert: handleRemoveAlert,
    markAsNotified: handleMarkAsNotified,
    clearAll: handleClearAll,
    hasNewAlerts,
    clearNewAlerts,
  };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { calculateCashOutValue, simulateEventProgress } from './useCashOut';

interface CashOutNotification {
  id: string;
  betId: string;
  type: 'favorable' | 'profit_threshold' | 'high_value';
  message: string;
  cashOutValue: number;
  timestamp: Date;
}

interface BetToMonitor {
  id: string;
  stake: number;
  totalOdds: number;
  potentialWin: number;
  createdAt: string;
}

interface NotificationSettings {
  enabled: boolean;
  profitThreshold: number; // Percentagem de lucro para notificar (ex: 20 = 20%)
  soundEnabled: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  profitThreshold: 20,
  soundEnabled: true
};

// Chave para localStorage
const SETTINGS_KEY = 'cashout_notification_settings';
const NOTIFIED_KEY = 'cashout_notified_bets';

export const useCashOutNotifications = () => {
  const [notifications, setNotifications] = useState<CashOutNotification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [monitoredBets, setMonitoredBets] = useState<BetToMonitor[]>([]);
  const notifiedBetsRef = useRef<Set<string>>(new Set());
  const _audioRef = useRef<HTMLAudioElement | null>(null);

  // Carregar apostas já notificadas do localStorage
  useEffect(() => {
    const saved = localStorage.getItem(NOTIFIED_KEY);
    if (saved) {
      notifiedBetsRef.current = new Set(JSON.parse(saved));
    }
  }, []);

  // Guardar configurações no localStorage
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // Verificar permissão de notificações
  useEffect(() => {
    if ('Notification' in window) {
      setPermissionGranted(Notification.permission === 'granted');
    }
  }, []);

  // Pedir permissão para notificações
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.log('Este browser não suporta notificações');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      setPermissionGranted(granted);
      return granted;
    } catch {
      console.error('Erro ao pedir permissão');
      return false;
    }
  }, []);

  // Tocar som de notificação
  const playNotificationSound = useCallback(() => {
    if (!settings.soundEnabled) return;
    
    // Criar um som simples usando Web Audio API
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch {
      console.log('Não foi possível tocar o som');
    }
  }, [settings.soundEnabled]);

  // Enviar notificação push
  const sendPushNotification = useCallback((notification: CashOutNotification) => {
    if (!permissionGranted || !settings.enabled) return;

    const title = '💰 Cash Out Favorável!';
    const options = {
      body: notification.message,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: notification.id,
      requireInteraction: true,
      vibrate: [200, 100, 200]
    };

    try {
      const pushNotification = new Notification(title, options);
      
      pushNotification.onclick = () => {
        window.focus();
        pushNotification.close();
      };

      playNotificationSound();
    } catch {
      console.error('Erro ao enviar notificação');
    }
  }, [permissionGranted, settings.enabled, playNotificationSound]);

  // Adicionar notificação à lista
  const addNotification = useCallback((notification: Omit<CashOutNotification, 'id' | 'timestamp'>) => {
    const newNotification: CashOutNotification = {
      ...notification,
      id: `${notification.betId}-${Date.now()}`,
      timestamp: new Date()
    };

    setNotifications(prev => [newNotification, ...prev].slice(0, 20)); // Manter últimas 20
    sendPushNotification(newNotification);

    // Marcar como notificado
    const notifyKey = `${notification.betId}-${notification.type}`;
    notifiedBetsRef.current.add(notifyKey);
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notifiedBetsRef.current]));

    return newNotification;
  }, [sendPushNotification]);

  // Verificar se deve notificar
  const checkAndNotify = useCallback(
    (bet: BetToMonitor) => {
      const progress = simulateEventProgress(bet.createdAt);
      const cashOutValue = calculateCashOutValue(
        bet.stake,
        bet.totalOdds,
        bet.potentialWin,
        progress,
        true
      );

      const profitPercentage = ((cashOutValue - bet.stake) / bet.stake) * 100;
      const profitAmount = cashOutValue - bet.stake;
      const isWinning = cashOutValue > bet.stake;

      const checks = [
        {
          type: 'profit_threshold' as const,
          condition: profitPercentage >= settings.profitThreshold && profitAmount > 0,
          message: `A sua aposta atingiu ${profitPercentage.toFixed(0)}% de lucro! Cash Out: €${cashOutValue.toFixed(
            2
          )}`
        },
        {
          type: 'high_value' as const,
          condition: cashOutValue >= bet.potentialWin * 0.8 && isWinning,
          message: `Cash Out muito favorável! Pode garantir €${cashOutValue.toFixed(
            2
          )} (${((cashOutValue / bet.potentialWin) * 100).toFixed(0)}% do potencial)`
        },
        {
          type: 'favorable' as const,
          condition: isWinning && progress > 0.6 && profitAmount > 5,
          message: `Momento favorável para Cash Out! Valor: €${cashOutValue.toFixed(
            2
          )} (+€${profitAmount.toFixed(2)})`
        }
      ];

      for (const check of checks) {
        const notifyKey = `${bet.id}-${check.type}`;
        if (check.condition && !notifiedBetsRef.current.has(notifyKey)) {
          addNotification({
            betId: bet.id,
            type: check.type,
            message: check.message,
            cashOutValue
          });
          break;
        }
      }

      return { cashOutValue, profitPercentage, isWinning, progress };
    },
    [settings.profitThreshold, addNotification]
  );

  // Monitorizar apostas
  useEffect(() => {
    if (!settings.enabled || monitoredBets.length === 0) return;

    const interval = setInterval(() => {
      monitoredBets.forEach(bet => {
        checkAndNotify(bet);
      });
    }, 10000); // Verificar a cada 10 segundos

    return () => clearInterval(interval);
  }, [settings.enabled, monitoredBets, checkAndNotify]);

  // Adicionar aposta para monitorizar
  const addBetToMonitor = useCallback((bet: BetToMonitor) => {
    setMonitoredBets(prev => {
      if (prev.find(b => b.id === bet.id)) return prev;
      return [...prev, bet];
    });
  }, []);

  // Remover aposta da monitorização
  const removeBetFromMonitor = useCallback((betId: string) => {
    setMonitoredBets(prev => prev.filter(b => b.id !== betId));
  }, []);

  // Limpar notificações
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Remover notificação específica
  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Atualizar configurações
  const updateSettings = useCallback((newSettings: Partial<NotificationSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  // Resetar notificações de uma aposta (para permitir re-notificar)
  const resetBetNotifications = useCallback((betId: string) => {
    const keysToRemove = [...notifiedBetsRef.current].filter(key => key.startsWith(betId));
    keysToRemove.forEach(key => notifiedBetsRef.current.delete(key));
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notifiedBetsRef.current]));
  }, []);

  return {
    notifications,
    settings,
    permissionGranted,
    monitoredBets,
    requestPermission,
    addBetToMonitor,
    removeBetFromMonitor,
    checkAndNotify,
    clearNotifications,
    dismissNotification,
    updateSettings,
    resetBetNotifications
  };
};

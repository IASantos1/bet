
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  notifyDepositSuccess: (amount: number) => void;
  notifyDepositError: (message: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNotification = { ...notification, id };
    
    setNotifications(prev => [...prev, newNotification]);

    // Auto-remove after duration
    const duration = notification.duration || 5000;
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  }, [removeNotification]);

  const notifyDepositSuccess = useCallback((amount: number) => {
    addNotification({
      type: 'success',
      title: 'Depósito Realizado!',
      message: `€${amount.toFixed(2)} foram adicionados à sua conta com sucesso.`,
      duration: 6000,
    });
  }, [addNotification]);

  const notifyDepositError = useCallback((message: string) => {
    addNotification({
      type: 'error',
      title: 'Erro no Depósito',
      message,
      duration: 6000,
    });
  }, [addNotification]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        notifyDepositSuccess,
        notifyDepositError,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

function useNotificationInternal() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}

export const useNotification = useNotificationInternal;

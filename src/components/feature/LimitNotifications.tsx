
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLimits } from '../../hooks/useLimits';

interface Notification {
  id: string;
  type: 'warning' | 'danger' | 'info';
  title: string;
  message: string;
  icon: string;
  category: 'deposit' | 'bet' | 'withdrawal';
}

export default function LimitNotifications() {
  const { user } = useAuth();
  const { getRemainingLimits, limits, loading } = useLimits();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!user || loading) return;

    const remaining = getRemainingLimits();
    const newNotifications: Notification[] = [];

    // Verificar limites de depósito
    const dailyDepositPercent = limits.maxDailyDeposit
      ? (remaining.deposit.daily / limits.maxDailyDeposit) * 100
      : 100;
    const weeklyDepositPercent = limits.maxWeeklyDeposit
      ? (remaining.deposit.weekly / limits.maxWeeklyDeposit) * 100
      : 100;
    const monthlyDepositPercent = limits.maxMonthlyDeposit
      ? (remaining.deposit.monthly / limits.maxMonthlyDeposit) * 100
      : 100;

    if (dailyDepositPercent <= 10 && dailyDepositPercent > 0) {
      newNotifications.push({
        id: 'deposit-daily-critical',
        type: 'danger',
        title: 'Limite Diário Quase Atingido',
        message: `Resta apenas €${remaining.deposit.daily.toFixed(2)} do seu limite diário de depósito.`,
        icon: 'ri-error-warning-fill',
        category: 'deposit',
      });
    } else if (dailyDepositPercent <= 25) {
      newNotifications.push({
        id: 'deposit-daily-warning',
        type: 'warning',
        title: 'Limite Diário Próximo',
        message: `Utilizou 75% do seu limite diário de depósito. Restam €${remaining.deposit.daily.toFixed(2)}.`,
        icon: 'ri-alert-line',
        category: 'deposit',
      });
    }

    if (weeklyDepositPercent <= 10 && weeklyDepositPercent > 0) {
      newNotifications.push({
        id: 'deposit-weekly-critical',
        type: 'danger',
        title: 'Limite Semanal Quase Atingido',
        message: `Resta apenas €${remaining.deposit.weekly.toFixed(2)} do seu limite semanal de depósito.`,
        icon: 'ri-error-warning-fill',
        category: 'deposit',
      });
    } else if (weeklyDepositPercent <= 25) {
      newNotifications.push({
        id: 'deposit-weekly-warning',
        type: 'warning',
        title: 'Limite Semanal Próximo',
        message: `Utilizou 75% do seu limite semanal de depósito. Restam €${remaining.deposit.weekly.toFixed(2)}.`,
        icon: 'ri-alert-line',
        category: 'deposit',
      });
    }

    if (monthlyDepositPercent <= 10 && monthlyDepositPercent > 0) {
      newNotifications.push({
        id: 'deposit-monthly-critical',
        type: 'danger',
        title: 'Limite Mensal Quase Atingido',
        message: `Resta apenas €${remaining.deposit.monthly.toFixed(2)} do seu limite mensal de depósito.`,
        icon: 'ri-error-warning-fill',
        category: 'deposit',
      });
    } else if (monthlyDepositPercent <= 25) {
      newNotifications.push({
        id: 'deposit-monthly-warning',
        type: 'warning',
        title: 'Limite Mensal Próximo',
        message: `Utilizou 75% do seu limite mensal de depósito. Restam €${remaining.deposit.monthly.toFixed(2)}.`,
        icon: 'ri-alert-line',
        category: 'deposit',
      });
    }

    // Verificar limites de aposta
    const dailyBetPercent = limits.maxDailyBet
      ? (remaining.bet.daily / limits.maxDailyBet) * 100
      : 100;
    const weeklyBetPercent = limits.maxWeeklyBet
      ? (remaining.bet.weekly / limits.maxWeeklyBet) * 100
      : 100;
    const monthlyBetPercent = limits.maxMonthlyBet
      ? (remaining.bet.monthly / limits.maxMonthlyBet) * 100
      : 100;

    if (dailyBetPercent <= 10 && dailyBetPercent > 0) {
      newNotifications.push({
        id: 'bet-daily-critical',
        type: 'danger',
        title: 'Limite de Apostas Diário Crítico',
        message: `Resta apenas €${remaining.bet.daily.toFixed(2)} do seu limite diário de apostas.`,
        icon: 'ri-error-warning-fill',
        category: 'bet',
      });
    } else if (dailyBetPercent <= 25) {
      newNotifications.push({
        id: 'bet-daily-warning',
        type: 'warning',
        title: 'Limite de Apostas Diário Próximo',
        message: `Utilizou 75% do seu limite diário de apostas. Restam €${remaining.bet.daily.toFixed(2)}.`,
        icon: 'ri-alert-line',
        category: 'bet',
      });
    }

    if (weeklyBetPercent <= 10 && weeklyBetPercent > 0) {
      newNotifications.push({
        id: 'bet-weekly-critical',
        type: 'danger',
        title: 'Limite de Apostas Semanal Crítico',
        message: `Resta apenas €${remaining.bet.weekly.toFixed(2)} do seu limite semanal de apostas.`,
        icon: 'ri-error-warning-fill',
        category: 'bet',
      });
    } else if (weeklyBetPercent <= 25) {
      newNotifications.push({
        id: 'bet-weekly-warning',
        type: 'warning',
        title: 'Limite de Apostas Semanal Próximo',
        message: `Utilizou 75% do seu limite semanal de apostas. Restam €${remaining.bet.weekly.toFixed(2)}.`,
        icon: 'ri-alert-line',
        category: 'bet',
      });
    }

    if (monthlyBetPercent <= 10 && monthlyBetPercent > 0) {
      newNotifications.push({
        id: 'bet-monthly-critical',
        type: 'danger',
        title: 'Limite de Apostas Mensal Crítico',
        message: `Resta apenas €${remaining.bet.monthly.toFixed(2)} do seu limite mensal de apostas.`,
        icon: 'ri-error-warning-fill',
        category: 'bet',
      });
    } else if (monthlyBetPercent <= 25) {
      newNotifications.push({
        id: 'bet-monthly-warning',
        type: 'warning',
        title: 'Limite de Apostas Mensal Próximo',
        message: `Utilizou 75% do seu limite mensal de apostas. Restam €${remaining.bet.monthly.toFixed(2)}.`,
        icon: 'ri-alert-line',
        category: 'bet',
      });
    }

    // Verificar limites de levantamento
    const dailyWithdrawalPercent = limits.maxDailyWithdrawal
      ? (remaining.withdrawal.daily / limits.maxDailyWithdrawal) * 100
      : 100;

    if (dailyWithdrawalPercent <= 10 && dailyWithdrawalPercent > 0) {
      newNotifications.push({
        id: 'withdrawal-daily-critical',
        type: 'danger',
        title: 'Limite de Levantamento Crítico',
        message: `Resta apenas €${remaining.withdrawal.daily.toFixed(2)} do seu limite diário de levantamento.`,
        icon: 'ri-error-warning-fill',
        category: 'withdrawal',
      });
    } else if (dailyWithdrawalPercent <= 25) {
      newNotifications.push({
        id: 'withdrawal-daily-warning',
        type: 'warning',
        title: 'Limite de Levantamento Próximo',
        message: `Utilizou 75% do seu limite diário de levantamento. Restam €${remaining.withdrawal.daily.toFixed(2)}.`,
        icon: 'ri-alert-line',
        category: 'withdrawal',
      });
    }

    if (remaining.withdrawal.pendingSlots <= 1 && remaining.withdrawal.pendingSlots > 0) {
      newNotifications.push({
        id: 'withdrawal-pending-warning',
        type: 'warning',
        title: 'Levantamentos Pendentes',
        message: `Tem ${limits.maxPendingWithdrawals - remaining.withdrawal.pendingSlots} levantamentos pendentes. Apenas mais ${remaining.withdrawal.pendingSlots} permitido.`,
        icon: 'ri-time-line',
        category: 'withdrawal',
      });
    }

    // Limites atingidos (0%)
    if (remaining.deposit.daily === 0) {
      newNotifications.push({
        id: 'deposit-daily-reached',
        type: 'danger',
        title: 'Limite Diário Atingido',
        message: 'Atingiu o seu limite diário de depósito. Tente novamente amanhã.',
        icon: 'ri-forbid-line',
        category: 'deposit',
      });
    }

    if (remaining.bet.daily === 0) {
      newNotifications.push({
        id: 'bet-daily-reached',
        type: 'danger',
        title: 'Limite de Apostas Atingido',
        message: 'Atingiu o seu limite diário de apostas. Tente novamente amanhã.',
        icon: 'ri-forbid-line',
        category: 'bet',
      });
    }

    setNotifications(newNotifications.filter(n => !dismissedIds.includes(n.id)));
  }, [user, loading, getRemainingLimits, limits, dismissedIds]);

  const dismissNotification = (id: string) => {
    setDismissedIds(prev => [...prev, id]);
  };

  const dismissAll = () => {
    setDismissedIds(notifications.map(n => n.id));
  };

  if (!user || notifications.length === 0) return null;

  const criticalCount = notifications.filter(n => n.type === 'danger').length;
  const warningCount = notifications.filter(n => n.type === 'warning').length;

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'danger':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-amber-50 border-amber-200 text-amber-800';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  const getIconStyles = (type: string) => {
    switch (type) {
      case 'danger':
        return 'text-red-500';
      case 'warning':
        return 'text-amber-500';
      default:
        return 'text-blue-500';
    }
  };

  return (
    <>
      {/* Floating Notification Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all cursor-pointer ${
          criticalCount > 0 
            ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
            : 'bg-amber-500 hover:bg-amber-600'
        }`}
      >
        <i className="ri-notification-3-line text-white text-2xl"></i>
        <span className="absolute -top-1 -right-1 w-6 h-6 bg-gray-900 text-white text-xs font-bold rounded-full flex items-center justify-center">
          {notifications.length}
        </span>
      </button>

      {/* Notification Panel */}
      {isExpanded && (
        <>
          <div 
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setIsExpanded(false)}
          ></div>
          <div className="fixed bottom-24 right-6 z-50 w-96 max-h-[70vh] bg-white rounded-xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <i className="ri-notification-3-line text-white text-xl"></i>
                <div>
                  <h3 className="text-white font-semibold">Alertas de Limites</h3>
                  <p className="text-gray-400 text-xs">
                    {criticalCount > 0 && <span className="text-red-400">{criticalCount} crítico(s)</span>}
                    {criticalCount > 0 && warningCount > 0 && ' • '}
                    {warningCount > 0 && <span className="text-amber-400">{warningCount} aviso(s)</span>}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto p-3 space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 rounded-lg border ${getTypeStyles(notification.type)} relative`}
                >
                  <button
                    onClick={() => dismissNotification(notification.id)}
                    className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <i className="ri-close-line"></i>
                  </button>
                  <div className="flex items-start gap-3 pr-6">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      notification.type === 'danger' ? 'bg-red-100' : 'bg-amber-100'
                    }`}>
                      <i className={`${notification.icon} ${getIconStyles(notification.type)}`}></i>
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">{notification.title}</h4>
                      <p className="text-xs mt-1 opacity-80">{notification.message}</p>
                      <div className="mt-2">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                          notification.category === 'deposit' 
                            ? 'bg-green-100 text-green-700'
                            : notification.category === 'bet'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          <i className={`${
                            notification.category === 'deposit' 
                              ? 'ri-add-circle-line'
                              : notification.category === 'bet'
                              ? 'ri-gamepad-line'
                              : 'ri-money-euro-circle-line'
                          }`}></i>
                          {notification.category === 'deposit' ? 'Depósito' : notification.category === 'bet' ? 'Aposta' : 'Levantamento'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <button
                  onClick={dismissAll}
                  className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <i className="ri-check-double-line mr-1"></i>
                  Dispensar Todos
                </button>
                <a
                  href="/profile"
                  className="text-sm text-[#14B8A6] hover:text-[#0F9A8A] font-medium cursor-pointer"
                >
                  <i className="ri-settings-3-line mr-1"></i>
                  Gerir Limites
                </a>
              </div>
            </div>

            {/* Responsible Gaming */}
            <div className="p-3 bg-gradient-to-r from-[#14B8A6]/10 to-[#0F9A8A]/10 border-t border-[#14B8A6]/20">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <i className="ri-heart-pulse-line text-[#14B8A6]"></i>
                <span>Jogue com responsabilidade. Os limites ajudam a manter o controlo.</span>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

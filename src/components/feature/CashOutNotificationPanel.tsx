
import { useState } from 'react';
import { useCashOutNotifications } from '../../hooks/useCashOutNotifications';

interface CashOutNotificationPanelProps {
  onClose?: () => void;
}

export default function CashOutNotificationPanel({ onClose }: CashOutNotificationPanelProps) {
  const {
    notifications,
    settings,
    permissionGranted,
    requestPermission,
    clearNotifications,
    dismissNotification,
    updateSettings
  } = useCashOutNotifications();

  const [showSettings, setShowSettings] = useState(false);

  const handleRequestPermission = async () => {
    const granted = await requestPermission();
    if (!granted) {
      alert('Por favor, permita notificações nas configurações do seu browser para receber alertas de Cash Out.');
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'profit_threshold':
        return 'ri-percent-line';
      case 'high_value':
        return 'ri-vip-crown-line';
      case 'favorable':
        return 'ri-thumb-up-line';
      default:
        return 'ri-notification-line';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'profit_threshold':
        return 'text-green-400 bg-green-500/20';
      case 'high_value':
        return 'text-yellow-400 bg-yellow-500/20';
      case 'favorable':
        return 'text-blue-400 bg-blue-500/20';
      default:
        return 'text-gray-400 bg-gray-500/20';
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}m atrás`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h atrás`;
    
    return date.toLocaleDateString('pt-PT');
  };

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden max-w-md w-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#14B8A6] to-emerald-600 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <i className="ri-notification-3-line text-white text-xl"></i>
            </div>
            <div>
              <h3 className="font-bold text-white">Alertas de Cash Out</h3>
              <p className="text-white/70 text-xs">Notificações de valores favoráveis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-8 h-8 flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-full transition-colors cursor-pointer"
            >
              <i className="ri-settings-3-line text-white"></i>
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-full transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-white"></i>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Permission Banner */}
      {!permissionGranted && (
        <div className="bg-amber-900/30 border-b border-amber-500/30 p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <i className="ri-notification-off-line text-amber-400"></i>
            </div>
            <div className="flex-1">
              <p className="text-sm text-amber-200 mb-2">
                Ative as notificações para receber alertas quando o Cash Out atingir valores favoráveis.
              </p>
              <button
                onClick={handleRequestPermission}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-notification-line mr-2"></i>
                Ativar Notificações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-gray-800/50 border-b border-gray-700 p-4 space-y-4">
          <h4 className="font-semibold text-white text-sm flex items-center gap-2">
            <i className="ri-settings-3-line text-[#14B8A6]"></i>
            Configurações
          </h4>

          {/* Enable/Disable */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white">Notificações ativas</div>
              <div className="text-xs text-gray-400">Receber alertas de Cash Out</div>
            </div>
            <button
              onClick={() => updateSettings({ enabled: !settings.enabled })}
              className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${
                settings.enabled ? 'bg-[#14B8A6]' : 'bg-gray-600'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                settings.enabled ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* Sound */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white">Som de notificação</div>
              <div className="text-xs text-gray-400">Tocar som ao receber alerta</div>
            </div>
            <button
              onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
              className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${
                settings.soundEnabled ? 'bg-[#14B8A6]' : 'bg-gray-600'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                settings.soundEnabled ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* Profit Threshold */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-sm text-white">Limite de lucro</div>
                <div className="text-xs text-gray-400">Notificar quando atingir este lucro</div>
              </div>
              <span className="text-[#14B8A6] font-bold">{settings.profitThreshold}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="10"
              value={settings.profitThreshold}
              onChange={(e) => updateSettings({ profitThreshold: Number(e.target.value) })}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#14B8A6]"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>10%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      )}

      {/* Notifications List */}
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <i className="ri-notification-line text-3xl text-gray-600"></i>
            </div>
            <p className="text-gray-400 text-sm">Nenhuma notificação ainda</p>
            <p className="text-gray-500 text-xs mt-1">
              Receberá alertas quando o Cash Out atingir valores favoráveis
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className="p-4 hover:bg-gray-800/50 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getNotificationColor(notification.type)}`}>
                    <i className={`${getNotificationIcon(notification.type)} text-lg`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{notification.message}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500">
                        {formatTime(notification.timestamp)}
                      </span>
                      <span className="text-xs text-[#14B8A6] font-semibold">
                        €{notification.cashOutValue.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => dismissNotification(notification.id)}
                    className="w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white transition-all cursor-pointer"
                  >
                    <i className="ri-close-line"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="border-t border-gray-800 p-3">
          <button
            onClick={clearNotifications}
            className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <i className="ri-delete-bin-line mr-2"></i>
            Limpar todas as notificações
          </button>
        </div>
      )}
    </div>
  );
}

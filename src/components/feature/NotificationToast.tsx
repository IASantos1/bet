
import { useEffect, useState } from 'react';
import { useNotification, Notification } from '../../contexts/NotificationContext';

const iconMap = {
  success: 'ri-checkbox-circle-fill',
  error: 'ri-error-warning-fill',
  warning: 'ri-alert-fill',
  info: 'ri-information-fill',
};

const colorMap = {
  success: {
    bg: 'bg-gradient-to-r from-emerald-500 to-teal-500',
    icon: 'text-white',
    border: 'border-emerald-400',
    glow: 'shadow-emerald-500/30',
  },
  error: {
    bg: 'bg-gradient-to-r from-red-500 to-rose-500',
    icon: 'text-white',
    border: 'border-red-400',
    glow: 'shadow-red-500/30',
  },
  warning: {
    bg: 'bg-gradient-to-r from-amber-500 to-orange-500',
    icon: 'text-white',
    border: 'border-amber-400',
    glow: 'shadow-amber-500/30',
  },
  info: {
    bg: 'bg-gradient-to-r from-blue-500 to-indigo-500',
    icon: 'text-white',
    border: 'border-blue-400',
    glow: 'shadow-blue-500/30',
  },
};

function ToastItem({ notification, onClose }: { notification: Notification; onClose: () => void }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  
  // Garantir que sempre temos cores válidas
  const colors = colorMap[notification.type] || colorMap.info;

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => {
      setIsVisible(true);
    });
  }, []);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(onClose, 300);
  };

  return (
    <div
      className={`
        relative overflow-hidden rounded-xl shadow-2xl ${colors.glow}
        transform transition-all duration-300 ease-out
        ${isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
    >
      {/* Background */}
      <div className={`${colors.bg} p-4`}>
        <div className="flex items-start gap-3">
          {/* Icon with pulse animation for success */}
          <div className="relative">
            <div className={`w-10 h-10 rounded-full bg-white/20 flex items-center justify-center ${notification.type === 'success' ? 'animate-pulse' : ''}`}>
              <i className={`${iconMap[notification.type] || iconMap.info} text-2xl ${colors.icon}`}></i>
            </div>
            {notification.type === 'success' && (
              <div className="absolute inset-0 rounded-full bg-white/30 animate-ping"></div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-white text-base">{notification.title}</h4>
            <p className="text-white/90 text-sm mt-0.5">{notification.message}</p>
          </div>

          {/* Close button */}
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-white text-lg"></i>
          </button>
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10">
          <div
            className="h-full bg-white/50 animate-shrink"
            style={{
              animationDuration: `${notification.duration || 5000}ms`,
            }}
          ></div>
        </div>
      </div>

      {/* Decorative elements for success */}
      {notification.type === 'success' && (
        <>
          <div className="absolute top-2 right-12 w-2 h-2 bg-white/40 rounded-full animate-bounce"></div>
          <div className="absolute top-4 right-16 w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="absolute top-1 right-20 w-1 h-1 bg-white/20 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </>
      )}
    </div>
  );
}

export default function NotificationToast() {
  const { notifications, removeNotification } = useNotification();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-3 max-w-sm w-full">
      {notifications.map(notification => (
        <ToastItem
          key={notification.id}
          notification={notification}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
}

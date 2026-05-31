import { useEffect, useState } from 'react';

interface ApiLimitEvent {
  api: string;
  message: string;
}

export default function ApiLimitNotification() {
  const [notification, setNotification] = useState<ApiLimitEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleApiLimit = (event: Event) => {
      const customEvent = event as CustomEvent<ApiLimitEvent>;
      setNotification(customEvent.detail);
      setIsVisible(true);

      // Auto-hide após 8 segundos
      setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => setNotification(null), 300);
      }, 8000);
    };

    window.addEventListener('api-limit-reached', handleApiLimit);

    return () => {
      window.removeEventListener('api-limit-reached', handleApiLimit);
    };
  }, []);

  if (!notification) return null;

  return (
    <div
      className={`fixed top-20 right-4 z-50 max-w-md transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div className="bg-amber-50 border-l-4 border-amber-500 rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
            <i className="ri-alert-line text-xl text-amber-600"></i>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-amber-900 mb-1">
              Limite de API Atingido
            </h4>
            <p className="text-sm text-amber-800">
              {notification.message}
            </p>
            <p className="text-xs text-amber-700 mt-2">
              Os dados continuam disponíveis através de fontes alternativas.
            </p>
          </div>
          <button
            onClick={() => setIsVisible(false)}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-amber-600 hover:text-amber-800 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>
      </div>
    </div>
  );
}

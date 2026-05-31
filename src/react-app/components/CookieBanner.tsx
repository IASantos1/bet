import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/react-app/contexts/AppContext';

export const CookieBanner: React.FC = () => {
  const { darkMode } = useApp();
  const [show, setShow] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const accepted = localStorage.getItem('cookies_accepted');
    if (!accepted) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const acceptAll = () => {
    localStorage.setItem('cookie_analytics', 'true');
    localStorage.setItem('cookie_functional', 'true');
    localStorage.setItem('cookie_marketing', 'true');
    localStorage.setItem('cookies_accepted', 'true');
    setShow(false);
    // Dispatch event to notify other components (like ProfilePage) if they are listening, 
    // though ProfilePage reads from localStorage on mount/update so a reload might be needed to reflect immediately if open, 
    // but usually user is navigating.
    window.dispatchEvent(new Event('storage'));
  };

  const rejectNonEssential = () => {
    localStorage.setItem('cookie_analytics', 'false');
    localStorage.setItem('cookie_functional', 'false');
    localStorage.setItem('cookie_marketing', 'false');
    localStorage.setItem('cookies_accepted', 'true');
    setShow(false);
    window.dispatchEvent(new Event('storage'));
  };

  const manage = () => {
    navigate('/profile?tab=Definições de cookies');
  };

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-[200] p-4 border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] ${darkMode ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-bold mb-2">Este site utiliza cookies</h3>
          <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mb-2`}>
            Utilizamos cookies essenciais para o funcionamento do site e cookies opcionais para melhorar a experiência do utilizador. 
            Pode aceitar todos os cookies ou gerir as suas preferências a qualquer momento.
          </p>
          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            ✔️ Nota importante: Cookies essenciais não podem ser rejeitados (isso é permitido pelo RGPD).
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
          <button 
            onClick={acceptAll}
            className="w-full sm:w-auto px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-medium text-sm whitespace-nowrap transition-colors"
          >
            ✅ Aceitar todos
          </button>
          <button 
            onClick={rejectNonEssential}
            className={`w-full sm:w-auto px-4 py-2 rounded border font-medium text-sm whitespace-nowrap transition-colors ${darkMode ? 'border-gray-600 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-50'}`}
          >
            ❌ Rejeitar não essenciais
          </button>
          <button 
            onClick={manage}
            className={`w-full sm:w-auto px-4 py-2 rounded font-medium text-sm whitespace-nowrap transition-colors flex items-center justify-center gap-1 ${darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
          >
            ⚙️ Gerir cookies
          </button>
        </div>
      </div>
    </div>
  );
};

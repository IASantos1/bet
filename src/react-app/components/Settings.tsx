
import { useApp } from '@/react-app/contexts/AppContext';

export function Settings() {
  const { darkMode, addNotification } = useApp();
  const clearFrontendOdds = () => {
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (
          k === 'odds_sport' ||
          k.startsWith('event_markets_') ||
          k.startsWith('event_odds_') ||
          k.startsWith('event_roster_') ||
          k.startsWith('odds_cache_')
        ) {
          try { localStorage.removeItem(k); } catch { /* no-op */ }
        }
      }
      addNotification({ type: 'success', message: 'Odds do frontend limpas' });
    } catch {
      addNotification({ type: 'error', message: 'Falha ao limpar odds do frontend' });
    }
  };

  return (
    <div className={`p-4 ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}>
      <h2 className="text-lg font-semibold mb-4">Configurações</h2>
      <div className="text-sm">Nenhuma integração legada ativa.</div>
      <div className="mt-4">
        <button onClick={clearFrontendOdds} className={`${darkMode ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'} px-3 py-2 rounded`}>
          Limpar odds do front
        </button>
      </div>
    </div>
  );
}

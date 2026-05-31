import { useState, useEffect } from "react";
import { useApp } from '@/react-app/contexts/AppContext';

export function InstallBar() {
  const { darkMode, addNotification } = useApp();
  const [installable, setInstallable] = useState(false);
  const [prompting, setPrompting] = useState(false);
  useEffect(() => {
    const onBIP = (e: any) => { e.preventDefault(); (window as any).__bip = e; setInstallable(true); };
    const onInstalled = () => { setInstallable(false); addNotification({ type: 'success', message: 'Aplicação instalada' }); };
    window.addEventListener('beforeinstallprompt', onBIP as any);
    window.addEventListener('appinstalled', onInstalled as any);
    return () => { window.removeEventListener('beforeinstallprompt', onBIP as any); window.removeEventListener('appinstalled', onInstalled as any); };
  }, []);
  if (!installable) return null;
  return (
    <div className={`w-full ${darkMode ? 'bg-green-800 text-green-100' : 'bg-green-200 text-green-800'} px-4 py-2 text-sm flex items-center justify-between`}>
      <span>Instale o app no seu dispositivo</span>
      <button
        onClick={async () => {
          try {
            setPrompting(true);
            const ev = (window as any).__bip;
            if (!ev) { addNotification({ type: 'error', message: 'Instalação indisponível' }); setPrompting(false); return }
            await ev.prompt();
            const choice = await ev.userChoice;
            if (choice && choice.outcome === 'accepted') addNotification({ type: 'success', message: 'Instalação iniciada' });
            else addNotification({ type: 'error', message: 'Instalação cancelada' });
          } catch { addNotification({ type: 'error', message: 'Erro ao instalar' }); }
          finally { setPrompting(false); }
        }}
        disabled={prompting}
        className={`${darkMode ? 'bg-gray-900 text-white' : 'bg-green-300 text-green-900'} px-3 py-1 rounded disabled:opacity-50`}
      >Instalar</button>
    </div>
  );
}

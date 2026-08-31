import { useState, useEffect } from "react";
import { useApp } from '@/react-app/contexts/AppContext';

const IOS_DISMISS_KEY = 'bet62_ios_install_dismissed';

function isStandalone(): boolean {
  try {
    return (
      (window.navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    );
  } catch {
    return false;
  }
}

/** Safari on iOS/iPadOS never fires beforeinstallprompt — "Add to Home Screen" only exists
 *  behind the native Share sheet, so the best a web app can do is point the user at it. */
function isIosSafari(): boolean {
  try {
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return isIos && isSafari;
  } catch {
    return false;
  }
}

export function InstallBar() {
  const { darkMode, addNotification } = useApp();
  const [installable, setInstallable] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    const onBIP = (e: any) => { e.preventDefault(); (window as any).__bip = e; setInstallable(true); };
    const onInstalled = () => { setInstallable(false); addNotification({ type: 'success', message: 'Aplicação instalada' }); };
    window.addEventListener('beforeinstallprompt', onBIP as any);
    window.addEventListener('appinstalled', onInstalled as any);

    if (!isStandalone() && isIosSafari()) {
      try {
        if (!localStorage.getItem(IOS_DISMISS_KEY)) setShowIosHint(true);
      } catch { setShowIosHint(true); }
    }

    return () => { window.removeEventListener('beforeinstallprompt', onBIP as any); window.removeEventListener('appinstalled', onInstalled as any); };
  }, []);

  const dismissIosHint = () => {
    setShowIosHint(false);
    try { localStorage.setItem(IOS_DISMISS_KEY, '1'); } catch { /* empty */ }
  };

  if (installable) {
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

  if (showIosHint) {
    return (
      <div className={`w-full ${darkMode ? 'bg-green-800 text-green-100' : 'bg-green-200 text-green-800'} px-4 py-2 text-sm flex items-center justify-between gap-3`}>
        <span>
          Instale o app: toque em <span className="font-semibold">Partilhar</span> <span aria-hidden="true">⎋</span> e depois em <span className="font-semibold">Adicionar ao Ecrã Principal</span>
        </span>
        <button
          onClick={dismissIosHint}
          className={`shrink-0 ${darkMode ? 'bg-gray-900 text-white' : 'bg-green-300 text-green-900'} px-3 py-1 rounded`}
        >Entendi</button>
      </div>
    );
  }

  return null;
}

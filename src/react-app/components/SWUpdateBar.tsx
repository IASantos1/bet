import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp } from '@/react-app/contexts/AppContext';

export function SWUpdateBar() {
  const { darkMode, addNotification } = useApp();
  const [ready, setReady] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined;
    if (!sw) return;

    let reg: ServiceWorkerRegistration | undefined;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const onUpdateFound = () => {
      const installing = reg?.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        // A new worker reaching 'installed' while one already controls the page means it's
        // waiting to activate — i.e. an update is ready, same signal as the initial check below.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) setReady(true);
      });
    };

    const check = async () => {
      reg = (window as any).swRegistration || (await sw.getRegistration().catch(() => undefined));
      if (!reg) return;
      if (reg.waiting) setReady(true);
      reg.addEventListener('updatefound', onUpdateFound);
      // Long-lived open tabs (this is a betting app people leave open) wouldn't otherwise learn
      // about a new deploy until they manually reload — ask the browser to re-check periodically.
      intervalId = setInterval(() => { reg?.update().catch(() => void 0); }, 30 * 60_000);
    };
    check();

    const onController = () => { setUpdating(false); setReady(false); location.reload(); };
    sw.addEventListener('controllerchange', onController);
    return () => {
      sw.removeEventListener('controllerchange', onController);
      reg?.removeEventListener('updatefound', onUpdateFound);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);
  if (!ready) return null;
  return (
    <div className={`w-full ${darkMode ? 'bg-yellow-800 text-yellow-100' : 'bg-yellow-200 text-yellow-800'} px-4 py-2 text-sm flex items-center justify-between`}>
      <span>Atualização disponível</span>
      <button
        onClick={() => setConfirm(true)}
        disabled={updating}
        className={`${darkMode ? 'bg-gray-900 text-white' : 'bg-yellow-300 text-yellow-900'} px-3 py-1 rounded disabled:opacity-50`}
      >Atualizar</button>
      {confirm && createPortal(
        <div className={`fixed inset-0 ${darkMode ? 'bg-black/60' : 'bg-black/40'} flex items-center justify-center z-50`}>
          <div className={`rounded-xl p-4 w-[320px] ${darkMode ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-200'}`}>
            <div className="text-sm font-semibold mb-3">Aplicar atualização agora?</div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirm(false)} className={`${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-900'} px-3 py-1 rounded`}>Cancelar</button>
              <button
                onClick={() => {
                  try {
                    setUpdating(true);
                    const reg = (window as any).swRegistration as ServiceWorkerRegistration | undefined;
                    const w = reg?.waiting;
                    if (w) w.postMessage({ type: 'SKIP_WAITING' });
                    else addNotification({ type: 'error', message: 'Falha ao atualizar' });
                  } catch { addNotification({ type: 'error', message: 'Erro ao atualizar' }); }
                  finally { setConfirm(false); }
                }}
                disabled={updating}
                className={`px-3 py-1 rounded ${darkMode ? 'bg-red-600 text-white' : 'bg-red-600 text-white'} disabled:opacity-50`}
              >Aplicar</button>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
}

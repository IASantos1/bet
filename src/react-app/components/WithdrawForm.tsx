import React, { useState, useEffect } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';
import { COUNTRIES, DEFAULT_IBAN_PLACEHOLDER } from '@/shared/constants';

export function WithdrawForm() {
  const { addNotification, user } = useApp();
  
  // Withdraw State
  const [withdrawAmount, setWithdrawAmount] = useState<number>(10);
  const [hasIban, setHasIban] = useState<boolean | null>(null); // null = loading
  const [savedIban, setSavedIban] = useState<string>('');
  const [savedHolder, setSavedHolder] = useState<string>('');
  const [newIban, setNewIban] = useState('');
  const [holderName, setHolderName] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  // Get user country IBAN placeholder
  const userCountry = COUNTRIES.find(c => c.code === user?.country);
  const ibanPlaceholder = userCountry?.ibanPrefix ? `${userCountry.ibanPrefix}...` : DEFAULT_IBAN_PLACEHOLDER;

  // Check IBAN on mount
  useEffect(() => {
    if (user) {
      apiFetch<any>('/api/users/iban')
        .then((data) => {
          if (data.has_iban) {
            setHasIban(true);
            setSavedIban(data.iban_masked);
            setSavedHolder(data.holder_name);
          } else {
            setHasIban(false);
          }
        })
        .catch(() => setHasIban(false));
    }
  }, [user]);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (withdrawAmount < 10) return addNotification({ type: 'error', message: 'Mínimo €10' });
    if (!hasIban && (!newIban || !holderName)) return addNotification({ type: 'error', message: 'Preencha o IBAN e Titular' });

    setWithdrawLoading(true);
    try {
      const payload: any = { amount: withdrawAmount };
      if (!hasIban) {
        payload.iban = newIban;
        payload.holder_name = holderName;
      }

      const data = await apiFetch<{ iban?: string, message?: string, id?: string }>('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Idempotency-Key': `wd-${Date.now()}-${Math.random().toString(36).slice(2)}` },
        body: JSON.stringify({ ...payload, method: 'SEPA' })
      });

      addNotification({ type: 'success', message: data.message || 'Levantamento solicitado com sucesso!' });
      if (!hasIban) {
            setHasIban(true);
            setSavedIban(data.iban || newIban); // Backend might return masked
            setSavedHolder(holderName);
      }
    } catch (err: any) {
      addNotification({ type: 'error', message: err?.message || 'Erro ao solicitar levantamento' });
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleSaveIban = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIban || !holderName) return addNotification({ type: 'error', message: 'Preencha todos os campos' });
    setWithdrawLoading(true);
    try {
        const data = await apiFetch<any>('/api/users/iban', {
            method: 'POST',
            body: JSON.stringify({ iban: newIban, holder_name: holderName })
        });
        
        addNotification({ type: 'success', message: 'IBAN guardado com sucesso' });
        setHasIban(true);
        setSavedIban(data.iban);
        setSavedHolder(holderName);
    } catch (err: any) {
        addNotification({ type: 'error', message: err.message || 'Erro ao guardar IBAN' });
    } finally {
        setWithdrawLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-3">
           <span className="text-green-600 font-bold text-xl">€</span>
        </div>
        <h3 className="text-xl font-bold">Transferência Bancária</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">1-2 dias úteis</p>
      </div>

      {hasIban === null ? (
        <div className="text-center py-4">A carregar...</div>
      ) : !hasIban ? (
        <form onSubmit={handleSaveIban} className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200 mb-4">
                Este IBAN ficará associado à sua conta para futuros levantamentos.
            </div>
            <div>
                <label className="block text-sm font-medium mb-2">IBAN</label>
                <input
                type="text"
                value={newIban}
                onChange={(e) => setNewIban(e.target.value.toUpperCase())}
                placeholder={ibanPlaceholder}
                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                required
                />
            </div>

            <div>
                <label className="block text-sm font-medium mb-2">Nome do Titular</label>
                <input
                type="text"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                placeholder="Nome completo"
                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent focus:ring-2 focus:ring-blue-500 outline-none"
                required
                />
            </div>

            <button
                type="submit"
                disabled={withdrawLoading}
                className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {withdrawLoading ? 'A guardar...' : 'Guardar IBAN'}
            </button>
        </form>
      ) : user?.kyc_status !== 'verified' ? (
        <div className="text-center py-8 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="text-lg font-bold text-orange-800 dark:text-orange-200 mb-2">Verificação Necessária</h3>
            <p className="text-sm text-orange-700 dark:text-orange-300 mb-4 px-4">
                Para garantir a segurança da sua conta e cumprir com a regulação, precisamos de validar a sua identidade antes do primeiro levantamento.
            </p>
            <a 
              href="/profile?tab=Documentos"
              className="inline-block bg-orange-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-orange-700 transition-colors"
            >
                Enviar Documentos
            </a>
        </div>
      ) : (
        <form onSubmit={handleWithdraw} className="space-y-6">
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">Conta Destino</div>
              <div className="font-mono text-lg">{savedIban}</div>
              <div className="text-sm text-gray-500">{savedHolder}</div>
              </div>
              <div className="text-green-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Valor a levantar (€)</label>
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(Number(e.target.value))}
              className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent focus:ring-2 focus:ring-blue-500 outline-none"
              min="10"
            />
            <p className="text-xs text-gray-500 mt-1">Mínimo: €10.00</p>
          </div>

          <button
            type="submit"
            disabled={withdrawLoading}
            className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {withdrawLoading ? 'A processar...' : 'Confirmar Saque'}
          </button>
        </form>
      )}
    </div>
  );
}

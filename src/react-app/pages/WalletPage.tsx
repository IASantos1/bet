import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';

interface Wallet { currency: string; balance: number }
interface Transaction { id: string; type: string; status: string; amount: number; currency: string; created_at: string; metadata?: string }

const WalletPage: React.FC = () => {
  const { darkMode, addNotification, user } = useApp();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [amount, setAmount] = useState('');
  const [iban, setIban] = useState('');
  const [holderName, setHolderName] = useState('');
  const [nif, setNif] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    const loadData = async () => {
      if (!user) return;
      try {
        const [wb, tx] = await Promise.all([
          apiFetch<Wallet[]>('/api/wallet/balances', { signal: ac.signal }),
          apiFetch<Transaction[]>('/api/wallet/transactions', { signal: ac.signal })
        ]);
        setWallets(wb);
        setTransactions(tx);
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (/Abort|ERR_ABORTED|ERR_CANCELED/i.test(msg)) return;
        setWallets([]);
        setTransactions([]);
      }
    };
    loadData();
    return () => { ac.abort('dev-strict'); };
  }, [user]);

  useEffect(() => {
    const ac = new AbortController();
    const load2fa = async () => {
      if (!user) { setTwoFactorEnabled(false); return; }
      try {
        const d = await apiFetch<{ enabled?: boolean }>('/api/auth/2fa/status', { signal: ac.signal });
        if (d) {
          setTwoFactorEnabled(Boolean(d.enabled));
        } else {
          setTwoFactorEnabled(false);
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (/Abort|ERR_ABORTED|ERR_CANCELED/i.test(msg)) return;
        setTwoFactorEnabled(false);
      }
    };
    load2fa();
    return () => { ac.abort('dev-strict'); };
  }, [user]);



  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      addNotification({ type: 'warning', message: 'Faça login para efetuar saques' });
      return;
    }
    const value = parseFloat(amount);
    const validIban = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/i.test(iban.replace(/\s+/g, ''));
    const validName = holderName.trim().length >= 3;
    const validNif = /^\d{9}$/.test(nif);
    if (isNaN(value) || value <= 0 || !validIban || !validName || !validNif || (twoFactorEnabled && !/^\d{6}$/.test(twoFactorCode)) || !acceptTerms) {
      addNotification({ type: 'warning', message: 'Preencha os dados de levantamento corretamente' });
      return;
    }
    setConfirmOpen(true);
  };

  const confirmWithdrawal = async () => {
    const value = parseFloat(amount);
    setLoading(true);
    try {
      await apiFetch('/api/wallet/withdrawals', {
        method: 'POST',
        body: JSON.stringify({ amount_eur: value, iban, holder_name: holderName, nif, two_factor_code: twoFactorCode }),
      });

      addNotification({ type: 'success', message: 'Solicitação de levantamento criada' });
      
      const refresh = await apiFetch<Transaction[]>('/api/wallet/transactions').catch(() => null);
      if (refresh) setTransactions(refresh);

      const wb = await apiFetch<Wallet[]>('/api/wallet/balances').catch(() => null);
      if (wb) setWallets(wb);

      setAmount('');
      setIban('');
      setHolderName('');
      setNif('');
      setTwoFactorCode('');
      setAcceptTerms(false);
    } catch (err: any) {
      addNotification({ type: 'error', message: err?.message || 'Falha ao criar solicitação' });
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };


  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="container mx-auto p-4">
      <h1 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Carteira</h1>

      <div className="mb-8">
        <h2 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Saldo</h2>
        <div className="grid grid-cols-1 gap-4">
          {wallets.map((wallet) => (
            <div key={wallet.currency} className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{wallet.currency}</p>
              <p className={`${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{wallet.balance.toFixed(2)}</p>
            </div>
          ))}
          {wallets.length === 0 && (
            <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-700'}`}>Sem saldos disponíveis</div>
          )}
        </div>
      </div>


      <div className="mb-8">
        <h2 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Levantamento</h2>
        <form onSubmit={handleWithdraw} className={`p-4 rounded-lg border space-y-3 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div>
            <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Valor (EUR)</label>
            <input type="number" min="20" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`mt-1 w-full px-3 py-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} required />
          </div>
          <div>
            <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>IBAN</label>
            <input value={iban} onChange={(e) => setIban(e.target.value)} className={`mt-1 w-full px-3 py-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Titular</label>
              <input value={holderName} onChange={(e) => setHolderName(e.target.value)} className={`mt-1 w-full px-3 py-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
            </div>
            <div>
              <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>NIF</label>
              <input value={nif} onChange={(e) => setNif(e.target.value)} className={`mt-1 w-full px-3 py-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
            </div>
          </div>
          {twoFactorEnabled && (
            <div>
              <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Código 2FA</label>
              <input value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} maxLength={6} className={`mt-1 w-full px-3 py-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
            <span className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Aceito os termos do levantamento</span>
          </div>
          <button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50">{loading ? 'Processando...' : 'Solicitar Levantamento'}</button>
        </form>
        {confirmOpen && createPortal(
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmOpen(false)} />
            <div className={`${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'} fixed top-[calc(50%+60px)] left-1/2 -translate-x-1/2 w-[92vw] max-w-[420px] p-6 rounded-lg shadow-xl`}>
              <h3 className={`${darkMode ? 'text-white' : 'text-gray-900'} text-lg font-bold mb-4`}>Confirmar levantamento</h3>
              <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} space-y-2`}>
                <div>Valor: €{parseFloat(amount || '0').toFixed(2)}</div>
                <div>IBAN: {iban}</div>
                <div>Titular: {holderName}</div>
                <div>NIF: {nif}</div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setConfirmOpen(false)} className={`px-3 py-2 rounded ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800'}`}>Cancelar</button>
                <button onClick={confirmWithdrawal} disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50">{loading ? '...' : 'Confirmar'}</button>
              </div>
            </div>
          </div>, document.body
        )}
      </div>

      <div>
        <h2 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Histórico de Transações</h2>
        <div className={`overflow-x-auto rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <table className="min-w-full">
            <thead>
              <tr className={`${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                <th className="py-2 px-4 text-left">Data</th>
                <th className="py-2 px-4 text-left">Tipo</th>
                <th className="py-2 px-4 text-left">Status</th>
                <th className="py-2 px-4 text-left">Valor</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className={`${darkMode ? 'border-t border-gray-700' : 'border-t border-gray-200'}`}>
                  <td className={`py-2 px-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{new Date(tx.created_at).toLocaleString()}</td>
                  <td className={`py-2 px-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{tx.type}</td>
                  <td className={`py-2 px-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{tx.status}</td>
                  <td className={`py-2 px-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{tx.amount.toFixed(2)} {tx.currency}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td className={`py-4 px-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`} colSpan={4}>Sem transações</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
};

export default WalletPage;

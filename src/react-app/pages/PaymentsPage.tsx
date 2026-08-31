import { useState } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';

const QUICK_AMOUNTS = [10, 25, 50, 100, 200, 500];
const MIN_DEPOSIT = 10;

export default function PaymentsPage() {
  const { darkMode, user, openAuthModal } = useApp();
  const [amount, setAmount] = useState('25');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const numAmount = parseFloat(amount) || 0;

  const handleQuickAmount = (v: number) => {
    setAmount(String(v));
    setError('');
  };

  const handleDeposit = async () => {
    if (numAmount < MIN_DEPOSIT) {
      setError(`Valor mínimo: €${MIN_DEPOSIT.toFixed(2)}`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ url: string }>('/api/wallet/deposit/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({ amount: numAmount }),
      });
      if (!res.url) throw new Error('Não foi possível iniciar o pagamento.');
      window.location.href = res.url;
    } catch (err: any) {
      const msg = String(err?.message || '');
      setError(/401|Unauthorized/i.test(msg) ? 'Sessão expirada. Faça login novamente.' : msg || 'Erro ao iniciar o depósito');
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className={`max-w-md mx-auto text-center py-16 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
        <div className="text-5xl mb-4">🔐</div>
        <h2 className="text-xl font-bold mb-2">Sessão necessária</h2>
        <p className={`text-sm mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tem de iniciar sessão para fazer um depósito.</p>
        <button
          onClick={() => openAuthModal('login')}
          className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition-colors"
        >
          Entrar na conta
        </button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-4 md:p-8 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className={`max-w-md mx-auto rounded-2xl shadow-xl overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold text-center">💰 Depositar</h2>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Valor do Depósito (€)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError('');
              }}
              min={MIN_DEPOSIT}
              step="5"
              className={`w-full p-3 rounded-lg border focus:ring-2 focus:ring-red-500 outline-none text-lg font-bold ${
                darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'
              } ${error ? 'border-red-500' : ''}`}
              placeholder="25"
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
            <div className="grid grid-cols-3 gap-2 mt-3">
              {QUICK_AMOUNTS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleQuickAmount(v)}
                  className={`py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    numAmount === v ? 'bg-red-600 text-white' : darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  €{v}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleDeposit}
            disabled={loading || numAmount < MIN_DEPOSIT}
            className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> A processar...
              </>
            ) : (
              `💳 Pagar €${numAmount.toFixed(2)} com Cartão`
            )}
          </button>
          <p className={`text-center text-xs ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>🔒 Pagamento seguro processado pela Stripe. Será redirecionado para confirmar.</p>
        </div>
      </div>
    </div>
  );
}

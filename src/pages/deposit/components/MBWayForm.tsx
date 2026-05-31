
import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { apiFetch } from '../../../services/backendClient';
import { useNavigate } from 'react-router-dom';

interface MBWayFormProps {
  amount?: number;
  onSubmit?: (phone: string) => void;
  onSuccess?: () => void;
  loading?: boolean;
}

export default function MBWayForm({
  amount: propAmount,
  onSubmit,
  onSuccess,
  loading: _externalLoading,
}: MBWayFormProps) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('idle');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initialBalance, setInitialBalance] = useState<number | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      setIsAuthenticated(true);
    } else {
      setError('Sessão expirada. A redirecionar para login...');
      setTimeout(() => navigate('/login'), 2000);
    }
  }, [user, navigate]);

  useEffect(() => {
    if (paymentStatus !== 'pending' || initialBalance == null) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      const wallet = await apiFetch('/wallet', { method: 'GET' });
      const currentBalance = Number(wallet?.balance ?? 0);
      if (!cancelled && currentBalance > initialBalance) {
        setSuccess('Pagamento MB WAY confirmado! Saldo atualizado.');
        setPaymentStatus('idle');
        clearInterval(interval);
      }
    }, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [paymentStatus, initialBalance]);

  const startMbWayPayment = async (depositAmount: number) => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (!user) throw new Error('Sessão expirada. Por favor, faça login novamente.');
      if (isNaN(depositAmount) || depositAmount < 10) throw new Error('Valor mínimo de depósito é €10');
      if (depositAmount > 10000) throw new Error('Valor máximo de depósito é €10.000');

      const wallet = await apiFetch('/wallet', { method: 'GET' });
      const startBalance = Number(wallet?.balance ?? 0);
      setInitialBalance(startBalance);

      if (typeof onSubmit === 'function') onSubmit('');

      const response = await apiFetch('/payments/mbway', {
        method: 'POST',
        body: JSON.stringify({ amount: depositAmount }),
      });

      if (!response?.ok) throw new Error(response?.error || 'Erro ao iniciar pagamento MB WAY');

      setSuccess('📱 Pedido MB WAY criado. Confirme o pagamento na app MB WAY.');
      setPaymentStatus('pending');
      if (typeof onSuccess === 'function') onSuccess();
    } catch (err: any) {
      const msg = String(err?.message || 'Erro ao processar pagamento');
      if (msg.includes('Sessão expirada') || msg.includes('login novamente')) {
        setError(`${msg} Redirecionando...`);
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setError(msg);
      }
      setPaymentStatus('idle');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const depositAmount = propAmount ?? parseFloat(amount);
    await startMbWayPayment(depositAmount);
  };

  useEffect(() => {
    if (!propAmount || !isAuthenticated || loading) return;
    startMbWayPayment(propAmount);
  }, [propAmount, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-xl text-center">
        <i className="ri-lock-line text-3xl text-yellow-600 mb-2"></i>
        <p className="text-sm text-yellow-800 font-medium">A verificar sessão...</p>
      </div>
    );
  }

  if (propAmount) {
    return (
      <div className="space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {success && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm text-green-700">{success}</p>
            {paymentStatus === 'pending' && (
              <div className="mt-3 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs text-green-600">A aguardar confirmação...</span>
              </div>
            )}
          </div>
        )}
        {loading && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-700">A preparar pagamento MB WAY...</p>
          </div>
        )}
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <i className="ri-information-line text-teal-500"></i>
            Como funciona o MB WAY
          </h4>
          <ul className="text-xs text-gray-500 space-y-1 ml-6">
            <li>• Receberá uma notificação na app MB WAY</li>
            <li>• Confirme o pagamento no telemóvel</li>
            <li>• O saldo será creditado automaticamente na carteira</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Valor do Depósito</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">€</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10.00"
            min="10"
            max="10000"
            step="0.01"
            required
            disabled={loading || paymentStatus !== 'idle'}
            className="w-full pl-10 pr-4 py-3.5 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-200 focus:border-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          />
        </div>
        <p className="mt-2 text-xs text-gray-400">Valor mínimo: €10.00 | Máximo: €10.000</p>
      </div>
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-sm text-green-700">{success}</p>
          {paymentStatus === 'pending' && (
            <div className="mt-3 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs text-green-600">A aguardar confirmação...</span>
            </div>
          )}
        </div>
      )}
      <button
        type="submit"
        disabled={loading || paymentStatus !== 'idle'}
        className="w-full py-4 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
      >
        {loading ? (
          <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>A processar...</span></>
        ) : paymentStatus === 'pending' ? (
          <><i className="ri-smartphone-line text-lg"></i><span>Aguardando confirmação...</span></>
        ) : (
          <><i className="ri-smartphone-line text-lg"></i><span>Pagar com MB WAY</span></>
        )}
      </button>
    </form>
  );
}

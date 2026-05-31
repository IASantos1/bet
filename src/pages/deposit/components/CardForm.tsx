
import PropTypes from 'prop-types';
import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { apiFetch } from '../../../services/backendClient';

interface CardFormProps {
  amount: number;
  onSubmit: () => void;
  loading?: boolean;
}

export default function CardForm({ amount, onSubmit, loading: externalLoading }: CardFormProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { setError('Sessão expirada. Faça login novamente.'); return; }
    setError('');
    setLoading(true);
    try {
      await apiFetch('/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          payment_method: 'card',
          description: `Depósito via cartão - €${amount.toFixed(2)}`,
        }),
      });
      setSuccess(true);
      onSubmit();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao processar pagamento');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
          <i className="ri-checkbox-circle-fill text-3xl text-green-600"></i>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Pagamento Confirmado!</h3>
        <p className="text-sm text-gray-600 mb-4">O teu depósito de €{amount.toFixed(2)} foi processado com sucesso.</p>
        <p className="text-xs text-gray-500">O saldo será atualizado em instantes.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-100 shrink-0">
            <i className="ri-bank-card-line text-blue-600 text-lg"></i>
          </div>
          <div>
            <p className="font-semibold text-blue-900 text-sm mb-1">Pagamento Seguro por Cartão</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              Visa, Mastercard. Transação 100% segura e encriptada.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
        <p className="text-sm text-gray-600">Valor: <span className="font-bold text-gray-900">€{amount.toFixed(2)}</span></p>
      </div>

      <button
        type="submit"
        disabled={loading || externalLoading}
        className="w-full py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>A processar...</span></>
        ) : (
          <><i className="ri-bank-card-line text-lg"></i><span>Pagar €{amount.toFixed(2)} com Cartão</span></>
        )}
      </button>
    </form>
  );
}

CardForm.propTypes = {
  amount: PropTypes.number.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool,
};

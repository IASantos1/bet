import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../services/backendClient';

export default function PaymentConfirmationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<'checking' | 'success' | 'failed' | 'timeout'>('checking');
  const [amount, setAmount] = useState<number>(0);
  const [attempts, setAttempts] = useState(0);
  const maxAttempts = 60; // 60 tentativas = 2 minutos

  const transactionId = searchParams.get('transaction_id');
  const paymentMethod = searchParams.get('method') || 'MB WAY';

  const checkPaymentStatus = useCallback(async () => {
    if (!transactionId || attempts >= maxAttempts) {
      setStatus('timeout');
      return;
    }

    try {
      const resp = await apiFetch('/transactions', { method: 'GET' });
      const list = resp.transactions || [];
      const transaction = list.find((t: any) => String(t.id) === String(transactionId));

      if (!transaction) {
        setStatus('failed');
        return;
      }

      setAmount(Number(transaction.amount || 0));

      if (transaction.status === 'completed') {
        setStatus('success');
        setTimeout(() => {
          navigate('/carteira');
        }, 3000);
        return;
      }

      if (transaction.status === 'failed' || transaction.status === 'cancelled') {
        setStatus('failed');
        return;
      }

      setAttempts(prev => prev + 1);
      setTimeout(checkPaymentStatus, 2000);
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      setAttempts(prev => prev + 1);
      setTimeout(checkPaymentStatus, 2000);
    }
  }, [transactionId, attempts, maxAttempts, navigate]);

  useEffect(() => {
    if (!transactionId || !user) {
      navigate('/deposito');
      return;
    }

    checkPaymentStatus();
  }, [transactionId, user, navigate, checkPaymentStatus]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Card Principal */}
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* Ícone Animado */}
          <div className="mb-6">
            {status === 'checking' && (
              <div className="relative inline-block">
                <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
                  <i className="ri-smartphone-line text-4xl text-white"></i>
                </div>
                <div className="absolute inset-0 w-24 h-24 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            )}

            {status === 'success' && (
              <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto animate-bounce">
                <i className="ri-check-line text-5xl text-white"></i>
              </div>
            )}

            {status === 'failed' && (
              <div className="w-24 h-24 bg-gradient-to-br from-red-400 to-rose-500 rounded-full flex items-center justify-center mx-auto">
                <i className="ri-close-line text-5xl text-white"></i>
              </div>
            )}

            {status === 'timeout' && (
              <div className="w-24 h-24 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto">
                <i className="ri-time-line text-5xl text-white"></i>
              </div>
            )}
          </div>

          {/* Título e Mensagem */}
          {status === 'checking' && (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-3">
                Aguardando Confirmação
              </h1>
              <p className="text-gray-600 mb-6">
                Por favor, confirme o pagamento de <span className="font-bold text-emerald-600">€{amount.toFixed(2)}</span> na aplicação {paymentMethod}
              </p>
              <div className="bg-emerald-50 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <i className="ri-information-line text-xl text-emerald-600 mt-0.5"></i>
                  <div className="text-left text-sm text-gray-700">
                    <p className="font-semibold mb-1">Passos para confirmar:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Abra a aplicação {paymentMethod}</li>
                      <li>Verifique a notificação de pagamento</li>
                      <li>Confirme o pagamento</li>
                    </ol>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span>A verificar automaticamente...</span>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <h1 className="text-2xl font-bold text-green-600 mb-3">
                Pagamento Confirmado!
              </h1>
              <p className="text-gray-600 mb-6">
                <span className="font-bold text-green-600">€{amount.toFixed(2)}</span> foram adicionados à sua carteira
              </p>
              <div className="bg-green-50 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-center gap-2 text-green-700">
                  <i className="ri-check-double-line text-xl"></i>
                  <span className="text-sm font-medium">Transação processada com sucesso</span>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                A redirecionar para a carteira...
              </p>
            </>
          )}

          {status === 'failed' && (
            <>
              <h1 className="text-2xl font-bold text-red-600 mb-3">
                Pagamento Não Confirmado
              </h1>
              <p className="text-gray-600 mb-6">
                O pagamento não foi confirmado. Por favor, tente novamente.
              </p>
              <div className="bg-red-50 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-center gap-2 text-red-700">
                  <i className="ri-error-warning-line text-xl"></i>
                  <span className="text-sm font-medium">Transação cancelada ou falhou</span>
                </div>
              </div>
              <button
                onClick={() => navigate('/deposito')}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-700 transition-all"
              >
                Tentar Novamente
              </button>
            </>
          )}

          {status === 'timeout' && (
            <>
              <h1 className="text-2xl font-bold text-amber-600 mb-3">
                Tempo Esgotado
              </h1>
              <p className="text-gray-600 mb-6">
                Não conseguimos confirmar o pagamento. Verifique a sua aplicação {paymentMethod}.
              </p>
              <div className="bg-amber-50 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <i className="ri-time-line text-xl text-amber-600 mt-0.5"></i>
                  <div className="text-left text-sm text-gray-700">
                    <p className="mb-2">O pagamento pode ainda estar a ser processado.</p>
                    <p className="font-medium">Verifique a sua carteira em alguns minutos.</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/carteira')}
                  className="flex-1 bg-black text-white py-3 rounded-xl font-semibold hover:bg-neutral-900 transition-all"
                >
                  Ver Carteira
                </button>
                <button
                  onClick={() => navigate('/deposito')}
                  className="flex-1 bg-gradient-to-r from-red-600 to-red-700 text-white py-3 rounded-xl font-semibold hover:from-red-700 hover:to-red-800 transition-all"
                >
                  Novo Depósito
                </button>
              </div>
            </>
          )}
        </div>

        {/* Botão Cancelar (apenas quando está a verificar) */}
        {status === 'checking' && (
          <button
            onClick={() => navigate('/deposito')}
            className="w-full mt-4 text-gray-600 hover:text-gray-800 py-3 text-sm font-medium transition-colors"
          >
            Cancelar e Voltar
          </button>
        )}

        {/* Informação de Suporte */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Precisa de ajuda?{' '}
            <a href="/faq" className="text-amber-500 hover:text-amber-600 font-medium">
              Contacte o suporte
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

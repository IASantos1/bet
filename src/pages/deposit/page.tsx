
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/feature/Header';
import { Footer } from '../../components/feature/Footer';
import { MobileBottomNav } from '../../components/feature/MobileBottomNav';
import { useAuth } from '../../contexts/AuthContext';
import { useProfile } from '../../hooks/useProfile';
import { useLimits } from '../../hooks/useLimits';
import { useNotification } from '../../contexts/NotificationContext';
import { apiFetch } from '../../services/backendClient';
import MBWayForm from './components/MBWayForm';
import MultibancoForm from './components/MultibancoForm';
import TransferForm from './components/TransferForm';

type PaymentMethod = 'mbway' | 'multibanco' | 'transfer' | null;

const paymentMethods = [
  {
    id: 'mbway',
    name: 'MB WAY',
    icon: 'ri-smartphone-line',
    description: 'Pagamento instantâneo via app',
    color: 'from-red-500 to-red-600',
    bgLight: 'bg-red-50',
    borderActive: 'border-red-400 ring-2 ring-red-100',
    time: 'Instantâneo',
  },
  {
    id: 'multibanco',
    name: 'Multibanco',
    icon: 'ri-atm-line',
    description: 'Gerar referência MB',
    color: 'from-teal-500 to-teal-600',
    bgLight: 'bg-teal-50',
    borderActive: 'border-teal-400 ring-2 ring-teal-100',
    time: '1-5 min',
  },
  {
    id: 'transfer',
    name: 'Transferência',
    icon: 'ri-bank-line',
    description: 'Transferência bancária SEPA',
    color: 'from-emerald-500 to-emerald-600',
    bgLight: 'bg-emerald-50',
    borderActive: 'border-emerald-400 ring-2 ring-emerald-100',
    time: '1-3 dias',
  },
];

const quickAmounts = [10, 20, 50, 100, 200, 500];

export default function DepositPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile: _profile } = useProfile();
  const { addNotification: _addNotification } = useNotification();
  const { limits, loading: limitsLoading } = useLimits();

  const [amount, setAmount] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [balance, setBalance] = useState(0);
  const [step, setStep] = useState<'amount' | 'method' | 'payment'>('amount');

  /** Fetch the current user balance */
  const fetchBalance = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiFetch('/wallet', { method: 'GET' });
      if (typeof data?.balance === 'number') setBalance(data.balance);
    } catch (err) {
      console.error('Erro ao buscar saldo:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const depositAmount = parseFloat(amount) || 0;

  /** Validate amount and go to the next step */
  const handleAmountContinue = () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (depositAmount < 10) {
      setError('O valor mínimo de depósito é €10');
      return;
    }
    if (depositAmount > 10000) {
      setError('O valor máximo de depósito é €10.000');
      return;
    }
    setError('');
    setStep('method');
  };

  /** Choose payment method */
  const handleMethodSelect = (method: PaymentMethod) => {
    setSelectedMethod(method);
    if (method === 'mbway') {
      setStep('payment');
    } else {
      setStep('payment');
    }
  };

  /** Navigate back through the steps */
  const handleBack = () => {
    if (step === 'payment') {
      setStep('method');
      setSelectedMethod(null);
    } else if (step === 'method') {
      setStep('amount');
    } else {
      navigate(-1);
    }
  };

  /** Core deposit logic – cria uma transação pendente e delega confirmação ao backend/admin */
  const processDeposit = async (paymentMethod: string, details?: Record<string, string>) => {
    if (!user) {
      setError('Sessão expirada. Faça login novamente.');
      navigate('/login');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Create a pending transaction record
      await apiFetch('/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: 'deposit',
          amount: depositAmount,
          status: 'pending',
          payment_method: paymentMethod,
          account_details: details ? details : null,
          description: `Depósito via ${paymentMethod.toUpperCase()}`,
        }),
      });

      const methodLabel = paymentMethod.toUpperCase();
      setSuccessMessage(
        `Pedido de depósito de €${depositAmount.toFixed(
          2,
        )} via ${methodLabel} criado. Assim que o pagamento for confirmado, o saldo será atualizado automaticamente.`,
      );
      setLoading(false);
      setStep('amount');
      setAmount('');
      setSelectedMethod(null);
    } catch (err: any) {
      console.error('Erro ao processar depósito:', err);
      setError(err.message || 'Erro ao processar depósito. Tenta novamente.');
      setLoading(false);
    }
  };

  /** Handlers for each specific payment form */
  const handleMBWaySubmit = (_phone: string) => {
    setSuccessMessage('');
  };

  const handleMultibancoSubmit = () => {
    setSuccessMessage('');
  };

  const handleTransferSubmit = () => {
    processDeposit('transfer');
  };

  const selectedMethodData = paymentMethods.find((m) => m.id === selectedMethod);
  const stepLabels = ['Valor', 'Método', 'Pagamento'];
  const stepIndex = step === 'amount' ? 0 : step === 'method' ? 1 : 2;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 pt-24 pb-24 lg:pb-16">
        <div className="max-w-2xl mx-auto px-4">
          {/* Header */}
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-4">
            <div className="flex items-center gap-3 mb-5">
              <button
                onClick={handleBack}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <i className="ri-arrow-left-line text-xl"></i>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Depositar Fundos</h1>
                <p className="text-xs text-gray-500 mt-0.5">Adiciona saldo à tua conta</p>
              </div>
            </div>

            {/* Saldo */}
            {user && (
              <div className="bg-gradient-to-r from-teal-500 to-teal-600 rounded-xl p-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-teal-100 text-xs mb-1">Saldo Atual</p>
                    <p className="text-2xl font-bold">€{balance.toFixed(2)}</p>
                  </div>
                  <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/10">
                    <i className="ri-wallet-3-line"></i>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stepper */}
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
            <div className="flex items-center justify-between">
              {stepLabels.map((label, i) => (
                <div key={label} className="flex items-center flex-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                        i <= stepIndex ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      {i < stepIndex ? <i className="ri-check-line"></i> : i + 1}
                    </div>
                    <span
                      className={`text-sm font-medium ${i <= stepIndex ? 'text-gray-900' : 'text-gray-400'}`}
                    >
                      {label}
                    </span>
                  </div>
                  {i < stepLabels.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-3 rounded ${i < stepIndex ? 'bg-teal-500' : 'bg-gray-200'}`}
                    ></div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {!limitsLoading && (limits.maxDailyDeposit || limits.maxMonthlyDeposit) && (
            <div className="bg-gray-100 rounded-2xl border border-gray-200 p-4 mb-4">
              <p className="text-xs font-semibold text-gray-700 mb-1">Limites de depósito</p>
              <p className="text-xs text-gray-600">
                {limits.maxDailyDeposit && (
                  <span>Diário: €{limits.maxDailyDeposit.toFixed(2)}</span>
                )}
                {limits.maxDailyDeposit && limits.maxMonthlyDeposit && <span> • </span>}
                {limits.maxMonthlyDeposit && (
                  <span>Mensal: €{limits.maxMonthlyDeposit.toFixed(2)}</span>
                )}
              </p>
            </div>
          )}

          {/* Mensagens de Sucesso */}
          {successMessage && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-green-100">
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <i className="ri-checkbox-circle-line text-xl text-green-600"></i>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-green-900 text-sm">{successMessage}</p>
                </div>
                {!loading && (
                  <button
                    onClick={() => setSuccessMessage('')}
                    className="ml-auto w-8 h-8 flex items-center justify-center cursor-pointer"
                  >
                    <i className="ri-close-line text-green-400"></i>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Mensagens de Erro */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-800">
                <i className="ri-error-warning-line text-lg"></i>
                <span className="text-sm font-medium">{error}</span>
                <button
                  onClick={() => setError('')}
                  className="ml-auto w-8 h-8 flex items-center justify-center cursor-pointer"
                >
                  <i className="ri-close-line text-red-400"></i>
                </button>
              </div>
            </div>
          )}

          {/* Step 1 – Valor */}
          {step === 'amount' && (
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Quanto queres depositar?</h2>
              <p className="text-sm text-gray-500 mb-5">Escolhe um valor rápido ou insere manualmente</p>

              {/* Quick Amounts */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                {quickAmounts.map((qa) => (
                  <button
                    key={qa}
                    onClick={() => {
                      setAmount(qa.toString());
                      setError('');
                    }}
                    className={`px-4 py-3.5 border-2 rounded-xl font-bold text-base transition-all whitespace-nowrap cursor-pointer ${
                      amount === qa.toString()
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50/50 text-gray-700'
                    }`}
                  >
                    €{qa}
                  </button>
                ))}
              </div>

              {/* Custom Amount */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Valor personalizado</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-400">€</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setError('');
                    }}
                    placeholder="0.00"
                    min="10"
                    max="10000"
                    step="0.01"
                    className="w-full pl-10 pr-4 py-3.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-200 focus:border-teal-400 text-xl font-bold"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">Mínimo: €10 · Máximo: €10.000</p>
              </div>

              <button
                onClick={handleAmountContinue}
                disabled={!amount || depositAmount < 10}
                className="w-full bg-teal-600 text-white py-4 rounded-xl font-semibold hover:bg-teal-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <span>Continuar</span>
                <i className="ri-arrow-right-line text-xl"></i>
              </button>
            </div>
          )}

          {/* Step 2 – Método */}
          {step === 'method' && (
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold text-gray-900">Escolhe o método</h2>
                <div className="bg-teal-50 px-3 py-1 rounded-lg">
                  <span className="text-sm font-bold text-teal-700">€{depositAmount.toFixed(2)}</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-5">Seleciona como queres fazer o depósito</p>

              <div className="space-y-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => handleMethodSelect(method.id as PaymentMethod)}
                    className="w-full p-4 bg-white rounded-xl border-2 border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all flex items-center gap-4 cursor-pointer group text-left"
                  >
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-r ${method.color} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
                    >
                      <i className={`${method.icon} text-white text-xl`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-sm">{method.name}</p>
                      <p className="text-xs text-gray-500">{method.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-1 rounded-md">
                        {method.time}
                      </span>
                    </div>
                    <i className="ri-arrow-right-s-line text-gray-400 text-xl"></i>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3 – Formulário de Pagamento */}
          {step === 'payment' && selectedMethod && (
            <div className="bg-white rounded-2xl shadow-sm p-6">
              {/* Header do método selecionado */}
              {selectedMethodData && (
                <div className="flex items-center gap-3 mb-6 pb-5 border-b border-gray-100">
                  <div
                    className={`w-11 h-11 rounded-xl bg-gradient-to-r ${selectedMethodData.color} flex items-center justify-center`}
                  >
                    <i className={`${selectedMethodData.icon} text-white text-lg`}></i>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{selectedMethodData.name}</p>
                    <p className="text-xs text-gray-500">{selectedMethodData.description}</p>
                  </div>
                  <div className="ml-auto bg-gray-50 px-3 py-1.5 rounded-lg">
                    <span className="text-sm font-bold text-gray-900">€{depositAmount.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Specific payment form */}
              {selectedMethod === 'mbway' && (
                <MBWayForm amount={depositAmount} onSubmit={handleMBWaySubmit} loading={loading} />
              )}
              {selectedMethod === 'multibanco' && (
                <MultibancoForm amount={depositAmount} onSubmit={handleMultibancoSubmit} loading={loading} />
              )}
              {selectedMethod === 'transfer' && (
                <TransferForm amount={depositAmount} onSubmit={handleTransferSubmit} loading={loading} />
              )}
            </div>
          )}

          {/* Informações de Segurança – mostrado apenas na etapa de valor */}
          {step === 'amount' && (
            <div className="mt-4 bg-white rounded-2xl shadow-sm p-6">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-sm">
                <i className="ri-shield-check-line text-teal-600"></i>
                Segurança e Informações
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="ri-lock-line text-teal-600 text-sm"></i>
                    <span className="text-xs font-medium text-gray-900">Encriptação SSL</span>
                  </div>
                  <p className="text-[11px] text-gray-500">Dados protegidos</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="ri-refund-2-line text-teal-600 text-sm"></i>
                    <span className="text-xs font-medium text-gray-900">Sem Taxas</span>
                  </div>
                  <p className="text-[11px] text-gray-500">0% comissão</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="ri-flashlight-line text-teal-600 text-sm"></i>
                    <span className="text-xs font-medium text-gray-900">Instantâneo</span>
                  </div>
                  <p className="text-[11px] text-gray-500">MB WAY e Cartões</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="ri-customer-service-2-line text-teal-600 text-sm"></i>
                    <span className="text-xs font-medium text-gray-900">Suporte 24/7</span>
                  </div>
                  <p className="text-[11px] text-gray-500">Ajuda disponível</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}

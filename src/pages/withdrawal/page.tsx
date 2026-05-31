
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useProfile } from '../../hooks/useProfile';
import { useWallet } from '../../hooks/useWallet';
import { useLimits } from '../../hooks/useLimits';
import Header from '../../components/feature/Header';
import Footer from '../../components/feature/Footer';
import { MobileBottomNav } from '../../components/feature/MobileBottomNav';
import { apiFetch } from '../../services/backendClient';

// Validação de IBAN
const validateIBAN = (iban) => {
  const cleanIban = iban.replace(/\s/g, '').toUpperCase();
  if (cleanIban.length < 15 || cleanIban.length > 34) return false;

  const rearranged = cleanIban.slice(4) + cleanIban.slice(0, 4);
  const numericIban = rearranged.replace(/[A-Z]/g, (char) =>
    (char.charCodeAt(0) - 55).toString()
  );

  let remainder = '';
  for (let i = 0; i < numericIban.length; i++) {
    remainder += numericIban[i];
    if (remainder.length >= 9) {
      remainder = (parseInt(remainder, 10) % 97).toString();
    }
  }

  return parseInt(remainder, 10) % 97 === 1;
};

const formatIBAN = (value) => {
  const clean = value.replace(/\s/g, '').toUpperCase();
  const matches = clean.match(/.{1,4}/g);
  return matches ? matches.join(' ') : clean;
};

export default function WithdrawalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading: profileLoading, refetch: refetchProfile } = useProfile();
  const { wallet, processWithdrawal: _processWithdrawal, refetch: refetchWallet } = useWallet();
  const { limits, loading: limitsLoading } = useLimits();

  const [amount, setAmount] = useState('');
  const [iban, setIban] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [useSavedIban, setUseSavedIban] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ iban?: string; accountHolder?: string }>({});

  const [withdrawalHistory, setWithdrawalHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ✅ Usar saldo do wallet hook
  const balance = wallet?.balance ?? profile?.balance ?? 0;
  const isKycVerified = profile?.kyc_verified || false;
  const hasSavedIban = profile?.saved_iban && profile?.saved_account_holder;

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  const loadWithdrawalHistory = useCallback(async () => {
    if (!user) return;
    setHistoryLoading(true);

    try {
      const data = await apiFetch('/transactions', { method: 'GET' });
      const list = (data.transactions || []).filter((t) => t.type === 'withdrawal').slice(0, 5);
      setWithdrawalHistory(list);
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadWithdrawalHistory();
    }
  }, [user, loadWithdrawalHistory]);

  useEffect(() => {
    if (hasSavedIban && useSavedIban) {
      setIban(formatIBAN(profile?.saved_iban || ''));
      setAccountHolder(profile?.saved_account_holder || '');
    } else if (!useSavedIban) {
      setIban('');
      setAccountHolder('');
    }
  }, [useSavedIban, profile, hasSavedIban]);

  const validateFields = () => {
    const errors: { iban?: string; accountHolder?: string } = {};

    if (!iban) {
      errors.iban = 'IBAN obrigatório';
    } else if (!validateIBAN(iban)) {
      errors.iban = 'IBAN inválido';
    }

    if (!accountHolder) {
      errors.accountHolder = 'Nome do titular obrigatório';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!isKycVerified) {
      setError('Precisas de verificar a tua identidade antes de fazer levantamentos.');
      return;
    }

    const withdrawAmount = parseFloat(amount);

    if (!withdrawAmount || withdrawAmount < 20) {
      setError('O valor mínimo de levantamento é €20');
      return;
    }

    if (withdrawAmount > balance) {
      setError('Saldo insuficiente');
      return;
    }

    if (!validateFields()) {
      return;
    }

    setLoading(true);

    try {
      const accountDetails = {
        iban: iban.replace(/\s/g, ''),
        accountHolder: accountHolder,
      };

      const _resp = await apiFetch('/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          amount: withdrawAmount,
          payment_method: 'bank_transfer',
          description: `Levantamento para ${iban.slice(0, 8)}...${iban.slice(-4)}`,
          account_details: accountDetails,
        }),
      });

      setSuccess(`Levantamento de €${withdrawAmount.toFixed(2)} solicitado com sucesso!`);
      setAmount('');

      // Atualizar dados
      await refetchWallet();
      await refetchProfile();
      await loadWithdrawalHistory();

      // Limpar campos se não usar IBAN guardado
      if (!useSavedIban) {
        setIban('');
        setAccountHolder('');
      }

      console.log(`✅ Levantamento processado: €${withdrawAmount}`);

    } catch (err) {
      console.error('Erro:', err);
      setError(err.message || 'Erro ao processar levantamento. Tenta novamente.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: {
        color: 'bg-amber-100 text-amber-800',
        icon: 'ri-time-line',
        text: 'Pendente',
      },
      processing: {
        color: 'bg-blue-100 text-blue-800',
        icon: 'ri-loader-4-line',
        text: 'A processar',
      },
      completed: {
        color: 'bg-emerald-100 text-emerald-800',
        icon: 'ri-checkbox-circle-line',
        text: 'Concluído',
      },
      failed: {
        color: 'bg-red-100 text-red-800',
        icon: 'ri-close-circle-line',
        text: 'Falhado',
      },
      cancelled: {
        color: 'bg-gray-100 text-gray-800',
        icon: 'ri-close-line',
        text: 'Cancelado',
      },
    };
    const badge = badges[status] || badges.pending;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        <i className={`${badge.icon} ${status === 'processing' ? 'animate-spin' : ''}`}></i>
        {badge.text}
      </span>
    );
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-900 font-semibold">A carregar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 pt-24 pb-24 lg:pb-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Coluna Principal */}
            <div className="lg:col-span-2">
              <div className="mb-6">
                <button
                  onClick={() => navigate(-1)}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-4 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-arrow-left-line"></i>
                  <span>Voltar</span>
                </button>
                <h1 className="text-3xl font-bold text-gray-900">Levantar Fundos</h1>
                <p className="text-gray-600 mt-2">Levanta os teus ganhos por transferência bancária</p>
              </div>

              {/* ✅ Saldo - Atualizado em tempo real */}
              <div className="bg-gradient-to-r from-teal-500 to-teal-600 rounded-2xl p-6 mb-4 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-teal-100 text-sm mb-1">Saldo Disponível</p>
                    <p className="text-4xl font-bold">€{balance.toFixed(2)}</p>
                  </div>
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                    <i className="ri-wallet-3-line text-3xl"></i>
                  </div>
                </div>
              </div>

              {!limitsLoading && limits?.maxDailyWithdrawal && (
                <div className="bg-gray-100 border border-gray-200 rounded-xl p-4 mb-6">
                  <p className="text-xs font-semibold text-gray-700 mb-1">Limite diário de levantamento</p>
                  <p className="text-xs text-gray-600">
                    Podes levantar até €{limits.maxDailyWithdrawal.toFixed(2)} por dia.
                  </p>
                </div>
              )}

              {/* Alerta KYC */}
              {!isKycVerified && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <i className="ri-alert-line text-red-500 text-xl flex-shrink-0 mt-0.5"></i>
                    <div className="flex-1">
                      <p className="text-red-900 font-medium mb-2">Verificação Necessária</p>
                      <p className="text-red-800 text-sm mb-3">
                        Para fazer levantamentos, precisas de verificar a tua identidade.
                      </p>
                      <button
                        onClick={() => navigate('/verificacao')}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Verificar Agora
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Mensagens */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                  <i className="ri-error-warning-line text-red-500 text-xl flex-shrink-0"></i>
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              {success && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                  <i className="ri-checkbox-circle-line text-emerald-500 text-xl flex-shrink-0"></i>
                  <div>
                    <p className="text-emerald-800 font-medium">{success}</p>
                    <p className="text-emerald-700 text-sm mt-1">
                      Tempo estimado: 1-3 dias úteis
                    </p>
                    <p className="text-emerald-700 text-xs mt-1">
                      Podes acompanhar o estado em Carteira &gt; Histórico de transações.
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-8">
                {/* Método de Levantamento */}
                <div className="mb-8">
                  <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-teal-50 to-emerald-50 border-2 border-teal-500 rounded-xl">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 flex items-center justify-center">
                      <i className="ri-bank-line text-white text-2xl"></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-lg">Transferência Bancária (IBAN)</h3>
                      <p className="text-sm text-gray-600">Recebe diretamente na tua conta bancária</p>
                      <p className="text-xs text-teal-600 font-medium mt-1">
                        <i className="ri-time-line mr-1"></i>
                        1-3 dias úteis • Sem taxas
                      </p>
                    </div>
                  </div>
                </div>

                {/* Valor */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Valor do Levantamento
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg font-medium">€</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="20"
                      max={balance}
                      className="w-full pl-10 pr-4 py-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent text-xl font-semibold"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Mínimo: €20 • Máximo: €{balance.toFixed(2)}
                    {limits?.maxDailyWithdrawal && (
                      <> • Limite diário: €{limits.maxDailyWithdrawal.toFixed(2)}</>
                    )}
                  </p>
                </div>

                {/* Valores Rápidos */}
                <div className="grid grid-cols-4 gap-3 mb-8">
                  {[50, 100, 250, 500].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAmount(Math.min(value, balance).toString())}
                      disabled={value > balance}
                      className="py-3 px-4 bg-gray-100 border border-gray-200 rounded-lg hover:border-teal-500 hover:bg-teal-50 transition-all text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                    >
                      €{value}
                    </button>
                  ))}
                </div>

                {/* Campos IBAN */}
                <div className="space-y-4 mb-8">
                  <h4 className="font-medium text-gray-900 flex items-center gap-2">
                    <i className="ri-bank-card-2-line text-teal-600"></i>
                    Dados Bancários
                  </h4>

                  {hasSavedIban && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useSavedIban}
                          onChange={(e) => setUseSavedIban(e.target.checked)}
                          className="w-5 h-5 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-900">Usar IBAN guardado</span>
                          <p className="text-xs text-gray-500">
                            {profile?.saved_iban?.slice(0, 8)}...{profile?.saved_iban?.slice(-4)} • {profile?.saved_account_holder}
                          </p>
                        </div>
                      </label>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      IBAN
                    </label>
                    <input
                      type="text"
                      value={iban}
                      onChange={(e) => {
                        setIban(formatIBAN(e.target.value));
                        setFieldErrors({ ...fieldErrors, iban: '' });
                      }}
                      placeholder="PT50 0000 0000 0000 0000 0000 0"
                      maxLength={34}
                      disabled={useSavedIban}
                      className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 ${
                        fieldErrors.iban ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                    {fieldErrors.iban && (
                      <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <i className="ri-error-warning-line"></i>
                        {fieldErrors.iban}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Titular da Conta
                    </label>
                    <input
                      type="text"
                      value={accountHolder}
                      onChange={(e) => {
                        setAccountHolder(e.target.value);
                        setFieldErrors({ ...fieldErrors, accountHolder: '' });
                      }}
                      placeholder="Nome completo conforme conta bancária"
                      disabled={useSavedIban}
                      className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 ${
                        fieldErrors.accountHolder ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                    {fieldErrors.accountHolder && (
                      <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <i className="ri-error-warning-line"></i>
                        {fieldErrors.accountHolder}
                      </p>
                    )}
                  </div>
                </div>

                {/* Resumo */}
                {amount && parseFloat(amount) >= 20 && (
                  <div className="bg-gray-50 rounded-xl p-4 mb-6">
                    <h4 className="font-medium text-gray-900 mb-3">Resumo do Levantamento</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Valor</span>
                        <span className="font-semibold">€{parseFloat(amount).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Método</span>
                        <span className="font-medium">Transferência Bancária</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Tempo estimado</span>
                        <span className="text-teal-600 font-medium">1-3 dias úteis</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Taxa</span>
                        <span className="text-emerald-600 font-medium">Grátis</span>
                      </div>
                      <div className="border-t pt-2 mt-2 flex justify-between">
                        <span className="text-gray-900 font-medium">Recebes</span>
                        <span className="text-xl font-bold text-teal-600">€{parseFloat(amount).toFixed(2)}</span>
                      </div>
                      {/* ✅ Novo saldo após levantamento */}
                      <div className="flex justify-between pt-2 border-t">
                        <span className="text-gray-600">Saldo após levantamento</span>
                        <span className="font-bold text-amber-600">€{(balance - parseFloat(amount)).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !amount || parseFloat(amount) < 20 || !isKycVerified || parseFloat(amount) > balance}
                  className="w-full bg-gradient-to-r from-teal-500 to-teal-600 text-white py-4 rounded-xl font-semibold hover:from-teal-600 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  {loading ? (
                    <>
                      <i className="ri-loader-4-line animate-spin text-xl"></i>
                      <span>A processar...</span>
                    </>
                  ) : (
                    <>
                      <i className="ri-send-plane-line text-xl"></i>
                      <span>Confirmar Levantamento</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Coluna Lateral */}
            <div className="lg:col-span-1">
              {/* Histórico */}
              <div className="bg-white rounded-2xl shadow-sm p-6 sticky top-24">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <i className="ri-history-line text-teal-600"></i>
                  Últimos Levantamentos
                </h3>

                {historyLoading ? (
                  <div className="text-center py-8">
                    <i className="ri-loader-4-line animate-spin text-2xl text-gray-400"></i>
                  </div>
                ) : withdrawalHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <i className="ri-file-list-line text-4xl text-gray-300 mb-2"></i>
                    <p className="text-gray-500 text-sm">Ainda não fizeste levantamentos</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {withdrawalHistory.map((withdrawal) => (
                      <div key={withdrawal.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                              <i className="ri-bank-line text-gray-600"></i>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">€{Number(withdrawal.amount).toFixed(2)}</p>
                              <p className="text-xs text-gray-500">
                                {new Date(withdrawal.created_at).toLocaleDateString('pt-PT')}
                              </p>
                            </div>
                          </div>
                          {getStatusBadge(withdrawal.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Info de Segurança */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="font-medium text-gray-900 mb-3 text-sm">Segurança</h4>
                  <div className="space-y-2 text-xs text-gray-600">
                    <div className="flex items-start gap-2">
                      <i className="ri-lock-line text-teal-600 flex-shrink-0 mt-0.5"></i>
                      <p>Encriptação SSL 256 bits</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <i className="ri-shield-check-line text-teal-600 flex-shrink-0 mt-0.5"></i>
                      <p>Verificação de identidade</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <i className="ri-customer-service-line text-teal-600 flex-shrink-0 mt-0.5"></i>
                      <p>Suporte 24/7</p>
                    </div>
                  </div>
                </div>

                {/* Info Transferência */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="font-medium text-gray-900 mb-3 text-sm">Informação</h4>
                  <div className="bg-teal-50 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <i className="ri-information-line text-teal-600 flex-shrink-0 mt-0.5"></i>
                      <p className="text-xs text-teal-800">
                        Os levantamentos são processados por transferência bancária SEPA para qualquer conta europeia.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
      
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Header from '../../components/feature/Header';
import Footer from '../../components/feature/Footer';
import { MobileBottomNav } from '../../components/feature/MobileBottomNav';
import { useAuth } from '../../contexts/AuthContext';
import { useProfile } from '../../hooks/useProfile';
import { useWallet } from '../../hooks/useWallet';
import WalletBalanceCard from './components/WalletBalanceCard';
import WalletStats from './components/WalletStats';
import WalletTransactionList from './components/WalletTransactionList';

export default function WalletPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { wallet, loading, refetch } = useWallet();
  const { profile: _profile } = useProfile();
  const [txFilter, setTxFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  // Refresh wallet data
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refetch();
      // Keep the spinner visible for a short period for UX smoothness
      setTimeout(() => setRefreshing(false), 600);
    } catch (err) {
      console.error('Failed to refresh wallet:', err);
      setRefreshing(false);
    }
  };

  // Show loading state while wallet data is being fetched
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center pt-20">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 font-semibold">A carregar carteira...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      <Header />

      <main className="flex-1 pt-24 pb-20 lg:pb-16">
        <div className="max-w-5xl mx-auto px-4">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <i className="ri-arrow-left-line text-xl text-gray-700"></i>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Minha Carteira</h1>
                <p className="text-xs text-gray-500 mt-0.5">Gere o teu saldo, depósitos e levantamentos</p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              className={`w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 transition-all cursor-pointer ${
                refreshing ? 'animate-spin' : ''
              }`}
            >
              <i className="ri-refresh-line text-lg text-gray-600"></i>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Balance Card */}
            <div className="lg:col-span-1">
              <WalletBalanceCard
                balance={wallet.balance}
                bonusBalance={wallet.bonusBalance}
                freeBetBalance={wallet.freeBetBalance}
                pendingDeposits={wallet.pendingDeposits}
                pendingWithdrawals={wallet.pendingWithdrawals}
              />

              {/* Quick Actions */}
              <div className="mt-4 bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <i className="ri-flashlight-line text-red-500"></i>
                  Ações Rápidas
                </h3>
                <div className="space-y-2">
                  <Link
                    to="/deposito"
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-green-50 transition-colors cursor-pointer group"
                  >
                    <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                      <i className="ri-add-circle-line text-green-600 text-lg"></i>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">Depositar</p>
                      <p className="text-[11px] text-gray-400">MB WAY, Cartão, Multibanco</p>
                    </div>
                    <i className="ri-arrow-right-s-line text-gray-300 text-lg"></i>
                  </Link>

                  <Link
                    to="/levantamento"
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 transition-colors cursor-pointer group"
                  >
                    <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center group-hover:bg-red-200 transition-colors">
                      <i className="ri-send-plane-line text-red-600 text-lg"></i>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">Levantar</p>
                      <p className="text-[11px] text-gray-400">Transferência bancária SEPA</p>
                    </div>
                    <i className="ri-arrow-right-s-line text-gray-300 text-lg"></i>
                  </Link>

                  <Link
                    to="/minhas-apostas"
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 transition-colors cursor-pointer group"
                  >
                    <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center group-hover:bg-red-200 transition-colors">
                      <i className="ri-file-list-3-line text-red-600 text-lg"></i>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">Minhas Apostas</p>
                      <p className="text-[11px] text-gray-400">Ver apostas ativas e histórico</p>
                    </div>
                    <i className="ri-arrow-right-s-line text-gray-300 text-lg"></i>
                  </Link>

                  <Link
                    to="/estatisticas"
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-teal-50 transition-colors cursor-pointer group"
                  >
                    <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center group-hover:bg-teal-200 transition-colors">
                      <i className="ri-bar-chart-box-line text-teal-600 text-lg"></i>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">Estatísticas</p>
                      <p className="text-[11px] text-gray-400">Análise detalhada</p>
                    </div>
                    <i className="ri-arrow-right-s-line text-gray-300 text-lg"></i>
                  </Link>
                </div>
              </div>

              {/* Security Info */}
              <div className="mt-4 bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <i className="ri-shield-check-line text-teal-500"></i>
                  Segurança
                </h3>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <i className="ri-lock-line text-teal-500 text-sm"></i>
                    <span className="text-xs text-gray-600">Encriptação SSL 256 bits</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="ri-shield-keyhole-line text-teal-500 text-sm"></i>
                    <span className="text-xs text-gray-600">Pagamentos via Stripe</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="ri-eye-off-line text-teal-500 text-sm"></i>
                    <span className="text-xs text-gray-600">Dados nunca partilhados</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="ri-verified-badge-line text-teal-500 text-sm"></i>
                    <span className="text-xs text-gray-600">Verificação KYC obrigatória</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Stats & Transactions */}
            <div className="lg:col-span-2">
              {/* Stats */}
              <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100 mb-6">
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <i className="ri-pie-chart-line text-red-500"></i>
                  Resumo Financeiro
                </h3>
                <WalletStats
                  totalDeposited={wallet.totalDeposited}
                  totalWithdrawn={wallet.totalWithdrawn}
                  totalBets={wallet.totalBets}
                  totalWins={wallet.totalWins}
                />
              </div>

              {/* Transactions */}
              <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <i className="ri-exchange-line text-red-500"></i>
                    Histórico de Transações
                  </h3>
                  <span className="text-xs text-gray-400">
                    {wallet.recentTransactions.length} transações
                  </span>
                </div>
                <WalletTransactionList
                  transactions={wallet.recentTransactions}
                  filter={txFilter}
                  onFilterChange={setTxFilter}
                />
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

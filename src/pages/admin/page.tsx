import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useProfile } from '../../hooks/useProfile';
import { apiFetch } from '../../services/backendClient';
import AdminSidebar from './components/AdminSidebar';
import DashboardOverview from './components/DashboardOverview';
import UsersManagement from './components/UsersManagement';
import BetsManagement from './components/BetsManagement';
import TransactionsManagement from './components/TransactionsManagement';
import PromotionsManagement from './components/PromotionsManagement';
import MatchesManagement from './components/MatchesManagement';
import SettingsPanel from './components/SettingsPanel';

export type AdminTab = 'dashboard' | 'users' | 'bets' | 'transactions' | 'promotions' | 'matches' | 'settings';

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalBets: number;
  pendingBets: number;
  totalDeposits: number;
  totalWithdrawals: number;
  pendingWithdrawals: number;
  totalRevenue: number;
  todayBets: number;
  todayDeposits: number;
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!profileLoading && profile && !profile.is_admin) {
      navigate('/');
    }
  }, [profile, profileLoading, navigate]);

  useEffect(() => {
    if (profile?.is_admin) {
      fetchDashboardStats();
    }
  }, [profile]);

  const fetchDashboardStats = async () => {
    try {
      setLoadingStats(true);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [usersData, transactionsData, betsData] = await Promise.all([
        apiFetch('/admin/users', { method: 'GET' }),
        apiFetch('/admin/transactions', { method: 'GET' }),
        apiFetch('/admin/bets', { method: 'GET' }),
      ]);
      const profiles = usersData.users || [];
      const transactions = transactionsData.transactions || [];
      const bets = betsData.bets || [];

      // Calcular estatísticas
      const totalUsers = profiles.length;
      const activeUsers = profiles.filter((p: any) => p.status === 'active').length;
      
      const totalBets = bets.length;
      const pendingBets = bets.filter((b: any) => b.status === 'pending').length;
      const todayBets = bets.filter((b: any) => new Date(b.created_at) >= today).length;

      const deposits = transactions.filter((t: any) => t.type === 'deposit' && t.status === 'completed');
      const withdrawals = transactions.filter((t: any) => t.type === 'withdrawal' && t.status === 'completed');
      const pendingWithdrawals = transactions.filter((t: any) => t.type === 'withdrawal' && t.status === 'pending').length;

      const totalDeposits = deposits.reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const totalWithdrawals = withdrawals.reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const todayDepositsTotal = deposits
        .filter((t: any) => new Date(t.created_at) >= today)
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      setStats({
        totalUsers,
        activeUsers,
        totalBets,
        pendingBets,
        totalDeposits,
        totalWithdrawals,
        pendingWithdrawals,
        totalRevenue: totalDeposits - totalWithdrawals,
        todayBets,
        todayDeposits: todayDepositsTotal
      });
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">A carregar...</p>
        </div>
      </div>
    );
  }

  if (!profile?.is_admin) {
    return null;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardOverview stats={stats} loading={loadingStats} onRefresh={fetchDashboardStats} />;
      case 'users':
        return <UsersManagement />;
      case 'bets':
        return <BetsManagement />;
      case 'transactions':
        return <TransactionsManagement />;
      case 'promotions':
        return <PromotionsManagement />;
      case 'matches':
        return <MatchesManagement />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <DashboardOverview stats={stats} loading={loadingStats} onRefresh={fetchDashboardStats} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Mobile Header */}
      <div className="lg:hidden bg-black border-b border-amber-500/30 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <button
          onClick={() => setSidebarOpen(true)}
          className="w-10 h-10 flex items-center justify-center text-white cursor-pointer"
        >
          <i className="ri-menu-line text-xl"></i>
        </button>
        <span className="text-lg font-black text-white">
          BET<span className="text-amber-500">62</span>
          <span className="text-xs font-normal text-gray-400 ml-2">Admin</span>
        </span>
        <button
          onClick={() => navigate('/')}
          className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer"
        >
          <i className="ri-home-line text-xl"></i>
        </button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <AdminSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main Content */}
        <main className="flex-1 lg:ml-64 min-h-screen">
          <div className="p-4 lg:p-6">
            {renderContent()}
          </div>
        </main>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

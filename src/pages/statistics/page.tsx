import { useState, useEffect, useMemo } from 'react';
import Header from '../../components/feature/Header';
import Footer from '../../components/feature/Footer';
import SelfExclusionBanner from '../../components/feature/SelfExclusionBanner';
import GamblingAlertsPanel from '../../components/feature/GamblingAlertsPanel';
import { useAuth } from '../../contexts/AuthContext';
import { useBets } from '../../hooks/useBets';
import { useTransactions } from '../../hooks/useTransactions';
import { useProfile } from '../../hooks/useProfile';
import { useExportPDF } from '../../hooks/useExportPDF';
import { useGamblingAlerts } from '../../hooks/useGamblingAlerts';
import { useNavigate } from 'react-router-dom';
import { MobileBottomNav } from '../../components/feature/MobileBottomNav';

type TimeFilter = '7d' | '30d' | '90d' | '365d' | 'all';

export default function StatisticsPage() {
  // Removed the generic from useState to avoid syntax error in non‑TSX files.
  // The cast ensures TypeScript still knows the correct type when the project is compiled as TS.
  const [timeFilter, setTimeFilter] = useState('30d' as TimeFilter);
  const { user } = useAuth();
  const { bets, loading: betsLoading } = useBets();
  const { transactions, loading: transactionsLoading } = useTransactions();
  const { profile, loading: profileLoading } = useProfile();
  const navigate = useNavigate();

  const { exportToPDF, exportToCSV } = useExportPDF();
  const { alerts, riskScore, riskLevel, hasCriticalAlerts: _hasCriticalAlerts } = useGamblingAlerts();
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDateRange, setExportDateRange] = useState<'7d' | '30d' | '90d' | '365d' | 'all'>('all');

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  const getFilterDate = (filter: TimeFilter): Date | null => {
    const now = new Date();
    switch (filter) {
      case '7d':
        return new Date(now.setDate(now.getDate() - 7));
      case '30d':
        return new Date(now.setDate(now.getDate() - 30));
      case '90d':
        return new Date(now.setDate(now.getDate() - 90));
      case '365d':
        return new Date(now.setDate(now.getDate() - 365));
      default:
        return null;
    }
  };

  // Add the missing function to convert export date range to filter
  const getExportDateFilter = (): { start: Date; end: Date } | undefined => {
    const now = new Date();
    const end = new Date();
    let start: Date;

    switch (exportDateRange) {
      case '7d':
        start = new Date(now.setDate(now.getDate() - 7));
        return { start, end };
      case '30d':
        start = new Date(now.setDate(now.getDate() - 30));
        return { start, end };
      case '90d':
        start = new Date(now.setDate(now.getDate() - 90));
        return { start, end };
      case '365d':
        start = new Date(now.setDate(now.getDate() - 365));
        return { start, end };
      case 'all':
      default:
        return undefined;
    }
  };

  const filteredBets = useMemo(() => {
    const filterDate = getFilterDate(timeFilter);
    if (!filterDate) return bets;
    return bets.filter((bet) => new Date(bet.created_at) >= filterDate);
  }, [bets, timeFilter]);

  const filteredTransactions = useMemo(() => {
    const filterDate = getFilterDate(timeFilter);
    if (!filterDate) return transactions;
    return transactions.filter((t) => new Date(t.created_at) >= filterDate);
  }, [transactions, timeFilter]);

  // Estatísticas de apostas
  const betStats = useMemo(() => {
    const total = filteredBets.length;
    const won = filteredBets.filter((b) => b.status === 'won').length;
    const lost = filteredBets.filter((b) => b.status === 'lost').length;
    const pending = filteredBets.filter((b) => b.status === 'pending').length;
    const simple = filteredBets.filter((b) => b.type === 'single').length;
    const multiple = filteredBets.filter((b) => b.type === 'multiple').length;

    const totalStaked = filteredBets.reduce((sum, b) => sum + Number(b.stake), 0);
    const totalWon = filteredBets
      .filter((b) => b.status === 'won')
      .reduce((sum, b) => sum + Number(b.potential_win), 0);
    const totalLost = filteredBets
      .filter((b) => b.status === 'lost')
      .reduce((sum, b) => sum + Number(b.stake), 0);
    const netProfit = totalWon - totalStaked;
    const roi = totalStaked > 0 ? ((totalWon - totalStaked) / totalStaked) * 100 : 0;
    const winRate = total > 0 ? (won / (won + lost)) * 100 : 0;
    const avgStake = total > 0 ? totalStaked / total : 0;
    const avgOdd =
      filteredBets.length > 0
        ? filteredBets.reduce((sum, b) => {
            const selections = b.selections || [];
            const totalOdd = selections.reduce((s: number, sel: any) => s * (sel.odd || 1), 1);
            return sum + totalOdd;
          }, 0) / filteredBets.length
        : 0;

    return {
      total,
      won,
      lost,
      pending,
      simple,
      multiple,
      totalStaked,
      totalWon,
      totalLost,
      netProfit,
      roi,
      winRate,
      avgStake,
      avgOdd,
    };
  }, [filteredBets]);

  // Estatísticas financeiras
  const financeStats = useMemo(() => {
    const deposits = filteredTransactions.filter(
      (t) => t.type === 'deposit' && t.status === 'completed'
    );
    const withdrawals = filteredTransactions.filter(
      (t) => t.type === 'withdrawal' && t.status === 'completed'
    );
    const bonuses = filteredTransactions.filter(
      (t) => t.type === 'bonus' && t.status === 'completed'
    );

    const totalDeposits = deposits.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalWithdrawals = withdrawals.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalBonuses = bonuses.reduce((sum, t) => sum + Number(t.amount), 0);
    const netFlow = totalDeposits - totalWithdrawals;

    return {
      deposits: deposits.length,
      withdrawals: withdrawals.length,
      totalDeposits,
      totalWithdrawals,
      totalBonuses,
      netFlow,
    };
  }, [filteredTransactions]);

  // Dados para gráfico de apostas por dia
  const dailyBetData = useMemo(() => {
    const days: { [key: string]: { bets: number; staked: number; won: number } } = {};
    const _filterDate = getFilterDate(timeFilter);

    filteredBets.forEach((bet) => {
      const date = new Date(bet.created_at).toLocaleDateString('pt-PT');
      if (!days[date]) {
        days[date] = { bets: 0, staked: 0, won: 0 };
      }
      days[date].bets++;
      days[date].staked += Number(bet.stake);
      if (bet.status === 'won') {
        days[date].won += Number(bet.potential_win);
      }
    });

    return Object.entries(days)
      .map(([date, data]) => ({ date, ...data }))
      .slice(-14);
  }, [filteredBets, timeFilter]);

  // Desportos mais apostados
  const sportStats = useMemo(() => {
    const sports: { [key: string]: { count: number; staked: number; won: number } } = {};

    filteredBets.forEach((bet) => {
      const selections = bet.selections || [];
      selections.forEach((sel: any) => {
        const sport = sel.league?.split(' - ')[0] || 'Outro';
        if (!sports[sport]) {
          sports[sport] = { count: 0, staked: 0, won: 0 };
        }
        sports[sport].count++;
        // Distribute stake / win proportionally across selections
        sports[sport].staked += Number(bet.stake) / selections.length;
        if (bet.status === 'won') {
          sports[sport].won += Number(bet.potential_win) / selections.length;
        }
      });
    });

    return Object.entries(sports)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredBets]);

  const loading = betsLoading || transactionsLoading || profileLoading;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-amber-500 animate-spin"></i>
          <p className="mt-4 text-gray-600">A carregar estatísticas...</p>
        </div>
      </div>
    );
  }

  const maxBarValue = Math.max(...dailyBetData.map((d) => d.staked), 1);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      <Header />
      <SelfExclusionBanner />
      <GamblingAlertsPanel />

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in">
            <div className="p-6 bg-gradient-to-r from-amber-500 to-amber-600 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <i className="ri-file-download-line text-3xl"></i>
                  <div>
                    <h3 className="text-xl font-bold">Exportar Histórico</h3>
                    <p className="text-amber-100 text-sm">Transfira os seus dados</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Date Range Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Período</label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { value: '7d', label: '7 dias' },
                    { value: '30d', label: '30 dias' },
                    { value: '90d', label: '90 dias' },
                    { value: '365d', label: '1 ano' },
                    { value: 'all', label: 'Tudo' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setExportDateRange(option.value as typeof exportDateRange)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        exportDateRange === option.value
                          ? 'bg-amber-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Export Options */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Exportar como PDF</h4>
                <button
                  onClick={() => { exportToPDF('bets', getExportDateFilter()); setShowExportModal(false); }}
                  className="w-full flex items-center justify-between p-4 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <i className="ri-file-pdf-2-line text-red-600 text-xl"></i>
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-gray-900">Histórico de Apostas</div>
                      <div className="text-xs text-gray-600">{bets.length} apostas registadas</div>
                    </div>
                  </div>
                  <i className="ri-download-line text-red-600 text-xl"></i>
                </button>

                <button
                  onClick={() => { exportToPDF('transactions', getExportDateFilter()); setShowExportModal(false); }}
                  className="w-full flex items-center justify-between p-4 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <i className="ri-file-pdf-2-line text-green-600 text-xl"></i>
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-gray-900">Histórico de Transações</div>
                      <div className="text-xs text-gray-600">{transactions.length} transações registadas</div>
                    </div>
                  </div>
                  <i className="ri-download-line text-green-600 text-xl"></i>
                </button>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Exportar como CSV</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { exportToCSV('bets'); setShowExportModal(false); }}
                    className="flex items-center justify-center space-x-2 p-3 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
                  >
                    <i className="ri-file-excel-2-line text-green-600 text-xl"></i>
                    <span className="text-sm font-medium text-gray-700">Apostas CSV</span>
                  </button>
                  <button
                    onClick={() => { exportToCSV('transactions'); setShowExportModal(false); }}
                    className="flex items-center justify-center space-x-2 p-3 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
                  >
                    <i className="ri-file-excel-2-line text-green-600 text-xl"></i>
                    <span className="text-sm font-medium text-gray-700">Transações CSV</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6">
              <p className="text-xs text-gray-500 text-center">
                <i className="ri-information-line mr-1"></i>
                Os ficheiros PDF serão abertos numa nova janela para impressão/download.
              </p>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 py-8 pb-24 lg:pb-8">
        <div className="max-w-7xl mx-auto px-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                <i className="ri-bar-chart-box-line text-amber-600 mr-3"></i>
                Estatísticas de Jogo
              </h1>
              <p className="text-gray-600">Analise o seu histórico de apostas e desempenho</p>
            </div>

            <div className="mt-4 md:mt-0 flex items-center space-x-3">
              {/* Export Button */}
              <button
                onClick={() => setShowExportModal(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap flex items-center space-x-2"
              >
                <i className="ri-download-line"></i>
                <span>Exportar PDF</span>
              </button>

              {/* Time Filter */}
              <div className="flex items-center space-x-2 bg-white rounded-xl p-1 shadow-sm border border-gray-200">
                {[
                  { value: '7d', label: '7 dias' },
                  { value: '30d', label: '30 dias' },
                  { value: '90d', label: '90 dias' },
                  { value: '365d', label: '1 ano' },
                  { value: 'all', label: 'Tudo' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setTimeFilter(option.value as TimeFilter)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      timeFilter === option.value
                        ? 'bg-amber-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Risk Alert Banner */}
          {alerts.length > 0 && (
            <div className={`mb-6 rounded-xl p-4 border ${
              riskLevel === 'critical' ? 'bg-red-50 border-red-200' :
              riskLevel === 'high' ? 'bg-orange-50 border-orange-200' :
              riskLevel === 'moderate' ? 'bg-amber-50 border-amber-200' :
              'bg-yellow-50 border-yellow-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    riskLevel === 'critical' ? 'bg-red-100' :
                    riskLevel === 'high' ? 'bg-orange-100' :
                    riskLevel === 'moderate' ? 'bg-amber-100' : 'bg-yellow-100'
                  }`}>
                    <i className={`ri-mental-health-line text-2xl ${
                      riskLevel === 'critical' ? 'text-red-600' :
                      riskLevel === 'high' ? 'text-orange-600' :
                      riskLevel === 'moderate' ? 'text-amber-600' : 'text-yellow-600'
                    }`}></i>
                  </div>
                  <div>
                    <h3 className={`font-bold ${
                      riskLevel === 'critical' ? 'text-red-900' :
                      riskLevel === 'high' ? 'text-orange-900' :
                      riskLevel === 'moderate' ? 'text-amber-900' : 'text-yellow-900'
                    }`}>
                      {alerts.length} Alerta{alerts.length > 1 ? 's' : ''} de Jogo Detetado{alerts.length > 1 ? 's' : ''}
                    </h3>
                    <p className={`text-sm ${
                      riskLevel === 'critical' ? 'text-red-700' :
                      riskLevel === 'high' ? 'text-orange-700' :
                      riskLevel === 'moderate' ? 'text-amber-700' : 'text-yellow-700'
                    }`}>
                      Nível de risco: <strong className="uppercase">{
                        riskLevel === 'critical' ? 'Crítico' :
                        riskLevel === 'high' ? 'Alto' :
                        riskLevel === 'moderate' ? 'Moderado' : 'Baixo'
                      }</strong> ({riskScore}%)
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        riskLevel === 'critical' ? 'bg-red-500' :
                        riskLevel === 'high' ? 'bg-orange-500' :
                        riskLevel === 'moderate' ? 'bg-amber-500' : 'bg-yellow-500'
                      }`}
                      style={{ width: `${riskScore}%` }}
                    ></div>
                  </div>
                  <span className="text-xs text-gray-500">Clique no ícone abaixo para ver detalhes</span>
                </div>
              </div>
            </div>
          )}

          {/* Main Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <i className="ri-ticket-line text-amber-600 text-xl"></i>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    betStats.winRate >= 50 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {betStats.winRate.toFixed(1)}% win
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{betStats.total}</div>
              <div className="text-sm text-gray-500">Total de Apostas</div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <i className="ri-trophy-line text-green-600 text-xl"></i>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
                  {betStats.won} ganhas
                </span>
              </div>
              <div className="text-2xl font-bold text-green-600">€{betStats.totalWon.toFixed(2)}</div>
              <div className="text-sm text-gray-500">Total Ganho</div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <i className="ri-money-euro-circle-line text-red-600 text-xl"></i>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-700">
                  {betStats.lost} perdidas
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900">€{betStats.totalStaked.toFixed(2)}</div>
              <div className="text-sm text-gray-500">Total Apostado</div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    betStats.netProfit >= 0 ? 'bg-green-100' : 'bg-red-100'
                  }`}
                >
                  <i
                    className={`ri-line-chart-line text-xl ${
                      betStats.netProfit >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  ></i>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    betStats.roi >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {betStats.roi >= 0 ? '+' : ''}
                  {betStats.roi.toFixed(1)}% ROI
                </span>
              </div>
              <div
                className={`text-2xl font-bold ${
                  betStats.netProfit >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {betStats.netProfit >= 0 ? '+' : ''}€{betStats.netProfit.toFixed(2)}
              </div>
              <div className="text-sm text-gray-500">Lucro/Prejuízo</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Betting Activity Chart */}
            <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                <i className="ri-bar-chart-2-line text-amber-600 mr-2"></i>
                Atividade de Apostas
              </h3>

              {dailyBetData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <i className="ri-bar-chart-box-line text-4xl text-gray-300 mb-2"></i>
                    <p>Sem dados para o período selecionado</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {dailyBetData.map((day, index) => (
                    <div key={index} className="flex items-center space-x-4">
                      <div className="w-20 text-xs text-gray-500 text-right">{day.date}</div>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                          style={{ width: `${(day.staked / maxBarValue) * 100}%` }}
                        ></div>
                        {day.won > 0 && (
                          <div
                            className="absolute top-0 h-full bg-green-500/30 rounded-full"
                            style={{ width: `${(day.won / maxBarValue) * 100}%` }}
                          ></div>
                        )}
                      </div>
                      <div className="w-24 text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          €{day.staked.toFixed(0)}
                        </span>
                        <span className="text-xs text-gray-500 ml-1">({day.bets})</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-center space-x-6 mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                  <span className="text-xs text-gray-600">Apostado</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500/50 rounded-full"></div>
                  <span className="text-xs text-gray-600">Ganho</span>
                </div>
              </div>
            </div>

            {/* Bet Distribution */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                <i className="ri-pie-chart-line text-amber-600 mr-2"></i>
                Distribuição
              </h3>

              <div className="space-y-4">
                {/* Win/Loss Distribution */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-600">Resultado</span>
                    <span className="font-semibold">{betStats.won + betStats.lost} resolvidas</span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{
                        width: `${
                          betStats.won + betStats.lost > 0
                            ? (betStats.won / (betStats.won + betStats.lost)) * 100
                            : 0
                        }%`,
                      }}
                    ></div>
                    <div
                      className="h-full bg-red-500 transition-all"
                      style={{
                        width: `${
                          betStats.won + betStats.lost > 0
                            ? (betStats.lost / (betStats.won + betStats.lost)) * 100
                            : 0
                        }%`,
                      }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-green-600">{betStats.won} ganhas</span>
                    <span className="text-red-600">{betStats.lost} perdidas</span>
                  </div>
                </div>

                {/* Bet Type Distribution */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-600">Tipo de Aposta</span>
                    <span className="font-semibold">{betStats.total} total</span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-amber-500 transition-all"
                      style={{
                        width: `${betStats.total > 0 ? (betStats.simple / betStats.total) * 100 : 0}%`,
                      }}
                    ></div>
                    <div
                      className="h-full bg-purple-500 transition-all"
                      style={{
                        width: `${betStats.total > 0 ? (betStats.multiple / betStats.total) * 100 : 0}%`,
                      }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-amber-600">{betStats.simple} simples</span>
                    <span className="text-purple-600">{betStats.multiple} múltiplas</span>
                  </div>
                </div>

                {/* Average Stats */}
                <div className="pt-4 border-t border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Aposta Média</span>
                    <span className="font-bold text-gray-900">€{betStats.avgStake.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Odd Média</span>
                    <span className="font-bold text-gray-900">{betStats.avgOdd.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Pendentes</span>
                    <span className="font-bold text-amber-600">{betStats.pending}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Top Sports */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                <i className="ri-football-line text-amber-600 mr-2"></i>
                Desportos Mais Apostados
              </h3>

              {sportStats.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <i className="ri-football-line text-4xl text-gray-300 mb-2"></i>
                    <p>Sem dados disponíveis</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {sportStats.map((sport, index) => (
                    <div key={sport.name} className="flex items-center space-x-4">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm ${
                          index === 0
                            ? 'bg-amber-500'
                            : index === 1
                            ? 'bg-gray-400'
                            : index === 2
                            ? 'bg-amber-700'
                            : 'bg-gray-300'
                        }`}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-gray-900">{sport.name}</span>
                          <span className="text-sm text-gray-600">{sport.count} apostas</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                            style={{ width: `${(sport.count / sportStats[0].count) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-gray-900">
                          €{sport.staked.toFixed(0)}
                        </div>
                        <div className="text-xs text-green-600">
                          +€{sport.won.toFixed(0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Financial Summary */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                <i className="ri-wallet-3-line text-amber-600 mr-2"></i>
                Resumo Financeiro
              </h3>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <i className="ri-arrow-down-line text-green-600 text-xl"></i>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Depósitos</div>
                      <div className="text-xs text-gray-500">{financeStats.deposits} transações</div>
                    </div>
                  </div>
                  <div className="text-xl font-bold text-green-600">
                    +€{financeStats.totalDeposits.toFixed(2)}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <i className="ri-arrow-up-line text-blue-600 text-xl"></i>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Levantamentos</div>
                      <div className="text-xs text-gray-500">{financeStats.withdrawals} transações</div>
                    </div>
                  </div>
                  <div className="text-xl font-bold text-blue-600">
                    -€{financeStats.totalWithdrawals.toFixed(2)}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-purple-50 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <i className="ri-gift-line text-purple-600 text-xl"></i>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Bónus</div>
                      <div className="text-xs text-gray-500">Recebidos</div>
                    </div>
                  </div>
                  <div className="text-xl font-bold text-purple-600">
                    +€{financeStats.totalBonuses.toFixed(2)}
                  </div>
                </div>

                <div
                  className={`flex items-center justify-between p-4 rounded-xl ${
                    financeStats.netFlow >= 0 ? 'bg-amber-50' : 'bg-red-50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        financeStats.netFlow >= 0 ? 'bg-amber-100' : 'bg-red-100'
                      }`}
                    >
                      <i
                        className={`ri-exchange-line text-xl ${
                          financeStats.netFlow >= 0 ? 'text-amber-600' : 'text-red-600'
                        }`}
                      ></i>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Fluxo Líquido</div>
                      <div className="text-xs text-gray-500">Depósitos - Levantamentos</div>
                    </div>
                  </div>
                  <div
                    className={`text-xl font-bold ${
                      financeStats.netFlow >= 0 ? 'text-amber-600' : 'text-red-600'
                    }`}
                  >
                    {financeStats.netFlow >= 0 ? '+' : ''}€{financeStats.netFlow.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Current Balance */}
              <div className="mt-6 p-4 bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-amber-100 text-sm">Saldo Atual</div>
                    <div className="text-3xl font-bold">
                      €{profile?.balance?.toFixed(2) ?? '0.00'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-amber-100 text-sm">Free Bets</div>
                    <div className="text-xl font-bold">
                      €{profile?.free_bet_balance?.toFixed(2) ?? '0.00'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Responsible Gaming Alert */}
          <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl border border-teal-200 p-6">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <i className="ri-heart-pulse-line text-teal-600 text-2xl"></i>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-teal-900 mb-1">Jogue com Responsabilidade</h3>
                <p className="text-sm text-teal-700 mb-3">
                  Estas estatísticas ajudam‑lo a compreender os seus hábitos de jogo. Se sentir que está a
                  perder o controlo, considere definir limites ou fazer uma pausa.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => navigate('/perfil')}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-settings-3-line mr-1"></i>
                    Definir Limites
                  </button>
                  <a
                    href="https://www.jogadoresseguros.pt"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-white hover:bg-teal-50 text-teal-700 rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap border border-teal-200"
                  >
                    <i className="ri-external-link-line mr-1"></i>
                    Obter Ajuda
                  </a>
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

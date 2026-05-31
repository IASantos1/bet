
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Header from '../../components/feature/Header';
import Footer from '../../components/feature/Footer';
import { MobileBottomNav } from '../../components/feature/MobileBottomNav';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTransactions } from '../../hooks/useTransactions';

export default function TransactionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { transactions, loading, refetch } = useTransactions();

  const [filter, setFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const isDark = theme === 'dark';

  // Redirect unauthenticated users
  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  // -------------------- Filtering & Sorting --------------------
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    // Filter by type
    if (filter !== 'all') {
      result = result.filter(t => t.type === filter);
    }

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter(t => t.status === statusFilter);
    }

    // Filter by date range
    if (dateRange !== 'all') {
      const now = new Date();
      let startDate: Date;

      switch (dateRange) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case '3months':
          startDate = new Date(now.setMonth(now.getMonth() - 3));
          break;
        default:
          startDate = new Date(0);
      }

      result = result.filter(t => new Date(t.created_at) >= startDate);
    }

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.description?.toLowerCase().includes(query) ||
        t.payment_method?.toLowerCase().includes(query) ||
        t.id.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      }
      return sortOrder === 'desc' ? b.amount - a.amount : a.amount - b.amount;
    });

    return result;
  }, [transactions, filter, statusFilter, dateRange, searchQuery, sortBy, sortOrder]);

  // Pagination
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

  // -------------------- Statistics --------------------
  const stats = useMemo(() => {
    const deposits = transactions.filter(t => t.type === 'deposit' && t.status === 'completed');
    const withdrawals = transactions.filter(t => t.type === 'withdrawal' && t.status === 'completed');
    const bets = transactions.filter(t => t.type === 'bet');
    const wins = transactions.filter(t => t.type === 'win' || t.type === 'cashout');

    return {
      totalDeposits: deposits.reduce((sum, t) => sum + t.amount, 0),
      totalWithdrawals: withdrawals.reduce((sum, t) => sum + t.amount, 0),
      totalBets: bets.reduce((sum, t) => sum + t.amount, 0),
      totalWins: wins.reduce((sum, t) => sum + t.amount, 0),
      depositCount: deposits.length,
      withdrawalCount: withdrawals.length,
      betCount: bets.length,
      winCount: wins.length,
    };
  }, [transactions]);

  // -------------------- Helper Functions --------------------
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'deposit': return 'ri-add-circle-line';
      case 'withdrawal': return 'ri-send-plane-line';
      case 'bet': return 'ri-ticket-line';
      case 'win': return 'ri-trophy-line';
      case 'cashout': return 'ri-hand-coin-line';
      default: return 'ri-exchange-line';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'deposit': return 'text-green-500 bg-green-500/10';
      case 'withdrawal': return 'text-red-500 bg-red-500/10';
      case 'bet': return 'text-amber-500 bg-amber-500/10';
      case 'win': return 'text-teal-500 bg-teal-500/10';
      case 'cashout': return 'text-indigo-500 bg-indigo-500/10';
      default: return 'text-gray-500 bg-gray-500/10';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-0.5 bg-green-500/10 text-green-600 rounded-full text-[10px] font-medium">Concluído</span>;
      case 'pending':
        return <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 rounded-full text-[10px] font-medium">Pendente</span>;
      case 'failed':
        return <span className="px-2 py-0.5 bg-red-500/10 text-red-600 rounded-full text-[10px] font-medium">Falhado</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 bg-gray-500/10 text-gray-600 rounded-full text-[10px] font-medium">Cancelado</span>;
      default:
        return <span className="px-2 py-0.5 bg-gray-500/10 text-gray-600 rounded-full text-[10px] font-medium">{status}</span>;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'deposit': return 'Depósito';
      case 'withdrawal': return 'Levantamento';
      case 'bet': return 'Aposta';
      case 'win': return 'Ganho';
      case 'cashout': return 'Cash Out';
      default: return type;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // -------------------- Loading State --------------------
  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className={`font-semibold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>A carregar transações...</p>
        </div>
      </div>
    );
  }

  // -------------------- Main Render --------------------
  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`} style={{ fontFamily: 'Inter, sans-serif' }}>
      <Header />

      <main className="flex-1 pt-20 pb-24 lg:pb-8">
        <div className="max-w-6xl mx-auto px-4">

          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors cursor-pointer ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
              >
                <i className={`ri-arrow-left-line text-xl ${isDark ? 'text-gray-300' : 'text-gray-700'}`}></i>
              </button>
              <div>
                <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Histórico de Transações</h1>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {filteredTransactions.length} transações encontradas
                </p>
              </div>
            </div>
            <button
              onClick={() => refetch()}
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors cursor-pointer ${isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              <i className={`ri-refresh-line text-lg ${isDark ? 'text-gray-300' : 'text-gray-600'}`}></i>
            </button>
          </div>

          <p className={`text-xs mb-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Aqui encontras o registo completo de depósitos, levantamentos, apostas e ganhos da tua conta.
          </p>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white shadow-sm'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                  <i className="ri-add-circle-line text-green-500"></i>
                </div>
                <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Depósitos</span>
              </div>
              <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>€{stats.totalDeposits.toFixed(2)}</p>
              <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{stats.depositCount} transações</p>
            </div>

            <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white shadow-sm'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center">
                  <i className="ri-send-plane-line text-red-500"></i>
                </div>
                <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Levantamentos</span>
              </div>
              <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>€{stats.totalWithdrawals.toFixed(2)}</p>
              <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{stats.withdrawalCount} transações</p>
            </div>

            <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white shadow-sm'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
                  <i className="ri-ticket-line text-amber-500"></i>
                </div>
                <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Apostas</span>
              </div>
              <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>€{stats.totalBets.toFixed(2)}</p>
              <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{stats.betCount} apostas</p>
            </div>

            <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white shadow-sm'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-teal-500/10 rounded-lg flex items-center justify-center">
                  <i className="ri-trophy-line text-teal-500"></i>
                </div>
                <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Ganhos</span>
              </div>
              <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>€{stats.totalWins.toFixed(2)}</p>
              <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{stats.winCount} ganhos</p>
            </div>
          </div>

          {/* Filters */}
          <div className={`rounded-xl p-4 mb-4 ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white shadow-sm'}`}>
            <div className="flex flex-col lg:flex-row gap-3">
              {/* Search */}
              <div className="flex-1">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <i className={`ri-search-line ${isDark ? 'text-gray-400' : 'text-gray-500'}`}></i>
                  <input
                    type="text"
                    placeholder="Pesquisar por ID, descrição..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`flex-1 bg-transparent text-sm outline-none ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
                  />
                </div>
              </div>

              {/* Type Filter */}
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className={`px-3 py-2 rounded-lg text-sm cursor-pointer ${isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-gray-100 text-gray-900'}`}
              >
                <option value="all">Todos os tipos</option>
                <option value="deposit">Depósitos</option>
                <option value="withdrawal">Levantamentos</option>
                <option value="bet">Apostas</option>
                <option value="win">Ganhos</option>
                <option value="cashout">Cash Out</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`px-3 py-2 rounded-lg text-sm cursor-pointer ${isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-gray-100 text-gray-900'}`}
              >
                <option value="all">Todos os status</option>
                <option value="completed">Concluído</option>
                <option value="pending">Pendente</option>
                <option value="failed">Falhado</option>
                <option value="cancelled">Cancelado</option>
              </select>

              {/* Date Filter */}
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className={`px-3 py-2 rounded-lg text-sm cursor-pointer ${isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-gray-100 text-gray-900'}`}
              >
                <option value="all">Todo o período</option>
                <option value="today">Hoje</option>
                <option value="week">Última semana</option>
                <option value="month">Último mês</option>
                <option value="3months">Últimos 3 meses</option>
              </select>

              {/* Sorting */}
              <div className="flex items-center gap-1">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'amount')}
                  className={`px-3 py-2 rounded-lg text-sm cursor-pointer ${isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-gray-100 text-gray-900'}`}
                >
                  <option value="date">Data</option>
                  <option value="amount">Valor</option>
                </select>
                <button
                  onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                  className={`w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  <i className={`${sortOrder === 'desc' ? 'ri-sort-desc' : 'ri-sort-asc'} ${isDark ? 'text-gray-300' : 'text-gray-600'}`}></i>
                </button>
              </div>
            </div>
          </div>

          {/* Transaction List */}
          <div className={`rounded-xl overflow-hidden ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white shadow-sm'}`}>
            {paginatedTransactions.length === 0 ? (
              <div className="p-12 text-center">
                <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <i className={`ri-exchange-line text-2xl ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                </div>
                <p className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Nenhuma transação encontrada</p>
                <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Ajusta os filtros ou faz o teu primeiro depósito</p>
              </div>
            ) : (
              <>
                {/* Table Header – Desktop */}
                <div className={`hidden lg:grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium ${isDark ? 'bg-gray-700/50 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                  <div className="col-span-3">Transação</div>
                  <div className="col-span-2">Tipo</div>
                  <div className="col-span-2">Método</div>
                  <div className="col-span-2 text-right">Valor</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-1"></div>
                </div>

                {/* List */}
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {paginatedTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className={`p-4 transition-colors cursor-pointer ${isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}`}
                      onClick={() => setSelectedTransaction(tx)}
                    >
                      {/* Mobile */}
                      <div className="lg:hidden">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getTypeColor(tx.type)}`}>
                              <i className={getTypeIcon(tx.type)}></i>
                            </div>
                            <div>
                              <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{getTypeName(tx.type)}</p>
                              <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{formatDate(tx.created_at)}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-bold ${tx.type === 'deposit' || tx.type === 'win' || tx.type === 'cashout' ? 'text-green-500' : isDark ? 'text-white' : 'text-gray-900'}`}>
                              {tx.type === 'deposit' || tx.type === 'win' || tx.type === 'cashout' ? '+' : '-'}€{tx.amount.toFixed(2)}
                            </p>
                            {getStatusBadge(tx.status)}
                          </div>
                        </div>
                        {tx.description && (
                          <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{tx.description}</p>
                        )}
                      </div>

                      {/* Desktop */}
                      <div className="hidden lg:grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-3">
                          <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{formatDate(tx.created_at)}</p>
                          <p className={`text-[10px] font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>#{tx.id.slice(0, 8)}</p>
                        </div>
                        <div className="col-span-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${getTypeColor(tx.type)}`}>
                              <i className={`${getTypeIcon(tx.type)} text-sm`}></i>
                            </div>
                            <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{getTypeName(tx.type)}</span>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{tx.payment_method || '—'}</span>
                        </div>
                        <div className="col-span-2 text-right">
                          <p className={`text-sm font-bold ${tx.type === 'deposit' || tx.type === 'win' || tx.type === 'cashout' ? 'text-green-500' : tx.type === 'withdrawal' ? 'text-red-500' : isDark ? 'text-white' : 'text-gray-900'}`}>
                            {tx.type === 'deposit' || tx.type === 'win' || tx.type === 'cashout' ? '+' : '-'}€{tx.amount.toFixed(2)}
                          </p>
                        </div>
                        <div className="col-span-2">
                          {getStatusBadge(tx.status)}
                        </div>
                        <div className="col-span-1 text-right">
                          <i className={`ri-arrow-right-s-line ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className={`flex items-center justify-between px-4 py-3 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Página {currentPage} de {totalPages}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
                      >
                        <i className={`ri-arrow-left-s-line ${isDark ? 'text-gray-300' : 'text-gray-600'}`}></i>
                      </button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-medium cursor-pointer ${
                              currentPage === pageNum
                                ? 'bg-amber-500 text-white'
                                : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
                      >
                        <i className={`ri-arrow-right-s-line ${isDark ? 'text-gray-300' : 'text-gray-600'}`}></i>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Back to Wallet Link */}
          <div className="mt-4 flex justify-center">
            <Link
              to="/carteira"
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'}`}
            >
              <i className="ri-wallet-3-line"></i>
              Voltar à Carteira
            </Link>
          </div>
        </div>
      </main>

      <Footer />
      <MobileBottomNav />

      {/* Transaction Details Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedTransaction(null)}>
          <div
            className={`w-full max-w-md rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Detalhes da Transação</h3>
              <button
                onClick={() => setSelectedTransaction(null)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                <i className={`ri-close-line ${isDark ? 'text-gray-400' : 'text-gray-500'}`}></i>
              </button>
            </div>

            <div className="space-y-4">
              {/* Type & Amount */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getTypeColor(selectedTransaction.type)}`}>
                    <i className={`${getTypeIcon(selectedTransaction.type)} text-xl`}></i>
                  </div>
                  <div>
                    <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{getTypeName(selectedTransaction.type)}</p>
                    {getStatusBadge(selectedTransaction.status)}
                  </div>
                </div>
                <p className={`text-2xl font-bold ${selectedTransaction.type === 'deposit' || selectedTransaction.type === 'win' || selectedTransaction.type === 'cashout' ? 'text-green-500' : selectedTransaction.type === 'withdrawal' ? 'text-red-500' : isDark ? 'text-white' : 'text-gray-900'}`}>
                  {selectedTransaction.type === 'deposit' || selectedTransaction.type === 'win' || selectedTransaction.type === 'cashout' ? '+' : '-'}€{selectedTransaction.amount.toFixed(2)}
                </p>
              </div>

              {/* Details */}
              <div className={`rounded-xl p-4 space-y-3 ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <div className="flex justify-between">
                  <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>ID</span>
                  <span className={`text-sm font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{selectedTransaction.id.slice(0, 16)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Data</span>
                  <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{formatDate(selectedTransaction.created_at)}</span>
                </div>
                {selectedTransaction.completed_at && (
                  <div className="flex justify-between">
                    <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Concluído</span>
                    <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{formatDate(selectedTransaction.completed_at)}</span>
                  </div>
                )}
                {selectedTransaction.payment_method && (
                  <div className="flex justify-between">
                    <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Método</span>
                    <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{selectedTransaction.payment_method}</span>
                  </div>
                )}
                {selectedTransaction.description && (
                  <div className="flex justify-between">
                    <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Descrição</span>
                    <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{selectedTransaction.description}</span>
                  </div>
                )}
                {selectedTransaction.external_id && (
                  <div className="flex justify-between">
                    <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Ref. Externa</span>
                    <span className={`text-sm font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{selectedTransaction.external_id.slice(0, 12)}...</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedTransaction.id);
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  <i className="ri-file-copy-line mr-2"></i>
                  Copiar ID
                </button>
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

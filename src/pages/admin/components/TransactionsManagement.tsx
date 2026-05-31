import { useState, useEffect } from 'react';
import { apiFetch } from '../../../services/backendClient';

interface Transaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  status: string;
  payment_method: string;
  created_at: string;
  user?: {
    email: string;
    full_name: string | null;
  };
}

export default function TransactionsManagement() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/admin/transactions', { method: 'GET' });
      setTransactions(data.transactions || []);
    } catch (error) {
      console.error('Erro ao carregar transações:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (transactionId: string, newStatus: string) => {
    try {
      await apiFetch(`/admin/transactions/${transactionId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchTransactions();
    } catch (error) {
      console.error('Erro ao atualizar transação:', error);
    }
  };

  const filteredTransactions = transactions.filter(transaction => {
    const matchesSearch = transaction.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.user?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || transaction.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || transaction.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  // Stats
  const totalDeposits = filteredTransactions
    .filter(t => t.type === 'deposit' && t.status === 'completed')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  
  const totalWithdrawals = filteredTransactions
    .filter(t => t.type === 'withdrawal' && t.status === 'completed')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  
  const pendingTransactions = filteredTransactions.filter(t => t.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestão de Transações</h1>
          <p className="text-gray-400 text-sm mt-1">{transactions.length} transações no total</p>
        </div>
        <button
          onClick={fetchTransactions}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
        >
          <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`}></i>
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Total Transações</p>
          <p className="text-xl font-bold text-white">{filteredTransactions.length}</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Total Depósitos</p>
          <p className="text-xl font-bold text-green-400">{formatCurrency(totalDeposits)}</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Total Levantamentos</p>
          <p className="text-xl font-bold text-red-400">{formatCurrency(totalWithdrawals)}</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Pendentes</p>
          <p className="text-xl font-bold text-yellow-400">{pendingTransactions}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input
            type="text"
            placeholder="Pesquisar por utilizador..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="all">Todos os tipos</option>
          <option value="deposit">Depósitos</option>
          <option value="withdrawal">Levantamentos</option>
          <option value="bet">Apostas</option>
          <option value="win">Ganhos</option>
          <option value="cashout">Cashout</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="all">Todos os estados</option>
          <option value="pending">Pendentes</option>
          <option value="completed">Concluídas</option>
          <option value="failed">Falhadas</option>
          <option value="cancelled">Canceladas</option>
        </select>
      </div>

      {/* Transactions Table */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Utilizador</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Valor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Método</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Data</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-700/50">
                    <td className="px-4 py-4" colSpan={7}>
                      <div className="h-10 bg-gray-700 rounded animate-pulse"></div>
                    </td>
                  </tr>
                ))
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Nenhuma transação encontrada
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-sm font-medium text-white">{transaction.user?.full_name || 'Sem nome'}</p>
                        <p className="text-xs text-gray-400">{transaction.user?.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <i className={`${getTransactionIcon(transaction.type)} ${getTransactionColor(transaction.type)}`}></i>
                        <span className="text-sm text-white">{getTransactionTypeLabel(transaction.type)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className={`text-sm font-semibold ${getAmountColor(transaction.type)}`}>
                        {transaction.type === 'withdrawal' || transaction.type === 'bet' ? '-' : '+'}
                        {formatCurrency(transaction.amount)}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-gray-300">{transaction.payment_method || '-'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getStatusColor(transaction.status)}`}>
                        {getStatusLabel(transaction.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-gray-400">{formatDate(transaction.created_at)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {transaction.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(transaction.id, 'completed')}
                              className="w-8 h-8 flex items-center justify-center bg-green-500/20 hover:bg-green-500/30 rounded-lg text-green-400 transition-colors cursor-pointer"
                              title="Aprovar"
                            >
                              <i className="ri-check-line"></i>
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(transaction.id, 'failed')}
                              className="w-8 h-8 flex items-center justify-center bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 transition-colors cursor-pointer"
                              title="Rejeitar"
                            >
                              <i className="ri-close-line"></i>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR'
  }).format(value);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getTransactionIcon(type: string): string {
  const icons: Record<string, string> = {
    deposit: 'ri-arrow-down-line',
    withdrawal: 'ri-arrow-up-line',
    bet: 'ri-ticket-line',
    win: 'ri-trophy-line',
    cashout: 'ri-money-euro-circle-line'
  };
  return icons[type] || 'ri-exchange-line';
}

function getTransactionColor(type: string): string {
  const colors: Record<string, string> = {
    deposit: 'text-green-400',
    withdrawal: 'text-red-400',
    bet: 'text-blue-400',
    win: 'text-amber-400',
    cashout: 'text-purple-400'
  };
  return colors[type] || 'text-gray-400';
}

function getAmountColor(type: string): string {
  if (type === 'withdrawal' || type === 'bet') return 'text-red-400';
  return 'text-green-400';
}

function getTransactionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    deposit: 'Depósito',
    withdrawal: 'Levantamento',
    bet: 'Aposta',
    win: 'Ganho',
    cashout: 'Cashout'
  };
  return labels[type] || type;
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    completed: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
    cancelled: 'bg-gray-500/20 text-gray-400'
  };
  return colors[status] || 'bg-gray-500/20 text-gray-400';
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pendente',
    completed: 'Concluída',
    failed: 'Falhada',
    cancelled: 'Cancelada'
  };
  return labels[status] || status;
}

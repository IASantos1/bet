import { useState, useEffect } from 'react';
import { apiFetch } from '../../../services/backendClient';

interface Bet {
  id: string;
  user_id: string;
  bet_type: string;
  stake: number;
  potential_win: number;
  total_odds: number;
  status: string;
  is_free_bet: boolean;
  winnings: number | null;
  created_at: string;
  user?: {
    email: string;
    full_name: string | null;
  };
}

export default function BetsManagement() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    fetchBets();
  }, []);

  const fetchBets = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/admin/bets', { method: 'GET' });
      setBets(data.bets || []);
    } catch (error) {
      console.error('Erro ao carregar apostas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (betId: string, newStatus: string) => {
    try {
      await apiFetch(`/admin/bets/${betId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchBets();
    } catch (error) {
      console.error('Erro ao atualizar aposta:', error);
    }
  };

  const filteredBets = bets.filter(bet => {
    const matchesSearch = bet.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bet.user?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || bet.status === statusFilter;
    const matchesType = typeFilter === 'all' || bet.bet_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getBetTypeLabel = (type: string) => {
    switch (type) {
      case 'single': return 'Simples';
      case 'multiple': return 'Múltipla';
      case 'system': return 'Sistema';
      default: return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-400';
      case 'won': return 'bg-green-500/20 text-green-400';
      case 'lost': return 'bg-red-500/20 text-red-400';
      case 'cashout': return 'bg-purple-500/20 text-purple-400';
      case 'void': return 'bg-gray-500/20 text-gray-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendente';
      case 'won': return 'Ganha';
      case 'lost': return 'Perdida';
      case 'cashout': return 'Cashout';
      case 'void': return 'Anulada';
      default: return status;
    }
  };

  // Stats
  const totalStake = filteredBets.reduce((sum, bet) => sum + Number(bet.stake), 0);
  const totalPotentialWin = filteredBets.reduce((sum, bet) => sum + Number(bet.potential_win), 0);
  const pendingBets = filteredBets.filter(b => b.status === 'pending').length;
  const wonBets = filteredBets.filter(b => b.status === 'won').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestão de Apostas</h1>
          <p className="text-gray-400 text-sm mt-1">{bets.length} apostas no total</p>
        </div>
        <button
          onClick={fetchBets}
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
          <p className="text-gray-400 text-xs mb-1">Total Apostado</p>
          <p className="text-xl font-bold text-white">{formatCurrency(totalStake)}</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Ganhos Potenciais</p>
          <p className="text-xl font-bold text-amber-400">{formatCurrency(totalPotentialWin)}</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Apostas Pendentes</p>
          <p className="text-xl font-bold text-yellow-400">{pendingBets}</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Apostas Ganhas</p>
          <p className="text-xl font-bold text-green-400">{wonBets}</p>
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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="all">Todos os estados</option>
          <option value="pending">Pendentes</option>
          <option value="won">Ganhas</option>
          <option value="lost">Perdidas</option>
          <option value="cashout">Cashout</option>
          <option value="void">Anuladas</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="all">Todos os tipos</option>
          <option value="single">Simples</option>
          <option value="multiple">Múltiplas</option>
          <option value="system">Sistema</option>
        </select>
      </div>

      {/* Bets Table */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Utilizador</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Valor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Odds</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Ganho Pot.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Data</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-700/50">
                    <td className="px-4 py-4" colSpan={8}>
                      <div className="h-10 bg-gray-700 rounded animate-pulse"></div>
                    </td>
                  </tr>
                ))
              ) : filteredBets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    Nenhuma aposta encontrada
                  </td>
                </tr>
              ) : (
                filteredBets.map((bet) => (
                  <tr key={bet.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-sm font-medium text-white">{bet.user?.full_name || 'Sem nome'}</p>
                        <p className="text-xs text-gray-400">{bet.user?.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white">{getBetTypeLabel(bet.bet_type)}</span>
                        {bet.is_free_bet && (
                          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">Free</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold text-white">{formatCurrency(bet.stake)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-amber-400 font-medium">{bet.total_odds.toFixed(2)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-green-400 font-medium">{formatCurrency(bet.potential_win)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getStatusColor(bet.status)}`}>
                        {getStatusLabel(bet.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-gray-400">{formatDate(bet.created_at)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {bet.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(bet.id, 'won')}
                              className="w-8 h-8 flex items-center justify-center bg-green-500/20 hover:bg-green-500/30 rounded-lg text-green-400 transition-colors cursor-pointer"
                              title="Marcar como Ganha"
                            >
                              <i className="ri-check-line"></i>
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(bet.id, 'lost')}
                              className="w-8 h-8 flex items-center justify-center bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 transition-colors cursor-pointer"
                              title="Marcar como Perdida"
                            >
                              <i className="ri-close-line"></i>
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(bet.id, 'void')}
                              className="w-8 h-8 flex items-center justify-center bg-gray-500/20 hover:bg-gray-500/30 rounded-lg text-gray-400 transition-colors cursor-pointer"
                              title="Anular"
                            >
                              <i className="ri-forbid-line"></i>
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

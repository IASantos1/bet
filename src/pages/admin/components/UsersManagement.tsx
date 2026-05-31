import { useState, useEffect } from 'react';
import { apiFetch } from '../../../services/backendClient';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  balance: number;
  status: string;
  is_admin: boolean;
  created_at: string;
  kyc_verified: boolean;
  phone: string | null;
}

export default function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/admin/users', { method: 'GET' });
      setUsers(data.users || []);
    } catch (error) {
      console.error('Erro ao carregar utilizadores:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (userId: string, newStatus: string) => {
    try {
      await apiFetch(`/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchUsers();
    } catch (error) {
      console.error('Erro ao atualizar utilizador:', error);
    }
  };

  const handleToggleAdmin = async (userId: string, isAdmin: boolean) => {
    try {
      await apiFetch(`/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ is_admin: !isAdmin }),
      });
      await fetchUsers();
    } catch (error) {
      console.error('Erro ao atualizar permissões:', error);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    return matchesSearch && matchesStatus;
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
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400';
      case 'suspended': return 'bg-red-500/20 text-red-400';
      case 'self_excluded': return 'bg-orange-500/20 text-orange-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Ativo';
      case 'suspended': return 'Suspenso';
      case 'self_excluded': return 'Auto-excluído';
      default: return status;
    }
  };

  // Stats
  const totalBalance = filteredUsers.reduce((sum, user) => sum + Number(user.balance), 0);
  const activeUsers = filteredUsers.filter(u => u.status === 'active').length;
  const verifiedUsers = filteredUsers.filter(u => u.kyc_verified).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestão de Utilizadores</h1>
          <p className="text-gray-400 text-sm mt-1">{users.length} utilizadores no total</p>
        </div>
        <button
          onClick={fetchUsers}
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
          <p className="text-gray-400 text-xs mb-1">Total Utilizadores</p>
          <p className="text-xl font-bold text-white">{filteredUsers.length}</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Utilizadores Ativos</p>
          <p className="text-xl font-bold text-green-400">{activeUsers}</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Verificados KYC</p>
          <p className="text-xl font-bold text-blue-400">{verifiedUsers}</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">Saldo Total</p>
          <p className="text-xl font-bold text-amber-400">{formatCurrency(totalBalance)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input
            type="text"
            placeholder="Pesquisar por nome ou email..."
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
          <option value="active">Ativos</option>
          <option value="suspended">Suspensos</option>
          <option value="self_excluded">Auto-excluídos</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Utilizador</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Saldo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">KYC</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Registo</th>
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
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Nenhum utilizador encontrado
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-red-500 rounded-full flex items-center justify-center text-white font-bold">
                          {user.full_name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{user.full_name || 'Sem nome'}</p>
                          {user.is_admin && (
                            <span className="text-xs text-amber-400">Admin</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-gray-300">{user.email}</p>
                      {user.phone && (
                        <p className="text-xs text-gray-500">{user.phone}</p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold text-white">{formatCurrency(user.balance)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getStatusColor(user.status)}`}>
                        {getStatusLabel(user.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {user.kyc_verified ? (
                        <span className="inline-flex items-center gap-1 text-green-400 text-sm">
                          <i className="ri-checkbox-circle-fill"></i>
                          Verificado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-400 text-sm">
                          <i className="ri-close-circle-line"></i>
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-gray-400">{formatDate(user.created_at)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {user.status === 'active' ? (
                          <button
                            onClick={() => handleUpdateStatus(user.id, 'suspended')}
                            className="w-8 h-8 flex items-center justify-center bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 transition-colors cursor-pointer"
                            title="Suspender"
                          >
                            <i className="ri-forbid-line"></i>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateStatus(user.id, 'active')}
                            className="w-8 h-8 flex items-center justify-center bg-green-500/20 hover:bg-green-500/30 rounded-lg text-green-400 transition-colors cursor-pointer"
                            title="Ativar"
                          >
                            <i className="ri-check-line"></i>
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleAdmin(user.id, user.is_admin)}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                            user.is_admin
                              ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400'
                              : 'bg-gray-500/20 hover:bg-gray-500/30 text-gray-400'
                          }`}
                          title={user.is_admin ? 'Remover Admin' : 'Tornar Admin'}
                        >
                          <i className="ri-shield-star-line"></i>
                        </button>
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


import { useState } from 'react';
import { DashboardStats } from '../page';

interface DashboardOverviewProps {
  stats: DashboardStats | null;
  loading: boolean;
  onRefresh: () => void;
}

// Mock odds data
const mockOddsData = [
  { id: 1, match: 'Real Madrid vs Barcelona', league: 'La Liga', home: 2.10, draw: 3.40, away: 3.20, status: 'active', bets: 156 },
  { id: 2, match: 'Man City vs Liverpool', league: 'Premier League', home: 1.85, draw: 3.60, away: 4.00, status: 'active', bets: 234 },
  { id: 3, match: 'Bayern vs Dortmund', league: 'Bundesliga', home: 1.55, draw: 4.20, away: 5.50, status: 'active', bets: 89 },
  { id: 4, match: 'PSG vs Marseille', league: 'Ligue 1', home: 1.40, draw: 4.80, away: 7.00, status: 'suspended', bets: 67 },
  { id: 5, match: 'Juventus vs Inter', league: 'Serie A', home: 2.30, draw: 3.20, away: 3.00, status: 'active', bets: 145 },
  { id: 6, match: 'Benfica vs Porto', league: 'Liga Portugal', home: 2.00, draw: 3.50, away: 3.40, status: 'active', bets: 198 },
];

export default function DashboardOverview({ stats, loading, onRefresh }: DashboardOverviewProps) {
  const [oddsData, setOddsData] = useState(mockOddsData);
  const [editingOdd, setEditingOdd] = useState<number | null>(null);
  const [tempOdds, setTempOdds] = useState({ home: 0, draw: 0, away: 0 });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  const handleEditOdd = (odd: typeof mockOddsData[0]) => {
    setEditingOdd(odd.id);
    setTempOdds({ home: odd.home, draw: odd.draw, away: odd.away });
  };

  const handleSaveOdd = (id: number) => {
    setOddsData(prev => prev.map(odd => 
      odd.id === id ? { ...odd, ...tempOdds } : odd
    ));
    setEditingOdd(null);
  };

  const handleToggleStatus = (id: number) => {
    setOddsData(prev => prev.map(odd => 
      odd.id === id ? { ...odd, status: odd.status === 'active' ? 'suspended' : 'active' } : odd
    ));
  };

  const statCards = [
    {
      label: 'Total Utilizadores',
      value: stats?.totalUsers || 0,
      icon: 'ri-user-line',
      color: 'text-blue-400',
      iconBg: 'bg-blue-500/20'
    },
    {
      label: 'Utilizadores Ativos',
      value: stats?.activeUsers || 0,
      icon: 'ri-user-follow-line',
      color: 'text-green-400',
      iconBg: 'bg-green-500/20'
    },
    {
      label: 'Total Apostas',
      value: stats?.totalBets || 0,
      icon: 'ri-ticket-line',
      color: 'text-amber-400',
      iconBg: 'bg-amber-500/20'
    },
    {
      label: 'Apostas Pendentes',
      value: stats?.pendingBets || 0,
      icon: 'ri-time-line',
      color: 'text-orange-400',
      iconBg: 'bg-orange-500/20'
    },
    {
      label: 'Total Depósitos',
      value: formatCurrency(stats?.totalDeposits || 0),
      icon: 'ri-add-circle-line',
      color: 'text-emerald-400',
      iconBg: 'bg-emerald-500/20',
      isCurrency: true
    },
    {
      label: 'Total Levantamentos',
      value: formatCurrency(stats?.totalWithdrawals || 0),
      icon: 'ri-subtract-line',
      color: 'text-red-400',
      iconBg: 'bg-red-500/20',
      isCurrency: true
    },
    {
      label: 'Levantamentos Pendentes',
      value: stats?.pendingWithdrawals || 0,
      icon: 'ri-hourglass-line',
      color: 'text-yellow-400',
      iconBg: 'bg-yellow-500/20'
    },
    {
      label: 'Receita Total',
      value: formatCurrency(stats?.totalRevenue || 0),
      icon: 'ri-money-euro-circle-line',
      color: 'text-purple-400',
      iconBg: 'bg-purple-500/20',
      isCurrency: true
    }
  ];

  const todayStats = [
    {
      label: 'Apostas Hoje',
      value: stats?.todayBets || 0,
      icon: 'ri-calendar-check-line',
      trend: '+12%'
    },
    {
      label: 'Depósitos Hoje',
      value: formatCurrency(stats?.todayDeposits || 0),
      icon: 'ri-wallet-3-line',
      trend: '+8%'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Visão geral do sistema</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
        >
          <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`}></i>
          Atualizar
        </button>
      </div>

      {/* Today Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {todayStats.map((stat, index) => (
          <div
            key={index}
            className="bg-gradient-to-r from-amber-500/10 to-red-500/10 border border-amber-500/30 rounded-xl p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">{stat.label}</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {loading ? (
                    <span className="inline-block w-20 h-8 bg-gray-700 rounded animate-pulse"></span>
                  ) : (
                    stat.value
                  )}
                </p>
              </div>
              <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
                <i className={`${stat.icon} text-2xl text-amber-400`}></i>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-green-400 text-sm">
              <i className="ri-arrow-up-line"></i>
              <span>{stat.trend} vs ontem</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <div
            key={index}
            className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 hover:border-amber-500/30 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 ${stat.iconBg} rounded-lg flex items-center justify-center`}>
                <i className={`${stat.icon} text-lg ${stat.color}`}></i>
              </div>
            </div>
            <p className="text-gray-400 text-xs mb-1">{stat.label}</p>
            <p className="text-xl font-bold text-white">
              {loading ? (
                <span className="inline-block w-16 h-6 bg-gray-700 rounded animate-pulse"></span>
              ) : (
                stat.value
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Odds Management Panel */}
      <div className="bg-gray-800/50 border border-amber-500/30 rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600/20 to-orange-600/20 px-6 py-4 border-b border-amber-500/20">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <i className="ri-line-chart-line text-amber-400"></i>
              Painel de Odds
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {oddsData.filter(o => o.status === 'active').length} odds ativas
              </span>
              <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-full">
                <i className="ri-live-line mr-1"></i>
                Ao Vivo
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Jogo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Liga</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400">Casa</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400">Empate</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400">Fora</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400">Apostas</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400">Estado</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {oddsData.map((odd) => (
                <tr key={odd.id} className="hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm text-white font-medium">{odd.match}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-400">{odd.league}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editingOdd === odd.id ? (
                      <input
                        type="number"
                        step="0.01"
                        value={tempOdds.home}
                        onChange={(e) => setTempOdds(prev => ({ ...prev, home: parseFloat(e.target.value) || 0 }))}
                        className="w-16 px-2 py-1 bg-gray-700 border border-amber-500/50 rounded text-center text-sm text-white"
                      />
                    ) : (
                      <span className="text-sm font-bold text-amber-400">{odd.home.toFixed(2)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editingOdd === odd.id ? (
                      <input
                        type="number"
                        step="0.01"
                        value={tempOdds.draw}
                        onChange={(e) => setTempOdds(prev => ({ ...prev, draw: parseFloat(e.target.value) || 0 }))}
                        className="w-16 px-2 py-1 bg-gray-700 border border-amber-500/50 rounded text-center text-sm text-white"
                      />
                    ) : (
                      <span className="text-sm font-bold text-gray-300">{odd.draw.toFixed(2)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editingOdd === odd.id ? (
                      <input
                        type="number"
                        step="0.01"
                        value={tempOdds.away}
                        onChange={(e) => setTempOdds(prev => ({ ...prev, away: parseFloat(e.target.value) || 0 }))}
                        className="w-16 px-2 py-1 bg-gray-700 border border-amber-500/50 rounded text-center text-sm text-white"
                      />
                    ) : (
                      <span className="text-sm font-bold text-amber-400">{odd.away.toFixed(2)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs text-gray-400">{odd.bets}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleStatus(odd.id)}
                      className={`text-xs px-2 py-1 rounded-full cursor-pointer transition-colors ${
                        odd.status === 'active'
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                          : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      }`}
                    >
                      {odd.status === 'active' ? 'Ativo' : 'Suspenso'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {editingOdd === odd.id ? (
                        <>
                          <button
                            onClick={() => handleSaveOdd(odd.id)}
                            className="w-7 h-7 flex items-center justify-center bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg cursor-pointer transition-colors"
                          >
                            <i className="ri-check-line text-sm"></i>
                          </button>
                          <button
                            onClick={() => setEditingOdd(null)}
                            className="w-7 h-7 flex items-center justify-center bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg cursor-pointer transition-colors"
                          >
                            <i className="ri-close-line text-sm"></i>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleEditOdd(odd)}
                          className="w-7 h-7 flex items-center justify-center bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg cursor-pointer transition-colors"
                        >
                          <i className="ri-edit-line text-sm"></i>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Odds Summary */}
        <div className="px-6 py-4 bg-gray-900/50 border-t border-gray-700/50">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-xs text-gray-400">Total Apostas</p>
                <p className="text-lg font-bold text-white">{oddsData.reduce((sum, o) => sum + o.bets, 0)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400">Odds Ativas</p>
                <p className="text-lg font-bold text-green-400">{oddsData.filter(o => o.status === 'active').length}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400">Suspensas</p>
                <p className="text-lg font-bold text-red-400">{oddsData.filter(o => o.status === 'suspended').length}</p>
              </div>
            </div>
            <button className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-sm rounded-lg cursor-pointer transition-colors whitespace-nowrap">
              <i className="ri-add-line mr-1"></i>
              Adicionar Jogo
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Ações Rápidas</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button className="flex flex-col items-center gap-2 p-4 bg-gray-700/50 hover:bg-gray-700 rounded-xl transition-colors cursor-pointer">
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <i className="ri-user-add-line text-lg text-green-400"></i>
            </div>
            <span className="text-xs text-gray-300">Novo Utilizador</span>
          </button>
          <button className="flex flex-col items-center gap-2 p-4 bg-gray-700/50 hover:bg-gray-700 rounded-xl transition-colors cursor-pointer">
            <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
              <i className="ri-gift-line text-lg text-amber-400"></i>
            </div>
            <span className="text-xs text-gray-300">Nova Promoção</span>
          </button>
          <button className="flex flex-col items-center gap-2 p-4 bg-gray-700/50 hover:bg-gray-700 rounded-xl transition-colors cursor-pointer">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <i className="ri-football-line text-lg text-blue-400"></i>
            </div>
            <span className="text-xs text-gray-300">Novo Jogo</span>
          </button>
          <button className="flex flex-col items-center gap-2 p-4 bg-gray-700/50 hover:bg-gray-700 rounded-xl transition-colors cursor-pointer">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <i className="ri-file-list-3-line text-lg text-purple-400"></i>
            </div>
            <span className="text-xs text-gray-300">Relatórios</span>
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Atividade Recente</h2>
        <div className="space-y-3">
          {loading ? (
            [1, 2, 3, 4, 5].map((_, index) => (
              <div key={index} className="flex items-center gap-4 p-3 bg-gray-700/30 rounded-lg animate-pulse">
                <div className="w-10 h-10 bg-gray-600 rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-600 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-600 rounded w-1/4"></div>
                </div>
                <div className="h-6 w-16 bg-gray-600 rounded"></div>
              </div>
            ))
          ) : stats ? (
            [
              { type: 'deposit', label: `Novo depósito de ${formatCurrency(stats.totalDeposits / Math.max(stats.totalUsers, 1))}`, time: '2 min', icon: 'ri-add-circle-line', color: 'green' },
              { type: 'bet', label: 'Nova aposta colocada - €25.00', time: '5 min', icon: 'ri-ticket-line', color: 'amber' },
              { type: 'user', label: 'Novo utilizador registado', time: '8 min', icon: 'ri-user-line', color: 'blue' },
              { type: 'withdrawal', label: 'Levantamento processado - €100.00', time: '12 min', icon: 'ri-subtract-line', color: 'red' },
              { type: 'bet', label: 'Aposta vencedora - €150.00', time: '15 min', icon: 'ri-trophy-line', color: 'amber' }
            ].map((activity, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-3 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-colors"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  activity.color === 'green' ? 'bg-green-500/20' : 
                  activity.color === 'amber' ? 'bg-amber-500/20' : 
                  activity.color === 'blue' ? 'bg-blue-500/20' : 
                  'bg-red-500/20'
                }`}>
                  <i className={`${activity.icon} ${
                    activity.color === 'green' ? 'text-green-400' : 
                    activity.color === 'amber' ? 'text-amber-400' : 
                    activity.color === 'blue' ? 'text-blue-400' : 
                    'text-red-400'
                  }`}></i>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-white">{activity.label}</p>
                  <p className="text-xs text-gray-400">Há {activity.time}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  activity.color === 'green' ? 'bg-green-500/20 text-green-400' : 
                  activity.color === 'amber' ? 'bg-amber-500/20 text-amber-400' : 
                  activity.color === 'blue' ? 'bg-blue-500/20 text-blue-400' : 
                  'bg-red-500/20 text-red-400'
                }`}>
                  {activity.type === 'deposit' ? 'Depósito' : 
                   activity.type === 'bet' ? 'Aposta' : 
                   activity.type === 'user' ? 'Registo' : 
                   'Levantamento'}
                </span>
              </div>
            ))
          ) : (
            <p className="text-center text-gray-400 py-8">Sem atividade recente</p>
          )}
        </div>
      </div>
    </div>
  );
}

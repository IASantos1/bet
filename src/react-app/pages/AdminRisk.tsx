import { useState, useEffect } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';
import { AlertTriangle, Shield, User } from 'lucide-react';

interface RiskAlert {
  id: number;
  type: string;
  message: string;
  data: string;
  created_at: string;
}

interface UserProfile {
  id: string;
  email: string;
  sharp_score: number;
  roi: number;
  bets: number;
  wins: number;
}

export default function AdminRisk() {
  const { darkMode } = useApp();
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);

  // Load Users
  useEffect(() => {
    apiFetch<UserProfile[]>('/api/admin/users')
      .then((data: UserProfile[]) => {
          if(Array.isArray(data)) setUsers(data);
      })
      // .catch((err: any) => console.error(err));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchAlerts = async () => {
      try {
        const data = await apiFetch<RiskAlert[]>('/api/admin/alerts');
        if (!cancelled && Array.isArray(data)) {
          setAlerts(data);
        }
      } catch (err) {
        console.error('Failed to fetch alerts:', err);
      }
    };
    fetchAlerts();
    const id = setInterval(fetchAlerts, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const getRiskColor = (score: number) => {
      if (score >= 10) return 'text-red-600 bg-red-100 dark:bg-red-900/50 dark:text-red-300';
      if (score >= 5) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/50 dark:text-yellow-300';
      return 'text-green-600 bg-green-100 dark:bg-green-900/50 dark:text-green-300';
  };

  return (
    <div className={`min-h-screen p-6 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <Shield className="w-8 h-8 text-blue-500" />
                Painel de Risco & Antifraude
            </h1>
            <div className="flex gap-4">
                <div className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow`}>
                    <span className="text-sm text-gray-500 dark:text-gray-400">Alertas Hoje</span>
                    <div className="text-xl font-bold">{alerts.length}</div>
                </div>
                <div className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow`}>
                    <span className="text-sm text-gray-500 dark:text-gray-400">Sharps Detectados</span>
                    <div className="text-xl font-bold text-red-500">
                        {users.filter(u => u.sharp_score >= 10).length}
                    </div>
                </div>
            </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Live Alerts Feed */}
            <div className={`p-4 rounded-xl shadow ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                    Alertas em Tempo Real
                </h2>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {alerts.length === 0 && <div className="text-gray-500 text-center py-4">Nenhum alerta recente</div>}
                    {alerts.map(alert => (
                        <div key={alert.id || Math.random()} className={`p-3 rounded border-l-4 ${
                            alert.type === 'RISK_LIMIT' ? 'border-red-500 bg-red-50/10 dark:bg-red-900/20' : 'border-blue-500 bg-blue-50/10 dark:bg-blue-900/20'
                        }`}>
                            <div className="flex justify-between items-start">
                                <span className="font-semibold text-sm">{alert.type}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {new Date(alert.created_at || Date.now()).toLocaleTimeString()}
                                </span>
                            </div>
                            <p className="text-sm mt-1">{alert.message}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Top Sharps / Risky Users */}
            <div className={`p-4 rounded-xl shadow ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <User className="w-5 h-5 text-purple-500" />
                    Usuários de Risco (Sharps)
                </h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className={`text-xs uppercase ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-700'}`}>
                            <tr>
                                <th className="px-4 py-3">User</th>
                                <th className="px-4 py-3">Score</th>
                                <th className="px-4 py-3">ROI</th>
                                <th className="px-4 py-3">Apostas</th>
                                <th className="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.slice(0, 10).map(user => (
                                <tr key={user.id} className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                                    <td className="px-4 py-3 font-medium">{user.email || user.id.slice(0, 8)}</td>
                                    <td className="px-4 py-3 font-bold">{user.sharp_score?.toFixed(1) || 0}</td>
                                    <td className="px-4 py-3">{(user.roi * 100).toFixed(1)}%</td>
                                    <td className="px-4 py-3">{user.bets} ({user.wins} wins)</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${getRiskColor(user.sharp_score || 0)}`}>
                                            {user.sharp_score >= 10 ? 'SHARP' : (user.sharp_score >= 5 ? 'SUSPEITO' : 'NORMAL')}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* Recent Suspicious Activities (Mock for now, could come from DB) */}
        <div className={`p-4 rounded-xl shadow ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
             <h2 className="text-lg font-semibold mb-4">Ações Recomendadas</h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-900/20 dark:border-red-800">
                     <h3 className="font-bold text-red-700 dark:text-red-400">Bloqueio de Sharps</h3>
                     <p className="text-sm mt-1 mb-2">3 usuários identificados como Sharp com ROI {'>'} 15%.</p>
                     <button className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700">Revisar Limites</button>
                 </div>
                 <div className="p-4 border border-yellow-200 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800">
                     <h3 className="font-bold text-yellow-700 dark:text-yellow-400">Exposição de Mercado</h3>
                     <p className="text-sm mt-1 mb-2">Mercado "Flamengo vs Vasco" próximo do limite de responsabilidade.</p>
                     <button className="text-xs bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700">Ajustar Odds</button>
                 </div>
                 <div className="p-4 border border-blue-200 rounded-lg bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800">
                     <h3 className="font-bold text-blue-700 dark:text-blue-400">Análise de Arbitragem</h3>
                     <p className="text-sm mt-1 mb-2">Nenhuma arbitragem interna detectada nas últimas 24h.</p>
                     <button className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">Ver Relatório</button>
                 </div>
             </div>
        </div>
      </div>
    </div>
  );
}

import { useApp } from '@/react-app/contexts/AppContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  LayoutDashboard,
  ShieldAlert,
  Banknote,
  Activity,
  UserCheck,
  ArrowDownToLine,
  Wallet,
  NotepadText,
} from 'lucide-react';

export function DashboardSidebar() {
  const { showDashboard, setShowDashboard, darkMode, isOperator } = useApp();
  const navigate = useNavigate();

  const menuItems = [
    { label: 'Painel do Operador', icon: LayoutDashboard, path: '/metrics' },
    { label: 'KYC — Aprovar identidade', icon: UserCheck, path: '/admin/kyc' },
    { label: 'Levantamentos', icon: ArrowDownToLine, path: '/admin/withdrawals' },
    { label: 'Pagamentos clientes', icon: Banknote, path: '/admin/payouts' },
    { label: 'Gestão de Risco', icon: ShieldAlert, path: '/admin/risk' },
    { label: 'Trading / Mercados', icon: Activity, path: '/trading-panel' },
    { label: 'Carteira (vista cliente)', icon: Wallet, path: '/wallet' },
    { label: 'As Minhas Apostas', icon: NotepadText, path: '/my-bets' },
  ];

  const handleNavigate = (path: string) => {
    navigate(path);
    setShowDashboard(false);
  };

  return (
    <AnimatePresence>
      {showDashboard && (
        <>
          <motion.div
            key="sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[60]"
            onClick={() => setShowDashboard(false)}
          />

          <motion.div
            key="sidebar-panel"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className={`fixed top-0 left-0 h-full w-80 z-[70] ${
              darkMode ? 'bg-gray-900 border-r border-gray-800' : 'bg-white border-r border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Painel Operacional
              </h2>
              <button
                onClick={() => setShowDashboard(false)}
                className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                  darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto h-[calc(100%-64px)]">
              {!isOperator && (
                <div className="mb-4 p-3 bg-yellow-100 text-yellow-800 rounded-md text-sm">
                  Acesso restrito a operadores.
                </div>
              )}

              <div className="space-y-1">
                {menuItems.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => handleNavigate(item.path)}
                    disabled={!isOperator}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      !isOperator ? 'opacity-50 cursor-not-allowed' :
                      darkMode
                        ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <item.icon size={20} />
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800">
                <div className={`px-4 text-xs font-semibold uppercase tracking-wider mb-4 ${
                  darkMode ? 'text-gray-500' : 'text-gray-400'
                }`}>
                  Sistema
                </div>
                <div className={`px-4 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  <p>Versão 2.1.0</p>
                  <p className="mt-1">Status: <span className="text-green-500 font-bold">Operacional</span></p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

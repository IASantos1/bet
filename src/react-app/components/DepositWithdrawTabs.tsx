import { Link } from 'react-router-dom';
import { useApp } from '@/react-app/contexts/AppContext';

/** Small tab bar shown at the top of /deposit and /withdraw so either page is one click from the
 *  other, matching how most banking/betting apps pair the two. */
export function DepositWithdrawTabs({ active }: { active: 'deposit' | 'withdraw' }) {
  const { darkMode } = useApp();
  const tabs: { key: 'deposit' | 'withdraw'; label: string; to: string }[] = [
    { key: 'deposit', label: 'Depósito', to: '/deposit' },
    { key: 'withdraw', label: 'Levantamento', to: '/withdraw' },
  ];

  return (
    <div className="grid grid-cols-2 border-b border-gray-700/20">
      {tabs.map((t) => (
        <Link
          key={t.key}
          to={t.to}
          className={`py-3 text-center text-sm font-bold uppercase tracking-wide transition-colors ${
            active === t.key ? 'text-red-500 border-b-2 border-red-500 bg-red-500/10' : darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

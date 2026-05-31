
import { Link } from 'react-router-dom';
import { AdminTab } from '../page';

interface AdminSidebarProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  isOpen: boolean;
  onClose: () => void;
}

const menuItems: { id: AdminTab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'ri-dashboard-line' },
  { id: 'users', label: 'Utilizadores', icon: 'ri-user-line' },
  { id: 'bets', label: 'Apostas', icon: 'ri-ticket-line' },
  { id: 'transactions', label: 'Transações', icon: 'ri-exchange-funds-line' },
  { id: 'promotions', label: 'Promoções', icon: 'ri-gift-line' },
  { id: 'matches', label: 'Jogos', icon: 'ri-football-line' },
  { id: 'settings', label: 'Definições', icon: 'ri-settings-3-line' },
];

export default function AdminSidebar({ activeTab, setActiveTab, isOpen, onClose }: AdminSidebarProps) {
  return (
    <aside
      className={`fixed top-0 left-0 h-full w-64 bg-gray-900 border-r border-red-600/40 z-50 transform transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}
    >
      {/* Logo */}
      <div className="p-4 border-b border-red-600/40">
        <Link to="/" className="flex items-center gap-2 cursor-pointer">
          <span className="text-xl font-black text-white">
            BET<span className="text-red-500">62</span>
          </span>
          <span className="text-xs font-medium px-2 py-0.5 bg-red-600/15 text-red-300 rounded">
            Admin
          </span>
        </Link>
      </div>

      {/* Menu */}
      <nav className="p-4 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id);
              onClose();
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === item.id
                ? 'bg-red-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <i className={`${item.icon} text-lg`}></i>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-red-600/40">
        <Link
          to="/"
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-all cursor-pointer"
        >
          <i className="ri-arrow-left-line text-lg"></i>
          Voltar ao Site
        </Link>
      </div>

      {/* Close button mobile */}
      <button
        onClick={onClose}
        className="lg:hidden absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer"
      >
        <i className="ri-close-line text-xl"></i>
      </button>
    </aside>
  );
}

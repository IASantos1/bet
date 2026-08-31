import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '@/react-app/contexts/AppContext';

type Tab = {
  to: string;
  label: string;
  match: (path: string) => boolean;
  icon: (active: boolean) => React.ReactNode;
};

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const TABS: Tab[] = [
  {
    to: '/',
    label: 'Desporto',
    match: (p) => p === '/',
    icon: () => (
      <svg {...iconProps} className="w-[22px] h-[22px]">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.2 15.6 9.8l-1.4 4.3H9.8L8.4 9.8Z" />
        <path d="M12 3v4.2M4.8 8l3.6 1.8M19.2 8l-3.6 1.8M7.5 20l2.3-5.9M16.5 20l-2.3-5.9" />
      </svg>
    ),
  },
  {
    to: '/live',
    label: 'Ao Vivo',
    match: (p) => p.startsWith('/live'),
    icon: () => (
      <svg {...iconProps} className="w-[22px] h-[22px]">
        <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" />
        <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    to: '/casino',
    label: 'Casino',
    match: (p) => p.startsWith('/casino'),
    icon: () => (
      <svg {...iconProps} className="w-[22px] h-[22px]">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="9" strokeDasharray="2.4 3.4" />
        <path d="M12 7v10M8.5 12h7" />
      </svg>
    ),
  },
  {
    to: '/promotions',
    label: 'Promoções',
    match: (p) => p.startsWith('/promotions'),
    icon: () => (
      <svg {...iconProps} className="w-[22px] h-[22px]">
        <rect x="3.5" y="9" width="17" height="11" rx="1.4" />
        <path d="M3.5 12.5h17" />
        <path d="M12 9v11" />
        <path d="M12 9c-1.6 0-3-.9-3-2.4C9 5.3 9.9 4.5 11 4.5c1.3 0 1.9 1.3 1 2.4-.9 1.1-3 2.1-4.7 2.1M12 9c1.6 0 3-.9 3-2.4 0-1.3-.9-2.1-2-2.1-1.3 0-1.9 1.3-1 2.4.9 1.1 3 2.1 4.7 2.1" />
      </svg>
    ),
  },
];

/** Fixed bottom tab bar (mobile only) — the app's primary sections live here instead of the
 *  header, matching the native-app navigation pattern on Android/iOS rather than a website's
 *  top nav. Desktop keeps the header's horizontal nav (see Header.tsx's `hidden lg:flex` nav). */
export function BottomTabBar() {
  const { darkMode, setSelectedCategory } = useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 backdrop-blur-lg border-t pt-2 px-1 ${
        darkMode ? 'bg-gray-900/95 border-gray-800' : 'bg-white/95 border-gray-200'
      }`}
      style={{ paddingBottom: 'calc(0.9rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {TABS.map((tab) => {
        const active = tab.match(pathname || '/');
        return (
          <button
            key={tab.to}
            type="button"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              if (tab.to === '/') setSelectedCategory(null);
              navigate(tab.to);
            }}
            className={`relative flex flex-col items-center gap-0.5 py-1 transition-colors ${
              active ? 'text-red-600' : darkMode ? 'text-gray-400' : 'text-gray-500'
            }`}
          >
            <span
              className={`absolute -top-1.5 h-[3px] w-5 rounded-full bg-gradient-to-r from-red-500 to-red-700 transition-opacity ${
                active ? 'opacity-100' : 'opacity-0'
              }`}
            />
            {tab.icon(active)}
            <span className="text-[9.5px] font-semibold tracking-tight">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

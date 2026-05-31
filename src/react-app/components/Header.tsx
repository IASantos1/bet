import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo } from 'react';
import { NotepadText } from 'lucide-react';

const SPORT_AVATARS = ['🐯','🦁','🐻','🐼','🦊','🐸','🦋','🐬','🦅','🐺','🐊','🐙','🦑','🦓','🦒','🐘','🦏','🦛','🐆','🐅'];
function getEmojiAvatar(name: string): string {
  const sum = String(name || 'U').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return SPORT_AVATARS[sum % SPORT_AVATARS.length];
}

function NavBtn({
  to,
  active,
  onClick,
  children,
  mobile,
}: {
  to: string;
  active: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  mobile?: boolean;
}) {
  const navigate = useNavigate();
  const base = mobile
    ? 'flex-1 text-center py-1.5 px-2 rounded font-bold text-[10px] uppercase tracking-wide whitespace-nowrap transition-colors'
    : 'px-4 py-2 rounded-lg font-bold uppercase text-sm transition-colors';
  const activeClass = mobile
    ? 'bg-red-600 text-white shadow-sm'
    : 'bg-red-600 text-white shadow-md';
  const inactiveClass = 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700';

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        onClick?.();
        navigate(to);
      }}
      className={`${base} ${active ? activeClass : inactiveClass}`}
    >
      {children}
    </button>
  );
}

export function Header() {
  const {
    darkMode, user, selfExclude, selfExcludeUntil, isOperator,
    showMobileSidebar, setShowMobileSidebar, openAuthModal,
    setSelectedCategory, showDashboard, setShowDashboard,
  } = useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [eurBalance, setEurBalance] = useState<number | null>(null);
  const [freebets, setFreebets] = useState<number | null>(null);

  const firstName = useMemo(() => {
    const name = (user && (user as any).username) ? String((user as any).username) : '';
    return name.split(' ')[0] || name || 'U';
  }, [user]);

  const emojiAvatar = useMemo(() => getEmojiAvatar(firstName), [firstName]);

  const isActive = useMemo(() => {
    const p = String(pathname || '/');
    return (target: string) => {
      if (target === '/') return p === '/';
      return p.startsWith(target);
    };
  }, [pathname]);

  useEffect(() => {
    let alive = true;
    const loadBalance = async () => {
      if (!user) { setEurBalance(null); return; }
      try {
        const d = await apiFetch<{ currency: string; balance: number }[]>('/api/wallet/balances', { cache: 'no-store' });
        if (alive) {
          const eur = d.find(x => x.currency === 'EUR');
          setEurBalance(eur ? eur.balance : 0);
        }
      } catch {
        if (alive) setEurBalance(null);
      }
    };
    loadBalance();
    return () => { alive = false; };
  }, [user]);

  useEffect(() => {
    let alive = true;
    const loadFreebets = async () => {
      if (!user) { setFreebets(null); return; }
      try {
        const d = await apiFetch<{ amount_eur: number }>('/api/promotions/freebets', { cache: 'no-store' });
        if (alive) { setFreebets(Number(d.amount_eur || 0)); }
      } catch {
        if (alive) setFreebets(null);
      }
    };
    loadFreebets();
    return () => { alive = false; };
  }, [user]);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (url.pathname === '/register' || url.searchParams.has('ref')) {
          setTimeout(() => openAuthModal('register'), 100);
        } else if (url.pathname === '/login') {
          setTimeout(() => openAuthModal('login'), 100);
        }
      }
    } catch { void 0; }
  }, []);

  return (
    <>
      <header className={`sticky top-0 z-50 backdrop-blur-lg border-b ${
        darkMode
          ? 'bg-gray-900/90 border-gray-800'
          : 'bg-white/90 border-gray-200'
      }`}>
        <div className="px-4 py-2 sm:py-3 lg:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <button
                type="button"
                onClick={() => setShowMobileSidebar(!showMobileSidebar)}
                className="lg:hidden p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <span className={`text-xl ${darkMode ? 'text-white' : 'text-gray-900'}`}>☰</span>
              </button>
              <button
                type="button"
                onPointerDown={(e) => { if (e.button === 0) { e.preventDefault(); setSelectedCategory(null); navigate('/'); } }}
                className="flex items-center gap-2 md:gap-3"
              >
                <div className="text-left">
                  <h1 className={`text-xl md:text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    BET62
                  </h1>
                  <p className={`text-[11px] md:text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Apostas Desportivas
                  </p>
                </div>
              </button>
            </div>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-2">
              <NavBtn to="/" active={isActive('/')} onClick={() => setSelectedCategory(null)}>
                Desporto
              </NavBtn>
              <NavBtn to="/live" active={isActive('/live')}>
                Ao Vivo
              </NavBtn>
              <NavBtn to="/promotions" active={isActive('/promotions')}>
                Promoções
              </NavBtn>
              {isOperator && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowDashboard(true)}
                    className={`px-4 py-2 rounded-lg font-bold uppercase text-sm transition-colors ${showDashboard ? 'bg-red-600 text-white shadow-md' : 'hover:bg-gray-100 text-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'}`}
                  >
                    Dashboard
                  </button>
                  <NavBtn to="/admin/payouts" active={isActive('/admin/payouts')}>
                    Pagamentos
                  </NavBtn>
                </>
              )}
            </nav>

            {/* Right side */}
            <div className="flex items-center space-x-2">
              {user ? (
                <div className="flex items-center gap-2 relative">
                  <NavLink
                    to="/my-bets"
                    className={({ isActive }) => `p-2 rounded-md transition-colors ${isActive ? (darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-900') : (darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100')}`}
                    title="As Minhas Apostas"
                  >
                    <NotepadText size={20} />
                  </NavLink>

                  <div className={`px-2 py-1 md:px-3 md:py-2 rounded-md border text-xs md:text-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-100 border-gray-200 text-gray-900'}`}>
                    €{eurBalance !== null ? eurBalance.toFixed(2) : '0.00'}
                  </div>
                  <div className={`flex items-center gap-1.5 px-2 py-1 md:px-3 md:py-2 rounded-md border text-xs md:text-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-100 border-gray-200 text-gray-900'}`}>
                    <span className={`${darkMode ? 'bg-red-700 text-white' : 'bg-red-600 text-white'} inline-flex items-center justify-center w-4 h-4 md:w-5 md:h-5 rounded-full text-[10px] md:text-xs font-bold flex-shrink-0`}>F</span>
                    <span>€{freebets !== null ? freebets.toFixed(2) : '0.00'}</span>
                  </div>

                  <Link
                    to="/deposit"
                    title="Depositar"
                    className="bg-green-600 hover:bg-green-700 text-white font-black w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-2xl leading-none shadow-md transition-colors"
                  >
                    +
                  </Link>

                  <Link
                    to="/profile"
                    title={firstName}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xl font-bold transition-colors flex-shrink-0 border-2 ${darkMode ? 'bg-gray-800 border-gray-600 hover:bg-gray-700' : 'bg-gray-100 border-gray-300 hover:bg-gray-200'}`}
                  >
                    {emojiAvatar}
                  </Link>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onPointerDown={(e) => { if (e.button === 0) { e.preventDefault(); navigate('/login'); } }}
                    className={`font-bold py-1 px-3 md:py-2 md:px-4 rounded text-xs md:text-sm transition-colors ${darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => { if (e.button === 0) { e.preventDefault(); navigate('/register'); } }}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 md:py-2 md:px-4 rounded text-xs md:text-sm shadow-md transition-colors"
                  >
                    Registar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="px-4 pb-2 lg:hidden">
          <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <NavBtn to="/" active={isActive('/')} onClick={() => setSelectedCategory(null)} mobile>
              Desporto
            </NavBtn>
            <NavBtn to="/live" active={isActive('/live')} mobile>
              Ao Vivo
            </NavBtn>
            <NavBtn to="/promotions" active={isActive('/promotions')} mobile>
              Promoções
            </NavBtn>
            {isOperator && (
              <>
                <button
                  type="button"
                  onClick={() => setShowDashboard(true)}
                  className={`flex-1 text-center py-1.5 px-2 rounded font-bold text-[10px] uppercase tracking-wide whitespace-nowrap transition-colors ${
                    showDashboard
                      ? 'bg-red-600 text-white shadow-sm'
                      : (darkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100')
                  }`}
                >
                  Dashboard
                </button>
                <NavBtn to="/admin/payouts" active={isActive('/admin/payouts')} mobile>
                  Pagamentos
                </NavBtn>
              </>
            )}
          </nav>
        </div>

        {selfExclude && (
          <div className={`w-full ${darkMode ? 'bg-yellow-600 text-black' : 'bg-yellow-100 text-yellow-800'} border-t ${darkMode ? 'border-yellow-700' : 'border-yellow-300'}`}>
            <div className="px-4 py-2 text-sm">
              Autoexclusão ativa {selfExcludeUntil ? `até ${new Date(selfExcludeUntil).toLocaleString()}` : '(indefinida)'} — adicionar ao boletim, apostar e depositar estão bloqueados.
            </div>
          </div>
        )}
      </header>
    </>
  );
}

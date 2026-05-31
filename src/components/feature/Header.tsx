import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useWallet } from '../../hooks/useWallet';
import { useTheme } from '../../contexts/ThemeContext';
import { useProfile } from '../../hooks/useProfile';

interface HeaderProps {
  balance?: number;
  freeBets?: number;
  isLoggedIn?: boolean;
  onSportsClick?: () => void;
  onLiveClick?: () => void;
  activeTab?: 'sports' | 'live';
  isDarkMode?: boolean;
  isAdmin?: boolean;
  onOpenMobileMenu?: () => void;
}

export function Header({
  onSportsClick,
  onLiveClick,
  activeTab = 'sports',
  isDarkMode: _isDarkMode = true,
  isAdmin: _isAdmin = false,
  onOpenMobileMenu,
}: HeaderProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const navigate = useNavigate();
  const { user, signOut, isAdmin: userIsAdmin } = useAuth();
  const { wallet } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const { profile: _profile } = useProfile();

  // Safely derive values from wallet (fallback to 0)
  const balance = wallet?.balance ?? 0;
  const freeBets = wallet?.freeBetBalance ?? 0;
  const isLoggedIn = !!user;

  const handleLogout = async () => {
    try {
      await signOut();
      setShowProfileMenu(false);
      navigate('/login');
    } catch (error) {
      console.error('Erro ao sair:', error);
    }
  };

  return (
    <header className={`${theme === 'dark' ? 'bg-gradient-to-r from-gray-900 via-gray-900 to-gray-800' : 'bg-gradient-to-r from-white via-gray-50 to-white'} text-white fixed top-0 left-0 right-0 z-50 shadow-xl ${theme === 'dark' ? 'border-b border-red-600/40' : 'border-b border-gray-200'}`}>
      <div className="w-full px-2 md:px-4">
        <div className="flex items-center justify-between h-11 md:h-14 lg:h-16">
          {/* Logo + Nav - Left */}
          <div className="flex items-center gap-2 md:gap-4">
            {onOpenMobileMenu && (
              <button
                onClick={onOpenMobileMenu}
                className={`lg:hidden w-7 h-7 ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700 border-red-600/40' : 'bg-gray-100 hover:bg-gray-200 border-gray-300'} rounded-md flex items-center justify-center cursor-pointer transition-colors border`}
              >
                <i className={`ri-menu-line ${theme === 'dark' ? 'text-red-400' : 'text-gray-700'} text-sm`}></i>
              </button>
            )}

            <Link to="/" className="flex items-center gap-1 hover:opacity-90 transition-opacity">
              <span className={`text-sm md:text-xl lg:text-2xl font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'} leading-none`}>
                BET<span className="text-red-600">62</span>
              </span>
            </Link>

            {/* Navigation Tabs - Desktop */}
            <div className="hidden md:flex items-center gap-1.5 ml-4">
              <button
                onClick={() => {
                  if (onSportsClick) onSportsClick();
                  navigate('/');
                }}
                className={`px-3 lg:px-5 py-1.5 rounded-lg text-xs lg:text-sm font-semibold whitespace-nowrap cursor-pointer transition-all ${
                  activeTab === 'sports'
                    ? 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg'
                    : theme === 'dark' ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <i className="ri-football-line mr-1.5"></i>Esportes
              </button>

              <button
                onClick={() => {
                  if (onLiveClick) onLiveClick();
                  navigate('/desportos-ao-vivo');
                }}
                className={`px-3 lg:px-5 py-1.5 rounded-lg text-xs lg:text-sm font-semibold whitespace-nowrap cursor-pointer transition-all ${
                  activeTab === 'live'
                    ? 'bg-gradient-to-r from-red-700 to-red-600 text-white shadow-lg'
                    : theme === 'dark' ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full inline-block mr-1.5 animate-pulse"></span>
                Ao Vivo
              </button>

              <Link
                to="/promocoes"
                className={`px-3 lg:px-5 py-1.5 rounded-lg text-xs lg:text-sm font-semibold whitespace-nowrap cursor-pointer transition-all ${theme === 'dark' ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                <i className="ri-gift-line mr-1.5 text-red-400"></i>Promoções
              </Link>

              {userIsAdmin && (
                <Link
                  to="/admin"
                  className="px-3 lg:px-5 py-1.5 rounded-lg text-xs lg:text-sm font-semibold whitespace-nowrap cursor-pointer transition-all bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg"
                >
                  <i className="ri-dashboard-3-line mr-1.5"></i>Painel
                </Link>
              )}
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-1 md:gap-1.5">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all ${
                theme === 'dark' 
                  ? 'bg-gray-800 hover:bg-gray-700 border border-red-500/40' 
                  : 'bg-gray-100 hover:bg-gray-200 border border-gray-300'
              }`}
              title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
            >
              {theme === 'dark' ? (
                <i className="ri-sun-line text-red-400 text-sm md:text-base"></i>
              ) : (
                <i className="ri-moon-line text-gray-700 text-sm md:text-base"></i>
              )}
            </button>

            {isLoggedIn ? (
              <>
                {/* Balance */}
                <Link
                  to="/carteira"
                  className={`px-1.5 py-1 md:px-2.5 md:py-1.5 rounded-md border transition-all cursor-pointer group ${
                    theme === 'dark' 
                      ? 'bg-black/50 border-red-500/40 hover:border-red-400 hover:bg-red-500/10' 
                      : 'bg-white border-gray-300 hover:border-red-400 hover:bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <i className={`ri-wallet-3-line text-red-500 text-[10px] md:text-xs group-hover:scale-110 transition-transform`}></i>
                    <div>
                      <div className={`text-[6px] md:text-[8px] leading-none ${theme === 'dark' ? 'text-gray-300/80' : 'text-gray-600/80'}`}>Saldo</div>
                      <div className={`font-bold text-[9px] md:text-xs leading-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        €{balance.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </Link>

                {/* Free Bets */}
                {freeBets > 0 && (
                  <Link
                    to="/carteira"
                    className={`hidden sm:flex px-1.5 py-1 md:px-2.5 md:py-1.5 rounded-md border transition-all cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-black/50 border-red-500/30 hover:border-red-400 hover:bg-red-500/10'
                        : 'bg-red-50 border-red-300 hover:border-red-400 hover:bg-red-100'
                    }`}
                  >
                    <div>
                      <div className={`text-[6px] md:text-[8px] leading-none ${theme === 'dark' ? 'text-red-400/70' : 'text-red-600/70'}`}>Free Bets</div>
                      <div className={`font-bold text-[9px] md:text-xs leading-tight ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
                        €{freeBets.toFixed(2)}
                      </div>
                    </div>
                  </Link>
                )}

                <Link
                  to="/minhas-apostas"
                  className="hidden md:flex w-8 h-8 bg-gradient-to-br from-red-700 to-red-600 rounded-md items-center justify-center hover:from-red-800 hover:to-red-700 transition-all cursor-pointer shadow-lg border border-red-500/30"
                  title="Minhas Apostas"
                >
                  <i className="ri-file-list-3-line text-sm text-white"></i>
                </Link>

                <Link
                  to="/deposito"
                  className="px-1.5 py-1 md:px-3 md:py-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-md transition-all font-semibold text-[9px] md:text-xs whitespace-nowrap cursor-pointer shadow-lg shadow-red-600/20 text-white flex items-center"
                >
                  <i className="ri-add-circle-line text-[10px] md:text-sm"></i>
                  <span className="hidden xs:inline ml-0.5">Depósito</span>
                </Link>

                {/* Profile */}
                <div className="relative">
                  <button
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="w-6 h-6 md:w-8 md:h-8 bg-gradient-to-br from-red-600 to-red-700 rounded-full flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer shadow-lg"
                  >
                    <i className="ri-user-line text-[10px] md:text-sm text-white"></i>
                  </button>

                  {showProfileMenu && (
                    <div className={`absolute right-0 mt-2 w-44 rounded-lg shadow-xl border py-1.5 z-50 ${
                      theme === 'dark' ? 'bg-gray-900 border-red-500/40' : 'bg-white border-gray-200'
                    }`}>
                      <div className={`px-3 py-1.5 border-b ${theme === 'dark' ? 'border-red-500/30' : 'border-gray-200'}`}>
                        <p className={`text-[10px] ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Conectado como</p>
                        <p className={`text-xs font-medium truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                          {user?.name || user?.email}
                        </p>
                      </div>
                      <Link
                        to="/carteira"
                        className={`block px-3 py-1.5 transition-colors cursor-pointer text-xs ${
                          theme === 'dark' ? 'hover:bg-red-500/10 text-white' : 'hover:bg-gray-100 text-gray-700'
                        }`}
                        onClick={() => setShowProfileMenu(false)}
                      >
                        <i className="ri-wallet-3-line mr-1.5 text-red-400"></i>Minha Carteira
                      </Link>
                      <Link
                        to="/perfil"
                        className={`block px-3 py-1.5 transition-colors cursor-pointer text-xs ${
                          theme === 'dark' ? 'hover:bg-red-500/10 text-white' : 'hover:bg-gray-100 text-gray-700'
                        }`}
                        onClick={() => setShowProfileMenu(false)}
                      >
                        <i className="ri-user-line mr-1.5 text-red-400"></i>Meu Perfil
                      </Link>
                      <Link
                        to="/verificacao"
                        className={`block px-3 py-1.5 transition-colors cursor-pointer text-xs ${
                          theme === 'dark' ? 'hover:bg-red-500/10 text-white' : 'hover:bg-gray-100 text-gray-700'
                        }`}
                        onClick={() => setShowProfileMenu(false)}
                      >
                        <i className="ri-shield-check-line mr-1.5 text-red-400"></i>Verificação KYC
                      </Link>
                      <Link
                        to="/levantamento"
                        className={`block px-3 py-1.5 transition-colors cursor-pointer text-xs ${
                          theme === 'dark' ? 'hover:bg-red-500/10 text-white' : 'hover:bg-gray-100 text-gray-700'
                        }`}
                        onClick={() => setShowProfileMenu(false)}
                      >
                        <i className="ri-bank-card-line mr-1.5 text-red-400"></i>Levantamento
                      </Link>
                      <hr className={`my-1 ${theme === 'dark' ? 'border-red-500/30' : 'border-gray-200'}`} />
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-3 py-1.5 hover:bg-red-500/10 transition-colors text-red-400 cursor-pointer text-xs"
                      >
                        <i className="ri-logout-box-line mr-1.5"></i>Sair
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className={`px-2 md:px-4 py-1 md:py-1.5 rounded-md transition-colors font-semibold text-[9px] md:text-xs whitespace-nowrap cursor-pointer border ${
                    theme === 'dark' 
                      ? 'bg-gray-800 hover:bg-gray-700 text-white border-red-500/40' 
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300'
                  }`}
                >
                  Entrar
                </Link>
                <Link
                  to="/registro"
                  className="px-2 md:px-4 py-1 md:py-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-md transition-all font-semibold text-[9px] md:text-xs whitespace-nowrap cursor-pointer text-white"
                >
                  Registar
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;

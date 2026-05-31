import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Header from '../../components/feature/Header';
import Footer from '../../components/feature/Footer';
import { MobileBottomNav } from '../../components/feature/MobileBottomNav';
import SelfExclusionModal from '../../components/feature/SelfExclusionModal';
import { useAuth } from '../../contexts/AuthContext';
import { useProfile } from '../../hooks/useProfile';
import { useTheme } from '../../contexts/ThemeContext';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile, loading, updateProfile, isSelfExcluded, isCoolingOff, setSelfExclusion, setCoolingOff } = useProfile();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState('info');
  const [isEditing, setIsEditing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showExclusionModal, setShowExclusionModal] = useState(false);
  const [exclusionType, setExclusionType] = useState<'self_exclusion' | 'cooling_off'>('self_exclusion');

  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    birth_date: ''
  });

  const isDark = theme === 'dark';

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        birth_date: profile.birth_date || ''
      });
    }
  }, [user, profile, navigate]);

  const handleSave = async () => {
    try {
      await updateProfile(formData);
      setIsEditing(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Erro ao guardar:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Erro ao sair:', error);
    }
  };

  const handleSelfExclusionConfirm = async (period: number, reason: string) => {
    try {
      if (exclusionType === 'self_exclusion') {
        await setSelfExclusion?.(period, reason);
      } else {
        await setCoolingOff?.(period);
      }
    } finally {
      setShowExclusionModal(false);
    }
  };

  const menuItems = [
    { id: 'info', icon: 'ri-user-line', label: 'Dados Pessoais' },
    { id: 'security', icon: 'ri-shield-keyhole-line', label: 'Segurança' },
    { id: 'limits', icon: 'ri-timer-line', label: 'Limites de Jogo' },
    { id: 'notifications', icon: 'ri-notification-3-line', label: 'Notificações' },
    { id: 'settings', icon: 'ri-settings-3-line', label: 'Definições' },
  ];

  const quickActions = [
    { icon: 'ri-wallet-3-line', label: 'Carteira', path: '/carteira', color: 'teal' },
    { icon: 'ri-add-circle-line', label: 'Depositar', path: '/deposito', color: 'green' },
    { icon: 'ri-send-plane-line', label: 'Levantar', path: '/levantamento', color: 'amber' },
    { icon: 'ri-file-list-3-line', label: 'Apostas', path: '/minhas-apostas', color: 'indigo' },
    { icon: 'ri-exchange-line', label: 'Transações', path: '/transacoes', color: 'pink' },
    { icon: 'ri-verified-badge-line', label: 'Verificação', path: '/verificacao', color: 'cyan' },
  ];

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className={`font-semibold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>A carregar perfil...</p>
        </div>
      </div>
    );
  }

  const isExcluded = isSelfExcluded?.() || false;
  const _isCooling = isCoolingOff?.() || false;

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`} style={{ fontFamily: 'Inter, sans-serif' }}>
      <Header />

      <main className="flex-1 pt-20 pb-24 lg:pb-8">
        <div className="max-w-4xl mx-auto px-4">
          {/* Cabeçalho do Perfil */}
          <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-6 mb-6 relative overflow-hidden">
            {/* Decoração de fundo */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-500 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
            </div>

            <div className="relative z-10 flex items-center gap-4">
              <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/30">
                <span className="text-3xl font-bold text-gray-900">
                  {profile?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-white mb-1">
                  {profile?.full_name || 'Utilizador'}
                </h1>
                <p className="text-gray-400 text-sm">{user?.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  {isExcluded && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs font-medium">
                      <i className="ri-shield-user-fill"></i>
                      Auto-Exclusão
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-colors cursor-pointer"
              >
                <i className={`${isEditing ? 'ri-close-line' : 'ri-edit-line'} text-white text-lg`}></i>
              </button>
            </div>

            {/* Saldo Rápido */}
            <div className="relative z-10 mt-6 grid grid-cols-3 gap-3">
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <p className="text-gray-400 text-[10px] mb-0.5">Saldo</p>
                <p className="text-white font-bold text-lg">€{(profile?.balance || 0).toFixed(2)}</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <p className="text-gray-400 text-[10px] mb-0.5">Bónus</p>
                <p className="text-amber-400 font-bold text-lg">€{(profile?.bonus_balance || 0).toFixed(2)}</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <p className="text-gray-400 text-[10px] mb-0.5">FreeBets</p>
                <p className="text-teal-400 font-bold text-lg">€{(profile?.freebet_balance || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Mensagem de Sucesso */}
          {showSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-center gap-3 animate-pulse">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <i className="ri-checkbox-circle-fill text-green-600 text-xl"></i>
              </div>
              <p className="text-green-800 font-medium">Alterações guardadas com sucesso!</p>
            </div>
          )}

          {/* Ações Rápidas */}
          <div className={`rounded-2xl shadow-sm p-4 mb-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <h3 className={`text-sm font-bold mb-3 flex items-center gap-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <i className="ri-flashlight-line text-amber-500"></i>
              Ações Rápidas
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {quickActions.map((action) => (
                <Link
                  key={action.path}
                  to={action.path}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors cursor-pointer group ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                    action.color === 'teal' ? 'bg-teal-100 text-teal-600' :
                    action.color === 'green' ? 'bg-green-100 text-green-600' :
                    action.color === 'amber' ? 'bg-amber-100 text-amber-600' :
                    action.color === 'indigo' ? 'bg-indigo-100 text-indigo-600' :
                    action.color === 'pink' ? 'bg-pink-100 text-pink-600' :
                    'bg-cyan-100 text-cyan-600'
                  }`}>
                    <i className={`${action.icon} text-lg`}></i>
                  </div>
                  <span className={`text-[10px] font-medium text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{action.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Tabs de Menu */}
          <div className={`rounded-2xl shadow-sm overflow-hidden mb-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className={`flex border-b overflow-x-auto ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === item.id
                      ? 'text-amber-600 border-b-2 border-amber-500 bg-amber-50/50'
                      : isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <i className={item.icon}></i>
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* Tab: Dados Pessoais */}
              {activeTab === 'info' && (
                <div className="space-y-4">
                  <div>
                    <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Nome Completo</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                        className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-amber-200 focus:border-amber-400 text-sm ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`}
                        placeholder="O teu nome completo"
                      />
                    ) : (
                      <p className={`px-4 py-3 rounded-xl text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-900'}`}>
                        {profile?.full_name || '—'}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Email</label>
                    <p className={`px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-900'}`}>
                      <i className={`ri-mail-line ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                      {user?.email}
                    </p>
                  </div>

                  <div>
                    <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Telefone</label>
                    {isEditing ? (
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-amber-200 focus:border-amber-400 text-sm ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`}
                        placeholder="+351 912 345 678"
                      />
                    ) : (
                      <p className={`px-4 py-3 rounded-xl text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-900'}`}>
                        {profile?.phone || '—'}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Data de Nascimento</label>
                    {isEditing ? (
                      <input
                        type="date"
                        value={formData.birth_date}
                        onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                        className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-amber-200 focus:border-amber-400 text-sm ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`}
                      />
                    ) : (
                      <p className={`px-4 py-3 rounded-xl text-sm ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-900'}`}>
                        {profile?.birth_date ? new Date(profile.birth_date).toLocaleDateString('pt-PT') : '—'}
                      </p>
                    )}
                  </div>

                  {isEditing && (
                    <button
                      onClick={handleSave}
                      className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-amber-700 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-save-line mr-2"></i>
                      Guardar Alterações
                    </button>
                  )}
                </div>
              )}

              {/* Tab: Segurança */}
              {activeTab === 'security' && (
                <div className="space-y-4">
                  <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                          <i className="ri-lock-password-line text-teal-600 text-lg"></i>
                        </div>
                        <div>
                          <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Palavra-passe</p>
                          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Última alteração: há 30 dias</p>
                        </div>
                      </div>
                      <button className={`px-4 py-2 border rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${isDark ? 'bg-gray-600 border-gray-500 text-white hover:bg-gray-500' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                        Alterar
                      </button>
                    </div>
                  </div>

                  <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                          <i className="ri-smartphone-line text-indigo-600 text-lg"></i>
                        </div>
                        <div>
                          <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Autenticação 2FA</p>
                          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Proteção adicional</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>
                        Desativado
                      </span>
                    </div>
                  </div>

                  <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          profile?.kyc_verified ? 'bg-green-100' : 'bg-amber-100'
                        }`}>
                          <i className={`ri-verified-badge-line text-lg ${
                            profile?.kyc_verified ? 'text-green-600' : 'text-amber-600'
                          }`}></i>
                        </div>
                        <div>
                          <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Verificação KYC</p>
                          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {profile?.kyc_verified ? 'Conta verificada' : 'Verificação pendente'}
                          </p>
                        </div>
                      </div>
                      {!profile?.kyc_verified && (
                        <Link
                          to="/verificacao"
                          className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Verificar
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Limites de Jogo */}
              {activeTab === 'limits' && (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i className="ri-shield-check-line text-teal-600 text-lg"></i>
                      </div>
                      <div>
                        <p className="font-medium text-teal-900 text-sm mb-1">Jogo Responsável</p>
                        <p className="text-xs text-teal-700">
                          Define limites para controlar os teus gastos e tempo de jogo.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <i className={`ri-money-euro-circle-line ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                        <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Limite Diário</span>
                      </div>
                      <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>€{profile?.daily_limit || '500'}</p>
                    </div>
                    <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <i className={`ri-calendar-line ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                        <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Limite Semanal</span>
                      </div>
                      <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>€{profile?.weekly_limit || '2000'}</p>
                    </div>
                    <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <i className={`ri-calendar-check-line ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                        <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Limite Mensal</span>
                      </div>
                      <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>€{profile?.monthly_limit || '5000'}</p>
                    </div>
                    <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <i className={`ri-time-line ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                        <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Tempo de Sessão</span>
                      </div>
                      <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{profile?.session_limit || '4'}h</p>
                    </div>
                  </div>

                  <div className={`pt-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                    <button
                      onClick={() => {
                        setExclusionType('cooling_off');
                        setShowExclusionModal(true);
                      }}
                      className="w-full py-3 bg-amber-100 text-amber-700 font-medium rounded-xl hover:bg-amber-200 transition-colors cursor-pointer whitespace-nowrap mb-2"
                    >
                      <i className="ri-time-line mr-2"></i>
                      Período de Reflexão (24h-7 dias)
                    </button>
                    <button
                      onClick={() => {
                        setExclusionType('self_exclusion');
                        setShowExclusionModal(true);
                      }}
                      className="w-full py-3 bg-red-100 text-red-700 font-medium rounded-xl hover:bg-red-200 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-shield-user-line mr-2"></i>
                      Auto-Exclusão (6 meses - 5 anos)
                    </button>
                  </div>
                </div>
              )}

              {/* Tab: Notificações */}
              {activeTab === 'notifications' && (
                <div className="space-y-3">
                  {[
                    { id: 'promo', icon: 'ri-gift-line', label: 'Promoções e Ofertas', desc: 'Recebe alertas de bónus', enabled: true },
                    { id: 'bets', icon: 'ri-file-list-3-line', label: 'Resultados de Apostas', desc: 'Notificações de ganhos', enabled: true },
                    { id: 'cashout', icon: 'ri-hand-coin-line', label: 'Alertas de Cash Out', desc: 'Oportunidades de cash out', enabled: false },
                    { id: 'news', icon: 'ri-newspaper-line', label: 'Novidades', desc: 'Atualizações da plataforma', enabled: false },
                  ].map((item) => (
                    <div key={item.id} className={`flex items-center justify-between p-4 rounded-xl ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-sm ${isDark ? 'bg-gray-600' : 'bg-white'}`}>
                          <i className={`${item.icon} text-lg ${isDark ? 'text-gray-300' : 'text-gray-600'}`}></i>
                        </div>
                        <div>
                          <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.label}</p>
                          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.desc}</p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked={item.enabled} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab: Definições */}
              {activeTab === 'settings' && (
                <div className="space-y-4">
                  {/* Modo Escuro/Claro */}
                  <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <h4 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      <i className="ri-palette-line text-amber-500"></i>
                      Aparência
                    </h4>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setTheme('light')}
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          theme === 'light'
                            ? 'border-amber-500 bg-amber-50'
                            : isDark ? 'border-gray-600 bg-gray-600 hover:border-gray-500' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${theme === 'light' ? 'bg-amber-100' : isDark ? 'bg-gray-500' : 'bg-gray-100'}`}>
                            <i className={`ri-sun-line text-2xl ${theme === 'light' ? 'text-amber-600' : isDark ? 'text-gray-300' : 'text-gray-500'}`}></i>
                          </div>
                          <span className={`text-sm font-medium ${theme === 'light' ? 'text-amber-700' : isDark ? 'text-gray-300' : 'text-gray-600'}`}>Claro</span>
                          {theme === 'light' && (
                            <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-medium rounded-full">Ativo</span>
                          )}
                        </div>
                      </button>

                      <button
                        onClick={() => setTheme('dark')}
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          theme === 'dark'
                            ? 'border-amber-500 bg-gray-600'
                            : isDark ? 'border-gray-600 bg-gray-600 hover:border-gray-500' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${theme === 'dark' ? 'bg-gray-500' : isDark ? 'bg-gray-500' : 'bg-gray-100'}`}>
                            <i className={`ri-moon-line text-2xl ${theme === 'dark' ? 'text-amber-400' : isDark ? 'text-gray-300' : 'text-gray-500'}`}></i>
                          </div>
                          <span className={`text-sm font-medium ${theme === 'dark' ? 'text-amber-400' : isDark ? 'text-gray-300' : 'text-gray-600'}`}>Escuro</span>
                          {theme === 'dark' && (
                            <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-medium rounded-full">Ativo</span>
                          )}
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Idioma */}
                  <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      <i className="ri-global-line text-amber-500"></i>
                      Idioma
                    </h4>
                    <select className={`w-full px-4 py-3 rounded-xl text-sm cursor-pointer ${isDark ? 'bg-gray-600 text-white border-gray-500' : 'bg-white border-gray-200'} border`}>
                      <option value="pt">🇵🇹 Português</option>
                      <option value="en">🇬🇧 English</option>
                      <option value="es">🇪🇸 Español</option>
                    </select>
                  </div>

                  {/* Formato de Odds */}
                  <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      <i className="ri-calculator-line text-amber-500"></i>
                      Formato de Odds
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {['Decimal', 'Fracionário', 'Americano'].map((format, idx) => (
                        <button
                          key={format}
                          className={`py-2.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            idx === 0
                              ? 'bg-amber-500 text-white'
                              : isDark ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                          }`}
                        >
                          {format}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Histórico de Transações */}
                  <Link
                    to="/transacoes"
                    className={`flex items-center justify-between p-4 rounded-xl transition-colors cursor-pointer ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
                        <i className="ri-exchange-line text-pink-600 text-lg"></i>
                      </div>
                      <div>
                        <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Histórico de Transações</p>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Ver todas as transações detalhadas</p>
                      </div>
                    </div>
                    <i className={`ri-arrow-right-s-line text-lg ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                  </Link>

                  {/* Limpar Cache */}
                  <button
                    onClick={() => {
                      localStorage.clear();
                      window.location.reload();
                    }}
                    className={`w-full flex items-center justify-between p-4 rounded-xl transition-colors cursor-pointer ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                        <i className="ri-delete-bin-line text-red-600 text-lg"></i>
                      </div>
                      <div className="text-left">
                        <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Limpar Cache</p>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Limpar dados locais da aplicação</p>
                      </div>
                    </div>
                    <i className={`ri-arrow-right-s-line text-lg ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Links Úteis */}
          <div className={`rounded-2xl shadow-sm p-4 mb-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <h3 className={`text-sm font-bold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>Ajuda e Suporte</h3>
            <div className="grid grid-cols-2 gap-2">
              <Link to="/faq" className={`flex items-center gap-2 p-3 rounded-xl transition-colors cursor-pointer ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <i className={`ri-question-line ${isDark ? 'text-gray-400' : 'text-gray-500'}`}></i>
                <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>FAQ</span>
              </Link>
              <Link to="/jogo-responsavel" className={`flex items-center gap-2 p-3 rounded-xl transition-colors cursor-pointer ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <i className={`ri-heart-pulse-line ${isDark ? 'text-gray-400' : 'text-gray-500'}`}></i>
                <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Jogo Responsável</span>
              </Link>
              <Link to="/termos-e-condicoes" className={`flex items-center gap-2 p-3 rounded-xl transition-colors cursor-pointer ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <i className={`ri-file-text-line ${isDark ? 'text-gray-400' : 'text-gray-500'}`}></i>
                <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Termos</span>
              </Link>
              <Link to="/politica-de-privacidade" className={`flex items-center gap-2 p-3 rounded-xl transition-colors cursor-pointer ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <i className={`ri-shield-line ${isDark ? 'text-gray-400' : 'text-gray-500'}`}></i>
                <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Privacidade</span>
              </Link>
            </div>
          </div>

          {/* Botão Sair */}
          <button
            onClick={handleLogout}
            className={`w-full py-4 border font-semibold rounded-2xl transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 ${isDark ? 'bg-gray-800 border-red-500/30 text-red-400 hover:bg-red-500/10' : 'bg-white border-red-200 text-red-600 hover:bg-red-50'}`}
          >
            <i className="ri-logout-box-r-line text-lg"></i>
            Terminar Sessão
          </button>
        </div>
      </main>

      <Footer />

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* Modal de Exclusão */}
      {showExclusionModal && (
        <SelfExclusionModal
          isOpen={showExclusionModal}
          onClose={() => setShowExclusionModal(false)}
          type={exclusionType}
          onConfirm={handleSelfExclusionConfirm}
        />
      )}
    </div>
  );
}

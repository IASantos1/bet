
import { useState, useEffect } from 'react';
import { Header } from '../../components/feature/Header';
import { Footer } from '../../components/feature/Footer';
import { MobileBottomNav } from '../../components/feature/MobileBottomNav';
import CashOutButton from '../../components/feature/CashOutButton';
import CashOutNotificationPanel from '../../components/feature/CashOutNotificationPanel';
import { useWinCelebration } from '../../components/feature/WinCelebration';
import { useAuth } from '../../contexts/AuthContext';
import { useWallet } from '../../hooks/useWallet';
import { useProfile } from '../../hooks/useProfile';
import { useCashOutNotifications } from '../../hooks/useCashOutNotifications';
import { apiFetch } from '../../services/backendClient';

interface BetSelection {
  id: number;
  homeTeam: string;
  awayTeam: string;
  selection: string;
  odds: number;
  league: string;
  market?: string;
  stake?: number;
}

interface Bet {
  id: string;
  user_id: string;
  total_stake: number;
  potential_return: number;
  total_odds: number;
  bet_type: string;
  status: string;
  result?: string;
  selections: BetSelection[];
  created_at: string;
  settled_at?: string;
  cashout_value?: number;
  cashout_at?: string;
  winnings?: number;
}

export default function MyBetsPage() {
  const { user } = useAuth();
  const { wallet, addWinnings } = useWallet();
  const { profile: _profile } = useProfile();
  const { notifications, permissionGranted, requestPermission } = useCashOutNotifications();
  const [activeTab, setActiveTab] = useState<'open' | 'resolved'>('open');
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  
  // ✅ Hook de celebração de ganho com confete
  const { showCelebration, CelebrationComponent } = useWinCelebration();

  const balance = wallet?.balance ?? 0;

  useEffect(() => {
    const CACHE_KEY = 'my_bets_cache_v1';

    const loadFromCache = () => {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as Bet[];
          if (Array.isArray(parsed)) {
            setBets(parsed);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar cache de apostas:', err);
      }
    };

    const fetchBets = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const resp = await apiFetch('/bets', { method: 'GET' });
        const safeData = resp.bets || [];
        setBets(safeData);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(safeData));
        } catch (err) {
          console.warn('Falha ao guardar cache local de apostas:', err);
        }
      } catch (err) {
        console.error('Erro ao carregar apostas:', err);
      } finally {
        setLoading(false);
      }
    };

    loadFromCache();
    fetchBets();
  }, [user]);

  const openBets = bets.filter(bet => bet.status === 'pending');
  const resolvedBets = bets.filter(bet => ['won', 'lost', 'cashed_out'].includes(bet.status));

  // Estatísticas
  const totalStaked = bets.reduce((sum, bet) => sum + Number(bet.total_stake || 0), 0);
  const totalWon = bets
    .filter(bet => bet.status === 'won' || bet.status === 'cashed_out')
    .reduce((sum, bet) => sum + Number(bet.potential_return || bet.cashout_value || 0), 0);
  const winRate = bets.length > 0 
    ? Math.round((bets.filter(b => b.status === 'won').length / bets.filter(b => b.status !== 'pending').length) * 100) || 0
    : 0;

  const handleCashOutSuccess = async (betId: string, amount: number) => {
    setBets(prev => prev.map(bet => 
      bet.id === betId 
        ? { ...bet, status: 'cashed_out', cashout_value: amount, winnings: amount }
        : bet
    ));
    
    showCelebration(amount, betId);
  };

  // ✅ Simular resultado de aposta (para demonstração)
  const handleSimulateWin = async (bet: Bet) => {
    try {
      setBets(prev => prev.map(b => b.id === bet.id ? { ...b, status: 'won', result: 'won', settled_at: new Date().toISOString() } : b));

      // Adicionar ganhos ao saldo
      const winAmount = Number(bet.potential_return);
      await addWinnings(winAmount, bet.id);

      // Atualizar lista local
      setBets(prev => prev.map(b => 
        b.id === bet.id 
          ? { ...b, status: 'won', result: 'won', settled_at: new Date().toISOString() }
          : b
      ));

      // ✅ Mostrar celebração de ganho com confete
      showCelebration(winAmount, bet.id);

      console.log(`🎉 Aposta ganha! +€${winAmount.toFixed(2)} adicionado ao saldo`);
    } catch (err) {
      console.error('Erro ao simular vitória:', err);
    }
  };

  const handleSimulateLoss = async (bet: Bet) => {
    try {
      setBets(prev => prev.map(b => b.id === bet.id ? { ...b, status: 'lost', result: 'lost', settled_at: new Date().toISOString() } : b));

      // Atualizar lista local
      setBets(prev => prev.map(b => 
        b.id === bet.id 
          ? { ...b, status: 'lost', result: 'lost', settled_at: new Date().toISOString() }
          : b
      ));

      console.log(`❌ Aposta perdida. Valor apostado: €${Number(bet.total_stake).toFixed(2)}`);
    } catch (err) {
      console.error('Erro ao simular perda:', err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Em Aberto' };
      case 'won':
        return { bg: 'bg-green-100', text: 'text-green-800', label: 'Ganhou' };
      case 'lost':
        return { bg: 'bg-red-100', text: 'text-red-800', label: 'Perdeu' };
      case 'cashed_out':
        return { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Cash Out' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-800', label: status };
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ✅ Componente de celebração com confete */}
      {CelebrationComponent}
      
      <Header 
        balance={balance}
        freeBets={0}
        isLoggedIn={!!user}
      />

      <main className="flex-1 py-8 pb-20 lg:pb-8 pt-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          {/* Page Header */}
          <div className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-4xl font-bold text-gray-900 mb-2">
                <i className="ri-file-list-3-line text-amber-500 mr-3"></i>
                Minhas Apostas
              </h1>
              <p className="text-gray-600 text-sm md:text-base">Acompanhe suas apostas em aberto e histórico</p>
            </div>
            
            {/* Notification Button */}
            <div className="relative">
              <button
                onClick={() => setShowNotificationPanel(!showNotificationPanel)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer whitespace-nowrap ${
                  permissionGranted 
                    ? 'bg-amber-500 hover:bg-amber-600 text-gray-900' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                <i className={`${permissionGranted ? 'ri-notification-3-line' : 'ri-notification-off-line'}`}></i>
                Alertas
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                    {notifications.length}
                  </span>
                )}
              </button>

              {/* Notification Panel Dropdown */}
              {showNotificationPanel && (
                <div className="absolute right-0 top-full mt-2 z-50">
                  <CashOutNotificationPanel onClose={() => setShowNotificationPanel(false)} />
                </div>
              )}
            </div>
          </div>

          {/* ✅ Saldo Atual - Destaque */}
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-6 mb-6 text-gray-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-900/70 text-sm mb-1">Saldo Atual</p>
                <p className="text-4xl font-bold">€{balance.toFixed(2)}</p>
              </div>
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <i className="ri-wallet-3-line text-3xl"></i>
              </div>
            </div>
          </div>

          {/* Notification Permission Banner */}
          {!permissionGranted && openBets.length > 0 && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 mb-6">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <i className="ri-notification-3-line text-amber-600 text-2xl"></i>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 mb-1">Ative os Alertas de Cash Out</h3>
                  <p className="text-sm text-gray-600">
                    Receba notificações quando o valor de Cash Out atingir um valor favorável!
                  </p>
                </div>
                <button
                  onClick={requestPermission}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-notification-line mr-2"></i>
                  Ativar
                </button>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs md:text-sm text-gray-600">Total Apostado</span>
                <i className="ri-money-euro-circle-line text-amber-500 text-lg md:text-xl"></i>
              </div>
              <div className="text-xl md:text-2xl font-bold text-gray-900">€{totalStaked.toFixed(2)}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs md:text-sm text-gray-600">Em Aberto</span>
                <i className="ri-time-line text-yellow-600 text-lg md:text-xl"></i>
              </div>
              <div className="text-xl md:text-2xl font-bold text-gray-900">{openBets.length}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs md:text-sm text-gray-600">Ganhos</span>
                <i className="ri-trophy-line text-green-600 text-lg md:text-xl"></i>
              </div>
              <div className="text-xl md:text-2xl font-bold text-green-600">€{totalWon.toFixed(2)}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs md:text-sm text-gray-600">Taxa Vitória</span>
                <i className="ri-percent-line text-purple-600 text-lg md:text-xl"></i>
              </div>
              <div className="text-xl md:text-2xl font-bold text-gray-900">{winRate}%</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setActiveTab('open')}
                className={`flex-1 py-3 md:py-4 px-4 md:px-6 font-semibold text-xs md:text-sm transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'open'
                    ? 'text-amber-600 border-b-2 border-amber-500'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <i className="ri-time-line mr-1 md:mr-2"></i>
                Em Aberto ({openBets.length})
              </button>
              <button
                onClick={() => setActiveTab('resolved')}
                className={`flex-1 py-3 md:py-4 px-4 md:px-6 font-semibold text-xs md:text-sm transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'resolved'
                    ? 'text-amber-600 border-b-2 border-amber-500'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <i className="ri-check-line mr-1 md:mr-2"></i>
                Resolvidas ({resolvedBets.length})
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <i className="ri-loader-4-line animate-spin text-4xl text-amber-500 mb-4"></i>
              <p className="text-gray-600">A carregar apostas...</p>
            </div>
          )}

          {/* Bets List */}
          {!loading && (
            <div className="space-y-4">
              {activeTab === 'open' && openBets.map((bet) => {
                const status = getStatusBadge(bet.status);
                const selections = bet.selections || [];
                
                return (
                  <div key={bet.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="p-4 md:p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <span className={`inline-block px-3 py-1 ${status.bg} ${status.text} rounded-full text-xs font-bold mb-2`}>
                            {status.label}
                          </span>
                          <div className="text-xs md:text-sm text-gray-500">{formatDate(bet.created_at)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500 mb-1">Tipo</div>
                          <div className="font-semibold text-sm text-gray-900 capitalize">
                            {bet.bet_type === 'multiple' ? 'Múltipla' : 'Simples'}
                          </div>
                        </div>
                      </div>

                      {/* ✅ Seleções da Aposta */}
                      {selections.length > 0 && (
                        <div className="mb-4 space-y-2">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Seleções</div>
                          {selections.map((sel, idx) => (
                            <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="text-[10px] text-gray-400 mb-0.5">{sel.league}</div>
                                  <div className="text-xs md:text-sm font-medium text-gray-900 truncate">
                                    {sel.homeTeam} vs {sel.awayTeam}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    {sel.market && (
                                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">
                                        {sel.market}
                                      </span>
                                    )}
                                    <span className="text-xs font-semibold text-amber-600">{sel.selection}</span>
                                  </div>
                                </div>
                                <div className="text-right ml-3">
                                  <div className="text-sm md:text-base font-bold text-gray-900">
                                    {Number(sel.odds).toFixed(2)}
                                  </div>
                                  {sel.stake && (
                                    <div className="text-[10px] text-gray-500">€{Number(sel.stake).toFixed(2)}</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Bet Details */}
                      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 pt-4 border-t border-gray-200">
                        <div>
                          <div className="text-[10px] md:text-xs text-gray-500 mb-1">Apostado</div>
                          <div className="font-bold text-base md:text-lg text-gray-900">€{Number(bet.total_stake).toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] md:text-xs text-gray-500 mb-1">Odds</div>
                          <div className="font-bold text-base md:text-lg text-amber-600">
                            {Number(bet.total_odds).toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] md:text-xs text-gray-500 mb-1">Retorno</div>
                          <div className="font-bold text-base md:text-lg text-green-600">€{Number(bet.potential_return).toFixed(2)}</div>
                        </div>
                      </div>

                      {/* ✅ Botões de Simulação (para demonstração) */}
                      <div className="flex gap-2 mb-4 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        <div className="flex-1">
                          <div className="text-[10px] text-gray-500 mb-2 flex items-center gap-1">
                            <i className="ri-test-tube-line"></i>
                            Simular Resultado (Demo)
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSimulateWin(bet)}
                              className="flex-1 py-2 px-3 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <i className="ri-check-line mr-1"></i>
                              Ganhou
                            </button>
                            <button
                              onClick={() => handleSimulateLoss(bet)}
                              className="flex-1 py-2 px-3 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <i className="ri-close-line mr-1"></i>
                              Perdeu
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Cash Out Section */}
                      <CashOutButton
                        betId={bet.id}
                        stake={Number(bet.total_stake)}
                        totalOdds={Number(bet.total_odds)}
                        potentialWin={Number(bet.potential_return)}
                        createdAt={bet.created_at}
                        onCashOutSuccess={(amount) => handleCashOutSuccess(bet.id, amount)}
                      />
                    </div>
                  </div>
                );
              })}

              {activeTab === 'resolved' && resolvedBets.map((bet) => {
                const status = getStatusBadge(bet.status);
                const selections = bet.selections || [];
                
                return (
                  <div key={bet.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <span className={`inline-block px-3 py-1 ${status.bg} ${status.text} rounded-full text-xs font-bold mb-2`}>
                          {status.label}
                        </span>
                        <div className="text-xs md:text-sm text-gray-500">{formatDate(bet.created_at)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1">Tipo</div>
                        <div className="font-semibold text-sm text-gray-900 capitalize">
                          {bet.bet_type === 'multiple' ? 'Múltipla' : 'Simples'}
                        </div>
                      </div>
                    </div>

                    {/* ✅ Seleções da Aposta */}
                    {selections.length > 0 && (
                      <div className="mb-4 space-y-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Seleções</div>
                        {selections.map((sel, idx) => (
                          <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] text-gray-400 mb-0.5">{sel.league}</div>
                                <div className="text-xs md:text-sm font-medium text-gray-900 truncate">
                                  {sel.homeTeam} vs {sel.awayTeam}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  {sel.market && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">
                                      {sel.market}
                                    </span>
                                  )}
                                  <span className="text-xs font-semibold text-amber-600">{sel.selection}</span>
                                </div>
                              </div>
                              <div className="text-right ml-3">
                                <div className="text-sm md:text-base font-bold text-gray-900">
                                  {Number(sel.odds).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Bet Details */}
                    <div className="grid grid-cols-3 gap-2 md:gap-4 pt-4 border-t border-gray-200">
                      <div>
                        <div className="text-[10px] md:text-xs text-gray-500 mb-1">Apostado</div>
                        <div className="font-bold text-base md:text-lg text-gray-900">€{Number(bet.total_stake).toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] md:text-xs text-gray-500 mb-1">Odds</div>
                        <div className="font-bold text-base md:text-lg text-amber-600">
                          {Number(bet.total_odds).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] md:text-xs text-gray-500 mb-1">
                          {bet.status === 'won' ? 'Ganho' : bet.status === 'cashed_out' ? 'Cash Out' : 'Perdido'}
                        </div>
                        <div className={`font-bold text-base md:text-lg ${
                          bet.status === 'won' ? 'text-green-600' : 
                          bet.status === 'cashed_out' ? 'text-blue-600' : 'text-red-600'
                        }`}>
                          {bet.status === 'won' 
                            ? `+€${Number(bet.potential_return).toFixed(2)}` 
                            : bet.status === 'cashed_out'
                            ? `€${Number(bet.cashout_value || 0).toFixed(2)}`
                            : `-€${Number(bet.total_stake).toFixed(2)}`}
                        </div>
                      </div>
                    </div>

                    {/* Cash Out Info */}
                    {bet.status === 'cashed_out' && bet.cashout_at && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                          <i className="ri-hand-coin-line"></i>
                          <span>Cash Out realizado em {formatDate(bet.cashout_at)}</span>
                        </div>
                      </div>
                    )}

                    {/* ✅ Info de Ganho */}
                    {bet.status === 'won' && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <i className="ri-trophy-line"></i>
                          <span>Ganhos de €{Number(bet.potential_return).toFixed(2)} adicionados ao saldo</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty State */}
          {!loading && ((activeTab === 'open' && openBets.length === 0) || 
            (activeTab === 'resolved' && resolvedBets.length === 0)) && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <i className="ri-file-list-line text-6xl text-gray-300 mb-4"></i>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Nenhuma aposta encontrada</h3>
              <p className="text-gray-600 mb-6">
                {activeTab === 'open' 
                  ? 'Não tens apostas em aberto no momento.' 
                  : 'Ainda não tens apostas resolvidas.'}
              </p>
              {activeTab === 'open' && (
                <a 
                  href="/"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <i className="ri-football-line"></i>
                  Ver Jogos Disponíveis
                </a>
              )}
            </div>
          )}

          {/* Info Box */}
          <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <i className="ri-information-line text-amber-500"></i>
              Como funciona o saldo
            </h3>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <i className="ri-add-circle-line text-green-500"></i>
                  Depósito
                </h4>
                <p className="text-sm text-gray-600">
                  Quando fazes um depósito, o valor é adicionado ao teu saldo imediatamente.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <i className="ri-subtract-line text-red-500"></i>
                  Aposta
                </h4>
                <p className="text-sm text-gray-600">
                  Ao colocar uma aposta, o valor é deduzido do teu saldo. Se ganhares, recebes o retorno.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <i className="ri-bank-line text-blue-500"></i>
                  Levantamento
                </h4>
                <p className="text-sm text-gray-600">
                  Podes levantar os teus ganhos a qualquer momento. O valor é deduzido do saldo.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
      
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}


/**
 * ✅ NOVO BOLETIM DE APOSTAS MOBILE
 * Design inspirado em plataformas profissionais
 * - Compacto quando minimizado
 * - Expande ao clicar
 * - Cálculos de odds em tempo real
 * - Animações suaves
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useProfile } from '../../hooks/useProfile';
import { useWallet } from '../../hooks/useWallet';
import { apiFetch } from '../../services/backendClient';

interface BetSelection {
  id: number;
  homeTeam: string;
  awayTeam: string;
  selection: string;
  odd: number;
  league?: string;
  market?: string;
  matchId?: string;
  stake?: string;
}

interface MobileBettingSlipProps {
  selections: BetSelection[];
  onRemoveSelection: (id: number) => void;
  onClearAll: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export default function MobileBettingSlip({
  selections,
  onRemoveSelection,
  onClearAll,
  isExpanded,
  onToggleExpand,
}: MobileBettingSlipProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { wallet } = useWallet();
  const { profile: _profile } = useProfile();
  const navigate = useNavigate();
  const isLight = theme === 'light';

  const [betType, setBetType] = useState<'single' | 'multiple'>('multiple');
  const [stakes, setStakes] = useState<Record<number, string>>({});
  const [multipleStake, setMultipleStake] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);

  const balance = wallet?.balance ?? 0;

  // Detectar conflito (mesmo jogo)
  const hasConflict = useMemo(() => {
    const matchIds = selections.map((s) => s.matchId || `${s.homeTeam}-${s.awayTeam}`);
    return new Set(matchIds).size !== matchIds.length;
  }, [selections]);

  const effectiveBetType = hasConflict ? 'single' : betType;

  // Cálculos de odds
  const totalOdds = useMemo(() => {
    return selections.reduce((acc, s) => acc * s.odd, 1);
  }, [selections]);

  const totalStakeSingle = useMemo(() => {
    return selections.reduce((sum, sel) => {
      const stake = parseFloat(stakes[sel.id] || '0');
      return sum + stake;
    }, 0);
  }, [selections, stakes]);

  const stakeMultiple = parseFloat(multipleStake || '0');

  const totalStake = effectiveBetType === 'single' ? totalStakeSingle : stakeMultiple;

  const potentialReturn = useMemo(() => {
    if (effectiveBetType === 'single') {
      return selections.reduce((sum, sel) => {
        const stake = parseFloat(stakes[sel.id] || '0');
        return sum + stake * sel.odd;
      }, 0);
    }
    return stakeMultiple * totalOdds;
  }, [effectiveBetType, selections, stakes, stakeMultiple, totalOdds]);

  const hasInsufficientBalance = totalStake > balance;

  // Quick stake
  const handleQuickStake = (amount: number) => {
    if (effectiveBetType === 'single') {
      const newStakes: Record<number, string> = {};
      selections.forEach((s) => {
        newStakes[s.id] = amount.toString();
      });
      setStakes(newStakes);
    } else {
      setMultipleStake(amount.toString());
    }
  };

  // Colocar aposta
  const handlePlaceBet = async () => {
    if (totalStake === 0 || isProcessing) return;

    if (!user) {
      navigate('/login');
      return;
    }

    if (totalStake > balance) {
      navigate('/deposito');
      return;
    }

    setIsProcessing(true);

    try {
      const betSelections = selections.map((sel) => ({
        id: sel.id,
        homeTeam: sel.homeTeam,
        awayTeam: sel.awayTeam,
        selection: sel.selection,
        odds: sel.odd,
        league: sel.league,
        market: sel.market || '1X2',
        stake: effectiveBetType === 'single' ? parseFloat(stakes[sel.id] || '0') : null,
      }));

      const body = {
        amount: totalStake,
        betType: effectiveBetType,
        totalOdds: totalOdds,
        potentialWin: potentialReturn,
        selections: betSelections,
      };

      const resp = await apiFetch('/wallet/bet', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (resp.error) {
        throw new Error(resp.error);
      }

      setSuccessData({
        totalStake,
        potentialReturn,
        selectionsCount: selections.length,
        betType: effectiveBetType,
      });
      setShowSuccess(true);

      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100, 50, 200]);
      }

      setTimeout(() => {
        setStakes({});
        setMultipleStake('');
        onClearAll();
        setShowSuccess(false);
      }, 2500);
    } catch (err: any) {
      console.error('❌ Erro ao colocar aposta:', err);
      alert(err.message || 'Erro ao processar aposta.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (selections.length === 0) return null;

  // ========================================
  // VERSÃO COMPACTA (Minimizada)
  // ========================================
  if (!isExpanded) {
    return (
      <div
        onClick={onToggleExpand}
        className={`fixed bottom-16 left-3 right-3 z-40 cursor-pointer ${
          isLight
            ? 'bg-white border-gray-200 shadow-xl'
            : 'bg-gray-900 border-gray-800 shadow-2xl shadow-black/50'
        } border rounded-2xl overflow-hidden transition-all duration-300 active:scale-[0.98]`}
      >
        {/* Barra de progresso visual */}
        <div className="h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 animate-pulse"></div>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Lado esquerdo - Info do boletim */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isLight ? 'bg-amber-100' : 'bg-amber-500/20'
                }`}>
                  <i className="ri-file-list-3-line text-amber-500 text-lg"></i>
                </div>
                {/* Badge de quantidade */}
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-[10px] font-bold">{selections.length}</span>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                    Boletim
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    effectiveBetType === 'multiple'
                      ? 'bg-amber-500/20 text-amber-500'
                      : isLight ? 'bg-gray-200 text-gray-600' : 'bg-gray-800 text-gray-400'
                  }`}>
                    {effectiveBetType === 'multiple' ? 'Múltipla' : 'Simples'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                    Odd Total:
                  </span>
                  <span className="text-sm font-black text-amber-500">
                    {totalOdds.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Lado direito - Retorno potencial */}
            <div className="text-right">
              <div className={`text-[10px] ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
                Retorno Potencial
              </div>
              <div className="text-lg font-black text-emerald-500">
                €{potentialReturn.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Indicador de expansão */}
          <div className="flex justify-center mt-2">
            <div className={`w-8 h-1 rounded-full ${isLight ? 'bg-gray-300' : 'bg-gray-700'}`}></div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================
  // VERSÃO EXPANDIDA
  // ========================================
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onToggleExpand}
      ></div>

      {/* Modal de Sucesso */}
      {showSuccess && successData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70"></div>
          <div className={`relative z-10 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl ${
            isLight ? 'bg-white' : 'bg-gray-900'
          } animate-success-modal-in`}>
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 text-center">
              <div className="w-16 h-16 mx-auto bg-white rounded-full flex items-center justify-center shadow-lg mb-3">
                <i className="ri-check-line text-emerald-500 text-3xl"></i>
              </div>
              <h2 className="text-white text-xl font-bold">Aposta Colocada!</h2>
              <p className="text-white/80 text-sm mt-1">Boa sorte! 🍀</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between">
                <span className={isLight ? 'text-gray-500' : 'text-gray-400'}>Valor</span>
                <span className={`font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                  €{successData.totalStake.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className={isLight ? 'text-gray-500' : 'text-gray-400'}>Retorno</span>
                <span className="font-bold text-emerald-500 text-lg">
                  €{successData.potentialReturn.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Boletim Expandido */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 ${
          isLight ? 'bg-white' : 'bg-gray-950'
        } rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col animate-slide-up`}
      >
        {/* Handle de arraste */}
        <div
          className="flex justify-center pt-3 pb-2 cursor-pointer"
          onClick={onToggleExpand}
        >
          <div className={`w-10 h-1 rounded-full ${isLight ? 'bg-gray-300' : 'bg-gray-700'}`}></div>
        </div>

        {/* Header */}
        <div className={`flex items-center justify-between px-4 pb-3 border-b ${
          isLight ? 'border-gray-200' : 'border-gray-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isLight ? 'bg-amber-100' : 'bg-amber-500/20'
            }`}>
              <i className="ri-file-list-3-line text-amber-500 text-lg"></i>
            </div>
            <div>
              <h3 className={`font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                Boletim de Apostas
              </h3>
              <span className={`text-xs ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                {selections.length} {selections.length === 1 ? 'seleção' : 'seleções'}
              </span>
            </div>
          </div>
          <button
            onClick={onToggleExpand}
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800'
            } cursor-pointer`}
          >
            <i className={`ri-arrow-down-s-line text-xl ${isLight ? 'text-gray-500' : 'text-gray-400'}`}></i>
          </button>
        </div>

        {/* Saldo */}
        {user && (
          <div className={`mx-4 mt-3 px-3 py-2 rounded-xl flex items-center justify-between ${
            isLight ? 'bg-amber-50 border border-amber-200' : 'bg-amber-500/10 border border-amber-500/20'
          }`}>
            <span className={`text-xs font-medium ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
              <i className="ri-wallet-3-line mr-1"></i>Saldo Disponível
            </span>
            <span className={`text-sm font-bold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>
              €{balance.toFixed(2)}
            </span>
          </div>
        )}

        {/* Tipo de aposta */}
        <div className="px-4 pt-3">
          <div className={`flex gap-2 p-1 rounded-xl ${isLight ? 'bg-gray-100' : 'bg-gray-900'}`}>
            <button
              onClick={() => setBetType('single')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                effectiveBetType === 'single'
                  ? 'bg-amber-500 text-gray-900 shadow-lg'
                  : isLight ? 'text-gray-500' : 'text-gray-400'
              }`}
            >
              Simples
            </button>
            <button
              onClick={() => !hasConflict && setBetType('multiple')}
              disabled={hasConflict || selections.length < 2}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap relative ${
                effectiveBetType === 'multiple'
                  ? 'bg-amber-500 text-gray-900 shadow-lg'
                  : isLight ? 'text-gray-500' : 'text-gray-400'
              } ${hasConflict || selections.length < 2 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Múltipla
              {selections.length > 1 && !hasConflict && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center text-[8px] font-bold text-white">
                  {selections.length}
                </span>
              )}
            </button>
          </div>

          {hasConflict && (
            <div className={`mt-2 px-3 py-2 rounded-lg text-[10px] flex items-center gap-2 ${
              isLight ? 'bg-red-50 border border-red-200 text-red-600' : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              <i className="ri-error-warning-line"></i>
              <span>Múltipla bloqueada: 2+ seleções do mesmo jogo</span>
            </div>
          )}
        </div>

        {/* Lista de seleções */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ maxHeight: '35vh' }}>
          {selections.map((sel) => (
            <div
              key={sel.id}
              className={`rounded-xl p-3 border ${
                isLight ? 'bg-gray-50 border-gray-200' : 'bg-gray-900 border-gray-800'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] truncate ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                    {sel.league}
                  </p>
                  <p className={`text-xs font-medium truncate ${isLight ? 'text-gray-800' : 'text-gray-300'}`}>
                    {sel.homeTeam} vs {sel.awayTeam}
                  </p>
                </div>
                <button
                  onClick={() => onRemoveSelection(sel.id)}
                  className={`w-6 h-6 flex items-center justify-center rounded-lg cursor-pointer ${
                    isLight ? 'hover:bg-red-100' : 'hover:bg-red-500/20'
                  }`}
                >
                  <i className={`ri-close-line text-sm ${isLight ? 'text-gray-400' : 'text-gray-500'}`}></i>
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {sel.market && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                      isLight ? 'bg-gray-200 text-gray-500' : 'bg-gray-800 text-gray-500'
                    }`}>
                      {sel.market}
                    </span>
                  )}
                  <span className="text-xs font-semibold text-amber-500">{sel.selection}</span>
                </div>
                <span className={`text-sm font-black px-2 py-1 rounded-lg ${
                  isLight ? 'bg-gray-200 text-gray-800' : 'bg-gray-800 text-white'
                }`}>
                  {sel.odd.toFixed(2)}
                </span>
              </div>

              {/* Input de stake para simples */}
              {effectiveBetType === 'single' && (
                <div className="mt-2">
                  <input
                    type="number"
                    placeholder="Valor €"
                    value={stakes[sel.id] || ''}
                    onChange={(e) => setStakes((prev) => ({ ...prev, [sel.id]: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg text-xs focus:outline-none ${
                      isLight
                        ? 'bg-white border-gray-200 text-gray-800 focus:border-amber-400'
                        : 'bg-gray-800 border-gray-700 text-white focus:border-amber-500'
                    }`}
                    min="0"
                    step="0.5"
                  />
                  {stakes[sel.id] && parseFloat(stakes[sel.id]) > 0 && (
                    <div className={`flex justify-between mt-1 text-[10px] ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                      <span>Retorno:</span>
                      <span className="text-emerald-500 font-semibold">
                        €{(parseFloat(stakes[sel.id]) * sel.odd).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Área de ações */}
        <div className={`px-4 py-4 border-t ${isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-800 bg-gray-900'}`}>
          {/* Resumo de odds */}
          {effectiveBetType === 'multiple' && (
            <div className={`flex items-center justify-between mb-3 px-3 py-2 rounded-xl ${
              isLight ? 'bg-white border border-gray-200' : 'bg-gray-800 border border-gray-700'
            }`}>
              <span className={`text-xs ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                Odd Total ({selections.length} seleções)
              </span>
              <span className="text-lg font-black text-amber-500">{totalOdds.toFixed(2)}</span>
            </div>
          )}

          {/* Input de valor para múltipla */}
          {effectiveBetType === 'multiple' && (
            <div className="relative mb-3">
              <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold ${
                isLight ? 'text-gray-400' : 'text-gray-500'
              }`}>€</span>
              <input
                type="number"
                placeholder="Insira o valor da aposta"
                value={multipleStake}
                onChange={(e) => setMultipleStake(e.target.value)}
                className={`w-full pl-8 pr-4 py-3 border rounded-xl text-base font-semibold focus:outline-none ${
                  isLight
                    ? 'bg-white border-gray-200 text-gray-800 focus:border-amber-400'
                    : 'bg-gray-800 border-gray-700 text-white focus:border-amber-500'
                }`}
                min="0"
                step="0.5"
              />
            </div>
          )}

          {/* Botões rápidos */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[5, 10, 25, 50].map((amount) => {
              const isActive = effectiveBetType === 'multiple'
                ? multipleStake === amount.toString()
                : Object.values(stakes).every((v) => v === amount.toString()) && Object.keys(stakes).length > 0;
              const isDisabled = amount > balance;
              return (
                <button
                  key={amount}
                  onClick={() => !isDisabled && handleQuickStake(amount)}
                  disabled={isDisabled}
                  className={`py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-amber-500 text-gray-900 shadow-lg shadow-amber-500/30'
                      : isDisabled
                      ? isLight ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
                      : isLight
                      ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  €{amount}
                </button>
              );
            })}
          </div>

          {/* Aviso de saldo insuficiente */}
          {hasInsufficientBalance && totalStake > 0 && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-3 ${
              isLight ? 'bg-red-50 border border-red-200' : 'bg-red-500/10 border border-red-500/20'
            }`}>
              <i className={`ri-error-warning-line ${isLight ? 'text-red-500' : 'text-red-400'}`}></i>
              <span className={`text-xs ${isLight ? 'text-red-600' : 'text-red-400'}`}>
                Saldo insuficiente. Faltam €{(totalStake - balance).toFixed(2)}
              </span>
            </div>
          )}

          {/* Bloqueio suave por email */}

          {/* Retorno potencial */}
          <div className={`flex items-center justify-between px-4 py-3 rounded-xl mb-3 ${
            isLight ? 'bg-emerald-50 border border-emerald-200' : 'bg-emerald-500/10 border border-emerald-500/20'
          }`}>
            <span className={`text-sm font-medium ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
              Retorno Potencial
            </span>
            <span className="text-xl font-black text-emerald-500">
              €{potentialReturn.toFixed(2)}
            </span>
          </div>

          {/* Botões de ação */}
          <div className="flex gap-3">
            <button
              onClick={onClearAll}
              className={`w-12 h-12 flex items-center justify-center rounded-xl cursor-pointer transition-colors ${
                isLight
                  ? 'bg-gray-200 hover:bg-red-100 text-gray-500 hover:text-red-500'
                  : 'bg-gray-800 hover:bg-red-500/20 text-gray-400 hover:text-red-400'
              }`}
            >
              <i className="ri-delete-bin-line text-lg"></i>
            </button>

            <button
              onClick={handlePlaceBet}
              disabled={totalStake === 0 || isProcessing || hasInsufficientBalance}
              className={`flex-1 h-12 rounded-xl text-sm font-bold cursor-pointer whitespace-nowrap transition-all flex items-center justify-center gap-2 ${
                totalStake > 0 && !hasInsufficientBalance && !isProcessing
                  ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-600/30'
                  : isLight
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isProcessing ? (
                <>
                  <i className="ri-loader-4-line animate-spin text-lg"></i>
                  A processar...
                </>
              ) : (
                <>
                  <i className="ri-check-line text-lg"></i>
                  Apostar {totalStake > 0 ? `€${totalStake.toFixed(2)}` : ''}
                </>
              )}
            </button>
          </div>

          {/* Jogo responsável */}
          <p className={`text-center text-[10px] mt-3 ${isLight ? 'text-gray-400' : 'text-gray-600'}`}>
            <i className="ri-heart-pulse-line mr-1"></i>
            Jogue com responsabilidade. +18
          </p>
        </div>
      </div>
    </>
  );
}


import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useWallet } from '../../../hooks/useWallet';
import { apiFetch } from '../../../services/backendClient';
import PropTypes from 'prop-types';

// ---------------------------
// Helper: simple prop‑type definitions (optional, but keeps some safety)
// ---------------------------
const betSelectionShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  homeTeam: PropTypes.string.isRequired,
  awayTeam: PropTypes.string.isRequired,
  selection: PropTypes.string.isRequired,
  odd: PropTypes.number.isRequired,
  league: PropTypes.string.isRequired,
  market: PropTypes.string,
  matchId: PropTypes.string,
});

function BettingSlipPanel({
  selections,
  onRemoveSelection,
  onClearAll,
  onClose,
  isMobile = false,
  onSwipeClose,
}) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { wallet, refetch } = useWallet();
  const navigate = useNavigate();
  const isLight = theme === 'light';

  // ----- State --------------------------------------------------------------
  const [betType, setBetType] = useState('multiple'); // 'single' | 'multiple'
  const [stakes, setStakes] = useState({});
  const [multipleStake, setMultipleStake] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // 🎉 Estado para animação de sucesso com confetti
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState<{
    totalStake: number;
    potentialReturn: number;
    selectionsCount: number;
    betType: string;
  } | null>(null);
  const [confettiPieces, setConfettiPieces] = useState<Array<{
    id: number;
    x: number;
    delay: number;
    color: string;
    size: number;
    rotation: number;
  }>>([]);

  // Swipe state
  const [swipeY, setSwipeY] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartRef = useRef({ y: 0, time: 0 });
  const swipeThreshold = 80;

  // Detect mobile via media query (kept as‑is)
  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const useMobileLayout = isMobile || isMobileView;

  // ✅ Saldo disponível
  const balance = wallet?.balance ?? 0;

  // ----- Conflict detection --------------------------------------------------
  const hasConflict = useMemo(() => {
    const matchIds = selections.map((s) => s.matchId || `${s.homeTeam}-${s.awayTeam}`);
    return new Set(matchIds).size !== matchIds.length;
  }, [selections]);

  const effectiveBetType = hasConflict ? 'single' : betType;

  // ----- Single‑bet calculations ---------------------------------------------
  const singleBets = useMemo(() => {
    return selections.map((sel) => {
      const stake = parseFloat(stakes[sel.id] || '0');
      const potentialReturn = stake * sel.odd;
      return { ...sel, stake, potentialReturn };
    });
  }, [selections, stakes]);

  const totalStakeSingle = useMemo(
    () => singleBets.reduce((sum, bet) => sum + bet.stake, 0),
    [singleBets]
  );

  const totalReturnSingle = useMemo(
    () => singleBets.reduce((sum, bet) => sum + bet.potentialReturn, 0),
    [singleBets]
  );

  // ----- Multiple‑bet calculations -------------------------------------------
  const totalOddsMultiple = useMemo(
    () => selections.reduce((acc, s) => acc * s.odd, 1),
    [selections]
  );

  const stakeMultiple = parseFloat(multipleStake || '0');
  const potentialReturnMultiple = stakeMultiple * totalOddsMultiple;

  const totalStake =
    effectiveBetType === 'single' ? totalStakeSingle : stakeMultiple;
  const potentialReturn =
    effectiveBetType === 'single' ? totalReturnSingle : potentialReturnMultiple;

  // ✅ Verificar se tem saldo suficiente
  const hasInsufficientBalance = totalStake > balance;

  // 🎉 Gerar confetti
  const generateConfetti = useCallback(() => {
    const colors = [
      '#FFD700', // Ouro
      '#FF6B6B', // Vermelho
      '#4ECDC4', // Teal
      '#45B7D1', // Azul
      '#96CEB4', // Verde
      '#FFEAA7', // Amarelo
      '#DDA0DD', // Rosa
      '#98D8C8', // Menta
      '#F7DC6F', // Amarelo claro
      '#BB8FCE', // Roxo
    ];

    const pieces = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      rotation: Math.random() * 360,
    }));

    setConfettiPieces(pieces);

    // Limpar confetti após animação
    setTimeout(() => setConfettiPieces([]), 3000);
  }, []);

  // ----- Handlers ------------------------------------------------------------
  const handleQuickStake = (amount) => {
    if (effectiveBetType === 'single') {
      const newStakes = {};
      selections.forEach((s) => {
        newStakes[s.id] = amount.toString();
      });
      setStakes(newStakes);
    } else {
      setMultipleStake(amount.toString());
    }
  };

  const handlePlaceBet = async () => {
    if (totalStake === 0) return;
    
    // Verificar se utilizador está logado
    if (!user) {
      navigate('/login');
      return;
    }

    // Verificar saldo
    if (totalStake > balance) {
      alert('Saldo insuficiente. Por favor, faça um depósito.');
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
        totalOdds: effectiveBetType === 'multiple' ? totalOddsMultiple : totalOddsMultiple,
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

      if (typeof refetch === 'function') {
        await refetch();
      }

      setSuccessData({
        totalStake,
        potentialReturn,
        selectionsCount: selections.length,
        betType: effectiveBetType,
      });

      setShowSuccessModal(true);
      generateConfetti();

      // Vibrar dispositivo se suportado
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100, 50, 200]);
      }

      console.log('✅ Aposta colocada com sucesso:', {
        betId: resp.bet?.id,
        type: effectiveBetType,
        stake: totalStake,
        potentialReturn,
        newBalance: balance - totalStake
      });

      // Reset UI after successful bet
      setTimeout(() => {
        setStakes({});
        setMultipleStake('');
        onClearAll();
      }, 2500);

    } catch (err: any) {
      console.error('❌ Erro ao colocar aposta:', err);
      alert(err.message || 'Erro ao processar aposta. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Fechar modal de sucesso
  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    setSuccessData(null);
  };

  // ----- Swipe handlers ------------------------------------------------------
  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    touchStartRef.current = { y: touch.clientY, time: Date.now() };
    setIsSwiping(true);
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isSwiping) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - touchStartRef.current.y;
    if (deltaY > 0) {
      setSwipeY(deltaY);
    }
  }, [isSwiping]);

  const handleTouchEnd = useCallback(() => {
    if (!isSwiping) return;
    const velocity = swipeY / (Date.now() - touchStartRef.current.time);
    
    if (swipeY > swipeThreshold || velocity > 0.5) {
      // Fechar com animação
      setSwipeY(window.innerHeight);
      setTimeout(() => {
        setSwipeY(0);
        setIsSwiping(false);
        if (onSwipeClose) onSwipeClose();
        else if (onClose) onClose();
      }, 200);
    } else {
      // Voltar à posição original
      setSwipeY(0);
      setIsSwiping(false);
    }
  }, [isSwiping, swipeY, onSwipeClose, onClose]);

  // ----- Render helpers ------------------------------------------------------
  const renderSelectionCard = (sel) => (
    <div
      key={sel.id}
      className={`rounded-md p-2 border ${
        isLight
          ? 'bg-white border-gray-200 shadow-sm'
          : 'bg-gray-900 border-gray-800/50'
      }`}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1 min-w-0">
          <p
            className={`text-[9px] truncate ${
              isLight ? 'text-gray-400' : 'text-gray-500'
            }`}
          >
            {sel.league}
          </p>
          <p
            className={`text-[10px] font-medium truncate ${
              isLight ? 'text-gray-800' : 'text-gray-300'
            }`}
          >
            {sel.homeTeam} vs {sel.awayTeam}
          </p>
        </div>
        <button
          onClick={() => onRemoveSelection(sel.id)}
          className={`w-4 h-4 flex items-center justify-center rounded cursor-pointer ml-1.5 flex-shrink-0 ${
            isLight ? 'hover:bg-red-100' : 'hover:bg-red-500/20'
          }`}
        >
          <i
            className={`ri-close-line text-[10px] ${
              isLight
                ? 'text-gray-400 hover:text-red-500'
                : 'text-gray-500 hover:text-red-400'
            }`}
          ></i>
        </button>
      </div>

      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          {sel.market && (
            <span
              className={`text-[8px] px-1 py-0.5 rounded ${
                isLight
                  ? 'bg-gray-100 text-gray-500'
                  : 'bg-gray-800 text-gray-500'
              }`}
            >
              {sel.market}
            </span>
          )}
          <span className="text-[10px] font-semibold text-red-500">
            {sel.selection}
          </span>
        </div>
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            isLight ? 'bg-gray-100 text-gray-800' : 'bg-gray-800 text-white'
          }`}
        >
          {sel.odd.toFixed(2)}
        </span>
      </div>

      {effectiveBetType === 'single' && (
        <div className="space-y-0.5">
          <input
            type="number"
            placeholder="Valor €"
            value={stakes[sel.id] || ''}
            onChange={(e) =>
              setStakes((prev) => ({
                ...prev,
                [sel.id]: e.target.value,
              }))
            }
            className={`w-full px-2 py-1 border rounded text-[10px] focus:outline-none ${
              isLight
                ? 'bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:border-red-500'
                : 'bg-gray-800 border-gray-700/50 text-white placeholder-gray-600 focus:border-red-500/50'
            }`}
            min="0"
            step="0.5"
          />
          {stakes[sel.id] && parseFloat(stakes[sel.id]) > 0 && (
            <div
              className={`flex justify-between text-[9px] ${
                isLight ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              <span>Retorno:</span>
              <span className="text-green-500 font-semibold">
                €{(parseFloat(stakes[sel.id]) * sel.odd).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderMobileFixedActions = () => (
    <div
      className={`border-t ${
        isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-800 bg-gray-900'
      } px-3 py-2.5 space-y-2`}
    >
      {/* ✅ Saldo disponível */}
      {user && (
        <div className={`flex items-center justify-between px-2 py-1.5 rounded-lg ${
          isLight ? 'bg-gray-100 border border-gray-200' : 'bg-gray-900/60 border border-gray-700/60'
        }`}>
          <span className={`text-[10px] font-medium ${isLight ? 'text-red-600' : 'text-red-400'}`}>
            <i className="ri-wallet-3-line mr-1"></i>Saldo
          </span>
          <span className={`text-xs font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
            €{balance.toFixed(2)}
          </span>
        </div>
      )}

      {/* Linha 1: Tipo de aposta + Odd total */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-medium ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
            {effectiveBetType === 'single' ? `${selections.length}x Simples` : 'Múltipla'}
          </span>
          {effectiveBetType === 'multiple' && (
            <span className="text-[11px] font-bold text-red-500">
              Odd {totalOddsMultiple.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>Retorno:</span>
          <span className="text-[11px] font-bold text-green-500">€{potentialReturn.toFixed(2)}</span>
        </div>
      </div>

      {/* Linha 2: Input de valor */}
      {effectiveBetType === 'multiple' && (
        <div className="relative">
          <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>€</span>
          <input
            type="number"
            placeholder="Insira o valor da aposta"
            value={multipleStake}
            onChange={(e) => setMultipleStake(e.target.value)}
            className={`w-full pl-7 pr-3 py-2.5 border rounded-lg text-sm font-semibold focus:outline-none ${
              isLight
                ? 'bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-red-500'
                : 'bg-gray-800 border-gray-700/50 text-white placeholder-gray-600 focus:border-red-500/50'
            }`}
            min="0"
            step="0.5"
          />
        </div>
      )}

      {/* ✅ Aviso de saldo insuficiente */}
      {hasInsufficientBalance && totalStake > 0 && (
        <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${
          isLight ? 'bg-red-50 border border-red-200' : 'bg-red-500/10 border border-red-500/20'
        }`}>
          <i className={`ri-error-warning-line text-sm ${isLight ? 'text-red-500' : 'text-red-400'}`}></i>
          <span className={`text-[10px] ${isLight ? 'text-red-600' : 'text-red-400'}`}>
            Saldo insuficiente. Faltam €{(totalStake - balance).toFixed(2)}
          </span>
        </div>
      )}

      {/* Linha 3: Botões rápidos */}
      <div className="grid grid-cols-4 gap-1.5">
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
              className={`py-2 rounded-lg text-[11px] font-bold cursor-pointer transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-red-600 text-white shadow-lg shadow-red-500/20'
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

      {/* Linha 4: Botões de ação */}
      <div className="flex gap-2">
        <button
          onClick={onClearAll}
          className={`w-11 h-11 flex items-center justify-center rounded-lg cursor-pointer transition-colors flex-shrink-0 ${
            isLight
              ? 'bg-gray-200 hover:bg-red-100 text-gray-500 hover:text-red-500'
              : 'bg-gray-800 hover:bg-red-500/20 text-gray-400 hover:text-red-400'
          }`}
        >
          <i className="ri-delete-bin-line text-base"></i>
        </button>

        <button
          onClick={handlePlaceBet}
          disabled={totalStake === 0 || isProcessing || hasInsufficientBalance}
          className={`flex-1 h-11 rounded-lg text-sm font-bold cursor-pointer whitespace-nowrap transition-all flex items-center justify-center gap-1.5 ${
            totalStake > 0 && !hasInsufficientBalance && !isProcessing
              ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-600/20'
              : isLight
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isProcessing ? (
            <>
              <i className="ri-loader-4-line animate-spin text-base"></i>
              A processar...
            </>
          ) : (
            <>
              <i className="ri-check-line text-base"></i>
              Apostar {totalStake > 0 ? `€${totalStake.toFixed(2)}` : ''}
            </>
          )}
        </button>
      </div>
    </div>
  );

  const renderDesktopActions = () => (
    <div className="space-y-2 p-2">
      {/* ✅ Saldo disponível - Desktop */}
      {user && (
        <div className={`rounded-md p-2 flex items-center justify-between ${
          isLight ? 'bg-gray-100 border border-gray-200' : 'bg-gray-900/60 border border-gray-700/60'
        }`}>
          <span className={`text-[10px] font-medium ${isLight ? 'text-red-600' : 'text-red-400'}`}>
            <i className="ri-wallet-3-line mr-1"></i>Saldo Disponível
          </span>
          <span className={`text-xs font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
            €{balance.toFixed(2)}
          </span>
        </div>
      )}

      {effectiveBetType === 'multiple' && (
        <div
          className={`rounded-md p-2 ${
            isLight ? 'bg-white border border-gray-200' : 'bg-gray-900'
          }`}
        >
          <label
            className={`text-[9px] mb-1 block ${
              isLight ? 'text-gray-500' : 'text-gray-500'
            }`}
          >
            Valor da Aposta
          </label>
          <input
            type="number"
            placeholder="Insira o valor €"
            value={multipleStake}
            onChange={(e) => setMultipleStake(e.target.value)}
            className={`w-full px-2 py-1.5 border rounded text-xs focus:outline-none ${
              isLight
                ? 'bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:border-red-500'
                : 'bg-gray-800 border-gray-700/50 text-white placeholder-gray-600 focus:border-red-500/50'
            }`}
            min="0"
            step="0.5"
          />
        </div>
      )}

      <div className="flex gap-1">
        {[5, 10, 25, 50, 100].map((amount) => {
          const isDisabled = amount > balance;
          return (
            <button
              key={amount}
              onClick={() => !isDisabled && handleQuickStake(amount)}
              disabled={isDisabled}
              className={`flex-1 py-1 rounded text-[10px] font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                isDisabled
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

      {/* ✅ Aviso de saldo insuficiente - Desktop */}
      {hasInsufficientBalance && totalStake > 0 && (
        <div className={`rounded-md p-2 flex items-center gap-2 ${
          isLight ? 'bg-red-50 border border-red-200' : 'bg-red-500/10 border border-red-500/20'
        }`}>
          <i className={`ri-error-warning-line text-sm ${isLight ? 'text-red-500' : 'text-red-400'}`}></i>
          <div className="flex-1">
            <span className={`text-[10px] ${isLight ? 'text-red-600' : 'text-red-400'}`}>
              Saldo insuficiente. Faltam €{(totalStake - balance).toFixed(2)}
            </span>
          </div>
          <button
            onClick={() => navigate('/deposito')}
            className="text-[9px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded cursor-pointer whitespace-nowrap"
          >
            Depositar
          </button>
        </div>
      )}

      <div
        className={`rounded-md p-2 space-y-1 ${
          isLight ? 'bg-white border border-gray-200' : 'bg-gray-800/50'
        }`}
      >
        <div className="flex justify-between text-[10px]">
          <span className={isLight ? 'text-gray-500' : 'text-gray-500'}>
            Tipo
          </span>
          <span
            className={`font-medium ${
              isLight ? 'text-gray-700' : 'text-gray-300'
            }`}
          >
            {effectiveBetType === 'single' ? 'Simples' : 'Múltipla'}
            {effectiveBetType === 'single' && ` (${selections.length})`}
          </span>
        </div>
        {effectiveBetType === 'multiple' && (
          <div className="flex justify-between text-[10px]">
            <span className={isLight ? 'text-gray-500' : 'text-gray-500'}>
              Odd Total
            </span>
            <span className="text-red-500 font-bold">
              {totalOddsMultiple.toFixed(2)}
            </span>
          </div>
        )}
        <div
          className={`flex justify-between text-[10px] pt-1 border-t ${
            isLight ? 'border-gray-100' : 'border-gray-700/50'
          }`}
        >
          <span
            className={`font-medium ${
              isLight ? 'text-gray-600' : 'text-gray-400'
            }`}
          >
            Retorno Potencial
          </span>
          <span className="text-green-500 font-bold text-xs">
            €{potentialReturn.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="flex gap-1.5 pb-2">
        <button
          onClick={onClearAll}
          className={`px-3 py-2 rounded-md text-[10px] font-semibold cursor-pointer whitespace-nowrap transition-colors ${
            isLight
              ? 'bg-gray-200 hover:bg-gray-300 text-gray-600'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
          }`}
        >
          Limpar
        </button>
        <button
          onClick={handlePlaceBet}
          disabled={totalStake === 0 || isProcessing || hasInsufficientBalance}
          className={`flex-1 py-2 rounded-md text-[10px] font-bold cursor-pointer whitespace-nowrap transition-all shadow-lg ${
            totalStake > 0 && !hasInsufficientBalance && !isProcessing
              ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-red-600/20'
              : isLight
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isProcessing ? (
            <span className="flex items-center justify-center gap-1">
              <i className="ri-loader-4-line animate-spin"></i>
              A processar...
            </span>
          ) : (
            `Apostar €${totalStake.toFixed(2)}`
          )}
        </button>
      </div>
    </div>
  );

  // ----- Main render ---------------------------------------------------------
  return (
    <div
      className={`flex flex-col h-full ${
        isLight ? 'bg-gray-50 text-gray-900' : 'bg-gray-900 text-white'
      }`}
      style={{
        transform: isSwiping && swipeY > 0 ? `translateY(${swipeY}px)` : undefined,
        transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
      }}
    >
      {/* 🎉 MODAL DE SUCESSO COM CONFETTI */}
      {showSuccessModal && successData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Overlay escuro */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fadeIn"
            onClick={handleCloseSuccessModal}
          ></div>

          {/* Confetti */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {confettiPieces.map((piece) => (
              <div
                key={piece.id}
                className="absolute animate-confetti-fall"
                style={{
                  left: `${piece.x}%`,
                  top: '-20px',
                  width: `${piece.size}px`,
                  height: `${piece.size}px`,
                  backgroundColor: piece.color,
                  borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                  transform: `rotate(${piece.rotation}deg)`,
                  animationDelay: `${piece.delay}s`,
                  animationDuration: `${2 + Math.random()}s`,
                }}
              />
            ))}
          </div>

          {/* Modal Content */}
          <div className={`relative z-10 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-success-modal-in ${
            isLight ? 'bg-white' : 'bg-gray-900'
          }`}>
            {/* Header com gradiente */}
            <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 p-6 text-center relative overflow-hidden">
              {/* Círculos decorativos */}
              <div className="absolute -top-10 -left-10 w-32 h-32 bg-white/10 rounded-full"></div>
              <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full"></div>
              
              {/* Ícone de sucesso animado */}
              <div className="relative z-10">
                <div className="w-20 h-20 mx-auto bg-white rounded-full flex items-center justify-center shadow-lg animate-success-icon-bounce">
                  <svg className="w-10 h-10 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path 
                      d="M5 13l4 4L19 7" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                      className="animate-check-draw"
                      style={{
                        strokeDasharray: 24,
                        strokeDashoffset: 24,
                      }}
                    />
                  </svg>
                </div>
                <h2 className="text-white text-xl font-bold mt-4 animate-success-text-in">
                  Aposta Colocada!
                </h2>
                <p className="text-white/80 text-sm mt-1 animate-success-text-in" style={{ animationDelay: '0.1s' }}>
                  Boa sorte! 🍀
                </p>
              </div>
            </div>

            {/* Detalhes da aposta */}
            <div className="p-5 space-y-4">
              {/* Tipo de aposta */}
              <div className={`flex items-center justify-between py-2 border-b ${
                isLight ? 'border-gray-100' : 'border-gray-800'
              }`}>
                <span className={`text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                  Tipo de Aposta
                </span>
                <span className={`text-sm font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                  {successData.betType === 'single' 
                    ? `${successData.selectionsCount}x Simples` 
                    : 'Múltipla'}
                </span>
              </div>

              {/* Valor apostado */}
              <div className={`flex items-center justify-between py-2 border-b ${
                isLight ? 'border-gray-100' : 'border-gray-800'
              }`}>
                <span className={`text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                  Valor Apostado
                </span>
                <span className={`text-sm font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                  €{successData.totalStake.toFixed(2)}
                </span>
              </div>

              {/* Retorno potencial */}
              <div className="flex items-center justify-between py-2">
                <span className={`text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                  Retorno Potencial
                </span>
                <span className="text-lg font-black text-emerald-500">
                  €{successData.potentialReturn.toFixed(2)}
                </span>
              </div>

              {/* ✅ Novo saldo */}
              <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                isLight ? 'bg-gray-100' : 'bg-gray-800/60'
              }`}>
                <span className={`text-sm font-medium ${isLight ? 'text-red-600' : 'text-red-400'}`}>
                  <i className="ri-wallet-3-line mr-1"></i>Novo Saldo
                </span>
                <span className={`text-sm font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                  €{(balance - successData.totalStake).toFixed(2)}
                </span>
              </div>

              {/* Botão fechar */}
              <button
                onClick={handleCloseSuccessModal}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20 cursor-pointer whitespace-nowrap"
              >
                <i className="ri-check-line mr-2"></i>
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Swipe Handle - Mobile only */}
      {(isMobile || isMobileView) && (onSwipeClose || onClose) && (
        <div
          className="flex justify-center pt-1.5 pb-0.5 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className={`w-10 h-1 rounded-full ${isLight ? 'bg-gray-300' : 'bg-gray-700'}`}></div>
        </div>
      )}

      {/* Header */}
      <div
        className={`flex items-center justify-between px-2.5 py-1.5 border-b flex-shrink-0 ${
          isLight ? 'border-gray-200' : 'border-gray-800'
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center gap-1.5">
          <div
            className={`w-5 h-5 flex items-center justify-center rounded ${
              isLight ? 'bg-red-500' : 'bg-red-600'
            }`}
          >
            <i className="ri-file-list-3-line text-gray-900 text-[10px]"></i>
          </div>
          <h3
            className={`text-xs font-bold ${
              isLight ? 'text-gray-900' : 'text-white'
            }`}
          >
            Boletim
          </h3>
          {selections.length > 0 && (
            <span className="bg-red-600 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {selections.length}
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={`w-6 h-6 flex items-center justify-center rounded cursor-pointer ${
              isLight ? 'hover:bg-gray-200' : 'hover:bg-gray-800'
            }`}
          >
            <i
              className={`ri-close-line text-sm ${
                isLight ? 'text-gray-500' : 'text-gray-400'
              }`}
            ></i>
          </button>
        )}
      </div>

      {/* Bet‑type selector */}
      {selections.length > 0 && (
        <div className={`px-2 pt-1.5 flex-shrink-0 ${useMobileLayout ? 'pb-1' : ''}`}>
          <div
            className={`flex gap-1 rounded-lg p-0.5 ${
              isLight ? 'bg-gray-200' : 'bg-gray-900'
            }`}
          >
            <button
              onClick={() => setBetType('single')}
              disabled={hasConflict}
              className={`flex-1 py-1 rounded-md text-[9px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                effectiveBetType === 'single'
                  ? 'bg-red-600 text-white shadow-lg'
                  : isLight
                  ? 'text-gray-500 hover:text-gray-700'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Simples
            </button>
            <button
              onClick={() => setBetType('multiple')}
              disabled={hasConflict || selections.length < 2}
              className={`flex-1 py-1 rounded-md text-[9px] font-bold transition-all cursor-pointer whitespace-nowrap relative ${
                effectiveBetType === 'multiple'
                  ? 'bg-red-600 text-white shadow-lg'
                  : isLight
                  ? 'text-gray-500 hover:text-gray-700'
                  : 'text-gray-400 hover:text-gray-300'
              } ${
                hasConflict || selections.length < 2
                  ? 'opacity-50 cursor-not-allowed'
                  : ''
              }`}
            >
              Múltipla
              {selections.length > 1 && !hasConflict && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center text-[6px] font-bold text-white">
                  {selections.length}
                </span>
              )}
            </button>
          </div>
          {hasConflict && (
            <div
              className={`mt-1 px-2 py-0.5 rounded text-[8px] flex items-center gap-1 ${
                isLight
                  ? 'bg-red-100 border border-red-200 text-red-600'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}
            >
              <i className="ri-error-warning-line text-[9px]"></i>
              <span>Múltipla bloqueada: 2+ seleções do mesmo jogo</span>
            </div>
          )}
        </div>
      )}

      {/* Layout switch -------------------------------------------------------- */}
      {useMobileLayout && selections.length > 0 ? (
        <>
          {/* Scrollable selections */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1" style={{ minHeight: 0 }}>
            {selections.map(renderSelectionCard)}
          </div>
          {/* Fixed compact actions */}
          <div className="flex-shrink-0">{renderMobileFixedActions()}</div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {selections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-3">
              <div
                className={`w-10 h-10 flex items-center justify-center rounded-xl mb-2 ${
                  isLight ? 'bg-gray-200' : 'bg-gray-800/50'
                }`}
              >
                <i
                  className={`ri-file-list-line text-xl ${
                    isLight ? 'text-gray-400' : 'text-gray-600'
                  }`}
                ></i>
              </div>
              <p
                className={`text-xs font-medium mb-0.5 ${
                  isLight ? 'text-gray-500' : 'text-gray-500'
                }`}
              >
                Boletim vazio
              </p>
              <p
                className={`text-[10px] text-center ${
                  isLight ? 'text-gray-400' : 'text-gray-600'
                }`}
              >
                Clique nas odds para adicionar
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1.5">
              {selections.map(renderSelectionCard)}
              {renderDesktopActions()}
            </div>
          )}
        </div>
      )}

      {/* Empty state for mobile */}
      {useMobileLayout && selections.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center py-6 px-3">
          <div
            className={`w-10 h-10 flex items-center justify-center rounded-xl mb-2 ${
              isLight ? 'bg-gray-200' : 'bg-gray-800/50'
            }`}
          >
            <i
              className={`ri-file-list-line text-xl ${
                isLight ? 'text-gray-400' : 'text-gray-600'
              }`}
            ></i>
          </div>
          <p
            className={`text-xs font-medium mb-0.5 ${
              isLight ? 'text-gray-500' : 'text-gray-500'
            }`}
          >
            Boletim vazio
          </p>
          <p
            className={`text-[10px] text-center ${
              isLight ? 'text-gray-400' : 'text-gray-600'
            }`}
          >
            Clique nas odds para adicionar
          </p>
        </div>
      )}
    </div>
  );
}

// ----- PropTypes (helps catch wrong usage in plain JS) -----
BettingSlipPanel.propTypes = {
  selections: PropTypes.arrayOf(betSelectionShape).isRequired,
  onRemoveSelection: PropTypes.func.isRequired,
  onClearAll: PropTypes.func.isRequired,
  onClose: PropTypes.func,
  isMobile: PropTypes.bool,
  onSwipeClose: PropTypes.func,
};

export default BettingSlipPanel;

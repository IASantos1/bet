import { useState, useEffect, useMemo } from 'react';
import { useCashOut } from '../../hooks/useCashOut';
import { useCashOutNotifications } from '../../hooks/useCashOutNotifications';

interface CashOutButtonProps {
  betId: string;
  stake: number;
  totalOdds: number;
  potentialWin: number;
  createdAt: string;
  onCashOutSuccess?: (amount: number) => void;
  compact?: boolean;
}

export default function CashOutButton({
  betId,
  stake,
  totalOdds,
  potentialWin,
  createdAt,
  onCashOutSuccess,
  compact = false
}: CashOutButtonProps) {
  const { getCashOutValue, executeCashOut, loading } = useCashOut();
  const { addBetToMonitor, checkAndNotify, settings } = useCashOutNotifications();
  const [cashOutValue, setCashOutValue] = useState<number>(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successAmount, setSuccessAmount] = useState(0);
  const [showPartial, setShowPartial] = useState(false);
  const [partialPercentage, setPartialPercentage] = useState(50);
  const [isFavorable, setIsFavorable] = useState(false);
  const [profitRatio, setProfitRatio] = useState(0);

  // Registar aposta para monitorização de notificações
  useEffect(() => {
    addBetToMonitor({
      id: betId,
      stake,
      totalOdds,
      potentialWin,
      createdAt
    });
  }, [betId, stake, totalOdds, potentialWin, createdAt, addBetToMonitor]);

  // Atualizar valor de cash out periodicamente (simula odds em tempo real)
  useEffect(() => {
    const updateValue = () => {
      const value = getCashOutValue(stake, totalOdds, potentialWin, createdAt, betId);
      setCashOutValue(value);
      
      const profitPercentage = ((value - stake) / stake) * 100;
      setIsFavorable(profitPercentage >= settings.profitThreshold && value > stake);
      const ratioBase = potentialWin - stake;
      if (ratioBase > 0) {
        setProfitRatio(Math.min(Math.max((value - stake) / ratioBase, 0), 1));
      } else {
        setProfitRatio(0);
      }
      
      checkAndNotify({
        id: betId,
        stake,
        totalOdds,
        potentialWin,
        createdAt
      });
    };

    updateValue();
    const interval = setInterval(updateValue, 5000); // Atualiza a cada 5 segundos

    return () => clearInterval(interval);
  }, [stake, totalOdds, potentialWin, createdAt, betId, getCashOutValue, checkAndNotify, settings.profitThreshold]);

  const handleCashOut = async () => {
    const result = await executeCashOut(betId, cashOutValue);
    
    if (result.success && result.amount) {
      setShowConfirm(false);
      setSuccessAmount(result.amount);
      setShowSuccess(true);
      onCashOutSuccess?.(result.amount);
      
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  const handlePartialCashOut = async () => {
    const partialValue = cashOutValue * (partialPercentage / 100);
    const result = await executeCashOut(betId, partialValue);
    
    if (result.success && result.amount) {
      setShowPartial(false);
      setSuccessAmount(result.amount);
      setShowSuccess(true);
      onCashOutSuccess?.(result.amount);
      
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  // Calcular lucro/prejuízo do cash out
  const cashOutProfit = cashOutValue - stake;
  const isProfitable = cashOutProfit > 0;
  const progress = useMemo(
    () => (potentialWin > 0 ? Math.min(Math.max(cashOutValue / potentialWin, 0), 1) : 0),
    [cashOutValue, potentialWin]
  );
  const isWinning = isProfitable;

  // Animação de pulso quando o valor é bom
  const pulseClass = isProfitable && cashOutValue > stake * 1.2 ? 'animate-pulse' : '';
  const favorableGlow = isFavorable ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-gray-900' : '';

  if (showSuccess) {
    return (
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg p-3 text-center">
        <div className="flex items-center justify-center gap-2 text-white">
          <i className="ri-checkbox-circle-fill text-xl"></i>
          <span className="font-bold">Cash Out Realizado!</span>
        </div>
        <div className="text-white/90 text-lg font-bold mt-1">
          €{successAmount.toFixed(2)}
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <>
        <div className="relative">
          {isFavorable && (
            <div className="absolute -top-2 -right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center animate-bounce z-10">
              <i className="ri-notification-3-fill text-white text-xs"></i>
            </div>
          )}
          <button
            onClick={() => setShowConfirm(true)}
            disabled={loading || cashOutValue <= 0}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${pulseClass} ${favorableGlow} ${
              isProfitable
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'
                : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <i className="ri-hand-coin-line"></i>
            <span>€{cashOutValue.toFixed(2)}</span>
            {isFavorable && <i className="ri-fire-fill text-yellow-300"></i>}
          </button>
        </div>

        {/* Modal de Confirmação */}
        {showConfirm && (
          <CashOutConfirmModal
            cashOutValue={cashOutValue}
            stake={stake}
            potentialWin={potentialWin}
            isProfitable={isProfitable}
            cashOutProfit={cashOutProfit}
            isWinning={isWinning}
            progress={profitRatio}
            loading={loading}
            onConfirm={handleCashOut}
            onCancel={() => setShowConfirm(false)}
            onShowPartial={() => {
              setShowConfirm(false);
              setShowPartial(true);
            }}
          />
        )}

        {/* Modal de Cash Out Parcial */}
        {showPartial && (
          <PartialCashOutModal
            cashOutValue={cashOutValue}
            stake={stake}
            percentage={partialPercentage}
            onPercentageChange={setPartialPercentage}
            loading={loading}
            onConfirm={handlePartialCashOut}
            onCancel={() => setShowPartial(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className={`bg-gradient-to-r ${isProfitable ? 'from-green-900/30 to-emerald-900/30 border-green-500/30' : 'from-amber-900/30 to-orange-900/30 border-amber-500/30'} border rounded-xl p-4 ${pulseClass} ${favorableGlow} relative`}>
        {/* Favorable Badge */}
        {isFavorable && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full text-xs font-bold text-white flex items-center gap-1 shadow-lg animate-bounce">
            <i className="ri-fire-fill text-yellow-300"></i>
            Valor Favorável!
            <i className="ri-fire-fill text-yellow-300"></i>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isProfitable ? 'bg-green-500/20' : 'bg-amber-500/20'}`}>
              <i className={`ri-hand-coin-line ${isProfitable ? 'text-green-400' : 'text-amber-400'}`}></i>
            </div>
            <div>
              <div className="text-sm font-bold text-white">Cash Out Disponível</div>
              <div className={`text-xs ${isWinning ? 'text-green-400' : 'text-red-400'}`}>
                {isWinning ? '● A ganhar' : '● A perder'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${isProfitable ? 'text-green-400' : 'text-amber-400'}`}>
              €{cashOutValue.toFixed(2)}
            </div>
            <div className={`text-xs ${isProfitable ? 'text-green-400/70' : 'text-red-400/70'}`}>
              {isProfitable ? '+' : ''}{cashOutProfit.toFixed(2)}€ {isProfitable ? 'lucro' : 'prejuízo'}
            </div>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Nível de Cash Out</span>
            <span>{Math.round(profitRatio * 100)}%</span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isWinning ? 'bg-green-500' : 'bg-red-500'
              }`}
              style={{ width: `${profitRatio * 100}%` }}
            />
          </div>
        </div>

        {/* Info */}
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="bg-gray-800/50 rounded-lg p-2">
            <div className="text-xs text-gray-400">Apostado</div>
            <div className="text-sm font-bold text-white">€{stake.toFixed(2)}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2">
            <div className="text-xs text-gray-400">Potencial</div>
            <div className="text-sm font-bold text-blue-400">€{potentialWin.toFixed(2)}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2">
            <div className="text-xs text-gray-400">Cash Out</div>
            <div className={`text-sm font-bold ${isProfitable ? 'text-green-400' : 'text-amber-400'}`}>
              €{cashOutValue.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowPartial(true)}
            className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-sm text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-percent-line mr-1"></i>
            Parcial
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={loading || cashOutValue <= 0}
            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all cursor-pointer whitespace-nowrap ${
              isProfitable
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'
                : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <i className="ri-hand-coin-line mr-1"></i>
            Cash Out Total
          </button>
        </div>

        {/* Info Text */}
        <div className="mt-3 text-xs text-gray-500 text-center">
          <i className="ri-information-line mr-1"></i>
          O valor de Cash Out é calculado de forma contínua
        </div>
      </div>

      {/* Modal de Confirmação */}
      {showConfirm && (
        <CashOutConfirmModal
          cashOutValue={cashOutValue}
          stake={stake}
          potentialWin={potentialWin}
          isProfitable={isProfitable}
          cashOutProfit={cashOutProfit}
          isWinning={isWinning}
          progress={progress}
          loading={loading}
          onConfirm={handleCashOut}
          onCancel={() => setShowConfirm(false)}
          onShowPartial={() => {
            setShowConfirm(false);
            setShowPartial(true);
          }}
        />
      )}

      {/* Modal de Cash Out Parcial */}
      {showPartial && (
        <PartialCashOutModal
          cashOutValue={cashOutValue}
          stake={stake}
          percentage={partialPercentage}
          onPercentageChange={setPartialPercentage}
          loading={loading}
          onConfirm={handlePartialCashOut}
          onCancel={() => setShowPartial(false)}
        />
      )}
    </>
  );
}

// Modal de Confirmação
interface ConfirmModalProps {
  cashOutValue: number;
  stake: number;
  potentialWin: number;
  isProfitable: boolean;
  cashOutProfit: number;
  isWinning: boolean;
  progress: number;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onShowPartial: () => void;
}

function CashOutConfirmModal({
  cashOutValue,
  stake,
  potentialWin,
  isProfitable,
  cashOutProfit,
  isWinning,
  progress,
  loading,
  onConfirm,
  onCancel,
  onShowPartial
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div 
        className="bg-gray-900 rounded-2xl max-w-md w-full p-6 border border-gray-700 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${
            isProfitable ? 'bg-green-500/20' : 'bg-amber-500/20'
          }`}>
            <i className={`ri-hand-coin-line text-3xl ${isProfitable ? 'text-green-400' : 'text-amber-400'}`}></i>
          </div>
          <h3 className="text-xl font-bold text-white mb-1">Confirmar Cash Out</h3>
          <p className="text-gray-400 text-sm">Tem a certeza que deseja fazer cash out?</p>
        </div>

        {/* Value Display */}
        <div className={`bg-gradient-to-r ${isProfitable ? 'from-green-900/40 to-emerald-900/40 border-green-500/30' : 'from-amber-900/40 to-orange-900/40 border-amber-500/30'} border rounded-xl p-4 mb-4`}>
          <div className="text-center">
            <div className="text-sm text-gray-400 mb-1">Valor do Cash Out</div>
            <div className={`text-4xl font-bold ${isProfitable ? 'text-green-400' : 'text-amber-400'}`}>
              €{cashOutValue.toFixed(2)}
            </div>
            <div className={`text-sm mt-1 ${isProfitable ? 'text-green-400/70' : 'text-red-400/70'}`}>
              {isProfitable ? '+' : ''}{cashOutProfit.toFixed(2)}€ {isProfitable ? 'de lucro' : 'de prejuízo'}
            </div>
          </div>
        </div>

        {/* Comparison */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-400 mb-1">Apostado</div>
            <div className="text-lg font-bold text-white">€{stake.toFixed(2)}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-400 mb-1">Retorno Potencial</div>
            <div className="text-lg font-bold text-blue-400">€{potentialWin.toFixed(2)}</div>
          </div>
        </div>

        {/* Status Info */}
        <div className="bg-gray-800/50 rounded-lg p-3 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Estado atual:</span>
            <span className={`font-medium ${isWinning ? 'text-green-400' : 'text-red-400'}`}>
              {isWinning ? '● A ganhar' : '● A perder'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-gray-400">Progresso:</span>
            <span className="text-white font-medium">{Math.round(progress * 100)}%</span>
          </div>
        </div>

        {/* Warning */}
        <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 mb-6">
          <div className="flex items-start gap-2">
            <i className="ri-alert-line text-amber-400 mt-0.5"></i>
            <div className="text-xs text-amber-300/90">
              <strong>Atenção:</strong> Ao fazer cash out, a sua aposta será encerrada e receberá o valor indicado. 
              Esta ação não pode ser revertida.
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-3 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
              isProfitable
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'
                : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white'
            } disabled:opacity-50`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <i className="ri-loader-4-line animate-spin"></i>
                A processar...
              </span>
            ) : (
              <>
                <i className="ri-check-line mr-1"></i>
                Confirmar
              </>
            )}
          </button>
        </div>

        {/* Partial Option */}
        <button
          onClick={onShowPartial}
          className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
          <i className="ri-percent-line mr-1"></i>
          Prefere fazer Cash Out parcial?
        </button>
      </div>
    </div>
  );
}

// Modal de Cash Out Parcial
interface PartialModalProps {
  cashOutValue: number;
  stake: number;
  percentage: number;
  onPercentageChange: (value: number) => void;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function PartialCashOutModal({
  cashOutValue,
  stake,
  percentage,
  onPercentageChange,
  loading,
  onConfirm,
  onCancel
}: PartialModalProps) {
  const partialValue = cashOutValue * (percentage / 100);
  const remainingValue = cashOutValue - partialValue;
  const partialStake = stake * (percentage / 100);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div 
        className="bg-gray-900 rounded-2xl max-w-md w-full p-6 border border-gray-700 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
            <i className="ri-percent-line text-3xl text-blue-400"></i>
          </div>
          <h3 className="text-xl font-bold text-white mb-1">Cash Out Parcial</h3>
          <p className="text-gray-400 text-sm">Escolha quanto deseja retirar</p>
        </div>

        {/* Slider */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Percentagem</span>
            <span className="text-lg font-bold text-white">{percentage}%</span>
          </div>
          <input
            type="range"
            min="10"
            max="90"
            step="10"
            value={percentage}
            onChange={(e) => onPercentageChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>10%</span>
            <span>50%</span>
            <span>90%</span>
          </div>
        </div>

        {/* Quick Buttons */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {[25, 50, 75, 90].map((pct) => (
            <button
              key={pct}
              onClick={() => onPercentageChange(pct)}
              className={`py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                percentage === pct
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* Values */}
        <div className="space-y-3 mb-6">
          <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400">Vai receber agora</div>
                <div className="text-xl font-bold text-green-400">€{partialValue.toFixed(2)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400">Da aposta</div>
                <div className="text-sm font-medium text-gray-300">€{partialStake.toFixed(2)}</div>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400">Continua em jogo</div>
                <div className="text-lg font-bold text-blue-400">€{remainingValue.toFixed(2)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400">Da aposta</div>
                <div className="text-sm font-medium text-gray-300">€{(stake - partialStake).toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 mb-6">
          <div className="flex items-start gap-2">
            <i className="ri-information-line text-blue-400 mt-0.5"></i>
            <div className="text-xs text-blue-300/90">
              Com o cash out parcial, recebe parte do valor agora e mantém o resto da aposta ativa 
              para potencialmente ganhar mais.
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-lg font-bold text-white transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <i className="ri-loader-4-line animate-spin"></i>
                A processar...
              </span>
            ) : (
              <>
                <i className="ri-check-line mr-1"></i>
                Confirmar {percentage}%
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

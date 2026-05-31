
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useProfile } from '../../hooks/useProfile';
import { useLimits } from '../../hooks/useLimits';
import { apiFetch } from '../../services/backendClient';

interface BetSelection {
  id: number;
  homeTeam: string;
  awayTeam: string;
  selection: string;
  odd: number;
  league?: string;
}

interface BettingSlipProps {
  isOpen: boolean;
  onClose: () => void;
  selections: BetSelection[];
  onRemoveSelection: (id: number) => void;
  onClearAll: () => void;
}

export default function BettingSlip({ 
  isOpen, 
  onClose, 
  selections,
  onRemoveSelection,
  onClearAll
}: BettingSlipProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, isSelfExcluded, isCoolingOff, getExclusionTimeRemaining, getCoolingOffTimeRemaining } = useProfile();
  const { validateBet, getRemainingLimits } = useLimits();
  const [stake, setStake] = useState<string>('');
  const [betType, setBetType] = useState<'single' | 'multiple'>('single');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const balance = profile?.balance || 0;
  const remainingLimits = getRemainingLimits();
  const isExcluded = isSelfExcluded();
  const isCooling = isCoolingOff();
  const exclusionTime = getExclusionTimeRemaining();
  const coolingTime = getCoolingOffTimeRemaining();

  // Detectar se há seleções do mesmo jogo
  const sameMatchSelections = useMemo(() => {
    const matchMap = new Map<string, BetSelection[]>();
    
    selections.forEach(sel => {
      // Criar chave única para o jogo baseada nas equipas
      const matchKey = `${sel.homeTeam}-${sel.awayTeam}`;
      const existing = matchMap.get(matchKey) || [];
      matchMap.set(matchKey, [...existing, sel]);
    });

    // Encontrar jogos com mais de uma seleção
    const duplicates: { matchKey: string; selections: BetSelection[] }[] = [];
    matchMap.forEach((sels, key) => {
      if (sels.length > 1) {
        duplicates.push({ matchKey: key, selections: sels });
      }
    });

    return duplicates;
  }, [selections]);

  // Verificar se múltipla está bloqueada
  const isMultipleBlocked = sameMatchSelections.length > 0;

  // Forçar tipo simples se múltipla estiver bloqueada
  const effectiveBetType = isMultipleBlocked ? 'single' : betType;

  // Validar valor em tempo real
  useEffect(() => {
    if (stake) {
      const stakeAmount = parseFloat(stake);
      if (!isNaN(stakeAmount) && stakeAmount > 0) {
        const validation = validateBet(stakeAmount);
        setValidationError(validation.error);
      } else {
        setValidationError(null);
      }
    } else {
      setValidationError(null);
    }
  }, [stake, balance, validateBet]);

  // Limpar mensagens após alguns segundos
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  if (!isOpen) return null;

  const totalOdds = selections.reduce((acc, sel) => acc * sel.odd, 1);
  const potentialWin = stake ? (parseFloat(stake) * totalOdds).toFixed(2) : '0.00';

  const getMaxBet = () => {
    const candidates: number[] = [balance];

    if (remainingLimits.bet.daily != null) {
      candidates.push(remainingLimits.bet.daily);
    }
    if (remainingLimits.bet.weekly != null) {
      candidates.push(remainingLimits.bet.weekly);
    }
    if (remainingLimits.bet.monthly != null) {
      candidates.push(remainingLimits.bet.monthly);
    }

    return candidates.length > 0 ? Math.max(0, Math.min(...candidates)) : 0;
  };

  const handlePlaceBet = async () => {
    setError(null);
    setSuccess(null);

    if (!user) {
      navigate('/login');
      return;
    }

    // Verificar auto-exclusão
    if (isExcluded) {
      setError('A sua conta está em auto-exclusão. Não pode fazer apostas.');
      return;
    }

    if (isCooling) {
      setError('Está em período de reflexão. Não pode fazer apostas.');
      return;
    }

    const stakeAmount = parseFloat(stake);

    if (selections.length === 0) {
      setError('Adicione pelo menos uma seleção ao boletim.');
      return;
    }

    // Validação completa
    const validation = validateBet(stakeAmount);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setLoading(true);

    try {
      await apiFetch('/wallet/bet', {
        method: 'POST',
        body: JSON.stringify({
          amount: stakeAmount,
          betType: selections.length > 1 && !isMultipleBlocked ? 'multiple' : 'single',
          totalOdds,
          potentialWin: parseFloat(potentialWin),
          isFreeBet: false,
        }),
      });
      setSuccess(`Aposta colocada com sucesso! Retorno potencial: €${potentialWin}`);
      setStake('');
      onClearAll();

    } catch (err: any) {
      console.error('Erro ao colocar aposta:', err);
      setError(err.message || 'Erro ao processar aposta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const isStakeValid = () => {
    if (!stake) return false;
    const stakeAmount = parseFloat(stake);
    return !isNaN(stakeAmount) && stakeAmount > 0 && !validationError;
  };

  const isBettingBlocked = isExcluded || isCooling;

  // Componente de aviso de bloqueio de múltipla
  const MultipleBlockedWarning = () => (
    <div className="mx-4 mt-4 p-4 bg-red-900/30 rounded-lg border border-red-500/40">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
          <i className="ri-lock-line text-red-400 text-lg"></i>
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold text-red-300 mb-1">
            Aposta Múltipla Bloqueada
          </div>
          <p className="text-xs text-red-400/90 leading-relaxed mb-2">
            Não é possível fazer aposta múltipla com duas ou mais seleções do mesmo jogo. 
            Apenas apostas simples estão disponíveis.
          </p>
          <div className="space-y-1">
            {sameMatchSelections.map(({ matchKey, selections: sels }) => (
              <div key={matchKey} className="text-xs text-red-400/70 bg-red-900/30 px-2 py-1.5 rounded flex items-center gap-2">
                <i className="ri-football-line"></i>
                <span className="flex-1">{sels[0].homeTeam} vs {sels[0].awayTeam}</span>
                <span className="bg-red-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold">{sels.length} seleções</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      ></div>

      {/* Betting Slip Panel */}
      <div className="fixed right-0 top-0 h-full w-96 bg-gray-900 shadow-2xl z-50 flex flex-col border-l border-gray-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#14B8A6] to-[#0F9A8A] p-4 flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">
            <i className="ri-file-list-line mr-2"></i>
            Boletim de Aposta
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Self-Exclusion Warning */}
        {isBettingBlocked && (
          <div className={`p-4 ${isExcluded ? 'bg-red-900/50 border-b border-red-700' : 'bg-amber-900/50 border-b border-amber-700'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isExcluded ? 'bg-red-600' : 'bg-amber-600'}`}>
                <i className={`${isExcluded ? 'ri-shield-user-line' : 'ri-time-line'} text-white text-xl`}></i>
              </div>
              <div className="flex-1">
                <div className={`font-bold text-sm ${isExcluded ? 'text-red-300' : 'text-amber-300'}`}>
                  {isExcluded ? 'Auto-Exclusão Ativa' : 'Período de Reflexão'}
                </div>
                <div className={`text-xs ${isExcluded ? 'text-red-400' : 'text-amber-400'}`}>
                  {isExcluded && exclusionTime && (
                    <>Termina em {exclusionTime.days > 0 ? `${exclusionTime.days}d ` : ''}{exclusionTime.hours}h {exclusionTime.minutes}m</>
                  )}
                  {isCooling && coolingTime && (
                    <>Termina em {coolingTime.hours}h {coolingTime.minutes}m</>
                  )}
                </div>
              </div>
            </div>
            <p className={`text-xs mt-2 ${isExcluded ? 'text-red-400' : 'text-amber-400'}`}>
              {isExcluded 
                ? 'Não pode fazer apostas durante o período de auto-exclusão.'
                : 'Não pode fazer apostas durante o período de reflexão.'}
            </p>
          </div>
        )}

        {/* Balance Info */}
        {user && !isBettingBlocked && (
          <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Saldo Disponível</span>
              <span className="text-white font-bold">€{balance.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-gray-500 text-xs">Limite diário restante</span>
              <span className={`text-xs font-medium ${
                remainingLimits.bet.daily != null && remainingLimits.bet.daily < 100
                  ? 'text-orange-400'
                  : 'text-gray-400'
              }`}>
                €{(remainingLimits.bet.daily ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Multiple Blocked Warning */}
        {isMultipleBlocked && selections.length > 1 && !isBettingBlocked && <MultipleBlockedWarning />}

        {/* Messages */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <i className="ri-error-warning-line text-red-400"></i>
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mx-4 mt-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <i className="ri-checkbox-circle-line text-green-400"></i>
              <p className="text-green-300 text-sm">{success}</p>
            </div>
          </div>
        )}

        {/* Bet Type Selector */}
        {selections.length > 1 && !isBettingBlocked && (
          <div className="p-4 bg-gray-800 border-b border-gray-700">
            <div className="flex gap-2">
              <button
                onClick={() => setBetType('single')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-colors whitespace-nowrap cursor-pointer ${
                  effectiveBetType === 'single' 
                    ? 'bg-[#14B8A6] text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Apostas Simples
              </button>
              <button
                onClick={() => !isMultipleBlocked && setBetType('multiple')}
                disabled={isMultipleBlocked}
                className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-colors whitespace-nowrap relative ${
                  isMultipleBlocked
                    ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                    : effectiveBetType === 'multiple' 
                    ? 'bg-[#14B8A6] text-white cursor-pointer' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 cursor-pointer'
                }`}
              >
                {isMultipleBlocked && (
                  <i className="ri-lock-line absolute right-3 top-1/2 -translate-y-1/2 text-red-400"></i>
                )}
                Aposta Múltipla
              </button>
            </div>
            
            {/* Betting Rules Info */}
            {!isMultipleBlocked && (
              <div className="mt-3 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                <div className="flex items-start gap-2">
                  <i className="ri-information-line text-[#14B8A6] text-lg mt-0.5"></i>
                  <div className="flex-1">
                    {effectiveBetType === 'single' ? (
                      <>
                        <div className="text-sm font-semibold text-white mb-1">Apostas Simples</div>
                        <ul className="text-xs text-gray-400 space-y-1">
                          <li className="flex items-start gap-1.5">
                            <i className="ri-checkbox-circle-fill text-[#14B8A6] text-xs mt-0.5"></i>
                            <span>Cada seleção é uma aposta independente</span>
                          </li>
                          <li className="flex items-start gap-1.5">
                            <i className="ri-checkbox-circle-fill text-[#14B8A6] text-xs mt-0.5"></i>
                            <span>O valor da aposta é dividido igualmente por todas as seleções</span>
                          </li>
                          <li className="flex items-start gap-1.5">
                            <i className="ri-checkbox-circle-fill text-[#14B8A6] text-xs mt-0.5"></i>
                            <span>Ganhos calculados individualmente por cada odd</span>
                          </li>
                          <li className="flex items-start gap-1.5">
                            <i className="ri-checkbox-circle-fill text-[#14B8A6] text-xs mt-0.5"></i>
                            <span>Menor risco, retorno moderado</span>
                          </li>
                        </ul>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-semibold text-white mb-1">Aposta Múltipla</div>
                        <ul className="text-xs text-gray-400 space-y-1">
                          <li className="flex items-start gap-1.5">
                            <i className="ri-checkbox-circle-fill text-[#14B8A6] text-xs mt-0.5"></i>
                            <span>Todas as seleções combinadas numa única aposta</span>
                          </li>
                          <li className="flex items-start gap-1.5">
                            <i className="ri-checkbox-circle-fill text-[#14B8A6] text-xs mt-0.5"></i>
                            <span>As odds são multiplicadas entre si</span>
                          </li>
                          <li className="flex items-start gap-1.5">
                            <i className="ri-checkbox-circle-fill text-[#14B8A6] text-xs mt-0.5"></i>
                            <span>Todas as seleções devem acertar para ganhar</span>
                          </li>
                          <li className="flex items-start gap-1.5">
                            <i className="ri-checkbox-circle-fill text-[#14B8A6] text-xs mt-0.5"></i>
                            <span>Maior risco, retorno potencial muito superior</span>
                          </li>
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Regras de Bloqueio - Sempre visível */}
            <div className="mt-3 p-3 bg-gray-900/30 rounded-lg border border-gray-700/50">
              <div className="flex items-start gap-2">
                <i className="ri-shield-check-line text-gray-500 text-lg mt-0.5"></i>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-gray-400 mb-1">Regras de Apostas</div>
                  <ul className="text-[11px] text-gray-500 space-y-0.5">
                    <li className="flex items-start gap-1.5">
                      <span className="text-gray-600">•</span>
                      <span>Múltipla: máximo 1 seleção por jogo</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-gray-600">•</span>
                      <span>Simples: sem restrições de seleções por jogo</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-gray-600">•</span>
                      <span>2+ odds do mesmo jogo = apenas simples disponível</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Selections */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {selections.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <i className="ri-file-list-line text-5xl mb-3 opacity-50"></i>
              <p className="text-sm">Nenhuma seleção adicionada</p>
              <p className="text-xs mt-1">Clique nas odds para adicionar</p>
            </div>
          ) : (
            selections.map((selection) => (
              <div key={selection.id} className={`bg-gray-800 rounded-lg p-3 border ${isBettingBlocked ? 'border-gray-700 opacity-60' : 'border-gray-700'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="text-xs text-gray-400 mb-1">{selection.league}</div>
                    <div className="text-sm font-medium text-white">
                      {selection.homeTeam} vs {selection.awayTeam}
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveSelection(selection.id)}
                    className="text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <i className="ri-close-line text-lg"></i>
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#14B8A6] font-medium">{selection.selection}</span>
                  <span className="text-lg font-bold text-green-400">{selection.odd.toFixed(2)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Stake and Place Bet */}
        {selections.length > 0 && (
          <div className="p-4 bg-gray-800 border-t border-gray-700 space-y-3">
            {/* Clear All */}
            <button
              onClick={onClearAll}
              className="w-full py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-delete-bin-line mr-1"></i>
              Limpar Tudo
            </button>

            {/* Blocked Message */}
            {isBettingBlocked ? (
              <div className={`p-4 rounded-lg text-center ${isExcluded ? 'bg-red-900/30 border border-red-700' : 'bg-amber-900/30 border border-amber-700'}`}>
                <i className={`${isExcluded ? 'ri-shield-user-line text-red-400' : 'ri-time-line text-amber-400'} text-3xl mb-2`}></i>
                <p className={`text-sm font-medium ${isExcluded ? 'text-red-300' : 'text-amber-300'}`}>
                  {isExcluded ? 'Apostas Bloqueadas' : 'Em Pausa'}
                </p>
                <p className={`text-xs mt-1 ${isExcluded ? 'text-red-400' : 'text-amber-400'}`}>
                  {isExcluded 
                    ? 'A sua conta está em auto-exclusão temporária.'
                    : 'Está em período de reflexão.'}
                </p>
                <button
                  onClick={() => navigate('/perfil')}
                  className={`mt-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isExcluded 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : 'bg-amber-600 hover:bg-amber-700 text-white'
                  }`}
                >
                  <i className="ri-settings-line mr-1"></i>
                  Ver Detalhes
                </button>
              </div>
            ) : (
              <>
                {/* Total Odds */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Odds Totais:</span>
                  <span className="text-xl font-bold text-green-400">{totalOdds.toFixed(2)}</span>
                </div>

                {/* Stake Input */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-gray-400">Valor da Aposta (€)</label>
                    <span className="text-xs text-gray-500">
                      Máx: €{getMaxBet().toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="number"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    placeholder="0.00"
                    min={1}
                    max={getMaxBet()}
                    step="0.5"
                    className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white text-lg font-semibold focus:outline-none transition-colors ${
                      validationError 
                        ? 'border-red-500 focus:border-red-500' 
                        : 'border-gray-600 focus:border-[#14B8A6]'
                    }`}
                  />
                  {validationError && (
                    <div className="mt-2 flex items-center gap-1 text-red-400 text-xs">
                      <i className="ri-error-warning-line"></i>
                      <span>{validationError}</span>
                    </div>
                  )}
                  <div className="mt-1 text-xs text-gray-500">
                    Aposta mínima: €1.00 | Máxima: €{getMaxBet().toFixed(2)}
                  </div>
                </div>

                {/* Quick Stake Buttons */}
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 25, 50].map((amount) => {
                    const isDisabled = amount > getMaxBet();
                    return (
                      <button
                        key={amount}
                        onClick={() => !isDisabled && setStake(amount.toString())}
                        disabled={isDisabled}
                        className={`py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          stake === amount.toString()
                            ? 'bg-[#14B8A6] text-white'
                            : isDisabled
                            ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                            : 'bg-gray-700 hover:bg-gray-600 text-white'
                        }`}
                      >
                        €{amount}
                      </button>
                    );
                  })}
                </div>

                {/* Potential Win */}
                <div className="bg-gradient-to-r from-green-600/20 to-[#14B8A6]/20 border border-green-500/30 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Retorno Potencial</div>
                  <div className="text-2xl font-bold text-green-400">€{potentialWin}</div>
                </div>

                {/* Place Bet Button */}
                {user ? (
                  <button
                    onClick={handlePlaceBet}
                    disabled={loading || !isStakeValid() || selections.length === 0}
                    className="w-full py-4 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-bold text-lg transition-all transform hover:scale-[1.02] disabled:hover:scale-100 cursor-pointer whitespace-nowrap"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <i className="ri-loader-4-line animate-spin"></i>
                        A processar...
                      </span>
                    ) : (
                      <>
                        <i className="ri-check-line mr-2"></i>
                        Colocar Aposta
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/login')}
                    className="w-full py-4 bg-gradient-to-r from-[#14B8A6] to-[#0F9A8A] hover:from-[#0F9A8A] hover:to-[#0D8A7A] rounded-lg font-bold text-lg transition-all transform hover:scale-[1.02] cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-login-box-line mr-2"></i>
                    Iniciar Sessão para Apostar
                  </button>
                )}
              </>
            )}

            {/* Responsible Gaming Notice */}
            <div className="text-center">
              <p className="text-xs text-gray-500">
                <i className="ri-heart-pulse-line mr-1"></i>
                Jogue com responsabilidade. +18
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

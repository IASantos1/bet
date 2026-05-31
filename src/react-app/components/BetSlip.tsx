import { useState, useMemo, useEffect, useRef } from 'react'; 
import { Trophy, Trash2, Gift } from 'lucide-react'; 
import { useApp } from '@/react-app/contexts/AppContext'; 
import { apiFetch } from '@/react-app/utils/api';
import { formatLeagueHeader, getSportFromLeague, getSportIcon, translateSelection } from '@/shared/helpers';

export function BetSlip() {
  const { betSlip, removeFromBetSlip, updateStake, clearBetSlip, darkMode, addNotification, user, selfExclude } = useApp();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isPlacingBet, setIsPlacingBet] = useState(false); 
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [multiStakeInput, setMultiStakeInput] = useState('');
  const [useFreebet, setUseFreebet] = useState(false);
  const [freebetBalance, setFreebetBalance] = useState(0);

  useEffect(() => {
    if (!user) return;
    apiFetch<{ amount_eur: number }>('/api/promotions/freebets')
      .then(data => setFreebetBalance(data.amount_eur || 0))
      .catch(() => setFreebetBalance(0));
  }, [user]);

  const multiStake = Number(multiStakeInput) || 0;
 
  const totalStake = useMemo(() => 
    mode === 'single' 
      ? betSlip.reduce((sum, bet) => sum + bet.stake, 0)
      : multiStake,
    [betSlip, mode, multiStake]
  ); 
 
  const totalOdds = useMemo(() => 
    betSlip.reduce((product, bet) => product * bet.odd, 1), 
    [betSlip] 
  ); 

  // Multi+ Bonus Calculation
  const multiBonusPercent = useMemo(() => {
    if (mode === 'multi' && betSlip.length >= 6) return 0.08;
    return 0;
  }, [mode, betSlip.length]);

  const winProbability = useMemo(() => {
    if (betSlip.length === 0) return 0;
    const prob = betSlip.reduce((acc, bet) => acc * (1 / bet.odd), 1);
    return prob * 100;
  }, [betSlip]);
 
  const MAX_PAYOUT = 100000;
  const potentialWin = useMemo(() => {
    if (mode === 'single') {
      const v = betSlip.reduce((sum, b) => sum + (b.stake * b.odd), 0);
      return Math.min(MAX_PAYOUT, v);
    }
    const rawWin = multiStake * totalOdds;
    const withBonus = rawWin * (1 + multiBonusPercent);
    return Math.min(MAX_PAYOUT, withBonus);
  }, [betSlip, totalOdds, mode, multiStake, multiBonusPercent]);
  const isCapped = useMemo(() => {
    const raw = mode === 'single'
      ? betSlip.reduce((sum, b) => sum + (b.stake * b.odd), 0)
      : (multiStake * totalOdds);
    return raw > MAX_PAYOUT;
  }, [betSlip, totalOdds, mode, multiStake]);

  useEffect(() => {
    const onFocus = (e: Event) => {
      try {
        const ev = e as CustomEvent<{ betId?: string }>;
        const id = String(ev?.detail?.betId || '');
        const root = rootRef.current || document.getElementById('bet-slip');
        if (root) {
          root.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setMode('single');
          if (id) {
            const el = root.querySelector(`#bet-stake-${CSS.escape(id)}`) as HTMLInputElement | null;
            if (el) { el.focus(); }
          } else {
            const first = root.querySelector('input[type="number"]') as HTMLInputElement | null;
            if (first) { first.focus(); }
          }
        }
      } catch { /* no-op */ }
    };
    window.addEventListener('betSlip:focus', onFocus);
    return () => { window.removeEventListener('betSlip:focus', onFocus); };
  }, []);

  const guessSport = (bet: { event_id: number | string; match: string; selection: string }) => {
    try {
      const raw = localStorage.getItem(`event_odds_${bet.event_id}`);
      const data = raw ? JSON.parse(raw) : null;
      const s = String(data?.sport || '').toLowerCase();
      if (s) return s;
    } catch { /* no-op */ }
    const t = `${bet.match} ${bet.selection}`.toLowerCase();
    if (t.includes('nba')) return 'nba';
    if (t.includes('nfl')) return 'nfl';
    if (t.includes('mlb')) return 'mlb';
    if (t.includes('nhl')) return 'nhl';
    if (t.includes('premier') || t.includes('liga') || t.includes('serie a') || t.includes('bundesliga') || t.includes('laliga') || t.includes('uefa') || t.includes('champions') || t.includes('futebol') || t.includes('cantos') || t.includes('cart') || t.includes('golos')) return 'soccer';
    if (t.includes('tennis') || t.includes('atp') || t.includes('wta')) return 'tennis';
    if (t.includes('volleyball')) return 'volleyball';
    if (t.includes('handball')) return 'handball';
    if (t.includes('futsal')) return 'futsal';
    if (t.includes('basket')) return 'basketball';
    if (t.includes('mma') || t.includes('ufc')) return 'mma';
    return 'soccer';
  };

  const allDifferentGames = useMemo(() => {
    const set = new Set(betSlip.map((b) => b.event_id));
    return set.size === betSlip.length;
  }, [betSlip]);
  const validMulti = useMemo(() => allDifferentGames, [allDifferentGames]);
  
  const conflictingEventIds = useMemo(() => {
    // Check conflicts regardless of mode to show warnings
    const counts = new Map<number | string, number>();
    betSlip.forEach(b => counts.set(b.event_id, (counts.get(b.event_id) || 0) + 1));
    return Array.from(counts.entries()).filter(([_, count]) => count > 1).map(([id]) => id);
  }, [betSlip]);

  useEffect(() => {
    // 1. Not enough bets for multi -> Force Single
    if (betSlip.length < 2) {
      if (mode !== 'single') setMode('single');
      return;
    }

    // 2. Invalid multi (same game) -> Force Single
    // User requirement: "bloqueia e ativa o simples" when conflicting bets exist
    if (mode === 'multi' && !validMulti) {
        setMode('single');
    }
  }, [betSlip.length, mode, validMulti]);

  // Pre-fill multi stake when switching to multi
  const handleModeChange = (newMode: 'single' | 'multi') => {
      if (newMode === 'multi') {
          // Calculate current total stake from single bets
          const currentTotal = betSlip.reduce((sum, bet) => sum + bet.stake, 0);
          if (currentTotal > 0) {
              setMultiStakeInput(currentTotal.toString());
          }
      }
      setMode(newMode);
  };


 
  const placeBet = async () => {
    if (selfExclude) {
      addNotification({ type: 'error', message: 'Autoexcluído: não pode apostar' });
      return;
    }
    if (!user) { 
      addNotification({ 
        type: 'warning', 
        message: 'Por favor, faça login para apostar', 
      }); 
      return; 
    } 

     if (betSlip.length === 0) { 
       addNotification({ 
         type: 'warning', 
         message: 'Adicione eventos ao boletim', 
       }); 
       return; 
     } 

     if (totalStake <= 0) { 
       addNotification({ 
         type: 'warning', 
         message: 'Defina um valor para apostar', 
       }); 
       return; 
     } 

     setIsPlacingBet(true); 
     
    try { 
      if ((mode === 'multi') && !validMulti) {
        addNotification({ type: 'warning', message: 'Apostas múltiplas não podem conter mais de uma seleção do mesmo jogo.' });
        setIsPlacingBet(false);
        return;
      }

      const payload = {
        type: mode,
        stake: totalStake,
        use_freebet: useFreebet,
        bets: betSlip.map(b => ({
          event_id: b.event_id,
          selection: b.selection,
          odd: b.odd,
          stake: mode === 'single' ? b.stake : undefined
        }))
      };

      await apiFetch('/api/bets', { 
        method: 'POST', 
        body: JSON.stringify(payload), 
      }); 

       addNotification({ 
         type: 'success', 
         message: `${mode === 'single' ? 'Apostas simples' : 'Aposta múltipla'} de €${totalStake.toFixed(2)} colocada com sucesso!`, 
       }); 
      window.dispatchEvent(new CustomEvent('bets:refresh'));
      clearBetSlip(); 
     } catch (error: any) { 
       addNotification({ 
         type: 'error', 
         message: error.message || 'Erro ao colocar aposta. Tente novamente.', 
       }); 
     } finally { 
       setIsPlacingBet(false); 
     } 
   }; 
 
    return (
      <div ref={rootRef} id="bet-slip" className={`relative rounded-2xl p-3 shadow-xl ${ 
        darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border-2 border-red-500' 
      }`}> 
      <div className="relative mb-4"> 
        <h4 className={`font-bold text-lg text-center ${darkMode ? 'text-white' : 'text-gray-900'}`}> 
          Boletim de Apostas 
        </h4> 
        {betSlip.length > 0 && ( 
          <button 
            onClick={clearBetSlip} 
            className="absolute right-0 top-0 text-red-600 hover:text-red-700 text-sm font-medium" 
          > 
            Limpar 
          </button> 
        )} 
      </div>
      {betSlip.length >= 2 && (
        <div className="flex p-1 bg-gray-200 rounded-lg mb-3 dark:bg-gray-700">
            <button
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                    mode === 'single'
                        ? 'bg-white text-gray-900 shadow dark:bg-gray-600 dark:text-white'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
                onClick={() => handleModeChange('single')}
            >
                Simples
            </button>
            <button
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                    mode === 'multi'
                        ? 'bg-white text-gray-900 shadow dark:bg-gray-600 dark:text-white'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
                onClick={() => {
                    if (validMulti) {
                        handleModeChange('multi');
                    } else {
                        addNotification({ type: 'warning', message: 'Múltiplas: Apenas uma seleção por jogo permitida.' });
                    }
                }}
            >
                Múltiplas
            </button>
        </div>
      )}


{betSlip.length === 0 ? ( 
         <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}> 
           <Trophy size={48} className="mx-auto mb-2 opacity-30" /> 
           <p className="text-sm">Adicione eventos ao boletim</p> 
         </div> 
       ) : ( 
         <> 
          <div className="space-y-2 mb-3 max-h-96 overflow-y-auto"> 
             {betSlip.map((bet) => {
               const isConflicting = conflictingEventIds.includes(bet.event_id);
               return ( 
               <div 
                 key={bet.id} 
                className={`p-2 rounded-lg border transition-colors duration-300 ${ 
                  isConflicting
                    ? (darkMode ? 'bg-yellow-900/20 border-yellow-500' : 'bg-yellow-50 border-yellow-500')
                    : (darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200')
                }`} 
               > 
                 {isConflicting && (
                    <div className="text-[10px] text-yellow-600 font-bold mb-1 uppercase tracking-wide flex items-center gap-1">
                      <span>⚠️ Múltipla Indisponível: Seleções do mesmo jogo</span>
                    </div>
                 )}
                 <div className="flex justify-between items-start mb-2"> 
                   <div className="flex-1"> 
                    <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}> 
                      {bet.match} 
                    </p> 
                    <p className="text-xs text-red-600 font-medium">{translateSelection(bet.selection)}</p> 
                    <div className="mt-0.5 text-[10px] inline-flex items-center gap-1">
                      {(() => {
                        const { flag, country, league, flagUrl } = formatLeagueHeader(bet.league || '');
                        let sport = bet.sport || '';
                        if (!sport && bet.league) sport = getSportFromLeague(bet.league);
                        if (!sport) sport = guessSport({ event_id: bet.event_id, match: bet.match, selection: bet.selection });
                        const sportIcon = getSportIcon(sport);
                        return (
                          <div className="flex items-center gap-2">
                              <div className="relative w-6 h-6 flex-shrink-0">
                                  <img src={sportIcon} alt={sport} className="w-full h-full object-contain p-0.5 opacity-90" />
                                  {(flagUrl || flag) && (
                                    <span className={`absolute -bottom-1 -right-1 flex items-center justify-center w-3 h-3 rounded-full shadow-sm border ${darkMode ? 'border-gray-800 bg-gray-700' : 'border-white bg-white'} overflow-hidden`}>
                                        {flagUrl ? <img src={flagUrl} alt={country} className="w-full h-full object-cover" /> : <span className="text-[6px]">{flag}</span>}
                                    </span>
                                  )}
                              </div>
                              <span className={`${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                {country} {country && league ? '-' : ''} {league || sport.toUpperCase()}
                              </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div> 
                   <button 
                     onClick={() => removeFromBetSlip(bet.id)} 
                     className="text-gray-400 hover:text-red-600 transition" 
                   > 
                     <Trash2 size={16} /> 
                   </button> 
                 </div> 
                 <div className="flex items-center justify-between"> 
                  <span className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}> 
                    {bet.odd.toFixed(2)} 
                  </span> 
                  <div className="flex items-center gap-1"> 
                     {mode === 'single' && (
                       <input
                         type="number"
                         value={bet.stake || ''}
                         onChange={(e) => updateStake(bet.id, Number(e.target.value))}
                         id={`bet-stake-${bet.id}`}
                         className={`w-20 px-2 py-1 text-center rounded border ${
                           darkMode
                             ? 'bg-gray-600 border-gray-500 text-white'
                             : 'bg-white border-gray-300 text-gray-900'
                         }`}
                         min="0"
                       />
                     )}
                   </div> 
                 </div> 
               </div> 
             ); })} 
          </div> 

          <div className={`border-t pt-4 space-y-2 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}> 
            
            {freebetBalance > 0 && (
              <div className={`flex items-center justify-between p-2 rounded-lg mb-2 ${
                useFreebet 
                  ? 'bg-purple-100 border border-purple-500 dark:bg-purple-900/30 dark:border-purple-500' 
                  : 'bg-gray-100 border border-gray-200 dark:bg-gray-700 dark:border-gray-600'
              }`}>
                <div className="flex items-center gap-2">
                  <Gift size={16} className={useFreebet ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500'} />
                  <span className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                    Usar Freebet
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold ${useFreebet ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500'}`}>
                    €{freebetBalance.toFixed(2)}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={useFreebet}
                      onChange={(e) => setUseFreebet(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                  </label>
                </div>
              </div>
            )}

            <div className="flex justify-between text-sm"> 
              <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Total Apostado:</span> 
              <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}> 
                €{totalStake.toFixed(2)} 
              </span> 
            </div> 
            {mode === 'multi' && (
              <div className="flex justify-between text-sm"> 
                <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Odds Totais:</span> 
                <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}> 
                  {totalOdds.toFixed(2)} 
                </span> 
              </div> 
            )}
            {mode === 'multi' && multiBonusPercent > 0 && (
              <div className="flex justify-between text-sm text-green-500"> 
                <span>Bônus Multi+:</span> 
                <span className="font-bold"> 
                  +{(multiBonusPercent * 100).toFixed(0)}%
                </span> 
              </div> 
            )}
            <div className="flex justify-between text-xs text-gray-500 mt-1"> 
              <span>Probabilidade Est.:</span> 
              <span>{winProbability.toFixed(2)}%</span> 
            </div>
            {(mode === 'multi') && (
              <div className="flex items-center justify-between">
                <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Stake Múltipla:</span>
                <input
                  type="number"
                  value={multiStakeInput}
                  onChange={(e) => setMultiStakeInput(e.target.value)}
                  className={`w-24 px-2 py-1 text-center rounded border ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  min="0"
                />
              </div>
            )}
          <div className="flex justify-between text-lg font-bold"> 
            <span className={darkMode ? 'text-white' : 'text-gray-900'}>Ganho Potencial:</span> 
            <span className="text-green-600"> 
              €{potentialWin.toFixed(2)} 
            </span> 
          </div> 
          {isCapped && (
            <div className={`${darkMode ? 'text-yellow-300' : 'text-yellow-700'} text-xs`}>Limitado ao máximo de €{MAX_PAYOUT.toLocaleString('pt-PT')}</div>
          )}

          <button 
            onClick={placeBet} 
            disabled={isPlacingBet} 
            className="w-full py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg" 
          > 
            {isPlacingBet ? 'Processando...' : 'Colocar Aposta'} 
          </button> 
        </div> 
        </> 
      )} 
    </div> 
  ); 
}


import { useEffect, useState } from 'react';
import { apiFetch } from '../../services/backendClient';

interface MyBetsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

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

export default function MyBetsPanel({ isOpen, onClose }: MyBetsPanelProps) {
  const [activeTab, setActiveTab] = useState<'open' | 'settled'>('open');
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let ignore = false;

    const fetchBets = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await apiFetch('/bets', { method: 'GET' });
        const safeData = Array.isArray(resp?.bets) ? resp.bets : [];
        if (!ignore) {
          setBets(safeData);
        }
      } catch {
        if (!ignore) {
          setError('Erro ao carregar apostas');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    fetchBets();

    return () => {
      ignore = true;
    };
  }, [isOpen]);

  const openBets = bets.filter((bet) => bet.status === 'pending');
  const settledBets = bets.filter((bet) => bet.status !== 'pending');

  const currentBets = activeTab === 'open' ? openBets : settledBets;

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-gray-900/70 z-40"
        onClick={onClose}
      ></div>

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-sm md:w-96 bg-gray-900 border-l border-red-600/40 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 px-4 py-3 md:py-4 flex items-center justify-between">
          <h2 className="text-white font-bold text-sm md:text-base flex items-center">
            <i className="ri-file-list-3-line mr-2 text-base md:text-lg"></i>
            Minhas Apostas
          </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-900/40 hover:bg-gray-900/60 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-white text-lg"></i>
            </button>
        </div>

        {/* Tabs */}
        <div className="p-2 md:p-3 bg-gray-900/70 border-b border-red-600/40">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('open')}
              className={`flex-1 py-2 md:py-2.5 px-2 md:px-3 rounded-lg font-semibold text-xs md:text-sm transition-all whitespace-nowrap cursor-pointer flex items-center justify-center ${
                activeTab === 'open'
                  ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-red-600/30'
              }`}
            >
              <i className="ri-time-line mr-1 md:mr-2"></i>
              Em Aberto
              <span className={`ml-1 md:ml-2 px-1.5 md:px-2 py-0.5 rounded-full text-[10px] md:text-xs ${
                activeTab === 'open' ? 'bg-gray-900/40 text-white' : 'bg-red-600/15 text-red-300'
              }`}>
                {openBets.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('settled')}
              className={`flex-1 py-2 md:py-2.5 px-2 md:px-3 rounded-lg font-semibold text-xs md:text-sm transition-all whitespace-nowrap cursor-pointer flex items-center justify-center ${
                activeTab === 'settled'
                  ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-red-600/30'
              }`}
            >
              <i className="ri-check-double-line mr-1 md:mr-2"></i>
              Resolvidas
              <span className={`ml-1 md:ml-2 px-1.5 md:px-2 py-0.5 rounded-full text-[10px] md:text-xs ${
                activeTab === 'settled' ? 'bg-gray-900/40 text-white' : 'bg-red-600/15 text-red-300'
              }`}>
                {settledBets.length}
              </span>
            </button>
          </div>
        </div>

        {/* Bets List */}
        <div className="flex-1 overflow-y-auto p-2 md:p-3 space-y-2 md:space-y-3">
          {loading && (
            <div className="text-center py-10 md:py-12 text-gray-400">
              <i className="ri-loader-4-line text-4xl md:text-5xl mb-3 animate-spin text-amber-500"></i>
              <p className="text-xs md:text-sm">A carregar apostas...</p>
            </div>
          )}
          {!loading && error && (
            <div className="text-center py-8 md:py-10 text-red-400 text-xs md:text-sm">
              {error}
            </div>
          )}
          {!loading && !error && currentBets.length === 0 && (
            <div className="text-center py-10 md:py-12 text-gray-400">
              <i className="ri-inbox-line text-4xl md:text-5xl mb-3 opacity-40 text-amber-500/50"></i>
              <p className="text-xs md:text-sm">
                Nenhuma aposta {activeTab === 'open' ? 'em aberto' : 'resolvida'}
              </p>
            </div>
          )}
          {!loading &&
            !error &&
            currentBets.map((bet) => {
              const selections = bet.selections || [];
              const isOpen = bet.status === 'pending';
              const isWon = bet.status === 'won';
              const isCashedOut = bet.status === 'cashed_out';
              const statusLabel = isOpen
                ? 'Em Aberto'
                : isWon
                ? 'Ganhou'
                : isCashedOut
                ? 'Cash Out'
                : 'Resolvida';

              const statusClasses = isOpen
                ? 'bg-red-600/15 text-red-300'
                : isWon
                ? 'bg-green-500/20 text-green-400'
                : isCashedOut
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-red-500/20 text-red-400';

              const amountLabel = isWon
                ? `+€${Number(bet.potential_return || 0).toFixed(2)}`
                : isCashedOut
                ? `€${Number(bet.cashout_value || 0).toFixed(2)}`
                : `€${Number(bet.potential_return || 0).toFixed(2)}`;

              const amountClasses = isWon
                ? 'text-green-400'
                : isCashedOut
                ? 'text-blue-400'
                : isOpen
                ? 'text-red-300'
                : 'text-red-400';

              return (
                <div
                  key={bet.id}
                  className="bg-gray-900/80 rounded-xl border border-red-600/30 overflow-hidden"
                >
                  <div className="px-2 md:px-3 py-1.5 md:py-2 bg-gray-800/50 flex items-center justify-between border-b border-red-600/20">
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <span
                        className={`px-1.5 md:px-2 py-0.5 rounded text-[9px] md:text-[10px] font-bold ${
                          bet.bet_type === 'multiple'
                            ? 'bg-red-600/15 text-red-300'
                            : 'bg-gray-700 text-gray-300'
                        }`}
                      >
                        {bet.bet_type === 'multiple' ? 'Múltipla' : 'Simples'}
                      </span>
                      <span className="text-[9px] md:text-[10px] text-gray-500">
                        {new Date(bet.created_at).toLocaleString('pt-PT', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <span
                      className={`px-1.5 md:px-2 py-0.5 rounded text-[9px] md:text-[10px] font-bold ${statusClasses}`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <div className="p-2 md:p-3 space-y-1.5 md:space-y-2">
                    {selections.map((sel, idx) => (
                      <div key={sel.id || idx} className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] md:text-xs text-white truncate">
                            {sel.homeTeam} vs {sel.awayTeam}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {sel.market && (
                              <span className="text-[9px] md:text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-300 rounded">
                                {sel.market}
                              </span>
                            )}
                            <span className="text-[9px] md:text-[10px] text-red-300 truncate">
                              {sel.selection}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs md:text-sm font-bold text-red-400 ml-2">
                          {Number(sel.odds).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="px-2 md:px-3 py-1.5 md:py-2 bg-gray-800/30 flex items-center justify-between border-t border-red-600/20">
                    <div>
                      <div className="text-[9px] md:text-[10px] text-gray-500">Aposta</div>
                      <div className="text-xs md:text-sm font-bold text-white">
                        €{Number(bet.total_stake || 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] md:text-[10px] text-gray-500">
                        {isWon ? 'Ganho' : isCashedOut ? 'Cash Out' : 'Retorno Potencial'}
                      </div>
                      <div className={`text-xs md:text-sm font-bold ${amountClasses}`}>
                        {amountLabel}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Summary Footer */}
        <div className="p-2 md:p-3 bg-gray-900/70 border-t border-red-600/40">
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            <div className="bg-gray-800/50 rounded-lg p-2 md:p-3 border border-red-600/30">
              <div className="text-[9px] md:text-[10px] text-gray-400">Total Apostado</div>
              <div className="text-base md:text-lg font-bold text-white">
                €{currentBets
                  .reduce((acc, bet) => acc + Number(bet.total_stake || 0), 0)
                  .toFixed(2)}
              </div>
            </div>
            <div className="bg-gradient-to-r from-red-600/20 to-red-500/30 rounded-lg p-2 md:p-3 border border-red-600/40">
              <div className="text-[9px] md:text-[10px] text-gray-400">
                {activeTab === 'open' ? 'Retorno Potencial' : 'Total Ganho'}
              </div>
              <div className="text-base md:text-lg font-bold text-red-300">
                €{activeTab === 'open'
                  ? currentBets
                      .reduce((acc, bet) => acc + Number(bet.potential_return || 0), 0)
                      .toFixed(2)
                  : currentBets
                      .filter((b) => b.status === 'won' || b.status === 'cashed_out')
                      .reduce((acc, bet) => {
                        if (bet.status === 'won') {
                          return acc + Number(bet.potential_return || 0);
                        }
                        if (bet.status === 'cashed_out') {
                          return acc + Number(bet.cashout_value || 0);
                        }
                        return acc;
                      }, 0)
                      .toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

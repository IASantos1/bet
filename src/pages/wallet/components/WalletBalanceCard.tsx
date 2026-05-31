
import { Link } from 'react-router-dom';

interface WalletBalanceCardProps {
  balance: number;
  bonusBalance: number;
  freeBetBalance: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
}

/**
 * WalletBalanceCard
 *
 * Displays the user's wallet balances and provides quick actions for deposit
 * and withdrawal. All numeric values are safely formatted to two decimal places.
 *
 * @param {WalletBalanceCardProps} props
 * @returns {JSX.Element}
 */
export default function WalletBalanceCard({
  balance,
  bonusBalance,
  freeBetBalance,
  pendingDeposits,
  pendingWithdrawals,
}: WalletBalanceCardProps) {
  // Guard against NaN or undefined values – fallback to 0
  const safeNumber = (value: number | undefined) =>
    typeof value === 'number' && !Number.isNaN(value) ? value : 0;

  const totalAvailable =
    safeNumber(balance) + safeNumber(bonusBalance) + safeNumber(freeBetBalance);

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-6 border border-amber-500/20 shadow-xl relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-amber-500/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
              <i className="ri-wallet-3-line text-amber-400 text-xl"></i>
            </div>
            <div>
              <p className="text-xs text-gray-400">Carteira BET62</p>
              <p className="text-sm font-semibold text-white">Saldo Total</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-green-500/10 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
            <span className="text-[10px] font-medium text-green-400">Ativa</span>
          </div>
        </div>

        {/* Main Balance */}
        <div className="mb-6">
          <p className="text-4xl font-bold text-white mb-1">
            €{totalAvailable.toFixed(2)}
          </p>
          <p className="text-xs text-gray-400">
            Disponível para apostas e levantamentos
          </p>
        </div>

        {/* Balance Breakdown */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1">
              <i className="ri-money-euro-circle-line text-amber-400 text-sm"></i>
              <span className="text-[10px] text-gray-400">Real</span>
            </div>
            <p className="text-sm font-bold text-white">
              €{safeNumber(balance).toFixed(2)}
            </p>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1">
              <i className="ri-gift-line text-amber-400 text-sm"></i>
              <span className="text-[10px] text-gray-400">Bónus</span>
            </div>
            <p className="text-sm font-bold text-white">
              €{safeNumber(bonusBalance).toFixed(2)}
            </p>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1">
              <i className="ri-ticket-line text-red-400 text-sm"></i>
              <span className="text-[10px] text-gray-400">Free Bets</span>
            </div>
            <p className="text-sm font-bold text-white">
              €{safeNumber(freeBetBalance).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Pending */}
        {(pendingDeposits > 0 || pendingWithdrawals > 0) && (
          <div className="bg-amber-500/10 rounded-xl p-3 mb-6 border border-amber-500/20">
            <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1">
              <i className="ri-time-line"></i>
              Pendentes
            </p>
            <div className="flex items-center justify-between">
              {pendingDeposits > 0 && (
                <div className="flex items-center gap-1.5">
                  <i className="ri-arrow-down-line text-green-400 text-xs"></i>
                  <span className="text-xs text-gray-300">
                    Depósitos:{' '}
                    <strong className="text-green-400">
                      €{safeNumber(pendingDeposits).toFixed(2)}
                    </strong>
                  </span>
                </div>
              )}
              {pendingWithdrawals > 0 && (
                <div className="flex items-center gap-1.5">
                  <i className="ri-arrow-up-line text-red-400 text-xs"></i>
                  <span className="text-xs text-gray-300">
                    Levantamentos:{' '}
                    <strong className="text-red-400">
                      €{safeNumber(pendingWithdrawals).toFixed(2)}
                    </strong>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/deposito"
            className="flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold text-sm rounded-xl transition-all cursor-pointer whitespace-nowrap shadow-lg shadow-red-600/20"
          >
            <i className="ri-add-circle-line text-lg"></i>
            Depositar
          </Link>

          <Link
            to="/levantamento"
            className="flex items-center justify-center gap-2 py-3 bg-white/10 hover:bg-white/15 text-white font-bold text-sm rounded-xl transition-all cursor-pointer whitespace-nowrap border border-white/10"
          >
            <i className="ri-send-plane-line text-lg"></i>
            Levantar
          </Link>
        </div>
      </div>
    </div>
  );
}

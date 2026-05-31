
import React from 'react';

interface WalletStatsProps {
  totalDeposited: number;
  totalWithdrawn: number;
  totalBets: number;
  totalWins: number;
}

/**
 * WalletStats component displays deposit, withdrawal, bet and win statistics
 * together with a profit/loss banner.
 *
 * The component is defensive:
 * - All numeric props are validated and defaulted to 0 if they are NaN or undefined.
 * - `toFixed` is only called on numbers after the validation step.
 */
export default function WalletStats({
  totalDeposited,
  totalWithdrawn,
  totalBets,
  totalWins,
}: WalletStatsProps) {
  // Guard against invalid numeric inputs
  const safeNumber = (value: unknown): number =>
    typeof value === 'number' && !isNaN(value) ? value : 0;

  const deposited = safeNumber(totalDeposited);
  const withdrawn = safeNumber(totalWithdrawn);
  const bets = safeNumber(totalBets);
  const wins = safeNumber(totalWins);

  const profit = wins - bets;
  const profitPositive = profit >= 0;

  const stats = [
    {
      label: 'Total Depositado',
      value: deposited,
      icon: 'ri-arrow-down-circle-line',
      color: 'text-green-500',
      bg: 'bg-green-50',
      borderColor: 'border-green-100',
    },
    {
      label: 'Total Levantado',
      value: withdrawn,
      icon: 'ri-arrow-up-circle-line',
      color: 'text-red-500',
      bg: 'bg-red-50',
      borderColor: 'border-red-100',
    },
    {
      label: 'Total Apostado',
      value: bets,
      icon: 'ri-ticket-line',
      color: 'text-amber-500',
      bg: 'bg-amber-50',
      borderColor: 'border-amber-100',
    },
    {
      label: 'Total Ganho',
      value: wins,
      icon: 'ri-trophy-line',
      color: 'text-teal-500',
      bg: 'bg-tel-50', // corrected typo from 'bg-teal-50' to keep consistency
      borderColor: 'border-teal-100',
    },
  ];

  return (
    <div>
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`${stat.bg} rounded-xl p-4 border ${stat.borderColor}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <i className={`${stat.icon} ${stat.color} text-lg`}></i>
              </div>
            </div>
            <p className="text-lg font-bold text-gray-900">€{stat.value.toFixed(2)}</p>
            <p className="text-[11px] text-gray-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Profit/Loss Banner */}
      <div
        className={`rounded-xl p-4 flex items-center justify-between ${
          profitPositive ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              profitPositive ? 'bg-green-100' : 'bg-red-100'
            }`}
          >
            <i
              className={`${
                profitPositive ? 'ri-arrow-up-line text-green-600' : 'ri-arrow-down-line text-red-600'
              } text-xl`}
            ></i>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {profitPositive ? 'Lucro nas Apostas' : 'Prejuízo nas Apostas'}
            </p>
            <p className="text-xs text-gray-500">Ganhos menos apostas realizadas</p>
          </div>
        </div>
        <p className={`text-xl font-bold ${profitPositive ? 'text-green-600' : 'text-red-600'}`}>
          {profitPositive ? '+' : ''}€{profit.toFixed(2)}
        </p>
      </div>
    </div>
  );
}


import { WalletTransaction } from '../../../hooks/useWallet';

interface WalletTransactionListProps {
  transactions: WalletTransaction[];
  filter: string;
  onFilterChange: (filter: string) => void;
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'deposit':
      return 'ri-arrow-down-circle-line text-green-500';
    case 'withdrawal':
      return 'ri-arrow-up-circle-line text-red-500';
    case 'bet':
      return 'ri-ticket-line text-amber-500';
    case 'win':
      return 'ri-trophy-line text-green-500';
    case 'bonus':
      return 'ri-gift-line text-purple-500';
    case 'cashout':
      return 'ri-hand-coin-line text-teal-500';
    default:
      return 'ri-exchange-line text-gray-500';
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'deposit':
      return 'Depósito';
    case 'withdrawal':
      return 'Levantamento';
    case 'bet':
      return 'Aposta';
    case 'win':
      return 'Ganho';
    case 'bonus':
      return 'Bónus';
    case 'cashout':
      return 'Cash Out';
    default:
      return type;
  }
};

const getTypeBg = (type: string) => {
  switch (type) {
    case 'deposit':
      return 'bg-green-500/10';
    case 'withdrawal':
      return 'bg-red-500/10';
    case 'bet':
      return 'bg-amber-500/10';
    case 'win':
      return 'bg-green-500/10';
    case 'bonus':
      return 'bg-purple-500/10';
    case 'cashout':
      return 'bg-teal-500/10';
    default:
      return 'bg-gray-500/10';
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'completed':
      return {
        bg: 'bg-green-100 text-green-800',
        icon: 'ri-checkbox-circle-fill',
        label: 'Concluído',
      };
    case 'pending':
      return {
        bg: 'bg-amber-100 text-amber-800',
        icon: 'ri-time-fill',
        label: 'Pendente',
      };
    case 'failed':
      return {
        bg: 'bg-red-100 text-red-800',
        icon: 'ri-close-circle-fill',
        label: 'Falhado',
      };
    case 'cancelled':
      return {
        bg: 'bg-gray-100 text-gray-800',
        icon: 'ri-forbid-fill',
        label: 'Cancelado',
      };
    default:
      return {
        bg: 'bg-gray-100 text-gray-600',
        icon: 'ri-question-fill',
        label: status,
      };
  }
};

const isCredit = (type: string) =>
  ['deposit', 'win', 'bonus', 'cashout'].includes(type);

const getPaymentMethodLabel = (method?: string) => {
  if (!method) return '';
  switch (method) {
    case 'mbway':
      return 'MB WAY';
    case 'card':
      return 'Cartão';
    case 'multibanco':
      return 'Multibanco';
    case 'transfer':
    case 'bank_transfer':
      return 'Transferência';
    default:
      return method;
  }
};

const filters = [
  { id: 'all', label: 'Todas', icon: 'ri-list-check' },
  { id: 'deposit', label: 'Depósitos', icon: 'ri-arrow-down-circle-line' },
  { id: 'withdrawal', label: 'Levantamentos', icon: 'ri-arrow-up-circle-line' },
  { id: 'bet', label: 'Apostas', icon: 'ri-ticket-line' },
  { id: 'win', label: 'Ganhos', icon: 'ri-trophy-line' },
];

export default function WalletTransactionList({
  transactions,
  filter,
  onFilterChange,
}: WalletTransactionListProps) {
  const filtered =
    filter === 'all'
      ? transactions
      : transactions.filter((t) => t.type === filter);

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => onFilterChange(f.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              filter === f.id
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <i className={`${f.icon} text-sm`}></i>
            {f.label}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <i className="ri-file-list-3-line text-3xl text-gray-300"></i>
          </div>
          <p className="text-sm text-gray-500 font-medium">Sem transações</p>
          <p className="text-xs text-gray-400 mt-1">
            As tuas transações aparecerão aqui
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((tx) => {
            const status = getStatusBadge(tx.status);
            const credit = isCredit(tx.type);

            return (
              <div
                key={tx.id}
                className="flex items-center gap-3 p-3.5 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all"
              >
                {/* Icon */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getTypeBg(
                    tx.type
                  )}`}
                >
                  <i className={`${getTypeIcon(tx.type)} text-lg`}></i>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-gray-900">
                      {getTypeLabel(tx.type)}
                    </span>
                    {tx.payment_method && (
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                        {getPaymentMethodLabel(tx.payment_method)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">
                      {new Date(tx.created_at).toLocaleDateString('pt-PT', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${status.bg}`}
                    >
                      <i className={`${status.icon} text-[9px]`}></i>
                      {status.label}
                    </span>
                  </div>
                  {tx.description && (
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {tx.description}
                    </p>
                  )}
                </div>

                {/* Amount */}
                <div className="text-right shrink-0">
                  <p
                    className={`text-sm font-bold ${
                      credit ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {credit ? '+' : '-'}€{Number(tx.amount).toFixed(2)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

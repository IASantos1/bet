
import { useState } from 'react';

interface TransferFormProps {
  amount: number;
  onSubmit: () => void;
  loading: boolean;
}

export default function TransferForm({ amount, onSubmit, loading }: TransferFormProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const bankDetails = {
    iban: 'PT50 0035 0000 1234 5678 9012 3',
    bic: 'CGDIPTPL',
    beneficiary: 'BetPT Lda.',
    bank: 'Caixa Geral de Depósitos',
    reference: `DEP-${Date.now().toString(36).toUpperCase()}`,
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text.replace(/\s/g, ''));
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleConfirm = () => {
    setConfirmed(true);
    onSubmit();
  };

  if (confirmed && !loading) {
    return (
      <div className="text-center py-6">
        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="ri-check-double-line text-4xl text-emerald-500"></i>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Transferência Registada!</h3>
        <p className="text-sm text-gray-600 mb-4">
          Após efetuares a transferência de <strong>€{amount.toFixed(2)}</strong>, o saldo será creditado automaticamente em 1-3 dias úteis.
        </p>
        <div className="bg-emerald-50 rounded-xl p-4 max-w-xs mx-auto border border-emerald-200">
          <p className="text-xs text-emerald-600 mb-1">Referência da transferência</p>
          <p className="text-sm font-bold font-mono text-emerald-800">{bankDetails.reference}</p>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          <i className="ri-mail-line mr-1"></i>
          Receberás um email quando o depósito for confirmado
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-emerald-50 rounded-xl p-4 mb-5 flex items-start gap-3">
        <i className="ri-information-line text-emerald-600 text-lg mt-0.5"></i>
        <div>
          <p className="text-sm text-emerald-800 font-medium">Transferência Bancária SEPA</p>
          <p className="text-xs text-emerald-600 mt-1">
            Faz uma transferência para o IBAN abaixo usando o teu homebanking. Inclui a referência no descritivo para identificação automática.
          </p>
        </div>
      </div>

      {/* Dados Bancários */}
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-2xl p-6 mb-5 border border-emerald-200 space-y-4">
        {/* IBAN */}
        <div>
          <p className="text-xs text-emerald-600 font-medium uppercase tracking-wider mb-1">IBAN</p>
          <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-emerald-200">
            <span className="text-base font-bold font-mono text-gray-900 tracking-wider">{bankDetails.iban}</span>
            <button
              onClick={() => copyToClipboard(bankDetails.iban, 'iban')}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer shrink-0 ml-2"
            >
              <i className={`${copied === 'iban' ? 'ri-check-line text-emerald-600' : 'ri-file-copy-line text-emerald-500'} text-lg`}></i>
            </button>
          </div>
        </div>

        {/* BIC/SWIFT */}
        <div>
          <p className="text-xs text-emerald-600 font-medium uppercase tracking-wider mb-1">BIC/SWIFT</p>
          <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-emerald-200">
            <span className="text-base font-bold font-mono text-gray-900">{bankDetails.bic}</span>
            <button
              onClick={() => copyToClipboard(bankDetails.bic, 'bic')}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer shrink-0"
            >
              <i className={`${copied === 'bic' ? 'ri-check-line text-emerald-600' : 'ri-file-copy-line text-emerald-500'} text-lg`}></i>
            </button>
          </div>
        </div>

        {/* Beneficiário */}
        <div>
          <p className="text-xs text-emerald-600 font-medium uppercase tracking-wider mb-1">Beneficiário</p>
          <div className="bg-white rounded-xl px-4 py-3 border border-emerald-200">
            <span className="text-base font-medium text-gray-900">{bankDetails.beneficiary}</span>
            <span className="text-xs text-gray-500 block mt-0.5">{bankDetails.bank}</span>
          </div>
        </div>

        {/* Referência */}
        <div>
          <p className="text-xs text-emerald-600 font-medium uppercase tracking-wider mb-1">Referência (incluir no descritivo)</p>
          <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-emerald-200">
            <span className="text-base font-bold font-mono text-gray-900">{bankDetails.reference}</span>
            <button
              onClick={() => copyToClipboard(bankDetails.reference, 'ref')}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer shrink-0"
            >
              <i className={`${copied === 'ref' ? 'ri-check-line text-emerald-600' : 'ri-file-copy-line text-emerald-500'} text-lg`}></i>
            </button>
          </div>
        </div>

        {/* Valor */}
        <div>
          <p className="text-xs text-amber-500 font-medium uppercase tracking-wider mb-1">Valor a Transferir</p>
          <div className="bg-white rounded-xl px-4 py-3 border border-amber-300">
            <span className="text-2xl font-bold text-gray-900">€{amount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 rounded-xl p-4 mb-5 border border-amber-200">
        <div className="flex items-start gap-2">
          <i className="ri-error-warning-line text-amber-600 mt-0.5"></i>
          <div>
            <p className="text-sm font-medium text-amber-800">Importante</p>
            <p className="text-xs text-amber-600 mt-1">Inclui sempre a referência no descritivo da transferência para que o depósito seja processado automaticamente. Tempo estimado: 1-3 dias úteis.</p>
          </div>
        </div>
      </div>

      <button
        onClick={handleConfirm}
        disabled={loading}
        className="w-full bg-gradient-to-r from-red-600 to-red-700 text-white py-4 rounded-xl font-semibold hover:from-red-700 hover:to-red-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer shadow-lg shadow-red-300"
      >
        {loading ? (
          <>
            <i className="ri-loader-4-line animate-spin text-xl"></i>
            <span>Registando...</span>
          </>
        ) : (
          <>
            <i className="ri-check-line text-xl"></i>
            <span>Já Fiz a Transferência</span>
          </>
        )}
      </button>
    </div>
  );
}

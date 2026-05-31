import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { apiFetch } from '../../../services/backendClient';

interface MultibancoFormProps {
  amount: number;
  onSubmit: () => void;
  loading: boolean;
}

export default function MultibancoForm({ amount, onSubmit, loading: _loading }: MultibancoFormProps) {
  const { user } = useAuth();
  const [generated, setGenerated] = useState(false);
  const [generatingRef, setGeneratingRef] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState('');
  
  // ✅ Dados reais da referência Multibanco
  const [entity, setEntity] = useState('');
  const [reference, setReference] = useState('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  const handleGenerate = async () => {
    if (!user) {
      setError('Sessão expirada. Faz login para gerar a referência Multibanco.');
      return;
    }
    setGeneratingRef(true);
    setError('');

    try {
      const result = await apiFetch('/payments/multibanco/generate', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });

      // ✅ Guardar dados reais da referência
      setEntity(result.entity || '');
      setReference(result.reference || '');
      setExpiresAt(typeof result.expires_at === 'number' ? result.expires_at : null);
      setGenerated(true);
      onSubmit();

    } catch (err) {
      console.error('❌ Erro:', err);
      setError(err instanceof Error ? err.message : 'Erro ao gerar referência');
    } finally {
      setGeneratingRef(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text.replace(/\s/g, ''));
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatReference = (ref: string) => {
    // Formatar referência em grupos de 3 dígitos
    return ref.match(/.{1,3}/g)?.join(' ') || ref;
  };

  if (!user) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-xl text-center">
        <i className="ri-lock-line text-3xl text-yellow-600 mb-2"></i>
        <p className="text-sm text-yellow-800 font-medium">Inicia sessão para gerar a referência Multibanco.</p>
      </div>
    );
  }

  if (generated && !generatingRef) {
    return (
      <div>
        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-atm-line text-4xl text-teal-600"></i>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Referência Multibanco Gerada</h3>
          <p className="text-sm text-gray-500">Usa estes dados para pagar num ATM ou homebanking</p>
        </div>

        {/* Referência Card */}
        <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 rounded-2xl p-6 mb-5 border border-teal-200">
          {/* Entidade */}
          <div className="mb-5">
            <p className="text-xs text-teal-600 font-medium uppercase tracking-wider mb-1">Entidade</p>
            <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-teal-200">
              <span className="text-2xl font-bold font-mono text-gray-900 tracking-wider">{entity}</span>
              <button
                onClick={() => copyToClipboard(entity, 'entity')}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-teal-50 hover:bg-teal-100 transition-colors cursor-pointer"
              >
                <i className={`${copied === 'entity' ? 'ri-check-line text-teal-600' : 'ri-file-copy-line text-teal-500'} text-lg`}></i>
              </button>
            </div>
          </div>

          {/* Referência */}
          <div className="mb-5">
            <p className="text-xs text-teal-600 font-medium uppercase tracking-wider mb-1">Referência</p>
            <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-teal-200">
              <span className="text-2xl font-bold font-mono text-gray-900 tracking-wider">{formatReference(reference)}</span>
              <button
                onClick={() => copyToClipboard(reference, 'reference')}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-teal-50 hover:bg-teal-100 transition-colors cursor-pointer"
              >
                <i className={`${copied === 'reference' ? 'ri-check-line text-teal-600' : 'ri-file-copy-line text-teal-500'} text-lg`}></i>
              </button>
            </div>
          </div>

          {/* Valor */}
          <div>
            <p className="text-xs text-teal-600 font-medium uppercase tracking-wider mb-1">Valor</p>
            <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-teal-200">
              <span className="text-2xl font-bold font-mono text-gray-900">€{amount.toFixed(2)}</span>
              <button
                onClick={() => copyToClipboard(amount.toFixed(2), 'amount')}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-teal-50 hover:bg-teal-100 transition-colors cursor-pointer"
              >
                <i className={`${copied === 'amount' ? 'ri-check-line text-teal-600' : 'ri-file-copy-line text-teal-500'} text-lg`}></i>
              </button>
            </div>
          </div>
        </div>

        {/* Instruções */}
        <div className="bg-amber-50 rounded-xl p-4 mb-4 border border-amber-200">
          <div className="flex items-start gap-2">
            <i className="ri-timer-line text-amber-600 mt-0.5"></i>
            <div>
              <p className="text-sm font-medium text-amber-800">
                Referência válida até {expiresAt ? new Date(expiresAt * 1000).toLocaleDateString('pt-PT') : '24 horas'}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Após efetuares o pagamento, o saldo será creditado quando o pagamento for confirmado no sistema.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2 text-sm text-gray-600">
          <p className="font-medium text-gray-800 mb-2">Como pagar:</p>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-teal-100 text-teal-700 text-xs font-bold shrink-0">1</span>
            <span>Acede ao teu homebanking ou vai a um ATM Multibanco</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-teal-100 text-teal-700 text-xs font-bold shrink-0">2</span>
            <span>Seleciona &quot;Pagamentos de Serviços&quot;</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-teal-100 text-teal-700 text-xs font-bold shrink-0">3</span>
            <span>Insere a Entidade, Referência e Valor</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-teal-100 text-teal-700 text-xs font-bold shrink-0">4</span>
            <span>Confirma o pagamento</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
          <i className="ri-error-warning-line text-red-500 text-lg flex-shrink-0"></i>
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-teal-50 rounded-xl p-4 mb-5 flex items-start gap-3">
        <i className="ri-information-line text-teal-600 text-lg mt-0.5"></i>
        <div>
          <p className="text-sm text-teal-800 font-medium">Como funciona o Multibanco?</p>
          <p className="text-xs text-teal-600 mt-1">
            Será gerada uma referência de pagamento que podes usar em qualquer ATM Multibanco ou no teu homebanking. O saldo é creditado depois de o pagamento ser confirmado no sistema.
          </p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl p-5 mb-5 text-center">
        <i className="ri-atm-line text-5xl text-teal-500 mb-3"></i>
        <p className="text-sm text-gray-600 mb-1">Valor do depósito</p>
        <p className="text-3xl font-bold text-gray-900">€{amount.toFixed(2)}</p>
      </div>

      <button
        onClick={handleGenerate}
        disabled={generatingRef}
        className="w-full bg-gradient-to-r from-teal-500 to-teal-600 text-white py-4 rounded-xl font-semibold hover:from-teal-600 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer shadow-lg shadow-teal-200"
      >
        {generatingRef ? (
          <>
            <i className="ri-loader-4-line animate-spin text-xl"></i>
            <span>A gerar referência...</span>
          </>
        ) : (
          <>
            <i className="ri-qr-code-line text-xl"></i>
            <span>Gerar Referência Multibanco</span>
          </>
        )}
      </button>
    </div>
  );
}

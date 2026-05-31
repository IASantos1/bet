import { useState, type ChangeEvent } from "react";
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';

const QUICK_AMOUNTS = [10, 25, 50, 100, 200, 500];

type Method = 'mbway' | 'multibanco';

const MBWayForm = ({ amount, onSuccess }: { amount: number; onSuccess: () => void }) => {
  const { addNotification, darkMode } = useApp();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 9) {
      setError('Insere um número de telemóvel válido (9 dígitos)');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const formattedPhone = phone.startsWith('+351') ? phone : `+351${phone.replace(/\s/g, '')}`;
      await apiFetch('/api/wallet/deposit/mbway', {
        method: 'POST',
        body: JSON.stringify({ amount, phone: formattedPhone })
      });
      setSent(true);
      addNotification({ type: 'success', message: '📱 Pedido MBway enviado! Confirma na tua app.' });
      onSuccess();
    } catch (err: any) {
      const msg = String(err?.message || '');
      setError(/401|Unauthorized/i.test(msg) ? 'Sessão expirada. Faz login novamente.' : msg || 'Erro ao processar MBway');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center py-6">
        <div className="text-4xl mb-3">📱</div>
        <p className="font-bold text-green-400 text-lg">Pedido enviado!</p>
        <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Abre a tua app MBway e confirma o pagamento de €{amount.toFixed(2)}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Número de Telemóvel</label>
        <div className="flex gap-2">
          <span className={`flex items-center px-3 rounded-l-lg border border-r-0 text-sm font-medium ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-100 border-gray-300 text-gray-700'}`}>🇵🇹 +351</span>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
            maxLength={9}
            placeholder="912 345 678"
            className={`flex-1 p-3 rounded-r-lg border outline-none focus:ring-2 focus:ring-red-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
          />
        </div>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
      >
        {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> A enviar...</> : `📱 Pagar €${amount.toFixed(2)} via MBway`}
      </button>
      <p className={`text-xs text-center ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Receberás uma notificação na tua app MBway para confirmar</p>
    </form>
  );
};

type MultibancoRef = {
  entity: string;
  reference: string;
  amount: number;
  expiresAt: number | null;
  paymentIntentId: string;
};

const MultibancoForm = ({ amount, onSuccess }: { amount: number; onSuccess: () => void }) => {
  const { addNotification, darkMode, user } = useApp();
  const [email, setEmail] = useState((user as any)?.email || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ref, setRef] = useState<MultibancoRef | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Email inválido');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{
        status: string;
        paymentIntentId: string;
        entity: string | null;
        reference: string | null;
        amount: number;
        expiresAt: number | null;
      }>('/api/wallet/deposit/multibanco', {
        method: 'POST',
        body: JSON.stringify({ amount, email })
      });
      if (!res.entity || !res.reference) {
        throw new Error('Não foi possível gerar a referência. Tenta novamente.');
      }
      setRef({
        entity: res.entity,
        reference: res.reference,
        amount: res.amount,
        expiresAt: res.expiresAt,
        paymentIntentId: res.paymentIntentId,
      });
      addNotification({ type: 'success', message: '🏦 Referência Multibanco gerada!' });
    } catch (err: any) {
      const msg = String(err?.message || '');
      setError(/401|Unauthorized/i.test(msg) ? 'Sessão expirada. Faz login novamente.' : msg || 'Erro ao gerar referência Multibanco');
    } finally {
      setLoading(false);
    }
  };

  const copy = (val: string, key: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(val.replace(/\s/g, ''));
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }
  };

  if (ref) {
    const formatRef = (r: string) => r.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
    const expiresStr = ref.expiresAt
      ? new Date(ref.expiresAt * 1000).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '3 dias';

    return (
      <div className="space-y-4">
        <div className={`rounded-xl p-4 border-2 ${darkMode ? 'bg-blue-900/20 border-blue-700' : 'bg-blue-50 border-blue-300'}`}>
          <div className="flex items-center gap-2 mb-3">
            <svg viewBox="0 0 48 20" width="48" height="20" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="20" rx="4" fill="#003b95"/>
              <text x="4" y="14" fontSize="9" fill="#fff" fontFamily="Arial" fontWeight="bold">Multibanco</text>
            </svg>
            <span className={`font-bold ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>Referência gerada</span>
          </div>
          <div className="space-y-2.5">
            <div>
              <p className={`text-xs uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Entidade</p>
              <div className="flex items-center justify-between gap-2">
                <code className={`text-2xl font-mono font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{ref.entity}</code>
                <button type="button" onClick={() => copy(ref.entity, 'entity')} className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-white hover:bg-gray-100 text-gray-700 border'}`}>
                  {copied === 'entity' ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
            <div>
              <p className={`text-xs uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Referência</p>
              <div className="flex items-center justify-between gap-2">
                <code className={`text-xl font-mono font-bold tracking-wider ${darkMode ? 'text-white' : 'text-gray-900'}`}>{formatRef(ref.reference)}</code>
                <button type="button" onClick={() => copy(ref.reference, 'ref')} className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-white hover:bg-gray-100 text-gray-700 border'}`}>
                  {copied === 'ref' ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
            <div>
              <p className={`text-xs uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Valor</p>
              <code className={`text-xl font-mono font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>€ {ref.amount.toFixed(2)}</code>
            </div>
            <div className={`text-xs pt-2 border-t ${darkMode ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-600'}`}>
              ⏱ Válido até <strong>{expiresStr}</strong>
            </div>
          </div>
        </div>
        <div className={`rounded-lg p-3 text-xs ${darkMode ? 'bg-gray-700/50 text-gray-300' : 'bg-gray-50 text-gray-700'}`}>
          <p className="font-semibold mb-1">Como pagar:</p>
          <ul className="space-y-0.5 ml-3">
            <li>• Caixa ATM → Pagamentos → Outros Serviços</li>
            <li>• Homebanking → Pagamentos → Serviços</li>
            <li>• Crédito automático após confirmação</li>
          </ul>
        </div>
        <button type="button" onClick={onSuccess} className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-colors">
          ✅ Concluído
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className={`p-4 rounded-xl border ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-blue-50 border-blue-200'}`}>
        <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Vais receber uma <strong>referência Multibanco</strong> aqui mesmo, para pagar em qualquer caixa ATM ou homebanking.</p>
        <ul className={`mt-2 text-xs space-y-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <li>• Pagamento válido por 3 dias</li>
          <li>• Crédito automático após confirmação</li>
          <li>• Sem taxas adicionais</li>
        </ul>
      </div>
      <div>
        <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Email para confirmação</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="o-teu@email.pt"
          className={`w-full p-3 rounded-lg border outline-none focus:ring-2 focus:ring-red-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
        />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
      >
        {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> A gerar...</> : `🏦 Gerar Referência €${amount.toFixed(2)}`}
      </button>
    </form>
  );
};

export default function DepositPage() {
  const { darkMode, user, openAuthModal } = useApp();
  const [amount, setAmount] = useState("25");
  const [amountError, setAmountError] = useState("");
  const [method, setMethod] = useState<Method>('mbway');
  const [success, setSuccess] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const isAdmin = !!(user as any)?.is_operator;
  const minDeposit = isAdmin ? 0.5 : 10;

  const handleAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAmount(val);
    setAmountError(parseFloat(val) < minDeposit ? `Valor mínimo: €${minDeposit.toFixed(2)}` : "");
  };

  const handleQuickAmount = (val: number) => {
    setAmount(String(val));
    setAmountError('');
  };

  const handleSuccess = () => setSuccess(true);

  const PaymentLogo = ({ method: m }: { method: Method }) => {
    if (m === 'mbway') return (
      <svg viewBox="0 0 60 24" width="50" height="20" xmlns="http://www.w3.org/2000/svg">
        <rect width="60" height="24" rx="4" fill="#E30613"/>
        <text x="30" y="16" textAnchor="middle" fontSize="10" fill="#fff" fontFamily="'Arial Black','Helvetica Neue',sans-serif" fontWeight="900" letterSpacing="0.5">MB WAY</text>
      </svg>
    );
    if (m === 'multibanco') return (
      <svg viewBox="0 0 70 24" width="58" height="20" xmlns="http://www.w3.org/2000/svg">
        <rect width="70" height="24" rx="4" fill="#fff" stroke="#e5e7eb"/>
        <rect x="2" y="2" width="20" height="20" rx="2" fill="#004C9B"/>
        <text x="12" y="17" textAnchor="middle" fontSize="11" fill="#fff" fontFamily="'Arial Black','Helvetica Neue',sans-serif" fontWeight="900">MB</text>
        <text x="46" y="11" textAnchor="middle" fontSize="6" fill="#004C9B" fontFamily="Arial,sans-serif" fontWeight="700">MULTI</text>
        <text x="46" y="19" textAnchor="middle" fontSize="6" fill="#004C9B" fontFamily="Arial,sans-serif" fontWeight="700">BANCO</text>
      </svg>
    );
    return null;
  };

  const methodTabs: { key: Method; label: string }[] = [
    { key: 'mbway', label: 'MBway' },
    { key: 'multibanco', label: 'Multibanco' },
  ];

  if (!user) {
    return (
      <div className={`max-w-md mx-auto text-center py-16 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
        <div className="text-5xl mb-4">🔐</div>
        <h2 className="text-xl font-bold mb-2">Sessão necessária</h2>
        <p className={`text-sm mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tens de iniciar sessão para fazer um depósito.</p>
        <button
          onClick={() => openAuthModal('login')}
          className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition-colors"
        >
          Entrar na conta
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center py-10 max-w-md mx-auto">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-green-400 mb-2">Depósito Iniciado!</h2>
        <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>O teu saldo será atualizado assim que o pagamento for confirmado.</p>
        <div className={`rounded-xl p-4 mb-6 text-left border ${darkMode ? 'bg-yellow-900/20 border-yellow-700/40' : 'bg-yellow-50 border-yellow-300'}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🎁</span>
            <span className={`font-bold text-sm ${darkMode ? 'text-yellow-300' : 'text-yellow-800'}`}>Promoções Ativadas!</span>
          </div>
          <p className={`text-xs ${darkMode ? 'text-yellow-200/80' : 'text-yellow-700'}`}>
            Todas as promoções elegíveis foram ativadas automaticamente com este depósito, de acordo com os Termos e Condições de cada uma. Consulta a página de Promoções para ver os bónus disponíveis.
          </p>
        </div>
        <button onClick={() => setSuccess(false)} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl">Novo Depósito</button>
      </div>
    );
  }

  return (
    <div className={`max-w-md mx-auto ${darkMode ? 'text-white' : 'text-gray-900'}`}>
      <h2 className="text-xl font-bold mb-4 text-center">💰 Depositar</h2>

      <div className={`p-4 rounded-xl shadow mb-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Valor do Depósito (€)</label>
        <input
          type="number"
          value={amount}
          onChange={handleAmountChange}
          min="10"
          step="5"
          className={`w-full p-3 rounded-lg border focus:ring-2 focus:ring-red-500 outline-none text-lg font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'} ${amountError ? 'border-red-500' : ''}`}
          placeholder="25"
        />
        {amountError && <p className="text-red-500 text-xs mt-1">{amountError}</p>}
        <div className="grid grid-cols-3 gap-2 mt-3">
          {QUICK_AMOUNTS.map(v => (
            <button
              key={v}
              onClick={() => handleQuickAmount(v)}
              className={`py-1.5 rounded-lg text-sm font-semibold transition-colors ${numAmount === v ? 'bg-red-600 text-white' : darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
            >
              €{v}
            </button>
          ))}
        </div>
      </div>

      <div className={`rounded-xl shadow overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="grid grid-cols-3 border-b border-gray-700">
          {methodTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setMethod(tab.key)}
              className={`py-2.5 flex flex-col items-center gap-1 text-xs font-semibold transition-colors ${method === tab.key ? 'text-red-500 border-b-2 border-red-500 bg-red-500/10' : darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <PaymentLogo method={tab.key} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="p-4">
          {numAmount < minDeposit ? (
            <p className="text-center text-gray-500 text-sm py-4">Seleciona um valor mínimo de €{minDeposit.toFixed(2)}</p>
          ) : (
            <>
              {method === 'mbway' && <MBWayForm amount={numAmount} onSuccess={handleSuccess} />}
              {method === 'multibanco' && <MultibancoForm amount={numAmount} onSuccess={handleSuccess} />}
            </>
          )}
        </div>
      </div>

      <p className={`text-center text-xs mt-4 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>🔒 Todos os pagamentos são processados com encriptação SSL</p>
    </div>
  );
}

import { useState, useEffect, useMemo, useRef } from 'react';
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';
import { DepositWithdrawTabs } from '@/react-app/components/DepositWithdrawTabs';

// Mirrors DepositMethod in server/lib/stripePayments.ts — kept as a plain literal union here
// rather than a cross-boundary import, since that file also pulls in the server-only `stripe` npm
// package (not meant for the browser bundle).
type DepositMethod = 'card' | 'mb_way' | 'multibanco';

const QUICK_AMOUNTS = [10, 25, 50, 100, 200, 500];
const MIN_DEPOSIT = 10;

const METHODS: { key: DepositMethod; label: string }[] = [
  { key: 'mb_way', label: 'MB WAY' },
  { key: 'card', label: 'Cartão' },
  { key: 'multibanco', label: 'Multibanco' },
];

function MethodLogo({ method }: { method: DepositMethod }) {
  if (method === 'mb_way') {
    return (
      <svg viewBox="0 0 60 24" width="50" height="20" xmlns="http://www.w3.org/2000/svg">
        <rect width="60" height="24" rx="4" fill="#E30613" />
        <text x="30" y="16" textAnchor="middle" fontSize="10" fill="#fff" fontFamily="'Arial Black','Helvetica Neue',sans-serif" fontWeight="900" letterSpacing="0.5">
          MB WAY
        </text>
      </svg>
    );
  }
  if (method === 'multibanco') {
    return (
      <svg viewBox="0 0 70 24" width="58" height="20" xmlns="http://www.w3.org/2000/svg">
        <rect width="70" height="24" rx="4" fill="#fff" stroke="#e5e7eb" />
        <rect x="2" y="2" width="20" height="20" rx="2" fill="#004C9B" />
        <text x="12" y="17" textAnchor="middle" fontSize="11" fill="#fff" fontFamily="'Arial Black','Helvetica Neue',sans-serif" fontWeight="900">
          MB
        </text>
        <text x="46" y="11" textAnchor="middle" fontSize="6" fill="#004C9B" fontFamily="Arial,sans-serif" fontWeight="700">
          MULTI
        </text>
        <text x="46" y="19" textAnchor="middle" fontSize="6" fill="#004C9B" fontFamily="Arial,sans-serif" fontWeight="700">
          BANCO
        </text>
      </svg>
    );
  }
  // Card: generic Visa/Mastercard-style dual-circle mark, since a real deposit can land on either
  // network — the embedded Payment Element shows the actual card brand once the number is typed.
  return (
    <svg viewBox="0 0 40 24" width="36" height="20" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="24" rx="4" fill="#1f2937" />
      <circle cx="16" cy="12" r="7" fill="#EB001B" opacity="0.9" />
      <circle cx="24" cy="12" r="7" fill="#F79E1B" opacity="0.9" />
    </svg>
  );
}

let stripePromise: Promise<StripeJs | null> | null = null;
function getStripePromise(publishableKey: string) {
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

/** Renders inside <Elements>: the embedded Payment Element (card fields, or an MB WAY phone
 *  number — Stripe.js has no standalone confirm call for MB WAY, the phone field only exists
 *  through this widget) plus the "Pagar" button. The PaymentIntent behind it is created
 *  automatically in the background as soon as an amount+method are picked (see PaymentsPage),
 *  so this mounts with fields already visible instead of waiting for an extra "Continuar" tap.
 *  Confirming never leaves this page except for the rare case Stripe truly requires a redirect
 *  (e.g. a 3D Secure bank challenge on some cards) — `redirect: 'if_required'` skips it for
 *  everything else, including MB WAY (waits in place for the app approval). */
function EmbeddedPaymentForm({
  method,
  amount,
  email,
  paymentIntentId,
  onDone,
}: {
  method: 'card' | 'mb_way';
  amount: number;
  email: string;
  paymentIntentId: string;
  onDone: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const pollUntilSettled = () => {
    setPending(true);
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<{ status: string }>(`/api/wallet/deposit/stripe/status?payment_intent_id=${encodeURIComponent(paymentIntentId)}`);
        if (res.status === 'succeeded') {
          if (pollRef.current) clearInterval(pollRef.current);
          onDone();
        } else if (res.status === 'canceled' || res.status === 'requires_payment_method') {
          if (pollRef.current) clearInterval(pollRef.current);
          setPending(false);
          setError('O pagamento não foi confirmado. Tente novamente.');
        }
      } catch {
        // transient — keep polling, the button below still lets the user check manually later
      }
    }, 3000);
  };

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError('');
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/deposit-success`,
        payment_method_data: { billing_details: { email } },
      },
      redirect: 'if_required',
    });
    setSubmitting(false);
    if (confirmError) {
      setError(confirmError.message || 'Não foi possível confirmar o pagamento.');
      return;
    }
    if (paymentIntent?.status === 'succeeded') {
      onDone();
    } else {
      // 'processing' — MB WAY waiting for app approval. The wallet only credits once the webhook
      // confirms it; poll status meanwhile so the UI updates itself instead of leaving the user
      // staring at a stuck button.
      pollUntilSettled();
    }
  };

  if (pending) {
    return (
      <div className="text-center py-6 space-y-3">
        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="font-bold">A aguardar confirmação…</p>
        <p className="text-sm opacity-70">
          {method === 'mb_way' ? 'Aprove o pagamento na sua aplicação MB WAY.' : 'A confirmar pagamento…'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ fields: { billingDetails: { email: 'never' } }, defaultValues: { billingDetails: { email } } }} />
      {error && <p className="text-red-500 text-xs">{error}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !stripe || !elements}
        className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> A processar...
          </>
        ) : (
          `Pagar €${amount.toFixed(2)}`
        )}
      </button>
    </div>
  );
}

interface MultibancoVoucher {
  entity: string;
  reference: string;
  amount: number;
  expiresAt?: number;
}

export default function PaymentsPage() {
  const { darkMode, user, openAuthModal, addNotification } = useApp();
  const [amount, setAmount] = useState('25');
  const [committedAmount, setCommittedAmount] = useState(25);
  const [amountError, setAmountError] = useState('');
  const [method, setMethod] = useState<DepositMethod>('mb_way');
  const [publishableKey, setPublishableKey] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);

  // The PaymentIntent behind whichever method/amount is currently selected — (re)created
  // automatically in the background (see effect below) so the actual input fields (card number,
  // MB WAY phone) show up right under the method tabs without an extra "Continuar" step first.
  const [intent, setIntent] = useState<{ clientSecret: string; paymentIntentId: string; amount: number; method: DepositMethod; email: string } | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [intentError, setIntentError] = useState('');
  const [done, setDone] = useState(false);

  // Multibanco has no fields to fill in — the referência is generated the moment the user asks
  // for it, shown right on the page with copy buttons (bypassing Stripe's own voucher popup,
  // which — like the casino iframe before this fix — was liable to render behind the app's
  // page-transition wrapper and never actually appear to the user).
  const [mbResult, setMbResult] = useState<MultibancoVoucher | null>(null);
  const [mbConfirming, setMbConfirming] = useState(false);
  const [mbError, setMbError] = useState('');
  const [mbPending, setMbPending] = useState(false);
  const mbPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const numAmount = parseFloat(amount) || 0;

  useEffect(() => {
    apiFetch<{ configured: boolean; publishableKey: string }>('/api/wallet/stripe/config')
      .then((res) => setPublishableKey(res.publishableKey || ''))
      .catch(() => setPublishableKey(''))
      .finally(() => setConfigLoaded(true));
  }, []);

  useEffect(() => () => {
    if (mbPollRef.current) clearInterval(mbPollRef.current);
  }, []);

  const stripePromiseMemo = useMemo(() => (publishableKey ? getStripePromise(publishableKey) : null), [publishableKey]);

  const commitAmount = () => {
    const n = parseFloat(amount) || 0;
    if (n < MIN_DEPOSIT) {
      setAmountError(`Valor mínimo: €${MIN_DEPOSIT.toFixed(2)}`);
      return;
    }
    setAmountError('');
    setCommittedAmount(n);
  };

  const handleQuickAmount = (v: number) => {
    setAmount(String(v));
    setAmountError('');
    setCommittedAmount(v);
  };

  const resetMultibanco = () => {
    if (mbPollRef.current) { clearInterval(mbPollRef.current); mbPollRef.current = null; }
    setMbResult(null);
    setMbPending(false);
    setMbError('');
  };

  const handleMethodChange = (m: DepositMethod) => {
    setMethod(m);
    resetMultibanco();
  };

  // Creates (or refreshes, on amount/method change) the PaymentIntent that backs whichever method
  // is currently selected. Runs automatically — never gated behind a button click — so the actual
  // payment fields appear on their own as soon as a valid amount + method are in place.
  useEffect(() => {
    if (!user || !configLoaded || !publishableKey) return;
    if (committedAmount < MIN_DEPOSIT) return;
    if (method === 'multibanco' && mbResult) return; // voucher already generated — don't replace it under the user

    let cancelled = false;
    setCreatingIntent(true);
    setIntentError('');
    (async () => {
      try {
        const res = await apiFetch<{ client_secret: string; payment_intent_id: string; email: string }>('/api/wallet/deposit/stripe/intent', {
          method: 'POST',
          body: JSON.stringify({ amount: committedAmount, method }),
        });
        if (cancelled) return;
        setIntent({ clientSecret: res.client_secret, paymentIntentId: res.payment_intent_id, amount: committedAmount, method, email: res.email });
      } catch (err: any) {
        if (cancelled) return;
        setIntent(null);
        const msg = String(err?.message || '');
        setIntentError(/401|Unauthorized/i.test(msg) ? 'Sessão expirada. Faça login novamente.' : msg || 'Erro ao preparar o depósito');
      } finally {
        if (!cancelled) setCreatingIntent(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, configLoaded, publishableKey, committedAmount, method]);

  const handleDone = () => {
    if (mbPollRef.current) { clearInterval(mbPollRef.current); mbPollRef.current = null; }
    setDone(true);
    addNotification({ type: 'success', message: 'Depósito confirmado! O saldo será atualizado em instantes.' });
  };

  const startMbPolling = (paymentIntentId: string) => {
    setMbPending(true);
    mbPollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<{ status: string }>(`/api/wallet/deposit/stripe/status?payment_intent_id=${encodeURIComponent(paymentIntentId)}`);
        if (res.status === 'succeeded') {
          if (mbPollRef.current) clearInterval(mbPollRef.current);
          handleDone();
        } else if (res.status === 'canceled') {
          if (mbPollRef.current) clearInterval(mbPollRef.current);
          setMbPending(false);
          setMbError('A referência expirou sem pagamento. Gere uma nova referência.');
        }
      } catch {
        // transient — keep polling
      }
    }, 5000);
  };

  const handleGenerateMultibanco = async () => {
    if (!intent || intent.method !== 'multibanco' || !stripePromiseMemo) return;
    setMbConfirming(true);
    setMbError('');
    try {
      const stripe = await stripePromiseMemo;
      if (!stripe) throw new Error('Stripe indisponível');
      const result = await stripe.confirmMultibancoPayment(
        intent.clientSecret,
        { payment_method: { billing_details: { email: intent.email, name: (user as any)?.username || undefined } } },
        { handleActions: false },
      );
      if (result.error) {
        setMbError(result.error.message || 'Não foi possível gerar a referência Multibanco.');
        return;
      }
      const details = (result.paymentIntent as any)?.next_action?.multibanco_display_details;
      if (!details?.entity || !details?.reference) {
        setMbError('Não foi possível obter a referência Multibanco.');
        return;
      }
      setMbResult({
        entity: String(details.entity),
        reference: String(details.reference),
        amount: intent.amount,
        expiresAt: details.expires_at ? Number(details.expires_at) * 1000 : undefined,
      });
      startMbPolling(intent.paymentIntentId);
    } catch (err: any) {
      setMbError(err?.message || 'Erro ao gerar referência Multibanco');
    } finally {
      setMbConfirming(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addNotification({ type: 'success', message: `${label} copiado` });
    } catch {
      addNotification({ type: 'error', message: 'Não foi possível copiar' });
    }
  };

  if (!user) {
    return (
      <div className={`max-w-md mx-auto text-center py-16 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
        <div className="text-5xl mb-4">🔐</div>
        <h2 className="text-xl font-bold mb-2">Sessão necessária</h2>
        <p className={`text-sm mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tem de iniciar sessão para fazer um depósito.</p>
        <button
          onClick={() => openAuthModal('login')}
          className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition-colors"
        >
          Entrar na conta
        </button>
      </div>
    );
  }

  const cardBg = darkMode ? 'bg-gray-800' : 'bg-white';

  return (
    <div className={`min-h-screen p-4 md:p-8 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className={`max-w-md mx-auto rounded-2xl shadow-xl overflow-hidden ${cardBg}`}>
        <DepositWithdrawTabs active="deposit" />
        <h2 className="text-xl font-bold text-center pt-6">💰 Depositar</h2>

        {done ? (
          <div className="p-6 text-center space-y-3">
            <div className="text-5xl">✅</div>
            <p className="font-bold text-green-500">Depósito confirmado!</p>
            <p className="text-sm opacity-70">O seu saldo será atualizado em instantes.</p>
            <button
              type="button"
              onClick={() => {
                setDone(false);
                setIntent(null);
                resetMultibanco();
              }}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl"
            >
              Novo Depósito
            </button>
          </div>
        ) : configLoaded && !publishableKey ? (
          <div className="p-8 text-center text-sm opacity-70">Depósitos indisponíveis de momento.</div>
        ) : (
          <>
            <div className="p-6 pb-4">
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Valor do Depósito (€)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setAmountError('');
                }}
                onBlur={commitAmount}
                min={MIN_DEPOSIT}
                step="5"
                className={`w-full p-3 rounded-lg border focus:ring-2 focus:ring-red-500 outline-none text-lg font-bold ${
                  darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'
                } ${amountError ? 'border-red-500' : ''}`}
                placeholder="25"
              />
              {amountError && <p className="text-red-500 text-xs mt-1">{amountError}</p>}
              <div className="grid grid-cols-3 gap-2 mt-3">
                {QUICK_AMOUNTS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleQuickAmount(v)}
                    className={`py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                      numAmount === v ? 'bg-red-600 text-white' : darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    €{v}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 border-t border-b border-gray-700/20">
              {METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => handleMethodChange(m.key)}
                  className={`py-2.5 flex flex-col items-center gap-1 text-xs font-semibold transition-colors ${
                    method === m.key ? 'text-red-500 border-b-2 border-red-500 bg-red-500/10' : darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <MethodLogo method={m.key} />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            {/* Dynamic fields — the phone/card inputs (or the Multibanco voucher) render right
               here, between the method tabs and the action button, as soon as they're ready. */}
            <div className="p-6 space-y-4">
              {intentError && <p className="text-red-500 text-xs">{intentError}</p>}

              {method === 'multibanco' ? (
                mbResult ? (
                  <div className="space-y-3">
                    <div className={`rounded-xl border-2 border-dashed p-4 space-y-3 ${darkMode ? 'border-red-500/40 bg-gray-900/40' : 'border-red-300 bg-red-50/40'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold opacity-70">ENTIDADE</span>
                        <button type="button" onClick={() => copyText(mbResult.entity, 'Entidade')} className="text-xs font-bold text-red-500 hover:text-red-600">
                          Copiar
                        </button>
                      </div>
                      <p className="text-2xl font-black tracking-widest">{mbResult.entity}</p>
                      <div className={`flex items-center justify-between pt-2 border-t border-dashed ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                        <span className="text-xs font-semibold opacity-70">REFERÊNCIA</span>
                        <button type="button" onClick={() => copyText(mbResult.reference, 'Referência')} className="text-xs font-bold text-red-500 hover:text-red-600">
                          Copiar
                        </button>
                      </div>
                      <p className="text-2xl font-black tracking-widest">{mbResult.reference}</p>
                      <div className={`flex items-center justify-between pt-2 border-t border-dashed ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                        <span className="text-xs font-semibold opacity-70">VALOR</span>
                        <span className="font-bold">€{mbResult.amount.toFixed(2)}</span>
                      </div>
                    </div>
                    {mbPending && (
                      <div className="text-center py-1 space-y-2">
                        <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs opacity-70">A aguardar pagamento da referência…</p>
                      </div>
                    )}
                    {mbError && <p className="text-red-500 text-xs text-center">{mbError}</p>}
                    <button type="button" onClick={resetMultibanco} className="w-full text-xs opacity-60 hover:opacity-100 underline text-center">
                      Gerar nova referência
                    </button>
                  </div>
                ) : (
                  <>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Ao gerar a referência, a entidade e o número aparecem aqui mesmo, prontos a copiar — sem sair do BET62.
                    </p>
                    {mbError && <p className="text-red-500 text-xs">{mbError}</p>}
                    <button
                      type="button"
                      onClick={handleGenerateMultibanco}
                      disabled={mbConfirming || creatingIntent || !intent}
                      className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      {mbConfirming ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> A gerar referência...
                        </>
                      ) : creatingIntent || !intent ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> A preparar...
                        </>
                      ) : (
                        'Gerar Referência Multibanco'
                      )}
                    </button>
                  </>
                )
              ) : creatingIntent || !intent || !stripePromiseMemo ? (
                <div className="py-6 text-center text-sm opacity-60">
                  <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  A preparar campos de pagamento…
                </div>
              ) : (
                <Elements
                  key={intent.clientSecret}
                  stripe={stripePromiseMemo}
                  options={{
                    clientSecret: intent.clientSecret,
                    locale: 'pt',
                    // Stripe's PaymentElement defaults to its own generic light/blue styling —
                    // without this it renders as a visibly foreign white widget dropped into
                    // BET62's dark red theme. Match our actual palette instead.
                    appearance: {
                      theme: darkMode ? 'night' : 'stripe',
                      variables: {
                        colorPrimary: '#dc2626',
                        colorBackground: darkMode ? '#1f2937' : '#ffffff',
                        colorText: darkMode ? '#f9fafb' : '#111827',
                        colorDanger: '#ef4444',
                        fontFamily: 'inherit',
                        borderRadius: '12px',
                        spacingUnit: '4px',
                      },
                      rules: {
                        '.Input': {
                          border: darkMode ? '1px solid #4b5563' : '1px solid #d1d5db',
                          backgroundColor: darkMode ? '#374151' : '#f9fafb',
                        },
                        '.Tab': {
                          border: darkMode ? '1px solid #4b5563' : '1px solid #d1d5db',
                          backgroundColor: darkMode ? '#374151' : '#f9fafb',
                        },
                        '.Tab--selected': {
                          borderColor: '#dc2626',
                          backgroundColor: darkMode ? '#374151' : '#ffffff',
                        },
                      },
                    },
                  }}
                >
                  <EmbeddedPaymentForm
                    method={intent.method as 'card' | 'mb_way'}
                    amount={intent.amount}
                    email={intent.email}
                    paymentIntentId={intent.paymentIntentId}
                    onDone={handleDone}
                  />
                </Elements>
              )}

              <p className={`text-center text-xs ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>🔒 Pagamento seguro processado pela Stripe, sem sair do BET62.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useApp } from '@/react-app/contexts/AppContext';

export default function CheckoutForm({ method, clientSecret: _clientSecret }: { method?: 'card'|'sepa_debit'|'mb_way'|'customer_balance'; clientSecret?: string }) {
  const { darkMode } = useApp();
  const [message] = useState<string | null>(null);

  return (
    <div className={`p-4 rounded-xl border text-center ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
      {message ? (
        <p className="text-sm">{message}</p>
      ) : (
        <p className="text-sm">
          {method === 'mb_way' ? 'MB WAY' : method === 'sepa_debit' ? 'SEPA' : 'Pagamento'} — processamento em curso
        </p>
      )}
    </div>
  );
}

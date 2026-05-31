import { useEffect, useState } from 'react';
import { useAuth } from '@/react-app/contexts/AuthContext';
import { apiFetch } from '@/react-app/utils/api';

type Props = {
  mode: 'setup' | 'login';
  userId?: string;
  onSuccess: () => void;
  onCancel?: () => void;
};

export function TwoFactor({ mode, userId, onSuccess, onCancel }: Props) {
  const { refreshUser } = useAuth();

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ================================
     SETUP — LOAD QR CODE
  ================================= */
  useEffect(() => {
    if (mode !== 'setup') return;

    const ac = new AbortController();

    apiFetch<any>('/api/auth/2fa/setup', {
      method: 'POST',
      signal: ac.signal,
    })
      .then((d) => {
        if (d.success) setQrCode(d.qrCode);
      })
      .catch(() => {});

    return () => ac.abort();
  }, [mode]);

  /* ================================
     CONFIRM CODE
  ================================= */
  const confirm = async () => {
    if (!/^\d{6}$/.test(token)) {
      setError('Código inválido');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url =
        mode === 'setup'
          ? '/api/auth/2fa/confirm'
          : '/api/auth/2fa/login';

      const body =
        mode === 'setup'
          ? { token }
          : { token, userId };

      const data = await apiFetch<any>(url, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!data.success) {
        setError('Código incorreto');
        return;
      }

      if (data.token) localStorage.setItem('auth_token', data.token);
      if (data.refreshToken) localStorage.setItem('refresh_token', data.refreshToken);

      await refreshUser();
      onSuccess();
    } catch {
      setError('Erro ao validar código');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm p-6 rounded-xl bg-white dark:bg-gray-900 shadow-lg">
      <h2 className="text-xl font-bold mb-4 text-center dark:text-white text-gray-900">
        {mode === 'setup' ? 'Ativar 2FA' : 'Autenticação 2FA'}
      </h2>

      {mode === 'setup' && qrCode && (
        <div className="flex flex-col items-center mb-4">
          <img src={qrCode} alt="QR Code 2FA" className="w-40 h-40" />
          <p className="text-sm text-gray-500 mt-2 text-center">
            Digitalize com Google Authenticator
          </p>
        </div>
      )}

      <input
        type="text"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="000000"
        maxLength={6}
        className="w-full px-4 py-2 mb-3 rounded-lg border dark:bg-gray-800 dark:text-white dark:border-gray-700"
      />

      {error && (
        <div className="text-red-500 text-sm mb-3 text-center">
          {error}
        </div>
      )}

      <button
        onClick={confirm}
        disabled={loading}
        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg disabled:opacity-50"
      >
        {loading ? 'A validar...' : 'Confirmar'}
      </button>

      {onCancel && (
        <button
          onClick={onCancel}
          className="w-full mt-3 text-sm text-gray-500 hover:underline"
        >
          Cancelar
        </button>
      )}
    </div>
  );
}

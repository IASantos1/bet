import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header } from '../../components/feature/Header';
import { Footer } from '../../components/feature/Footer';
import { requestPasswordReset, resetPassword } from '../../services/backendClient';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [debugCode, setDebugCode] = useState<string | undefined>(undefined);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');
    try {
      const res = await requestPasswordReset(email.trim().toLowerCase());
      setStatus('success');
      setMessage('Código enviado. Verifique o seu email.');
      setDebugCode(res.debugCode);
      setStep('verify');
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Falha ao solicitar código');
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');
    try {
      const res = await resetPassword(email.trim().toLowerCase(), code.trim(), newPassword);
      if (res?.ok) {
        setStatus('success');
        setMessage('Senha atualizada com sucesso. Faça login.');
        setTimeout(() => navigate('/login'), 1200);
      } else {
        setStatus('error');
        setMessage('Não foi possível atualizar a senha');
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Falha ao atualizar a senha');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      <Header isLoggedIn={false} />
      <main className="flex-1 py-12 px-6">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Recuperar Senha</h1>
            <p className="text-gray-600 mb-6">
              Receba um código de verificação por email e redefina a sua palavra‑passe.
            </p>

            {step === 'request' && (
              <form onSubmit={handleRequest} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-sm"
                    placeholder="seu@email.com"
                  />
                </div>
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'loading' ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-mail-send-line"></i>}
                  <span>Enviar Código</span>
                </button>
                {debugCode && (
                  <div className="text-xs text-gray-500 mt-2">
                    Código de teste (dev): <span className="font-mono">{debugCode}</span>
                  </div>
                )}
              </form>
            )}

            {step === 'verify' && (
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Código</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    pattern="[0-9]{6}"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-sm"
                    placeholder="6 dígitos"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Nova Senha</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-sm"
                    placeholder="Mínimo 8 caracteres"
                  />
                </div>
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'loading' ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-lock-password-line"></i>}
                  <span>Redefinir Senha</span>
                </button>
              </form>
            )}

            {message && (
              <div className={`mt-4 text-sm ${status === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                {message}
              </div>
            )}

            <div className="mt-6 text-center">
              <Link to="/login" className="text-green-700 hover:text-green-800">Voltar ao Login</Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

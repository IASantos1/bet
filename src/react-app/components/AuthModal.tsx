import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/react-app/contexts/AppContext';
import { useAuth } from '@/react-app/contexts/AuthContext';
import { TwoFactor } from '@/react-app/components/TwoFactorSetup';
import { COUNTRIES } from '@/shared/constants';

type AuthMode = 'login' | 'register' | '2fa';

interface AuthModalProps {
  mode: AuthMode;
  tempUserId: string | null;
  onClose: () => void;
  onLoginSuccess: () => void;
  onRequire2FA: (userId: string) => void;
  onSwitchMode: (mode: AuthMode) => void;
}

export function AuthModal(props: AuthModalProps) {
  const {
    mode,
    tempUserId,
    onClose,
    onLoginSuccess,
    onRequire2FA,
    onSwitchMode,
  } = props;

  const { darkMode, addNotification, setShowAdminPanel } = useApp();
  const { signIn, signUp } = useAuth();

  // Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState('');
  const [country, setCountry] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn(loginEmail, loginPassword) as { success: boolean; requires2fa?: boolean; userId?: string };
      if (res.success) {
        onLoginSuccess();
        addNotification({ type: 'success', message: 'Sessão iniciada' });
      } else if (res.requires2fa && res.userId) {
        onRequire2FA(res.userId);
      } else {
        addNotification({ type: 'error', message: 'Credenciais inválidas' });
      }
    } catch {
      addNotification({ type: 'error', message: 'Erro ao tentar entrar' });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!termsAccepted) {
      addNotification({ type: 'error', message: 'Aceite os termos para continuar' });
      return;
    }

    setLoading(true);
    try {
      const ok = await signUp({
        firstName,
        lastName,
        email,
        password,
        dob,
        country
      });

      if (ok) {
        onLoginSuccess();
        addNotification({ type: 'success', message: 'Conta criada com sucesso' });
      } else {
        addNotification({ type: 'error', message: 'Erro ao criar conta' });
      }
    } catch {
      addNotification({ type: 'error', message: 'Erro ao tentar registar' });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = `w-full p-3 rounded-lg border outline-none transition-colors ${darkMode ? 'bg-gray-800 border-gray-700 text-white focus:border-red-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-red-500'}`;
  const btnClass = "w-full py-3 rounded-lg font-bold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4";
  const labelClass = `block text-xs font-bold mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">

      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative z-10 w-full max-w-md rounded-xl shadow-2xl overflow-hidden ${
          darkMode ? 'bg-[#020617] border border-gray-800 text-white' : 'bg-white text-gray-900'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {mode === '2fa' && tempUserId && (
          <TwoFactor
            mode="login"
            userId={tempUserId}
            onSuccess={() => {
              onLoginSuccess();
              addNotification({ type: 'success', message: 'Sessão iniciada' });
            }}
            onCancel={() => onSwitchMode('login')}
          />
        )}

        {mode !== '2fa' && (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-center mb-6">
              {mode === 'login' ? 'Entrar' : 'Criar Conta'}
            </h2>

            {mode === 'login' ? (
              <form onSubmit={handleSignIn} className="space-y-4" noValidate>
                <div>
                  <label className={labelClass}>USERNAME / EMAIL</label>
                  <input 
                    type="text" 
                    name="username"
                    autoComplete="username"
                    placeholder="Username ou Email" 
                    value={loginEmail} 
                    onChange={e => setLoginEmail(e.target.value)} 
                    className={inputClass} 
                    required 
                  />
                </div>
                <div>
                  <label className={labelClass}>PASSWORD</label>
                  <input 
                    type="password" 
                    placeholder="********" 
                    value={loginPassword} 
                    onChange={e => setLoginPassword(e.target.value)} 
                    className={inputClass} 
                    required 
                  />
                </div>

                <button type="submit" disabled={loading} className={btnClass}>
                  {loading ? 'A entrar...' : 'Entrar'}
                </button>

                <div className="flex justify-between text-sm mt-4 pt-4 border-t border-gray-700/50">
                  <button type="button" onClick={() => onSwitchMode('register')} className="text-green-500 font-semibold hover:underline">
                    Criar conta
                  </button>
                  <button type="button" onClick={() => { onClose(); setShowAdminPanel(true); }} className="text-gray-400 hover:text-gray-500">
                    Admin
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input 
                      type="text" 
                      placeholder="Nome próprio" 
                      value={firstName} 
                      onChange={e => setFirstName(e.target.value)} 
                      className={inputClass} 
                      required 
                    />
                  </div>
                  <div>
                    <input 
                      type="text" 
                      placeholder="Apelido" 
                      value={lastName} 
                      onChange={e => setLastName(e.target.value)} 
                      className={inputClass} 
                      required 
                    />
                  </div>
                </div>

                <input 
                  type="email" 
                  placeholder="Email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  className={inputClass} 
                  required 
                />

                <input 
                  type="password" 
                  placeholder="Password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  className={inputClass} 
                  required 
                />

                <div className="grid grid-cols-2 gap-3">
                  <input 
                    type="date" 
                    value={dob} 
                    onChange={e => setDob(e.target.value)} 
                    className={inputClass} 
                    required 
                  />
                  <select 
                    value={country} 
                    onChange={e => setCountry(e.target.value)} 
                    className={inputClass}
                    required
                  >
                    <option value="">País</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-start gap-2 text-xs text-gray-400 mt-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={termsAccepted} 
                    onChange={e => setTermsAccepted(e.target.checked)} 
                    className="mt-0.5"
                    required 
                  />
                  <span>
                    Confirmo que tenho +18 anos e aceito os Termos e Condições e a Política de Privacidade.
                  </span>
                </label>

                <button type="submit" disabled={loading} className={btnClass}>
                  {loading ? 'A criar conta...' : 'Criar Conta'}
                </button>

                <div className="text-center mt-4 pt-4 border-t border-gray-700/50">
                  <button type="button" onClick={() => onSwitchMode('login')} className="text-sm text-gray-400 hover:text-gray-500">
                    Já tem conta? <span className="text-green-500 font-semibold">Entrar</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

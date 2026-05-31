import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header } from '../../components/feature/Header';
import { Footer } from '../../components/feature/Footer';
import { useAuth } from '../../contexts/AuthContext';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    birthDate: '',
    acceptTerms: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const _navigate = useNavigate();
  const { signUp } = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    setError(null);
  };

  const _validateAge = (birthDate: string): boolean => {
    if (!birthDate) return true;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 18;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    if (formData.password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setIsSubmitting(true);

    try {
      await signUp(formData.email, formData.password, {
        full_name: formData.fullName,
        phone: formData.phone,
        birth_date: formData.birthDate || '',
      });

      setSuccess(true);
    } catch (err: any) {
      console.error('Erro no registo:', err);
      
      // Tratamento específico para rate limit de email
      if (err.message?.includes('email rate limit exceeded') || err.message?.includes('rate limit')) {
        setError('⚠️ Limite de emails atingido. Isto acontece por segurança quando muitos emails são enviados num curto período. Por favor, aguarde 1 hora e tente novamente, ou contacte o suporte se já se registou recentemente.');
      } else if (err.message?.includes('User already registered')) {
        setError('Este email já está registado. Tente fazer login ou use outro email.');
      } else if (err.message?.includes('Password should be')) {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else if (err.message?.includes('Invalid email')) {
        setError('Por favor, insira um email válido.');
      } else {
        setError(`Erro ao criar conta: ${err.message || 'Tente novamente mais tarde.'}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
        <Header isLoggedIn={false} />

        <main className="flex-1 flex items-center justify-center py-12 px-6">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 text-center">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <i className="ri-check-line text-5xl text-red-600"></i>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-3">Conta Criada com Sucesso!</h1>
              <p className="text-gray-600 mb-6">
                A sua conta foi criada. Agora já pode fazer login e começar a apostar na BET62.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center w-full py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap"
              >
                <i className="ri-login-box-line mr-2"></i>
                Ir para Login
              </Link>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      <Header isLoggedIn={false} />

      <main className="flex-1 py-12 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <i className="ri-user-add-line text-3xl text-white"></i>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Criar Conta na BET62</h1>
              <p className="text-gray-600">Cadastro rápido em menos de 2 minutos</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
                <i className="ri-error-warning-line text-red-500 mr-3 mt-0.5 flex-shrink-0"></i>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="fullName" className="block text-sm font-semibold text-gray-700 mb-2">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    id="fullName"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-sm"
                    placeholder="João Silva"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-sm"
                    placeholder="seu@email.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-2">
                    Telefone
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-sm"
                    placeholder="+351 912 345 678"
                  />
                </div>

                <div>
                  <label htmlFor="birthDate" className="block text-sm font-semibold text-gray-700 mb-2">
                    Data de Nascimento
                  </label>
                  <input
                    type="date"
                    id="birthDate"
                    name="birthDate"
                    value={formData.birthDate}
                    onChange={handleChange}
                    max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">Deve ter pelo menos 18 anos</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                    Senha *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                      minLength={8}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-sm pr-12"
                      placeholder="Mínimo 8 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 cursor-pointer"
                    >
                      <i className={showPassword ? 'ri-eye-off-line text-xl' : 'ri-eye-line text-xl'}></i>
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                    Confirmar Senha *
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      id="confirmPassword"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                      minLength={8}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-sm pr-12"
                      placeholder="Repita a senha"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 cursor-pointer"
                    >
                      <i className={showConfirmPassword ? 'ri-eye-off-line text-xl' : 'ri-eye-line text-xl'}></i>
                    </button>
                  </div>
                </div>
              </div>

              {/* Password strength indicator */}
              {formData.password && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 text-xs">
                    <span className={`flex items-center ${formData.password.length >= 8 ? 'text-red-600' : 'text-gray-400'}`}>
                      <i className={`${formData.password.length >= 8 ? 'ri-check-line' : 'ri-close-line'} mr-1`}></i>
                      8+ caracteres
                    </span>
                    <span className={`flex items-center ${/[A-Z]/.test(formData.password) ? 'text-red-600' : 'text-gray-400'}`}>
                      <i className={`${/[A-Z]/.test(formData.password) ? 'ri-check-line' : 'ri-close-line'} mr-1`}></i>
                      Maiúscula
                    </span>
                    <span className={`flex items-center ${/[0-9]/.test(formData.password) ? 'text-red-600' : 'text-gray-400'}`}>
                      <i className={`${/[0-9]/.test(formData.password) ? 'ri-check-line' : 'ri-close-line'} mr-1`}></i>
                      Número
                    </span>
                  </div>
                </div>
              )}

              <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
                <label className="flex items-start cursor-pointer">
                  <input
                    type="checkbox"
                    name="acceptTerms"
                    checked={formData.acceptTerms}
                    onChange={handleChange}
                    required
                    className="w-5 h-5 text-red-600 border-gray-300 rounded focus:ring-red-500 mt-0.5 cursor-pointer"
                  />
                  <span className="ml-3 text-sm text-gray-700">
                    Eu confirmo que tenho mais de 18 anos e aceito os{' '}
                    <a href="#" className="text-red-600 hover:text-red-700 font-semibold cursor-pointer">
                      Termos e Condições
                    </a>{' '}
                    e a{' '}
                    <a href="#" className="text-red-600 hover:text-red-700 font-semibold cursor-pointer">
                      Política de Privacidade
                    </a>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-lg transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                {isSubmitting ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    Criando Conta...
                  </>
                ) : (
                  <>
                    <i className="ri-user-add-line mr-2"></i>
                    Criar Conta e Começar
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-gray-600 text-sm">
                Já tem uma conta?{' '}
                <Link to="/login" className="text-red-600 hover:text-red-700 font-semibold cursor-pointer">
                  Entrar agora
                </Link>
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="grid grid-cols-3 gap-4 text-center text-xs text-gray-500">
                <div>
                  <i className="ri-shield-check-line text-red-500 text-xl mb-1"></i>
                  <div>100% Seguro</div>
                </div>
                <div>
                  <i className="ri-time-line text-red-500 text-xl mb-1"></i>
                  <div>Cadastro em 2min</div>
                </div>
                <div>
                  <i className="ri-gift-line text-red-500 text-xl mb-1"></i>
                  <div>Bónus de Boas-Vindas</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

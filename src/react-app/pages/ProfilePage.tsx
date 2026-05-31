import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';
import { TwoFactor } from '@/react-app/components/TwoFactorSetup';
import { Shield, AlertTriangle, Check, History, Banknote, CreditCard } from 'lucide-react';
 

interface Wallet { currency: string; balance: number }
interface Transaction { id: string; type: string; status: string; amount: number; currency: string; created_at: string; metadata?: string }

const ProfilePage: React.FC = () => {
  const { darkMode, toggleDarkMode, autoTheme, setAutoTheme, addNotification, user, signOut, selfExclude, selfExcludeUntil, setSelfExclude } = useApp();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profile, setProfile] = useState<any | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [show2faSetup, setShow2faSetup] = useState(false);
  
  
  const [selectedItem, setSelectedItem] = useState<string | null>('Informação');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) {
        setSelectedItem(tab);
    }
  }, []);


  
  const [documents, setDocuments] = useState<any[]>([]);
  const kycStatus = user?.kyc_status || 'unverified';
  const [cookieAnalytics, setCookieAnalytics] = useState<boolean>(() => { try { return JSON.parse(localStorage.getItem('cookie_analytics') || 'true'); } catch { return true; } });
  const [cookieMarketing, setCookieMarketing] = useState<boolean>(() => { try { return JSON.parse(localStorage.getItem('cookie_marketing') || 'false'); } catch { return false; } });
  const [cookieFunctional, setCookieFunctional] = useState<boolean>(() => { try { return JSON.parse(localStorage.getItem('cookie_functional') || 'true'); } catch { return true; } });
  const [limitDeposit, setLimitDeposit] = useState<number>(() => { try { return Number(localStorage.getItem('limit_deposit') || '0'); } catch { return 0; } });
  const [limitBet, setLimitBet] = useState<number>(() => { try { return Number(localStorage.getItem('limit_bet') || '0'); } catch { return 0; } });
  const [excludeDuration, setExcludeDuration] = useState<'24h'|'7d'|'30d'|'6m'|'indef'>('indef');
  const [excludeConfirmOpen, setExcludeConfirmOpen] = useState(false);
  const [history, setHistory] = useState<{ action: string; until?: string; created_at: string }[]>([]);
  const [supportMessages, setSupportMessages] = useState<{ sender: string; content: string; created_at: string }[]>([]);
  const [supportText, setSupportText] = useState('');
  const [supportLoading, setSupportLoading] = useState(false);

  // --- Payment Methods State ---
  const [activePaymentTab, setActivePaymentTab] = useState<'withdrawals'|'security'>('withdrawals');
  
  // Withdraw State
  const [withdrawAmount, setWithdrawAmount] = useState<number>(10);
  const [hasIban, setHasIban] = useState<boolean | null>(null);
  const [savedIban, setSavedIban] = useState<string>('');
  const [savedHolder, setSavedHolder] = useState<string>('');
  const [newIban, setNewIban] = useState('');
  const [holderName, setHolderName] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  
  // Preferences State


  // Load IBAN info when needed
  useEffect(() => {
    if (selectedItem === 'Métodos de Pagamento' && activePaymentTab === 'withdrawals' && user) {
        if (hasIban === null) {
            apiFetch('/api/users/iban')
                .then((data: any) => {
                    if (data.has_iban) {
                        setHasIban(true);
                        setSavedIban(data.iban_masked);
                        setSavedHolder(data.holder_name);
                    } else {
                        setHasIban(false);
                    }
                })
                .catch(() => setHasIban(false));
        }
    }
  }, [selectedItem, activePaymentTab, user]);

  // Withdraw Handler
  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (withdrawAmount < 10) return addNotification({ type: 'error', message: 'Mínimo €10' });
    if (!hasIban && (!newIban || !holderName)) return addNotification({ type: 'error', message: 'Preencha o IBAN e Titular' });

    setWithdrawLoading(true);
    try {
      const payload: any = { amount: withdrawAmount };
      if (!hasIban) {
        payload.iban = newIban;
        payload.holder_name = holderName;
      }

      const data = await apiFetch('/api/withdrawals', {
        method: 'POST',
        body: JSON.stringify(payload)
      }) as { iban?: string; message?: string };

      addNotification({ type: 'success', message: data.message || 'Levantamento solicitado com sucesso!' });
      if (!hasIban) {
            setHasIban(true);
            setSavedIban(data.iban || newIban);
            setSavedHolder(holderName);
      }
    } catch (err: any) {
      addNotification({ type: 'error', message: err.message || 'Erro ao solicitar levantamento' });
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleSaveIban = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIban || !holderName) return addNotification({ type: 'error', message: 'Preencha todos os campos' });
    setWithdrawLoading(true);
    try {
        const data = await apiFetch('/api/users/iban', {
            method: 'POST',
            body: JSON.stringify({ iban: newIban, holder_name: holderName })
        }) as any;
        
        addNotification({ type: 'success', message: 'IBAN guardado com sucesso' });
        setHasIban(true);
        setSavedIban(data.iban);
        setSavedHolder(holderName);
    } catch (err: any) {
        addNotification({ type: 'error', message: err.message || 'Erro ao guardar IBAN' });
    } finally {
        setWithdrawLoading(false);
    }
  };
  


  useEffect(() => {
    const ac = new AbortController();
    const loadHistory = async () => {
      if (!user) { setHistory([]); return; }
      try {
        const j = await apiFetch<{ action: string; until?: string; created_at: string }[]>('/api/users/self-exclude/history', { signal: ac.signal });
        if (j) {
          setHistory(Array.isArray(j) ? j : []);
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (/Abort|ERR_ABORTED|ERR_CANCELED/i.test(msg)) return;
      }
    };
    loadHistory();
    return () => { ac.abort('dev-strict'); };
  }, [user, selfExclude]);

  

  const firstName = useMemo(() => {
    const name = (user && (user as any).username) ? String((user as any).username) : '';
    return name.split(' ')[0] || name || 'Perfil';
  }, [user]);

  useEffect(() => {
    const ac = new AbortController();
    const loadData = async () => {
      if (!user) return;
      try {
        const [wb, tx, tfa, pf, ud] = await Promise.all([
          apiFetch<Wallet[]>('/api/wallet/balances', { signal: ac.signal }).catch(() => null),
          apiFetch<Transaction[]>('/api/wallet/transactions', { signal: ac.signal }).catch(() => null),
          apiFetch<{ enabled?: boolean }>('/api/auth/2fa/status', { signal: ac.signal }).catch(() => null),
          apiFetch<any>('/api/users/profile', { signal: ac.signal }).catch(() => null),
          apiFetch<any[]>('/api/users/documents', { signal: ac.signal }).catch(() => null)
        ]);

        if (wb) setWallets(wb);
        if (tx) setTransactions(tx);
        if (tfa) setTwoFactorEnabled(Boolean(tfa.enabled));
        if (pf) setProfile(pf);
        if (ud) setDocuments(Array.isArray(ud) ? ud : []);
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (/Abort|ERR_ABORTED|ERR_CANCELED/i.test(msg)) return;
        setWallets([]);
        setTransactions([]);
        setTwoFactorEnabled(false);
        setProfile(null);
        setDocuments([]);
      }
    };
    loadData();
    return () => { ac.abort('dev-strict'); };
  }, [user]);

  

  const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const base64 = res.includes(',') ? res.split(',')[1] : res;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Falha ao ler ficheiro'));
    reader.readAsDataURL(file);
  });

  const latestDocByType = (type: string) => {
    const list = documents.filter((d: any) => String(d.type) === type).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list[0] || null;
  };
  const uploadSingleDoc = async (type: 'iban_proof'|'id_card'|'bank_statement', file: File) => {
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/users/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ documents: [{ type, filename: file.name, mime_type: file.type, size: file.size, content_base64: base64 }] })
      });
      if (res.ok) {
        const ud = await fetch('/api/users/documents', { credentials: 'same-origin' });
        if (ud.ok) {
          const d = await ud.json();
          setDocuments(Array.isArray(d) ? d : []);
        }
        addNotification({ type: 'success', message: 'Documento enviado' });
      } else {
        const err = await res.json().catch(() => null) as any;
        addNotification({ type: 'error', message: (err?.error as string) || 'Falha ao enviar documento' });
      }
    } catch {
      addNotification({ type: 'error', message: 'Erro ao ler ficheiro' });
    }
  };

  const saveCookies = () => {
    try {
      localStorage.setItem('cookie_analytics', JSON.stringify(cookieAnalytics));
      localStorage.setItem('cookie_marketing', JSON.stringify(cookieMarketing));
      localStorage.setItem('cookie_functional', JSON.stringify(cookieFunctional));
      addNotification({ type: 'success', message: 'Definições guardadas' });
    } catch { addNotification({ type: 'error', message: 'Falha ao guardar' }); }
  };
  const saveLimits = () => {
    try {
      localStorage.setItem('limit_deposit', String(limitDeposit));
      localStorage.setItem('limit_bet', String(limitBet));
      addNotification({ type: 'success', message: 'Limites guardados' });
    } catch { addNotification({ type: 'error', message: 'Falha ao guardar' }); }
  };

  const fetchSupportMessages = async () => {
    try {
      const r = await fetch('/api/support/chat/messages', { credentials: 'same-origin' });
      if (r.ok) {
        const j = await r.json() as { sender: string; content: string; created_at: string }[];
        setSupportMessages(Array.isArray(j) ? j : []);
      }
    } catch { void 0 }
  };

  useEffect(() => {
    let timer: any = null;
    if (selectedItem === 'Preciso de ajuda' && user) {
      fetchSupportMessages();
      timer = setInterval(fetchSupportMessages, 10000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [selectedItem, user]);

  const sendSupportMessage = async () => {
    const content = supportText.trim();
    if (!content) return;
    setSupportLoading(true);
    try {
      await apiFetch('/api/support/chat/messages', { method: 'POST', body: JSON.stringify({ content }) });
      setSupportText('');
      addNotification({ type: 'success', message: 'Mensagem enviada' });
      await fetchSupportMessages();
    } catch (err: any) {
      addNotification({ type: 'error', message: err?.message || 'Falha ao enviar' });
    } finally {
      setSupportLoading(false);
    }
  };

  

  const menuItems = [
    'A minha conta','Métodos de Pagamento','Operações','Documentos','Opções','Jogos responsáveis','Definir os meus limites','Autoexclusão','Informação','Preciso de ajuda','Termos e condições gerais','Políticas e privacidade','Cookies','Definições de cookies'
  ];

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="container mx-auto p-2 md:p-4">
        <h1 className={`text-xl md:text-2xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{firstName}</h1>
        
        {/* Menu Mobile Dropdown - Super Compacto */}
        <div className="md:hidden mb-2">
          <select
            value={selectedItem || ''}
            onChange={(e) => setSelectedItem(e.target.value)}
            className={`w-full py-1 px-2 text-[10px] uppercase tracking-wide rounded border appearance-none font-bold focus:ring-1 focus:ring-blue-500 outline-none transition-shadow truncate pr-6 ${
              darkMode 
                ? 'bg-gray-800 border-gray-600 text-gray-200' 
                : 'bg-white border-gray-300 text-gray-700'
            }`}
            style={{ 
              backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23${darkMode ? '9CA3AF' : '6B7280'}%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.25rem center',
              backgroundSize: '0.5em auto'
            }}
          >
            {menuItems.map((item) => (
              <option key={item} value={item} className="text-xs text-gray-900 bg-white dark:bg-gray-800 dark:text-gray-200">
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
          <div className={`hidden md:block md:col-span-1 p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className={`text-sm font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Menu</div>
            <div className="space-y-2">
              {menuItems.map((item) => (
                <button
                  key={item}
                  className={`w-full text-left px-3 py-2 rounded ${
                    selectedItem === item
                      ? (darkMode ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-800 font-semibold')
                      : (darkMode ? 'bg-gray-700 hover:bg-gray-650 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900')
                  }`}
                  onClick={() => setSelectedItem(item)}
                >{item}</button>
              ))}
            </div>
          </div>

          <div className="md:col-span-3 space-y-4 md:space-y-6">
            {selfExclude && (
              <div className="bg-red-600 text-white p-4 rounded-lg shadow-md animate-pulse">
                <div className="font-bold text-lg mb-1 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  CONTA EM AUTOEXCLUSÃO
                </div>
                <p className="text-sm">
                  A sua conta encontra-se em período de autoexclusão {selfExcludeUntil ? `até ${new Date(selfExcludeUntil).toLocaleString()}` : '(indefinida)'}.
                  Durante este período, não poderá realizar depósitos, apostar ou alterar limites.
                  Os levantamentos, contacto com suporte e histórico permanecem disponíveis.
                </p>
              </div>
            )}
            

            {selectedItem === 'A minha conta' && (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`text-xl font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>A minha conta</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>A minha identidade</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Género: {profile?.gender || '-'}</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Apelido(s): {profile?.last_name || '-'}</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Nome(s): {profile?.first_name || '-'}</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Data de nascimento: {profile?.birth_date || '-'}</div>
                  </div>
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>Os meus contactos</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>E-mail: {profile?.email || '-'}</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Telemóvel: {profile?.phone || '-'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>A minha morada</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Morada: {profile?.address || '-'}</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Cidade: {profile?.city || '-'}</div>
                  </div>
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>A minha conta</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Nome de utilizador: {(user && (user as any).username) ? String((user as any).username) : '-'}</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Data de criação da conta: {profile?.created_at ? new Date(profile.created_at).toLocaleString() : '-'}</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Data de validação dos termos e condições: {profile?.terms_accepted_at ? new Date(profile.terms_accepted_at).toLocaleString() : '-'}</div>
                  </div>
                </div>
                <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} mt-4 text-sm`}>ID: {(user && (user as any).id) ? String((user as any).id) : '-'}</div>
                <div className="mt-3">
                  <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium`}>Autenticação 2FA</div>
                  <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Estado: {twoFactorEnabled ? 'Ativado' : 'Desativado'}</div>
                  <div className="mt-2">
                    {!twoFactorEnabled && (
                      <button 
                        onClick={() => setShow2faSetup(true)} 
                        className="px-3 py-2 rounded bg-indigo-600 text-white"
                      >
                        Ativar 2FA
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {selectedItem === 'Métodos de Pagamento' && (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`text-xl font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Métodos de Pagamento</h2>
                
                {/* Tabs */}
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                    {['withdrawals', 'security'].map((t) => (
                        <button 
                            key={t}
                            onClick={() => setActivePaymentTab(t as any)}
                            className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition-colors ${
                                activePaymentTab === t 
                                ? 'bg-blue-600 text-white shadow-md' 
                                : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            {t === 'withdrawals' ? 'Levantamentos' : 'Segurança'}
                        </button>
                    ))}
                </div>

                {/* 1. WITHDRAWALS */}
                {activePaymentTab === 'withdrawals' && (
                    <div className="space-y-6 animate-fadeIn">
                         {/* Info Box */}
                         <div className={`p-4 rounded-lg border ${darkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200'}`}>
                            <h3 className="font-bold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-2">
                                <Banknote className="w-5 h-5" /> Regras de Levantamento
                            </h3>
                            <ul className={`text-sm space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                <li>• &lt; €10: Rejeitado automaticamente.</li>
                                <li>• €10 - €300: Processamento automático.</li>
                                <li>• &gt; €300: Agendamento 24h (verificação manual).</li>
                            </ul>
                        </div>

                        {/* KYC Check */}
                        {kycStatus !== 'verified' && (
                             <div className={`p-4 rounded-lg border ${darkMode ? 'bg-orange-900/20 border-orange-800' : 'bg-orange-50 border-orange-200'}`}>
                                <div className="flex items-center gap-3 mb-2 text-orange-600 dark:text-orange-400">
                                    <AlertTriangle className="w-6 h-6" />
                                    <h3 className="font-bold">Verificação Necessária</h3>
                                </div>
                                <p className={`text-sm mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                    O primeiro levantamento requer verificação de identidade e IBAN.
                                </p>
                                <button onClick={() => setSelectedItem('Documentos')} className="text-sm font-bold underline">Ir para Documentos</button>
                             </div>
                        )}

                        {/* IBAN Form */}
                        {kycStatus === 'verified' && (
                            <>
                                {hasIban ? (
                                    <div className="space-y-4">
                                         <div className={`p-4 rounded-lg border flex justify-between items-center ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-100 border-gray-300'}`}>
                                            <div>
                                                <div className="text-xs text-gray-500 uppercase">Conta de Destino</div>
                                                <div className={`font-mono font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{savedIban}</div>
                                                <div className="text-sm text-gray-500">{savedHolder}</div>
                                            </div>
                                            <Check className="text-green-500 w-6 h-6" />
                                         </div>

                                         <div>
                                            <label className={`block text-sm font-bold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Valor a Levantar (€)</label>
                                            <input 
                                                type="number" 
                                                value={withdrawAmount} 
                                                onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                                                className={`w-full p-3 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                            />
                                         </div>

                                         <button 
                                            onClick={handleWithdraw}
                                            disabled={withdrawLoading}
                                            className={`w-full py-4 rounded-lg font-bold text-lg text-white transition-transform active:scale-95 ${
                                                withdrawLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20'
                                            }`}
                                        >
                                            {withdrawLoading ? 'A processar...' : 'Confirmar Levantamento'}
                                        </button>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSaveIban} className="space-y-4">
                                        <div className={`p-4 rounded-lg border border-dashed ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                                            <h3 className={`font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Adicionar IBAN</h3>
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-sm">IBAN (PT50...)</label>
                                                    <input 
                                                        type="text" 
                                                        value={newIban} 
                                                        onChange={(e) => setNewIban(e.target.value.toUpperCase())}
                                                        className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-sm">Nome do Titular</label>
                                                    <input 
                                                        type="text" 
                                                        value={holderName} 
                                                        onChange={(e) => setHolderName(e.target.value)}
                                                        className={`w-full p-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                                                    />
                                                </div>
                                                <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded font-bold">Guardar IBAN</button>
                                            </div>
                                        </div>
                                    </form>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* 4. SECURITY */}
                {activePaymentTab === 'security' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div className={`p-4 rounded-lg border ${darkMode ? 'bg-green-900/20 border-green-800' : 'bg-green-50 border-green-200'}`}>
                             <div className="flex items-center gap-3 mb-2 text-green-700 dark:text-green-400">
                                <Shield className="w-6 h-6" />
                                <h3 className="font-bold">Pagamentos Seguros</h3>
                            </div>
                            <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                Todas as transações são processadas por entidades de pagamentos autorizadas e seguras (PayPal, Revolut).
                            </p>
                        </div>

                        <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-750 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                            <h3 className={`font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Auditoria e Logs</h3>
                            <ul className={`text-sm space-y-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                <li className="flex items-center gap-2"><History className="w-4 h-4" /> Data e Hora de todas as operações</li>
                                <li className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> Método utilizado e Identificador</li>
                                <li className="flex items-center gap-2"><Banknote className="w-4 h-4" /> Valor exato e Estado da transação</li>
                            </ul>
                        </div>
                    </div>
                )}

              </div>
            )}
            {selectedItem === 'Operações' && (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Histórico de Operações</h2>
                <div className={`overflow-x-auto rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <table className="min-w-full">
                    <thead>
                      <tr className={`${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                        <th className="py-2 px-4 text-left">Data</th>
                        <th className="py-2 px-4 text-left">Tipo</th>
                        <th className="py-2 px-4 text-left">Status</th>
                        <th className="py-2 px-4 text-left">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => {
                        let statusDisplay = tx.status;
                        let statusColor = darkMode ? 'text-gray-300' : 'text-gray-700';

                        switch (tx.status) {
                            case 'COMPLETED':
                            case 'PAID':
                                statusDisplay = '✅ Pago';
                                statusColor = 'text-green-600 dark:text-green-400 font-bold';
                                break;
                            case 'PENDING':
                                statusDisplay = '⏳ Processando';
                                statusColor = 'text-yellow-600 dark:text-yellow-400 font-bold';
                                break;
                            case 'FAILED':
                            case 'REJECTED':
                                statusDisplay = '❌ Falhou';
                                statusColor = 'text-red-600 dark:text-red-400 font-bold';
                                break;
                            case 'AUTHORIZED':
                                statusDisplay = '🔒 Autorizado';
                                statusColor = 'text-blue-600 dark:text-blue-400 font-bold';
                                break;
                            case 'REQUESTED':
                                statusDisplay = '⏳ Agendado';
                                statusColor = 'text-orange-600 dark:text-orange-400 font-bold';
                                break;
                            case 'IBAN_PENDING_REVIEW':
                                statusDisplay = '⏳ IBAN em Análise';
                                statusColor = 'text-purple-600 dark:text-purple-400 font-bold';
                                break;
                        }

                        return (
                        <tr key={tx.id} className={`${darkMode ? 'border-t border-gray-700' : 'border-t border-gray-200'}`}>
                          <td className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} py-2 px-4`}>{new Date(tx.created_at).toLocaleString()}</td>
                          <td className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} py-2 px-4`}>{tx.type === 'DEPOSIT' ? 'Depósito' : tx.type === 'WITHDRAWAL' ? 'Levantamento' : tx.type}</td>
                          <td className={`py-2 px-4 ${statusColor}`}>{statusDisplay}</td>
                          <td className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} py-2 px-4 font-mono`}>{tx.amount.toFixed(2)} {tx.currency}</td>
                        </tr>
                        );
                      })}
                      {transactions.length === 0 && (
                        <tr>
                          <td className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} py-4 px-4`} colSpan={4}>Sem transações</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {selectedItem === 'Documentos' && (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Documentos de Verificação</h2>
                <p className={`${darkMode ? 'text-gray-300' : 'text-gray-600'} text-sm mb-6`}>
                  O primeiro levantamento requer a verificação da sua identidade e dados bancários.
                  Os documentos enviados serão utilizados apenas para fins de segurança e cumprimento legal.
                </p>

                {/* Estado Geral */}
                <div className={`mb-8 p-4 rounded-lg border flex items-center gap-4 ${
                  kycStatus === 'verified' 
                    ? (darkMode ? 'bg-green-900/20 border-green-800' : 'bg-green-50 border-green-200')
                    : (darkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200')
                }`}>
                   <div className={`text-3xl ${kycStatus === 'verified' ? 'text-green-500' : 'text-blue-500'}`}>
                     {kycStatus === 'verified' ? '✅' : '⏳'}
                   </div>
                   <div>
                     <div className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                       Estado: {kycStatus === 'verified' ? 'Verificado' : 'Em análise'}
                     </div>
                     <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                       {kycStatus === 'verified' 
                         ? 'Os levantamentos estão disponíveis.' 
                         : 'A verificação pode demorar até 24 horas.'}
                     </p>
                   </div>
                </div>

                <div className="space-y-6">
                  {/* 1. ID Document */}
                  <div className={`p-4 rounded border ${darkMode ? 'bg-gray-750 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex justify-between items-start mb-2">
                       <div>
                         <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Documento de Identificação</h3>
                         <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Cartão de Cidadão ou Passaporte válido e legível.</p>
                       </div>
                       {latestDocByType('id_card') ? (
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            latestDocByType('id_card').status === 'verified' ? 'bg-green-100 text-green-800' :
                            latestDocByType('id_card').status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {latestDocByType('id_card').status === 'verified' ? '✅ Aprovado' : 
                             latestDocByType('id_card').status === 'rejected' ? '❌ Rejeitado' : 
                             '⏳ Em análise'}
                          </span>
                       ) : (
                          <span className={`px-2 py-1 rounded text-xs font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>❌ Não enviado</span>
                       )}
                    </div>
                    
                    <div className="mt-4">
                      <input 
                        type="file" 
                        accept=".jpg,.jpeg,.png,.pdf"
                        onChange={(e) => { const f = e.target.files?.[0]; if(f) uploadSingleDoc('id_card', f); }}
                        className={`block w-full text-sm ${darkMode ? 'text-gray-300 file:bg-gray-700 file:text-white' : 'text-gray-500 file:bg-gray-100 file:text-gray-700'} file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold hover:file:bg-gray-200`}
                      />
                      <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Formatos: JPG, PNG, PDF (Max 5MB)</p>
                    </div>
                  </div>

                  {/* 2. IBAN Proof */}
                  <div className={`p-4 rounded border ${darkMode ? 'bg-gray-750 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex justify-between items-start mb-2">
                       <div>
                         <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Comprovativo de IBAN</h3>
                         <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Documento oficial do banco com o seu nome e IBAN. ❌ Multibanco não é aceite.</p>
                       </div>
                       {latestDocByType('iban_proof') ? (
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            latestDocByType('iban_proof').status === 'verified' ? 'bg-green-100 text-green-800' :
                            latestDocByType('iban_proof').status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {latestDocByType('iban_proof').status === 'verified' ? '✅ Aprovado' : 
                             latestDocByType('iban_proof').status === 'rejected' ? '❌ Rejeitado' : 
                             '⏳ Em análise'}
                          </span>
                       ) : (
                          <span className={`px-2 py-1 rounded text-xs font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>❌ Não enviado</span>
                       )}
                    </div>
                     <div className="mt-4">
                      <input 
                        type="file" 
                        accept=".jpg,.jpeg,.png,.pdf"
                        onChange={(e) => { const f = e.target.files?.[0]; if(f) uploadSingleDoc('iban_proof', f); }}
                        className={`block w-full text-sm ${darkMode ? 'text-gray-300 file:bg-gray-700 file:text-white' : 'text-gray-500 file:bg-gray-100 file:text-gray-700'} file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold hover:file:bg-gray-200`}
                      />
                      <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Formatos: JPG, PNG, PDF (Max 5MB)</p>
                    </div>
                  </div>

                  {/* 3. Bank Statement */}
                  <div className={`p-4 rounded border ${darkMode ? 'bg-gray-750 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex justify-between items-start mb-2">
                       <div>
                         <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Extrato Bancário</h3>
                         <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Documento recente (máx. 3 meses) com nome e IBAN. O saldo pode ser ocultado.</p>
                       </div>
                       {latestDocByType('bank_statement') ? (
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            latestDocByType('bank_statement').status === 'verified' ? 'bg-green-100 text-green-800' :
                            latestDocByType('bank_statement').status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {latestDocByType('bank_statement').status === 'verified' ? '✅ Aprovado' : 
                             latestDocByType('bank_statement').status === 'rejected' ? '❌ Rejeitado' : 
                             '⏳ Em análise'}
                          </span>
                       ) : (
                          <span className={`px-2 py-1 rounded text-xs font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>❌ Não enviado</span>
                       )}
                    </div>
                     <div className="mt-4">
                      <input 
                        type="file" 
                        accept=".jpg,.jpeg,.png,.pdf"
                        onChange={(e) => { const f = e.target.files?.[0]; if(f) uploadSingleDoc('bank_statement', f); }}
                        className={`block w-full text-sm ${darkMode ? 'text-gray-300 file:bg-gray-700 file:text-white' : 'text-gray-500 file:bg-gray-100 file:text-gray-700'} file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold hover:file:bg-gray-200`}
                      />
                      <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Formatos: JPG, PNG, PDF (Max 5MB)</p>
                    </div>
                  </div>
                </div>
              </div>
            )}



            {selectedItem === 'Opções' && (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`${darkMode ? 'text-white' : 'text-gray-900'} text-xl font-semibold mb-2`}>Opções</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setAutoTheme(true)}
                    className={`${autoTheme ? 'bg-blue-600 text-white' : darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800'} px-3 py-2 rounded font-semibold`}
                  >Modo automático</button>
                  <button
                    onClick={() => setAutoTheme(false)}
                    className={`${!autoTheme ? 'bg-blue-600 text-white' : darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800'} px-3 py-2 rounded font-semibold`}
                  >Modo manual</button>
                  <button
                    onClick={toggleDarkMode}
                    disabled={autoTheme}
                    className={`${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800'} px-3 py-2 rounded font-semibold disabled:opacity-50`}
                  >Alternar tema</button>
                </div>
              </div>
            )}
            {selectedItem === 'Jogos responsáveis' && (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`${darkMode ? 'text-white' : 'text-gray-900'} text-xl font-semibold mb-2`}>Jogos responsáveis</h2>
                <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Consulta e ajusta os teus limites em "Definir os meus limites".</div>
              </div>
            )}
            {selectedItem === 'Definir os meus limites' && (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`${darkMode ? 'text-white' : 'text-gray-900'} text-xl font-semibold mb-2`}>Definir os meus limites</h2>
                {selfExclude && (
                  <div className={`mb-4 p-3 border rounded ${darkMode ? 'bg-red-900/30 border-red-800 text-red-300' : 'bg-red-100 border-red-400 text-red-700'}`}>
                    Não é possível alterar limites durante o período de autoexclusão.
                  </div>
                )}
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${selfExclude ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div>
                    <label className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Limite de depósito (€)</label>
                    <input 
                      type="number" 
                      min="0" 
                      value={limitDeposit} 
                      onChange={(e) => setLimitDeposit(Number(e.target.value))} 
                      className={`mt-1 w-full px-3 py-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} 
                      disabled={selfExclude}
                    />
                  </div>
                  <div>
                    <label className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Limite de aposta (€)</label>
                    <input 
                      type="number" 
                      min="0" 
                      value={limitBet} 
                      onChange={(e) => setLimitBet(Number(e.target.value))} 
                      className={`mt-1 w-full px-3 py-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} 
                      disabled={selfExclude}
                    />
                  </div>
                </div>
                <button 
                  onClick={saveLimits} 
                  className={`mt-3 px-3 py-2 rounded bg-green-600 text-white ${selfExclude ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={selfExclude}
                >
                  Guardar
                </button>
              </div>
            )}
            {selectedItem === 'Autoexclusão' && (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`${darkMode ? 'text-white' : 'text-gray-900'} text-xl font-semibold mb-2`}>Autoexclusão</h2>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={selfExclude} onChange={(e) => { if (e.target.checked) { setExcludeConfirmOpen(true); } else { setSelfExclude(false, null); } }} />
                    <span>Ativar autoexclusão</span>
                  </div>
                  {!selfExclude && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Duração</label>
                        <select value={excludeDuration} onChange={(e) => setExcludeDuration(e.target.value as any)} className={`mt-1 w-full px-3 py-2 rounded border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                          <option value="24h">24 horas</option>
                          <option value="7d">7 dias</option>
                          <option value="30d">30 dias</option>
                          <option value="6m">6 meses</option>
                          <option value="indef">Permanente</option>
                        </select>
                      </div>
                    </div>
                  )}
                  {selfExclude && (
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      {selfExcludeUntil ? `Autoexclusão até: ${new Date(selfExcludeUntil).toLocaleString()}` : 'Autoexclusão sem prazo (Permanente)'}
                    </div>
                  )}
                </div>
                {excludeConfirmOpen && createPortal(
                  <div className="fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setExcludeConfirmOpen(false)} />
                    <div className={`${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'} fixed top-[calc(50%+60px)] left-1/2 -translate-x-1/2 w-[92vw] max-w-[420px] p-6 rounded-lg shadow-xl`}>
                      <h3 className={`${darkMode ? 'text-white' : 'text-gray-900'} text-lg font-bold mb-4`}>Confirmar autoexclusão</h3>
                      <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} space-y-2`}>
                        <div>Não poderá adicionar ao boletim nem apostar enquanto estiver autoexcluído.</div>
                        <div>Duração: {excludeDuration === 'indef' ? 'Permanente' : excludeDuration === '24h' ? '24 horas' : excludeDuration === '7d' ? '7 dias' : excludeDuration === '30d' ? '30 dias' : excludeDuration === '6m' ? '6 meses' : 'Permanente'}</div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => setExcludeConfirmOpen(false)} className={`px-3 py-2 rounded ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800'}`}>Cancelar</button>
                        <button onClick={() => {
                          const now = Date.now();
                          let untilTs: string | null = null;
                          if (excludeDuration === '24h') untilTs = new Date(now + 24*60*60*1000).toISOString();
                          else if (excludeDuration === '7d') untilTs = new Date(now + 7*24*60*60*1000).toISOString();
                          else if (excludeDuration === '30d') untilTs = new Date(now + 30*24*60*60*1000).toISOString();
                          else if (excludeDuration === '6m') untilTs = new Date(now + 180*24*60*60*1000).toISOString();
                          
                          setSelfExclude(true, untilTs);
                          setExcludeConfirmOpen(false);
                        }} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">Confirmar</button>
                      </div>
                    </div>
                  </div>, document.body
                )}
                <div className={`mt-4 p-3 rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-semibold mb-2`}>Histórico de autoexclusão</div>
                  {history.length === 0 ? (
                    <div className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-sm`}>Sem registos</div>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {history.map((h, i) => (
                        <li key={i} className={`${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          {h.action === 'activate' ? 'Ativada' : 'Desativada'} em {new Date(h.created_at).toLocaleString()} {h.until ? `(até ${new Date(h.until).toLocaleString()})` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {selectedItem === 'Informação' && (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`${darkMode ? 'text-white' : 'text-gray-900'} text-xl font-bold mb-4 uppercase`}>Informação</h2>
                
                {/* Resumo da Conta */}
                <div className="mb-6">
                  <h3 className={`${darkMode ? 'text-white' : 'text-gray-900'} font-bold mb-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} pb-1`}>Resumo da Conta</h3>
                  <div className={`grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                    <div><span className="font-semibold">Utilizador:</span> {(user && (user as any).username) || '-'}</div>
                    <div><span className="font-semibold">E-mail:</span> {profile?.email || '-'}</div>
                    <div><span className="font-semibold">2FA:</span> {twoFactorEnabled ? 'Ativado' : 'Desativado'}</div>
                    <div><span className="font-semibold">Autoexclusão:</span> {selfExclude ? 'Ativada' : 'Desativada'}</div>
                    <div><span className="font-semibold">Limite de Depósito:</span> €{limitDeposit.toFixed(2)}</div>
                    <div><span className="font-semibold">Limite de Aposta:</span> €{limitBet.toFixed(2)}</div>

                    <div><span className="font-semibold">Saldo EUR:</span> €{(wallets.find(w => w.currency === 'EUR')?.balance || 0).toFixed(2)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Ferramentas e Segurança */}
                  <div>
                    <h3 className={`${darkMode ? 'text-white' : 'text-gray-900'} font-bold mb-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} pb-1`}>Ferramentas e Segurança</h3>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      <li>Depósito mínimo: €10; máximo por operação: €20.000</li>
                      <li>Depósitos ≥ €1.000 requerem código 2FA quando ativo</li>
                      <li>Documentos necessários para o primeiro levantamento: IBAN, Identificação, Extrato Bancário</li>
                      <li>Preferências de cookies e notificações configuráveis em Definições</li>
                    </ul>
                  </div>

                  {/* Responsabilidade e Apoio */}
                  <div>
                    <h3 className={`${darkMode ? 'text-white' : 'text-gray-900'} font-bold mb-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} pb-1`}>Responsabilidade e Apoio</h3>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      <li>Ferramentas de segurança: Limites, Autoexclusão, 2FA</li>
                      <li>Precisar de ajuda: <a href="mailto:atendimentoaoclientebet62@gmail.com" className={`underline ${darkMode ? 'text-red-300' : 'text-red-600'}`}>atendimentoaoclientebet62@gmail.com</a></li>
                      <li>Autoexclusão permite pausar atividades por um período definido</li>
                    </ul>
                  </div>

                  {/* Odds e Liquidação */}
                  <div>
                    <h3 className={`${darkMode ? 'text-white' : 'text-gray-900'} font-bold mb-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} pb-1`}>Odds e Liquidação</h3>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      <li>Odds podem variar; confirmamos alterações antes de apostar</li>
                      <li>Cashout disponível em apostas elegíveis; sujeito a disponibilidade</li>
                      <li>Eventos ao vivo podem conter atrasos de transmissão</li>
                    </ul>
                  </div>

                  {/* Pagamentos e Tempos */}
                  <div>
                    <h3 className={`${darkMode ? 'text-white' : 'text-gray-900'} font-bold mb-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} pb-1`}>Pagamentos e Tempos</h3>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      <li>Métodos suportados: PayPal</li>
                      <li>Levantamentos por IBAN exigem dados completos e validação</li>
                      <li>Tempos de processamento variam por método e verificação</li>
                    </ul>
                  </div>

                   {/* Dados e Privacidade */}
                  <div className="md:col-span-2">
                    <h3 className={`${darkMode ? 'text-white' : 'text-gray-900'} font-bold mb-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} pb-1`}>Dados e Privacidade</h3>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      <li>Consulta de dados e preferências em Políticas e Privacidade</li>
                      <li>Pode solicitar informações ou remoção dos dados via e-mail de apoio</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Verificação de Documentos */}
                  <div>
                     <h3 className={`${darkMode ? 'text-white' : 'text-gray-900'} font-bold mb-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} pb-1`}>Verificação de Documentos</h3>
                     <div className={`space-y-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                        <div className="flex justify-between">
                          <span>IBAN:</span>
                          <span className={latestDocByType('iban_proof')?.status === 'verified' ? 'text-green-500' : 'text-yellow-500'}>
                             {latestDocByType('iban_proof')?.status === 'verified' ? 'Aprovado' : latestDocByType('iban_proof')?.status ? 'Em análise' : '–'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Identificação:</span>
                          <span className={latestDocByType('id_card')?.status === 'verified' ? 'text-green-500' : 'text-yellow-500'}>
                             {latestDocByType('id_card')?.status === 'verified' ? 'Aprovado' : latestDocByType('id_card')?.status ? 'Em análise' : '–'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Extrato Bancário:</span>
                          <span className={latestDocByType('bank_statement')?.status === 'verified' ? 'text-green-500' : 'text-yellow-500'}>
                             {latestDocByType('bank_statement')?.status === 'verified' ? 'Aprovado' : latestDocByType('bank_statement')?.status ? 'Em análise' : '–'}
                          </span>
                        </div>
                        <button onClick={() => setSelectedItem('Documentos')} className={`mt-2 px-3 py-1 text-xs rounded border ${darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>[Ir para Documentos]</button>
                     </div>
                  </div>

                  {/* Atalhos Rápidos */}
                  <div>
                    <h3 className={`${darkMode ? 'text-white' : 'text-gray-900'} font-bold mb-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} pb-1`}>Atalhos Rápidos</h3>
                    <div className="flex flex-wrap gap-2">
                       <button onClick={() => setSelectedItem('Definir os meus limites')} className={`px-3 py-2 rounded text-sm ${darkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}>Limites</button>
                       <button onClick={() => setSelectedItem('Autoexclusão')} className={`px-3 py-2 rounded text-sm ${darkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}>Autoexclusão</button>
                       <button onClick={() => setSelectedItem('Métodos de pagamento')} className={`px-3 py-2 rounded text-sm ${darkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}>Métodos</button>
                       <button onClick={() => setSelectedItem('Operações')} className={`px-3 py-2 rounded text-sm ${darkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}>Operações</button>
                    </div>
                  </div>
                </div>

                {/* Transações Recentes */}
                <div className="mt-6">
                  <h3 className={`${darkMode ? 'text-white' : 'text-gray-900'} font-bold mb-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} pb-1`}>Transações Recentes</h3>
                  <div className={`overflow-x-auto rounded border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className={`${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                          <th className="py-2 px-4 text-left">Data</th>
                          <th className="py-2 px-4 text-left">Tipo</th>
                          <th className="py-2 px-4 text-left">Status</th>
                          <th className="py-2 px-4 text-left">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...transactions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3).map((tx) => (
                          <tr key={tx.id} className={`${darkMode ? 'border-t border-gray-700' : 'border-t border-gray-200'}`}>
                            <td className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} py-2 px-4`}>{new Date(tx.created_at).toLocaleString()}</td>
                            <td className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} py-2 px-4`}>{tx.type}</td>
                            <td className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} py-2 px-4`}>{tx.status}</td>
                            <td className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} py-2 px-4`}>{tx.amount.toFixed(2)} {tx.currency}</td>
                          </tr>
                        ))}
                        {transactions.length === 0 && (
                          <tr>
                            <td className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} py-4 px-4`} colSpan={4}>Sem transações</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={() => setSelectedItem('Operações')} className={`mt-2 px-3 py-1 text-xs rounded border ${darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>[Ver todas as transações]</button>
                </div>
              </div>
            )}

            {selectedItem === 'Preciso de ajuda' && (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`${darkMode ? 'text-white' : 'text-gray-900'} text-xl font-semibold mb-3`}>Preciso de ajuda</h2>
                <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-3`}>
                  Envie-nos um email: 
                  <a href="mailto:atendimentoaoclientebet62@gmail.com" className={`underline ${darkMode ? 'text-red-300' : 'text-red-600'} ml-1`}>atendimentoaoclientebet62@gmail.com</a> ou utiliza o chat de suporte abaixo.
                </div>
                <div className={`rounded-lg border ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} p-3`}>
                  <div className={`h-64 overflow-y-auto rounded ${darkMode ? 'bg-gray-800' : 'bg-white'} p-2`}>
                    {supportMessages.length === 0 ? (
                      <div className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-sm`}>Sem mensagens. Escreve-nos abaixo.</div>
                    ) : (
                      <ul className="space-y-2">
                        {supportMessages.map((m, idx) => (
                          <li key={idx} className={`max-w-[80%] ${m.sender === 'user' ? 'ml-auto text-right' : ''}`}>
                            <div className={`inline-block px-3 py-2 rounded ${m.sender === 'user' ? (darkMode ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white') : (darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800')}`}>
                              <div className="text-sm">{m.content}</div>
                              <div className={`text-[11px] mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{new Date(m.created_at).toLocaleString()}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={supportText}
                      onChange={(e) => setSupportText(e.target.value)}
                      placeholder="Escreve a tua mensagem..."
                      className={`flex-1 px-3 py-2 rounded border ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <button
                      onClick={sendSupportMessage}
                      disabled={supportLoading || !supportText.trim()}
                      className={`px-3 py-2 rounded ${darkMode ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-white'} disabled:opacity-50`}
                    >Enviar</button>
                  </div>
                </div>
              </div>
            )}
            {selectedItem === 'Termos e condições gerais' && (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`${darkMode ? 'text-white' : 'text-gray-900'} text-xl font-semibold mb-3`}>Termos e condições gerais</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 1. Regras de Utilização */}
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>1. Regras de Utilização</div>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      <li>A plataforma é destinada exclusivamente a utilizadores maiores de 18 anos.</li>
                      <li>Cada conta é pessoal, individual e intransmissível.</li>
                      <li>É proibida a utilização de bots, scripts, automações ou qualquer forma de manipulação.</li>
                      <li>As odds podem ser ajustadas; quando necessário, será solicitada confirmação do utilizador.</li>
                      <li>Reservamo-nos o direito de suspender ou encerrar contas em caso de conduta indevida, fraude ou violação destes termos.</li>
                    </ul>
                  </div>

                  {/* 2. Jogo Responsável */}
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>2. Jogo Responsável</div>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      <li>Disponibilizamos ferramentas de limites de utilização, notificações e autoexclusão.</li>
                      <li>A autoexclusão impede depósitos, apostas e criação de novos boletins.</li>
                      <li>O cashout poderá permanecer disponível apenas em apostas elegíveis.</li>
                    </ul>
                  </div>

                  {/* 3. Depósitos e Levantamentos */}
                  <div className="md:col-span-2">
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>3. Depósitos e Levantamentos</div>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm grid md:grid-cols-2 gap-x-4`}>
                      <li>Os valores depositados são convertidos em saldo interno para utilização exclusiva na plataforma.</li>
                      <li>Depósito mínimo: €10 | Máximo por operação: €20.000.</li>
                      <li>O levantamento mínimo é de €10.</li>
                      <li>Todos os levantamentos requerem IBAN válido e verificação da identidade.</li>
                      <li>O IBAN ficará associado à conta para levantamentos futuros.</li>
                      <li>O prazo de processamento pode ser de até 24 horas, dependendo das validações de segurança.</li>
                      <li>A plataforma reserva-se o direito de realizar análise manual de levantamentos quando necessário.</li>
                    </ul>
                  </div>

                  {/* 4. Bónus e Promoções */}
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>4. Bónus e Promoções</div>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      <li>As promoções podem estar sujeitas a condições específicas, prazos e requisitos.</li>
                      <li>Reservamo-nos o direito de alterar ou cancelar promoções a qualquer momento.</li>
                    </ul>
                  </div>

                  {/* 5. Conta e Verificação */}
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>5. Conta e Verificação</div>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      <li>O utilizador é responsável por fornecer informações verdadeiras e atualizadas.</li>
                      <li>Poderemos solicitar documentos de identificação, IBAN ou comprovativos adicionais para fins de segurança e conformidade.</li>
                    </ul>
                  </div>

                  {/* 6. Suporte e Reclamações */}
                  <div className="md:col-span-2">
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>6. Suporte e Reclamações</div>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      <li>Contacto: <a href="mailto:atendimentoaoclientebet62@gmail.com" className={`underline ${darkMode ? 'text-red-300' : 'text-red-600'}`}>atendimentoaoclientebet62@gmail.com</a></li>
                      <li>Todas as reclamações serão analisadas caso a caso, com resposta por e-mail.</li>
                    </ul>
                  </div>
                </div>

                <div className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-sm mt-6 pt-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <div>Última atualização: <strong>05-01-2026</strong></div>
                  <div className="mt-1">Última validação dos termos: {profile?.terms_accepted_at ? new Date(profile.terms_accepted_at).toLocaleString() : 'não validado'}</div>
                </div>
              </div>
            )}
            {selectedItem === 'Políticas e privacidade' && (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`${darkMode ? 'text-white' : 'text-gray-900'} text-xl font-semibold mb-4`}>🔐 POLÍTICA DE PRIVACIDADE</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 1. Introdução */}
                  <div className="md:col-span-2">
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>1. Introdução</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      A presente Política de Privacidade descreve como os dados pessoais dos utilizadores são recolhidos, utilizados e protegidos no âmbito da utilização da plataforma. O tratamento de dados é efetuado em conformidade com o Regulamento Geral sobre a Proteção de Dados (RGPD – UE 2016/679).
                    </div>
                  </div>

                  {/* 2. Dados Pessoais Recolhidos */}
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>2. Dados Pessoais Recolhidos</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm mb-1`}>Recolhemos apenas os dados necessários para o funcionamento, segurança e gestão da plataforma, nomeadamente:</div>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm list-disc pl-4`}>
                      <li>Nome e apelido</li>
                      <li>Endereço de e-mail</li>
                      <li>Número de telemóvel (ex.: MB WAY)</li>
                      <li>Dados bancários (IBAN) para levantamentos</li>
                      <li>Documentos de identificação para verificação (KYC)</li>
                      <li>Endereço IP e dados de acesso</li>
                      <li>Histórico de depósitos, levantamentos e atividades na plataforma</li>
                    </ul>
                  </div>

                  {/* 3. Finalidade do Tratamento */}
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>3. Finalidade do Tratamento</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm mb-1`}>Os dados pessoais são tratados para:</div>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm list-disc pl-4`}>
                      <li>Criação e gestão de conta de utilizador</li>
                      <li>Processamento de depósitos e levantamentos</li>
                      <li>Verificação de identidade e prevenção de fraude</li>
                      <li>Cumprimento de obrigações legais</li>
                      <li>Comunicação com o utilizador</li>
                      <li>Garantia da segurança e integridade da plataforma</li>
                    </ul>
                  </div>

                  {/* 4. Cookies */}
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>4. Cookies</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm mb-1`}>Utilizamos cookies para melhorar a experiência do utilizador:</div>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm list-disc pl-4`}>
                      <li>Cookies essenciais: necessários para autenticação e funcionamento do site</li>
                      <li>Cookies funcionais: guardam preferências do utilizador</li>
                      <li>Cookies analíticos (se aplicável): ajudam a melhorar o desempenho do site</li>
                    </ul>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm mt-1`}>O utilizador pode aceitar ou rejeitar cookies não essenciais através do banner de cookies ou das definições do navegador.</div>
                  </div>

                  {/* 5. Conservação dos Dados */}
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>5. Conservação dos Dados</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      Os dados pessoais são conservados apenas pelo período necessário para as finalidades a que se destinam ou para cumprimento de obrigações legais e regulamentares.
                    </div>
                  </div>

                  {/* 6. Partilha de Dados */}
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>6. Partilha de Dados</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm mb-1`}>Os dados poderão ser partilhados apenas com:</div>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm list-disc pl-4`}>
                      <li>Prestadores de serviços de pagamento (ex.: processamento de depósitos e levantamentos)</li>
                      <li>Entidades legais ou regulatórias, quando exigido por lei</li>
                    </ul>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm mt-1`}>Nunca vendemos ou cedemos dados pessoais para fins comerciais.</div>
                  </div>

                  {/* 7. Direitos do Utilizador */}
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>7. Direitos do Utilizador</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm mb-1`}>Nos termos do RGPD, o utilizador tem direito a:</div>
                    <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm list-disc pl-4`}>
                      <li>Aceder aos seus dados pessoais</li>
                      <li>Solicitar a correção de dados incorretos</li>
                      <li>Solicitar a eliminação da conta e dos dados (quando legalmente possível)</li>
                      <li>Limitar ou opor-se ao tratamento dos dados</li>
                      <li>Solicitar uma cópia dos seus dados</li>
                      <li>Retirar consentimento para cookies não essenciais</li>
                    </ul>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm mt-1`}>Os pedidos podem ser feitos através do contacto indicado abaixo.</div>
                  </div>

                  {/* 8. Segurança dos Dados */}
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>8. Segurança dos Dados</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      Adotamos medidas técnicas e organizativas adequadas para proteger os dados pessoais contra acesso não autorizado, perda ou utilização indevida.
                    </div>
                  </div>

                  {/* 9. Contacto */}
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>9. Contacto</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      Para qualquer questão relacionada com dados pessoais ou privacidade, o utilizador pode contactar-nos através de:
                    </div>
                    <div className="mt-1">
                      <a href="mailto:atendimentoaoclientebet62@gmail.com" className={`underline ${darkMode ? 'text-red-300' : 'text-red-600'}`}>📧 atendimentoaoclientebet62@gmail.com</a>
                    </div>
                  </div>

                  {/* 10. Alterações */}
                  <div className="md:col-span-2">
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>10. Alterações à Política de Privacidade</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      Reservamo-nos o direito de atualizar esta Política de Privacidade a qualquer momento. As alterações entram em vigor após a sua publicação na plataforma.
                    </div>
                  </div>
                </div>

                <div className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-sm mt-6 pt-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <div>Última atualização: <strong>05-01-2026</strong></div>
                </div>
              </div>
            )}
            {selectedItem === 'Cookies' && (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`${darkMode ? 'text-white' : 'text-gray-900'} text-xl font-semibold mb-2`}>Cookies</h2>
                <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Esta plataforma utiliza cookies para melhorar a experiência.</div>
              </div>
            )}
            {selectedItem === 'Definições de cookies' && (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h2 className={`${darkMode ? 'text-white' : 'text-gray-900'} text-xl font-semibold mb-4`}>🍪 Definições de Cookies</h2>
                
                <div className="mb-6">
                  <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>O que são cookies?</div>
                  <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                    Cookies são pequenos ficheiros armazenados no seu dispositivo quando visita um website. Servem para garantir o funcionamento do site e melhorar a sua experiência.
                  </div>
                </div>

                <div className="mb-6">
                  <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-3`}>Tipos de cookies utilizados</div>
                  
                  {/* Essential */}
                  <div className={`p-3 rounded mb-3 border ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>🔒 Cookies Essenciais (Obrigatórios)</div>
                      <span className="text-xs font-bold px-2 py-1 rounded bg-green-600 text-white">Sempre ativos</span>
                    </div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm mb-2`}>
                      Estes cookies são necessários para o funcionamento básico da plataforma e não podem ser desativados.
                    </div>
                    <ul className={`list-disc pl-4 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      <li>Autenticação de sessão</li>
                      <li>Segurança da conta</li>
                      <li>Processamento de operações</li>
                    </ul>
                  </div>

                  {/* Functional */}
                  <div className={`p-3 rounded mb-3 border ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>⚙️ Cookies Funcionais</div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={cookieFunctional} onChange={(e) => setCookieFunctional(e.target.checked)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      Permitem guardar preferências do utilizador, como idioma ou definições da conta.
                    </div>
                  </div>

                  {/* Analytics */}
                  <div className={`p-3 rounded mb-3 border ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>📊 Cookies Analíticos (Opcional)</div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={cookieAnalytics} onChange={(e) => setCookieAnalytics(e.target.checked)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      Ajudam-nos a compreender como o site é utilizado, permitindo melhorar o desempenho e a experiência do utilizador.
                    </div>
                  </div>

                  {/* Marketing */}
                  <div className={`p-3 rounded mb-3 border ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>📢 Cookies de Marketing (Opcional)</div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={cookieMarketing} onChange={(e) => setCookieMarketing(e.target.checked)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                      Utilizados para apresentar publicidade relevante e personalizada de acordo com os seus interesses.
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>Gestão de cookies</div>
                  <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                    O utilizador pode alterar ou retirar o consentimento para cookies não essenciais a qualquer momento através desta página ou das definições do navegador.
                  </div>
                </div>

                <div className="mb-6">
                  <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>Mais informações</div>
                  <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm mb-2`}>
                    Para mais detalhes sobre como tratamos os seus dados, consulte a nossa Política de Privacidade.
                  </div>
                  <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                    📧 Para questões relacionadas com cookies ou dados pessoais:
                    <a href="mailto:atendimentoaoclientebet62@gmail.com" className={`block mt-1 underline ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>atendimentoaoclientebet62@gmail.com</a>
                  </div>
                </div>

                <button onClick={saveCookies} className="w-full sm:w-auto px-6 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-medium transition-colors">
                  Guardar
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-center mt-6">
          <button onClick={signOut} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">Sair</button>
        </div>
      </div>
      {show2faSetup && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <TwoFactor
            mode="setup"
            onSuccess={() => {
              setShow2faSetup(false);
              setTwoFactorEnabled(true);
              addNotification({ type: 'success', message: '2FA ativado com sucesso' });
            }}
            onCancel={() => setShow2faSetup(false)}
          />
        </div>,
        document.body
      )}
    </div>
  );
};

export default ProfilePage;

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';
import { TwoFactor } from '@/react-app/components/TwoFactorSetup';
import { WithdrawForm } from '@/react-app/components/WithdrawForm';
import {
  User, ShieldCheck, KeyRound, SlidersHorizontal, AlertTriangle, Activity,
  Banknote, Bell, Smartphone, HelpCircle, Eye, ChevronDown, Check, History, CreditCard, Shield,
} from 'lucide-react';

interface Wallet { currency: string; balance: number }
interface Transaction { id: string; type: string; status: string; amount: number; currency: string; created_at: string; metadata?: string }
interface IbanInfo { has_iban: boolean; nif?: string; document_type?: string; document_number?: string }

const SECTIONS: { key: string; icon: any }[] = [
  { key: 'Informações Pessoais', icon: User },
  { key: 'Verificação de Identidade', icon: ShieldCheck },
  { key: 'Definições de Segurança', icon: KeyRound },
  { key: 'Preferências de Conta', icon: SlidersHorizontal },
  { key: 'Limites e Autoexclusão', icon: AlertTriangle },
  { key: 'Histórico de Atividade', icon: Activity },
  { key: 'Dados Bancários', icon: Banknote },
  { key: 'Notificações', icon: Bell },
  { key: 'Sessões Ativas', icon: Smartphone },
  { key: 'Suporte e Assistência', icon: HelpCircle },
  { key: 'Configurações de Privacidade', icon: Eye },
];

// One collapsible row — the whole "menu" IS this list, no separate sidebar needed. Matches the
// requested reference layout: a stack of expandable sections instead of a side list + panel.
function AccordionSection({ title, Icon, isOpen, onToggle, darkMode, children }: {
  title: string; Icon: any; isOpen: boolean; onToggle: () => void; darkMode: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-3 px-4 py-4 text-left font-semibold transition-colors ${
          darkMode ? 'text-white hover:bg-gray-750' : 'text-gray-900 hover:bg-gray-50'
        }`}
      >
        <span className="flex items-center gap-3">
          <Icon className={`w-5 h-5 shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          {title}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
      </button>
      {isOpen && (
        <div className={`px-4 pb-5 pt-1 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          {children}
        </div>
      )}
    </div>
  );
}

const ProfilePage: React.FC = () => {
  const { darkMode, toggleDarkMode, autoTheme, setAutoTheme, addNotification, user, signOut, selfExclude, selfExcludeUntil, setSelfExclude } = useApp();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profile, setProfile] = useState<any | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [show2faSetup, setShow2faSetup] = useState(false);

  const [selectedItem, setSelectedItem] = useState<string | null>('Informações Pessoais');

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
  const [privacySubTab, setPrivacySubTab] = useState<'cookies' | 'terms' | 'privacy'>('cookies');

  // --- Identity document (KYC) state — separate from the bank-data form below. ---
  const [ibanInfo, setIbanInfo] = useState<IbanInfo | null>(null);
  const [idDocType, setIdDocType] = useState<'cc' | 'passport'>('cc');
  const [idDocNumber, setIdDocNumber] = useState('');
  const [savingIdDoc, setSavingIdDoc] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiFetch<IbanInfo>('/api/users/iban').then(setIbanInfo).catch(() => setIbanInfo(null));
  }, [user]);

  useEffect(() => {
    if (ibanInfo?.document_type === 'cc' || ibanInfo?.document_type === 'passport') setIdDocType(ibanInfo.document_type);
    if (ibanInfo?.document_number) setIdDocNumber(ibanInfo.document_number);
  }, [ibanInfo]);

  const memberId = useMemo(() => `BET62-${String((user as any)?.id || '000000').slice(-6).toUpperCase()}`, [user]);

  const handleSaveIdentityDocument = async () => {
    if (!idDocNumber.trim()) { addNotification({ type: 'error', message: 'Preencha o número do documento' }); return; }
    setSavingIdDoc(true);
    try {
      await apiFetch('/api/users/identity-document', {
        method: 'POST',
        body: JSON.stringify({ document_type: idDocType, document_number: idDocNumber.trim() }),
      });
      addNotification({ type: 'success', message: 'Dados de identificação guardados' });
      setIbanInfo((prev) => (prev ? { ...prev, document_type: idDocType, document_number: idDocNumber.trim() } : prev));
    } catch (err: any) {
      addNotification({ type: 'error', message: err?.message || 'Erro ao guardar dados' });
    } finally {
      setSavingIdDoc(false);
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

  // Document statuses are stored uppercase (SUBMITTED/VERIFIED/REJECTED — set by the admin
  // decision endpoint), compared case-insensitively here so an admin approval/rejection actually
  // shows up instead of silently staying stuck on "Em análise".
  const docStatusInfo = (type: string) => {
    const d = latestDocByType(type);
    if (!d) return { label: 'Pendente', ok: false, cls: darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700', icon: '❌' };
    const s = String(d.status || '').toUpperCase();
    if (s === 'VERIFIED') return { label: 'Aprovado', ok: true, cls: 'bg-green-100 text-green-800', icon: '✅' };
    if (s === 'REJECTED') return { label: 'Rejeitado', ok: false, cls: 'bg-red-100 text-red-800', icon: '❌' };
    return { label: 'Em análise', ok: false, cls: 'bg-yellow-100 text-yellow-800', icon: '⏳' };
  };

  const uploadSingleDoc = async (type: 'id_front' | 'id_back' | 'address_proof', file: File) => {
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

  const kycMissing = useMemo(() => {
    const missing: string[] = [];
    if (!idDocNumber.trim()) missing.push('número do documento');
    if (!latestDocByType('id_front')) missing.push('frente do documento');
    if (!latestDocByType('id_back')) missing.push('verso do documento');
    if (!latestDocByType('address_proof')) missing.push('comprovativo de morada');
    return missing;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDocNumber, documents]);

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
    if (selectedItem === 'Suporte e Assistência' && user) {
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

  const toggleSection = (key: string) => setSelectedItem((prev) => (prev === key ? null : key));

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="container mx-auto p-2 md:p-4 max-w-3xl">
        {/* Profile header card */}
        <div className={`rounded-xl border p-5 mb-4 flex items-center gap-4 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
            {firstName.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <div className={`text-lg font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{firstName}</div>
            <div className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{profile?.email || '-'}</div>
            <div className={`text-xs font-mono mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{memberId}</div>
          </div>
        </div>

        {selfExclude && (
          <div className="bg-red-600 text-white p-4 rounded-lg shadow-md animate-pulse mb-4">
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

        <div className="space-y-3">
          {SECTIONS.map(({ key, icon: Icon }) => (
            <AccordionSection key={key} title={key} Icon={Icon} isOpen={selectedItem === key} onToggle={() => toggleSection(key)} darkMode={darkMode}>

              {key === 'Informações Pessoais' && (
                <div>
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
                </div>
              )}

              {key === 'Verificação de Identidade' && (
                <div className="space-y-5">
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    Complete a verificação para desbloquear levantamentos e limites mais elevados. O processo demora até 48 horas úteis.
                  </p>

                  <div className={`rounded-lg border divide-y ${darkMode ? 'border-gray-700 divide-gray-700' : 'border-gray-200 divide-gray-200'}`}>
                    {[
                      { label: 'Email', ok: true },
                      { label: 'NIF / Número de Identificação Fiscal', ok: !!ibanInfo?.nif },
                      { label: 'Documento de Identificação (CC / Passaporte)', ok: docStatusInfo('id_front').ok && docStatusInfo('id_back').ok },
                      { label: 'Comprovativo de Morada', ok: docStatusInfo('address_proof').ok },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between px-3 py-2.5">
                        <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{row.label}</span>
                        <span className={`text-xs font-bold ${row.ok ? 'text-green-500' : (darkMode ? 'text-gray-500' : 'text-gray-400')}`}>{row.ok ? 'Verificado' : 'Não verificado'}</span>
                      </div>
                    ))}
                  </div>

                  {kycStatus !== 'verified' && (
                    <p className={`text-sm font-medium ${darkMode ? 'text-orange-300' : 'text-orange-600'}`}>Para ativar levantamentos, submeta os seus documentos de identificação.</p>
                  )}

                  <div className={`rounded-lg border p-4 ${darkMode ? 'bg-gray-750 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <h3 className={`font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Envio Direto de Documentos</h3>
                    <p className={`text-xs mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>ID de membro: <span className="font-mono">{memberId}</span></p>

                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Tipo de documento</label>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => setIdDocType('cc')}
                        className={`py-2.5 rounded-lg text-sm font-semibold border transition-colors ${idDocType === 'cc' ? 'bg-red-600 border-red-600 text-white' : darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-700'}`}
                      >
                        Cartão de Cidadão
                      </button>
                      <button
                        type="button"
                        onClick={() => setIdDocType('passport')}
                        className={`py-2.5 rounded-lg text-sm font-semibold border transition-colors ${idDocType === 'passport' ? 'bg-red-600 border-red-600 text-white' : darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-700'}`}
                      >
                        Passaporte
                      </button>
                    </div>

                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Número do documento</label>
                    <input
                      type="text"
                      value={idDocNumber}
                      onChange={(e) => setIdDocNumber(e.target.value.toUpperCase())}
                      placeholder={idDocType === 'cc' ? 'Número do CC' : 'Número do Passaporte'}
                      className={`w-full p-3 rounded-lg border mb-3 font-mono ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />

                    <button
                      type="button"
                      onClick={handleSaveIdentityDocument}
                      disabled={savingIdDoc}
                      className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold transition-colors"
                    >
                      {savingIdDoc ? 'A guardar...' : 'Guardar Dados de Identificação'}
                    </button>
                    <p className={`text-xs mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Formatos aceites: PDF, JPG e PNG. Máximo 5MB por ficheiro.</p>
                  </div>

                  <div className={`rounded-lg border p-4 ${kycMissing.length === 0 ? (darkMode ? 'bg-green-900/20 border-green-800' : 'bg-green-50 border-green-200') : (darkMode ? 'bg-orange-900/20 border-orange-800' : 'bg-orange-50 border-orange-200')}`}>
                    <h3 className={`font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Pré-verificação automática</h3>
                    {kycMissing.length === 0 ? (
                      <p className={`text-sm ${darkMode ? 'text-green-300' : 'text-green-700'}`}>Todos os dados e documentos foram submetidos. A aguardar revisão manual.</p>
                    ) : (
                      <>
                        <p className={`text-sm ${darkMode ? 'text-orange-300' : 'text-orange-700'}`}>Faltam dados ou documentos obrigatórios para concluir a pré-verificação automática.</p>
                        <p className={`text-xs mt-1 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>Em falta: {kycMissing.join(', ')}.</p>
                      </>
                    )}
                  </div>

                  {([
                    { type: 'id_front' as const, title: 'Frente do documento', desc: 'Envie a frente do Cartão de Cidadão ou BI.' },
                    { type: 'id_back' as const, title: 'Verso do documento', desc: 'Envie o verso do documento com todos os dados legíveis.' },
                    { type: 'address_proof' as const, title: 'Comprovativo de morada', desc: 'Fatura ou extrato recente com nome e morada.' },
                  ]).map((doc) => {
                    const st = docStatusInfo(doc.type);
                    const existing = latestDocByType(doc.type);
                    return (
                      <div key={doc.type} className={`rounded-lg border p-4 ${darkMode ? 'bg-gray-750 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <h4 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{doc.title}</h4>
                          <span className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${st.cls}`}>{st.icon} {st.label}</span>
                        </div>
                        <p className={`text-sm mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{doc.desc}</p>
                        <p className={`text-xs mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{existing ? existing.filename : 'Nenhum ficheiro enviado.'}</p>
                        <label className="inline-block px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold cursor-pointer transition-colors">
                          Adicionar ficheiro - {doc.title}
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.pdf"
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSingleDoc(doc.type, f); }}
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}

              {key === 'Definições de Segurança' && (
                <div className="space-y-5">
                  <div>
                    <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium`}>Autenticação 2FA</div>
                    <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Estado: {twoFactorEnabled ? 'Ativado' : 'Desativado'}</div>
                    {!twoFactorEnabled && (
                      <button
                        onClick={() => setShow2faSetup(true)}
                        className="mt-2 px-3 py-2 rounded bg-indigo-600 text-white text-sm font-semibold"
                      >
                        Ativar 2FA
                      </button>
                    )}
                  </div>

                  <div className={`p-4 rounded-lg border ${darkMode ? 'bg-green-900/20 border-green-800' : 'bg-green-50 border-green-200'}`}>
                    <div className="flex items-center gap-3 mb-2 text-green-700 dark:text-green-400">
                      <Shield className="w-5 h-5" />
                      <h3 className="font-bold text-sm">Pagamentos Seguros</h3>
                    </div>
                    <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Todas as transações são processadas por entidades de pagamentos autorizadas e seguras (PayPal, Revolut).
                    </p>
                  </div>

                  <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-750 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <h3 className={`font-bold mb-2 text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>Auditoria e Logs</h3>
                    <ul className={`text-sm space-y-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      <li className="flex items-center gap-2"><History className="w-4 h-4" /> Data e Hora de todas as operações</li>
                      <li className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> Método utilizado e Identificador</li>
                      <li className="flex items-center gap-2"><Banknote className="w-4 h-4" /> Valor exato e Estado da transação</li>
                    </ul>
                  </div>
                </div>
              )}

              {key === 'Preferências de Conta' && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setAutoTheme(true)}
                    className={`${autoTheme ? 'bg-blue-600 text-white' : darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800'} px-3 py-2 rounded font-semibold text-sm`}
                  >Modo automático</button>
                  <button
                    onClick={() => setAutoTheme(false)}
                    className={`${!autoTheme ? 'bg-blue-600 text-white' : darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800'} px-3 py-2 rounded font-semibold text-sm`}
                  >Modo manual</button>
                  <button
                    onClick={toggleDarkMode}
                    disabled={autoTheme}
                    className={`${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800'} px-3 py-2 rounded font-semibold text-sm disabled:opacity-50`}
                  >Alternar tema</button>
                </div>
              )}

              {key === 'Limites e Autoexclusão' && (
                <div className="space-y-6">
                  <div>
                    <h3 className={`${darkMode ? 'text-white' : 'text-gray-900'} font-bold mb-2`}>Definir os meus limites</h3>
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
                      className={`mt-3 px-3 py-2 rounded bg-green-600 text-white text-sm font-semibold ${selfExclude ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={selfExclude}
                    >
                      Guardar
                    </button>
                  </div>

                  <div className={`pt-5 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <h3 className={`${darkMode ? 'text-white' : 'text-gray-900'} font-bold mb-2`}>Autoexclusão</h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={selfExclude} onChange={(e) => { if (e.target.checked) { setExcludeConfirmOpen(true); } else { setSelfExclude(false, null); } }} />
                        <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Ativar autoexclusão</span>
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
                      <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-semibold mb-2 text-sm`}>Histórico de autoexclusão</div>
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
                </div>
              )}

              {key === 'Histórico de Atividade' && (
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
              )}

              {key === 'Dados Bancários' && (
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg border ${darkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200'}`}>
                    <h3 className="font-bold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-2 text-sm">
                      <Banknote className="w-5 h-5" /> Regras de Levantamento
                    </h3>
                    <ul className={`text-sm space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      <li>• &lt; €10: Rejeitado automaticamente.</li>
                      <li>• €10 - €300: Processamento automático.</li>
                      <li>• &gt; €300: Agendamento 24h (verificação manual).</li>
                    </ul>
                  </div>
                  <WithdrawForm />
                  {wallets.find((w) => w.currency === 'EUR') && (
                    <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Saldo disponível: €{(wallets.find((w) => w.currency === 'EUR')?.balance || 0).toFixed(2)}</div>
                  )}
                </div>
              )}

              {key === 'Notificações' && (
                <div className={`text-sm space-y-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <p>Enviamos automaticamente uma notificação por email para: confirmação de depósitos, levantamentos processados, e resultados de apostas liquidadas.</p>
                  <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Preferências de notificação avançadas estarão disponíveis brevemente.</p>
                </div>
              )}

              {key === 'Sessões Ativas' && (
                <div className="space-y-3">
                  <div className={`p-3 rounded-lg border flex items-center justify-between ${darkMode ? 'bg-gray-750 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <div>
                      <div className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Este dispositivo</div>
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Sessão ativa agora</div>
                    </div>
                    <Check className="text-green-500 w-5 h-5" />
                  </div>
                  <button onClick={signOut} className="text-sm font-bold text-red-600 hover:underline">Terminar sessão neste dispositivo</button>
                </div>
              )}

              {key === 'Suporte e Assistência' && (
                <div>
                  <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-3 text-sm`}>
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
                        className="px-3 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
                      >Enviar</button>
                    </div>
                  </div>
                </div>
              )}

              {key === 'Configurações de Privacidade' && (
                <div>
                  <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                    {([
                      { k: 'cookies' as const, label: 'Definições de Cookies' },
                      { k: 'terms' as const, label: 'Termos e Condições' },
                      { k: 'privacy' as const, label: 'Política de Privacidade' },
                    ]).map((t) => (
                      <button
                        key={t.k}
                        onClick={() => setPrivacySubTab(t.k)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                          privacySubTab === t.k ? 'bg-blue-600 text-white' : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {privacySubTab === 'cookies' && (
                    <div>
                      <div className="mb-6">
                        <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>O que são cookies?</div>
                        <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                          Cookies são pequenos ficheiros armazenados no seu dispositivo quando visita um website. Servem para garantir o funcionamento do site e melhorar a sua experiência.
                        </div>
                      </div>

                      <div className="mb-6">
                        <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-3`}>Tipos de cookies utilizados</div>

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

                      <button onClick={saveCookies} className="w-full sm:w-auto px-6 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-medium transition-colors">
                        Guardar
                      </button>
                    </div>
                  )}

                  {privacySubTab === 'terms' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      <div>
                        <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>2. Jogo Responsável</div>
                        <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                          <li>Disponibilizamos ferramentas de limites de utilização, notificações e autoexclusão.</li>
                          <li>A autoexclusão impede depósitos, apostas e criação de novos boletins.</li>
                          <li>O cashout poderá permanecer disponível apenas em apostas elegíveis.</li>
                        </ul>
                      </div>
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
                      <div>
                        <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>4. Bónus e Promoções</div>
                        <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                          <li>As promoções podem estar sujeitas a condições específicas, prazos e requisitos.</li>
                          <li>Reservamo-nos o direito de alterar ou cancelar promoções a qualquer momento.</li>
                        </ul>
                      </div>
                      <div>
                        <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>5. Conta e Verificação</div>
                        <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                          <li>O utilizador é responsável por fornecer informações verdadeiras e atualizadas.</li>
                          <li>Poderemos solicitar documentos de identificação, IBAN ou comprovativos adicionais para fins de segurança e conformidade.</li>
                        </ul>
                      </div>
                      <div className="md:col-span-2">
                        <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>6. Suporte e Reclamações</div>
                        <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                          <li>Contacto: <a href="mailto:atendimentoaoclientebet62@gmail.com" className={`underline ${darkMode ? 'text-red-300' : 'text-red-600'}`}>atendimentoaoclientebet62@gmail.com</a></li>
                          <li>Todas as reclamações serão analisadas caso a caso, com resposta por e-mail.</li>
                        </ul>
                      </div>
                      <div className={`md:col-span-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'} text-sm mt-2 pt-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div>Última atualização: <strong>05-01-2026</strong></div>
                        <div className="mt-1">Última validação dos termos: {profile?.terms_accepted_at ? new Date(profile.terms_accepted_at).toLocaleString() : 'não validado'}</div>
                      </div>
                    </div>
                  )}

                  {privacySubTab === 'privacy' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="md:col-span-2">
                        <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>1. Introdução</div>
                        <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                          A presente Política de Privacidade descreve como os dados pessoais dos utilizadores são recolhidos, utilizados e protegidos no âmbito da utilização da plataforma. O tratamento de dados é efetuado em conformidade com o Regulamento Geral sobre a Proteção de Dados (RGPD – UE 2016/679).
                        </div>
                      </div>
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
                      <div>
                        <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>5. Conservação dos Dados</div>
                        <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                          Os dados pessoais são conservados apenas pelo período necessário para as finalidades a que se destinam ou para cumprimento de obrigações legais e regulamentares.
                        </div>
                      </div>
                      <div>
                        <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>6. Partilha de Dados</div>
                        <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm mb-1`}>Os dados poderão ser partilhados apenas com:</div>
                        <ul className={`space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm list-disc pl-4`}>
                          <li>Prestadores de serviços de pagamento (ex.: processamento de depósitos e levantamentos)</li>
                          <li>Entidades legais ou regulatórias, quando exigido por lei</li>
                        </ul>
                        <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm mt-1`}>Nunca vendemos ou cedemos dados pessoais para fins comerciais.</div>
                      </div>
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
                      <div>
                        <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>8. Segurança dos Dados</div>
                        <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                          Adotamos medidas técnicas e organizativas adequadas para proteger os dados pessoais contra acesso não autorizado, perda ou utilização indevida.
                        </div>
                      </div>
                      <div>
                        <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>9. Contacto</div>
                        <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                          Para qualquer questão relacionada com dados pessoais ou privacidade, o utilizador pode contactar-nos através de:
                        </div>
                        <div className="mt-1">
                          <a href="mailto:atendimentoaoclientebet62@gmail.com" className={`underline ${darkMode ? 'text-red-300' : 'text-red-600'}`}>📧 atendimentoaoclientebet62@gmail.com</a>
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <div className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium mb-2`}>10. Alterações à Política de Privacidade</div>
                        <div className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                          Reservamo-nos o direito de atualizar esta Política de Privacidade a qualquer momento. As alterações entram em vigor após a sua publicação na plataforma.
                        </div>
                      </div>
                      <div className={`md:col-span-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'} text-sm mt-2 pt-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div>Última atualização: <strong>05-01-2026</strong></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </AccordionSection>
          ))}
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

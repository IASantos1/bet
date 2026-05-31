import { useState, useEffect } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';

interface KycDocument {
  id: string;
  type: string;
  url: string;
  created_at: string;
  ip_address: string;
  status: string;
}

interface KycProfile {
  kyc_id: string;
  user_id: string;
  email: string;
  username: string;
  full_name: string;
  registration_date: string;
  country: string;
  status: string;
  created_at: string;
  documents: KycDocument[];
}

export default function AdminKycPage() {
  const { isOperator, addNotification, setShowAdminPanel } = useApp();
  const [loading, setLoading] = useState(false);
  const [kycList, setKycList] = useState<KycProfile[]>([]);

  const loadKyc = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<KycProfile[]>('/api/admin/kyc/pending');
      setKycList(data);
    } catch (e) {
      addNotification({ type: 'error', message: 'Erro ao carregar KYC' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOperator) loadKyc();
  }, [isOperator]);

  const handleDecision = async (kycId: string, decision: 'verified' | 'rejected') => {
    const reason = prompt("Motivo da decisão (Obrigatório):");
    if (!reason) return;

    try {
      await apiFetch('/api/admin/kyc/decision', {
        method: 'POST',
        body: JSON.stringify({ kyc_id: kycId, decision, reason })
      });
      addNotification({ type: 'success', message: 'Decisão registada' });
      loadKyc();
    } catch (e) {
      addNotification({ type: 'error', message: 'Erro ao registar decisão' });
    }
  };

  const handleBlockAccount = async (userId: string) => {
      const reason = prompt("Motivo do bloqueio (Obrigatório):");
      if (!reason) return;

      try {
          await apiFetch(`/api/admin/users/${userId}/suspend`, {
              method: 'POST',
              body: JSON.stringify({ reason })
          });
          addNotification({ type: 'success', message: 'Conta bloqueada' });
          loadKyc();
      } catch (e) {
          addNotification({ type: 'error', message: 'Erro ao bloquear conta' });
      }
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-900 min-h-screen">
       <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold dark:text-white">KYC Pendentes</h2>
         <button
          onClick={() => setShowAdminPanel(true)}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-md dark:text-white"
        >Voltar ao Painel</button>
      </div>
      
      {loading ? <p className="dark:text-white">A carregar...</p> : (
        <div className="space-y-8">
          {kycList.length === 0 && <p className="dark:text-gray-400">Nenhum pedido pendente.</p>}
          {kycList.map(k => (
            <div key={k.kyc_id} className="border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden dark:bg-gray-800">
              {/* Header with User Info */}
              <div className="bg-gray-50 dark:bg-gray-750 p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row justify-between gap-4">
                <div>
                   <h3 className="font-bold text-lg dark:text-white">{k.full_name || k.username} <span className="text-sm font-normal text-gray-500">({k.country || 'N/A'})</span></h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm mt-2">
                       <p className="text-gray-600 dark:text-gray-300">Email: <span className="font-mono">{k.email}</span></p>
                       <p className="text-gray-600 dark:text-gray-300">Registo: {k.registration_date ? new Date(k.registration_date).toLocaleDateString() : 'N/A'}</p>
                       <p className="text-gray-600 dark:text-gray-300">Pedido KYC: {new Date(k.created_at).toLocaleString()}</p>
                       <p className="text-gray-600 dark:text-gray-300">Estado: <span className="uppercase font-bold text-blue-600">{k.status}</span></p>
                   </div>
                </div>
                <div className="flex flex-col gap-2 justify-center min-w-[140px]">
                  <button 
                    onClick={() => handleDecision(k.kyc_id, 'verified')}
                    className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 transition-colors shadow-sm"
                  >✅ Aprovar</button>
                  <button 
                    onClick={() => handleDecision(k.kyc_id, 'rejected')}
                    className="px-4 py-2 bg-red-600 text-white rounded font-semibold hover:bg-red-700 transition-colors shadow-sm"
                  >❌ Rejeitar</button>
                  <button 
                    onClick={() => handleBlockAccount(k.user_id)}
                    className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700 transition-colors shadow-sm text-xs"
                  >⛔ Bloquear conta</button>
                </div>
              </div>
              
              {/* Documents Section */}
              <div className="p-4 bg-white dark:bg-gray-800">
                <h4 className="font-semibold mb-3 dark:text-white text-sm uppercase tracking-wide text-gray-500">Documentos Enviados</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {k.documents.map((d, i) => (
                    <div key={i} className="border border-gray-200 dark:border-gray-600 rounded p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-sm dark:text-gray-200">{d.type}</span>
                            <span className="text-xs text-gray-400">{new Date(d.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="text-xs text-gray-500 mb-3 font-mono">IP: {d.ip_address || 'N/A'}</div>
                        <a 
                          href={d.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="block w-full text-center py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50"
                        >
                          👁️ Preview / Download
                        </a>
                    </div>
                  ))}
                  {k.documents.length === 0 && (
                      <div className="col-span-full text-gray-500 italic text-sm">Sem documentos.</div>
                  )}
                </div>
                
                {/* Notes Field (Visual only for now, could be wired to a backend update) */}
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                     <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Observações (Interno)</label>
                     <textarea 
                        className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-900 dark:text-gray-300" 
                        placeholder="Notas sobre a verificação..."
                        rows={2}
                     ></textarea>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

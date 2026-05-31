import { useEffect, useState } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';

export default function AdminWithdrawalsPage() {
    const { darkMode, addNotification } = useApp();
    const [withdrawals, setWithdrawals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchWithdrawals = async () => {
        try {
            const data = await apiFetch<{ success: boolean; withdrawals: any[] }>('/api/admin/withdrawals');
            if (data.success) {
                setWithdrawals(data.withdrawals);
            } else {
                addNotification({ type: 'error', message: 'Erro ao carregar dados' });
            }
        } catch (e) {
            addNotification({ type: 'error', message: 'Erro de rede' });
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (id: string) => {
        if (!confirm('Confirmar aprovação manual deste levantamento?')) return;
        try {
            await apiFetch(`/api/admin/withdrawals/${id}/approve`, { method: 'POST' });
            addNotification({ type: 'success', message: 'Levantamento aprovado' });
            fetchWithdrawals();
        } catch (e: any) {
            addNotification({ type: 'error', message: e.message || 'Erro ao aprovar' });
        }
    };

    const handleReject = async (id: string) => {
        const reason = prompt('Motivo da rejeição (será enviado ao utilizador):');
        if (!reason) return;

        try {
             await apiFetch(`/api/admin/withdrawals/${id}/reject`, { 
                 method: 'POST',
                 body: JSON.stringify({ reason })
             });
             addNotification({ type: 'success', message: 'Levantamento rejeitado e saldo devolvido' });
             fetchWithdrawals();
        } catch (e: any) {
             addNotification({ type: 'error', message: e.message || 'Erro ao rejeitar' });
        }
    };

    useEffect(() => {
        fetchWithdrawals();
        const interval = setInterval(fetchWithdrawals, 30000);
        return () => clearInterval(interval);
    }, []);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'AUTHORIZED': return 'text-green-600 bg-green-100';
            case 'PAID': return 'text-blue-600 bg-blue-100';
            case 'REQUESTED': return 'text-yellow-600 bg-yellow-100';
            case 'REJECTED': return 'text-red-600 bg-red-100';
            default: return 'text-gray-600 bg-gray-100';
        }
    };

    return (
        <div className={`min-h-screen p-6 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold">Gestão de Levantamentos</h1>
                    <button onClick={fetchWithdrawals} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        Atualizar
                    </button>
                </div>

                <div className={`rounded-xl shadow-sm overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className={`text-xs uppercase ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                                <tr>
                                    <th className="px-6 py-3">Data</th>
                                    <th className="px-6 py-3">Utilizador</th>
                                    <th className="px-6 py-3">Valor</th>
                                    <th className="px-6 py-3">IBAN / Titular</th>
                                    <th className="px-6 py-3">Estado</th>
                                    <th className="px-6 py-3">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} className="px-6 py-4 text-center">A carregar...</td></tr>
                                ) : withdrawals.length === 0 ? (
                                    <tr><td colSpan={6} className="px-6 py-4 text-center">Nenhum levantamento encontrado</td></tr>
                                ) : (
                                    withdrawals.map((w) => (
                                        <tr key={w.id} className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                                            <td className="px-6 py-4">
                                                {new Date(w.created_at).toLocaleString('pt-PT')}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium">{w.username}</div>
                                                <div className="text-xs text-gray-500">{w.email}</div>
                                            </td>
                                            <td className="px-6 py-4 font-mono font-bold">
                                                €{w.amount_eur.toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-mono">{w.iban}</div>
                                                <div className="text-xs">{w.holder_name}</div>
                                                <div className="text-xs text-gray-500">{w.bank_name}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(w.status)}`}>
                                                    {w.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {w.status === 'REQUESTED' || w.status === 'IBAN_PENDING_REVIEW' ? (
                                                    <div className="flex gap-2">
                                                        <button 
                                                            onClick={() => handleApprove(w.id)}
                                                            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs"
                                                        >
                                                            Aprovar
                                                        </button>
                                                        <button 
                                                            onClick={() => handleReject(w.id)}
                                                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs"
                                                        >
                                                            Rejeitar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

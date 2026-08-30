import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';
import { AlertTriangle, Shield, RefreshCw } from 'lucide-react';

interface SelectionExposure {
  selection: string;
  liability: number;
  betCount: number;
}

interface EventExposure {
  eventId: string;
  teamMatch?: string;
  league?: string;
  liability: number;
  betCount: number;
  bySelection: SelectionExposure[];
}

interface ExposureReport {
  totalLiability: number;
  totalPendingBets: number;
  byEvent: EventExposure[];
}

export default function AdminRisk() {
  const { darkMode } = useApp();
  const [report, setReport] = useState<ExposureReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExposure = useCallback(async () => {
    try {
      setError(null);
      const data = await apiFetch<ExposureReport>('/api/admin/risk/exposure');
      setReport(data);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar exposição');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExposure();
    const id = setInterval(fetchExposure, 15000);
    return () => clearInterval(id);
  }, [fetchExposure]);

  const maxLiability = report?.byEvent[0]?.liability || 1;

  return (
    <div className={`min-h-screen p-6 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-8 h-8 text-blue-500" />
            Exposição de Risco
          </h1>
          <div className="flex items-center gap-3">
            <div className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow`}>
              <span className="text-sm text-gray-500 dark:text-gray-400">Apostas pendentes</span>
              <div className="text-xl font-bold">{report?.totalPendingBets ?? '—'}</div>
            </div>
            <div className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow`}>
              <span className="text-sm text-gray-500 dark:text-gray-400">Passivo total</span>
              <div className="text-xl font-bold text-red-500">
                {report ? `€${report.totalLiability.toFixed(2)}` : '—'}
              </div>
            </div>
            <button
              onClick={fetchExposure}
              className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
              title="Atualizar"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </header>

        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Quanto a casa pagaria se cada aposta pendente ganhasse, agrupado por evento e seleção (spec §25).
          Numa aposta múltipla o passivo total é atribuído a cada evento envolvido — um limite superior
          conservador, não o valor exato, já que a probabilidade conjunta das seleções não é modelada.
        </p>

        {error && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className={`rounded-xl shadow overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          {loading ? (
            <div className="p-8 text-center text-gray-500">A carregar…</div>
          ) : !report || report.byEvent.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Sem exposição — nenhuma aposta pendente.</div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {report.byEvent.map((ev) => (
                <div key={ev.eventId} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-semibold">{ev.teamMatch || `Evento ${ev.eventId}`}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {ev.league || '—'} · {ev.betCount} apostas
                      </div>
                    </div>
                    <div className="text-lg font-bold text-red-500">€{ev.liability.toFixed(2)}</div>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 mb-3 overflow-hidden">
                    <div
                      className="h-full bg-red-500"
                      style={{ width: `${Math.min(100, (ev.liability / maxLiability) * 100)}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ev.bySelection.map((sel) => (
                      <span
                        key={sel.selection}
                        className={`text-xs px-2 py-1 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
                      >
                        {sel.selection}: €{sel.liability.toFixed(2)} ({sel.betCount})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

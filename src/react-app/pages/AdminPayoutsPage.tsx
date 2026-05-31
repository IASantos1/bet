import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/react-app/contexts/AppContext'
import { apiFetch } from '@/react-app/utils/api'
import { CURRENCIES } from '@/shared/constants'

type Payout = {
  id: number
  date: string
  amount_eur: number
  amount_usdt: number
  eur_per_usdt: number
  external_id?: string | null
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED'
  swift?: string | null
  iban?: string | null
  holder_name?: string | null
  currency?: string | null
  reference?: string | null
  created_at: string
}

export default function AdminPayoutsPage() {
  const { darkMode, isOperator, addNotification } = useApp()
  const [loading, setLoading] = useState(false)
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [original, setOriginal] = useState<Record<number, Payout>>({})
  const [filterDate, setFilterDate] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const ctrlRef = useRef<AbortController | null>(null)
  const inflightRef = useRef<boolean>(false)
  const [createDate, setCreateDate] = useState<string>(new Date().toISOString().slice(0, 10))

  const load = async () => {
    if (!isOperator) return
    if (inflightRef.current) return
    try {
      setLoading(true)
      inflightRef.current = true
      const ac = new AbortController()
      ctrlRef.current = ac
      const j = await apiFetch<{ payouts: Payout[] }>('/api/admin/profit/payouts', { 
        cache: 'no-store', 
        signal: ac.signal
      })
      const arr = Array.isArray(j.payouts) ? j.payouts : []
      setPayouts(arr)
      const base: Record<number, Payout> = {}
      for (const p of arr) base[p.id] = p
      setOriginal(base)
    } catch (e: any) {
      if (e.message?.includes('403')) {
        addNotification({ type: 'error', message: 'Sem permissão' })
      } else if (e.message?.includes('401')) {
        addNotification({ type: 'error', message: 'Autenticação necessária' })
      } else {
        setPayouts([])
      }
    } finally {
      setLoading(false)
      inflightRef.current = false
    }
  }

  const createPayout = async () => {
    if (!isOperator) return
    try {
      await apiFetch('/api/admin/profit/payout', { 
        method: 'POST', 
        body: JSON.stringify({ date: createDate })
      })
      addNotification({ type: 'success', message: 'Payout criado' })
      load()
    } catch (e: any) {
      if (e.message?.includes('403')) {
        addNotification({ type: 'error', message: 'Sem permissão' })
      } else if (e.message?.includes('401')) {
        addNotification({ type: 'error', message: 'Autenticação necessária' })
      } else {
        addNotification({ type: 'error', message: 'Falha ao criar payout' })
      }
    }
  }

  useEffect(() => {
    let stopped = false
    load()
    const t = setInterval(() => { if (!stopped) load() }, 30000)
    return () => { stopped = true; clearInterval(t); if (ctrlRef.current) ctrlRef.current.abort() }
  }, [isOperator])

  const setLocalStatus = (id: number, status: Payout['status']) => {
    setPayouts(prev => prev.map(p => p.id === id ? { ...p, status } : p))
  }

  const setLocalField = (id: number, field: keyof Payout, value: string) => {
    setPayouts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } as Payout : p))
  }

  const updateStatus = async (row: Payout) => {
    try {
      const j = await apiFetch<{ payout?: Payout }>(`/api/admin/profit/payouts/${row.id}/status`, { 
        method: 'POST', 
        body: JSON.stringify({
          status: row.status,
          external_id: row.external_id || '',
          swift: row.swift || '',
          iban: row.iban || '',
          holder_name: row.holder_name || '',
          currency: row.currency || '',
          reference: row.reference || '',
        })
      })
      if (j?.payout) setPayouts(prev => prev.map(p => p.id === row.id ? j.payout! : p))
      addNotification({ type: 'success', message: 'Estado atualizado' })
    } catch (e: any) {
      if (e.message?.includes('403')) {
        addNotification({ type: 'error', message: 'Sem permissão' })
      } else if (e.message?.includes('401')) {
        addNotification({ type: 'error', message: 'Autenticação necessária' })
      } else {
        addNotification({ type: 'error', message: 'Falha ao atualizar estado' })
      }
    }
  }

  const isIbanValid = (s: string) => {
    const v = String(s || '').replace(/\s+/g, '').toUpperCase()
    if (!v || v.length < 15 || v.length > 34) return false
    if (!/^[A-Z0-9]+$/.test(v)) return false
    const rearranged = v.slice(4) + v.slice(0, 4)
    let num = ''
    for (const ch of rearranged) {
      const code = ch.charCodeAt(0)
      if (code >= 65 && code <= 90) num += String(code - 55)
      else num += ch
    }
    let remainder = 0
    for (let i = 0; i < num.length; i += 7) {
      const part = String(remainder) + num.slice(i, i + 7)
      remainder = Number(BigInt(part) % BigInt(97))
    }
    return remainder === 1
  }

  const currencies = Object.values(CURRENCIES)
  const isCurrencyValid = (s: string | null | undefined) => currencies.includes(String(s || '').toUpperCase())
  const isChanged = (row: Payout) => {
    const o = original[row.id]
    if (!o) return true
    return (
      (row.status !== o.status) ||
      (String(row.external_id || '') !== String(o.external_id || '')) ||
      (String(row.swift || '') !== String(o.swift || '')) ||
      (String(row.iban || '') !== String(o.iban || '')) ||
      (String(row.holder_name || '') !== String(o.holder_name || '')) ||
      (String(row.currency || '') !== String(o.currency || '')) ||
      (String(row.reference || '') !== String(o.reference || ''))
    )
  }
  const resetRow = (id: number) => {
    const o = original[id]
    if (!o) return
    setPayouts(prev => prev.map(p => p.id === id ? { ...o } : p))
  }

  if (!isOperator) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Acesso restrito</div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="mx-auto px-4 py-6">
        <div className={`rounded-2xl p-5 shadow-xl ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
          <div className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Pagamentos de Lucros</div>
          {loading && (
            <div className={`text-sm mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>A carregar...</div>
          )}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div>
              <div className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Data</div>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className={`${darkMode ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-300'} rounded px-2 py-1 text-sm`}
              />
            </div>
            <div>
              <div className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Estado</div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className={`${darkMode ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-300'} rounded px-2 py-1 text-sm`}
              >
                <option value="">Todos</option>
                <option value="PENDING">Pendente</option>
                <option value="PROCESSING">Processando</option>
                <option value="SENT">Enviado</option>
                <option value="FAILED">Falhou</option>
              </select>
            </div>
            <div className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Total: {payouts.filter(p => (!filterDate || p.date === filterDate) && (!filterStatus || p.status === filterStatus)).length}</div>
            <button
              onClick={() => { setFilterDate(''); setFilterStatus(''); }}
              className={`px-3 py-1 rounded text-sm ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-900'}`}
            >
              Limpar
            </button>
            <div className="ml-auto flex items-end gap-2">
              <div>
                <div className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Criar payout (Data)</div>
                <input
                  type="date"
                  value={createDate}
                  onChange={(e) => setCreateDate(e.target.value)}
                  className={`${darkMode ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-300'} rounded px-2 py-1 text-sm`}
                />
              </div>
              <button
                onClick={createPayout}
                className={`px-3 py-2 rounded text-sm ${darkMode ? 'bg-red-600 text-white' : 'bg-red-600 text-white'}`}
              >
                Criar payout
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className={`min-w-full text-sm ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
              <thead>
                <tr className={darkMode ? 'bg-gray-700' : 'bg-gray-100'}>
                  <th className="p-2 text-left">Data</th>
                  <th className="p-2 text-left">EUR</th>
                  <th className="p-2 text-left">USDT</th>
                  <th className="p-2 text-left">EUR/USDT</th>
                  <th className="p-2 text-left">External ID</th>
                  <th className="p-2 text-left">SWIFT</th>
                  <th className="p-2 text-left">IBAN</th>
                  <th className="p-2 text-left">Titular</th>
                  <th className="p-2 text-left">Moeda</th>
                  <th className="p-2 text-left">Referência</th>
                  <th className="p-2 text-left">Estado</th>
                  <th className="p-2 text-left">Ação</th>
                </tr>
              </thead>
              <tbody>
                {payouts.filter(p => (!filterDate || p.date === filterDate) && (!filterStatus || p.status === filterStatus)).length === 0 ? (
                  <tr>
                    <td colSpan={12} className={`p-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Sem pagamentos</td>
                  </tr>
                ) : payouts.filter(p => (!filterDate || p.date === filterDate) && (!filterStatus || p.status === filterStatus)).map(p => (
                  <tr key={p.id} className={`${darkMode ? 'border-t border-gray-700' : 'border-t border-gray-200'} ${isChanged(p) ? (darkMode ? 'bg-yellow-900/20' : 'bg-yellow-50') : ''}`}>
                    <td className="p-2">{p.date}</td>
                    <td className="p-2">€{p.amount_eur.toFixed(2)}</td>
                    <td className="p-2">{p.amount_usdt.toFixed(2)}</td>
                    <td className="p-2">{p.eur_per_usdt.toFixed(4)}</td>
                    <td className="p-2">
                      <input
                        value={p.external_id || ''}
                        onChange={(e) => setLocalField(p.id, 'external_id', e.target.value)}
                        className={`${darkMode ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-300'} rounded px-2 py-1 w-48`}
                        placeholder="external id"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={p.swift || ''}
                        onChange={(e) => setLocalField(p.id, 'swift', e.target.value)}
                        className={`${darkMode ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-300'} rounded px-2 py-1 w-32`}
                        placeholder="SWIFT"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={p.iban || ''}
                        onChange={(e) => setLocalField(p.id, 'iban', e.target.value)}
                        className={`${darkMode ? 'bg-gray-800 text-white border ' : 'bg-white text-gray-900 border '} ${isIbanValid(p.iban || '') ? (darkMode ? 'border-gray-700' : 'border-gray-300') : 'border-red-500'} rounded px-2 py-1 w-56`}
                        placeholder="IBAN"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={p.holder_name || ''}
                        onChange={(e) => setLocalField(p.id, 'holder_name', e.target.value)}
                        className={`${darkMode ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-300'} rounded px-2 py-1 w-56`}
                        placeholder="Titular"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={String(p.currency || '').toUpperCase()}
                        onChange={(e) => setLocalField(p.id, 'currency', e.target.value)}
                        className={`${darkMode ? 'bg-gray-800 text-white border ' : 'bg-white text-gray-900 border '} ${isCurrencyValid(p.currency) ? (darkMode ? 'border-gray-700' : 'border-gray-300') : 'border-red-500'} rounded px-2 py-1 w-24`}
                      >
                        {currencies.map(c => (<option key={c} value={c}>{c}</option>))}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        value={p.reference || ''}
                        onChange={(e) => setLocalField(p.id, 'reference', e.target.value)}
                        className={`${darkMode ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-300'} rounded px-2 py-1 w-48`}
                        placeholder="Referência"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={p.status}
                        onChange={(e) => setLocalStatus(p.id, e.target.value as Payout['status'])}
                        className={`${darkMode ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-300'} rounded px-2 py-1`}
                      >
                        <option value="PENDING">Pendente</option>
                        <option value="PROCESSING">Processando</option>
                        <option value="SENT">Enviado</option>
                        <option value="FAILED">Falhou</option>
                      </select>
                    </td>
                    <td className="p-2 space-x-2">
                      {isChanged(p) && (
                        <span className={`inline-block align-middle text-xs px-2 py-1 rounded ${darkMode ? 'bg-yellow-800 text-yellow-100' : 'bg-yellow-200 text-yellow-800'}`}>Alterado</span>
                      )}
                      <button
                        onClick={() => updateStatus(p)}
                        disabled={!isChanged(p) || !isIbanValid(p.iban || '') || !isCurrencyValid(p.currency)}
                        className={`px-3 py-1 rounded ${darkMode ? 'bg-red-600 text-white' : 'bg-red-600 text-white'} disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        Atualizar
                      </button>
                      <button
                        onClick={() => resetRow(p.id)}
                        className={`px-3 py-1 rounded ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-900'}`}
                      >
                        Reverter
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
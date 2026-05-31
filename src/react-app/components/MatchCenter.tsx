import { useEffect, useState } from 'react'
import { useApp } from '@/react-app/contexts/AppContext'
import { apiFetch } from '@/react-app/utils/api'
import type { MatchDetail } from '@/shared/types'
import { abbreviateTeamName } from '@/shared/helpers'

export function MatchCenter({ event, initialMatch, darkMode }: { event: any; initialMatch?: MatchDetail; darkMode: boolean }) {
  const [data, setData] = useState<MatchDetail | undefined>(initialMatch)
  const { addToBetSlip, addNotification } = useApp();
  const [markets, setMarkets] = useState<Record<string, any>>({});

  useEffect(() => {
    const run = async () => {
      if (!event) return
      if (data) return
      try {
        const lg = String(event.league || '')
        const mx = String(event.match || '')
        const s = `${lg} ${mx}`.toLowerCase()
        let sKey = 'soccer_epl'
        if (s.includes('nba')) sKey = 'basketball_nba'
        else if (s.includes('nfl')) sKey = 'americanfootball_nfl'
        else if (s.includes('mlb')) sKey = 'baseball_mlb'
        else if (s.includes('nhl')) sKey = 'icehockey_nhl'
        else if (s.includes('tennis') || s.includes('atp') || s.includes('wta')) sKey = 'tennis_atp'
        else if (s.includes('brasil') || s.includes('série a') || s.includes('serie a')) sKey = 'soccer_brazil_campeonato_brasileiro_serie_a'
        else if (s.includes('portugal') || s.includes('liga portugal') || s.includes('primeira liga')) sKey = 'soccer_portugal_primeira_liga'
        else if (s.includes('la liga') || s.includes('espanha') || s.includes('spain')) sKey = 'soccer_spain_la_liga'
        else if (s.includes('ligue 1') || s.includes('frança') || s.includes('france')) sKey = 'soccer_france_ligue_1'
        else if (s.includes('bundesliga') || s.includes('germany') || s.includes('alem')) sKey = 'soccer_germany_bundesliga'
        else if (s.includes('eredivisie') || s.includes('netherlands') || s.includes('hol')) sKey = 'soccer_netherlands_eredivisie'
        else if (s.includes('mls') || s.includes('usa')) sKey = 'soccer_usa_mls'
        const params = new URLSearchParams()
        params.set('fixture_id', String(0))
        params.set('home_id', String(0))
        params.set('away_id', String(0))
        params.set('home_name', String(event.home_team || (event.match || '').split(' vs ')[0] || ''))
        params.set('away_name', String(event.away_team || (event.match || '').split(' vs ')[1] || ''))
        params.set('date', String(event.event_date || ''))
        params.set('competition', lg)
        params.set('season', '')
        params.set('sport', event.sport || 'Soccer')
        params.set('odds_sport_key', sKey)
        const j = await apiFetch<MatchDetail>(`/api/match-detail?${params.toString()}`, { cache: 'no-store' })
        setData(j)
      } catch { /* no-op */ }
    }
    run()
  }, [event, data])

  // Removed live refresh: no polling for in-play data

  useEffect(() => {
    if (!event) { setMarkets({}); return }
    const ac = new AbortController()
    const fetchOdds = async () => {
      try {
        const evId = encodeURIComponent(String(event.external_event_id || event.id || ''))
        const j = await apiFetch<any>(`/api/events/${evId}/odds?realtime=1`, { signal: ac.signal, cache: 'no-store' })
        const m = j && j.markets ? j.markets : {}
        if (m && typeof m === 'object') setMarkets(m)
      } catch { setMarkets({}) }
    }
    fetchOdds()
    const status = String(event?.status?.short || event?.status || event?.fixture?.status?.short || '').toUpperCase().trim()
    const isLive = Number(event?.is_live || 0) === 1 || new Set([
      'LIVE', '1H', '2H', 'HT', 'ET', 'BT', 'P',
      'Q1', 'Q2', 'Q3', 'Q4', 'OT',
      'P1', 'P2', 'P3',
      'S1', 'S2', 'S3', 'S4', 'S5',
      'IN', 'IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'IN8', 'IN9',
      'IN_PROGRESS',
    ]).has(status)
    const t = isLive ? setInterval(fetchOdds, 5000) : null
    return () => { if (t) clearInterval(t); ac.abort() }
  }, [event])

  // Removed realtime odds polling for live events

  const md = data
  const isPlaceholder = String(md?.match?.probabilities?.source || '') === 'Dev placeholder'

  if (!md) {
    return (
      <div className="mt-3">
        <p className={`text-lg font-bold mb-2 text-center ${darkMode ? 'text-white' : 'text-gray-900'}`}>Match Center</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg p-3`}>
            <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>Resultados</p>
            <div className={`${darkMode ? 'text-gray-200' : 'text-gray-800'} text-sm mt-1`}>
              <p>{event?.score ? String(event?.score) : '—'}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3">
      <p className={`text-lg font-bold mb-2 text-center ${darkMode ? 'text-white' : 'text-gray-900'}`}>Match Center</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg p-3`}>
          <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>Resultados</p>
          <div className={`${darkMode ? 'text-gray-200' : 'text-gray-800'} text-sm mt-1`}>
            <p>{event?.score ? String(event?.score) : '—'}</p>
          </div>
        </div>
        {!isPlaceholder && (
          <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg p-3`}>
            <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>Probabilidades</p>
            <div className={`${darkMode ? 'text-gray-200' : 'text-gray-800'} text-sm mt-1 space-y-1`}>
              <p>Casa: {Number(md.match?.probabilities?.home_win || 0).toFixed(0)}%</p>
              <p>Empate: {Number(md.match?.probabilities?.draw || 0).toFixed(0)}%</p>
              <p>Fora: {Number(md.match?.probabilities?.away_win || 0).toFixed(0)}%</p>
            </div>
          </div>
        )}
        {(() => {
          const arr = (k: string) => {
            const v = (markets as any)?.[k]
            return Array.isArray(v) ? v : []
          }
          const pickPrice = (o: any) => {
            const p = Number((o?.price ?? o?.odd ?? o?.value ?? 0))
            return Number.isFinite(p) ? p : 0
          }
          const pickName = (o: any) => String(o?.name ?? o?.label ?? o?.outcome ?? '')
          const dc = arr('double_chance')
          const dnb = arr('dnb')
          const totals = arr('totals')
          const btts = arr('btts')
          const handicap = (() => { const h = arr('handicap'); return h.length ? h : arr('spreads') })()
          const altTotals = arr('alternate_totals')
          const any = dc.length || dnb.length || totals.length || btts.length || handicap.length || altTotals.length
          if (!any) return null
          const addSel = (label: string, price: number) => {
            if (!(price > 0)) { addNotification({ type: 'warning', message: 'Odd indisponível' }); return }
            const idStr = `ev-${event.id}-${label.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`
            addToBetSlip({ id: idStr, event_id: Number(event.id), match: String(event.match || `${event.home_team} vs ${event.away_team}`), selection: label, odd: price, stake: 0 })
            try { localStorage.setItem(`event_odds_${event.id}`, JSON.stringify({ sport: 'soccer' })) } catch { /* no-op */ }
          }
          const renderDc = dc.slice(0, 3).map((o: any, i: number) => {
            const name = pickName(o)
            const p = pickPrice(o)
            const label = `Dupla Chance ${name}`
            return (
              <button key={`dc-${i}`} onClick={(e) => { e.stopPropagation(); addSel(label, p) }} className="text-xs px-2 py-0.5 rounded bg-indigo-600 text-white hover:opacity-90">{name} {p>0?p.toFixed(2):'-'}</button>
            )
          })
          const renderDnb = dnb.slice(0, 2).map((o: any, i: number) => {
            const name = pickName(o)
            const p = pickPrice(o)
            const label = `DNB ${name}`
            return (
              <button key={`dnb-${i}`} onClick={(e) => { e.stopPropagation(); addSel(label, p) }} className="text-xs px-2 py-0.5 rounded bg-teal-600 text-white hover:opacity-90">{name} {p>0?p.toFixed(2):'-'}</button>
            )
          })
          const pick25 = (() => {
            for (const o of totals) {
              const n = pickName(o).toLowerCase()
              if (n.includes('2.5') || n.includes('2,5')) return o
            }
            return totals[0]
          })()
          const renderTotals = pick25 ? (() => {
            const n = pickName(pick25)
            const p = pickPrice(pick25)
            const label = `Totais ${n}`
            return (
              <button onClick={(e) => { e.stopPropagation(); addSel(label, p) }} className="text-xs px-2 py-0.5 rounded bg-amber-600 text-white hover:opacity-90">{n} {p>0?p.toFixed(2):'-'}</button>
            )
          })() : null
          const renderBtts = btts.slice(0, 2).map((o: any, i: number) => {
            const n = pickName(o)
            const p = pickPrice(o)
            const label = `BTTS ${n}`
            return (
              <button key={`btts-${i}`} onClick={(e) => { e.stopPropagation(); addSel(label, p) }} className="text-xs px-2 py-0.5 rounded bg-purple-600 text-white hover:opacity-90">{n} {p>0?p.toFixed(2):'-'}</button>
            )
          })
          const renderHandicap = handicap.slice(0, 2).map((o: any, i: number) => {
            const n = pickName(o)
            const p = pickPrice(o)
            const label = `Handicap ${n}`
            return (
              <button key={`hcp-${i}`} onClick={(e) => { e.stopPropagation(); addSel(label, p) }} className="text-xs px-2 py-0.5 rounded bg-sky-700 text-white hover:opacity-90">{n} {p>0?p.toFixed(2):'-'}</button>
            )
          })
          const renderAltTotals = altTotals.slice(0, 2).map((o: any, i: number) => {
            const n = pickName(o)
            const p = pickPrice(o)
            const label = `Totais Alt ${n}`
            return (
              <button key={`alt-${i}`} onClick={(e) => { e.stopPropagation(); addSel(label, p) }} className="text-xs px-2 py-0.5 rounded bg-slate-700 text-white hover:opacity-90">{n} {p>0?p.toFixed(2):'-'}</button>
            )
          })
          return (
            <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg p-3`}>
              <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>Mercados</p>
              <div className="mt-2 flex items-center justify-start gap-2 flex-wrap">
                {renderDc}
                {renderDnb}
                {renderTotals}
                {renderBtts}
                {renderHandicap}
                {renderAltTotals}
              </div>
            </div>
          )
        })()}
        <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg p-3`}>
          <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>Head to Head</p>
          <div className={`${darkMode ? 'text-gray-200' : 'text-gray-800'} text-sm mt-1 space-y-1`}>
            {(md.match?.head_to_head || []).map((h, i) => (
              <p key={`${h.date}-${i}`}>{h.date} · {abbreviateTeamName(h.home_team)} {h.score} {abbreviateTeamName(h.away_team)}</p>
            ))}
          </div>
        </div>
        <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg p-3`}>
          <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>Classificação</p>
          <div className={`${darkMode ? 'text-gray-200' : 'text-gray-800'} text-sm mt-1 space-y-1`}>
            <p>Casa: #{Number(md.match?.league_standings?.home_team?.position || 0)} · {Number(md.match?.league_standings?.home_team?.points || 0)} pts</p>
            <p>Fora: #{Number(md.match?.league_standings?.away_team?.position || 0)} · {Number(md.match?.league_standings?.away_team?.points || 0)} pts</p>
          </div>
        </div>
      </div>
      <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg p-3 mt-3`}>
        <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>Estatísticas</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          <div>
            <p className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{abbreviateTeamName(md.match?.teams?.home?.name || 'Casa')}</p>
            <div className={`${darkMode ? 'text-gray-200' : 'text-gray-800'} text-sm mt-1 space-y-1`}>
              {(md.match?.teams?.home?.statistics?.fixture_statistics || []).slice(0,8).map((s, i) => (
                <p key={`hs-${i}`}>{s.type}: {typeof s.value === 'number' ? s.value : String(s.value)}</p>
              ))}
            </div>
          </div>
          <div>
            <p className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{abbreviateTeamName(md.match?.teams?.away?.name || 'Fora')}</p>
            <div className={`${darkMode ? 'text-gray-200' : 'text-gray-800'} text-sm mt-1 space-y-1`}>
              {(md.match?.teams?.away?.statistics?.fixture_statistics || []).slice(0,8).map((s, i) => (
                <p key={`as-${i}`}>{s.type}: {typeof s.value === 'number' ? s.value : String(s.value)}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

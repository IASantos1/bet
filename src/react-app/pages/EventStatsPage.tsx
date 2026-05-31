import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '@/react-app/contexts/AppContext'
import { BetSlip } from '@/react-app/components/BetSlip'
import FootballPitchAnimation from '@/react-app/components/FootballPitchAnimation'
import LiveMomentumSticksGraph from '@/react-app/components/LiveMomentumSticksGraph'
import MatchTracker from '@/react-app/components/MatchTracker'
import { Sidebar } from '@/react-app/components/Sidebar'
import { useLiveFeed } from '@/react-app/hooks/useLiveFeed'
import { useMergedEvents } from '@/react-app/hooks/useMergedEvents'
import { useSportsEvents } from '@/react-app/hooks/useSportsEvents'
import { useTopLeagues } from '@/react-app/hooks/useTopLeagues'
import { useUpcomingCache } from '@/react-app/hooks/useUpcomingCache'
import { apiFetch } from '@/react-app/utils/api'
import type { Event } from '@/shared/types'

export default function EventStatsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { darkMode, selectedCategory, showMobileSidebar, setShowMobileSidebar } = useApp()
  const [event, setEvent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [liveStats, setLiveStats] = useState<{ stats: any; events: any[] }>({ stats: [], events: [] })
  const [standingsData, setStandingsData] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'dominance' | 'stats' | 'standings'>('dominance')

  const { live, pregame, loading: eventsLoading } = useSportsEvents(selectedCategory || null)
  const { upcomingEvents } = useUpcomingCache(pregame)
  const { liveEvents: wsLiveEvents } = useLiveFeed(selectedCategory || 'all')
  const mergedSidebarLive = useMergedEvents(live, wsLiveEvents)
  const activeTopLeagues = useTopLeagues(mergedSidebarLive, upcomingEvents)

  const localEventsReady = !eventsLoading && (live.length > 0 || pregame.length > 0 || upcomingEvents.length > 0)

  const localFoundEvent = useMemo(() => {
    if (!id) return null
    const all = [...live, ...pregame, ...upcomingEvents]
    return (
      all.find(
        (e: any) => String(e.id) === String(id) || String(e.external_event_id) === String(id)
      ) || null
    )
  }, [id, live, pregame, upcomingEvents])

  useEffect(() => {
    if (localFoundEvent) {
      setEvent(localFoundEvent)
      setLoading(false)
      setError(null)
    }
  }, [localFoundEvent])

  const mergedEventList = useMergedEvents(event ? [event] : [], wsLiveEvents)

  const displayEvent = useMemo(() => {
    if (!event) return null
    return (
      mergedEventList.find(
        (e: any) =>
          String(e.id) === String(event.id) ||
          String(e.external_event_id) === String(event.id) ||
          String(e.fixture?.id) === String(event.id)
      ) || event
    )
  }, [mergedEventList, event])

  const cleanTeam = useCallback((name: string) => String(name || '').replace(/\sU\d+$/, '').trim(), [])

  const parseGoals = useCallback((goals: any) => {
    if (!goals) return { home: 0, away: 0 }
    if (typeof goals === 'string') {
      try {
        const p = JSON.parse(goals)
        return { home: Number(p.home || 0), away: Number(p.away || 0) }
      } catch {
        return { home: 0, away: 0 }
      }
    }
    return { home: Number(goals.home || 0), away: Number(goals.away || 0) }
  }, [])

  useEffect(() => {
    if (!id) return
    if (localFoundEvent) return
    if (!localEventsReady) return

    const ac = new AbortController()
    const fetchEvent = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await apiFetch<any>(`/api/events/${id}`, { signal: ac.signal })
        if (data && (data.id || data.home_team)) {
          setEvent(data)
        } else {
          setError('Evento não encontrado ou indisponível.')
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') setError('Evento não encontrado ou indisponível.')
      } finally {
        setLoading(false)
      }
    }

    fetchEvent()
    return () => ac.abort()
  }, [id, localFoundEvent, localEventsReady])

  const statusShort = typeof displayEvent?.status === 'object' ? displayEvent.status?.short : displayEvent?.status
  const statusKey = String(statusShort || displayEvent?.fixture?.status?.short || '').toUpperCase().trim()
  const liveStatuses = useMemo(
    () =>
      new Set([
        'LIVE',
        '1H',
        '2H',
        'HT',
        'ET',
        'BT',
        'P',
        'Q1',
        'Q2',
        'Q3',
        'Q4',
        'OT',
        'P1',
        'P2',
        'P3',
        'S1',
        'S2',
        'S3',
        'S4',
        'S5',
        'IN',
        'IN1',
        'IN2',
        'IN3',
        'IN4',
        'IN5',
        'IN6',
        'IN7',
        'IN8',
        'IN9',
        'IN_PROGRESS',
      ]),
    []
  )

  const isLive = !!displayEvent && (displayEvent.is_live === 1 || liveStatuses.has(statusKey))
  const liveTimerRaw = String((displayEvent as any)?.timer || displayEvent?.fixture?.status?.timer || '').trim()
  const liveTimer = liveTimerRaw
    ? liveTimerRaw.includes(':')
      ? liveTimerRaw
      : (() => {
          const n = Number(liveTimerRaw)
          if (!Number.isFinite(n) || n < 0) return ''
          const mm = String(Math.floor(n)).padStart(2, '0')
          return `${mm}:00`
        })()
    : ''
  const liveElapsed = Number((displayEvent as any)?.elapsed ?? displayEvent?.fixture?.status?.elapsed ?? 0) || 0

  useEffect(() => {
    if (!id) return
    let timer: ReturnType<typeof setTimeout>

    const fetchStats = async () => {
      try {
        const sportArg = (event as any)?.sport ? `?sport=${encodeURIComponent(String((event as any).sport))}` : '';
        const data = await apiFetch<any>(`/api/events/${id}/stats${sportArg}`)
        if (data) setLiveStats({ stats: data.stats ?? [], events: data.events ?? [] })
      } catch {
        /* empty */
      }
    }

    fetchStats()
    if (isLive) {
      const intervalMs = String((displayEvent as any)?.sport || '').toLowerCase() === 'soccer' ? 60000 : 15000
      timer = setInterval(fetchStats, intervalMs)
    }

    return () => clearInterval(timer)
  }, [id, isLive, (displayEvent as any)?.sport])

  useEffect(() => {
    if (!displayEvent) return
    const leagueId = displayEvent.league_id
    if (!leagueId) return
    const ac = new AbortController()
    apiFetch<any>(`/api/leagues/${leagueId}/standings`, { signal: ac.signal })
      .then((data) => setStandingsData(data?.standings || []))
      .catch(() => setStandingsData([]))
    return () => ac.abort()
  }, [displayEvent?.league_id])

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin h-8 w-8 border-4 border-red-600 border-t-transparent rounded-full mx-auto"></div>
      </div>
    )
  }

  if (error || !displayEvent) return <div className="p-8 text-center text-red-600">{error || 'Evento não encontrado'}</div>

  const ev = displayEvent as Event
  const g = parseGoals((ev as any).goals)
  const homeTeam = cleanTeam((ev as any).home_team)
  const awayTeam = cleanTeam((ev as any).away_team)

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      {showMobileSidebar &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMobileSidebar(false)} />
            <div
              className={`absolute left-0 top-0 bottom-0 w-64 ${
                darkMode ? 'bg-gray-800' : 'bg-white'
              } shadow-xl overflow-y-auto transform transition-transform duration-300`}
            >
              <Sidebar dynamicTopItems={activeTopLeagues} />
            </div>
          </div>,
          document.body
        )}

      <div className="w-full flex items-start gap-4">
        <aside
          className={`hidden lg:block w-64 shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto ${
            darkMode ? 'bg-gray-800' : 'bg-white'
          } border-r ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}
        >
          <div className="p-4 space-y-4">
            <Sidebar dynamicTopItems={activeTopLeagues} />
          </div>
        </aside>

        <main className="flex-1 min-w-0 pb-20 mt-4">
          <div
            className={`relative rounded-xl overflow-hidden mb-4 px-4 py-5 flex flex-col items-center gap-2 ${
              darkMode ? 'bg-gray-800' : 'bg-white'
            } border ${darkMode ? 'border-gray-700' : 'border-gray-200'} shadow`}
          >
            {isLive && (
              <div className="flex items-center gap-2 mb-1">
                <span className="flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
                </span>
                <span className="text-[11px] font-black text-red-600 uppercase tracking-widest">Ao Vivo</span>
                {statusShort && (
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                      darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                    } uppercase`}
                  >
                    {statusShort}
                  </span>
                )}
                {(liveTimer || liveElapsed > 0) && (
                  <span className="text-[11px] font-bold bg-red-600 text-white px-2 py-0.5 rounded">
                    {liveTimer || `${liveElapsed}'`}
                  </span>
                )}
              </div>
            )}

            <div className="w-full flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm md:text-base truncate">{homeTeam}</div>
              </div>
              <button
                onClick={() => navigate(`/event/${id}`)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border ${
                  darkMode
                    ? 'bg-gray-700 text-white border-gray-600 hover:bg-gray-600'
                    : 'bg-white text-gray-900 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Mercados
              </button>
              <div className="flex-1 min-w-0 text-right">
                <div className="font-bold text-sm md:text-base truncate">{awayTeam}</div>
              </div>
            </div>

            <div className="mt-3">
              {isLive ? (
                <span className={`font-black text-3xl md:text-4xl tabular-nums ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {g.home} - {g.away}
                </span>
              ) : (
                <span className={`font-black text-xl ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>VS</span>
              )}
            </div>
          </div>

          <div className={`flex rounded-xl overflow-hidden border mb-3 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            {[
              { key: 'dominance' as const, label: 'Domínio' },
              { key: 'stats' as const, label: 'Estatísticas' },
              { key: 'standings' as const, label: 'Classificação' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wide transition-colors ${
                  activeTab === tab.key
                    ? 'bg-red-600 text-white'
                    : darkMode
                      ? 'text-gray-400 hover:bg-gray-700'
                      : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'dominance' && (
            <div className="space-y-3">
              <LiveMomentumSticksGraph
                darkMode={darkMode}
                stats={liveStats.stats}
                matchEvents={liveStats.events}
                homeName={homeTeam}
                awayName={awayTeam}
                currentMinute={liveElapsed || (liveTimer ? parseInt(liveTimer) : 0)}
                statusKey={statusKey}
              />

              <div className={`rounded-xl overflow-hidden border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`} style={{ height: 220 }}>
                <FootballPitchAnimation
                  homeName={homeTeam}
                  awayName={awayTeam}
                  isLive={isLive}
                  score={`${g.home} - ${g.away}`}
                  statusLabel={String(statusShort || '')}
                  timer={liveTimer || (liveElapsed > 0 ? `${liveElapsed}'` : isLive ? 'AO VIVO' : '')}
                  sport={(ev as any).sport || 'soccer'}
                  matchEvents={liveStats.events}
                  liveStats={Array.isArray(liveStats.stats) ? liveStats.stats : []}
                />
              </div>

              {!isLive && Array.isArray(liveStats.stats) && liveStats.stats.length === 0 && (
                <div className={`text-center py-6 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Sem dados de domínio disponíveis.
                </div>
              )}
            </div>
          )}

          {activeTab === 'stats' && (
            <div className={`rounded-xl overflow-hidden border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <MatchTracker
                live={{ ...(ev as any), fixture: { ...((ev as any).fixture || {}), stats: Array.isArray(liveStats.stats) ? liveStats.stats : [], events: liveStats.events } }}
                homeName={(ev as any).home_team}
                awayName={(ev as any).away_team}
                leagueName={(ev as any).league_name}
                sportName={(ev as any).sport}
                darkMode={darkMode}
              />
            </div>
          )}

          {activeTab === 'standings' && (
            <div className={`rounded-xl border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className={`px-4 py-2.5 border-b text-xs font-bold uppercase tracking-wide ${darkMode ? 'border-gray-700 text-gray-400' : 'border-gray-100 text-gray-500'}`}>
                Classificação — {(ev as any).league_name || (ev as any).league}
              </div>
              {standingsData.length === 0 ? (
                <p className={`text-center py-6 text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Classificação indisponível</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className={`${darkMode ? 'bg-gray-700/50 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                        <th className="px-2 py-2 text-center w-8">#</th>
                        <th className="px-3 py-2 text-left">Equipa</th>
                        <th className="px-2 py-2 text-center">J</th>
                        <th className="px-2 py-2 text-center">V</th>
                        <th className="px-2 py-2 text-center">E</th>
                        <th className="px-2 py-2 text-center">D</th>
                        <th className="px-2 py-2 text-center">GM</th>
                        <th className="px-2 py-2 text-center">GS</th>
                        <th className="px-2 py-2 text-center font-bold">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standingsData.map((row: any, i: number) => {
                        const isHome = homeTeam.toLowerCase() === String(row.team).toLowerCase()
                        const isAway = awayTeam.toLowerCase() === String(row.team).toLowerCase()
                        return (
                          <tr
                            key={i}
                            className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'} ${
                              isHome
                                ? darkMode
                                  ? 'bg-blue-900/30'
                                  : 'bg-blue-50'
                                : isAway
                                  ? darkMode
                                    ? 'bg-red-900/30'
                                    : 'bg-red-50'
                                  : i % 2 === 0
                                    ? darkMode
                                      ? 'bg-gray-800/30'
                                      : 'bg-gray-50/60'
                                    : ''
                            }`}
                          >
                            <td className={`px-2 py-1.5 text-center font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{row.position}</td>
                            <td
                              className={`px-3 py-1.5 font-medium truncate max-w-[120px] ${
                                isHome
                                  ? darkMode
                                    ? 'text-blue-300'
                                    : 'text-blue-700'
                                  : isAway
                                    ? darkMode
                                      ? 'text-red-300'
                                      : 'text-red-700'
                                    : darkMode
                                      ? 'text-gray-200'
                                      : 'text-gray-800'
                              }`}
                            >
                              {row.team}
                            </td>
                            <td className={`px-2 py-1.5 text-center ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{row.played}</td>
                            <td className={`px-2 py-1.5 text-center ${darkMode ? 'text-green-400' : 'text-green-600'}`}>{row.wins}</td>
                            <td className={`px-2 py-1.5 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{row.draws}</td>
                            <td className={`px-2 py-1.5 text-center ${darkMode ? 'text-red-400' : 'text-red-500'}`}>{row.losses}</td>
                            <td className={`px-2 py-1.5 text-center ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{row.goalsFor}</td>
                            <td className={`px-2 py-1.5 text-center ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{row.goalsAgainst}</td>
                            <td className={`px-2 py-1.5 text-center font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{row.points}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>

        <aside
          className={`hidden xl:block w-80 shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto ${
            darkMode ? 'bg-gray-800' : 'bg-white'
          } border-l ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}
        >
          <div className="p-4 space-y-4">
            <BetSlip />
          </div>
        </aside>
      </div>
    </div>
  )
}

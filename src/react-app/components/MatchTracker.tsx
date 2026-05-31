import { useEffect, useMemo, useState } from 'react'
import { Clock } from 'lucide-react'

// --- Types ---
interface MatchTrackerProps {
  darkMode: boolean
  live: any | null
  homeName: string
  awayName: string
  leagueName?: string
  sportName?: string
}

interface GameEvent {
  id: number
  minute: string
  type: 'goal' | 'card' | 'attack' | 'corner' | 'shot'
  team: 'home' | 'away'
  description: string
}

// --- Components ---

const SPORT_PT: Record<string, string> = {
  soccer: 'Futebol', football: 'Futebol', basketball: 'Basquetebol',
  tennis: 'Ténis', volleyball: 'Voleibol', handball: 'Andebol',
  baseball: 'Basebol', hockey: 'Hóquei', 'ice hockey': 'Hóquei no Gelo',
  rugby: 'Rugby', mma: 'MMA', afl: 'Futebol Australiano',
  'american football': 'Futebol Americano', 'formula 1': 'Fórmula 1',
}

const MatchHeader = ({ league, sport, status, darkMode }: { league: string, sport: string, status: string, darkMode: boolean }) => {
  const sportPt = SPORT_PT[String(sport || '').toLowerCase()] || sport || 'Desporto'
  return (
    <div className={`flex items-center justify-between px-4 py-3 border-b ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-bold uppercase tracking-wide truncate opacity-70">{sportPt}</span>
        <span className="opacity-40 text-xs">•</span>
        <span className="text-xs font-medium truncate">{league}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
        <span className="text-xs font-bold uppercase text-red-500">{status}</span>
      </div>
    </div>
  )
}

const Scoreboard = ({ home, away, score, time, darkMode }: { home: string, away: string, score: string, time: string, darkMode: boolean }) => {
  const [homeScore, awayScore] = score.split('-').map(s => s.trim())
  
  return (
    <div className={`py-5 px-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 max-w-lg mx-auto">
        <div className="text-center">
          <p className={`text-sm font-semibold leading-tight break-words hyphens-auto ${darkMode ? 'text-white' : 'text-gray-900'}`}>{home}</p>
        </div>
        
        <div className="flex flex-col items-center px-3 flex-shrink-0">
          <div className={`text-4xl font-black tracking-tight tabular-nums ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {homeScore ?? '0'} <span className="opacity-30">-</span> {awayScore ?? '0'}
          </div>
          <div className={`flex items-center gap-1 text-xs font-mono mt-1 ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
            <Clock size={12} />
            <span>{time}</span>
          </div>
        </div>

        <div className="text-center">
          <p className={`text-sm font-semibold leading-tight break-words hyphens-auto ${darkMode ? 'text-white' : 'text-gray-900'}`}>{away}</p>
        </div>
      </div>
    </div>
  )
}

const StatRow = ({ label, homeVal, awayVal, darkMode }: { label: string, homeVal: number | string, awayVal: number | string, darkMode: boolean }) => (
  <div className="flex items-center justify-between py-2 border-b border-dashed border-gray-200 dark:border-gray-700 last:border-0">
    <span className={`font-mono font-bold ${Number(homeVal) > Number(awayVal) ? (darkMode ? 'text-white' : 'text-black') : (darkMode ? 'text-gray-400' : 'text-gray-500')}`}>
      {homeVal}
    </span>
    <span className={`text-xs uppercase font-medium ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{label}</span>
    <span className={`font-mono font-bold ${Number(awayVal) > Number(homeVal) ? (darkMode ? 'text-white' : 'text-black') : (darkMode ? 'text-gray-400' : 'text-gray-500')}`}>
      {awayVal}
    </span>
  </div>
)

const MatchStats = ({ stats, darkMode }: { stats: any, darkMode: boolean }) => (
  <div className={`px-4 py-4 border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
    <h4 className={`text-xs font-bold uppercase mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Estatísticas</h4>
    <div className="space-y-1">
      <StatRow label="Posse de Bola" homeVal={`${stats.possession.home}%`} awayVal={`${stats.possession.away}%`} darkMode={darkMode} />
      <StatRow label="Remates" homeVal={stats.shots.home} awayVal={stats.shots.away} darkMode={darkMode} />
      <StatRow label="No Alvo" homeVal={stats.onTarget.home} awayVal={stats.onTarget.away} darkMode={darkMode} />
      <StatRow label="Escanteios" homeVal={stats.corners.home} awayVal={stats.corners.away} darkMode={darkMode} />
      <StatRow label="Cartões" homeVal={stats.cards.home} awayVal={stats.cards.away} darkMode={darkMode} />
    </div>
  </div>
)

const TimelineEvent = ({ event, darkMode }: { event: GameEvent, darkMode: boolean }) => {
  const icon = {
    goal: '⚽',
    card: '🟨',
    attack: '🟢',
    corner: '🚩',
    shot: '🚀'
  }[event.type]

  const isHome = event.team === 'home'

  return (
    <div className={`flex items-start gap-3 py-2 animate-in slide-in-from-top-2 fade-in duration-300`}>
      <div className={`w-12 text-right font-mono text-sm font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        {event.minute}'
      </div>
      <div className="flex-1">
        <div className={`flex items-center gap-2 ${isHome ? '' : 'flex-row-reverse text-right'}`}>
          <span className="text-lg">{icon}</span>
          <div>
            <p className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
              {event.description}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const MatchTimeline = ({ events, darkMode }: { events: GameEvent[], darkMode: boolean }) => (
  <div className={`px-4 py-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
    <h4 className={`text-xs font-bold uppercase mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Eventos do Jogo</h4>
    <div className="relative">
      <div className={`absolute left-[3.2rem] top-2 bottom-2 w-px ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
      <div className="space-y-1">
        {events.slice(0, 10).map((ev) => (
          <TimelineEvent key={ev.id} event={ev} darkMode={darkMode} />
        ))}
        {events.length === 0 && (
          <p className={`text-center text-sm py-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            Aguardando início do jogo...
          </p>
        )}
      </div>
    </div>
  </div>
)

// --- Main Component ---

export default function MatchTracker({ darkMode, live, homeName, awayName, leagueName = 'Liga Portugal', sportName = 'Futebol' }: MatchTrackerProps) {
  const [stats, setStats] = useState({
    possession: { home: 50, away: 50 },
    shots: { home: 0, away: 0 },
    onTarget: { home: 0, away: 0 },
    corners: { home: 0, away: 0 },
    cards: { home: 0, away: 0 }
  })
  const [gameEvents, setGameEvents] = useState<GameEvent[]>([])

  // --- Formatting ---
  const time = useMemo(() => {
    const timerRaw = String(live?.timer || live?.fixture?.status?.timer || '').trim()
    if (timerRaw) {
      if (timerRaw.includes(':')) return timerRaw
      const n = Number(timerRaw)
      if (Number.isFinite(n) && n >= 0) {
        const mm = String(Math.floor(n)).padStart(2, '0')
        return `${mm}:00`
      }
    }
    const minute = live?.minute
    if (minute != null && minute !== '') return `${minute}'`
    const elapsed = live?.elapsed ?? live?.fixture?.status?.elapsed
    if (typeof elapsed === 'number' && elapsed > 0) return `${elapsed}'`
    return 'AO VIVO'
  }, [live])
  const score = useMemo(() => {
    if (!live) return '0-0';

    const extractNum = (v: any): number => {
      if (v == null) return 0;
      if (typeof v === 'number') return v;
      if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
      if (typeof v === 'object') return v.total ?? v.score ?? v.current ?? v.home ?? 0;
      return 0;
    };

    if (typeof live.score === 'string') {
      const s = live.score.trim();
      if (s.startsWith('{')) {
        try {
          const parsed = JSON.parse(s);
          if (parsed && (parsed.home !== undefined || parsed.away !== undefined)) {
            return `${extractNum(parsed.home)}-${extractNum(parsed.away)}`;
          }
        } catch { /* fall through */ }
      }
      if (/^\d+[-:]\d+$/.test(s)) return s.replace(':', '-');
      return s;
    }

    const h = extractNum(live.goals?.home ?? live.score?.home);
    const a = extractNum(live.goals?.away ?? live.score?.away);
    return `${h}-${a}`;
  }, [live])
  
  const status = useMemo(() => {
    const s = String(live?.fixture?.status?.short || live?.status || '').toUpperCase().trim()
    if (!s) return 'AO VIVO'
    if (s === 'HT' || s === 'INT' || s === 'BT') return 'INTERVALO'
    if (s === 'FT' || s === 'FIN' || s === 'FINAL') return 'FINAL'
    return s
  }, [live])

  // --- Real Data Integration ---
  const hasRealStats = useMemo(() => !!(live?.fixture?.stats && Array.isArray(live.fixture.stats) && live.fixture.stats.length === 2), [live]);
  const hasRealEvents = useMemo(() => !!(live?.fixture?.events && Array.isArray(live.fixture.events)), [live]);

  useEffect(() => {
    if (hasRealStats) {
        const s = live.fixture.stats;
        // Assume index 0 is home, 1 is away (API-Sports usually follows this, but check team id if possible)
        // For simplicity, we assume order matches home/away teams
        const getVal = (teamIdx: number, type: string) => {
            const t = s[teamIdx]?.statistics?.find((x: any) => x.type === type);
            return t ? (typeof t.value === 'number' ? t.value : parseInt(t.value || '0')) : 0;
        };

        setStats({
            possession: { home: getVal(0, 'Ball Possession') || 50, away: getVal(1, 'Ball Possession') || 50 },
            shots: { home: getVal(0, 'Total Shots'), away: getVal(1, 'Total Shots') },
            onTarget: { home: getVal(0, 'Shots on Goal'), away: getVal(1, 'Shots on Goal') },
            corners: { home: getVal(0, 'Corner Kicks'), away: getVal(1, 'Corner Kicks') },
            cards: { home: (getVal(0, 'Yellow Cards') + getVal(0, 'Red Cards')), away: (getVal(1, 'Yellow Cards') + getVal(1, 'Red Cards')) }
        });
    }
  }, [live, hasRealStats]);

  useEffect(() => {
    if (hasRealEvents) {
        const evs = live.fixture.events
          .map((e: any, idx: number) => {
            const teamName = String(e?.team?.name || '').trim();
            const teamId = e?.team?.id;
            const isHome = (teamName && teamName === homeName) || (teamId != null && teamId === live?.fixture?.home?.id);
            const typeMap: any = { Goal: 'goal', Card: 'card', subst: 'substitution' };
            const elapsed = e?.time?.elapsed ?? e?.elapsed ?? null;
            const extra = e?.time?.extra ?? e?.extra ?? null;
            const minute =
              elapsed != null && elapsed !== ''
                ? `${elapsed}${extra ? `+${extra}` : ''}'`
                : '';
            return {
              id: idx,
              minute,
              type: typeMap[e?.type] || 'attack',
              team: isHome ? 'home' : 'away',
              description: `${String(e?.type || '')}${e?.player?.name ? ` - ${e.player.name}` : ''}${e?.detail ? ` ${e.detail}` : ''}`.trim(),
            };
          })
          .reverse(); // Newest first
        setGameEvents(evs);
    }
  }, [live, hasRealEvents, homeName]);

  // --- Simulation Logic (Visuals Only) ---
  // DISABLED BY REQUEST: Prevent fake simulation when no data is available
  /*
  useEffect(() => {
    const active = !!(live && (Number((live as any)?.is_live || 0) === 1 || String((live as any)?.status || '') === 'live' || (live as any)?.isLive === true))
    if (!active) return

    const tick = () => {
      // Move ball using Ref to avoid dependency cycle
      const currentBall = ballRef.current
      const nx = Math.max(5, Math.min(95, currentBall.x + (Math.random() * 20 - 10)))
      const ny = Math.max(5, Math.min(95, currentBall.y + (Math.random() * 14 - 7)))
      
      ballRef.current = { x: nx, y: ny }
      setBall({ x: nx, y: ny })
      setTrail(prev => [...prev.slice(-20), { x: nx, y: ny }])
      
      // Determine attack side
      const side = nx < 40 ? 'home' : nx > 60 ? 'away' : null
      setAttackSide(side)

      // Update Pressure
      setPressure(prev => {
        const target = side === 'home' ? 30 : side === 'away' ? 70 : 50
        return prev + (target - prev) * 0.1
      })

      // Random Events (ONLY IF NO REAL DATA)
      if (!hasRealEvents && Math.random() > 0.95) {
        const typeRoll = Math.random()
        const eventTeam = Math.random() > 0.5 ? 'home' : 'away'
        const teamName = eventTeam === 'home' ? home : away
        const minute = live?.minute || '0'
        
        let newEvent: GameEvent | null = null

        if (typeRoll > 0.9) {
          newEvent = { id: Date.now(), minute, type: 'goal', team: eventTeam, description: `GOL! ${teamName}` }
          // Reset ball to center
          setBall({ x: 50, y: 50 })
          setTrail([])
          setIsGoal(true)
          setTimeout(() => setIsGoal(false), 3000)
        } else if (typeRoll > 0.7) {
          newEvent = { id: Date.now(), minute, type: 'shot', team: eventTeam, description: `Remate de ${teamName}` }
          if (!hasRealStats) {
             setStats(s => ({ ...s, shots: { ...s.shots, [eventTeam]: s.shots[eventTeam] + 1 } }))
          }
        } else if (typeRoll > 0.5) {
          newEvent = { id: Date.now(), minute, type: 'attack', team: eventTeam, description: `Ataque perigoso ${teamName}` }
        }

        if (newEvent) {
          setGameEvents(prev => [newEvent!, ...prev])
        }
      }
    }

    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [live, home, away, hasRealEvents, hasRealStats]) 
  */

  const homePoss = stats.possession.home
  const awayPoss = stats.possession.away

  return (
    <div className={`w-full max-w-2xl mx-auto overflow-hidden rounded-xl shadow-lg relative ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
      <MatchHeader league={leagueName} sport={sportName} status={status} darkMode={darkMode} />
      
      <Scoreboard home={homeName || 'Casa'} away={awayName || 'Fora'} score={score} time={time} darkMode={darkMode} />

      {/* Possession Bar */}
      <div className={`px-4 py-3 border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="flex justify-between text-xs font-bold mb-1">
          <span className={darkMode ? 'text-blue-400' : 'text-blue-600'}>{homePoss}%</span>
          <span className={`uppercase text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Posse de Bola</span>
          <span className={darkMode ? 'text-orange-400' : 'text-orange-600'}>{awayPoss}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden flex">
          <div className={`h-full transition-all duration-700 ${darkMode ? 'bg-blue-500' : 'bg-blue-600'}`} style={{ width: `${homePoss}%` }} />
          <div className={`h-full transition-all duration-700 ${darkMode ? 'bg-orange-500' : 'bg-orange-600'}`} style={{ width: `${awayPoss}%` }} />
        </div>
      </div>

      <MatchStats stats={stats} darkMode={darkMode} />
      <MatchTimeline events={gameEvents} darkMode={darkMode} />
    </div>
  )
}

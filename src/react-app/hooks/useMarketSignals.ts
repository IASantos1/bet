import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '../utils/api'

export type MarketCta =
  | 'idle'
  | 'big_chance'
  | 'goal'
  | 'penalty'
  | 'cards'

export interface MarketSignals {
  cta: MarketCta
  varActive: boolean
  ctaUntil: number
}

function isSoccerSport(sport: any) {
  const s = String(sport || '').toLowerCase()
  return s.includes('soccer') || (s.includes('football') && !s.includes('american')) || s.includes('futebol')
}

function incidentTimeKey(inc: any, idx: number) {
  const minute = Number(inc?.minute ?? 0) || 0
  const added = Number(inc?.addedTime ?? inc?.added_time ?? 0) || 0
  return minute * 1000 + added * 10 + (idx % 10)
}

function pickLatest(incidents: any[]) {
  if (!Array.isArray(incidents) || incidents.length === 0) return null
  let best: any = null
  let bestKey = -Infinity
  for (let i = 0; i < incidents.length; i++) {
    const inc = incidents[i]
    const k = incidentTimeKey(inc, i)
    if (k >= bestKey) {
      bestKey = k
      best = inc
    }
  }
  return best
}

function classifyCtaFromIncident(type: string) {
  const t = String(type || '').toLowerCase()
  if (t === 'goal' || t === 'own_goal') return 'goal' as const
  if (t === 'penalty' || t === 'penalty_awarded' || t === 'missed_penalty') return 'penalty' as const
  if (t === 'red_card' || t === 'yellow_card' || t === 'yellow_red') return 'cards' as const
  return 'idle' as const
}

function hasVarDecisionText(text: string) {
  const t = String(text || '').toLowerCase()
  return (
    t.includes('confirmed') ||
    t.includes('cancelled') ||
    t.includes('canceled') ||
    t.includes('decision') ||
    t.includes('goal confirmed') ||
    t.includes('goal cancelled') ||
    t.includes('penalty confirmed') ||
    t.includes('penalty cancelled') ||
    t.includes('card upgrade') ||
    t.includes('card cancelled') ||
    t.includes('anulad') ||
    t.includes('valid')
  )
}

function computeVarActive(incidents: any[]) {
  if (!Array.isArray(incidents) || incidents.length === 0) return { active: false, sinceKey: -1 }
  let lastVar: any = null
  let lastVarKey = -1
  for (let i = 0; i < incidents.length; i++) {
    const inc = incidents[i]
    if (String(inc?.type || '').toUpperCase() !== 'VAR') continue
    const k = incidentTimeKey(inc, i)
    if (k >= lastVarKey) {
      lastVarKey = k
      lastVar = inc
    }
  }
  if (!lastVar) return { active: false, sinceKey: -1 }
  const confirmed = lastVar?.isConfirmed
  if (confirmed === true && hasVarDecisionText(lastVar?.description || '')) return { active: false, sinceKey: -1 }
  if (confirmed === false) return { active: true, sinceKey: lastVarKey }

  for (let i = 0; i < incidents.length; i++) {
    const inc = incidents[i]
    const k = incidentTimeKey(inc, i)
    if (k < lastVarKey) continue
    const t = String(inc?.type || '').toLowerCase()
    if (t === 'disallowed_goal' || t === 'goal' || t === 'penalty_awarded' || t === 'penalty') return { active: false, sinceKey: -1 }
    if ((t === 'red_card' || t === 'yellow_card' || t === 'yellow_red') && hasVarDecisionText(inc?.description || '')) {
      return { active: false, sinceKey: -1 }
    }
  }

  return { active: true, sinceKey: lastVarKey }
}

export function useMarketSignals(params: {
  eventId?: string | number | null
  sport?: string | null
  isLive?: boolean
}) {
  const { eventId, sport, isLive } = params
  const enabled = useMemo(() => !!eventId && !!isLive && isSoccerSport(sport), [eventId, isLive, sport])

  const [cta, setCta] = useState<MarketCta>('idle')
  const [ctaUntil, setCtaUntil] = useState<number>(0)
  const [varActive, setVarActive] = useState(false)

  const lastIncidentIdRef = useRef<string>('')
  const lastBigTotalRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled) {
      setVarActive(false)
      setCta('idle')
      setCtaUntil(0)
      lastIncidentIdRef.current = ''
      lastBigTotalRef.current = 0
      if (timerRef.current) clearTimeout(timerRef.current)
      if (intervalRef.current) clearInterval(intervalRef.current)
      timerRef.current = null
      intervalRef.current = null
      return
    }

    const sportParam = String(sport || 'football')
    let cancelled = false
    let inflight = false

    const setTimedCta = (next: MarketCta, ms: number) => {
      const until = Date.now() + ms
      setCta(next)
      setCtaUntil(until)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setCta('idle')
        setCtaUntil(0)
      }, ms)
    }

    const tick = async () => {
      if (cancelled || inflight) return
      inflight = true
      try {
        const resp = await apiFetch<any>(
          `/api/events/${encodeURIComponent(String(eventId))}/incidents?sport=${encodeURIComponent(sportParam)}`,
          { method: 'GET', cache: 'no-store', timeout: 15000 }
        )
        if (cancelled) return
        const list: any[] = Array.isArray(resp?.incidents) ? resp.incidents : []

        const varState = computeVarActive(list)
        setVarActive(varState.active)

        const big = resp?.bigChances
        const total = Number(big?.home ?? 0) + Number(big?.away ?? 0)
        if (Number.isFinite(total) && total > lastBigTotalRef.current) {
          lastBigTotalRef.current = total
          if (!varState.active) setTimedCta('big_chance', 15000)
        } else if (Number.isFinite(total) && total >= 0 && lastBigTotalRef.current === 0) {
          lastBigTotalRef.current = total
        }

        const latest = pickLatest(list)
        if (latest?.id != null) {
          const latestId = String(latest.id)
          if (latestId && latestId !== lastIncidentIdRef.current) {
            lastIncidentIdRef.current = latestId
            const kind = classifyCtaFromIncident(latest?.type)
            if (kind !== 'idle' && !varState.active) setTimedCta(kind, kind === 'goal' ? 12000 : kind === 'penalty' ? 15000 : 12000)
          }
        }
      } catch {
      } finally {
        inflight = false
      }
    }

    tick()
    intervalRef.current = setInterval(tick, 8000)
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
      if (intervalRef.current) clearInterval(intervalRef.current)
      timerRef.current = null
      intervalRef.current = null
    }
  }, [enabled, eventId, sport])

  return { cta, varActive, ctaUntil } as MarketSignals
}


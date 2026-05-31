import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '../utils/api'

export type LiveCardCta = 'idle' | 'big_chance' | 'goal' | 'penalty' | 'cards' | 'var_review' | 'var_penalty'

export interface LiveCardSignals {
  varActive: boolean
  cta: LiveCardCta
  ctaUntil: number
  blockUntil: number      // stronger lock — odds not clickable at all
  lastCta: LiveCardCta    // for notification dedup
}

// Durations per event type (ms)
const CTA_DURATIONS: Record<LiveCardCta, number> = {
  idle:        0,
  goal:        18000,   // 18s — score just changed
  var_penalty: 25000,   // 25s — VAR confirmed penalty
  penalty:     20000,   // 20s — penalty awarded
  var_review:  30000,   // 30s — VAR in progress (long)
  big_chance:  12000,   // 12s — big chance created
  cards:       10000,   // 10s — card shown
}

// How long to BLOCK odds (may differ from CTA display)
const BLOCK_DURATIONS: Record<LiveCardCta, number> = {
  idle:        0,
  goal:        20000,
  var_penalty: 30000,
  penalty:     25000,
  var_review:  30000,
  big_chance:  10000,
  cards:       8000,
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

function classifyCtaFromIncident(type: string): LiveCardCta {
  const t = String(type || '').toLowerCase()
  if (t === 'goal' || t === 'own_goal') return 'goal'
  if (t === 'penalty' || t === 'penalty_awarded' || t === 'missed_penalty') return 'penalty'
  if (t === 'red_card' || t === 'yellow_card' || t === 'yellow_red') return 'cards'
  return 'idle'
}

// Extract score as comparable string
function scoreKey(resp: any): string {
  if (!resp) return ''
  const gh = resp.goals?.home ?? resp.score?.home ?? resp.homeGoals ?? null
  const ga = resp.goals?.away ?? resp.score?.away ?? resp.awayGoals ?? null
  if (gh == null && ga == null) return ''
  return `${Number(gh) || 0}-${Number(ga) || 0}`
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let i = 0
  const runners = Array.from({ length: Math.max(1, limit) }).map(async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(runners)
  return out
}

const EMPTY_TRACKED: Array<{ id: string; sport: string }> = []

export function useBatchMarketSignals(params: {
  events: any[]
  enabled?: boolean
  maxEvents?: number
}) {
  const { events, enabled = true, maxEvents = 16 } = params

  const trackedRef = useRef<Array<{ id: string; sport: string }>>(EMPTY_TRACKED)
  const trackedKeyRef = useRef<string>('')

  const tracked = useMemo(() => {
    if (!enabled) {
      trackedKeyRef.current = ''
      trackedRef.current = EMPTY_TRACKED
      return EMPTY_TRACKED
    }
    const list: Array<{ id: string; sport: string }> = []
    for (const ev of Array.isArray(events) ? events : []) {
      const id = String(ev?.id ?? ev?.fixture?.id ?? ev?.external_event_id ?? '').trim()
      if (!id) continue
      const sport = String(ev?.sport || '').trim()
      if (!isSoccerSport(sport)) continue
      list.push({ id, sport })
      if (list.length >= maxEvents) break
    }
    const key = list.map(x => x.id).join(',')
    if (key === trackedKeyRef.current) return trackedRef.current
    trackedKeyRef.current = key
    trackedRef.current = list
    return list
  }, [events, enabled, maxEvents])

  const [signals, setSignals] = useState<Record<string, LiveCardSignals>>({})
  const signalsRef = useRef<Record<string, LiveCardSignals>>({})
  const lastIncidentRef = useRef<Map<string, string>>(new Map())
  const lastBigTotalRef = useRef<Map<string, number>>(new Map())
  const lastScoreRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (!tracked.length) {
      if (Object.keys(signalsRef.current).length > 0) {
        signalsRef.current = {}
        setSignals({})
      }
      lastIncidentRef.current.clear()
      lastBigTotalRef.current.clear()
      lastScoreRef.current.clear()
      return
    }

    let cancelled = false
    let inflight = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const tick = async () => {
      if (cancelled || inflight) return
      inflight = true
      try {
        const now = Date.now()
        const next: Record<string, LiveCardSignals> = { ...signalsRef.current }

        const results = await mapLimit(tracked, 4, async ({ id, sport }) => {
          try {
            const resp = await apiFetch<any>(`/api/events/${encodeURIComponent(id)}/incidents?sport=${encodeURIComponent(sport)}`, {
              method: 'GET',
              cache: 'no-store',
              timeout: 15000,
            })
            return { id, resp }
          } catch {
            return { id, resp: null }
          }
        })

        for (const r of results) {
          const resp = r.resp
          const list: any[] = Array.isArray(resp?.incidents) ? resp.incidents : []
          const v = computeVarActive(list)

          const prev = next[r.id] || { varActive: false, cta: 'idle' as LiveCardCta, ctaUntil: 0, blockUntil: 0, lastCta: 'idle' as LiveCardCta }

          let cta: LiveCardCta = prev.cta
          let ctaUntil = prev.ctaUntil
          let blockUntil = prev.blockUntil
          let lastCta: LiveCardCta = prev.lastCta

          if (v.active) {
            // VAR in progress — override any CTA with var_review
            if (cta !== 'var_review') {
              cta = 'var_review'
              ctaUntil = now + CTA_DURATIONS.var_review
              blockUntil = now + BLOCK_DURATIONS.var_review
              lastCta = 'var_review'
            }
          } else {
            // ── Score-change goal detection (more reliable than incident text) ──
            const curScore = scoreKey(resp)
            const prevScore = lastScoreRef.current.get(r.id) || ''
            if (curScore && prevScore && curScore !== prevScore) {
              // Score changed → goal scored
              lastScoreRef.current.set(r.id, curScore)
              if (cta !== 'goal' || ctaUntil <= now) {
                cta = 'goal'
                ctaUntil = now + CTA_DURATIONS.goal
                blockUntil = now + BLOCK_DURATIONS.goal
                lastCta = 'goal'
              }
            } else if (curScore && !prevScore) {
              lastScoreRef.current.set(r.id, curScore)
            }

            // ── Big chance detection ──
            const big = resp?.bigChances
            const total = Number(big?.home ?? 0) + Number(big?.away ?? 0)
            const lastBig = lastBigTotalRef.current.get(r.id) ?? 0
            if (Number.isFinite(total) && total > lastBig && cta !== 'goal') {
              lastBigTotalRef.current.set(r.id, total)
              if (cta !== 'big_chance' || ctaUntil <= now) {
                cta = 'big_chance'
                ctaUntil = now + CTA_DURATIONS.big_chance
                blockUntil = now + BLOCK_DURATIONS.big_chance
                lastCta = 'big_chance'
              }
            } else if (Number.isFinite(total) && lastBig === 0) {
              lastBigTotalRef.current.set(r.id, total)
            }

            // ── Incident-based detection ──
            const latest = (() => {
              let best: any = null
              let bestKey = -Infinity
              for (let i = 0; i < list.length; i++) {
                const inc = list[i]
                const k = incidentTimeKey(inc, i)
                if (k >= bestKey) {
                  bestKey = k
                  best = inc
                }
              }
              return best
            })()

            if (latest?.id != null) {
              const latestId = String(latest.id)
              const lastId = lastIncidentRef.current.get(r.id) || ''
              if (latestId && latestId !== lastId) {
                lastIncidentRef.current.set(r.id, latestId)

                // Check for VAR+penalty confirmation
                const detail = String(latest?.detail || latest?.description || '').toLowerCase()
                const type = String(latest?.type || '').toLowerCase()
                let kind: LiveCardCta = 'idle'
                if (/var.*pen|pen.*var|penalty.*confirmed|p[eê]nalti.*confirm/i.test(detail)) {
                  kind = 'var_penalty'
                } else {
                  kind = classifyCtaFromIncident(type)
                }

                if (kind !== 'idle' && kind !== cta) {
                  cta = kind
                  ctaUntil = now + CTA_DURATIONS[kind]
                  blockUntil = now + BLOCK_DURATIONS[kind]
                  lastCta = kind
                }
              }
            }
          }

          // ── Expire CTA/block ──
          if (ctaUntil && ctaUntil <= now) {
            cta = 'idle'
            ctaUntil = 0
          }
          if (blockUntil && blockUntil <= now) {
            blockUntil = 0
          }

          next[r.id] = { varActive: v.active, cta, ctaUntil, blockUntil, lastCta }
        }

        if (!cancelled) {
          signalsRef.current = next
          setSignals(next)
        }
      } finally {
        inflight = false
      }
    }

    tick()
    intervalId = setInterval(tick, 7000)
    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [tracked])

  return { signals }
}

---
name: Events cold-start empty list bug
description: Why /api/events/by-sport returns empty on first request and how to fix it
---

## The rule
In `server/routes/events.ts`, the `realtime=1` path must NOT apply `requireOdds` filtering.

**Why:** On cold start, the in-memory odds cache is empty. The realtime path used `budget0 = {remaining: 0}` (no live odds fetches) AND filtered events by `requireOdds`, dropping every event. Result: `{live:[], pregame:[]}` permanently, because the non-realtime path is never triggered to populate the cache.

**How to apply:** The fix (applied): in the `if (realtime)` branch of `buildBySport`, skip `filterByCachedOdds` entirely — return all normalized events and let the frontend show "-" for missing odds. Background `queueOddsRefresh` calls are already queued for every event at lines 661-662; the next poll (~7 s) will carry real odds from cache.

## Key details
- External API: `https://v2.football.sportsapipro.com/api/live` returns events with `homeTeam`/`awayTeam` as flat strings (not objects) and `status: "2nd half"` (not an object). `normalizeEvent()` handles this correctly.
- Live events have `startTimestamp` (Unix int) but no string date fields. Line 444: `const date = ts > 0 ? new Date(ts * 1000).toISOString() : pickStartDate()` — handles this correctly.
- After fix: 112–120 live events appear immediately; 57–83 have odds after ~8 s as cache populates.

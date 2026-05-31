# BET62 - Apostas Esportivas

A Portuguese-language sports betting platform (BET62) built with React + Vite on the frontend and Cloudflare Workers on the backend.

## Architecture

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, React Router, TanStack Query, Zustand, Framer Motion
- **Backend**: Cloudflare Workers (Hono framework) with D1 SQLite database
- **Auth**: Lucia Auth with SQLite adapter
- **Payments**: Stripe and PayPal integrations
- **Odds & Stats**: Statpal.io API (soccer v2)

## Project Structure

- `src/react-app/` — Main React application (entry point: `src/react-app/main.tsx`)
- `src/worker/` — Cloudflare Worker backend (API, auth, betting engine)
- `index.html` — Root HTML entry (uses `src/react-app/main.tsx`)
- `migrations/` — D1 database migration SQL files
- `vite.config.ts` — Vite configuration (port 5000, all hosts allowed)
- `wrangler.toml` — Cloudflare Workers configuration
- `scripts/odds-proxy.mjs` — Statpal.io odds/stats proxy (port 8080)

## Admin Access

- Operator account: `Admin.local` (created via `POST /api/admin/bootstrap-operator` with `X-Admin-Token: $BOOTSTRAP_TOKEN`).
- `BOOTSTRAP_TOKEN` is a Cloudflare Worker secret (production-only). Used once to create/promote operators; not exposed to the client.
- Operators (`user_profile.is_operator = 1`) get a €0.50 minimum deposit instead of the public €10 floor on Card / MB WAY / Multibanco.
- In production, `.local` usernames cannot self-register or bypass passwords (`auth.ts` checks `ENVIRONMENT === 'production'`).

## Development Setup

Two workflows must run simultaneously:

1. **Start worker** (`npm run worker`) — Statpal.io data proxy on port 8080. Fetches live matches + odds (one global call) and prematch odds from 22 top leagues. Implements automatic refresh every 30s for live, 120s for prematch.

2. **Start application** (`npm run dev`) — Vite dev server on port 5000 with all API traffic proxied through the local odds proxy at `http://127.0.0.1:8080`.

The proxy pipeline: Browser → Vite (5000) → odds-proxy (8080) → Statpal.io API (+ CF Worker fallback for auth/payments).

## Running the App

```bash
npm run worker      # Start Statpal odds proxy (port 8080) — required first
npm run dev         # Start frontend dev server (port 5000)
npm run build       # Build for production
npm run deploy:prod # Deploy CF Worker to production (requires CF auth)
```

## Statpal.io Integration

API key stored as `STATPAL_KEY` environment secret.
Base URL: `https://statpal.io/api/v2/soccer/`

### Live Matches
- Endpoint: `GET /api/v2/soccer/odds/live`
- Returns all live soccer matches with: odds, stats, match events, score, period, minute
- Refreshed every 30 seconds
- `status.blocked === "1"` or `status.stopped === "1"` → odds suspended

### Prematch Odds
- Endpoint: `GET /api/v2/soccer/leagues/{league_id}/odds/prematch`
- 22 top leagues fetched in parallel: Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Primeira Liga, Liga Portugal 2, Eredivisie, Champions League, Europa League, Conference League, Belgium Pro League, Scotland PL, Greece Super League, Turkey Super Lig, Russia PL, Switzerland SL, Serbia Super Liga, Brazil Serie A, Argentina Primera, Tweede Divisie
- Refreshed every 120 seconds

### League Filtering (Backend)
- **Women's leagues** blocked: women, woman, feminino, damen, toppserien, wsl, nwsl, etc.
- **Youth leagues** blocked: U16–U23, under-16–23, youth, junior, juvenil, revelacao, etc.
- **Amateur leagues** blocked: amateur, amateure, amador, amatör
- **3rd division+** blocked: regionalliga, kakkonen, gamma ethniki, esiliiga, derde divisie, etc.
- **Friendly games** blocked: friendly, amistoso, amical, testspiel
- **Middle East countries** blocked (saudi arabia, qatar, uae, kuwait, bahrain, oman, jordan, iraq, syria, lebanon, palestine, yemen, iran)

### Odds Suspension (Critical Moments)
- Match-level: `status.blocked === "1"` or `status.stopped === "1"` → ALL markets suspended
- Line-level: individual line `suspended === "1"` → that specific line suspended
- Score-based: O/U line ≤ total goals scored → that line suspended (e.g. 0:1 → Mais/Menos 0.5 suspended)

### Markets Available

**Live markets (Statpal IDs → canonical key):**
- `3610` → `h2h` (Resultado Final)
- `91841`/`2254` → `totals` (Mais/Menos Gols)
- `1844`/`1845` → `handicap` (Handicap)
- `12398` → `btts` (Ambas Marcam)
- `11834` → `correct_score` (Marcador Correto)
- `1849`/`2353`/`91839` → `corners_total` (Cantos)
- `2151` → `btts_second_half`
- `1836` → `second_half_h2h`
- `12395` → `goals_odd_even`
- `double_chance` — computed from h2h via inverse-probability

**Prematch markets (Statpal IDs → canonical key):**
- `1834` → `h2h` (1x2)
- `1835` → `dnb` (Empate Anula Aposta)
- `1838` → `totals` (O/U, uses `total` array with handicap lines)
- `1848` → `btts`
- `1914` → `correct_score`
- `1845` → `half_time_full_time`
- `2055` → `double_chance`

### Live Statistics (Statpal Stats Keys)
Stats object keyed 0-14: `Goal`, `Corner`, `YellowCard`, `RedCard`, `Attacks`, `DangerousAttacks`, `OnTarget`, `OffTarget`, `Posession`, `FirstHalfScore`

Returned from `/api/events/{id}/stats` in API-Football format for MatchTracker compatibility:
- `Ball Possession` (%)
- `Total Shots` (OnTarget + OffTarget)
- `Shots on Goal` (OnTarget)
- `Corner Kicks`, `Yellow Cards`, `Red Cards`

### Event IDs
All Statpal events use `sp_` prefix: `sp_{main_id}`. Cached in `_eventsById` map.

### SubOddsModel Tab Logic
- **Category-based system** fires ONLY when API returns markets from 2+ distinct categories
- **Static MARKET_GROUPS fallback** used when only 1 category present (e.g., only h2h)
  - Ensures computed fallback markets (Double Chance from h2h inverse-probability calc) always appear
  - MARKET_GROUPS defines: Mercado Raiz, Mercados de Resultado, Mercados de Gols, Mercados Temporais, Mercados Estatísticos, Mercados de Jogadores, Mercados Especiais
- **Tab filtering**: only tabs with actual content (≥1 market with data) are shown in the tab bar
- `double_chance` fallback: always computed from h2h odds via inverse-probability method → shows in "Mercados de Resultado"

### Navigation
- **DESPORTO** (`/`) → shows ONLY pregame events, max 60, sorted by date
- **AO VIVO** (`/live`) → shows ONLY live events, max 120

### Proxy Endpoints
- `GET /api/events/by-sport?*` → returns `{ live, pregame }` from Statpal cache
- `GET /api/events/{sp_id}` → returns cached event by ID
- `GET /api/events/{sp_id}/odds` → returns `{ markets, suspended }` for event
- `GET /api/events/{sp_id}/stats` → returns `{ stats, events, statsData }` for event
- `GET /api/sports` → returns soccer only
- `GET /api/events/media?url=...` → image proxy with CORS headers
- All other routes → forwarded to CF Worker (auth, payments, user data)

### Match Center (MatchTracker component)
- Collapsible section inside EventDetails for live events
- Shows: MatchHeader (sport name in PT + league), Scoreboard (full team names + score + time), Possession bar, Match Stats, Timeline
- Stats fetched from `/api/events/{id}/stats` → populated from Statpal live fixture data, converted to API-Football format
- Match events from Statpal (text-based, e.g. "4' - 1st Corner - (Team Name)")

## Deployment

Configured as a static site deployment:
- Build command: `npm run build`
- Public directory: `dist`
- Backend runs separately as Cloudflare Workers (deployed via `npm run deploy:prod`)

## Intro Splash Screen
- Component: `src/react-app/components/Bet62Intro.tsx`
- Shows once per browser session (sessionStorage `bet62_intro_seen` flag)
- Duration: 1.3 seconds (300ms in → 900ms hold → 1300ms done)
- Red background, white B62 circle, BET62 gold text, "APOSTAS DESPORTIVAS", bouncing dots

## UI — Header
- Deposit button: green square (9x9) with "+" icon only, title="Depositar"
- Profile button: when logged in, shows emoji avatar (deterministic from username hash); when not logged in, shows Entrar/Registar buttons

## UI — Market Layout (SubOddsModel)
- H2H market: 3-column side-by-side layout (Casa | Empate | Fora) with tall red buttons (h-14 = 56px) and label above each button
- Correct Score (correct_score/exact_score): 3-column layout — Casa wins | Empates | Fora wins — grouped and colored (blue/yellow/red)
- Totals market: grid table with Line | Mais | Menos columns
- Handicap market: side-by-side home/away panels

## UI — EventCard
- Odds buttons (Casa/Empate/Fora): min-h-[44px] for taller appearance; labels updated from "1"/"X"/"2" to "Casa"/"Empate"/"Fora"

## UI — EventDetails Live Panel
- Removed Match Center collapsible section
- Added: Live Momentum Graph (SVG wave chart of home vs away pressure over time)
- Added: 3 icon tab buttons (⚽ Mini Campo | 📋 Escalação | 📊 Estatísticas)
  - Mini Campo tab: enlarged 2D sport field animation
  - Escalação tab: shows team lineup data if available
  - Estatísticas tab: full MatchTracker with stats, possession, shots, corners, timeline

## UI — FootballPitchAnimation (multi-sport)
- Detects sport from the `sport` prop and renders the correct field:
  - Football: green pitch with penalty areas, center circle, corner arcs
  - Basketball: orange court with keys, baskets, 3-point arcs
  - Tennis: green/clay court with service boxes, net
  - Volleyball: indoor court with net and attack lines
  - Handball: court with goal areas and free-throw arcs
  - Ice Hockey: white rink with blue/red lines and face-off circles
- Ball stationary (cx=150,cy=90) in pregame; animated with requestAnimationFrame when live
- Match events overlay: last event parsed and shown center-field (Goal→⚽GOL! | Corner→🚩 | VAR→📺 | Penalty→🎯 | Red Card→🟥 etc.)
- Ball color matches sport (white for football, orange for basketball, yellow for tennis)

## Live Momentum Graph (`LiveMomentumGraph.tsx`)
- New component: SVG wave chart showing home (blue) vs away (red) match pressure
- Builds from real stats (shots, attacks) with spike overlay from match events
- Shows team names, Ao Vivo indicator, minute labels

## Wallet — Robustness
- **Deposit via Stripe (Card)**: after `stripe.confirmCardPayment` succeeds, frontend calls `POST /api/wallet/deposit/stripe/confirm` to credit the wallet immediately (idempotent — will not double-credit if webhook also fires)
- **Stripe webhook** at `/api/wallet/webhook/stripe/intents` also credits on `payment_intent.succeeded` (production path)
- **Withdrawal (`WithdrawForm`)**: fixed endpoint from `/api/withdrawals` to `/api/wallet/withdraw`; auto-generates `Idempotency-Key` header; sends `method: 'SEPA'`; backend auto-looks up locked IBAN from KYC profile if not provided in body
- **Confirm endpoint** (`POST /api/wallet/deposit/stripe/confirm`): retrieves PaymentIntent from Stripe, verifies ownership via metadata, checks for duplicate credit via `reference` field, then creates ledger credit
- **Withdraw route** auto-resolves `destination` IBAN from KYC `kyc_profiles.locked_iban` if not passed by client

## Payments — Deposit
- PayPal completely removed from DepositPage
- Remaining methods: Cartão (Stripe) | MBway | Multibanco
- Default method: Cartão (Stripe)
- Stripe key manager: operators can input a live Stripe public key (pk_live_...) via UI; stored in localStorage

## Goals / Totals Markets
- **Half-line normalization**: `normalizeHalfLine()` helper in proxy converts integer lines (0, 1, 2, 3...) to half-lines (0.5, 1.5, 2.5, 3.5...) for both live and prematch totals
- **SubOddsModel**: `formatTotalNumber()` also applies the same integer→X.5 normalization as safety net
- Lines are sorted numerically ascending (0.5, 1.5, 2.5, 3.5, 4.5, 5.5)

## Pre-game Statistics
- EventDetails: when event is NOT live, shows a tab bar: **📊 Histórico H2H | 🏆 Classificação**
- **H2H tab**: fetches `/api/events/:id/h2h` → Statpal `/matches/{id}/h2h`; shows last 10 matches with date, teams, score (winner highlighted in green)
- **Standings tab**: fetches `/api/leagues/:leagueId/standings` → Statpal `/leagues/{id}/standings`; shows full league table (Pos | Team | J | V | E | D | GM | GS | Pts) with home/away teams highlighted
- Both endpoints handle Statpal errors gracefully (empty data shown with "Indisponível" message)
- Data is fetched once on mount (idempotent, `pregameStatsLoaded` flag prevents re-fetches)

## Multi-Sport Coverage
- Statpal.io API v2 covers **soccer/football only** — no basketball, tennis, handball, etc.
- Field animations for other sports are rendered correctly based on sport type
- Data (odds/stats) for non-soccer sports will need a separate API integration

## Logos Removed
- Team logos removed from: `EventCard.tsx` and `EventDetails.tsx`

## Sports Data — StatPal Migration (Apr 26, 2026)
- **Provider**: StatPal.io v1 (`https://statpal.io/api/v1/{sport}/livescores|schedule`); secret `STATPAL_KEY`
- **Coverage**: soccer (~1245 matches/day), tennis (~30), formula1 (~24), golf (~48). Other sports return 404 on this key.
- **Odds**: StatPal provides NO odds — `src/worker/services/statpalApi.ts` writes baseline 2.10/3.30/3.20 (soccer) and 1.85/x/1.85 (tennis). Operators can override via `/api/admin/odds/:id`.
- **Status mapping**: StatPal status strings normalized to canonical `FT` / `LIVE` / `NS` to match the rest of the system (filters, exclude lists).
- **Sync wiring**: `runSportsSync()` in `src/worker/services/sportsSync.ts` calls `fetchAllStatpal()` first when `STATPAL_KEY` is present, then writes through the existing `upsertEvents()` path (legacy `events` table → `/api/events/by-sport`).
- **Critical fix**: `events.external_event_id` previously had only a *partial* unique index (`WHERE external_event_id IS NOT NULL`), which SQLite rejects for `ON CONFLICT(external_event_id)`. Replaced with a full unique index (`uniq_events_external_event_id_full`) — every prior sync had been silently dropping all upsert batches. Fixed in `src/worker/db.ts` and via `POST /api/admin/repair-events-index` (one-shot migration that backfills NULL/empty external_event_id with `legacy_<id>` then rebuilds the index).
- **Diagnostic endpoints** (admin-token gated): `GET /api/admin/events-debug` (totals/by-sport/index list/sample), `POST /api/admin/test-upsert` (single-row insert that returns verbatim D1 error if it fails), `POST /api/admin/repair-events-index` (idempotent index repair).
- **API-Sports / Odds-API**: keys dead (account suspended/invalid); StatPal block in `runSportsSync` runs whenever `STATPAL_KEY` is present, independent of legacy keys.

## EventCard Mobile Layout — Markets + Live Indicators (Apr 26, 2026)
- **MERCADOS sub-row** (Totals + BTTS) on every card: backend emits real markets JSON via `src/worker/services/statpalApi.ts`.
- **`formatEvent` in `src/worker/sports.ts`** parses the stored `markets` JSON and emits `markets: [{key:'h2h'…}, {key:'totals', line:…}, {key:'btts'…}]` so `EventCard.tsx` (which reads `currentMarkets.find(m => m.key === 'totals'/'btts')`) renders the "Mercados:" strip.
- **Live score + minute**: comes from Statpal v2 odds endpoint (`match_info.score` and `minute`) when available, otherwise approximated from v1 status (HT→45, "1st"→25, "2nd"→70).

## Real Odds via Statpal v2 (Apr 26, 2026) — REPLACED ALL FAKE ODDS
- **Endpoint**: `GET https://statpal.io/api/v2/soccer/odds/live?access_key=KEY` — only LIVE soccer (62 matches typical, ~24 markets each). Prematch v2 + non-soccer v2 = 404, so they remain odds-less.
- **Market mapping** in `parseV2OddsForMatch()`:
  - `3610 Fulltime Result` → `h2h` (lines: Home/Draw/Away → `home_odd`/`draw_odd`/`away_odd`)
  - `2254 Match Goals` → `totals` (lines have `handicap` field; `pickPrimaryTotalsLine()` chooses the line closest to 2.5; falls back to whatever bookmaker offers — e.g. 0.5/1.5/3.5)
  - `12398 Both Teams to Score` → `btts` (Yes/No). Present on ~45/62 matches; missing matches simply have no btts chip.
- **Match cross-reference**: v2 returns `match_info.main_id` + `fallback_id_1/2/3`. Built into a `Map<id, ParsedOdds>` indexed by every candidate. v1 livescores `match.id` + `match.alternate_id` are looked up against this map.
- **Score & minute override**: when v2 has the match, its `match_info.score` ("0:1") and `match_info.minute` override v1's status-derived approximation (so card shows real live minute, not bucket-25/70 estimates).
- **NO synthetic odds**: deleted `baselineOdds()` and `buildSoccerMarketsJson()`. Events without real v2 odds (all prematch soccer, all tennis/F1/golf, low-tier live leagues not in v2) carry `home_odd=0/draw_odd=0/away_odd=0/markets=''` — frontend hides the betting buttons rather than show fakes.
- **Verified on prod (`/api/featured-games`)**: 4/4 live soccer matches with distinct real odds (e.g. AFS 0:0 Sporting CP at 45' → 15/4.333/1.3, totals L2.5 2.625/1.444, btts 4/1.222). Each match has unique odds — confirmed problem of identical 2.10/3.30/3.20 across all events is GONE.
- **Force resync**: `POST /api/admin/force-sync-wait` with header `Authorization: Bearer dev-admin-token` (cron `*/5 * * * *` also refreshes automatically).

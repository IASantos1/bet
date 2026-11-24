# BET62 Casino 2.0 — Architecture

Status: design baseline / isolated implementation
Target branch: `feature/bet62-casino-v2`
Production integration: not authorized
Deployment: not authorized

## Product goals

- Deliver distinct, responsive mobile and desktop casino layouts.
- Reuse the existing casino catalog, game launch, banners, collections, spotlights and provider integrations where possible.
- Add a content-management layer for page sections and editorial ordering.
- Add an AI Studio using an interchangeable model adapter (OpenAI / Anthropic Claude).
- Require a human approval for every content publication.

## Existing capabilities found on main

The current repository already contains:
- `server/banners.js`: persistent casino banner data and validation.
- `server/collections.js`: game collections and lobby placement.
- `server/spotlights.js`: featured game placements.
- `server/seasonal.js`: seasonal campaign support.
- `server/casinolobby.js`: provider ordering and lobby classification.
- `server/casino.js`: casino provider/game integration.
- `public/index.html`, `public/app.js`, `public/styles.css`: current application shell and frontend.
- Existing casino, catalog, spotlight and provider tests under `test/`.

These modules are the integration baseline. Do not create duplicate game, provider, wallet, session or launch systems.

## Proposed logical architecture

1. Casino presentation
   - Mobile and desktop layouts share semantic content but have separate responsive composition.
   - Read-only view model supplied by a casino content API.
   - Existing game-launch flow remains the only launch path.

2. Casino content service
   - Sections, ordering, device visibility and display limits.
   - References existing games/providers by their canonical IDs.
   - Banner/collection/spotlight adapters reuse existing services.
   - Draft and published revisions are separate.

3. Admin CMS
   - Manage sections, banners, collections and editorial content.
   - Preview desktop/mobile.
   - Audit log for every change.
   - Role checks on every write operation.

4. AI Studio
   - AI Orchestrator selects a provider adapter (OpenAI or Anthropic).
   - Model tools can read permitted catalog metadata and create drafts only.
   - AI tools cannot publish, launch games, change wallet/payment data, alter game math/RTP, or write directly to production tables.
   - Human approval is required before publication.

5. Publication service
   - Validates draft schema, links, assets, dates, device variants and permissions.
   - Approval action creates a published revision atomically.
   - Rollback restores a prior published revision.
   - No AI model receives a publish capability.

## Suggested data model (to reconcile with existing schema before migrations)

- `casino_layout_sections`: section key, title, type, position, enabled, mobile_enabled, desktop_enabled, display_limit, config JSON, timestamps.
- `casino_layout_section_games`: section ID, canonical provider game ID, position.
- `casino_content_drafts`: content type, payload JSON, created_by, source (admin/AI), status, validation report.
- `casino_content_revisions`: immutable approved/published payload, version, approved_by, published_at.
- `casino_content_audit`: actor, action, target, before/after metadata, timestamp.
- `ai_conversations` and `ai_messages`: admin-only assistant history, retention policy and provider/model metadata.

Do not create these tables until the current database engine, migration conventions, admin authorization middleware and backup/restore strategy have been inspected.

## API boundaries (proposal only)

- Public read: `GET /api/casino/v2/home`
- Admin read: `GET /api/admin/casino/v2/layout`
- Admin draft writes: `POST/PATCH /api/admin/casino/v2/drafts`
- AI draft generation: `POST /api/admin/casino/v2/ai/drafts`
- Validation: `POST /api/admin/casino/v2/drafts/:id/validate`
- Human approval/publication: `POST /api/admin/casino/v2/drafts/:id/approve`
- Rollback: `POST /api/admin/casino/v2/revisions/:id/restore`

All endpoints above are design proposals, not implemented routes.

## Security and operational controls

- API keys remain server-side and are never sent to browsers.
- Provider adapters have explicit per-tool allowlists.
- All admin writes require authentication, role authorization, CSRF/origin protection consistent with the existing app, schema validation and audit records.
- Asset uploads enforce MIME, size and image-dimension limits.
- Content rendering escapes text and rejects unsafe URLs.
- AI output is untrusted input and must pass the same validators as manual input.
- Rate-limit AI usage and record cost/model metadata.
- No changes to wallet, deposits, withdrawals, sportsbook, settlement, game launch, provider callbacks or game math.
- Feature remains opt-in and isolated until reviewed.

## Acceptance criteria

- Mobile and desktop preview render independently and without production APIs.
- Existing casino tests continue passing.
- No existing production file is replaced as part of the prototype.
- No migration is run against production data.
- No production route or navigation points to v2 until explicit approval.
- Human approval is required for every published content revision.

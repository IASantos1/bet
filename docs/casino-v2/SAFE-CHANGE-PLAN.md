# BET62 Casino 2.0 — Safe change plan

## Baseline

- Base branch: `main`
- Baseline commit: `8b30022f17aad6ec0a93f696a2d6e199d6c94794`
- Working branch: `feature/bet62-casino-v2`
- Scope: isolated prototype and documentation only.
- Production deployment: prohibited until separately authorized.

## Protected areas

Do not edit during the first implementation slice:
- `public/app.js`
- `public/styles.css`
- `public/index.html`
- `server/app.js`
- `server/index.js`
- `server/casino.js`
- wallet, payments, authentication, sportsbook and settlement modules
- existing provider launch and callback flows

## Safe implementation sequence

1. Build the standalone visual prototype under `prototypes/bet62-casino-v2/`.
2. Review responsive behavior and accessibility.
3. Inspect existing admin authorization, database and migration patterns.
4. Implement a read-only adapter over existing casino services.
5. Add CMS draft operations in separate modules and isolated tests.
6. Add AI provider adapters with draft-only tools.
7. Add approval, audit and revision/rollback workflow.
8. Run relevant tests and the complete existing test suite.
9. Open a draft pull request for human review.
10. Integrate/deploy only after separate explicit approval.

## Rollback

The prototype can be removed by reverting commits on this feature branch. Since the prototype is not imported by the production entry point and no existing files are edited, it has no production runtime effect.

## Required checks before any integration

- Confirm the current branch head and diff against the recorded base.
- Run project tests on the branch.
- Verify the frontend's initial loading and route lifecycle.
- Verify no changes to wallet, payment, game launch or provider callbacks.
- Review dependency and security impact.
- Confirm production database backups and migration rollback plan before any schema change.

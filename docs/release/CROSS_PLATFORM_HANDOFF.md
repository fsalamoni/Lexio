# Cross-Platform Handoff - Wave 35

Last update: 2026-04-25

## Objective
This file is the minimum operational package to continue Lexio work from another platform/session with no loss of planning, index, or cache context.

## Repository Snapshot
- Branch: main
- Current head: resolve at handoff time with `git rev-parse --short HEAD`
- Last functional wave commit: cf5b673
- Working tree status at closeout: clean

## Latest Stable Release (One-shot)
- Workflow: .github/workflows/release-web.yml
- Run: 24919036006
- Conclusion: success
- Head validated by release: cf5b673

Jobs:
- Frontend quality: 72976871261 (success)
- Functions quality: 72976871264 (success)
- Unit tests: 72976871272 (success)
- Lint (ruff): 72976871275 (success)
- Source guardrails: 72976871279 (success)
- Deploy Firebase production: 72976938644 (success)
- Deploy GitHub Pages / build: 72976938671 (success)
- Deploy GitHub Pages / deploy: 72977011670 (success)
- Deploy redesign V2: 72976938808 (skipped by input)
- Release summary: 72977113533 (success)

## Canonical Docs to Continue Work
Read/update in this order when opening the next cycle:
1. docs/PLANO.md
2. NOTEBOOK_IMPLEMENTATION_STATUS.md
3. docs/release/WEB_RELEASE_INDEX.md
4. docs/MANIFEST.json
5. docs/release/WEB_RELEASE_CACHE.md
6. docs/release/CROSS_PLATFORM_HANDOFF.md

## What Was Delivered in Wave 35
- `frontend/src/lib/firestore-types.ts` now defines `PlatformFunctionWindowComparisonRow` to represent current-vs-previous function windows (calls/cost/latency/retry/fallback/waiting I/O + deltas).
- `frontend/src/lib/firestore-service.ts` now exposes `getPlatformFunctionWindowComparison(...)`, aggregating reliability/cost drift per function on rolling windows with percent deltas for executive tuning.
- `frontend/src/pages/PlatformAdminPanel.tsx` now renders a dedicated function-level comparative block (delta cards, per-function table and hotspot recommendations), preserving and complementing the multiagent live demonstration section.
- Governance/index/cache/handoff docs were synchronized for Wave 35 closeout with real one-shot release IDs.

## Validation Baseline
Frontend:
- npm run typecheck
- npm run test -- --run (38 files, 299 tests)
- npm run build
- functions npm run build

Release lane:
- release-web.yml one-shot run 24919036006 completed in success

## Next Logical Block (starting point)
- Monitor production impact from the new function-window comparison panel, prioritizing sustained drifts in `waiting_io`, `retrying` and cost-per-call by function.
- Calibrate per-function thresholds combining reliability matrix + window deltas while keeping the agent demonstration surface stable.
- Keep the same governance closeout order and one-shot release verification.

## Fast Resume Commands
From repo root:
- git checkout main
- git pull --rebase --autostash origin main
- cd frontend
- npm install
- npm run typecheck
- npm run test -- --run
- npm run build

Release trigger:
- gh workflow run release-web.yml -f deploy_firebase=true -f deploy_github_pages=true -f deploy_redesign_v2=false

## Notes
- Keep GitHub Pages and Firebase both validated for each closeout cycle.
- Keep redesign V2 optional unless explicitly requested.
- Preserve current policy: no new backend runtime for production logic (frontend TS first).

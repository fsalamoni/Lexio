# Cross-Platform Handoff - Wave 34

Last update: 2026-04-25

## Objective
This file is the minimum operational package to continue Lexio work from another platform/session with no loss of planning, index, or cache context.

## Repository Snapshot
- Branch: main
- Current head: resolve at handoff time with `git rev-parse --short HEAD`
- Last functional wave commit: 4cc2432
- Working tree status at closeout: clean

## Latest Stable Release (One-shot)
- Workflow: .github/workflows/release-web.yml
- Run: 24917777336
- Conclusion: success
- Head validated by release: 4cc2432

Jobs:
- Lint (ruff): 72973180460 (success)
- Functions quality: 72973180461 (success)
- Frontend quality: 72973180463 (success)
- Unit tests: 72973180467 (success)
- Source guardrails: 72973180468 (success)
- Deploy Firebase production: 72973266685 (success)
- Deploy GitHub Pages / build: 72973266761 (success)
- Deploy GitHub Pages / deploy: 72973349766 (success)
- Deploy redesign V2: 72973266829 (skipped by input)
- Release summary: 72973480926 (success)

## Canonical Docs to Continue Work
Read/update in this order when opening the next cycle:
1. docs/PLANO.md
2. NOTEBOOK_IMPLEMENTATION_STATUS.md
3. docs/release/WEB_RELEASE_INDEX.md
4. docs/MANIFEST.json
5. docs/release/WEB_RELEASE_CACHE.md
6. docs/release/CROSS_PLATFORM_HANDOFF.md

## What Was Delivered in Wave 34
- `frontend/src/lib/firestore-types.ts` now defines dedicated contracts for execution-state daily trend and window comparison (`PlatformExecutionStateDailyPoint`, `PlatformExecutionStateWindowComparisonRow`).
- `frontend/src/lib/firestore-service.ts` now exposes `getPlatformExecutionStateDaily(...)` and `getPlatformExecutionStateWindowComparison(...)` to aggregate calls/cost/latency/retry/fallback by `execution_state` across daily and comparative windows.
- `frontend/src/pages/PlatformAdminPanel.tsx` now renders comparative daily monitoring: 7-day current vs previous deltas, per-state comparative table, recent daily slice and recommendations driven by operational drift.
- Governance/index/cache/handoff docs were synchronized for Wave 34 closeout with real one-shot release IDs.

## Validation Baseline
Frontend:
- npm run typecheck
- npm run test -- --run (38 files, 299 tests)
- npm run build
- functions npm run build

Release lane:
- release-web.yml one-shot run 24917777336 completed in success

## Next Logical Block (starting point)
- Monitor production impact from the new daily comparison panel (especially `waiting_io` and `retrying` drifts).
- Calibrate per-function thresholds combining recent reliability matrix + daily window deltas without UX regression.
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

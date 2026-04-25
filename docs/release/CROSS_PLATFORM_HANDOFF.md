# Cross-Platform Handoff - Wave 37

Last update: 2026-04-25

## Objective
This file is the minimum operational package to continue Lexio work from another platform/session with no loss of planning, index, or cache context.

## Repository Snapshot
- Branch: main
- Current head: resolve at handoff time with `git rev-parse --short HEAD`
- Last functional wave commit: db87300
- Working tree status at closeout: clean

## Latest Stable Release (One-shot)
- Workflow: .github/workflows/release-web.yml
- Run: 24930689755
- Conclusion: success
- Head validated by release: db87300

Jobs:
- Lint (ruff): 73007836380 (success)
- Unit tests: 73007836384 (success)
- Source guardrails: 73007836385 (success)
- Frontend quality: 73007836396 (success)
- Functions quality: 73007836430 (success)
- Deploy Firebase production: 73007901714 (success)
- Deploy GitHub Pages / build: 73007901743 (success)
- Deploy GitHub Pages / deploy: 73007952932 (success)
- Deploy redesign V2: 73007901740 (skipped by input)
- Release summary: 73008038665 (success)

## Canonical Docs to Continue Work
Read/update in this closeout order when opening the next cycle:
1. docs/PLANO.md
2. docs/MANIFEST.json
3. docs/release/WEB_RELEASE_CACHE.md
4. NOTEBOOK_IMPLEMENTATION_STATUS.md
5. docs/release/WEB_RELEASE_INDEX.md
6. docs/release/CROSS_PLATFORM_HANDOFF.md

## What Was Delivered in Wave 37
- `frontend/src/lib/firestore-types.ts` now defines daily adherence contracts (`PlatformFunctionTargetAdherenceStatus`, `PlatformFunctionTargetAdherenceRow`, `PlatformFunctionTargetAdherenceDailyPoint`) for live-vs-target monitoring by function.
- `frontend/src/lib/firestore-service.ts` now exposes `getPlatformFunctionTargetAdherenceDaily(...)`, computing daily live pressure, target pressure, coverage and status (`above_target`/`aligned`/`below_target`) from operational executions and calibration targets.
- `frontend/src/pages/PlatformAdminPanel.tsx` now renders a daily adherence block with stability/coverage cards, top-function live/alvo table, 7-day trend and rollout-assisted recommendations, while preserving the existing multiagent demonstration panel.
- Governance/index/cache/handoff docs were synchronized for Wave 37 closeout with real one-shot release IDs.

## Validation Baseline
Frontend:
- npm run typecheck
- npm run test -- --run (38 files, 299 tests)
- npm run build
- functions npm run build

Backend tests:
- python -m pytest -q (2203 passed)

Release lane:
- release-web.yml one-shot run 24930689755 completed in success

## Next Logical Block (starting point)
- Consolidar política progressiva de rollout assistido por criticidade usando o histórico diário de aderência (limites por função e janela de confirmação para relax/tighten).
- Introduzir guardrails preditivos para funções com tendência de elevação simultânea em retry + waiting I/O antes de atingir faixa crítica.
- Manter o mesmo ordenamento de closeout documental e a verificação one-shot de release em todos os ciclos.

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

# Cross-Platform Handoff - Wave 36

Last update: 2026-04-25

## Objective
This file is the minimum operational package to continue Lexio work from another platform/session with no loss of planning, index, or cache context.

## Repository Snapshot
- Branch: main
- Current head: resolve at handoff time with `git rev-parse --short HEAD`
- Last functional wave commit: cfdb2ac
- Working tree status at closeout: clean

## Latest Stable Release (One-shot)
- Workflow: .github/workflows/release-web.yml
- Run: 24919950308
- Conclusion: success
- Head validated by release: cfdb2ac

Jobs:
- Unit tests: 72979425700 (success)
- Functions quality: 72979425703 (success)
- Source guardrails: 72979425705 (success)
- Frontend quality: 72979425706 (success)
- Lint (ruff): 72979425707 (success)
- Deploy Firebase production: 72979501786 (success)
- Deploy GitHub Pages / build: 72979501863 (success)
- Deploy GitHub Pages / deploy: 72979567744 (success)
- Deploy redesign V2: 72979501818 (skipped by input)
- Release summary: 72979652973 (success)

## Canonical Docs to Continue Work
Read/update in this order when opening the next cycle:
1. docs/PLANO.md
2. NOTEBOOK_IMPLEMENTATION_STATUS.md
3. docs/release/WEB_RELEASE_INDEX.md
4. docs/MANIFEST.json
5. docs/release/WEB_RELEASE_CACHE.md
6. docs/release/CROSS_PLATFORM_HANDOFF.md

## What Was Delivered in Wave 36
- `frontend/src/lib/firestore-types.ts` now defines calibration contracts (`PlatformFunctionCalibrationRow`, `PlatformFunctionCalibrationAction`, `PlatformFunctionCalibrationPriority`) for adaptive per-function targeting.
- `frontend/src/lib/firestore-service.ts` now exposes `getPlatformFunctionCalibrationPlan(...)`, computing function-level risk score, priority and action (`tighten`/`maintain`/`relax`) with recommended targets for retry/fallback/waiting I/O.
- `frontend/src/pages/PlatformAdminPanel.tsx` now renders an adaptive calibration block (plan cards, target table, recommendations) and links live multiagent demonstration signals to per-function targets (above/aligned/below target).
- Governance/index/cache/handoff docs were synchronized for Wave 36 closeout with real one-shot release IDs.

## Validation Baseline
Frontend:
- npm run typecheck
- npm run test -- --run (38 files, 299 tests)
- npm run build
- functions npm run build

Release lane:
- release-web.yml one-shot run 24919950308 completed in success

## Next Logical Block (starting point)
- Monitor produção para validar aderência dos sinais live versus alvo por função (especialmente `waiting_io` e `retrying`) com recorte diário de estabilidade.
- Ajustar política de rollout assistido da calibração (tighten/maintain/relax) por criticidade, evitando regressão de custo e UX no painel admin.
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

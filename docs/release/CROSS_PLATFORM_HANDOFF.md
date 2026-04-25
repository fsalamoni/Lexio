# Cross-Platform Handoff - Wave 38

Last update: 2026-04-25

## Objective
This file is the minimum operational package to continue Lexio work from another platform/session with no loss of planning, index, or cache context.

## Repository Snapshot
- Branch: main
- Current head: resolve at handoff time with `git rev-parse --short HEAD`
- Last functional wave commit: f5cbf57
- Working tree status at closeout: clean

## Latest Stable Release (One-shot)
- Workflow: .github/workflows/release-web.yml
- Run: 24933092299
- Conclusion: success
- Head validated by release: f5cbf57

Jobs:
- Source guardrails: 73013994216 (success)
- Frontend quality: 73013994220 (success)
- Lint (ruff): 73013994224 (success)
- Unit tests: 73013994226 (success)
- Functions quality: 73013994229 (success)
- Deploy Firebase production: 73014056225 (success)
- Deploy GitHub Pages / build: 73014056272 (success)
- Deploy GitHub Pages / deploy: 73014131480 (success)
- Deploy redesign V2: 73014056331 (skipped by input)
- Release summary: 73014216569 (success)

## Canonical Docs to Continue Work
Read/update in this closeout order when opening the next cycle:
1. docs/PLANO.md
2. docs/MANIFEST.json
3. docs/release/WEB_RELEASE_CACHE.md
4. NOTEBOOK_IMPLEMENTATION_STATUS.md
5. docs/release/WEB_RELEASE_INDEX.md
6. docs/release/CROSS_PLATFORM_HANDOFF.md

## What Was Delivered in Wave 38
- `frontend/src/lib/firestore-types.ts` now defines progressive rollout policy contracts (`PlatformFunctionRolloutRecommendation`, `PlatformFunctionRolloutRiskLevel`, `PlatformFunctionRolloutGuardrails`, `PlatformFunctionRolloutPolicyRow`, `PlatformFunctionRolloutPolicyPlan`) for risk/recommendation monitoring by function.
- `frontend/src/lib/firestore-service.ts` now exposes `getPlatformFunctionRolloutPolicyPlan(...)`, computing trend pressure, retry+waiting drift, adherence streaks, risk level and progressive recommendation (`tighten_now`/`tighten_guarded`/`hold`/`relax_guarded`) with guardrails by criticality.
- `frontend/src/pages/PlatformAdminPanel.tsx` now renders the Wave 38 executive block with policy summary cards, risk/recommendation table per function, predictive drift alerts and actionable guardrail recommendations, while preserving the multiagent demonstration panel.
- Governance/index/cache/handoff docs were synchronized for Wave 38 closeout with real one-shot release IDs.

## Validation Baseline
Frontend:
- npm run typecheck
- npm run test -- --run (38 files, 299 tests)
- npm run build
- functions npm run build

Backend tests:
- python -m pytest -q (2203 passed)

Release lane:
- release-web.yml one-shot run 24933092299 completed in success

## Next Logical Block (starting point)
- Consolidar feedback de produção da política progressiva para recalibrar limites de guardrail por criticidade e reduzir alertas preditivos com baixa precisão.
- Ajustar thresholds de tendência para drift combinado de retry + waiting I/O por perfil operacional (alto volume vs baixa cobertura) sem perder sensibilidade para riscos críticos.
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

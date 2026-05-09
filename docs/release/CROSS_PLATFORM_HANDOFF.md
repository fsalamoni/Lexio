# Cross-Platform Handoff - Wave 42 Firestore Cutover

Last update: 2026-05-09

## Objective
This file is the minimum operational package to continue Lexio work from another platform/session with no loss of planning, index, or cache context.

## Repository Snapshot
- Branch: main
- Current head: resolve at handoff time with `git rev-parse --short HEAD`
- Latest merged release baseline: 15b32d1
- Validated head before merge: 366628c
- Target Firestore database: lexio-prod
- Working tree status at handoff: resolve with `git status --short` before continuing

## Latest Wave 42 Productive Release
- Firebase workflow: .github/workflows/firebase-deploy.yml
- Main Tests workflow: 25576968289 (success)
- Firebase run: 25576968354 (success)
- One-shot workflow: .github/workflows/release-web.yml
- release-web run: 25581626099 (success)
- Functional payload validated by release: 15b32d1
- Release lane summary: Firebase production and GitHub Pages were published against the `lexio-prod` cutover baseline; redesign V2 stayed intentionally skipped.
- Public smoke: `https://lexio.web.app/login` and `https://fsalamoni.github.io/Lexio/login` returned 200 with React root rendered.
- Authenticated production smoke: dashboard, documents, generator, notebook, chat, settings and profile loaded without login redirects.
- Firestore monitor: 34 calls to `lexio-prod`, 0 to `(default)`, 0 bad Firestore responses, 0 request failures and 0 console errors.
- DataJud proxy smoke: valid `tjrs` request returned 200; no `datajudProxy` errors were observed after release start.

## Canonical Docs to Continue Work
Read/update in this closeout order when opening the next cycle:
1. docs/PLANO.md
2. docs/MANIFEST.json
3. docs/release/PLATFORM_AUDIT_MATRIX.md
4. docs/release/PLATFORM_AUDIT_RISK_SCAN.md
5. docs/release/PLATFORM_AUDIT_FAULT_MATRIX.md
6. docs/release/PLATFORM_AUDIT_DEEP_SWEEP.md
7. docs/release/PLATFORM_AUDIT_RELEASE_CLOSEOUT.md
8. docs/release/PLATFORM_AUDIT_RESIDUAL_SUMMARY.md
9. docs/release/PLATFORM_AUDIT_FINAL_CLOSEOUT.md
10. docs/release/WEB_RELEASE_CACHE.md
11. docs/release/WEB_RELEASE_INDEX.md
12. NOTEBOOK_IMPLEMENTATION_STATUS.md
13. docs/release/CROSS_PLATFORM_HANDOFF.md

## What Was Delivered in Wave 42
- Firestore runtime was isolated to the named production database `lexio-prod` while preserving `(default)` as rollback-only data.
- Migration tooling, parity validation, rules/indexes publication and workflow wiring were closed for the cutover without data loss.
- Production clients now target `lexio-prod`, and authenticated/public/browser-monitor smoke confirmed the cutover with zero observed traffic to `(default)`.
- The whole-platform audit now has executable artifacts for baseline, risk scan, fault injection, deep stateful sweep and release closeout under `docs/release/`.
- Planning, manifest, release cache/index and this handoff are synchronized to the latest merged release baseline, so the next cycle can continue without replaying prior session context.

## Validation Baseline
Frontend:
- architecture check OK
- npm run typecheck OK
- frontend full test suite OK (71 files, 537 tests)
- npm run build with `VITE_FIRESTORE_DATABASE_ID=lexio-prod` OK
- functions npm run build
- manifest JSON OK
- `git diff --check` OK

Backend tests:
- python -m pytest -q (2203 passed)
- python -m ruff check packages tests

Release lane:
- Tests workflow run 25576968289 completed in success
- firebase-deploy.yml push run 25576968354 completed in success
- release-web.yml one-shot run 25581626099 completed in success

## Next Logical Block (starting point)
- Classify any residuals left by the audit artifacts and keep the release closeout pack synchronized as new fixes land.
- If a new payload changes release-sensitive surfaces, rerun the audit scripts before dispatching the one-shot lane again.
- Keep `lexio-prod` as the only production target and do not delete `(default)` data without a separate cleanup plan.

## Fast Resume Commands
From repo root:
- git checkout main
- git pull --rebase --autostash origin main
- git status --short
- cd frontend
- npm install
- npm run audit:baseline
- npm run audit:riskscan
- npm run audit:faults
- npm run audit:deep
- npm run audit:final
- npm run audit:release
- npm run audit:residuals
- npm run typecheck
- npm run test -- --run
- npm run build

Release trigger:
- gh workflow run release-web.yml -f deploy_firebase=true -f deploy_github_pages=true -f deploy_redesign_v2=false

## Notes
- Keep GitHub Pages and Firebase both validated for each closeout cycle.
- Keep redesign V2 optional unless explicitly requested.
- Preserve current policy: no new backend runtime for production logic (frontend TS first).
- Treat `docs/release/PLATFORM_AUDIT_RELEASE_CLOSEOUT.md` as the operational gate report for the release-closeout macrophase.
- Do not clean up legacy `(default)` Firestore data as part of ordinary feature work.

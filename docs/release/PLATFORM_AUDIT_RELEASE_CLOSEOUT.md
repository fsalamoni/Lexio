# Platform Audit Release Closeout

Generated: 2026-05-09T15:37:41.045Z
Git branch: unknown
Git head: unknown

## Latest Release Baseline
- Merge commit: 15b32d1
- Tests workflow run: 25576968289
- Firebase production run: 25576968354
- Release-web run: 25581626099
- Target database: lexio-prod

## Snapshot
- Total gates: 13
- Covered by repo evidence: 13
- Drift detected: 0
- Missing gates: 0
- Open high-risk gates: 0
- Open medium-risk gates: 0

## Release Closeout Matrix
| Gate | Area | Evidence | Recommended Validation | Risk | Status |
| --- | --- | --- | --- | --- | --- |
| Release workflow dispatch contract | workflow | release-web.yml (one-shot workflow keeps manual dispatch enabled); release-web.yml (Firebase production remains a first-class release input); release-web.yml (GitHub Pages remains a first-class release input); release-web.yml (redesign V2 stays explicitly optional during one-shot release) | rg -n "workflow_dispatch|deploy_firebase|deploy_github_pages|deploy_redesign_v2" .github/workflows/release-web.yml | high | covered-by-repo-evidence |
| Release lane fanout and summary | workflow | release-web.yml (release lane still gates on the reusable quality workflow); release-web.yml (release lane still fans out to Firebase production deploy); release-web.yml (release lane still fans out to GitHub Pages deploy); release-web.yml (release lane still emits a final outcome summary); firebase-deploy.yml (Firebase production workflow file exists for release fanout); deploy-pages.yml (GitHub Pages workflow file exists for release fanout); test.yml (quality-gates workflow target exists) | rg -n "quality-gates|deploy-firebase|deploy-pages|release-summary" .github/workflows/release-web.yml | high | covered-by-repo-evidence |
| Release plan document present | docs | WEB_RELEASE_PLAN.md (release plan keeps an explicit goal section); WEB_RELEASE_PLAN.md (release plan keeps an explicit scope section) | rg -n "## Goal|## Scope" docs/release/WEB_RELEASE_PLAN.md | medium | covered-by-repo-evidence |
| Release index current baseline | docs | WEB_RELEASE_INDEX.md (release index keeps a current validation baseline section); WEB_RELEASE_INDEX.md (current baseline records main deploy run IDs); WEB_RELEASE_INDEX.md (current baseline records public smoke results); WEB_RELEASE_INDEX.md (current baseline records authenticated production smoke results); WEB_RELEASE_INDEX.md (current baseline records Firestore monitoring results); WEB_RELEASE_INDEX.md (current baseline records DataJud proxy smoke results) | rg -n "Main deploys|Public smoke|Authenticated production smoke|Firestore monitoring|DataJud proxy smoke" docs/release/WEB_RELEASE_INDEX.md | high | covered-by-repo-evidence |
| Release cache synced with current baseline | docs | WEB_RELEASE_CACHE.md (release cache keeps a current validation section); WEB_RELEASE_CACHE.md (release cache carries the latest recorded run IDs) | rg -n "Current Validation Cache|25576968289|25576968354|25581626099" docs/release/WEB_RELEASE_CACHE.md | high | covered-by-repo-evidence |
| Planning doc synced with current release IDs | docs | PLANO.md (planning log carries the latest merge and deploy IDs) | rg -n "25576968289|25576968354|25581626099|15b32d1" docs/PLANO.md | high | covered-by-repo-evidence |
| Manifest synced with current release IDs | docs | MANIFEST.json (manifest notes carry the latest merge and deploy IDs) | rg -n "25576968289|25576968354|25581626099|15b32d1" docs/MANIFEST.json | high | covered-by-repo-evidence |
| Cross-platform handoff synced with current release | handoff | CROSS_PLATFORM_HANDOFF.md (handoff doc carries the same merge and deploy IDs as the current release baseline) | rg -n "25576968289|25576968354|25581626099|15b32d1" docs/release/CROSS_PLATFORM_HANDOFF.md | high | covered-by-repo-evidence |
| Cross-platform handoff resume package | handoff | CROSS_PLATFORM_HANDOFF.md (handoff doc keeps the canonical docs read order); CROSS_PLATFORM_HANDOFF.md (handoff doc keeps git resume commands); CROSS_PLATFORM_HANDOFF.md (handoff doc keeps frontend validation commands); CROSS_PLATFORM_HANDOFF.md (handoff doc keeps the one-shot release trigger command) | rg -n "Canonical Docs to Continue Work|git pull --rebase --autostash origin main|npm run typecheck|gh workflow run release-web.yml" docs/release/CROSS_PLATFORM_HANDOFF.md | medium | covered-by-repo-evidence |
| Release history chain retained | docs | WEB_RELEASE_INDEX.md (release index retains historical validation snapshots); WEB_RELEASE_CACHE.md (release cache retains previous wave outcomes) | rg -n "Previous Validation Baseline|Previous One-shot Validation|Wave 39 Release Outcome|Wave 38 Release Outcome" docs/release/WEB_RELEASE_INDEX.md docs/release/WEB_RELEASE_CACHE.md | low | covered-by-repo-evidence |
| Production cutover target recorded | operational | WEB_RELEASE_INDEX.md (release index records the production Firestore target); WEB_RELEASE_INDEX.md (release index records browser-side Firestore monitoring volume); WEB_RELEASE_CACHE.md (release cache preserves the `(default)` zero-traffic cutoff signal) | rg -n "lexio-prod|0 to `(default)`|34 observed Firestore calls" docs/release/WEB_RELEASE_INDEX.md docs/release/WEB_RELEASE_CACHE.md | high | covered-by-repo-evidence |
| Public/auth/proxy smoke matrix recorded | operational | WEB_RELEASE_INDEX.md (release index records public smoke coverage); WEB_RELEASE_INDEX.md (release index records authenticated smoke coverage); WEB_RELEASE_INDEX.md (release index records proxy smoke coverage) | rg -n "Public smoke|Authenticated production smoke|DataJud proxy smoke" docs/release/WEB_RELEASE_INDEX.md | high | covered-by-repo-evidence |
| Historical closeout archive present | docs | SUBONDA2_CLOSEOUT.md (historical closeout archive is still present); SUBONDA2_CLOSEOUT.md (historical closeout retains its operational section) | rg -n "Closeout da Release|Fechamento Operacional|Próximos Passos" docs/release/SUBONDA2_CLOSEOUT.md | low | covered-by-repo-evidence |

## Open Gates
- none

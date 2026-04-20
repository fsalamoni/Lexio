# Web Release Plan

Last update: 2026-04-20

## Goal
Create a reliable one-shot web release flow and stabilize Firebase deploy behavior after service-account secret changes.

## Scope
- Sync local main with GitHub main
- Harden Firebase auth handling in CI workflows
- Add one-shot orchestrator workflow for full web release
- Validate platform quality gates locally before commit
- Commit and attempt push/deploy trigger

## Phase Checklist
- [x] Phase 1 - Local sync with GitHub
- [x] Phase 2 - CI/CD diagnostics and root-cause mapping
- [x] Phase 3 - Workflow hardening for Firebase auth
- [x] Phase 4 - One-shot release workflow implementation
- [x] Phase 5 - Local validation (typecheck/tests/build/functions)
- [x] Phase 6 - Commit and push/deploy trigger

## Risk Prevention
- Validate service-account JSON before auth steps
- Keep fallback between FIREBASE_TOKEN and FIREBASE_SERVICE_ACCOUNT
- Fail early when no valid Firebase auth path is available
- Preserve typecheck + tests + build gates before any deployment

## Expected Deliverables
- New script: scripts/validate-firebase-service-account.mjs
- New workflow: .github/workflows/release-web.yml
- Hardened workflows:
  - .github/workflows/firebase-deploy.yml
  - .github/workflows/firebase-preview.yml
  - .github/workflows/firebase-redesign-v2.yml
  - .github/workflows/deploy-pages.yml
  - .github/workflows/test.yml
- Operational docs:
  - docs/release/WEB_RELEASE_INDEX.md
  - docs/release/WEB_RELEASE_CACHE.md

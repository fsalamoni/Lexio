# Web Release Index

Last update: 2026-04-22

## Release Entry Points
- .github/workflows/release-web.yml
- .github/workflows/firebase-deploy.yml
- .github/workflows/deploy-pages.yml
- .github/workflows/firebase-redesign-v2.yml
- .github/workflows/test.yml

## Firebase Auth and Secret Validation
- scripts/validate-firebase-service-account.mjs
- scripts/firebase-authorized-domains.mjs

## Related Config
- firebase.json
- .firebaserc
- functions/src/index.ts
- frontend/src/lib/generation-service.ts
- frontend/src/components/TaskBar.tsx
- frontend/src/pages/NewDocument.tsx
- frontend/src/pages/ResearchNotebook.tsx
- frontend/src/contexts/TaskManagerContext.tsx

## Runtime Hardening (2026-04-22)
- Document pipeline now supports Redator rollout via `VITE_DOC_REDATOR_10K_ENABLED` with optional quality rollback controls (`VITE_DOC_REDATOR_QUALITY_ROLLBACK_MIN`, `VITE_DOC_REDATOR_QUALITY_ROLLBACK_DISABLED`).
- Running progress across notebook task wrappers is normalized to remain `<=99%` until persistence is complete.
- `TaskManagerContext` remains the source of truth for task completion (`100%` only after promise resolve).
- Redator rollback execution no longer pushes runtime back to a prior stage in UI; fallback and recheck now stay in `qualidade`, preserving monotonic stage semantics.
- Mobile hardening applied to `TaskBar`, `NewDocument` and `ResearchNotebook` interaction rows to avoid overflow/compression on narrow screens.

## Required Secrets (GitHub Actions)
- FIREBASE_API_KEY
- FIREBASE_TOKEN (recommended) OR FIREBASE_SERVICE_ACCOUNT
- VITE_ADMIN_EMAIL
- DATAJUD_API_KEY (recommended for automatic sync)

## Main Deploy Targets
- Firebase Hosting production: lexio.web.app
- Firebase Functions: datajudProxy
- Firestore rules and indexes
- Storage rules
- GitHub Pages: /Lexio on gh-pages branch

## Operational Runbook (high level)
1. Trigger release-web workflow (manual dispatch)
2. Validate quality gates (tests workflow)
3. Deploy Firebase production lane
4. Deploy GitHub Pages lane
5. Optionally deploy redesign V2 lane

# Web Release Index

Last update: 2026-04-20

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

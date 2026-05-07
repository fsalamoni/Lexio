# Testing Modules

Last update: 2026-05-07

## Required Local Gates

```bash
cd frontend
npm run architecture:check
npm run typecheck
npm run test
npm run build
```

## Focused Test Expectations

- Repository/store changes: test auth-aware Firestore access and fallback behavior.
- Pipeline changes: test prompt routing, progress states, retry/fallback and durable persistence metadata.
- Agent registry changes: test key uniqueness, categories, tiers and user-scoped config compatibility.
- UI hook changes: test loading, success and failure state transitions.
- Provider changes: test success, malformed response, auth failure, transient retry and abort behavior.

## Coverage Policy

Coverage should be measured before becoming a blocking gate. Do not add an arbitrary blocking threshold until the baseline is known and documented.

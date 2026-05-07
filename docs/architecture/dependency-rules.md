# Dependency Rules And Guardrails

Last update: 2026-05-07

Lexio enforces architecture boundaries with `scripts/lexio-architecture-guardrails.mjs`.

Run locally:

```bash
cd frontend
npm run architecture:check
```

The same guardrail runs in `.github/workflows/test.yml` under `Source guardrails`.

## Enforced Rules

The guardrail currently blocks:

- `frontend/src/lib/**` importing from `frontend/src/components/**`.
- `frontend/src/lib/**` importing from `frontend/src/pages/**`.
- `frontend/src/lib/core/**` importing from `frontend/src/lib/modules/**`.
- Cross-module imports of another module's private files.
- Direct OpenRouter API URLs outside approved provider adapters.

## Approved OpenRouter Adapters

These files may hold direct OpenRouter API endpoint URLs:

- `frontend/src/lib/llm-client.ts`
- `frontend/src/lib/image-generation-client.ts`
- `frontend/src/lib/tts-client.ts`
- `frontend/src/lib/model-catalog.ts`
- `frontend/src/lib/providers.ts`
- `frontend/src/lib/datajud-service.ts` for semantic embedding overlay

New direct endpoint usage must be either routed through an existing adapter or documented here before the guardrail allowlist is changed.

## Fixing Violations

- If `lib` needs UI behavior, return structured state or events and let pages/components render or notify.
- If `lib` needs constants from a page, move those constants to `lib/shared` or the owning domain module.
- If `core` needs module behavior, define a core contract and let the module implement it.
- If one module needs another, import only from the other module's public `index.ts`.

## Future Guardrails

Planned additions:

- Firestore path registry validation for new writes.
- Agent registry validation for duplicate keys and missing docs.
- Monolith size/export-count warnings for legacy facades.
- Coverage measurement before deciding any blocking coverage threshold.

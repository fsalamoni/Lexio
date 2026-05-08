# Adding A Lexio Module

Last update: 2026-05-07

Use this guide when adding a new product domain or extracting a domain from legacy files.

## Steps

1. Read `docs/architecture/domain-map.md` and confirm that no existing module owns the feature.
2. Create the module under `frontend/src/lib/modules/<domain>/` only when it has real code.
3. Add `index.ts` as the public API.
4. Add `types.ts` for public domain types.
5. Add repository/service/pipeline files only as needed.
6. Keep UI in `frontend/src/components` or `frontend/src/pages`.
7. Add tests near the module or preserve existing tests through a facade.
8. Run `cd frontend && npm run architecture:check && npm run typecheck && npm run test && npm run build`.
9. Update architecture docs and `docs/MANIFEST.json`.

## Minimum Public API Example

```ts
export type { ExampleModuleOptions, ExampleModuleResult } from './types'
export { runExampleModule } from './service'
```

Do not export internals that other modules should not depend on.

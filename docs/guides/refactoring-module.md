# Refactoring Legacy Code Into Modules

Last update: 2026-05-07

Use this guide when moving behavior out of monolithic files.

## Safe Sequence

1. Add tests or identify existing tests that cover the behavior.
2. Create the new module file with the extracted implementation.
3. Re-export the function/type from the old file so existing imports keep working.
4. Move one responsibility at a time.
5. Run architecture guardrails, typecheck, tests and build.
6. Update docs with the new owner.
7. Migrate call sites in a separate small pass.
8. Remove the facade only after no external call site uses it.

## Do Not

- Move UI components into `lib`.
- Combine module extraction with Firestore data shape changes unless explicitly required.
- Rename public exports without an adapter.
- Change prompts, models and persistence in the same refactor unless the change is the purpose of the task.

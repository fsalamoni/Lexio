# Firestore Database Isolation Plan

Last update: 2026-05-07
Branch: `feature/firestore-database-isolation-core-modules`

## Objective

Move Lexio data toward a dedicated Firestore database inside the existing Firebase project without risking current users, current data, or production behavior.

Target database ID: `lexio-prod`
Source database ID: `(default)`
Firebase project: `hocapp-44760`

## Non-Negotiable Safety Rules

1. Do not delete old data automatically.
2. Do not switch production reads or writes before shadow copy and parity validation pass.
3. Do not copy ambiguous data without a human-reviewed classification report.
4. Do not target `(default)` with the migration script unless running local/emulator tests with `--allow-default-target`.
5. Keep rollback simple: set `VITE_FIRESTORE_DATABASE_ID=(default)`, rebuild, and redeploy.

## Current Implementation Pieces

- `scripts/firebase-cloud-sync.mjs`
  - Supports `--database-id`.
  - Writes raw Firestore fields in `rawFields` so shadow migration preserves Firestore value types.
  - Writes checksum metadata in `manifest.json`.
  - Supports `--verify-manifest`.

- `scripts/lexio-firestore-audit.mjs`
  - Read-only audit over a backup snapshot.
  - Classifies known Lexio paths, ambiguous user roots, unknown user data, and unknown top-level collections.
  - Writes `lexio-firestore-audit.json` beside the snapshot by default.

- `scripts/lexio-firestore-migrate-shadow.mjs`
  - Dry-run by default.
  - Copies only classified Lexio candidates.
  - Requires `--execute` for writes.
  - Refuses execution when ambiguous source paths exist unless `--allow-ambiguous-source` is passed after review.
  - Never deletes source data.

- `scripts/lexio-firestore-validate-shadow.mjs`
  - Compares source and target snapshots by path and normalized field hash.
  - Blocks cutover when documents are missing, extra, or mismatched.

- `frontend/src/lib/firebase.ts`
  - Exposes `FIRESTORE_DATABASE_ID`.
  - Uses `VITE_FIRESTORE_DATABASE_ID` when present.
  - Falls back to `(default)` for full backward compatibility.

## Execution Log — 2026-05-07

Completed on branch `feature/firestore-database-isolation-core-modules`:

- Source backup: `backups/firebase-cloud/2026-05-07_18-32-07`
- Source database: `(default)`
- Firestore documents exported: 1118
- Storage objects listed/downloaded: 37/37
- Manifest checksum verification: passed
- Lexio audit report: `backups/firebase-cloud/2026-05-07_18-32-07/lexio-firestore-audit.json`
- Lexio candidates: 820
- Excluded/ambiguous documents: 298
- Lexio users with signals: 4
- Shadow migration dry-run report: `backups/firebase-cloud/2026-05-07_18-32-07/lexio-shadow-migration-dry-run.json`
- Planned writes to `lexio-prod`: 820
- Dry-run errors: 0

Read-only database inventory confirmed the project currently has `(default)`, `anotes`, `bolao2026`, and `psico`. `lexio-prod` does not exist yet. The existing databases are in `southamerica-east1`; target creation should use the same region unless an explicit architecture decision changes it.

Blocked until explicit checkpoint approval:

- Create `lexio-prod`.
- Execute shadow migration writes.
- Change production `VITE_FIRESTORE_DATABASE_ID`.
- Delete or clean legacy `(default)` data.

## Safe Execution Sequence

### 1. Backup Source

```bash
node scripts/firebase-cloud-sync.mjs \
  --project hocapp-44760 \
  --database-id "(default)" \
  --include-storage-download \
  --verify-manifest
```

Expected output under `backups/firebase-cloud/<timestamp>/`:

- `firestore.database.json`
- `firestore.snapshot.json`
- `storage.objects.json`
- `storage.download.json`
- `manifest.json`
- `storage-files/` when objects are downloaded

### 2. Audit Lexio Data Classification

```bash
node scripts/lexio-firestore-audit.mjs \
  --snapshot backups/firebase-cloud/<timestamp>/firestore.snapshot.json
```

Review:

- `totals.lexioIncluded`
- `totals.ambiguous`
- `samples.ambiguous`
- `counts.excludedByReason`

No execution should continue until ambiguous paths are understood.

### 3. Create Or Validate Target Database

Create `lexio-prod` only after confirming the correct region/location from `firestore.database.json` or Google Cloud Console.

Example shape, not a blind command:

```bash
gcloud firestore databases create \
  --database=lexio-prod \
  --location=<same-or-approved-location>
```

If the database already exists, record that in the migration report and continue.

### 4. Dry-Run Shadow Migration

```bash
node scripts/lexio-firestore-migrate-shadow.mjs \
  --snapshot backups/firebase-cloud/<timestamp>/firestore.snapshot.json \
  --project hocapp-44760 \
  --target-database-id lexio-prod
```

This writes a dry-run plan and performs no writes.

### 5. Execute Shadow Migration Only After Review

```bash
node scripts/lexio-firestore-migrate-shadow.mjs \
  --snapshot backups/firebase-cloud/<timestamp>/firestore.snapshot.json \
  --project hocapp-44760 \
  --target-database-id lexio-prod \
  --execute
```

If the audit found ambiguous paths, do not use `--allow-ambiguous-source` until the report has been reviewed and accepted.

### 6. Backup Target Database

```bash
node scripts/firebase-cloud-sync.mjs \
  --project hocapp-44760 \
  --database-id lexio-prod \
  --skip-storage-download \
  --verify-manifest
```

### 7. Validate Parity

```bash
node scripts/lexio-firestore-validate-shadow.mjs \
  --source-snapshot backups/firebase-cloud/<source-timestamp>/firestore.snapshot.json \
  --target-snapshot backups/firebase-cloud/<target-timestamp>/firestore.snapshot.json \
  --fail-on-mismatch
```

Cutover is blocked unless `migrationReady` is `true`.

### 8. Controlled Cutover

Only after parity is green:

```bash
VITE_FIRESTORE_DATABASE_ID=lexio-prod npm run build
```

Production cutover should be done by env configuration and deploy, never by deleting old data.

## Rollback

Rollback is configuration-only:

1. Set `VITE_FIRESTORE_DATABASE_ID=(default)` or remove the variable.
2. Rebuild frontend.
3. Redeploy stable hosting.
4. Keep `lexio-prod` data intact for diagnosis.

## Old Data Cleanup

Physical deletion from `(default)` is out of scope. It requires a separate plan, a fresh backup, explicit approval, and a proven rollback strategy.

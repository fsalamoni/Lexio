# Firestore Data Boundaries

Last update: 2026-05-07

## Purpose

This document defines which Firestore data belongs to Lexio and how future agents should avoid mixing Lexio data with other platforms that share the same Firebase project.

## Database Boundary

Lexio is moving toward a dedicated Firestore database in the same Firebase project.

- Source during migration: `(default)`
- Target for Lexio: `lexio-prod`
- Runtime selector: `VITE_FIRESTORE_DATABASE_ID`
- Runtime fallback: `(default)`

The fallback is required until shadow migration and cutover are fully validated.

## Known Lexio Paths

Lexio user data is user-scoped under:

```text
/users/{uid}
/users/{uid}/profile/{document}
/users/{uid}/settings/{document}
/users/{uid}/documents/{docId}
/users/{uid}/theses/{thesisId}
/users/{uid}/thesis_analysis_sessions/{sessionId}
/users/{uid}/acervo/{docId}
/users/{uid}/research_notebooks/{notebookId}
/users/{uid}/research_notebooks/{notebookId}/memory/{docId}
/users/{uid}/sidecar_devices/{deviceId}
/users/{uid}/chat_workspace_roots/{rootId}
/users/{uid}/chat_conversations/{conversationId}
/users/{uid}/chat_conversations/{conversationId}/turns/{turnId}
/users/{uid}/chat_conversations/{conversationId}/workspace_bindings/{bindingId}
/users/{uid}/chat_conversations/{conversationId}/sidecar_commands/{commandId}
/users/{uid}/chat_conversations/{conversationId}/approvals/{approvalId}
/users/{uid}/chat_conversations/{conversationId}/audit/{auditId}
```

Legacy Lexio platform settings may exist at:

```text
/settings/platform
```

## Ambiguous Paths

The top-level collection `/users` may also be used by other platforms in the same Firebase project. A root user document by itself is not enough proof that the user belongs only to Lexio.

Classification rules:

- Include root user docs by default only when that UID has known Lexio subcollections.
- Include known Lexio subcollections and nested subcollections.
- Treat unknown top-level collections as out of scope until reviewed.
- Treat unknown `/users/{uid}/{collection}` branches as ambiguous until reviewed.

## Admin Collection Groups

Lexio admin analytics currently depends on these collection groups:

```text
documents
theses
thesis_analysis_sessions
acervo
research_notebooks
memory
chat_conversations
turns
```

Any target database must have rules and indexes compatible with these collection-group reads.

## Storage Boundary

Cloud Storage does not have a Firestore database ID. The first migration phase keeps the current bucket and paths unchanged.

Known Lexio media path:

```text
/research_notebooks/{userId}/{notebookId}/{mediaKind}/{fileName}
```

Do not delete or move Storage objects in the Firestore database migration. Storage isolation can be a later phase if needed.

## Rules For Future Development

1. New persistent data must document its Firestore path before implementation.
2. New user-scoped data should live under `/users/{uid}/{domain}` unless a dedicated module requires a documented exception.
3. New admin aggregation must list required collection groups and indexes.
4. No feature may read from both `(default)` and `lexio-prod` at runtime unless it is a migration or validation tool.
5. No tool may delete legacy data without a separate approved cleanup plan.

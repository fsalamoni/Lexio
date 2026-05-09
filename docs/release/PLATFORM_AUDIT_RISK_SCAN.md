# Platform Audit Risk Scan

Generated: 2026-05-09T13:07:57.043Z
Git branch: main
Git head: a6128f7dd496694fe3692a1adf70300357c2afa6

## Guardrails
- Architecture guardrail: pass
- [lexio-architecture-guardrails] OK (396 source files checked)

## Coverage Gap Counts
- Route gaps: 0
- UI gaps: 0
- Pipeline gaps: 0

## Route Coverage Gaps
- none

## UI Coverage Gaps
- none

## Pipeline Coverage Gaps
- none

## Firestore Collection Usage
- acervo: 12
- documents: 10
- memory: 1
- profile: 3
- research_notebooks: 5
- settings: 5
- theses: 7
- thesis_analysis_sessions: 4
- users: 50

## Unexpected Firestore Collections
- none

## Unexpected CollectionGroup Usages
- none

## Firestore Rules Coverage
- Missing direct user-subcollection rules: 0
- Missing nested user-subcollection rules: 0
- Missing runtime collectionGroup admin rules: 0

## Missing User Subcollection Rules
- none

## Missing Nested User Subcollection Rules
- none

## Missing Runtime CollectionGroup Rules
- none

## Firestore Index Coverage
- CollectionGroup queries detected: 1
- CollectionGroup queries requiring composite index review: 0
- Missing composite collectionGroup indexes: 0
- Unresolved dynamic collectionGroup queries: 0

## Missing CollectionGroup Indexes
- none

## Unresolved CollectionGroup Queries
- none

## Firestore Deploy Configuration
- Target database: lexio-prod
- Missing Firestore deploy databases: 0
- Misconfigured Firestore deploy databases: 0

## Missing Firestore Deploy Databases
- none

## Misconfigured Firestore Deploy Databases
- none

## Unexpected Storage Usages
- none

## Unexpected Frontend OpenRouter Occurrences
- none

## Legacy Backend OpenRouter Occurrences
- packages/core/config.py

## Unexpected Non-Frontend OpenRouter Occurrences
- none

## Non-Frontend OpenRouter Occurrences
- packages/core/config.py

## Auth Session Surface
- Auth observer files detected: 4
- Unexpected auth observer files: 0
- Admin email consumers detected: 2
- Unexpected admin email consumers: 0
- Direct admin role checks detected: 9
- Unexpected direct admin role checks: 0
- Firestore operation files detected: 12
- Unexpected Firestore operation files: 0
- Unexpected unguarded Firestore operation files: 0
- Auth recovery opt-outs detected: 2
- Unexpected auth recovery opt-outs: 0
- Firestore bootstrap files detected: 1
- Unexpected Firestore bootstrap files: 0
- Unexpected Firestore database env consumers: 0
- Session storage files detected: 5
- Unexpected session storage files: 0
- Unexpected session storage writers: 0

## Unexpected Auth Observer Usages
- none

## Unexpected Admin Email Consumers
- none

## Unexpected Direct Admin Role Checks
- none

## Unexpected Firestore Operation Files
- none

## Unexpected Unguarded Firestore Operation Files
- none

## Unexpected Auth Recovery Opt-Outs
- none

## Unexpected Firestore Bootstrap Usages
- none

## Unexpected Firestore Database Env Consumers
- none

## Unexpected Session Storage Files
- none

## Unexpected Session Storage Writers
- none

## Sensitive Config Defaults
- Findings: 0

## Sensitive Config Default Findings
- none

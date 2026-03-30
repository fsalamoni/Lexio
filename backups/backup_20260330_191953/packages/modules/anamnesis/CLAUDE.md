# Anamnesis Module — CLAUDE.md

## Purpose
Two-layer anamnesis (legal intake) system:
- **Layer 1 (base_profile.py)**: Professional profile + preferences — persisted, set during onboarding
- **Layer 2 (request_context.py)**: Per-request facts, parties, desired outcome — collected per document

## Architecture
- `base_profile.py`: Onboarding wizard, profile CRUD, profile-to-context conversion
- `request_context.py`: Document-type-specific fields, enriched request builder, auto-extraction
- `wizard.py`: Orchestrator combining both layers into pipeline context

## Flow
1. **Onboarding** (once): User completes 4-step wizard → UserProfile saved
2. **New Document**: User fills request + optional structured fields
3. **Context Building**: `build_pipeline_context()` merges profile prefs + request context
4. **Auto-Extract**: If user skips structured fields, LLM extracts from free-form text

## Integration Points
- Pipeline: Context injected via `build_pipeline_context()` before orchestrator runs
- Prompts: Profile preferences become `{user_style_instructions}` in templates
- API: Routes in `/api/v1/anamnesis/*` expose wizard state and profile CRUD

## Data Model
- `UserProfile` (packages/core/database/models/user_profile.py)
- Table: `user_profiles` (1:1 with users)

## Key Design Decisions
- Auto-extraction fallback ensures pipeline works even without wizard
- Style instructions are generated from profile, not hardcoded in prompts
- Request fields are per-document-type but extensible

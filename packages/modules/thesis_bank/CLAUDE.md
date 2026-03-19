# Thesis Bank Module

## Purpose
Auto-populated knowledge base of reusable legal theses extracted from generated documents
and from the vectorized legal corpus (Qdrant acervo_mprs collection).

## Components
- `service.py` — CRUD operations for theses (create, list, update, delete, stats)
- `auto_populate.py` — LLM-powered thesis extraction from completed documents
- `seed_data.py` — 42 pre-extracted seed theses from the Qdrant vectorized corpus
- `qdrant_extractor.py` — Programmatic seeding from the vectorized data into the thesis bank

## Data Model (`packages/core/database/models/thesis.py`)
- title, content, summary
- legal_area_id, document_type_id, tags, category
- legal_basis (JSON array), precedents (JSON array)
- quality_score, usage_count, success_rate
- source_document_id, source_type (auto_extracted/manual/imported)

## Seed Data (`seed_data.py`)
Contains 42 legal theses extracted by analysing the 161 vectorized payloads from
127 unique legal documents stored in the `Teses/collections/acervo_mprs` Qdrant
collection. Theses cover 12+ legal areas including:
- Direito Administrativo (improbidade, nepotismo, rachadinhas, licitações, controle)
- Direito Constitucional (audiência pública, contratação temporária, cotas raciais)
- Direito Civil e Processual (responsabilidade do Estado, astreintes, transmissibilidade)
- Direito do Consumidor (ações coletivas)
- Direito de Família e Sucessões (multiparentalidade, testamento, inventário)
- Direito do Trabalho (terceirização, piso enfermagem)
- Direito Tributário (imunidade filantrópica, fundações)
- Direito Empresarial (administrador judicial, grupo econômico)
- Direitos Humanos (pessoa com deficiência, autismo, infância)

Each seed thesis includes: title, content, summary, legal_area_id, tags, category,
legal_basis, precedents, quality_score, and source_type="imported".

## Seeding Flow
### Backend (PostgreSQL mode)
```python
from packages.modules.thesis_bank.qdrant_extractor import seed_from_local_data
created = await seed_from_local_data(db, organization_id)
```

### Frontend (Firebase mode)
- `frontend/src/data/seed-theses.ts` — TypeScript seed data (30 theses)
- `firestore-service.ts:seedThesesIfEmpty(uid)` — Auto-seeds on first access
- `ThesisBank.tsx` — Calls `seedThesesIfEmpty()` on mount if thesis bank is empty

## Auto-Population Flow
1. Document pipeline completes → `extract_theses_from_document()` called
2. LLM analyzes document text, extracts 2-5 reusable theses
3. Each thesis stored with source link, area, type, quality score
4. Thesis bank grows organically with every document generated

## Key Rules
- Theses must be self-contained and reusable across cases
- Case-specific arguments should NOT be extracted
- Quality score reflects thesis strength and legal foundation
- Usage count tracks how often thesis is referenced
- Soft deletion (status=archived) — never hard delete
- Seeding is idempotent: existing theses (by title) are never overwritten

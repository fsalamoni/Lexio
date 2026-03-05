# Thesis Bank Module

## Purpose
Auto-populated knowledge base of reusable legal theses extracted from generated documents.

## Components
- `service.py` — CRUD operations for theses (create, list, update, delete, stats)
- `auto_populate.py` — LLM-powered thesis extraction from completed documents
- `search.py` — Vector + keyword search (future: Qdrant integration)

## Data Model (`packages/core/database/models/thesis.py`)
- title, content, summary
- legal_area_id, document_type_id, tags, category
- legal_basis (JSON array), precedents (JSON array)
- quality_score, usage_count, success_rate
- source_document_id, source_type (auto_extracted/manual/imported)

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

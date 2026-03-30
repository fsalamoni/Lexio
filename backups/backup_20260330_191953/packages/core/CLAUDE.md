# Core Engine — Contexto IA

## Responsabilidade
Infraestrutura compartilhada. NENHUMA lógica de negócio.

## Subpacotes
- `config.py` — Settings via pydantic-settings (.env)
- `database/` — SQLAlchemy async (engine, models, OrgScopedMixin)
- `auth/` — JWT, bcrypt, RBAC (admin/user/viewer)
- `llm/` — Client OpenRouter, model registry, cost tracker
- `embedding/` — Ollama embeddings
- `search/` — Qdrant, DataJud, SearXNG
- `websocket/` — Progress manager (document_id based)
- `events/` — Event bus async in-process
- `module_loader/` — Registry, discovery, health check

## Regras
1. NUNCA adicionar lógica de negócio aqui
2. Toda query DEVE ter organization_id (multi-tenant)
3. Event bus para comunicação cross-module
4. Models usam OrgScopedMixin para org_id automático

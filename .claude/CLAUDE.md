# Lexio — Contexto para IA

## O que é
Lexio é um SaaS de produção jurídica com IA. Gera documentos jurídicos (pareceres, petições, recursos, etc.) usando pipeline multi-agente.

## Arquitetura
- **Monorepo** em `packages/`
- **Core Engine** (`packages/core/`): Infraestrutura compartilhada (config, database, auth, LLM, embedding, search, events, module_loader). NENHUMA lógica de negócio.
- **Pipeline Engine** (`packages/pipeline/`): Orquestrador genérico que carrega configuração do document_type.
- **Modules** (`packages/modules/`): Módulos independentes e isolados.
  - `document_types/`: Tipos de documento (parecer, petição, etc.)
  - `legal_areas/`: Áreas do direito (administrativo, constitucional, etc.)
- **API Gateway** (`packages/api/`): FastAPI, rotas, schemas, middleware.
- **Frontend** (`frontend/`): React 18 + TypeScript + Vite + Tailwind.

## Stack
- Backend: Python 3.12, FastAPI, SQLAlchemy async, PostgreSQL
- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- LLM: OpenRouter (Claude Sonnet/Haiku via API)
- Embedding: Ollama (mxbai-embed-large)
- Vector DB: Qdrant
- Search: SearXNG, DataJud (CNJ)
- Container: Docker Compose (6 services)

## Regras Importantes
1. **Módulos são INDEPENDENTES** — Se um falhar, os outros continuam
2. **Cada módulo tem**: `manifest.json`, `CLAUDE.md`, `__init__.py`
3. **Prompts MPRS/CAOPP são INTOCÁVEIS** (validados a 95/100)
4. **Multi-tenant**: Toda query tem `organization_id`
5. **Event bus** para comunicação entre módulos (nunca import direto)
6. **Lei 8.666/93 está REVOGADA** — Sempre usar 14.133/21

## Comandos Úteis
```bash
docker compose up -d          # Subir todos os serviços
docker compose logs -f backend  # Logs do backend
curl localhost:8000/api/v1/health  # Health check
```

## Estrutura de Diretórios
```
packages/
  core/         → Infraestrutura (NÃO EDITAR sem necessidade)
  pipeline/     → Engine de pipeline genérica
  modules/      → Módulos independentes
    document_types/  → Tipos de documento
    legal_areas/     → Áreas do direito
  api/          → Gateway FastAPI
frontend/       → React app
database/       → SQL schema
docs/           → Documentação
.claude/        → Configuração Claude Code
```

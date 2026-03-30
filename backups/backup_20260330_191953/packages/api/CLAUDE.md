# API Gateway — Contexto IA

## Responsabilidade
FastAPI application. Rotas REST + WebSocket. Auth JWT.

## Rotas
- `POST /api/v1/auth/register` — Cadastro
- `POST /api/v1/auth/login` — Login
- `GET /api/v1/health` — Health check
- `POST /api/v1/documents` — Criar documento (inicia pipeline)
- `GET /api/v1/documents` — Listar documentos (org-scoped)
- `GET /api/v1/documents/{id}` — Detalhe
- `GET /api/v1/documents/{id}/download` — Baixar DOCX
- `GET /api/v1/document-types` — Tipos disponíveis
- `GET /api/v1/legal-areas` — Áreas disponíveis
- `POST /api/v1/uploads` — Upload de arquivo
- `GET /api/v1/stats` — Estatísticas
- `GET /api/v1/admin/modules` — Módulos (admin only)
- `WS /ws/document/{id}` — Progresso em tempo real

## Regras
1. Toda rota autenticada usa `Depends(get_current_user)`
2. Rotas admin usam `Depends(get_current_admin)`
3. Queries sempre filtradas por `organization_id`

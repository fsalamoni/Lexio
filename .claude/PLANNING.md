# LEXIO — PLANEJAMENTO CENTRAL DE IMPLEMENTAÇÃO
> Atualizado: 2026-04-17 | Branch: main
> PROPÓSITO: Fonte única da verdade — estado do sistema, roadmap e decisões técnicas.
> REGRA: Atualizar após cada etapa concluída. IMPLEMENTATION_STATE.md foi arquivado (obsoleto).

---

## CONTEXTO DO SISTEMA

Lexio é um SaaS de produção jurídica com IA. Gera documentos jurídicos via pipeline multi-agente.

### Stack
- Backend: Python 3.12, FastAPI, SQLAlchemy async, PostgreSQL 16
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS
- LLM: OpenRouter (Claude Sonnet/Haiku), Embedding: Ollama (mxbai-embed-large)
- Vector DB: Qdrant | Search: SearXNG, DataJud | Container: Docker Compose (6 serviços)

### Regras Críticas
1. Módulos INDEPENDENTES — isolamento total
2. Prompts MPRS/CAOPP INTOCÁVEIS (validados 95/100)
3. Multi-tenant: TODA query com organization_id
4. Event bus para comunicação (nunca import direto entre módulos)
5. Lei 8.666/93 REVOGADA → sempre Lei 14.133/21

---

## ESTADO ATUAL DO SISTEMA (2026-03-11)

### ✅ BACKEND — IMPLEMENTADO

#### Auth
- JWT, bcrypt, registro, login, `/me`
- Recuperação de senha: `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/validate-reset-token/{token}`
- ⚠️ `dev_reset_token` exposto na API — remover em produção, enviar por email

#### Documents
- CRUD completo, pipeline trigger, content GET/PUT, executions list
- Workflow: submit-review, approve, reject
- Busca full-text por tema e original_request (param `q`, ILIKE)

#### Notificações
- `GET /api/v1/notifications` — lista com contagem não-lidas
- `PATCH /api/v1/notifications/{id}/read` — marcar como lida
- `PATCH /api/v1/notifications/read-all` — marcar todas como lidas
- Criadas automaticamente: document_completed, document_approved, document_rejected

#### Outros Endpoints
- Stats: `/stats`, `/stats/daily`, `/stats/agents`, `/stats/recent`
- Document Types: `GET /document-types` (6 tipos)
- Legal Areas: `GET /legal-areas` (5 áreas)
- Thesis Bank: CRUD + stats + auto-extraction pós-pipeline + injeção no pipeline
- Uploads: POST + GET, background indexing → Qdrant
- Anamnesis: wizard, profile, onboarding, build-context, request-fields
- Admin: modules list/health/toggle/test, settings GET/POST
- WebSocket: `/ws/document/{id}` (progresso em tempo real)
- Health: `/health` (PostgreSQL, Qdrant, Ollama, SearXNG)

#### Módulos
- document_types: parecer, peticao_inicial, contestacao, recurso, sentenca, acao_civil_publica
- legal_areas: administrative, civil, constitutional, labor, tax
- anamnesis, thesis_bank
- whatsapp_bot (fix event_bus.subscribe + handler signature + etapa awaiting_legal_area)

#### Database
```
organizations, users (+ reset_token, reset_token_expires_at)
documents, document_types, legal_areas
executions, uploaded_documents
theses, whatsapp_sessions, user_profiles
platform_settings, notifications
```

---

### ✅ FRONTEND — IMPLEMENTADO

#### Páginas
| Página | Estado | Notas |
|--------|--------|-------|
| Login.tsx | ✅ | spinner, password toggle, link "Esqueci minha senha" |
| Register.tsx | ✅ | password toggle |
| ForgotPassword.tsx | ✅ | formulário, success state, dev token link |
| ResetPassword.tsx | ✅ | token validation, nova senha, redirect automático |
| Dashboard.tsx | ✅ | Recharts BarChart+AreaChart, skeletons, agent table |
| DocumentList.tsx | ✅ | busca full-text debounce 400ms, filtros tipo/status, paginação |
| NewDocument.tsx | ✅ | tipo, template, áreas, request, context fields Layer 2 |
| DocumentDetail.tsx | ✅ | execution timeline, DOCX preview mammoth, workflow aprovação |
| DocumentEditor.tsx | ✅ | TipTap, word count, DOCX download, toast save, beforeunload |
| Upload.tsx | ✅ | file history, polling status |
| ThesisBank.tsx | ✅ | search debounced, filters, create/edit/delete, copy |
| AdminPanel.tsx | ✅ | módulos, API keys, fila de revisão, health, stats, pie chart |
| Onboarding.tsx | ✅ | 4-step wizard → user_profiles |
| Profile.tsx | ✅ | perfil profissional, preferências, defaults |
| NotFound.tsx | ✅ | |

#### Componentes
| Componente | Estado | Notas |
|-----------|--------|-------|
| ErrorBoundary.tsx | ✅ | |
| Layout.tsx | ✅ | mobile hamburger, NotificationBell integrado |
| Sidebar.tsx | ✅ | mobile responsive |
| ProgressTracker.tsx | ✅ | phase steps, gradient bar |
| RichTextEditor.tsx | ✅ | TipTap, word count, prose styles |
| StatusBadge.tsx | ✅ | icons (Loader2/CheckCircle/XCircle) |
| Toast.tsx | ✅ | useToast hook, auto-dismiss, slide-in |
| Skeleton.tsx | ✅ | SkeletonRow/Card/Item |
| NotificationBell.tsx | ✅ | dropdown, unread badge, mark all read, polling 30s |

---

## BUGS CONHECIDOS

| ID | Local | Descrição | Status |
|----|-------|-----------|--------|
| B1 | ProgressTracker.tsx | WS URL deve ser wss:// em HTTPS | ✅ Já correto |
| B2 | DocumentDetail.tsx | Polling não para quando status=concluido | ✅ Corrigido |
| B3 | Dashboard.tsx | .catch() silencioso | ✅ Corrigido |
| B4 | ThesisBank.tsx | .catch() silencioso | ✅ Corrigido |
| B5 | whatsapp_bot/__init__.py | event_bus.on() não existe | ✅ Corrigido → subscribe() |
| B6 | whatsapp_bot/__init__.py | Handler signature errada | ✅ Corrigido |
| B7 | auth.py:141 | dev_reset_token exposto na API | ⚠️ Pendente (requer email service) |
| B8 | firestore.rules + firestore-service.ts | Falta de regra explícita para `research_notebooks/{id}/memory/{docId}` causava `Missing or insufficient permissions` no admin agregado e deixava a memória dedicada suscetível a negação de acesso | ✅ Corrigido |
| B9 | llm-client.ts | `provider returned error` com `404` escapava da classificação de modelo indisponível e chegava ao notebook como erro genérico, sem fallback nem orientação correta | ✅ Corrigido |
| B10 | tts-client.ts + image-generation-client.ts + model-catalog.ts | Clientes OpenRouter dependiam implicitamente de `window.location.origin` e parte dos fluxos ainda divergiam no modelo TTS padrão, aumentando risco de falha fora do browser ativo e de 404 por default inconsistente | ✅ Corrigido |

---

## HOTFIX 2026-04-17 — ESTABILIZAÇÃO ADMIN + NOTEBOOK

- `firestore.rules` agora cobre a subcoleção `memory/search_memory` de cadernos para o dono do notebook e para leitura agregada de admins, corrigindo o erro de permissão observado em produção.
- `frontend/src/lib/firestore-service.ts` foi endurecido para carregar o painel agregado mesmo quando a memória dedicada estiver indisponível temporariamente, preservando cache e overview com `operational_warnings` em vez de falha total.
- `frontend/src/App.tsx` passou a esperar `isReady` antes de avaliar `ProtectedRoute` e `AdminRoute`, reduzindo risco de redirecionamento prematuro durante hidratação do auth state.
- `frontend/src/pages/PlatformAdminPanel.tsx` e `frontend/src/pages/PlatformCostsPage.tsx` agora usam humanização de erro e devolvem feedback acionável em vez de toast genérico.
- `frontend/src/lib/llm-client.ts` passou a tratar `provider returned error` + `404` e padrões correlatos como `ModelUnavailableError`, permitindo fallback e UX coerente no estúdio.
- `frontend/src/pages/ResearchNotebook.tsx` e os fluxos auxiliares de regeneração de imagem/TTS passaram a expor mensagens mais diagnósticas quando um modelo/provedor estiver indisponível.
- Regressões cobertas em `frontend/src/lib/error-humanizer.test.ts` e no novo `frontend/src/lib/llm-client.test.ts`.
- Validação desta rodada: `npm run typecheck`, `npx vitest run` (23/23, 219/219) e `npm run build` concluídos com sucesso.
- Índices não exigiram mudança nesta rodada; `firestore.indexes.json` permaneceu inalterado.
- Fluxo recomendado de publicação mantido: PR com `.github/workflows/firebase-preview.yml` para smoke e merge em `main` para disparar `.github/workflows/firebase-deploy.yml` com hosting + rules.

---

## HARDENING 2026-04-17 — TTS + DOCUMENTDETAIL

- `frontend/src/lib/tts-client.ts`, `frontend/src/lib/model-config.ts`, `frontend/src/lib/audio-generation-pipeline.ts`, `frontend/src/lib/video-generation-pipeline.ts`, `frontend/src/lib/literal-video-production.ts` e `frontend/src/pages/ResearchNotebook.tsx` agora usam `openai/tts-1-hd` como default coerente de TTS, eliminando o desvio restante para `openai/gpt-4o-audio-preview`.
- `normalizeTTSModel()` deixou de remapear modelos explicitamente configurados, preservando `openai/tts-1` e outros overrides válidos do usuário.
- `frontend/src/lib/tts-client.ts`, `frontend/src/lib/image-generation-client.ts` e `frontend/src/lib/model-catalog.ts` passaram a usar fallback seguro de `HTTP-Referer`, removendo dependência rígida de `window.location.origin` fora do browser ativo.
- `frontend/src/pages/DocumentDetail.tsx` recebeu ações rápidas de `Copiar Texto` e `Duplicar`, além de labels/atributos de acessibilidade em ações críticas.
- Cobertura de regressão ampliada com `frontend/src/lib/tts-client.test.ts` e ajuste de `frontend/src/lib/video-generation-pipeline.test.ts` para o novo default.
- Validação desta rodada: `npm run typecheck`, `npx vitest run` (24/24, 221/221) e `npm run build` concluídos com sucesso.
- Índices seguiram inalterados nesta rodada; o update de indexação/documentação ocorreu em `docs/MANIFEST.json` e nos trackers operacionais.

---

## ROADMAP DE IMPLEMENTAÇÃO

### ✅ ETAPAS CONCLUÍDAS

| Etapa | Descrição | Data |
|-------|-----------|------|
| 1 | Context fields Layer 2 no NewDocument | 2026-03-10 |
| 2 | Página Meu Perfil (anamnese Layer 1) | 2026-03-10 |
| 3 | Workflow aprovação/rejeição de documentos | 2026-03-10 |
| 4 | Integração Banco de Teses → Pipeline | 2026-03-10 |
| 5 | Fix WebSocket wss:// para HTTPS | 2026-03-10 |
| 6 | AdminPanel UI completo | 2026-03-10 |
| 7 | Fix WhatsApp Bot + etapa área jurídica | 2026-03-11 |
| 8 | Recuperação de senha (frontend + backend) | 2026-03-11 |
| 9 | Busca full-text de documentos | 2026-03-11 |
| 10 | Notificações in-app | 2026-03-11 |

---

### 🔴 ETAPA 11 — Email Service (SMTP/Sendgrid)
**Prioridade**: Alta — Bloqueia produção real (dev_reset_token exposto)
**Dependências**: nenhuma

**O que implementar**:
- `packages/core/email.py` — serviço genérico com suporte SMTP e Sendgrid
- Variáveis de ambiente: `EMAIL_PROVIDER`, `SMTP_HOST/PORT/USER/PASS`, `SENDGRID_API_KEY`, `EMAIL_FROM`
- Template HTML para email de recuperação de senha
- Template HTML para notificações por email (opcional)
- Remover `dev_reset_token` do response de `POST /auth/forgot-password`
- Enviar email real no `forgot-password`

**Arquivos afetados**:
- `packages/core/email.py` (NOVO)
- `packages/api/routes/auth.py` (remover dev_reset_token, chamar email service)
- `packages/core/config.py` (novas env vars)
- `docker-compose.yml` (vars de ambiente)
- `.env.example` (documentar vars)

---

### 🔴 ETAPA 12 — Versionamento de Documentos
**Prioridade**: Alta — Usuários editam documentos sem histórico
**Dependências**: nenhuma

**O que implementar**:
- Tabela `document_versions` (document_id, version_number, content, created_by, created_at, comment)
- `POST /documents/{id}/versions` — salvar versão manual (ao clicar "Salvar")
- `GET /documents/{id}/versions` — listar versões
- `GET /documents/{id}/versions/{version_id}` — obter conteúdo de versão
- `POST /documents/{id}/versions/{version_id}/restore` — restaurar versão
- Auto-save de versão a cada aprovação/rejeição
- Frontend: painel "Histórico" no DocumentDetail.tsx com diff visual (opcional)

**Arquivos afetados**:
- `database/schema.sql`
- `packages/core/database/models/document_version.py` (NOVO)
- `packages/api/routes/documents.py`
- `frontend/src/pages/DocumentDetail.tsx`
- `frontend/src/pages/DocumentEditor.tsx`

---

### 🔴 ETAPA 13 — Export/Share de Documentos
**Prioridade**: Alta — Funcionalidade core para escritórios
**Dependências**: nenhuma

**O que implementar**:
- `POST /documents/{id}/share` — gera link público temporário (token JWT 7 dias)
- `GET /share/{token}` — endpoint público (sem auth) para visualizar documento aprovado
- Frontend: botão "Compartilhar" no DocumentDetail.tsx (apenas para docs aprovados)
- Frontend: modal com link copiável + QR code (opcional)
- Frontend: página pública `/share/{token}` (layout simplificado)

**Arquivos afetados**:
- `packages/api/routes/documents.py`
- `packages/api/main.py` (rota pública)
- `frontend/src/pages/DocumentDetail.tsx`
- `frontend/src/pages/SharedDocument.tsx` (NOVO)
- `frontend/src/App.tsx` (rota pública)

---

### 🟡 ETAPA 14 — Organization Settings
**Prioridade**: Média
**Dependências**: nenhuma

**O que implementar**:
- `GET/PUT /organizations/me` — nome, logo, timezone, defaults
- `GET/POST/DELETE /organizations/me/members` — gestão de membros
- `POST /organizations/me/members/{user_id}/role` — promover/rebaixar (admin/member)
- Frontend: página `OrganizationSettings.tsx` com 3 abas: Geral, Membros, Plano
- Sidebar: link "Organização" no painel admin

**Arquivos afetados**:
- `packages/api/routes/organizations.py` (NOVO)
- `packages/api/main.py`
- `frontend/src/pages/OrganizationSettings.tsx` (NOVO)
- `frontend/src/components/Sidebar.tsx`
- `frontend/src/App.tsx`

---

### 🟡 ETAPA 15 — Operações em Lote (Bulk)
**Prioridade**: Média
**Dependências**: nenhuma

**O que implementar**:
- `POST /documents/bulk-approve` — aprovar lista de IDs
- `POST /documents/bulk-reject` — rejeitar lista de IDs
- `DELETE /documents/bulk` — arquivar lista de IDs
- Frontend: checkboxes na DocumentList.tsx
- Frontend: toolbar flutuante com ações em lote quando há seleção
- Frontend: confirmação antes de ações destrutivas

**Arquivos afetados**:
- `packages/api/routes/documents.py`
- `frontend/src/pages/DocumentList.tsx`

---

### 🟡 ETAPA 16 — Expiração de Sessões WhatsApp
**Prioridade**: Média
**Dependências**: nenhuma

**O que implementar**:
- `AsyncSession` background task (rodar a cada hora via APScheduler)
- Limpar `whatsapp_sessions` com `updated_at < NOW() - INTERVAL '24 hours'`
- `GET /admin/whatsapp-sessions` — listar sessões ativas (para AdminPanel)
- Frontend: card de sessões WhatsApp no AdminPanel.tsx

**Arquivos afetados**:
- `packages/modules/whatsapp_bot/__init__.py` (schedule task)
- `packages/api/routes/admin.py`
- `frontend/src/pages/AdminPanel.tsx`

---

### 🟢 ETAPA 17 — Audit Log
**Prioridade**: Baixa
**Dependências**: nenhuma

**O que implementar**:
- Tabela `audit_logs` (organization_id, user_id, action, entity_type, entity_id, metadata JSONB, created_at)
- Middleware FastAPI para logar automaticamente mutações (POST/PUT/DELETE)
- `GET /admin/audit-logs` — com filtros por user, action, entity, date range
- Frontend: página `AuditLog.tsx` no AdminPanel (aba nova)

**Arquivos afetados**:
- `database/schema.sql`
- `packages/core/database/models/audit_log.py` (NOVO)
- `packages/api/middleware/audit.py` (NOVO)
- `packages/api/routes/admin.py`
- `frontend/src/pages/AdminPanel.tsx`

---

### 🟢 ETAPA 18 — Export de Estatísticas (CSV/Excel)
**Prioridade**: Baixa
**Dependências**: nenhuma

**O que implementar**:
- `GET /stats/export?format=csv&from=&to=` — exportar uso em CSV
- `GET /stats/export?format=xlsx` — exportar em Excel (via openpyxl)
- Frontend: botão "Exportar" no Dashboard.tsx com dropdown CSV/Excel

**Arquivos afetados**:
- `packages/api/routes/stats.py`
- `frontend/src/pages/Dashboard.tsx`

---

### 🟢 ETAPA 19 — Dark Mode
**Prioridade**: Baixa
**Dependências**: nenhuma

**O que implementar**:
- Tailwind `darkMode: 'class'` no `tailwind.config.js`
- Toggle em `ThemeContext.tsx` (NOVO) com persistência em localStorage
- Adicionar classes `dark:` nos componentes principais
- Botão de toggle no sidebar/profile

**Arquivos afetados**:
- `tailwind.config.js`
- `frontend/src/contexts/ThemeContext.tsx` (NOVO)
- Todos os componentes e páginas (refactor gradual)

---

## NOTAS TÉCNICAS

### Password Reset Token
- Gerado com `secrets.token_urlsafe(32)` — 43 chars URL-safe
- TTL: 15 minutos | Um uso por token (limpo após uso)
- ⚠️ **dev_reset_token** retornado no response enquanto email service não existe
- Produção: remover dev_reset_token + enviar por SMTP/Sendgrid (ETAPA 11)

### Notifications
- Criadas de forma assíncrona (fire-and-forget, não bloqueiam pipeline)
- Polling no frontend: 30 segundos
- Tipos: `document_completed` | `document_approved` | `document_rejected`
- `user_id NULL` = notificação org-wide (visível para todos os admins)

### WhatsApp Bot Flow
```
WELCOME → AWAITING_DOC_TYPE → AWAITING_LEGAL_AREA → AWAITING_CONTENT → PROCESSING → COMPLETE
                                                   ↗ (pular → sem área)
```
- Reset: "menu", "início", "cancelar", "reiniciar"
- Pular área: "pular", "skip", "geral", "qualquer", "0"

### Anamnesis API
Endpoint: `GET /anamnesis/request-fields/{document_type_id}`
Retorna campos específicos por tipo. Exemplo para `peticao_inicial`:
```json
[
  {"id": "partes",     "label": "Partes do processo",  "type": "text",     "required": true},
  {"id": "fatos",      "label": "Fatos relevantes",    "type": "textarea", "required": true},
  {"id": "pedidos",    "label": "Pedidos",              "type": "textarea", "required": true},
  {"id": "valor_causa","label": "Valor da causa",       "type": "text",     "required": false}
]
```

### Pipeline Context Building
`POST /anamnesis/build-context` — recebe `{document_type_id, legal_area_ids, request, context_fields}`,
retorna contexto completo para o pipeline.

---

## ARQUIVOS CRÍTICOS — REFERÊNCIA RÁPIDA

```
frontend/src/
  pages/
    auth/
      ForgotPassword.tsx      — Recuperação de senha
      ResetPassword.tsx       — Redefinição de senha
    DocumentList.tsx          — Lista com busca + filtros
    Dashboard.tsx             — Stats + charts
    AdminPanel.tsx            — Painel admin completo
  components/
    NotificationBell.tsx      — Notificações in-app
    Layout.tsx                — Bell integrado

packages/
  api/routes/
    auth.py                   — forgot/reset-password
    documents.py              — busca + notificações + workflow
    notifications.py          — CRUD notificações
    admin.py                  — módulos + settings
    stats.py                  — dashboard stats
  core/database/models/
    user.py                   — reset_token fields
    notification.py           — Modelo Notification
  pipeline/orchestrator.py    — _create_completion_notification
  modules/whatsapp_bot/
    __init__.py               — subscribe + handler
    conversation.py           — awaiting_legal_area
    pipeline_trigger.py       — legal_area_ids support

database/
  schema.sql                  — schema completo (notifications + reset_token)
```

---

## LOG DE IMPLEMENTAÇÃO

| Data | Etapa | Ação |
|------|-------|------|
| 2026-03-09 | Setup | Codebase inicial — UI base, demo data, backend core |
| 2026-03-10 | Etapa 1 | Context fields Layer 2 no NewDocument.tsx |
| 2026-03-10 | Etapa 2 | Página Profile.tsx — anamnese Layer 1 |
| 2026-03-10 | Etapa 3 | Workflow aprovação/rejeição (submit-review, approve, reject) |
| 2026-03-10 | Etapa 4 | Injeção de teses do banco no contexto do pipeline |
| 2026-03-10 | Etapa 5 | WebSocket wss:// — já estava correto |
| 2026-03-10 | Etapa 6 | AdminPanel UI completo (fila de revisão, módulos, pie chart) |
| 2026-03-11 | Etapa 7 | Fix WhatsApp Bot (subscribe, handler, awaiting_legal_area) |
| 2026-03-11 | Etapa 8 | Recuperação de senha (backend + frontend) |
| 2026-03-11 | Etapa 9 | Busca full-text de documentos |
| 2026-03-11 | Etapa 10 | Notificações in-app (backend + frontend) |

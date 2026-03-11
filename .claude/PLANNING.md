# LEXIO — PLANEJAMENTO CENTRAL DE IMPLEMENTAÇÃO
> Atualizado: 2026-03-11 | Branch: claude/continue-project-work-mTkMc
> PROPÓSITO: Indexação, cache e controle de estado da implementação.
> REGRA: Este arquivo é a FONTE DA VERDADE. Atualizar após cada etapa concluída.

---

## CONTEXTO DO SISTEMA

Lexio é um SaaS de produção jurídica com IA. Gera documentos jurídicos via pipeline multi-agente.

### Stack
- Backend: Python 3.12, FastAPI, SQLAlchemy async, PostgreSQL 16
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS
- LLM: OpenRouter (Claude Sonnet/Haiku), Embedding: Ollama (mxbai-embed-large)
- Vector DB: Qdrant | Search: SearXNG, DataJud | Container: Docker Compose

### Regras Críticas
1. Módulos INDEPENDENTES — isolamento total
2. Prompts MPRS/CAOPP INTOCÁVEIS (validados 95/100)
3. Multi-tenant: TODA query com organization_id
4. Event bus para comunicação (nunca import direto entre módulos)
5. Lei 8.666/93 REVOGADA → sempre Lei 14.133/21

---

## ESTADO ATUAL DO SISTEMA (2026-03-11)

### ✅ IMPLEMENTADO E FUNCIONANDO

#### Backend
- Auth: JWT, bcrypt, registro, login, /me
- Auth: Recuperação de senha (forgot-password, reset-password, validate-reset-token)
- Documents: CRUD, pipeline trigger, content GET/PUT, executions list
- Documents: Workflow aprovação/rejeição (submit-review, approve, reject)
- Documents: Busca full-text por tema e original_request (param `q`)
- Stats: /, /daily, /agents, /recent
- Document Types: GET /document-types (6 tipos)
- Legal Areas: GET /legal-areas (5 áreas)
- Thesis Bank: CRUD + stats + auto-extraction pós-pipeline + injeção no pipeline
- Uploads: POST + GET, background indexing → Qdrant
- Anamnesis: wizard, profile, onboarding, build-context, request-fields
- Admin: modules list/health/toggle/test, settings GET/POST
- Notifications: GET + PATCH read + PATCH read-all (in-app, criadas ao gerar/aprovar/rejeitar)
- WebSocket: /ws/document/{id} (progresso em tempo real)
- Health: /health (PostgreSQL, Qdrant, Ollama, SearXNG)

#### Frontend Pages
- Login.tsx ✅ (spinner, password toggle, link "Esqueci minha senha")
- Register.tsx ✅ (password toggle)
- ForgotPassword.tsx ✅ (formulário, success state, dev token link)
- ResetPassword.tsx ✅ (token validation, nova senha, redirect automático)
- Dashboard.tsx ✅ (Recharts BarChart+AreaChart, skeletons, agent table)
- DocumentList.tsx ✅ (busca full-text, filtros por status e tipo, paginação, mobile)
- NewDocument.tsx ✅ (tipo, template, áreas, request, context fields Layer 2)
- DocumentDetail.tsx ✅ (execution timeline, DOCX preview mammoth, workflow aprovação)
- DocumentEditor.tsx ✅ (TipTap, word count, DOCX download, toast save, beforeunload)
- Upload.tsx ✅ (file history, polling status)
- ThesisBank.tsx ✅ (search debounced, filters, create/edit/delete, copy)
- AdminPanel.tsx ✅ (módulos, API keys, fila de revisão, health, stats, pie chart)
- Onboarding.tsx ✅ (4-step wizard → user_profiles)
- Profile.tsx ✅ (perfil profissional, preferências, defaults)
- NotFound.tsx ✅

#### Frontend Components
- ErrorBoundary.tsx ✅ | Layout.tsx ✅ (mobile hamburger, NotificationBell integrado)
- Sidebar.tsx ✅ (mobile responsive) | ProgressTracker.tsx ✅
- RichTextEditor.tsx ✅ | StatusBadge.tsx ✅ | Toast.tsx ✅ | Skeleton.tsx ✅
- NotificationBell.tsx ✅ (dropdown, unread badge, mark all read, polling 30s)

#### Módulos Backend
- document_types: parecer, peticao_inicial, contestacao, recurso, sentenca, acao_civil_publica ✅
- legal_areas: administrative, civil, constitutional, labor, tax ✅
- anamnesis ✅ | thesis_bank ✅
- whatsapp_bot ✅ (fix event_bus.subscribe, handler signature, etapa de área jurídica)

#### Database
- organizations, users (+ reset_token), documents, document_types, legal_areas
- executions, uploaded_documents, theses, whatsapp_sessions, user_profiles
- platform_settings, notifications ✅ (nova tabela Stage 10)

---

## BUGS CONHECIDOS

| ID | Local | Descrição | Status |
|----|-------|-----------|--------|
| B1 | ProgressTracker.tsx | WS URL deve ser wss:// em HTTPS | ✅ Já correto |
| B2 | DocumentDetail.tsx | Polling não para quando status=concluido | ✅ Corrigido |
| B3 | Dashboard.tsx | .catch() silencioso | ✅ Corrigido |
| B4 | ThesisBank.tsx | .catch() silencioso | ✅ Corrigido |
| B5 | whatsapp_bot/__init__.py | event_bus.on() não existe (AttributeError) | ✅ Corrigido |
| B6 | whatsapp_bot/__init__.py | Handler signature errada (event_type, data) | ✅ Corrigido |

---

## ROADMAP DE IMPLEMENTAÇÃO

### ETAPA 1 — Campos de Contexto Layer 2 no NewDocument
**Status**: ✅ Concluído (2026-03-10)

### ETAPA 2 — Página Meu Perfil (Edição de Anamnese Layer 1)
**Status**: ✅ Concluído (2026-03-10)

### ETAPA 3 — Workflow de Aprovação/Rejeição de Documentos
**Status**: ✅ Concluído (2026-03-10)

### ETAPA 4 — Integração Banco de Teses → Pipeline
**Status**: ✅ Concluído (2026-03-10)

### ETAPA 5 — Fix WebSocket wss:// para HTTPS
**Status**: ✅ Já estava correto (2026-03-10)

### ETAPA 6 — AdminPanel UI Completo
**Status**: ✅ Concluído (2026-03-10)

### ETAPA 7 — Fix WhatsApp Bot + Etapa Área Jurídica
**Status**: ✅ Concluído (2026-03-11)
**O que foi implementado**:
- Fix crítico: `event_bus.on()` → `event_bus.subscribe()` (método correto)
- Fix crítico: handler signature `_on_document_requested(self, event_type, data)` 
- Adicionado passo `awaiting_legal_area` na state machine da conversa
- Usuário pode escolher área (1-5) ou "pular" para continuar sem especificar
- legal_area_ids passados para o pipeline_trigger e injetados no documento
**Arquivos**:
- `packages/modules/whatsapp_bot/__init__.py`
- `packages/modules/whatsapp_bot/conversation.py`
- `packages/modules/whatsapp_bot/pipeline_trigger.py`

### ETAPA 8 — Recuperação de Senha
**Status**: ✅ Concluído (2026-03-11)
**O que foi implementado**:
- Backend: `reset_token` e `reset_token_expires_at` no modelo User
- Backend: `POST /auth/forgot-password` — gera token JWT seguro (15 min)
- Backend: `POST /auth/reset-password` — valida token, atualiza senha
- Backend: `GET /auth/validate-reset-token/{token}` — valida sem consumir token
- Frontend: `ForgotPassword.tsx` — formulário de email + success state + dev_token link
- Frontend: `ResetPassword.tsx` — nova senha com validação de token
- Frontend: Link "Esqueci minha senha" no Login.tsx
- Frontend: Rotas `/forgot-password` e `/reset-password` em App.tsx
**Arquivos**:
- `packages/core/database/models/user.py`
- `packages/api/routes/auth.py`
- `frontend/src/pages/auth/ForgotPassword.tsx` (NOVO)
- `frontend/src/pages/auth/ResetPassword.tsx` (NOVO)
- `frontend/src/App.tsx`
- `frontend/src/pages/auth/Login.tsx`

### ETAPA 9 — Busca de Documentos
**Status**: ✅ Concluído (2026-03-11)
**O que foi implementado**:
- Backend: param `q` para busca full-text (ILIKE) em `tema` e `original_request`
- Frontend: barra de busca com debounce 400ms no DocumentList
- Frontend: filtros por tipo de documento (chips clicáveis)
- Frontend: contador de resultados quando filtros ativos
- Frontend: badge "WhatsApp" para docs gerados via bot
**Arquivos**:
- `packages/api/routes/documents.py`
- `frontend/src/pages/DocumentList.tsx`

### ETAPA 10 — Notificações In-App
**Status**: ✅ Concluído (2026-03-11)
**O que foi implementado**:
- Backend: modelo `Notification` (organization_id, user_id, type, title, message, document_id, is_read)
- Backend: `GET /api/v1/notifications` — lista com contagem de não-lidas
- Backend: `PATCH /api/v1/notifications/{id}/read` — marcar como lida
- Backend: `PATCH /api/v1/notifications/read-all` — marcar todas como lidas
- Pipeline: cria notificação `document_completed` ao concluir geração
- Documents: cria notificação `document_approved` ao aprovar
- Documents: cria notificação `document_rejected` ao rejeitar
- Frontend: `NotificationBell.tsx` — ícone com badge, dropdown, polling 30s
- Frontend: Layout.tsx — bell integrado no mobile header e desktop top-right
**Arquivos**:
- `packages/core/database/models/notification.py` (NOVO)
- `packages/api/routes/notifications.py` (NOVO)
- `packages/api/main.py`
- `packages/pipeline/orchestrator.py`
- `packages/api/routes/documents.py`
- `database/schema.sql`
- `frontend/src/components/NotificationBell.tsx` (NOVO)
- `frontend/src/components/Layout.tsx`

---

## PRÓXIMOS PASSOS (Backlog)

### Alta Prioridade
1. **Email Service** — Integrar SMTP/Sendgrid para enviar emails de recuperação de senha e notificações
2. **Document versioning** — Guardar histórico de edições do documento
3. **Export/Share** — Gerar link público de acesso temporário a um documento aprovado

### Média Prioridade
4. **Organization Settings** — Página de configurações da organização (nome, logo, membros)
5. **Bulk operations** — Aprovar/rejeitar múltiplos documentos de uma vez
6. **WhatsApp session expiry** — Limpeza automática de sessões inativas há 24h

### Baixa Prioridade
7. **Audit log** — Log imutável de ações (aprovações, rejeições, edições)
8. **Statistics export** — Download de relatório CSV/Excel de uso
9. **Dark mode** — Suporte a tema escuro

---

## ARQUIVOS CRÍTICOS — REFERÊNCIA RÁPIDA

```
frontend/src/
  pages/
    auth/
      ForgotPassword.tsx      — Recuperação de senha (ETAPA 8)
      ResetPassword.tsx       — Redefinição de senha (ETAPA 8)
    DocumentList.tsx          — Lista com busca + filtros (ETAPA 9)
  components/
    NotificationBell.tsx      — Notificações in-app (ETAPA 10)
    Layout.tsx                — Bell integrado (ETAPA 10)

packages/
  api/routes/
    auth.py                   — forgot/reset-password (ETAPA 8)
    documents.py              — busca q param + notificações (ETAPAS 9, 10)
    notifications.py          — CRUD notificações (ETAPA 10) [NOVO]
  core/database/models/
    user.py                   — reset_token fields (ETAPA 8)
    notification.py           — Modelo Notification (ETAPA 10) [NOVO]
  pipeline/orchestrator.py    — _create_completion_notification (ETAPA 10)
  modules/whatsapp_bot/
    __init__.py               — fix subscribe + handler signature (ETAPA 7)
    conversation.py           — awaiting_legal_area step (ETAPA 7)
    pipeline_trigger.py       — legal_area_ids support (ETAPA 7)

database/
  schema.sql                  — notifications table + reset_token cols
```

---

## LOG DE IMPLEMENTAÇÃO

| Data | Etapa | Ação | Arquivos |
|------|-------|------|---------|
| 2026-03-10 | Setup | Criado PLANNING.md | .claude/PLANNING.md |
| 2026-03-10 | Etapa 1 | Context fields Layer 2 | NewDocument.tsx |
| 2026-03-10 | Etapa 2 | Página Profile.tsx | Profile.tsx, App.tsx, Sidebar.tsx |
| 2026-03-10 | Etapa 3 | Workflow aprovação/rejeição | documents.py, StatusBadge.tsx, DocumentDetail.tsx |
| 2026-03-10 | Etapa 4 | Injeção teses no pipeline | orchestrator.py |
| 2026-03-10 | Etapa 6 | AdminPanel completo | AdminPanel.tsx |
| 2026-03-11 | Etapa 7 | Fix WhatsApp Bot + área jurídica | whatsapp_bot/__init__.py, conversation.py, pipeline_trigger.py |
| 2026-03-11 | Etapa 8 | Recuperação de senha | user.py, auth.py, ForgotPassword.tsx, ResetPassword.tsx, Login.tsx, App.tsx |
| 2026-03-11 | Etapa 9 | Busca de documentos | documents.py, DocumentList.tsx |
| 2026-03-11 | Etapa 10 | Notificações in-app | notification.py, notifications.py, orchestrator.py, documents.py, NotificationBell.tsx, Layout.tsx |

---

## NOTAS TÉCNICAS

### Password Reset Token
- Gerado com `secrets.token_urlsafe(32)` — 43 chars URL-safe
- TTL: 15 minutos
- Um uso por token (limpo após uso)
- Sem serviço de email configurado: token retornado em `dev_reset_token` no response
- TODO: em produção, remover dev_reset_token e enviar por email (Sendgrid/SMTP)

### Notifications
- Criadas de forma assíncrona (fire-and-forget, não bloqueiam a pipeline)
- Polling no frontend: 30 segundos
- Tipos: document_completed | document_approved | document_rejected
- user_id NULL = notificação org-wide (visível para todos os admins)

### WhatsApp Bot Flow
```
WELCOME → AWAITING_DOC_TYPE → AWAITING_LEGAL_AREA → AWAITING_CONTENT → PROCESSING → COMPLETE
                                                    ↗ (pular → sem área)
```
- Reset: "menu", "início", "cancelar", "reiniciar"
- Pular área: "pular", "skip", "geral", "qualquer", "0"

### Anamnesis API — Estrutura de Campos por Tipo
Endpoint: `GET /anamnesis/request-fields/{document_type_id}`
Retorna lista de campos específicos por tipo. Exemplo para `peticao_inicial`:
```json
[
  {"id": "partes", "label": "Partes do processo", "type": "text", "required": true},
  {"id": "fatos", "label": "Fatos relevantes", "type": "textarea", "required": true},
  {"id": "pedidos", "label": "Pedidos", "type": "textarea", "required": true},
  {"id": "valor_causa", "label": "Valor da causa", "type": "text", "required": false}
]
```

### Pipeline Context Building
`POST /anamnesis/build-context` — recebe `{document_type_id, legal_area_ids, request, context_fields}`, retorna contexto completo para o pipeline.

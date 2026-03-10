# LEXIO — PLANEJAMENTO CENTRAL DE IMPLEMENTAÇÃO
> Atualizado: 2026-03-10 | Branch: claude/continue-planning-9WM6r
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

## ESTADO ATUAL DO SISTEMA (2026-03-10)

### ✅ IMPLEMENTADO E FUNCIONANDO

#### Backend
- Auth: JWT, bcrypt, registro, login, /me
- Documents: CRUD, pipeline trigger, content GET/PUT, executions list
- Stats: /, /daily, /agents, /recent
- Document Types: GET /document-types (6 tipos)
- Legal Areas: GET /legal-areas (5 áreas)
- Thesis Bank: CRUD + stats + auto-extraction pós-pipeline
- Uploads: POST + GET, background indexing → Qdrant
- Anamnesis: wizard, profile, onboarding, build-context, request-fields
- Admin: modules list/health/toggle/test, settings GET/POST
- WebSocket: /ws/document/{id} (progresso em tempo real)
- Health: /health (PostgreSQL, Qdrant, Ollama, SearXNG)

#### Frontend Pages
- Login.tsx ✅ (spinner, password toggle)
- Register.tsx ✅ (password toggle)
- Dashboard.tsx ✅ (Recharts BarChart+AreaChart, skeletons, agent table)
- DocumentList.tsx ✅ (paginação, filter, quality colors, mobile)
- NewDocument.tsx ✅ (tipo, template, áreas, request, context fields básicos)
- DocumentDetail.tsx ✅ (execution timeline, DOCX preview mammoth)
- DocumentEditor.tsx ✅ (TipTap, word count, DOCX download, toast save, beforeunload)
- Upload.tsx ✅ (file history, polling status)
- ThesisBank.tsx ✅ (search debounced, filters, create/edit/delete, copy)
- AdminPanel.tsx 🟡 (módulos e API keys, restante placeholder)
- Onboarding.tsx ✅ (4-step wizard → user_profiles)
- NotFound.tsx ✅

#### Frontend Components
- ErrorBoundary.tsx ✅ | Layout.tsx ✅ | Sidebar.tsx ✅ (mobile hamburger)
- ProgressTracker.tsx ✅ | RichTextEditor.tsx ✅ | StatusBadge.tsx ✅
- Toast.tsx ✅ (useToast, auto-dismiss, slide-in) | Skeleton.tsx ✅

#### Módulos Backend
- document_types: parecer, peticao_inicial, contestacao, recurso, sentenca, acao_civil_publica ✅
- legal_areas: administrative, civil, constitutional, labor, tax ✅
- anamnesis ✅ | thesis_bank ✅ | whatsapp_bot 🟡

---

## BUGS CONHECIDOS

| ID | Local | Descrição | Prioridade |
|----|-------|-----------|-----------|
| B1 | ProgressTracker.tsx | WS URL deve ser wss:// em HTTPS | ✅ Já correto (replace /^http/, 'ws') |
| B2 | DocumentDetail.tsx | Polling não para quando status=concluido | ✅ Corrigido com useRef |
| B3 | Dashboard.tsx | .catch(() => {}) silencioso → deve usar toast | Baixa |
| B4 | ThesisBank.tsx | .catch(() => {}) silencioso → deve usar toast | Baixa |

---

## ROADMAP DE IMPLEMENTAÇÃO

### ETAPA 1 — Campos de Contexto Layer 2 no NewDocument
**Status**: ✅ Concluído (2026-03-10)
**Prioridade**: ALTA (impacta qualidade de todos os documentos)
**Arquivos a criar/modificar**:
- `frontend/src/pages/NewDocument.tsx` — exibir campos dinâmicos por tipo de documento
- `frontend/src/hooks/useAnamnesisFields.ts` — hook para buscar campos via API
- `frontend/src/components/AnamnesisContextForm.tsx` — formulário de campos estruturados
**API usada**: `GET /anamnesis/request-fields/{document_type_id}`
**Resultado esperado**: Ao selecionar tipo de documento, campos específicos aparecem (partes, pedidos, fatos, etc.)

### ETAPA 2 — Página Meu Perfil (Edição de Anamnese Layer 1)
**Status**: ✅ Concluído (2026-03-10)
**Prioridade**: ALTA (UX, usuário precisa atualizar dados)
**Arquivos a criar/modificar**:
- `frontend/src/pages/Profile.tsx` — nova página (CRIAR)
- `frontend/src/App.tsx` — adicionar rota /profile
- `frontend/src/components/Sidebar.tsx` — adicionar link no menu
**API usada**: `GET /anamnesis/profile`, `PATCH /anamnesis/profile`
**Resultado esperado**: Usuário edita perfil profissional e preferências sem refazer onboarding

### ETAPA 3 — Workflow de Aprovação/Rejeição de Documentos
**Status**: ✅ Concluído (2026-03-10)
**Prioridade**: ALTA
**Implementado**: 3 endpoints (submit-review, approve, reject), StatusBadge novos estados, botões no DocumentDetail por status e role, formulário de rejeição inline, metadata_ exposto no schema
**Resultado**: Fluxo completo concluido → em_revisao → aprovado/rejeitado

### ETAPA 4 — Integração Banco de Teses → Pipeline
**Status**: ⏳ Pendente
**Prioridade**: MÉDIA (melhora qualidade geração)
**Arquivos a criar/modificar**:
- `packages/pipeline/orchestrator.py` — buscar teses relevantes antes dos agentes
- `packages/modules/thesis_bank/search.py` — função de busca por relevância
- `packages/core/` — injetar teses no contexto do agente
**Resultado esperado**: Pipeline busca teses existentes do org e injeta no contexto dos agentes

### ETAPA 5 — Fix WebSocket wss:// para HTTPS
**Status**: ⏳ Pendente
**Prioridade**: ALTA (necessário produção)
**Arquivos a criar/modificar**:
- `frontend/src/components/ProgressTracker.tsx` — auto-detect protocol
- `frontend/src/api/client.ts` — WS_URL dinâmica
**Resultado esperado**: ws:// em desenvolvimento, wss:// em HTTPS automaticamente

### ETAPA 6 — AdminPanel UI Completo
**Status**: ⏳ Pendente
**Prioridade**: MÉDIA
**Arquivos a criar/modificar**:
- `frontend/src/pages/AdminPanel.tsx` — UI refinada, wizards, logs
**Resultado esperado**: Painel admin completo e funcional

---

## ARQUIVOS CRÍTICOS — REFERÊNCIA RÁPIDA

```
frontend/src/
  pages/
    NewDocument.tsx         — Criação de documentos (ETAPA 1)
    Profile.tsx             — Perfil usuário (CRIAR - ETAPA 2)
    DocumentDetail.tsx      — Detalhes + workflow (ETAPA 3)
    AdminPanel.tsx          — Admin (ETAPA 6)
  components/
    AnamnesisContextForm.tsx — Campos Layer 2 (CRIAR - ETAPA 1)
    ReviewWorkflow.tsx       — Workflow aprovação (CRIAR - ETAPA 3)
    ProgressTracker.tsx      — WS URL fix (ETAPA 5)
  hooks/
    useAnamnesisFields.ts   — Hook campos dinâmicos (CRIAR - ETAPA 1)
  api/
    client.ts               — WS_URL (ETAPA 5)

packages/
  api/routes/documents.py   — Endpoints workflow (ETAPA 3)
  pipeline/orchestrator.py  — Injeção teses (ETAPA 4)
  modules/thesis_bank/search.py — Busca teses (ETAPA 4)

database/
  schema.sql                — Status workflow (ETAPA 3)
```

---

## LOG DE IMPLEMENTAÇÃO

| Data | Etapa | Ação | Arquivos |
|------|-------|------|---------|
| 2026-03-10 | Setup | Criado PLANNING.md | .claude/PLANNING.md |
| 2026-03-10 | Etapa 1 | Fix NewDocument: tipo `number`, auto-open, badge campos requeridos | frontend/src/pages/NewDocument.tsx |
| 2026-03-10 | Etapa 2 | Criada página Profile.tsx + rota /profile + link sidebar | frontend/src/pages/Profile.tsx, App.tsx, Sidebar.tsx |
| 2026-03-10 | Bug B2 | Fix polling DocumentDetail (useRef + clearInterval no callback) | frontend/src/pages/DocumentDetail.tsx |

---

## NOTAS TÉCNICAS

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

### Demo Mode
O frontend tem interceptor de requisições para demo. Ao implementar novas features:
- Adicionar mock data em `frontend/src/demo/data.ts`
- Adicionar interceptor em `frontend/src/demo/interceptor.ts`

# Lexio — Contexto Completo para Agentes IA

> **Última atualização:** Março 2026 · Commit HEAD: `9458735`

---

## O que é

Lexio é um SaaS de **produção jurídica com IA**. Gera documentos jurídicos (pareceres, petições, recursos, etc.) usando pipelines multi-agente que rodam **100% no browser** via OpenRouter.  
Não há backend Python em produção — toda a lógica LLM está no frontend TypeScript.

---

## Stack Atual (Produção)

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite 5 + Tailwind CSS |
| Roteamento | React Router DOM 6 (SPA) |
| Auth | Firebase Auth (email/senha + Google OAuth) |
| Banco de dados | Firebase Firestore (NoSQL, real-time) |
| LLM | OpenRouter API — chamado diretamente do browser |
| Editor | TipTap 3 (ProseMirror) |
| Export | `docx` lib (DOCX client-side) |
| Charts | Recharts + D3 |
| Icons | Lucide React |
| Deploy | GitHub Pages (`/Lexio/`) + Firebase Hosting (`lexio.web.app`) |
| CI/CD | GitHub Actions: `deploy-pages.yml` + `firebase-deploy.yml` |

### Firebase
- **Project ID:** `hocapp-44760`
- **Firestore:** todas as coleções de dados
- **Auth:** `onAuthStateChanged` + localStorage persistence

---

## URLs de Produção

- **GitHub Pages:** `https://fsalamoni.github.io/Lexio/`
- **Firebase Hosting:** `https://lexio.web.app` (também `hocapp-44760.firebaseapp.com`)
- **Dev local:** `npm run dev` → `http://localhost:3000`

---

## Comandos Essenciais

```bash
cd frontend
npm run dev          # Servidor de desenvolvimento (porta 3000)
npm run build        # Build de produção → frontend/dist/
npm run typecheck    # Checar erros TypeScript sem buildar
```

> **Deploy é automático** — qualquer push para `main` dispara ambas as pipelines de CI/CD.

---

## Variáveis de Ambiente (frontend)

| Variável | Propósito |
|----------|-----------|
| `VITE_BASE_PATH` | `/Lexio/` para GH Pages · `/` para Firebase |
| `VITE_DEMO_MODE` | `true` → modo demo offline com mock interceptor |
| `VITE_OPENROUTER_API_KEY` | Chave OpenRouter (fallback; normalmente vem do Firestore) |
| `VITE_FIREBASE_*` | Credenciais Firebase (apiKey, authDomain, projectId, etc.) |

---

## Estrutura do Projeto

```
frontend/
  src/
    api/          → Axios client com cache TTL + deduplificação de inflight
    components/   → Componentes UI reutilizáveis
    contexts/     → AuthContext (estado global de auth)
    data/         → Dados estáticos (seed de teses)
    demo/         → Mock interceptor para modo demo offline
    lib/          → TODA a lógica de negócio (LLM, Firestore, modelos, etc.)
    pages/        → Componentes de página por rota
  public/
  index.html
  vite.config.ts  → base: VITE_BASE_PATH · chunks: tiptap, recharts

packages/         → Backend Python em desenvolvimento (não em produção ainda)
  core/           → Infraestrutura compartilhada
  pipeline/       → Orquestrador de pipeline genérico
  modules/        → Módulos independentes (document_types, legal_areas, etc.)
  api/            → Gateway FastAPI

.claude/          → Este arquivo e configurações para agentes IA
.github/
  workflows/
    deploy-pages.yml    → Deploy automático GitHub Pages
    firebase-deploy.yml → Deploy automático Firebase Hosting
```

---

## Rotas da Aplicação

| Rota | Página | Guard |
|------|--------|-------|
| `/login` | Login | Público |
| `/register` | Cadastro | Público |
| `/forgot-password` | Recuperar senha | Público |
| `/reset-password` | Redefinir senha | Público |
| `/` | Dashboard | Auth |
| `/documents` | Lista de documentos | Auth |
| `/documents/new` | Novo documento | Auth |
| `/documents/:id` | Detalhe do documento | Auth |
| `/documents/:id/edit` | Editor TipTap | Auth |
| `/upload` | Upload para acervo | Auth |
| `/theses` | Banco de teses | Auth |
| `/notebook` | Caderno de Pesquisa | Auth |
| `/admin` | Painel administrativo | Auth + admin |
| `/admin/costs` | Analytics de custo | Auth + admin |
| `/onboarding` | Wizard de perfil | Auth |
| `/profile` | Perfil profissional | Auth |

---

## Arquivos Lib Principais

| Arquivo | O que faz |
|---------|-----------|
| `lib/llm-client.ts` | Wrapper OpenRouter: `callLLM`, `callLLMWithMessages`; `ModelUnavailableError` (captura 404 "no endpoints" e 400 "not a valid model"); `LLMResult` = `{ content, model, tokens_in, tokens_out, cost_usd, duration_ms }` |
| `lib/model-config.ts` | `ModelOption` interface; `AVAILABLE_MODELS` (45+ modelos curados); `FREE_TIER_RATE_LIMITS` = 20 req/min · 200 req/dia; `RESEARCH_NOTEBOOK_AGENT_DEFS` (8 agentes); funções `load/save/reset` por pipeline |
| `lib/model-catalog.ts` | Catálogo dinâmico Firestore; `fetchOpenRouterModels` para adicionar modelos ao vivo; `CATALOG_UPDATED_EVENT` |
| `lib/model-health-check.ts` | Verifica modelos do catálogo contra OpenRouter; remove modelos inválidos de todas as configs de agentes |
| `lib/firestore-service.ts` | CRUD completo Firestore — documentos, teses, acervo, settings, cadernos de pesquisa, perfis |
| `lib/generation-service.ts` | **Pipeline principal de 9 agentes** para geração de documentos jurídicos; roda cliente via OpenRouter; `getOpenRouterKey()` busca chave do Firestore |
| `lib/notebook-studio-pipeline.ts` | **Pipeline 3 agentes** para artefatos do Estúdio do Caderno: Pesquisador → Especialista (Escritor/Roteirista/Visual) → Revisor; delay 1s entre etapas |
| `lib/notebook-acervo-analyzer.ts` | Pipeline de 4 agentes para análise do acervo no Caderno (Triagem → Buscador → Analista → Curador) |
| `lib/thesis-analyzer.ts` | Pipeline de 5 agentes para análise do Banco de Teses |
| `lib/cost-analytics.ts` | `UsageExecutionRecord` · `createUsageExecutionRecord()` · funções de agregação de custo |
| `lib/quality-evaluator.ts` | Avaliação de qualidade client-side por tipo de documento |
| `lib/docx-generator.ts` | Geração de DOCX client-side (Times New Roman 12pt, A4, espaçamento 1.5) |
| `lib/settings-store.ts` | Persistência de chaves de API no Firestore `/settings/platform` |
| `lib/constants.ts` | `DOCTYPE_LABELS` (10 tipos) · `AREA_LABELS` (17 áreas) |
| `lib/classification-data.ts` | Árvore de classificação jurídica brasileira completa |

---

## Coleções Firestore

| Caminho | Conteúdo |
|---------|----------|
| `/users/{uid}` | Perfil do usuário + role |
| `/users/{uid}/profile` | Anamnese Layer 1 (perfil profissional) |
| `/users/{uid}/documents/{id}` | Documentos jurídicos gerados + `llm_executions[]` |
| `/users/{uid}/theses/{id}` | Entradas do banco de teses |
| `/users/{uid}/acervo/{id}` | Documentos de referência (uploads) |
| `/users/{uid}/research_notebooks/{id}` | Cadernos de pesquisa (fontes, chat, artefatos) |
| `/settings/platform` | Config global: api_keys, model configs por pipeline, model_catalog |

---

## Agentes LLM e Pipelines

### Pipeline de Geração de Documentos (9 agentes)
Definidos em `generation-service.ts`. Config de modelos salva em `settings/platform.document_models`.

### Pipeline do Caderno de Pesquisa (8 agentes)
Definidos em `model-config.ts` → `RESEARCH_NOTEBOOK_AGENT_DEFS`.  
Config salva em `settings/platform.research_notebook_models`.

**Grupo Pesquisa & Análise (3 agentes):**
| Chave | Papel | Default |
|-------|-------|---------|
| `notebook_pesquisador` | Indexa fontes e extrai informações | `claude-3.5-haiku` |
| `notebook_analista` | Sintetiza descobertas para guia | `claude-sonnet-4` |
| `notebook_assistente` | Chat conversacional | `claude-sonnet-4` |

**Grupo Estúdio de Criação (5 agentes — pipeline 3 etapas):**
| Chave | Papel | Default |
|-------|-------|---------|
| `studio_pesquisador` | Extrai dados relevantes das fontes | `llama-4-scout:free` |
| `studio_escritor` | Redige textos, resumos, relatórios, cartões, testes | `llama-3.3-70b:free` |
| `studio_roteirista` | Cria roteiros de áudio/vídeo com timing | `llama-3.3-70b:free` |
| `studio_visual` | Estrutura apresentações, mapas mentais, infográficos | `llama-3.3-70b:free` |
| `studio_revisor` | Revisa e garante qualidade final | `llama-3.3-70b:free` |

Roteamento automático por tipo de artefato:
- **Escritor**: resumo, relatorio, documento, cartoes_didaticos, teste
- **Visual**: apresentacao, mapa_mental, infografico, tabela_dados  
- **Roteirista**: audio_script, video_script

### Outros Pipelines
- **Banco de Teses:** 5 agentes — config em `settings/platform.thesis_analyst_models`
- **Acervo Classificador:** 1 agente — config em `settings/platform.acervo_classificador_models`
- **Acervo Ementa:** 1 agente — config em `settings/platform.acervo_ementa_models`
- **Context Detail:** 1 agente — config em `settings/platform.context_detail_models`
- **Analisador de Acervo (Caderno):** 4 agentes — config em `settings/platform.notebook_acervo_models`

---

## Types Chave

```typescript
// LLM
interface LLMResult { content: string; model: string; tokens_in: number; tokens_out: number; cost_usd: number; duration_ms: number }
class ModelUnavailableError extends Error { modelId: string }

// Modelos
interface ModelOption { id: string; label: string; provider: string; tier: 'fast'|'balanced'|'premium'; contextWindow: number; inputCost: number; outputCost: number; isFree: boolean; agentFit: AgentFitScores; rateLimits?: { rpm: number; rpd: number; note?: string } }
const FREE_TIER_RATE_LIMITS = { rpm: 20, rpd: 200 }

// Custo
interface UsageExecutionRecord { id: string; source_type: string; source_id: string; phase: string; agent_name: string; model: string; tokens_in: number; tokens_out: number; cost_usd: number; duration_ms: number; created_at: string }

// Tipos de artefato do Estúdio
type StudioArtifactType = 'resumo'|'mapa_mental'|'cartoes_didaticos'|'apresentacao'|'relatorio'|'tabela_dados'|'teste'|'infografico'|'documento'|'audio_script'|'video_script'|'outro'
```

---

## Regras Importantes para Agentes

1. **Nunca modificar prompts validados** — Os prompts de geração jurídica em `generation-service.ts` foram criteriosamente testados. Alterá-los pode degradar qualidade.
2. **ModelUnavailableError**: Lançado quando um modelo retorna 404 "no endpoints" OU 400 "not a valid model". NÃO há fallback automático — o usuário é notificado para trocar o modelo no admin.
3. **Modelos gratuitos têm limite**: 20 req/min · 200 req/dia (OpenRouter free tier). Pipelines multi-agente podem atingir esses limites.
4. **Deploy automático**: Qualquer `git push` para `main` dispara both pipelines de CI/CD. Sempre verifique o build antes de fazer push.
5. **Dual deploy**: `VITE_BASE_PATH=/Lexio/` para GH Pages · `/` para Firebase. O roteamento depende disto.
6. **IS_FIREBASE flag**: Controla se usa Firestore real ou modo mock. Verificar antes de adicionar qualquer chamada Firestore.
7. **Modo Demo**: `VITE_DEMO_MODE=true` desativa Firebase completamente e usa `demo/interceptor.ts`. Não quebrar compatibilidade.
8. **Lei 8.666/93 está REVOGADA** — Sempre referenciar Lei 14.133/2021 em contextos de licitação.
9. **Tipos de artefato**: `StudioArtifactType` está definido em `firestore-service.ts`. Adicionar novos tipos requer atualizar esse union, `ARTIFACT_AGENT_MAP` em `notebook-studio-pipeline.ts`, e `ARTIFACT_TYPES` array em `ResearchNotebook.tsx`.
10. **Custo**: Toda chamada LLM deve criar um `UsageExecutionRecord` via `createUsageExecutionRecord()` e salvar em `llm_executions` do documento/caderno correspondente.

---

## Componentes Administrativos (Admin Panel)

| Componente | Config salva em (`settings/platform.*`) |
|-----------|----------------------------------------|
| `ModelConfigCard` | `document_models` |
| `ThesisAnalystConfigCard` | `thesis_analyst_models` |
| `ContextDetailConfigCard` | `context_detail_models` |
| `AcervoClassificadorConfigCard` | `acervo_classificador_models` |
| `AcervoEmentaConfigCard` | `acervo_ementa_models` |
| `ResearchNotebookConfigCard` | `research_notebook_models` |
| `ModelCatalogCard` | `model_catalog` |

---

## Features Implementadas (estado atual)

- [x] Geração de documentos jurídicos — 9 agentes, 10 tipos, 17 áreas
- [x] Acervo — upload + classificação + ementa automática
- [x] Banco de Teses — CRUD + extração automática + análise de 5 agentes
- [x] Caderno de Pesquisa — chat + indexação de fontes + Estúdio (12 artefatos, pipeline 3 agentes)
- [x] Anamnese 2 camadas (perfil profissional Layer 1 + context detail Layer 2)
- [x] Admin Panel completo — API keys, modelos por agente, catálogo dinâmico
- [x] Health check de modelos — verificação diária contra OpenRouter
- [x] Analytics de custo — por modelo/função/provedor em USD e BRL
- [x] Export DOCX client-side
- [x] Rate limits visíveis nos modais de seleção (20 req/min · 200 req/dia)
- [x] Modo Demo offline
- [x] Dual deploy (GH Pages + Firebase Hosting)

# Lexio — Produção Jurídica com IA

> SaaS brasileiro de produção jurídica com IA. 10 pipelines multi-agente, 58 agentes configuráveis, 40+ modelos. Roda 100% no browser via OpenRouter.

> Referência sincronizada com `main` em 23 de abril de 2026.

[![Deploy Pages](https://github.com/fsalamoni/Lexio/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/fsalamoni/Lexio/actions/workflows/deploy-pages.yml)
[![Firebase Deploy](https://github.com/fsalamoni/Lexio/actions/workflows/firebase-deploy.yml/badge.svg)](https://github.com/fsalamoni/Lexio/actions/workflows/firebase-deploy.yml)

---

## URLs de Produção

| Ambiente | URL |
|----------|-----|
| GitHub Pages | https://fsalamoni.github.io/Lexio/ |
| Firebase Hosting | https://lexio.web.app |
| Firebase Hosting Redesign V2 | https://lexio-redesign-v2-44760.web.app |
| Cloud Function | https://southamerica-east1-hocapp-44760.cloudfunctions.net/datajudProxy |
| Dev local | http://localhost:3000 |

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript 5.3 + Vite 5 + Tailwind CSS |
| Roteamento | React Router DOM 6 (SPA) |
| Auth | Firebase Auth (email/senha + Google OAuth) |
| Banco de dados | Firebase Firestore (NoSQL, real-time) |
| LLM | OpenRouter API — chamado diretamente do browser |
| Editor de texto | TipTap 3 (ProseMirror) |
| Export | `docx` + `pptxgenjs` (DOCX e PPTX client-side) |
| Charts | Recharts + D3 |
| Ícones | Lucide React |
| PDF | pdfjs-dist 4.4 |
| Zip | JSZip 3.10 |
| Cloud Function | Firebase Functions 2nd Gen (Node.js 22) |
| Deploy | GitHub Pages + Firebase Hosting producao + Firebase Hosting redesign V2 |
| CI/CD | GitHub Actions (4 workflows) |

> **Não há backend Python em produção.** A pasta `packages/` contém um backend FastAPI em desenvolvimento mas não está ativo. Toda a lógica LLM roda no frontend TypeScript.

---

## Funcionalidades

- **Geração de documentos jurídicos** — 11 agentes LLM em pipeline sequencial (3 condicionais); 10 tipos de documento; 17 áreas do direito
- **Acervo** — Upload de documentos de referência com classificação e ementa automática por IA (2 agentes dedicados)
- **Banco de Teses** — CRUD + extração automática + análise com pipeline de 5 agentes
- **Caderno de Pesquisa** — Chat com 7 agentes de pesquisa + Estúdio de Criação (13 tipos de artefato, pipeline de 5 agentes + renderização visual automática e geração de mídia internalizada)
- **Workbench Redesign V2** — DashboardV2, ProfileV2 e ResearchNotebookV2 já operam sobre dados reais; o notebook V2 cobre overview, chat contextual, gestão de fontes, pesquisa externa, pesquisa profunda e jurisprudência/DataJud no novo shell
- **Análise de acervo no caderno** — 4 agentes para análise de documentos do acervo dentro do caderno
- **Pipeline de Vídeo** — 11 agentes configuráveis para produção completa de vídeo (planejamento, clips, imagem, TTS → renderização)
- **Pipeline de Áudio** — 6 agentes para produção de podcasts e narrações com TTS e síntese literal internalizada
- **Pipeline de Apresentação** — 6 agentes para criação de apresentações profissionais com imagens de slides contextuais e exportação PPTX
- **Resiliência de mídia e LLM** — Pipelines de áudio, vídeo, apresentação e estúdio usam fallback automático de modelo em indisponibilidade/transientes, com avisos visíveis de degradação e incompatibilidade de capacidade
- **Confiabilidade de progresso + mobile hardening** — Progresso operacional evita conclusão prematura (100% apenas no fim real), fallback do Redator mantém semântica monotônica de etapa e superfícies críticas (`TaskBar`, `Novo Documento`, `Caderno`) foram ajustadas para melhor uso em telas pequenas
- **Paralelização segura e adaptativa em pipelines críticos** — Etapas independentes agora rodam com concorrência controlada/adaptativa via política unificada (`runtime-concurrency`), com caps por hardware/memória/rede, calibração automática por perfil de runtime (`unknown|constrained|balanced|performant|high_end`), diagnósticos por lote (incluindo origem do alvo `auto|env`) e telemetria persistida em `llm_executions` (`runtime_profile`, `runtime_hints`, `runtime_concurrency`, `runtime_cap`)
- **Painéis flutuantes endurecidos para mobile** — `DraggablePanel` recebeu geometria compacta automática em viewport estreita, clamp de posição/tamanho, guardrails de interação, leitura de `visualViewport`, suporte a safe-area (`env(safe-area-inset-*)`) e correção de estado maximizado em modo compacto (`startMaximized`), estabilizando modais com teclado virtual, notch e home indicator
- **Persistência de mídia do estúdio** — Vídeos, áudios e imagens temporários do notebook são enviados para Cloud Storage; o artefato salvo no Firestore mantém apenas URLs persistidas e checkpoint compactado para respeitar o limite de 1 MiB por documento
- **Anamnese 2 camadas** — Perfil profissional persistente (Layer 1) + contexto por geração (Layer 2)
- **Configurações por usuário** — API keys, catálogo pessoal, modelos por agente, tipos e áreas ficam isolados em cada perfil, persistidos em Firestore e usados como única fonte de verdade para aquele usuário
- **Painel administrativo da plataforma** — Visão agregada de uso, pipelines, agentes, documentos, custos e tokens globais
- **Health check de modelos** — Verificação automática de disponibilidade contra OpenRouter
- **Analytics de custo** — Dashboard por modelo/função/provedor em USD e BRL (10 funções de rastreamento)
- **Export DOCX/PPTX** — DOCX jurídico formatado e apresentações com exportação PowerPoint gerados no browser
- **Pesquisa web** — DuckDuckGo + Jina com fallbacks progressivos, diagnósticos técnicos e deep search resiliente
- **Pesquisa de jurisprudência** — DataJud/CNJ via Cloud Function, busca complementar no STF e filtragem temática por área do direito
- **Geração de imagens** — Via OpenRouter para vídeos e apresentações
- **Modo Demo** — Offline completo com mock interceptor (sem necessidade de Firebase)
- **Deploy multipista** — GitHub Pages (base `/Lexio/`) + Firebase Hosting estável (`lexio.web.app`) + Firebase Hosting experimental do redesign (`lexio-redesign-v2-44760.web.app`)

---

## Início Rápido

### Pré-requisitos

- Node.js 18+
- npm 9+
- Projeto Firebase configurado (ou use modo demo)

### Instalação

```bash
git clone https://github.com/fsalamoni/Lexio.git
cd Lexio/frontend
npm install
```

### Variáveis de Ambiente

Crie `frontend/.env.local`:

```env
# Base path — use /Lexio/ para GH Pages, / para Firebase/local
VITE_BASE_PATH=/

# Firebase
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=hocapp-44760.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:abc123

# Opcional - ativar o shell V2 e fazer o site abrir direto nele
VITE_REDESIGN_V2=true
VITE_REDESIGN_V2_HOME=true

# Opcional — fallback quando não há chave no Firestore
VITE_OPENROUTER_API_KEY=sk-or-v1-...

# Opcional — rollout de performance do Redator (documentos)
# true: usa 10k tokens na primeira tentativa de redação
VITE_DOC_REDATOR_10K_ENABLED=false

# Opcional — limiar mínimo de qualidade (0-100) para acionar fallback em 12k
# padrão: 82
VITE_DOC_REDATOR_QUALITY_ROLLBACK_MIN=82

# Opcional — desativa rollback automático por qualidade quando rollout 10k estiver ativo
VITE_DOC_REDATOR_QUALITY_ROLLBACK_DISABLED=false
# Observação: com todas as flags acima em false/default, o pipeline segue no modo tradicional (Redator 12k sem fallback extra)

# Opcional — acesso direto ao DataJud apenas em desenvolvimento/local
# Em produção, o fluxo preferencial é via proxy gerenciado (/api/datajud ou Cloud Function)
VITE_DATAJUD_API_KEY=your_datajud_key

# Modo demo offline (sem Firebase)
VITE_DEMO_MODE=false
```

### Comandos

```bash
npm run dev          # Servidor de desenvolvimento (porta 3000)
npm run build        # Build de produção → dist/
npm run typecheck    # Verificar erros TypeScript sem buildar
npm run preview      # Pré-visualizar build de produção
```

---

## Estrutura do Projeto

```
frontend/
  src/
    api/           → Axios client com cache TTL + demo interceptor (2 arquivos)
    components/    → 32 componentes + 15 artefatos (subdir artifacts/)
    contexts/      → AuthContext + TaskManagerContext
    data/          → seed-theses.ts (70+ teses exemplo)
    demo/          → Mock interceptor para modo demo offline (2 arquivos)
    lib/           → TODA a lógica de negócio — 37 arquivos (LLM, Firestore, pipelines, modelos)
    pages/         → 13 páginas principais + 4 auth + módulo notebook
  public/          → robots.txt
  index.html       → CSP + meta tags
  vite.config.ts   → Base path, code splitting, proxy

functions/         → Cloud Function datajudProxy (Firebase 2nd Gen, Node.js 22)

packages/          → Backend Python FastAPI (em desenvolvimento, NÃO em produção)
  api/             → Gateway FastAPI com 12 grupos de rotas
  core/            → Infraestrutura compartilhada
  pipeline/        → Orquestrador genérico
  modules/         → Módulos independentes

.claude/           → CLAUDE.md — contexto completo para agentes IA
.github/workflows/ → release-web.yml + deploy-pages.yml + firebase-deploy.yml + firebase-preview.yml + firebase-redesign-v2.yml + test.yml
docs/              → Documentação técnica arquitetural
```

---

## Workflow Operacional

### Fluxo recomendado de merge e release

1. Atualize sua branch a partir de `main` e rode os gates locais relevantes: `npm run typecheck`, `npx vitest run`, `npm run build`, `d:/Lexio/.venv/Scripts/python.exe -m pytest tests --tb=short -q` e `d:/Lexio/.venv/Scripts/python.exe -m ruff check packages tests`.
2. Abra PR para `main`. O workflow `.github/workflows/firebase-preview.yml` publica um preview temporário no Firebase e agora exige `typecheck`, `test` e `build` antes de comentar a URL.
3. Faça merge em `main` somente com a prévia validada. O workflow `.github/workflows/firebase-deploy.yml` roda `typecheck`, `test`, `build`, recompila `functions/`, resolve a fonte do `DATAJUD_API_KEY` (secret do GitHub, preferencialmente, ou segredo já existente no Firebase Secret Manager), sincroniza o segredo quando necessário e então publica Hosting, Rules, Indexes, Storage e Functions.
4. Para release sincronizado (recomendado), dispare `.github/workflows/release-web.yml` com `deploy_firebase=true` e `deploy_github_pages=true`; ajuste `deploy_redesign_v2` conforme a janela. Essa trilha foi validada end-to-end nos runs `24849029535` e `24849789759` (quality gates + Firebase + Pages + release summary em sucesso, com redesign V2 opcional desativado).
5. Se preferir operação por faixa, mantenha o deploy Firebase automático no push de `main` e dispare manualmente `.github/workflows/deploy-pages.yml` para atualizar o espelho do GitHub Pages.
6. Para publicar a experiência experimental do redesign em URL separada, use `.github/workflows/firebase-redesign-v2.yml` ou replique localmente o build com `VITE_REDESIGN_V2=true`, `VITE_REDESIGN_V2_HOME=true` e `VITE_BUILD_OUT_DIR=dist-redesign-v2` antes de rodar `firebase deploy --only hosting:lexio-redesign-v2 --project hocapp-44760`.

### Segredos operacionais mínimos

- `FIREBASE_TOKEN` ou `FIREBASE_SERVICE_ACCOUNT`
- `FIREBASE_API_KEY`
- `VITE_ADMIN_EMAIL`
- `DATAJUD_API_KEY` no GitHub Actions (recomendado para sincronização automática) ou já provisionado como segredo `DATAJUD_API_KEY` no Firebase Secret Manager para a Cloud Function `datajudProxy`

### URL dedicada do redesign V2

- Site isolado: `https://lexio-redesign-v2-44760.web.app`
- Comportamento: o hostname dedicado liga `VITE_REDESIGN_V2` implicitamente e redireciona `/` para `/labs/dashboard-v2`, preservando acesso direto ao shell experimental sem query params manuais
- Deploy: `.github/workflows/firebase-redesign-v2.yml`
- Auth: se o workflow não puder sincronizar domínios autorizados automaticamente, rode `node scripts/firebase-authorized-domains.mjs --project hocapp-44760 --domain lexio-redesign-v2-44760.web.app`

O cliente web não depende mais de chave hardcoded do DataJud. Em produção, o acesso deve passar pelo proxy gerenciado; fallback direto do browser só é admitido quando o usuário configurou `datajud_api_key` nas preferências ou `VITE_DATAJUD_API_KEY` no ambiente local.

---

## Arquitetura de LLM

Toda chamada LLM usa `callLLM()`, `callLLMWithMessages()` ou `callLLMWithFallback()` de `lib/llm-client.ts`, que chama a OpenRouter API diretamente do browser. A chave de API do OpenRouter é resolvida a partir das configurações salvas do usuário autenticado em `/users/{uid}/settings/preferences`, com fallback opcional por variável de ambiente em desenvolvimento. O catálogo de modelos e os mapas de agentes também são carregados desse mesmo escopo do usuário; modelos fora do catálogo pessoal não são aceitos em runtime. Para pipelines de mídia e fluxos críticos do notebook, falhas transitórias e modelos `:free`/instáveis podem ser reencaminhados automaticamente para modelos fallback mais confiáveis.

### Pipelines Ativos

| Pipeline | Agentes | Config Firestore |
|----------|---------|-----------------|
| Geração de documentos | 11 agentes (3 condicionais) | `agent_models` |
| Análise de teses | 5 agentes | `thesis_analyst_models` |
| Context detail (Layer 2) | 1 agente | `context_detail_models` |
| Classificador de acervo | 1 agente | `acervo_classificador_models` |
| Ementa de acervo | 1 agente | `acervo_ementa_models` |
| Caderno de pesquisa | 12 agentes (7 pesquisa + 5 estúdio) | `research_notebook_models` |
| Notebook acervo | 4 agentes | `notebook_acervo_models` |
| Pipeline de vídeo | 11 agentes | `video_pipeline_models` |
| Pipeline de áudio | 6 agentes | `audio_pipeline_models` |
| Pipeline de apresentação | 6 agentes | `presentation_pipeline_models` |
| **TOTAL** | **58 agentes · 10 pipelines** | **10 configs** |

### Agentes do Pipeline de Documentos (11)

| # | Key | Função | Categoria |
|---|-----|--------|-----------|
| 1 | `triagem` | Extrai tema, subtemas, palavras-chave | extraction |
| 2 | `acervo_buscador` | Busca documentos relevantes no acervo (condicional) | extraction |
| 3 | `acervo_compilador` | Compila documentos do acervo em base unificada (condicional) | synthesis |
| 4 | `acervo_revisor` | Revisa base compilada (condicional) | synthesis |
| 5 | `pesquisador` | Pesquisa legislação e jurisprudência | reasoning |
| 6 | `jurista` | Desenvolve teses jurídicas | reasoning |
| 7 | `advogado_diabo` | Critica e identifica fraquezas | reasoning |
| 8 | `jurista_v2` | Refina teses pós-crítica | reasoning |
| 9 | `fact_checker` | Verifica citações legais | extraction |
| 10 | `moderador` | Planeja estrutura do documento | synthesis |
| 11 | `redator` | Redige documento final (12k tokens) | writing |

### Agentes do Caderno de Pesquisa (12)

**Grupo Pesquisa & Análise (6):**
- `notebook_pesquisador` — Indexa fontes, extrai informações
- `notebook_analista` — Sintetiza descobertas para guia
- `notebook_assistente` — Chat conversacional
- `notebook_pesquisador_externo` — Pesquisa externa web
- `notebook_pesquisador_externo_profundo` — Pesquisa externa profunda
- `notebook_pesquisador_jurisprudencia` — Pesquisa jurisprudência (DataJud/CNJ)
- `notebook_ranqueador_jurisprudencia` — Reclassifica e prioriza resultados jurisprudenciais

**Grupo Estúdio de Criação (5):**
- `studio_pesquisador` — Extrai dados relevantes das fontes
- `studio_escritor` — Redige textos, resumos, relatórios, flashcards, testes, guias
- `studio_roteirista` — Cria roteiros de áudio/vídeo com timing
- `studio_visual` — Estrutura apresentações, mapas mentais, infográficos, tabelas
- `studio_revisor` — Revisão e garantia de qualidade final

---

## Rotas da Aplicação

| Rota | Página | Guard |
|------|--------|-------|
| `/login` | Login | Público |
| `/register` | Cadastro | Público |
| `/forgot-password` | ForgotPassword | Público |
| `/reset-password` | ResetPassword | Público |
| `/` | Dashboard | Auth |
| `/documents` | Lista de documentos | Auth |
| `/documents/new` | Novo documento | Auth |
| `/documents/:id` | Detalhe do documento | Auth |
| `/documents/:id/edit` | Editor TipTap | Auth |
| `/upload` | Upload para acervo | Auth |
| `/theses` | Banco de teses | Auth |
| `/notebook` | Caderno de Pesquisa | Auth |
| `/settings` | Configurações pessoais | Auth |
| `/settings/costs` | Uso, custos e tokens do usuário | Auth |
| `/admin` | Painel administrativo da plataforma | Auth + admin |
| `/admin/costs` | Custos e tokens agregados da plataforma | Auth + admin |
| `/onboarding` | Wizard de perfil | Auth |
| `/profile` | Perfil profissional | Auth |
| `*` | 404 | — |

---

## Deploy

O deploy opera em trilhas complementares de CI/CD:

- **Push para `main`** — aciona `firebase-deploy.yml` (Firebase Hosting + rules + functions) e `test.yml`
- **Release one-shot** — `release-web.yml` orquestra quality gates + deploy Firebase + deploy Pages (e redesign V2 opcional)
- **GitHub Pages isolado** — `deploy-pages.yml` publica o espelho com `VITE_BASE_PATH=/Lexio/` usando artifact + `actions/deploy-pages`
- **Firebase Preview por PR** — `firebase-preview.yml` publica canal temporário por pull request

## Diretriz de Modularização

- Toda nova implementação deve seguir fronteiras modulares: núcleo compartilhado em `frontend/src/lib` e módulos/pipelines especializados em subdiretórios próprios.
- Código de negócio não pode depender de `components/`; componentes podem consumir módulos de `lib`, nunca o inverso.
- Novos pipelines devem nascer isolados por domínio, com seus próprios tipos, prompts, validadores e testes, evitando crescimento de arquivos monolíticos.
- Configurações, modelos e dados de referência devem ser carregados de fontes únicas de verdade por usuário, sem reintroduzir dependência runtime em configurações globais legadas.
- Refactors devem privilegiar extração incremental de módulos pequenos em vez de ampliar arquivos centrais já grandes.

Para deploy manual:
```bash
# Firebase Hosting + Firestore + Storage Rules
firebase deploy --only "hosting,firestore:rules,storage"

# GitHub Pages (via workflow dedicado)
gh workflow run deploy-pages.yml

# Release one-shot (Firebase + Pages, sem redesign V2)
gh workflow run release-web.yml -f deploy_firebase=true -f deploy_github_pages=true -f deploy_redesign_v2=false
```

---

## Firebase / Firestore

**Project ID:** `hocapp-44760`

### Coleções

| Caminho | Conteúdo |
|---------|----------|
| `/users/{uid}` | Perfil do usuário + role |
| `/users/{uid}/profile` | Anamnese Layer 1 |
| `/users/{uid}/settings/preferences` | API keys, catálogo de modelos, modelos por agente e metadados do usuário |
| `/users/{uid}/documents/{id}` | Documentos gerados + `llm_executions[]` |
| `/users/{uid}/theses/{id}` | Banco de teses |
| `/users/{uid}/thesis_analysis_sessions/{id}` | Histórico de execuções da análise de teses |
| `/users/{uid}/acervo/{id}` | Documentos de referência |
| `/users/{uid}/research_notebooks/{id}` | Cadernos de pesquisa |

### Regras de acesso

- Cada usuário lê e grava apenas seus próprios documentos, preferências, custos, tokens, catálogo e modelos.
- O catálogo de modelos é semeado no primeiro uso dentro de `/users/{uid}/settings/preferences` e, a partir daí, passa a reger os seletores e validações de agentes daquele usuário.
- Administradores têm leitura agregada dos dados operacionais para analytics da plataforma.
- Administradores não têm acesso às preferências privadas em `/users/{uid}/settings/preferences`.
- Mídias do caderno em `research_notebooks/{uid}/{notebookId}/{images|audios|videos}/...` usam Cloud Storage com regras por usuário autenticado.
- Artefatos de vídeo do caderno persistem estado compacto no Firestore e armazenam blobs grandes apenas no Cloud Storage para evitar estouro do limite de 1 MiB por documento.

---

## Para Agentes IA

O arquivo [.claude/CLAUDE.md](.claude/CLAUDE.md) contém o contexto completo e atualizado do projeto: stack, arquivos lib com descrições, coleções Firestore, definições de todos os agentes, tipos TypeScript chave, regras importantes e checklist de features implementadas.

**Leia `.claude/CLAUDE.md` antes de qualquer modificação neste repositório.**

---

## Segurança

Ver [SECURITY.md](SECURITY.md) para política de divulgação de vulnerabilidades.

- Chaves de API armazenadas nas configurações do próprio usuário, nunca em código
- Firebase Rules protegem todos os dados por `uid`
- Sem backend público exposto em produção
- Toda comunicação com OpenRouter usa HTTPS

---

## Licença

Uso privado. Todos os direitos reservados.

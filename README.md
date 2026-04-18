# Lexio — Produção Jurídica com IA

> SaaS brasileiro de produção jurídica com IA. 10 pipelines multi-agente, 58 agentes configuráveis, 40+ modelos. Roda 100% no browser via OpenRouter.

> Referência sincronizada com `main` em 18 de abril de 2026.

[![Deploy Pages](https://github.com/fsalamoni/Lexio/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/fsalamoni/Lexio/actions/workflows/deploy-pages.yml)
[![Firebase Deploy](https://github.com/fsalamoni/Lexio/actions/workflows/firebase-deploy.yml/badge.svg)](https://github.com/fsalamoni/Lexio/actions/workflows/firebase-deploy.yml)

---

## URLs de Produção

| Ambiente | URL |
|----------|-----|
| GitHub Pages | https://fsalamoni.github.io/Lexio/ |
| Firebase Hosting | https://lexio.web.app |
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
| Deploy | GitHub Pages + Firebase Hosting (dual) |
| CI/CD | GitHub Actions (4 workflows) |

> **Não há backend Python em produção.** A pasta `packages/` contém um backend FastAPI em desenvolvimento mas não está ativo. Toda a lógica LLM roda no frontend TypeScript.

---

## Funcionalidades

- **Geração de documentos jurídicos** — 11 agentes LLM em pipeline sequencial (3 condicionais); 10 tipos de documento; 17 áreas do direito
- **Acervo** — Upload de documentos de referência com classificação e ementa automática por IA (2 agentes dedicados)
- **Banco de Teses** — CRUD + extração automática + análise com pipeline de 5 agentes
- **Caderno de Pesquisa** — Chat com 7 agentes de pesquisa + Estúdio de Criação (13 tipos de artefato, pipeline de 5 agentes + renderização visual automática e geração de mídia internalizada)
- **Análise de acervo no caderno** — 4 agentes para análise de documentos do acervo dentro do caderno
- **Pipeline de Vídeo** — 11 agentes configuráveis para produção completa de vídeo (planejamento, clips, imagem, TTS → renderização)
- **Pipeline de Áudio** — 6 agentes para produção de podcasts e narrações com TTS e síntese literal internalizada
- **Pipeline de Apresentação** — 6 agentes para criação de apresentações profissionais com imagens de slides contextuais e exportação PPTX
- **Resiliência de mídia e LLM** — Pipelines de áudio, vídeo, apresentação e estúdio usam fallback automático de modelo em indisponibilidade/transientes, com avisos visíveis de degradação e incompatibilidade de capacidade
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
- **Dual deploy** — GitHub Pages (base `/Lexio/`) + Firebase Hosting (base `/`)

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
VITE_FIREBASE_AUTH_DOMAIN=your_site.web.app
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:abc123

# Opcional — fallback quando não há chave no Firestore
VITE_OPENROUTER_API_KEY=sk-or-v1-...

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
.github/workflows/ → deploy-pages.yml + firebase-deploy.yml + firebase-preview.yml + test.yml
docs/              → Documentação técnica arquitetural
```

---

## Workflow Operacional

### Fluxo recomendado de merge e release

1. Atualize sua branch a partir de `main` e rode os gates locais relevantes: `npm run typecheck`, `npx vitest run`, `npm run build`, `d:/Lexio/.venv/Scripts/python.exe -m pytest tests --tb=short -q` e `d:/Lexio/.venv/Scripts/python.exe -m ruff check packages tests`.
2. Abra PR para `main`. O workflow `.github/workflows/firebase-preview.yml` publica um preview temporário no Firebase e agora exige `typecheck`, `test` e `build` antes de comentar a URL.
3. Faça merge em `main` somente com a prévia validada. O workflow `.github/workflows/firebase-deploy.yml` roda `typecheck`, `test`, `build`, recompila `functions/`, sincroniza o segredo `DATAJUD_API_KEY` no Secret Manager e então publica Hosting, Rules, Indexes, Storage e Functions.
4. Se a versão espelho em GitHub Pages também precisar ser atualizada, dispare manualmente `.github/workflows/deploy-pages.yml`. Ele também executa `typecheck`, `test` e `build` antes do publish.

### Segredos operacionais mínimos

- `FIREBASE_TOKEN` ou `FIREBASE_SERVICE_ACCOUNT`
- `FIREBASE_API_KEY`
- `VITE_ADMIN_EMAIL`
- `DATAJUD_API_KEY` para a Cloud Function `datajudProxy`

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

### Agentes do Caderno de Pesquisa (11)

**Grupo Pesquisa & Análise (6):**
- `notebook_pesquisador` — Indexa fontes, extrai informações
- `notebook_analista` — Sintetiza descobertas para guia
- `notebook_assistente` — Chat conversacional
- `notebook_pesquisador_externo` — Pesquisa externa web
- `notebook_pesquisador_externo_profundo` — Pesquisa externa profunda
- `notebook_pesquisador_jurisprudencia` — Pesquisa jurisprudência (DataJud/CNJ)

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

O deploy é **totalmente automático** — qualquer push para `main` dispara as pipelines de CI/CD:

- **GitHub Pages** — usa `VITE_BASE_PATH=/Lexio/` (workflow `deploy-pages.yml`)
- **Firebase Hosting** — usa `VITE_BASE_PATH=/` (workflow `firebase-deploy.yml`, inclui deploy de Firestore rules e Storage rules)
- **Firebase Preview por PR** — publica canal temporário por pull request (workflow `firebase-preview.yml`)
- **Testes** — executa em push/PR (workflow `test.yml`)

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

# GitHub Pages (via workflow)
git push origin main
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

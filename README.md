# Lexio — Produção Jurídica com IA

> SaaS brasileiro de geração de documentos jurídicos usando pipelines multi-agente com LLM. Roda 100% no browser via OpenRouter.

[![Deploy Pages](https://github.com/fsalamoni/Lexio/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/fsalamoni/Lexio/actions/workflows/deploy-pages.yml)
[![Firebase Deploy](https://github.com/fsalamoni/Lexio/actions/workflows/firebase-deploy.yml/badge.svg)](https://github.com/fsalamoni/Lexio/actions/workflows/firebase-deploy.yml)

---

## URLs de Produção

| Ambiente | URL |
|----------|-----|
| GitHub Pages | https://fsalamoni.github.io/Lexio/ |
| Firebase Hosting | https://lexio.web.app |
| Dev local | http://localhost:3000 |

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite 5 + Tailwind CSS |
| Roteamento | React Router DOM 6 (SPA) |
| Auth | Firebase Auth (email/senha + Google OAuth) |
| Banco de dados | Firebase Firestore (NoSQL, real-time) |
| LLM | OpenRouter API — chamado diretamente do browser |
| Editor de texto | TipTap 3 (ProseMirror) |
| Export | `docx` lib (geração de DOCX client-side) |
| Charts | Recharts + D3 |
| Icons | Lucide React |
| Deploy | GitHub Pages + Firebase Hosting |
| CI/CD | GitHub Actions (push para `main` dispara ambos) |

> **Não há backend Python em produção.** A pasta `packages/` contém um backend FastAPI em desenvolvimento mas não está ativo. Toda a lógica LLM roda no frontend TypeScript.

---

## Funcionalidades

- **Geração de documentos jurídicos** — 9 agentes LLM em pipeline sequencial; 10 tipos de documento; 17 áreas do direito
- **Acervo** — Upload de documentos de referência com classificação e ementa automática por IA
- **Banco de Teses** — CRUD + extração automática + análise com pipeline de 5 agentes
- **Caderno de Pesquisa** — Chat com indexação de fontes + Estúdio de Criação (12 tipos de artefato, pipeline 3 agentes)
- **Anamnese 2 camadas** — Perfil profissional persistente (Layer 1) + contexto por geração (Layer 2)
- **Admin Panel** — Gestão de API keys, seleção de modelos por agente, catálogo dinâmico de modelos
- **Health check de modelos** — Verificação automática de disponibilidade contra OpenRouter
- **Analytics de custo** — Dashboard por modelo/função/provedor em USD e BRL
- **Export DOCX** — Times New Roman 12pt, A4, espaçamento 1.5, gerado no browser
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
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:abc123

# Opcional — fallback quando não há chave no Firestore
VITE_OPENROUTER_API_KEY=sk-or-v1-...

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
    api/           → Axios client com cache TTL + deduplificação de inflight
    components/    → Componentes UI reutilizáveis
    contexts/      → AuthContext (estado global de autenticação)
    data/          → Dados estáticos (seed de teses)
    demo/          → Mock interceptor para modo demo offline
    lib/           → TODA a lógica de negócio (LLM, Firestore, modelos, etc.)
    pages/         → Componentes de página por rota
  public/
  index.html
  vite.config.ts   → base: VITE_BASE_PATH · chunks: tiptap, recharts

packages/          → Backend Python (em desenvolvimento, não em produção)
  api/             → Gateway FastAPI
  core/            → Infraestrutura compartilhada
  pipeline/        → Orquestrador de pipeline genérico
  modules/         → Módulos independentes

.claude/           → CLAUDE.md — contexto completo para agentes IA
.github/workflows/ → deploy-pages.yml + firebase-deploy.yml
docs/              → Documentação técnica arquitetural
```

---

## Arquitetura de LLM

Toda chamada LLM usa `callLLM()` / `callLLMWithMessages()` de `lib/llm-client.ts`, que chama a OpenRouter API diretamente do browser. A chave de API do OpenRouter é buscada do Firestore (`/settings/platform`) e pode ser configurada no Admin Panel.

### Pipelines Ativos

| Pipeline | Agentes | Config Firestore |
|----------|---------|-----------------|
| Geração de documentos | 9 agentes sequenciais | `document_models` |
| Análise do banco de teses | 5 agentes | `thesis_analyst_models` |
| Estúdio do Caderno (artefatos) | 3 agentes (Pesquisador → Especialista → Revisor) | `research_notebook_models` |
| Analisador de acervo (Caderno) | 4 agentes | `notebook_acervo_models` |
| Classificador de acervo | 1 agente | `acervo_classificador_models` |
| Ementa de acervo | 1 agente | `acervo_ementa_models` |
| Context detail (Layer 2) | 1 agente | `context_detail_models` |

### Agentes do Caderno de Pesquisa (8 total)

**Grupo Pesquisa & Análise:**
- `notebook_pesquisador` — Indexa fontes, extrai informações
- `notebook_analista` — Sintetiza descobertas para guia
- `notebook_assistente` — Chat conversacional

**Grupo Estúdio de Criação (pipeline 3 etapas):**
- `studio_pesquisador` — Extrai dados relevantes das fontes
- `studio_escritor` — Redige textos, resumos, relatórios, cartões, testes
- `studio_roteirista` — Cria roteiros de áudio/vídeo com timing
- `studio_visual` — Estrutura apresentações, mapas mentais, infográficos
- `studio_revisor` — Revisão e garantia de qualidade final

---

## Rotas da Aplicação

| Rota | Página | Guard |
|------|--------|-------|
| `/login` | Login | Público |
| `/register` | Cadastro | Público |
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

## Deploy

O deploy é **totalmente automático** — qualquer push para `main` dispara ambas as pipelines de CI/CD em paralelo:

- **GitHub Pages** — usa `VITE_BASE_PATH=/Lexio/`
- **Firebase Hosting** — usa `VITE_BASE_PATH=/`

Para deploy manual:
```bash
# Firebase
firebase deploy --only hosting

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
| `/users/{uid}/documents/{id}` | Documentos gerados + `llm_executions[]` |
| `/users/{uid}/theses/{id}` | Banco de teses |
| `/users/{uid}/acervo/{id}` | Documentos de referência |
| `/users/{uid}/research_notebooks/{id}` | Cadernos de pesquisa |
| `/settings/platform` | Config global: api_keys, model configs, model_catalog |

---

## Para Agentes IA

O arquivo [.claude/CLAUDE.md](.claude/CLAUDE.md) contém o contexto completo e atualizado do projeto: stack, arquivos lib com descrições, coleções Firestore, definições de todos os agentes, tipos TypeScript chave, regras importantes e checklist de features implementadas.

**Leia `.claude/CLAUDE.md` antes de qualquer modificação neste repositório.**

---

## Segurança

Ver [SECURITY.md](SECURITY.md) para política de divulgação de vulnerabilidades.

- Chaves de API armazenadas no Firestore, nunca em código
- Firebase Rules protegem todos os dados por `uid`
- Sem backend público exposto em produção
- Toda comunicação com OpenRouter usa HTTPS

---

## Licença

Uso privado. Todos os direitos reservados.

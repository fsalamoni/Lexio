# Lexio — Referência Completa do Projeto

> Última atualização: 16 de abril de 2026

---

## Índice

1. [O que é](#o-que-é)
2. [Stack técnica](#stack-técnica)
3. [URLs de produção](#urls-de-produção)
4. [Comandos de desenvolvimento](#comandos-de-desenvolvimento)
5. [Variáveis de ambiente](#variáveis-de-ambiente)
6. [Estrutura de diretórios](#estrutura-de-diretórios)
7. [Rotas da aplicação](#rotas-da-aplicação)
8. [Catálogo de arquivos lib/](#catálogo-de-arquivos-lib)
9. [Componentes](#componentes)
10. [Páginas](#páginas)
11. [Pipelines e agentes — inventário completo](#pipelines-e-agentes)
12. [Tipos de documento](#tipos-de-documento)
13. [Áreas do direito](#áreas-do-direito)
14. [Naturezas](#naturezas)
15. [Tipos de artefato](#tipos-de-artefato)
16. [Modelos LLM](#modelos-llm)
17. [Firestore — coleções e tipos TypeScript](#firestore)
18. [Admin Panel — cartões de configuração](#admin-panel)
19. [Cloud Function](#cloud-function)
20. [Integrações externas](#integrações-externas)
21. [Contextos React](#contextos-react)
22. [Modo Demo](#modo-demo)
23. [CI/CD — workflows](#cicd)
24. [Segurança](#segurança)
25. [Regras para agentes IA](#regras-para-agentes-ia)
26. [Checklist de features implementadas](#checklist)

---

## 1. O que é {#o-que-é}

Lexio é um SaaS brasileiro de produção jurídica com IA. Roda **100% no browser** — toda a lógica LLM executa no frontend TypeScript via OpenRouter API. Firebase fornece auth, banco (Firestore) e hosting. Não há backend Python em produção (a pasta `packages/` contém um FastAPI em desenvolvimento, inativo).

---

## 2. Stack técnica {#stack-técnica}

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
| CI/CD | GitHub Actions (3 workflows) |

---

## 3. URLs de produção {#urls-de-produção}

| Ambiente | URL |
|----------|-----|
| GitHub Pages | `https://fsalamoni.github.io/Lexio/` |
| Firebase Hosting | `https://lexio.web.app` |
| Cloud Function | `https://southamerica-east1-hocapp-44760.cloudfunctions.net/datajudProxy` |
| Dev local | `http://localhost:3000` |

---

## 4. Comandos de desenvolvimento {#comandos-de-desenvolvimento}

```bash
cd frontend
npm install            # instalar dependências
npm run dev            # servidor dev (porta 3000)
npm run build          # build produção → dist/
npm run typecheck      # verificar erros TS sem buildar
npm run preview        # pré-visualizar build
```

---

## 5. Variáveis de ambiente {#variáveis-de-ambiente}

Arquivo: `frontend/.env.local`

| Variável | Descrição |
|----------|-----------|
| `VITE_BASE_PATH` | `/Lexio/` (GH Pages) ou `/` (Firebase/local) |
| `VITE_FIREBASE_API_KEY` | Chave da API Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | `hocapp-44760.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `hocapp-44760` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `hocapp-44760.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `143237037612` |
| `VITE_FIREBASE_APP_ID` | `1:143237037612:web:85bd9ddaf81973d5031b89` |
| `VITE_OPENROUTER_API_KEY` | Fallback quando não há chave no Firestore |
| `VITE_DEMO_MODE` | `true` para modo offline sem Firebase |

---

## 6. Estrutura de diretórios {#estrutura-de-diretórios}

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

.claude/           → Este arquivo (CLAUDE.md)
.github/workflows/ → deploy-pages.yml + firebase-deploy.yml + test.yml
docs/              → Documentação técnica
```

---

## 7. Rotas da aplicação {#rotas-da-aplicação}

| Rota | Página | Guard |
|------|--------|-------|
| `/login` | Login | Público |
| `/register` | Register | Público |
| `/forgot-password` | ForgotPassword | Público |
| `/reset-password` | ResetPassword | Público |
| `/` | Dashboard | Auth |
| `/documents` | DocumentList | Auth |
| `/documents/new` | NewDocument | Auth |
| `/documents/:id` | DocumentDetail | Auth |
| `/documents/:id/edit` | DocumentEditor | Auth |
| `/upload` | Upload | Auth |
| `/theses` | ThesisBank | Auth |
| `/notebook` | ResearchNotebook | Auth |
| `/settings` | AdminPanel (Configurações Pessoais) | Auth |
| `/settings/costs` | CostTokensPage | Auth |
| `/admin` | PlatformAdminPanel | Auth + admin |
| `/admin/costs` | PlatformCostsPage | Auth + admin |
| `/onboarding` | Onboarding | Auth |
| `/profile` | Profile | Auth |
| `*` | NotFound | — |

---

## 8. Catálogo de arquivos lib/ {#catálogo-de-arquivos-lib}

### Serviços de autenticação e configuração
| Arquivo | Descrição |
|---------|-----------|
| `auth-service.ts` | Firebase Auth (login, registro, Google OAuth, logout) |
| `firebase.ts` | Inicialização Firebase e credenciais |
| `settings-store.ts` | Estado UI do Admin de configurações |
| `constants.ts` | Labels compartilhados (tipos de doc, áreas, badges de cor) |

### Clientes LLM e modelos
| Arquivo | Descrição |
|---------|-----------|
| `llm-client.ts` | Chamadas LLM ao OpenRouter (fallbacks, retries e resolução de modelos confiáveis) |
| `model-config.ts` | Definições de agentes, opções de modelo, fit scores |
| `model-catalog.ts` | Gerenciamento do catálogo de modelos + bridge OpenRouter |
| `model-health-check.ts` | Verificação de disponibilidade de modelos |

### Pipelines de geração
| Arquivo | Descrição |
|---------|-----------|
| `generation-service.ts` | Orquestrador principal do pipeline multi-agente (doc generation) |
| `thesis-analyzer.ts` | Lógica de análise e clustering de teses (5 agentes) |
| `thesis-extractor.ts` | Extração de teses de documentos |
| `notebook-studio-pipeline.ts` | Pipeline de geração de artefatos do estúdio (3 etapas) |
| `notebook-audio-pipeline.ts` | Pipeline de geração de áudio/podcast |
| `notebook-acervo-analyzer.ts` | Análise de acervo para cadernos (4 agentes) |
| `video-generation-pipeline.ts` | Orquestração de geração de vídeo (8 agentes) |
| `literal-video-production.ts` | Renderização de vídeo com presets |

### Dados e classificação
| Arquivo | Descrição |
|---------|-----------|
| `classification-data.ts` | Árvore de classificação: natureza → área → assuntos → tipos |
| `document-structures.ts` | Templates markdown padrão por tipo de documento |
| `firestore-types.ts` | Interfaces TypeScript para todas as estruturas Firestore |
| `firestore-service.ts` | CRUD: perfis, documentos, teses, acervo, notebooks |

### Integrações externas
| Arquivo | Descrição |
|---------|-----------|
| `datajud-service.ts` | Integração DataJud/STF para pesquisa de jurisprudência com filtragem temática e ranking local |
| `web-search-service.ts` | Pesquisa web com estratégias DuckDuckGo/Jina, diagnósticos e fallbacks de deep search |
| `tts-client.ts` | Integração text-to-speech |
| `image-generation-client.ts` | Geração de imagens via OpenRouter |
| `external-video-provider.ts` | Integração de geração de vídeo externo |
| `media-rate-limiter.ts` | Rate limiting e retry para APIs de mídia |

### Utilitários
| Arquivo | Descrição |
|---------|-----------|
| `file-text-extractor.ts` | Extrai texto de arquivos (PDF, DOCX, TXT) |
| `docx-generator.ts` | Geração e download de DOCX |
| `notebook-media-storage.ts` | Armazenamento de artefatos de mídia em notebooks |
| `quality-evaluator.ts` | Scoring de qualidade de documentos (0-100) |
| `cost-analytics.ts` | Tracking de uso, custos, métricas |
| `time-format.ts` | Formatação de data/hora |
| `platform-skins.ts` | Definições de skins/temas visuais (6 temas) e aplicação de CSS custom properties |

### Testes
| Arquivo | Descrição |
|---------|-----------|
| `external-video-provider.test.ts` | Testes do provedor de vídeo |
| `web-search-service.test.ts` | Testes do serviço de pesquisa web |
| `datajud-service.test.ts` | Testes do serviço DataJud |

---

## 9. Componentes {#componentes}

### Componentes principais (32)

| # | Componente | Função |
|---|-----------|--------|
| 1 | `AcervoClassificadorConfigCard` | Config do agente classificador de acervo |
| 2 | `AcervoEmentaConfigCard` | Config do agente gerador de ementa |
| 3 | `AgentTrailProgressModal` | Modal de progresso das trilhas multi-agente |
| 4 | `AudioPipelineConfigCard` | Config do pipeline de áudio (6 agentes) |
| 5 | `ConfirmDialog` | Diálogo de confirmação genérico |
| 6 | `ContextDetailConfigCard` | Config do agente context detail (Layer 2) |
| 7 | `CostBreakdownModal` | Modal de detalhamento de custos |
| 8 | `DeepResearchModal` | Modal de pesquisa profunda |
| 9 | `DraggablePanel` | Painel arrastável |
| 10 | `ErrorBoundary` | Captura de erros React |
| 11 | `JurisprudenceConfigModal` | Config de pesquisa de jurisprudência |
| 12 | `Layout` | Layout principal com sidebar |
| 13 | `ModelCatalogCard` | Catálogo de modelos disponíveis |
| 14 | `ModelConfigCard` | Config de modelos por agente (documento) |
| 15 | `ModelSelectorModal` | Modal de seleção de modelo |
| 16 | `NotebookAcervoConfigCard` | Config do pipeline notebook acervo (4 agentes) |
| 17 | `NotificationBell` | Sino de notificações |
| 18 | `PipelineProgressPanel` | Painel de progresso do pipeline |
| 19 | `PresentationPipelineConfigCard` | Config do pipeline de apresentação (6 agentes) |
| 20 | `ProgressTracker` | Tracker genérico de progresso |
| 21 | `ResearchNotebookConfigCard` | Config dos agentes do caderno (11 agentes) |
| 22 | `RichTextEditor` | Editor TipTap rico |
| 23 | `SearchResultsModal` | Modal de resultados de pesquisa |
| 24 | `Sidebar` | Barra lateral de navegação |
| 25 | `Skeleton` | Placeholder de carregamento |
| 26 | `StatusBadge` | Badge de status |
| 27 | `TaskBar` | Barra de tarefas |
| 28 | `ThesisAnalysisCard` | Card de análise de tese |
| 29 | `ThesisAnalystConfigCard` | Config do pipeline analista de teses (5 agentes) |
| 30 | `Toast` | Notificação toast |
| 31 | `VideoGenerationCostModal` | Modal de custo de geração de vídeo |
| 32 | `VideoPipelineConfigCard` | Config do pipeline de vídeo (11 agentes) |
| 33 | `ThemeSkinSelector` | Seletor visual de skins/temas da plataforma |

### Componentes de artefato (15 — subdir `artifacts/`)

| # | Componente | Função |
|---|-----------|--------|
| 1 | `artifact-exporters.ts` | Utilitários de exportação |
| 2 | `artifact-parsers.ts` | Parse de JSON de artefato para modelos UI |
| 3 | `ArtifactViewerModal.tsx` | Modal principal do viewer |
| 4 | `AudioOverviewPlayer.tsx` | Player de áudio |
| 5 | `AudioScriptViewer.tsx` | Visualizador de script de áudio |
| 6 | `DataTableViewer.tsx` | Visualizador de dados tabulares |
| 7 | `FlashcardViewer.tsx` | UI de flashcards |
| 8 | `index.ts` | Barrel export |
| 9 | `InfographicRenderer.tsx` | Renderizador de infográficos |
| 10 | `MindMapViewer.tsx` | Visualizador de mapa mental |
| 11 | `PresentationViewer.tsx` | Viewer de apresentação de slides |
| 12 | `QuizPlayer.tsx` | Player de quiz |
| 13 | `ReportViewer.tsx` | Visualizador de relatório |
| 14 | `VideoScriptViewer.tsx` | Visualizador de script de vídeo |
| 15 | `VideoStudioEditor.tsx` | Editor/produtor de vídeo |

---

## 10. Páginas {#páginas}

### Páginas principais (15)
| Página | Rota | Função |
|--------|------|--------|
| `Dashboard` | `/` | Painel principal do usuário |
| `DocumentList` | `/documents` | Lista de documentos do usuário |
| `NewDocument` | `/documents/new` | Formulário de criação de documento |
| `DocumentDetail` | `/documents/:id` | Visualização de documento |
| `DocumentEditor` | `/documents/:id/edit` | Editor TipTap do documento |
| `Upload` | `/upload` | Upload de arquivos para acervo |
| `ThesisBank` | `/theses` | Banco de teses (CRUD) |
| `ResearchNotebook` | `/notebook` | Hub do caderno de pesquisa |
| `AdminPanel` | `/settings` | Configurações pessoais do usuário |
| `CostTokensPage` | `/settings/costs` | Uso, custos e tokens do usuário |
| `PlatformAdminPanel` | `/admin` | Painel admin com analytics agregados da plataforma |
| `PlatformCostsPage` | `/admin/costs` | Custos e tokens agregados da plataforma |
| `Onboarding` | `/onboarding` | Wizard de onboarding |
| `Profile` | `/profile` | Perfil profissional |
| `NotFound` | `*` | Página 404 |

### Páginas de autenticação (4)
`Login`, `Register`, `ForgotPassword`, `ResetPassword`

---

## 11. Pipelines e agentes — inventário completo {#pipelines-e-agentes}

### Total: 10 pipelines · 58 agentes

---

### Pipeline 1 — Geração de Documentos (10 agentes)
**Config Firestore:** `agent_models`
**Arquivo:** `generation-service.ts`

| # | Key | Label | Categoria | Tier |
|---|-----|-------|-----------|------|
| 1 | `triagem` | Triagem | extraction | fast |
| 2 | `acervo_buscador` | Buscador de Acervo | extraction | fast |
| 3 | `acervo_compilador` | Compilador de Base | synthesis | balanced |
| 4 | `acervo_revisor` | Revisor de Base | synthesis | balanced |
| 5 | `pesquisador` | Pesquisador | reasoning | balanced |
| 6 | `jurista` | Jurista | reasoning | balanced |
| 7 | `advogado_diabo` | Advogado do Diabo | reasoning | balanced |
| 8 | `jurista_v2` | Jurista (revisão) | reasoning | balanced |
| 9 | `fact_checker` | Fact-Checker | extraction | fast |
| 10 | `moderador` | Moderador | synthesis | balanced |
| 11 | `redator` | Redator | writing | balanced |

> Os agentes 2–4 (acervo) são **condicionais** — executam apenas se o usuário tem documentos no acervo.

---

### Pipeline 2 — Análise de Teses (5 agentes)
**Config Firestore:** `thesis_analyst_models`
**Arquivo:** `thesis-analyzer.ts`

| # | Key | Label | Categoria | Tier |
|---|-----|-------|-----------|------|
| 1 | `thesis_catalogador` | Catalogador | extraction | fast |
| 2 | `thesis_analista` | Analista de Redundâncias | reasoning | balanced |
| 3 | `thesis_compilador` | Compilador | synthesis | balanced |
| 4 | `thesis_curador` | Curador de Lacunas | synthesis | balanced |
| 5 | `thesis_revisor` | Revisor Final | synthesis | balanced |

---

### Pipeline 3 — Context Detail / Anamnese Layer 2 (1 agente)
**Config Firestore:** `context_detail_models`

| # | Key | Label | Categoria | Tier |
|---|-----|-------|-----------|------|
| 1 | `context_detail` | Context Detail | reasoning | balanced |

---

### Pipeline 4 — Classificador de Acervo (1 agente)
**Config Firestore:** `acervo_classificador_models`

| # | Key | Label | Categoria | Tier |
|---|-----|-------|-----------|------|
| 1 | `acervo_classificador` | Classificador de Acervo | extraction | fast |

---

### Pipeline 5 — Ementa de Acervo (1 agente)
**Config Firestore:** `acervo_ementa_models`

| # | Key | Label | Categoria | Tier |
|---|-----|-------|-----------|------|
| 1 | `acervo_ementa` | Gerador de Ementa | extraction | fast |

---

### Pipeline 6 — Caderno de Pesquisa (12 agentes)
**Config Firestore:** `research_notebook_models`
**Arquivo:** `notebook-studio-pipeline.ts`, `notebook-audio-pipeline.ts`

**Grupo Pesquisa & Análise (7):**

| # | Key | Label | Categoria | Tier |
|---|-----|-------|-----------|------|
| 1 | `notebook_pesquisador` | Pesquisador de Fontes | extraction | fast |
| 2 | `notebook_analista` | Analista de Conhecimento | reasoning | balanced |
| 3 | `notebook_assistente` | Assistente Conversacional | reasoning | balanced |
| 4 | `notebook_pesquisador_externo` | Pesquisador Externo | extraction | fast |
| 5 | `notebook_pesquisador_externo_profundo` | Pesquisador Externo Profundo | reasoning | balanced |
| 6 | `notebook_pesquisador_jurisprudencia` | Pesquisador de Jurisprudência (DataJud) | extraction | fast |
| 7 | `notebook_ranqueador_jurisprudencia` | Ranqueador de Jurisprudência | extraction | fast |

**Grupo Estúdio de Criação (5):**

| # | Key | Label | Categoria | Tier |
|---|-----|-------|-----------|------|
| 8 | `studio_pesquisador` | Pesquisador do Estúdio | extraction | fast |
| 9 | `studio_escritor` | Escritor | writing | balanced |
| 10 | `studio_roteirista` | Roteirista | writing | balanced |
| 11 | `studio_visual` | Designer Visual | synthesis | balanced |
| 12 | `studio_revisor` | Revisor de Qualidade | synthesis | fast |

**Roteamento de artefatos no Estúdio:**
- **Escritor** → resumo, relatório, documento, cartões didáticos, teste, guia estruturado
- **Roteirista** → audio_script, video_script
- **Designer Visual** → apresentação, mapa mental, infográfico, tabela de dados

---

### Pipeline 7 — Notebook Acervo Analyzer (4 agentes)
**Config Firestore:** `notebook_acervo_models`
**Arquivo:** `notebook-acervo-analyzer.ts`

| # | Key | Label | Categoria | Tier |
|---|-----|-------|-----------|------|
| 1 | `nb_acervo_triagem` | Triagem de Acervo | extraction | fast |
| 2 | `nb_acervo_buscador` | Buscador de Acervo | extraction | fast |
| 3 | `nb_acervo_analista` | Analista de Acervo | reasoning | balanced |
| 4 | `nb_acervo_curador` | Curador de Fontes | synthesis | balanced |

---

### Pipeline 8 — Vídeo (11 agentes)
**Config Firestore:** `video_pipeline_models`
**Arquivo:** `video-generation-pipeline.ts`

| # | Key | Label | Categoria | Tier |
|---|-----|-------|-----------|------|
| 1 | `video_planejador` | Planejador de Produção | reasoning | premium |
| 2 | `video_roteirista` | Roteirista | writing | premium |
| 3 | `video_diretor_cena` | Diretor de Cenas | synthesis | balanced |
| 4 | `video_storyboarder` | Storyboarder | writing | balanced |
| 5 | `video_designer` | Designer Visual | synthesis | premium |
| 6 | `video_compositor` | Compositor de Vídeo | synthesis | premium |
| 7 | `video_narrador` | Narrador | writing | balanced |
| 8 | `video_revisor` | Revisor Final de Vídeo | synthesis | balanced |
| 9 | `video_clip_planner` | Planejador de Clips | synthesis | balanced |
| 10 | `video_image_generator` | Gerador de Imagens | synthesis | balanced |
| 11 | `video_tts` | Narrador TTS | synthesis | premium |

---

### Pipeline 9 — Áudio (6 agentes)
**Config Firestore:** `audio_pipeline_models`
**Arquivo:** `notebook-audio-pipeline.ts`

| # | Key | Label | Categoria | Tier |
|---|-----|-------|-----------|------|
| 1 | `audio_planejador` | Planejador de Áudio | reasoning | balanced |
| 2 | `audio_roteirista` | Roteirista de Áudio | writing | balanced |
| 3 | `audio_diretor` | Diretor de Áudio | synthesis | balanced |
| 4 | `audio_produtor_sonoro` | Produtor Sonoro | writing | balanced |
| 5 | `audio_narrador` | Narrador / TTS | synthesis | premium |
| 6 | `audio_revisor` | Revisor Final de Áudio | synthesis | balanced |

---

### Pipeline 10 — Apresentação (6 agentes)
**Config Firestore:** `presentation_pipeline_models`
**Arquivo:** `model-config.ts`

| # | Key | Label | Categoria | Tier |
|---|-----|-------|-----------|------|
| 1 | `pres_planejador` | Planejador de Apresentação | reasoning | balanced |
| 2 | `pres_pesquisador` | Pesquisador de Conteúdo | extraction | fast |
| 3 | `pres_redator` | Redator de Slides | writing | balanced |
| 4 | `pres_designer` | Designer de Apresentação | synthesis | premium |
| 5 | `pres_image_generator` | Gerador de Imagens de Slides | synthesis | balanced |
| 6 | `pres_revisor` | Revisor de Apresentação | synthesis | fast |

---

### Resumo de agentes por pipeline

| Pipeline | Agentes | Config Firestore |
|----------|---------|-----------------|
| Geração de documentos | 11 (3 condicionais) | `agent_models` |
| Análise de teses | 5 | `thesis_analyst_models` |
| Context detail | 1 | `context_detail_models` |
| Classificador acervo | 1 | `acervo_classificador_models` |
| Ementa acervo | 1 | `acervo_ementa_models` |
| Caderno de pesquisa | 12 (7 pesquisa + 5 estúdio) | `research_notebook_models` |
| Notebook acervo | 4 | `notebook_acervo_models` |
| Vídeo | 11 | `video_pipeline_models` |
| Áudio | 6 | `audio_pipeline_models` |
| Apresentação | 6 | `presentation_pipeline_models` |
| **TOTAL** | **58 agentes únicos** | **10 configs** |

---

## 12. Tipos de documento {#tipos-de-documento}

### 10 tipos

| ID | Label |
|----|-------|
| `parecer` | Parecer Jurídico |
| `peticao_inicial` | Petição Inicial |
| `contestacao` | Contestação |
| `recurso` | Recurso |
| `sentenca` | Sentença |
| `acao_civil_publica` | Ação Civil Pública |
| `mandado_seguranca` | Mandado de Segurança |
| `habeas_corpus` | Habeas Corpus |
| `agravo` | Agravo de Instrumento |
| `embargos_declaracao` | Embargos de Declaração |

Cada tipo tem template markdown em `document-structures.ts` com hierarquia de seções, requisitos mínimos de conteúdo e camadas de citação.

---

## 13. Áreas do direito {#áreas-do-direito}

### 17 áreas

| ID | Label | Cor |
|----|-------|-----|
| `administrative` | Direito Administrativo | purple |
| `constitutional` | Direito Constitucional | red |
| `civil` | Direito Civil | blue |
| `tax` | Direito Tributário | orange |
| `labor` | Direito do Trabalho | teal |
| `criminal` | Direito Penal | rose |
| `criminal_procedure` | Processo Penal | pink |
| `civil_procedure` | Processo Civil | sky |
| `consumer` | Direito do Consumidor | amber |
| `environmental` | Direito Ambiental | emerald |
| `business` | Direito Empresarial | indigo |
| `family` | Direito de Família | fuchsia |
| `inheritance` | Direito das Sucessões | violet |
| `social_security` | Direito Previdenciário | cyan |
| `electoral` | Direito Eleitoral | lime |
| `international` | Direito Internacional | slate |
| `digital` | Direito Digital | zinc |

---

## 14. Naturezas {#naturezas}

### 6 valores

| ID | Descrição |
|----|-----------|
| `consultivo` | Consultivo/parecerista |
| `executorio` | Processual/executório |
| `transacional` | Transacional/contratual |
| `negocial` | Negocial/comercial |
| `doutrinario` | Doutrinário/acadêmico |
| `decisorio` | Decisório/judicial |

---

## 15. Tipos de artefato {#tipos-de-artefato}

### 13 tipos (`StudioArtifactType`)

| ID | Label | Agente |
|----|-------|--------|
| `resumo` | Resumo | studio_escritor |
| `apresentacao` | Apresentação | studio_visual |
| `mapa_mental` | Mapa Mental | studio_visual |
| `cartoes_didaticos` | Flashcards | studio_escritor |
| `infografico` | Infográfico | studio_visual |
| `teste` | Quiz | studio_escritor |
| `relatorio` | Relatório | studio_escritor |
| `tabela_dados` | Tabela de Dados | studio_visual |
| `documento` | Documento | studio_escritor |
| `audio_script` | Roteiro de Áudio | studio_roteirista |
| `video_script` | Roteiro de Vídeo | studio_roteirista |
| `guia_estruturado` | Guia Estruturado | studio_escritor |
| `outro` | Outro | studio_escritor |

---

## 16. Modelos LLM {#modelos-llm}

### Tiers de modelo

| Tier | Uso | Exemplos |
|------|-----|----------|
| `fast` | Extração/triagem | Haiku, Flash Lite, GPT-4o Mini |
| `balanced` | Raciocínio/síntese | Sonnet, Gemini 2.5, GPT-4o |
| `premium` | Raciocínio complexo | Opus 4, Gemini 2.5 Pro, GPT-4.1, o3 |

### Catálogo — Modelos Pagos (26+)

**Anthropic (5):** claude-3.5-haiku, claude-sonnet-4, claude-3.5-sonnet, claude-3.7-sonnet, claude-opus-4
**Google (4):** gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-flash-preview, gemini-2.5-pro-preview
**OpenAI (8):** gpt-4o-mini, gpt-4.1-nano, gpt-4.1-mini, gpt-4o, gpt-4.1, o3-mini, o4-mini, o3
**DeepSeek (2):** deepseek-chat-v3-0324, deepseek-r1
**Meta (3):** llama-4-scout, llama-4-maverick, llama-3.3-70b-instruct
**Mistral (2):** mistral-small-3.1-24b-instruct, mistral-large-2411
**Qwen (3):** qwen-2.5-72b-instruct, qwen3-235b-a22b, qwen3-30b-a3b
**xAI (2):** grok-3-mini, grok-3
**Cohere (1):** command-r-plus-08-2024

### Catálogo — Modelos Gratuitos (10)

gemini-2.5-flash-lite:free, gemma-3-27b-it:free, llama-4-scout:free, llama-3.3-70b-instruct:free, deepseek-r1:free, qwen3-8b:free, qwen3-30b-a3b:free, mistral-small-3.1-24b-instruct:free, phi-4-multimodal-instruct:free

### Fit Scores

Cada modelo tem pontuação 1-10 para 4 categorias de agente:
- **extraction** (Triagem, Buscador, Fact-Checker)
- **synthesis** (Compilador, Revisor, Moderador)
- **reasoning** (Pesquisador, Jurista, Advogado Diabo)
- **writing** (Redator)

---

## 17. Firestore — coleções e tipos TypeScript {#firestore}

### Coleções

| Caminho | Conteúdo |
|---------|----------|
| `/users/{uid}` | Perfil do usuário + role |
| `/users/{uid}/profile/data` | Anamnese Layer 1 (perfil profissional) |
| `/users/{uid}/settings/preferences` | Configurações persistentes do usuário |
| `/users/{uid}/documents/{id}` | Documentos gerados + `llm_executions[]` |
| `/users/{uid}/theses/{id}` | Banco de teses |
| `/users/{uid}/thesis_analysis_sessions/{id}` | Sessões históricas de análise de teses |
| `/users/{uid}/acervo/{id}` | Documentos de referência (classificados) |
| `/users/{uid}/research_notebooks/{id}` | Cadernos de pesquisa |
| `/settings/platform` | Config global legada usada apenas como origem de migração |

### Subchaves de `/users/{uid}/settings/preferences`

| Chave | Conteúdo |
|-------|----------|
| `api_keys.openrouter_api_key` | Chave API OpenRouter do usuário |
| `api_keys.datajud_api_key` | Chave DataJud do usuário |
| `model_catalog` | Catálogo dinâmico pessoal do usuário, persistido e usado como fonte de verdade para seletores e validações |
| `agent_models` | Config do pipeline de documentos |
| `thesis_analyst_models` | Config do pipeline de teses |
| `context_detail_models` | Config do context detail |
| `acervo_classificador_models` | Config do classificador de acervo |
| `acervo_ementa_models` | Config do gerador de ementas |
| `research_notebook_models` | Config do caderno de pesquisa |
| `notebook_acervo_models` | Config do notebook acervo analyzer |
| `video_pipeline_models` | Config do pipeline de vídeo |
| `audio_pipeline_models` | Config do pipeline de áudio |
| `presentation_pipeline_models` | Config do pipeline de apresentação |
| `document_types` | Tipos de documento customizados do usuário |
| `legal_areas` | Áreas do direito customizadas do usuário |
| `classification_tipos` | Tipos por classificação do usuário |
| `legacy_migrated_at` | Timestamp da migração única das configs legadas |

### Tipos TypeScript de interfaces (`firestore-types.ts`)

| Tipo | Descrição |
|------|-----------|
| `ProfileData` | Perfil profissional + preferências |
| `ContextDetailData` | Contexto refinado Q&A (Layer 2) |
| `DocumentData` | Documento jurídico gerado |
| `ThesisData` | Tese jurídica (banco) |
| `ThesisAnalysisSessionData` | Sessão de análise batch |
| `AcervoDocumentData` | Metadados de documento de referência |
| `NotebookSource` | Fonte do caderno (tipo: acervo/upload/link/external/external_deep/jurisprudencia) |
| `NotebookMessage` | Mensagem de chat no caderno |
| `StudioArtifact` | Artefato gerado (13 tipos) |
| `ResearchNotebookData` | Caderno de pesquisa completo |
| `WizardData` | Estado do wizard de onboarding |
| `AdminDocumentType` | Tipo de documento gerenciado pelo admin |
| `AdminLegalArea` | Área do direito gerenciada pelo admin |
| `AdminClassificationTipos` | Árvore de classificação gerenciada pelo admin |

---

## 18. Admin Panel — cartões de configuração {#admin-panel}

### Configurações pessoais (`/settings`)
1. **API Keys** — Chaves persistidas no perfil do usuário
2. **Catálogo de Modelos** — Catálogo pessoal do usuário, persistido em Firestore e base única para os modelos disponíveis nos seletores
3. **Config de Modelos (Documentos)** — Config dos 11 agentes do pipeline principal
4. **Analista de Teses** — Config dos 5 agentes
5. **Context Detail** — Config do agente de contexto
6. **Classificador de Acervo** — Config do agente classificador
7. **Gerador de Ementa** — Config do agente de ementas
8. **Caderno de Pesquisa** — Config dos 12 agentes do caderno
9. **Notebook Acervo** — Config dos 4 agentes de análise de acervo
10. **Pipeline de Vídeo** — Config dos 11 agentes de vídeo
11. **Pipeline de Áudio** — Config dos 6 agentes de áudio
12. **Pipeline de Apresentação** — Config dos 6 agentes de apresentação
13. **Fila de Revisão** — Itens do próprio usuário em revisão

### Administração da plataforma (`/admin`)
1. **Visão geral agregada** — Usuários, documentos, teses, acervo, cadernos, artefatos e qualidade média
2. **Uso por dia** — Séries agregadas de atividade, chamadas, tokens e custo
3. **Top modelos, agentes, provedores e funções** — Consumo agregado sem expor preferências privadas
4. **Custos da plataforma (`/admin/costs`)** — Breakdown agregado por provedor, modelo, função, fase, agente e tipo de documento

---

## 19. Cloud Function {#cloud-function}

**Nome:** `datajudProxy`
**Geração:** 2nd Gen
**Runtime:** Node.js 22
**Região:** `southamerica-east1`
**Service Account:** `hocapp-44760@appspot.gserviceaccount.com`
**URL:** `https://southamerica-east1-hocapp-44760.cloudfunctions.net/datajudProxy`

**Função:** Proxy POST para a API DataJud do CNJ. Adiciona header de Authorization (bypass CORS), valida aliases de tribunais (whitelist 50+ tribunais brasileiros) e retorna resultados Elasticsearch.

**Observação operacional:** A pesquisa jurisprudencial no frontend também pode complementar resultados com scraping estruturado do STF e reclassificação local por área do direito quando a resposta do DataJud vier ruidosa ou incompleta.

**Arquivo:** `functions/src/index.ts`

---

## 20. Integrações externas {#integrações-externas}

| Serviço | Uso | Arquivo |
|---------|-----|---------|
| OpenRouter | Roteamento LLM com fallback automático para modelos confiáveis | `llm-client.ts` |
| Firebase | Auth, Firestore, Storage, Functions | `firebase.ts` |
| DataJud (CNJ) | Pesquisa de jurisprudência primária | `datajud-service.ts` |
| STF | Busca complementar de jurisprudência por scraping estruturado | `datajud-service.ts` |
| DuckDuckGo | Pesquisa web | `web-search-service.ts` |
| Jina | Scraping/extração de conteúdo web e fallback de pesquisa profunda | `web-search-service.ts` |
| OpenRouter TTS | Text-to-speech via chat completions com áudio em streaming | `tts-client.ts` |
| OpenRouter Images | Geração de imagens | `image-generation-client.ts` |

---

## 21. Contextos React {#contextos-react}

| Contexto | Arquivo | Conteúdo |
|----------|---------|----------|
| `AuthContext` | `contexts/AuthContext.tsx` | token JWT, user, role (admin/user), loading state |
| `TaskManagerContext` | `contexts/TaskManagerContext.tsx` | Estado de tarefas/jobs em andamento |

---

## 22. Modo Demo {#modo-demo}

**Variável:** `VITE_DEMO_MODE=true`
**Arquivos:** `demo/data.ts` + `demo/interceptor.ts`

Interceptor Axios substitui todas as respostas de API com dados mock. Permite uso offline completo sem Firebase configurado. Mock data inclui: stats, documents, agents, costs, health.

---

## 23. CI/CD — workflows {#cicd}

### 3 workflows em `.github/workflows/`

| Workflow | Trigger | Ação |
|----------|---------|------|
| `deploy-pages.yml` | Push para `main` | Build + deploy GitHub Pages (`VITE_BASE_PATH=/Lexio/`) |
| `firebase-deploy.yml` | Push para `main` ou `claude/*` | Build + deploy Firebase Hosting + Firestore rules + Storage rules |
| `test.yml` | Push/PR | Executa testes |

---

## 24. Segurança {#segurança}

- Chaves API armazenadas nas configurações do próprio usuário, nunca em código
- Firebase Rules protegem todos os dados por `uid`
- Cloud Storage usa regras dedicadas para mídia persistida dos cadernos de pesquisa
- Admin pode ler subcoleções operacionais para analytics agregados, mas não lê `/users/{uid}/settings/preferences`
- CSP restritivo com whitelist de domínios
- Sem backend público exposto em produção
- Toda comunicação com OpenRouter usa HTTPS
- Cloud Function usa Service Account dedicado
- Ver `SECURITY.md` para política de divulgação

---

## 25. Regras para agentes IA {#regras-para-agentes-ia}

1. **Leia este arquivo inteiro** antes de qualquer modificação.
2. Toda chamada LLM deve passar por `callLLM()` / `callLLMWithMessages()` de `llm-client.ts`.
3. Novos agentes devem ser adicionados ao array `*_AGENT_DEFS` correspondente em `model-config.ts`.
4. Para novo pipeline, criar: definição de agentes em `model-config.ts` + Config Card em `components/` + entrada em `Configurações` e, se houver visão global, também no painel `/admin`.
5. Tipos TypeScript de Firestore ficam em `firestore-types.ts`. Sempre atualizar ao modificar coleções.
6. Novas rotas devem ser registradas em `App.tsx` e protegidas com `ProtectedRoute` ou `AdminRoute`.
7. Não criar backend — toda lógica roda no frontend TypeScript.
8. Export DOCX mantém formato padrão: Times New Roman 12pt, A4, espaçamento 1.5.
9. Novos tipos de documento devem ter template em `document-structures.ts`.
10. Commit messages: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.
11. O `VITE_BASE_PATH` deve funcionar tanto como `/Lexio/` quanto `/`.
12. Manter modo demo funcional — atualizar `demo/data.ts` se adicionar novas rotas de API.
13. Configurações pessoais devem persistir em `/users/{uid}/settings/preferences`; não reintroduzir dependência runtime em `/settings/platform`.
14. Toda nova implementação deve nascer modularizada: núcleo compartilhado em `lib/`, módulos de domínio/pipeline isolados, e nunca criar dependência de `lib` para `components`.

---

## 26. Checklist de features implementadas {#checklist}

- [x] Geração de documentos jurídicos (11 agentes, 10 tipos, 17 áreas)
- [x] Acervo com classificação automática e ementa por IA
- [x] Banco de teses (CRUD + extração automática + análise com 5 agentes)
- [x] Caderno de pesquisa (chat + 12 agentes + estúdio de 13 artefatos)
- [x] Análise de acervo no caderno (4 agentes)
- [x] Pipeline de vídeo completo (11 agentes configuráveis + renderização)
- [x] Pipeline de áudio/podcast (6 agentes + TTS)
- [x] Pipeline de apresentação (6 agentes)
- [x] Anamnese 2 camadas (perfil persistente + contexto por geração)
- [x] Context Detail (Layer 2) com agente dedicado
- [x] Admin Panel com 18 cartões de configuração
- [x] Catálogo dinâmico de modelos com health check
- [x] Analytics de custo por modelo/função/provedor (USD + BRL)
- [x] Export DOCX formatado (Times New Roman 12pt, A4)
- [x] Export PPTX para apresentações com slides renderizados
- [x] Pesquisa web (Jina + DuckDuckGo com fallbacks e diagnósticos)
- [x] Pesquisa de jurisprudência (DataJud via Cloud Function + complemento STF)
- [x] Modo Demo offline completo
- [x] Dual deploy (GitHub Pages + Firebase Hosting)
- [x] TipTap rich text editor com formatação completa
- [x] Onboarding wizard para perfil profissional
- [x] Extração de texto de PDF/DOCX/TXT no browser
- [x] Geração de imagens via OpenRouter
- [x] Pesquisa externa profunda no caderno

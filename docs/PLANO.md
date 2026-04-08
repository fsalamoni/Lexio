# Lexio — Plano de Desenvolvimento e Rastreabilidade

> **Índice versionável de features, epics, estado de implementação e mapeamento de arquivos.**
> Atualizado a cada ciclo de implementação. Serve como memória persistente de produto para agentes IA e equipe.

---

## Como usar este documento

- Consulte antes de implementar: verifique o estado atual da feature
- Atualize após implementar: marque como `✅`, `⚠️ parcial` ou `❌ ausente`
- Use as seções **Arquivos** para localizar código relevante rapidamente
- Use as seções **Riscos** para antecipar pontos frágeis antes de alterar

---

## Estado geral do produto (snapshot atual)

| Área | Estado | Observações |
|------|--------|-------------|
| Caderno de Pesquisa (Notebook) | ✅ Implementado | Fontes, chat, estúdio, artefatos, deep-link |
| Pesquisa de Jurisprudência (DataJud) | ✅ Implementado | Ementa + inteiro teor + results_raw + ProcessCard viewer |
| Visualizador de Documentos (Fontes) | ✅ Implementado | Jurisprudência: Síntese + Processos tabs; Acervo: seções estruturadas |
| Visualizador de Artefatos (Estúdio) | ✅ Implementado | `documento` tipo: page-canvas layout; outros: ReportViewer |
| Geração de Documentos (Estúdio) | ✅ Implementado | Pipeline completo; prompts aprofundados; persiste em Documentos |
| Página de Documentos | ✅ Implementado | Lista, filtros, bulk ops; filtro "Do Caderno"; badge Caderno linka notebook |
| Novo Documento | ✅ Implementado | Fluxo completo |
| Banco de Teses | ✅ Implementado | CRUD completo |
| Acervo | ✅ Implementado | Upload, indexação, classificação, ementa automática |
| Pesquisa Web Externa | ✅ Implementado | Agentes + deep search |
| Banco de Teses do STF/STJ | ✅ Implementado | Pesquisador externo |
| Painel Admin | ✅ Implementado | Modelos, custos, configurações |
| Autenticação | ✅ Implementado | Firebase Auth + onboarding |
| Exportação DOCX | ✅ Implementado | Backend Python via docx_generator |

---

## Epic 1: Sistema de Pesquisa de Jurisprudência

### Feature 1.1: DataJud — ementa integral e inteiro teor

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Retornar ementa completa e inteiro teor das decisões quando disponíveis na API pública DataJud (CNJ).

**Arquivos afetados:**
- `frontend/src/lib/datajud-service.ts` — interface `DataJudResult`, `parseDataJudHit`, `formatDataJudResults`
- `frontend/src/lib/datajud-service.test.ts` — testes unitários

**Mudanças implementadas:**
- Adicionado `ementa?: string` e `inteiroTeor?: string` a `DataJudResult`
- `parseDataJudHit` agora extrai `src.ementa` (string) e `src.inteiro_teor` (string) do `_source` da API Elasticsearch
- `formatDataJudResults` inclui ementa e trecho do inteiro teor quando disponíveis
- Testes atualizados para cobrir novos campos

**Dependências:** API pública DataJud (CNJ) — endpoint `api-publica.datajud.cnj.jus.br`

**Riscos:**
- A API CNJ nem sempre retorna ementa/inteiro_teor para todos os processos (dados incompletos)
- Implementação deve ter fallback gracioso quando campos ausentes

---

### Feature 1.2: Jurisprudência — results_raw + ProcessCard viewer

**Estado:** ✅ Implementado (ciclo 2026-04 sessão 2)

**Objetivo:** Armazenar os resultados brutos do DataJud na fonte (results_raw) para exibição individual de cada processo com ementa e inteiro teor na aba "Processos" do viewer.

**Arquivos afetados:**
- `frontend/src/lib/firestore-types.ts` — `results_raw?: string` em `NotebookSource`
- `frontend/src/pages/ResearchNotebook.tsx` — store top-10 results como JSON em `results_raw`
- `frontend/src/lib/firestore-service.ts` — `fitSourcesToFirestoreLimit` strips `results_raw` first
- `frontend/src/components/SourceContentViewer.tsx` — `ProcessCard` + tabs Síntese/Processos

**Mudanças implementadas:**
- `NotebookSource.results_raw` armazena JSON de até 10 `DataJudResult[]` (inteiroTeor max 8 KB cada)
- `fitSourcesToFirestoreLimit` remove `results_raw` antes de truncar texto quando próximo do limite 1 MB
- `SourceContentViewer` mostra tabs "Síntese" + "Processos" quando `results_raw` presente
- `ProcessCard` exibe ementa, inteiro teor expandíveis, assuntos, tribunal, classe, data

---

### Feature 1.3: Busca híbrida (semântica + lexical)

**Estado:** ❌ Não implementado

**Objetivo:** Combinar busca Elasticsearch com scoring semântico por embeddings.

**Arquivos a afetar:** `frontend/src/lib/datajud-service.ts`, novo serviço de embeddings

**Dependências:** Serviço de embeddings (OpenAI/OpenRouter), armazenamento de índice vetorial

---

### Feature 1.4: Reranking jurídico por relevância

**Estado:** ⚠️ Parcial — agente `notebook_ranqueador_jurisprudencia` existe (skip gracioso se sem modelo)

**Objetivo:** Reordenar resultados por relevância temática, hierarquia de tribunal, atualidade.

**Arquivos afetados:**
- `frontend/src/pages/ResearchNotebook.tsx` — pipeline 5 etapas (query→filter→rank→analyze→synthesize)
- `frontend/src/lib/model-config.ts` — `notebook_ranqueador_jurisprudencia`

---

### Feature 1.5: Filtros estruturados avançados

**Estado:** ✅ Implementado

**Arquivos:** `frontend/src/components/JurisprudenceConfigModal.tsx`, `frontend/src/lib/datajud-service.ts`

---

## Epic 2: Visualizador Documental

### Feature 2.1: SourceContentViewer — renderização jurídica rica + tabs Síntese/Processos

**Estado:** ✅ Implementado (ciclo 2026-04 sessão 2)

**Objetivo:** Transformar exibição de JSON cru/texto plano em visualização documental de alta qualidade. Tabs Síntese + Processos para jurisprudência.

**Arquivos afetados:**
- `frontend/src/components/SourceContentViewer.tsx` — componente principal com ProcessCard
- `frontend/src/lib/datajud-service.ts` — campos ementa/inteiro_teor nos resultados
- `frontend/src/lib/firestore-types.ts` — `results_raw` em `NotebookSource`

**Mudanças implementadas:**
- Detecção de fontes jurídicas (DataJud/jurisprudência)
- Tabs "Síntese" + "Processos" com contador de processos
- `ProcessCard`: ementa e inteiro teor expansíveis, assuntos, tribunal, data, número do processo
- Renderização da síntese do LLM em seções Markdown estruturadas
- Fallback seguro para documentos genéricos

---

### Feature 2.2: ReportViewer — page-canvas layout para `documento`

**Estado:** ✅ Implementado (ciclo 2026-04 sessão 2)

**Objetivo:** Artefatos do tipo `documento` renderizados em layout de folha A4 (branco sobre cinza) simulando documento real.

**Arquivos afetados:**
- `frontend/src/components/artifacts/ReportViewer.tsx` — prop `pageMode?: boolean`
- `frontend/src/components/artifacts/ArtifactViewerModal.tsx` — passa `pageMode={artifact.type === 'documento'}`

**Mudanças implementadas:**
- `ReportViewer` aceita `pageMode` que envolve o conteúdo em `bg-gray-200 + bg-white shadow-lg`
- `ArtifactViewerModal` detecta `artifact.type === 'documento'` e ativa pageMode

---

### Feature 2.3: ArtifactViewerModal — parser Markdown aprimorado

**Estado:** ⚠️ Parcial — parser regex básico, sem syntax highlight

**Arquivos:** `frontend/src/components/artifacts/ArtifactViewerModal.tsx`

---

## Epic 3: Estúdio do Caderno — Qualidade de Geração

### Feature 3.1: Prompts aprofundados para documentos jurídicos

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Aumentar profundidade analítica, exigir maior completude, melhorar estrutura jurídica dos artefatos gerados.

**Arquivos afetados:**
- `frontend/src/lib/notebook-studio-pipeline.ts` — `getSpecialistInstructions`, `buildReviewPrompt`, `buildResearchPrompt`

**Mudanças implementadas:**
- Prompt `documento` agora diferencia tipo jurídico do técnico com estrutura mais completa
- Mínimo de palavras exigido por tipo de artefato
- Critérios explícitos de qualidade jurídica no revisor
- Instruções para citar jurisprudência quando disponível nas fontes
- `resumo` e `relatorio` com exigência de fundamentação jurídica

---

### Feature 3.2: Diferenciação de prompts por área jurídica

**Estado:** ❌ Não implementado

**Objetivo:** Adaptar prompts de acordo com área do direito (civil, penal, trabalhista, etc.)

---

## Epic 4: Integração Caderno ↔ Documentos

### Feature 4.1: Documentos do estúdio → página Documentos

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Artefatos do tipo `documento` gerados no estúdio do Caderno são persistidos como `DocumentData` em Firestore e listados na página Documentos.

**Arquivos afetados:**
- `frontend/src/lib/firestore-service.ts` — nova função `saveNotebookDocumentToDocuments`
- `frontend/src/lib/firestore-types.ts` — campo `notebook_id` e `origem: 'caderno'` em `DocumentData`
- `frontend/src/pages/ResearchNotebook.tsx` — chama `saveNotebookDocumentToDocuments` ao criar artefato tipo `documento`
- `frontend/src/pages/DocumentList.tsx` — exibe `origem: 'caderno'` com badge indicativo

**Mudanças implementadas:**
- `DocumentData.origem` aceita agora `'caderno'` além de `'web'`
- `DocumentData.notebook_id` campo opcional para rastreabilidade
- Ao gerar artefato `documento` no estúdio, o usuário recebe opção de salvar na página Documentos
- Badge "Caderno" visível na listagem de documentos

---

### Feature 4.2: Unificação do documento formal com Novo Documento

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** O artefato `documento` gerado no estúdio deve ser equivalente ao Novo Documento em qualidade e persistência.

**Arquivos afetados:**
- `frontend/src/lib/notebook-studio-pipeline.ts`
- `frontend/src/lib/firestore-service.ts`

---

### Feature 4.3: Filtro "Do Caderno" + deep-link notebook

**Estado:** ✅ Implementado (ciclo 2026-04 sessão 2)

**Objetivo:** Permitir filtrar documentos por origem "caderno" e navegar diretamente para o caderno de origem.

**Arquivos afetados:**
- `frontend/src/pages/DocumentList.tsx` — chip "Do Caderno", badge Caderno como `<Link>` para `/notebook?open=<id>`
- `frontend/src/pages/ResearchNotebook.tsx` — suporte a `?open=<notebookId>` via `useSearchParams`

**Mudanças implementadas:**
- Chip "Do Caderno" filtra documentos por `origem === 'caderno'`
- Badge Caderno na listagem linka para `/notebook?open=<notebook_id>` quando `notebook_id` disponível
- `ResearchNotebook` lê `?open=<id>` e auto-abre o caderno correspondente após carregar a lista

---

## Epic 5: Infraestrutura de Qualidade

### Feature 5.1: Testes unitários — DataJud ementa/inteiro_teor

**Estado:** ✅ Implementado (ciclo 2026-04)

**Arquivos:** `frontend/src/lib/datajud-service.test.ts`

---

## Mapeamento de arquivos sensíveis (risco de regressão)

| Arquivo | Sensibilidade | Motivo |
|---------|--------------|--------|
| `frontend/src/lib/datajud-service.ts` | 🔴 Alta | API pública CNJ; múltiplos tribunais em paralelo; endpoint caching |
| `frontend/src/lib/firestore-service.ts` | 🔴 Alta | CRUD principal; erros causam perda de dados |
| `frontend/src/pages/ResearchNotebook.tsx` | 🔴 Alta | >4000 linhas; estado complexo; múltiplos pipelines |
| `frontend/src/lib/notebook-studio-pipeline.ts` | 🟡 Média | Prompts de geração; mudanças afetam qualidade de saída |
| `frontend/src/components/SourceContentViewer.tsx` | 🟡 Média | ProcessCard + tabs; fallback mantido |
| `frontend/src/components/artifacts/ArtifactViewerModal.tsx` | 🟡 Média | Modal principal de artefatos; múltiplos tipos |
| `frontend/src/components/artifacts/ReportViewer.tsx` | 🟢 Baixa | Viewer puro; pageMode é opt-in seguro |

---

## Lacunas de testes (conhecidas)

| Área | Tipo de teste faltando |
|------|----------------------|
| Jurisprudência — results_raw / ProcessCard | Teste de parseResultsRaw + renderização |
| Studio pipeline — qualidade de prompts | Testes de snapshot de prompts |
| firestore-service — saveNotebookDocument | Teste de integração mock Firestore |
| SourceContentViewer — renderização jurídica | Testes de renderização de componente |

---

## Convenções de desenvolvimento

- **Commits**: usar descrição clara no imperativo, ex: `Adiciona campo ementa ao DataJudResult`
- **Tipos TypeScript**: sempre atualizar interfaces antes de usar campos novos
- **Testes**: ao modificar funções puras (parse, format), sempre atualizar testes unitários
- **Segurança**: nunca adicionar HTML cru não sanitizado; usar `textContent` ou DOMPurify
- **Fallback**: toda feature nova deve ter comportamento seguro quando dados ausentes
- **Rastreabilidade**: ao implementar nova feature, atualizar este arquivo PLANO.md

---

## Roadmap de próximas features (backlog priorizado)

### Prioridade 1 — Alto impacto imediato
- [ ] Busca híbrida (semântica + lexical) para jurisprudência
- [ ] Exportação PDF nativa dos artefatos
- [ ] Preview de documento na página Documentos (modal inline)
- [x] Filtro por `origem: 'caderno'` na página Documentos ← implementado

### Prioridade 2 — Diferenciação de produto
- [ ] Pesquisa conversacional com contexto (memória multi-turno de filtros)
- [ ] Classificação temática de jurisprudência por área do direito
- [ ] Linha do tempo jurisprudencial (evolução de entendimento)
- [ ] Indicador "favorável / desfavorável / neutro" por resultado

### Prioridade 3 — Moat de produto
- [ ] Deduplicação e agrupamento de precedentes relacionados
- [ ] Comparação entre dois julgados ("diferencie estes precedentes")
- [ ] Pesquisa orientada à peça processual (cola petição → recebe jurisprudência relacionada)
- [ ] Analytics jurisprudencial por tema/período

---

*Última atualização: 2026-04-07 — Ciclo sessão 2: results_raw + ProcessCard tabs + page-canvas viewer + deep-link + filtro Caderno*

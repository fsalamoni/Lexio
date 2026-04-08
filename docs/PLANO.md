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
| Pesquisa de Jurisprudência (DataJud) | ✅ Implementado | Ementa + inteiro teor + results_raw por processo |
| Visualizador de Documentos | ✅ Implementado | Tabs Síntese+Processos (jurisprudência), page-canvas (documento) |
| Geração de Documentos (Estúdio) | ✅ Implementado | Pipeline + prompts aprofundados + persiste em Documentos |
| Página de Documentos | ✅ Implementado | Lista, filtros, bulk ops, filtro "Do Caderno", link para caderno |
| Novo Documento | ✅ Implementado | Fluxo completo; sem integração DataJud como fonte |
| Banco de Teses | ✅ Implementado | CRUD completo |
| Acervo | ✅ Implementado | Upload, indexação, classificação, ementa automática |
| Pesquisa Web Externa | ✅ Implementado | Agentes + deep search |
| Banco de Teses do STF/STJ | ✅ Implementado | Pesquisador externo |
| Painel Admin | ✅ Implementado | Modelos, custos, configurações |
| Autenticação | ✅ Implementado | Firebase Auth + onboarding |
| Exportação DOCX | ✅ Implementado | Backend Python via docx_generator |

---

## Epic 1: Sistema de Pesquisa de Jurisprudência

### Feature 1.1: DataJud — ementa integral e inteiro teor + results_raw

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Retornar ementa completa e inteiro teor das decisões quando disponíveis na API pública DataJud (CNJ). Armazenar resultados brutos para exibição rich no visualizador.

**Arquivos afetados:**
- `frontend/src/lib/datajud-service.ts` — interface `DataJudResult`, `parseDataJudHit`, `formatDataJudResults`
- `frontend/src/lib/datajud-service.test.ts` — testes unitários
- `frontend/src/lib/firestore-types.ts` — `NotebookSource.results_raw?: string`
- `frontend/src/pages/ResearchNotebook.tsx` — serializa top-10 resultados em `results_raw` ao criar fonte

**Mudanças implementadas:**
- Adicionado `ementa?: string` e `inteiroTeor?: string` a `DataJudResult`
- `parseDataJudHit` extrai `src.ementa` e `src.inteiro_teor` (string ou objeto aninhado)
- `formatDataJudResults` inclui ementa e trecho do inteiro teor no texto enviado ao LLM
- `NotebookSource.results_raw` armazena JSON dos top-10 DataJudResult (inteiroTeor limitado a 8KB)
- `fitSourcesToFirestoreLimit` remove `results_raw` primeiro quando notebook se aproxima do limite 1MiB

**Dependências:** API pública DataJud (CNJ) — endpoint `api-publica.datajud.cnj.jus.br`

**Riscos:**
- A API CNJ nem sempre retorna ementa/inteiro_teor para todos os processos (dados incompletos)
- Implementação deve ter fallback gracioso quando campos ausentes

---

### Feature 1.2: Busca híbrida (semântica + lexical)

**Estado:** ❌ Não implementado

**Objetivo:** Combinar busca Elasticsearch com scoring semântico por embeddings.

**Arquivos a afetar:** `frontend/src/lib/datajud-service.ts`, novo serviço de embeddings

**Dependências:** Serviço de embeddings (OpenAI/OpenRouter), armazenamento de índice vetorial

---

### Feature 1.3: Reranking jurídico por relevância

**Estado:** ⚠️ Parcial — agente `notebook_ranqueador_jurisprudencia` existe (skip gracioso se sem modelo)

**Objetivo:** Reordenar resultados por relevância temática, hierarquia de tribunal, atualidade.

**Arquivos afetados:**
- `frontend/src/pages/ResearchNotebook.tsx` — pipeline 5 etapas (query→filter→rank→analyze→synthesize)
- `frontend/src/lib/model-config.ts` — `notebook_ranqueador_jurisprudencia`

---

### Feature 1.4: Filtros estruturados avançados

**Estado:** ✅ Implementado

**Arquivos:** `frontend/src/components/JurisprudenceConfigModal.tsx`, `frontend/src/lib/datajud-service.ts`

---

## Epic 2: Visualizador Documental

### Feature 2.1: SourceContentViewer — renderização jurídica rica + tabs

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Transformar exibição de JSON cru/texto plano em visualização documental de alta qualidade. Exibir processos individuais com ementa e inteiro teor em aba separada.

**Arquivos afetados:**
- `frontend/src/components/SourceContentViewer.tsx` — componente principal

**Mudanças implementadas:**
- Detecção de fontes jurídicas (DataJud/jurisprudência)
- Tabs **Síntese** + **Processos (N)** quando `results_raw` presente
- `ProcessCard` por resultado: ementa, inteiro teor expandível, tribunal, classe, data, assuntos
- Renderização de síntese com destaque visual, seções e barras coloridas
- `formatDate` helper para datas ISO
- Fallback seguro para documentos genéricos

---

### Feature 2.2: ReportViewer — pageMode (page-canvas)

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Artefatos do tipo `documento` renderizados com visual de folha A4 (fundo cinza + card branco com sombra).

**Arquivos afetados:**
- `frontend/src/components/artifacts/ReportViewer.tsx` — prop `pageMode?: boolean`, layout page-canvas
- `frontend/src/components/artifacts/ArtifactViewerModal.tsx` — passa `pageMode={artifact.type === 'documento'}`

**Mudanças implementadas:**
- `ReportViewer` aceita `pageMode?: boolean`
- Quando `pageMode=true`: fundo cinza (`bg-gray-100`) + card branco (max-w-3xl, `minHeight: 29.7cm`, `shadow-md`)
- TOC sidebar dentro do page-canvas no modo página
- `ArtifactViewerModal` passa `pageMode` automaticamente para tipo `documento`

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

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Adaptar prompts de acordo com área do direito (civil, penal, trabalhista, etc.)

**Arquivos afetados:**
- `frontend/src/lib/notebook-studio-pipeline.ts` — `detectLegalArea`, `AREA_PROMPT_ENRICHMENTS`, integração em `buildResearchPrompt` e `buildSpecialistPrompt`
- `frontend/src/lib/notebook-studio-pipeline.test.ts` — 19 testes para `detectLegalArea` (17 áreas + fallback + negativo)

**Mudanças implementadas:**
- `StudioPipelineInput.legalArea?: string` — campo opcional para área jurídica explícita
- `detectLegalArea(topic, description)` — detecção automática por keywords (17 áreas com regex)
- `AREA_PROMPT_ENRICHMENTS` — mapa de enriquecimento por área com legislação, princípios e jurisprudência específicos
- Enriquecimento integrado automaticamente nos prompts de pesquisa e especialista

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
- Badge "Caderno" visível na listagem de documentos, com link para `/notebook?open=<id>` quando `notebook_id` presente

---

### Feature 4.3: Deep-link Caderno (?open=<notebook_id>)

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Permitir abrir um caderno específico diretamente via URL `/notebook?open=<id>`.

**Arquivos afetados:**
- `frontend/src/pages/ResearchNotebook.tsx` — `useSearchParams`, efeito `deepLinkHandledRef`
- `frontend/src/pages/DocumentList.tsx` — badge "Caderno" link para `/notebook?open=<id>`

**Mudanças implementadas:**
- `useSearchParams` do react-router-dom
- `deepLinkHandledRef` garante execução única
- Resolve notebook da lista em memória ou via `getResearchNotebook` (Firestore)
- Limpa o query param após abrir (replace: true)

---

### Feature 4.4: Filtro "Do Caderno" na página Documentos

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Filtrar documentos por `origem: 'caderno'` com chip visual violet.

**Arquivos afetados:**
- `frontend/src/pages/DocumentList.tsx` — estado `originFilter`, `handleOriginFilter`, chip UI

**Mudanças implementadas:**
- Estado `originFilter` com toggle igual aos filtros de status
- Chip violeta "Do Caderno" (BookOpen icon) na barra de filtros
- Filtragem client-side (Firebase) e via query param (API REST)
- Incluído em `hasActiveFilters` e `clearAll`

---

### Feature 4.2: Unificação do documento formal com Novo Documento

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** O artefato `documento` gerado no estúdio deve ser equivalente ao Novo Documento em qualidade e persistência.

**Arquivos afetados:**
- `frontend/src/lib/notebook-studio-pipeline.ts`
- `frontend/src/lib/firestore-service.ts`

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
| `frontend/src/components/SourceContentViewer.tsx` | 🟢 Baixa | Componente de visualização puro; sem side effects |
| `frontend/src/components/artifacts/ArtifactViewerModal.tsx` | 🟡 Média | Modal principal de artefatos; múltiplos tipos |

---

## Lacunas de testes (conhecidas)

| Área | Tipo de teste faltando |
|------|----------------------|
| Jurispr. — ementa/inteiro teor | ✅ Coberto — 11 testes em datajud-service.test.ts |
| Studio pipeline — detecção de área | ✅ Coberto — 19 testes em notebook-studio-pipeline.test.ts |
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
- [x] Filtro por `origem: 'caderno'` na página Documentos
- [x] Deep-link `/notebook?open=<id>` para abrir caderno diretamente
- [x] `results_raw` — processCards com ementa/inteiro teor por processo
- [x] `pageMode` — visualizador de documento como página A4
- [x] Exportação PDF nativa dos artefatos
- [x] Preview de documento na página Documentos
- [ ] Busca híbrida (semântica + lexical) para jurisprudência

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

*Última atualização: 2026-04-08 — Ciclo: Feature 3.2 (área jurídica), PDF export, preview DocumentList, testes studio pipeline*

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
| Caderno de Pesquisa (Notebook) | ✅ Implementado | Fontes, chat, estúdio, artefatos, deep-link (?open=id) |
| Pesquisa de Jurisprudência (DataJud) | ✅ Implementado | ementa + inteiro teor extraídos e persistidos (results_raw) |
| Visualizador de Documentos | ✅ Implementado | Page-canvas para acervo; tabs Síntese+Processos para jurisprudência |
| Geração de Documentos (Estúdio) | ✅ Implementado | Prompts aprofundados; artefato 'documento' persiste em Documentos |
| Página de Documentos | ✅ Implementado | Filtro 'Do Caderno'; badge com link deep-link para caderno de origem |
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
- `frontend/src/lib/firestore-types.ts` — campo `results_raw?: string` em `NotebookSource`
- `frontend/src/pages/ResearchNotebook.tsx` — persiste `results_raw` (top-10, inteiroTeor ≤ 8 KB) ao criar fonte de jurisprudência
- `frontend/src/lib/firestore-service.ts` — `fitSourcesToFirestoreLimit` descarta `results_raw` quando ratio < 0.8
- `frontend/src/components/SourceContentViewer.tsx` — tabs Síntese/Processos com `ProcessCard` (ementa, inteiroTeor, tribunal, classe, etc.)

**Mudanças implementadas:**
- Adicionado `ementa?: string` e `inteiroTeor?: string` a `DataJudResult`
- `parseDataJudHit` agora extrai `src.ementa` e `src.inteiro_teor` (suporta string plana ou objeto aninhado)
- `formatDataJudResults` inclui ementa e trecho do inteiro teor
- `NotebookSource.results_raw` persiste JSON dos top-10 resultados brutos
- `SourceContentViewer` mostra tab "Processos" com `ProcessCard` por resultado quando `results_raw` presente
- Testes atualizados para cobrir novos campos

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

### Feature 2.1: SourceContentViewer — renderização jurídica rica

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Transformar exibição de JSON cru/texto plano em visualização documental de alta qualidade.

**Arquivos afetados:**
- `frontend/src/components/SourceContentViewer.tsx` — componente principal

**Mudanças implementadas:**
- Detecção de fontes jurídicas (`type === 'jurisprudencia'`)
- Tabs Síntese / Processos para fontes jurisprudenciais com `results_raw`
- `ProcessCard` mostra ementa (expansível), inteiro teor (expansível), tribunal, classe, data, assuntos
- Page-canvas layout (fundo cinza + card branco) para documentos estruturados do acervo
- Fallback seguro para documentos genéricos

---

### Feature 2.2: ReportViewer — layout page-canvas para documentos formais

**Estado:** ✅ Implementado (ciclo 2026-04)

**Arquivos afetados:**
- `frontend/src/components/artifacts/ReportViewer.tsx` — prop `pageMode`
- `frontend/src/components/artifacts/ArtifactViewerModal.tsx` — passa `pageMode={artifact.type === 'documento'}`

**Mudanças implementadas:**
- Prop `pageMode?: boolean` no `ReportViewer`
- Quando `pageMode=true`: fundo cinza + card branco centrado (max-width 720px) simulando página impressa
- TOC flutuando sobre o fundo cinza
- `ArtifactViewerModal` passa `pageMode` para artefatos do tipo `documento`

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
- `frontend/src/lib/firestore-service.ts` — `saveNotebookDocumentToDocuments` (aceita `document_type_id` e `legal_area_ids` opcionais)
- `frontend/src/lib/firestore-types.ts` — campo `notebook_id`, `notebook_title`, `origem: 'caderno'` em `DocumentData`
- `frontend/src/pages/ResearchNotebook.tsx` — chama `saveNotebookDocumentToDocuments` ao criar artefato tipo `documento`
- `frontend/src/pages/DocumentList.tsx` — badge "Caderno" com link deep-link; filtro 'Do Caderno'

**Mudanças implementadas:**
- `DocumentData.origem` aceita `'caderno'` além de `'web'`
- `DocumentData.notebook_id` para rastreabilidade
- Ao gerar artefato `documento` no estúdio, persiste automaticamente na página Documentos
- Badge "Caderno" é link clicável que abre `/notebook?open=<notebook_id>`
- Filtro chip 'Do Caderno' (violeta) na barra de filtros da página Documentos

---

### Feature 4.2: Unificação do documento formal com Novo Documento

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** O artefato `documento` gerado no estúdio deve ser equivalente ao Novo Documento em qualidade e persistência.

**Arquivos afetados:**
- `frontend/src/lib/notebook-studio-pipeline.ts`
- `frontend/src/lib/firestore-service.ts`

### Feature 4.3: Deep-link para caderno via ?open=<notebook_id>

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Permitir navegar diretamente para um caderno específico via URL.

**Arquivos afetados:**
- `frontend/src/pages/ResearchNotebook.tsx` — `useSearchParams`, efeito de deep-link

**Mudanças implementadas:**
- `useSearchParams` do react-router-dom no `ResearchNotebook`
- Efeito que lê `?open=<id>` e abre o caderno correspondente automaticamente
- Se o caderno não estiver na lista local, faz fetch direto por ID
- Badge "Caderno" na página Documentos usa este deep-link

---

### Feature 5.1: Testes unitários — DataJud ementa/inteiro_teor

**Estado:** ✅ Implementado (ciclo 2026-04)

**Arquivos:** `frontend/src/lib/datajud-service.test.ts`

---

## Mapeamento de arquivos sensíveis (risco de regressão)

| Arquivo | Sensibilidade | Motivo |
|---------|--------------|--------|
| `frontend/src/lib/datajud-service.ts` | 🔴 Alta | API pública CNJ; múltiplos tribunais em paralelo; endpoint caching |
| `frontend/src/lib/firestore-service.ts` | 🔴 Alta | CRUD principal; erros causam perda de dados; fitSourcesToFirestoreLimit |
| `frontend/src/pages/ResearchNotebook.tsx` | 🔴 Alta | >4000 linhas; estado complexo; múltiplos pipelines |
| `frontend/src/lib/notebook-studio-pipeline.ts` | 🟡 Média | Prompts de geração; mudanças afetam qualidade de saída |
| `frontend/src/components/SourceContentViewer.tsx` | 🟢 Baixa | Componente de visualização puro; sem side effects |
| `frontend/src/components/artifacts/ArtifactViewerModal.tsx` | 🟡 Média | Modal principal de artefatos; múltiplos tipos |
| `frontend/src/components/artifacts/ReportViewer.tsx` | 🟢 Baixa | Viewer de markdown; agora com pageMode |
| `frontend/src/pages/DocumentList.tsx` | 🟢 Baixa | Lista de documentos; filtro originFilter adicionado |

---

## Lacunas de testes (conhecidas)

| Área | Tipo de teste faltando |
|------|----------------------|
| Studio pipeline — qualidade de prompts | Testes de snapshot de prompts |
| firestore-service — saveNotebookDocument | Teste de integração mock Firestore |
| SourceContentViewer — renderização jurídica | Testes de renderização de componente |
| SourceContentViewer — parseResultsRaw | Teste unitário de parsing de results_raw |
| ReportViewer — pageMode | Teste de renderização page-canvas |
| DocumentList — originFilter | Teste de filtragem por origem |

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
- [ ] Preview de documento na página Documentos
- [x] Filtro por `origem: 'caderno'` na página Documentos — ✅ Implementado

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

*Última atualização: 2026-04-07 — Ciclo: results_raw + ProcessCard + page-canvas + pageMode + filtro Caderno + deep-link*

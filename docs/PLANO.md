# Lexio — Plano de Desenvolvimento e Rastreabilidade

> **Índice versionável de features, epics, estado de implementação e mapeamento de arquivos.**
> Atualizado a cada ciclo de implementação. Serve como memória persistente de produto para agentes IA e equipe.

---

## Como usar este documento

- Consulte antes de implementar: verifique o estado atual da feature
- Atualize após implementar: marque como `✅`, `⚠️ parcial` ou `❌ ausente`
- Use as seções **Arquivos** para localizar código relevante rapidamente
- Use as seções **Riscos** para antecipar pontos frágeis antes de alterar
- Veja `docs/MANIFEST.json` para snapshot machine-readable do estado atual

---

## Estado geral do produto (snapshot atual)

| Área | Estado | Observações |
|------|--------|-------------|
| Caderno de Pesquisa (Notebook) | ✅ Implementado | Fontes, chat, estúdio, artefatos |
| Pesquisa de Jurisprudência (DataJud) | ✅ Implementado | ementa/inteiro teor completos; resultados raw persistidos |
| Visualizador de Documentos | ✅ Implementado | Page-layout rico para acervo; tabs síntese/processos para jurisprudência |
| Geração de Documentos (Estúdio) | ✅ Implementado | Prompts por tipo (parecer, petição, contestação); persiste em Documentos |
| Página de Documentos | ✅ Implementado | Filtro por origem 'caderno'; badge Caderno; lista completa |
| Novo Documento | ✅ Implementado | Fluxo completo via generation-service |
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

**Objetivo:** Retornar ementa completa e inteiro teor das decisões quando disponíveis na API pública DataJud (CNJ) e exibir ponta-a-ponta no visualizador.

**Arquivos afetados:**
- `frontend/src/lib/datajud-service.ts` — interface `DataJudResult`, `parseDataJudHit`, `formatDataJudResults`
- `frontend/src/lib/datajud-service.test.ts` — testes unitários
- `frontend/src/lib/firestore-types.ts` — campo `results_raw?: string` em `NotebookSource`
- `frontend/src/pages/ResearchNotebook.tsx` — criação da fonte persiste `results_raw`
- `frontend/src/components/SourceContentViewer.tsx` — aba "Processos" exibe cards individuais com ementa/inteiro teor

**Mudanças implementadas:**
- `DataJudResult.ementa` e `DataJudResult.inteiroTeor` — campos opcionais extraídos do `_source` da API
- `parseDataJudHit` extrai ementa e inteiro_teor do JSON (string ou objeto aninhado)
- `formatDataJudResults` inclui ementa e trecho do inteiro teor no contexto para síntese LLM
- `NotebookSource.results_raw` — JSON dos top-10 resultados DataJud (inteiro teor limitado a 8 KB)
- `SourceContentViewer` — tab "Processos" mostra `ProcessCard` com: ementa destacada, inteiro teor colapsável, badges de disponibilidade
- `fitSourcesToFirestoreLimit` descarta `results_raw` quando notebook próximo do limite de 1 MB

**Dependências:** API pública DataJud (CNJ) — endpoint `api-publica.datajud.cnj.jus.br`

**Riscos:**
- A API CNJ nem sempre retorna ementa/inteiro_teor (dados incompletos na fonte)
- Inteiro teor pode ser muito grande — limitado a 8 KB por processo no armazenamento

---

### Feature 1.2: Busca híbrida (semântica + lexical)

**Estado:** ❌ Não implementado

**Objetivo:** Combinar busca Elasticsearch com scoring semântico por embeddings.

**Arquivos a afetar:** `frontend/src/lib/datajud-service.ts`, novo serviço de embeddings

---

### Feature 1.3: Reranking jurídico por relevância

**Estado:** ⚠️ Parcial — agente `notebook_ranqueador_jurisprudencia` existe (skip gracioso se sem modelo)

**Arquivos afetados:**
- `frontend/src/pages/ResearchNotebook.tsx` — pipeline 5 etapas (query→filter→rank→analyze→synthesize)
- `frontend/src/lib/model-config.ts` — `notebook_ranqueador_jurisprudencia`

---

### Feature 1.4: Filtros estruturados avançados

**Estado:** ✅ Implementado

**Arquivos:** `frontend/src/components/JurisprudenceConfigModal.tsx`, `frontend/src/lib/datajud-service.ts`

---

## Epic 2: Visualizador Documental

### Feature 2.1: SourceContentViewer — renderização jurídica rica com tabs e cards

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Visualizar fontes jurisprudenciais com síntese LLM e processos individuais (ementa + inteiro teor). Visualizar documentos do acervo com layout tipo página (PDF/DOCX).

**Arquivos afetados:**
- `frontend/src/components/SourceContentViewer.tsx` — refatorado completamente

**Mudanças implementadas:**
- **Tab "Síntese"** — análise LLM estruturada em seções, igual ao anterior
- **Tab "Processos"** — só aparece quando `results_raw` disponível; exibe `ProcessCard` por resultado DataJud:
  - Cabeçalho com número do processo, tribunal, órgão julgador, data, grau
  - Badges visuais indicando disponibilidade de ementa e inteiro teor
  - Assuntos como chips
  - Ementa destacada em azul com label "Ementa"
  - Inteiro teor colapsável com aviso de tamanho
- **DocumentPageViewer** — para documentos do acervo: canvas cinza com card branco centralizado, margens, tipografia hierárquica, parágrafo com recuo e justificado, detecção automática de subheadings em MAIÚSCULAS ou numerados

---

### Feature 2.2: ArtifactViewerModal / ReportViewer — layout página para documentos formais

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Artefatos do tipo `documento` exibidos em layout tipo-página (papel branco sobre fundo cinza).

**Arquivos afetados:**
- `frontend/src/components/artifacts/ReportViewer.tsx` — prop `pageMode` adicionada
- `frontend/src/components/artifacts/ArtifactViewerModal.tsx` — passa `pageMode` para tipo `documento`

**Mudanças implementadas:**
- `ReportViewer` aceita `pageMode?: boolean`; quando ativo, envolve conteúdo em card branco com margens e tipografia forense
- Artefatos `documento` usam `pageMode=true`; demais tipos mantêm layout atual

---

## Epic 3: Estúdio do Caderno — Qualidade de Geração

### Feature 3.1: Prompts aprofundados para documentos jurídicos

**Estado:** ✅ Implementado (ciclo 2026-04)

**Arquivos afetados:**
- `frontend/src/lib/notebook-studio-pipeline.ts` — `getSpecialistInstructions`, `buildReviewPrompt`, `buildResearchPrompt`

**Mudanças implementadas:**
- `resumo` e `relatorio` com estruturas obrigatórias mínimas e exigência de palavras
- `documento` com detecção de sub-tipo por label:
  - **Parecer jurídico** → ementa obrigatória, seções I-VII, fundamentação tripla (norma+doutrina+jurisprudência)
  - **Petição inicial** → art. 319 CPC, seções padrão forenses, pedidos numerados
  - **Contestação** → impugnação específica (art. 341 CPC), preliminares
  - **Recurso** → razões específicas, fundamento legal do cabimento
  - **Contrato/Nota técnica** → estrutura específica do tipo
  - **Default** → documento formal genérico com guardrails anti-superficialidade

---

### Feature 3.2: Diferenciação de prompts por área jurídica

**Estado:** ❌ Não implementado

**Objetivo:** Adaptar prompts de acordo com área do direito (civil, penal, trabalhista, etc.)

---

## Epic 4: Integração Caderno ↔ Documentos

### Feature 4.1: Documentos do estúdio → página Documentos

**Estado:** ✅ Implementado (ciclo 2026-04)

**Arquivos afetados:**
- `frontend/src/lib/firestore-service.ts` — `saveNotebookDocumentToDocuments`
- `frontend/src/lib/firestore-types.ts` — `DocumentData.origem: 'caderno'`, `notebook_id`
- `frontend/src/pages/ResearchNotebook.tsx` — chama `saveNotebookDocumentToDocuments` ao criar `documento`
- `frontend/src/pages/DocumentList.tsx` — badge "Caderno" + filtro por `origem: 'caderno'`

**Mudanças implementadas:**
- Badge "Caderno" (violeta) na listagem de documentos
- Filtro "Do Caderno" nos chips de filtro da DocumentList
- Filtragem client-side por `origemFilter === 'caderno'`

---

### Feature 4.2: Unificação do documento formal com Novo Documento

**Estado:** ⚠️ Parcial

**O que existe:**
- Documentos do caderno persistem em Firestore com `origem: 'caderno'`
- Aparecem na mesma listagem que documentos criados via NewDocument
- `saveNotebookDocumentToDocuments` cria DocumentData com metadados de rastreabilidade

**O que ainda falta:**
- Compartilhar lógica de `generation-service` entre notebook e NewDocument
- Botão "Abrir no Gerador de Documentos" no notebook com contexto pré-preenchido

---

## Epic 5: Infraestrutura de Qualidade

### Feature 5.1: Testes unitários — DataJud ementa/inteiro_teor

**Estado:** ✅ Implementado (ciclo 2026-04)

**Arquivos:** `frontend/src/lib/datajud-service.test.ts`

---

### Feature 5.2: Sistema de rastreabilidade/indexação (PLANO.md + MANIFEST.json)

**Estado:** ✅ Implementado (ciclo 2026-04)

**Arquivos:**
- `docs/PLANO.md` — este arquivo; índice humano de features e estado
- `docs/MANIFEST.json` — snapshot machine-readable do estado de implementação (gerado manualmente a cada ciclo)

---

## Mapeamento de arquivos sensíveis (risco de regressão)

| Arquivo | Sensibilidade | Motivo |
|---------|--------------|--------|
| `frontend/src/lib/datajud-service.ts` | 🔴 Alta | API pública CNJ; múltiplos tribunais em paralelo; endpoint caching |
| `frontend/src/lib/firestore-service.ts` | 🔴 Alta | CRUD principal; erros causam perda de dados; fitSourcesToFirestoreLimit |
| `frontend/src/pages/ResearchNotebook.tsx` | 🔴 Alta | >4000 linhas; estado complexo; múltiplos pipelines |
| `frontend/src/lib/notebook-studio-pipeline.ts` | 🟡 Média | Prompts de geração; switch por tipo de artefato |
| `frontend/src/components/SourceContentViewer.tsx` | 🟢 Baixa | Componente de visualização puro; sem side effects |
| `frontend/src/components/artifacts/ReportViewer.tsx` | 🟢 Baixa | Componente de visualização; prop pageMode é opt-in |
| `frontend/src/components/artifacts/ArtifactViewerModal.tsx` | 🟡 Média | Modal principal de artefatos; múltiplos tipos |
| `frontend/src/pages/DocumentList.tsx` | 🟡 Média | Listagem com filtros; origemFilter adicionado |
| `frontend/src/lib/firestore-types.ts` | 🟡 Média | Interfaces compartilhadas; NotebookSource.results_raw |

---

## Lacunas de testes (conhecidas)

| Área | Tipo de teste faltando |
|------|----------------------|
| SourceContentViewer — tabs e ProcessCard | Testes de renderização de componente |
| ReportViewer — pageMode | Teste de snapshot |
| DocumentList — filtro origemFilter | Teste de interação |
| Studio pipeline — detecção de sub-tipo em documento | Teste unitário de getSpecialistInstructions |

---

## Convenções de desenvolvimento

- **Commits**: usar descrição clara no imperativo, ex: `Adiciona campo ementa ao DataJudResult`
- **Tipos TypeScript**: sempre atualizar interfaces antes de usar campos novos
- **Testes**: ao modificar funções puras (parse, format), sempre atualizar testes unitários
- **Segurança**: nunca adicionar HTML cru não sanitizado; usar `textContent` ou DOMPurify
- **Fallback**: toda feature nova deve ter comportamento seguro quando dados ausentes
- **Rastreabilidade**: ao implementar nova feature, atualizar PLANO.md e MANIFEST.json

---

## Roadmap de próximas features (backlog priorizado)

### Prioridade 1 — Alto impacto imediato
- [ ] Unificação completa: botão "Abrir no Gerador" no notebook com contexto pré-preenchido
- [ ] Exportação PDF nativa dos artefatos
- [ ] Filtro por `origem: 'caderno'` na API backend (não apenas client-side)
- [ ] Testes de componente para SourceContentViewer e ReportViewer

### Prioridade 2 — Diferenciação de produto
- [ ] Busca híbrida (semântica + lexical) para jurisprudência
- [ ] Pesquisa conversacional com contexto (memória multi-turno de filtros)
- [ ] Classificação temática de jurisprudência por área do direito
- [ ] Linha do tempo jurisprudencial (evolução de entendimento)
- [ ] Indicador "favorável / desfavorável / neutro" por resultado

### Prioridade 3 — Moat de produto
- [ ] Deduplicação e agrupamento de precedentes relacionados
- [ ] Comparação entre dois julgados ("diferencie estes precedentes")
- [ ] Pesquisa orientada à peça processual
- [ ] Analytics jurisprudencial por tema/período
- [ ] Diferenciação de prompts por área jurídica (civil, penal, trabalhista)

---

*Última atualização: 2026-04-07 — Ciclo: ementa/inteiro teor ponta-a-ponta + visualizador rich (page-layout + tabs processos) + prompts especializados (parecer/petição/contestação/recurso) + filtro Caderno em DocumentList*

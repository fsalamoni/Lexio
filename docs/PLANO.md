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
| Pesquisa de Jurisprudência (DataJud) | ✅ Implementado | Ementa + inteiro teor + results_raw + tabs Síntese/Processos |
| Visualizador de Documentos | ✅ Implementado | JurisprudenceViewer + ProcessCard + page-canvas para docs |
| Geração de Documentos (Estúdio) | ✅ Implementado | Pipeline + prompts aprofundados + persiste em Documentos |
| Página de Documentos | ✅ Implementado | Lista, filtros, bulk ops, filtro "Do Caderno", link para caderno |
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

**Estado:** ✅ Implementado (ciclo 2026-04, atualizado ciclo 2026-04-2)

**Objetivo:** Retornar ementa completa e inteiro teor das decisões quando disponíveis na API pública DataJud (CNJ). Armazenar resultados brutos para exibição individual por processo.

**Arquivos afetados:**
- `frontend/src/lib/datajud-service.ts` — interface `DataJudResult`, `parseDataJudHit`, `formatDataJudResults`
- `frontend/src/lib/datajud-service.test.ts` — testes unitários
- `frontend/src/lib/firestore-types.ts` — campo `results_raw?: string` em `NotebookSource`
- `frontend/src/pages/ResearchNotebook.tsx` — armazena `results_raw` ao criar fonte jurisprudência
- `frontend/src/lib/firestore-service.ts` — `fitSourcesToFirestoreLimit` descarta `results_raw` quando ratio < 0.8

**Mudanças implementadas:**
- `DataJudResult.ementa` e `DataJudResult.inteiroTeor` extraídos do `_source`
- `NotebookSource.results_raw` armazena JSON serializado dos top-10 resultados (inteiroTeor cappado em 8KB)
- `fitSourcesToFirestoreLimit` descarta `results_raw` quando o notebook está próximo do limite de 1MB

**Dependências:** API pública DataJud (CNJ) — endpoint `api-publica.datajud.cnj.jus.br`

**Riscos:**
- A API CNJ nem sempre retorna ementa/inteiro_teor para todos os processos (dados incompletos)
- `results_raw` pode ser descartado quando o caderno tem muitas fontes (comportamento esperado)

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

**Estado:** ✅ Implementado (ciclo 2026-04, atualizado ciclo 2026-04-2)

**Objetivo:** Transformar exibição de JSON cru/texto plano em visualização documental de alta qualidade. Exibir ementa e inteiro teor por processo individual.

**Arquivos afetados:**
- `frontend/src/components/SourceContentViewer.tsx` — componente principal com ProcessCard e tabs

**Mudanças implementadas:**
- Detecção de fontes jurídicas (DataJud/jurisprudência)
- **Tab "Síntese"**: texto sintetizado pelo LLM com seções visuais
- **Tab "Processos"** (só quando `results_raw` presente): cards individuais por processo com ementa + inteiro teor expandíveis
- `ProcessCard`: número, tribunal, classe, data, badges ementa/inteiro teor, assuntos
- Fallback seguro para documentos genéricos
- Melhor tipografia e espaçamento para leitura

---

### Feature 2.2: ArtifactViewerModal — page-canvas para documentos

**Estado:** ✅ Implementado (ciclo 2026-04-2)

**Objetivo:** Documentos gerados no Estúdio do tipo `documento` são exibidos em layout page-canvas (fundo cinza + card branco com sombra) para experiência de leitura próxima de um documento real.

**Arquivos afetados:**
- `frontend/src/components/artifacts/ReportViewer.tsx` — prop `pageMode?: boolean`
- `frontend/src/components/artifacts/ArtifactViewerModal.tsx` — passa `pageMode={true}` para `documento`

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

**Estado:** ✅ Implementado (ciclo 2026-04, atualizado ciclo 2026-04-2)

**Objetivo:** Artefatos do tipo `documento` gerados no estúdio do Caderno são persistidos como `DocumentData` em Firestore e listados na página Documentos.

**Arquivos afetados:**
- `frontend/src/lib/firestore-service.ts` — `saveNotebookDocumentToDocuments` (aceita `document_type_id` e `legal_area_ids` opcionais)
- `frontend/src/lib/firestore-types.ts` — campo `notebook_id` e `origem: 'caderno'` em `DocumentData`
- `frontend/src/pages/ResearchNotebook.tsx` — usa `buildStudioDescription()` para gerar tema descritivo; chama `saveNotebookDocumentToDocuments`
- `frontend/src/pages/DocumentList.tsx` — badge "Caderno" com link direto ao notebook; filtro "Do Caderno"

**Mudanças implementadas:**
- `DocumentData.origem` aceita `'caderno'` com link de volta ao caderno
- Badge "Caderno" na listagem é agora um `<Link>` para `/notebook?open=<id>`
- Filtro chip "Do Caderno" na listagem filtra por `origem === 'caderno'`
- `buildStudioDescription(notebookTitle, artifactTitle)` gera tema mais descritivo
- `saveNotebookDocumentToDocuments` aceita `document_type_id` e `legal_area_ids` opcionais

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

### Feature 5.2: TypeScript — sem erros em CI

**Estado:** ✅ Implementado (ciclo 2026-04-2)

**Mudanças:** Corrigido `TribunalCategory` typos em testes (`estaduais` → `estadual`, `federais` → `federal`).

---

## Epic 6: Navegação e UX

### Feature 6.1: Deep-link `?open=<notebook_id>` no Caderno

**Estado:** ✅ Implementado (ciclo 2026-04-2)

**Objetivo:** Permitir links diretos de outras páginas para um caderno específico.

**Arquivos afetados:**
- `frontend/src/pages/ResearchNotebook.tsx` — `useSearchParams`, `deepLinkHandledRef`, `useEffect` que abre notebook pelo `?open=` param
- `frontend/src/pages/DocumentList.tsx` — badge "Caderno" como `<Link>` para `/notebook?open=<id>`

**Mudanças implementadas:**
- Ao carregar `/notebook?open=<id>`, o notebook é automaticamente aberto
- URL limpa (param removido via `replace`) sem quebrar histórico de navegação
- Fallback gracioso se o ID não existir (toast de aviso)

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
| `results_raw` serialização/desserialização | Teste unitário de round-trip |
| `fitSourcesToFirestoreLimit` — drop de results_raw | Teste com fontes acima do limite |
| `saveNotebookDocumentToDocuments` | Teste de integração mock Firestore |
| SourceContentViewer — tabs/ProcessCard | Testes de renderização de componente |
| Deep-link — `?open=<id>` | Teste de roteamento |

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
- [x] Filtro por `origem: 'caderno'` na página Documentos ✅

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

*Última atualização: 2026-04-07 — Ciclo 2: results_raw + ProcessCard tabs + deep-link + filtro Do Caderno + page-canvas + buildStudioDescription*

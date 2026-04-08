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
| Pesquisa de Jurisprudência (DataJud) | ✅ Implementado | ementa + inteiro teor + results_raw por fonte |
| Visualizador de Documentos | ✅ Implementado | Tabs Síntese+Processos, ProcessCard, pageMode para documentos |
| Geração de Documentos (Estúdio) | ✅ Implementado | Pipeline OK; prompts aprofundados; persiste em Documentos |
| Página de Documentos | ✅ Implementado | Lista, filtros, bulk ops; filtro "Do Caderno"; badge com link |
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
- `NotebookSource` ganha campo `results_raw?: string` (JSON de DataJudResult[], inteiroTeor limitado a 8KB por item)
- `fitSourcesToFirestoreLimit` remove `results_raw` primeiro antes de truncar `text_content`
- `SourceContentViewer` exibe tabs Síntese+Processos quando `results_raw` está disponível
- `ProcessCard` mostra ementa, tribunal, classe, data, assuntos, inteiro teor expandível por processo

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

### Feature 2.1: SourceContentViewer — renderização jurídica rica

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Transformar exibição de JSON cru/texto plano em visualização documental de alta qualidade. Renderizar documentos jurídicos com tipografia, hierarquia, seções, ementa destacada, dispositivo, etc.

**Arquivos afetados:**
- `frontend/src/components/SourceContentViewer.tsx` — componente principal
- `frontend/src/lib/datajud-service.ts` — campos ementa/inteiro_teor nos resultados

**Mudanças implementadas:**
- Detecção de fontes jurídicas (DataJud/jurisprudência)
- Renderização de ementa com destaque visual via `JurisprudenceViewer`
- Quando `results_raw` presente: tabs Síntese (síntese LLM) e Processos (ProcessCard por resultado)
- `ProcessCard`: ementa, tribunal, classe, data, assuntos, inteiro teor expandível
- Seções parse de Markdown via `parseJurisprudenceText` com headings e body
- Fallback seguro para documentos genéricos e texto plano
- Melhor tipografia e espaçamento para leitura

---

### Feature 2.2: ArtifactViewerModal — visualização de documento em page-canvas

**Estado:** ✅ Implementado (ciclo 2026-04 sessão 5)

**Objetivo:** Artefatos do tipo `documento` são exibidos com layout page-canvas (fundo cinza + card branco estilo A4) para melhor experiência de leitura.

**Arquivos afetados:**
- `frontend/src/components/artifacts/ReportViewer.tsx` — prop `pageMode?: boolean`, A4_PAGE_MIN_HEIGHT constant
- `frontend/src/components/artifacts/ArtifactViewerModal.tsx` — passa `pageMode={artifact.type === 'documento'}`

**Mudanças implementadas:**
- `ReportViewer` aceita `pageMode` que ativa layout page-canvas (gray bg + white card, max-w-3xl, min-height 29.7cm)
- Quando `pageMode=false` (padrão), comportamento anterior com TOC e scroll spy mantido
- `ArtifactViewerModal` passa `pageMode={artifact.type === 'documento'}` para `ReportViewer`

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

### Feature 4.3: Filtro "Do Caderno" na página Documentos

**Estado:** ✅ Implementado (ciclo 2026-04 sessão 5)

**Objetivo:** Permitir filtrar a lista de documentos para exibir apenas documentos gerados a partir do Caderno de Pesquisa.

**Arquivos afetados:**
- `frontend/src/pages/DocumentList.tsx` — `originFilter` state, `handleOriginFilter`, filtro client-side

**Mudanças implementadas:**
- Chip de filtro "Do Caderno" com ícone BookOpen e cor violet
- `originFilter` state gerencia seleção
- Filtragem client-side por `origem === 'caderno'` no modo Firebase
- Badge "Caderno" é um Link clicável para `/notebook?open=<notebook_id>`

---

### Feature 4.4: Deep-link `?open=<notebook_id>` no Caderno de Pesquisa

**Estado:** ✅ Implementado (ciclo 2026-04 sessão 5)

**Objetivo:** Permitir navegar diretamente para um caderno específico via URL, facilitando links a partir da página Documentos.

**Arquivos afetados:**
- `frontend/src/pages/ResearchNotebook.tsx` — `useSearchParams`, `deepLinkHandledRef`

**Mudanças implementadas:**
- `useSearchParams` para ler `?open=<id>` da URL
- Efeito que ao completar carregamento da lista, abre o notebook cujo ID corresponde ao parâmetro
- Fallback: se não estiver na lista carregada, tenta `getResearchNotebook` diretamente
- `deepLinkHandledRef` evita reexecução em re-renders

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
| Studio pipeline — qualidade de prompts | Testes de snapshot de prompts |
| firestore-service — saveNotebookDocument | Teste de integração mock Firestore |
| SourceContentViewer — tabs Síntese+Processos | Testes de renderização de componente |
| fitSourcesToFirestoreLimit — results_raw stripping | Testes unitários de trimming com results_raw |
| ResearchNotebook — deep-link ?open= | Testes de integração com useSearchParams mock |

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
- [x] ~~Filtro por `origem: 'caderno'` na página Documentos~~ (implementado sessão 5)
- [ ] Exportação PDF nativa dos artefatos
- [ ] Preview de documento na página Documentos (PDF inline ou modal)
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

*Última atualização: 2026-04-08 — Ciclo: results_raw + ProcessCard tabs + pageMode + originFilter + deep-link Caderno*

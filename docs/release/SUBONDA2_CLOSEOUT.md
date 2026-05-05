# Subonda 2 — Closeout da Release

**Data:** 05/05/2026
**Versão:** v0.8.0-subonda2
**Status:** ⚠️ Implementação principal concluída e validada localmente; follow-ups de admin/vídeo/jurisprudência integrados, incluindo memória semântica persistente por caderno e smoke autenticado local, com commit/push/deploy ainda pendentes

---

## Resumo da Release

A **Subonda 2** consolida a segunda fase da Wave 40 no pipeline documental da Lexio. O foco desta rodada foi reduzir latência sem sacrificar rastreabilidade, usando paralelização segura real, caches de apoio com isolamento por usuário, `executionState` explícito nas trilhas multiagente e canários runtime persistidos por usuário para rollout e rollback finos sem redeploy.

---

## Blocos Implementados

### Bloco 1 — Paralelização segura real no pipeline documental
- **Arquivos:** `frontend/src/lib/generation-service.ts`, `frontend/src/lib/generation-service.parallel.test.ts`, `frontend/src/lib/generation-service.orchestration.test.ts`
- `FF_PARALLEL_PESQUISADOR` passou a iniciar uma execução real do `Pesquisador` em background após a triagem.
- A sincronização do `Pesquisador` foi mantida somente depois do encerramento do ramo do acervo, preservando a semântica visual do progresso.
- Falhas no preload paralelo de acervo ou na execução paralela do `Pesquisador` agora caem em fallback sequencial explícito, sem abortar a geração principal.
- `FF_ACERVO_KEYWORD_PREFILTER` e `FF_ACERVO_LLM_PREFILTER` deixaram de ser flags decorativas e passaram a controlar comportamento real de seleção de documentos do acervo.

### Bloco 2 — Caches de apoio e isolamento real por usuário
- **Arquivos:** `frontend/src/lib/generation-cache.ts`, `frontend/src/lib/generation-cache.test.ts`, `frontend/src/lib/generation-service.ts`, `frontend/src/pages/Upload.tsx`
- Cache de templates administrativos, contexto leve do acervo, ementas e classificação foi integrado ao pipeline documental e aos fluxos de upload/acervo.
- `invalidateAllGenerationCaches(uid)` passou a invalidar apenas entradas do usuário alvo, evitando vazamento cruzado entre sessões na mesma máquina.
- Reuso de ementa/classificação agora depende de `uid + docId`, mantendo compatibilidade com persistência existente e reduzindo chamadas redundantes ao LLM.

### Bloco 3 — `executionState` e state machine de handoff fim a fim
- **Arquivos:** `frontend/src/components/AgentTrailProgressModal.tsx`, `frontend/src/components/AgentTrailStateMachine.ts`, `frontend/src/lib/document-pipeline.ts`, `frontend/src/lib/document-v3-pipeline.ts`, `frontend/src/lib/notebook-pipeline-progress.ts`, `frontend/src/lib/notebook-acervo-analyzer.ts`, `frontend/src/lib/thesis-analyzer.ts`
- O handoff visual passou a respeitar estados explícitos (`queued`, `running`, `waiting_io`, `retrying`, `persisting`, `completed`, `failed`, `cancelled`) em documentos, notebook e tese.
- Trilhas do acervo/notebook/tese deixaram de inferir estado apenas por percentual ou status textual, reduzindo falsos positivos de conclusão e melhorando a explicabilidade do progresso.

### Bloco 4 — Feature flags runtime por usuário
- **Arquivos:** `frontend/src/lib/feature-flags.ts`, `frontend/src/lib/settings-store.ts`, `frontend/src/App.tsx`, `frontend/src/pages/AdminPanel.tsx`, `frontend/src/components/admin/RuntimeFeatureFlagsCard.tsx`
- Resolução das flags passou a obedecer quatro camadas: `sessionStorage > runtime do perfil (Firestore) > env > default`.
- O shell autenticado hidrata flags runtime por usuário e limpa overrides locais ao trocar de sessão.
- O Admin pessoal ganhou UI dedicada para toggles por usuário, reset por flag ao estado herdado e persistência explícita em `settings/preferences.feature_flags`.

### Bloco 5 — Cobertura focada de regressão
- **Arquivos:** `frontend/src/components/admin/RuntimeFeatureFlagsCard.test.tsx`, `frontend/src/lib/feature-flags.test.ts`, `frontend/src/lib/generation-cache.test.ts`, `frontend/src/components/AgentTrailStateMachine.test.ts`, `frontend/src/lib/pipeline-step-execution-state.test.ts`, `frontend/src/lib/thesis-analyzer.test.ts`, `frontend/src/lib/generation-service.parallel.test.ts`, `frontend/src/lib/generation-service.orchestration.test.ts`
- A cobertura agora inclui o gap que faltava: um teste de orquestração do `generateDocument()` que prova sobreposição real do `Pesquisador` com o ramo do acervo e um teste separado que prova o fallback sequencial quando o paralelo falha.

### Bloco 6 — Hardening de build e chunking
- **Arquivos:** `frontend/src/lib/chat-orchestrator/orchestrator.ts`, `frontend/src/lib/chat-orchestrator/dispatch.ts`
- O warning do Vite sobre mistura de import dinâmico e estático de `dispatch.ts` foi eliminado ao alinhar `forceFinalize()` ao mesmo caminho de import estático já usado pelo crítico e pelo registry de skills.
- O build de produção voltou a ficar limpo para este slice, sem advisory de chunking adicional no chat-orchestrator.

### Bloco 7 — Retomada real do vídeo + fechamento longitudinal por perfil no admin
- **Arquivos:** `frontend/src/lib/video-generation-pipeline.ts`, `frontend/src/lib/video-generation-pipeline.test.ts`, `frontend/src/components/VideoGenerationCostModal.tsx`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/pages/PlatformAdminPanel.tsx`, `frontend/src/lib/generation-service.orchestration.test.ts`
- O pipeline de vídeo deixou de apenas expor o checkpoint e passou a retomar de fato a partir do último passo concluído, inclusive reaproveitando pacote montado, clips, imagens e TTS já gerados.
- O modal de custo do vídeo agora distingue explicitamente `retomar` versus `recomeçar do zero`, com bloqueio de retomada quando o roteiro foi alterado.
- O painel admin passou a registrar e comparar a efetividade histórica também por perfil operacional de thresholds, permitindo que a adoção do melhor combo histórico reaplique janela, rollout e limiares do conjunto vencedor.
- O teste de orquestração do `generateDocument()` foi ajustado para voltar a compilar sem wrappers de spread incompatíveis com o `tsc`, removendo o ruído de validação local do lote atual.

### Bloco 8 — Reranking jurídico resiliente na jurisprudência
- **Arquivos:** `frontend/src/lib/datajud-service.ts`, `frontend/src/lib/datajud-service.test.ts`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/lib/v3-agents/jurisprudence-researcher.ts`
- A etapa de ranking jurisprudencial passou a aplicar sempre um ranqueamento jurídico determinístico local antes do overlay opcional com o `notebook_ranqueador_jurisprudencia`.
- JSON inválido, ranking parcial ou falha do modelo não interrompem mais a síntese: o fluxo preserva o ranking local em vez de abortar a pesquisa.
- O parsing e a mescla do ranking foram centralizados em `datajud-service.ts`, reduzindo duplicação entre notebook clássico, notebook V2 e o fluxo v3.

### Bloco 9 — Memória semântica persistente por caderno na jurisprudência
- **Arquivos:** `frontend/src/lib/datajud-service.ts`, `frontend/src/lib/datajud-service.test.ts`, `frontend/src/lib/firestore-service.ts`, `frontend/src/lib/firestore-types.ts`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.tsx`
- O notebook passou a persistir embeddings das consultas jurisprudenciais na memória dedicada `search_memory`, vinculando cada vetor à fonte `jurisprudencia` correspondente.
- A revisão manual agora recebe uma fusão semântica entre os resultados DataJud atuais e resultados históricos de fontes jurisprudenciais semanticamente próximas do mesmo caderno.
- A persistência vetorial não bloqueia o fluxo principal: ausência de chave ou falha de embeddings apenas desliga a memória semântica naquela execução, preservando a busca lexical/determinística.

---

## Arquivos Novos ou Relevantes

| Arquivo | Papel na subonda 2 |
|---------|--------------------|
| `frontend/src/lib/generation-service.ts` | Paralelização segura, fallback sequencial e integração de caches/flags no gerador documental |
| `frontend/src/lib/generation-cache.ts` | Camada de caches em memória com chaves user-scoped |
| `frontend/src/components/AgentTrailStateMachine.ts` | Máquina de estados de handoff usada pelo modal de progresso |
| `frontend/src/lib/feature-flags.ts` | Sistema de canários com precedência local/runtime/env/default |
| `frontend/src/components/admin/RuntimeFeatureFlagsCard.tsx` | Painel de toggles runtime por usuário no Admin pessoal |
| `frontend/src/lib/generation-service.orchestration.test.ts` | Cobertura focada do `generateDocument()` para overlap real e fallback do `Pesquisador` |
| `frontend/src/lib/chat-orchestrator/orchestrator.ts` | Hardening do build para remover mistura de import dinâmico/estático |
| `frontend/src/lib/video-generation-pipeline.ts` | Retomada real por checkpoint e reaproveitamento de mídia já concluída |
| `frontend/src/pages/PlatformAdminPanel.tsx` | Validação longitudinal da recomendação assistida fechada também por perfil operacional |
| `frontend/src/lib/datajud-service.ts` | Reranking jurídico compartilhado com fallback local/LLM e parsing centralizado do ranking |

---

## Feature Flags (Resumo)

**Precedência efetiva:** `sessionStorage > runtime do perfil > env > default`

| Flag | Padrão | Descrição |
|------|--------|-----------|
| `FF_PARALLEL_ACERVO` | ON | Pré-carrega documentos do acervo em paralelo com a triagem |
| `FF_PARALLEL_PESQUISADOR` | ON | Inicia o `Pesquisador` em background após a triagem e sincroniza após o ramo do acervo |
| `FF_EMENTA_WARMUP_EXTENDED` | ON | Aumenta o budget de warm-up das ementas para 5s |
| `FF_EMENTA_CACHE` | ON | Reusa ementas já geradas no acervo durante a sessão |
| `FF_CLASSIFICACAO_CACHE` | ON | Reusa classificação/tags de acervo durante a sessão |
| `FF_TEMPLATE_CACHE` | ON | Reusa estruturas administrativas e tipos documentais do usuário |
| `FF_HANDOFF_STATE_MACHINE` | ON | Ativa a state machine explícita de handoff nas trilhas de progresso |
| `FF_DOC_REDATOR_10K` | **OFF** | Mantém o rollout conservador do Redator em 10k com fallback por qualidade |
| `FF_ACERVO_LLM_PREFILTER` | ON | Liga/desliga o buscador LLM na etapa de seleção do acervo |
| `FF_ACERVO_KEYWORD_PREFILTER` | ON | Liga/desliga o pré-filtro determinístico por palavras-chave |
| `FF_THESIS_PREFETCH` | ON | Prefetch de teses antes da etapa de pesquisa jurídica |

---

## Validação Local Executada

- ✅ `npm run typecheck` (exit code `0`)
- ✅ `npm run test -- src/components/admin/RuntimeFeatureFlagsCard.test.tsx src/lib/feature-flags.test.ts`
- ✅ `npm run test -- src/lib/generation-cache.test.ts`
- ✅ `npm run test -- src/components/AgentTrailStateMachine.test.ts`
- ✅ `npm run test -- src/lib/pipeline-step-execution-state.test.ts`
- ✅ `npm run test -- src/lib/thesis-analyzer.test.ts`
- ✅ `npm run test -- src/lib/generation-service.parallel.test.ts`
- ✅ `npm run test -- src/lib/generation-service.orchestration.test.ts`
- ✅ `npm run test -- src/lib/datajud-service.test.ts` (**73/73**)
- ✅ `npm run test -- src/lib/video-generation-pipeline.test.ts`
- ✅ `npm run build`
- ✅ `npm run preview -- --host 127.0.0.1 --port 4173` + smoke público básico do bundle até `/login`
- ✅ `get_errors` limpo em `frontend/` após a integração da memória semântica
- ✅ `npm run build:smoke` + `npm run preview:smoke` com override local (`VITE_FORCE_DEMO_MODE=true`) e login fixo validado ponta a ponta: rejeição de senha incorreta, login bem-sucedido, dashboard carregado, admin em empty-state seguro e notebook V2 em fallback smoke
- ℹ️ Revalidação com Firebase Auth real permaneceu fora deste closeout; o objetivo desta rodada foi destravar o smoke local sem depender do Console/Firebase externo

---

## Próximos Passos

1. Fechar a trilha operacional do lote atual com commit, push e deploy.
2. Revalidar o lote com Firebase Auth real apenas se for necessário um smoke de integração contra a infra produtiva, não como bloqueador do closeout local.

---

## Rollback Plan

Caso a Subonda 2 apresente regressão em produção:
1. Desligar `FF_PARALLEL_PESQUISADOR`, `FF_PARALLEL_ACERVO` ou qualquer flag canário diretamente no perfil do usuário afetado ou via sessão local para diagnóstico rápido.
2. Se necessário, reverter globalmente para env/default sem redeploy funcional, removendo overrides runtime persistidos no Firestore.
3. Os caches continuam somente em memória de sessão; um refresh limpa estado não persistido e reduz risco de stale data duradouro.
4. O caminho sequencial continua preservado como fallback explícito para acervo e `Pesquisador`.

---

## Aprovação

- [ ] Code Review
- [ ] Revalidacao final do typecheck CLI do lote atual
- [x] Build de produção passa (`npm run build`)
- [x] Testes focados da subonda 2 passam
- [x] Smoke test manual local autenticado (modo smoke/demo)
- [ ] Commit/push/deploy do lote atual
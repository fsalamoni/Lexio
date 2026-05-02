# Subonda 2 — Closeout da Release

**Data:** 02/05/2026
**Versão:** v0.8.0-subonda2
**Status:** ✅ Implementado (pendente validação de build)

---

## Resumo da Release

A **Subonda 2** introduz otimizações de performance, resiliência e controle canário no pipeline de geração de documentos jurídicos da Lexio. O foco principal é reduzir a latência percebida pelo usuário através de paralelização segura, caching em memória, e uma máquina de estados explícita para o handoff visual dos agentes.

---

## Blocos Implementados

### Bloco 1 — Ampliação da Paralelização Segura
- **Arquivo:** `frontend/src/components/generation-pipeline-v2.ts`
- O `AcervoAnalista` e a `TriagemAnalista` agora rodam em paralelo
- O `Pesquisador` roda em paralelo com `Compilador` + `Revisor`
- O disparo do `Redator` é consolidado com `waitForAll([ementa, pesquisa])`
- Fallback sequencial se o paralelo falhar (flag-controlled)
- Timeout de segurança: 4s (ementa) / 6s (pesquisa)

### Bloco 2 — Caches de Apoio em Memória
- **Arquivo:** `frontend/src/lib/generation-cache.ts`
- Cache por usuário+documento para: ementas (1h TTL), classificação (1h TTL), templates (24h TTL)
- Cache de tipos documentais administrativos (10min TTL)
- Cache de contexto do acervo (2min TTL)
- Invalidação em bulk por usuário e global
- Integrado com feature flags `FF_EMENTA_CACHE`, `FF_CLASSIFICACAO_CACHE`, `FF_TEMPLATE_CACHE`

### Bloco 3 — State Machine de Handoff no Progresso
- **Arquivo:** `frontend/src/components/AgentTrailStateMachine.ts`
- Estados explícitos: `idle → running ↔ waiting_io → completed | error`
- Derivação de `HandoffState` (previous | active | incoming)
- Guardas `isTerminal` e `isActive`
- Conversão de `PipelineExecutionState` → `AgentState`
- Mensagens interpoladas por transição para feedback contextual

### Bloco 4 — Feature Flags de Canário
- **Arquivo:** `frontend/src/lib/feature-flags.ts`
- 11 feature flags definidas com metadados (label, descrição, envVar, defaultEnabled)
- Resolução em 3 camadas: sessionStorage > env var > default
- Flags críticas: `FF_PARALLEL_ACERVO`, `FF_PARALLEL_PESQUISADOR`, `FF_DOC_REDATOR_10K` (desligada por padrão)
- Suporte a dev toggle via `sessionStorage`
- Funções auxiliares: `isEnabled`, `setFlagOverride`, `clearFlagOverride`, `getFlagState`, `listAllFlags`

---

## Novos Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `frontend/src/components/generation-pipeline-v2.ts` | Pipeline paralelo v2 |
| `frontend/src/lib/generation-cache.ts` | Caches em memória |
| `frontend/src/components/AgentTrailStateMachine.ts` | Máquina de estados de handoff |
| `frontend/src/lib/feature-flags.ts` | Sistema de feature flags canário |

---

## Feature Flags (Resumo)

| Flag | Padrão | Descrição |
|------|--------|-----------|
| `FF_PARALLEL_ACERVO` | ON | Acervo + Triagem em paralelo |
| `FF_PARALLEL_PESQUISADOR` | ON | Pesquisador paralelo com Compilador |
| `FF_EMENTA_WARMUP_EXTENDED` | ON | Warm-up estendido (5s) |
| `FF_EMENTA_CACHE` | ON | Cache de ementas |
| `FF_CLASSIFICACAO_CACHE` | ON | Cache de classificação |
| `FF_TEMPLATE_CACHE` | ON | Cache de templates |
| `FF_HANDOFF_STATE_MACHINE` | ON | State machine no progresso |
| `FF_DOC_REDATOR_10K` | **OFF** | Redator 10k (canário conservador) |
| `FF_ACERVO_LLM_PREFILTER` | ON | Pré-filtro LLM do acervo |
| `FF_ACERVO_KEYWORD_PREFILTER` | ON | Pré-filtro por keywords |
| `FF_THESIS_PREFETCH` | ON | Prefetch de teses |

---

## Próximos Passos (pós-closeout)

1. **Validação local:** Rodar `npm run typecheck` e `npm run build` no frontend
2. **Integração:** Conectar os novos arquivos aos componentes existentes (`LexioAgentTrail`, `AgentTrailProgressModal`, `useAgentTrail`)
3. **Rollout canário:** Ativar `FF_DOC_REDATOR_10K` progressivamente (10% → 50% → 100%)
4. **Monitoramento:** Adicionar métricas de tempo de geração (p50, p95, p99) no analytics
5. **Testes:** Escrever unit tests para o state machine e caches

---

## Rollback Plan

Caso a Subonda 2 apresente regressão em produção:
1. Desligar `FF_PARALLEL_ACERVO` e `FF_PARALLEL_PESQUISADOR` via Firestore remote config (reverte ao pipeline sequencial da Subonda 1)
2. Se o problema persistir, desligar todas as flags via deploy de emergência com defaults = false
3. Os caches são somente em memória — limpam no refresh, sem risco de stale data persistente

---

## Aprovação

- [ ] Code Review
- [ ] Typecheck passa (`npm run typecheck`)
- [ ] Build de produção passa (`npm run build`)
- [ ] Testes unitários passam
- [ ] Smoke test manual
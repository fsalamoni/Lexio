# Caderno de Pesquisa — Status de Implementacao (NotebookLM+)

> Documento de tracking para agentes IA. Atualizado automaticamente.
> Branch: `main`

---

## Status Geral: Etapas 1-329 IMPLEMENTADAS

### Etapas 326-329 — Closeout Operacional da Wave 38 (Release One-shot) ✅
- **Arquivos**: `.github/workflows/release-web.yml`, `docs/release/WEB_RELEASE_INDEX.md`, `docs/release/WEB_RELEASE_CACHE.md`, `docs/PLANO.md`, `docs/MANIFEST.json`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`, `docs/release/CROSS_PLATFORM_HANDOFF.md`
- Etapa 326: trilha de Git da wave fechada no `main` com commit/push funcional `f5cbf57` (política progressiva por criticidade + guardrails preditivos), mantendo baseline remota alinhada antes do release.
- Etapa 327: release one-shot disparado em `release-web.yml` (run `24933092299`) no HEAD `f5cbf57f47f9640f3f071ea59f520afe081eab26` com `deploy_firebase=true`, `deploy_github_pages=true` e `deploy_redesign_v2=false`.
- Etapa 328: quality gates e deploys confirmados em sucesso na mesma run: source guardrails (`73013994216`), frontend quality (`73013994220`), lint (`73013994224`), unit tests (`73013994226`), functions quality (`73013994229`), Firebase production (`73014056225`), Pages build (`73014056272`), Pages deploy (`73014131480`) e release summary (`73014216569`); redesign V2 mantido como skip por input (`73014056331`).
- Etapa 329: fechamento final de governança/index/cache/handoff sincronizado com IDs reais da run `24933092299`, mantendo continuidade cross-platform pronta para a próxima wave.

### Etapas 322-325 — Política Progressiva por Criticidade + Guardrails Preditivos (Wave 38) ✅
- **Arquivos**: `frontend/src/lib/firestore-types.ts`, `frontend/src/lib/firestore-service.ts`, `frontend/src/pages/PlatformAdminPanel.tsx`, `docs/PLANO.md`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`, `docs/MANIFEST.json`
- Etapa 322: `firestore-types.ts` recebeu os contratos da política progressiva por função (`PlatformFunctionRolloutRecommendation`, `PlatformFunctionRolloutRiskLevel`, `PlatformFunctionRolloutGuardrails`, `PlatformFunctionRolloutPolicyRow`, `PlatformFunctionRolloutPolicyPlan`) para leitura tipada de risco e recomendação.
- Etapa 323: `firestore-service.ts` foi ampliado com `getPlatformFunctionRolloutPolicyPlan(...)`, computando tendência de pressão por função, streaks de aderência, risco por criticidade e recomendação progressiva (`tighten_now`/`tighten_guarded`/`hold`/`relax_guarded`) com guardrails operacionais.
- Etapa 324: `PlatformAdminPanel.tsx` integrou o bloco executivo Wave 38 (resumo por recomendação, tabela de risco/recomendação por função, alertas preditivos de drift combinado retry+waiting I/O e recomendações acionáveis), preservando a demonstração multiagente em produção.
- Etapa 325: validação local completa executada sem regressões: `npm run typecheck`, `npm run test -- --run` (**38/38 arquivos**, **299/299 testes**), `npm run build`, `functions npm run build`, `pytest` (**2203/2203**) e `get_errors` limpo nos arquivos alterados.

### Etapas 318-321 — Closeout Operacional da Wave 37 (Release One-shot) ✅
- **Arquivos**: `.github/workflows/release-web.yml`, `docs/release/WEB_RELEASE_INDEX.md`, `docs/release/WEB_RELEASE_CACHE.md`, `docs/PLANO.md`, `docs/MANIFEST.json`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`, `docs/release/CROSS_PLATFORM_HANDOFF.md`
- Etapa 318: trilha de Git da wave fechada no `main` com commit/push funcional `db87300` (aderência diária live vs alvo por função + recomendações de rollout assistido), mantendo baseline remota alinhada antes do release.
- Etapa 319: release one-shot disparado em `release-web.yml` (run `24930689755`) no HEAD `db87300835afd3823f478974d9a345a68e300540` com `deploy_firebase=true`, `deploy_github_pages=true` e `deploy_redesign_v2=false`.
- Etapa 320: quality gates e deploys confirmados em sucesso na mesma run: lint (`73007836380`), unit tests (`73007836384`), source guardrails (`73007836385`), frontend quality (`73007836396`), functions quality (`73007836430`), Firebase production (`73007901714`), Pages build (`73007901743`), Pages deploy (`73007952932`) e release summary (`73008038665`); redesign V2 mantido como skip por input (`73007901740`).
- Etapa 321: fechamento final de governança/index/cache/handoff sincronizado com IDs reais da run `24930689755`, mantendo continuidade cross-platform pronta para a próxima wave.

### Etapas 314-317 — Aderência Diária Live vs Alvo por Função (Wave 37) ✅
- **Arquivos**: `frontend/src/lib/firestore-types.ts`, `frontend/src/lib/firestore-service.ts`, `frontend/src/pages/PlatformAdminPanel.tsx`, `docs/PLANO.md`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`, `docs/MANIFEST.json`
- Etapa 314: `firestore-types.ts` recebeu contratos de aderência diária por função (`PlatformFunctionTargetAdherenceStatus`, `PlatformFunctionTargetAdherenceRow`, `PlatformFunctionTargetAdherenceDailyPoint`) para leitura tipada de status live versus alvo.
- Etapa 315: `firestore-service.ts` foi ampliado com `getPlatformFunctionTargetAdherenceDaily(...)`, agregando por dia pressão live/alvo, cobertura de funções monitoradas e classificação (`above_target`/`aligned`/`below_target`) com base no plano adaptativo vigente.
- Etapa 316: `PlatformAdminPanel.tsx` integrou novo bloco executivo de aderência diária (cards de estabilidade/cobertura, tabela de funções live/alvo, tendência de 7 dias e recomendações de rollout assistido), preservando a demonstração multiagente em produção.
- Etapa 317: validação local completa executada sem regressões: `npm run typecheck`, `npm run test -- --run` (**38/38 arquivos**, **299/299 testes**), `npm run build`, `functions npm run build`, `pytest -q` (**2203/2203**) e `get_errors` limpo nos arquivos alterados.

### Etapas 310-313 — Closeout Operacional da Wave 36 (Release One-shot) ✅
- **Arquivos**: `.github/workflows/release-web.yml`, `docs/release/WEB_RELEASE_INDEX.md`, `docs/release/WEB_RELEASE_CACHE.md`, `docs/PLANO.md`, `docs/MANIFEST.json`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`, `docs/release/CROSS_PLATFORM_HANDOFF.md`
- Etapa 310: trilha de Git da wave fechada no `main` com commit/push funcional `cfdb2ac` (calibração adaptativa por função + sinais live da demonstração), mantendo baseline remota alinhada antes do release.
- Etapa 311: release one-shot disparado em `release-web.yml` (run `24919950308`) no HEAD `cfdb2acdfbce1eceb8a4aaf7417db1b5d9da7abf` com `deploy_firebase=true`, `deploy_github_pages=true` e `deploy_redesign_v2=false`.
- Etapa 312: quality gates e deploys confirmados em sucesso na mesma run: unit tests (`72979425700`), functions quality (`72979425703`), source guardrails (`72979425705`), frontend quality (`72979425706`), lint (`72979425707`), Firebase production (`72979501786`), Pages build (`72979501863`), Pages deploy (`72979567744`) e release summary (`72979652973`); redesign V2 mantido como skip por input (`72979501818`).
- Etapa 313: fechamento final de governança/index/cache/handoff sincronizado com IDs reais da run `24919950308`, mantendo continuidade cross-platform pronta para a próxima wave.

### Etapas 306-309 — Calibração Adaptativa por Função + Demonstração Live (Wave 36) ✅
- **Arquivos**: `frontend/src/lib/firestore-types.ts`, `frontend/src/lib/firestore-service.ts`, `frontend/src/pages/PlatformAdminPanel.tsx`, `docs/PLANO.md`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`, `docs/MANIFEST.json`
- Etapa 306: `firestore-types.ts` recebeu os contratos de calibração por função (`PlatformFunctionCalibrationRow`, `PlatformFunctionCalibrationAction`, `PlatformFunctionCalibrationPriority`) para leitura tipada de plano adaptativo.
- Etapa 307: `firestore-service.ts` foi ampliado com `getPlatformFunctionCalibrationPlan(...)`, gerando score de risco por função, prioridade, ação recomendada (`tighten`/`maintain`/`relax`) e alvos para retry/fallback/waiting I/O a partir da janela atual versus anterior.
- Etapa 308: `PlatformAdminPanel.tsx` integrou o novo bloco executivo de calibração por função (cards, tabela de alvos, recomendações automáticas) e conectou sinais live da demonstração multiagente com status por função (acima/alinhado/abaixo do alvo).
- Etapa 309: validação local completa executada sem regressões: `npm run typecheck`, `npm run test -- --run` (**38/38 arquivos**, **299/299 testes**), `npm run build`, `functions npm run build`, `pytest -q` (**2203/2203**) e `get_errors` limpo nos arquivos alterados.

### Etapas 302-305 — Closeout Operacional da Wave 35 (Release One-shot) ✅
- **Arquivos**: `.github/workflows/release-web.yml`, `docs/release/WEB_RELEASE_INDEX.md`, `docs/release/WEB_RELEASE_CACHE.md`, `docs/PLANO.md`, `docs/MANIFEST.json`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`, `docs/release/CROSS_PLATFORM_HANDOFF.md`
- Etapa 302: trilha de Git da wave confirmada no `main` com commit/push funcional `cf5b673` (comparativo diário por função), mantendo base remota alinhada antes do fechamento de release.
- Etapa 303: release one-shot disparado em `release-web.yml` (run `24919036006`) no HEAD `cf5b6736331bce1b57f162cda2cb6d8a388723c0` com `deploy_firebase=true`, `deploy_github_pages=true` e `deploy_redesign_v2=false`.
- Etapa 304: quality gates e deploys confirmados em sucesso na mesma run: frontend quality (`72976871261`), functions quality (`72976871264`), unit tests (`72976871272`), lint (`72976871275`), source guardrails (`72976871279`), Firebase production (`72976938644`), Pages build (`72976938671`), Pages deploy (`72977011670`) e release summary (`72977113533`); redesign V2 mantido como skip por input (`72976938808`).
- Etapa 305: fechamento final de governança/index/cache/handoff sincronizado com IDs reais da run `24919036006`, preservando o pacote de continuidade cross-platform para o próximo ciclo.

### Etapas 298-301 — Comparativo Diário por Função (Wave 35) ✅
- **Arquivos**: `frontend/src/lib/firestore-types.ts`, `frontend/src/lib/firestore-service.ts`, `frontend/src/pages/PlatformAdminPanel.tsx`, `docs/PLANO.md`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`, `docs/release/WEB_RELEASE_INDEX.md`, `docs/MANIFEST.json`
- Etapa 298: `firestore-types.ts` recebeu o contrato `PlatformFunctionWindowComparisonRow` para leitura tipada da comparação de funções entre janela atual e anterior.
- Etapa 299: `firestore-service.ts` foi ampliado com `getPlatformFunctionWindowComparison(...)`, agregando por função chamadas/custo/latência/retry/fallback/waiting I/O com deltas percentuais entre janelas consecutivas.
- Etapa 300: `PlatformAdminPanel.tsx` integrou o comparativo por função com nova seção executiva (cards de deltas, tabela por função e recomendações acionáveis de tuning fino), preservando a demonstração operacional multiagente já existente.
- Etapa 301: validação local completa executada sem regressões: `npm run typecheck`, `npm run test -- --run` (**38/38 arquivos**, **299/299 testes**), `npm run build`, `functions npm run build` e `get_errors` limpo nos arquivos alterados.

### Etapas 294-297 — Closeout Operacional da Wave 34 (Release One-shot) ✅
- **Arquivos**: `.github/workflows/release-web.yml`, `docs/release/WEB_RELEASE_INDEX.md`, `docs/release/WEB_RELEASE_CACHE.md`, `docs/PLANO.md`, `docs/MANIFEST.json`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`, `docs/release/CROSS_PLATFORM_HANDOFF.md`
- Etapa 294: trilha de Git da wave fechada sem divergência remota (`git pull --rebase --autostash origin main`), seguida de commit/push no `main` (`4cc2432`) com comparativo diário por `execution_state` no serviço e no painel admin.
- Etapa 295: release one-shot disparado em `release-web.yml` (run `24917777336`) no HEAD `4cc243275372248f983d5cf7c64c54231b925582` com `deploy_firebase=true`, `deploy_github_pages=true` e `deploy_redesign_v2=false`.
- Etapa 296: quality gates e deploys confirmados em sucesso na mesma run: lint (`72973180460`), functions quality (`72973180461`), frontend quality (`72973180463`), unit tests (`72973180467`), source guardrails (`72973180468`), Firebase production (`72973266685`), Pages build (`72973266761`), Pages deploy (`72973349766`) e release summary (`72973480926`); redesign V2 mantido como skip por input (`72973266829`).
- Etapa 297: fechamento final de governança/index/cache/handoff concluído com IDs reais da run `24917777336`, mantendo pacote de continuidade cross-platform sincronizado no `main`.

### Etapas 290-293 — Comparativo Diário por Estado de Execução (Wave 34) ✅
- **Arquivos**: `frontend/src/lib/firestore-types.ts`, `frontend/src/lib/firestore-service.ts`, `frontend/src/pages/PlatformAdminPanel.tsx`, `docs/PLANO.md`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`, `docs/release/WEB_RELEASE_INDEX.md`, `docs/MANIFEST.json`
- Etapa 290: `firestore-types.ts` recebeu contratos tipados para análise diária por estado (`PlatformExecutionStateDailyPoint`) e comparação de janelas operacionais (`PlatformExecutionStateWindowComparisonRow`), preparando o admin para leitura temporal de drift por `execution_state`.
- Etapa 291: `firestore-service.ts` foi ampliado com `getPlatformExecutionStateDaily(...)` e `getPlatformExecutionStateWindowComparison(...)`, agregando chamadas/custo/latência/retry/fallback por estado no recorte diário e no comparativo entre janela atual e anterior.
- Etapa 292: `PlatformAdminPanel.tsx` integrou os novos agregados com painel executivo de comparação diária (deltas de chamadas/custo, tabela por estado, histórico dos últimos 7 dias e recomendações acionáveis orientadas ao desvio entre janelas).
- Etapa 293: validação local completa executada sem regressões: `npm run typecheck`, `npm run test -- --run` (**38/38 arquivos**, **299/299 testes**), `npm run build`, `functions npm run build` e `get_errors` limpo nos arquivos alterados.

### Etapas 286-289 — Closeout Operacional da Wave 33 (Release One-shot) ✅
- **Arquivos**: `.github/workflows/release-web.yml`, `docs/release/WEB_RELEASE_INDEX.md`, `docs/release/WEB_RELEASE_CACHE.md`, `docs/PLANO.md`, `docs/MANIFEST.json`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`, `docs/release/CROSS_PLATFORM_HANDOFF.md`
- Etapa 286: trilha de Git da wave fechada sem divergência remota (`git pull --rebase --autostash origin main`), seguida de commit/push no `main` (`80dc5c6`) com calibração automática por função e telemetria operacional enriquecida.
- Etapa 287: release one-shot disparado em `release-web.yml` (run `24917396554`) no HEAD `80dc5c69177702a87201d60179dbcbdbb3826de3` com `deploy_firebase=true`, `deploy_github_pages=true` e `deploy_redesign_v2=false`.
- Etapa 288: quality gates e deploys confirmados em sucesso na mesma run: functions quality (`72972033397`), source guardrails (`72972033399`), lint (`72972033400`), unit tests (`72972033411`), frontend quality (`72972033424`), Firebase production (`72972122974`), Pages build (`72972123057`), Pages deploy (`72972206796`) e release summary (`72972336724`); redesign V2 mantido como skip por input (`72972123010`).
- Etapa 289: fechamento final de governança/index/cache concluído com IDs reais da run `24917396554`, mantendo pacote de handoff atualizado para continuidade operacional.

### Etapas 282-285 — Calibração Automática por Função + Telemetria Operacional (Wave 33) ✅
- **Arquivos**: `frontend/src/lib/generation-service.ts`, `frontend/src/pages/PlatformAdminPanel.tsx`, `docs/PLANO.md`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`, `docs/MANIFEST.json`, `docs/release/WEB_RELEASE_INDEX.md`, `docs/release/WEB_RELEASE_CACHE.md`
- Etapa 282: `generation-service.ts` passou a persistir metadados operacionais (`execution_state`, `retry_count`, `used_fallback`, `fallback_from`) para execuções de geração documental, acervo e context detail, alinhando telemetry write-path ao novo contrato de retries/fallbacks do `llm-client`.
- Etapa 283: `PlatformAdminPanel.tsx` ampliado com tuning orientado por risco operacional: amostra recente aumentada para 120 execuções, tabela de confiabilidade por função (retry/fallback/waiting I/O/latência/USD sob risco) e plano automático de recomendação por `execution_state`.
- Etapa 284: validação local completa sem regressões: `npm run typecheck`, `npm run test -- --run` (**38/38 arquivos**, **299/299 testes**), `npm run build`, `functions npm run build` e `get_errors` limpo nos arquivos alterados.
- Etapa 285: governança da wave atualizada em planejamento/index/cache com registro explícito do bloco de calibração operacional e preparação para closeout one-shot de release.

### Etapas 278-281 — Closeout Operacional da Wave 32 (Release One-shot) ✅
- **Arquivos**: `.github/workflows/release-web.yml`, `docs/release/WEB_RELEASE_INDEX.md`, `docs/release/WEB_RELEASE_CACHE.md`, `docs/PLANO.md`, `docs/MANIFEST.json`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`
- Etapa 278: trilha de Git da wave confirmada e publicada no `main` com commit funcional `7b2d321` (demonstração multiagente + latência por estado) sem divergência remota.
- Etapa 279: release one-shot disparado em `release-web.yml` (run `24859770023`) no HEAD `7b2d3213baa57b2a54ea39906b7feb1f145a0c3d` com `deploy_firebase=true`, `deploy_github_pages=true` e `deploy_redesign_v2=false`.
- Etapa 280: quality gates e deploys confirmados em sucesso na mesma run: lint (`72782091769`), source guardrails (`72782091795`), unit tests (`72782091782`), functions quality (`72782091775`), frontend quality (`72782091797`), Firebase production (`72782268742`), Pages build (`72782268873`), Pages deploy (`72782441213`) e release summary (`72782695792`); redesign V2 mantido como skip por input (`72782269072`).
- Etapa 281: fechamento final de governança/index/cache concluído com IDs reais da run `24859770023` e sincronização documental no `main`, deixando o repositório pronto para continuidade em outra plataforma.

### Etapas 274-277 — Demonstração Multiagente + Latência Operacional (Wave 32) ✅
- **Arquivos**: `frontend/src/lib/firestore-service.ts`, `frontend/src/pages/PlatformAdminPanel.tsx`, `frontend/src/pages/CostTokensPage.tsx`, `frontend/src/pages/PlatformCostsPage.tsx`
- Etapa 274: `firestore-service.ts` recebeu helper central de extração das execuções agregadas de plataforma e nova função `getPlatformRecentAgentExecutions`, eliminando duplicação entre custo agregado e série diária.
- Etapa 275: `PlatformAdminPanel.tsx` foi ampliado com seção de demonstração dos agentes em execução real (amostra recente com estado/fase/retry/fallback/modelo) e bloco de impacto por `execution_state` com hotspots função+estado orientados a tuning.
- Etapa 276: `CostTokensPage.tsx` e `PlatformCostsPage.tsx` passaram a exibir `Duração média` nas tabelas de breakdown, fechando leitura operacional conjunta de custo/tokens/latência.
- Etapa 277: validação local completa executada sem regressões: `npm run typecheck`, `npm run test -- --run` (**38/38 arquivos**, **290/290 testes**), `npm run build` e checagem de Problems (`get_errors`) limpa nos arquivos alterados.

### Etapas 270-273 — Closeout Operacional da Wave 31 (Release One-shot) ✅
- **Arquivos**: `.github/workflows/release-web.yml`, `docs/release/WEB_RELEASE_INDEX.md`, `docs/release/WEB_RELEASE_CACHE.md`, `docs/PLANO.md`, `docs/MANIFEST.json`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`
- Etapa 270: trilha de Git da wave fechada sem divergência remota (`git pull --rebase --autostash origin main`), seguida de commit/push no `main` (`9c02d57`) com analytics por estado de execução e governança local sincronizada.
- Etapa 271: release one-shot disparado em `release-web.yml` (run `24857074922`) no HEAD `9c02d5771fffb70c4f4f1bcd19567a78c25809d9` com `deploy_firebase=true`, `deploy_github_pages=true` e `deploy_redesign_v2=false`.
- Etapa 272: quality gates e deploys confirmados em sucesso na mesma run: functions quality (`72772645831`), source guardrails (`72772645844`), lint (`72772645851`), unit tests (`72772645862`), frontend quality (`72772645893`), Firebase production (`72772882122`), Pages build (`72772882211`), Pages deploy (`72773090237`) e release summary (`72773344525`); redesign V2 mantido como skip por input (`72772882473`).
- Etapa 273: fechamento final de governança/index/cache concluído com IDs reais da run `24857074922` e atualização de ciclo em `PLANO`, `MANIFEST`, `WEB_RELEASE_INDEX`, `WEB_RELEASE_CACHE` e neste status de implementação.

### Etapas 266-269 — Analytics por Estado de Execução em Custos (Wave 31) ✅
- **Arquivos**: `frontend/src/lib/cost-analytics.ts`, `frontend/src/lib/notebook-studio-pipeline.ts`, `frontend/src/lib/audio-generation-pipeline.ts`, `frontend/src/lib/presentation-generation-pipeline.ts`, `frontend/src/lib/video-generation-pipeline.ts`, `frontend/src/lib/literal-video-production.ts`, `frontend/src/lib/notebook-acervo-analyzer.ts`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/pages/CostTokensPage.tsx`, `frontend/src/pages/PlatformCostsPage.tsx`
- Etapa 266: `cost-analytics.ts` foi ampliado com `execution_state`, `retry_count`, `used_fallback` e `fallback_from` em `UsageExecutionRecord`, incluindo inferência retrocompatível por fase/retry e novos agregados `by_execution_state` e `by_execution_state_per_function`.
- Etapa 267: pipelines auxiliares e fluxos de persistência do notebook passaram a propagar metadados operacionais completos (estado/retry/fallback) em estúdio, áudio, apresentação, vídeo literal e análise de acervo, preservando rastreabilidade ponta a ponta nas execuções salvas.
- Etapa 268: dashboards de custos pessoal e agregado foram atualizados para consumir a nova dimensão por estado de execução, com tabela dedicada no `CostTokensPage.tsx` (global + por seção) e gráfico+tabela no `PlatformCostsPage.tsx`.
- Etapa 269: validação local completa executada sem regressões: `npm run typecheck`, `npm run test -- --run` (**38/38 arquivos**, **290/290 testes**), `npm run build` e `get_errors` sem problemas.

### Etapas 262-265 — Closeout Operacional da Wave 30 (Release One-shot) ✅
- **Arquivos**: `.github/workflows/release-web.yml`, `docs/release/WEB_RELEASE_INDEX.md`, `docs/release/WEB_RELEASE_CACHE.md`, `docs/PLANO.md`, `docs/MANIFEST.json`, `NOTEBOOK_IMPLEMENTATION_STATUS.md`
- Etapa 262: trilha de Git da wave fechada sem divergência remota (`git pull --rebase --autostash origin main`), seguida de commit/push no `main` (`681c767`) com propagação explícita de `executionState` em pipelines auxiliares e sincronização de governança local.
- Etapa 263: release one-shot disparado em `release-web.yml` (run `24854808367`) no HEAD `681c767a60c410e763254af40168a0e59ef40d3a` com `deploy_firebase=true`, `deploy_github_pages=true` e `deploy_redesign_v2=false`.
- Etapa 264: quality gates e deploys confirmados em sucesso na mesma run: unit tests (`72764708955`), lint (`72764708923`), frontend quality (`72764708962`), functions quality (`72764708956`), source guardrails (`72764708940`), Firebase production (`72764941682`), Pages build (`72764941896`), Pages deploy (`72765128773`) e release summary (`72765376017`); redesign V2 mantido como skip por input (`72764942409`).
- Etapa 265: fechamento final de governança/index/cache concluído com IDs reais da run `24854808367` e avanço de ciclo em `PLANO`, `MANIFEST`, `WEB_RELEASE_INDEX`, `WEB_RELEASE_CACHE` e neste status de implementação.

### Etapas 258-261 — ExecutionState Explícito em Pipelines Auxiliares (Wave 30) ✅
- **Arquivos**: `frontend/src/lib/notebook-studio-pipeline.ts`, `frontend/src/lib/audio-generation-pipeline.ts`, `frontend/src/lib/presentation-generation-pipeline.ts`, `frontend/src/lib/video-pipeline-progress.ts`, `frontend/src/lib/video-generation-pipeline.ts`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/lib/video-pipeline-progress.test.ts`
- Etapa 258: `StudioProgressMeta` foi ampliado com `executionState` explícito no núcleo do estúdio (`notebook-studio-pipeline.ts`) e propagado também em `audio-generation-pipeline.ts` e `presentation-generation-pipeline.ts`, incluindo emissão explícita já no início das etapas longas.
- Etapa 259: contrato de progresso de vídeo endurecido em `video-pipeline-progress.ts` com `executionState` obrigatório no estado agregado e resolução semântica por fase (`running`, `waiting_io`, `retrying` e override explícito quando informado).
- Etapa 260: `video-generation-pipeline.ts` passou a publicar metadados de `executionState` para lotes de mídia (imagem/TTS), enquanto `ResearchNotebook.tsx` e `ResearchNotebookV2.tsx` migraram o TaskManager para consumir estado explícito vindo do progresso, removendo dependência local de inferência por `retryCount`.
- Etapa 261: cobertura regressiva adicionada em `video-pipeline-progress.test.ts` e validação local completa executada com sucesso: `npm run typecheck`, `npm run test -- --run` (**38/38 arquivos**, **290/290 testes**) e `npm run build` em `frontend/`.

### Etapas 254-257 — Closeout Operacional da Wave 29 (Release One-shot) ✅
- **Arquivos**: `.github/workflows/release-web.yml`, `docs/release/WEB_RELEASE_INDEX.md`, `docs/release/WEB_RELEASE_CACHE.md`, `docs/PLANO.md`, `docs/MANIFEST.json`, `README.md`
- Etapa 254: trilha de Git da wave fechada sem divergência remota (`git pull --rebase --autostash origin main`), seguida de commit/push no `main` (`5bf59c4`) com hardening de execution-state e sincronização de governança.
- Etapa 255: release one-shot disparado em `release-web.yml` (run `24853129457`) no HEAD `5bf59c4cc20f71f3efe268d3be2e7f185f6c5549` com `deploy_firebase=true`, `deploy_github_pages=true` e `deploy_redesign_v2=false`.
- Etapa 256: quality gates e deploys confirmados em sucesso na mesma run: unit tests (`72758770511`), lint (`72758770554`), frontend quality (`72758770593`), functions quality (`72758770600`), source guardrails (`72758770628`), Firebase production (`72758972612`), Pages build (`72758972753`) e Pages deploy (`72759201251`); redesign V2 mantido como skip por input (`72758972846`).
- Etapa 257: fechamento final de governança/index/cache concluído com IDs reais de execução em `WEB_RELEASE_INDEX.md`/`WEB_RELEASE_CACHE.md`, atualização de progresso no `PLANO.md` e catálogo de estado em `MANIFEST.json`, além de runbook operacional no `README.md`.

### Etapas 248-253 — Contrato Explícito de Execução + Otimização de Latência 2A ✅
- **Arquivos**: `frontend/src/lib/pipeline-execution-contract.ts`, `frontend/src/lib/document-pipeline.ts`, `frontend/src/lib/generation-service.ts`, `frontend/src/pages/NewDocument.tsx`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/contexts/TaskManagerContext.tsx`, `frontend/src/lib/video-pipeline-progress.ts`
- Etapa 248: o contrato de progresso documental foi endurecido com `executionState` explícito no payload (`document-pipeline.ts`) e emissão semântica em `generation-service.ts` para estados intermediários (`waiting_io`, `retrying`, `persisting`) e finalização (`completed`).
- Etapa 249: o caminho crítico inicial do gerador documental foi otimizado com paralelização segura de dependências independentes (`getOpenRouterKey`, `loadDocumentAgentModels`, `loadAdminDocumentTypes`) em `Promise.all`.
- Etapa 250: prefetch de teses passou a iniciar antes do pipeline de acervo em `generation-service.ts`, permitindo sobreposição de latência entre trilhas independentes sem alterar fallback de qualidade.
- Etapa 251: wrappers de tarefa no cliente passaram a emitir `executionState` explícito em `NewDocument.tsx`, `ResearchNotebook.tsx` e `ResearchNotebookV2.tsx`, alinhando `TaskManagerContext.tsx` ao contrato canônico para `queued/running/retrying/persisting`.
- Etapa 252: fluxo de vídeo literal com provedor externo no V2 foi ajustado para manter progresso em execução (`99%`) até persistência final, evitando conclusão prematura visual no TaskBar/modal.
- Etapa 253: validação regressiva completa executada com sucesso após o hardening: `npm run typecheck`, `npm run test -- --run` (**37/37 arquivos**, **286/286 testes**) e `npm run build` em `frontend/`.

### Etapas 244-247 — Revalidação One-shot do Release Web (Firebase + Pages) ✅
- **Arquivos**: `.github/workflows/release-web.yml`, `docs/release/WEB_RELEASE_CACHE.md`, `docs/release/WEB_RELEASE_INDEX.md`, `README.md`
- Etapa 244: dispatch manual do orquestrador `release-web.yml` na HEAD `86df6ea25ba1218b3284d74c95e8aaea517ef503` com `deploy_firebase=true`, `deploy_github_pages=true` e `deploy_redesign_v2=false`.
- Etapa 245: quality gates revalidados com sucesso na run `24849789759` (unit tests Python, frontend quality, lint `ruff`, functions quality e source guardrails).
- Etapa 246: deploy ponta a ponta confirmado na mesma run: Firebase production (`job 72746968115`) e GitHub Pages (`jobs 72746968306` e `72747193773`) concluídos em sucesso, com `Release summary` (`job 72747469025`) também em sucesso.
- Etapa 247: fechamento de governança e caching sincronizado para a Wave 28 em `PLANO`, `MANIFEST`, release index/cache e runbook principal (`README`).

### Etapas 240-243 — Hardening Estrutural do Deploy GitHub Pages ✅
- **Arquivos**: `.github/workflows/deploy-pages.yml`, `.github/workflows/release-web.yml`
- Etapa 240: `deploy-pages.yml` migrou do push direto em `gh-pages` para pipeline oficial por artefato (`configure-pages` + `upload-pages-artifact` + `deploy-pages`), reduzindo fragilidade da cadeia legada de publicação.
- Etapa 241: permissões de deploy foram ajustadas para o modelo oficial de Pages (`pages: write` e `id-token: write`) no workflow de Pages e no orquestrador `release-web.yml`.
- Etapa 242: timeout de deploy no `actions/deploy-pages@v4` foi ampliado para mitigar abortos por limite curto em janelas de publicação mais lentas.
- Etapa 243: validação regressiva local executada com sucesso após hardening: `npm run typecheck`, `npm test` (**37/37 arquivos**, **286/286 testes**) e `npm run build`.

### Etapas 234-239 — Calibração por Perfil de Runtime + Correção Mobile de Maximizado ✅
- **Arquivos**: `frontend/src/lib/runtime-concurrency.ts`, `frontend/src/lib/runtime-concurrency.test.ts`, `frontend/src/components/DraggablePanel.tsx`, `frontend/src/components/DraggablePanel.test.tsx`
- Etapa 234: `runtime-concurrency.ts` passou a classificar perfis de runtime (`unknown`, `constrained`, `balanced`, `performant`, `high_end`) para orientar ajuste automático de concorrência.
- Etapa 235: resolução adaptativa foi calibrada com escala por perfil no modo automático, mantendo precedência de override explícito por env e preservando os caps de hardware/memória/rede/save-data.
- Etapa 236: diagnósticos de concorrência foram ampliados com `profile` e `preferredSource` (`auto`/`env`) para rastreabilidade operacional e tuning posterior por coorte.
- Etapa 237: serialização operacional foi enriquecida para incluir perfil e origem do alvo em `formatAdaptiveConcurrency` e `buildRuntimeProfileKey`, mantendo compatibilidade dos campos já persistidos.
- Etapa 238: `DraggablePanel.tsx` corrigido para desarmar estado maximizado em viewport compacta e priorizar geometria mobile mesmo com `startMaximized`, evitando inconsistência de layout/controle em celulares.
- Etapa 239: validação regressiva completa executada com sucesso: `npm run typecheck`, `npm test` (**37/37 arquivos**, **286/286 testes**) e `npm run build`.

### Etapas 227-233 — Telemetria de Runtime por Execução + Hardening Safe-Area Mobile ✅
- **Arquivos**: `frontend/src/lib/runtime-concurrency.ts`, `frontend/src/lib/runtime-concurrency.test.ts`, `frontend/src/lib/cost-analytics.ts`, `frontend/src/lib/notebook-acervo-analyzer.ts`, `frontend/src/lib/notebook-acervo-analyzer.test.ts`, `frontend/src/lib/video-generation-pipeline.ts`, `frontend/src/lib/video-generation-pipeline.test.ts`, `frontend/src/components/DraggablePanel.tsx`, `frontend/src/components/DraggablePanel.test.tsx`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.tsx`
- Etapa 227: `runtime-concurrency.ts` evoluído com diagnósticos completos de concorrência adaptativa (preferência, cap de runtime e limitadores ativos) e helpers de serialização/descrição para telemetria operacional.
- Etapa 228: `cost-analytics.ts` ampliado para suportar `runtime_profile`, `runtime_hints`, `runtime_concurrency` e `runtime_cap` em `UsageExecutionRecord`, com preservação desses campos em caminhos de extração/reidratação.
- Etapa 229: `notebook-acervo-analyzer.ts` passou a anexar metadados adaptativos do Analista no `stageMeta` e nas execuções persistidas, mantendo fallback seguro por lote.
- Etapa 230: `video-generation-pipeline.ts` passou a publicar diagnóstico adaptativo por lote de mídia (imagens/TTS) e gravar telemetria de runtime nas execuções do pipeline.
- Etapa 231: `DraggablePanel.tsx` endurecido para mobile com leitura de safe-area (`env(safe-area-inset-*)`), geometria compacta ajustada a notch/home indicator, botões com alvo de toque maior e resposta a `orientationchange`.
- Etapa 232: cobertura de regressão ampliada com `DraggablePanel.test.tsx`, novos asserts de telemetria em `notebook-acervo-analyzer.test.ts` e cenário de telemetria em `video-generation-pipeline.test.ts`.
- Etapa 233: validação regressiva completa executada com sucesso: `npm run typecheck`, `npm test` (**37/37 arquivos**, **283/283 testes**) e `npm run build`.

### Etapas 220-226 — Heurística Adaptativa Unificada + Hardening Mobile Viewport-Real ✅
- **Arquivos**: `frontend/src/lib/runtime-concurrency.ts`, `frontend/src/lib/runtime-concurrency.test.ts`, `frontend/src/lib/notebook-acervo-analyzer.ts`, `frontend/src/lib/video-generation-pipeline.ts`, `frontend/src/components/DraggablePanel.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.tsx`
- Etapa 220: utilitário compartilhado `runtime-concurrency.ts` adicionado para resolver concorrência adaptativa com clamp padronizado e leitura de hints de runtime (CPU/memória/rede).
- Etapa 221: `runtime-concurrency.test.ts` introduzido com cobertura de parsing de env, fallback seguro e limites por hardware/memória/rede/save-data.
- Etapa 222: `notebook-acervo-analyzer.ts` migrou para a heurística unificada de concorrência, removendo lógica duplicada local sem alterar fallback/telemetria do Analista.
- Etapa 223: `video-generation-pipeline.ts` migrou batches de imagem/TTS para a mesma heurística unificada, preservando metadados operacionais por lote.
- Etapa 224: `DraggablePanel.tsx` endurecido com `visualViewport` e geometria compacta sempre confinada à área visível real em mobile.
- Etapa 225: `ResearchNotebookV2.tsx` removeu import dinâmico redundante de `artifact-parsers`, eliminando advisory de chunking misto no build.
- Etapa 226: validação regressiva completa executada com sucesso: `npm run typecheck`, `npm run test` (**36/36 arquivos**, **278/278 testes**) e `npm run build`.

### Etapas 215-219 — Concorrência Adaptativa + Hardening Mobile Global de Painéis ✅
- **Arquivos**: `frontend/src/components/DraggablePanel.tsx`, `frontend/src/lib/notebook-acervo-analyzer.ts`, `frontend/src/lib/video-generation-pipeline.ts`
- Etapa 215: `DraggablePanel.tsx` passou a aplicar geometria compacta automática em viewport mobile, com clamp de posição/tamanho e prevenção de overflow visual em modais reutilizados no app.
- Etapa 216: interações de drag/resize/maximize foram endurecidas para telas estreitas no `DraggablePanel.tsx`, reduzindo regressões de usabilidade em fluxos com painéis flutuantes.
- Etapa 217: `notebook-acervo-analyzer.ts` migrou de concorrência fixa para concorrência adaptativa no Analista (env + cap por hardware), preservando fallback seguro por lote e progresso incremental.
- Etapa 218: `video-generation-pipeline.ts` migrou batches de imagem/TTS para concorrência adaptativa (env + cap por hardware), mantendo rastreabilidade por lote de custo/duração e sem alterar fallback existente.
- Etapa 219: validação regressiva completa executada com sucesso: `npm run typecheck`, `npm run test` (**35/35 arquivos**, **273/273 testes**) e `npm run build`.

### Etapas 210-214 — Paralelização Segura + Hardening Mobile Residual ✅
- **Arquivos**: `frontend/src/lib/generation-service.ts`, `frontend/src/lib/notebook-acervo-analyzer.ts`, `frontend/src/lib/video-generation-pipeline.ts`, `frontend/src/components/AgentTrailProgressModal.tsx`, `frontend/src/components/PipelineProgressPanel.tsx`
- Etapa 210: `generation-service.ts` passou a carregar teses e contexto leve de acervo em paralelo na etapa de base complementar, mantendo o mesmo comportamento funcional e os mesmos fallbacks de segurança.
- Etapa 211: `notebook-acervo-analyzer.ts` recebeu concorrência controlada no Analista (até 2 lotes em paralelo), com preservação de fallback por lote e atualização de progresso conforme conclusão real dos batches.
- Etapa 212: `video-generation-pipeline.ts` passou a gerar TTS em lotes paralelos (até 2 segmentos por batch) com `Promise.allSettled`, mantendo registro por execução e metadados agregados de custo/duração por lote.
- Etapa 213: `AgentTrailProgressModal.tsx` e `PipelineProgressPanel.tsx` foram endurecidos para mobile com layout responsivo em colunas/wrap, reduzindo risco de truncamento agressivo e overflow em telas estreitas.
- Etapa 214: validação regressiva completa executada com sucesso: `npm run typecheck`, `npm run test -- --run` (**35/35 arquivos**, **273/273 testes**) e `npm run build`.

### Etapas 205-209 — Hardening Mobile + Progresso Monotônico no Fallback ✅
- **Arquivos**: `frontend/src/lib/generation-service.ts`, `frontend/src/components/TaskBar.tsx`, `frontend/src/pages/NewDocument.tsx`, `frontend/src/pages/ResearchNotebook.tsx`
- Etapa 205: o fallback de qualidade do Redator em `generation-service.ts` foi ajustado para manter a narrativa de progresso na fase `qualidade`, evitando regressão de etapa/percepção (sem voltar visualmente para `redacao` durante a reexecução)
- Etapa 206: `TaskBar.tsx` recebeu hardening mobile com badge responsivo, painel expandido com largura/altura adaptativas e metadados de etapa com quebra de linha em vez de truncamento agressivo
- Etapa 207: `NewDocument.tsx` teve o bloco de ações finais reorganizado para layout mobile-first, com empilhamento responsivo de botões (`Detalhar contexto` + `Gerar`) e estimativa de custo quebrando por linha em telas estreitas
- Etapa 208: `ResearchNotebook.tsx` foi ajustado em áreas de uso intenso no celular (barra inferior do chat e linha de inserção de link em Fontes), reduzindo risco de overflow horizontal e controles comprimidos
- Etapa 209: validação regressiva pós-hardening executada com sucesso: `npm run typecheck` e `npm run test -- --run` (**35/35 arquivos**, **273/273 testes**)

### Etapas 200-204 — Redator Otimizado + Contrato de Progresso Confiável ✅
- **Arquivos**: `frontend/src/lib/generation-service.ts`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/contexts/TaskManagerContext.tsx`, `frontend/src/pages/NewDocument.tsx`, `frontend/src/pages/DocumentDetail.tsx`
- Etapa 200: `generation-service.ts` passou a suportar rollout do Redator em 10k tokens por feature flag (`VITE_DOC_REDATOR_10K_ENABLED`), mantendo o modo padrão em 12k quando o rollout estiver desligado
- Etapa 201: fallback automático por qualidade foi adicionado ao Redator; se o score ficar abaixo do limiar configurável (`VITE_DOC_REDATOR_QUALITY_ROLLBACK_MIN`), o serviço reexecuta em 12k e seleciona automaticamente a melhor versão final
- Etapa 202: rastreabilidade de execução endurecida no documento final com `generation_meta.redator` (modo ativo, limiar, tentativa de fallback, score primário/fallback e variante escolhida), preservando custo real em `llm_executions`
- Etapa 203: trust contract de progresso reforçado no notebook para evitar conclusão prematura: acervo, estúdio, vídeo e vídeo literal agora mantêm estado em execução `<=99%` e promovem `100%` apenas após persistência concluída
- Etapa 204: estimativa de custo no fluxo de Novo Documento foi alinhada ao modo ativo do Redator (10k/12k), mantendo coerência entre previsão e execução real

### Etapas 195-199 — Limpeza de Textos, Seletor de Skins e Consolidacao da Onda 19 ✅
- **Arquivos**: `frontend/src/components/v2/V2WorkspaceLayout.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Profile.tsx`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/pages/labs/ProfileV2.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.test.tsx`, `frontend/src/pages/AdminPanel.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/redesign-shell.ts`, `frontend/src/lib/platform-skins.ts`, `frontend/src/lib/platform-skins.test.ts`, `frontend/src/lib/firestore-types.ts`, `frontend/src/components/ThemeSkinSelector.tsx`
- Etapa 195: `V2WorkspaceLayout.tsx` reescrito — todos os textos dev/guia removidos, branding limpo "Lexio / Workspace", nav sem captions, header bar e right sidebar panels removidos, item "Trilho classico" eliminado do nav
- Etapa 196: Banners de preview V2 removidos de `Dashboard.tsx`, `Profile.tsx` e `ResearchNotebook.tsx`; imports e variaveis nao utilizados limpos em cascata; textos dev removidos de `ProfileV2.tsx` e `ResearchNotebookV2.tsx` (5+ secoes)
- Etapa 197: Sistema de skins/temas criado — `platform-skins.ts` com 6 temas (Pergaminho, Ardosia, Oceano, Floresta, Rose, Meia-noite), `ThemeSkinSelector.tsx` com UI visual de selecao e hook `useApplyPlatformSkin`, campo `platform_skin` adicionado a `UserSettingsData`, secao "Aparencia" integrada em `AdminPanel.tsx`, hook ativado em `App.tsx` via `AuthenticatedShell`
- Etapa 198: Trilho classico estreitado — rota `/` adicionada ao V2 shell em `redesign-shell.ts`, item "Trilho classico" removido do nav V2, rotas classicas mantidas apenas como contingencia estrutural
- Etapa 199: Testes consolidados — 9 novos testes para `platform-skins.ts`, testes de `ResearchNotebookV2.test.tsx` atualizados para refletir textos limpos; validacao final com `npx tsc --noEmit` (0 erros), `npx vitest run` (**36/36 arquivos**, **275/275 testes**) e `npm run build` em `frontend/`, com `AdminPanel` em **84.13 kB** (**gzip 21.44 kB**)

### Etapas 191-194 — Configuracoes Especializadas e Catalogo Nativos no Rail V2 ✅
- **Arquivos**: `frontend/src/components/AgentModelConfigCard.tsx`, `frontend/src/components/ModelCatalogCard.tsx`, `frontend/src/components/ModelConfigCard.tsx`, `frontend/src/components/ThesisAnalystConfigCard.tsx`, `frontend/src/components/ContextDetailConfigCard.tsx`, `frontend/src/components/AcervoClassificadorConfigCard.tsx`, `frontend/src/components/AcervoEmentaConfigCard.tsx`, `frontend/src/components/NotebookAcervoConfigCard.tsx`, `frontend/src/components/ResearchNotebookConfigCard.tsx`, `frontend/src/components/VideoPipelineConfigCard.tsx`, `frontend/src/components/AudioPipelineConfigCard.tsx`, `frontend/src/components/PresentationPipelineConfigCard.tsx`, `frontend/src/pages/AdminPanel.tsx`, `frontend/src/components/v2/V2WorkspaceLayout.tsx`
- Etapa 191: `AgentModelConfigCard.tsx` introduziu uma base compartilhada V2 para cards de configuracao de agentes, centralizando secoes, wrappers de pipeline, badges de tier/capability, barra de acoes, integracao com `ModelSelectorModal` e o fluxo comum de load/save/reset sem duplicacao entre cards especializados
- Etapa 192: `ModelConfigCard`, `ThesisAnalystConfigCard`, `ContextDetailConfigCard`, `AcervoClassificadorConfigCard`, `AcervoEmentaConfigCard`, `NotebookAcervoConfigCard`, `ResearchNotebookConfigCard`, `VideoPipelineConfigCard`, `AudioPipelineConfigCard` e `PresentationPipelineConfigCard` foram convertidos para wrappers finos sobre a base compartilhada, promovendo documentos, acervo, caderno de pesquisa e pipelines multiagente para superfices V2 nativas
- Etapa 193: `ModelCatalogCard.tsx` foi retematizado para superficies, filtros, tabela, modais e acoes V2; em seguida `AdminPanel.tsx` removeu o ultimo wrapper `v2-bridge-surface`, zerando a bridge localizada das configuracoes e fechando o rail de settings/admin como leitura integralmente nativa no redesign
- Etapa 194: `V2WorkspaceLayout.tsx` foi atualizado para refletir o novo estado real do shell promovido, comunicando que catalogo, configuracoes e governanca ja operam nativamente em V2 e que o trilho classico ficou restrito a contingencia estrutural; a rodada foi validada com `npm run typecheck`, `npm run test -- --run` (**35/35 arquivos**, **266/266 testes**) e `npm run build` em `frontend/`, com `AdminPanel` em **84.07 kB** (**gzip 21.46 kB**) e `V2WorkspaceLayout` em **8.38 kB** (**gzip 2.62 kB**)

### Etapas 187-190 — Governanca/Admin Nativas no Rail V2 ✅
- **Arquivos**: `frontend/src/pages/PlatformAdminPanel.tsx`, `frontend/src/pages/AdminPanel.tsx`, `frontend/src/components/v2/V2WorkspaceLayout.tsx`
- Etapa 187: `PlatformAdminPanel.tsx` deixou de depender da `v2-bridge-surface` como frame de pagina; estados de acesso/loading/vazio, cards executivos, configuracao de thresholds, historico longitudinal, backfill e wrappers de graficos passaram a usar paines, formularios e tipografia V2 explicitos
- Etapa 188: `AdminPanel.tsx` removeu a bridge de pagina inteira e promoveu o shell pessoal, `ApiKeysCard`, `ReviewQueue` e os blocos locais de reindexacao/CRUD/logs/usuarios para o sistema V2; os cards de configuracao ainda legados ficaram encapsulados em wrappers `v2-bridge-surface` localizados, reduzindo a ponte visual ao minimo operacional desta rodada
- Etapa 189: `V2WorkspaceLayout.tsx` foi atualizado para refletir o novo estado real do rail promovido, comunicando que custos, configuracoes principais e administracao executiva ja operam em leitura nativa V2, enquanto a contingencia classica ficou restrita a cards especializados remanescentes
- Etapa 190: a rodada foi validada com `npm run typecheck`, `npm run test -- --run` (**35/35 arquivos**, **266/266 testes**) e `npm run build` em `frontend/`; os chunks de producao ficaram em **50.23 kB** (**gzip 12.26 kB**) para `PlatformAdminPanel`, **129.73 kB** (**gzip 22.06 kB**) para `AdminPanel` e **8.10 kB** (**gzip 2.55 kB**) para `V2WorkspaceLayout`, preservando code splitting enquanto a governanca saiu do bridge amplo

### Etapas 184-186 — Custos Nativos no Rail V2 + Ajuste de Narrativa do Shell ✅
- **Arquivos**: `frontend/src/pages/CostTokensPage.tsx`, `frontend/src/pages/PlatformCostsPage.tsx`, `frontend/src/components/v2/V2WorkspaceLayout.tsx`
- Etapa 184: `CostTokensPage.tsx` deixou de depender de `v2-bridge-surface`; os estados de loading, labels, inputs de orçamento, avisos vazios e textos residuais passaram a usar classes e controles V2 explícitos (`v2-panel`, `v2-summary-card`, `v2-field` e tokens `--v2-*`), reduzindo a ponte visual justamente na superfície operacional de custos do usuário
- Etapa 185: `PlatformCostsPage.tsx` também saiu da bridge; os estados de preparação, loading, vazio e acesso administrativo foram reescritos com `V2EmptyState`, `Skeleton` encapsulado em painéis V2 e wrappers nativos, eliminando dependência residual de `text-gray-*` e da retematização scoped nessa visão executiva
- Etapa 186: `V2WorkspaceLayout.tsx` teve a cópia atualizada para refletir o novo estado real do rail promovido, deixando de descrever toda a governança como clássica e passando a comunicar que a trilha de custos já está nativa em V2 enquanto configurações e administração seguem em consolidação controlada; a rodada foi validada com `npm run typecheck`, `npm run test` (**35/35 arquivos**, **266/266 testes**) e `npm run build` em `frontend/`
- Observacao operacional: os chunks de producao ficaram em **25.62 kB** (**gzip 6.48 kB**) para `CostTokensPage`, **8.29 kB** (**gzip 2.52 kB**) para `PlatformCostsPage` e **8.10 kB** (**gzip 2.55 kB**) para `V2WorkspaceLayout`, preservando code splitting enquanto o pacote de custos saiu da bridge visual

### Etapas 181-183 — Hotfix do Deploy Estavel + Secret Manager DataJud ✅
- **Arquivos**: `.github/workflows/firebase-deploy.yml`, `README.md`, `SETUP.md`, `SECURITY.md`
- Etapa 181: o workflow estavel `firebase-deploy.yml` deixou de falhar cedo apenas porque `DATAJUD_API_KEY` nao existe no GitHub Actions; agora ele resolve a fonte do segredo em duas camadas, priorizando o secret do GitHub para sincronizacao automatica e reutilizando o segredo ja existente em Firebase Secret Manager quando o CI nao recebe esse valor
- Etapa 182: a chave publica validada do DataJud foi provisionada tanto em GitHub Actions quanto em Firebase Secret Manager (`DATAJUD_API_KEY`), destravando o deploy de `datajudProxy` sem reintroduzir chave hardcoded no frontend/functions versionados
- Etapa 183: a trilha estavel foi revalidada ponta a ponta com `npm run typecheck`, `npm run test` (**35/35 arquivos**, **266/266 testes**), `npm run build` em `frontend/`, `npx tsc` em `functions/`, `firebase deploy --only hosting:lexio,firestore:rules,firestore:indexes,storage,functions --project hocapp-44760 --non-interactive` e smoke test `POST https://lexio.web.app/api/datajud` retornando `200`

### Etapas 177-180 — Promocao do Dashboard e Superficies Internas do Workspace V2 ✅
- **Arquivos**: `frontend/src/App.tsx`, `frontend/src/index.css`, `frontend/src/components/v2/V2PagePrimitives.tsx`, `frontend/src/pages/ThesisBank.tsx`, `frontend/src/pages/CostTokensPage.tsx`, `frontend/src/pages/PlatformCostsPage.tsx`, `frontend/src/pages/AdminPanel.tsx`, `frontend/src/pages/PlatformAdminPanel.tsx`, `frontend/src/pages/DocumentList.tsx`, `frontend/src/pages/NewDocument.tsx`, `frontend/src/pages/DocumentDetail.tsx`, `frontend/src/pages/DocumentEditor.tsx`, `frontend/src/pages/Upload.tsx`
- Etapa 177: o redesign ganhou primitives compartilhadas em `V2PagePrimitives.tsx` e uma camada `v2-bridge-surface` em `index.css`, permitindo promover superficies legadas para o novo sistema visual sem reimplementar a logica de dados, filtros, workflows e pipelines
- Etapa 178: `ThesisBank`, `CostTokensPage`, `PlatformCostsPage`, `AdminPanel` e `PlatformAdminPanel` passaram a operar com hero V2, metricas executivas, secoes redesenhadas e bridge visual controlada, substituindo o estado anterior em que essas rotas apenas viviam dentro do shell novo com miolo majoritariamente classico
- Etapa 179: `DocumentList`, `NewDocument`, `DocumentDetail`, `DocumentEditor` e `Upload` foram alinhados ao mesmo frame V2 com hero operacional, metricas, estados vazios reescritos e retematizacao scoped do conteudo, reduzindo a ruptura entre o rail promovido e as superfices documentais centrais do workspace
- Etapa 180: `/` foi promovida para `DashboardV2` sob o gate do redesign e `/labs/dashboard-v2` foi reduzida a alias tecnico da rota principal; a rodada foi validada com `npm run typecheck`, `npm run test` (**35/35 arquivos**, **266/266 testes**) e `npm run build` em `frontend/`
- Observacao operacional: os chunks de producao ficaram em **2.52 kB** (**gzip 0.91 kB**) para `V2PagePrimitives`, **15.31 kB** (**gzip 4.58 kB**) para `DashboardV2`, **17.84 kB** (**gzip 5.61 kB**) para `DocumentList`, **15.00 kB** (**gzip 5.45 kB**) para `NewDocument`, **27.48 kB** (**gzip 8.18 kB**) para `DocumentDetail`, **11.82 kB** (**gzip 3.79 kB**) para `DocumentEditor`, **45.82 kB** (**gzip 11.79 kB**) para `Upload`, **47.45 kB** (**gzip 14.40 kB**) para `ThesisBank`, **25.39 kB** (**gzip 6.49 kB**) para `CostTokensPage`, **7.98 kB** (**gzip 2.48 kB**) para `PlatformCostsPage`, **49.58 kB** (**gzip 12.15 kB**) para `PlatformAdminPanel` e **128.20 kB** (**gzip 21.92 kB**) para `AdminPanel`, preservando code splitting apos a promocao das superficies internas

### Etapas 173-176 — Expansao do Shell V2 para Teses, Configuracoes, Admin e Profile ✅
- **Arquivos**: `frontend/src/App.tsx`, `frontend/src/lib/workspace-routes.ts`, `frontend/src/lib/workspace-routes.test.ts`, `frontend/src/lib/redesign-shell.ts`, `frontend/src/lib/redesign-shell.test.ts`, `frontend/src/components/Sidebar.tsx`, `frontend/src/components/v2/V2WorkspaceLayout.tsx`, `frontend/src/components/AgentTrailProgressModal.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/DocumentDetail.tsx`, `frontend/src/pages/NewDocument.tsx`, `frontend/src/pages/PlatformAdminPanel.tsx`, `frontend/src/pages/Profile.tsx`, `frontend/src/pages/labs/DashboardV2.tsx`, `frontend/src/pages/labs/ProfileV2.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.test.tsx`
- Etapa 173: `workspace-routes.ts` passou a centralizar builders preview-safe para dashboard, teses, configuracoes, admin, profile e fallback classico do profile, incluindo `buildWorkspaceShellPath()` para reduzir drift entre shell, sidebar e atalhos cruzados
- Etapa 174: `redesign-shell.ts` e `App.tsx` foram ampliados para cobrir `/theses`, `/settings*`, `/admin*` e `/profile` no shell V2; `/profile` foi promovido sob gate com fallback explicito em `/profile/classic`, enquanto `/labs/notebook-v2` e `/labs/profile-v2` viraram aliases tecnicos das rotas promovidas
- Etapa 175: `V2WorkspaceLayout`, sidebar, dashboards, atalhos administrativos, hints de configuracao, redirects por modelos nao configurados e a navegacao interna do `ResearchNotebookV2` passaram a usar os builders centralizados, preservando preview params e hash mesmo ao atravessar profile, teses, settings, admin e workbench
- Etapa 176: a rodada foi validada com `npm run typecheck`, `npm run test` (**35/35 arquivos**, **266/266 testes**) e `npm run build` em `frontend/`
- Observacao operacional: os chunks de producao ficaram em **8.04 kB** (**gzip 2.52 kB**) para `V2WorkspaceLayout`, **10.65 kB** (**gzip 3.27 kB**) para `Profile`, **13.43 kB** (**gzip 3.90 kB**) para `ProfileV2`, **15.31 kB** (**gzip 4.58 kB**) para `DashboardV2`, **46.88 kB** (**gzip 13.87 kB**) para `ThesisBank`, **48.16 kB** (**gzip 11.72 kB**) para `PlatformAdminPanel`, **128.87 kB** (**gzip 21.66 kB**) para `AdminPanel` e **170.22 kB** (**gzip 40.64 kB**) para `ResearchNotebookV2`, preservando code splitting apos a expansao do rail promovido

### Etapas 169-172 — Expansão do Shell V2 para Documentos e Acervo ✅
- **Arquivos**: `frontend/src/lib/workspace-routes.ts`, `frontend/src/lib/workspace-routes.test.ts`, `frontend/src/lib/redesign-shell.ts`, `frontend/src/lib/redesign-shell.test.ts`, `frontend/src/components/Sidebar.tsx`, `frontend/src/components/Layout.tsx`, `frontend/src/components/NotificationBell.tsx`, `frontend/src/components/v2/V2WorkspaceLayout.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/labs/DashboardV2.tsx`, `frontend/src/pages/DocumentList.tsx`, `frontend/src/pages/DocumentDetail.tsx`, `frontend/src/pages/DocumentEditor.tsx`, `frontend/src/pages/NewDocument.tsx`, `frontend/src/pages/AdminPanel.tsx`, `frontend/src/pages/ThesisBank.tsx`
- Etapa 169: `workspace-routes.ts` passou a centralizar links preview-safe para listagem, criação, detalhe e edição de documentos, além do rail de acervo, evitando perda do gate do redesign ao atravessar rotas ainda clássicas
- Etapa 170: `redesign-shell.ts` foi ampliado para tratar `/documents*` e `/upload` como superfícies do shell V2 quando o redesign estiver ativo, enquanto `V2WorkspaceLayout.tsx` ganhou navegação explícita para documentos, criação e biblioteca/acervo
- Etapa 171: sidebar, dashboards, breadcrumbs, polling de conclusão em `Layout`, notificações, atalhos administrativos e links de teses/documentos passaram a usar os builders centralizados, preservando preview params durante navegação lateral, handoffs e retornos
- Etapa 172: a rodada foi validada com `npm run typecheck`, `npm run test` (**35/35 arquivos**, **264/264 testes**) e `npm run build` em `frontend/`
- Observação operacional: os chunks de produção ficaram em **7.72 kB** (**gzip 2.43 kB**) para `V2WorkspaceLayout`, **16.40 kB** (**gzip 5.00 kB**) para `DocumentList`, **11.73 kB** (**gzip 3.75 kB**) para `DocumentEditor`, **13.42 kB** (**gzip 4.90 kB**) para `NewDocument`, **26.85 kB** (**gzip 7.81 kB**) para `DocumentDetail` e **44.58 kB** (**gzip 11.29 kB**) para `Upload`, preservando code splitting após a expansão do shell

### Etapas 165-168 — Promoção Controlada de `/notebook` para o Workbench V2 ✅
- **Arquivos**: `frontend/src/App.tsx`, `frontend/src/lib/research-notebook-routes.ts`, `frontend/src/lib/research-notebook-routes.test.ts`, `frontend/src/lib/redesign-shell.ts`, `frontend/src/lib/redesign-shell.test.ts`, `frontend/src/components/Sidebar.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/labs/DashboardV2.tsx`, `frontend/src/lib/dashboard-v2.ts`, `frontend/src/lib/dashboard-v2.test.ts`, `frontend/src/pages/DocumentList.tsx`, `frontend/src/pages/DocumentDetail.tsx`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/components/v2/V2WorkspaceLayout.tsx`
- Etapa 165: `research-notebook-routes.ts` passou a separar explicitamente o builder do workbench principal (`/notebook`), o fallback clássico (`/notebook/classic`) e a rota laboratorial V2 (`/labs/notebook-v2`), mantendo compatibilidade do helper legado por alias controlado
- Etapa 166: `App.tsx` agora promove `/notebook` para `ResearchNotebookV2` quando o redesign estiver ativo, preserva `/notebook/classic` para contingência e usa `redesign-shell.ts` para decidir quando o shell V2 deve cobrir o rail principal
- Etapa 167: Sidebar, dashboards, links de origem em documentos, CTAs do notebook clássico e a navegação do shell V2 passaram a usar o workbench principal com preservação de preview params; já os handoffs clássicos do `ResearchNotebookV2` foram trocados para o fallback explícito `/notebook/classic`
- Etapa 168: a rodada foi validada com `npm run typecheck`, `npm run test` (**34/34 arquivos**, **261/261 testes**) e `npm run build` em `frontend/`
- Observação operacional: os chunks de produção ficaram em **159.66 kB** (**gzip 40.61 kB**) para `ResearchNotebook`, **170.20 kB** (**gzip 40.65 kB**) para `ResearchNotebookV2`, **7.25 kB** (**gzip 2.36 kB**) para `V2WorkspaceLayout` e **15.36 kB** (**gzip 4.59 kB**) para `DashboardV2`, preservando code splitting após a promoção controlada da rota principal

### Etapas 161-164 — Consolidação V2-first e Cobertura Direta ✅
- **Arquivos**: `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.test.tsx`, `frontend/src/test-setup.ts`, `frontend/package.json`
- Etapa 161: o `ResearchNotebookV2` teve overview, `studio`, `artifacts` e a seção `bridge` reescritos em narrativa V2-first, com o shell clássico rebaixado de launcher principal para trilha explícita de contingência e comparação
- Etapa 162: quick actions, CTAs residuais, leitura de contexto e empty states do workbench foram ajustados para privilegiar fluxos do próprio V2, incluindo navegação interna para `sources`, `studio`, `artifacts` e mapa de contingência
- Etapa 163: foi adicionada cobertura direta de página em `frontend/src/pages/labs/ResearchNotebookV2.test.tsx`, com `jsdom`, `@testing-library/react`, mock parcial do módulo compartilhado `../notebook` e polyfills de browser em `frontend/src/test-setup.ts`
- Etapa 164: a rodada foi validada com `npm run typecheck`, `npm run test` (**33/33 arquivos**, **257/257 testes**) e `npm run build` em `frontend/`
- Observação operacional: o chunk de produção de `ResearchNotebookV2` ficou em **170.29 kB** (**gzip 40.68 kB**), enquanto `VideoGenerationCostModal` permaneceu em **15.21 kB** (**gzip 4.33 kB**), `VideoStudioEditor` em **27.23 kB** (**gzip 7.02 kB**), `video-generation-pipeline` em **34.00 kB** (**gzip 11.77 kB**) e `literal-video-production` em **26.26 kB** (**gzip 8.88 kB**), preservando code splitting no workbench principal

### Etapas 155-160 — Paridade Completa de Vídeo no ResearchNotebook V2 ✅
- **Arquivos**: `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/components/VideoGenerationCostModal.tsx`, `frontend/src/components/artifacts/VideoStudioEditor.tsx`, `frontend/src/components/artifacts/ArtifactViewerModal.tsx`, `frontend/src/lib/video-generation-pipeline.ts`, `frontend/src/lib/literal-video-production.ts`, `frontend/src/lib/video-pipeline-progress.ts`, `frontend/src/lib/notebook-media-storage.ts`
- Etapa 155: o `ResearchNotebookV2` ganhou estado, runtimes lazy-loaded e handlers próprios para custo/revisão de `video_script`, geração de vídeo e checkpoints `VideoCheckpoint`, reaproveitando o mesmo backbone operacional do notebook clássico sem novo acoplamento estrutural
- Etapa 156: o `ArtifactViewerModal`, o inventário de artefatos e a geração base do estúdio no V2 passaram a expor `Gerar vídeo` e a abrir automaticamente o `VideoGenerationCostModal`, eliminando o handoff obrigatório para o shell clássico antes do pipeline de vídeo
- Etapa 157: artefatos `video_production` e estúdios de vídeo salvos agora reabrem diretamente no `VideoStudioEditor` dentro do V2, com normalização do pacote persistido e continuidade local da timeline sem ponte compulsória para `ResearchNotebook.tsx`
- Etapa 158: a persistência do estúdio de vídeo foi migrada para o workbench novo com upload em Firebase, compactação do JSON, fresh snapshot antes do write, append seguro de `llm_executions` e reaproveitamento do mesmo contrato de mídia literal do fluxo clássico
- Etapa 159: o V2 agora também executa produção literal, render final, fallback para provedor externo, regeneração de clip/imagem/TTS e atualização do pacote salvo no próprio shell, enquanto a UX de bridge foi rebaixada para fallback comparativo residual
- Etapa 160: a rodada foi validada com `npm run typecheck`, `npm run test` (**32/32 arquivos**, **253/253 testes**) e `npm run build` em `frontend/`
- Observação operacional: o chunk de produção de `ResearchNotebookV2` subiu para **170.78 kB** (**gzip 40.72 kB**), enquanto `VideoGenerationCostModal` ficou em **15.21 kB** (**gzip 4.33 kB**), `VideoStudioEditor` em **27.23 kB** (**gzip 7.02 kB**), `video-generation-pipeline` em **34.00 kB** (**gzip 11.77 kB**) e `literal-video-production` em **26.26 kB** (**gzip 8.88 kB**), preservando code splitting para os fluxos pesados de vídeo

### Etapas 149-154 — Pós-geração de Áudio e Imagem no ResearchNotebook V2 ✅
- **Arquivos**: `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/lib/audio-generation-pipeline.ts`, `frontend/src/lib/presentation-generation-pipeline.ts`, `frontend/src/lib/notebook-studio-pipeline.ts`, `frontend/src/lib/notebook-media-storage.ts`, `frontend/src/components/artifacts/artifact-parsers.ts`
- Etapa 149: o `ResearchNotebookV2` ganhou handlers e estados dedicados para pós-geração de mídia em artefatos persistidos, reaproveitando o viewer e o inventário já migrados sem reintroduzir dependência estrutural do notebook clássico
- Etapa 150: o `ArtifactViewerModal` no V2 e os cards da seção `artifacts` passaram a expor ações diretas de `Gerar áudio` e `Gerar imagem/slides` para os tipos suportados (`audio_script`, `apresentacao`, `mapa_mental`, `infografico` e `tabela_dados`)
- Etapa 151: `audio_script` agora dispara síntese literal de áudio no próprio shell via `generateAudioLiteralMedia()`, com upload em Firebase e persistência de `audioUrl`, `audioStoragePath` e `audioMimeType` no JSON do artefato
- Etapa 152: `apresentacao` agora gera os visuais finais de cada slide no V2 via `generatePresentationMediaAssets()`, persistindo `renderedImageUrl` e `renderedImageStoragePath` por slide para viewer, exportação e regeneração
- Etapa 153: `infografico`, `mapa_mental` e `tabela_dados` agora também geram imagem final no V2 via `generateStructuredVisualArtifactMedia()`, com fresh snapshot antes do write, append de `llm_executions` no mesmo contrato do fluxo clássico e a ponte remanescente concentrada em vídeo
- Etapa 154: a rodada foi validada com `npm run typecheck`, `npm run test` (**32/32 arquivos**, **253/253 testes**) e `npm run build` em `frontend/`
- Observação operacional: o chunk de produção de `ResearchNotebookV2` subiu para **151.82 kB** (**gzip 34.78 kB**), enquanto `ArtifactViewerModal` permaneceu em **76.33 kB** (**gzip 19.76 kB**), `audio-generation-pipeline` em **8.56 kB** (**gzip 3.56 kB**), `presentation-generation-pipeline` em **9.16 kB** (**gzip 3.78 kB**) e `notebook-media-storage` em **1.89 kB** (**gzip 1.06 kB**), preservando code splitting para a pós-geração especializada

### Etapas 143-148 — Geração Base do Estúdio no ResearchNotebook V2 ✅
- **Arquivos**: `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/lib/notebook-artifact-tasks.ts`, `frontend/src/lib/notebook-artifact-tasks.test.ts`
- Etapa 143: a infraestrutura compartilhada de tarefas do estúdio foi extraída para `notebook-artifact-tasks.ts`, centralizando metadata, limites de etapas, agregação operacional e deduplicação de eventos entre os shells clássico e V2
- Etapa 144: o `ResearchNotebookV2` passou a consumir `TaskManager` para rastrear tarefas de artefato por caderno/tipo, com seleção da execução ativa e reaproveitamento da mesma trilha multiagente do notebook clássico
- Etapa 145: a grade do `studio` no V2 agora dispara geração direta de artefatos no próprio shell, abrindo a trilha quando já existe tarefa em andamento e mantendo o fluxo clássico apenas como fallback explícito por card
- Etapa 146: a persistência da geração base do V2 agora salva `artifacts` e `llm_executions` no notebook com o mesmo contrato do clássico, incluindo espelhamento automático de `documento` para a página Documentos
- Etapa 147: o notebook clássico passou a reaproveitar o helper compartilhado do estúdio, enquanto a narrativa do V2 foi atualizada para refletir que a ponte remanescente ficou restrita à produção avançada de mídia e ao editor de vídeo persistido
- Etapa 148: a rodada foi validada com `npm run typecheck`, `npm run test` (**32/32 arquivos**, **253/253 testes**) e `npm run build` em `frontend/`
- Observação operacional: o chunk de produção de `ResearchNotebookV2` subiu para **145.82 kB** (**gzip 32.96 kB**), enquanto `notebook-studio-pipeline` permaneceu isolado em **40.36 kB** (**gzip 14.60 kB**) e `VideoStudioEditor` em **27.24 kB** (**gzip 7.02 kB**), preservando code splitting e caching granular para a ponte de mídia avançada

### Etapas 138-142 — Studio Briefing no ResearchNotebook V2 ✅
- **Arquivos**: `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/lib/research-notebook-routes.ts`, `frontend/src/lib/research-notebook-routes.test.ts`, `frontend/src/pages/ResearchNotebook.tsx`
- Etapa 138: o workbench V2 ganhou a seção dedicada `studio`, com roteamento próprio no helper compartilhado do notebook e mapeamento do launcher clássico para reabrir essa nova área quando a aba legada estiver no estúdio
- Etapa 139: o shell novo passou a exibir briefing adicional, auditoria de contexto do estúdio e leitura operacional da janela ativa, sem duplicar pipelines nem acoplar o V2 ao `TaskManager`
- Etapa 140: a nova grade categorizada de artefatos do V2 agora encaminha o usuário para o estúdio clássico com deep-link tipado (`artifact_type` + `studio_prompt`), preservando a intenção de geração e o briefing desta rodada
- Etapa 141: o notebook clássico passou a restaurar briefing e intenção vindos do V2 ao abrir o estúdio, além de mapear a aba `studio` de volta para a seção homóloga do `ResearchNotebookV2`
- Etapa 142: a rodada foi validada com `npm run typecheck`, `npm run test` (**31/31 arquivos**, **250/250 testes**) e `npm run build` em `frontend/`
- Observação operacional: o chunk de produção de `ResearchNotebookV2` subiu para **138.58 kB** (**gzip 31.04 kB**), enquanto `VideoStudioEditor` permaneceu isolado em **27.24 kB** (**gzip 7.02 kB**), preservando code splitting e caching granular para o editor literal legado

### Etapas 133-137 — Artefatos e Viewer no ResearchNotebook V2 ✅
- **Arquivos**: `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/lib/research-notebook-routes.ts`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/components/artifacts/ArtifactViewerModal.tsx`
- Etapa 133: o workbench V2 ganhou a seção dedicada `artifacts`, com roteamento próprio no helper compartilhado do notebook e alinhamento do launcher clássico para abrir a nova área quando a aba legada já estiver em artefatos
- Etapa 134: o shell novo passou a exibir quick actions e inventário reverso de artefatos persistidos, incluindo badges de tipo/formato, métricas de volume e cards dedicados para handoff explícito de `video_production`
- Etapa 135: `ResearchNotebookV2` agora lazy-loada o `ArtifactViewerModal` no próprio shell, permitindo abrir, inspecionar, exportar e excluir artefatos persistidos sem retornar ao notebook clássico
- Etapa 136: a narrativa de bridge do redesign foi estreitada novamente para deixar o legado restrito à geração multiagente do estúdio e ao editor de vídeo persistido, enquanto overview e quick actions já apontam para o inventário de artefatos do V2
- Etapa 137: a rodada foi validada com `npm run typecheck`, `npm run test` (**31/31 arquivos**, **250/250 testes**) e `npm run build` em `frontend/`
- Observação operacional: o chunk de produção de `ResearchNotebookV2` subiu para **125.25 kB** (**gzip 29.11 kB**), enquanto `ArtifactViewerModal` permaneceu isolado em **76.03 kB** (**gzip 19.63 kB**), preservando code splitting e caching granular para o viewer rico

### Etapas 128-132 — Análise Inteligente de Acervo no ResearchNotebook V2 ✅
- **Arquivos**: `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/lib/notebook-acervo-analyzer.ts`, `frontend/src/lib/notebook-acervo-analyzer.test.ts`, `frontend/src/lib/notebook-pipeline-progress.ts`, `frontend/src/components/AgentTrailProgressModal.tsx`
- Etapa 128: o workbench V2 ganhou estado dedicado para a análise de acervo no shell novo, incluindo fase, mensagem, percentuais, erro, trilha operacional e curadoria temporária de recomendações
- Etapa 129: a seção `sources` do `ResearchNotebookV2` passou a disparar `analyzeNotebookAcervo()` no próprio shell, persistindo as `llm_executions` do pipeline no caderno e reaproveitando o backend multiagente já validado do notebook clássico
- Etapa 130: a curadoria do acervo no V2 agora permite selecionar/desmarcar recomendações, deduplicar documentos já anexados e promover em lote as fontes escolhidas para `sources`, sem sobrescrever estado concorrente do caderno
- Etapa 131: a UX do redesign foi alinhada à nova paridade com trilha lazy-loaded via `AgentTrailProgressModal` e atualização da narrativa de bridge para deixar o legado restrito a estúdio, artefatos e vídeo
- Etapa 132: a rodada foi validada com `npm run typecheck`, `npm run test` (**31/31 arquivos**, **250/250 testes**) e `npm run build` em `frontend/`
- Observação operacional: o chunk de produção de `ResearchNotebookV2` subiu para **115.23 kB** (**gzip 27.26 kB**), enquanto `AgentTrailProgressModal` ficou isolado em **6.15 kB** (**gzip 2.16 kB**) e `SourceContentViewer` em **24.13 kB** (**gzip 6.34 kB**), preservando code splitting e caching granular

### Etapas 124-127 — Viewer Avançado de Fontes no ResearchNotebook V2 ✅
- **Arquivos**: `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/components/SourceContentViewer.tsx`, `frontend/src/lib/research-notebook-v2.ts`, `frontend/src/lib/research-notebook-v2.test.ts`, `frontend/src/components/SourceContentViewer.test.ts`
- Etapa 124: a camada utilitária do workbench ganhou helpers dedicados para elegibilidade do viewer e preview rápido das fontes, removendo copy legada do JSX principal e mantendo o shell V2 mais enxuto
- Etapa 125: a seção `sources` do `ResearchNotebookV2` passou a abrir o `SourceContentViewer` no próprio shell, via carregamento sob demanda, a partir do inventário principal, da leitura rápida da fonte selecionada e das fontes sintéticas geradas por busca
- Etapa 126: `SourceContentViewer.tsx` foi endurecido para abrir fontes de jurisprudência mesmo quando só existe `results_raw`, resetando abas por fonte e iniciando em `Processos` quando a síntese textual estiver ausente
- Etapa 127: a rodada foi validada com `npm run typecheck`, `npm run test` (**31/31 arquivos**, **249/249 testes**) e `npm run build` em `frontend/`
- Observação operacional: o chunk de produção de `ResearchNotebookV2` subiu para **105.43 kB** (**gzip 25.11 kB**) e o viewer avançado saiu em chunk separado `SourceContentViewer` com **24.06 kB** (**gzip 6.30 kB**), preservando code splitting e caching granular

### Etapas 120-123 — Governança de Buscas Salvas no ResearchNotebook V2 ✅
- **Arquivos**: `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/lib/research-notebook-v2.ts`, `frontend/src/lib/research-notebook-v2.test.ts`
- Etapa 120: a camada utilitária do workbench ganhou helpers dedicados para `saved_searches`, cobrindo título semântico, tags derivadas, normalização manual, contagem por variante e filtro/ordenação reutilizável fora do JSX principal
- Etapa 121: a seção `sources` do `ResearchNotebookV2` passou a salvar auditorias recentes como presets persistidos, eliminando a dependência do notebook clássico para promover consultas recorrentes a `saved_searches`
- Etapa 122: o V2 agora governa buscas salvas no próprio shell com filtro por texto/tipo, pin/unpin, edição inline de título e tags, exclusão individual e ações em lote, além de atualizar a narrativa de bridge para refletir somente viewer avançado, análise de acervo, estúdio e vídeo como pendências fora do redesign
- Etapa 123: a rodada foi validada com `npm run typecheck`, `npm run test` (**31/31 arquivos**, **248/248 testes**) e `npm run build` em `frontend/`
- Observação operacional: o chunk de produção de `ResearchNotebookV2` subiu para **104.07 kB** (**gzip 24.74 kB**) após a entrada da governança de buscas salvas, mantendo build limpo e code splitting preservado

### Etapas 116-119 — Pesquisa Avançada no ResearchNotebook V2 ✅
- **Arquivos**: `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/pages/notebook/types.ts`, `frontend/src/components/SearchResultsModal.tsx`, `frontend/src/components/DeepResearchModal.tsx`, `frontend/src/components/JurisprudenceConfigModal.tsx`, `frontend/src/lib/firestore-service.ts`
- Etapa 116: os tipos compartilhados de revisão de busca foram extraídos para `frontend/src/pages/notebook/types.ts`, permitindo que `SearchResultsModal.tsx` e o notebook V2 reutilizem o mesmo contrato sem depender estruturalmente da página clássica
- Etapa 117: a seção `sources` do `ResearchNotebookV2` passou a operar pesquisa externa, pesquisa profunda e jurisprudência/DataJud no próprio shell, com painel de entrada unificado, preview auditável da consulta e inventário das fontes geradas por busca
- Etapa 118: o workbench V2 passou a montar `DeepResearchModal`, `JurisprudenceConfigModal` e `SearchResultsModal`, além de reaplicar auditorias recentes e persistir/carregar a última seleção de tribunais do usuário nas preferências do Firestore
- Etapa 119: a rodada foi validada com `npm run typecheck`, `npm run test` (**31/31 arquivos**, **245/245 testes**) e `npm run build` em `frontend/`
- Observação operacional: o chunk de produção de `ResearchNotebookV2` subiu para **88.91 kB** (**gzip 21.55 kB**) após a entrada da pesquisa avançada, mas o build permaneceu limpo e com code splitting preservado

### Etapas 112-115 — Hosting Dedicado do Redesign V2 ✅
- **Arquivos**: `.firebaserc`, `firebase.json`, `.github/workflows/firebase-redesign-v2.yml`, `frontend/src/App.tsx`, `frontend/src/lib/feature-flags.ts`, `frontend/src/lib/feature-flags.test.ts`, `frontend/vite.config.ts`, `scripts/firebase-authorized-domains.mjs`
- Etapa 112: foi criado o site Firebase Hosting isolado `lexio-redesign-v2-44760`, com URL dedicada `https://lexio-redesign-v2-44760.web.app`, para validar o redesign sem tocar em `lexio.web.app`
- Etapa 113: o repositório passou a operar em modo multi-site com targets explícitos em `.firebaserc` e `firebase.json`, incluindo build dedicado em `frontend/dist-redesign-v2`
- Etapa 114: o frontend passou a reconhecer o hostname do site experimental, ativar o redesign V2 sem query params e redirecionar `/` para `/labs/dashboard-v2` quando acessado pelo domínio dedicado
- Etapa 115: foi adicionado o workflow `.github/workflows/firebase-redesign-v2.yml` e o utilitário `scripts/firebase-authorized-domains.mjs`, fechando o trilho de deploy e a sincronização dos domínios autorizados do Firebase Auth para o novo ambiente
- Observação operacional: o novo site pode ser publicado separadamente com `firebase deploy --only hosting:lexio-redesign-v2 --project hocapp-44760`, preservando o ambiente estável em `lexio.web.app`

### Etapas 108-111 — Chat Contextual no ResearchNotebook V2 ✅
- **Arquivos**: `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/lib/research-notebook-routes.ts`, `frontend/src/lib/research-notebook-routes.test.ts`
- Etapa 108: o `ResearchNotebookV2` passou a ter uma seção própria de chat contextual dentro do novo shell, com feed persistente, envio por Enter, sugestões rápidas e renderização markdown das respostas do assistente
- Etapa 109: o envio do chat foi portado para o V2 com o mesmo backend do notebook atual, usando `notebook_assistente`, contexto auditável de fontes/conversa/buscas, busca web opcional e registro de `llm_executions` no caderno
- Etapa 110: a UX do workbench foi endurecida com rollback seguro do estado otimista quando a resposta falha antes da persistência, devolvendo a pergunta ao input e evitando mensagens fantasmas no V2
- Etapa 111: os deep-links do workbench foram ampliados para a nova seção `chat`, o notebook clássico passou a mapear a aba correspondente para o V2 e a rodada foi validada com `npm run typecheck`, `npm run test` (**31/31 arquivos**, **244/244 testes**) e `npm run build` em `frontend/`
- Observação operacional: o chunk do `ResearchNotebookV2` subiu para **54.49 kB** (**gzip 12.37 kB**) após a entrada do chat, mas o build permaneceu limpo e sem regressão estrutural

### Etapas 104-107 — ResearchNotebook V2 Slice + Navegação de Preview Segura ✅
- **Arquivos**: `frontend/src/App.tsx`, `frontend/src/components/v2/V2WorkspaceLayout.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Profile.tsx`, `frontend/src/pages/ResearchNotebook.tsx`, `frontend/src/pages/labs/ResearchNotebookV2.tsx`, `frontend/src/lib/redesign-routes.ts`, `frontend/src/lib/research-notebook-routes.ts`, `frontend/src/lib/research-notebook-v2.ts`, `frontend/src/lib/redesign-routes.test.ts`, `frontend/src/lib/research-notebook-routes.test.ts`, `frontend/src/lib/research-notebook-v2.test.ts`
- Etapa 104: o preview do redesign passou a preservar query params de ativação (`/labs/*`) por helper central em `redesign-routes.ts`, evitando perda silenciosa do acesso ao `v2` ao navegar pelo shell, dashboard e profile clássicos
- Etapa 105: `ResearchNotebookV2.tsx` foi entregue como primeira fatia funcional do workbench flagship, com lista persistente, criação/remoção de cadernos, hidratação de detalhe, overview executivo, governança de fontes e ponte explícita para a experiência clássica nas áreas ainda não migradas
- Etapa 106: o notebook clássico passou a aceitar deep-link `?tab=` e a expor launchers de `Notebook V2` tanto na lista quanto no detalhe, mapeando o contexto atual para `overview`, `sources` ou `bridge` no novo workbench
- Etapa 107: a base do Notebook V2 ganhou testes dedicados para helpers de preview, rotas/deep-link e snapshot operacional; a rodada foi validada com `npm run typecheck`, `npm run test` (**31/31 arquivos**, **244/244 testes**) e `npm run build` em `frontend/`
- Observação operacional: `firestore.indexes.json` não precisou de alterações nesta rodada; a evolução ficou concentrada em navegação, roteamento, cache/reuso de estado derivado e uma nova superfície V2 sobre o mesmo backend do caderno atual

### Etapas 100-103 — DataJud Hardening + CI/CD Guardrails ✅
- **Arquivos**: `functions/src/index.ts`, `frontend/src/lib/datajud-service.ts`, `.github/workflows/test.yml`, `.github/workflows/firebase-preview.yml`, `.github/workflows/deploy-pages.yml`, `.github/workflows/firebase-deploy.yml`
- Etapa 100: `datajudProxy` deixou de versionar a chave do DataJud e passou a ler `DATAJUD_API_KEY` de Secret Manager com vínculo explícito à função
- Etapa 101: o cliente do notebook deixou de depender de fallback hardcoded para acesso direto ao DataJud; o browser só tenta a rota direta com chave explicitamente configurada no usuário ou no ambiente local
- Etapa 102: os workflows de preview, pages e deploy passaram a exigir `typecheck`, `test` e `build` do frontend antes de publicar, e o workflow principal de testes ganhou guardrail contra chave hardcoded e build de `functions/`
- Etapa 103: o deploy do Firebase passou a sincronizar `DATAJUD_API_KEY` antes da publicação e a base Python foi limpa o suficiente para `ruff` ficar verde sem regressão comportamental
- Validação desta rodada: `npm run build` em `functions/`; `npm run typecheck`, `npx vitest run` (**24/24 arquivos**, **221/221 testes**) e `npm run build` em `frontend/`; `pytest` com **2203/2203 testes** e `ruff check packages tests` limpos
- Observação operacional: `firestore.indexes.json` não precisou de alterações nesta rodada; o endurecimento ocorreu em secrets, workflows, cache/proxy de DataJud e qualidade do código

### Etapas 96-99 — Code Splitting do ResearchNotebook + Carga Tardia de Midia ✅
- **Arquivos**: `pages/ResearchNotebook.tsx`
- Etapa 96: modais e viewers pesados do notebook passaram a ser carregados sob demanda, evitando montar UI auxiliar e dependencias grandes no primeiro paint da rota
- Etapa 97: pipelines de audio, apresentacao, video, renderizacao literal, storage de midia e regeneracao de imagem/TTS passaram a ser importados apenas quando a acao correspondente e disparada
- Etapa 98: o pipeline principal de video saiu do carregamento inicial e o ajuste final eliminou os warnings remanescentes de dynamic import no build do frontend
- Etapa 99: o chunk de producao de `ResearchNotebook` caiu de **550.81 kB** (**gzip 154.25 kB**) para **320.23 kB** (**gzip 93.65 kB**), com melhor reaproveitamento de cache entre chunks auxiliares e validacao completa do frontend
- Validação desta rodada: `npm run typecheck` limpo, `npx vitest run` com **24/24 arquivos** e **221/221 testes** passando, `npm run build` concluído sem warnings
- Observação operacional: `firestore.indexes.json` não precisou de alterações nesta rodada; o ganho veio de code splitting e caching mais granular

### Etapas 92-95 — Hardening TTS/OpenRouter + UX DocumentDetail ✅
- **Arquivos**: `lib/tts-client.ts`, `lib/image-generation-client.ts`, `lib/model-catalog.ts`, `lib/model-config.ts`, `lib/audio-generation-pipeline.ts`, `lib/video-generation-pipeline.ts`, `lib/literal-video-production.ts`, `pages/ResearchNotebook.tsx`, `pages/DocumentDetail.tsx`, `lib/tts-client.test.ts`, `lib/video-generation-pipeline.test.ts`
- Etapa 92: defaults de TTS foram alinhados em áudio, vídeo, notebook e configurações para `openai/tts-1-hd`, removendo divergência residual de modelo padrão
- Etapa 93: `tts-client.ts` deixou de sobrescrever override explícito de modelo e os clientes OpenRouter críticos ganharam fallback seguro de `HTTP-Referer` fora de contexto browser ativo
- Etapa 94: `DocumentDetail.tsx` passou a oferecer ações rápidas de copiar o texto integral e duplicar o documento com os parâmetros atuais, reduzindo retrabalho operacional
- Etapa 95: cobertura de regressão foi ampliada com `tts-client.test.ts`, ajuste de `video-generation-pipeline.test.ts` e revalidação completa do frontend
- Validação desta rodada: `npm run typecheck` limpo, `npx vitest run` com **24/24 arquivos** e **221/221 testes** passando, `npm run build` concluído com sucesso

### Etapas 84-91 — UX do Editor + Estabilização Admin/Notebook ✅
- **Arquivos**: `components/Breadcrumb.tsx`, `components/Layout.tsx`, `pages/DocumentEditor.tsx`, `pages/DocumentDetail.tsx`, `firestore.rules`, `pages/PlatformAdminPanel.tsx`, `pages/PlatformCostsPage.tsx`, `lib/firestore-service.ts`, `lib/firestore-types.ts`, `lib/llm-client.ts`, `lib/error-humanizer.ts`, `pages/ResearchNotebook.tsx`, `lib/error-humanizer.test.ts`, `lib/llm-client.test.ts`
- Etapa 84: `DocumentEditor.tsx` agora suporta atalho `Ctrl+S` para salvar com segurança e sem depender do mouse
- Etapa 85: `Breadcrumb.tsx` foi adicionado e integrado em `DocumentDetail.tsx` e `DocumentEditor.tsx`, melhorando navegação contextual
- Etapa 86: o cabeçalho do editor passou a explicitar estado de salvamento e hint visual de teclado; `Layout.tsx` ganhou ação global de voltar ao topo para páginas densas
- Etapa 87: a UX transversal de navegação ficou mais previsível com scroll recovery manual rápido e trilha de navegação consistente
- Etapa 88: `firestore.rules` recebeu regras explícitas para `research_notebooks/{id}/memory/{docId}` tanto para o dono do caderno quanto para leitura admin por collection group, eliminando `Missing or insufficient permissions` no admin e prevenindo bloqueio futuro da memória dedicada
- Etapa 89: `loadPlatformCollections()` em `firestore-service.ts` passou a degradar com segurança quando a coleção dedicada `memory/search_memory` falhar, preservando o restante do painel agregado e expondo `operational_warnings` no overview
- Etapa 90: `App.tsx`, `PlatformAdminPanel.tsx` e `PlatformCostsPage.tsx` foram endurecidos para esperar `isReady`, defender acesso admin em profundidade e exibir mensagens humanizadas em vez de toasts genéricos
- Etapa 91: `llm-client.ts` passou a classificar `provider returned error` com `404` como `ModelUnavailableError`, `ResearchNotebook.tsx` passou a orientar troca de modelo em erros do estúdio e foram adicionados testes de regressão para humanização e classificação de erro
- Validação desta rodada: `npm run typecheck` limpo, `npx vitest run` com **23/23 arquivos** e **219/219 testes** passando, `npm run build` concluído com sucesso
- Observação operacional: `firestore.indexes.json` não precisou de alterações nesta rodada; o endurecimento ocorreu em regras e cache de agregação

### Etapa 62 — Dashboard Continue Working + Admin Expand/Collapse + Date Presets + Error Humanizer ✅
- **Arquivos**: `pages/Dashboard.tsx`, `pages/AdminPanel.tsx`, `pages/DocumentList.tsx`, `pages/Upload.tsx`, `pages/DocumentEditor.tsx`, `lib/error-humanizer.ts`, `lib/context-compactor.test.ts`, `lib/generation-service.ts`
- Etapa 55: 13 unit tests for context-compactor (deduplicateSegments, truncateWithStructure, compactContext)
- Etapa 56: Upload page enhanced empty state with prominent CTA, guidance text and supported formats
- Etapa 57: Pipeline progress now reports context compaction stats (originalLen → compactedChars, segmentsDropped)
- Etapa 58: DocumentEditor shows agent provenance badges from llm_executions metadata
- Etapa 59: `error-humanizer.ts` — centralized PT-BR error translation for network, HTTP, LLM, Firebase errors
- Etapa 60: DocumentList quick date presets ("7 dias", "Este mês") above date range inputs
- Etapa 61: AdminPanel "Expandir tudo" / "Recolher tudo" buttons in header for collapsible sections
- Etapa 62: Dashboard "Continuar trabalhando" card linking to most recent active document

### Etapa 48-50 — Cost Preview, Context Compactor, Dashboard Hub ✅
- **Arquivos**: `pages/NewDocument.tsx`, `pages/Dashboard.tsx`, `lib/context-compactor.ts`
- NewDocument exibe estimativa inline com `estimateDocumentGenerationCost()` abaixo do form
- Dashboard ganhou seção de "ações rápidas" com links diretos para Novo Documento, Upload, Caderno e Teses
- Novo módulo `context-compactor.ts` com funções `deduplicateSegments`, `truncateWithStructure`, `compactContext`

### Etapa 47 — UI de Orçamento de Tokens ✅
- **Arquivos**: `pages/CostTokensPage.tsx`
- Adicionada seção "Orçamento e Limites" no painel de custos pessoal com cards de status (mensal/diário) com indicação visual por cores (verde/amarelo/vermelho)
- Campos de configuração: limite mensal, diário e por pipeline (USD), percentual de alerta, toggle de bloqueio rígido
- Persistência direta em Firestore (`/users/{uid}/settings/preferences.token_budget`) com feedback de salvamento
- Budget status calculado em tempo real via useMemo com aproximação do gasto atual

### Etapa 46 — Estimativa de Custo para Geração de Documentos ✅
- **Arquivos**: `lib/generation-service.ts`
- Adicionada função `estimateDocumentGenerationCost(requestLength, hasAcervo, thesesCount)` que retorna estimativa de tokens e custo por agente
- Considera fatores de escala (comprimento do request, número de teses) e taxas por tier (fast/balanced)
- Os 3 agentes de acervo são condicionais — só incluídos na estimativa se `hasAcervo=true`

### Etapa 45 — Framework de Orçamento de Tokens ✅
- **Arquivos**: `lib/firestore-types.ts`, `lib/cost-analytics.ts`
- Novo tipo `TokenBudgetConfig` com limites mensais, diários e por pipeline (USD), threshold de alerta, bloqueio rígido e alertas
- Funções `checkBudget`, `getCurrentMonthSpend`, `getTodaySpend` para verificação de orçamento contra arrays de execuções
- Retorna `BudgetCheckResult` com status (`ok`/`warning`/`exceeded`), gasto atual, limite e mensagem

### Etapa 44 — UI de Retomada de Checkpoint de Vídeo ✅
- **Arquivos**: `pages/ResearchNotebook.tsx`, `components/VideoGenerationCostModal.tsx`
- O modal de geração de vídeo agora exibe banner informativo quando há checkpoint salvo de execução anterior (etapas completas, imagens/TTS gerados)
- O estado de checkpoint é capturado do erro lançado pelo pipeline e armazenado no state do componente
- Texto do botão muda para "Regenerar Fase 1" quando há checkpoint disponível
- Toast de erro inclui informação de progresso salvo

### Etapa 43 — Reranking Jurídico Determinístico Aprimorado ✅
- **Arquivos**: `lib/datajud-service.ts`
- O scoring de jurisprudência evoluiu de bônus binário de recência (5 anos) para decaimento temporal gradual com 6 faixas (1a, 3a, 5a, 10a, >20a), discriminando melhor decisões recentes de históricas
- Adicionado bônus de proximidade de frase: termos consecutivos da query encontrados adjacentes na ementa recebem pontuação adicional, privilegiando correspondência semântica mais precisa
- O tie-breaking do ranking agora usa hierarquia do tribunal antes da data: em caso de empate de score, tribunais superiores (STF/STJ) prevalecem sobre tribunais regionais e estaduais
- Validação executada em `frontend/`: `npm run typecheck`, `npm run test` (188/188) e `npm run build` com sucesso

### Etapa 42 — Checkpoints Retomáveis do Pipeline de Vídeo ✅
- **Arquivos**: `lib/video-generation-pipeline.ts`
- Adicionado contrato `VideoCheckpoint` que captura o estado completo após cada um dos 11 passos do pipeline (planData, scriptData, directedScenes, etc.)
- O checkpoint é atualizado incrementalmente após cada etapa concluída e incluído no resultado final para persistência pela UI
- Em caso de erro/interrupção, o checkpoint é anexado à exceção (`videoCheckpoint`), permitindo que o frontend ofereça retomada do último passo completado
- Validação executada em `frontend/`: `npm run typecheck`, `npm run test` (188/188) e `npm run build` com sucesso

### Etapa 40+41 — Effectiveness Scoring e Auto-Recomendação de Política ✅
- **Arquivos**: `pages/PlatformAdminPanel.tsx`
- O painel de validação longitudinal agora calcula um score de efetividade (0-100) para cada coorte, combinando penalidades de delta, aderência, amostras e proporção de ações assistidas
- A tabela de coortes ganhou coluna de efetividade com código de cor (verde ≥70, amarelo ≥40, vermelho <40) para leitura rápida
- Adicionada recomendação automática da melhor política por cenário: o sistema identifica a coorte com maior efetividade (≥3 amostras, score ≥40) e oferece botão de adoção com 1 clique
- Se a política atual já é a mais efetiva, um badge verde confirma a aderência operacional
- Validação executada em `frontend/`: `npm run typecheck`, `npm run test` (188/188) e `npm run build` com sucesso

### Etapa 39 — Drift Acionável + Validação Longitudinal ✅
- **Arquivos**: `pages/PlatformAdminPanel.tsx`
- Alertas de drift deixaram de ser apenas informativos e passaram a gerar planos acionáveis com aplicação assistida de thresholds diretamente no painel admin
- Foram adicionados guardrails de normalização/clamp dos thresholds para prevenir configuração inválida e reduzir risco de regressões operacionais
- O painel agora exibe leitura longitudinal por coorte (janela × rollout × porte), incluindo deltas médios e taxa de override manual para apoiar calibração contínua
- Validação executada em `frontend/`: `npm run typecheck`, `npm run test` (188/188) e `npm run build` com sucesso

### Etapa 38 — Hardening de Testes Frontend para CI ✅
- **Arquivos**: `lib/firestore-service.test.ts`, `lib/web-search-service.test.ts`
- Ajustado o teste de normalização de notebook para refletir o novo comportamento de dual-read com memória dedicada (`search_memory`), removendo expectativa obsoleta de leitura única
- Endurecido o teste de parser plain-text do DuckDuckGo/Jina para evitar dependência de rede em estratégias de fallback, eliminando timeout intermitente no CI
- Validação local concluída em `frontend/`: `npm run typecheck`, `npm run test` (188/188) e `npm run build` com sucesso

### Etapa 37 — Refatoração dos Handlers de Fonte no Notebook ✅
- **Arquivos**: `pages/ResearchNotebook.tsx`
- O fluxo de entrada para pesquisa de fontes foi consolidado com handlers consistentes para externa, profunda e jurisprudência, incluindo override de query/configuração para replay auditável
- O replay de auditoria jurisprudencial passou a reutilizar o mesmo entrypoint operacional (`handleAddJurisprudenceSource`) com preset hidratado, reduzindo caminhos paralelos de execução
- Wrappers inline antigos dos botões e do atalho Enter foram substituídos por triggers nomeados, melhorando legibilidade e manutenção sem alterar comportamento
- Validação executada com `npm run typecheck` no frontend com saída limpa (`tsc --noEmit`, exit code 0)

### Etapa 36 — Saúde de Governança de Rollout ✅
- **Arquivos**: `pages/PlatformAdminPanel.tsx`
- O painel admin passou a calcular um status de saúde da governança com base na taxa de override manual da trilha histórica de calibração
- Foi adicionada badge operacional (`saudável`, `neutro`, `atenção`) para leitura rápida da aderência entre recomendação assistida e decisões manuais
- Com isso, a governança deixa de ser apenas retrospectiva e ganha sinal contínuo de estabilidade operacional

### Etapa 35 — Alertas de Desvio da Calibração ✅
- **Arquivos**: `pages/PlatformAdminPanel.tsx`
- Foram adicionados alertas automáticos derivados da trilha histórica para detectar desvios (ex.: delta crítico alto, delta de atenção em alta, override manual elevado)
- Os alertas usam recorte recente de calibrações e aparecem no bloco de histórico com severidade (`critical`, `warning`, `info`)
- Com isso, a análise da calibração passa de observação passiva para monitoramento ativo de drift

### Etapa 34 — Métricas Agregadas de Calibração ✅
- **Arquivos**: `pages/PlatformAdminPanel.tsx`
- O painel admin agora deriva métricas agregadas do histórico de calibração, incluindo contagem de ações manuais, aplicações assistidas e delta médio por severidade
- Essas métricas foram adicionadas acima da tabela histórica para leitura operacional rápida da direção dos ajustes (ruído vs sensibilidade)
- Com isso, a trilha auditável deixou de ser apenas cronologia e passou a oferecer síntese quantitativa para tomada de decisão

### Etapa 33 — Histórico Auditável de Calibração ✅
- **Arquivos**: `lib/firestore-types.ts`, `pages/PlatformAdminPanel.tsx`
- As decisões de calibração passaram a gerar histórico persistido de recomendado vs aplicado em `UserSettings` (`platform_admin_alert_recommendation_history`)
- O histórico registra ação (`recommendation_applied` ou `thresholds_saved`), modo de rollout, janela da recomendação, porte detectado, thresholds aplicados/recomendados e impacto por severidade
- O painel admin agora exibe uma tabela operacional com os últimos registros para auditoria longitudinal da estratégia de alertas
- Com isso, a calibragem deixa de ser apenas estado atual e passa a ter trilha histórica de decisões para leitura de ruído/sensibilidade ao longo do tempo

### Etapa 32 — Ponderação Temporal + Preview de Impacto ✅
- **Arquivos**: `pages/PlatformAdminPanel.tsx`
- A heurística da recomendação assistida agora aplica ponderação temporal por recência ao analisar descartes e tendência, reduzindo sensibilidade excessiva a picos antigos
- O painel passou a reutilizar um gerador central de alertas para comparar estado atual vs recomendado de forma consistente
- Foi adicionada leitura de impacto estimado antes da aplicação, com contagem de alertas `críticos`, `atenção` e `informativos` (atual → recomendado)
- Com isso, a calibragem operacional passou a ter um pré-check explícito de ruído esperado antes de efetivar a mudança

### Etapa 31 — Política de Rollout da Recomendação ✅
- **Arquivos**: `lib/firestore-types.ts`, `pages/PlatformAdminPanel.tsx`
- A recomendação assistida de thresholds passou a usar janela histórica configurável (`14`, `30`, `60`, `90` dias), persistida em `UserSettings`
- O painel admin agora suporta modo de rollout da recomendação (`manual` ou `assistido`), também persistido para reaproveitamento operacional
- Em modo assistido, aplicar recomendação já persiste thresholds/perfil/política automaticamente; em modo manual, a recomendação fica para revisão antes do save
- Com isso, a calibragem deixa de ser apenas aplicação pontual e passa a ter governança explícita de aprovação e rollout

### Etapa 30 — Recomendação Assistida de Thresholds ✅
- **Arquivos**: `pages/PlatformAdminPanel.tsx`
- O painel admin agora calcula recomendação assistida de thresholds com base em porte da base (`small`, `medium`, `large`) e telemetria recente de cobertura/descartes da memória dedicada
- A interface recebeu ação de um clique (`Aplicar recomendado`) para adotar os thresholds sugeridos sem edição manual campo a campo
- O painel também passou a exibir o porte detectado da base junto da calibração e a sincronizar esse porte após refresh operacional (ex.: execução de backfill)
- Com isso, a calibragem saiu de presets estáticos apenas manuais e passou para um fluxo híbrido: preset + recomendação contextual

### Etapa 29 — Presets por Perfil Operacional dos Alertas ✅
- **Arquivos**: `lib/firestore-types.ts`, `pages/PlatformAdminPanel.tsx`
- O painel admin agora oferece perfis operacionais prontos para thresholds dos alertas da memória dedicada: `conservative`, `balanced` e `aggressive`
- A UI passou a detectar automaticamente quando os thresholds entram em estado customizado (`custom`) após edição manual de campos
- O perfil ativo também passou a ser persistido em `UserSettings` (`platform_admin_alert_profile`), preservando contexto operacional entre sessões
- A mensagem de tendência de descartes foi ajustada para refletir o multiplicador configurável, evitando texto fixo desalinhado com a configuração atual

### Etapa 28 — Thresholds Configuráveis dos Alertas ✅
- **Arquivos**: `lib/firestore-types.ts`, `pages/PlatformAdminPanel.tsx`
- O painel admin agora permite editar os principais thresholds dos alertas da memória dedicada (pico de descartes, multiplicador de tendência, cobertura mínima e janela sem atualizações)
- Esses thresholds passaram a ser persistidos em `UserSettings` (`platform_admin_alert_thresholds`), com defaults seguros e fallback automático
- A lógica de alertas agora usa esses valores configuráveis em tempo de execução, reduzindo necessidade de ajuste por código
- Com isso, a operação passa de thresholds fixos para calibragem administrável conforme o comportamento real da base

### Etapa 27 — Hardening de Escala do Backfill ✅
- **Arquivos**: `lib/firestore-service.ts`, `pages/PlatformAdminPanel.tsx`
- `backfillNotebookSearchMemoryAcrossPlatform()` passou a processar cadernos em chunks paginados com cursor (`startAfter`) e limites configuráveis (`chunkSize`, `maxNotebooks`)
- O relatório do backfill foi ampliado com telemetria de execução em escala: chunks processados, tamanho de chunk e indicador de limite atingido
- O painel admin passou a exibir esses novos campos para leitura operacional da rotina em bases maiores
- Com isso, a etapa administrativa deixa de depender de varredura única e passa a ter comportamento previsível para workloads mais volumosos

### Etapa 26 — Backfill Administrativo da Memória Dedicada ✅
- **Arquivos**: `lib/firestore-service.ts`, `pages/PlatformAdminPanel.tsx`
- Foi criada rotina administrativa `backfillNotebookSearchMemoryAcrossPlatform()` para escanear cadernos da plataforma e semear `memory/search_memory` quando ainda houver apenas dados legados
- A rotina suporta modo diagnóstico (`dry-run`) e execução efetiva (`write`), com relatório de escaneados, migrados, já dedicados, legados vazios e falhas
- O painel admin passou a expor controles para rodar diagnóstico/backfill e exibir o resumo da última execução sem sair da interface
- Após execução efetiva, o painel recarrega overview e série diária em modo `force=true`, refletindo imediatamente o efeito operacional no dashboard

### Etapa 25 — Alertas Operacionais no Admin ✅
- **Arquivos**: `pages/PlatformAdminPanel.tsx`
- O painel admin agora deriva alertas operacionais da memória dedicada usando os dados diários e agregados já coletados
- Foram incluídos sinais para: descartes elevados, aceleração de descartes semana a semana, cobertura baixa de memória dedicada e ausência de atualizações recentes
- A seção de alertas diferencia severidade (`crítico`, `atenção`, `informativo`) com leitura direta para ação operacional
- Com isso, a trilha da memória dedicada saiu de observação passiva e passou a fornecer indicação ativa de risco no cockpit

### Etapa 24 — Série Diária da Memória Dedicada ✅
- **Arquivos**: `lib/firestore-types.ts`, `lib/firestore-service.ts`
- `PlatformDailyUsagePoint` passou a carregar duas novas métricas da memória dedicada: atualizações diárias e descartes diários por retenção
- `getPlatformDailyUsage()` agora agrega esses eventos com base no `updated_at` e nos metadados de retenção da coleção `memory/search_memory`
- Com isso, a trilha de observabilidade da migração dedicada deixa de ser apenas snapshot agregado e passa a ter linha temporal diária para evolução futura de alertas

### Etapa 23 — Observabilidade Agregada da Memória Dedicada ✅
- **Arquivos**: `lib/firestore-types.ts`, `lib/firestore-service.ts`, `pages/PlatformAdminPanel.tsx`
- `getPlatformOverview()` agora agrega métricas da coleção dedicada `memory/search_memory`, incluindo cobertura de notebooks com memória dedicada, volume total de auditorias e buscas salvas, e descartes de retenção
- O contrato `PlatformOverviewData` foi expandido para transportar esses campos de observabilidade sem quebrar o restante do painel
- O `PlatformAdminPanel` passou a exibir cartões de leitura rápida para cobertura da memória dedicada e descartes acumulados por retenção
- Com isso, a migração dedicada deixa de ser invisível operacionalmente e passa a ter leitura agregada inicial no cockpit administrativo

### Etapa 22 — Retenção/TTL da Memória Dedicada ✅
- **Arquivos**: `lib/firestore-service.ts`
- O write-path de `memory/search_memory` agora aplica retencao automatica para manter crescimento controlado sem depender apenas de limites na UI
- `research_audits` passou a usar TTL de 45 dias com limite de 60 entradas, preservando ao menos o snapshot mais recente para continuidade
- `saved_searches` passou a usar limite de 120 entradas ordenadas por recencia (`updated_at`/`created_at`)
- Metadados de retencao (before/after/dropped e parametros aplicados) passam a ser persistidos no proprio documento dedicado para observabilidade basica
- Logs informativos foram adicionados quando a retencao realmente descarta entradas, facilitando diagnostico operacional local

### Etapa 21 — Persistência Dedicada (Migração Incremental) ✅
- **Arquivos**: `lib/firestore-service.ts`
- O notebook passou a ter uma estrutura dedicada de memoria de busca em `research_notebooks/{id}/memory/search_memory`, sem quebra de contrato para a UI atual
- `getResearchNotebook` agora faz dual-read com fallback seguro: prioriza a estrutura dedicada quando existir e continua funcional com campos legados no documento principal
- `createResearchNotebook` e `updateResearchNotebook` agora fazem dual-write de `research_audits` e `saved_searches`, preservando compatibilidade enquanto a migracao e estabilizada
- Foi adicionado backfill oportunistico: na leitura, quando houver dados legados e ainda nao houver documento dedicado, o servico semeia a estrutura nova automaticamente
- `deleteResearchNotebook` agora remove tambem o documento dedicado de memoria de busca, evitando lixo residual
- O hardening da transicao tambem passou a reduzir payload duplicado no documento raiz durante updates sincronizados e o deep-link do notebook foi ajustado para sempre carregar o notebook completo via `getResearchNotebook`

### Etapa 20 — Ações em Lote para Buscas Salvas ✅
- **Arquivos**: `pages/ResearchNotebook.tsx`
- A aba Fontes agora suporta selecao multipla de buscas salvas com checkbox por card e controle de selecionar/desmarcar as buscas visiveis no recorte atual
- Foram adicionadas acoes em lote para fixar, desafixar, limpar selecao e excluir multiplos presets com confirmacao explicita antes da remocao
- Acoes de tag em lote tambem passaram a existir: e possivel adicionar ou remover uma tag unica simultaneamente em todas as buscas selecionadas
- A selecao e podada automaticamente quando filtros mudam, evitando operacoes em itens fora da colecao visivel no momento
- Com isso, o notebook sai do modo de governanca apenas individual e passa a suportar manutencao operacional mais rapida em cadernos com maior volume de consultas

### Etapa 19 — Governanca Inline de Tags nas Buscas Salvas ✅
- **Arquivos**: `pages/ResearchNotebook.tsx`
- As buscas salvas agora aceitam edicao manual inline de tags no mesmo fluxo usado para renomear o preset, sem abrir modal extra
- As tags editadas manualmente passam por normalizacao simples, deduplicacao e limite leve, preservando governanca pragmatica dentro do proprio documento do notebook
- A UX tambem reaproveita essas tags como atalho de filtro local: ao clicar em uma tag da card, a lista de buscas salvas e filtrada imediatamente pela etiqueta escolhida
- Com isso, a camada inicial de governanca das buscas salvas deixa de depender apenas de tags derivadas automaticamente e passa a suportar curadoria manual minima pelo usuario

### Etapa 18 — Buscas Salvas do Notebook ✅
- **Arquivos**: `lib/firestore-types.ts`, `lib/firestore-service.ts`, `components/JurisprudenceConfigModal.tsx`, `pages/ResearchNotebook.tsx`
- O notebook agora permite promover snapshots auditados de busca para `saved_searches`, criando presets reaplicaveis diretamente na aba Fontes
- Buscas externas e profundas podem ser reaplicadas a partir desses presets, enquanto a jurisprudencia reabre o modal com query, tribunais, datas, graus, limite e area juridica restaurados
- A UX tambem passou a permitir exclusao explicita dessas buscas salvas, mantendo o notebook como workbench de continuidade e nao apenas historico de execucao
- As buscas salvas agora tambem podem ser fixadas e renomeadas inline, permitindo distinguir presets de referencia de consultas ocasionais
- A aba Fontes agora tambem permite expandir/colapsar historico auditado e lista de buscas salvas, mantendo a navegacao controlada conforme o notebook acumula consultas
- A lista de buscas salvas agora distingue visualmente presets fixados das demais consultas, reduzindo mistura entre referencia persistente e uso ocasional
- A lista de buscas salvas agora tambem pode ser filtrada localmente por titulo, consulta ou tipo de pesquisa, reduzindo atrito quando o notebook acumula presets
- As buscas salvas agora tambem podem ser filtradas semanticamente por tipo (`externa`, `profunda`, `jurisprudencia`), reduzindo a dependencia exclusiva de busca textual
- As buscas salvas agora tambem exibem tags semanticas leves derivadas do snapshot auditado, como tipo, area juridica e recorte temporal, melhorando leitura e filtragem futura
- As buscas salvas agora tambem podem ter essas tags ajustadas manualmente inline, permitindo curadoria leve dos presets sem sair da lista

### Etapa 17 — Memória Auditável das Buscas ✅
- **Arquivos**: `lib/notebook-context-audit.ts`, `pages/ResearchNotebook.tsx`
- Pesquisa externa, pesquisa profunda e jurisprudencia/DataJud agora registram um snapshot auditavel do que realmente foi promovido para sintese antes da chamada ao modelo
- O snapshot resume consulta, quantidade de resultados encontrados, itens selecionados, tribunais envolvidos, volume de contexto compilado e fallback para snippets quando aplicavel
- A aba de fontes agora exibe a janela auditavel da proxima busca e preserva o ultimo snapshot efetivamente sintetizado para comparacao operacional
- O notebook tambem persiste um historico curto desses snapshots em `research_audits`, exibindo as ultimas buscas auditadas mesmo apos recarregar a pagina
- Esse historico agora e operacional: buscas web e profundas podem ser reaplicadas direto da card de auditoria, e a jurisprudencia reabre o modal ja hidratado com os filtros salvos no snapshot

### Etapa 16 — Memória Auditável do Chat ✅
- **Arquivos**: `lib/notebook-context-audit.ts`, `pages/ResearchNotebook.tsx`
- O chat do notebook agora monta um snapshot auditável de contexto com fontes efetivamente incluídas, janela de conversa, histórico de buscas do caderno e enriquecimento web opcional
- Esse snapshot passou a alimentar a própria chamada do assistente conversacional, reduzindo montagem ad hoc e tornando explícito o que entrou na resposta
- A aba de chat agora exibe a janela auditável da próxima resposta, inclusive quando a busca web ao vivo estiver habilitada
- O notebook também preserva o último snapshot efetivamente usado no chat para comparação com o preview atual

### Etapa 15 — Memória Auditável Inicial do Estúdio ✅
- **Arquivos**: `lib/notebook-context-audit.ts`, `pages/ResearchNotebook.tsx`
- O notebook agora calcula explicitamente quais fontes entram na janela do estúdio, quais foram truncadas, quais ficaram de fora e quantos caracteres efetivamente seguem para o pipeline
- A janela de conversa do estúdio agora também fica auditável: quantidade de mensagens incluídas, mensagens descartadas por recência e truncamento por caracteres
- O snapshot auditável passou a ser usado no próprio disparo do pipeline do estúdio, substituindo a montagem ad hoc anterior de `sourceContext` e `conversationContext`
- A visão geral do notebook e a aba Estúdio agora exibem esse recorte de memória com regras e limites visíveis ao usuário

### Etapa 14 — Cockpit Operacional com Agregados no Notebook ✅
- **Arquivos**: `lib/notebook-pipeline-progress.ts`, `pages/ResearchNotebook.tsx`, `contexts/TaskManagerContext.tsx`
- O resumo operacional do notebook agora exibe agregados cumulativos por execucao ativa: custo acumulado, duracao processada, retries e fallbacks
- O cockpit agora tambem resume degradacoes/fallbacks relevantes por pipeline ativo, em vez de depender apenas do `stageMeta` da etapa corrente
- `TaskManagerContext.tsx` passou a aceitar um resumo operacional estruturado para tarefas em background, permitindo que o estúdio mantenha os agregados ao longo da execucao
- Acervo, pipeline de video e geracao literal agora acumulam telemetria operacional ao longo da execucao ativa, com deduplicacao local dos eventos recebidos
- O cockpit agora tambem mostra detalhe de saida operacional para video, distinguindo lotes de imagem, narracoes, lotes de clipe e render local versus render externo
- `TaskBar.tsx` agora mostra agregados compactos das tarefas em andamento, incluindo custo acumulado, retries, fallbacks e quantidade de etapas reportadas

### Etapa 13 — Progresso Narrativo Unificado no Notebook ✅
- **Arquivos**: `lib/notebook-pipeline-progress.ts`, `pages/ResearchNotebook.tsx`, `components/AgentTrailProgressModal.tsx`
- Acervo e estudio passaram a usar um contrato compartilhado de progresso para trilha, etapa ativa e mensagem principal do modal
- `ResearchNotebook.tsx` deixou de manter a montagem manual dos passos do acervo e do estudio
- O modal agora recebe `activeStageLabel` e `activeStageMeta`, exibindo a etapa real e a posicao da execucao na trilha
- As mensagens do estudio agora refletem o especialista ativo em vez de um texto generico solto

### Cache de Implementacao Atual
- `frontend/src/lib/notebook-pipeline-progress.ts` centraliza o estado compartilhado de progresso do notebook
- `frontend/src/pages/ResearchNotebook.tsx` e a principal integracao atual e a referencia para as proximas unificacoes de progresso
- `frontend/src/pages/ResearchNotebook.tsx` agora tambem controla a carga tardia de viewers, modais e runtimes de midia, permitindo que o browser reutilize chunks menores por fluxo em vez de sempre baixar o workbench completo
- O fluxo documental agora tambem expoe retries, fallback, custo e duracao por etapa via `frontend/src/lib/document-pipeline.ts`, servindo como referencia para a proxima camada do notebook
- O fluxo `analyzeNotebookAcervo()` agora publica metadados operacionais por etapa e fallback seguro, que ja aparecem no progresso inline e no modal do notebook
- O estudio agora tambem propaga `stageMeta` dinamico pelo `TaskManagerContext`, incluindo modelo efetivo, retries, fallback, custo e duracao por etapa nos pipelines de texto, audio e apresentacao
- O video agora tambem propaga `stageMeta` dinamico nas fases de planejamento e geracao literal, incluindo modelo efetivo, retries, fallback, custo e duracao nos modais e no editor
- O notebook agora tambem exibe um resumo operacional unico no topo da tela, consolidando acervo, estudio e video sem depender exclusivamente dos modais individuais
- O resumo operacional consolidado do notebook agora tambem calcula ETA aproximado a partir do progresso real e do tempo decorrido de cada execucao ativa
- O resumo operacional consolidado do notebook agora tambem exibe agregados cumulativos e sumario de degradacoes por execucao ativa
- O resumo operacional consolidado do notebook agora tambem exibe detalhe sintetico de saida para os fluxos de video e sincroniza esse agregado com tarefas em background
- A trilha de memoria/contexto auditavel agora cobre Estudio, Chat e Buscas; proxima camada planejada: consolidacao dos thresholds com dados reais e eventual governanca por perfil operacional

### Validacao mais recente
- `npm run typecheck`, `npx vitest run` (**24/24 arquivos, 221/221 testes**) e `npm run build` executados em `frontend/` com sucesso apos a rodada de code splitting do notebook; build final sem warnings e com chunk `ResearchNotebook` em **320.23 kB** (**gzip 93.65 kB**)

### Etapa 1 — Saida JSON Estruturada + Parser ✅
- **Arquivos**: `lib/notebook-studio-pipeline.ts`, `components/artifacts/artifact-parsers.ts`
- Prompts atualizados para gerar JSON para: apresentacao, mapa_mental, cartoes_didaticos, teste, tabela_dados, infografico, audio_script, video_script
- Parser com tipos TypeScript completos e fallback para Markdown
- Token limits aumentados: pesquisador 4000, especialista 8000, revisor 10000
- Revisor mantém formato JSON/Markdown conforme o artefato

### Etapa 2 — ArtifactViewerModal ✅
- **Arquivo**: `components/artifacts/ArtifactViewerModal.tsx`
- Modal full-width (95vw, 90vh) com backdrop blur
- Roteia para viewer correto por tipo via `parseArtifactContent()`
- Header com icone, titulo, data, acoes (copiar, exportar dropdown, excluir, fechar)
- Fecha com Escape, previne scroll do body

### Etapa 3 — FlashcardViewer + QuizPlayer ✅
- **FlashcardViewer**: flip 3D, navegacao, filtro categoria/dificuldade, modo estudo, shuffle, progresso
- **QuizPlayer**: multipla escolha, V/F, dissertativa, caso pratico, associacao, modos estudo/prova, scoring, resultados

### Etapa 4 — PresentationViewer ✅
- Carrossel de slides 16:9, navegacao setas/teclado, fullscreen overlay
- Speaker notes toggle, thumbnail strip, fade transitions

### Etapa 5 — MindMapViewer ✅
- Arvore horizontal puro CSS/React (sem D3)
- Collapse/expand nos, cores por ramo, emojis, expandir/recolher tudo

### Etapa 6 — DataTableViewer + InfographicRenderer ✅
- **DataTableViewer**: sort, filter, busca, paginacao, resumo, legenda, zebra
- **InfographicRenderer**: secoes coloridas, stats animados, layout magazine

### Etapa 7 — AudioScriptViewer + VideoScriptViewer ✅
- **AudioScriptViewer**: timeline vertical, segmentos coloridos por tipo, speaker, notas
- **VideoScriptViewer**: layout storyboard com cenas, visuais, transicoes, b-roll

### Etapa 8 — ReportViewer ✅
- TOC automatico via parse de headers Markdown
- Scroll spy com IntersectionObserver
- Toggle mostrar/ocultar indice

### Etapa 9 — Sistema de Exportacao ✅
- **Arquivo**: `components/artifacts/artifact-exporters.ts`
- Dropdown no modal com opcoes por tipo:
  - Flashcards: Markdown, CSV Anki, JSON
  - Quiz: Prova TXT, Gabarito TXT, JSON
  - Apresentacao: PowerPoint (PPTX), Texto slides, PNG ZIP, JSON
  - Tabela: CSV, JSON
  - Audio/Video: Roteiro TXT, JSON
  - Mind Map/Infografico: JSON
  - Textos: Markdown

### Atualizacoes Recentes ✅
- Geracao de midia da apresentacao movida para `lib/presentation-generation-pipeline.ts`
- Geracao literal de audio movida para `lib/audio-generation-pipeline.ts`
- Renderizacao final de infografico, mapa mental e tabela centralizada em `lib/notebook-studio-pipeline.ts`
- Slides agora combinam imagem contextual com layout final antes de persistir no notebook
- Estudio de video literal agora faz upload de blobs temporarios para Cloud Storage e salva apenas JSON compactado no Firestore
- Persistencia do notebook normaliza estado literal para evitar estouro do limite de 1 MiB por documento
- CSP do frontend/Firebase Hosting permite `blob:` em fluxos necessarios de upload/render do estudio
- Pipelines criticos do notebook e de midia passaram a usar fallback automatico para modelos confiaveis quando modelos instaveis/transientes falham
- Pesquisa profunda e jurisprudencial passou a exibir warnings de degradacao, diagnosticos tecnicos e complemento por STF/Jina quando necessario
- `TaskManagerContext.tsx` passou a aceitar `stageMeta` nos tasks do estudio, e `ResearchNotebook.tsx` agora encaminha metadados estruturados dos callbacks do pipeline para o modal e a trilha ativa
- `notebook-studio-pipeline.ts`, `audio-generation-pipeline.ts` e `presentation-generation-pipeline.ts` passaram a emitir metadados operacionais reais apos cada etapa concluida, evitando texto sintetico sem lastro operacional
- `video-generation-pipeline.ts` e `literal-video-production.ts` passaram a emitir metadados operacionais reais por etapa e por lote, e `video-pipeline-progress.ts` agora resolve aliases de fases de midia para labels/descricoes consistentes na UI
- `VideoGenerationCostModal.tsx` e `VideoStudioEditor.tsx` agora exibem `stageMeta` do pipeline de video, em vez de depender apenas de label e percentuais crus
- `ResearchNotebook.tsx` passou a consolidar essas execucoes ativas em um painel superior de operacoes em andamento, e `TaskBar.tsx` agora mostra `stageMeta` para tarefas em background

### Etapa 10 — Audio Overview Pipeline ✅
- **Arquivos**: `lib/tts-client.ts`, `lib/notebook-audio-pipeline.ts`, `components/artifacts/AudioOverviewPlayer.tsx`
- TTS client: OpenRouter chat completions com saida de audio por streaming (`openai/gpt-4o-audio-preview`) + Web Speech API fallback
- Pipeline gera script podcast 2 vozes (Host A / Host B)
- Player com controles, velocidade, download MP3, transcricao sincronizada
- Card de Audio Overview na aba Overview (estilo NotebookLM)

### Etapa 11 — Redesign do Estudio + UX ✅
- ARTIFACT_CATEGORIES: 4 categorias visuais (Estudo, Documentos, Visual, Midia)
- Cards com cores por categoria, emojis, descricoes melhoradas
- Grid responsivo por categoria

### Etapa 12 — Modelos Default + Token Limits ✅
- studio_pesquisador: Claude 3.5 Haiku (era Llama 4 Scout free)
- studio_escritor: Claude Sonnet 4 (era Llama 3.3 70B free)
- studio_roteirista: Claude Sonnet 4 (era Llama 3.3 70B free)
- studio_visual: Claude Sonnet 4 (era Llama 3.3 70B free)
- studio_revisor: Claude 3.5 Haiku (era Llama 3.3 70B free)

---

## Arquivos Criados/Modificados

### Novos (14 arquivos)
```
frontend/src/components/artifacts/
  artifact-parsers.ts          — Tipos e parser JSON com fallback
  artifact-exporters.ts        — Exportacao por tipo de artefato
  index.ts                     — Barrel exports
  ArtifactViewerModal.tsx      — Modal roteador de viewers
  FlashcardViewer.tsx          — Flashcards interativos
  QuizPlayer.tsx               — Quiz com scoring
  PresentationViewer.tsx       — Carrossel de slides
  MindMapViewer.tsx            — Mapa mental em arvore
  DataTableViewer.tsx          — Tabela com sort/filter
  InfographicRenderer.tsx      — Infografico visual
  AudioScriptViewer.tsx        — Timeline de audio
  VideoScriptViewer.tsx        — Storyboard de video
  ReportViewer.tsx             — Documento com TOC
  AudioOverviewPlayer.tsx      — Player de podcast

frontend/src/lib/
  tts-client.ts                — Cliente TTS OpenRouter + Web Speech
  notebook-audio-pipeline.ts   — Pipeline Audio Overview
```

### Modificados (3 arquivos)
```
frontend/src/lib/notebook-studio-pipeline.ts  — Prompts JSON + token limits
frontend/src/lib/model-config.ts              — Modelos default atualizados
frontend/src/pages/ResearchNotebook.tsx        — Modal, categorias, Audio Overview
```

---

## Melhorias Futuras (nao implementadas)
- [ ] PDF export via jspdf
- [ ] D3.js para mind map (atualmente puro CSS)
- [ ] Spaced repetition algorithm para flashcards
- [ ] Drag-and-drop para associacao no quiz
- [ ] Waveform visualization no audio player
- [ ] Edicao inline de artefatos gerados
- [ ] Templates de instrucoes pre-definidos
- [ ] Versionamento de artefatos (re-gerar mantendo anterior)

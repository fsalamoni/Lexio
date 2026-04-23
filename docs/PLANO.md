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

## Andamento Atual (ciclo 2026-04-19)

**Status:** ⚠️ avançando Faixa B com a fundação do redesign V2 em expansão controlada — effectiveness scoring, checkpoints de vídeo e reranking jurídico concluídos; estabilização crítica de admin/notebook, hardening de TTS/DocumentDetail, code splitting do ResearchNotebook, hardening de DataJud/CI-CD, `ProfileV2`, `DashboardV2`, dezoito ondas funcionais do trilho V2 validadas localmente, `/` agora promovida para `DashboardV2` sob gate, shell V2 cobrindo `/documents*`, `/upload`, `/theses`, `/settings*`, `/admin*` e `/profile`, aliases técnicos completos para os antigos labs de dashboard/notebook/profile, migração visual real das superfícies internas principais via primitives compartilhadas + base V2 compartilhada para configuracoes, custos pessoal/agregado, catalogo, configuracoes especializadas e o nucleo de governanca/admin promovidos para blocos integralmente nativos, alem de navegacao preview-safe consolidada entre sidebar/notificacoes/admin, um Hosting dedicado para o redesign em `lexio-redesign-v2-44760.web.app` e o hotfix do deploy estavel do Firebase concluido com `DATAJUD_API_KEY` provisionado e validado em producao

**Atualização incremental (2026-04-22 — Wave 20: performance + confiança de progresso):**
- ✅ Pipeline documental com rollout por feature flag para Redator em 10k tokens (`VITE_DOC_REDATOR_10K_ENABLED`) e fallback automático para 12k por qualidade mínima (`VITE_DOC_REDATOR_QUALITY_ROLLBACK_MIN` / `VITE_DOC_REDATOR_QUALITY_ROLLBACK_DISABLED`).
- ✅ Seleção automática da melhor versão final (primária vs fallback), mantendo rastreabilidade em `generation_meta.redator` e contabilizando custos das tentativas extras em `llm_executions`.
- ✅ Estimador de custo do gerador documental atualizado para refletir o modo ativo do Redator (10k/12k).
- ✅ Normalização de confiança de progresso no notebook: fluxos de acervo/estúdio/vídeo/literal limitam estado em execução a `<=99%` e só promovem conclusão após persistência.
- 🔄 Próximo bloco: consolidar paralelização segura de agentes onde não houver regressão de qualidade, fechar governança final de release e executar trilha operacional completa de merge/pull/commit/deploy.

**Atualização incremental (2026-04-22 — Wave 21: hardening mobile + progresso monotônico):**
- ✅ Fallback do Redator sem regressão visual de progresso: reexecução e reavaliação passaram a permanecer na fase de `qualidade`, evitando salto regressivo de etapa no painel e preservando contrato de confiança.
- ✅ `TaskBar` endurecido para mobile: badge com largura responsiva, painel expandido com altura adaptativa e metadados sem truncamento agressivo em telas pequenas.
- ✅ `NewDocument` endurecido para mobile: ações finais reorganizadas em pilha responsiva (detalhar contexto + gerar + estimativa), removendo risco de overflow horizontal em larguras estreitas.
- ✅ `ResearchNotebook` endurecido para mobile em pontos críticos de uso: input de link em fontes e barra inferior do chat agora quebram corretamente para coluna em telas pequenas.
- ✅ Validação completa pós-hardening: `npm run typecheck` + `npm run test -- --run` com sucesso (35/35 arquivos, 273/273 testes).
- 🔄 Próximo bloco: paralelização segura adicional de agentes (somente etapas independentes), mantendo gates de qualidade e sem regressão de UX/confiabilidade.

**Atualização incremental (2026-04-23 — Wave 22: paralelização segura + hardening mobile residual):**
- ✅ Pipeline documental (`generation-service.ts`) com carregamento paralelo da base complementar (teses + contexto leve de acervo), reduzindo latência em etapas independentes sem alterar contrato de qualidade.
- ✅ Pipeline de análise de acervo (`notebook-acervo-analyzer.ts`) com concorrência controlada de lotes do Analista (até 2 workers), preservando fallback seguro por lote e telemetria operacional.
- ✅ Pipeline de vídeo (`video-generation-pipeline.ts`) com geração TTS em lotes paralelos controlados (até 2 por lote), mantendo rastreabilidade de custo/duração por batch.
- ✅ Hardening mobile residual em superfícies de progresso (`AgentTrailProgressModal.tsx` e `PipelineProgressPanel.tsx`) para evitar compressão/overflow em larguras pequenas com wraps e layout responsivo.
- ✅ Validação completa desta wave: `npm run typecheck`, `npm run test -- --run` (35/35 arquivos, 273/273 testes) e `npm run build` com sucesso.
- 🔄 Próximo bloco: monitoramento de impacto em produção (latência e custo por etapa) e ajustes finos de concorrência por perfil de carga.

**Atualização incremental (2026-04-23 — Wave 23: concorrência adaptativa + hardening mobile global de painéis):**
- ✅ `DraggablePanel.tsx` endurecido globalmente para mobile: modo compacto automático em viewport estreita, clamp de posição/tamanho, desativação de drag/resize em telas pequenas e prevenção de overflow estrutural em modais que reutilizam o componente.
- ✅ `notebook-acervo-analyzer.ts` evoluído para concorrência adaptativa no Analista com resolução dinâmica (env + hardware cap), preservando fallback seguro por lote e sem regressão no contrato de progresso.
- ✅ `video-generation-pipeline.ts` evoluído para concorrência adaptativa nos batches de imagem e TTS, com parâmetros dedicados e limite por capacidade local para evitar sobrecarga em dispositivos mais restritos.
- ✅ Variáveis opcionais de tuning operacional introduzidas: `VITE_NB_ACERVO_ANALISTA_CONCURRENCY`, `VITE_VIDEO_IMAGE_BATCH_CONCURRENCY`, `VITE_VIDEO_TTS_BATCH_CONCURRENCY`.
- ✅ Validação completa desta wave: `npm run typecheck`, `npm run test` (35/35 arquivos, 273/273 testes) e `npm run build` com sucesso.
- 🔄 Próximo bloco: monitorar telemetria em produção e calibrar defaults por perfil de carga/dispositivo, mantendo estabilidade de UX mobile em todos os modais críticos.

**Atualização incremental (2026-04-23 — Wave 24: heurística adaptativa unificada + hardening mobile viewport-real):**
- ✅ Nova camada compartilhada `runtime-concurrency.ts` para resolução de concorrência adaptativa com sinais de ambiente/dispositivo (CPU, memória e rede), reduzindo duplicação entre pipelines e padronizando guardrails.
- ✅ `notebook-acervo-analyzer.ts` e `video-generation-pipeline.ts` migrados para a heurística unificada de concorrência, mantendo fallback e telemetria operacional sem regressão funcional.
- ✅ `DraggablePanel.tsx` endurecido com leitura de `visualViewport` e geometria compacta sempre confinada à área visível, melhorando estabilidade em mobile com teclado virtual e barras dinâmicas do navegador.
- ✅ `ResearchNotebookV2.tsx` ajustado para remover import dinâmico redundante de `artifact-parsers`, eliminando advisory de chunking misto (static + dynamic) no build.
- ✅ Cobertura de regressão ampliada com `runtime-concurrency.test.ts` para cenários de clamp por hardware/memória/rede e parsing robusto de env.
- ✅ Validação completa desta wave: `npm run typecheck`, `npm run test` (36/36 arquivos, 278/278 testes) e `npm run build` com sucesso.
- 🔄 Próximo bloco: observar latência/custo em produção por perfil de dispositivo e fechar tuning fino por pipeline (incluindo limites recomendados para redes degradadas).

**Atualização incremental (2026-04-23 — Wave 25: telemetria de runtime por execução + hardening safe-area mobile):**
- ✅ `runtime-concurrency.ts` evoluído com diagnósticos reutilizáveis (`resolveAdaptiveConcurrencyWithDiagnostics`), resumo formatado de hints de runtime e chave estável de perfil para rastreabilidade operacional.
- ✅ `notebook-acervo-analyzer.ts` passou a anexar metadados de concorrência adaptativa no estágio do Analista e em `llm_executions` (`runtime_profile`, `runtime_hints`, `runtime_concurrency`, `runtime_cap`).
- ✅ `video-generation-pipeline.ts` passou a publicar diagnóstico adaptativo por lote (imagem/TTS) no progresso e a persistir telemetria de runtime nas execuções de mídia.
- ✅ `cost-analytics.ts` e fluxos de persistência do notebook (`ResearchNotebook.tsx` e `ResearchNotebookV2.tsx`) foram ampliados para preservar e rehidratar a telemetria de runtime sem perda em agregações históricas.
- ✅ `DraggablePanel.tsx` endurecido para mobile com leitura de safe-area (`env(safe-area-inset-*)`), geometria compacta ajustada a notch/home-indicator, alvo de toque ampliado nos controles e listener de `orientationchange`.
- ✅ Cobertura regressiva ampliada com `DraggablePanel.test.tsx`, reforços em `video-generation-pipeline.test.ts` e `notebook-acervo-analyzer.test.ts`, além de novos cenários em `runtime-concurrency.test.ts`.
- ✅ Validação completa desta wave: `npm run typecheck`, `npm test` (37/37 arquivos, 283/283 testes) e `npm run build` com sucesso.
- 🔄 Próximo bloco: calibrar limites padrão por perfil com dados de produção (latência/custo por fase), mantendo guardrails de fallback e estabilidade mobile.

**Atualização incremental (2026-04-23 — Wave 26: calibração por perfil de runtime + correção mobile de estado maximizado):**
- ✅ `runtime-concurrency.ts` passou a classificar perfil de runtime (`unknown|constrained|balanced|performant|high_end`) e ajustar automaticamente o alvo de concorrência por perfil quando não há override por env, preservando precedência de configuração explícita.
- ✅ Diagnósticos adaptativos foram enriquecidos com `profile` e `preferredSource` (`auto|env`) para melhorar rastreabilidade e tuning posterior por coorte de dispositivo/rede.
- ✅ Serialização operacional (`formatAdaptiveConcurrency` e `buildRuntimeProfileKey`) foi atualizada para incluir perfil e origem do alvo, aumentando valor de observabilidade sem quebrar compatibilidade dos campos já persistidos.
- ✅ `DraggablePanel.tsx` corrigido para priorizar modo compacto em mobile mesmo com `startMaximized`, evitando estado maximizado preso em viewport estreita e garantindo recomputação correta da geometria compacta.
- ✅ Cobertura regressiva ampliada com novos cenários em `runtime-concurrency.test.ts` (up/downscale por perfil e origem do alvo) e `DraggablePanel.test.tsx` (desarme automático de maximizado em compacto).
- ✅ Validação completa desta wave: `npm run typecheck`, `npm test` (37/37 arquivos, 286/286 testes) e `npm run build` com sucesso.
- 🔄 Próximo bloco: calibrar fatores por perfil com telemetria real de produção e expor leitura agregada desses sinais no trilho administrativo/custos para tuning contínuo sem regressão.

**Atualização incremental (2026-04-23 — Wave 27: hardening estrutural do deploy GitHub Pages):**
- ✅ `deploy-pages.yml` migrou do push direto em `gh-pages` (`peaceiris/actions-gh-pages`) para o trilho oficial de Pages por artefato (`actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`) com timeout de deploy ampliado para reduzir risco de aborto prematuro.
- ✅ Permissões de workflow foram alinhadas ao modo oficial (`pages: write` + `id-token: write`) em `deploy-pages.yml` e no orquestrador `release-web.yml`, removendo fragilidade de autorização cruzada no deploy reutilizável.
- ✅ Configuração do repositório foi promovida para `build_type=workflow` em GitHub Pages, eliminando dependência do modo legado baseado em branch para publicação do site `/Lexio/`.
- ✅ Revalidação local completa pós-hardening: `npm run typecheck`, `npm test` (37/37 arquivos, 286/286 testes) e `npm run build` com sucesso.
- 🔄 Próximo bloco: acompanhar a primeira janela completa de releases no novo trilho de Pages e, se estável, consolidar a retirada operacional do legado `gh-pages` como canal primário de publicação.

## Plano Mestre Executável (Atualizado)

### Faixa A — Consolidado em produção (já implementado)
- Telemetria operacional unificada dos pipelines principais (documento, acervo, estúdio e vídeo) com ETA, retries, fallback, custo e duração
- Memória auditável do notebook para estúdio, chat e buscas, incluindo histórico persistido e reaplicação de consultas
- Governança de buscas salvas com edição inline, tags, filtros semânticos e ações em lote
- Migração incremental para `memory/search_memory` com dual-read/dual-write, fallback, backfill oportunístico e cleanup
- Retenção/TTL, observabilidade agregada e série diária para memória dedicada
- Alertas operacionais no admin + backfill administrativo com chunking/paginação
- Thresholds configuráveis, presets operacionais e recomendação assistida por porte/telemetria com política de rollout persistida

### Faixa B — Próxima onda lógica (alta prioridade)
- ✅ Effectiveness scoring por coorte + auto-recomendação de política no admin (Etapas 40-41)
- ✅ Checkpoints retomáveis do pipeline de vídeo com `VideoCheckpoint` exportável (Etapa 42)
- ✅ Reranking jurídico determinístico aprimorado: decaimento temporal gradual, proximidade de frase e hierarquia de tribunal (Etapa 43)
- Consolidar validação de impacto da recomendação assistida com métricas históricas de longo prazo, alertas de desvio e fechamento de limiares por perfil operacional
- Expor checkpoints do vídeo na UI para retomada assistida pelo usuário

### Faixa C — Lacunas funcionais declaradas
- Implementar busca híbrida semântica + lexical para jurisprudência (feature ainda marcada como ausente)

### Faixa D — Melhorias estruturais de UX (roadmap contínuo)
- Compactação progressiva de contexto por jornada e orçamento de tokens por fluxo
- Reorganização orientada a intenção de uso na navegação e no onboarding
- Fortalecimento de acessibilidade e consistência operacional transversal (estados vazios, falhas recuperáveis, ações críticas)
- Mensuração de UX operacional por funil (tempo até valor, abandono, recuperação de falhas, reaproveitamento de memória)

### Faixa E — Redesign V2 (iniciado nesta rodada)
- ✅ Branch dedicada `redesign/v2-pilot` criada para isolar o redesign profundo sem tocar no trilho estável de `main`
- ✅ Convivência `v1`/`v2` introduzida no frontend via helper de flag/preview (`frontend/src/lib/feature-flags.ts`) e rota experimental `/labs/profile-v2`
- ✅ Shell experimental desktop-first implementado em `frontend/src/components/v2/V2WorkspaceLayout.tsx`, com rail lateral, painel contextual e identidade visual própria
- ✅ Primeiro piloto funcional conectado ao dado real do usuário entregue em `frontend/src/pages/labs/ProfileV2.tsx`
- ✅ `frontend/src/pages/Profile.tsx` passou a oferecer entrada controlada para o preview `v2`, preservando o fluxo clássico
- ✅ `DashboardV2` entregue em `frontend/src/pages/labs/DashboardV2.tsx` como hub operacional no novo shell, reutilizando infraestrutura compartilhada de dados e analytics do dashboard atual
- ✅ Infraestrutura compartilhada do dashboard consolidada em `frontend/src/lib/dashboard-data.ts`, reduzindo duplicação entre `v1` e `v2` e preparando a migração progressiva das superfícies operacionais
- ✅ Cobertura unitária ampliada para a base do redesign (`feature-flags`, `dashboard-data`, `dashboard-v2`, `profile-progress`)
- ✅ Helpers de navegação do redesign consolidados em `frontend/src/lib/redesign-routes.ts`, preservando query params de preview ao atravessar as rotas `/labs/*`
- ✅ Primeira superfície flagship do workbench entregue em `frontend/src/pages/labs/ResearchNotebookV2.tsx`, com lista persistente, seleção de caderno, visão executiva, governança de fontes e uma trilha clássica agora centralizada como contingência
- ✅ Deep-links e estado derivado do notebook V2 modularizados em `frontend/src/lib/research-notebook-routes.ts` e `frontend/src/lib/research-notebook-v2.ts`
- ✅ Chat contextual do workbench agora já roda em `frontend/src/pages/labs/ResearchNotebookV2.tsx`, com memória auditável, busca web opcional, persistência real de mensagens e rollback seguro de estado otimista em falhas
- ✅ Trilho de deploy isolado do redesign V2 publicado em Firebase Hosting dedicado (`https://lexio-redesign-v2-44760.web.app`), com hostname próprio, entrada automática no shell novo, build separado e sync explícito de authorized domains do Firebase Auth
- ✅ A seção `sources` do `ResearchNotebookV2` agora cobre pesquisa externa, pesquisa profunda e jurisprudência/DataJud, com modais compartilhados, auditoria persistida, replay das últimas buscas e persistência da última seleção de tribunais do usuário
- ✅ A seção `sources` do `ResearchNotebookV2` agora também governa `saved_searches` no próprio shell, com salvar auditorias como presets, filtros por texto/tipo, fixação, edição inline de título/tags, replay e ações em lote
- ✅ A seção `sources` do `ResearchNotebookV2` agora também abre o `SourceContentViewer` no próprio shell, com carregamento sob demanda, viewer rico para documentos estruturados e jurisdição reaproveitada sem voltar para a rota clássica
- ✅ A seção `sources` do `ResearchNotebookV2` agora também executa a análise inteligente do acervo no próprio shell, reaproveitando o pipeline multiagente, a trilha operacional e a curadoria em lote antes de anexar novas fontes ao caderno
- ✅ A seção `artifacts` do `ResearchNotebookV2` agora governa o inventário persistido e reaproveita o `ArtifactViewerModal` no próprio shell, com abertura lazy-loaded, exclusão controlada e continuidade local também para `video_production` e estúdio salvo
- ✅ A seção `studio` do `ResearchNotebookV2` agora prepara o briefing de geração no próprio shell, com auditoria de contexto, instruções adicionais e grade tipada de artefatos, mantendo deep-links clássicos apenas como fallback comparativo com contexto restaurado
- ✅ A seção `studio` do `ResearchNotebookV2` agora também executa a geração base de artefatos no próprio shell, com `TaskManager`, trilha multiagente, persistência de `artifacts`/`llm_executions` e espelhamento de `documento` para a página Documentos
- ✅ A seção `artifacts`/viewer do `ResearchNotebookV2` agora também executa a pós-geração especializada de áudio e imagem no próprio shell, persistindo URLs finais de mídia em `audio_script`, `apresentacao`, `mapa_mental`, `infografico` e `tabela_dados`
- ✅ O fluxo completo de vídeo agora também roda dentro do `ResearchNotebookV2`, cobrindo custo/revisão de `video_script`, geração de vídeo, reabertura de `video_production`/estúdios salvos, `VideoStudioEditor`, produção literal e persistência compactada no próprio shell
- ✅ O `ResearchNotebookV2` agora também possui cobertura direta de página em `frontend/src/pages/labs/ResearchNotebookV2.test.tsx`, validando hidratação do caderno, navegação V2 para `sources`, empty state de `artifacts` e abertura da seção de contingência em `jsdom`
- ✅ Overview, `studio` e `artifacts` do `ResearchNotebookV2` foram consolidados em narrativa V2-first, com launchers clássicos diretos substituídos por rotas internas para o mapa de contingência
- ✅ O shell V2 agora também cobre `/theses`, `/settings`, `/settings/costs`, `/admin`, `/admin/costs` e `/profile`; `workspace-routes.ts` virou o builder compartilhado dessas superfícies, `/profile` foi promovido sob gate com fallback em `/profile/classic` e `/labs/notebook-v2`/`/labs/profile-v2` ficaram reduzidos a aliases técnicos
- Próxima onda lógica do redesign: consolidar cobertura de testes para as superfícies promovidas (`/`, documentos, acervo, teses e governança), endurecer o rail V2 como ambiente principal de validação contínua e estreitar o layout clássico ao papel de contingência estrutural controlada

**Concluido neste ciclo:**
- O redesign avancou para a decima oitava onda do trilho V2: `frontend/src/components/AgentModelConfigCard.tsx` introduziu uma base compartilhada para cards de configuracao de agentes, centralizando pipelines, badges, barras de acoes, integracao com `ModelSelectorModal` e o fluxo comum de persistencia em V2
- `frontend/src/components/ModelConfigCard.tsx`, `frontend/src/components/ThesisAnalystConfigCard.tsx`, `frontend/src/components/ContextDetailConfigCard.tsx`, `frontend/src/components/AcervoClassificadorConfigCard.tsx`, `frontend/src/components/AcervoEmentaConfigCard.tsx`, `frontend/src/components/NotebookAcervoConfigCard.tsx`, `frontend/src/components/ResearchNotebookConfigCard.tsx`, `frontend/src/components/VideoPipelineConfigCard.tsx`, `frontend/src/components/AudioPipelineConfigCard.tsx` e `frontend/src/components/PresentationPipelineConfigCard.tsx` foram promovidos para wrappers V2 nativos sobre a nova base compartilhada
- `frontend/src/components/ModelCatalogCard.tsx` foi retematizado para superficies, filtros, tabela, modais e acoes V2, enquanto `frontend/src/pages/AdminPanel.tsx` removeu o ultimo `v2-bridge-surface`, zerando a bridge localizada de configuracoes no rail promovido
- `frontend/src/components/v2/V2WorkspaceLayout.tsx` passou a refletir que catalogo, configuracoes e governanca ja operam nativamente em V2, deixando o classico apenas como trilho de contingencia estrutural e comparacao controlada
- Validacao local desta decima oitava expansao do trilho V2: `npm run typecheck`, `npm run test -- --run` (**35/35 arquivos, 266/266 testes**) e `npm run build` com sucesso em `frontend/`
- Observacao operacional desta onda: `AdminPanel` ficou em **84.07 kB** (**gzip 21.46 kB**) e `V2WorkspaceLayout` em **8.38 kB** (**gzip 2.62 kB**), preservando code splitting enquanto o trilho de configuracoes/admin zerou o uso de bridge localizada
- O redesign avancou para a decima setima onda do trilho V2: `frontend/src/pages/PlatformAdminPanel.tsx` deixou de depender de `v2-bridge-surface` no frame principal e passou a operar loading, vazio, acesso admin, thresholds, historico longitudinal, backfill e wrappers executivos inteiramente em classes/primitives V2
- `frontend/src/pages/AdminPanel.tsx` removeu a bridge ampla de pagina, promoveu `ApiKeysCard`, `ReviewQueue`, reindexacao e os blocos locais de CRUD/logs/usuarios para o sistema visual novo e isolou a bridge apenas ao redor dos config cards importados ainda legados
- `frontend/src/components/v2/V2WorkspaceLayout.tsx` passou a refletir que custos, configuracoes principais e administracao executiva ja operam no rail promovido, deixando a contingencia classica restrita aos cards especializados remanescentes
- Validacao local desta decima setima expansao do trilho V2: `npm run typecheck`, `npm run test -- --run` (**35/35 arquivos, 266/266 testes**) e `npm run build` com sucesso em `frontend/`
- Observacao operacional desta onda: `PlatformAdminPanel` ficou em **50.23 kB** (**gzip 12.26 kB**), `AdminPanel` em **129.73 kB** (**gzip 22.06 kB**) e `V2WorkspaceLayout` em **8.10 kB** (**gzip 2.55 kB**), preservando code splitting enquanto a governanca/admin saiu da bridge ampla
- O redesign avançou para a decima sexta onda do trilho V2: `frontend/src/pages/CostTokensPage.tsx` e `frontend/src/pages/PlatformCostsPage.tsx` deixaram de depender de `v2-bridge-surface` e passaram a usar wrappers, loading states, empty states, controles de formulario e tipografia explicitamente nativos do sistema V2
- `frontend/src/components/v2/V2WorkspaceLayout.tsx` deixou de comunicar a governanca inteira como superficie classica e passou a refletir o estado atual do rail promovido, em que custos ja operam nativamente em V2 enquanto configuracoes e administracao seguem em consolidacao
- Validacao local desta decima sexta expansao do trilho V2: `npm run typecheck`, `npm run test` (**35/35 arquivos, 266/266 testes**) e `npm run build` com sucesso em `frontend/`
- Observacao operacional desta onda: `CostTokensPage` ficou em **25.62 kB** (**gzip 6.48 kB**), `PlatformCostsPage` em **8.29 kB** (**gzip 2.52 kB**) e `V2WorkspaceLayout` em **8.10 kB** (**gzip 2.55 kB**), preservando code splitting enquanto o pacote de custos saiu da bridge visual
- O workflow estável `.github/workflows/firebase-deploy.yml` deixou de tratar `DATAJUD_API_KEY` ausente no GitHub Actions como falha automática; agora ele resolve a fonte do segredo entre GitHub Actions e Firebase Secret Manager e só sincroniza o valor quando o secret do GitHub estiver presente
- `DATAJUD_API_KEY` foi provisionado em GitHub Actions e em Firebase Secret Manager após validação direta contra a API pública do CNJ, eliminando o bloqueio operacional que derrubava os deploys `#325` e `#326` na lane estável
- A lane estável foi revalidada ponta a ponta com `npm run typecheck`, `npm run test` (**35/35 arquivos, 266/266 testes**), `npm run build` em `frontend/`, `npx tsc` em `functions/`, `firebase deploy --only hosting:lexio,firestore:rules,firestore:indexes,storage,functions --project hocapp-44760 --non-interactive` e smoke test `POST https://lexio.web.app/api/datajud` retornando `200`
- O redesign avançou para a decima quinta onda do trilho V2: `/` agora aponta para `DashboardV2` sob o gate do redesign, `/labs/dashboard-v2` foi reduzido a alias tecnico e o workspace ganhou primitives compartilhadas (`frontend/src/components/v2/V2PagePrimitives.tsx`) e uma bridge visual scoped em `frontend/src/index.css`
- `frontend/src/pages/ThesisBank.tsx`, `frontend/src/pages/CostTokensPage.tsx`, `frontend/src/pages/PlatformCostsPage.tsx`, `frontend/src/pages/AdminPanel.tsx` e `frontend/src/pages/PlatformAdminPanel.tsx` passaram de miolo classico hospedado no shell V2 para superficies internas redesenhadas com hero, metricas e secoes alinhadas ao sistema visual novo
- `frontend/src/pages/DocumentList.tsx`, `frontend/src/pages/NewDocument.tsx`, `frontend/src/pages/DocumentDetail.tsx`, `frontend/src/pages/DocumentEditor.tsx` e `frontend/src/pages/Upload.tsx` foram promovidas ao mesmo frame V2, reduzindo a ruptura visual do fluxo documental/acervo e mantendo intacta a logica de filtros, pipelines, revisao e exportacao
- Validacao local desta decima quinta expansao do trilho V2: `npm run typecheck`, `npm run test` (**35/35 arquivos, 266/266 testes**) e `npm run build` com sucesso em `frontend/`
- Observacao operacional desta onda: `V2PagePrimitives` saiu em **2.52 kB** (**gzip 0.91 kB**), `DashboardV2` em **15.31 kB** (**gzip 4.58 kB**), `DocumentList` em **17.84 kB** (**gzip 5.61 kB**), `DocumentDetail` em **27.48 kB** (**gzip 8.18 kB**), `DocumentEditor` em **11.82 kB** (**gzip 3.79 kB**), `NewDocument` em **15.00 kB** (**gzip 5.45 kB**), `Upload` em **45.82 kB** (**gzip 11.79 kB**), `ThesisBank` em **47.45 kB** (**gzip 14.40 kB**), `CostTokensPage` em **25.39 kB** (**gzip 6.49 kB**), `PlatformCostsPage` em **7.98 kB** (**gzip 2.48 kB**), `PlatformAdminPanel` em **49.58 kB** (**gzip 12.15 kB**) e `AdminPanel` em **128.20 kB** (**gzip 21.92 kB**), preservando code splitting mesmo apos a promocao das superficies internas
- O redesign avançou para a decima quarta onda do trilho V2: o shell promovido agora cobre `theses`, `settings`, `admin` e `profile`, enquanto `/profile` foi promovido sob gate com fallback explicito em `/profile/classic`
- `frontend/src/lib/workspace-routes.ts` passou a centralizar builders preview-safe tambem para dashboard, teses, settings, admin e profile; `frontend/src/App.tsx` reduziu `/labs/notebook-v2` e `/labs/profile-v2` a aliases tecnicos das rotas promovidas
- Sidebar, `V2WorkspaceLayout`, dashboards, atalhos administrativos, hints de configuracao, redirects de `ModelsNotConfiguredError` e a navegacao interna do `ResearchNotebookV2` foram religados para usar builders centralizados e preservar query params/hash do redesign
- Validação local desta décima quarta expansão do trilho V2: `npm run typecheck`, `npm run test` (**35/35 arquivos, 266/266 testes**) e `npm run build` com sucesso em `frontend/`
- Observação operacional desta onda: `V2WorkspaceLayout` ficou em **8.04 kB** (**gzip 2.52 kB**), `Profile` em **10.65 kB** (**gzip 3.27 kB**), `ProfileV2` em **13.43 kB** (**gzip 3.90 kB**), `DashboardV2` em **15.31 kB** (**gzip 4.58 kB**), `ThesisBank` em **46.88 kB** (**gzip 13.87 kB**), `PlatformAdminPanel` em **48.16 kB** (**gzip 11.72 kB**), `AdminPanel` em **128.87 kB** (**gzip 21.66 kB**) e `ResearchNotebookV2` em **170.22 kB** (**gzip 40.64 kB**), preservando code splitting apesar da expansão do rail promovido
- O redesign avançou para a décima terceira onda do trilho V2: o shell novo agora cobre `/documents`, `/documents/new`, `/documents/:id`, `/documents/:id/edit` e `/upload` sob o mesmo gate do workbench principal, deixando documentos e acervo no mesmo rail do notebook promovido
- `frontend/src/lib/workspace-routes.ts` passou a centralizar links preview-safe de documentos e acervo, enquanto `frontend/src/lib/redesign-shell.ts` foi ampliado para considerar essas superfícies como parte do shell V2 quando o redesign estiver ativo
- Sidebar, `Layout`, `NotificationBell`, dashboards, `DocumentList`, `DocumentDetail`, `DocumentEditor`, `NewDocument`, `AdminPanel`, `ThesisBank` e `V2WorkspaceLayout` foram religados para preservar query params de preview em navegação lateral, atalhos, breadcrumbs, polling de conclusão e links administrativos
- Validação local desta décima terceira expansão do trilho V2: `npm run typecheck`, `npm run test` (**35/35 arquivos, 264/264 testes**) e `npm run build` com sucesso em `frontend/`
- Observação operacional desta onda: `V2WorkspaceLayout` ficou em **7.72 kB** (**gzip 2.43 kB**), `DocumentList` em **16.40 kB** (**gzip 5.00 kB**), `DocumentEditor` em **11.73 kB** (**gzip 3.75 kB**), `NewDocument` em **13.42 kB** (**gzip 4.90 kB**), `DocumentDetail` em **26.85 kB** (**gzip 7.81 kB**) e `Upload` em **44.58 kB** (**gzip 11.29 kB**), preservando code splitting mesmo após a expansão do shell
- O redesign avançou para a décima segunda onda do flagship: a rota primária `/notebook` agora aponta para `ResearchNotebookV2` quando o gate `isRedesignV2Enabled()` estiver ativo, enquanto `/notebook/classic` preserva o notebook legado como trilho explícito de contingência
- `frontend/src/lib/research-notebook-routes.ts` passou a separar builders do workbench principal, do fallback clássico e da rota laboratorial V2; `frontend/src/lib/redesign-shell.ts` centraliza quando o shell novo deve englobar `/notebook` e `/labs/*`
- Sidebar, Dashboard, DashboardV2, DocumentList, DocumentDetail, `ResearchNotebook.tsx`, `ResearchNotebookV2.tsx` e `V2WorkspaceLayout.tsx` foram religados para usar o workbench principal com preservação das query params de preview, enquanto os links de contingência passaram a usar explicitamente `/notebook/classic`
- Validação local desta décima segunda expansão do `ResearchNotebookV2`: `npm run typecheck`, `npm run test` (**34/34 arquivos, 261/261 testes**) e `npm run build` com sucesso em `frontend/`
- Observação operacional desta onda: `ResearchNotebook` ficou em **159.66 kB** (**gzip 40.61 kB**), `ResearchNotebookV2` em **170.20 kB** (**gzip 40.65 kB**), `V2WorkspaceLayout` em **7.25 kB** (**gzip 2.36 kB**) e `DashboardV2` em **15.36 kB** (**gzip 4.59 kB**), preservando code splitting após a promoção controlada da rota principal
- O redesign avançou para a décima primeira onda do flagship: `ResearchNotebookV2` agora trata overview, `studio` e `artifacts` como superfícies V2-first, relegando o notebook clássico ao mapa de contingência centralizado na seção `bridge`
- Os CTAs residuais de legado foram reduzidos: overview, quick actions, briefing do estúdio, inventário de artefatos e empty states agora apontam para fluxos V2 ou para a trilha de contingência, não mais para launchers clássicos diretos como passo principal
- Cobertura direta de página foi adicionada em `frontend/src/pages/labs/ResearchNotebookV2.test.tsx`, com `jsdom`, `@testing-library/react` e polyfills em `frontend/src/test-setup.ts` para validar a hidratação do caderno, navegação V2 para `sources`, empty state de `artifacts` e abertura da contingência clássica
- Validação local desta décima primeira expansão do `ResearchNotebookV2`: `npm run typecheck`, `npm run test` (**33/33 arquivos, 257/257 testes**) e `npm run build` com sucesso em `frontend/`
- Observação operacional desta onda: `ResearchNotebookV2` ficou em aproximadamente **170.29 kB** (**gzip 40.68 kB**), enquanto `VideoGenerationCostModal` permaneceu em **15.21 kB** (**gzip 4.33 kB**), `VideoStudioEditor` em **27.23 kB** (**gzip 7.02 kB**), `video-generation-pipeline` em **34.00 kB** (**gzip 11.77 kB**) e `literal-video-production` em **26.26 kB** (**gzip 8.88 kB**), preservando code splitting mesmo após a consolidação do trilho principal
- O redesign avançou para a décima onda do flagship: `ResearchNotebookV2` agora internaliza custo/revisão de `video_script`, geração de vídeo, reabertura de pacotes `video_production`/estúdios salvos e o `VideoStudioEditor` com persistência no próprio shell
- A trilha de vídeo do V2 passou a reaproveitar o backbone consolidado do clássico: `VideoGenerationCostModal`, `runVideoGenerationPipeline()`, checkpoints `VideoCheckpoint`, produção literal via `literal-video-production.ts`, upload em `notebook-media-storage` e append de `llm_executions` no notebook com fresh snapshot antes dos writes críticos
- O viewer e o inventário de artefatos do V2 agora expõem `Gerar vídeo` e `Abrir estúdio`, enquanto a geração base de `video_script` abre automaticamente a revisão de custo no novo shell e os pacotes persistidos deixam de exigir handoff obrigatório para o notebook clássico
- A ponte legada do workbench foi estreitada de forma decisiva: overview, chat, fontes, buscas salvas, análise inteligente de acervo, viewer avançado, briefing, geração base, pós-geração de áudio/imagem e agora o fluxo completo de vídeo vivem no V2; o clássico fica como fallback comparativo e contingencial
- Validação local desta décima expansão do `ResearchNotebookV2`: `npm run typecheck`, `npm run test` (**32/32 arquivos, 253/253 testes**) e `npm run build` com sucesso em `frontend/`
- Observação operacional desta onda: `ResearchNotebookV2` subiu para aproximadamente **170.78 kB** (**gzip 40.72 kB**), enquanto `VideoGenerationCostModal` permaneceu isolado em **15.21 kB** (**gzip 4.33 kB**), `VideoStudioEditor` em **27.23 kB** (**gzip 7.02 kB**), `video-generation-pipeline` em **34.00 kB** (**gzip 11.77 kB**) e `literal-video-production` em **26.26 kB** (**gzip 8.88 kB**), preservando code splitting para os trechos pesados de vídeo
- O redesign avançou para a nona onda do flagship: `ResearchNotebookV2` agora executa a pós-geração de áudio/imagem para artefatos persistidos no próprio shell, sem depender mais do notebook clássico para `audio_script`, `apresentacao`, `mapa_mental`, `infografico` e `tabela_dados`
- O `ArtifactViewerModal` e o inventário de artefatos do V2 passaram a expor ações diretas de `Gerar áudio` e `Gerar imagem/slides`, reaproveitando o mesmo contrato compartilhado do viewer já validado no shell clássico
- A pós-geração agora persiste `audioUrl`/`audioStoragePath`/`audioMimeType` em `audio_script` e `renderedImageUrl`/`renderedImageStoragePath` nos artefatos visuais, preservando compatibilidade de viewer, exportação e regeneração sem sidecars adicionais
- Os writes do V2 seguiram o hardening adotado nas ondas anteriores: fresh snapshot antes de persistir `artifacts`, upload via `notebook-media-storage` e append de `llm_executions` com `createUsageExecutionRecord()` para evitar overwrite concorrente
- A ponte legada do workbench foi estreitada novamente: o shell novo agora assume overview, chat, fontes, buscas salvas, análise inteligente de acervo, viewer avançado, inventário de artefatos, briefing, geração base e pós-geração de áudio/imagem; o fluxo clássico ficou concentrado em custo/revisão de vídeo, geração de vídeo e `VideoStudioEditor`
- Validação local desta nona expansão do `ResearchNotebookV2`: `npm run typecheck`, `npm run test` (**32/32 arquivos, 253/253 testes**) e `npm run build` com sucesso em `frontend/`
- Observação operacional desta onda: `ResearchNotebookV2` subiu para aproximadamente **151.82 kB** (**gzip 34.78 kB**), enquanto `ArtifactViewerModal` permaneceu em **76.33 kB** (**gzip 19.76 kB**), `audio-generation-pipeline` em **8.56 kB** (**gzip 3.56 kB**), `presentation-generation-pipeline` em **9.16 kB** (**gzip 3.78 kB**) e `notebook-media-storage` em **1.89 kB** (**gzip 1.06 kB**), preservando code splitting para a mídia especializada
- O redesign avançou mais um degrau de paridade do flagship: `ResearchNotebookV2` agora já dispara a geração base do estúdio no próprio shell, sem depender mais do notebook clássico para criar resumos, relatórios, documentos, tabelas, infográficos, mapas mentais, apresentações e roteiros persistidos
- A nova seção `studio` do V2 passou a usar `TaskManager` com trilha multiagente, reaproveitando o mesmo backbone de pipeline e de telemetria do notebook clássico, inclusive com persistência segura de `artifacts`/`llm_executions` e espelhamento automático de `documento` para a página Documentos
- A base operacional do estúdio foi extraída para `frontend/src/lib/notebook-artifact-tasks.ts`, reduzindo duplicação entre `ResearchNotebook.tsx` e `ResearchNotebookV2.tsx` e mantendo metadata, agregação operacional e deduplicação de eventos consistentes entre os dois shells
- A ponte legada do workbench foi estreitada novamente: o shell novo agora assume overview, chat, fontes, briefing, geração base do estúdio e artefatos; o fluxo clássico fica restrito à produção avançada de mídia, ao render literal e ao editor de vídeo persistido
- Validação local desta expansão do `ResearchNotebookV2`: `npm run typecheck`, `npm run test` (**32/32 arquivos, 253/253 testes**) e `npm run build` com sucesso em `frontend/`
- Observação operacional desta onda: o chunk de produção de `ResearchNotebookV2` subiu para aproximadamente **145.82 kB** (**gzip 32.96 kB**), enquanto `notebook-studio-pipeline` permaneceu isolado em **40.36 kB** (**gzip 14.60 kB**) e `VideoStudioEditor` em **27.24 kB** (**gzip 7.02 kB**), preservando code splitting para a ponte de mídia avançada
- O redesign avançou mais um degrau de paridade do flagship: `ResearchNotebookV2` agora já possui uma seção própria de `studio`, sem depender do notebook clássico para preparar contexto, briefing adicional e taxonomia de artefatos antes da geração
- A nova seção do V2 ganhou auditoria de contexto do estúdio, textarea persistente de briefing na sessão, grade categorizada de artefatos e deep-link tipado para o legado com `artifact_type` e `studio_prompt`, além de o notebook clássico restaurar esse contexto na chegada
- A ponte legada do workbench foi estreitada novamente: o shell novo agora assume overview, chat, fontes, briefing do estúdio e artefatos; o fluxo clássico fica restrito à execução multiagente, aos runtimes especializados de mídia e ao editor de vídeo persistido
- Validação local desta expansão do `ResearchNotebookV2`: `npm run typecheck`, `npm run test` (**31/31 arquivos, 250/250 testes**) e `npm run build` com sucesso em `frontend/`
- Observação operacional desta onda: o chunk de produção de `ResearchNotebookV2` subiu para aproximadamente **138.58 kB** (**gzip 31.04 kB**), enquanto `VideoStudioEditor` permaneceu isolado em **27.24 kB** (**gzip 7.02 kB**), confirmando que o briefing entrou no V2 sem puxar o editor literal para o shell base
- O redesign avançou mais uma etapa de paridade do flagship: `ResearchNotebookV2` agora já possui uma seção própria de `artifacts`, sem depender mais do notebook clássico para listar, abrir e revisar saídas persistidas do estúdio
- A nova seção do V2 ganhou inventário reverso de artefatos, quick actions no overview, roteamento dedicado em `research-notebook-routes.ts`, abertura lazy-loaded do `ArtifactViewerModal` e exclusão segura reaproveitando o mesmo contrato Firestore do notebook clássico
- A ponte legada do workbench foi estreitada novamente: o shell novo agora assume overview, chat, fontes e artefatos; o fluxo clássico fica restrito à geração multiagente do estúdio e ao editor de vídeo persistido (`video_production` / estúdio salvo)
- Validação local desta expansão do `ResearchNotebookV2`: `npm run typecheck`, `npm run test` (**31/31 arquivos, 250/250 testes**) e `npm run build` com sucesso em `frontend/`
- Observação operacional desta onda: o chunk de produção de `ResearchNotebookV2` subiu para aproximadamente **125.25 kB** (**gzip 29.11 kB**), enquanto o `ArtifactViewerModal` permaneceu isolado em chunk próprio de **76.03 kB** (**gzip 19.63 kB**), preservando code splitting para o viewer rico
- O redesign avançou mais uma etapa de paridade do flagship: `ResearchNotebookV2` agora executa a análise inteligente de acervo no próprio shell, sem depender mais do notebook clássico para ranquear, curar e anexar documentos do acervo ao caderno
- A seção `sources` do V2 ganhou disparo real do `analyzeNotebookAcervo()`, persistência de `llm_executions`, trilha operacional lazy-loaded via `AgentTrailProgressModal` e curadoria em lote com seleção/desmarcação e deduplicação contra fontes já anexadas
- A ponte legada do workbench foi estreitada novamente: o shell novo agora assume pesquisa externa/profunda/jurisprudência, governança de buscas salvas, viewer avançado e análise inteligente de acervo; o fluxo clássico fica restrito a estúdio, artefatos persistidos e vídeo
- Cobertura de regressão ampliada em `frontend/src/lib/notebook-acervo-analyzer.test.ts`, garantindo que o pipeline exclui documentos do acervo já vinculados ao caderno antes da etapa do Buscador
- Validação local desta expansão do `ResearchNotebookV2`: `npm run typecheck`, `npm run test` (**31/31 arquivos, 250/250 testes**) e `npm run build` com sucesso em `frontend/`
- Observação operacional desta onda: o chunk de produção de `ResearchNotebookV2` subiu para aproximadamente **115.23 kB** (**gzip 27.26 kB**), enquanto a trilha `AgentTrailProgressModal` permaneceu isolada em **6.15 kB** (**gzip 2.16 kB**) e o `SourceContentViewer` em **24.13 kB** (**gzip 6.34 kB**), preservando code splitting e cache granular
- O redesign avançou mais um degrau de paridade do flagship: `ResearchNotebookV2` agora abre o `SourceContentViewer` dentro do próprio shell, sem depender do notebook clássico para inspeção rica de documentos estruturados e sínteses jurisprudenciais
- A seção `sources` do V2 ganhou abertura direta do viewer no inventário, na leitura rápida da fonte selecionada e nas fontes geradas por busca; a lógica de elegibilidade e preview rápido foi centralizada em `frontend/src/lib/research-notebook-v2.ts`
- `frontend/src/components/SourceContentViewer.tsx` foi endurecido para abrir fontes de jurisprudência mesmo quando só existe `results_raw`, resetando a navegação por aba a cada fonte e começando por `Processos` quando a síntese textual estiver ausente
- Validação local desta expansão do `ResearchNotebookV2`: `npm run typecheck`, `npm run test` (**31/31 arquivos, 249/249 testes**) e `npm run build` com sucesso em `frontend/`
- Observação operacional desta onda: o chunk de produção de `ResearchNotebookV2` subiu para aproximadamente **105.43 kB** (**gzip 25.11 kB**) e o viewer rico ficou isolado em chunk próprio `SourceContentViewer` com **24.06 kB** (**gzip 6.30 kB**), preservando code splitting e cache granular
- O redesign avançou mais uma etapa de paridade operacional do flagship: `ResearchNotebookV2` agora já governa buscas salvas no próprio shell, sem depender do notebook clássico para salvar auditorias, reaplicar consultas recorrentes, fixar referências ou organizar tags
- A seção `sources` do V2 ganhou filtro por texto/tipo, edição inline de título/tags, pin/unpin, exclusão individual e ações em lote para buscas salvas, além de ajustar a ponte legada para refletir apenas os fluxos que realmente continuam fora do workbench novo
- A lógica compartilhada de governança de buscas salvas foi extraída para `frontend/src/lib/research-notebook-v2.ts`, com cobertura dedicada em `frontend/src/lib/research-notebook-v2.test.ts`, reduzindo acoplamento do JSX do workbench a regras de ordenação/tags
- Validação local desta expansão do `ResearchNotebookV2`: `npm run typecheck`, `npm run test` (**31/31 arquivos, 248/248 testes**) e `npm run build` com sucesso em `frontend/`
- Observação operacional desta onda: o chunk de produção de `ResearchNotebookV2` subiu para aproximadamente **104.07 kB** (**gzip 24.74 kB**) após a entrada da governança de buscas salvas, mantendo build limpo e code splitting preservado
- O redesign avançou uma terceira etapa funcional do flagship: `ResearchNotebookV2` agora já executa pesquisa externa, pesquisa profunda e jurisprudência/DataJud no novo shell, sem depender do notebook clássico para esses fluxos principais de descoberta de fontes
- A seção `sources` do V2 ganhou painel operacional de pesquisa, preview auditável da próxima consulta, replay das últimas buscas persistidas e inventário das fontes geradas por pesquisa web/jurisprudencial
- Os modais compartilhados de progresso, configuração DataJud e revisão de resultados passaram a ser montados diretamente no workbench V2; a última seleção de tribunais também passou a ser carregada/salva nas preferências do usuário
- A camada compartilhada de resultados de busca foi desacoplada do notebook clássico via `frontend/src/pages/notebook/types.ts`, removendo dependência estrutural de `SearchResultsModal.tsx` em `ResearchNotebook.tsx`
- Validação local desta expansão do `ResearchNotebookV2`: `npm run typecheck`, `npm run test` (**31/31 arquivos, 245/245 testes**) e `npm run build` com sucesso em `frontend/`
- O redesign agora tem um URL persistente e isolado para validação em ambiente real: `https://lexio-redesign-v2-44760.web.app`, separado de `lexio.web.app` e preparado para abrir direto em `/labs/dashboard-v2`
- O repositório foi convertido para multi-site em Firebase Hosting com targets explícitos em `.firebaserc`/`firebase.json`, build dedicado em `frontend/dist-redesign-v2` e workflow próprio `.github/workflows/firebase-redesign-v2.yml`
- O frontend passou a reconhecer o hostname dedicado do redesign em `frontend/src/lib/feature-flags.ts`, ativar o shell V2 sem query params e redirecionar a raiz para o dashboard experimental quando estiver nesse domínio
- A governança de autenticação do site V2 foi endurecida com `scripts/firebase-authorized-domains.mjs`, permitindo sincronizar `authorizedDomains` do Firebase Auth por workflow ou operação local
- O redesign avançou mais uma etapa do flagship: `ResearchNotebookV2` agora já possui uma aba própria de chat contextual, com envio real via `notebook_assistente`, uso de fontes do caderno, histórico de buscas, busca web opcional e persistência segura de mensagens/execuções em Firestore
- O notebook clássico e o helper de rotas V2 foram alinhados para a nova seção de chat; deep-links para o workbench agora conseguem abrir `overview`, `chat`, `sources` ou `bridge` conforme o contexto de origem
- A implementação do chat no V2 corrigiu um risco estrutural do fluxo clássico: mensagens otimistas agora fazem rollback e devolvem o input ao usuário quando o envio falha antes de persistir
- Validação local desta expansão do `ResearchNotebookV2`: `npm run typecheck`, `npm run test` (**31/31 arquivos, 244/244 testes**) e `npm run build` com sucesso em `frontend/`
- O redesign avançou para a primeira fatia real do flagship: `frontend/src/pages/labs/ResearchNotebookV2.tsx` já opera sobre o mesmo backend do caderno atual com listagem, criação, exclusão, hidratação de detalhe, visão executiva, entrada de links/uploads/acervo e ponte segura para o notebook clássico nas áreas ainda não migradas
- A malha de navegação do preview foi endurecida: `frontend/src/lib/redesign-routes.ts`, `frontend/src/components/v2/V2WorkspaceLayout.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Profile.tsx` e `frontend/src/pages/ResearchNotebook.tsx` agora preservam os query params de preview ao atravessar o shell laboratorial
- O notebook clássico agora entende `?tab=` via `frontend/src/lib/research-notebook-routes.ts`, expõe launchers para `Notebook V2` na lista e no detalhe e consegue mapear o contexto atual para `overview`, `sources` ou `bridge` no novo workbench
- A base de apoio do notebook V2 foi coberta por testes dedicados em `frontend/src/lib/redesign-routes.test.ts`, `frontend/src/lib/research-notebook-routes.test.ts` e `frontend/src/lib/research-notebook-v2.test.ts`
- Validação local desta onda do redesign: `npm run typecheck`, `npm run test` (**31/31 arquivos, 244/244 testes**) e `npm run build` com sucesso em `frontend/`
- O redesign avançou uma segunda etapa funcional dentro da mesma branch `redesign/v2-pilot`: além do `ProfileV2`, a aplicação agora possui um `DashboardV2` navegável, com priorização de ações, métricas operacionais, cards de acesso e visualização de custos/volume no novo shell
- O dashboard clássico passou a consumir a infraestrutura compartilhada de dados em `frontend/src/lib/dashboard-data.ts` e a expor launchers de preview para `DashboardV2` e `ProfileV2`, reduzindo custo de manutenção da convivência `v1`/`v2`
- A camada de qualidade do redesign foi reforçada com novos testes em `frontend/src/lib/feature-flags.test.ts`, `frontend/src/lib/dashboard-data.test.ts`, `frontend/src/lib/dashboard-v2.test.ts` e `frontend/src/lib/profile-progress.test.ts`
- Validação local desta segunda onda do redesign: `npm run typecheck`, `npm run test` (**28/28 arquivos, 236/236 testes**) e `npm run build` com sucesso em `frontend/`
- A branch `redesign/v2-pilot` foi aberta e já recebeu a fundação inicial do redesign: helper de feature flag para preview controlado, rota laboratorial `/labs/profile-v2`, shell `v2` independente e primeiro piloto visual conectado ao mesmo backend do perfil atual
- O frontend agora suporta trocar de shell com base na rota experimental sem quebrar o layout existente; `frontend/src/App.tsx` passou a despachar entre `Layout` e `V2WorkspaceLayout` mantendo autenticação, toasts e TaskBar intactos
- A camada visual `v2` ganhou tokens e primitives iniciais em `frontend/src/index.css`, com superfícies translúcidas, botões, chips, toggles e campos próprios para a nova linguagem do workspace
- Validação local desta rodada de redesign: `npm run typecheck`, `npm run test` (**24/24 arquivos, 221/221 testes**) e `npm run build` com sucesso em `frontend/`
- `functions/src/index.ts` passou a ler `DATAJUD_API_KEY` via Secret Manager (`defineSecret`) e o cliente `frontend/src/lib/datajud-service.ts` deixou de depender de fallback hardcoded em código versionado
- Os workflows `test.yml`, `firebase-preview.yml`, `deploy-pages.yml` e `firebase-deploy.yml` foram endurecidos: preview/pages/deploy agora exigem `typecheck` + `test` + `build`, o job de testes também compila `functions/`, e o deploy do Firebase sincroniza o segredo `DATAJUD_API_KEY` antes de publicar Functions
- A varredura de qualidade do backend em desenvolvimento também foi endurecida nesta rodada: `ruff` passou a ficar limpo localmente após limpeza segura de imports, variáveis mortas e ajustes mecânicos em predicates SQLAlchemy
- Validação local expandida: `npm run build` em `functions/`; `npm run typecheck`, `npx vitest run` (**24/24 arquivos, 221/221 testes**) e `npm run build` em `frontend/`; `pytest` (**2203/2203**) e `ruff check packages tests` com sucesso
- Índices: `firestore.indexes.json` permaneceu inalterado nesta rodada; o ganho veio de hardening operacional, secrets management e qualidade de CI/CD
- `frontend/src/pages/ResearchNotebook.tsx` foi refatorado para carregar modais, viewers e runtimes de mídia sob demanda, reduzindo o custo inicial da rota do caderno sem alterar o comportamento funcional
- Pipelines auxiliares de áudio, apresentação, vídeo, storage de mídia e regeneração de imagem/TTS agora são resolvidos apenas quando o usuário abre o modal/viewer ou dispara a ação correspondente, melhorando o reaproveitamento de cache entre chunks do notebook
- O chunk de produção de `ResearchNotebook` caiu de aproximadamente `550.81 kB` (`gzip 154.25 kB`) para `320.23 kB` (`gzip 93.65 kB`) e o `npm run build` deixou de emitir warnings de chunk grande/dynamic import
- Validação local atualizada: `npm run typecheck`, `npx vitest run` (**24/24 arquivos, 221/221 testes**) e `npm run build` com sucesso
- Índices: `firestore.indexes.json` permaneceu inalterado nesta rodada; o ganho veio de code splitting/caching, não de mudança de dados
- `frontend/src/lib/tts-client.ts`, `frontend/src/lib/model-config.ts`, `frontend/src/lib/audio-generation-pipeline.ts`, `frontend/src/lib/video-generation-pipeline.ts`, `frontend/src/lib/literal-video-production.ts` e `frontend/src/pages/ResearchNotebook.tsx` passaram a usar `openai/tts-1-hd` como default consistente de TTS, com preservação de override explícito do usuário
- `frontend/src/lib/tts-client.ts`, `frontend/src/lib/image-generation-client.ts` e `frontend/src/lib/model-catalog.ts` agora usam fallback seguro para `HTTP-Referer`, eliminando dependência rígida de `window.location.origin` fora de contexto browser ativo
- `frontend/src/pages/DocumentDetail.tsx` ganhou ações rápidas de copiar texto integral e duplicar documento, além de melhorias de acessibilidade em ações críticas
- Cobertura de regressão ampliada com `frontend/src/lib/tts-client.test.ts` e ajuste de `frontend/src/lib/video-generation-pipeline.test.ts` para o novo default TTS
- Validação local atualizada: `npm run typecheck`, `npx vitest run` (**24/24 arquivos, 221/221 testes**) e `npm run build` com sucesso
- Hotfix de permissão do admin concluído: `firestore.rules` agora cobre `research_notebooks/{id}/memory/{docId}` para owner/admin e elimina o `Missing or insufficient permissions` observado em `/admin` e `/admin/costs`
- O cache agregado da plataforma foi endurecido em `frontend/src/lib/firestore-service.ts`: falha isolada na leitura de `memory/search_memory` não derruba mais o overview/cost breakdown completo; o painel agora recebe `operational_warnings` quando carregar com métricas parciais
- `frontend/src/App.tsx`, `frontend/src/pages/PlatformAdminPanel.tsx` e `frontend/src/pages/PlatformCostsPage.tsx` passaram a respeitar `isReady` e a devolver erros humanizados/acionáveis, reduzindo redirecionamento prematuro e toasts opacos
- `frontend/src/lib/llm-client.ts` agora reconhece `provider returned error` com `404` como indisponibilidade de modelo, permitindo fallback correto e orientação específica no estúdio do notebook em `frontend/src/pages/ResearchNotebook.tsx`
- Fluxos auxiliares de regeneração de mídia no notebook passaram a usar `error-humanizer`, alinhando imagem/TTS ao novo padrão de UX operacional
- Cobertura de regressão ampliada com `frontend/src/lib/llm-client.test.ts` e novos cenários em `frontend/src/lib/error-humanizer.test.ts`
- Validação local reforçada: `npm run typecheck`, `npx vitest run` (**23/23 arquivos, 219/219 testes**) e `npm run build` com sucesso
- Índices: `firestore.indexes.json` permaneceu inalterado nesta rodada; não houve necessidade de novo índice para o hotfix
- Workflow operacional reforçado para release: usar `.github/workflows/firebase-preview.yml` para smoke em PR e `.github/workflows/firebase-deploy.yml` no merge em `main` para publicar hosting + rules
- Contrato compartilhado de progresso para pipeline documental em `frontend/src/lib/document-pipeline.ts`
- Contrato compartilhado de progresso para video em `frontend/src/lib/video-pipeline-progress.ts`
- Contrato compartilhado de progresso do notebook para acervo e estudio em `frontend/src/lib/notebook-pipeline-progress.ts`
- `ResearchNotebook.tsx` deixou de montar manualmente as trilhas de acervo e estudio; agora consome estado compartilhado para passos, metadados e mensagem ativa
- `AgentTrailProgressModal.tsx` passou a exibir metadados da etapa ativa, reforcando a narrativa operacional com base em eventos reais
- Telemetria operacional do pipeline documental agora sobe do cliente LLM ate a UI: retries, fallback, custo por etapa e duracao passam a alimentar o progresso em `generation-service.ts`, `PipelineProgressPanel.tsx`, `NewDocument.tsx` e `DocumentDetail.tsx`
- O pipeline de análise de acervo do notebook agora também expõe metadados operacionais por etapa, incluindo custo, duração, retries e fallback seguro, refletidos em `notebook-acervo-analyzer.ts`, `notebook-pipeline-progress.ts` e `ResearchNotebook.tsx`
- O pipeline do estudio agora publica `stageMeta` real por etapa via `TaskManagerContext.tsx`, `notebook-studio-pipeline.ts`, `audio-generation-pipeline.ts`, `presentation-generation-pipeline.ts` e `ResearchNotebook.tsx`, permitindo ao modal mostrar modelo efetivo, fallback, retries, custo e duracao sem concatenacoes artificiais
- O pipeline de video agora recebeu a mesma primeira camada de telemetria operacional: `video-generation-pipeline.ts` e `literal-video-production.ts` passaram a publicar `stageMeta` com modelo, fallback, retries, custo e duracao, consumidos por `video-pipeline-progress.ts`, `ResearchNotebook.tsx`, `VideoGenerationCostModal.tsx` e `VideoStudioEditor.tsx`
- O workbench do notebook agora consolida execucoes ativas de acervo, estudio e video em um resumo operacional unico no topo de `ResearchNotebook.tsx`, enquanto `TaskBar.tsx` tambem passou a exibir `stageMeta` em tarefas em andamento
- O resumo operacional consolidado do notebook agora calcula ETA aproximado para acervo, estudio e pipelines de video a partir do progresso real e do tempo decorrido da execucao
- O cockpit operacional do notebook agora agrega custo acumulado, duracao processada, retries, fallbacks e degradacoes por execucao ativa; o `TaskManagerContext.tsx` tambem passou a transportar esse resumo para tarefas do estudio executadas em background
- O cockpit do notebook agora tambem discrimina melhor a saida operacional do video por tipo de execucao, incluindo lotes de imagem, narracoes, lotes de clipe e distincao entre render local e render externo; `TaskBar.tsx` passou a exibir uma linha compacta com agregados operacionais das tarefas em andamento
- A trilha de memoria auditavel do notebook foi iniciada no estúdio: `notebook-context-audit.ts` agora calcula a janela real de fontes, conversa e instrucoes adicionais, e `ResearchNotebook.tsx` passou a exibir esse recorte auditavel na visao geral e na aba Estudio
- A memoria auditavel agora tambem cobre o chat do notebook: a resposta conversacional passou a usar um snapshot auditavel de fontes, janela de conversa, historico de buscas do caderno e busca web ao vivo, com painel explicito na aba de chat
- A memoria auditavel agora tambem cobre os fluxos de busca do notebook: pesquisa externa, pesquisa profunda e jurisprudencia/DataJud passaram a registrar o que foi efetivamente promovido para sintese, incluindo quantidade de resultados, selecionados, tribunais e volume de contexto compilado, com historico curto persistido, reaplicavel e promovivel a buscas salvas governaveis no proprio notebook
- A governanca das buscas salvas do notebook avancou mais um passo: os presets agora aceitam edicao manual inline de tags, com normalizacao/deduplicacao simples e reaproveitamento das tags como atalho de filtro local na aba Fontes
- A governanca das buscas salvas do notebook avancou para operacao em escala leve: a aba Fontes agora suporta selecao multipla e acoes em lote (fixar, desafixar, limpar selecao, adicionar/remover tags e excluir selecionadas com confirmacao)
- A camada de persistencia do notebook para memoria de busca iniciou migracao incremental para estrutura dedicada: `firestore-service.ts` agora faz dual-write e dual-read de `research_audits`/`saved_searches` em `research_notebooks/{id}/memory/search_memory`, com fallback seguro para campos legados no documento principal
- A migracao dedicada tambem recebeu hardening de consistencia: o `updateResearchNotebook` passou a reduzir duplicacao no documento raiz quando sincroniza memoria dedicada, e o deep-link do notebook agora sempre abre via `getResearchNotebook` para carregar a versao completa ja mesclada com a memoria dedicada
- A estrutura dedicada `memory/search_memory` agora tem politica de retencao aplicada no write-path: auditorias com TTL de 45 dias e limite de 60 entradas, buscas salvas limitadas a 120 entradas, com metadados de retencao persistidos para observabilidade basica
- A observabilidade agregada da memoria dedicada foi iniciada no admin: o overview da plataforma agora contabiliza cobertura de notebooks com `search_memory`, volume total de auditorias/presets dedicados e descartes aplicados pela retencao
- A base de monitoramento historico tambem foi iniciada: `getPlatformDailyUsage` passou a agregar atualizacoes diarias e descartes diarios da memoria dedicada de busca, preparando trilha para alertas e leitura temporal
- Alertas operacionais iniciais foram adicionados ao painel admin com base nessas métricas: cobertura de memória dedicada, picos/tendência de descartes por retenção e ausência de atualizações recentes
- A trilha administrativa de escala também entrou em produção inicial: o painel admin agora executa diagnóstico/backfill em lote para migrar cadernos legados para `memory/search_memory`, com relatório de escopo, migração e falhas
- O backfill administrativo agora também foi endurecido para escala: a rotina passou a operar em chunks paginados com cursor e limites configuráveis, e o relatório do painel passou a mostrar chunks processados, tamanho de lote e status de limite
- A calibração de alertas também evoluiu: thresholds da memória dedicada agora são configuráveis no painel admin e persistidos em `UserSettings`, permitindo ajuste operacional sem alteração de código
- A governança de thresholds avançou para presets operacionais: o painel admin agora oferece perfis `conservative`, `balanced` e `aggressive`, com detecção automática de estado `custom` e persistência do perfil ativo
- A calibração operacional avançou mais uma camada: o painel admin agora calcula recomendação assistida de thresholds com base em porte da base (small/medium/large), cobertura atual e descarte recente, com aplicação em um clique
- A recomendação assistida agora também possui política de governança persistida: janela configurável (14/30/60/90 dias) e modo de rollout (manual/assistido), com opção de auto-persistir recomendações em modo assistido
- A recomendação assistida foi refinada com ponderação temporal por recência na heurística e o painel agora exibe impacto estimado dos alertas (atual vs recomendado) antes da aplicação
- A calibragem agora também tem trilha histórica persistida de recomendado/aplicado no admin, com contexto de rollout, janela, porte e impacto por severidade para auditoria longitudinal
- O painel admin agora também agrega métricas da trilha de calibração (ações manuais, aplicações assistidas e delta médio por severidade), acelerando leitura de tendência operacional
- A trilha de calibração agora também gera alertas automáticos de desvio (drift) e status de saúde da governança de rollout com base em override manual
- Refatoração dos handlers de pesquisa de fonte no notebook concluída: entrada unificada para externa/profunda/jurisprudência, replay auditável de jurisprudência no mesmo entrypoint e remoção de wrappers inline legados de clique/Enter em `ResearchNotebook.tsx`
- Hardening de CI frontend concluído com ajuste de testes para dual-read de memória dedicada e estabilização de mock de busca web plain-text sem dependência de rede
- Governança de drift evoluída para modo acionável no admin: alertas agora geram planos aplicáveis com persistência assistida e guardrails de thresholds
- Validação longitudinal de calibração adicionada no admin por coortes (janela × rollout × porte), com leitura de deltas médios e taxa de override manual
- Effectiveness scoring (0-100) por coorte longitudinal com coluna visual color-coded e auto-recomendação da melhor política com botão de adoção (Etapas 40-41)
- Pipeline de vídeo agora exporta `VideoCheckpoint` com estado completo após cada passo; em caso de erro, o checkpoint é anexado à exceção para retomada (Etapa 42)
- Reranking de jurisprudência aprimorado com decaimento temporal gradual (6 faixas), bônus de proximidade de frase e tie-breaking por hierarquia de tribunal (Etapa 43)

**Em validacao ou proxima onda imediata:**
- A telemetria operacional rica ja cobre documento, acervo, estudio e video com ETA, agregados e detalhamento principal de saida no notebook; a memoria auditavel agora cobre estudio, chat e buscas do notebook
- O pipeline de video ainda pode evoluir em uma camada adicional de previsao por lote/renderizacao e resumir melhor checkpoints retomaveis
- O `ResearchNotebookV2` agora já cobre overview, chat contextual, gestão de fontes, análise inteligente de acervo, viewer avançado, pesquisas externas/profundas/jurisprudenciais, governança principal de buscas salvas, inventário de artefatos, briefing do estúdio, geração base, pós-geração de áudio/imagem e o fluxo completo de vídeo; a próxima onda passa a ser consolidação do shell novo como trilho principal, com testes dedicados, limpeza de fallback residual e eventual despromoção do clássico para contingência
- O trilho dedicado do redesign em Firebase já existe, mas agora precisa ser alimentado a cada avanço relevante do workbench para virar o ambiente principal de validação contínua da Faixa E
- A trilha de memoria/contexto auditavel do notebook ainda nao esta completa: migracao dedicada, retencao/TTL, observabilidade agregada, base historica diaria, alertas operacionais, backfill administrativo com chunking, presets operacionais e recomendacao assistida com politica de rollout/aceitacao, preview de impacto, historico auditavel, metricas agregadas e alertas de desvio ja estao implantados; falta agora consolidar validacao continuada em producao e fechar ajustes finos por perfil de operacao

**Arquivos foco deste ciclo:**
- `frontend/src/App.tsx`
- `frontend/src/index.css`
- `frontend/vite.config.ts`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Profile.tsx`
- `frontend/src/pages/ResearchNotebook.tsx`
- `frontend/src/pages/labs/DashboardV2.tsx`
- `frontend/src/pages/labs/ResearchNotebookV2.tsx`
- `frontend/src/pages/labs/ProfileV2.tsx`
- `frontend/src/pages/notebook/types.ts`
- `frontend/src/components/SourceContentViewer.tsx`
- `frontend/src/components/artifacts/ArtifactViewerModal.tsx`
- `frontend/src/components/artifacts/artifact-parsers.ts`
- `frontend/src/components/SearchResultsModal.tsx`
- `frontend/src/components/DeepResearchModal.tsx`
- `frontend/src/components/JurisprudenceConfigModal.tsx`
- `frontend/src/components/v2/V2WorkspaceLayout.tsx`
- `frontend/src/lib/dashboard-data.ts`
- `frontend/src/lib/dashboard-v2.ts`
- `frontend/src/lib/feature-flags.ts`
- `scripts/firebase-authorized-domains.mjs`
- `.github/workflows/firebase-redesign-v2.yml`
- `.firebaserc`
- `firebase.json`
- `frontend/src/lib/redesign-routes.ts`
- `frontend/src/lib/profile-preferences.ts`
- `frontend/src/lib/profile-progress.ts`
- `frontend/src/lib/research-notebook-routes.ts`
- `frontend/src/lib/research-notebook-routes.test.ts`
- `frontend/src/lib/notebook-artifact-tasks.ts`
- `frontend/src/lib/notebook-artifact-tasks.test.ts`
- `frontend/src/lib/research-notebook-v2.ts`
- `frontend/src/lib/feature-flags.test.ts`
- `frontend/src/lib/dashboard-data.test.ts`
- `frontend/src/lib/dashboard-v2.test.ts`
- `frontend/src/lib/profile-progress.test.ts`
- `frontend/src/lib/redesign-routes.test.ts`
- `frontend/src/lib/research-notebook-routes.test.ts`
- `frontend/src/lib/research-notebook-v2.test.ts`
- `frontend/src/components/SourceContentViewer.test.ts`
- `frontend/src/lib/tts-client.ts`
- `frontend/src/lib/image-generation-client.ts`
- `frontend/src/lib/model-catalog.ts`
- `frontend/src/lib/model-config.ts`
- `frontend/src/pages/DocumentDetail.tsx`
- `frontend/src/lib/tts-client.test.ts`
- `frontend/src/lib/notebook-pipeline-progress.ts`
- `frontend/src/lib/document-pipeline.ts`
- `frontend/src/lib/generation-service.ts`
- `frontend/src/components/PipelineProgressPanel.tsx`
- `frontend/src/lib/llm-client.ts`
- `frontend/src/lib/notebook-acervo-analyzer.ts`
- `frontend/src/lib/notebook-acervo-analyzer.test.ts`
- `frontend/src/lib/notebook-studio-pipeline.ts`
- `frontend/src/lib/notebook-media-storage.ts`
- `frontend/src/lib/audio-generation-pipeline.ts`
- `frontend/src/lib/presentation-generation-pipeline.ts`
- `frontend/src/lib/video-generation-pipeline.ts`
- `frontend/src/lib/literal-video-production.ts`
- `frontend/src/lib/video-pipeline-progress.ts`
- `frontend/src/lib/notebook-context-audit.ts`
- `frontend/src/lib/firestore-types.ts`
- `frontend/src/components/JurisprudenceConfigModal.tsx`
- `frontend/src/contexts/TaskManagerContext.tsx`
- `frontend/src/pages/ResearchNotebook.tsx`
- `frontend/src/components/AgentTrailProgressModal.tsx`
- `frontend/src/components/VideoGenerationCostModal.tsx`
- `frontend/src/components/artifacts/VideoStudioEditor.tsx`
- `frontend/src/components/TaskBar.tsx`

**Validacao deste ciclo:**
- Nona onda do `ResearchNotebookV2` validada localmente em `frontend/` com `npm run typecheck`, `npm run test` (**32/32 arquivos, 253/253 testes**) e `npm run build`, mantendo `ResearchNotebookV2` em **151.82 kB** (`gzip 34.78 kB`), `ArtifactViewerModal` em **76.33 kB** (`gzip 19.76 kB`), `audio-generation-pipeline` em **8.56 kB** (`gzip 3.56 kB`) e `presentation-generation-pipeline` em **9.16 kB** (`gzip 3.78 kB`)
- Oitava onda do `ResearchNotebookV2` validada localmente em `frontend/` com `npm run typecheck`, `npm run test` (**32/32 arquivos, 253/253 testes**) e `npm run build`, mantendo `ResearchNotebookV2` em **145.82 kB** (`gzip 32.96 kB`), `notebook-studio-pipeline` em chunk separado de **40.36 kB** (`gzip 14.60 kB`) e `VideoStudioEditor` isolado em **27.24 kB** (`gzip 7.02 kB`)
- Setima onda do `ResearchNotebookV2` validada localmente em `frontend/` com `npm run typecheck`, `npm run test` (**31/31 arquivos, 250/250 testes**) e `npm run build`, mantendo `ResearchNotebookV2` em **138.58 kB** (`gzip 31.04 kB`) e `VideoStudioEditor` isolado em **27.24 kB** (`gzip 7.02 kB`) para preservar a ponte de mídia literal fora do shell base
- Sexta onda do `ResearchNotebookV2` validada localmente em `frontend/` com `npm run typecheck`, `npm run test` (**31/31 arquivos, 250/250 testes**) e `npm run build`, mantendo `ResearchNotebookV2` em **125.25 kB** (`gzip 29.11 kB`) e `ArtifactViewerModal` em chunk separado de **76.03 kB** (`gzip 19.63 kB`)
- Quinta onda do `ResearchNotebookV2` validada localmente em `frontend/` com `npm run typecheck`, `npm run test` (**31/31 arquivos, 250/250 testes**) e `npm run build`, mantendo `ResearchNotebookV2` em **115.23 kB** (`gzip 27.26 kB`), `AgentTrailProgressModal` em chunk separado de **6.15 kB** (`gzip 2.16 kB`) e `SourceContentViewer` em **24.13 kB** (`gzip 6.34 kB`)
- Infraestrutura do redesign V2 validada localmente com criação do site `lexio-redesign-v2-44760`, listagem via `firebase hosting:sites:list` e integração do repositório com multi-site hosting
- Segunda onda do `ResearchNotebookV2` validada localmente em `frontend/` com `npm run typecheck`, `npm run test` (**31/31 arquivos, 244/244 testes**) e `npm run build`
- Primeira onda do `ResearchNotebookV2` validada localmente em `frontend/` com `npm run typecheck`, `npm run test` (**31/31 arquivos, 244/244 testes**) e `npm run build`
- Segunda onda do redesign V2 validada localmente em `frontend/` com `npm run typecheck`, `npm run test` (**28/28 arquivos, 236/236 testes**) e `npm run build`
- Fundacao inicial do redesign V2 validada localmente em `frontend/` com `npm run typecheck`, `npm run test` (**24/24 arquivos, 221/221 testes**) e `npm run build`
- Hardening de DataJud/CI-CD validado localmente com `npm run build` em `functions/`; `npm run typecheck`, `npx vitest run` (**24/24 arquivos, 221/221 testes**) e `npm run build` em `frontend/`; `d:/Lexio/.venv/Scripts/python.exe -m pytest tests --tb=short -q` (**2203/2203**) e `d:/Lexio/.venv/Scripts/python.exe -m ruff check packages tests`
- Code splitting do notebook validado em `frontend/` com `npm run typecheck`, `npx vitest run` (**24/24 arquivos, 221/221 testes**) e `npm run build`; build final sem warnings e com `ResearchNotebook` em `320.23 kB` (`gzip 93.65 kB`)
- Hardening de TTS/OpenRouter e UX de `DocumentDetail.tsx` validados localmente com `npm run typecheck`, `npx vitest run` (**24/24 arquivos, 221/221 testes**) e `npm run build`
- `npm run typecheck` executado em `frontend/` com saida final limpa (`tsc --noEmit`, exit code 0)
- Refatoração dos handlers de fonte em `ResearchNotebook.tsx` validada com novo `npm run typecheck` limpo após ajustes de referências e triggers
- Correção de quebra no workflow de Tests validada localmente com trilha completa do job frontend-quality: `npm run typecheck`, `npm run test` (188/188) e `npm run build` em `frontend/`
- Nova etapa de governança de drift também validada localmente com `npm run typecheck`, `npm run test` (188/188) e `npm run build` em `frontend/`

---

## Estado geral do produto (snapshot atual)

| Área | Estado | Observações |
|------|--------|-------------|
| Caderno de Pesquisa (Notebook) | ✅ Implementado | Fontes, chat, estúdio, artefatos, deep-link |
| Pesquisa de Jurisprudência (DataJud) | ✅ Implementado | Ementa + inteiro teor + results_raw por processo + fallback STF/classificação temática |
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

**Mudanças implementadas:**
- Modal expõe tribunal, grau, janela temporal e área do direito
- `searchDataJud()` calcula `effectiveLegalArea` com prioridade para seleção manual e fallback por inferência automática da consulta
- Query Elasticsearch aplica `must_not` por área jurídica para reduzir contaminação temática
- Ranking local penaliza classes penais, excesso anômalo de assuntos e resultados sem texto útil
- Pós-filtro remove itens claramente de área errada fora do top-3 e o enriquecimento complementar pode incluir STF/JusBrasil quando necessário

---

### Feature 1.5: Classificação temática automática de jurisprudência

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Classificar automaticamente cada resultado do DataJud por área do direito (trabalhista, penal, civil, etc.) usando os campos `assuntos`, `classe` e `ementa`.

**Arquivos afetados:**
- `frontend/src/lib/datajud-service.ts` — `classifyJurisprudenceArea`, `classifyResult`, `JURISPRUDENCE_AREA_PATTERNS`
- `frontend/src/lib/datajud-service.test.ts` — 16 testes de classificação
- `frontend/src/components/SourceContentViewer.tsx` — badge colorido de área no `ProcessCard`
- `frontend/src/lib/constants.ts` — `AREA_LABELS`, `AREA_COLORS` (pré-existentes)

**Mudanças implementadas:**
- 17 padrões regex para classificar áreas (tax, labor, criminal, etc.)
- `classifyResult(DataJudResult)` como wrapper de conveniência
- Badge colorido da área do direito no cabeçalho de cada `ProcessCard`
- Reutiliza paleta `AREA_COLORS` / `AREA_LABELS` já existente

---

### Feature 1.6: Indicador de posição favorável/desfavorável/neutro

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Indicar ao usuário se cada resultado de jurisprudência é favorável, desfavorável ou neutro em relação à tese/consulta.

**Arquivos afetados:**
- `frontend/src/lib/datajud-service.ts` — campos `relevanceScore?: number` e `stance?: 'favoravel' | 'desfavoravel' | 'neutro'` em `DataJudResult`
- `frontend/src/pages/ResearchNotebook.tsx` — prompt de ranking enriquecido com `stance`; parse e attach de stance/score aos resultados
- `frontend/src/components/SourceContentViewer.tsx` — indicadores visuais (ThumbsUp verde, ThumbsDown vermelho, Minus cinza) + badge de relevância (/100)

**Mudanças implementadas:**
- Prompt `JURISPRUDENCE_RANKING_SYSTEM` agora solicita `stance` por processo
- Parser enriquece resultados com `relevanceScore` e `stance` antes da serialização em `results_raw`
- `ProcessCard` exibe badge de posição + score de relevância
- Fallback gracioso: se ranking não está configurado, nenhum indicador aparece

---

### Feature 1.12: Resiliência de busca externa e jurisprudencial

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Manter pesquisa profunda e jurisprudencial operando mesmo com falhas parciais de provedores, modelos ou fontes públicas.

**Arquivos afetados:**
- `frontend/src/lib/datajud-service.ts` — score local endurecido, classificação temática, complemento STF/JusBrasil e diagnósticos
- `frontend/src/lib/web-search-service.ts` — estratégias DuckDuckGo/Jina com fallback e telemetria técnica
- `frontend/src/pages/ResearchNotebook.tsx` — warnings visíveis, toasts e continuidade degradada do fluxo
- `frontend/src/lib/llm-client.ts` — fallback para modelos confiáveis em falhas transitórias/indisponibilidade

**Mudanças implementadas:**
- Busca profunda alterna entre estratégias DDG/Jina e retorna diagnósticos para distinguir vazio real de falha técnica
- Pesquisa jurisprudencial pode complementar com scraping estruturado do STF e fontes públicas quando o DataJud vier incompleto
- Pipelines críticos do notebook e de mídia passaram a usar fallback automático de modelo e warnings de degradação/capability mismatch

---

### Feature 1.7: Linha do tempo jurisprudencial

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Exibir processos organizados cronologicamente em formato de timeline visual para identificar evolução de entendimento.

**Arquivos afetados:**
- `frontend/src/lib/datajud-service.ts` — `sortByDate(results, ascending)` utility
- `frontend/src/components/SourceContentViewer.tsx` — tab "Linha do Tempo" no JurisprudenceViewer

**Mudanças implementadas:**
- `sortByDate` ordena resultados por `dataAjuizamento` (ascendente ou descendente)
- Tab "Linha do Tempo" com timeline visual vertical (linha emerald + dots coloridos por stance)
- Cada nó exibe data, classe, área, tribunal, relevância e trecho da ementa
- Dots coloridos: verde (favorável), vermelho (desfavorável), emerald (neutro/sem classificação)

---

### Feature 1.8: Agrupamento de precedentes por área

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Agrupar resultados do DataJud por área do direito classificada, facilitando análise por tema.

**Arquivos afetados:**
- `frontend/src/lib/datajud-service.ts` — `groupByArea(results)` utility, interface `AreaGroup`
- `frontend/src/components/SourceContentViewer.tsx` — tab "Agrupados" no JurisprudenceViewer

**Mudanças implementadas:**
- `groupByArea` agrupa resultados usando `classifyResult` e retorna `AreaGroup[]` ordenados (nomes antes de "Outros")
- Tab "Agrupados" com seções colapsáveis por área, badge colorido, contagem de processos
- Cada grupo mostra ProcessCards dos resultados daquela área

---

### Feature 1.9: Comparação entre dois julgados

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Permitir comparação lado a lado de dois processos, destacando semelhanças e diferenças.

**Arquivos afetados:**
- `frontend/src/lib/datajud-service.ts` — `compareProcesses(left, right)` utility, interface `ProcessComparison`
- `frontend/src/components/SourceContentViewer.tsx` — tab "Comparar" + botão "Comparar com outro processo" no ProcessCard

**Mudanças implementadas:**
- `compareProcesses` calcula: assuntos em comum, mesma área, diferença em dias
- Botão "Comparar com outro processo" em cada ProcessCard (exibe seletor de processos)
- Tab "Comparar" com badges resumo (mesma área, N assuntos em comum, X dias de diferença)
- Layout grid 2 colunas com ComparisonSide por processo

---

### Feature 1.10: Analytics jurisprudencial por tema/período

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Painel de analytics no overview do caderno mostrando distribuição de resultados de jurisprudência por área, posição, ano e tribunal.

**Arquivos afetados:**
- `frontend/src/lib/datajud-service.ts` — `buildJurisprudenceAnalytics(results)` → `JurisprudenceAnalytics`
- `frontend/src/lib/datajud-service.test.ts` — 9 testes para analytics
- `frontend/src/pages/ResearchNotebook.tsx` — painel Analytics na aba Visão Geral

**Mudanças implementadas:**
- `buildJurisprudenceAnalytics` computa: totalResults, byArea, byStance, byYear, byTribunal, avgRelevanceScore
- Painel visual no overview com: cards de stance (favoráveis/desfavoráveis/neutros/relevância média), barras de área, mini bar-chart por ano, badges de tribunal
- Dados derivados automaticamente de `results_raw` das fontes de jurisprudência

---

### Feature 1.11: Pesquisa conversacional com contexto (memória multi-turno)

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** O assistente de chat do caderno recebe histórico de buscas realizadas para sugerir refinamentos e complementos.

**Arquivos afetados:**
- `frontend/src/pages/ResearchNotebook.tsx` — injeção de `searchContext` no system prompt do chat

**Mudanças implementadas:**
- Coleta de histórico de pesquisas (jurisprudência + web) a partir das fontes do caderno
- Injeção como seção `HISTÓRICO DE PESQUISAS REALIZADAS` no system prompt
- Assistente pode referenciar buscas anteriores e sugerir refinamentos
- Zero overhead: apenas montagem de string, sem chamada extra de API

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
- `frontend/src/pages/DocumentDetail.tsx` — botão "Abrir no Gerador" para documentos `origem: 'caderno'`
- `frontend/src/pages/DocumentList.tsx` — badge "Gerador" (amber) ao lado do badge "Caderno"
- `frontend/src/pages/NewDocument.tsx` — aceita `?request=` e `?type=` query params para pré-preencher formulário

**Mudanças implementadas:**
- Documentos do caderno e documentos formais aparecem na mesma listagem na página Documentos
- Pipeline de geração preserva qualidade e persiste com `origem: 'caderno'`
- Botão "Abrir no Gerador" na `DocumentDetail` envia `original_request` e `document_type_id` como query params para `/documents/new`
- Badge "Gerador" na `DocumentList` permite acesso rápido à recriação
- `NewDocument` aceita `?request=` e `?type=` e pré-preenche campos (request + tipo de documento) com limpeza de URL após uso

---

## Epic 5: Infraestrutura de Qualidade

### Feature 5.1: Testes unitários — DataJud ementa/inteiro_teor

**Estado:** ✅ Implementado (ciclo 2026-04)

**Arquivos:** `frontend/src/lib/datajud-service.test.ts`

---

### Feature 5.2: Rastreabilidade PLANO.md + MANIFEST.json

**Estado:** ✅ Implementado (ciclo 2026-04)

**Arquivos:** `docs/PLANO.md`, `docs/MANIFEST.json`

---

### Feature 5.3: Exportação PDF nativa dos artefatos

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Permitir exportar artefatos como PDF diretamente do visualizador.

**Arquivos afetados:**
- `frontend/src/components/artifacts/artifact-exporters.ts` — função `printAsPDF` via `window.print()`
- `frontend/src/components/artifacts/ArtifactViewerModal.tsx` — opção "PDF (imprimir)" no dropdown de exportação

---

### Feature 5.4: Preview de documento na página Documentos

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Mostrar snippet do conteúdo do documento na listagem para facilitar identificação visual.

**Arquivos afetados:**
- `frontend/src/pages/DocumentList.tsx` — snippet de `texto_completo` (2 linhas, max 200 chars), busca full-text

---

### Feature 5.5: Testes unitários — SourceContentViewer, ReportViewer, DocumentList

**Estado:** ✅ Implementado (ciclo 2026-04)

**Objetivo:** Cobrir funções puras dos componentes de UI/visualização com testes unitários.

**Arquivos afetados:**
- `frontend/src/components/SourceContentViewer.test.ts` — `parseJurisprudenceText`, `fmtChars`, `formatDate`
- `frontend/src/components/artifacts/ReportViewer.test.ts` — `renderMarkdownToHtml`, `extractToc`, pageMode
- `frontend/src/pages/DocumentList.test.ts` — `applyOrigemFilter`, lógica de filtragem

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

| Área | Tipo de teste faltando | Estado |
|------|----------------------|--------|
| Jurispr. — ementa/inteiro teor | Testes de parseDataJudHit com novos campos | ✅ Coberto — 11 testes em datajud-service.test.ts |
| Studio pipeline — detecção de área | Testes de detectLegalArea (17 áreas + fallback) | ✅ Coberto — 19 testes em notebook-studio-pipeline.test.ts |
| SourceContentViewer — renderização jurídica | Testes de parseJurisprudenceText, fmtChars, formatDate | ✅ Coberto — SourceContentViewer.test.ts |
| ReportViewer — pageMode | Testes de renderMarkdownToHtml, extractToc, pageMode | ✅ Coberto — ReportViewer.test.ts |
| DocumentList — origemFilter interaction | Testes de lógica de filtragem por origem | ✅ Coberto — DocumentList.test.ts |
| firestore-service — saveNotebookDocument | Teste com mock do Firebase SDK | ✅ Coberto — 6 testes em firestore-service.test.ts |

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
- [x] Pesquisa conversacional com contexto (memória multi-turno de filtros)
- [x] Classificação temática de jurisprudência por área do direito
- [x] Linha do tempo jurisprudencial (evolução de entendimento)
- [x] Indicador "favorável / desfavorável / neutro" por resultado

### Prioridade 3 — Moat de produto
- [x] Deduplicação e agrupamento de precedentes relacionados
- [x] Comparação entre dois julgados ("diferencie estes precedentes")
- [ ] Pesquisa orientada à peça processual (cola petição → recebe jurisprudência relacionada)
- [x] Analytics jurisprudencial por tema/período

---

*Última atualização: 2026-04-16 — Ciclo: Resiliência de busca e fallback de mídia/LLM*

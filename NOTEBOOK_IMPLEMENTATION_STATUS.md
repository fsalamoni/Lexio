# Caderno de Pesquisa — Status de Implementacao (NotebookLM+)

> Documento de tracking para agentes IA. Atualizado automaticamente.
> Branch: `main`

---

## Status Geral: Etapas 1-39 IMPLEMENTADAS

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
- `npm run typecheck` executado em `frontend/` com sucesso apos a camada de governanca das buscas salvas do notebook

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

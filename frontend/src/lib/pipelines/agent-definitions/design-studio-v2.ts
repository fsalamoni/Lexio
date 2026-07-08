import type { AgentModelDef } from '../../model-config'

// ── Design Studio v2 Agent Definitions ──────────────────────────────────────

/**
 * Design Studio v2 — a conversational, project-oriented builder that turns a
 * chat request into real, multi-file front-end and back-end code, previewed
 * live and applied to a connected repository (local workspace or GitHub).
 *
 * Unlike the v1 studio (a deterministic template renderer), v2 is driven by a
 * real orchestrator LLM that reasons about the request, decides whether to
 * plan, ask questions or build directly (per-command mode), and emits concrete
 * file operations that are materialised into a virtual project and rendered in
 * a sandboxed preview. Specialist agents handle heavy generation (front-end,
 * back-end, design system) and a reviewer audits the result.
 *
 * Every agent is configured through the same scoped-model pipeline as every
 * other Lexio pipeline: selectors only expose models from the user's personal
 * catalog whose capability matches the agent's `requiredCapability`. Text
 * agents require `text`; the asset generator requires `image`.
 */
export const DESIGN_STUDIO_V2_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'ds2_orchestrator',
    label: 'Orquestrador',
    description: 'O cérebro do estúdio: lê o pedido, o histórico e o estado do projeto, desenvolve o raciocínio, decide o modo (construir, planejar ou perguntar), escolhe os especialistas e coordena as operações de arquivo do início ao fim',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'compass',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Núcleo decisório e de raciocínio. Prefira modelos premium com excelente planejamento, código confiável e JSON estável (Claude Sonnet/Opus, GPT-4.1, Gemini 2.5 Pro).',
  },
  {
    key: 'ds2_planner',
    label: 'Planejador',
    description: 'No modo "planejar", estuda o pedido e o repositório e entrega um plano estruturado (passos, arquivos afetados, comandos) para o usuário aprovar, revisar ou rejeitar antes de executar',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'list-checks',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Raciocínio de planejamento com JSON confiável. Modelos balanced fortes em decomposição de tarefas funcionam muito bem.',
  },
  {
    key: 'ds2_clarifier',
    label: 'Esclarecedor',
    description: 'No modo "perguntar", transforma ambiguidades do pedido em perguntas objetivas de escopo, público, stack, estilo visual e critérios de aceite antes de construir',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'message-circle-question',
    agentCategory: 'extraction',
    requiredCapability: 'text',
    bestModelNote: 'Agente rápido para converter lacunas em perguntas úteis sem gastar modelos premium.',
  },
  {
    key: 'ds2_frontend_engineer',
    label: 'Engenheiro Front-end',
    description: 'Gera e edita código de front-end de alta qualidade (HTML/CSS/JS, React/TypeScript, Tailwind), com componentes acessíveis, responsivos e coesos, prontos para o preview ao vivo',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'layout-template',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Precisa produzir código front-end válido e idiomático. Modelos balanced/premium fortes em código funcionam melhor.',
  },
  {
    key: 'ds2_backend_engineer',
    label: 'Engenheiro Back-end',
    description: 'Gera e edita código de back-end (APIs, servidores, modelos de dados, funções), com contratos claros, tratamento de erros e integração com o front-end',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'server',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Código de servidor correto e seguro. Modelos balanced/premium fortes em código e em raciocínio de contratos de API.',
  },
  {
    key: 'ds2_designer',
    label: 'Diretor de Design',
    description: 'Define o sistema de design (paleta, tipografia, grid, espaçamento, componentes) e refina a linguagem visual para um resultado minimalista, elegante e consistente',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'palette',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Estruturação visual de alto nível. Modelos premium com bom senso estético e consistência de design.',
  },
  {
    key: 'ds2_reviewer',
    label: 'Revisor',
    description: 'Audita o código e o design gerados: correção, acessibilidade, responsividade, segurança básica, consistência e completude — apontando ajustes antes da entrega',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'shield-check',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Crítico técnico com boa aderência a rubricas de qualidade de código e design.',
  },
  {
    key: 'ds2_asset_generator',
    label: 'Gerador de Assets',
    description: 'Gera imagens, ilustrações e fundos reais quando o projeto pedir materialização visual (logos, hero images, ícones, texturas)',
    defaultModel: 'google/gemini-2.5-flash-image',
    recommendedTier: 'balanced',
    icon: 'image-plus',
    agentCategory: 'synthesis',
    requiredCapability: 'image',
    bestModelNote: 'Modelo de imagem real. Gemini Flash Image é o padrão inicial; modelos premium podem elevar a qualidade. O seletor só exibe modelos do catálogo pessoal com capability de imagem.',
  },
]

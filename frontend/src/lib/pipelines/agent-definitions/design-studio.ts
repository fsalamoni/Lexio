import type { AgentModelDef } from '../../model-config'

// ── Design Studio Agent Definitions ─────────────────────────────────────────

/**
 * Design Studio pipeline — orchestrator-model multi-agent engine that powers the
 * `/design` page (behind `FF_DESIGN_STUDIO`).
 *
 * The studio turns a text brief (plus an artifact kind and theme) into a
 * self-contained artifact — slides, site, app, wireframe, document or
 * animation — that can be previewed in a sandboxed iframe, exported
 * (HTML / JSON template / Markdown) and applied to a repository.
 *
 * These agents mirror the same orchestrator model used by the presentation v2
 * and chat pipelines: a single reasoning orchestrator evaluates the whole
 * request, decides clarification questions, chooses which specialists to run,
 * and controls the plan. Every agent is configured through the same scoped-model
 * loading pipeline as every other Lexio pipeline, so the model selectors only
 * expose models from the user's personal catalog whose capability matches the
 * agent's `requiredCapability`. Text agents require `text`; the image generator
 * requires `image`, so only capable catalog models are ever enabled for it.
 */
export const DESIGN_STUDIO_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'design_studio_orchestrator',
    label: 'Orquestrador',
    description: 'Avalia o briefing inteiro, decide perguntas de esclarecimento, escolhe os agentes e controla o plano de design completo',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'compass',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Núcleo decisório do estúdio. Prefira modelos premium com excelente planejamento e JSON confiável (Claude Sonnet, GPT-4.1, Gemini 2.5 Pro).',
  },
  {
    key: 'design_studio_brief_analyst',
    label: 'Analista de Briefing',
    description: 'Lê o pedido, o tipo de artefato e o tema para identificar objetivo, público, restrições, lacunas e materiais úteis antes de planejar',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'scan-search',
    agentCategory: 'extraction',
    requiredCapability: 'text',
    bestModelNote: 'Extrai sinais do briefing com baixo custo. Bons modelos fast/balanced com contexto amplo funcionam bem.',
  },
  {
    key: 'design_studio_clarifier',
    label: 'Clarificador',
    description: 'Formula perguntas objetivas de conteúdo, público, formato e estilo visual quando o briefing ainda está ambíguo',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'message-circle-question',
    agentCategory: 'extraction',
    requiredCapability: 'text',
    bestModelNote: 'Agente rápido para transformar lacunas em perguntas úteis, sem gastar modelos premium.',
  },
  {
    key: 'design_studio_ux_architect',
    label: 'Arquiteto de UX',
    description: 'Define a arquitetura de informação, seções, fluxo e a estrutura de layout adequada ao tipo de artefato (slides, site, app, wireframe, documento ou animação)',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'route',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Use modelo forte em raciocínio para montar hierarquia, seções e navegação coerentes com o objetivo.',
  },
  {
    key: 'design_studio_content_writer',
    label: 'Redator de Conteúdo',
    description: 'Escreve títulos, textos das seções, chamadas e microcopy em português brasileiro, alinhados ao público e ao tom definidos',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'file-text',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Priorize escrita clara e síntese. Modelos balanced com boa redação em pt-BR funcionam muito bem.',
  },
  {
    key: 'design_studio_visual_designer',
    label: 'Diretor Visual',
    description: 'Define tema, paleta, tipografia, grid, hierarquia visual e o sistema de design coeso aplicado ao artefato',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'palette',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Modelo forte em estruturação visual para criar um sistema de design consistente e exportável.',
  },
  {
    key: 'design_studio_image_generator',
    label: 'Gerador de Imagens',
    description: 'Gera imagens, ilustrações e fundos reais para o artefato quando o plano de design pedir materialização visual',
    defaultModel: 'google/gemini-2.5-flash-image',
    recommendedTier: 'balanced',
    icon: 'image-plus',
    agentCategory: 'synthesis',
    requiredCapability: 'image',
    bestModelNote: 'Modelo de imagem real. Gemini Flash Image é o padrão operacional inicial; modelos premium podem ser usados para qualidade superior. O seletor só exibe modelos do catálogo pessoal com capability de imagem.',
  },
  {
    key: 'design_studio_motion_designer',
    label: 'Designer de Movimento',
    description: 'Planeja animações, transições e keyframes CSS quando o artefato exigir movimento (por exemplo, o tipo Animação)',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'sparkles',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Planejamento técnico de motion e keyframes; deve ser confiável em JSON e em regras de CSS.',
  },
  {
    key: 'design_studio_code_generator',
    label: 'Gerador de Código',
    description: 'Transforma o DesignSpec aprovado em HTML/CSS autocontido e seguro para o preview em iframe e para exportação',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'layout-template',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Precisa gerar HTML/CSS válido e escapado. Modelos balanced fortes em código funcionam bem.',
  },
  {
    key: 'design_studio_reviewer',
    label: 'Revisor de Design',
    description: 'Audita acessibilidade, responsividade, coesão visual, consistência de marca e completude antes da entrega',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'shield-check',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Modelo crítico com boa aderência a rubricas de acessibilidade e qualidade visual.',
  },
  {
    key: 'design_studio_packager',
    label: 'Empacotador',
    description: 'Normaliza o DesignSpec final e prepara os hints de exportação (HTML, template JSON e Markdown) e de aplicação em repositório',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'package-check',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Agente de acabamento estrutural; deve ser barato, confiável em JSON e pouco criativo.',
  },
]

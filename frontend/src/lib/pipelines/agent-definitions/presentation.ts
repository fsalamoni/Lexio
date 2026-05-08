import type { AgentModelDef } from '../../model-config'

// ── Presentation Pipeline Agent Definitions ──────────────────────────────────

/**
 * Six-agent pipeline for comprehensive presentation generation.
 *
 * Multi-agent trail for creating professional presentations with structured
 * content, visual design, and speaker notes.
 *
 * Agent execution order:
 *  1. Planejador         — analyzes topic, audience and creates outline with budget estimate
 *  2. Pesquisador        — gathers and organizes relevant content from sources
 *  3. Redator de Slides  — writes slide content, titles, bullet points and speaker notes
 *  4. Designer Visual    — creates visual layout, color schemes, chart specs and slide-by-slide image briefs
 *  5. Revisor Final      — quality-checks slides for consistency, flow and completeness
 *  6. Gerador de Imagens — materializes slide visuals with an image-capable model
 */
export const PRESENTATION_PIPELINE_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'presentation_pipeline_orchestrator',
    label: 'Orquestrador do Pipeline',
    description: 'Controla retries, retomadas, validações JSON, fallbacks visuais e continuidade operacional do gerador de apresentações',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'activity',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Agente operacional: use um modelo de texto confiável para supervisionar retries, validações JSON e continuidade sem gerar conteúdo final.',
  },
  {
    key: 'pres_planejador',
    label: 'Planejador de Apresentação',
    description: 'Analisa tema, público-alvo e cria estrutura detalhada com estimativa de custos em tokens',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'clipboard-check',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Premium: Claude Sonnet ($3), GPT-4o ($2.50), GPT-4.1 ($2), Gemini 2.5 Pro ($1.25). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), Llama 4 Maverick ($0.19), Qwen 2.5 72B ($0.13). Grátis: Gemini 2.0 Flash:free, DeepSeek R1:free, Llama 3.3 70B:free.',
  },
  {
    key: 'pres_pesquisador',
    label: 'Pesquisador de Conteúdo',
    description: 'Busca e organiza conteúdo relevante das fontes para a apresentação',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
    requiredCapability: 'text',
    bestModelNote: 'Modelo rápido. Premium: Claude Haiku ($0.80), GPT-4o Mini ($0.15). Baratos: Gemini 2.0 Flash ($0.10), GPT-4.1 Nano ($0.10), Mistral Small ($0.10), Llama 4 Scout ($0.17), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 4 Scout:free, Mistral Small:free, Qwen3 8B:free.',
  },
  {
    key: 'pres_redator',
    label: 'Redator de Slides',
    description: 'Escreve conteúdo dos slides com títulos, tópicos, dados e notas do apresentador',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'file-text',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Requer boa escrita. Premium: Claude Sonnet ($3), GPT-4.1 ($2), GPT-4o ($2.50). Baratos: DeepSeek V3 ($0.27), Llama 4 Maverick ($0.19), Gemini 2.5 Flash ($0.15), Qwen 2.5 72B ($0.13), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'pres_designer',
    label: 'Designer de Apresentação',
    description: 'Cria o plano visual dos slides, com direção de layout, contraste e briefings específicos para cada imagem',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'pen-tool',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Produz diretrizes visuais e especificações de layout em JSON. Prefira modelos de texto com boa estruturação de conteúdo.',
  },
  {
    key: 'pres_image_generator',
    label: 'Gerador de Imagens de Slides',
    description: 'Gera imagens reais para os slides a partir das diretrizes visuais aprovadas no pipeline',
    defaultModel: 'google/gemini-2.5-flash-preview:image-output',
    recommendedTier: 'balanced',
    icon: 'image-plus',
    agentCategory: 'synthesis',
    requiredCapability: 'image',
    bestModelNote: 'Gera imagens reais para os slides. Gemini Flash Image oferece boa relação custo/velocidade; Flux 1.1 Pro e Imagen atendem quando a qualidade visual é prioritária.',
  },
  {
    key: 'pres_revisor',
    label: 'Revisor de Apresentação',
    description: 'Verifica consistência, fluxo narrativo e completude de todos os slides',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'clipboard-check',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Modelo rápido para revisão. Premium: Claude Haiku ($0.80), GPT-4o Mini ($0.15). Baratos: Gemini 2.0 Flash ($0.10), GPT-4.1 Nano ($0.10), Mistral Small ($0.10), Llama 4 Scout ($0.17), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 4 Scout:free, Mistral Small:free, Qwen3 30B:free.',
  },
]

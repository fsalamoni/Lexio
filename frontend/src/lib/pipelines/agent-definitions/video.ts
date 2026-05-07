import type { AgentModelDef } from '../../model-config'

// ── Video Pipeline Agent Definitions ─────────────────────────────────────────

/**
 * Eight-agent pipeline for comprehensive video generation.
 *
 * This is a multi-agent trail that takes the user through a complete video
 * production workflow: from planning and budgeting to scene-by-scene generation.
 *
 * Agent execution order:
 *  1. Planejador        — reads user options, creates production proposal with budget estimate
 *  2. Roteirista        — writes the full screenplay with dialogue, narration and directions
 *  3. Diretor de Cena   — breaks the script into detailed scene descriptions with timing
 *  4. Storyboarder      — creates visual descriptions for each scene frame-by-frame
 *  5. Designer Visual   — generates image prompts / visual assets for each scene (requires image capability)
 *  6. Compositor        — assembles scenes into a final video timeline with transitions
 *  7. Narrador          — generates narration/voice-over script with timing marks (requires audio capability)
 *  8. Revisor Final     — quality-checks the complete production package before rendering
 *
 * The pipeline supports videos of 15+ minutes by intelligently splitting into
 * segments. The Planejador agent estimates token costs before user approval.
 */
export const VIDEO_PIPELINE_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'video_pipeline_orchestrator',
    label: 'Orquestrador do Pipeline',
    description: 'Controla retries, retomadas, checkpoints, fallbacks e continuidade operacional do gerador de vídeo',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'activity',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Agente operacional: use um modelo de texto confiável para supervisionar retries, retomadas, checkpoints e continuidade sem gerar conteúdo final.',
  },
  {
    key: 'video_planejador',
    label: 'Planejador de Produção',
    description: 'Analisa opções do usuário (formato, qualidade, duração, FPS) e cria proposta detalhada com estimativa de custos em tokens',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'clipboard-check',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Premium: Claude Sonnet ($3), GPT-4o ($2.50), GPT-4.1 ($2), Gemini 2.5 Pro ($1.25). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), Llama 4 Maverick ($0.19), Qwen 2.5 72B ($0.13). Grátis: Gemini 2.0 Flash:free, DeepSeek R1:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'video_roteirista',
    label: 'Roteirista',
    description: 'Escreve o roteiro completo com diálogos, narração, direções de câmera e notas de produção',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'file-text',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Requer boa escrita criativa. Premium: Claude Sonnet ($3), GPT-4.1 ($2), GPT-4o ($2.50). Baratos: DeepSeek V3 ($0.27), Llama 4 Maverick ($0.19), Gemini 2.5 Flash ($0.15), Qwen 2.5 72B ($0.13), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'video_diretor_cena',
    label: 'Diretor de Cenas',
    description: 'Divide o roteiro em cenas detalhadas com temporização, transições e instruções técnicas',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'layers',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Precisa estruturar JSON. Premium: Claude Sonnet ($3), GPT-4.1 ($2). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), GPT-4.1 Mini ($0.40), Llama 4 Maverick ($0.19), Qwen 2.5 72B ($0.13). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'video_storyboarder',
    label: 'Storyboarder',
    description: 'Cria descrições visuais detalhadas frame-a-frame para cada cena do vídeo',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'pen-tool',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Requer boa descrição visual. Premium: Claude Sonnet ($3), GPT-4.1 ($2), GPT-4o ($2.50). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), Llama 4 Maverick ($0.19), Qwen 2.5 72B ($0.13), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'video_designer',
    label: 'Designer Visual',
    description: 'Gera imagens e assets visuais para cada cena do vídeo a partir dos prompts do storyboard',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'image',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Produz prompts e diretrizes visuais em JSON. Prefira modelos de texto fortes em estruturação e descrição visual.',
  },
  {
    key: 'video_compositor',
    label: 'Compositor de Vídeo',
    description: 'Monta a timeline final do vídeo com transições, efeitos e sincronização de cenas',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'video',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Monta timeline e estrutura técnica em JSON. Prefira modelos de texto confiáveis para planejamento e composição.',
  },
  {
    key: 'video_narrador',
    label: 'Narrador',
    description: 'Gera a narração/voice-over com entonação e timing sincronizado com as cenas',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'mic',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Produz script de narração e marcações de timing em JSON. Prefira modelos de texto com boa escrita e consistência.',
  },
  {
    key: 'video_revisor',
    label: 'Revisor Final de Vídeo',
    description: 'Verifica qualidade, coerência e completude do pacote de produção antes da renderização',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'clipboard-check',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Revisão de qualidade. Premium: Claude Sonnet ($3), GPT-4.1 ($2). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), GPT-4.1 Mini ($0.40), Qwen 2.5 72B ($0.13), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free, Mistral Small:free.',
  },
  {
    key: 'video_clip_planner',
    label: 'Planejador de Clips',
    description: 'Subdivide cada cena em clips de vídeo sequenciais (~8s cada) com prompts de imagem detalhados para cada momento, mantendo continuidade visual',
    defaultModel: 'google/gemini-2.5-flash-preview',
    recommendedTier: 'balanced',
    icon: 'film',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Chamado uma vez por cena. Precisa gerar prompts visuais detalhados. Baratos e rápidos: Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), DeepSeek V3 ($0.27). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'video_image_generator',
    label: 'Gerador de Imagens',
    description: 'Gera imagens reais para cada cena do vídeo usando IA generativa (modalities: image)',
    defaultModel: 'google/gemini-2.5-flash-preview:image-output',
    recommendedTier: 'balanced',
    icon: 'image-plus',
    agentCategory: 'synthesis',
    requiredCapability: 'image',
    bestModelNote: 'Gera imagens reais. Gemini Flash Image (barato, rápido), Flux 1.1 Pro (qualidade premium, $0.03/imagem), Flux Schnell (rápido).',
  },
  {
    key: 'video_tts',
    label: 'Narrador TTS',
    description: 'Converte texto de narração em áudio real usando Text-to-Speech via OpenRouter',
    defaultModel: 'openai/tts-1-hd',
    recommendedTier: 'premium',
    icon: 'volume-2',
    agentCategory: 'synthesis',
    requiredCapability: 'audio',
    bestModelNote: 'TTS HD: qualidade premium ($0.015/1K chars). TTS Standard: rápido ($0.015/1K chars). Vozes: nova, alloy, echo, fable, onyx, shimmer.',
  },
]

/** Default TTS voice for video narration */
export const DEFAULT_VIDEO_TTS_VOICE = 'nova'

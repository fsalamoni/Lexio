/**
 * Multi-provider registry — central catalog of every AI provider supported by Lexio.
 *
 * Architecture:
 *  - OpenRouter is the historical default (`providerId: 'openrouter'`).
 *  - Every other provider entry describes how to talk to that provider directly
 *    from the browser (base URL, auth header, payload dialect, list endpoint),
 *    so a model whose `providerId` points at it can be dispatched without going
 *    through OpenRouter.
 *  - Providers can be enabled / disabled per user via Firestore
 *    `/users/{uid}/settings/preferences.provider_settings[providerId]`.
 *  - The user's personal model catalog aggregates models from every enabled
 *    provider; each model retains its own pricing, capabilities and tier.
 *
 * Adding a new provider here is enough to make it available across the
 * platform: API key card, per-provider catalog card and routing in
 * `llm-client.ts` all read from this module.
 */

export type ProviderId =
  | 'openrouter'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'deepseek'
  | 'kimi'
  | 'qwen'
  | 'groq'
  | 'mistral'
  | 'xai'
  | 'cohere'
  | 'together'
  | 'fireworks'
  | 'perplexity'
  | 'ollama'
  | 'elevenlabs'

/**
 * Payload dialect understood by the underlying API. Most providers in the
 * market expose an OpenAI-compatible chat completions endpoint, so the same
 * request body works. Anthropic uses its own /v1/messages format; ElevenLabs
 * is audio-only; Ollama mirrors OpenAI's chat API on port 11434.
 */
export type ProviderDialect =
  | 'openai-compatible' // POST chat/completions, OpenAI body
  | 'anthropic'         // POST v1/messages, Anthropic body
  | 'openrouter'        // POST openrouter chat/completions
  | 'audio-only'        // ElevenLabs / dedicated TTS providers
  | 'ollama'            // local ollama daemon

export type ProviderCapability = 'text' | 'image' | 'audio' | 'video'

export interface ProviderDefinition {
  id: ProviderId
  /** Human-friendly label used everywhere in the UI. */
  label: string
  /** Color tag used by chips/badges (Tailwind-friendly utility). */
  color: string
  /** Short description shown next to the API key field. */
  description: string
  /** Where the user gets a key. */
  consoleUrl: string
  /** Optional shape hint for the API key (helps validation messages). */
  keyPrefix?: string
  /** Step-by-step guide displayed in the provider key card. */
  guide: string[]
  /** Endpoint dialect — controls which low-level transport is used. */
  dialect: ProviderDialect
  /**
   * Base URL for chat completions / messages.
   * For openai-compatible it's the host root (we append /chat/completions).
   * For anthropic it's the host root (we append /v1/messages).
   * For openrouter it's the host (we append /api/v1/chat/completions).
   */
  baseUrl: string
  /**
   * Endpoint that lists available models. Empty string means "no remote
   * listing — use the provider's static catalog only".
   */
  modelsListUrl: string
  /**
   * Hint passed to listing/normalization heuristics: what payload shape does
   * the /models response use? Most providers follow OpenAI's `{ data: [...] }`.
   */
  modelsListShape: 'openai' | 'anthropic' | 'openrouter' | 'ollama' | 'static'
  /** Capabilities advertised by the provider as a whole (used for filtering). */
  capabilities: ProviderCapability[]
  /**
   * Whether this provider's keys MUST be carried in the browser. We tag
   * Anthropic/OpenAI with `requiresDangerousBrowserHeader` so the client
   * adds the appropriate "I know this is risky" header.
   */
  requiresDangerousBrowserHeader?: boolean
  /** Header name that holds the bearer / api-key value. */
  authHeader?: string
  /** Function that formats the auth header value from a raw key. */
  authPrefix?: string
  /**
   * Static fallback list of well-known models. Used when the provider does
   * not expose a `/models` endpoint, when the call fails, or when the user
   * runs the app offline. Each entry must include id + label; the catalog
   * card enriches them with tier/capability/cost heuristics.
   */
  staticModels: ProviderStaticModel[]
}

export interface ProviderStaticModel {
  id: string
  label: string
  description?: string
  contextWindow?: number
  inputCost?: number
  outputCost?: number
  isFree?: boolean
  capabilities?: ProviderCapability[]
  tier?: 'fast' | 'balanced' | 'premium'
}

// ── Registry ────────────────────────────────────────────────────────────────

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    color: 'bg-indigo-100 text-indigo-700',
    description: 'Roteador unificado com centenas de modelos (Claude, GPT, Gemini, Llama…).',
    consoleUrl: 'https://openrouter.ai/settings/keys',
    keyPrefix: 'sk-or-v1-',
    guide: [
      'Crie uma conta em openrouter.ai',
      'Vá em Settings → Keys',
      'Crie uma nova chave e cole aqui',
    ],
    dialect: 'openrouter',
    baseUrl: 'https://openrouter.ai',
    modelsListUrl: 'https://openrouter.ai/api/v1/models',
    modelsListShape: 'openrouter',
    capabilities: ['text', 'image', 'audio'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    staticModels: [],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    color: 'bg-orange-100 text-orange-700',
    description: 'Família Claude direto da Anthropic — Sonnet, Opus, Haiku.',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-',
    guide: [
      'Crie uma conta em console.anthropic.com',
      'Acesse Settings → API Keys → Create Key',
      'Copie a chave (sk-ant-...) e cole aqui',
    ],
    dialect: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    modelsListUrl: 'https://api.anthropic.com/v1/models',
    modelsListShape: 'anthropic',
    capabilities: ['text', 'image'],
    requiresDangerousBrowserHeader: true,
    authHeader: 'x-api-key',
    authPrefix: '',
    staticModels: [
      { id: 'claude-opus-4-7-20250514', label: 'Claude Opus 4.7', tier: 'premium', contextWindow: 200_000, inputCost: 15, outputCost: 75 },
      { id: 'claude-sonnet-4-6-20250514', label: 'Claude Sonnet 4.6', tier: 'balanced', contextWindow: 200_000, inputCost: 3, outputCost: 15 },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', tier: 'fast', contextWindow: 200_000, inputCost: 0.8, outputCost: 4 },
      { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet', tier: 'balanced', contextWindow: 200_000, inputCost: 3, outputCost: 15 },
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku', tier: 'fast', contextWindow: 200_000, inputCost: 0.8, outputCost: 4 },
    ],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    color: 'bg-emerald-100 text-emerald-700',
    description: 'GPT-4.1, o-series, GPT-4o e modelos de imagem/áudio direto da OpenAI.',
    consoleUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-',
    guide: [
      'Crie uma conta em platform.openai.com',
      'Acesse API Keys → Create new secret key',
      'Copie a chave (sk-...) e cole aqui',
    ],
    dialect: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    modelsListUrl: 'https://api.openai.com/v1/models',
    modelsListShape: 'openai',
    capabilities: ['text', 'image', 'audio'],
    requiresDangerousBrowserHeader: true,
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    staticModels: [
      { id: 'gpt-4.1', label: 'GPT-4.1', tier: 'premium', contextWindow: 1_000_000, inputCost: 2, outputCost: 8 },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', tier: 'fast', contextWindow: 1_000_000, inputCost: 0.4, outputCost: 1.6 },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', tier: 'fast', contextWindow: 1_000_000, inputCost: 0.1, outputCost: 0.4 },
      { id: 'gpt-4o', label: 'GPT-4o', tier: 'balanced', contextWindow: 128_000, inputCost: 2.5, outputCost: 10 },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini', tier: 'fast', contextWindow: 128_000, inputCost: 0.15, outputCost: 0.6 },
      { id: 'o3', label: 'o3', tier: 'premium', contextWindow: 200_000, inputCost: 10, outputCost: 40 },
      { id: 'o4-mini', label: 'o4-mini', tier: 'balanced', contextWindow: 200_000, inputCost: 1.1, outputCost: 4.4 },
      { id: 'gpt-image-1', label: 'GPT Image 1', tier: 'balanced', capabilities: ['image'] },
      { id: 'tts-1-hd', label: 'TTS 1 HD', tier: 'balanced', capabilities: ['audio'] },
      { id: 'tts-1', label: 'TTS 1', tier: 'fast', capabilities: ['audio'] },
    ],
  },
  google: {
    id: 'google',
    label: 'Google AI',
    color: 'bg-blue-100 text-blue-700',
    description: 'Gemini 2.5 Pro/Flash via Google AI Studio (Generative Language API).',
    consoleUrl: 'https://aistudio.google.com/apikey',
    keyPrefix: 'AIza',
    guide: [
      'Acesse aistudio.google.com/apikey',
      'Clique em "Create API key"',
      'Copie a chave e cole aqui',
    ],
    // Google's API has a slight twist (key as query param) but is OpenAI-compat
    // when consumed via the openai-compatibility endpoint:
    // https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
    dialect: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelsListUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
    modelsListShape: 'openai',
    capabilities: ['text', 'image'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    staticModels: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'premium', contextWindow: 1_000_000, inputCost: 1.25, outputCost: 10 },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'balanced', contextWindow: 1_000_000, inputCost: 0.3, outputCost: 2.5 },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', tier: 'fast', contextWindow: 1_000_000, inputCost: 0.1, outputCost: 0.4 },
    ],
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    color: 'bg-sky-100 text-sky-700',
    description: 'DeepSeek Chat V3 e R1 — alto desempenho a baixo custo.',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    keyPrefix: 'sk-',
    guide: [
      'Crie uma conta em platform.deepseek.com',
      'Acesse API Keys → Create',
      'Copie a chave (sk-...) e cole aqui',
    ],
    dialect: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    modelsListUrl: 'https://api.deepseek.com/v1/models',
    modelsListShape: 'openai',
    capabilities: ['text'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    staticModels: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat V3', tier: 'balanced', contextWindow: 64_000, inputCost: 0.27, outputCost: 1.10 },
      { id: 'deepseek-reasoner', label: 'DeepSeek R1', tier: 'balanced', contextWindow: 64_000, inputCost: 0.55, outputCost: 2.19 },
    ],
  },
  kimi: {
    id: 'kimi',
    label: 'Kimi (Moonshot)',
    color: 'bg-cyan-100 text-cyan-700',
    description: 'Moonshot Kimi K-series — contexto longo, OpenAI-compatible.',
    consoleUrl: 'https://platform.moonshot.cn/console/api-keys',
    keyPrefix: 'sk-',
    guide: [
      'Crie uma conta em platform.moonshot.cn',
      'Acesse Console → API Keys',
      'Copie a chave e cole aqui',
    ],
    dialect: 'openai-compatible',
    baseUrl: 'https://api.moonshot.ai/v1',
    modelsListUrl: 'https://api.moonshot.ai/v1/models',
    modelsListShape: 'openai',
    capabilities: ['text'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    staticModels: [
      { id: 'moonshot-v1-128k', label: 'Kimi 128K', tier: 'balanced', contextWindow: 128_000 },
      { id: 'moonshot-v1-32k', label: 'Kimi 32K', tier: 'fast', contextWindow: 32_000 },
      { id: 'kimi-k2-instruct', label: 'Kimi K2 Instruct', tier: 'premium', contextWindow: 200_000 },
    ],
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen (Alibaba)',
    color: 'bg-violet-100 text-violet-700',
    description: 'Qwen 3 / Qwen 2.5 via DashScope (compatibility mode).',
    consoleUrl: 'https://dashscope.console.aliyun.com/apiKey',
    keyPrefix: 'sk-',
    guide: [
      'Crie uma conta em dashscope.aliyun.com',
      'Acesse API Keys → Create',
      'Copie a chave e cole aqui',
    ],
    dialect: 'openai-compatible',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    modelsListUrl: '',
    modelsListShape: 'static',
    capabilities: ['text'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    staticModels: [
      { id: 'qwen-max', label: 'Qwen Max', tier: 'premium', contextWindow: 32_000 },
      { id: 'qwen-plus', label: 'Qwen Plus', tier: 'balanced', contextWindow: 131_000 },
      { id: 'qwen-turbo', label: 'Qwen Turbo', tier: 'fast', contextWindow: 1_000_000 },
      { id: 'qwen3-235b-a22b', label: 'Qwen3 235B', tier: 'premium', contextWindow: 128_000 },
      { id: 'qwen3-30b-a3b', label: 'Qwen3 30B', tier: 'balanced', contextWindow: 128_000 },
    ],
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    color: 'bg-rose-100 text-rose-700',
    description: 'Inferência ultra-rápida em LPU — Llama, Mixtral, Gemma, Qwen.',
    consoleUrl: 'https://console.groq.com/keys',
    keyPrefix: 'gsk_',
    guide: [
      'Crie uma conta em console.groq.com',
      'Acesse API Keys → Create API Key',
      'Copie a chave (gsk_...) e cole aqui',
    ],
    dialect: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelsListUrl: 'https://api.groq.com/openai/v1/models',
    modelsListShape: 'openai',
    capabilities: ['text', 'audio'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    staticModels: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', tier: 'balanced', contextWindow: 128_000 },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', tier: 'fast', contextWindow: 128_000 },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', tier: 'balanced', contextWindow: 32_768 },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B', tier: 'fast', contextWindow: 8_192 },
      { id: 'qwen/qwen3-32b', label: 'Qwen3 32B', tier: 'balanced', contextWindow: 131_000 },
    ],
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    color: 'bg-amber-100 text-amber-700',
    description: 'Mistral Large/Small/Nemo direto da Mistral AI.',
    consoleUrl: 'https://console.mistral.ai/api-keys',
    keyPrefix: '',
    guide: [
      'Crie uma conta em console.mistral.ai',
      'Acesse API Keys → Create new key',
      'Copie a chave e cole aqui',
    ],
    dialect: 'openai-compatible',
    baseUrl: 'https://api.mistral.ai/v1',
    modelsListUrl: 'https://api.mistral.ai/v1/models',
    modelsListShape: 'openai',
    capabilities: ['text'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    staticModels: [
      { id: 'mistral-large-latest', label: 'Mistral Large', tier: 'premium', contextWindow: 128_000 },
      { id: 'mistral-small-latest', label: 'Mistral Small', tier: 'fast', contextWindow: 128_000 },
      { id: 'open-mistral-nemo', label: 'Mistral Nemo', tier: 'fast', contextWindow: 128_000 },
    ],
  },
  xai: {
    id: 'xai',
    label: 'xAI',
    color: 'bg-slate-100 text-slate-700',
    description: 'Grok 3/4 direto da xAI.',
    consoleUrl: 'https://console.x.ai',
    keyPrefix: 'xai-',
    guide: [
      'Crie uma conta em console.x.ai',
      'Acesse API Keys → Create',
      'Copie a chave (xai-...) e cole aqui',
    ],
    dialect: 'openai-compatible',
    baseUrl: 'https://api.x.ai/v1',
    modelsListUrl: 'https://api.x.ai/v1/models',
    modelsListShape: 'openai',
    capabilities: ['text', 'image'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    staticModels: [
      { id: 'grok-4', label: 'Grok 4', tier: 'premium', contextWindow: 256_000 },
      { id: 'grok-3', label: 'Grok 3', tier: 'premium', contextWindow: 131_000 },
      { id: 'grok-3-mini', label: 'Grok 3 Mini', tier: 'fast', contextWindow: 131_000 },
    ],
  },
  cohere: {
    id: 'cohere',
    label: 'Cohere',
    color: 'bg-lime-100 text-lime-700',
    description: 'Command R+, Command A — RAG e síntese.',
    consoleUrl: 'https://dashboard.cohere.com/api-keys',
    keyPrefix: '',
    guide: [
      'Crie uma conta em dashboard.cohere.com',
      'Acesse API Keys → Create',
      'Copie a chave e cole aqui',
    ],
    dialect: 'openai-compatible',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    modelsListUrl: '',
    modelsListShape: 'static',
    capabilities: ['text'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    staticModels: [
      { id: 'command-a-03-2025', label: 'Command A', tier: 'premium', contextWindow: 256_000 },
      { id: 'command-r-plus-08-2024', label: 'Command R+', tier: 'balanced', contextWindow: 128_000 },
      { id: 'command-r-08-2024', label: 'Command R', tier: 'fast', contextWindow: 128_000 },
    ],
  },
  together: {
    id: 'together',
    label: 'Together AI',
    color: 'bg-pink-100 text-pink-700',
    description: 'Hospedagem aberta de Llama, Qwen, DeepSeek, Mixtral.',
    consoleUrl: 'https://api.together.xyz/settings/api-keys',
    keyPrefix: '',
    guide: [
      'Crie uma conta em together.ai',
      'Acesse API Keys → Create',
      'Copie a chave e cole aqui',
    ],
    dialect: 'openai-compatible',
    baseUrl: 'https://api.together.xyz/v1',
    modelsListUrl: 'https://api.together.xyz/v1/models',
    modelsListShape: 'openai',
    capabilities: ['text', 'image'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    staticModels: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo', tier: 'balanced' },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B Turbo', tier: 'balanced' },
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3', tier: 'balanced' },
    ],
  },
  fireworks: {
    id: 'fireworks',
    label: 'Fireworks AI',
    color: 'bg-orange-100 text-orange-700',
    description: 'Modelos open-source servidos rapidamente.',
    consoleUrl: 'https://fireworks.ai/account/api-keys',
    keyPrefix: 'fw_',
    guide: [
      'Crie uma conta em fireworks.ai',
      'Acesse API Keys → Create',
      'Copie a chave (fw_...) e cole aqui',
    ],
    dialect: 'openai-compatible',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    modelsListUrl: 'https://api.fireworks.ai/inference/v1/models',
    modelsListShape: 'openai',
    capabilities: ['text', 'image'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    staticModels: [
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', label: 'Llama 3.3 70B', tier: 'balanced' },
      { id: 'accounts/fireworks/models/deepseek-v3', label: 'DeepSeek V3', tier: 'balanced' },
    ],
  },
  perplexity: {
    id: 'perplexity',
    label: 'Perplexity',
    color: 'bg-teal-100 text-teal-700',
    description: 'Sonar com pesquisa web em tempo real.',
    consoleUrl: 'https://www.perplexity.ai/settings/api',
    keyPrefix: 'pplx-',
    guide: [
      'Crie uma conta em perplexity.ai',
      'Acesse Settings → API',
      'Copie a chave (pplx-...) e cole aqui',
    ],
    dialect: 'openai-compatible',
    baseUrl: 'https://api.perplexity.ai',
    modelsListUrl: '',
    modelsListShape: 'static',
    capabilities: ['text'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    staticModels: [
      { id: 'sonar-pro', label: 'Sonar Pro', tier: 'premium' },
      { id: 'sonar', label: 'Sonar', tier: 'balanced' },
      { id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro', tier: 'premium' },
    ],
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    color: 'bg-zinc-100 text-zinc-700',
    description: 'Modelos rodando localmente em http://localhost:11434.',
    consoleUrl: 'https://ollama.com/download',
    keyPrefix: '',
    guide: [
      'Instale o Ollama em ollama.com/download',
      'Rode "ollama serve" no terminal',
      'Cole a URL do servidor (geralmente http://localhost:11434)',
    ],
    dialect: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    modelsListUrl: 'http://localhost:11434/api/tags',
    modelsListShape: 'ollama',
    capabilities: ['text'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    staticModels: [
      { id: 'llama3.2', label: 'Llama 3.2', tier: 'balanced' },
      { id: 'qwen2.5:14b', label: 'Qwen 2.5 14B', tier: 'balanced' },
      { id: 'mistral', label: 'Mistral', tier: 'fast' },
    ],
  },
  elevenlabs: {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    color: 'bg-purple-100 text-purple-700',
    description: 'TTS multilíngue — vozes naturais para áudio e vídeo.',
    consoleUrl: 'https://elevenlabs.io/app/settings/api-keys',
    keyPrefix: '',
    guide: [
      'Crie uma conta em elevenlabs.io',
      'Acesse Settings → API Keys',
      'Copie a chave e cole aqui',
    ],
    dialect: 'audio-only',
    baseUrl: 'https://api.elevenlabs.io/v1',
    modelsListUrl: 'https://api.elevenlabs.io/v1/models',
    modelsListShape: 'static',
    capabilities: ['audio'],
    authHeader: 'xi-api-key',
    authPrefix: '',
    staticModels: [
      { id: 'eleven_multilingual_v2', label: 'Eleven Multilingual v2', tier: 'premium', capabilities: ['audio'] },
      { id: 'eleven_turbo_v2_5', label: 'Eleven Turbo v2.5', tier: 'fast', capabilities: ['audio'] },
      { id: 'eleven_flash_v2_5', label: 'Eleven Flash v2.5', tier: 'fast', capabilities: ['audio'] },
    ],
  },
}

/** Ordered list used by the Admin UI when rendering provider cards. */
export const PROVIDER_ORDER: ProviderId[] = [
  'openrouter',
  'anthropic',
  'openai',
  'google',
  'deepseek',
  'kimi',
  'qwen',
  'groq',
  'mistral',
  'xai',
  'cohere',
  'together',
  'fireworks',
  'perplexity',
  'ollama',
  'elevenlabs',
]

export function getProvider(id: ProviderId): ProviderDefinition {
  return PROVIDERS[id]
}

/** Map "human" provider label (e.g. "Anthropic") back to a provider id. */
export function providerIdFromLabel(label: string): ProviderId | null {
  const lower = label.toLowerCase()
  for (const def of Object.values(PROVIDERS)) {
    if (def.label.toLowerCase() === lower) return def.id
    if (def.id === lower) return def.id
  }
  return null
}

/** Stable key inside `api_keys` for a given provider. */
export function apiKeyFieldForProvider(id: ProviderId): string {
  if (id === 'openrouter') return 'openrouter_api_key' // historical name kept for compat
  return `${id}_api_key`
}

/** Stable key inside `provider_settings` for a given provider. */
export function providerSettingsKey(id: ProviderId): string {
  return id
}

import type { AgentModelDef } from '../../model-config'

// ── Audio Pipeline Agent Definitions ─────────────────────────────────────────

/**
 * Six-agent pipeline for comprehensive audio generation.
 *
 * Similar to the video pipeline, this trail guides production of professional
 * audio content (podcasts, narrations, audiobooks) from planning to final mix.
 *
 * Agent execution order:
 *  1. Planejador        — analyzes user options, creates production proposal with budget
 *  2. Roteirista        — writes the full audio script with narration, pauses, and cues
 *  3. Diretor de Áudio  — structures the script into segments with timing and transitions
 *  4. Produtor Sonoro   — generates sound design notes, music cues and ambient descriptions
 *  5. Narrador          — generates the actual audio/voice-over (requires audio capability)
 *  6. Revisor Final     — quality-checks the complete audio production package
 */
export const AUDIO_PIPELINE_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'audio_pipeline_orchestrator',
    label: 'Orquestrador do Pipeline',
    description: 'Controla retries, retomadas, validações JSON e continuidade operacional do gerador de áudio',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'activity',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Agente operacional: use um modelo de texto confiável para supervisionar retries, validações e continuidade sem gerar conteúdo final.',
  },
  {
    key: 'audio_planejador',
    label: 'Planejador de Áudio',
    description: 'Analisa opções do usuário (formato, duração, estilo, tom) e cria proposta com estimativa de custos',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'clipboard-check',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Premium: Claude Sonnet ($3), GPT-4o ($2.50), GPT-4.1 ($2), Gemini 2.5 Pro ($1.25). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), Llama 4 Maverick ($0.19), Qwen 2.5 72B ($0.13). Grátis: Gemini 2.0 Flash:free, DeepSeek R1:free, Llama 3.3 70B:free.',
  },
  {
    key: 'audio_roteirista',
    label: 'Roteirista de Áudio',
    description: 'Escreve o roteiro completo com narração, pausas, entonações e indicações de produção',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'file-text',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Requer boa escrita. Premium: Claude Sonnet ($3), GPT-4.1 ($2), GPT-4o ($2.50). Baratos: DeepSeek V3 ($0.27), Llama 4 Maverick ($0.19), Gemini 2.5 Flash ($0.15), Qwen 2.5 72B ($0.13), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'audio_diretor',
    label: 'Diretor de Áudio',
    description: 'Estrutura o roteiro em segmentos com temporização, transições e marcações técnicas',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'layers',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Estruturação em JSON. Premium: Claude Sonnet ($3), GPT-4.1 ($2). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), GPT-4.1 Mini ($0.40), Llama 4 Maverick ($0.19), Qwen 2.5 72B ($0.13). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'audio_produtor_sonoro',
    label: 'Produtor Sonoro',
    description: 'Cria notas de design sonoro, trilha musical, efeitos e descrições de ambientação',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'music',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Escrita criativa de descrições sonoras. Premium: Claude Sonnet ($3), GPT-4.1 ($2), GPT-4o ($2.50). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), Llama 4 Maverick ($0.19), Qwen 2.5 72B ($0.13), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free.',
  },
  {
    key: 'audio_narrador',
    label: 'Narrador / TTS',
    description: 'Gera a narração de áudio real com entonações e pausas a partir do roteiro',
    defaultModel: 'openai/tts-1-hd',
    recommendedTier: 'premium',
    icon: 'mic',
    agentCategory: 'synthesis',
    requiredCapability: 'audio',
    bestModelNote: 'Use um modelo TTS real. Padrão recomendado: OpenAI TTS HD para síntese final do áudio.',
  },
  {
    key: 'audio_revisor',
    label: 'Revisor Final de Áudio',
    description: 'Verifica qualidade, coerência e completude do pacote de produção de áudio',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'clipboard-check',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Revisão de qualidade. Premium: Claude Sonnet ($3), GPT-4.1 ($2). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), GPT-4.1 Mini ($0.40), Qwen 2.5 72B ($0.13), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Mistral Small:free.',
  },
]

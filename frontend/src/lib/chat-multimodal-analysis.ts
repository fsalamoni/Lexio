import { createUsageExecutionRecord, type UsageExecutionRecord } from './cost-analytics'
import {
  callLLMWithMessagesFallback,
  RELIABLE_TEXT_FALLBACK_MODEL,
  type ChatMessageContentPart,
  type ChatMessage,
  type LLMResult,
} from './llm-client'
import { resolveProviderCall } from './provider-credentials'
import type { ChatTrailEvent, ChatTurnAttachment, MultimodalModality, MultimodalPolicyConfig, ProviderSettingsMap } from './firestore-types'
import { extractChatVideoKeyframes, type ChatVideoKeyframe } from './chat-video-keyframes'
import {
  DEFAULT_MULTIMODAL_FILE_LIMIT_MB,
  DEFAULT_MULTIMODAL_MAX_ATTACHMENTS_PER_TURN,
  HARD_MULTIMODAL_MAX_ATTACHMENTS_PER_TURN,
  getMultimodalFileLimitBytes,
  getMultimodalModalityBlockReason,
  MULTIMODAL_MODALITY_LABELS,
  normalizeMultimodalPolicyConfig,
  selectMultimodalModelForPolicy,
} from './multimodal-policy'
import type { ModelOption } from './model-config'

export const DEFAULT_CHAT_IMAGE_ANALYSIS_MODEL = 'openai/gpt-4o-mini'
export const DEFAULT_CHAT_AUDIO_TRANSCRIPTION_MODEL = 'openai/gpt-4o-mini-transcribe'
export const CHAT_IMAGE_ANALYSIS_MAX_BYTES = DEFAULT_MULTIMODAL_FILE_LIMIT_MB.image * 1024 * 1024
export const CHAT_AUDIO_TRANSCRIPTION_MAX_BYTES = DEFAULT_MULTIMODAL_FILE_LIMIT_MB.audio * 1024 * 1024
export const CHAT_VIDEO_ANALYSIS_MAX_BYTES = DEFAULT_MULTIMODAL_FILE_LIMIT_MB.video * 1024 * 1024
export const MAX_CHAT_MULTIMODAL_TEXT_CHARS = 12_000
export const DEFAULT_CHAT_MULTIMODAL_MAX_ATTACHMENTS = DEFAULT_MULTIMODAL_MAX_ATTACHMENTS_PER_TURN
const HARD_CHAT_MULTIMODAL_MAX_ATTACHMENTS = HARD_MULTIMODAL_MAX_ATTACHMENTS_PER_TURN

export interface ChatAudioTranscriptionCallResult {
  text: string
  model: string
  provider_id?: string
  provider_label?: string
  cost_usd?: number
  duration_ms?: number
}

export interface ChatMultimodalAnalysisResult {
  attachment: ChatTurnAttachment
  usage?: UsageExecutionRecord
  usageRecords?: UsageExecutionRecord[]
  skipped?: boolean
  reason?: string
}

export interface AnalyzeChatMultimodalAttachmentArgs {
  file: File
  attachment: ChatTurnAttachment
  apiKey: string
  userInput: string
  model?: string
  fallbackModels?: string[]
  signal?: AbortSignal
  now?: string
  llmCall?: (args: {
    apiKey: string
    messages: ChatMessage[]
    model: string
    fallbackModels: string[]
    signal?: AbortSignal
  }) => Promise<LLMResult>
  audioTranscriptionModel?: string
  audioTranscriptionCall?: (args: {
    file: File
    attachment: ChatTurnAttachment
    model: string
    prompt: string
    signal?: AbortSignal
  }) => Promise<ChatAudioTranscriptionCallResult>
  videoFrameExtractor?: (file: File) => Promise<ChatVideoKeyframe[]>
  multimodalPolicy?: MultimodalPolicyConfig
  modelCatalog?: ModelOption[]
  providerSettings?: ProviderSettingsMap
}

export interface AnalyzeChatMultimodalAttachmentsArgs {
  attachments: ChatTurnAttachment[]
  attachmentFiles: Array<{ file: File; attachment: ChatTurnAttachment }>
  apiKey: string
  userInput: string
  model?: string
  fallbackModels?: string[]
  signal?: AbortSignal
  onTrail?: (event: ChatTrailEvent) => void
  now?: () => string
  llmCall?: AnalyzeChatMultimodalAttachmentArgs['llmCall']
  audioTranscriptionModel?: string
  audioTranscriptionCall?: AnalyzeChatMultimodalAttachmentArgs['audioTranscriptionCall']
  maxAnalyzedAttachments?: number
  multimodalPolicy?: MultimodalPolicyConfig
  modelCatalog?: ModelOption[]
  providerSettings?: ProviderSettingsMap
}

export interface AnalyzeChatMultimodalAttachmentsResult {
  attachments: ChatTurnAttachment[]
  usageRecords: UsageExecutionRecord[]
  changed: boolean
}

export async function analyzeChatMultimodalAttachments(
  args: AnalyzeChatMultimodalAttachmentsArgs,
): Promise<AnalyzeChatMultimodalAttachmentsResult> {
  const candidatesById = new Map(args.attachmentFiles.map(candidate => [candidate.attachment.attachment_id, candidate]))
  const usageRecords: UsageExecutionRecord[] = []
  const policy = normalizeMultimodalPolicyConfig(args.multimodalPolicy)
  const maxAnalyzedAttachments = normalizeMultimodalAttachmentLimit(
    args.maxAnalyzedAttachments ?? args.multimodalPolicy?.max_attachments_per_turn ?? readEnvMultimodalAttachmentLimit(),
  )
  let analyzedAttachments = 0
  let changed = false

  const attachments: ChatTurnAttachment[] = []
  for (const attachment of args.attachments) {
    const candidate = candidatesById.get(attachment.attachment_id)
    if (!candidate || !shouldAnalyzeAttachment(attachment)) {
      attachments.push(attachment)
      continue
    }

    const modality = attachmentKindToMultimodalModality(attachment.kind)
    const model = resolveAttachmentAnalysisModel(attachment, args.model, args.audioTranscriptionModel)
    const policyBlockReason = modality ? getMultimodalModalityBlockReason(policy, modality) : null
    if (modality && policyBlockReason) {
      const unsupported = withUnsupportedAnalysis(attachment, modality, policyBlockReason, args.now?.() ?? new Date().toISOString())
      attachments.push(unsupported)
      changed = true
      args.onTrail?.({
        type: 'multimodal_analysis_skipped',
        attachment_id: attachment.attachment_id,
        filename: attachment.filename,
        mode: attachment.extraction.mode,
        model,
        reason: policyBlockReason,
        ts: args.now?.() ?? new Date().toISOString(),
      })
      continue
    }

    if (analyzedAttachments >= maxAnalyzedAttachments) {
      args.onTrail?.({
        type: 'multimodal_analysis_skipped',
        attachment_id: attachment.attachment_id,
        filename: attachment.filename,
        mode: attachment.extraction.mode,
        model,
        reason: `Limite de ${maxAnalyzedAttachments} anexo(s) multimodais por turno atingido.`,
        ts: args.now?.() ?? new Date().toISOString(),
      })
      attachments.push(attachment)
      continue
    }

    const selection = modality
      ? selectMultimodalModelForPolicy({
          model,
          fallbackModels: args.fallbackModels,
          modality,
          policy,
          modelCatalog: args.modelCatalog,
          providerSettings: args.providerSettings,
        })
      : { model, fallbackModels: args.fallbackModels ?? [] }
    if ('blockedReason' in selection && selection.blockedReason && modality) {
      const unsupported = withUnsupportedAnalysis(attachment, modality, selection.blockedReason, args.now?.() ?? new Date().toISOString())
      attachments.push(unsupported)
      changed = true
      args.onTrail?.({
        type: 'multimodal_analysis_skipped',
        attachment_id: attachment.attachment_id,
        filename: attachment.filename,
        mode: attachment.extraction.mode,
        model,
        reason: selection.blockedReason,
        ts: args.now?.() ?? new Date().toISOString(),
      })
      continue
    }

    analyzedAttachments += 1
    args.onTrail?.({
      type: 'multimodal_analysis_started',
      attachment_id: attachment.attachment_id,
      filename: attachment.filename,
      mode: attachment.extraction.mode,
      model: selection.model,
      ts: args.now?.() ?? new Date().toISOString(),
    })

    try {
      const result = await analyzeChatMultimodalAttachment({
        file: candidate.file,
        attachment,
        apiKey: args.apiKey,
        userInput: args.userInput,
        model: selection.model,
        fallbackModels: selection.fallbackModels,
        signal: args.signal,
        now: args.now?.(),
        llmCall: args.llmCall,
        audioTranscriptionModel: args.audioTranscriptionModel,
        audioTranscriptionCall: args.audioTranscriptionCall,
        multimodalPolicy: policy,
        modelCatalog: args.modelCatalog,
        providerSettings: args.providerSettings,
      })
      attachments.push(result.attachment)
      changed = changed || result.attachment !== attachment
      if (result.usage) usageRecords.push(result.usage)
      if (result.usageRecords?.length) usageRecords.push(...result.usageRecords)
      if (result.skipped) {
        args.onTrail?.({
          type: 'multimodal_analysis_skipped',
          attachment_id: attachment.attachment_id,
          filename: attachment.filename,
          mode: result.attachment.extraction.mode,
          model: result.attachment.extraction.analysis_model ?? selection.model,
          reason: result.reason ?? result.attachment.extraction.error ?? 'Analise multimodal ignorada pela politica vigente.',
          ts: args.now?.() ?? new Date().toISOString(),
        })
      } else {
        args.onTrail?.({
          type: 'multimodal_analysis_completed',
          attachment_id: attachment.attachment_id,
          filename: attachment.filename,
          mode: result.attachment.extraction.mode,
          model: result.attachment.extraction.analysis_model ?? selection.model,
          status: result.attachment.extraction.status,
          usage: result.usage,
          ts: args.now?.() ?? new Date().toISOString(),
        })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      const message = error instanceof Error ? error.message : String(error)
      const failed = withFailedAnalysis(attachment, message, args.now?.() ?? new Date().toISOString())
      attachments.push(failed)
      changed = true
      args.onTrail?.({
        type: 'multimodal_analysis_failed',
        attachment_id: attachment.attachment_id,
        filename: attachment.filename,
        mode: attachment.extraction.mode,
        model,
        message,
        ts: args.now?.() ?? new Date().toISOString(),
      })
    }
  }

  return { attachments, usageRecords, changed }
}

export function resolveChatMultimodalMaxAttachments(rawValue?: string | number): number {
  return normalizeMultimodalAttachmentLimit(rawValue)
}

export async function analyzeChatMultimodalAttachment(
  args: AnalyzeChatMultimodalAttachmentArgs,
): Promise<ChatMultimodalAnalysisResult> {
  const modality = attachmentKindToMultimodalModality(args.attachment.kind)
  if (!modality) {
    return { attachment: args.attachment, skipped: true, reason: 'Somente imagens, áudios e vídeos são analisados nesta etapa multimodal.' }
  }
  const policy = normalizeMultimodalPolicyConfig(args.multimodalPolicy)
  const modalityBlockReason = getMultimodalModalityBlockReason(policy, modality)
  if (modalityBlockReason) {
    return {
      attachment: withUnsupportedAnalysis(args.attachment, modality, modalityBlockReason, args.now ?? new Date().toISOString()),
      skipped: true,
      reason: modalityBlockReason,
    }
  }

  if (args.attachment.kind === 'audio') return analyzeAudioAttachment(args)
  if (args.attachment.kind === 'video') return analyzeVideoAttachment(args)

  const maxImageBytes = getMultimodalFileLimitBytes(policy, 'image')
  if (args.file.size > maxImageBytes) {
    const maxImageMb = Math.round(maxImageBytes / 1024 / 1024)
    return {
      attachment: {
        ...args.attachment,
        extraction: {
          ...args.attachment.extraction,
          status: 'unsupported',
          mode: 'image',
          error: `Imagem acima do limite de ${maxImageMb} MB para análise multimodal automática.`,
          processed_at: args.now ?? new Date().toISOString(),
        },
      },
      skipped: true,
      reason: 'Imagem acima do limite para análise multimodal.',
    }
  }

  const model = args.model ?? DEFAULT_CHAT_IMAGE_ANALYSIS_MODEL
  const selection = selectMultimodalModelForPolicy({
    model,
    fallbackModels: normalizeFallbackModels(args.fallbackModels, model, 'image', args),
    modality: 'image',
    policy,
    modelCatalog: args.modelCatalog,
    providerSettings: args.providerSettings,
  })
  if (selection.blockedReason) {
    return {
      attachment: withUnsupportedAnalysis(args.attachment, 'image', selection.blockedReason, args.now ?? new Date().toISOString()),
      skipped: true,
      reason: selection.blockedReason,
    }
  }
  const dataUrl = await fileToImageDataUrl(args.file, args.attachment.mime_type)
  const messages = buildImageAnalysisMessages(args.attachment, args.userInput, dataUrl)
  const result = args.llmCall
    ? await args.llmCall({ apiKey: args.apiKey, messages, model: selection.model, fallbackModels: selection.fallbackModels, signal: args.signal })
    : await callLLMWithMessagesFallback(args.apiKey, messages, selection.model, selection.fallbackModels, 1600, 0.1, { signal: args.signal })
  const content = result.content.trim()
  if (!content) throw new Error('O modelo multimodal não retornou análise da imagem.')

  const text = normalizeAnalysisText(content)
  const truncated = text.length > MAX_CHAT_MULTIMODAL_TEXT_CHARS
  const processedAt = args.now ?? new Date().toISOString()
  const attachment: ChatTurnAttachment = {
    ...args.attachment,
    extraction: {
      ...args.attachment.extraction,
      status: truncated ? 'partial' : 'ready',
      mode: 'image',
      text_preview: truncated ? text.slice(0, MAX_CHAT_MULTIMODAL_TEXT_CHARS) : text,
      text_char_count: text.length,
      truncated,
      analysis_model: result.model,
      analysis_provider: result.provider_label ?? result.operational?.providerLabel,
      analysis_cost_usd: result.cost_usd,
      analysis_tokens_in: result.tokens_in,
      analysis_tokens_out: result.tokens_out,
      error: undefined,
      processed_at: processedAt,
    },
  }

  return {
    attachment,
    usage: createUsageExecutionRecord({
      source_type: 'chat_multimodal_analysis',
      source_id: args.attachment.attachment_id,
      created_at: processedAt,
      phase: 'chat_multimodal_analysis',
      agent_name: 'Analisador multimodal de anexos',
      model: result.model,
      provider_id: result.provider_id ?? result.operational?.providerId,
      provider_label: result.provider_label ?? result.operational?.providerLabel,
      requested_model: result.operational?.requestedModel ?? selection.model,
      resolved_model: result.operational?.resolvedModel ?? result.model,
      tokens_in: result.tokens_in,
      tokens_out: result.tokens_out,
      cost_usd: result.cost_usd,
      duration_ms: result.duration_ms,
      retry_count: result.operational?.totalRetryCount ?? null,
      used_fallback: result.operational?.fallbackUsed ?? null,
      fallback_from: result.operational?.fallbackFrom ?? null,
    }),
  }
}

async function analyzeAudioAttachment(args: AnalyzeChatMultimodalAttachmentArgs): Promise<ChatMultimodalAnalysisResult> {
  const policy = normalizeMultimodalPolicyConfig(args.multimodalPolicy)
  const maxAudioBytes = getMultimodalFileLimitBytes(policy, 'audio')
  if (args.file.size > maxAudioBytes) {
    const maxAudioMb = Math.round(maxAudioBytes / 1024 / 1024)
    return {
      attachment: {
        ...args.attachment,
        extraction: {
          ...args.attachment.extraction,
          status: 'unsupported',
          mode: 'audio',
          error: `Áudio acima do limite de ${maxAudioMb} MB para transcrição automática.`,
          processed_at: args.now ?? new Date().toISOString(),
        },
      },
      skipped: true,
      reason: 'Áudio acima do limite para transcrição automática.',
    }
  }

  const model = args.audioTranscriptionModel ?? readEnvAudioTranscriptionModel() ?? DEFAULT_CHAT_AUDIO_TRANSCRIPTION_MODEL
  const selection = selectMultimodalModelForPolicy({
    model,
    fallbackModels: [],
    modality: 'audio',
    policy,
    modelCatalog: args.modelCatalog,
    providerSettings: args.providerSettings,
  })
  if (selection.blockedReason) {
    return {
      attachment: withUnsupportedAnalysis(args.attachment, 'audio', selection.blockedReason, args.now ?? new Date().toISOString()),
      skipped: true,
      reason: selection.blockedReason,
    }
  }
  const prompt = buildAudioTranscriptionPrompt(args.attachment, args.userInput)
  const result = args.audioTranscriptionCall
    ? await args.audioTranscriptionCall({ file: args.file, attachment: args.attachment, model: selection.model, prompt, signal: args.signal })
    : await transcribeChatAudioWithProvider({ file: args.file, model: selection.model, prompt, signal: args.signal })
  const content = result.text.trim()
  if (!content) throw new Error('O transcritor de áudio não retornou texto.')

  const text = normalizeAnalysisText(content, 'audio')
  const truncated = text.length > MAX_CHAT_MULTIMODAL_TEXT_CHARS
  const processedAt = args.now ?? new Date().toISOString()
  const attachment: ChatTurnAttachment = {
    ...args.attachment,
    extraction: {
      ...args.attachment.extraction,
      status: truncated ? 'partial' : 'ready',
      mode: 'audio',
      text_preview: truncated ? text.slice(0, MAX_CHAT_MULTIMODAL_TEXT_CHARS) : text,
      text_char_count: text.length,
      truncated,
      analysis_model: result.model,
      analysis_provider: result.provider_label,
      analysis_cost_usd: result.cost_usd,
      analysis_tokens_in: undefined,
      analysis_tokens_out: undefined,
      error: undefined,
      processed_at: processedAt,
    },
  }

  return {
    attachment,
    usage: createUsageExecutionRecord({
      source_type: 'chat_multimodal_analysis',
      source_id: args.attachment.attachment_id,
      created_at: processedAt,
      phase: 'chat_audio_transcription',
      agent_name: 'Transcritor de áudio do chat',
      model: result.model,
      provider_id: result.provider_id,
      provider_label: result.provider_label,
      requested_model: selection.model,
      resolved_model: result.model,
      cost_usd: result.cost_usd,
      duration_ms: result.duration_ms,
    }),
  }
}

async function analyzeVideoAttachment(args: AnalyzeChatMultimodalAttachmentArgs): Promise<ChatMultimodalAnalysisResult> {
  const policy = normalizeMultimodalPolicyConfig(args.multimodalPolicy)
  const maxVideoBytes = getMultimodalFileLimitBytes(policy, 'video')
  if (args.file.size > maxVideoBytes) {
    const maxVideoMb = Math.round(maxVideoBytes / 1024 / 1024)
    return {
      attachment: {
        ...args.attachment,
        extraction: {
          ...args.attachment.extraction,
          status: 'unsupported',
          mode: 'video',
          error: `Vídeo acima do limite de ${maxVideoMb} MB para análise automática de frames.`,
          processed_at: args.now ?? new Date().toISOString(),
        },
      },
      skipped: true,
      reason: 'Vídeo acima do limite para análise multimodal.',
    }
  }

  let frames: ChatVideoKeyframe[] = []
  let frameExtractionError: string | undefined
  try {
    frames = await (args.videoFrameExtractor ?? extractChatVideoKeyframes)(args.file)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    frameExtractionError = error instanceof Error ? error.message : String(error)
  }
  const audioTrack = await transcribeVideoAudioTrack(args)
  if (!frames.length && !audioTrack.text) {
    const detail = [frameExtractionError, audioTrack.error].filter(Boolean).join('; ')
    return {
      attachment: {
        ...args.attachment,
        extraction: {
          ...args.attachment.extraction,
          status: 'partial',
          mode: 'video',
          error: detail
            ? `Não foi possível extrair frames do vídeo nem transcrever a faixa de áudio. Detalhe: ${detail}`
            : 'Não foi possível extrair frames do vídeo neste navegador; metadados básicos foram preservados.',
          processed_at: args.now ?? new Date().toISOString(),
        },
      },
      skipped: true,
      reason: 'Nenhum frame extraído do vídeo.',
    }
  }

  const model = args.model ?? DEFAULT_CHAT_IMAGE_ANALYSIS_MODEL
  const selection = selectMultimodalModelForPolicy({
    model,
    fallbackModels: normalizeFallbackModels(args.fallbackModels, model, 'video', args),
    modality: 'video',
    policy,
    modelCatalog: args.modelCatalog,
    providerSettings: args.providerSettings,
  })
  if (selection.blockedReason) {
    return {
      attachment: withUnsupportedAnalysis(args.attachment, 'video', selection.blockedReason, args.now ?? new Date().toISOString()),
      skipped: true,
      reason: selection.blockedReason,
    }
  }
  let result: LLMResult | undefined
  let visualContent = ''
  let visualError: string | undefined
  if (frames.length) {
    try {
      const messages = buildVideoAnalysisMessages(args.attachment, args.userInput, frames, audioTrack.text)
      result = args.llmCall
        ? await args.llmCall({ apiKey: args.apiKey, messages, model: selection.model, fallbackModels: selection.fallbackModels, signal: args.signal })
        : await callLLMWithMessagesFallback(args.apiKey, messages, selection.model, selection.fallbackModels, 1800, 0.1, { signal: args.signal })
      visualContent = result.content.trim()
      if (!visualContent) throw new Error('O modelo multimodal não retornou análise dos frames do vídeo.')
    } catch (error) {
      if (!audioTrack.text) throw error
      visualError = error instanceof Error ? error.message : String(error)
    }
  }

  const text = normalizeVideoAnalysisText(visualContent, audioTrack.text, visualError ?? frameExtractionError ?? audioTrack.error)
  const truncated = text.length > MAX_CHAT_MULTIMODAL_TEXT_CHARS
  const processedAt = args.now ?? new Date().toISOString()
  const attachment: ChatTurnAttachment = {
    ...args.attachment,
    extraction: {
      ...args.attachment.extraction,
      status: truncated ? 'partial' : 'ready',
      mode: 'video',
      text_preview: truncated ? text.slice(0, MAX_CHAT_MULTIMODAL_TEXT_CHARS) : text,
      text_char_count: text.length,
      truncated,
      video_frame_count: frames.length || undefined,
      video_frame_timestamps: frames.length ? frames.map(frame => frame.timeSeconds) : undefined,
      analysis_model: result?.model ?? audioTrack.model,
      analysis_provider: result?.provider_label ?? result?.operational?.providerLabel ?? audioTrack.provider_label,
      analysis_cost_usd: (result?.cost_usd ?? 0) + (audioTrack.cost_usd ?? 0),
      analysis_tokens_in: result?.tokens_in,
      analysis_tokens_out: result?.tokens_out,
      error: undefined,
      processed_at: processedAt,
    },
  }

  const usageRecords = [
    audioTrack.usage,
    result
      ? createUsageExecutionRecord({
          source_type: 'chat_multimodal_analysis',
          source_id: args.attachment.attachment_id,
          created_at: processedAt,
          phase: 'chat_multimodal_analysis',
          agent_name: 'Analisador multimodal de anexos',
          model: result.model,
          provider_id: result.provider_id ?? result.operational?.providerId,
          provider_label: result.provider_label ?? result.operational?.providerLabel,
          requested_model: result.operational?.requestedModel ?? selection.model,
          resolved_model: result.operational?.resolvedModel ?? result.model,
          tokens_in: result.tokens_in,
          tokens_out: result.tokens_out,
          cost_usd: result.cost_usd,
          duration_ms: result.duration_ms,
          retry_count: result.operational?.totalRetryCount ?? null,
          used_fallback: result.operational?.fallbackUsed ?? null,
          fallback_from: result.operational?.fallbackFrom ?? null,
        })
      : undefined,
  ].filter((usage): usage is UsageExecutionRecord => Boolean(usage))

  return {
    attachment,
    usageRecords,
  }
}

export function resolveChatMultimodalModel(models: Record<string, string>): string {
  return firstConfiguredModel(
    models.chat_multimodal_analysis,
    models.chat_legal_researcher,
    models.chat_orchestrator,
    DEFAULT_CHAT_IMAGE_ANALYSIS_MODEL,
  )
}

function firstConfiguredModel(...candidates: Array<string | undefined | null>): string {
  return candidates.find(candidate => typeof candidate === 'string' && candidate.trim().length > 0)?.trim()
    ?? DEFAULT_CHAT_IMAGE_ANALYSIS_MODEL
}

function readEnvMultimodalAttachmentLimit(): string | undefined {
  try {
    return (import.meta.env.VITE_CHAT_MULTIMODAL_MAX_ATTACHMENTS as string | undefined) ?? undefined
  } catch {
    return undefined
  }
}

function readEnvAudioTranscriptionModel(): string | undefined {
  try {
    const raw = import.meta.env.VITE_CHAT_AUDIO_TRANSCRIPTION_MODEL as string | undefined
    return raw?.trim() || undefined
  } catch {
    return undefined
  }
}

function normalizeMultimodalAttachmentLimit(rawValue: unknown): number {
  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed)) return DEFAULT_CHAT_MULTIMODAL_MAX_ATTACHMENTS
  return Math.max(0, Math.min(HARD_CHAT_MULTIMODAL_MAX_ATTACHMENTS, Math.floor(parsed)))
}

function attachmentKindToMultimodalModality(kind: ChatTurnAttachment['kind']): MultimodalModality | null {
  return kind === 'image' || kind === 'audio' || kind === 'video' ? kind : null
}

function shouldAnalyzeAttachment(attachment: ChatTurnAttachment): boolean {
  if (attachment.kind !== 'image' && attachment.kind !== 'audio' && attachment.kind !== 'video') return false
  if (attachment.extraction.status === 'ready' && attachment.extraction.text_preview) return false
  return attachment.extraction.status === 'pending' || attachment.extraction.status === 'partial' || attachment.extraction.status === 'failed'
}

function resolveAttachmentAnalysisModel(
  attachment: ChatTurnAttachment,
  imageVideoModel?: string,
  audioModel?: string,
): string {
  if (attachment.kind === 'audio') return audioModel ?? readEnvAudioTranscriptionModel() ?? DEFAULT_CHAT_AUDIO_TRANSCRIPTION_MODEL
  return imageVideoModel ?? DEFAULT_CHAT_IMAGE_ANALYSIS_MODEL
}

function buildAudioTranscriptionPrompt(attachment: ChatTurnAttachment, userInput: string): string {
  return [
    'Transcreva áudio em português brasileiro com vocabulário jurídico preservado.',
    'Mantenha nomes próprios, datas, valores, números de processo e siglas com a maior fidelidade possível.',
    'Quando houver baixa confiança, marque o trecho como [inaudível] ou [dúvida: ...].',
    `Pedido do usuário: ${userInput}`,
    `Arquivo: ${attachment.filename}`,
  ].join('\n')
}

function buildVideoAudioTranscriptionPrompt(attachment: ChatTurnAttachment, userInput: string): string {
  return [
    buildAudioTranscriptionPrompt(attachment, userInput),
    'Este arquivo é um vídeo; transcreva apenas a faixa falada/sonora quando houver áudio inteligível.',
  ].join('\n')
}

function buildImageAnalysisMessages(attachment: ChatTurnAttachment, userInput: string, dataUrl: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'Você é o analisador multimodal do Lexio para produção jurídica brasileira.',
        'Analise imagens anexadas como contexto probatório ou documental.',
        'Extraia OCR visível, datas, nomes, números, tabelas, assinaturas/carimbos quando aparentes e descreva o layout de forma objetiva.',
        'Não invente texto ilegível. Marque lacunas como [ilegível].',
        'Responda em português, em Markdown curto, pronto para virar contexto de outro agente.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            `Pedido do usuário: ${userInput}`,
            `Arquivo: ${attachment.filename}`,
            `MIME: ${attachment.mime_type || 'desconhecido'}`,
            '',
            'Produza:',
            '1. Descrição objetiva da imagem.',
            '2. OCR/texto visível relevante.',
            '3. Dados jurídicos, financeiros ou processuais detectáveis.',
            '4. Alertas de baixa confiança ou trechos ilegíveis.',
          ].join('\n'),
        },
        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
      ],
    },
  ]
}

function buildVideoAnalysisMessages(
  attachment: ChatTurnAttachment,
  userInput: string,
  frames: ChatVideoKeyframe[],
  audioTranscript?: string,
): ChatMessage[] {
  const content: ChatMessageContentPart[] = [
    {
      type: 'text',
      text: [
        `Pedido do usuário: ${userInput}`,
        `Arquivo: ${attachment.filename}`,
        `MIME: ${attachment.mime_type || 'desconhecido'}`,
        `Duração conhecida: ${attachment.extraction.duration_seconds ? `${attachment.extraction.duration_seconds}s` : 'não informada'}`,
        `Frames enviados: ${frames.map(frame => `${frame.label} ${frame.timeSeconds}s`).join('; ')}`,
        audioTranscript ? 'Transcrição da faixa de áudio disponível abaixo e deve ser cruzada com os frames.' : '',
        '',
        'Analise os frames como amostras do vídeo. Produza:',
        '1. Descrição objetiva das cenas e objetos relevantes.',
        '2. OCR/texto visível em cada frame, com [ilegível] quando necessário.',
        '3. Pessoas, documentos, telas, placas, datas, valores ou números processuais aparentes.',
        '4. Quando houver transcrição, relacione falas relevantes aos dados visuais sem inventar sincronização exata.',
        '5. Limites da análise: deixe claro que a avaliação usa frames amostrados e transcrição automática quando disponível.',
        audioTranscript ? `\nTranscrição automática da faixa de áudio:\n${audioTranscript}` : '',
      ].filter(Boolean).join('\n'),
    },
  ]
  for (const frame of frames) {
    content.push({ type: 'text', text: `Frame ${frame.label} (${frame.timeSeconds}s):` })
    content.push({ type: 'image_url', image_url: { url: frame.dataUrl, detail: 'high' } })
  }

  return [
    {
      role: 'system',
      content: [
        'Você é o analisador multimodal do Lexio para produção jurídica brasileira.',
        'Analise frames de vídeo anexado como contexto probatório ou documental.',
        'Extraia OCR visível, descreva cenas e destaque dados jurídicos/financeiros/processuais aparentes.',
        'Não invente texto ou falas não observáveis. Seja explícito sobre baixa confiança.',
        'Responda em português, em Markdown curto, pronto para virar contexto de outro agente.',
      ].join(' '),
    },
    { role: 'user', content },
  ]
}

async function transcribeVideoAudioTrack(args: AnalyzeChatMultimodalAttachmentArgs): Promise<{
  text?: string
  model?: string
  provider_label?: string
  cost_usd?: number
  usage?: UsageExecutionRecord
  error?: string
}> {
  const policy = normalizeMultimodalPolicyConfig(args.multimodalPolicy)
  const blockReason = getMultimodalModalityBlockReason(policy, 'audio')
  if (blockReason) return { error: blockReason }
  const maxAudioBytes = getMultimodalFileLimitBytes(policy, 'audio')
  if (args.file.size > maxAudioBytes || !isVideoAudioTranscriptionCandidate(args.attachment)) return {}

  const model = args.audioTranscriptionModel ?? readEnvAudioTranscriptionModel() ?? DEFAULT_CHAT_AUDIO_TRANSCRIPTION_MODEL
  const selection = selectMultimodalModelForPolicy({
    model,
    fallbackModels: [],
    modality: 'audio',
    policy,
    modelCatalog: args.modelCatalog,
    providerSettings: args.providerSettings,
  })
  if (selection.blockedReason) return { error: selection.blockedReason }
  const prompt = buildVideoAudioTranscriptionPrompt(args.attachment, args.userInput)
  const processedAt = args.now ?? new Date().toISOString()
  try {
    const result = args.audioTranscriptionCall
      ? await args.audioTranscriptionCall({ file: args.file, attachment: args.attachment, model: selection.model, prompt, signal: args.signal })
      : await transcribeChatAudioWithProvider({ file: args.file, model: selection.model, prompt, signal: args.signal })
    const text = result.text.trim()
    if (!text) return { error: 'O transcritor não retornou fala detectável na faixa de áudio do vídeo.' }
    return {
      text,
      model: result.model,
      provider_label: result.provider_label,
      cost_usd: result.cost_usd,
      usage: createUsageExecutionRecord({
        source_type: 'chat_multimodal_analysis',
        source_id: args.attachment.attachment_id,
        created_at: processedAt,
        phase: 'chat_video_audio_transcription',
        agent_name: 'Transcritor de áudio de vídeo do chat',
        model: result.model,
        provider_id: result.provider_id,
        provider_label: result.provider_label,
        requested_model: selection.model,
        resolved_model: result.model,
        cost_usd: result.cost_usd,
        duration_ms: result.duration_ms,
      }),
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function isVideoAudioTranscriptionCandidate(attachment: ChatTurnAttachment): boolean {
  const mimeType = attachment.mime_type.toLowerCase()
  const extension = attachment.extension?.toLowerCase() ?? ''
  return mimeType === 'video/mp4' || mimeType === 'video/webm' || extension === '.mp4' || extension === '.webm'
}

async function transcribeChatAudioWithProvider(args: {
  file: File
  model: string
  prompt: string
  signal?: AbortSignal
}): Promise<ChatAudioTranscriptionCallResult> {
  const startedAt = performance.now()
  const routeModel = normalizeAudioTranscriptionRouteModel(args.model)
  const requestModel = extractProviderModelId(routeModel)
  const resolved = await resolveProviderCall(routeModel)
  if (resolved.provider.dialect !== 'openai-compatible') {
    throw new Error(`Transcrição de áudio requer um provedor OpenAI-compatible; modelo configurado resolveu para ${resolved.provider.label}.`)
  }

  const formData = new FormData()
  formData.append('file', args.file, args.file.name || 'audio')
  formData.append('model', requestModel)
  formData.append('response_format', 'json')
  formData.append('language', 'pt')
  if (args.prompt.trim()) formData.append('prompt', args.prompt.slice(0, 5000))

  const headers: Record<string, string> = {}
  if (resolved.provider.authHeader) {
    headers[resolved.provider.authHeader] = `${resolved.provider.authPrefix ?? ''}${resolved.apiKey}`
  }
  if (resolved.provider.requiresDangerousBrowserHeader && resolved.provider.id === 'openai') {
    headers['OpenAI-Beta'] = 'browser=dangerously-allow'
  }

  const response = await fetch(`${resolved.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers,
    body: formData,
    signal: args.signal,
  })
  const body = await response.text().catch(() => '')
  if (!response.ok) {
    throw new Error(`Falha na transcrição de áudio (${response.status}): ${extractAudioProviderError(body)}`)
  }
  const parsed = body ? JSON.parse(body) as Record<string, unknown> : {}
  const text = typeof parsed.text === 'string' ? parsed.text : ''
  return {
    text,
    model: routeModel,
    provider_id: resolved.provider.id,
    provider_label: resolved.provider.label,
    duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
  }
}

function normalizeAudioTranscriptionRouteModel(model: string): string {
  const trimmed = model.trim() || DEFAULT_CHAT_AUDIO_TRANSCRIPTION_MODEL
  return trimmed.includes('/') ? trimmed : `openai/${trimmed}`
}

function extractProviderModelId(routeModel: string): string {
  return routeModel.split('/').filter(Boolean).pop() || routeModel
}

function extractAudioProviderError(body: string): string {
  if (!body) return 'sem detalhes do provedor'
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const error = parsed.error
    if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
      return (error as Record<string, unknown>).message as string
    }
    if (typeof parsed.message === 'string') return parsed.message
  } catch {
    // Fall through to raw body.
  }
  return body.slice(0, 600)
}

async function fileToImageDataUrl(file: File, fallbackMimeType: string): Promise<string> {
  const mimeType = file.type || fallbackMimeType || 'image/png'
  if (!mimeType.startsWith('image/')) throw new Error(`Tipo de imagem inválido para análise multimodal: ${mimeType}`)
  const base64 = arrayBufferToBase64(await file.arrayBuffer())
  return `data:${mimeType};base64,${base64}`
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const bufferCtor = (globalThis as { Buffer?: { from(input: Uint8Array): { toString(encoding: string): string } } }).Buffer
  if (bufferCtor) return bufferCtor.from(bytes).toString('base64')

  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize))
  }
  return btoa(binary)
}

function normalizeFallbackModels(
  fallbackModels: string[] | undefined,
  model: string,
  modality: MultimodalModality,
  args: Pick<AnalyzeChatMultimodalAttachmentArgs, 'multimodalPolicy' | 'modelCatalog' | 'providerSettings'>,
): string[] {
  const candidates = [
    ...(fallbackModels ?? []),
    DEFAULT_CHAT_IMAGE_ANALYSIS_MODEL,
    RELIABLE_TEXT_FALLBACK_MODEL,
  ]
  return candidates.filter((candidate, index) => {
    if (!candidate || candidate === model || candidates.indexOf(candidate) !== index) return false
    return !selectMultimodalModelForPolicy({
      model: candidate,
      fallbackModels: [],
      modality,
      policy: args.multimodalPolicy,
      modelCatalog: args.modelCatalog,
      providerSettings: args.providerSettings,
    }).blockedReason
  })
}

function normalizeAnalysisText(content: string, subject: 'image' | 'audio' | 'video' = 'image'): string {
  const label = subject === 'video' ? 'do vídeo' : subject === 'audio' ? 'do áudio' : 'da imagem'
  return [
    `Análise multimodal ${label}:`,
    '',
    content.trim(),
  ].join('\n')
}

function normalizeVideoAnalysisText(visualContent: string, audioTranscript?: string, warning?: string): string {
  const sections = ['Análise multimodal do vídeo:', '']
  if (visualContent.trim()) {
    sections.push('## Frames amostrados', '', visualContent.trim(), '')
  }
  if (audioTranscript?.trim()) {
    sections.push('## Transcrição da faixa de áudio', '', audioTranscript.trim(), '')
  }
  if (warning?.trim()) {
    sections.push('## Limites da análise', '', warning.trim(), '')
  }
  return sections.join('\n').trim()
}

function withFailedAnalysis(attachment: ChatTurnAttachment, message: string, processedAt: string): ChatTurnAttachment {
  return {
    ...attachment,
    extraction: {
      ...attachment.extraction,
      status: 'failed',
      mode: attachment.extraction.mode || 'unknown',
      error: message,
      processed_at: processedAt,
    },
  }
}

function withUnsupportedAnalysis(
  attachment: ChatTurnAttachment,
  modality: MultimodalModality,
  message: string,
  processedAt: string,
): ChatTurnAttachment {
  return {
    ...attachment,
    extraction: {
      ...attachment.extraction,
      status: 'unsupported',
      mode: modality,
      error: message || `Analise automatica de ${MULTIMODAL_MODALITY_LABELS[modality]} indisponivel pela politica vigente.`,
      processed_at: processedAt,
    },
  }
}

import { createUsageExecutionRecord, type UsageExecutionRecord } from './cost-analytics'
import {
  callLLMWithMessagesFallback,
  RELIABLE_TEXT_FALLBACK_MODEL,
  type ChatMessage,
  type LLMResult,
} from './llm-client'
import type { ChatTrailEvent, ChatTurnAttachment } from './firestore-types'

export const DEFAULT_CHAT_IMAGE_ANALYSIS_MODEL = 'openai/gpt-4o-mini'
export const CHAT_IMAGE_ANALYSIS_MAX_BYTES = 8 * 1024 * 1024
export const MAX_CHAT_MULTIMODAL_TEXT_CHARS = 12_000

export interface ChatMultimodalAnalysisResult {
  attachment: ChatTurnAttachment
  usage?: UsageExecutionRecord
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
  let changed = false

  const attachments: ChatTurnAttachment[] = []
  for (const attachment of args.attachments) {
    const candidate = candidatesById.get(attachment.attachment_id)
    if (!candidate || !shouldAnalyzeAttachment(attachment)) {
      attachments.push(attachment)
      continue
    }

    const model = args.model ?? DEFAULT_CHAT_IMAGE_ANALYSIS_MODEL
    args.onTrail?.({
      type: 'multimodal_analysis_started',
      attachment_id: attachment.attachment_id,
      filename: attachment.filename,
      mode: attachment.extraction.mode,
      model,
      ts: args.now?.() ?? new Date().toISOString(),
    })

    try {
      const result = await analyzeChatMultimodalAttachment({
        file: candidate.file,
        attachment,
        apiKey: args.apiKey,
        userInput: args.userInput,
        model,
        fallbackModels: args.fallbackModels,
        signal: args.signal,
        now: args.now?.(),
        llmCall: args.llmCall,
      })
      attachments.push(result.attachment)
      changed = changed || result.attachment !== attachment
      if (result.usage) usageRecords.push(result.usage)
      args.onTrail?.({
        type: 'multimodal_analysis_completed',
        attachment_id: attachment.attachment_id,
        filename: attachment.filename,
        mode: result.attachment.extraction.mode,
        model: result.attachment.extraction.analysis_model ?? model,
        status: result.attachment.extraction.status,
        usage: result.usage,
        ts: args.now?.() ?? new Date().toISOString(),
      })
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

export async function analyzeChatMultimodalAttachment(
  args: AnalyzeChatMultimodalAttachmentArgs,
): Promise<ChatMultimodalAnalysisResult> {
  if (args.attachment.kind !== 'image') {
    return { attachment: args.attachment, skipped: true, reason: 'Somente imagens são analisadas nesta etapa multimodal.' }
  }

  if (args.file.size > CHAT_IMAGE_ANALYSIS_MAX_BYTES) {
    return {
      attachment: {
        ...args.attachment,
        extraction: {
          ...args.attachment.extraction,
          status: 'unsupported',
          mode: 'image',
          error: `Imagem acima do limite de ${Math.round(CHAT_IMAGE_ANALYSIS_MAX_BYTES / 1024 / 1024)} MB para análise multimodal automática.`,
          processed_at: args.now ?? new Date().toISOString(),
        },
      },
      skipped: true,
      reason: 'Imagem acima do limite para análise multimodal.',
    }
  }

  const model = args.model ?? DEFAULT_CHAT_IMAGE_ANALYSIS_MODEL
  const fallbackModels = normalizeFallbackModels(args.fallbackModels, model)
  const dataUrl = await fileToImageDataUrl(args.file, args.attachment.mime_type)
  const messages = buildImageAnalysisMessages(args.attachment, args.userInput, dataUrl)
  const result = args.llmCall
    ? await args.llmCall({ apiKey: args.apiKey, messages, model, fallbackModels, signal: args.signal })
    : await callLLMWithMessagesFallback(args.apiKey, messages, model, fallbackModels, 1600, 0.1, { signal: args.signal })
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
      requested_model: result.operational?.requestedModel ?? model,
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

function shouldAnalyzeAttachment(attachment: ChatTurnAttachment): boolean {
  if (attachment.kind !== 'image') return false
  if (attachment.extraction.status === 'ready' && attachment.extraction.text_preview) return false
  return attachment.extraction.status === 'pending' || attachment.extraction.status === 'partial' || attachment.extraction.status === 'failed'
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

function normalizeFallbackModels(fallbackModels: string[] | undefined, model: string): string[] {
  const candidates = [
    ...(fallbackModels ?? []),
    DEFAULT_CHAT_IMAGE_ANALYSIS_MODEL,
    RELIABLE_TEXT_FALLBACK_MODEL,
  ]
  return candidates.filter((candidate, index) => candidate && candidate !== model && candidates.indexOf(candidate) === index)
}

function normalizeAnalysisText(content: string): string {
  return [
    'Análise multimodal da imagem:',
    '',
    content.trim(),
  ].join('\n')
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

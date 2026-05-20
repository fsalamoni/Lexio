/**
 * PR3 — Super-Skills de Pipeline
 *
 * Expõe pipelines browser-native como skills do orquestrador de chat.
 *
 * Cada super-skill:
 *  1. Valida os argumentos (tipo de documento, conteúdo, template)
 *  2. Solicita aprovação quando a ação é persistente/cara
 *  3. Chama os pipelines frontend reais
 *  4. Emite eventos `super_skill_call`/`pipeline_progress` na trilha
 *  5. Retorna o status do pipeline e cria pacote de artefato quando possível
 */

import type { ChatAgentWorkPackage, ChatArtifactExportRef, ChatArtifactKind, ChatArtifactRef, ChatTrailEvent, StudioArtifact, StudioArtifactType } from '../firestore-types'
import type { Skill, SkillContext, SkillResult } from './types'
import { hybridSearch } from '../search-client'

// ── Tipos de documento suportados ─────────────────────────────────────────────

/** Todos os document_type_id disponíveis nos pipelines existentes. */
export const PIPELINE_DOCUMENT_TYPES = [
  'parecer',
  'peticao_inicial',
  'contestacao',
  'recurso',
  'sentenca',
  'acao_civil_publica',
  'mandado_seguranca',
  'habeas_corpus',
  'agravo',
  'embargos_declaracao',
] as const

export type PipelineDocumentType = (typeof PIPELINE_DOCUMENT_TYPES)[number]

/** Mapeamento amigável para exibição na UI. */
export const PIPELINE_DOCUMENT_LABELS: Record<PipelineDocumentType, string> = {
  parecer: 'Parecer Jurídico',
  peticao_inicial: 'Petição Inicial',
  contestacao: 'Contestação',
  recurso: 'Recurso',
  sentenca: 'Sentença',
  acao_civil_publica: 'Ação Civil Pública',
  mandado_seguranca: 'Mandado de Segurança',
  habeas_corpus: 'Habeas Corpus',
  agravo: 'Agravo',
  embargos_declaracao: 'Embargos de Declaração',
}

export const STUDIO_CHAT_ARTIFACT_TYPES = [
  'resumo',
  'relatorio',
  'documento',
  'guia_estruturado',
  'cartoes_didaticos',
  'teste',
  'mapa_mental',
  'infografico',
  'tabela_dados',
  'audio_script',
  'video_script',
  'apresentacao',
  'apresentacao_v2',
] as const satisfies readonly StudioArtifactType[]

export type StudioChatArtifactType = (typeof STUDIO_CHAT_ARTIFACT_TYPES)[number]

export const STUDIO_CHAT_ARTIFACT_LABELS: Record<StudioChatArtifactType, string> = {
  resumo: 'Resumo',
  relatorio: 'Relatório',
  documento: 'Documento',
  guia_estruturado: 'Guia Estruturado',
  cartoes_didaticos: 'Cartões Didáticos',
  teste: 'Quiz',
  mapa_mental: 'Mapa Mental',
  infografico: 'Infográfico',
  tabela_dados: 'Tabela de Dados',
  audio_script: 'Roteiro de Áudio',
  video_script: 'Roteiro de Vídeo',
  apresentacao: 'Apresentação',
  apresentacao_v2: 'Apresentação v2',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString()
}

function clip(text: string, max = 500): string {
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function makeChatArtifactId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function resolveStrictConfiguredModel(
  configuredModel: string | undefined,
  requestedModel: string | undefined,
  agentLabel: string,
  settingsLabel: string,
): { model?: string; error?: string } {
  const normalizedConfigured = String(configuredModel ?? '').trim()
  if (!normalizedConfigured) {
    return {
      error: `Erro: nenhum modelo configurado para o agente "${agentLabel}". Configure esse agente em ${settingsLabel} antes de gerar o artefato.`,
    }
  }

  const normalizedRequested = String(requestedModel ?? '').trim()
  if (normalizedRequested && normalizedRequested !== normalizedConfigured) {
    return {
      error:
        `Erro: o agente "${agentLabel}" deve usar exatamente o modelo configurado pelo usuário (${normalizedConfigured}). ` +
        `A chamada pediu "${normalizedRequested}", o que foi bloqueado para evitar desvio da configuração do agente.`,
    }
  }

  return { model: normalizedConfigured }
}

function mapStudioArtifactKind(artifactType: StudioArtifactType): ChatArtifactKind {
  if (artifactType === 'apresentacao' || artifactType === 'apresentacao_v2') return 'presentation'
  if (artifactType === 'audio_script') return 'audio'
  if (artifactType === 'video_script') return 'video'
  if (artifactType === 'tabela_dados') return 'spreadsheet'
  if (artifactType === 'mapa_mental' || artifactType === 'infografico') return 'image'
  if (artifactType === 'teste') return 'data'
  return 'text'
}

function buildNotebookSourceContextFromSources(sources: Array<{ title?: string; text_content?: string; summary?: string }>, fallback: string): string {
  const context = sources
    .filter(source => source.text_content?.trim() || source.summary?.trim())
    .slice(0, 8)
    .map((source, index) => [
      `Fonte ${index + 1}: ${source.title || 'Sem título'}`,
      clip(source.text_content?.trim() || source.summary?.trim() || '', 2500),
    ].join('\n'))
    .join('\n\n')
  return context || fallback
}

function buildPresentationV2Briefing(args: GenerateStudioArtifactArgs, topic: string, instructions: string) {
  const slideCount = clampNumber(args.slide_count, 6, 3, 24)
  const durationMinutes = clampNumber(args.duration_minutes, Math.max(5, Math.round(slideCount * 1.5)), 3, 120)
  const objective = String(args.objective ?? '').trim() || instructions || `Apresentar ${topic} com narrativa executiva e evidências claras.`
  const audience = String(args.audience ?? '').trim() || 'Público jurídico e decisores institucionais'
  const coreMessage = String(args.core_message ?? '').trim() || topic
  const successCriteria = String(args.success_criteria ?? '').trim() || 'Deck compreensível, fundamentado e pronto para revisão no Lexio.'
  const depth = normalizePresentationDepth(args.depth)
  const slideDensity = normalizeSlideDensity(args.slide_density)
  const evidenceMode = normalizeEvidenceMode(args.evidence_mode)
  const multimodal = {
    images: toBoolean(args.images, true),
    audio: toBoolean(args.audio, false),
    video: toBoolean(args.video, false),
    charts: toBoolean(args.charts, true),
    diagrams: toBoolean(args.diagrams, true),
  }

  return {
    slideCount,
    depth,
    objective,
    audience,
    coreMessage,
    successCriteria,
    proofObligations: String(args.proof_obligations ?? '').trim() || undefined,
    institutionalConstraints: String(args.institutional_constraints ?? '').trim() || undefined,
    durationMinutes,
    slideDensity,
    evidenceMode,
    tone: String(args.tone ?? '').trim() || 'Sóbrio, jurídico e executivo',
    visualStyle: String(args.visual_style ?? '').trim() || 'Editorial institucional, limpo e orientado a decisão',
    multimodal,
    mediaRequirements: {
      images: multimodal.images ? 'optional' as const : 'disabled' as const,
      audio: multimodal.audio ? 'optional' as const : 'disabled' as const,
      video: multimodal.video ? 'optional' as const : 'disabled' as const,
      charts: multimodal.charts ? 'optional' as const : 'disabled' as const,
      diagrams: multimodal.diagrams ? 'optional' as const : 'disabled' as const,
    },
    constraints: String(args.constraints ?? '').trim() || undefined,
    sourcePriority: String(args.source_priority ?? '').trim() || undefined,
  }
}

function buildMockPresentationV2Content(topic: string, label: string): string {
  return JSON.stringify({
    schemaVersion: 'presentation_v2.1',
    title: `${label} - ${topic}`,
    generationSpec: {
      request: topic,
      objective: `Apresentar ${topic}`,
      audience: 'Público jurídico',
      slideCount: 3,
      depth: 'executiva',
    },
    slides: [
      {
        number: 1,
        sectionId: 'abertura',
        title: topic,
        purpose: 'Abrir a narrativa.',
        layout: 'hero',
        bullets: ['Contexto central', 'Mensagem principal', 'Decisão esperada'],
        speakerNotes: 'Apresentar o contexto e a tese central.',
      },
      {
        number: 2,
        sectionId: 'fundamentos',
        title: 'Fundamentos',
        purpose: 'Organizar evidências.',
        layout: 'split',
        bullets: ['Base factual', 'Base jurídica', 'Riscos e mitigação'],
        speakerNotes: 'Explicar os fundamentos relevantes.',
      },
      {
        number: 3,
        sectionId: 'fechamento',
        title: 'Encaminhamento',
        purpose: 'Fechar com próximos passos.',
        layout: 'summary',
        bullets: ['Síntese', 'Recomendação', 'Ação imediata'],
        speakerNotes: 'Encerrar com recomendação prática.',
      },
    ],
  }, null, 2)
}

function attachLiteralAudioToContent(content: string, audio: { url: string; path?: string; mimeType: string }): string {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    return JSON.stringify({
      ...parsed,
      audioUrl: audio.url,
      audioStoragePath: audio.path,
      audioMimeType: audio.mimeType,
    }, null, 2)
  } catch {
    const separator = content.trim().endsWith('\n') ? '' : '\n'
    return `${content}${separator}\n## Áudio literal\n\nArquivo: ${audio.url}`
  }
}

function inferAudioExtensionFromMimeType(mimeType?: string): string {
  const normalized = String(mimeType ?? '').toLowerCase()
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return '.mp3'
  if (normalized.includes('wav')) return '.wav'
  if (normalized.includes('ogg')) return '.ogg'
  if (normalized.includes('webm')) return '.webm'
  return '.mp3'
}

function sanitizeVideoProductionForPersistence(value: unknown): unknown {
  if (value == null) return value
  if (value instanceof Blob) return undefined
  if (typeof value === 'string') {
    if (value.startsWith('blob:') || value.startsWith('data:')) return undefined
    return value
  }
  if (Array.isArray(value)) {
    return value
      .map(item => sanitizeVideoProductionForPersistence(item))
      .filter(item => item !== undefined)
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, sanitizeVideoProductionForPersistence(item)] as const)
      .filter(([, item]) => item !== undefined)
    return Object.fromEntries(entries)
  }
  return value
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function normalizePresentationDepth(value: unknown): 'executiva' | 'intermediaria' | 'profunda' | 'tecnica' {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'intermediaria' || normalized === 'profunda' || normalized === 'tecnica') return normalized
  return 'executiva'
}

function normalizeSlideDensity(value: unknown): 'leve' | 'equilibrada' | 'densa' {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'leve' || normalized === 'densa') return normalized
  return 'equilibrada'
}

function normalizeEvidenceMode(value: unknown): 'padrao' | 'reforcada' | 'estrita' {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'reforcada' || normalized === 'estrita') return normalized
  return 'padrao'
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['true', '1', 'sim', 'yes'].includes(normalized)) return true
  if (['false', '0', 'nao', 'não', 'no'].includes(normalized)) return false
  return fallback
}

/** Detecta AbortError em ambientes browser (DOMException) e Node (Error). */
function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof Error && err.name === 'AbortError') return true
  return false
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err || 'Erro desconhecido')
}

function normalizeSideEffectApproval(value: unknown): boolean {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true'
}

async function requestApprovalForSkill(ctx: SkillContext, args: {
  title: string
  summary: string
  riskLevel?: 'low' | 'medium' | 'high'
  permissions?: Array<'read' | 'write' | 'delete' | 'rename' | 'execute' | 'network'>
  resumeTool?: string
  resumeArgs?: Record<string, unknown>
}): Promise<SkillResult> {
  let approvalId = `local-${Date.now()}`
  if (ctx.createApprovalRequest) {
    approvalId = await ctx.createApprovalRequest({
      command_ids: [],
      title: args.title,
      summary: args.summary,
      risk_level: args.riskLevel ?? 'medium',
      requested_permissions: args.permissions ?? ['write', 'network'],
    })
  }
  ctx.emit({
    type: 'approval_requested',
    approval_id: approvalId,
    title: args.title,
    summary: args.summary,
    risk_level: args.riskLevel ?? 'medium',
    ts: nowIso(),
  })
  return {
    tool_message: `Aguardando aprovação do usuário (${approvalId}): ${args.title}`,
    awaiting_user: {
      question: `${args.title}\n\n${args.summary}\n\nResponda "aprovar" para autorizar ou "rejeitar" para cancelar.`,
      options: ['aprovar', 'rejeitar', 'ajustar'],
      approval_id: approvalId,
      resume_tool: args.resumeTool,
      resume_args: args.resumeArgs,
    },
  }
}

async function deliverWorkPackage(ctx: SkillContext, workPackage: ChatAgentWorkPackage): Promise<ChatAgentWorkPackage> {
  let materialized = workPackage
  try {
    const { materializeChatAgentWorkPackageExports } = await import('../chat-artifact-exporters')
    materialized = await materializeChatAgentWorkPackageExports(workPackage, {
      userId: ctx.uid,
      conversationId: ctx.conversationId,
      turnId: ctx.turnId,
    })
  } catch (err) {
    if (isAbortError(err)) throw err
    ctx.emit({
      type: 'error',
      message: `Pacote de artefato criado, mas a materialização dos exports falhou. Detalhe: ${getErrorMessage(err)}`,
      ts: nowIso(),
    })
  }
  if (ctx.persistWorkPackage) {
    try {
      materialized = await ctx.persistWorkPackage(materialized)
    } catch (err) {
      if (isAbortError(err)) throw err
      ctx.emit({
        type: 'error',
        message: `Pacote de artefato criado, mas a persistência remota falhou. Detalhe: ${getErrorMessage(err)}`,
        ts: nowIso(),
      })
    }
  }
  ctx.emit({ type: 'agent_work_package', package: materialized, ts: materialized.completed_at ?? nowIso() })
  return materialized
}

// ── Super-Skill: Gerar Imagem Literal ────────────────────────────────────────

interface GenerateImageArgs {
  prompt?: string
  title?: string
  aspect_ratio?: string
  model?: string
  negative_prompt?: string
  approved?: boolean
}

const MOCK_IMAGE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

const generateImageSkill: Skill<GenerateImageArgs> = {
  name: 'generate_image',
  description:
    'Gera uma imagem literal no chat e entrega arquivo nativo para preview e download. ' +
    'Use quando o usuário pedir imagem, renderização, mockup visual, PNG, JPG, JPEG ou WebP. ' +
    'Não use prompts para ferramentas externas como substituto da imagem gerada.',
  argsHint: {
    prompt: 'Descrição visual completa da imagem a gerar. Inclua contexto consolidado da conversa e especificações importantes.',
    title: 'Título curto para o arquivo/imagem gerada.',
    aspect_ratio: 'Proporção desejada. Ex.: 1:1, 4:3, 16:9, 9:16.',
    model: 'Modelo opcional de imagem. Se omitido, usa o modelo padrão configurado no cliente de imagem.',
    negative_prompt: 'Opcional: elementos a evitar na imagem.',
    approved: 'true apenas depois de o usuário aprovar explicitamente a geração literal da imagem',
  },
  async run(args, ctx): Promise<SkillResult> {
    const prompt = String(args.prompt ?? '').trim()
    const title = String(args.title ?? '').trim() || 'Imagem gerada pelo chat'
    const aspectRatio = String(args.aspect_ratio ?? '').trim() || undefined
    const requestedModel = String(args.model ?? '').trim() || undefined
    const negativePrompt = String(args.negative_prompt ?? '').trim() || undefined

    if (!prompt) {
      return { tool_message: 'Erro: "prompt" é obrigatório para gerar imagem literal.' }
    }

    const resolvedModel = resolveStrictConfiguredModel(
      ctx.models.chat_image_generator,
      requestedModel,
      'Gerador de Imagem Literal',
      'Configurações > Orquestrador (Chat)',
    )
    if (!resolvedModel.model) {
      return { tool_message: resolvedModel.error || 'Erro: modelo de imagem indisponível.' }
    }
    const model = resolvedModel.model

    if (!normalizeSideEffectApproval(args.approved)) {
      return requestApprovalForSkill(ctx, {
        title: `Gerar imagem literal: ${clip(title, 80)}`,
        summary: [
          'O chat vai chamar um provedor de geração de imagem, salvar o arquivo no Storage e exibir a imagem literalmente na conversa.',
          `Título: ${title}`,
          aspectRatio ? `Proporção: ${aspectRatio}` : '',
          `Modelo do agente: ${model}`,
        ].filter(Boolean).join('\n'),
        riskLevel: 'medium',
        permissions: ['write', 'network'],
        resumeTool: 'generate_image',
        resumeArgs: {
          prompt,
          title,
          aspect_ratio: aspectRatio,
          model,
          negative_prompt: negativePrompt,
          approved: true,
        },
      })
    }

    const artifactId = makeChatArtifactId('chat-image')
    ctx.emit({
      type: 'super_skill_call',
      skill: 'generate_image',
      args_summary: clip(prompt, 180),
      result_summary: `Iniciando geração literal de imagem: ${clip(title, 100)}`,
      ts: nowIso(),
    })

    try {
      const imageResult = ctx.mock
        ? { imageDataUrl: MOCK_IMAGE_DATA_URL, model: model || 'mock/image', cost_usd: 0, provider_id: 'mock', provider_label: 'Mock' }
        : await import('../image-generation-client').then(module => module.generateImage({
            apiKey: ctx.apiKey,
            uid: ctx.uid,
            prompt,
            negativePrompt,
            model,
            aspectRatio,
            signal: ctx.signal,
          }))

      const blob = await imageDataUrlToBlob(imageResult.imageDataUrl)
      const mimeType = blob.type || inferImageMimeType(imageResult.imageDataUrl)
      const format = inferImageArtifactFormat(mimeType)
      const extension = imageExtensionForFormat(format)
      const exportId = `${artifactId}-${format}`
      const { uploadChatArtifactFile } = await import('../chat-artifact-storage')
      const stored = await uploadChatArtifactFile({
        userId: ctx.uid,
        conversationId: ctx.conversationId,
        turnId: ctx.turnId,
        artifactId,
        exportId,
        title,
        extension,
        blob,
      })

      ctx.budget.recordUsage({
        source_type: 'chat_orchestrator',
        source_id: ctx.turnId,
        created_at: nowIso(),
        function_key: 'chat_orchestrator',
        function_label: 'Orquestrador (Chat)',
        phase: 'generate_image',
        phase_label: 'Chat: generate_image',
        agent_name: 'Gerador de Imagem',
        model: imageResult.model,
        model_label: imageResult.model,
        total_tokens: 0,
        cost_usd: imageResult.cost_usd,
        duration_ms: 0,
        execution_state: 'completed',
      })

      const readyExport: ChatArtifactExportRef = {
        export_id: exportId,
        label: format.toUpperCase(),
        format,
        status: 'ready',
        mime_type: mimeType,
        extension,
        download_url: stored.url,
        storage_path: stored.path,
        attempt_count: 1,
        last_attempt_at: nowIso(),
      }
      const artifact: ChatArtifactRef = {
        artifact_id: artifactId,
        logical_document_id: artifactId,
        version: 1,
        title,
        kind: 'image',
        format,
        summary: `Imagem literal gerada pelo chat com ${imageResult.model}.`,
        content_preview: stored.url || imageResult.imageDataUrl,
        download_url: stored.url,
        storage_path: stored.path,
        mime_type: mimeType,
        extension,
        is_latest: true,
        manifest_json: {
          prompt,
          negative_prompt: negativePrompt,
          aspect_ratio: aspectRatio,
          model: imageResult.model,
          provider_id: imageResult.provider_id,
          provider_label: imageResult.provider_label,
          preview_url: stored.url,
          storage_path: stored.path,
        },
        exports: [readyExport],
      }

      const workPackage = await deliverWorkPackage(ctx, {
        conversation_id: ctx.conversationId,
        turn_id: ctx.turnId,
        agent_key: 'chat_image_generator',
        task: `Gerar imagem literal: ${title}`,
        thought: {
          summary: 'Imagem literal criada e persistida como artifact do chat.',
          decisions: ['Usar skill direta de imagem em vez de entregar prompt textual.'],
          next_steps: ['Exibir preview inline, permitir ampliar e baixar o arquivo nativo.'],
        },
        result_markdown: `Imagem literal gerada: ${title}.`,
        artifacts: [artifact],
        created_at: nowIso(),
        completed_at: nowIso(),
      })

      const delivered = workPackage.artifacts?.[0]
      ctx.emit({
        type: 'super_skill_call',
        skill: 'generate_image',
        result_summary: `Imagem pronta para preview/download: ${delivered?.download_url ? format.toUpperCase() : 'artifact registrado'}`,
        ts: nowIso(),
      })

      return {
        tool_message:
          `Imagem literal gerada com sucesso.\n` +
          `- Título: ${title}\n` +
          `- Formato: ${format.toUpperCase()}\n` +
          `- Modelo: ${imageResult.model}\n` +
          `- O artifact de imagem foi registrado na trilha do chat com preview e download.`,
      }
    } catch (err) {
      if (isAbortError(err)) throw err
      const message = getErrorMessage(err)
      ctx.emit({
        type: 'super_skill_call',
        skill: 'generate_image',
        result_summary: `Erro: ${message}`,
        ts: nowIso(),
      })
      return {
        tool_message:
          `Falha operacional ao gerar imagem literal: ${message}. ` +
          'Configure um provider/chave de imagem em Configurações ou tente novamente com outro modelo. Nao trate prompt textual como imagem entregue.',
      }
    }
  },
}

async function imageDataUrlToBlob(dataUrl: string): Promise<Blob> {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl)
  if (match) {
    if (typeof atob !== 'function') throw new Error('Ambiente sem suporte para decodificar imagem base64.')
    const binary = atob(match[2])
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new Blob([bytes], { type: match[1] })
  }

  if (typeof fetch === 'function') {
    const response = await fetch(dataUrl)
    if (!response.ok) throw new Error(`Falha ao converter imagem gerada em Blob: ${response.status}`)
    return response.blob()
  }

  throw new Error('Resposta do provedor nao contem data URL de imagem valida.')
}

function inferImageMimeType(dataUrl: string): string {
  const match = /^data:([^;,]+)/i.exec(dataUrl)
  return match?.[1] || 'image/png'
}

function inferImageArtifactFormat(mimeType: string): 'png' | 'jpg' | 'jpeg' | 'webp' {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('webp')) return 'webp'
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg'
  return 'png'
}

function imageExtensionForFormat(format: 'png' | 'jpg' | 'jpeg' | 'webp'): string {
  if (format === 'jpeg') return '.jpg'
  return `.${format}`
}

// ── Super-Skill: Gerar Áudio Literal ─────────────────────────────────────────

interface GenerateAudioArgs {
  script?: string
  text?: string
  title?: string
  voice?: string
  model?: string
  approved?: boolean
}

function inferAudioArtifactFormat(mimeType?: string): 'mp3' | 'wav' | 'webm' {
  const normalized = String(mimeType ?? '').toLowerCase()
  if (normalized.includes('wav')) return 'wav'
  if (normalized.includes('webm')) return 'webm'
  return 'mp3'
}

const generateAudioSkill: Skill<GenerateAudioArgs> = {
  name: 'generate_audio',
  description:
    'Gera áudio literal (narração/locução por TTS) no chat e entrega arquivo MP3/WAV nativo para preview e download. ' +
    'Use quando o usuário pedir áudio, narração, podcast, locução, MP3 ou WAV. ' +
    'Não entregue um roteiro textual como substituto do áudio gerado.',
  argsHint: {
    script: 'Texto/roteiro completo a ser narrado. Aceita texto simples ou roteiro estruturado.',
    title: 'Título curto para o arquivo de áudio gerado.',
    voice: 'Opcional: voz desejada, quando suportada pelo modelo configurado.',
    model: 'Opcional. Se informado, deve ser exatamente o modelo configurado para o agente Gerador de Áudio Literal.',
    approved: 'true apenas depois de o usuário aprovar explicitamente a geração literal de áudio',
  },
  async run(args, ctx): Promise<SkillResult> {
    const script = String(args.script ?? args.text ?? '').trim()
    const title = String(args.title ?? '').trim() || 'Áudio gerado pelo chat'
    const voice = String(args.voice ?? '').trim() || undefined
    const requestedModel = String(args.model ?? '').trim() || undefined

    if (!script) {
      return { tool_message: 'Erro: "script" (ou "text") é obrigatório para gerar áudio literal.' }
    }

    const resolvedModel = resolveStrictConfiguredModel(
      ctx.models.chat_audio_generator,
      requestedModel,
      'Gerador de Áudio Literal',
      'Configurações > Orquestrador (Chat)',
    )
    if (!resolvedModel.model) {
      return { tool_message: resolvedModel.error || 'Erro: modelo de áudio indisponível.' }
    }
    const model = resolvedModel.model

    if (!normalizeSideEffectApproval(args.approved)) {
      return requestApprovalForSkill(ctx, {
        title: `Gerar áudio literal: ${clip(title, 80)}`,
        summary: [
          'O chat vai sintetizar áudio literal (TTS), salvar o arquivo no Storage e exibir o player na conversa.',
          `Título: ${title}`,
          voice ? `Voz: ${voice}` : '',
          `Modelo do agente: ${model}`,
        ].filter(Boolean).join('\n'),
        riskLevel: 'medium',
        permissions: ['write', 'network'],
        resumeTool: 'generate_audio',
        resumeArgs: { script, title, voice, model, approved: true },
      })
    }

    const artifactId = makeChatArtifactId('chat-audio')
    ctx.emit({
      type: 'super_skill_call',
      skill: 'generate_audio',
      args_summary: clip(script, 180),
      result_summary: `Iniciando geração literal de áudio: ${clip(title, 100)}`,
      ts: nowIso(),
    })

    try {
      const audio = ctx.mock
        ? { blob: new Blob(['mock-audio'], { type: 'audio/mpeg' }), mimeType: 'audio/mpeg', model, costUsd: 0 }
        : await import('../audio-generation-pipeline').then(async module => {
            const result = await module.generateAudioLiteralMedia({
              apiKey: ctx.apiKey,
              uid: ctx.uid,
              rawScriptContent: script,
              voice,
              ttsModelOverride: model,
            })
            return {
              blob: result.audioBlob,
              mimeType: result.mimeType,
              model: result.execution.model || model,
              costUsd: result.execution.cost_usd ?? 0,
            }
          })

      const format = inferAudioArtifactFormat(audio.mimeType)
      const extension = inferAudioExtensionFromMimeType(audio.mimeType)
      const exportId = `${artifactId}-${format}`
      const { uploadChatArtifactFile } = await import('../chat-artifact-storage')
      const stored = await uploadChatArtifactFile({
        userId: ctx.uid,
        conversationId: ctx.conversationId,
        turnId: ctx.turnId,
        artifactId,
        exportId,
        title,
        extension,
        blob: audio.blob,
      })

      ctx.budget.recordUsage({
        source_type: 'chat_orchestrator',
        source_id: ctx.turnId,
        created_at: nowIso(),
        function_key: 'chat_orchestrator',
        function_label: 'Orquestrador (Chat)',
        phase: 'generate_audio',
        phase_label: 'Chat: generate_audio',
        agent_name: 'Gerador de Áudio Literal',
        model: audio.model,
        model_label: audio.model,
        total_tokens: 0,
        cost_usd: audio.costUsd,
        duration_ms: 0,
        execution_state: 'completed',
      })

      const readyExport: ChatArtifactExportRef = {
        export_id: exportId,
        label: format.toUpperCase(),
        format,
        status: 'ready',
        mime_type: audio.mimeType,
        extension,
        download_url: stored.url,
        storage_path: stored.path,
        attempt_count: 1,
        last_attempt_at: nowIso(),
      }
      const artifact: ChatArtifactRef = {
        artifact_id: artifactId,
        logical_document_id: artifactId,
        version: 1,
        title,
        kind: 'audio',
        format,
        summary: `Áudio literal gerado pelo chat com ${audio.model}.`,
        content_preview: stored.url,
        download_url: stored.url,
        storage_path: stored.path,
        mime_type: audio.mimeType,
        extension,
        is_latest: true,
        manifest_json: {
          voice,
          model: audio.model,
          audioUrl: stored.url,
          storage_path: stored.path,
        },
        exports: [readyExport],
      }

      await deliverWorkPackage(ctx, {
        conversation_id: ctx.conversationId,
        turn_id: ctx.turnId,
        agent_key: 'chat_audio_generator',
        task: `Gerar áudio literal: ${title}`,
        thought: {
          summary: 'Áudio literal sintetizado por TTS e persistido como artifact do chat.',
          decisions: ['Usar skill direta de áudio em vez de entregar roteiro textual.'],
          next_steps: ['Reproduzir o player inline e permitir o download do arquivo nativo.'],
        },
        result_markdown: `Áudio literal gerado: ${title}.`,
        artifacts: [artifact],
        created_at: nowIso(),
        completed_at: nowIso(),
      })

      ctx.emit({
        type: 'super_skill_call',
        skill: 'generate_audio',
        result_summary: `Áudio pronto para preview/download: ${format.toUpperCase()}`,
        ts: nowIso(),
      })

      return {
        tool_message:
          `Áudio literal gerado com sucesso.\n` +
          `- Título: ${title}\n` +
          `- Formato: ${format.toUpperCase()}\n` +
          `- Modelo: ${audio.model}\n` +
          `- O artifact de áudio foi registrado na trilha do chat com player e download.`,
      }
    } catch (err) {
      if (isAbortError(err)) throw err
      const message = getErrorMessage(err)
      ctx.emit({
        type: 'super_skill_call',
        skill: 'generate_audio',
        result_summary: `Erro: ${message}`,
        ts: nowIso(),
      })
      return {
        tool_message:
          `Falha operacional ao gerar áudio literal: ${message}. ` +
          'Configure um modelo de áudio para o agente Gerador de Áudio Literal em Configurações ou tente novamente. Não trate um roteiro textual como áudio entregue.',
      }
    }
  },
}

// ── Super-Skill: Gerar Apresentação Literal ──────────────────────────────────

interface GeneratePresentationArgs extends GenerateStudioArtifactArgs {
  generate_slide_images?: boolean | string
  title?: string
  model?: string
}

function mergeRenderedSlideImages(deckContent: string, slideImages: Map<number, string>): string {
  if (slideImages.size === 0) return deckContent
  try {
    const deck = JSON.parse(deckContent) as Record<string, unknown>
    const applyTo = (slides: unknown) => {
      if (!Array.isArray(slides)) return
      for (const slide of slides) {
        if (!slide || typeof slide !== 'object') continue
        const record = slide as Record<string, unknown>
        const number = Number(record.number)
        const url = Number.isFinite(number) ? slideImages.get(number) : undefined
        if (url) record.renderedImageUrl = url
      }
    }
    applyTo(deck.slides)
    const nested = deck.presentation
    if (nested && typeof nested === 'object') {
      applyTo((nested as Record<string, unknown>).slides)
    }
    return JSON.stringify(deck, null, 2)
  } catch {
    return deckContent
  }
}

const generatePresentationSkill: Skill<GeneratePresentationArgs> = {
  name: 'generate_presentation',
  description:
    'Gera uma apresentação literal (deck de slides) no chat, com estrutura completa e, quando aprovado, ' +
    'visuais renderizados de cada slide. Use quando o usuário pedir apresentação, deck, slides ou PPTX. ' +
    'Entrega o artefato pronto para visualização inline e export PPTX.',
  argsHint: {
    topic: 'Tema central da apresentação.',
    title: 'Título do deck.',
    slide_count: 'Número de slides entre 3 e 24.',
    audience: 'Público-alvo do deck.',
    objective: 'Objetivo narrativo ou decisão buscada.',
    depth: 'executiva, intermediaria, profunda ou tecnica.',
    instructions: 'Instruções customizadas de tom, formato ou foco.',
    legal_area: 'Área jurídica opcional para enriquecer o prompt.',
    generate_slide_images: 'true (padrão) para renderizar os visuais literais dos slides; false para deck somente textual.',
    model: 'Opcional. Se informado, deve ser o modelo configurado para o agente Designer de Apresentação.',
    approved: 'true apenas depois de o usuário aprovar explicitamente a geração da apresentação',
  },
  async run(args, ctx): Promise<SkillResult> {
    const topic = String(args.topic ?? '').trim()
    const title = String(args.title ?? '').trim() || (topic ? `Apresentação — ${topic}` : 'Apresentação gerada pelo chat')
    const instructions = String(args.instructions ?? '').trim()
    const legalArea = String(args.legal_area ?? '').trim()
    const generateSlideImages = toBoolean(args.generate_slide_images, true)
    const requestedModel = String(args.model ?? '').trim() || undefined

    if (!topic) {
      return { tool_message: 'Erro: "topic" é obrigatório para gerar uma apresentação.' }
    }

    // The presentation designer model is only required when literal slide
    // visuals are requested; a text-only deck does not need an image model.
    let designerModel = ''
    if (generateSlideImages) {
      const resolvedModel = resolveStrictConfiguredModel(
        ctx.models.chat_presentation_designer,
        requestedModel,
        'Designer de Apresentação',
        'Configurações > Orquestrador (Chat)',
      )
      if (!resolvedModel.model) {
        return { tool_message: resolvedModel.error || 'Erro: modelo de imagem para slides indisponível.' }
      }
      designerModel = resolvedModel.model
    }

    if (!normalizeSideEffectApproval(args.approved)) {
      return requestApprovalForSkill(ctx, {
        title: `Gerar apresentação: ${clip(title, 80)}`,
        summary: [
          'O chat vai gerar um deck de slides e, quando habilitado, renderizar os visuais literais de cada slide.',
          `Título: ${title}`,
          `Tema: ${topic}`,
          generateSlideImages ? `Visuais dos slides: sim (modelo ${designerModel})` : 'Visuais dos slides: não (deck textual)',
        ].filter(Boolean).join('\n'),
        riskLevel: 'medium',
        permissions: ['write', 'network'],
        resumeTool: 'generate_presentation',
        resumeArgs: { ...args, topic, title, generate_slide_images: generateSlideImages, model: designerModel || undefined, approved: true },
      })
    }

    const artifactId = makeChatArtifactId('chat-presentation')
    ctx.emit({
      type: 'super_skill_call',
      skill: 'generate_presentation',
      args_summary: clip(topic, 180),
      result_summary: `Iniciando geração de apresentação: ${clip(title, 100)}`,
      ts: nowIso(),
    })

    try {
      let deckContent: string
      const slideImages = new Map<number, string>()

      if (ctx.mock) {
        deckContent = buildMockPresentationV2Content(topic, 'Apresentação')
      } else {
        if (!ctx.apiKey?.trim()) {
          return { tool_message: 'Erro: nenhuma chave OpenRouter disponível. Configure sua chave em Configurações antes de gerar a apresentação.' }
        }
        const pipelineInput = {
          apiKey: ctx.apiKey,
          uid: ctx.uid,
          topic,
          description: instructions,
          sourceContext: String(args.source_context ?? '').trim() || topic,
          conversationContext: String(args.conversation_context ?? '').trim() || `Solicitação feita pelo Chat Orquestrador na conversa ${ctx.conversationId}.`,
          customInstructions: instructions,
          artifactType: 'apresentacao_v2' as StudioArtifactType,
          artifactLabel: 'Apresentação',
          legalArea: legalArea || undefined,
          presentationV2Briefing: buildPresentationV2Briefing(args, topic, instructions),
        }
        const deckResult = await import('../presentation-generation-pipeline-v2').then(module =>
          module.runPresentationGenerationPipelineV2(pipelineInput, (step, totalSteps, phase, meta) => ctx.emit({
            type: 'pipeline_progress',
            pipeline: 'presentation_v2',
            phase,
            progress: meta?.progressPercent ?? Math.round((step / Math.max(totalSteps, 1)) * 100),
            artifact_id: artifactId,
            ts: nowIso(),
          }), ctx.signal),
        )
        deckContent = deckResult.content
        deckResult.executions.forEach(execution => ctx.budget.recordUsage({
          total_tokens: (execution.tokens_in ?? 0) + (execution.tokens_out ?? 0),
          cost_usd: execution.cost_usd,
          model: execution.model,
          agent_name: execution.agent_name,
          phase: execution.phase,
        }))

        if (generateSlideImages) {
          try {
            const { uploadChatArtifactFile } = await import('../chat-artifact-storage')
            const media = await import('../presentation-generation-pipeline-v2').then(module =>
              module.generatePresentationV2MediaAssets(
                { apiKey: ctx.apiKey, uid: ctx.uid, topic, description: instructions },
                deckContent,
                (step, totalSteps, phase) => ctx.emit({
                  type: 'pipeline_progress',
                  pipeline: 'presentation_v2_media',
                  phase,
                  progress: Math.round((step / Math.max(totalSteps, 1)) * 100),
                  artifact_id: artifactId,
                  ts: nowIso(),
                }),
                ctx.signal,
                { imageModelOverride: designerModel },
              ),
            )
            for (const visual of media.slideVisuals) {
              const stored = await uploadChatArtifactFile({
                userId: ctx.uid,
                conversationId: ctx.conversationId,
                turnId: ctx.turnId,
                artifactId,
                exportId: `${artifactId}-slide-${visual.slideNumber}`,
                title: `${title}-slide-${visual.slideNumber}`,
                extension: visual.extension,
                blob: visual.blob,
              })
              if (stored.url) slideImages.set(visual.slideNumber, stored.url)
            }
            media.executions.forEach(execution => ctx.budget.recordUsage({
              total_tokens: (execution.tokens_in ?? 0) + (execution.tokens_out ?? 0),
              cost_usd: execution.cost_usd,
              model: execution.model,
              agent_name: execution.agent_name,
              phase: execution.phase,
            }))
          } catch (mediaErr) {
            if (isAbortError(mediaErr)) throw mediaErr
            // Slide visuals are best-effort: deliver the textual deck even
            // when the image step fails so the user still gets a deck.
            ctx.emit({
              type: 'super_skill_call',
              skill: 'generate_presentation',
              result_summary: `Visuais dos slides indisponíveis (${getErrorMessage(mediaErr)}); deck textual entregue.`,
              ts: nowIso(),
            })
          }
        }
      }

      const finalDeck = mergeRenderedSlideImages(deckContent, slideImages)

      const artifact: ChatArtifactRef = {
        artifact_id: artifactId,
        logical_document_id: artifactId,
        version: 1,
        title,
        kind: 'presentation',
        format: 'json',
        summary: `Apresentação literal gerada pelo chat${slideImages.size > 0 ? ` com ${slideImages.size} slide(s) renderizado(s)` : ''}.`,
        content_preview: finalDeck,
        is_latest: true,
        manifest_json: {
          topic,
          artifact_type: 'apresentacao_v2',
          rendered_slide_count: slideImages.size,
          designer_model: designerModel || null,
        },
        exports: [
          { label: 'JSON', format: 'json', status: 'planned' },
          { label: 'PPTX', format: 'pptx', status: 'planned' },
          { label: 'PDF', format: 'pdf', status: 'planned' },
          { label: 'ZIP', format: 'zip', status: 'planned' },
        ],
      }

      await deliverWorkPackage(ctx, {
        conversation_id: ctx.conversationId,
        turn_id: ctx.turnId,
        agent_key: 'chat_presentation_designer',
        task: `Gerar apresentação: ${title}`,
        thought: {
          summary: 'Apresentação literal gerada e registrada como artifact do chat.',
          decisions: ['Gerar o deck v2 e renderizar os visuais literais dos slides quando aprovado.'],
          next_steps: ['Abrir o viewer inline da apresentação e exportar em PPTX.'],
        },
        result_markdown: `Apresentação literal gerada: ${title}.`,
        artifacts: [artifact],
        created_at: nowIso(),
        completed_at: nowIso(),
      })

      ctx.emit({
        type: 'super_skill_call',
        skill: 'generate_presentation',
        result_summary: `Apresentação pronta${slideImages.size > 0 ? ` (${slideImages.size} slide[s] visual[is])` : ''}.`,
        ts: nowIso(),
      })

      return {
        tool_message:
          `Apresentação literal gerada com sucesso.\n` +
          `- Título: ${title}\n` +
          `- Slides com visual renderizado: ${slideImages.size}\n` +
          (designerModel ? `- Modelo de visuais: ${designerModel}\n` : '') +
          `- O artifact de apresentação foi registrado na trilha do chat com viewer inline e export PPTX.`,
      }
    } catch (err) {
      if (isAbortError(err)) throw err
      const message = getErrorMessage(err)
      ctx.emit({
        type: 'super_skill_call',
        skill: 'generate_presentation',
        result_summary: `Erro: ${message}`,
        ts: nowIso(),
      })
      return {
        tool_message:
          `Falha operacional ao gerar apresentação: ${message}. ` +
          'Configure os modelos do Chat em Configurações ou tente novamente.',
      }
    }
  },
}

// ── Super-Skill: Gerar Vídeo Literal ─────────────────────────────────────────

interface GenerateVideoArgs {
  prompt?: string
  title?: string
  duration_seconds?: number | string
  aspect_ratio?: string
  model?: string
  approved?: boolean
}

function inferVideoArtifactFormat(mimeType?: string): 'mp4' | 'webm' {
  return String(mimeType ?? '').toLowerCase().includes('webm') ? 'webm' : 'mp4'
}

const generateVideoSkill: Skill<GenerateVideoArgs> = {
  name: 'generate_video',
  description:
    'Gera vídeo literal por IA no chat — um clipe real produzido por um modelo de geração de vídeo ' +
    '(Veo, Kling, Wan, Sora, Runway e similares) — e entrega arquivo MP4 nativo para preview e download. ' +
    'Use quando o usuário pedir vídeo, clipe, animação ou MP4. ' +
    'Nunca entregue roteiro, slideshow ou descrição textual como substituto do vídeo gerado.',
  argsHint: {
    prompt: 'Descrição visual completa do vídeo: cena, sujeitos, movimento de câmera, estilo e ritmo.',
    title: 'Título curto para o arquivo de vídeo gerado.',
    duration_seconds: 'Duração alvo do clipe em segundos (padrão 8; faixa típica 4–20 conforme o modelo).',
    aspect_ratio: 'Proporção desejada. Ex.: 16:9, 9:16, 1:1.',
    model: 'Opcional: modelo de vídeo específico hospedado pelo provedor configurado (ex.: veo-3, kling-2.5, wan-2.5).',
    approved: 'true apenas depois de o usuário aprovar explicitamente a geração literal de vídeo',
  },
  async run(args, ctx): Promise<SkillResult> {
    const prompt = String(args.prompt ?? '').trim()
    const title = String(args.title ?? '').trim() || 'Vídeo gerado pelo chat'
    const aspectRatio = String(args.aspect_ratio ?? '').trim() || '16:9'
    const requestedModel = String(args.model ?? '').trim() || undefined
    const durationSeconds = clampNumber(args.duration_seconds, 8, 2, 30)

    if (!prompt) {
      return { tool_message: 'Erro: "prompt" é obrigatório para gerar vídeo literal.' }
    }

    const { getExternalVideoProviderDiagnostics, isExternalVideoProviderConfigured } = await import('../external-video-provider')
    if (!ctx.mock && !isExternalVideoProviderConfigured()) {
      const diagnostics = getExternalVideoProviderDiagnostics()
      return {
        tool_message:
          'Falha operacional: nenhum provedor de geração de vídeo real está configurado. ' +
          'Configure VITE_EXTERNAL_VIDEO_PROVIDER e VITE_EXTERNAL_VIDEO_PROVIDER_ENDPOINT apontando para um ' +
          'agregador de vídeo real (ex.: fal.ai, Replicate, Veo) capaz de receber um prompt e devolver o MP4. ' +
          (diagnostics.blockingErrors.length > 0 ? `Detalhe: ${diagnostics.blockingErrors.join(' ')} ` : '') +
          'Não substitua o vídeo por roteiro, slideshow ou descrição textual.',
      }
    }

    if (!normalizeSideEffectApproval(args.approved)) {
      return requestApprovalForSkill(ctx, {
        title: `Gerar vídeo literal: ${clip(title, 80)}`,
        summary: [
          'O chat vai solicitar um clipe de vídeo real a um provedor de geração de vídeo por IA, salvar o arquivo no Storage e exibir o player na conversa.',
          `Título: ${title}`,
          `Duração alvo: ${durationSeconds}s`,
          `Proporção: ${aspectRatio}`,
          requestedModel ? `Modelo de vídeo: ${requestedModel}` : 'Modelo de vídeo: padrão do provedor',
        ].filter(Boolean).join('\n'),
        riskLevel: 'high',
        permissions: ['write', 'network'],
        resumeTool: 'generate_video',
        resumeArgs: {
          prompt,
          title,
          duration_seconds: durationSeconds,
          aspect_ratio: aspectRatio,
          model: requestedModel,
          approved: true,
        },
      })
    }

    const artifactId = makeChatArtifactId('chat-video')
    ctx.emit({
      type: 'super_skill_call',
      skill: 'generate_video',
      args_summary: clip(prompt, 180),
      result_summary: `Iniciando geração literal de vídeo: ${clip(title, 100)}`,
      ts: nowIso(),
    })

    try {
      const { uploadChatArtifactFile } = await import('../chat-artifact-storage')
      let videoUrl: string
      let mimeType = 'video/mp4'
      let storagePath: string | undefined
      let providerLabel = 'mock'

      if (ctx.mock) {
        const stored = await uploadChatArtifactFile({
          userId: ctx.uid,
          conversationId: ctx.conversationId,
          turnId: ctx.turnId,
          artifactId,
          exportId: `${artifactId}-mp4`,
          title,
          extension: '.mp4',
          blob: new Blob(['mock-video'], { type: 'video/mp4' }),
        })
        videoUrl = stored.url
        storagePath = stored.path
      } else {
        const { requestExternalVideoClip } = await import('../external-video-provider')
        const clipResult = await requestExternalVideoClip({
          prompt,
          durationSeconds,
          aspectRatio,
          model: requestedModel,
          signal: ctx.signal,
        })
        if (!clipResult?.url) {
          return {
            tool_message:
              'Falha operacional: o provedor de vídeo não retornou um arquivo final. ' +
              'Tente novamente ou verifique o endpoint/modelo do provedor de vídeo.',
          }
        }
        mimeType = clipResult.mimeType || 'video/mp4'
        providerLabel = clipResult.provider
        // Persist the clip in our Storage for a durable download; if the
        // provider URL cannot be fetched (CORS, expiry), keep it directly.
        videoUrl = clipResult.url
        try {
          const response = await fetch(clipResult.url, { signal: ctx.signal })
          if (response.ok) {
            const blob = await response.blob()
            const stored = await uploadChatArtifactFile({
              userId: ctx.uid,
              conversationId: ctx.conversationId,
              turnId: ctx.turnId,
              artifactId,
              exportId: `${artifactId}-${inferVideoArtifactFormat(mimeType)}`,
              title,
              extension: `.${inferVideoArtifactFormat(mimeType)}`,
              blob,
            })
            if (stored.url) {
              videoUrl = stored.url
              storagePath = stored.path
            }
          }
        } catch (fetchErr) {
          if (isAbortError(fetchErr)) throw fetchErr
          // Provider URL kept as-is — still a real, playable video.
        }
      }

      const format = inferVideoArtifactFormat(mimeType)
      const extension = `.${format}`
      const exportId = `${artifactId}-${format}`

      ctx.budget.recordUsage({
        source_type: 'chat_orchestrator',
        source_id: ctx.turnId,
        created_at: nowIso(),
        function_key: 'chat_orchestrator',
        function_label: 'Orquestrador (Chat)',
        phase: 'generate_video',
        phase_label: 'Chat: generate_video',
        agent_name: 'Gerador de Vídeo Literal',
        model: requestedModel || providerLabel,
        model_label: requestedModel || providerLabel,
        total_tokens: 0,
        cost_usd: 0,
        duration_ms: 0,
        execution_state: 'completed',
      })

      const readyExport: ChatArtifactExportRef = {
        export_id: exportId,
        label: format.toUpperCase(),
        format,
        status: 'ready',
        mime_type: mimeType,
        extension,
        download_url: videoUrl,
        storage_path: storagePath,
        attempt_count: 1,
        last_attempt_at: nowIso(),
      }
      const artifact: ChatArtifactRef = {
        artifact_id: artifactId,
        logical_document_id: artifactId,
        version: 1,
        title,
        kind: 'video',
        format,
        summary: `Vídeo literal gerado por IA no chat (${durationSeconds}s, provedor ${providerLabel}).`,
        content_preview: videoUrl,
        download_url: videoUrl,
        storage_path: storagePath,
        mime_type: mimeType,
        extension,
        is_latest: true,
        manifest_json: {
          prompt,
          duration_seconds: durationSeconds,
          aspect_ratio: aspectRatio,
          model: requestedModel,
          provider: providerLabel,
          videoUrl,
          storage_path: storagePath,
        },
        exports: [readyExport],
      }

      await deliverWorkPackage(ctx, {
        conversation_id: ctx.conversationId,
        turn_id: ctx.turnId,
        agent_key: 'chat_video_generator',
        task: `Gerar vídeo literal: ${title}`,
        thought: {
          summary: 'Vídeo literal gerado por um provedor de geração de vídeo por IA e persistido como artifact do chat.',
          decisions: ['Solicitar clipe real ao provedor de vídeo em vez de entregar roteiro ou slideshow.'],
          next_steps: ['Reproduzir o player de vídeo inline e permitir o download do arquivo nativo.'],
        },
        result_markdown: `Vídeo literal gerado: ${title}.`,
        artifacts: [artifact],
        created_at: nowIso(),
        completed_at: nowIso(),
      })

      ctx.emit({
        type: 'super_skill_call',
        skill: 'generate_video',
        result_summary: `Vídeo pronto para preview/download: ${format.toUpperCase()} (${durationSeconds}s)`,
        ts: nowIso(),
      })

      return {
        tool_message:
          `Vídeo literal gerado com sucesso.\n` +
          `- Título: ${title}\n` +
          `- Duração: ${durationSeconds}s\n` +
          `- Formato: ${format.toUpperCase()}\n` +
          `- Provedor: ${providerLabel}${requestedModel ? ` · modelo ${requestedModel}` : ''}\n` +
          `- O artifact de vídeo foi registrado na trilha do chat com player e download.`,
      }
    } catch (err) {
      if (isAbortError(err)) throw err
      const message = getErrorMessage(err)
      ctx.emit({
        type: 'super_skill_call',
        skill: 'generate_video',
        result_summary: `Erro: ${message}`,
        ts: nowIso(),
      })
      return {
        tool_message:
          `Falha operacional ao gerar vídeo literal: ${message}. ` +
          'Verifique o provedor de vídeo configurado ou tente novamente. Não substitua o vídeo por roteiro ou slideshow.',
      }
    }
  },
}

// ── Super-Skill: Gerar Documento Jurídico ─────────────────────────────────────

interface GenerateDocumentArgs {
  document_type?: string
  title?: string
  description?: string
  /** Fatos, perguntas ou contexto jurídico fornecido pelo usuário. */
  content?: string
  /** Variante de template (ex.: "generic", "apelacao", "merito"). */
  template_variant?: string
  /** Área do direito (ex.: "civil", "penal", "trabalhista"). */
  legal_area?: string
  /** Deve ser true apenas depois de aprovação explícita do usuário no chat. */
  approved?: boolean
}

const generateDocumentSkill: Skill<GenerateDocumentArgs> = {
  name: 'generate_document',
  description:
    'Gera um documento jurídico completo usando os pipelines especializados. ' +
    'Tipos disponíveis: ' +
    PIPELINE_DOCUMENT_TYPES.map(d => `${d} (${PIPELINE_DOCUMENT_LABELS[d]})`).join(', ') +
    '. Use quando o usuário solicitar a redação de um documento jurídico formal ' +
    '(petição, parecer, contestação, recurso, sentença, etc.).',
  argsHint: {
    document_type: `Tipo de documento. Um de: ${PIPELINE_DOCUMENT_TYPES.join(', ')}`,
    title: 'Título descritivo do documento (ex.: "Petição Inicial — Indenização por Danos Morais")',
    description: 'Breve descrição do objetivo do documento',
    content:
      'Fatos, perguntas jurídicas, teses e contexto que o pipeline deve usar. ' +
      'Quanto mais detalhado, melhor o resultado.',
    template_variant: 'Variante de template (opcional). Ex.: "apelacao", "merito", "generic".',
    legal_area: 'Área do direito (opcional). Ex.: "civil", "penal", "trabalhista".',
    approved: 'true apenas depois de o usuário aprovar explicitamente no chat',
  },
  async run(args, ctx): Promise<SkillResult> {
    const documentType = String(args.document_type ?? '').trim().toLowerCase()
    const title = String(args.title ?? '').trim()
    const description = String(args.description ?? '').trim()
    const content = String(args.content ?? '').trim()
    const templateVariant = String(args.template_variant ?? '').trim() || 'generic'
    const legalArea = String(args.legal_area ?? '').trim()

    // ── Validação ─────────────────────────────────────────────────────────
    if (!documentType) {
      return { tool_message: 'Erro: "document_type" é obrigatório. Informe o tipo de documento jurídico a ser gerado.' }
    }
    if (!PIPELINE_DOCUMENT_TYPES.includes(documentType as PipelineDocumentType)) {
      return {
        tool_message: `Erro: tipo de documento "${documentType}" não reconhecido. Tipos disponíveis: ${PIPELINE_DOCUMENT_TYPES.join(', ')}.`,
      }
    }
    if (!content) {
      return { tool_message: 'Erro: "content" é obrigatório. Forneça os fatos, perguntas e contexto jurídico para o pipeline.' }
    }

    const label = PIPELINE_DOCUMENT_LABELS[documentType as PipelineDocumentType]

    if (!normalizeSideEffectApproval(args.approved)) {
      return requestApprovalForSkill(ctx, {
        title: `Gerar ${label}`,
        summary: [
          `O chat vai criar um documento persistente em /documents usando o pipeline Documento V3.`,
          title ? `Título: ${title}` : '',
          description ? `Descrição: ${description}` : '',
          `Tipo: ${label}`,
          legalArea ? `Área: ${legalArea}` : '',
          'A geração chama modelos LLM, grava no Firestore e pode gerar exports no card da trilha.',
        ].filter(Boolean).join('\n'),
        riskLevel: 'medium',
        permissions: ['write', 'network'],
        resumeTool: 'generate_document',
        resumeArgs: {
          document_type: documentType,
          title,
          description,
          content,
          template_variant: templateVariant,
          legal_area: legalArea,
          approved: true,
        },
      })
    }

    // ── Emitir evento de início ────────────────────────────────────────────
    const startEvent: ChatTrailEvent = {
      type: 'super_skill_call',
      skill: `Pipeline: ${label}`,
      result_summary: `Iniciando geração de ${label}${title ? `: "${title}"` : ''}`,
      ts: nowIso(),
    }
    ctx.emit(startEvent)

    // ── Chamar pipeline frontend real ──────────────────────────────────────
    try {
      let docId: string
      let docStatus = 'concluido'
      let documentText = ''
      const legalAreas = legalArea ? [legalArea] : []

      if (ctx.mock) {
        docId = `mock-doc-${Date.now()}`
        documentText = [`# ${title || label}`, '', content].join('\n')
      } else {
        const { createDocumentV3, generateDocumentV3 } = await import('../document-v3-orchestrator')
        const { getDocument } = await import('../firestore-service')
        const created = await createDocumentV3(ctx.uid, {
          document_type_id: documentType,
          original_request: content,
          template_variant: templateVariant,
          legal_area_ids: legalAreas,
          request_context: { title, description, source: 'chat_orchestrator' },
        })
        docId = created.id
        await generateDocumentV3(
          ctx.uid,
          docId,
          documentType,
          content,
          legalAreas,
          { title, description, source: 'chat_orchestrator' },
          progress => ctx.emit({
            type: 'pipeline_progress',
            pipeline: 'document_v3',
            phase: progress.stageLabel || progress.phase || progress.message,
            progress: progress.percent,
            artifact_id: docId,
            ts: nowIso(),
          }),
          null,
          null,
          { signal: ctx.signal },
        )
        const savedDocument = await getDocument(ctx.uid, docId)
        docStatus = String(savedDocument?.status ?? 'concluido')
        documentText = String(savedDocument?.texto_completo ?? '')
      }

      // ── Emitir evento de conclusão ─────────────────────────────────────
      const completeEvent: ChatTrailEvent = {
        type: 'super_skill_call',
        skill: `Pipeline: ${label}`,
        result_summary: `Documento ${docId} criado com status "${docStatus}". Acesse o Estúdio de Artefatos para acompanhar.`,
        ts: nowIso(),
      }
      ctx.emit(completeEvent)

      const artifact: ChatArtifactRef = {
        artifact_id: `document-v3-${docId}`,
        logical_document_id: `document-v3-${docId}`,
        version: 1,
        title: title || `${label} — ${clip(content, 60)}`,
        kind: 'legal_document',
        format: 'markdown',
        summary: `Documento ${docId} gerado pelo pipeline Documento V3 com status ${docStatus}.`,
        content_preview: documentText || content,
        manifest_json: {
          document_id: docId,
          document_type_id: documentType,
          label,
          status: docStatus,
          legal_area_ids: legalAreas,
          template_variant: templateVariant,
        },
        exports: [
          { label: 'Markdown', format: 'markdown', status: 'planned' },
          { label: 'DOCX', format: 'docx', status: 'planned' },
          { label: 'PDF', format: 'pdf', status: 'planned' },
          { label: 'JSON', format: 'json', status: 'planned' },
          { label: 'ZIP', format: 'zip', status: 'planned' },
        ],
      }
      const workPackage = await deliverWorkPackage(ctx, {
        conversation_id: ctx.conversationId,
        turn_id: ctx.turnId,
        agent_key: 'generate_document',
        task: `Gerar ${label}`,
        thought: {
          summary: `Pipeline Documento V3 executado para criar ${label}.`,
          decisions: ['Usar Documento V3 browser-native em vez de API REST inativa.'],
          risks: documentText ? undefined : ['O texto final não pôde ser relido; use o documento persistido como fonte de verdade.'],
          next_steps: ['Revisar o documento antes de protocolo ou uso externo.'],
        },
        result_markdown: `Documento ${docId} gerado com status ${docStatus}.`,
        artifacts: [artifact],
        created_at: nowIso(),
        completed_at: nowIso(),
      })

      const readyExports = workPackage.artifacts?.[0]?.exports
        ?.filter(exportRef => exportRef.status === 'ready')
        .map(exportRef => exportRef.label)
        .join(', ')

      return {
        tool_message:
          `Documento de ${label} gerado com sucesso.\n` +
          `- ID: ${docId}\n` +
          `- Status: ${docStatus}\n` +
          (readyExports ? `- Exports prontos: ${readyExports}\n` : '') +
          `- O documento foi registrado como artefato na trilha do chat.`,
      }
    } catch (err: unknown) {
      if (isAbortError(err)) throw err
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      const errorEvent: ChatTrailEvent = {
        type: 'super_skill_call',
        skill: `Pipeline: ${label}`,
        result_summary: `Erro: ${message}`,
        ts: nowIso(),
      }
      ctx.emit(errorEvent)
      return { tool_message: `Falha ao executar pipeline de ${label}: ${message}.` }
    }
  },
}

// ── Super-Skill: Consultar Status de Documento ────────────────────────────────

interface CheckDocumentArgs {
  document_id?: string
}

const checkDocumentStatusSkill: Skill<CheckDocumentArgs> = {
  name: 'check_document_status',
  description:
    'Consulta o status de um documento gerado anteriormente por um pipeline. ' +
    'Use quando o usuário perguntar sobre o andamento de um documento.',
  argsHint: {
    document_id: 'ID do documento (retornado pelo generate_document)',
  },
  async run(args, ctx): Promise<SkillResult> {
    const documentId = String(args.document_id ?? '').trim()
    if (!documentId) {
      return { tool_message: 'Erro: "document_id" é obrigatório.' }
    }

    const startEvent: ChatTrailEvent = {
      type: 'super_skill_call',
      skill: 'Status de Documento',
      result_summary: `Consultando status do documento ${documentId}`,
      ts: nowIso(),
    }
    ctx.emit(startEvent)

    try {
      let responseBody: unknown

      if (ctx.mock) {
        responseBody = {
          id: documentId,
          status: 'concluido',
          document_type_id: 'peticao_inicial',
          title: 'Documento Exemplo',
          updated_at: nowIso(),
        }
      } else {
        const { getDocument } = await import('../firestore-service')
        const document = await getDocument(ctx.uid, documentId)
        if (!document) return { tool_message: `Documento ${documentId} não encontrado ou inacessível.` }
        responseBody = document
      }

      const doc = responseBody as Record<string, unknown>
      const status = String(doc.status ?? 'desconhecido')

      const statusLabels: Record<string, string> = {
        processando: '🔄 Em processamento',
        concluido: '✅ Concluído',
        erro: '❌ Erro',
        cancelado: '⏹️ Cancelado',
      }

      const statusEvent: ChatTrailEvent = {
        type: 'super_skill_call',
        skill: 'Status de Documento',
        result_summary: `Documento ${documentId}: ${statusLabels[status] ?? status}`,
        ts: nowIso(),
      }
      ctx.emit(statusEvent)

      return {
        tool_message:
          `Status do documento ${documentId}:\n` +
          `- Status: ${statusLabels[status] ?? status}\n` +
          `- Tipo: ${doc.document_type_id ?? '—'}\n` +
          `- Título: ${doc.title ?? '—'}\n` +
          (status === 'concluido'
            ? '- O documento está pronto. Informe ao usuário que ele pode acessá-lo no Estúdio de Artefatos.'
            : '- O documento ainda está em processamento. Sugira ao usuário que aguarde e verifique novamente.'),
      }
    } catch (err: unknown) {
      if (isAbortError(err)) throw err
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return { tool_message: `Erro ao consultar documento ${documentId}: ${message}` }
    }
  },
}

// ── Super-Skill: Pesquisa Jurisprudencial via DataJud ─────────────────────────

interface SearchJurisprudenceArgs {
  query?: string
  tribunal?: string
  max_results?: number
}

const searchJurisprudenceSkill: Skill<SearchJurisprudenceArgs> = {
  name: 'search_jurisprudence',
  description:
    'Pesquisa jurisprudência nos tribunais brasileiros via integração com DataJud. ' +
    'Use quando o usuário precisar de precedentes, súmulas ou decisões sobre um tema jurídico.',
  argsHint: {
    query: 'Termos de busca (ex.: "danos morais responsabilidade civil")',
    tribunal: 'Sigla do tribunal (opcional). Ex.: "STJ", "TJSP", "TRF4".',
    max_results: 'Número máximo de resultados (padrão: 5, máximo: 10)',
  },
  async run(args, ctx): Promise<SkillResult> {
    const query = String(args.query ?? '').trim()
    if (!query) {
      return { tool_message: 'Erro: "query" é obrigatória para pesquisa de jurisprudência.' }
    }
    const tribunal = String(args.tribunal ?? '').trim() || undefined
    const maxResults = Math.min(Number(args.max_results ?? 5) || 5, 10)

    const startEvent: ChatTrailEvent = {
      type: 'super_skill_call',
      skill: 'Pesquisa Jurisprudencial',
      result_summary: `Pesquisando: "${query}"${tribunal ? ` no ${tribunal}` : ''}`,
      ts: nowIso(),
    }
    ctx.emit(startEvent)

    try {
      let results: Array<Record<string, unknown>>
      let formattedNativeResults = ''

      if (ctx.mock) {
        results = [
          {
            numero_processo: '0001234-56.2023.8.26.0100',
            tribunal: 'TJSP',
            relator: 'Des. Exemplo',
            data_julgamento: '2024-03-15',
            ementa: 'EMENTA MOCK — Danos morais configurados. Valor fixado em R$ 10.000,00.',
          },
          {
            numero_processo: 'REsp 1.234.567/SP',
            tribunal: 'STJ',
            relator: 'Min. Exemplo',
            data_julgamento: '2024-02-20',
            ementa: 'EMENTA MOCK — Recurso especial. Responsabilidade civil subjetiva.',
          },
        ]
      } else {
        const { ALL_TRIBUNALS, formatDataJudResults, searchDataJud } = await import('../datajud-service')
        const normalizedTribunal = tribunal?.toLowerCase()
        const tribunals = normalizedTribunal
          ? ALL_TRIBUNALS.filter(item => item.alias === normalizedTribunal || item.name.toLowerCase().includes(normalizedTribunal))
          : undefined
        if (normalizedTribunal && !tribunals?.length) {
          return { tool_message: `Tribunal "${tribunal}" não reconhecido para pesquisa DataJud.` }
        }
        const dataJudResult = await searchDataJud(query, {
          tribunals,
          maxPerTribunal: Math.max(1, Math.min(maxResults, 5)),
          maxTotal: maxResults,
          enrichMissingText: true,
          maxTextEnrichment: Math.min(maxResults, 5),
          semanticRerank: false,
          signal: ctx.signal,
        })
        results = dataJudResult.results.slice(0, maxResults) as unknown as Array<Record<string, unknown>>
        formattedNativeResults = formatDataJudResults(dataJudResult.results.slice(0, maxResults))
      }

      if (!results.length) {
        const emptyEvent: ChatTrailEvent = {
          type: 'super_skill_call',
          skill: 'Pesquisa Jurisprudencial',
          result_summary: `Nenhum resultado para "${query}"`,
          ts: nowIso(),
        }
        ctx.emit(emptyEvent)
        return { tool_message: `Nenhum resultado encontrado para "${query}". Sugira refinar a busca ou tentar termos mais amplos.` }
      }

      const summary = formattedNativeResults || results
        .map(
          (r, i) =>
            `${i + 1}. **${r.numero_processo ?? 'N/A'}** (${r.tribunal ?? 'N/A'})\n` +
            `   Relator: ${r.relator ?? 'N/A'} | Data: ${r.data_julgamento ?? 'N/A'}\n` +
            `   ${clip(String(r.ementa ?? 'Ementa não disponível'), 300)}`,
        )
        .join('\n\n')

      const resultEvent: ChatTrailEvent = {
        type: 'super_skill_call',
        skill: 'Pesquisa Jurisprudencial',
        result_summary: `${results.length} resultado(s) para "${query}"`,
        ts: nowIso(),
      }
      ctx.emit(resultEvent)

      return {
        tool_message:
          `📚 Resultados da pesquisa para "${query}"${tribunal ? ` (${tribunal})` : ''}:\n\n${summary}\n\n` +
          `Use estes precedentes para fundamentar a resposta ao usuário.`,
      }
    } catch (err: unknown) {
      if (isAbortError(err)) throw err
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return { tool_message: `Erro na pesquisa jurisprudencial: ${message}` }
    }
  },
}

// ── Super-Skill: Análise de Tese Jurídica ─────────────────────────────────────

interface AnalyzeThesisArgs {
  thesis?: string
  legal_area?: string
}

const analyzeThesisSkill: Skill<AnalyzeThesisArgs> = {
  name: 'analyze_thesis',
  description:
    'Analisa uma tese jurídica consultando o Banco de Teses. ' +
    'Use quando o usuário quiser validar uma estratégia ou verificar a viabilidade de um argumento.',
  argsHint: {
    thesis: 'A tese jurídica a ser analisada (ex.: "A inversão do ônus da prova em relações de consumo")',
    legal_area: 'Área do direito (opcional). Ex.: "consumidor", "civil".',
  },
  async run(args, ctx): Promise<SkillResult> {
    const thesis = String(args.thesis ?? '').trim()
    if (!thesis) {
      return { tool_message: 'Erro: "thesis" é obrigatória.' }
    }
    const legalArea = String(args.legal_area ?? '').trim() || undefined

    const startEvent: ChatTrailEvent = {
      type: 'super_skill_call',
      skill: 'Análise de Tese',
      result_summary: `Analisando tese: "${clip(thesis, 120)}"`,
      ts: nowIso(),
    }
    ctx.emit(startEvent)

    try {
      let analysisText: string

      if (ctx.mock) {
        analysisText =
          `**Análise da Tese (modo demonstração)**\n\n` +
          `**Tese:** ${thesis}\n` +
          `**Área:** ${legalArea ?? 'Geral'}\n\n` +
          `**Viabilidade:** Média-Alta\n` +
          `**Fundamentos favoráveis:**\n` +
          `- Precedente STJ REsp 1.234.567/SP (2023)\n` +
          `- Súmula 618 do STJ\n` +
          `- Doutrina majoritária de Nelson Nery Jr.\n\n` +
          `**Riscos:**\n` +
          `- Divergência doutrinária em tribunais regionais\n` +
          `- Necessidade de distinção fática cuidadosa\n\n` +
          `**Recomendação:** Tese viável com boa fundamentação. Recomenda-se citar precedentes do STJ.`
      } else {
        const { listTheses } = await import('../firestore-service')
        const { items, total } = await listTheses(ctx.uid, {
          q: thesis,
          legalAreaId: legalArea,
          limit: 8,
        })
        const matches = items.map((item, idx) => [
          `${idx + 1}. **${item.title}**`,
          item.summary ? `   Resumo: ${clip(item.summary, 300)}` : '',
          item.content ? `   Conteúdo: ${clip(item.content, 500)}` : '',
          item.legal_area_id ? `   Área: ${item.legal_area_id}` : '',
          item.tags?.length ? `   Tags: ${item.tags.slice(0, 6).join(', ')}` : '',
        ].filter(Boolean).join('\n')).join('\n\n')
        analysisText = [
          `**Consulta ao Banco de Teses do usuário**`,
          `**Tese consultada:** ${thesis}`,
          legalArea ? `**Área filtrada:** ${legalArea}` : '',
          `**Resultados encontrados:** ${items.length}${total > items.length ? ` de ${total}` : ''}`,
          '',
          matches || 'Nenhuma tese semelhante foi encontrada no banco do usuário.',
          '',
          items.length
            ? 'Use as teses acima como memória jurídica privada do usuário e compare aderência, lacunas e riscos antes de recomendar estratégia.'
            : 'Recomende pesquisa complementar e, se fizer sentido, sugira cadastrar a tese após validação.',
        ].filter(Boolean).join('\n')
      }

      const resultEvent: ChatTrailEvent = {
        type: 'super_skill_call',
        skill: 'Análise de Tese',
        result_summary: `Análise concluída para: "${clip(thesis, 80)}"`,
        ts: nowIso(),
      }
      ctx.emit(resultEvent)

      return {
        tool_message: `📊 Análise da tese jurídica:\n\n${analysisText}\n\nUse esta análise para fundamentar a resposta ao usuário.`,
      }
    } catch (err: unknown) {
      if (isAbortError(err)) throw err
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return { tool_message: `Erro na análise de tese: ${message}` }
    }
  },
}

// ── Super-Skill: Gerar Artefato no Caderno de Pesquisa ───────────────────────

interface GenerateStudioArtifactArgs {
  artifact_type?: string
  topic?: string
  notebook_id?: string
  notebook_title?: string
  source_context?: string
  conversation_context?: string
  instructions?: string
  legal_area?: string
  slide_count?: number | string
  duration_minutes?: number | string
  objective?: string
  audience?: string
  core_message?: string
  success_criteria?: string
  depth?: string
  slide_density?: string
  evidence_mode?: string
  tone?: string
  visual_style?: string
  proof_obligations?: string
  institutional_constraints?: string
  constraints?: string
  source_priority?: string
  images?: boolean | string
  audio?: boolean | string
  video?: boolean | string
  charts?: boolean | string
  diagrams?: boolean | string
  generate_audio?: boolean | string
  literal_audio?: boolean | string
  voice?: string
  tts_model?: string
  generate_video?: boolean | string
  video_production?: boolean | string
  clip_duration_seconds?: number | string
  approved?: boolean
}

const generateStudioArtifactSkill: Skill<GenerateStudioArtifactArgs> = {
  name: 'generate_studio_artifact',
  description:
    'Gera um artefato do Estúdio do Caderno de Pesquisa e salva no notebook do usuário. ' +
    `Tipos disponíveis: ${STUDIO_CHAT_ARTIFACT_TYPES.map(type => `${type} (${STUDIO_CHAT_ARTIFACT_LABELS[type]})`).join(', ')}. ` +
    'Use quando o usuário pedir resumo, relatório, mapa mental, roteiro, tabela, quiz, apresentação ou outro artefato de estudo/pesquisa.',
  argsHint: {
    artifact_type: `Tipo de artefato. Um de: ${STUDIO_CHAT_ARTIFACT_TYPES.join(', ')}`,
    topic: 'Tema central do artefato a gerar.',
    notebook_id: 'ID do caderno existente. Se omitido, cria um novo caderno para o tema.',
    notebook_title: 'Título do novo caderno quando notebook_id não for informado.',
    source_context: 'Texto/fonte principal para o Estúdio usar. Se omitido e houver notebook_id, usa as fontes do caderno.',
    conversation_context: 'Contexto conversacional adicional para orientar o artefato.',
    instructions: 'Instruções customizadas de tom, formato ou foco.',
    legal_area: 'Área jurídica opcional para enriquecer o prompt.',
    slide_count: 'Para apresentacao_v2: número de slides entre 3 e 24.',
    audience: 'Para apresentacao_v2: público-alvo do deck.',
    objective: 'Para apresentacao_v2: objetivo narrativo ou decisão buscada.',
    depth: 'Para apresentacao_v2: executiva, intermediaria, profunda ou tecnica.',
    images: 'Para apresentacao_v2: true/false para planejar imagens.',
    charts: 'Para apresentacao_v2: true/false para planejar gráficos.',
    generate_audio: 'Para audio_script: true para gerar também o áudio literal por TTS e salvar o MP3 no caderno.',
    voice: 'Para audio_script com TTS: voz desejada, quando suportada pelo modelo configurado.',
    tts_model: 'Para audio_script com TTS: modelo TTS opcional, ex.: openai/tts-1-hd.',
    generate_video: 'Para video_script: true para gerar também o pacote do Estúdio de Vídeo, sem mídia literal por padrão.',
    clip_duration_seconds: 'Para generate_video: duração alvo dos clips em segundos, entre 4 e 20.',
    approved: 'true apenas depois de o usuário aprovar explicitamente no chat',
  },
  async run(args, ctx): Promise<SkillResult> {
    const artifactTypeRaw = String(args.artifact_type ?? '').trim().toLowerCase()
    const topic = String(args.topic ?? '').trim()
    const notebookIdArg = String(args.notebook_id ?? '').trim()
    const notebookTitle = String(args.notebook_title ?? '').trim()
    const sourceContextArg = String(args.source_context ?? '').trim()
    const conversationContextArg = String(args.conversation_context ?? '').trim()
    const instructions = String(args.instructions ?? '').trim()
    const legalArea = String(args.legal_area ?? '').trim()
    const shouldGenerateLiteralAudio = artifactTypeRaw === 'audio_script' && (toBoolean(args.generate_audio, false) || toBoolean(args.literal_audio, false))
    const shouldGenerateVideoProduction = artifactTypeRaw === 'video_script' && (toBoolean(args.generate_video, false) || toBoolean(args.video_production, false))

    if (!artifactTypeRaw) {
      return { tool_message: 'Erro: "artifact_type" é obrigatório para gerar um artefato do Estúdio.' }
    }
    if (!(STUDIO_CHAT_ARTIFACT_TYPES as readonly string[]).includes(artifactTypeRaw)) {
      return {
        tool_message: `Erro: tipo de artefato "${artifactTypeRaw}" não reconhecido. Tipos disponíveis: ${STUDIO_CHAT_ARTIFACT_TYPES.join(', ')}.`,
      }
    }
    if (!topic) {
      return { tool_message: 'Erro: "topic" é obrigatório. Informe o tema central do artefato.' }
    }

    const artifactType = artifactTypeRaw as StudioChatArtifactType
    const label = STUDIO_CHAT_ARTIFACT_LABELS[artifactType]

    if (!normalizeSideEffectApproval(args.approved)) {
      return requestApprovalForSkill(ctx, {
        title: `Gerar ${label} no Caderno de Pesquisa`,
        summary: [
          `O chat vai executar o pipeline do Estúdio do Caderno e salvar um artefato persistente.`,
          `Tipo: ${label}`,
          `Tema: ${topic}`,
          notebookIdArg ? `Caderno existente: ${notebookIdArg}` : `Sem caderno informado: será criado um novo caderno.`,
          shouldGenerateLiteralAudio ? 'Também será gerado áudio literal por TTS e salvo no Cloud Storage do caderno.' : '',
          shouldGenerateVideoProduction ? 'Também será gerado um pacote do Estúdio de Vídeo, salvo como artefato adicional no caderno.' : '',
          'A geração chama modelos LLM e grava em /research_notebooks.',
        ].filter(Boolean).join('\n'),
        riskLevel: 'medium',
        permissions: ['write', 'network'],
        resumeTool: 'generate_studio_artifact',
        resumeArgs: {
          artifact_type: artifactType,
          topic,
          notebook_id: notebookIdArg,
          notebook_title: notebookTitle,
          source_context: sourceContextArg,
          conversation_context: conversationContextArg,
          instructions,
          legal_area: legalArea,
          slide_count: args.slide_count,
          duration_minutes: args.duration_minutes,
          objective: args.objective,
          audience: args.audience,
          core_message: args.core_message,
          success_criteria: args.success_criteria,
          depth: args.depth,
          slide_density: args.slide_density,
          evidence_mode: args.evidence_mode,
          tone: args.tone,
          visual_style: args.visual_style,
          proof_obligations: args.proof_obligations,
          institutional_constraints: args.institutional_constraints,
          constraints: args.constraints,
          source_priority: args.source_priority,
          images: args.images,
          audio: args.audio,
          video: args.video,
          charts: args.charts,
          diagrams: args.diagrams,
          generate_audio: args.generate_audio,
          literal_audio: args.literal_audio,
          voice: args.voice,
          tts_model: args.tts_model,
          generate_video: args.generate_video,
          video_production: args.video_production,
          clip_duration_seconds: args.clip_duration_seconds,
          approved: true,
        },
      })
    }

    const artifactId = makeChatArtifactId('studio-artifact')
    const startEvent: ChatTrailEvent = {
      type: 'super_skill_call',
      skill: `Notebook Studio: ${label}`,
      result_summary: `Iniciando geração de ${label}: "${clip(topic, 100)}"`,
      ts: nowIso(),
    }
    ctx.emit(startEvent)

    try {
      let notebookId = notebookIdArg
      let content = ''
      let executionCount = 0
      let format: StudioArtifact['format'] = 'markdown'
      let literalAudioExport: ChatArtifactExportRef | null = null
      let videoProductionChatArtifact: ChatArtifactRef | null = null

      if (ctx.mock) {
        notebookId = notebookId || 'mock-notebook'
        content = artifactType === 'apresentacao_v2'
          ? buildMockPresentationV2Content(topic, label)
          : [`# ${label}: ${topic}`, '', sourceContextArg || 'Conteúdo gerado em modo demonstração.'].join('\n')
        format = artifactType === 'apresentacao_v2' ? 'json' : 'markdown'
      } else {
        if (!ctx.apiKey?.trim()) {
          return { tool_message: 'Erro: nenhuma chave OpenRouter disponível. Configure sua chave em Configurações antes de gerar artefatos do Estúdio.' }
        }

        const [{ createResearchNotebook, getResearchNotebook }, { isStructuredArtifactType }, { runStudioPipeline }, { persistStudioArtifactToNotebook }] = await Promise.all([
          import('../firestore-service'),
          import('../artifact-parsers'),
          import('../notebook-studio-pipeline'),
          import('../notebook-studio-artifact-persistence'),
        ])

        let notebook = notebookId ? await getResearchNotebook(ctx.uid, notebookId) : null
        if (notebookId && !notebook) {
          return { tool_message: `Caderno ${notebookId} não encontrado ou inacessível. Informe outro notebook_id ou deixe em branco para criar um novo.` }
        }
        if (!notebookId) {
          notebookId = await createResearchNotebook(ctx.uid, {
            title: notebookTitle || `Chat - ${clip(topic, 70)}`,
            description: 'Caderno criado pelo Chat Orquestrador para artefatos do Estúdio.',
            topic,
            sources: [],
            messages: [],
            artifacts: [],
            status: 'active',
          })
          notebook = await getResearchNotebook(ctx.uid, notebookId)
        }

        const sourceContext = sourceContextArg || buildNotebookSourceContextFromSources(notebook?.sources ?? [], topic)
        const conversationContext = conversationContextArg || `Solicitação feita pelo Chat Orquestrador na conversa ${ctx.conversationId}.`
        const pipelineInput = {
          apiKey: ctx.apiKey,
          uid: ctx.uid,
          topic,
          description: instructions,
          sourceContext,
          conversationContext,
          customInstructions: instructions,
          artifactType,
          artifactLabel: label,
          legalArea: legalArea || undefined,
          ...(artifactType === 'apresentacao_v2' ? { presentationV2Briefing: buildPresentationV2Briefing(args, topic, instructions) } : {}),
        }
        const progressCallback = (step: number, totalSteps: number, phase: string, meta?: { progressPercent?: number }) => ctx.emit({
          type: 'pipeline_progress',
          pipeline: artifactType === 'apresentacao_v2' ? 'presentation_v2' : 'notebook_studio',
          phase,
          progress: meta?.progressPercent ?? Math.round((step / Math.max(totalSteps, 1)) * 100),
          artifact_id: artifactId,
          ts: nowIso(),
        })
        const result = artifactType === 'apresentacao_v2'
          ? await import('../presentation-generation-pipeline-v2').then(module => module.runPresentationGenerationPipelineV2(pipelineInput, progressCallback, ctx.signal))
          : artifactType === 'audio_script'
            ? await import('../audio-generation-pipeline').then(module => module.runAudioGenerationPipeline(pipelineInput, progressCallback, ctx.signal))
            : await runStudioPipeline(pipelineInput, progressCallback, ctx.signal)

        content = result.content
        const executions = [...result.executions]
        if (artifactType === 'audio_script' && shouldGenerateLiteralAudio) {
          // The literal audio is governed by the chat's own capability-restricted
          // agent (chat_audio_generator), keeping this route consistent with the
          // dedicated generate_audio skill.
          const audioModel = resolveStrictConfiguredModel(
            ctx.models.chat_audio_generator,
            String(args.tts_model ?? '').trim() || undefined,
            'Gerador de Áudio Literal',
            'Configurações > Orquestrador (Chat)',
          )
          if (!audioModel.model) {
            return { tool_message: audioModel.error || 'Erro: modelo de áudio indisponível para gerar o áudio literal.' }
          }
          const [{ generateAudioLiteralMedia }, { uploadNotebookMediaArtifact }] = await Promise.all([
            import('../audio-generation-pipeline'),
            import('../notebook-media-storage'),
          ])
          const synthesis = await generateAudioLiteralMedia({
            apiKey: ctx.apiKey,
            uid: ctx.uid,
            rawScriptContent: content,
            voice: String(args.voice ?? '').trim() || undefined,
            ttsModelOverride: audioModel.model,
          }, (step, totalSteps, phase, meta) => ctx.emit({
            type: 'pipeline_progress',
            pipeline: 'audio_literal',
            phase,
            progress: meta?.progressPercent ?? Math.round((step / Math.max(totalSteps, 1)) * 100),
            artifact_id: artifactId,
            ts: nowIso(),
          }))
          const storedAudio = await uploadNotebookMediaArtifact(
            ctx.uid,
            notebookId,
            `${label}-${topic}-audio-literal`,
            synthesis.audioBlob,
            'audios',
            inferAudioExtensionFromMimeType(synthesis.mimeType),
          )
          content = attachLiteralAudioToContent(content, {
            url: storedAudio.url,
            path: storedAudio.path,
            mimeType: synthesis.mimeType,
          })
          executions.push(synthesis.execution)
          literalAudioExport = {
            label: 'MP3',
            format: 'mp3',
            status: 'ready',
            mime_type: synthesis.mimeType,
            extension: inferAudioExtensionFromMimeType(synthesis.mimeType),
            download_url: storedAudio.url,
            storage_path: storedAudio.path,
          }
        }
        format = isStructuredArtifactType(artifactType) ? 'json' : 'markdown'
        const artifact: StudioArtifact = {
          id: artifactId,
          type: artifactType,
          title: `${label} - ${topic}`,
          content,
          format,
          created_at: nowIso(),
        }
        const persisted = await persistStudioArtifactToNotebook({
          uid: ctx.uid,
          notebookId,
          artifact,
          executions,
        })
        executionCount = persisted.executionCount
        executions.forEach(execution => ctx.budget.recordUsage({
          total_tokens: (execution.tokens_in ?? 0) + (execution.tokens_out ?? 0),
          cost_usd: execution.cost_usd,
          model: execution.model,
          agent_name: execution.agent_name,
          phase: execution.phase,
        }))

        if (artifactType === 'video_script' && shouldGenerateVideoProduction) {
          const { runVideoGenerationPipeline } = await import('../video-generation-pipeline')
          const videoResult = await runVideoGenerationPipeline({
            apiKey: ctx.apiKey,
            scriptContent: content,
            topic,
            sourceId: notebookId,
            generateMedia: false,
            clipDurationSeconds: clampNumber(args.clip_duration_seconds, 8, 4, 20),
          }, (step, totalSteps, phase, agent, meta) => ctx.emit({
            type: 'pipeline_progress',
            pipeline: 'video_pipeline',
            phase: agent ? `${agent}: ${phase}${meta?.stageMeta ? ` (${meta.stageMeta})` : ''}` : phase,
            progress: Math.round((step / Math.max(totalSteps, 1)) * 100),
            artifact_id: `${artifactId}-video-production`,
            ts: nowIso(),
          }), ctx.signal)
          const productionArtifactId = `${artifactId}-video-production`
          const productionContent = JSON.stringify(sanitizeVideoProductionForPersistence(videoResult.package), null, 2)
          const productionArtifact: StudioArtifact = {
            id: productionArtifactId,
            type: 'video_production',
            title: `Produção de Vídeo - ${topic}`,
            content: productionContent,
            format: 'json',
            created_at: nowIso(),
          }
          const productionPersisted = await persistStudioArtifactToNotebook({
            uid: ctx.uid,
            notebookId,
            artifact: productionArtifact,
            executions: videoResult.executions,
          })
          videoResult.executions.forEach(execution => ctx.budget.recordUsage({
            total_tokens: (execution.tokens_in ?? 0) + (execution.tokens_out ?? 0),
            cost_usd: execution.cost_usd,
            model: execution.model,
            agent_name: execution.agent_name,
            phase: execution.phase,
          }))
          videoProductionChatArtifact = {
            artifact_id: productionArtifactId,
            logical_document_id: `notebook-${notebookId}-${productionArtifactId}`,
            version: 1,
            title: `Produção de Vídeo - ${topic}`,
            kind: 'video',
            format: 'json',
            summary: `Pacote de produção de vídeo gerado pelo pipeline dedicado.`,
            content_preview: productionContent,
            manifest_json: {
              notebook_id: notebookId,
              artifact_id: productionArtifactId,
              artifact_type: 'video_production',
              topic,
              execution_count: productionPersisted.executionCount,
              media_errors: videoResult.mediaErrors,
              media_generation: 'disabled_by_chat_bridge',
            },
            exports: [
              { label: 'JSON', format: 'json', status: 'planned' },
              { label: 'TXT', format: 'txt', status: 'planned' },
              { label: 'ZIP', format: 'zip', status: 'planned' },
            ],
          }
        }
      }

      const chatArtifact: ChatArtifactRef = {
        artifact_id: artifactId,
        logical_document_id: `notebook-${notebookId}-${artifactId}`,
        version: 1,
        title: `${label} - ${topic}`,
        kind: mapStudioArtifactKind(artifactType),
        format: format === 'json' ? 'json' : 'markdown',
        summary: `${label} gerado pelo Estúdio do Caderno de Pesquisa.`,
        content_preview: content,
        manifest_json: {
          notebook_id: notebookId,
          artifact_id: artifactId,
          artifact_type: artifactType,
          topic,
          execution_count: executionCount,
          video_production_artifact_id: videoProductionChatArtifact?.artifact_id,
        },
        exports: [
          { label: format === 'json' ? 'JSON' : 'Markdown', format: format === 'json' ? 'json' : 'markdown', status: 'planned' },
          ...(mapStudioArtifactKind(artifactType) === 'presentation' ? [{ label: 'PPTX', format: 'pptx' as const, status: 'planned' as const }] : []),
          { label: 'TXT', format: 'txt', status: 'planned' },
          { label: 'HTML', format: 'html', status: 'planned' },
          { label: 'PDF', format: 'pdf', status: 'planned' },
          ...(literalAudioExport ? [literalAudioExport] : []),
          { label: 'ZIP', format: 'zip', status: 'planned' },
        ],
      }
      const workPackage = await deliverWorkPackage(ctx, {
        conversation_id: ctx.conversationId,
        turn_id: ctx.turnId,
        agent_key: 'generate_studio_artifact',
        task: `Gerar ${label} no Caderno de Pesquisa`,
        thought: {
          summary: `Pipeline Notebook Studio executado para criar ${label}.`,
          decisions: ['Salvar o artefato no Research Notebook e também entregar referência na trilha do chat.'],
          next_steps: ['Abrir o caderno para revisar, editar ou exportar o artefato.'],
        },
        result_markdown: `${label} gerado no caderno ${notebookId}.`,
        artifacts: videoProductionChatArtifact ? [chatArtifact, videoProductionChatArtifact] : [chatArtifact],
        created_at: nowIso(),
        completed_at: nowIso(),
      })

      const readyExports = workPackage.artifacts?.[0]?.exports
        ?.filter(exportRef => exportRef.status === 'ready')
        .map(exportRef => exportRef.label)
        .join(', ')

      ctx.emit({
        type: 'super_skill_call',
        skill: `Notebook Studio: ${label}`,
        result_summary: `${label} salvo no caderno ${notebookId}.`,
        ts: nowIso(),
      })

      return {
        tool_message:
          `${label} gerado com sucesso no Caderno de Pesquisa.\n` +
          `- Caderno: ${notebookId}\n` +
          `- Artefato: ${artifactId}\n` +
          (literalAudioExport ? `- Áudio literal: disponível (${literalAudioExport.mime_type || 'audio'})\n` : '') +
          (videoProductionChatArtifact ? `- Produção de vídeo: ${videoProductionChatArtifact.artifact_id}\n` : '') +
          (readyExports ? `- Exports prontos: ${readyExports}\n` : '') +
          `- O artefato também foi registrado na trilha do chat.`,
      }
    } catch (err: unknown) {
      if (isAbortError(err)) throw err
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      ctx.emit({
        type: 'super_skill_call',
        skill: `Notebook Studio: ${label}`,
        result_summary: `Erro: ${message}`,
        ts: nowIso(),
      })
      return { tool_message: `Falha ao gerar ${label} no Caderno de Pesquisa: ${message}.` }
    }
  },
}

// ── Super-Skill: Busca Híbrida (semântica + lexical via RRF) ──────────────────

interface HybridSearchArgs {
  query?: string
  top_k?: number
  semantic_weight?: number
  lexical_weight?: number
}

const hybridSearchSkill: Skill<HybridSearchArgs> = {
  name: 'hybrid_search',
  description:
    'Executa busca híbrida combinando similaridade semântica (Qdrant/embeddings) ' +
    'com correspondência textual (DataJud/Elasticsearch) via Reciprocal Rank Fusion. ' +
    'Use quando o usuário solicitar pesquisa de jurisprudência, precedentes, súmulas ' +
    'ou qualquer consulta que exija resultados precisos. ' +
    'Prefira esta skill a search_jurisprudence quando precisar de maior precisão e cobertura.',
  argsHint: {
    query: 'Termos de busca em linguagem natural (ex.: "responsabilidade civil por danos ambientais em áreas de preservação permanente")',
    top_k: 'Número máximo de resultados (padrão: 5, máximo: 20)',
    semantic_weight: 'Peso da busca semântica entre 0 e 1 (padrão: 0.5)',
    lexical_weight: 'Peso da busca lexical entre 0 e 1 (padrão: 0.5)',
  },
  async run(args, ctx): Promise<SkillResult> {
    const query = String(args.query ?? '').trim()
    if (!query) {
      return { tool_message: 'Erro: "query" é obrigatória para busca híbrida.' }
    }
    const rawTopK = args.top_k !== undefined ? Number(args.top_k) : 5
    const topK = Math.min(Math.max(Number.isFinite(rawTopK) ? rawTopK : 5, 1), 20)
    const rawSw = args.semantic_weight !== undefined ? Number(args.semantic_weight) : 0.5
    const semanticWeight = Math.min(Math.max(Number.isFinite(rawSw) ? rawSw : 0.5, 0), 1)
    const rawLw = args.lexical_weight !== undefined ? Number(args.lexical_weight) : 0.5
    const lexicalWeight = Math.min(Math.max(Number.isFinite(rawLw) ? rawLw : 0.5, 0), 1)

    const startEvent: ChatTrailEvent = {
      type: 'super_skill_call',
      skill: 'hybrid_search',
      args_summary: `"${clip(query, 100)}" (top_k=${topK}, sw=${semanticWeight}, lw=${lexicalWeight})`,
      result_summary: `🔍 Pesquisando: "${clip(query, 80)}"...`,
      ts: nowIso(),
    }
    ctx.emit(startEvent)

    try {
      let results: Array<{
        source: string
        content: string
        score: number
        origin: string
        origins?: string[]
        process_number?: string
      }>
      let stats: { fused_count: number; total_time_ms: number }

      if (ctx.mock) {
        results = [
          {
            source: 'DataJud',
            content: 'EMENTA — Responsabilidade civil. Dano ambiental em área de preservação permanente. Dever de reparação incondicional. Aplicação da teoria do risco integral.',
            score: 0.94,
            origin: 'datajud',
            process_number: 'REsp 1.950.500/SP',
          },
          {
            source: 'DataJud',
            content: 'EMENTA — Ação civil pública. Dano ambiental. Área de preservação permanente. Obrigação propter rem. Responsabilidade solidária.',
            score: 0.87,
            origin: 'datajud',
            process_number: 'AI 850.300/PR',
          },
          {
            source: 'Qdrant',
            content: 'SÚMULA 618/STJ — A inversão do ônus da prova aplica-se a ações de reparação por danos ambientais.',
            score: 0.82,
            origin: 'qdrant',
            origins: ['qdrant'],
          },
          {
            source: 'DataJud',
            content: 'EMENTA — Dano ambiental. Reparação. Área de preservação permanente. Nexo causal comprovado. Quantum indenizatório fixado em R$ 500.000,00.',
            score: 0.78,
            origin: 'datajud',
            process_number: 'AC 1001234-56.2021.8.26.0000',
          },
        ]
        stats = { fused_count: 4, total_time_ms: 1234 }
      } else {
        const apiResponse = await hybridSearch(query, {
          topK,
          semanticWeight,
          lexicalWeight,
          signal: ctx.signal,
          apiKey: ctx.apiKey,
        })
        results = apiResponse.results
        stats = apiResponse.stats
      }

      if (!results.length) {
        const emptyEvent: ChatTrailEvent = {
          type: 'super_skill_call',
          skill: 'hybrid_search',
          result_summary: `Nenhum resultado para "${clip(query, 80)}"`,
          ts: nowIso(),
        }
        ctx.emit(emptyEvent)
        return {
          tool_message:
            `Nenhum resultado encontrado na busca híbrida para "${query}".\n` +
            `Sugira ao usuário refinar os termos de busca com palavras-chave mais específicas.`,
        }
      }

      const summaryLines = results.map((r, i) => {
        const originLabel = r.origin === 'datajud' ? 'DataJud' : r.origin === 'qdrant' ? 'Qdrant' : r.origin
        const origins = r.origins && r.origins.length > 1 ? ` [fontes: ${r.origins.join(', ')}]` : ''
        const processNumber = r.process_number ? `\n   📋 Processo: ${r.process_number}` : ''
        return (
          `${i + 1}. **[${originLabel}]** (score: ${r.score.toFixed(3)})${origins}${processNumber}\n` +
          `   ${clip(r.content, 400)}`
        )
      })

      const count = results.length
      const timeSec = ((stats?.total_time_ms ?? 0) / 1000).toFixed(1)

      const resultEvent: ChatTrailEvent = {
        type: 'super_skill_call',
        skill: 'hybrid_search',
        result_summary: `${count} resultado(s) fusionados em ${timeSec}s para "${clip(query, 50)}"`,
        ts: nowIso(),
      }
      ctx.emit(resultEvent)

      return {
        tool_message:
          `📚 Resultados da busca híbrida (RRF) para "${query}" — ${count} itens em ${timeSec}s:\n\n` +
          `${summaryLines.join('\n\n')}\n\n` +
          `Use estes resultados para fundamentar a resposta ao usuário. Cite as fontes e os números dos processos quando disponíveis.`,
      }
    } catch (err: unknown) {
      if (isAbortError(err)) throw err
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return { tool_message: `Erro na busca híbrida: ${message}` }
    }
  },
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * PR3 super-skills — pipeline integrations available to the orchestrator.
 * Extend this array when adding new pipeline-backed capabilities.
 */
export function buildSuperSkills(): Skill[] {
  return [
    generateImageSkill,
    generateAudioSkill,
    generateVideoSkill,
    generatePresentationSkill,
    generateDocumentSkill,
    checkDocumentStatusSkill,
    searchJurisprudenceSkill,
    analyzeThesisSkill,
    generateStudioArtifactSkill,
    hybridSearchSkill,
  ]
}
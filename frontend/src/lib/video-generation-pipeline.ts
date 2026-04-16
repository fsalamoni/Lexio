/**
 * Video Generation Pipeline — multi-agent pipeline that transforms a video script
 * into a complete video production package with scenes, visuals, narration, and timeline.
 *
 * This pipeline uses an 11-step VIDEO_PIPELINE architecture:
 *   1. Planejador de Produção  — plans production, estimates token costs
 *   2. Roteirista              — refines/expands the script with full directions
 *   3. Diretor de Cenas        — breaks script into detailed timed scenes
 *   4. Storyboarder            — creates frame-by-frame visual descriptions
 *   5. Designer Visual         — generates image prompts for each scene
 *   6. Compositor de Vídeo     — assembles final timeline with transitions/effects
 *   7. Narrador                — generates narration script with timing markers
 *   8. Revisor Final           — quality-checks the complete production package
 *   9. Planejador de Clips     — subdivides each scene into sequential clips (~8s each)
 *  10. Gerador de Imagens      — generates AI images for each clip (loop)
 *  11. Narrador TTS            — generates speech audio for each narration segment
 *
 * Steps 1-8 are LLM planning agents. Step 9 loops per scene, calling an LLM
 * to generate clip breakdowns with continuity context. Steps 10-11 generate
 * actual media (images + TTS audio) in loops.
 *
 * The final output is a VideoProductionPackage with clips, images, and audio
 * used by the VideoStudioEditor component.
 */

import { callLLMWithFallback, ModelUnavailableError, TransientLLMError, type LLMResult } from './llm-client'
import { loadVideoPipelineModels, validateScopedAgentModels, VIDEO_PIPELINE_AGENT_DEFS } from './model-config'
import { createUsageExecutionRecord, type UsageFunctionKey } from './cost-analytics'
import { generateImageViaOpenRouter, DEFAULT_IMAGE_MODEL, blobToDataUrl } from './image-generation-client'
import { generateTTSViaOpenRouter } from './tts-client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VideoGenerationInput {
  apiKey: string
  /** The raw video script JSON content (from the studio pipeline) */
  scriptContent: string
  /** Original topic/theme */
  topic: string
  /** Notebook or source ID for tracking */
  sourceId: string
  /** When true, generates actual images and TTS audio after the LLM agents */
  generateMedia?: boolean
  /** Image generation model override */
  imageModel?: string
  /** TTS voice for narration (e.g., 'nova', 'alloy', 'echo') */
  ttsVoice?: string
  /** TTS model override (e.g., 'openai/gpt-4o-audio-preview') */
  ttsModel?: string
  /** Target duration per clip in seconds (default 8) */
  clipDurationSeconds?: number
}

export interface VideoScene {
  number: number
  timeStart: string
  timeEnd: string
  duration: number
  narration: string
  visual: string
  imagePrompt: string
  videoPrompt: string
  transition: string
  soundtrack: string
  lowerThird?: string
  notes?: string
  /** Base64 data URL of generated scene image (thumbnail = first clip) */
  generatedImageUrl?: string
  /** Clips that make up this scene's visual sequence */
  clips: VideoClip[]
}

export interface NarrationSegment {
  sceneNumber: number
  text: string
  voiceStyle: string
  timeStart: string
  timeEnd: string
  pauseAfter?: number
  /** Base64 data URL of generated TTS audio */
  generatedAudioUrl?: string
}

export interface VideoTrack {
  type: 'video' | 'narration' | 'music' | 'sfx' | 'overlay'
  label: string
  segments: TrackSegment[]
}

export interface TrackSegment {
  id: string
  startTime: number
  endTime: number
  label: string
  content: string
  sceneNumber?: number
  clipNumber?: number
  metadata?: Record<string, string>
  /** Base64 data URL of generated media (image or audio) */
  generatedMediaUrl?: string
}

/**
 * A VideoClip represents a short segment (~5-10 seconds) within a scene.
 * Scenes are subdivided into clips to create smooth visual sequences.
 * Each clip gets its own AI-generated image, and together they form
 * the visual narrative of the scene.
 */
export interface VideoClip {
  clipNumber: number
  sceneNumber: number
  /** Absolute timestamp from video start, in seconds */
  timestamp: number
  /** Duration of this clip in seconds */
  duration: number
  /** Visual description of this moment (Portuguese) */
  description: string
  /** Detailed image generation prompt (English) for AI image generation */
  imagePrompt: string
  /** Camera movement / action description */
  motionDescription: string
  /** Transition to next clip */
  transition: string
  /** Base64 data URL of generated image */
  generatedImageUrl?: string
}

export interface DesignGuide {
  colorPalette: string[]
  fontFamily: string
  style: string
  characterDescriptions: { name: string; description: string }[]
  recurringElements: string[]
}

export interface VideoSceneAsset {
  sceneNumber: number
  imageUrl?: string
  narrationUrl?: string
  imageStoragePath?: string
  narrationStoragePath?: string
  imageBlob?: Blob
  narrationBlob?: Blob
  videoClips?: VideoClipAsset[]
}

export interface VideoClipAsset {
  sceneNumber: number
  partNumber: number
  startTime: number
  endTime: number
  duration: number
  url: string
  mimeType: string
  generatedAt: string
  source?: 'generated' | 'uploaded'
  generationEngine?: 'external-provider' | 'browser-local' | 'manual-upload'
  providerName?: string
  providerJobId?: string
  storagePath?: string
  blob?: Blob
}

export interface VideoAudioAsset {
  url: string
  mimeType: string
  generatedAt: string
  description?: string
  storagePath?: string
  blob?: Blob
}

export interface RenderedVideoAsset {
  url: string
  mimeType: string
  generatedAt: string
  storagePath?: string
  blob?: Blob
}

export type VideoRenderScope = 'full' | 'scene' | 'part'

export interface VideoRenderPreset {
  id: string
  name: string
  description?: string
  width: number
  height: number
  frameRate: number
  videoBitsPerSecond: number
}

export interface ScopedRenderedVideoAsset extends RenderedVideoAsset {
  scope: VideoRenderScope
  scopeKey: string
  label: string
  presetId?: string
  sceneNumber?: number
  partNumber?: number
}

export interface VideoRenderQueueItem {
  id: string
  scope: VideoRenderScope
  presetId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  message?: string
  sceneNumber?: number
  partNumber?: number
  resultScopeKey?: string
  error?: string
}

export type LiteralSceneStepStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface LiteralSceneCheckpoint {
  sceneNumber: number
  imageStatus: LiteralSceneStepStatus
  narrationStatus: LiteralSceneStepStatus
  clipsStatus: LiteralSceneStepStatus
  imageAttempts?: number
  narrationAttempts?: number
  clipsAttempts?: number
  clipPartsCompleted: number
  clipPartsTotal: number
  lastError?: string
  updatedAt: string
}

export interface LiteralGenerationEvent {
  at: string
  type: 'start' | 'resume' | 'retry' | 'step_success' | 'step_failed' | 'completed'
  phase: LiteralGenerationState['phase']
  sceneNumber?: number
  partNumber?: number
  attempt?: number
  message?: string
}

export interface LiteralGenerationState {
  status: 'idle' | 'running' | 'completed' | 'failed'
  phase: 'image_generation' | 'tts_generation' | 'clip_generation' | 'soundtrack_generation' | 'completed' | 'failed'
  startedAt: string
  updatedAt: string
  completedAt?: string
  checkpointVersion: number
  runCount?: number
  resumeCount?: number
  errors: string[]
  events?: LiteralGenerationEvent[]
  scenes: LiteralSceneCheckpoint[]
}

export function createVideoRenderScopeLabel(
  scope: VideoRenderScope,
  sceneNumber?: number,
  partNumber?: number,
): string {
  if (scope === 'scene') return `Cena ${sceneNumber ?? '?'}`
  if (scope === 'part') return `Cena ${sceneNumber ?? '?'} · Parte ${partNumber ?? '?'}`
  return 'Projeto completo'
}

export interface VideoProductionPackage {
  title: string
  totalDuration: number
  scenes: VideoScene[]
  narration: NarrationSegment[]
  tracks: VideoTrack[]
  designGuide: DesignGuide
  qualityReport: string
  productionNotes: string[]
  sceneAssets?: VideoSceneAsset[]
  soundtrackAsset?: VideoAudioAsset
  renderedVideo?: RenderedVideoAsset
  renderedScopes?: ScopedRenderedVideoAsset[]
  renderQueue?: VideoRenderQueueItem[]
  renderPresets?: VideoRenderPreset[]
  selectedRenderPresetId?: string
  sceneClipDurationSeconds?: number
  literalGenerationState?: LiteralGenerationState
}

export interface VideoGenerationStepExecution {
  phase: string
  agent_name: string
  model: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
  duration_ms: number
}

export interface VideoGenerationResult {
  package: VideoProductionPackage
  executions: VideoGenerationStepExecution[]
  /** Errors encountered during media generation (images/TTS). Empty if all succeeded. */
  mediaErrors: string[]
}

export type VideoGenerationProgressCallback = (
  step: number,
  totalSteps: number,
  phase: string,
  agentLabel: string,
) => void

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise(resolve => setTimeout(resolve, ms))
  if (signal.aborted) {
    return Promise.reject(new DOMException('Operação cancelada pelo usuário.', 'AbortError'))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Operação cancelada pelo usuário.', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

// ── Cost Estimation ───────────────────────────────────────────────────────────

/**
 * Estimates the token cost for generating a full video from a script.
 * Based on average token usage per agent in the pipeline.
 */
export function estimateVideoGenerationCost(scriptContent: string, includeMedia = true, clipDurationSeconds = 8): {
  estimatedTokens: number
  estimatedCostUsd: number
  breakdown: { agent: string; label: string; estimatedTokens: number; estimatedCostUsd: number }[]
  mediaCostUsd: number
  mediaBreakdown: { type: string; label: string; count: number; estimatedCostUsd: number }[]
  estimatedClips: number
  estimatedScenes: number
} {
  const scriptLength = scriptContent.length

  // Base estimates per agent (tokens = input + output), scaled by script size
  const scaleFactor = Math.max(1, scriptLength / 5000)
  const estimatedScenes = Math.max(5, Math.round(scriptLength / 500))
  const clipsPerScene = Math.max(1, Math.ceil(30 / clipDurationSeconds)) // avg 30s per scene
  const estimatedClips = estimatedScenes * clipsPerScene

  const AGENT_ESTIMATES: { key: string; label: string; baseTokens: number; costPer1kTokens: number }[] = [
    { key: 'video_planejador', label: 'Planejador de Produção', baseTokens: 3000, costPer1kTokens: 0.003 },
    { key: 'video_roteirista', label: 'Roteirista', baseTokens: 8000, costPer1kTokens: 0.003 },
    { key: 'video_diretor_cena', label: 'Diretor de Cenas', baseTokens: 6000, costPer1kTokens: 0.003 },
    { key: 'video_storyboarder', label: 'Storyboarder', baseTokens: 7000, costPer1kTokens: 0.003 },
    { key: 'video_designer', label: 'Designer Visual', baseTokens: 5000, costPer1kTokens: 0.015 },
    { key: 'video_compositor', label: 'Compositor de Vídeo', baseTokens: 4000, costPer1kTokens: 0.015 },
    { key: 'video_narrador', label: 'Narrador', baseTokens: 4000, costPer1kTokens: 0.005 },
    { key: 'video_revisor', label: 'Revisor Final', baseTokens: 3000, costPer1kTokens: 0.003 },
  ]

  // Add clip planning agent (one call per scene)
  if (includeMedia) {
    AGENT_ESTIMATES.push({
      key: 'video_clip_planner',
      label: `Planejador de Clips (${estimatedScenes} cenas)`,
      baseTokens: 2000 * estimatedScenes,
      costPer1kTokens: 0.0005,
    })
  }

  const breakdown = AGENT_ESTIMATES.map(a => {
    const estimatedTokens = Math.round(a.baseTokens * scaleFactor)
    const estimatedCostUsd = (estimatedTokens / 1000) * a.costPer1kTokens
    return { agent: a.key, label: a.label, estimatedTokens, estimatedCostUsd }
  })

  const estimatedTokens = breakdown.reduce((sum, b) => sum + b.estimatedTokens, 0)
  const estimatedCostUsd = breakdown.reduce((sum, b) => sum + b.estimatedCostUsd, 0)

  // Estimate media generation costs
  const mediaBreakdown: { type: string; label: string; count: number; estimatedCostUsd: number }[] = []
  let mediaCostUsd = 0

  if (includeMedia) {
    const imageCost = estimatedClips * 0.002   // ~$0.002 per clip image (Gemini Flash)
    const ttsCost = estimatedScenes * 0.005    // ~$0.005 per narration segment (TTS-HD)
    mediaCostUsd = imageCost + ttsCost

    mediaBreakdown.push(
      { type: 'clips', label: `Imagens de Clips (~${clipsPerScene}/cena)`, count: estimatedClips, estimatedCostUsd: imageCost },
      { type: 'tts', label: 'Narração TTS', count: estimatedScenes, estimatedCostUsd: ttsCost },
    )
  }

  return {
    estimatedTokens,
    estimatedCostUsd: estimatedCostUsd + mediaCostUsd,
    breakdown,
    mediaCostUsd,
    mediaBreakdown,
    estimatedClips,
    estimatedScenes,
  }
}

// ── Pipeline helpers ──────────────────────────────────────────────────────────

function safeParseJSON(text: string): Record<string, unknown> | null {
  // First try direct parse
  try {
    return JSON.parse(text)
  } catch {
    // continue to extraction
  }
  // Try to extract the first complete JSON object using bracket counting
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/** Safely call an agent with retry logic and error handling — returns fallback on failure */
async function safeCallAgent(
  apiKey: string,
  model: string,
  prompt: string,
  phase: string,
  executions: VideoGenerationStepExecution[],
  maxRetries = 2,
  signal?: AbortSignal,
): Promise<{ data: Record<string, unknown>; failed: boolean }> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    throwIfAborted(signal)
    try {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
        await sleep(delay, signal)
      }
      const result = await callAgent(apiKey, model, prompt, signal)
      executions.push(makeExecution(phase, model, result))
      const data = safeParseJSON(result.content)
      if (!data) {
        console.warn(`[Video Pipeline] Agent ${phase} returned invalid JSON (attempt ${attempt + 1})`)
        if (attempt < maxRetries) continue
        return { data: {}, failed: true }
      }
      return { data, failed: false }
    } catch (err) {
      lastError = err
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      const errMsg = err instanceof Error ? err.message : String(err)
      const isRetryable =
        err instanceof ModelUnavailableError ||
        err instanceof TransientLLMError ||
        errMsg.includes('429') ||
        errMsg.includes('timeout') ||
        errMsg.includes('503') ||
        errMsg.includes('ECONNRESET')
      if (!isRetryable || attempt >= maxRetries) break
      console.warn(`[Video Pipeline] Agent ${phase} retryable error (attempt ${attempt + 1}):`, errMsg)
    }
  }
  console.error(`[Video Pipeline] Agent ${phase} failed after retries:`, lastError)
  executions.push({
    phase,
    agent_name: phase,
    model,
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
    duration_ms: 0,
  })
  return { data: {}, failed: true }
}

function generateSegmentId(): string {
  return `seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ── Pipeline execution ────────────────────────────────────────────────────────

/**
 * Runs the full 8-agent video generation pipeline.
 */
export async function runVideoGenerationPipeline(
  input: VideoGenerationInput,
  onProgress?: VideoGenerationProgressCallback,
  signal?: AbortSignal,
): Promise<VideoGenerationResult> {
  throwIfAborted(signal)
  const models = await loadVideoPipelineModels()
  await validateScopedAgentModels('video_pipeline_models', models)
  const executions: VideoGenerationStepExecution[] = []
  const wantMedia = input.generateMedia !== false // default true
  const totalSteps = wantMedia ? 11 : 8

  // ── Step 1: Planejador de Produção ────────────────────────────────────────
  onProgress?.(1, totalSteps, 'video_planejador', 'Planejador de Produção')

  const { data: planData } = await safeCallAgent(input.apiKey, models.video_planejador, `
Você é um Planejador de Produção de vídeo profissional.

Analise o roteiro abaixo e crie um plano de produção detalhado.

ROTEIRO:
${input.scriptContent}

TEMA: ${input.topic}

Responda com JSON puro (sem \`\`\`json):
{
  "title": "Título do vídeo",
  "totalDuration": 600,
  "designGuide": {
    "colorPalette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
    "fontFamily": "Família de fonte principal",
    "style": "Descrição do estilo visual global (minimalista, corporativo, etc)",
    "characterDescriptions": [
      { "name": "Nome do personagem/apresentador", "description": "Descrição visual detalhada para manter consistência" }
    ],
    "recurringElements": ["Elemento 1 recorrente", "Elemento 2 recorrente"]
  },
  "productionNotes": ["Nota 1", "Nota 2"],
  "sceneCount": 15,
  "segments": [
    {
      "number": 1,
      "title": "Título do segmento",
      "estimatedDuration": 40,
      "type": "abertura | conteudo | transicao | encerramento"
    }
  ]
}

Requisitos:
- Defina uma paleta de cores EXATA com 5 códigos hex específicos para todo o vídeo
- Descreva personagens/apresentadores com EXTREMO DETALHE VISUAL (aparência física, roupas, cores, acessórios) — esta descrição será copiada literalmente em todas as cenas para manter consistência absoluta
- O campo "style" deve ser ESPECÍFICO e DETALHADO (ex: "ilustração digital flat design com traços limpos e cores vibrantes" — NÃO apenas "moderno")
- Liste elementos visuais recorrentes (logo, lower thirds, bordas, transições padrão) com posição e estilo exatos
- Planeje a duração de cada segmento em segundos
- Total deve somar a duração indicada no roteiro
- O Guia de Design será usado como REFERÊNCIA OBRIGATÓRIA por todos os demais agentes — seja o mais específico possível`, 'video_planejador', executions, 2, signal)

  // ── Step 2: Roteirista (refinar roteiro) ──────────────────────────────────
  onProgress?.(2, totalSteps, 'video_roteirista', 'Roteirista')

  const { data: scriptData } = await safeCallAgent(input.apiKey, models.video_roteirista, `
Você é um Roteirista profissional de vídeo. Refine e expanda o roteiro abaixo para produção.

ROTEIRO ORIGINAL:
${input.scriptContent}

PLANO DE PRODUÇÃO:
${JSON.stringify(planData, null, 2)}

GUIA DE DESIGN (OBRIGATÓRIO — siga estritamente):
${JSON.stringify(planData.designGuide || {}, null, 2)}

Responda com JSON puro (sem \`\`\`json):
{
  "scenes": [
    {
      "number": 1,
      "timeStart": "00:00",
      "timeEnd": "00:40",
      "duration": 40,
      "narration": "Texto completo da narração com tom e ênfases marcadas entre *asteriscos*",
      "visual": "Descrição detalhada do visual, enquadramento, elementos na tela",
      "transition": "corte | fade_in | fade_out | dissolve | wipe | zoom",
      "soundtrack": "Descrição da música/som ambiente para esta cena",
      "lowerThird": "Texto na parte inferior da tela (opcional)",
      "notes": "Notas de pós-produção (opcional)"
    }
  ]
}

REGRA DE HARMONIA VISUAL (OBRIGATÓRIA):
O vídeo DEVE ser um produto visual HARMONIOSO e UNIFORME do início ao fim.
- TODAS as cenas devem usar EXATAMENTE a mesma paleta de cores do Guia de Design
- O estilo visual deve ser IDÊNTICO em todas as cenas (${(planData.designGuide as Record<string, unknown>)?.style || 'manter consistência'})
- Personagens/apresentadores devem ter descrição visual IDÊNTICA em TODAS as aparições
- Transições devem seguir um padrão uniforme — NÃO misture estilos diferentes
- A trilha sonora deve ter continuidade — não mude de gênero musical entre cenas
- O tom da narração deve ser consistente ao longo de TODO o vídeo

Requisitos adicionais:
- Narração detalhada com marcações de tom e ênfase
- Cada cena deve ter indicação precisa de início e fim
- Cronologia e encadeamento lógico de ideias`, 'video_roteirista', executions, 2, signal)
  if (!scriptData.scenes) scriptData.scenes = []

  // ── Step 3: Diretor de Cenas ──────────────────────────────────────────────
  onProgress?.(3, totalSteps, 'video_diretor_cena', 'Diretor de Cenas')

  const { data: directedScenes } = await safeCallAgent(input.apiKey, models.video_diretor_cena, `
Você é um Diretor de Cenas profissional. Refine as cenas com instruções técnicas detalhadas.

CENAS DO ROTEIRO:
${JSON.stringify(scriptData, null, 2)}

GUIA DE DESIGN (OBRIGATÓRIO — siga estritamente):
${JSON.stringify(planData.designGuide || {}, null, 2)}

Responda com JSON puro (sem \`\`\`json):
{
  "scenes": [
    {
      "number": 1,
      "timeStart": "00:00",
      "timeEnd": "00:40",
      "duration": 40,
      "narration": "Narração refinada",
      "visual": "Descrição visual detalhada com enquadramento, iluminação, composição — USANDO as cores e estilo do Guia de Design",
      "transition": "tipo de transição com detalhes (ex: fade_in 0.5s)",
      "soundtrack": "Música/efeitos sonoros detalhados",
      "cameraMovement": "Movimento de câmera (pan, tilt, zoom, estático)",
      "lighting": "Descrição da iluminação",
      "lowerThird": "Texto na tela",
      "notes": "Notas técnicas"
    }
  ]
}

REGRA DE HARMONIA VISUAL (OBRIGATÓRIA):
O vídeo DEVE manter UNIFORMIDADE VISUAL ABSOLUTA entre todas as cenas:
- Use EXCLUSIVAMENTE as cores da paleta: referência do Guia de Design acima
- Iluminação deve seguir um padrão consistente (não mude de quente para frio sem razão narrativa)
- Movimentos de câmera devem seguir um padrão coerente ao longo do vídeo
- Transições devem ser UNIFORMES — escolha UM padrão principal e mantenha
- Personagens devem ter aparência IDÊNTICA em todas as cenas

Requisitos adicionais:
- Adicione instruções de câmera para cada cena
- Refine os timings para encadeamento suave
- Garanta continuidade visual entre cenas consecutivas`, 'video_diretor_cena', executions, 2, signal)
  if (!directedScenes.scenes) directedScenes.scenes = scriptData.scenes || []

  // ── Step 4: Storyboarder ──────────────────────────────────────────────────
  onProgress?.(4, totalSteps, 'video_storyboarder', 'Storyboarder')

  const { data: storyboardData } = await safeCallAgent(input.apiKey, models.video_storyboarder, `
Você é um Storyboarder profissional. Crie descrições visuais frame-a-frame para cada cena.

CENAS DIRIGIDAS:
${JSON.stringify(directedScenes, null, 2)}

GUIA DE DESIGN (OBRIGATÓRIO — siga estritamente):
${JSON.stringify(planData.designGuide || {}, null, 2)}

Responda com JSON puro (sem \`\`\`json):
{
  "scenes": [
    {
      "number": 1,
      "frames": [
        {
          "timestamp": "00:00",
          "description": "Descrição visual completa do frame: composição, cores, elementos, personagens, texto na tela",
          "foreground": "Elementos em primeiro plano",
          "background": "Elementos de fundo",
          "overlays": "Textos, gráficos ou animações sobrepostas"
        }
      ]
    }
  ]
}

REGRA DE HARMONIA VISUAL (OBRIGATÓRIA):
- Use EXCLUSIVAMENTE as cores da paleta definida no Guia de Design
- TODOS os frames de TODAS as cenas devem ter o MESMO estilo visual
- Personagens devem ter aparência ABSOLUTAMENTE IDÊNTICA em todos os frames e cenas
- Elementos recorrentes (logo, lower thirds, bordas) devem ter posição e estilo FIXOS
- Fundo/cenário deve manter coerência de iluminação e atmosfera

Requisitos adicionais:
- 2-4 frames chave por cena (keyframes)
- Descrições visuais detalhadas e precisas
- Indique posição e tamanho dos elementos na composição`, 'video_storyboarder', executions, 2, signal)

  // ── Step 5: Designer Visual ───────────────────────────────────────────────
  onProgress?.(5, totalSteps, 'video_designer', 'Designer Visual')

  const { data: designData } = await safeCallAgent(input.apiKey, models.video_designer, `
Você é um Designer Visual de produção de vídeo. Gere prompts detalhados de geração de imagem para cada cena.

STORYBOARD:
${JSON.stringify(storyboardData, null, 2)}

GUIA DE DESIGN (OBRIGATÓRIO — siga estritamente):
${JSON.stringify(planData.designGuide || {}, null, 2)}

Responda com JSON puro (sem \`\`\`json):
{
  "imagePrompts": [
    {
      "sceneNumber": 1,
      "prompt": "Prompt detalhado para geração de imagem em inglês, estilo profissional, com descrição de composição, iluminação, cores, elementos visuais...",
      "negativePrompt": "Elementos a evitar na geração",
      "style": "photorealistic | illustration | 3d_render | animation | flat_design",
      "aspectRatio": "16:9",
      "colorScheme": "Cores dominantes da cena"
    }
  ],
  "videoPrompts": [
    {
      "sceneNumber": 1,
      "prompt": "Prompt para geração de clipe de vídeo curto (4-8 segundos) com descrição de movimento, ação, câmera...",
      "motionType": "static | pan | zoom | tracking | handheld",
      "duration": 6
    }
  ]
}

REGRAS CRÍTICAS DE CONSISTÊNCIA VISUAL NOS PROMPTS (OBRIGATÓRIO):
Cada prompt de imagem DEVE conter OBRIGATORIAMENTE estas informações, na MESMA ORDEM, em TODOS os prompts:

1. ESTILO GLOBAL: Comece TODOS os prompts com o mesmo prefixo de estilo: "${(planData.designGuide as Record<string, unknown>)?.style || 'consistent professional style'}"
2. PALETA DE CORES: Inclua LITERALMENTE os códigos hex das cores em cada prompt: ${JSON.stringify((planData.designGuide as Record<string, unknown>)?.colorPalette || [])}
3. PERSONAGENS: Se um personagem aparece, use a MESMA descrição física EXATA em todos os prompts. Copie palavra por palavra a descrição do Guia de Design.
4. ELEMENTOS RECORRENTES: Inclua os mesmos elementos visuais recorrentes em todos os prompts: ${JSON.stringify((planData.designGuide as Record<string, unknown>)?.recurringElements || [])}
5. NEGATIVE PROMPT PADRÃO: Use o MESMO negative prompt base em todas as cenas para garantir uniformidade.

PROIBIDO:
- Mudar o estilo visual entre cenas (ex: uma cena cartoon, outra realista)
- Mudar paleta de cores entre cenas
- Descrever um personagem de forma diferente em cenas distintas
- Usar iluminação inconsistente entre cenas do mesmo cenário

Requisitos adicionais:
- Um prompt de imagem principal por cena (thumbnail/keyframe)
- Um prompt de vídeo curto por cena (para composição)
- Prompts em inglês para melhor compatibilidade com modelos de geração`, 'video_designer', executions, 2, signal)

  // ── Step 6: Compositor de Vídeo ───────────────────────────────────────────
  onProgress?.(6, totalSteps, 'video_compositor', 'Compositor de Vídeo')

  const { data: compositorData } = await safeCallAgent(input.apiKey, models.video_compositor, `
Você é um Compositor de Vídeo profissional. Monte a timeline final do vídeo com todas as faixas.

CENAS DIRIGIDAS:
${JSON.stringify(directedScenes, null, 2)}

PROMPTS VISUAIS:
${JSON.stringify(designData, null, 2)}

GUIA DE DESIGN:
${JSON.stringify(planData.designGuide || {}, null, 2)}

Responda com JSON puro (sem \`\`\`json):
{
  "tracks": [
    {
      "type": "video",
      "label": "Vídeo Principal",
      "segments": [
        {
          "startTime": 0,
          "endTime": 40,
          "label": "Cena 1 - Abertura",
          "content": "Descrição do conteúdo visual neste segmento",
          "sceneNumber": 1,
          "metadata": {
            "transition_in": "fade_in 0.5s",
            "transition_out": "dissolve 0.5s",
            "effect": "color_grade_warm"
          }
        }
      ]
    },
    {
      "type": "narration",
      "label": "Narração",
      "segments": [
        {
          "startTime": 2,
          "endTime": 38,
          "label": "Narração Cena 1",
          "content": "Texto da narração",
          "sceneNumber": 1
        }
      ]
    },
    {
      "type": "music",
      "label": "Trilha Sonora",
      "segments": [
        {
          "startTime": 0,
          "endTime": 40,
          "label": "Música de abertura",
          "content": "Descrição da música: gênero, tempo, intensidade"
        }
      ]
    },
    {
      "type": "sfx",
      "label": "Efeitos Sonoros",
      "segments": []
    },
    {
      "type": "overlay",
      "label": "Overlays e Textos",
      "segments": [
        {
          "startTime": 5,
          "endTime": 15,
          "label": "Lower Third - Título",
          "content": "Texto do lower third",
          "metadata": {
            "position": "bottom-left",
            "animation": "slide_in"
          }
        }
      ]
    }
  ]
}

Requisitos:
- 5 faixas obrigatórias: video, narration, music, sfx, overlay
- Cada segmento deve ter timestamps precisos em segundos
- Transições entre cenas devem sobrepor levemente (crossfade)
- Narração deve começar após qualquer transição de entrada
- Trilha sonora deve ser contínua com variações de intensidade
- Overlays devem aparecer nos momentos corretos

REGRA DE HARMONIA (OBRIGATÓRIA):
- Color grading DEVE ser o MESMO em todas as cenas (use o mesmo efeito/filtro)
- Transições entre cenas devem seguir um PADRÃO UNIFORME — não misture tipos
- Trilha sonora deve ter continuidade — NÃO mude de gênero entre segmentos
- Lower thirds e overlays devem seguir o MESMO estilo de design em todo o vídeo`, 'video_compositor', executions, 2, signal)

  // ── Step 7: Narrador ──────────────────────────────────────────────────────
  onProgress?.(7, totalSteps, 'video_narrador', 'Narrador')

  const { data: narratorData } = await safeCallAgent(input.apiKey, models.video_narrador, `
Você é um Narrador profissional e diretor de locução. Prepare o script final de narração com marcações de timing.

CENAS:
${JSON.stringify(directedScenes, null, 2)}

TIMELINE:
${JSON.stringify(compositorData.tracks || [], null, 2)}

GUIA DE DESIGN (OBRIGATÓRIO — alinhe o tom de voz ao estilo visual):
${JSON.stringify(planData.designGuide || {}, null, 2)}

Responda com JSON puro (sem \`\`\`json):
{
  "narrationSegments": [
    {
      "sceneNumber": 1,
      "text": "Texto exato da narração com *ênfases* e [pausas]",
      "voiceStyle": "formal | conversacional | energetico | calmo | dramatico",
      "timeStart": "00:02",
      "timeEnd": "00:38",
      "pauseAfter": 1.5
    }
  ],
  "voiceNotes": {
    "generalTone": "Tom geral da narração",
    "pacing": "Ritmo: palavras por minuto estimado",
    "emphasis": "Notas sobre ênfases e variações"
  }
}

REGRA DE HARMONIA NA NARRAÇÃO (OBRIGATÓRIA):
- O tom de voz deve ser CONSISTENTE ao longo de TODO o vídeo — NÃO mude o estilo entre cenas
- O voiceStyle DEVE ser o MESMO em todos os segmentos (escolha UM e mantenha)
- O ritmo (pacing) deve ser UNIFORME — não acelere nem desacelere sem razão narrativa
- O tom deve COMBINAR com o estilo visual do Guia de Design:
  * Estilo corporativo → voz formal, ritmo moderado
  * Estilo dinâmico/energético → voz animada, ritmo mais rápido
  * Estilo minimalista → voz calma, ritmo pausado
- As pausas entre segmentos devem seguir um padrão CONSISTENTE

Requisitos adicionais:
- Texto exato e completo para cada segmento de narração
- Marcações de ênfase com *asteriscos*
- Indicações de [pausa] onde necessário
- Timing sincronizado com a timeline do compositor`, 'video_narrador', executions, 2, signal)

  // ── Step 8: Revisor Final ─────────────────────────────────────────────────
  onProgress?.(8, totalSteps, 'video_revisor', 'Revisor Final de Vídeo')

  const { data: reviewData } = await safeCallAgent(input.apiKey, models.video_revisor, `
Você é o Revisor Final de Vídeo. Sua missão PRINCIPAL é garantir a HARMONIA e CONSISTÊNCIA VISUAL ABSOLUTA de todo o pacote de produção.

PLANO:
${JSON.stringify(planData, null, 2)}

CENAS:
${JSON.stringify(directedScenes, null, 2)}

NARRAÇÃO:
${JSON.stringify(narratorData, null, 2)}

TIMELINE:
${JSON.stringify(compositorData, null, 2)}

PROMPTS DE IMAGEM:
${JSON.stringify(designData, null, 2)}

GUIA DE DESIGN (REFERÊNCIA OBRIGATÓRIA PARA VALIDAÇÃO):
${JSON.stringify(planData.designGuide || {}, null, 2)}

Responda com JSON puro (sem \`\`\`json):
{
  "approved": true,
  "qualityScore": 8.5,
  "report": "Relatório detalhado de qualidade...",
  "checklist": {
    "continuidade_visual": true,
    "consistencia_personagens": true,
    "sincronia_narracao": true,
    "transicoes_suaves": true,
    "paleta_cores_consistente": true,
    "timing_correto": true,
    "encadeamento_logico": true,
    "harmonia_estilo_visual": true,
    "uniformidade_narrador": true,
    "color_grading_uniforme": true
  },
  "consistencyReport": {
    "styleUniformity": "Análise: todos os prompts de imagem começam com o mesmo prefixo de estilo? SIM/NÃO e detalhes",
    "paletteCompliance": "Análise: todos os prompts incluem as cores hex do Guia de Design? SIM/NÃO e detalhes",
    "characterConsistency": "Análise: personagens são descritos identicamente em todas as cenas? SIM/NÃO e detalhes",
    "voiceToneConsistency": "Análise: o tom de narração é uniforme em todos os segmentos? SIM/NÃO e detalhes",
    "transitionPattern": "Análise: transições seguem padrão uniforme? SIM/NÃO e detalhes"
  },
  "suggestions": ["Sugestão de melhoria 1", "..."],
  "productionNotes": ["Nota final de produção 1", "..."]
}

VERIFICAÇÃO OBRIGATÓRIA DE HARMONIA VISUAL:
Para cada item abaixo, VERIFIQUE EXPLICITAMENTE e reporte no consistencyReport:

1. UNIFORMIDADE DE ESTILO: Compare todos os imagePrompts — eles DEVEM começar com o mesmo prefixo de estilo visual
2. CONFORMIDADE COM PALETA: Cada imagePrompt DEVE conter os códigos hex da paleta do Guia de Design
3. CONSISTÊNCIA DE PERSONAGENS: Se personagens aparecem em múltiplas cenas, a descrição visual DEVE ser idêntica palavra por palavra
4. TOM DE NARRAÇÃO: O voiceStyle DEVE ser o MESMO em todos os narrationSegments
5. PADRÃO DE TRANSIÇÕES: As transições DEVEM seguir um padrão uniforme
6. COLOR GRADING: O metadata de efeito visual DEVE ser igual em todos os segmentos de vídeo

Se QUALQUER item falhar, defina approved=false e qualityScore < 6.

Requisitos adicionais:
- Valide sincronização entre narração e visual
- Avalie encadeamento lógico de ideias
- Identifique possíveis problemas e sugira melhorias`, 'video_revisor', executions, 2, signal)

  // ── Assemble final package ────────────────────────────────────────────────

  const scenes: VideoScene[] = ((directedScenes as Record<string, unknown>).scenes as Array<Record<string, unknown>> || []).map((s: Record<string, unknown>, i: number) => {
    const imageP = ((designData as Record<string, unknown>).imagePrompts as Array<Record<string, unknown>> || []).find((p: Record<string, unknown>) => p.sceneNumber === (s.number || i + 1))
    const videoP = ((designData as Record<string, unknown>).videoPrompts as Array<Record<string, unknown>> || []).find((p: Record<string, unknown>) => p.sceneNumber === (s.number || i + 1))
    return {
      number: (s.number as number) || i + 1,
      timeStart: (s.timeStart as string) || '00:00',
      timeEnd: (s.timeEnd as string) || '00:00',
      duration: (s.duration as number) || 30,
      narration: (s.narration as string) || '',
      visual: (s.visual as string) || '',
      imagePrompt: (imageP?.prompt as string) || '',
      videoPrompt: (videoP?.prompt as string) || '',
      transition: (s.transition as string) || 'corte',
      soundtrack: (s.soundtrack as string) || '',
      lowerThird: s.lowerThird as string | undefined,
      notes: s.notes as string | undefined,
      clips: [],
    }
  })

  const narration: NarrationSegment[] = ((narratorData as Record<string, unknown>).narrationSegments as Array<Record<string, unknown>> || []).map((n: Record<string, unknown>) => ({
    sceneNumber: (n.sceneNumber as number) || 1,
    text: (n.text as string) || '',
    voiceStyle: (n.voiceStyle as string) || 'formal',
    timeStart: (n.timeStart as string) || '00:00',
    timeEnd: (n.timeEnd as string) || '00:00',
    pauseAfter: n.pauseAfter as number | undefined,
  }))

  const tracks: VideoTrack[] = ((compositorData as Record<string, unknown>).tracks as Array<Record<string, unknown>> || []).map((t: Record<string, unknown>) => ({
    type: (t.type as VideoTrack['type']) || 'video',
    label: (t.label as string) || '',
    segments: ((t.segments as Array<Record<string, unknown>>) || []).map((seg: Record<string, unknown>) => ({
      id: generateSegmentId(),
      startTime: (seg.startTime as number) || 0,
      endTime: (seg.endTime as number) || 0,
      label: (seg.label as string) || '',
      content: (seg.content as string) || '',
      sceneNumber: seg.sceneNumber as number | undefined,
      metadata: seg.metadata as Record<string, string> | undefined,
    })),
  }))

  const designGuide: DesignGuide = {
    colorPalette: (planData.designGuide as Record<string, unknown>)?.colorPalette as string[] || ['#1a1a2e', '#16213e', '#0f3460', '#533483', '#e94560'],
    fontFamily: ((planData.designGuide as Record<string, unknown>)?.fontFamily as string) || 'Inter',
    style: ((planData.designGuide as Record<string, unknown>)?.style as string) || 'Moderno e profissional',
    characterDescriptions: ((planData.designGuide as Record<string, unknown>)?.characterDescriptions as { name: string; description: string }[]) || [],
    recurringElements: ((planData.designGuide as Record<string, unknown>)?.recurringElements as string[]) || [],
  }

  const videoPackage: VideoProductionPackage = {
    title: (planData.title as string) || input.topic,
    totalDuration: (planData.totalDuration as number) || 600,
    scenes,
    narration,
    tracks: tracks.length > 0 ? tracks : buildDefaultTracks(scenes, narration),
    designGuide,
    qualityReport: (reviewData.report as string) || 'Produção aprovada.',
    productionNotes: [
      ...((planData.productionNotes as string[]) || []),
      ...((reviewData.productionNotes as string[]) || []),
    ],
  }

  // ── Media generation tracking ──────────────────────────────────────────────
  const mediaErrors: string[] = []
  let imagesGenerated = 0
  let ttsGenerated = 0
  let totalClipsPlanned = 0

  // ── Step 9: Clip Subdivision (scene-by-scene loop) ────────────────────────
  //
  // For each scene, call an LLM agent to break it into sequential clips
  // of ~clipDuration seconds each. Each clip gets its own image prompt
  // with continuity context from the previous clip.
  //
  if (wantMedia && scenes.length > 0) {
    const clipDuration = input.clipDurationSeconds || 8
    const clipPlannerModel = models.video_clip_planner || models.video_designer
    let previousClipContext = ''

    console.log(`[Video] Step 9: Subdividing ${scenes.length} scenes into clips (~${clipDuration}s each)`)

    for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
      throwIfAborted(signal)
      const scene = scenes[sceneIdx]
      const numClips = Math.max(1, Math.ceil(scene.duration / clipDuration))

      onProgress?.(9, totalSteps, 'clip_subdivision',
        `Planejando clips da cena ${sceneIdx + 1}/${scenes.length} (${numClips} clips)...`)

      try {
        const sceneStartSeconds = parseTimeToSeconds(scene.timeStart)
        const clipResult = await callAgent(input.apiKey, clipPlannerModel, `
Você é um Diretor de Clips de vídeo profissional. Sua tarefa é subdividir uma cena em ${numClips} clips sequenciais de ~${clipDuration} segundos cada.

CENA ${scene.number}:
- Início: ${scene.timeStart} (${sceneStartSeconds}s)
- Fim: ${scene.timeEnd}
- Duração total: ${scene.duration}s
- Visual: ${scene.visual}
- Narração: ${scene.narration}
- Prompt base de imagem: ${scene.imagePrompt}
- Prompt de vídeo: ${scene.videoPrompt}
- Trilha sonora: ${scene.soundtrack}
- Transição: ${scene.transition}

GUIA DE DESIGN:
- Paleta de cores: ${designGuide.colorPalette.join(', ')}
- Estilo: ${designGuide.style}
- Fonte: ${designGuide.fontFamily}
${designGuide.characterDescriptions.length > 0 ? '- Personagens: ' + designGuide.characterDescriptions.map(c => `${c.name}: ${c.description}`).join('; ') : ''}
${designGuide.recurringElements.length > 0 ? '- Elementos recorrentes: ' + designGuide.recurringElements.join(', ') : ''}

${previousClipContext ? `ÚLTIMO CLIP DA CENA ANTERIOR (para continuidade visual):\n${previousClipContext}\n\nMantenha continuidade visual com este clip anterior.` : 'PRIMEIRA CENA — Estabeleça o visual inicial do vídeo.'}

Responda com JSON puro (sem \`\`\`json):
{
  "clips": [
    {
      "clipNumber": 1,
      "timestamp": ${sceneStartSeconds},
      "duration": ${clipDuration},
      "description": "Descrição visual detalhada deste momento em português — o que se vê na tela",
      "imagePrompt": "Highly detailed English prompt for AI image generation. Include: exact composition, lighting direction, colors from the palette [${designGuide.colorPalette.join(', ')}], style (${designGuide.style}), specific visual elements, 16:9 cinematic aspect ratio. Maintain visual consistency with previous clips.",
      "motionDescription": "Camera movement for this clip: static / slow pan right / zoom in / tracking shot / aerial pull back",
      "transition": "crossfade"
    }
  ]
}

REQUISITOS OBRIGATÓRIOS:
1. Gere exatamente ${numClips} clips cobrindo toda a duração da cena
2. Cada clip avança visualmente a narrativa da cena — não repita o mesmo enquadramento
3. Consistência visual absoluta: mesmas cores, estilo, personagens entre clips
4. Prompts de imagem em INGLÊS, extremamente detalhados (mínimo 50 palavras cada)
5. Timestamps absolutos: o primeiro clip começa em ${sceneStartSeconds}s
6. Cada clip subsequente começa onde o anterior termina
7. Descreva movimentos de câmera para guiar a progressão visual
8. Transições suaves entre clips (crossfade, dissolve, cut)`, signal)

        executions.push(makeExecution('clip_subdivision', clipPlannerModel, clipResult))

        const clipData = safeParseJSON(clipResult.content) || { clips: [] }
        const rawClips = (clipData.clips as Array<Record<string, unknown>>) || []

        const clips = rawClips.map((c, idx) => ({
          clipNumber: idx + 1,
          sceneNumber: scene.number,
          timestamp: (c.timestamp as number) || (sceneStartSeconds + idx * clipDuration),
          duration: (c.duration as number) || clipDuration,
          description: (c.description as string) || scene.visual,
          imagePrompt: (c.imagePrompt as string) || scene.imagePrompt,
          motionDescription: (c.motionDescription as string) || '',
          transition: (c.transition as string) || 'crossfade',
        }))

        // Fallback: if no clips generated, create a single clip from the scene
        if (clips.length === 0) {
          clips.push({
            clipNumber: 1,
            sceneNumber: scene.number,
            timestamp: sceneStartSeconds,
            duration: scene.duration,
            description: scene.visual,
            imagePrompt: scene.imagePrompt,
            motionDescription: '',
            transition: scene.transition,
          })
        }

        scene.clips = clips
        totalClipsPlanned += clips.length

        // Save last clip context for inter-scene continuity
        const lastClip = clips[clips.length - 1]
        previousClipContext = `Cena ${scene.number}, Clip ${lastClip.clipNumber}: ${lastClip.description}\nPrompt: ${lastClip.imagePrompt.slice(0, 300)}`

      } catch (err) {
        const errMsg = `Falha ao planejar clips da cena ${scene.number}: ${(err as Error).message}`
        console.error(`[Video] ${errMsg}`)
        mediaErrors.push(errMsg)

        // Fallback: create a single clip from the scene data
        scene.clips = [{
          clipNumber: 1,
          sceneNumber: scene.number,
          timestamp: parseTimeToSeconds(scene.timeStart),
          duration: scene.duration,
          description: scene.visual,
          imagePrompt: scene.imagePrompt,
          motionDescription: '',
          transition: scene.transition,
        }]
        totalClipsPlanned += 1
      }

      // Small delay between scene planning calls to respect rate limits
      if (sceneIdx < scenes.length - 1) {
        await sleep(500, signal)
      }
    }

    console.log(`[Video] Step 9 complete: ${totalClipsPlanned} clips planned across ${scenes.length} scenes`)
  }

  // ── Step 10: Image Generation Loop (per scene → per clip) ─────────────────
  //
  // Loop through all clips across all scenes and generate images.
  // Each clip's image prompt was crafted with continuity context.
  // Scenes without clips (if Step 9 was skipped) fall back to single images.
  //
  if (wantMedia && scenes.length > 0) {
    const imageModel = input.imageModel || models.video_image_generator || DEFAULT_IMAGE_MODEL
    const CONCURRENCY = 3

    // Collect all clips that need images
    const allClips = scenes.flatMap(s => (s.clips || []).filter(c => c.imagePrompt))

    console.log(`[Video] Step 10: Generating images for ${allClips.length} clips with model ${imageModel}`)

    for (let i = 0; i < allClips.length; i += CONCURRENCY) {
      throwIfAborted(signal)
      const batch = allClips.slice(i, i + CONCURRENCY)

      onProgress?.(10, totalSteps, 'media_image_generation',
        `Gerando imagem ${i + 1}–${Math.min(i + CONCURRENCY, allClips.length)} de ${allClips.length} clips...`)

      const results = await Promise.allSettled(
        batch.map(async (clip) => {
          const startMs = Date.now()
          try {
            const result = await generateImageViaOpenRouter({
              apiKey: input.apiKey,
              prompt: clip.imagePrompt,
              model: imageModel,
              aspectRatio: '16:9',
              signal,
            })
            return {
              sceneNumber: clip.sceneNumber,
              clipNumber: clip.clipNumber,
              durationMs: Date.now() - startMs,
              ...result,
            }
          } catch (err) {
            const errMsg = `Falha ao gerar imagem — Cena ${clip.sceneNumber}, Clip ${clip.clipNumber}: ${(err as Error).message}`
            console.error(`[Video] ${errMsg}`)
            mediaErrors.push(errMsg)
            return null
          }
        })
      )

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          const scene = scenes.find(s => s.number === r.value!.sceneNumber)
          if (scene) {
            const clip = scene.clips?.find(c => c.clipNumber === r.value!.clipNumber)
            if (clip) {
              clip.generatedImageUrl = r.value.imageDataUrl
              imagesGenerated++
            }
            // Set scene thumbnail to first clip's image
            if (r.value.clipNumber === 1) {
              scene.generatedImageUrl = r.value.imageDataUrl
            }
          }

          executions.push({
            phase: 'media_image_generation',
            agent_name: 'Gerador de Imagens',
            model: r.value.model,
            tokens_in: 0,
            tokens_out: 0,
            cost_usd: r.value.cost_usd,
            duration_ms: r.value.durationMs,
          })
        } else if (r.status === 'rejected') {
          const errMsg = `Imagem rejeitada: ${(r.reason as Error)?.message || 'erro desconhecido'}`
          console.error(`[Video] ${errMsg}`)
          mediaErrors.push(errMsg)
        }
      }
    }

    // Rebuild video track segments from clips (one segment per clip)
    const videoTrack = videoPackage.tracks.find(t => t.type === 'video')
    if (videoTrack) {
      const clipSegments: TrackSegment[] = []
      for (const scene of scenes) {
        if (scene.clips && scene.clips.length > 0) {
          for (const clip of scene.clips) {
            clipSegments.push({
              id: generateSegmentId(),
              startTime: clip.timestamp,
              endTime: clip.timestamp + clip.duration,
              label: `Cena ${scene.number} · Clip ${clip.clipNumber}`,
              content: clip.description,
              sceneNumber: scene.number,
              clipNumber: clip.clipNumber,
              metadata: {
                clipNumber: String(clip.clipNumber),
                motion: clip.motionDescription,
                transition: clip.transition,
              },
              generatedMediaUrl: clip.generatedImageUrl,
            })
          }
        }
      }
      if (clipSegments.length > 0) {
        videoTrack.segments = clipSegments
      }
    }

    console.log(`[Video] Step 10 complete: ${imagesGenerated}/${allClips.length} clip images generated`)
  }

  // ── Step 11: Generate Narration TTS ───────────────────────────────────────
  if (wantMedia && narration.length > 0) {
    const ttsVoice = input.ttsVoice || 'nova'
    const ttsModel = input.ttsModel || 'openai/gpt-4o-audio-preview'
    const validSegments = narration.filter(s => s.text && s.text.trim().length >= 5)

    console.log(`[Video] Step 11: Generating TTS for ${validSegments.length} narration segments with voice ${ttsVoice}`)

    for (let idx = 0; idx < validSegments.length; idx++) {
      throwIfAborted(signal)
      const segment = validSegments[idx]

      onProgress?.(11, totalSteps, 'media_tts_generation',
        `Gerando narração ${idx + 1} de ${validSegments.length} (cena ${segment.sceneNumber})...`)

      try {
        // Clean narration text: remove *emphasis* markers and [pause] markers
        const cleanText = segment.text
          .replace(/\*([^*]+)\*/g, '$1')
          .replace(/\[pausa?\]/gi, '...')
          .trim()

        const startMs = Date.now()
        const result = await generateTTSViaOpenRouter({
          apiKey: input.apiKey,
          text: cleanText,
          voice: ttsVoice,
          model: ttsModel,
          signal,
        })

        // Convert blob to data URL for persistence
        const audioDataUrl = await blobToDataUrl(result.audioBlob)
        segment.generatedAudioUrl = audioDataUrl
        ttsGenerated++

        // Also update the corresponding narration track segment
        const narrationTrack = videoPackage.tracks.find(t => t.type === 'narration')
        if (narrationTrack) {
          const seg = narrationTrack.segments.find(s => s.sceneNumber === segment.sceneNumber)
          if (seg) seg.generatedMediaUrl = audioDataUrl
        }

        executions.push({
          phase: 'media_tts_generation',
          agent_name: 'Narrador TTS',
          model: ttsModel,
          tokens_in: 0,
          tokens_out: 0,
          cost_usd: 0.015 * (cleanText.length / 1000),
          duration_ms: Date.now() - startMs,
        })
      } catch (err) {
        const errMsg = `Falha ao gerar narração TTS da cena ${segment.sceneNumber}: ${(err as Error).message}`
        console.error(`[Video] ${errMsg}`)
        mediaErrors.push(errMsg)
      }
    }

    console.log(`[Video] Step 11 complete: ${ttsGenerated}/${validSegments.length} TTS segments generated`)
  }

  // ── Add media status to production notes ─────────────────────────────────
  if (wantMedia) {
    const totalClips = scenes.reduce((sum, s) => sum + (s.clips?.length || 0), 0)
    const totalNarrations = narration.filter(s => s.text && s.text.trim().length >= 5).length

    if (imagesGenerated > 0 || ttsGenerated > 0) {
      videoPackage.productionNotes.push(
        `Mídias geradas: ${imagesGenerated}/${totalClips} imagens de clips, ${ttsGenerated}/${totalNarrations} narrações TTS`
      )
    }
    if (mediaErrors.length > 0) {
      videoPackage.productionNotes.push(
        `⚠️ ${mediaErrors.length} erro(s) na geração de mídia. Use o editor para regenerar individualmente.`
      )
    }
    if (imagesGenerated === 0 && totalClips > 0) {
      videoPackage.productionNotes.push(
        '⚠️ Nenhuma imagem de clip foi gerada. Verifique o modelo de imagem e a chave da API.'
      )
    }
    if (ttsGenerated === 0 && totalNarrations > 0) {
      videoPackage.productionNotes.push(
        '⚠️ Nenhuma narração TTS foi gerada. Verifique o modelo TTS e a chave da API.'
      )
    }
  }

  return { package: videoPackage, executions, mediaErrors }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function callAgent(apiKey: string, model: string, prompt: string, signal?: AbortSignal): Promise<LLMResult> {
  return callLLMWithFallback(
    apiKey,
    'Você é um agente especialista em produção de vídeo profissional. Responda SEMPRE com JSON puro e válido, sem markdown, sem explicações adicionais.',
    prompt,
    model,
    model,
    undefined,
    undefined,
    { signal },
  )
}

function makeExecution(phase: string, model: string, result: LLMResult): VideoGenerationStepExecution {
  return {
    phase,
    agent_name: phase,
    model,
    tokens_in: result.tokens_in ?? 0,
    tokens_out: result.tokens_out ?? 0,
    cost_usd: result.cost_usd ?? 0,
    duration_ms: result.duration_ms ?? 0,
  }
}

/**
 * If the compositor doesn't return proper tracks, build defaults from scenes and narration.
 */
function buildDefaultTracks(scenes: VideoScene[], narration: NarrationSegment[]): VideoTrack[] {
  let currentTime = 0

  const videoSegments: TrackSegment[] = scenes.map(s => {
    const seg: TrackSegment = {
      id: generateSegmentId(),
      startTime: currentTime,
      endTime: currentTime + s.duration,
      label: `Cena ${s.number}`,
      content: s.visual,
      sceneNumber: s.number,
      metadata: { transition: s.transition },
    }
    currentTime += s.duration
    return seg
  })

  const narrationSegments: TrackSegment[] = narration.map(n => ({
    id: generateSegmentId(),
    startTime: parseTimeToSeconds(n.timeStart),
    endTime: parseTimeToSeconds(n.timeEnd),
    label: `Narração Cena ${n.sceneNumber}`,
    content: n.text,
    sceneNumber: n.sceneNumber,
  }))

  const musicSegments: TrackSegment[] = [{
    id: generateSegmentId(),
    startTime: 0,
    endTime: currentTime,
    label: 'Trilha Sonora',
    content: 'Música de fundo contínua',
  }]

  return [
    { type: 'video', label: 'Vídeo Principal', segments: videoSegments },
    { type: 'narration', label: 'Narração', segments: narrationSegments },
    { type: 'music', label: 'Trilha Sonora', segments: musicSegments },
    { type: 'sfx', label: 'Efeitos Sonoros', segments: [] },
    { type: 'overlay', label: 'Overlays e Textos', segments: [] },
  ]
}

function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0
  const parts = timeStr.split(':').map(p => {
    const n = parseInt(p, 10)
    return Number.isNaN(n) ? 0 : n
  })
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return 0
}

/**
 * Media Production Pipeline — multi-agent orchestrator for generating
 * rich media artifacts (video, audio, presentations) in Research Notebooks.
 *
 * Each pipeline follows a common pattern:
 *   1. PLANEJAMENTO — Planner agent reads user options, generates detailed proposal
 *      with scene/segment breakdown, token budget, and part suggestions
 *   2. ROTEIRO — Scriptwriter creates full structured script from the plan
 *   3. DETALHAMENTO — Detail agent expands each scene/segment with production-ready detail
 *   4. GERAÇÃO — Generator agent produces actual media (video/audio/image)
 *   5. REVISÃO — Reviewer validates output quality and coherence
 *
 * The pipeline pauses after step 1 for user approval of the plan + cost estimate.
 */

import { callLLM, type LLMResult } from './llm-client'
import {
  loadMediaPipelineModels,
  type MediaPipelineModelMap,
} from './model-config'
import type { StudioArtifactType } from './firestore-service'

// ── User Options Types ──────────────────────────────────────────────────────

export interface VideoCreationOptions {
  format: '16:9' | '9:16' | '1:1' | '4:3'
  quality: 'draft' | 'standard' | 'high' | 'ultra'
  resolution: '480p' | '720p' | '1080p' | '4k'
  fps: 15 | 24 | 30 | 60
  durationMinutes: number
  style: 'realista' | 'animacao' | 'motion_graphics' | 'cinematografico' | 'educacional' | 'documental'
  description?: string
  customScript?: string
  language: 'pt-BR' | 'en-US' | 'es'
  includeNarration: boolean
  includeSubtitles: boolean
  musicStyle?: 'nenhuma' | 'ambiente' | 'corporativa' | 'dramatica' | 'alegre'
}

export interface AudioCreationOptions {
  format: 'podcast' | 'narration' | 'audiobook' | 'lecture' | 'interview'
  durationMinutes: number
  voices: number
  voiceStyle: 'conversational' | 'professional' | 'dramatic' | 'educational'
  quality: 'standard' | 'hd'
  description?: string
  customScript?: string
  language: 'pt-BR' | 'en-US' | 'es'
  includeEffects: boolean
  includeMusic: boolean
  musicStyle?: 'nenhuma' | 'ambiente' | 'corporativa' | 'dramatica'
}

export interface PresentationCreationOptions {
  slideCount: number
  style: 'corporativo' | 'educacional' | 'criativo' | 'minimalista' | 'cientifico'
  includeImages: boolean
  includeCharts: boolean
  includeAnimations: boolean
  colorScheme?: string
  description?: string
  language: 'pt-BR' | 'en-US' | 'es'
}

export type MediaCreationOptions = VideoCreationOptions | AudioCreationOptions | PresentationCreationOptions

// ── Production Plan Types ───────────────────────────────────────────────────

export interface ScenePlan {
  number: number
  title: string
  description: string
  durationSeconds: number
  visualDescription: string
  narration?: string
  transition: string
  estimatedTokens: number
}

export interface SegmentPlan {
  number: number
  speaker: string
  text: string
  durationSeconds: number
  notes?: string
  estimatedTokens: number
}

export interface SlidePlanItem {
  number: number
  title: string
  contentSummary: string
  visualSuggestion: string
  hasImage: boolean
  hasChart: boolean
  estimatedTokens: number
}

export interface ProductionPart {
  partNumber: number
  title: string
  scenes?: ScenePlan[]
  segments?: SegmentPlan[]
  slides?: SlidePlanItem[]
  estimatedTokensTotal: number
  estimatedCostUSD: number
  estimatedDurationSeconds: number
}

export interface ProductionPlan {
  mediaType: 'video' | 'audio' | 'presentation'
  title: string
  summary: string
  totalDurationSeconds: number
  parts: ProductionPart[]
  totalEstimatedTokens: number
  totalEstimatedCostUSD: number
  warnings: string[]
  suggestPartition: boolean
  partitionReason?: string
  metadata: Record<string, unknown>
}

// ── Pipeline Execution Types ────────────────────────────────────────────────

export interface MediaStepExecution {
  phase: string
  agent_name: string
  model: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
  duration_ms: number
}

export interface MediaPipelineResult {
  plan: ProductionPlan
  content: string
  executions: MediaStepExecution[]
}

export type MediaProgressCallback = (
  step: number,
  totalSteps: number,
  phase: string,
  detail?: string,
) => void

// ── Cost Estimation ─────────────────────────────────────────────────────────

/** Tokens per minute of video content (conservative estimate, errs high) */
const TOKENS_PER_MINUTE_VIDEO = 12_000
/** Tokens per minute of audio content */
const TOKENS_PER_MINUTE_AUDIO = 4_000
/** Tokens per slide */
const TOKENS_PER_SLIDE = 2_500
/** Overhead multiplier for planning, scripting, review stages */
const PIPELINE_OVERHEAD = 2.5
/** Max tokens per generation context window (to decide partitioning) */
const MAX_CONTEXT_PER_PART = 60_000
/** Max scenes per video part */
const MAX_SCENES_PER_PART = 10
/** Max segments per audio part */
const MAX_SEGMENTS_PER_PART = 20

/**
 * Pre-estimate token costs BEFORE running the pipeline.
 * Intentionally overestimates (factor 1.3x) so users aren't surprised.
 */
export function estimateMediaTokens(
  mediaType: 'video' | 'audio' | 'presentation',
  options: MediaCreationOptions,
): { estimatedTokens: number; estimatedCostUSD: number; suggestPartition: boolean; parts: number } {
  let baseTokens = 0
  let parts = 1

  if (mediaType === 'video') {
    const opts = options as VideoCreationOptions
    const qualityMultiplier = { draft: 0.6, standard: 1, high: 1.5, ultra: 2 }[opts.quality]
    baseTokens = opts.durationMinutes * TOKENS_PER_MINUTE_VIDEO * qualityMultiplier
    const totalScenes = Math.ceil(opts.durationMinutes * 4) // ~4 scenes per minute
    parts = Math.ceil(totalScenes / MAX_SCENES_PER_PART)
  } else if (mediaType === 'audio') {
    const opts = options as AudioCreationOptions
    baseTokens = opts.durationMinutes * TOKENS_PER_MINUTE_AUDIO * opts.voices
    const totalSegments = Math.ceil(opts.durationMinutes * 6) // ~6 segments per minute
    parts = Math.ceil(totalSegments / MAX_SEGMENTS_PER_PART)
  } else {
    const opts = options as PresentationCreationOptions
    baseTokens = opts.slideCount * TOKENS_PER_SLIDE
    const imageTokens = opts.includeImages ? opts.slideCount * 1_000 : 0
    baseTokens += imageTokens
    parts = 1 // presentations rarely need partitioning
  }

  const totalTokens = Math.ceil(baseTokens * PIPELINE_OVERHEAD * 1.3) // 30% safety margin
  const estimatedCostUSD = totalTokens * 0.000004 // ~$4/1M tokens average

  return {
    estimatedTokens: totalTokens,
    estimatedCostUSD: Math.ceil(estimatedCostUSD * 100) / 100,
    suggestPartition: parts > 1,
    parts: Math.max(1, parts),
  }
}

// ── Prompt Builders ─────────────────────────────────────────────────────────

function buildPlannerPrompt(
  mediaType: 'video' | 'audio' | 'presentation',
  options: MediaCreationOptions,
  topic: string,
  sourceContext: string,
  estimate: ReturnType<typeof estimateMediaTokens>,
): { system: string; user: string } {
  const mediaLabel = { video: 'vídeo', audio: 'áudio', presentation: 'apresentação' }[mediaType]

  const optionsJSON = JSON.stringify(options, null, 2)

  return {
    system: `Você é um produtor de ${mediaLabel} profissional e planejador de projetos de mídia.
Sua tarefa é analisar as opções do usuário e criar uma PROPOSTA DETALHADA de produção.

RESPONDA com um JSON puro no seguinte schema (sem \`\`\`json):
{
  "mediaType": "${mediaType}",
  "title": "Título sugerido para o ${mediaLabel}",
  "summary": "Resumo executivo do projeto (2-3 parágrafos)",
  "totalDurationSeconds": número,
  "parts": [
    {
      "partNumber": 1,
      "title": "Título da parte",
      ${mediaType === 'video' ? `"scenes": [
        {
          "number": 1,
          "title": "Título da cena",
          "description": "Descrição detalhada do que acontece",
          "durationSeconds": número,
          "visualDescription": "Descrição visual completa para o gerador de vídeo",
          "narration": "Texto de narração (se aplicável)",
          "transition": "tipo de transição (corte, fade, dissolve)",
          "estimatedTokens": número
        }
      ],` : mediaType === 'audio' ? `"segments": [
        {
          "number": 1,
          "speaker": "Nome do locutor/host",
          "text": "Texto resumido do segmento",
          "durationSeconds": número,
          "notes": "Notas de produção",
          "estimatedTokens": número
        }
      ],` : `"slides": [
        {
          "number": 1,
          "title": "Título do slide",
          "contentSummary": "Resumo do conteúdo",
          "visualSuggestion": "Sugestão visual",
          "hasImage": boolean,
          "hasChart": boolean,
          "estimatedTokens": número
        }
      ],`}
      "estimatedTokensTotal": número,
      "estimatedCostUSD": número,
      "estimatedDurationSeconds": número
    }
  ],
  "totalEstimatedTokens": número,
  "totalEstimatedCostUSD": número,
  "warnings": ["aviso 1", "..."],
  "suggestPartition": boolean,
  "partitionReason": "razão se suggestPartition = true",
  "metadata": {}
}

Regras de planejamento:
- Analise TODAS as fontes disponíveis para criar conteúdo relevante e preciso
- Cada cena/segmento deve ter estimativa de tokens REALISTA (erre para mais, nunca para menos)
- Se o conteúdo exceder ${MAX_CONTEXT_PER_PART} tokens por parte, DIVIDA em partes menores
- ${mediaType === 'video' ? `Máximo ${MAX_SCENES_PER_PART} cenas por parte. Para vídeos longos, crie múltiplas partes` : ''}
- ${mediaType === 'audio' ? `Máximo ${MAX_SEGMENTS_PER_PART} segmentos por parte` : ''}
- O custo total estimado DEVE ser >= ${estimate.estimatedCostUSD} USD (estimativa base do sistema)
- Inclua warnings para: custo alto, duração longa, necessidade de modelos específicos
- Responda em português brasileiro`,

    user: `TEMA: "${topic}"

OPÇÕES DO USUÁRIO:
${optionsJSON}

ESTIMATIVA BASE DO SISTEMA:
- Tokens estimados: ${estimate.estimatedTokens.toLocaleString()}
- Custo estimado: $${estimate.estimatedCostUSD.toFixed(2)} USD
- Partes sugeridas: ${estimate.parts}
- Particionar: ${estimate.suggestPartition ? 'Sim' : 'Não'}

FONTES DISPONÍVEIS:
${sourceContext || '(Sem fontes — basear-se em conhecimento geral sobre o tema)'}

Crie uma proposta de produção completa para este ${mediaLabel}. Detalhe cada ${mediaType === 'video' ? 'cena' : mediaType === 'audio' ? 'segmento' : 'slide'} individualmente.`,
  }
}

function buildScriptPrompt(
  mediaType: 'video' | 'audio' | 'presentation',
  plan: ProductionPlan,
  part: ProductionPart,
  sourceContext: string,
): { system: string; user: string } {
  const mediaLabel = { video: 'vídeo', audio: 'áudio', presentation: 'apresentação' }[mediaType]

  return {
    system: `Você é um roteirista profissional de ${mediaLabel}. Sua tarefa é expandir o plano de produção em um roteiro COMPLETO e DETALHADO.

${mediaType === 'video' ? `Para CADA CENA, forneça:
- Narração/locução completa (texto integral, não resumo)
- Descrição visual detalhada: composição, movimentos de câmera, cores, iluminação
- Indicações de som: música, efeitos sonoros, silêncio
- Transições: tipo e timing exato
- Texto na tela (lower thirds, títulos, dados)

RESPONDA com JSON puro:
{
  "partNumber": ${part.partNumber},
  "scenes": [
    {
      "number": 1,
      "title": "...",
      "durationSeconds": número,
      "narration": "TEXTO COMPLETO da narração",
      "visualPrompt": "Prompt DETALHADO para o gerador de vídeo IA (em inglês, max 500 chars)",
      "cameraMovement": "static | pan_left | pan_right | zoom_in | zoom_out | tracking | aerial",
      "mood": "warm | cold | dramatic | neutral | energetic",
      "soundDesign": "descrição dos sons/música",
      "transition": { "type": "cut | fade | dissolve | wipe", "durationMs": 500 },
      "overlayText": ["texto na tela 1", "..."],
      "broll": "descrição de B-roll se aplicável"
    }
  ]
}` : mediaType === 'audio' ? `Para CADA SEGMENTO, forneça:
- Texto COMPLETO da narração/diálogo (não resumo)
- Marcações de entonação e pausas
- Efeitos sonoros e transições
- Indicações de música de fundo

RESPONDA com JSON puro:
{
  "partNumber": ${part.partNumber},
  "segments": [
    {
      "number": 1,
      "speaker": "Host A | Host B | Narrador",
      "text": "TEXTO COMPLETO do segmento com marcações de pausa [pausa 2s]",
      "durationSeconds": número,
      "emotion": "neutral | enthusiastic | serious | curious | dramatic",
      "soundEffect": "efeito sonoro (opcional)",
      "backgroundMusic": "descrição (opcional)",
      "ssmlHints": "dicas de prosódia para TTS"
    }
  ]
}` : `Para CADA SLIDE, forneça conteúdo completo:

RESPONDA com JSON puro:
{
  "partNumber": ${part.partNumber},
  "slides": [
    {
      "number": 1,
      "title": "Título do slide",
      "bullets": ["ponto 1", "..."],
      "speakerNotes": "notas completas do apresentador",
      "visualType": "text | image | chart | diagram | quote | comparison",
      "imagePrompt": "prompt para geração de imagem (se visualType = image)",
      "chartData": { "type": "bar|line|pie", "data": [...] },
      "designNotes": "notas de design: cores, layout, destaque"
    }
  ]
}`}

Regras:
- Seja COMPLETO e DETALHADO — cada item deve ter conteúdo integral, não resumos
- Mantenha coerência narrativa entre os itens
- Responda em português brasileiro (exceto visualPrompt que deve ser em inglês)
- Base no plano aprovado, não invente conteúdo fora do escopo`,

    user: `PLANO APROVADO:
${JSON.stringify(plan, null, 2)}

PARTE ${part.partNumber}/${plan.parts.length}: "${part.title}"
${mediaType === 'video' ? `Cenas ${part.scenes?.map(s => s.number).join(', ')}` : ''}

FONTES:
${sourceContext || '(Conhecimento geral)'}

Expanda esta parte em um roteiro COMPLETO e DETALHADO.`,
  }
}

function buildReviewPrompt(
  mediaType: 'video' | 'audio' | 'presentation',
  plan: ProductionPlan,
  allPartsContent: string,
): { system: string; user: string } {
  const mediaLabel = { video: 'vídeo', audio: 'áudio', presentation: 'apresentação' }[mediaType]

  return {
    system: `Você é um diretor de qualidade de produção de ${mediaLabel}. Revise o conteúdo abaixo e retorne uma versão FINAL consolidada.

Critérios:
1. Coerência narrativa entre todas as partes
2. Qualidade do conteúdo textual
3. Adequação das descrições visuais/sonoras
4. Timing e ritmo adequados
5. Aderência ao plano original

RETORNE o conteúdo COMPLETO revisado no mesmo formato JSON, consolidando todas as partes em uma única estrutura.
Responda em português brasileiro.`,

    user: `PLANO ORIGINAL:
Título: ${plan.title}
Duração total: ${plan.totalDurationSeconds}s
Partes: ${plan.parts.length}

CONTEÚDO PARA REVISÃO:
${allPartsContent}

Revise e retorne a versão FINAL consolidada.`,
  }
}

// ── Pipeline Execution ──────────────────────────────────────────────────────

/**
 * Step 1: Generate production plan for user approval.
 * Returns the plan WITHOUT executing the rest of the pipeline.
 * The UI should present this to the user for approval before proceeding.
 */
export async function generateProductionPlan(
  apiKey: string,
  mediaType: 'video' | 'audio' | 'presentation',
  options: MediaCreationOptions,
  topic: string,
  sourceContext: string,
  onProgress?: MediaProgressCallback,
): Promise<{ plan: ProductionPlan; execution: MediaStepExecution }> {
  const models = await loadMediaPipelineModels()
  const plannerKey = `${mediaType === 'presentation' ? 'apresentacao' : mediaType}_planejador`
  const plannerModel = models[plannerKey]
  if (!plannerModel) {
    throw new Error(`Modelo do planejador de ${mediaType} não configurado. Configure em Administração > Produção de Mídia.`)
  }

  const estimate = estimateMediaTokens(mediaType, options)
  const prompt = buildPlannerPrompt(mediaType, options, topic, sourceContext, estimate)

  onProgress?.(1, 1, 'Gerando proposta de produção...', 'Planejador analisando opções e fontes')

  const result: LLMResult = await callLLM(
    apiKey,
    prompt.system,
    prompt.user,
    plannerModel,
    8000,
    0.3,
  )

  // Parse the plan
  let plan: ProductionPlan
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/)
    plan = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(result.content)
  } catch {
    throw new Error('O planejador não retornou um plano válido. Tente novamente ou altere as opções.')
  }

  // Validate and enforce minimums
  if (!plan.parts || plan.parts.length === 0) {
    throw new Error('Plano inválido: nenhuma parte de produção foi definida.')
  }

  // Ensure cost estimate is at least our base estimate (never under-promise)
  if (plan.totalEstimatedCostUSD < estimate.estimatedCostUSD) {
    plan.totalEstimatedCostUSD = estimate.estimatedCostUSD
  }
  if (plan.totalEstimatedTokens < estimate.estimatedTokens) {
    plan.totalEstimatedTokens = estimate.estimatedTokens
  }

  // Add system warning if high cost
  if (plan.totalEstimatedCostUSD > 1.0) {
    plan.warnings = plan.warnings || []
    if (!plan.warnings.some(w => w.includes('custo'))) {
      plan.warnings.push(`Custo estimado elevado: $${plan.totalEstimatedCostUSD.toFixed(2)} USD. Os custos reais podem variar.`)
    }
  }

  const execution: MediaStepExecution = {
    phase: plannerKey,
    agent_name: 'Planejador',
    model: result.model,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    cost_usd: result.cost_usd,
    duration_ms: result.duration_ms,
  }

  return { plan, execution }
}

/**
 * Step 2+: Execute the full pipeline after user approves the plan.
 * Generates content part by part, scene by scene.
 */
export async function executeMediaPipeline(
  apiKey: string,
  mediaType: 'video' | 'audio' | 'presentation',
  plan: ProductionPlan,
  sourceContext: string,
  onProgress?: MediaProgressCallback,
): Promise<MediaPipelineResult> {
  const models = await loadMediaPipelineModels()
  const prefix = mediaType === 'presentation' ? 'apresentacao' : mediaType
  const scriptKey = `${prefix}_roteirista` in models ? `${prefix}_roteirista` : `${prefix}_designer`
  const reviewKey = `${prefix}_revisor`
  const executions: MediaStepExecution[] = []

  const totalSteps = plan.parts.length + 1 // parts + review
  let currentStep = 0

  // Generate script for each part
  const partContents: string[] = []

  for (const part of plan.parts) {
    currentStep++
    onProgress?.(
      currentStep, totalSteps,
      `Criando roteiro da parte ${part.partNumber}/${plan.parts.length}...`,
      `"${part.title}"`,
    )

    const scriptModel = models[scriptKey]
    if (!scriptModel) {
      throw new Error(`Modelo do roteirista de ${mediaType} não configurado.`)
    }

    const prompt = buildScriptPrompt(mediaType, plan, part, sourceContext)
    const result: LLMResult = await callLLM(
      apiKey,
      prompt.system,
      prompt.user,
      scriptModel,
      10000,
      0.4,
    )

    partContents.push(result.content)
    executions.push({
      phase: scriptKey + `_part${part.partNumber}`,
      agent_name: `Roteirista (Parte ${part.partNumber})`,
      model: result.model,
      tokens_in: result.tokens_in,
      tokens_out: result.tokens_out,
      cost_usd: result.cost_usd,
      duration_ms: result.duration_ms,
    })

    // Rate limit pause between parts
    if (part.partNumber < plan.parts.length) {
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
  }

  // Review step
  currentStep++
  onProgress?.(currentStep, totalSteps, 'Revisando produção final...', 'Revisor consolidando todas as partes')

  const reviewModel = models[reviewKey]
  if (!reviewModel) {
    throw new Error(`Modelo do revisor de ${mediaType} não configurado.`)
  }

  await new Promise(resolve => setTimeout(resolve, 1000))

  const reviewPrompt = buildReviewPrompt(mediaType, plan, partContents.join('\n\n---\n\n'))
  const reviewResult: LLMResult = await callLLM(
    apiKey,
    reviewPrompt.system,
    reviewPrompt.user,
    reviewModel,
    12000,
    0.2,
  )

  executions.push({
    phase: reviewKey,
    agent_name: 'Revisor',
    model: reviewResult.model,
    tokens_in: reviewResult.tokens_in,
    tokens_out: reviewResult.tokens_out,
    cost_usd: reviewResult.cost_usd,
    duration_ms: reviewResult.duration_ms,
  })

  return {
    plan,
    content: reviewResult.content,
    executions,
  }
}

// ── Script-to-Plan Conversion ─────────────────────────────────────────────

/** Scene from a ParsedVideoScript (artifact-parsers format) */
export interface ExistingVideoScene {
  number: number
  time: string
  narration: string
  visual: string
  transition?: string
  broll?: string
  lowerThird?: string
  notes?: string
}

export interface ExistingVideoScript {
  title: string
  duration?: string
  scenes: ExistingVideoScene[]
  postProductionNotes?: string[]
}

/**
 * Estimate token cost for generating the full video from an existing script.
 * Returns per-scene and total estimates.
 */
export function estimateVideoFromScript(script: ExistingVideoScript): {
  totalTokens: number
  totalCostUSD: number
  parts: number
  perSceneTokens: number
  breakdown: {
    scriptExpansion: number
    sceneDetailing: number
    videoGeneration: number
    review: number
  }
} {
  const sceneCount = script.scenes.length

  // Token estimates per scene at each pipeline stage
  const scriptExpansionPerScene = 1_500   // Expanding narration + visual prompt
  const sceneDetailPerScene = 3_000       // Full camera, sound, overlay detail
  const videoGenPerScene = 8_000          // Video AI generation prompt + output
  const perSceneTokens = scriptExpansionPerScene + sceneDetailPerScene + videoGenPerScene

  // Stage totals
  const scriptExpansion = sceneCount * scriptExpansionPerScene
  const sceneDetailing = sceneCount * sceneDetailPerScene
  const videoGeneration = sceneCount * videoGenPerScene
  const review = Math.min(sceneCount * 500, 8_000) // Review is capped

  const baseTokens = scriptExpansion + sceneDetailing + videoGeneration + review
  const totalTokens = Math.ceil(baseTokens * 1.3) // 30% safety margin
  const totalCostUSD = Math.ceil(totalTokens * 0.000004 * 100) / 100 // ~$4/1M tokens avg

  // Partitioning
  const parts = Math.max(1, Math.ceil(sceneCount / MAX_SCENES_PER_PART))

  return {
    totalTokens,
    totalCostUSD,
    parts,
    perSceneTokens,
    breakdown: {
      scriptExpansion,
      sceneDetailing,
      videoGeneration,
      review,
    },
  }
}

/**
 * Convert an existing ParsedVideoScript (from the studio pipeline) into a
 * ProductionPlan suitable for executeMediaPipeline().
 */
export function scriptToProductionPlan(script: ExistingVideoScript): ProductionPlan {
  const estimate = estimateVideoFromScript(script)
  const partCount = estimate.parts

  // Distribute scenes across parts
  const scenesPerPart = Math.ceil(script.scenes.length / partCount)
  const parts: ProductionPart[] = []

  for (let p = 0; p < partCount; p++) {
    const startIdx = p * scenesPerPart
    const partScenes = script.scenes.slice(startIdx, startIdx + scenesPerPart)
    if (partScenes.length === 0) continue

    const partTokens = partScenes.length * estimate.perSceneTokens
    const partDuration = partScenes.reduce((sum, s) => {
      // Parse time "MM:SS" to estimate duration per scene (~30s avg if unknown)
      return sum + 30
    }, 0)

    parts.push({
      partNumber: p + 1,
      title: partCount === 1
        ? script.title
        : `${script.title} — Parte ${p + 1}`,
      scenes: partScenes.map(s => ({
        number: s.number,
        title: `Cena ${s.number}`,
        description: s.visual,
        durationSeconds: 30,
        visualDescription: s.visual,
        narration: s.narration,
        transition: s.transition || 'cut',
        estimatedTokens: estimate.perSceneTokens,
      })),
      estimatedTokensTotal: Math.ceil(partTokens * 1.3),
      estimatedCostUSD: Math.ceil(partTokens * 1.3 * 0.000004 * 100) / 100,
      estimatedDurationSeconds: partDuration,
    })
  }

  // Parse total duration from script.duration string (e.g., "10-15 minutos")
  let totalDurationSeconds = script.scenes.length * 30
  if (script.duration) {
    const match = script.duration.match(/(\d+)/)
    if (match) totalDurationSeconds = parseInt(match[1]) * 60
  }

  return {
    mediaType: 'video',
    title: script.title,
    summary: `Plano de produção gerado a partir do roteiro "${script.title}" com ${script.scenes.length} cenas.`,
    totalDurationSeconds,
    parts,
    totalEstimatedTokens: estimate.totalTokens,
    totalEstimatedCostUSD: estimate.totalCostUSD,
    warnings: estimate.totalCostUSD > 0.5
      ? [`Custo estimado: $${estimate.totalCostUSD.toFixed(2)} USD. Os custos reais podem variar.`]
      : [],
    suggestPartition: partCount > 1,
    partitionReason: partCount > 1
      ? `O roteiro tem ${script.scenes.length} cenas, dividido em ${partCount} partes para melhor qualidade.`
      : undefined,
    metadata: {
      sourceScript: script.title,
      originalSceneCount: script.scenes.length,
    },
  }
}

/**
 * Execute the video generation pipeline using an existing script as base.
 * This is the "step 2" — after the user reviewed the script and approved costs.
 *
 * Stages:
 *   1. Script Expansion (Roteirista) — expand each scene with full detail
 *   2. Scene Detailing (Detalhista) — add camera, sound, overlay specifications
 *   3. Video Generation (Gerador) — generate video-ready prompts per scene
 *   4. Review (Revisor) — consolidate and quality-check
 */
export async function executeVideoFromScript(
  apiKey: string,
  script: ExistingVideoScript,
  sourceContext: string,
  onProgress?: MediaProgressCallback,
): Promise<MediaPipelineResult> {
  const plan = scriptToProductionPlan(script)
  const models = await loadMediaPipelineModels()
  const executions: MediaStepExecution[] = []

  // Required models
  const roteirista = models['video_roteirista']
  const detalhista = models['video_detalhista_cena'] || models['video_storyboarder']
  const gerador = models['video_gerador_cena']
  const revisor = models['video_revisor']

  const missing: string[] = []
  if (!roteirista) missing.push('video_roteirista')
  if (!detalhista) missing.push('video_detalhista_cena')
  if (!gerador) missing.push('video_gerador_cena')
  if (!revisor) missing.push('video_revisor')

  if (missing.length > 0) {
    throw new Error(
      `Agente(s) sem modelo configurado: ${missing.join(', ')}. ` +
      'Configure em Administração > Produção de Mídia.'
    )
  }

  const totalSteps = plan.parts.length * 3 + 1 // (expand + detail + generate) per part + review
  let currentStep = 0

  const allPartResults: string[] = []

  for (const part of plan.parts) {
    const sceneSummary = (part.scenes || [])
      .map(s => `Cena ${s.number}: ${s.description} | Narração: ${s.narration || 'N/A'}`)
      .join('\n')

    // ── Stage 1: Script Expansion ──
    currentStep++
    onProgress?.(currentStep, totalSteps, `Expandindo roteiro — Parte ${part.partNumber}/${plan.parts.length}`, 'Roteirista detalhando narrações e diálogos')

    const expandPrompt = {
      system: `Você é um roteirista profissional de vídeo. Expanda o roteiro resumido abaixo em um roteiro COMPLETO com:
- Narração/locução integral (texto completo, não resumo)
- Direções de cena detalhadas
- Indicações de tom, emoção e ritmo
- Marcações de pausa e ênfase

RESPONDA com JSON puro:
{
  "partNumber": ${part.partNumber},
  "scenes": [
    {
      "number": número,
      "narration": "TEXTO COMPLETO da narração/locução",
      "direction": "Direções de cena completas",
      "tone": "tom emocional",
      "pacing": "lento | médio | rápido",
      "emphasis": ["palavras-chave para enfatizar"]
    }
  ]
}`,
      user: `ROTEIRO BASE:\n${sceneSummary}\n\nFONTES:\n${sourceContext || '(Conhecimento geral)'}\n\nExpanda cada cena com narração completa e direções detalhadas.`,
    }

    const expandResult: LLMResult = await callLLM(apiKey, expandPrompt.system, expandPrompt.user, roteirista!, 10000, 0.4)
    executions.push({
      phase: `video_roteirista_part${part.partNumber}`,
      agent_name: `Roteirista (Parte ${part.partNumber})`,
      model: expandResult.model,
      tokens_in: expandResult.tokens_in,
      tokens_out: expandResult.tokens_out,
      cost_usd: expandResult.cost_usd,
      duration_ms: expandResult.duration_ms,
    })

    await new Promise(r => setTimeout(r, 1200))

    // ── Stage 2: Scene Detailing ──
    currentStep++
    onProgress?.(currentStep, totalSteps, `Detalhando cenas — Parte ${part.partNumber}/${plan.parts.length}`, 'Detalhista especificando câmera, som e efeitos')

    const detailPrompt = {
      system: `Você é um diretor técnico de vídeo. Com base no roteiro expandido, adicione especificações técnicas COMPLETAS para cada cena:

RESPONDA com JSON puro:
{
  "partNumber": ${part.partNumber},
  "scenes": [
    {
      "number": número,
      "visualPrompt": "Prompt DETALHADO em inglês para o gerador de vídeo IA (max 500 chars). Descreva composição, iluminação, estilo, cor, elementos visuais",
      "cameraMovement": "static | pan_left | pan_right | zoom_in | zoom_out | tracking | aerial | dolly",
      "cameraAngle": "eye_level | low_angle | high_angle | overhead | dutch | close_up | wide",
      "lighting": "Descrição da iluminação",
      "colorPalette": "Paleta de cores dominante",
      "mood": "warm | cold | dramatic | neutral | energetic | mysterious | peaceful",
      "soundDesign": "Música, efeitos sonoros, ambientes",
      "transition": { "type": "cut | fade | dissolve | wipe | zoom", "durationMs": 500 },
      "overlayText": ["textos na tela"],
      "vfxNotes": "Notas de efeitos visuais e pós-produção"
    }
  ]
}`,
      user: `ROTEIRO EXPANDIDO:\n${expandResult.content}\n\nROTEIRO ORIGINAL:\n${sceneSummary}\n\nAdicione todas as especificações técnicas para cada cena.`,
    }

    const detailResult: LLMResult = await callLLM(apiKey, detailPrompt.system, detailPrompt.user, detalhista!, 10000, 0.3)
    executions.push({
      phase: `video_detalhista_part${part.partNumber}`,
      agent_name: `Detalhista (Parte ${part.partNumber})`,
      model: detailResult.model,
      tokens_in: detailResult.tokens_in,
      tokens_out: detailResult.tokens_out,
      cost_usd: detailResult.cost_usd,
      duration_ms: detailResult.duration_ms,
    })

    await new Promise(r => setTimeout(r, 1200))

    // ── Stage 3: Video Generation Prompts ──
    currentStep++
    onProgress?.(currentStep, totalSteps, `Gerando vídeo — Parte ${part.partNumber}/${plan.parts.length}`, 'Gerador criando conteúdo visual cena por cena')

    const generatePrompt = {
      system: `Você é um gerador de vídeo por IA. Com base no roteiro detalhado, gere o conteúdo FINAL de produção para cada cena, incluindo todos os prompts de geração visual prontos para uso.

RESPONDA com JSON puro:
{
  "partNumber": ${part.partNumber},
  "title": "${part.title}",
  "scenes": [
    {
      "number": número,
      "timeCode": "MM:SS",
      "durationSeconds": número,
      "narrationFinal": "Narração final completa e polida",
      "videoGenerationPrompt": "Prompt final em inglês para gerar o vídeo dessa cena com IA (Runway, Sora, Kling, etc). Inclua estilo, composição, movimento, iluminação, cor. Max 600 chars.",
      "imageGenerationPrompt": "Prompt em inglês para gerar a thumbnail/frame principal desta cena. Max 400 chars.",
      "cameraSpec": { "movement": "tipo", "angle": "tipo", "speed": "slow | normal | fast" },
      "audioSpec": {
        "narration": true,
        "music": "descrição da música de fundo",
        "sfx": ["efeito sonoro 1", "..."],
        "ambience": "descrição do áudio ambiente"
      },
      "overlays": [
        { "type": "text | graphic | lower_third | subtitle", "content": "conteúdo", "position": "top | center | bottom | lower_left | lower_right", "startMs": 0, "durationMs": 3000 }
      ],
      "transition": { "type": "cut | fade | dissolve | wipe", "durationMs": 500 },
      "postProduction": "Notas finais de pós-produção (VFX, cor, grading)"
    }
  ],
  "partSummary": "Resumo do que esta parte cobre",
  "totalDurationSeconds": número
}`,
      user: `ROTEIRO EXPANDIDO:\n${expandResult.content}\n\nESPECIFICAÇÕES TÉCNICAS:\n${detailResult.content}\n\nGere o conteúdo FINAL de produção para todas as cenas desta parte. Cada cena deve ter prompts de geração de vídeo e imagem PRONTOS PARA USO em ferramentas de IA como Runway, Sora ou Kling.`,
    }

    const genResult: LLMResult = await callLLM(apiKey, generatePrompt.system, generatePrompt.user, gerador!, 12000, 0.35)
    executions.push({
      phase: `video_gerador_part${part.partNumber}`,
      agent_name: `Gerador de Vídeo (Parte ${part.partNumber})`,
      model: genResult.model,
      tokens_in: genResult.tokens_in,
      tokens_out: genResult.tokens_out,
      cost_usd: genResult.cost_usd,
      duration_ms: genResult.duration_ms,
    })

    allPartResults.push(genResult.content)

    if (part.partNumber < plan.parts.length) {
      await new Promise(r => setTimeout(r, 1500))
    }
  }

  // ── Stage 4: Final Review ──
  currentStep++
  onProgress?.(currentStep, totalSteps, 'Revisão final do vídeo', 'Revisor consolidando e validando todas as partes')

  await new Promise(r => setTimeout(r, 1000))

  const reviewPrompt = {
    system: `Você é um diretor de qualidade de produção de vídeo. Revise TODO o conteúdo abaixo e retorne uma versão FINAL consolidada.

Critérios de revisão:
1. Coerência narrativa entre todas as partes e cenas
2. Qualidade dos prompts de geração de vídeo (devem ser claros e específicos em inglês)
3. Fluidez das transições entre cenas
4. Timing e ritmo adequados
5. Consistência visual (estilo, cor, iluminação)
6. Completude dos overlays e áudio

RETORNE o conteúdo COMPLETO revisado no seguinte JSON:
{
  "title": "Título do vídeo",
  "totalDurationSeconds": número,
  "totalScenes": número,
  "scenes": [
    // TODAS as cenas consolidadas com os mesmos campos do gerador
  ],
  "postProductionNotes": ["nota 1", "..."],
  "qualityScore": número de 1 a 10,
  "reviewNotes": "Notas do revisor sobre a qualidade geral"
}`,
    user: `PLANO ORIGINAL: "${plan.title}" — ${plan.parts.length} parte(s), ${script.scenes.length} cenas\n\nCONTEÚDO PARA REVISÃO:\n${allPartResults.join('\n\n--- PRÓXIMA PARTE ---\n\n')}\n\nConsolide todas as partes em uma versão FINAL. Mantenha TODOS os prompts de geração.`,
  }

  const reviewResult: LLMResult = await callLLM(apiKey, reviewPrompt.system, reviewPrompt.user, revisor!, 15000, 0.2)
  executions.push({
    phase: 'video_revisor',
    agent_name: 'Revisor de Vídeo',
    model: reviewResult.model,
    tokens_in: reviewResult.tokens_in,
    tokens_out: reviewResult.tokens_out,
    cost_usd: reviewResult.cost_usd,
    duration_ms: reviewResult.duration_ms,
  })

  return {
    plan,
    content: reviewResult.content,
    executions,
  }
}

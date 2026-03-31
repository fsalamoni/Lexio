/**
 * Video Generation Pipeline — multi-agent pipeline that transforms a video script
 * into a complete video production package with scenes, visuals, narration, and timeline.
 *
 * This pipeline uses the 8-agent VIDEO_PIPELINE architecture:
 *   1. Planejador de Produção  — plans production, estimates token costs
 *   2. Roteirista              — refines/expands the script with full directions
 *   3. Diretor de Cenas        — breaks script into detailed timed scenes
 *   4. Storyboarder            — creates frame-by-frame visual descriptions
 *   5. Designer Visual         — generates image prompts for each scene
 *   6. Compositor de Vídeo     — assembles final timeline with transitions/effects
 *   7. Narrador                — generates narration script with timing markers
 *   8. Revisor Final           — quality-checks the complete production package
 *
 * Each agent produces structured JSON that feeds the next. The final output is a
 * VideoProductionPackage used by the VideoStudioEditor component.
 */

import { callLLM, type LLMResult } from './llm-client'
import { loadVideoPipelineModels, VIDEO_PIPELINE_AGENT_DEFS } from './model-config'
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
  /** TTS model override (e.g., 'openai/tts-1-hd') */
  ttsModel?: string
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
  /** Base64 data URL of generated scene image */
  generatedImageUrl?: string
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
  metadata?: Record<string, string>
  /** Base64 data URL of generated media (image or audio) */
  generatedMediaUrl?: string
}

export interface DesignGuide {
  colorPalette: string[]
  fontFamily: string
  style: string
  characterDescriptions: { name: string; description: string }[]
  recurringElements: string[]
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

// ── Cost Estimation ───────────────────────────────────────────────────────────

/**
 * Estimates the token cost for generating a full video from a script.
 * Based on average token usage per agent in the pipeline.
 */
export function estimateVideoGenerationCost(scriptContent: string, includeMedia = true): {
  estimatedTokens: number
  estimatedCostUsd: number
  breakdown: { agent: string; label: string; estimatedTokens: number; estimatedCostUsd: number }[]
  mediaCostUsd: number
  mediaBreakdown: { type: string; label: string; count: number; estimatedCostUsd: number }[]
} {
  const scriptLength = scriptContent.length

  // Base estimates per agent (tokens = input + output), scaled by script size
  const scaleFactor = Math.max(1, scriptLength / 5000)
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

  const breakdown = AGENT_ESTIMATES.map(a => {
    const estimatedTokens = Math.round(a.baseTokens * scaleFactor)
    const estimatedCostUsd = (estimatedTokens / 1000) * a.costPer1kTokens
    return { agent: a.key, label: a.label, estimatedTokens, estimatedCostUsd }
  })

  const estimatedTokens = breakdown.reduce((sum, b) => sum + b.estimatedTokens, 0)
  const estimatedCostUsd = breakdown.reduce((sum, b) => sum + b.estimatedCostUsd, 0)

  // Estimate media generation costs
  const estimatedScenes = Math.max(5, Math.round(scriptLength / 500))
  const mediaBreakdown: { type: string; label: string; count: number; estimatedCostUsd: number }[] = []
  let mediaCostUsd = 0

  if (includeMedia) {
    const imageCost = estimatedScenes * 0.002 // ~$0.002 per image (Gemini Flash)
    const ttsCost = estimatedScenes * 0.005   // ~$0.005 per narration segment (TTS-HD)
    mediaCostUsd = imageCost + ttsCost

    mediaBreakdown.push(
      { type: 'image', label: 'Imagens das Cenas', count: estimatedScenes, estimatedCostUsd: imageCost },
      { type: 'tts', label: 'Narração TTS', count: estimatedScenes, estimatedCostUsd: ttsCost },
    )
  }

  return { estimatedTokens, estimatedCostUsd: estimatedCostUsd + mediaCostUsd, breakdown, mediaCostUsd, mediaBreakdown }
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
): Promise<VideoGenerationResult> {
  const models = await loadVideoPipelineModels()
  const executions: VideoGenerationStepExecution[] = []
  const wantMedia = input.generateMedia !== false // default true
  const totalSteps = wantMedia ? 10 : 8

  // ── Step 1: Planejador de Produção ────────────────────────────────────────
  onProgress?.(1, totalSteps, 'video_planejador', 'Planejador de Produção')

  const planResult = await callAgent(input.apiKey, models.video_planejador, `
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
- Defina uma paleta de cores consistente para todo o vídeo
- Descreva personagens/apresentadores com detalhes visuais para consistência
- Liste elementos visuais recorrentes (logo, lower thirds, transições padrão)
- Planeje a duração de cada segmento em segundos
- Total deve somar a duração indicada no roteiro`)

  executions.push(makeExecution('video_planejador', models.video_planejador, planResult))
  const planData = safeParseJSON(planResult.content) || {}

  // ── Step 2: Roteirista (refinar roteiro) ──────────────────────────────────
  onProgress?.(2, totalSteps, 'video_roteirista', 'Roteirista')

  const scriptResult = await callAgent(input.apiKey, models.video_roteirista, `
Você é um Roteirista profissional de vídeo. Refine e expanda o roteiro abaixo para produção.

ROTEIRO ORIGINAL:
${input.scriptContent}

PLANO DE PRODUÇÃO:
${JSON.stringify(planData, null, 2)}

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

Requisitos:
- Mantenha consistência com o plano de produção (cores, estilo, personagens)
- Narração detalhada com marcações de tom e ênfase
- Cada cena deve ter indicação precisa de início e fim
- Transições coerentes entre cenas
- Se houver personagem, mantenha a mesma descrição visual em todas as aparições
- Cronologia e encadeamento lógico de ideias`)

  executions.push(makeExecution('video_roteirista', models.video_roteirista, scriptResult))
  const scriptData = safeParseJSON(scriptResult.content) || { scenes: [] }

  // ── Step 3: Diretor de Cenas ──────────────────────────────────────────────
  onProgress?.(3, totalSteps, 'video_diretor_cena', 'Diretor de Cenas')

  const directorResult = await callAgent(input.apiKey, models.video_diretor_cena, `
Você é um Diretor de Cenas profissional. Refine as cenas com instruções técnicas detalhadas.

CENAS DO ROTEIRO:
${JSON.stringify(scriptData, null, 2)}

GUIA DE DESIGN:
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
      "visual": "Descrição visual detalhada com enquadramento, iluminação, composição",
      "transition": "tipo de transição com detalhes (ex: fade_in 0.5s)",
      "soundtrack": "Música/efeitos sonoros detalhados",
      "cameraMovement": "Movimento de câmera (pan, tilt, zoom, estático)",
      "lighting": "Descrição da iluminação",
      "lowerThird": "Texto na tela",
      "notes": "Notas técnicas"
    }
  ]
}

Requisitos:
- Adicione instruções de câmera para cada cena
- Refine os timings para encadeamento suave
- Garanta continuidade visual entre cenas consecutivas
- Mantenha personagens consistentes conforme o guia de design`)

  executions.push(makeExecution('video_diretor_cena', models.video_diretor_cena, directorResult))
  const directedScenes = safeParseJSON(directorResult.content) || scriptData

  // ── Step 4: Storyboarder ──────────────────────────────────────────────────
  onProgress?.(4, totalSteps, 'video_storyboarder', 'Storyboarder')

  const storyboardResult = await callAgent(input.apiKey, models.video_storyboarder, `
Você é um Storyboarder profissional. Crie descrições visuais frame-a-frame para cada cena.

CENAS DIRIGIDAS:
${JSON.stringify(directedScenes, null, 2)}

GUIA DE DESIGN:
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

Requisitos:
- 2-4 frames chave por cena (keyframes)
- Descrições visuais detalhadas e precisas
- Mantenha paleta de cores e estilo do guia de design
- Personagens devem ter aparência idêntica em todos os frames
- Indique posição e tamanho dos elementos na composição`)

  executions.push(makeExecution('video_storyboarder', models.video_storyboarder, storyboardResult))
  const storyboardData = safeParseJSON(storyboardResult.content) || {}

  // ── Step 5: Designer Visual ───────────────────────────────────────────────
  onProgress?.(5, totalSteps, 'video_designer', 'Designer Visual')

  const designerResult = await callAgent(input.apiKey, models.video_designer, `
Você é um Designer Visual de produção de vídeo. Gere prompts detalhados de geração de imagem para cada cena.

STORYBOARD:
${JSON.stringify(storyboardData, null, 2)}

GUIA DE DESIGN:
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

Requisitos:
- Um prompt de imagem principal por cena (thumbnail/keyframe)
- Um prompt de vídeo curto por cena (para composição)
- Mantenha consistência visual estrita com o guia de design
- Personagens devem ter prompts idênticos em todas as cenas
- Prompts em inglês para melhor compatibilidade com modelos de geração`)

  executions.push(makeExecution('video_designer', models.video_designer, designerResult))
  const designData = safeParseJSON(designerResult.content) || {}

  // ── Step 6: Compositor de Vídeo ───────────────────────────────────────────
  onProgress?.(6, totalSteps, 'video_compositor', 'Compositor de Vídeo')

  const compositorResult = await callAgent(input.apiKey, models.video_compositor, `
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
- Overlays devem aparecer nos momentos corretos`)

  executions.push(makeExecution('video_compositor', models.video_compositor, compositorResult))
  const compositorData = safeParseJSON(compositorResult.content) || {}

  // ── Step 7: Narrador ──────────────────────────────────────────────────────
  onProgress?.(7, totalSteps, 'video_narrador', 'Narrador')

  const narratorResult = await callAgent(input.apiKey, models.video_narrador, `
Você é um Narrador profissional e diretor de locução. Prepare o script final de narração com marcações de timing.

CENAS:
${JSON.stringify(directedScenes, null, 2)}

TIMELINE:
${JSON.stringify(compositorData.tracks || [], null, 2)}

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

Requisitos:
- Texto exato e completo para cada segmento de narração
- Marcações de ênfase com *asteriscos*
- Indicações de [pausa] onde necessário
- Timing sincronizado com a timeline do compositor
- Estilo de voz consistente ao longo do vídeo
- Pausas entre segmentos para respiração e transição`)

  executions.push(makeExecution('video_narrador', models.video_narrador, narratorResult))
  const narratorData = safeParseJSON(narratorResult.content) || {}

  // ── Step 8: Revisor Final ─────────────────────────────────────────────────
  onProgress?.(8, totalSteps, 'video_revisor', 'Revisor Final de Vídeo')

  const reviewerResult = await callAgent(input.apiKey, models.video_revisor, `
Você é o Revisor Final de Vídeo. Verifique a qualidade e coerência do pacote completo de produção.

PLANO:
${JSON.stringify(planData, null, 2)}

CENAS:
${JSON.stringify(directedScenes, null, 2)}

NARRAÇÃO:
${JSON.stringify(narratorData, null, 2)}

TIMELINE:
${JSON.stringify(compositorData, null, 2)}

GUIA DE DESIGN:
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
    "encadeamento_logico": true
  },
  "suggestions": ["Sugestão de melhoria 1", "..."],
  "productionNotes": ["Nota final de produção 1", "..."]
}

Requisitos:
- Verifique continuidade visual entre cenas
- Confirme consistência de personagens ao longo do vídeo
- Valide sincronização entre narração e visual
- Avalie encadeamento lógico de ideias
- Verifique se a paleta de cores é consistente
- Identifique possíveis problemas e sugira melhorias`)

  executions.push(makeExecution('video_revisor', models.video_revisor, reviewerResult))
  const reviewData = safeParseJSON(reviewerResult.content) || {}

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

  // ── Step 9: Generate Scene Images ──────────────────────────────────────────
  if (wantMedia && scenes.length > 0) {
    const imageModel = input.imageModel || models.video_image_generator || DEFAULT_IMAGE_MODEL
    const CONCURRENCY = 3
    const scenesWithPrompts = scenes.filter(s => s.imagePrompt)

    console.log(`[Video] Step 9: Generating images for ${scenesWithPrompts.length} scenes with model ${imageModel}`)

    // Generate images in batches of CONCURRENCY
    for (let i = 0; i < scenesWithPrompts.length; i += CONCURRENCY) {
      const batchStart = i
      const batch = scenesWithPrompts.slice(i, i + CONCURRENCY)

      // Report granular progress per batch
      onProgress?.(9, totalSteps, 'media_image_generation',
        `Gerando imagem ${batchStart + 1}–${Math.min(batchStart + CONCURRENCY, scenesWithPrompts.length)} de ${scenesWithPrompts.length} cenas...`)

      const results = await Promise.allSettled(
        batch.map(async (scene) => {
          const startMs = Date.now()
          try {
            const result = await generateImageViaOpenRouter({
              apiKey: input.apiKey,
              prompt: scene.imagePrompt,
              model: imageModel,
              aspectRatio: '16:9',
            })
            return { sceneNumber: scene.number, durationMs: Date.now() - startMs, ...result }
          } catch (err) {
            const errMsg = `Falha ao gerar imagem da cena ${scene.number}: ${(err as Error).message}`
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
            scene.generatedImageUrl = r.value.imageDataUrl
            imagesGenerated++
          }
          // Also update the corresponding video track segment
          const videoTrack = videoPackage.tracks.find(t => t.type === 'video')
          if (videoTrack) {
            const seg = videoTrack.segments.find(s => s.sceneNumber === r.value!.sceneNumber)
            if (seg) seg.generatedMediaUrl = r.value.imageDataUrl
          }

          executions.push({
            phase: 'media_image_generation',
            agent_name: `image_scene_${r.value.sceneNumber}`,
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

    console.log(`[Video] Step 9 complete: ${imagesGenerated}/${scenesWithPrompts.length} images generated`)
  }

  // ── Step 10: Generate Narration TTS ──────────────────────────────────────
  if (wantMedia && narration.length > 0) {
    const ttsVoice = input.ttsVoice || 'nova'
    const ttsModel = input.ttsModel || 'openai/tts-1-hd'
    const validSegments = narration.filter(s => s.text && s.text.trim().length >= 5)

    console.log(`[Video] Step 10: Generating TTS for ${validSegments.length} narration segments with voice ${ttsVoice}`)

    for (let idx = 0; idx < validSegments.length; idx++) {
      const segment = validSegments[idx]

      // Report granular progress per segment
      onProgress?.(10, totalSteps, 'media_tts_generation',
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
          agent_name: `tts_scene_${segment.sceneNumber}`,
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

    console.log(`[Video] Step 10 complete: ${ttsGenerated}/${validSegments.length} TTS segments generated`)
  }

  // ── Add media status to production notes ─────────────────────────────────
  if (wantMedia) {
    const totalScenes = scenes.filter(s => s.imagePrompt).length
    const totalNarrations = narration.filter(s => s.text && s.text.trim().length >= 5).length

    if (imagesGenerated > 0 || ttsGenerated > 0) {
      videoPackage.productionNotes.push(
        `Mídias geradas: ${imagesGenerated}/${totalScenes} imagens, ${ttsGenerated}/${totalNarrations} narrações TTS`
      )
    }
    if (mediaErrors.length > 0) {
      videoPackage.productionNotes.push(
        `⚠️ ${mediaErrors.length} erro(s) na geração de mídia. Verifique os detalhes no console.`
      )
    }
    if (imagesGenerated === 0 && totalScenes > 0) {
      videoPackage.productionNotes.push(
        '⚠️ Nenhuma imagem foi gerada. Verifique o modelo de imagem configurado e a chave da API.'
      )
    }
    if (ttsGenerated === 0 && totalNarrations > 0) {
      videoPackage.productionNotes.push(
        '⚠️ Nenhuma narração TTS foi gerada. Verifique o modelo TTS configurado e a chave da API.'
      )
    }
  }

  return { package: videoPackage, executions, mediaErrors }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function callAgent(apiKey: string, model: string, prompt: string): Promise<LLMResult> {
  return callLLM(
    apiKey,
    'Você é um agente especialista em produção de vídeo profissional. Responda SEMPRE com JSON puro e válido, sem markdown, sem explicações adicionais.',
    prompt,
    model,
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

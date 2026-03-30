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
import { loadVideoPipelineModels } from './model-config'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VideoGenerationInput {
  apiKey: string
  /** The raw video script JSON content (from the studio pipeline) */
  scriptContent: string
  /** Original topic/theme */
  topic: string
  /** Notebook or source ID for tracking */
  sourceId: string
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
}

export interface NarrationSegment {
  sceneNumber: number
  text: string
  voiceStyle: string
  timeStart: string
  timeEnd: string
  pauseAfter?: number
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
export function estimateVideoGenerationCost(scriptContent: string): {
  estimatedTokens: number
  estimatedCostUsd: number
  breakdown: { agent: string; label: string; estimatedTokens: number; estimatedCostUsd: number }[]
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

  return { estimatedTokens, estimatedCostUsd, breakdown }
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
): Promise<{ data: Record<string, unknown>; failed: boolean }> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
        await new Promise(r => setTimeout(r, delay))
      }
      const result = await callAgent(apiKey, model, prompt)
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
      const errMsg = err instanceof Error ? err.message : String(err)
      const isRetryable = errMsg.includes('429') || errMsg.includes('timeout') || errMsg.includes('503') || errMsg.includes('ECONNRESET')
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
): Promise<VideoGenerationResult> {
  const models = await loadVideoPipelineModels()
  const executions: VideoGenerationStepExecution[] = []
  const totalSteps = 8

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
- O Guia de Design será usado como REFERÊNCIA OBRIGATÓRIA por todos os demais agentes — seja o mais específico possível`, 'video_planejador', executions)

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
- Cronologia e encadeamento lógico de ideias`, 'video_roteirista', executions)
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
- Garanta continuidade visual entre cenas consecutivas`, 'video_diretor_cena', executions)
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
- Indique posição e tamanho dos elementos na composição`, 'video_storyboarder', executions)

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
- Prompts em inglês para melhor compatibilidade com modelos de geração`, 'video_designer', executions)

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
- Lower thirds e overlays devem seguir o MESMO estilo de design em todo o vídeo`, 'video_compositor', executions)

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
- Timing sincronizado com a timeline do compositor`, 'video_narrador', executions)

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
- Identifique possíveis problemas e sugira melhorias`, 'video_revisor', executions)

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

  return { package: videoPackage, executions }
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

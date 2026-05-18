import { callLLMWithFallback, callLLMWithMessagesFallback, type LLMResult } from './llm-client'
import { formatCostBadge } from './currency-utils'
import { loadModelCatalog } from './model-catalog'
import { generateImageViaOpenRouter } from './image-generation-client'
import { generateTTS, DEFAULT_OPENROUTER_TTS_MODEL } from './tts-client'
import { isExternalVideoProviderConfigured, requestExternalVideoClip } from './external-video-provider'
import {
  buildPipelineFallbackResolver,
  loadFallbackPriorityConfig,
  loadPresentationV2PipelineModels,
  PRESENTATION_V2_PIPELINE_AGENT_DEFS,
  validateScopedAgentModels,
} from './model-config'
import type { PipelineExecutionState } from './pipeline-execution-contract'
import type {
  PresentationV2Deck,
  PresentationV2ExportReadinessSnapshot,
  PresentationV2MultimodalAuditSnapshot,
  PresentationV2MultimodalSlideAuditSnapshot,
  PresentationV2Slide,
  PresentationV2SlideAsset,
} from './firestore-types'
import {
  evaluatePresentationV2Quality,
  type PresentationV2DeckQualityResult,
  type PresentationV2RepairAgent,
} from './quality-evaluator'
import { parseArtifactContent, type ParsedPresentation, type ParsedSlide } from './artifact-parsers'
import { renderPresentationSlidePoster, renderPresentationV2StructuredAsset } from './notebook-visual-artifact-renderer'
import type {
  StudioPipelineInput,
  StudioProgressCallback,
  StudioProgressMeta,
  StudioStepExecution,
} from './notebook-studio-pipeline'
import { resolveOrchestratorModel } from './pipeline-orchestrator'

export interface PresentationV2PipelineResult {
  content: string
  executions: StudioStepExecution[]
}

export interface GeneratedPresentationV2SlideVisual {
  slideNumber: number
  assetId: string
  blob: Blob
  mimeType: string
  extension: string
  model: string
  providerId?: string | null
  providerLabel?: string | null
  costUsd: number
  prompt?: string
  negativePrompt?: string
  qualityScore?: number
  qualityWarnings?: string[]
  retryCount?: number
}

export interface PresentationV2MediaGenerationResult {
  slideVisuals: GeneratedPresentationV2SlideVisual[]
  executions: StudioStepExecution[]
}

export interface GeneratedPresentationV2StructuredVisual {
  slideNumber: number
  assetId: string
  assetType: 'chart' | 'diagram'
  blob: Blob
  mimeType: string
  extension: string
  model: string
  prompt?: string
  altText?: string
}

export interface PresentationV2StructuredVisualGenerationResult {
  structuredVisuals: GeneratedPresentationV2StructuredVisual[]
  executions: StudioStepExecution[]
}

export interface PresentationV2AudioNarrationResult {
  audioBlob: Blob
  mimeType: string
  extension: string
  model: string
  providerId?: string | null
  providerLabel?: string | null
  durationEstimate?: number
  narrationText: string
  slideNumbers?: number[]
  qualityScore?: number
  qualityWarnings?: string[]
  execution: StudioStepExecution
}

export interface GeneratedPresentationV2VideoClip {
  slideNumber: number
  assetId: string
  blob: Blob
  mimeType: string
  extension: string
  provider: string
  jobId?: string
  prompt: string
  durationSeconds?: number
  qualityScore?: number
  qualityWarnings?: string[]
}

export interface PresentationV2VideoClipGenerationResult {
  clips: GeneratedPresentationV2VideoClip[]
  executions: StudioStepExecution[]
  skippedReason?: string
}

export interface PresentationV2ClarificationQuestion {
  id: string
  question: string
  category: 'content' | 'audience' | 'depth' | 'duration' | 'design' | 'media' | 'constraints' | 'other'
  rationale?: string
  suggestedAnswer?: string
  options?: string[]
}

export interface PresentationV2ClarificationResult {
  needsClarification: boolean
  questions: PresentationV2ClarificationQuestion[]
  consolidatedBrief: string
  executions: StudioStepExecution[]
}

export interface PresentationV2PreflightInput {
  uid?: string
  slideCount?: number
  depth?: string
  durationMinutes?: number
  objective?: string
  audience?: string
  coreMessage?: string
  successCriteria?: string
  proofObligations?: string
  institutionalConstraints?: string
  slideDensity?: 'leve' | 'equilibrada' | 'densa' | string
  evidenceMode?: 'padrao' | 'reforcada' | 'estrita' | string
  sourcePriority?: string
  constraints?: string
  sourceAudit?: {
    includedSources: number
    totalSources: number
    includedChars: number
    truncatedSources?: number
    totalContextChars?: number
  }
  multimodal?: {
    images?: boolean
    audio?: boolean
    video?: boolean
    charts?: boolean
    diagrams?: boolean
  }
  mediaRequirements?: {
    images?: 'disabled' | 'optional' | 'required'
    audio?: 'disabled' | 'optional' | 'required'
    video?: 'disabled' | 'optional' | 'required'
    charts?: 'disabled' | 'optional' | 'required'
    diagrams?: 'disabled' | 'optional' | 'required'
  }
}

export interface PresentationV2PreflightCheck {
  label: string
  status: 'ok' | 'warning' | 'blocked'
  detail: string
}

export interface PresentationV2PreflightResult {
  ready: boolean
  blockers: string[]
  warnings: string[]
  checks: PresentationV2PreflightCheck[]
  requiredAgents: string[]
  activeMediaAgents: string[]
  estimatedSteps: number
  estimatedMediaTasks: number
  estimatedCost: PresentationV2CostEstimate
}

export interface PresentationV2CostEstimate {
  currency: 'USD'
  knownTextUsdMin: number
  knownTextUsdMax: number
  knownMediaUsdMin: number
  knownMediaUsdMax: number
  knownTotalUsdMin: number
  knownTotalUsdMax: number
  label: string
  riskLevel: 'low' | 'medium' | 'high'
  unknownCostItems: string[]
  assumptions: string[]
}

interface PresentationV2ReviewerAudit {
  quality: {
    score?: number
    strengths: string[]
    warnings: string[]
    accessibility: string[]
    legalAccuracyNotes: string[]
  }
  revisionNotes: Array<{
    slideNumber?: number
    severity: 'low' | 'medium' | 'high'
    category: string
    issue: string
    recommendedAgent?: PresentationV2RepairAgent
    repairPrompt?: string
  }>
}

interface PresentationV2RepairTarget {
  slideNumber: number
  reasons: string[]
  reviewerPrompts: string[]
  recommendedAgents: PresentationV2RepairAgent[]
  severity: 'medium' | 'high'
}

interface PresentationV2SlideRepairPatch {
  number: number
  sectionId?: string
  title?: string
  purpose?: string
  layout?: string
  bullets?: string[]
  speakerNotes?: string
  transition?: string
  visualBrief?: string
  designNotes?: string[]
  chartSpec?: Record<string, unknown>
  assets?: PresentationV2SlideAsset[]
}

interface AppliedPresentationV2Repair {
  slideNumber: number
  agentKey: PresentationV2RepairAgent
  reasons: string[]
}

const PRESENTATION_V2_TOTAL_STEPS = 11
const PRESENTATION_V2_TEXT_AGENT_KEYS = [
  'presentation_v2_orchestrator',
  'presentation_v2_context_auditor',
  'presentation_v2_narrative_planner',
  'presentation_v2_researcher',
  'presentation_v2_content_architect',
  'presentation_v2_slide_writer',
  'presentation_v2_visual_director',
  'presentation_v2_data_diagrammer',
  'presentation_v2_asset_planner',
  'presentation_v2_reviewer',
  'presentation_v2_packager',
] as const
type PresentationV2TextAgentKey = typeof PRESENTATION_V2_TEXT_AGENT_KEYS[number]
type PresentationV2WaveAgentKey = Exclude<PresentationV2TextAgentKey, 'presentation_v2_orchestrator'>

interface PresentationV2OrchestratorWave {
  key: string
  objective: string
  agents: PresentationV2WaveAgentKey[]
}

interface PresentationV2OrchestratorPlan {
  summary?: string
  globalDirectives: string[]
  riskFlags: string[]
  agentBriefs: Partial<Record<PresentationV2WaveAgentKey, string>>
  waves: PresentationV2OrchestratorWave[]
}

interface PresentationV2RuntimeProgressState {
  activeAgentKeys: Set<string>
  completedAgentKeys: Set<string>
  totalSteps: number
  onProgress?: StudioProgressCallback
}

const PRESENTATION_V2_WAVE_AGENT_KEYS = PRESENTATION_V2_TEXT_AGENT_KEYS.filter(
  (key): key is PresentationV2WaveAgentKey => key !== 'presentation_v2_orchestrator',
)
const PRESENTATION_V2_DEFAULT_WAVES: PresentationV2OrchestratorWave[] = [
  {
    key: 'context',
    objective: 'Auditar contexto, lacunas e lastro probatório antes de liberar o restante do pipeline.',
    agents: ['presentation_v2_context_auditor'],
  },
  {
    key: 'framing',
    objective: 'Executar em paralelo a narrativa macro e a pesquisa consolidada para reduzir o caminho crítico.',
    agents: ['presentation_v2_narrative_planner', 'presentation_v2_researcher'],
  },
  {
    key: 'architecture',
    objective: 'Transformar narrativa e pesquisa em arquitetura slide a slide.',
    agents: ['presentation_v2_content_architect'],
  },
  {
    key: 'composition',
    objective: 'Em paralelo, redigir os slides, dirigir o sistema visual e especificar dados/diagramas.',
    agents: ['presentation_v2_slide_writer', 'presentation_v2_visual_director', 'presentation_v2_data_diagrammer'],
  },
  {
    key: 'assets',
    objective: 'Planejar assets multimodais a partir do texto, direção visual e specs analíticas.',
    agents: ['presentation_v2_asset_planner'],
  },
  {
    key: 'review',
    objective: 'Auditar coerência jurídica, narrativa, visual e multimodal antes do empacotamento.',
    agents: ['presentation_v2_reviewer'],
  },
  {
    key: 'package',
    objective: 'Empacotar o manifesto final no schema PresentationV2Deck.',
    agents: ['presentation_v2_packager'],
  },
]
const INITIAL_TEXT_ONLY_MEDIA_AGENT_KEYS = [
  'presentation_v2_image_generator',
  'presentation_v2_tts',
  'presentation_v2_video_generator',
] as const
const PRESENTATION_V2_MEDIA_LABELS = {
  images: 'imagens',
  audio: 'áudio',
  video: 'vídeo',
  charts: 'gráficos',
  diagrams: 'diagramas',
} as const
const PRESENTATION_V2_REPAIR_SLIDE_LIMIT = 3
const PRESENTATION_V2_REPAIR_AGENTS_PER_SLIDE = 2

type PresentationV2MediaKey = keyof NonNullable<PresentationV2PreflightInput['multimodal']>
type PresentationV2MediaRequirement = 'disabled' | 'optional' | 'required'

function omitInactiveMediaModels(
  models: Record<string, string>,
  activeMediaKeys: ReadonlyArray<typeof INITIAL_TEXT_ONLY_MEDIA_AGENT_KEYS[number]> = [],
): Record<string, string> {
  const validationModels = { ...models }
  const active = new Set(activeMediaKeys)
  for (const key of INITIAL_TEXT_ONLY_MEDIA_AGENT_KEYS) {
    if (!active.has(key)) validationModels[key] = ''
  }
  return validationModels
}

function resolveActiveMediaAgentKeys(input?: PresentationV2PreflightInput['multimodal']): Array<typeof INITIAL_TEXT_ONLY_MEDIA_AGENT_KEYS[number]> {
  const active: Array<typeof INITIAL_TEXT_ONLY_MEDIA_AGENT_KEYS[number]> = []
  if (input?.images) active.push('presentation_v2_image_generator')
  if (input?.audio) active.push('presentation_v2_tts')
  return active
}

function splitBriefingLines(value?: string): string[] {
  return (value || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function resolvePreflightMediaRequirement(input: PresentationV2PreflightInput, key: PresentationV2MediaKey): PresentationV2MediaRequirement {
  if (!input.multimodal?.[key]) return 'disabled'
  return input.mediaRequirements?.[key] === 'required' ? 'required' : 'optional'
}

function resolveRequiredMediaAgentKeys(input: PresentationV2PreflightInput): Array<typeof INITIAL_TEXT_ONLY_MEDIA_AGENT_KEYS[number]> {
  const required: Array<typeof INITIAL_TEXT_ONLY_MEDIA_AGENT_KEYS[number]> = []
  if (resolvePreflightMediaRequirement(input, 'images') === 'required') required.push('presentation_v2_image_generator')
  if (resolvePreflightMediaRequirement(input, 'audio') === 'required') required.push('presentation_v2_tts')
  return required
}

function summarizeContractIssues(items: string[], okMessage: string): string {
  return items.length > 0 ? items.join(' ') : okMessage
}

function assessSourceCoverage(input: PresentationV2PreflightInput): {
  blockers: string[]
  warnings: string[]
  detail: string
  status: PresentationV2PreflightCheck['status']
} {
  const audit = input.sourceAudit
  if (!audit) {
    return {
      blockers: [],
      warnings: [],
      detail: 'Cobertura real do caderno ainda não foi medida para este briefing.',
      status: 'ok',
    }
  }

  const blockers: string[] = []
  const warnings: string[] = []
  const includedSources = Math.max(0, audit.includedSources || 0)
  const totalSources = Math.max(includedSources, audit.totalSources || 0)
  const includedChars = Math.max(0, audit.includedChars || 0)
  const truncatedSources = Math.max(0, audit.truncatedSources || 0)
  const sourceRatio = totalSources > 0 ? includedSources / totalSources : 0

  if (includedSources === 0) {
    if (input.evidenceMode === 'estrita') {
      blockers.push('O caderno não possui fontes promovidas para sustentar um deck com evidência estrita.')
    } else {
      warnings.push('Nenhuma fonte do caderno entrou na janela do estúdio; a geração ficará apoiada só em briefing e conversa.')
    }
  }

  if (includedChars === 0 && includedSources > 0) {
    warnings.push('As fontes promovidas não adicionaram volume textual útil ao contexto desta rodada.')
  } else if (includedChars > 0) {
    const minimumChars = Math.max(240, (input.slideCount || 12) * (input.evidenceMode === 'estrita' ? 110 : 60))
    if (includedChars < minimumChars * 0.5 && input.evidenceMode === 'estrita') {
      blockers.push(`O volume textual promovido do caderno (${includedChars} chars) está abaixo do mínimo recomendado para o rigor probatório solicitado.`)
    } else if (includedChars < minimumChars) {
      warnings.push(`O volume textual promovido do caderno (${includedChars} chars) pode ser insuficiente para ${input.slideCount || 12} slides com a profundidade atual.`)
    }
  }

  if (totalSources > 0 && sourceRatio < 0.5) {
    warnings.push(`Somente ${includedSources}/${totalSources} fontes do caderno entraram na janela ativa do estúdio.`)
  }

  if (truncatedSources > 0) {
    warnings.push(`${truncatedSources} fonte(s) foram truncadas na janela atual; parte do lastro pode ter ficado fora desta rodada.`)
  }

  return {
    blockers,
    warnings,
    detail: blockers[0]
      || warnings[0]
      || `${includedSources}/${totalSources} fontes promovidas, ${includedChars} chars úteis e ${truncatedSources} truncadas na janela atual.`,
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ok',
  }
}

function buildDeterministicClarifierQuestions(input: StudioPipelineInput): PresentationV2ClarificationQuestion[] {
  const briefing = input.presentationV2Briefing
  if (!briefing) return []

  const questions: PresentationV2ClarificationQuestion[] = []
  const sourcePriorityLines = splitBriefingLines(briefing.sourcePriority)
  const enabledMedia = Object.entries(briefing.multimodal || {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => key as PresentationV2MediaKey)

  if (!briefing.objective.trim()) {
    questions.push({
      id: 'briefing-objective',
      question: 'Qual é o objetivo decisório da apresentação?',
      category: 'content',
      rationale: 'Sem objetivo explícito, o deck pode ficar informativo demais e pouco orientado a decisão.',
      suggestedAnswer: 'Objetivo: obter decisão, alinhamento ou aprovação específica ao final da apresentação.',
    })
  }

  if (!briefing.coreMessage.trim()) {
    questions.push({
      id: 'briefing-core-message',
      question: 'Qual tese ou mensagem central precisa permanecer com o público ao final?',
      category: 'content',
      rationale: 'A narrativa só fecha bem quando há uma ideia-força explícita para todos os slides convergirem.',
      suggestedAnswer: 'Mensagem central: a tese mais defensável e a consequência prática que ela destrava.',
    })
  }

  if (!briefing.audience.trim()) {
    questions.push({
      id: 'briefing-audience',
      question: 'Quem é o público principal e qual o nível de tecnicidade esperado?',
      category: 'audience',
      rationale: 'Isso define vocabulário, densidade, exemplos e o grau de abstração aceitável.',
      options: ['Diretoria executiva', 'Cliente leigo', 'Equipe jurídica', 'Sócios do escritório', 'Magistrado / assessor'],
    })
  }

  if (!briefing.successCriteria.trim()) {
    questions.push({
      id: 'briefing-success-criteria',
      question: 'Como você vai reconhecer que a apresentação foi bem-sucedida?',
      category: 'other',
      rationale: 'O critério de sucesso orienta corte de conteúdo, CTA e profundidade do fechamento.',
      suggestedAnswer: 'Sucesso = decisão, aprovação, entendimento ou adesão específica após a apresentação.',
    })
  }

  if (briefing.evidenceMode === 'estrita' && !briefing.proofObligations?.trim()) {
    questions.push({
      id: 'briefing-proof-obligations',
      question: 'Quais provas, fatos ou fundamentos precisam obrigatoriamente aparecer no deck?',
      category: 'constraints',
      rationale: 'No modo de evidência estrita, o pipeline precisa saber exatamente quais obrigações probatórias não podem ser omitidas.',
      suggestedAnswer: 'Indicar provas, dados e fundamentos que precisam aparecer com prioridade obrigatória no roteiro.',
    })
  }

  if (briefing.evidenceMode === 'estrita' && sourcePriorityLines.length === 0) {
    questions.push({
      id: 'briefing-evidence-priority',
      question: 'Quais fontes, provas ou bases devem ter prioridade obrigatória no deck?',
      category: 'constraints',
      rationale: 'No modo de evidência estrita, o deck precisa nascer com trilha probatória definida.',
      suggestedAnswer: 'Priorizar jurisprudência-chave, parecer interno, dados do caso e evidências factuais principais.',
    })
  }

  if (enabledMedia.length > 0 && enabledMedia.every((key) => (briefing.mediaRequirements?.[key] ?? 'optional') === 'optional')) {
    questions.push({
      id: 'briefing-media-priority',
      question: 'Entre as mídias habilitadas, qual delas é realmente indispensável e qual pode apenas enriquecer o deck?',
      category: 'media',
      rationale: 'Separar mídia obrigatória de opcional evita custo e bloqueio desnecessário no pipeline multimodal.',
      suggestedAnswer: `Tornar obrigatória apenas a mídia que muda a decisão final; hoje estão habilitadas: ${enabledMedia.join(', ')}.`,
    })
  }

  if (!briefing.institutionalConstraints?.trim()) {
    questions.push({
      id: 'briefing-institutional-constraints',
      question: 'Existe alguma restrição institucional ou visual que o deck precisa respeitar?',
      category: 'design',
      rationale: 'Isso evita desalinhamento de tom, identidade visual, confidencialidade e governança da apresentação.',
      suggestedAnswer: 'Ex.: linguagem institucional, paleta sóbria, confidencialidade e ausência de efeitos visuais excessivos.',
    })
  }

  if (!briefing.durationMinutes) {
    questions.push({
      id: 'briefing-duration',
      question: 'Qual é a duração-alvo da exposição?',
      category: 'duration',
      rationale: 'Sem tempo-alvo, a densidade cognitiva por slide fica subcalibrada.',
      options: ['5-8 minutos', '10-15 minutos', '20-30 minutos', '45+ minutos'],
    })
  } else {
    const minutesPerSlide = briefing.durationMinutes / Math.max(1, briefing.slideCount)
    const minimumMinutesPerSlide = briefing.slideDensity === 'leve'
      ? 0.55
      : briefing.slideDensity === 'densa'
        ? 1.15
        : 0.85
    if (minutesPerSlide < minimumMinutesPerSlide) {
      questions.push({
        id: 'briefing-density-balance',
        question: 'Você prefere reduzir a quantidade de slides ou simplificar a densidade para caber no tempo-alvo?',
        category: 'duration',
        rationale: `A relação atual está em ${minutesPerSlide.toFixed(2)} min/slide, o que tende a pressionar a narrativa para a densidade escolhida.`,
        options: ['Reduzir slides', 'Simplificar densidade', 'Manter como está'],
      })
    }
  }

  return questions.slice(0, 6)
}

function mergeClarificationQuestions(
  deterministic: PresentationV2ClarificationQuestion[],
  modelGenerated: PresentationV2ClarificationQuestion[],
): PresentationV2ClarificationQuestion[] {
  const merged: PresentationV2ClarificationQuestion[] = []
  const seen = new Set<string>()
  for (const question of [...deterministic, ...modelGenerated]) {
    const signature = (question.id || question.question).trim().toLowerCase()
    if (!signature || seen.has(signature)) continue
    seen.add(signature)
    merged.push(question)
    if (merged.length >= 6) break
  }
  return merged
}

function buildStructuredClarifierFallbackBrief(input: StudioPipelineInput): string {
  const briefing = input.presentationV2Briefing
  if (!briefing) return input.customInstructions || ''

  const enabledMedia = Object.entries(briefing.multimodal || {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => {
      const mediaKey = key as PresentationV2MediaKey
      const label = PRESENTATION_V2_MEDIA_LABELS[mediaKey]
      const requirement = briefing.mediaRequirements?.[mediaKey] === 'required' ? 'obrigatória' : 'opcional'
      return `${label} (${requirement})`
    })
    .join(', ')

  return [
    `Objetivo: ${briefing.objective.trim() || 'a definir'}`,
    `Mensagem central: ${briefing.coreMessage.trim() || 'a definir'}`,
    `Público: ${briefing.audience.trim() || 'a definir'}`,
    `Critério de sucesso: ${briefing.successCriteria.trim() || 'a definir'}`,
    `Profundidade: ${briefing.depth}`,
    `Slides: ${briefing.slideCount}`,
    briefing.durationMinutes ? `Duração alvo: ${briefing.durationMinutes} minutos` : 'Duração alvo: a definir',
    briefing.evidenceMode ? `Exigência de evidência: ${briefing.evidenceMode}` : '',
    briefing.slideDensity ? `Densidade: ${briefing.slideDensity}` : '',
    enabledMedia ? `Mídias habilitadas: ${enabledMedia}` : 'Mídias habilitadas: somente texto estruturado',
    briefing.proofObligations?.trim() ? `Obrigações de prova: ${splitBriefingLines(briefing.proofObligations).join('; ')}` : '',
    briefing.institutionalConstraints?.trim() ? `Restrições institucionais/visuais: ${splitBriefingLines(briefing.institutionalConstraints).join('; ')}` : '',
    briefing.sourcePriority?.trim() ? `Fontes prioritárias: ${splitBriefingLines(briefing.sourcePriority).join('; ')}` : '',
    briefing.constraints?.trim() ? `Restrições: ${splitBriefingLines(briefing.constraints).join('; ')}` : '',
  ].filter(Boolean).join('\n')
}

function resolveDepthFactor(depth?: string): number {
  switch ((depth || '').toLowerCase()) {
    case 'executiva':
      return 0.78
    case 'intermediaria':
    case 'intermediária':
      return 1
    case 'tecnica':
    case 'técnica':
      return 1.45
    case 'profunda':
    default:
      return 1.25
  }
}

function estimateTextStageTokens(slideCount: number, depthFactor: number): Record<string, { input: number; output: number }> {
  const scale = (value: number) => Math.round(value * depthFactor)
  return {
    presentation_v2_context_auditor: { input: scale(11000 + slideCount * 220), output: scale(1100) },
    presentation_v2_narrative_planner: { input: scale(3600 + slideCount * 110), output: scale(1300) },
    presentation_v2_researcher: { input: scale(9500 + slideCount * 340), output: scale(2600) },
    presentation_v2_content_architect: { input: scale(5200 + slideCount * 260), output: scale(900 + slideCount * 180) },
    presentation_v2_slide_writer: { input: scale(7600 + slideCount * 420), output: scale(900 + slideCount * 420) },
    presentation_v2_visual_director: { input: scale(5600 + slideCount * 300), output: scale(800 + slideCount * 210) },
    presentation_v2_data_diagrammer: { input: scale(6200 + slideCount * 260), output: scale(700 + slideCount * 170) },
    presentation_v2_asset_planner: { input: scale(6400 + slideCount * 270), output: scale(800 + slideCount * 190) },
    presentation_v2_reviewer: { input: scale(8000 + slideCount * 360), output: scale(1700) },
    presentation_v2_packager: { input: scale(9500 + slideCount * 430), output: scale(1000 + slideCount * 520) },
  }
}

function estimateModelUsd(
  catalog: Awaited<ReturnType<typeof loadModelCatalog>>,
  modelId: string | undefined,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (!modelId) return null
  const model = catalog.find(item => item.id === modelId)
  if (!model) return null
  if (!model.isFree && model.inputCost === 0 && model.outputCost === 0) return null
  if (!Number.isFinite(model.inputCost) || !Number.isFinite(model.outputCost)) return null
  return (inputTokens / 1_000_000) * model.inputCost + (outputTokens / 1_000_000) * model.outputCost
}

function buildPresentationV2CostEstimate(args: {
  catalog: Awaited<ReturnType<typeof loadModelCatalog>>
  models: Record<string, string>
  slideCount: number
  depth?: string
  durationMinutes?: number
  multimodal?: PresentationV2PreflightInput['multimodal']
  structuredVisualTasks: number
  videoTasks: number
}): PresentationV2CostEstimate {
  const depthFactor = resolveDepthFactor(args.depth)
  const textStageTokens = estimateTextStageTokens(args.slideCount, depthFactor)
  const unknownCostItems: string[] = []
  let knownTextUsdMin = 0

  for (const [agentKey, tokens] of Object.entries(textStageTokens)) {
    const estimated = estimateModelUsd(args.catalog, args.models[agentKey], tokens.input, tokens.output)
    if (estimated === null) {
      unknownCostItems.push(`preço indisponível para ${agentKey}`)
      continue
    }
    knownTextUsdMin += estimated
  }

  let knownMediaUsdMin = 0
  const imageTasks = args.multimodal?.images ? args.slideCount : 0
  if (imageTasks > 0) {
    const imageUsd = estimateModelUsd(args.catalog, args.models.presentation_v2_image_generator, imageTasks * 1200, imageTasks * 800)
    if (imageUsd === null) {
      unknownCostItems.push('preço de geração de imagens depende do provedor/modelo selecionado')
    } else {
      knownMediaUsdMin += imageUsd
    }
  }

  if (args.multimodal?.audio) {
    const minutes = Math.max(3, args.durationMinutes || Math.ceil(args.slideCount * 1.4))
    const ttsUsd = estimateModelUsd(args.catalog, args.models.presentation_v2_tts, minutes * 180, minutes * 180)
    if (ttsUsd === null) {
      unknownCostItems.push('preço de TTS depende do provedor/modelo selecionado')
    } else {
      knownMediaUsdMin += ttsUsd
    }
  }

  if (args.multimodal?.video) {
    unknownCostItems.push(args.videoTasks > 0
      ? 'clipes de vídeo usam provedor externo sem tabela de preço local'
      : 'vídeo solicitado, mas provedor externo não está configurado')
  }

  const knownTextUsdMax = knownTextUsdMin * 1.35
  const knownMediaUsdMax = knownMediaUsdMin * 1.35
  const knownTotalUsdMin = knownTextUsdMin + knownMediaUsdMin
  const knownTotalUsdMax = knownTextUsdMax + knownMediaUsdMax
  const riskLevel: PresentationV2CostEstimate['riskLevel'] = unknownCostItems.length > 0
    ? 'high'
    : knownTotalUsdMax > 0.75
      ? 'medium'
      : 'low'
  const assumptions = [
    `${PRESENTATION_V2_TOTAL_STEPS} etapas textuais estimadas por profundidade "${args.depth || 'profunda'}" e ${args.slideCount} slide(s).`,
    'Faixa máxima inclui 35% de margem para retries, fallback e variação de saída.',
    args.structuredVisualTasks > 0
      ? `${args.structuredVisualTasks} gráfico(s)/diagrama(s) renderizados localmente no browser, sem custo LLM adicional.`
      : 'Sem gráficos/diagramas estruturados solicitados no preflight.',
  ]

  return {
    currency: 'USD',
    knownTextUsdMin,
    knownTextUsdMax,
    knownMediaUsdMin,
    knownMediaUsdMax,
    knownTotalUsdMin,
    knownTotalUsdMax,
    label: `${formatCostBadge(knownTotalUsdMin)}-${formatCostBadge(knownTotalUsdMax)} conhecidos`,
    riskLevel,
    unknownCostItems: [...new Set(unknownCostItems)],
    assumptions,
  }
}

export async function inspectPresentationV2Preflight(input: PresentationV2PreflightInput = {}): Promise<PresentationV2PreflightResult> {
  const models = await loadPresentationV2PipelineModels(input.uid)
  const catalog = await loadModelCatalog(input.uid).catch(() => [])
  const activeMediaAgents = resolveActiveMediaAgentKeys(input.multimodal)
  const requiredMediaAgents = resolveRequiredMediaAgentKeys(input)
  const requiredAgents = [...PRESENTATION_V2_TEXT_AGENT_KEYS, ...requiredMediaAgents]
  const blockers: string[] = []
  const warnings: string[] = []
  const checks: PresentationV2PreflightCheck[] = []

  const contractBlockers: string[] = []
  const contractWarnings: string[] = []
  if (!input.objective?.trim()) contractBlockers.push('Defina o objetivo central do deck antes de gerar.')
  if (!input.coreMessage?.trim()) contractBlockers.push('Defina a tese ou mensagem central que deve permanecer após a apresentação.')
  if (!input.audience?.trim()) contractWarnings.push('Especifique o público principal para calibrar repertório, tom e abstração.')
  if (!input.successCriteria?.trim()) contractWarnings.push('Defina o que caracteriza sucesso para o deck final.')
  blockers.push(...contractBlockers)
  warnings.push(...contractWarnings)
  checks.push({
    label: 'Contrato do briefing',
    status: contractBlockers.length > 0 ? 'blocked' : contractWarnings.length > 0 ? 'warning' : 'ok',
    detail: summarizeContractIssues([...contractBlockers, ...contractWarnings], 'Objetivo, tese central, público e sucesso mínimo já estão claros.'),
  })

  const governanceWarnings: string[] = []
  if (input.evidenceMode === 'estrita' && !splitBriefingLines(input.proofObligations).length) {
    governanceWarnings.push('Modo de evidência estrita sem obrigações de prova explícitas pode deixar o deck sem prioridades probatórias claras.')
  }
  const visualMediaEnabled = Boolean(input.multimodal?.images || input.multimodal?.video || input.multimodal?.charts || input.multimodal?.diagrams)
  if (visualMediaEnabled && !splitBriefingLines(input.institutionalConstraints).length) {
    governanceWarnings.push('Restrições institucionais e visuais não foram explicitadas; o design pode sair desalinhado com a governança esperada.')
  }
  warnings.push(...governanceWarnings)
  checks.push({
    label: 'Regras probatórias e institucionais',
    status: governanceWarnings.length > 0 ? 'warning' : 'ok',
    detail: summarizeContractIssues(governanceWarnings, 'Obrigações de prova e restrições institucionais já estão explicitadas para o pipeline.'),
  })

  const sourceLines = splitBriefingLines(input.sourcePriority)
  const evidenceIssues: string[] = []
  const evidenceWarnings: string[] = []
  if (input.evidenceMode === 'estrita' && sourceLines.length === 0) {
    evidenceIssues.push('Modo de evidência estrita exige prioridade de fontes preenchida.')
  } else if (sourceLines.length === 0) {
    evidenceWarnings.push('Prioridade de fontes vazia: o deck pode sair sem trilha probatória explícita.')
  }
  if ((input.multimodal?.charts || input.multimodal?.diagrams) && sourceLines.length === 0) {
    evidenceWarnings.push('Gráficos e diagramas sem fontes priorizadas tendem a perder rastreabilidade.')
  }
  blockers.push(...evidenceIssues)
  warnings.push(...evidenceWarnings)
  checks.push({
    label: 'Fontes e lastro',
    status: evidenceIssues.length > 0 ? 'blocked' : evidenceWarnings.length > 0 ? 'warning' : 'ok',
    detail: summarizeContractIssues([...evidenceIssues, ...evidenceWarnings], `${sourceLines.length || 'Sem'} prioridade(s) de fonte registrada(s) para sustentar o deck.`),
  })

  const sourceCoverage = assessSourceCoverage(input)
  blockers.push(...sourceCoverage.blockers)
  warnings.push(...sourceCoverage.warnings)
  checks.push({
    label: 'Cobertura real das fontes',
    status: sourceCoverage.status,
    detail: sourceCoverage.detail,
  })

  const slideCount = Math.max(1, input.slideCount || 12)
  const timingIssues: string[] = []
  const timingWarnings: string[] = []
  if (!input.durationMinutes) {
    timingWarnings.push('Defina a duração-alvo para o preflight calibrar a densidade cognitiva.')
  } else {
    const minutesPerSlide = input.durationMinutes / slideCount
    const baseRequirement = input.slideDensity === 'leve'
      ? 0.55
      : input.slideDensity === 'densa'
        ? 1.15
        : 0.85
    const depthPenalty = /tecnic|técnic/i.test(input.depth || '') ? 0.3 : /profund/i.test(input.depth || '') ? 0.15 : 0
    const minimumMinutesPerSlide = baseRequirement + depthPenalty
    if (minutesPerSlide < minimumMinutesPerSlide * 0.65) {
      timingIssues.push(`A relação duração/slides (${minutesPerSlide.toFixed(2)} min/slide) está abaixo do mínimo recomendado para densidade ${input.slideDensity || 'equilibrada'}.`)
    } else if (minutesPerSlide < minimumMinutesPerSlide) {
      timingWarnings.push(`A relação duração/slides (${minutesPerSlide.toFixed(2)} min/slide) sugere risco de sobrecarga cognitiva.`)
    }
  }
  blockers.push(...timingIssues)
  warnings.push(...timingWarnings)
  checks.push({
    label: 'Carga cognitiva e tempo',
    status: timingIssues.length > 0 ? 'blocked' : timingWarnings.length > 0 ? 'warning' : 'ok',
    detail: timingIssues[0] || timingWarnings[0] || 'Distribuição entre tempo, profundidade e quantidade de slides parece sustentável.',
  })

  const mediaContractIssues: string[] = []
  const mediaContractWarnings: string[] = []
  for (const key of Object.keys(PRESENTATION_V2_MEDIA_LABELS) as PresentationV2MediaKey[]) {
    const requirement = resolvePreflightMediaRequirement(input, key)
    if (requirement === 'required' && !input.multimodal?.[key]) {
      mediaContractIssues.push(`${PRESENTATION_V2_MEDIA_LABELS[key]} foi marcado como obrigatório, mas está desativado no briefing.`)
    }
  }
  if (resolvePreflightMediaRequirement(input, 'images') === 'optional' && input.multimodal?.images && !models.presentation_v2_image_generator) {
    mediaContractWarnings.push('Imagens opcionais estão habilitadas, mas não há modelo configurado para materialização.')
  }
  if (resolvePreflightMediaRequirement(input, 'audio') === 'optional' && input.multimodal?.audio && !models.presentation_v2_tts) {
    mediaContractWarnings.push('Áudio opcional está habilitado, mas não há modelo de TTS configurado.')
  }
  blockers.push(...mediaContractIssues)
  warnings.push(...mediaContractWarnings)
  checks.push({
    label: 'Contrato de mídia',
    status: mediaContractIssues.length > 0 ? 'blocked' : mediaContractWarnings.length > 0 ? 'warning' : 'ok',
    detail: summarizeContractIssues([...mediaContractIssues, ...mediaContractWarnings], 'Itens multimodais opcionais e obrigatórios estão coerentes com o briefing.'),
  })

  const missing = requiredAgents.filter(key => !models[key])
  if (missing.length > 0) {
    blockers.push(`Configure modelo para: ${missing.join(', ')}`)
  }
  checks.push({
    label: 'Modelos obrigatórios',
    status: missing.length > 0 ? 'blocked' : 'ok',
    detail: missing.length > 0 ? `${missing.length} agente(s) sem modelo.` : `${requiredAgents.length} agente(s) com modelo selecionado.`,
  })

  try {
    await validateScopedAgentModels('presentation_v2_pipeline_models', omitInactiveMediaModels(models, activeMediaAgents), input.uid)
    checks.push({ label: 'Catálogo e capacidades', status: 'ok', detail: 'Modelos compatíveis com o catálogo atual.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    blockers.push(message)
    checks.push({ label: 'Catálogo e capacidades', status: 'blocked', detail: message })
  }

  const structuredVisualTasks = (input.multimodal?.charts || input.multimodal?.diagrams) ? Math.min(slideCount, 6) : 0
  const videoTasks = input.multimodal?.video && isExternalVideoProviderConfigured() ? Math.min(slideCount, 3) : 0
  const mediaTasks = (input.multimodal?.images ? slideCount : 0)
    + (input.multimodal?.audio ? 1 : 0)
    + structuredVisualTasks
    + videoTasks
  const estimatedCost = buildPresentationV2CostEstimate({
    catalog,
    models,
    slideCount,
    depth: input.depth,
    durationMinutes: input.durationMinutes,
    multimodal: input.multimodal,
    structuredVisualTasks,
    videoTasks,
  })
  if (input.multimodal?.video) {
    if (isExternalVideoProviderConfigured()) {
      checks.push({ label: 'Vídeo', status: 'ok', detail: 'Provedor externo configurado para materializar clipes v2 sob demanda.' })
    } else if (resolvePreflightMediaRequirement(input, 'video') === 'required') {
      blockers.push('Vídeo obrigatório sem provedor externo configurado. Configure VITE_EXTERNAL_VIDEO_PROVIDER_* ou torne vídeo opcional no briefing.')
      checks.push({ label: 'Vídeo', status: 'blocked', detail: 'Sem provedor externo configurado; clipes obrigatórios não podem ser materializados.' })
    } else {
      warnings.push('Vídeo opcional sem provedor externo configurado; o deck poderá seguir sem clipes materializados.')
      checks.push({ label: 'Vídeo', status: 'warning', detail: 'Vídeo permanece opcional; sem provedor externo, o pipeline deve degradar com aviso.' })
    }
  }
  if (input.multimodal?.charts || input.multimodal?.diagrams) {
    checks.push({ label: 'Dados e diagramas', status: 'ok', detail: 'Agente dedicado gera specs; renderizador local materializa PNGs para viewer e export.' })
  }
  if (slideCount > 24 && input.multimodal?.images) {
    warnings.push('Mais de 24 slides com imagem pode aumentar tempo e custo; considere gerar visuais por etapas.')
    checks.push({ label: 'Volume de imagens', status: 'warning', detail: `${slideCount} imagens potenciais.` })
  }

  checks.push({
    label: 'Estimativa operacional e custo',
    status: estimatedCost.riskLevel === 'high' ? 'warning' : 'ok',
    detail: `${PRESENTATION_V2_TOTAL_STEPS} etapas textuais + ${mediaTasks} tarefa(s) multimodal(is). Custo conhecido: ${estimatedCost.label}.`,
  })

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    checks,
    requiredAgents,
    activeMediaAgents,
    estimatedSteps: PRESENTATION_V2_TOTAL_STEPS,
    estimatedMediaTasks: mediaTasks,
    estimatedCost,
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
  }
}

function extractJsonPayload(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] || content).trim()
  const objectStart = candidate.indexOf('{')
  const arrayStart = candidate.indexOf('[')
  const starts = [objectStart, arrayStart].filter((index) => index >= 0)

  if (starts.length === 0) return candidate

  const start = Math.min(...starts)
  const opening = candidate[start]
  const closing = opening === '[' ? ']' : '}'
  const end = candidate.lastIndexOf(closing)

  if (end > start) {
    return candidate.slice(start, end + 1).trim()
  }

  return candidate
}

function resolveExecutionStateFromRetryCount(retryCount?: number): PipelineExecutionState {
  return (retryCount ?? 0) > 0 ? 'retrying' : 'running'
}

function toExecution(
  phase: string,
  agentName: string,
  result: LLMResult,
): StudioStepExecution {
  return {
    phase,
    agent_name: agentName,
    model: result.model,
    provider_id: result.provider_id ?? result.operational?.providerId ?? null,
    provider_label: result.provider_label ?? result.operational?.providerLabel ?? null,
    requested_model: result.operational?.requestedModel ?? null,
    resolved_model: result.operational?.resolvedModel ?? null,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    cost_usd: result.cost_usd,
    duration_ms: result.duration_ms,
    execution_state: resolveExecutionStateFromRetryCount(result.operational?.totalRetryCount),
    retry_count: result.operational?.totalRetryCount,
    used_fallback: result.operational?.fallbackUsed,
    fallback_from: result.operational?.fallbackFrom ?? null,
  }
}

function buildProgressMeta(result: LLMResult): StudioProgressMeta {
  const parts = [result.model.split('/').pop() || result.model]
  if (result.operational?.fallbackUsed && result.operational.fallbackFrom) {
    parts.push(`Fallback de ${result.operational.fallbackFrom.split('/').pop() || result.operational.fallbackFrom}`)
  }
  if ((result.operational?.totalRetryCount ?? 0) > 0) {
    const retries = result.operational?.totalRetryCount ?? 0
    parts.push(`${retries} ${retries === 1 ? 'retry' : 'retries'}`)
  }
  if (result.duration_ms > 0) parts.push(`${Math.max(1, Math.round(result.duration_ms / 1000))}s`)
  if (result.cost_usd > 0) parts.push(formatCostBadge(result.cost_usd))
  return {
    stageMeta: parts.join(' • '),
    executionState: resolveExecutionStateFromRetryCount(result.operational?.totalRetryCount),
    costUsd: result.cost_usd,
    durationMs: result.duration_ms,
    retryCount: result.operational?.totalRetryCount,
    usedFallback: result.operational?.fallbackUsed,
    fallbackFrom: result.operational?.fallbackFrom,
  }
}

function normalizeDeck(raw: string): string {
  return JSON.stringify(parseDeckOrThrow(raw) satisfies PresentationV2Deck, null, 2)
}

function buildInputBrief(input: StudioPipelineInput): string {
  return [
    `Tema: ${input.topic}`,
    input.description ? `Descrição/objetivo informado: ${input.description}` : '',
    input.customInstructions ? `Briefing adicional do usuário: ${input.customInstructions}` : '',
    `Tipo de artefato: ${input.artifactLabel}`,
    'Fontes do caderno:',
    input.sourceContext || 'Sem fontes textuais adicionais.',
    'Conversa recente do caderno:',
    input.conversationContext || 'Sem conversa anterior relevante.',
  ].filter(Boolean).join('\n\n')
}

function buildDeckVisualSystem(input: Pick<StudioPipelineInput, 'topic' | 'description'>, deck: PresentationV2Deck): string {
  const slideTitles = deck.slides.slice(0, 7).map(slide => slide.title).join(' | ')
  const palette = deck.theme.palette?.length ? deck.theme.palette.join(', ') : 'azul profundo, branco, grafite, prata suave e acentos teal'
  const principles = deck.theme.layoutPrinciples?.slice(0, 4).join('; ')
  const designSystem = deck.theme.designSystem
  const hierarchyRules = designSystem?.hierarchyRules?.slice(0, 4).join('; ')
  const accessibilityNotes = deck.theme.accessibilityNotes?.slice(0, 3).join('; ')
  return [
    `Tema central: ${input.topic}.`,
    input.description ? `Objetivo executivo: ${input.description}.` : '',
    `Título da apresentação: ${deck.title}.`,
    deck.subtitle ? `Subtítulo: ${deck.subtitle}.` : '',
    slideTitles ? `Linha narrativa dos slides: ${slideTitles}.` : '',
    `Mood visual: ${deck.theme.mood || 'premium, editorial, jurídico-institucional e contemporâneo'}.`,
    `Paleta orientadora: ${palette}.`,
    principles ? `Princípios de layout: ${principles}.` : '',
    designSystem?.narrativeMode ? `Modo narrativo do deck: ${designSystem.narrativeMode}.` : '',
    designSystem?.surfaceStyle ? `Sistema de superfícies: ${designSystem.surfaceStyle}.` : '',
    designSystem?.contrastStrategy ? `Estratégia de contraste: ${designSystem.contrastStrategy}.` : '',
    designSystem?.accentStrategy ? `Estratégia de acento: ${designSystem.accentStrategy}.` : '',
    hierarchyRules ? `Regras de hierarquia: ${hierarchyRules}.` : '',
    accessibilityNotes ? `Notas de acessibilidade: ${accessibilityNotes}.` : '',
    'A imagem deve funcionar como apoio visual sofisticado ao conteúdo, sem texto renderizado, sem marcas e sem elementos aleatórios.',
  ].filter(Boolean).join(' ')
}

function resolvePresentationV2SlideLayoutFamily(deck: PresentationV2Deck, slideNumber: number) {
  return deck.theme.designSystem?.layoutFamilies?.find(family => family.slideNumbers.includes(slideNumber))
}

type PresentationV2ImagePromptPlan = {
  assetId: string
  prompt: string
  negativePrompt: string
  retryPrompt?: string
  qualityScore: number
  qualityWarnings: string[]
}

type PresentationV2GeneratedImageAssessment = {
  qualityScore: number
  qualityWarnings: string[]
  retryRecommended: boolean
  fallbackRecommended: boolean
}

type PresentationV2ImageCriticAudit = {
  qualityScore?: number
  qualityWarnings: string[]
  strengths: string[]
  retryRecommended: boolean
  fallbackRecommended: boolean
  summary?: string
}

type PresentationV2MediaAlignmentAssessment = {
  qualityScore: number
  qualityWarnings: string[]
}

function estimateDataUrlPayloadBytes(dataUrl?: string): number {
  if (!dataUrl) return 0
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/)
  if (!match) return 0
  const base64 = match[1] || ''
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

function assessPresentationV2GeneratedImageAsset(args: {
  imageDataUrl: string
  promptPlan: PresentationV2ImagePromptPlan
  model?: string
  providerId?: string | null
  providerLabel?: string | null
}): PresentationV2GeneratedImageAssessment {
  const warnings = [...args.promptPlan.qualityWarnings]
  let score = args.promptPlan.qualityScore
  const mimeMatch = args.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/) 
  const mimeType = mimeMatch?.[1]?.toLowerCase()
  const payloadBytes = estimateDataUrlPayloadBytes(args.imageDataUrl)

  if (!mimeType) {
    warnings.push('O provedor retornou uma imagem sem MIME reconhecível para crítica local.')
    score -= 18
  } else if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mimeType)) {
    warnings.push(`Formato ${mimeType} pode reduzir previsibilidade de renderização no slide final.`)
    score -= 6
  }

  if (payloadBytes < 32_000) {
    warnings.push('Payload visual muito pequeno; a imagem pode sair pouco detalhada para uso executivo.')
    score -= 40
  } else if (payloadBytes < 96_000) {
    warnings.push('Payload visual abaixo do ideal; a imagem pode perder definição no slide final.')
    score -= 14
  } else if (payloadBytes > 220_000) {
    score += 4
  }

  if (!args.model?.trim()) {
    warnings.push('Modelo de geração não identificado; rastreabilidade do asset ficou incompleta.')
    score -= 6
  }
  if (!args.providerId && !args.providerLabel) {
    warnings.push('Provedor do asset não foi identificado; diagnóstico do visual fica limitado.')
    score -= 4
  }

  const normalizedWarnings = dedupeStrings(warnings)
  const normalizedScore = Math.max(32, Math.min(98, score))
  return {
    qualityScore: normalizedScore,
    qualityWarnings: normalizedWarnings,
    retryRecommended: normalizedScore < 72,
    fallbackRecommended: payloadBytes < 32_000 || normalizedScore < 58,
  }
}

function buildPresentationV2ImageCriticMessages(args: {
  input: Pick<StudioPipelineInput, 'topic' | 'description'>
  deck: PresentationV2Deck
  presentation: ParsedPresentation
  slide: ParsedSlide
  promptPlan: PresentationV2ImagePromptPlan
  imageDataUrl: string
  localAssessment: PresentationV2GeneratedImageAssessment
}) {
  const deckSlide = args.deck.slides.find(item => item.number === args.slide.number)
  const layoutFamily = resolvePresentationV2SlideLayoutFamily(args.deck, args.slide.number)
  const bulletSummary = args.slide.bullets.slice(0, 5).join('; ')
  const localWarnings = args.localAssessment.qualityWarnings.slice(0, 5).join('; ')
  const proofSignals = args.deck.generationSpec.sourcePriority?.slice(0, 3).join('; ')
  const governanceSignals = dedupeStrings([
    ...(args.deck.generationSpec.constraints || []),
    ...(args.deck.theme.accessibilityNotes || []),
  ]).slice(0, 4).join('; ')

  return [
    {
      role: 'system' as const,
      content: [
        'Você é o Revisor Multimodal da Apresentação v2 em modo de crítica visual pós-geração.',
        'Avalie a imagem real do slide quanto a pertinência semântica, clareza compositiva, legibilidade para convivência com texto externo, sobriedade institucional e aderência ao briefing.',
        'Responda SOMENTE em JSON com quality{score,strengths,warnings}, retryRecommended, fallbackRecommended e summary.',
        'Use score de 0 a 100. Marque fallbackRecommended=true quando a imagem estiver semanticamente desconectada, institucionalmente inadequada ou visualmente fraca para persistência final.',
      ].join(' '),
    },
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: [
            `Tema: ${args.input.topic}.`,
            args.input.description ? `Objetivo executivo: ${args.input.description}.` : '',
            `Título do deck: ${args.deck.title}.`,
            `Slide ${args.slide.number} de ${args.presentation.slides.length}: ${args.slide.title}.`,
            deckSlide?.purpose ? `Função narrativa do slide: ${deckSlide.purpose}.` : '',
            layoutFamily ? `Família de layout esperada: ${layoutFamily.label}. Uso: ${layoutFamily.usage || 'coerência com o design system do deck'}.` : '',
            bulletSummary ? `Pontos centrais: ${bulletSummary}.` : '',
            proofSignals ? `Lastro documental prioritário: ${proofSignals}.` : '',
            governanceSignals ? `Restrições institucionais e de acessibilidade: ${governanceSignals}.` : '',
            `Prompt aplicado na geração: ${args.promptPlan.prompt}.`,
            localWarnings ? `Alertas técnicos locais já detectados: ${localWarnings}.` : 'Sem alertas técnicos locais relevantes.',
            'Decida se a imagem final realmente serve para persistência e exportação do slide, não apenas se o prompt parece bom.',
          ].filter(Boolean).join('\n\n'),
        },
        {
          type: 'image_url' as const,
          image_url: {
            url: args.imageDataUrl,
            detail: 'high' as const,
          },
        },
      ],
    },
  ]
}

function parsePresentationV2ImageCriticAudit(content: string): PresentationV2ImageCriticAudit {
  const parsed = parseJsonObject(content)
  const quality = typeof parsed.quality === 'object' && parsed.quality !== null
    ? parsed.quality as Record<string, unknown>
    : {}
  const rawScore = quality.score ?? parsed.score
  const score = Number.isFinite(Number(rawScore)) ? Number(rawScore) : undefined
  const warnings = dedupeStrings([
    ...toTrimmedStringArray(quality.warnings ?? parsed.warnings),
    ...toTrimmedStringArray(parsed.issues),
  ])
  const strengths = dedupeStrings([
    ...toTrimmedStringArray(quality.strengths ?? parsed.strengths),
  ])
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''

  return {
    qualityScore: score,
    qualityWarnings: warnings,
    strengths,
    retryRecommended: Boolean(parsed.retryRecommended ?? parsed.retry_recommended ?? (typeof score === 'number' && score < 72)),
    fallbackRecommended: Boolean(parsed.fallbackRecommended ?? parsed.fallback_recommended ?? (typeof score === 'number' && score < 58)),
    summary: summary || undefined,
  }
}

function assessPresentationV2AudioNarrationAlignment(
  deck: PresentationV2Deck,
  narrationText: string,
  durationEstimate?: number,
  targetSlideNumbers?: number[],
): PresentationV2MediaAlignmentAssessment {
  let score = 88
  const warnings: string[] = []
  const selectedSlideCount = targetSlideNumbers?.length || deck.slides.length
  const expectedDuration = deck.generationSpec.durationMinutes
    ? deck.generationSpec.durationMinutes * 60 * (selectedSlideCount / Math.max(1, deck.slides.length))
    : undefined

  if (expectedDuration && durationEstimate) {
    const ratio = durationEstimate / expectedDuration
    if (ratio < 0.55 || ratio > 1.45) {
      warnings.push('Duração estimada da narração ficou muito distante do tempo-alvo do deck.')
      score -= 18
    } else if (ratio < 0.75 || ratio > 1.25) {
      warnings.push('Duração estimada da narração ficou parcialmente desalinhada ao tempo planejado para o deck.')
      score -= 10
    }
  }

  const referencedSlides = new Set(
    Array.from(narrationText.matchAll(/Slide\s+(\d+)/gi))
      .map(match => Number(match[1]))
      .filter(Number.isFinite),
  )
  const expectedSlideNumbers = targetSlideNumbers?.length ? targetSlideNumbers : deck.slides.map(slide => slide.number)
  if (expectedSlideNumbers.some(slideNumber => !referencedSlides.has(slideNumber))) {
    warnings.push(targetSlideNumbers?.length
      ? 'A narração parcial não referencia explicitamente todos os slides selecionados.'
      : 'A narração não referencia explicitamente todos os slides do deck.')
    score -= 12
  }

  if (typeof durationEstimate === 'number' && durationEstimate > 0) {
    const secondsPerSlide = durationEstimate / Math.max(1, selectedSlideCount)
    if (secondsPerSlide < 12) {
      warnings.push('Narração muito comprimida por slide; pode comprometer clareza e sincronismo com o deck.')
      score -= 12
    }
  }

  const finalScore = Math.max(52, Math.min(96, score))
  const finalWarnings = dedupeStrings([
    ...warnings,
    ...(finalScore < 72 ? ['Revisão humana recomendada antes de tratar a narração como asset final.'] : []),
  ])

  return {
    qualityScore: finalScore,
    qualityWarnings: finalWarnings,
  }
}

function assessPresentationV2VideoClipAlignment(args: {
  deck: PresentationV2Deck
  slideNumber: number
  assetId: string
  prompt: string
  durationSeconds: number
  plannedAssetIds: Set<string>
}): PresentationV2MediaAlignmentAssessment {
  let score = 86
  const warnings: string[] = []
  const slide = args.deck.slides.find(item => item.number === args.slideNumber)

  if (!slide) {
    warnings.push('Clipe associado a um slide inexistente no manifesto final.')
    score -= 28
  } else {
    const normalizedPrompt = args.prompt.toLowerCase()
    if (!normalizedPrompt.includes(args.deck.title.toLowerCase())) {
      warnings.push('Prompt do clipe não reaproveitou o contexto nominal do deck.')
      score -= 6
    }
    if (!normalizedPrompt.includes(slide.title.toLowerCase())) {
      warnings.push('Prompt do clipe não manteve referência explícita ao título do slide correspondente.')
      score -= 10
    }
  }

  if (!args.plannedAssetIds.has(args.assetId)) {
    warnings.push('Clipe gerado por fallback de cobertura, sem asset de vídeo explicitamente planejado no manifesto.')
    score -= 10
  }

  const expectedDuration = args.deck.generationSpec.durationMinutes
    ? Math.max(4, Math.min(12, Math.round((args.deck.generationSpec.durationMinutes * 60) / Math.max(1, args.deck.slides.length))))
    : undefined
  if (expectedDuration && Math.abs(args.durationSeconds - expectedDuration) > 2) {
    warnings.push('Duração do clipe divergiu do pacing planejado para os slides do deck.')
    score -= 8
  }

  const finalScore = Math.max(52, Math.min(96, score))
  const finalWarnings = dedupeStrings([
    ...warnings,
    ...(finalScore < 72 ? ['Revisão humana recomendada antes de usar o clipe como asset final.'] : []),
  ])

  return {
    qualityScore: finalScore,
    qualityWarnings: finalWarnings,
  }
}

function isStoredPresentationV2Asset(asset: PresentationV2SlideAsset | undefined | null): asset is PresentationV2SlideAsset {
  return Boolean(asset) && (asset?.status === 'stored' || Boolean(asset?.url) || Boolean(asset?.storagePath))
}

function resolvePresentationV2MultimodalStatus(score: number): 'ok' | 'review' | 'critical' {
  if (score < 60) return 'critical'
  if (score < 75) return 'review'
  return 'ok'
}

function normalizePresentationV2AuditAssetType(type: PresentationV2SlideAsset['type']): string {
  if (type === 'image' || type === 'background' || type === 'render') return 'render'
  if (type === 'chart' || type === 'diagram') return type
  if (type === 'video') return 'video'
  if (type === 'audio') return 'audio'
  return type
}

export function auditPresentationV2MultimodalCoherence(deck: PresentationV2Deck): PresentationV2MultimodalAuditSnapshot {
  const storedDeckAssets = (deck.assets || []).filter(isStoredPresentationV2Asset)
  const storedAudioAssets = storedDeckAssets.filter(asset => asset.type === 'audio')
  const slideAudits: PresentationV2MultimodalSlideAuditSnapshot[] = deck.slides.map((slide) => {
    let score = 90
    const warnings: string[] = []
    const strengths: string[] = []
    const missingAssetTypes: string[] = []
    const storedSlideAssets = (slide.assets || []).filter(isStoredPresentationV2Asset)
    const renderAssets = storedSlideAssets.filter(asset => asset.type === 'render' || asset.type === 'image' || asset.type === 'background')
    const structuredAssets = storedSlideAssets.filter(asset => asset.type === 'chart' || asset.type === 'diagram')
    const videoAssets = storedSlideAssets.filter(asset => asset.type === 'video')
    const expectsRender = Boolean(
      slide.renderedImageUrl
      || slide.visualBrief?.trim()
      || (slide.assets || []).some(asset => (asset.type === 'render' || asset.type === 'image' || asset.type === 'background') && asset.status !== 'skipped'),
    )
    const expectsStructured = Boolean(
      slide.chartSpec
      || (slide.assets || []).some(asset => (asset.type === 'chart' || asset.type === 'diagram') && asset.status !== 'skipped'),
    )
    const expectsVideo = Boolean((slide.assets || []).some(asset => asset.type === 'video' && asset.status !== 'skipped'))
    const lowConfidenceWarnings = dedupeStrings(storedSlideAssets.flatMap(asset => asset.qualityWarnings || []))

    if (expectsRender && renderAssets.length === 0 && !slide.renderedImageUrl) {
      warnings.push(`Slide ${slide.number} ainda não possui visual final materializado apesar do planejamento visual explícito.`)
      missingAssetTypes.push('render')
      score -= 14
    }
    if (expectsStructured && structuredAssets.length === 0) {
      warnings.push(`Slide ${slide.number} ainda não materializou o apoio analítico planejado (gráfico/diagrama).`)
      missingAssetTypes.push('chart/diagram')
      score -= 12
    }
    if (expectsVideo && videoAssets.length === 0) {
      warnings.push(`Slide ${slide.number} ainda não possui o clipe planejado no manifesto.`)
      missingAssetTypes.push('video')
      score -= 10
    }
    if (renderAssets.some(asset => typeof asset.qualityScore === 'number' && asset.qualityScore < 72)) {
      warnings.push(`Visual principal do slide ${slide.number} ainda está abaixo do limiar de confiança do deck.`)
      score -= 10
    }
    if (videoAssets.some(asset => typeof asset.qualityScore === 'number' && asset.qualityScore < 72)) {
      warnings.push(`Clipe do slide ${slide.number} ainda exige revisão de alinhamento antes de uso final.`)
      score -= 8
    }
    if (storedAudioAssets.length > 0 && slide.speakerNotes.trim().length < 40) {
      warnings.push(`Slide ${slide.number} participa de uma narrativa com áudio, mas as speaker notes ainda estão rasas para sincronismo confiável.`)
      score -= 6
    }

    if (renderAssets.length > 0 && !renderAssets.some(asset => typeof asset.qualityScore === 'number' && asset.qualityScore < 72)) {
      strengths.push(`Slide ${slide.number} já possui visual final materializado.`)
    }
    if (expectsStructured && structuredAssets.length > 0) {
      strengths.push(`Slide ${slide.number} já possui apoio analítico materializado.`)
    }
    if (videoAssets.length > 0 && !videoAssets.some(asset => typeof asset.qualityScore === 'number' && asset.qualityScore < 72)) {
      strengths.push(`Slide ${slide.number} já possui clipe alinhado ao manifesto.`)
    }

    const finalWarnings = dedupeStrings([...warnings, ...lowConfidenceWarnings.slice(0, 2)])
    const finalScore = Math.max(48, Math.min(96, score))
    return {
      slideNumber: slide.number,
      score: finalScore,
      status: resolvePresentationV2MultimodalStatus(finalScore),
      strengths: dedupeStrings(strengths),
      warnings: finalWarnings,
      availableAssetTypes: dedupeStrings([
        ...renderAssets.map(() => 'render'),
        ...structuredAssets.map(asset => asset.type),
        ...videoAssets.map(() => 'video'),
      ]),
      missingAssetTypes: dedupeStrings(missingAssetTypes),
    }
  })

  let deckScore = slideAudits.length > 0
    ? Math.round(slideAudits.reduce((sum, slide) => sum + slide.score, 0) / slideAudits.length)
    : 90
  const deckWarnings: string[] = []
  const deckStrengths: string[] = []

  if (deck.generationSpec.multimodal?.audio) {
    if (storedAudioAssets.length === 0) {
      deckWarnings.push('Modo áudio foi solicitado, mas a narração final ainda não foi materializada.')
      deckScore -= 12
    } else {
      deckStrengths.push('Deck já possui narração final persistida.')
      if (storedAudioAssets.some(asset => typeof asset.qualityScore === 'number' && asset.qualityScore < 72)) {
        deckWarnings.push('A narração final ainda exige revisão de alinhamento com o pacing do deck.')
        deckScore -= 8
      }
    }
  } else if (storedAudioAssets.length > 0) {
    deckStrengths.push('Deck possui narração opcional persistida.')
  }

  const missingRenderSlides = slideAudits.filter(slide => slide.missingAssetTypes?.includes('render')).map(slide => slide.slideNumber)
  if (missingRenderSlides.length > 0) {
    deckWarnings.push(`Slides ${missingRenderSlides.join(', ')} ainda sem visual final apesar do briefing visual explícito.`)
    deckScore -= Math.min(14, missingRenderSlides.length * 4)
  }
  const missingStructuredSlides = slideAudits.filter(slide => slide.missingAssetTypes?.includes('chart/diagram')).map(slide => slide.slideNumber)
  if (missingStructuredSlides.length > 0) {
    deckWarnings.push(`Slides ${missingStructuredSlides.join(', ')} ainda sem gráfico/diagrama planejado materializado.`)
    deckScore -= Math.min(12, missingStructuredSlides.length * 4)
  }
  const missingVideoSlides = slideAudits.filter(slide => slide.missingAssetTypes?.includes('video')).map(slide => slide.slideNumber)
  if (missingVideoSlides.length > 0) {
    deckWarnings.push(`Slides ${missingVideoSlides.join(', ')} ainda sem clipe planejado materializado.`)
    deckScore -= Math.min(10, missingVideoSlides.length * 3)
  }

  const criticalSlides = slideAudits.filter(slide => slide.status === 'critical').map(slide => slide.slideNumber)
  if (criticalSlides.length > 0) {
    deckWarnings.push(`Coerência multimodal crítica nos slides ${criticalSlides.join(', ')}.`)
    deckScore -= 8
  }
  if (slideAudits.length > 0 && criticalSlides.length === 0 && slideAudits.every(slide => slide.status === 'ok')) {
    deckStrengths.push('Todos os slides auditados estão acima do limiar de coerência multimodal.')
  }

  const finalScore = Math.max(50, Math.min(96, deckScore))
  return {
    score: finalScore,
    status: resolvePresentationV2MultimodalStatus(finalScore),
    strengths: dedupeStrings(deckStrengths).slice(0, 6),
    warnings: dedupeStrings(deckWarnings).slice(0, 8),
    auditedAssetTypes: dedupeStrings(storedDeckAssets.map(asset => normalizePresentationV2AuditAssetType(asset.type))),
    slides: slideAudits,
  }
}

export function auditPresentationV2ExportReadiness(deck: PresentationV2Deck): PresentationV2ExportReadinessSnapshot {
  const storedDeckAssets = (deck.assets || []).filter(isStoredPresentationV2Asset)
  const visualAssets = storedDeckAssets.filter(asset => (
    asset.type === 'render'
    || asset.type === 'chart'
    || asset.type === 'diagram'
    || asset.type === 'video'
  ))
  const missingAltTextAssets = visualAssets.filter(asset => !asset.altText?.trim())
  const rejectedVisualAssets = visualAssets.filter(asset => asset.operatorReview?.status === 'rejected')
  const speakerNoteGapSlides = deck.exportHints?.includeSpeakerNotes === false
    ? []
    : deck.slides.filter(slide => slide.speakerNotes.trim().length < 40).map(slide => slide.number)
  const sectionIds = new Set(deck.outline.sections.map(section => section.id))
  const orphanSlides = deck.outline.sections.length > 0
    ? deck.slides.filter(slide => !slide.sectionId || !sectionIds.has(slide.sectionId)).map(slide => slide.number)
    : []
  const hasSourcePriority = (deck.generationSpec.sourcePriority || []).some(item => item.trim())
  const hasInstitutionalConstraints = (deck.generationSpec.constraints || []).some(item => item.trim())
  const evidenceDrivenVisualCount = storedDeckAssets.filter(asset => asset.type === 'chart' || asset.type === 'diagram').length
  const missingEvidenceTraceability = evidenceDrivenVisualCount > 0 && !hasSourcePriority
  const missingInstitutionalContract = visualAssets.length > 0 && !hasInstitutionalConstraints
  const contrastWarnings = dedupeStrings(storedDeckAssets
    .flatMap(asset => asset.qualityWarnings || [])
    .filter(warning => /contraste|legibilidade|acessibilidade/i.test(warning)))
  const existingAccessibility = dedupeStrings([
    ...(deck.theme.accessibilityNotes || []),
    ...(deck.quality?.accessibility || []),
  ])
  const existingLegalNotes = dedupeStrings(deck.quality?.legalAccuracyNotes || [])

  const accessibilityNotes = dedupeStrings([
    ...existingAccessibility,
    ...(missingAltTextAssets.length > 0
      ? [`${missingAltTextAssets.length} asset(s) visual(is) ainda sem alt text validado para exportação acessível.`]
      : []),
    ...(speakerNoteGapSlides.length > 0
      ? [`Slides ${speakerNoteGapSlides.join(', ')} ainda com speaker notes rasas para exportação com notas do apresentador.`]
      : []),
    ...contrastWarnings.slice(0, 2),
  ])
  const legalAccuracyNotes = dedupeStrings([
    ...existingLegalNotes,
    ...(missingEvidenceTraceability
      ? ['Charts/diagramas materializados ainda sem fontes prioritárias explícitas no manifesto final.']
      : !hasSourcePriority
      ? ['Manifesto não registra lastro documental prioritário para revisão jurídica final.']
      : []),
    ...(missingInstitutionalContract
      ? ['Manifesto não preserva restrições institucionais/visuais apesar de assets visuais finalizados.']
      : []),
    ...(orphanSlides.length > 0
      ? [`Slides ${orphanSlides.join(', ')} ainda sem seção explícita no manifesto final, reduzindo rastreabilidade argumentativa.`]
      : []),
  ])

  let score = 92
  const blockingIssues: string[] = []
  const reviewWarnings: string[] = []
  if (missingEvidenceTraceability) {
    blockingIssues.push('Charts/diagramas materializados ainda sem fontes prioritárias explícitas no manifesto final.')
    score -= 14
  } else if (!hasSourcePriority) {
    reviewWarnings.push('Manifesto ainda sem fontes prioritárias explícitas para revisão jurídica final.')
    score -= 6
  }
  if (missingInstitutionalContract) {
    reviewWarnings.push('Manifesto ainda sem restrições institucionais/visuais explícitas apesar de assets visuais finalizados.')
    score -= 5
  }
  if (missingAltTextAssets.length > 0) {
    blockingIssues.push(`${missingAltTextAssets.length} asset(s) visual(is) ainda sem alt text validado para exportação acessível.`)
    score -= Math.min(22, missingAltTextAssets.length * 7)
  }
  if (rejectedVisualAssets.length > 0) {
    blockingIssues.push(`${rejectedVisualAssets.length} asset(s) visual(is) rejeitado(s) pelo operador ainda constam no manifesto final.`)
    score -= Math.min(24, rejectedVisualAssets.length * 8)
  }
  if (speakerNoteGapSlides.length > 0) {
    reviewWarnings.push(`Slides ${speakerNoteGapSlides.join(', ')} ainda com speaker notes rasas para exportação com notas do apresentador.`)
    score -= Math.min(16, speakerNoteGapSlides.length * 4)
  }
  if (orphanSlides.length > 0) {
    reviewWarnings.push(`Slides ${orphanSlides.join(', ')} ainda sem seção explícita no manifesto final.`)
    score -= Math.min(12, orphanSlides.length * 4)
  }
  if (deck.quality?.multimodalAudit?.status === 'critical') {
    blockingIssues.push(`Coerência multimodal ainda em estado crítico${deck.quality.multimodalAudit.score != null ? ` (${deck.quality.multimodalAudit.score}/100)` : ''}.`)
    score -= 16
  } else if (deck.quality?.multimodalAudit?.status === 'review') {
    reviewWarnings.push(`Coerência multimodal ainda exige revisão${deck.quality.multimodalAudit.score != null ? ` (${deck.quality.multimodalAudit.score}/100)` : ''}.`)
    score -= 8
  }
  if (deck.quality?.deckRubric?.status === 'critical') {
    blockingIssues.push(`Rubrica do deck ainda marca estado crítico${deck.quality.deckRubric.score != null ? ` (${deck.quality.deckRubric.score}/100)` : ''}.`)
    score -= 12
  } else if (deck.quality?.deckRubric?.status === 'repair') {
    reviewWarnings.push(`Rubrica do deck ainda exige reparos${deck.quality.deckRubric.score != null ? ` (${deck.quality.deckRubric.score}/100)` : ''}.`)
    score -= 6
  }

  const finalScore = Math.max(50, Math.min(96, score))
  const altTextCoverage = visualAssets.length > 0
    ? Math.round(((visualAssets.length - missingAltTextAssets.length) / visualAssets.length) * 100)
    : 100
  const warnings = dedupeStrings([...blockingIssues, ...reviewWarnings]).slice(0, 8)
  const status = blockingIssues.length > 0
    ? 'critical'
    : reviewWarnings.length > 0 || finalScore < 85
      ? 'review'
      : 'ok'

  return {
    score: finalScore,
    status,
    visualAssetCount: visualAssets.length,
    altTextCoverage,
    missingAltTextAssets: missingAltTextAssets.map(asset => `${asset.type}:${asset.id}`),
    blockingIssues: blockingIssues.slice(0, 6),
    accessibilityNotes: accessibilityNotes.slice(0, 6),
    legalAccuracyNotes: legalAccuracyNotes.slice(0, 6),
    warnings,
  }
}

async function critiquePresentationV2GeneratedImageAsset(args: {
  apiKey: string
  input: Pick<StudioPipelineInput, 'topic' | 'description'>
  models: Record<string, string>
  resolveFallback: (agentKey: string, model: string) => string[]
  deck: PresentationV2Deck
  presentation: ParsedPresentation
  slide: ParsedSlide
  promptPlan: PresentationV2ImagePromptPlan
  imageDataUrl: string
  localAssessment: PresentationV2GeneratedImageAssessment
  signal?: AbortSignal
}): Promise<PresentationV2GeneratedImageAssessment & { execution?: StudioStepExecution }> {
  const reviewerModel = args.models.presentation_v2_reviewer
  if (!reviewerModel) {
    return args.localAssessment
  }

  try {
    const result = await callLLMWithMessagesFallback(
      args.apiKey,
      buildPresentationV2ImageCriticMessages({
        input: args.input,
        deck: args.deck,
        presentation: args.presentation,
        slide: args.slide,
        promptPlan: args.promptPlan,
        imageDataUrl: args.imageDataUrl,
        localAssessment: args.localAssessment,
      }),
      reviewerModel,
      args.resolveFallback('presentation_v2_reviewer', reviewerModel),
      1400,
      0.1,
      { signal: args.signal },
    )
    const critic = parsePresentationV2ImageCriticAudit(result.content)
    const mergedScore = typeof critic.qualityScore === 'number'
      ? Math.max(32, Math.min(98, Math.round((args.localAssessment.qualityScore + critic.qualityScore) / 2)))
      : args.localAssessment.qualityScore
    const mergedWarnings = dedupeStrings([
      ...args.localAssessment.qualityWarnings,
      ...critic.qualityWarnings,
      ...(critic.summary ? [critic.summary] : []),
    ])

    return {
      qualityScore: mergedScore,
      qualityWarnings: mergedWarnings,
      retryRecommended: args.localAssessment.retryRecommended || critic.retryRecommended || mergedScore < 72,
      fallbackRecommended: args.localAssessment.fallbackRecommended || critic.fallbackRecommended || mergedScore < 58,
      execution: toExecution('presentation_v2_image_reviewer', 'Revisor Multimodal v2 (imagem)', result),
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return {
      ...args.localAssessment,
      qualityWarnings: dedupeStrings([
        ...args.localAssessment.qualityWarnings,
        'Critic visual remoto indisponível; decisão final baseada na heurística local do asset.',
      ]),
    }
  }
}

function buildPresentationV2ImagePrompt(
  input: Pick<StudioPipelineInput, 'topic' | 'description'>,
  deck: PresentationV2Deck,
  presentation: ParsedPresentation,
  slide: ParsedSlide,
  slideIndex: number,
): PresentationV2ImagePromptPlan {
  const deckSlide = deck.slides.find(item => item.number === slide.number)
  const preferredAsset = deckSlide?.assets?.find(asset => (
    (asset.type === 'image' || asset.type === 'background' || asset.type === 'render')
    && asset.status !== 'skipped'
    && (asset.prompt || asset.altText || asset.id)
  ))
  const layoutFamily = resolvePresentationV2SlideLayoutFamily(deck, slide.number)
  const previous = slideIndex > 0 ? presentation.slides[slideIndex - 1]?.title : ''
  const next = slideIndex < presentation.slides.length - 1 ? presentation.slides[slideIndex + 1]?.title : ''
  const bulletSummary = slide.bullets.slice(0, 5).join('; ')
  const notesSnippet = slide.speakerNotes ? slide.speakerNotes.slice(0, 320) : ''
  const visualSystem = buildDeckVisualSystem(input, deck)
  const assetPrompt = preferredAsset?.prompt || deckSlide?.visualBrief || slide.visualSuggestion || ''
  const proofSignals = deck.generationSpec.sourcePriority?.slice(0, 3).join('; ')
  const governanceSignals = dedupeStrings([
    ...(deck.generationSpec.constraints || []),
    ...(deck.theme.accessibilityNotes || []),
  ]).slice(0, 4).join('; ')
  const qualityWarnings: string[] = []
  if (!assetPrompt.trim()) qualityWarnings.push('Brief visual específico ausente; a imagem pode sair genérica.')
  if (!layoutFamily) qualityWarnings.push('Família de layout do slide não foi mapeada no design system.')
  if (!proofSignals) qualityWarnings.push('Faltam fontes prioritárias explícitas para ancorar a pertinência da imagem.')
  if (!governanceSignals) qualityWarnings.push('Faltam restrições institucionais ou notas de acessibilidade para calibrar a composição.')
  const qualityScore = Math.max(48, 100 - (qualityWarnings.length * 12) - (notesSnippet ? 0 : 6) - (bulletSummary ? 0 : 10))

  const prompt = [
    'Crie uma imagem premium para uma apresentação jurídica multimodal do Lexio.',
    visualSystem,
    `Slide ${slide.number} de ${presentation.slides.length}.`,
    deckSlide?.purpose ? `Função do slide: ${deckSlide.purpose}.` : '',
    layoutFamily ? `Família de layout: ${layoutFamily.label}. Uso esperado: ${layoutFamily.usage || 'composição coerente com o design system do deck'}.` : '',
    `Título do slide: ${slide.title}.`,
    bulletSummary ? `Pontos centrais: ${bulletSummary}.` : '',
    notesSnippet ? `Notas e contexto narrativo: ${notesSnippet}.` : '',
    proofSignals ? `Lastro documental prioritário: ${proofSignals}.` : '',
    governanceSignals ? `Restrições institucionais e de acessibilidade: ${governanceSignals}.` : '',
    assetPrompt ? `Brief visual/asset aprovado: ${assetPrompt}.` : '',
    previous ? `Slide anterior: ${previous}.` : '',
    next ? `Próximo slide: ${next}.` : '',
    'Use composição de alto padrão, profundidade visual, hierarquia clara e elementos concretos do tema.',
    'A imagem deve ser adequada para compor o painel visual de um slide 16:9 e manter legibilidade quando combinada com texto fora da imagem.',
  ].filter(Boolean).join(' ')

  const retryPrompt = qualityWarnings.length > 0 ? [
    prompt,
    'Regeneração orientada por critic interno: aumentar especificidade visual e reduzir abstrações genéricas.',
    layoutFamily
      ? `A composição deve respeitar a família ${layoutFamily.label} e deixar área respirável para títulos e bullets.`
      : 'Assuma composição editorial institucional com um ponto focal dominante e área limpa para texto.',
    proofSignals
      ? `Conectar explicitamente a cena ao lastro documental prioritário: ${proofSignals}.`
      : 'Usar objetos e ambientes juridicamente plausíveis, evitando metáforas vagas.',
    governanceSignals
      ? `Preservar estas restrições institucionais e de acessibilidade: ${governanceSignals}.`
      : 'Sem extravagância visual, sem dramatização excessiva e sem ruído gráfico.',
    `Correções necessárias: ${qualityWarnings.join(' ')}`,
    'Entregar uma cena específica, plausível, contemporânea e semanticamente alinhada ao argumento do slide.',
  ].filter(Boolean).join(' ') : undefined

  return {
    assetId: preferredAsset?.id || `slide-${slide.number}-render`,
    prompt,
    negativePrompt: preferredAsset?.negativePrompt || [
      'texto legível',
      'legendas',
      'watermark',
      'logo',
      'tipografia embutida',
      'infográfico textual',
      'cartoon',
      'baixa resolução',
      'mãos deformadas',
      'assunto fora do contexto',
      'excesso de objetos',
      'layout poluído',
    ].join(', '),
    retryPrompt,
    qualityScore,
    qualityWarnings,
  }
}

function buildPresentationV2NarrationText(deck: PresentationV2Deck, options: { slideNumbers?: number[] } = {}): string {
  const focusedSlideNumbers = new Set((options.slideNumbers || []).filter(Number.isFinite))
  const targetSlides = focusedSlideNumbers.size > 0
    ? deck.slides.filter(slide => focusedSlideNumbers.has(slide.number))
    : deck.slides
  if (focusedSlideNumbers.size > 0 && targetSlides.length === 0) {
    throw new Error(`Slide ${Array.from(focusedSlideNumbers).join(', ')} não encontrado no manifesto v2 para narração.`)
  }
  const intro = [
    deck.title,
    deck.subtitle,
    deck.generationSpec.objective ? `Objetivo: ${deck.generationSpec.objective}` : '',
    focusedSlideNumbers.size > 0 ? `Narração parcial focada no(s) slide(s) ${targetSlides.map(slide => slide.number).join(', ')}.` : '',
  ].filter(Boolean).join('. ')

  const slideTexts = targetSlides.map((slide) => {
    const bullets = slide.bullets.length ? `Pontos: ${slide.bullets.join('; ')}.` : ''
    const notes = slide.speakerNotes || slide.purpose || ''
    return [
      `Slide ${slide.number}: ${slide.title}.`,
      bullets,
      notes,
      slide.transition ? `Transição: ${slide.transition}.` : '',
    ].filter(Boolean).join(' ')
  })

  return [intro, ...slideTexts].join('\n\n').slice(0, 12000)
}

export async function generatePresentationV2AudioNarration(
  input: Pick<StudioPipelineInput, 'apiKey'> & { uid?: string },
  rawPresentationContent: string,
  signal?: AbortSignal,
  options: { slideNumbers?: number[] } = {},
): Promise<PresentationV2AudioNarrationResult> {
  throwIfAborted(signal)
  const parsed = parseArtifactContent('apresentacao_v2', rawPresentationContent)
  if (parsed.kind !== 'presentation_v2') {
    throw new Error('A apresentação v2 não possui estrutura válida para gerar narração.')
  }

  const models = await loadPresentationV2PipelineModels(input.uid)
  await validateScopedAgentModels('presentation_v2_pipeline_models', omitInactiveMediaModels(models, ['presentation_v2_tts']))
  const ttsModel = models.presentation_v2_tts || DEFAULT_OPENROUTER_TTS_MODEL
  const startedAt = Date.now()
  const focusedSlideNumbers = (options.slideNumbers || []).filter(Number.isFinite)
  const narrationText = buildPresentationV2NarrationText(parsed.data.deck, { slideNumbers: focusedSlideNumbers })
  if (!narrationText.trim()) {
    throw new Error('A apresentação v2 não tem texto suficiente para gerar narração.')
  }

  const generated = await generateTTS({
    apiKey: input.apiKey,
    uid: input.uid,
    text: narrationText,
    model: ttsModel,
    voice: 'nova',
    speed: 1,
    signal,
  })
  const mimeType = generated.audioBlob.type || 'audio/mpeg'
  const execution: StudioStepExecution = {
    phase: 'presentation_v2_tts',
    agent_name: 'Narrador TTS v2',
    model: generated.model || ttsModel,
    provider_id: generated.provider_id ?? null,
    provider_label: generated.provider_label ?? null,
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
    duration_ms: Date.now() - startedAt,
    execution_state: 'waiting_io',
  }
  const alignment = assessPresentationV2AudioNarrationAlignment(parsed.data.deck, narrationText, generated.durationEstimate, focusedSlideNumbers)

  return {
    audioBlob: generated.audioBlob,
    mimeType,
    extension: mimeType.includes('wav') ? '.wav' : '.mp3',
    model: execution.model,
    providerId: execution.provider_id,
    providerLabel: execution.provider_label,
    durationEstimate: generated.durationEstimate,
    narrationText,
    slideNumbers: focusedSlideNumbers.length ? focusedSlideNumbers : undefined,
    qualityScore: alignment.qualityScore,
    qualityWarnings: alignment.qualityWarnings,
    execution,
  }
}

function inferVideoExtension(mimeType: string): string {
  const lower = mimeType.toLowerCase()
  if (lower.includes('webm')) return '.webm'
  if (lower.includes('quicktime') || lower.includes('mov')) return '.mov'
  return '.mp4'
}

function buildPresentationV2VideoPrompt(deck: PresentationV2Deck, slideNumber: number, assetPrompt?: string): string {
  const slide = deck.slides.find(item => item.number === slideNumber)
  return [
    'Crie um clipe curto 16:9 para uma apresentação jurídica premium.',
    `Título do deck: ${deck.title}.`,
    deck.theme.mood ? `Mood visual: ${deck.theme.mood}.` : '',
    slide ? `Slide ${slide.number}: ${slide.title}.` : '',
    slide?.purpose ? `Função narrativa: ${slide.purpose}.` : '',
    slide?.bullets?.length ? `Conteúdo: ${slide.bullets.slice(0, 4).join('; ')}.` : '',
    slide?.visualBrief ? `Direção visual: ${slide.visualBrief}.` : '',
    assetPrompt ? `Prompt de asset: ${assetPrompt}.` : '',
    'Movimento sutil, institucional, sem texto embutido, sem logotipos, sem marcas, sem rostos identificáveis desnecessários.',
  ].filter(Boolean).join(' ')
}

export async function generatePresentationV2VideoClips(
  rawPresentationContent: string,
  options: { maxClips?: number; signal?: AbortSignal; slideNumbers?: number[] } = {},
): Promise<PresentationV2VideoClipGenerationResult> {
  throwIfAborted(options.signal)
  const parsed = parseArtifactContent('apresentacao_v2', rawPresentationContent)
  if (parsed.kind !== 'presentation_v2') {
    throw new Error('A apresentação v2 não possui estrutura válida para gerar clipes.')
  }
  if (!isExternalVideoProviderConfigured()) {
    return {
      clips: [],
      executions: [],
      skippedReason: 'Provedor externo de vídeo não configurado.',
    }
  }

  const deck = parsed.data.deck
  const focusedSlideNumbers = new Set((options.slideNumbers || []).filter(Number.isFinite))
  const candidateSlides = focusedSlideNumbers.size > 0
    ? deck.slides.filter(slide => focusedSlideNumbers.has(slide.number))
    : deck.slides
  if (focusedSlideNumbers.size > 0 && candidateSlides.length === 0) {
    throw new Error(`Slide ${Array.from(focusedSlideNumbers).join(', ')} não encontrado no manifesto v2.`)
  }
  const plannedVideoAssets = candidateSlides.flatMap(slide => (slide.assets || [])
    .filter(asset => asset.type === 'video' && asset.status !== 'stored' && asset.status !== 'skipped')
    .map(asset => ({ slideNumber: slide.number, asset })))
  const fallbackSourceSlides = focusedSlideNumbers.size > 0
    ? candidateSlides
    : candidateSlides.slice(0, Math.min(2, candidateSlides.length))
  const fallbackTargets = fallbackSourceSlides.map(slide => ({
    slideNumber: slide.number,
    asset: {
      id: `slide-${slide.number}-video-clip`,
      prompt: slide.visualBrief,
    },
  }))
  const targets = (plannedVideoAssets.length > 0 ? plannedVideoAssets : fallbackTargets).slice(0, options.maxClips || 3)
  const clips: GeneratedPresentationV2VideoClip[] = []
  const executions: StudioStepExecution[] = []
  const plannedAssetIds = new Set(plannedVideoAssets.map(target => target.asset.id))

  for (const target of targets) {
    throwIfAborted(options.signal)
    const startedAt = Date.now()
    const prompt = buildPresentationV2VideoPrompt(deck, target.slideNumber, target.asset.prompt)
    const durationSeconds = Math.max(4, Math.min(12, Math.round(((deck.generationSpec.durationMinutes || 6) * 60) / Math.max(1, deck.slides.length))))
    const result = await requestExternalVideoClip({
      prompt,
      durationSeconds,
      aspectRatio: deck.exportHints?.aspectRatio || '16:9',
      sceneNumber: target.slideNumber,
      signal: options.signal,
    })

    if (!result?.url) continue
    const response = await fetch(result.url, { signal: options.signal })
    if (!response.ok) {
      throw new Error(`Falha ao baixar clipe v2 (${response.status})`)
    }
    const blob = await response.blob()
    const mimeType = blob.type || result.mimeType || 'video/mp4'
    const alignment = assessPresentationV2VideoClipAlignment({
      deck,
      slideNumber: target.slideNumber,
      assetId: target.asset.id,
      prompt,
      durationSeconds,
      plannedAssetIds,
    })
    clips.push({
      slideNumber: target.slideNumber,
      assetId: target.asset.id,
      blob,
      mimeType,
      extension: inferVideoExtension(mimeType),
      provider: result.provider,
      jobId: result.jobId,
      prompt,
      durationSeconds,
      qualityScore: alignment.qualityScore,
      qualityWarnings: alignment.qualityWarnings,
    })
    executions.push({
      phase: 'presentation_v2_video_generator',
      agent_name: 'Gerador de Clipes v2',
      model: `external/${result.provider}`,
      provider_id: result.provider,
      provider_label: result.provider,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      duration_ms: Date.now() - startedAt,
      execution_state: 'waiting_io',
    })
  }

  return { clips, executions }
}

export async function generatePresentationV2MediaAssets(
  input: Pick<StudioPipelineInput, 'apiKey' | 'topic' | 'description' | 'uid'>,
  rawPresentationContent: string,
  onProgress?: StudioProgressCallback,
  signal?: AbortSignal,
  options: { slideNumbers?: number[] } = {},
): Promise<PresentationV2MediaGenerationResult> {
  throwIfAborted(signal)
  const parsed = parseArtifactContent('apresentacao_v2', rawPresentationContent)
  if (parsed.kind !== 'presentation_v2') {
    throw new Error('A apresentação v2 não possui estrutura válida para gerar slides visuais.')
  }

  const models = await loadPresentationV2PipelineModels(input.uid)
  const fallbackConfig = await loadFallbackPriorityConfig().catch(() => ({}))
  const resolveFallback = buildPipelineFallbackResolver(PRESENTATION_V2_PIPELINE_AGENT_DEFS, fallbackConfig)
  await validateScopedAgentModels('presentation_v2_pipeline_models', omitInactiveMediaModels(models, ['presentation_v2_image_generator']))
  const imageModel = String(models.presentation_v2_image_generator ?? '').trim()
  if (!imageModel) {
    throw new Error('Nenhum modelo configurado para o agente "Gerador de Imagens Multimodais". Configure esse agente em Configurações antes de gerar mídia da apresentação v2.')
  }
  const deck = parsed.data.deck
  const presentation = parsed.data.presentation
  const focusedSlideNumbers = new Set((options.slideNumbers || []).filter(Number.isFinite))
  const targetSlides = focusedSlideNumbers.size > 0
    ? presentation.slides.filter(slide => focusedSlideNumbers.has(slide.number))
    : presentation.slides
  if (focusedSlideNumbers.size > 0 && targetSlides.length === 0) {
    throw new Error(`Slide ${Array.from(focusedSlideNumbers).join(', ')} não encontrado na apresentação v2.`)
  }
  const slideVisuals: GeneratedPresentationV2SlideVisual[] = []
  const executions: StudioStepExecution[] = []

  for (let targetIndex = 0; targetIndex < targetSlides.length; targetIndex++) {
    throwIfAborted(signal)
    const slide = targetSlides[targetIndex]
    const slideIndex = presentation.slides.findIndex(item => item.number === slide.number)
    const startedAt = Date.now()
    onProgress?.(targetIndex + 1, targetSlides.length, `Gerando visual v2 do slide ${slide.number} (${targetIndex + 1}/${targetSlides.length})…`, {
      executionState: 'waiting_io',
      stageMeta: imageModel.split('/').pop() || imageModel,
    })

    const prompt = buildPresentationV2ImagePrompt(input, deck, presentation, slide, slideIndex >= 0 ? slideIndex : targetIndex)
    let composed
    let execution: StudioStepExecution
    let finalPrompt = prompt.prompt
    const promptAttempts = [prompt.prompt, ...(prompt.retryPrompt ? [prompt.retryPrompt] : [])]
    let attemptsUsed = 0
    let finalQualityScore = prompt.qualityScore
    let finalQualityWarnings = [...prompt.qualityWarnings]

    try {
      let generated
      let lastError: unknown

      for (let attemptIndex = 0; attemptIndex < promptAttempts.length; attemptIndex++) {
        const attemptPrompt = promptAttempts[attemptIndex]
        finalPrompt = attemptPrompt
        attemptsUsed = attemptIndex + 1
        try {
          if (attemptIndex > 0) {
            onProgress?.(targetIndex + 1, targetSlides.length, `Refinando o prompt visual do slide ${slide.number} após critic interno…`, {
              executionState: 'running',
              stageMeta: `retry ${attemptIndex + 1}/${promptAttempts.length}`,
            })
          }
          generated = await generateImageViaOpenRouter({
            apiKey: input.apiKey,
            prompt: attemptPrompt,
            negativePrompt: prompt.negativePrompt,
            model: imageModel,
            aspectRatio: deck.exportHints?.aspectRatio || '16:9',
            signal,
          })
          const assetAssessment = assessPresentationV2GeneratedImageAsset({
            imageDataUrl: generated.imageDataUrl,
            promptPlan: prompt,
            model: generated.model,
            providerId: generated.provider_id,
            providerLabel: generated.provider_label,
          })
          const reviewedAssessment = await critiquePresentationV2GeneratedImageAsset({
            apiKey: input.apiKey,
            input,
            models,
            resolveFallback,
            deck,
            presentation,
            slide,
            promptPlan: prompt,
            imageDataUrl: generated.imageDataUrl,
            localAssessment: assetAssessment,
            signal,
          })
          finalQualityScore = reviewedAssessment.qualityScore
          finalQualityWarnings = reviewedAssessment.qualityWarnings
          if (reviewedAssessment.execution) {
            executions.push(reviewedAssessment.execution)
          }

          if (reviewedAssessment.retryRecommended && attemptIndex < promptAttempts.length - 1) {
            continue
          }
          if (reviewedAssessment.fallbackRecommended) {
            throw new Error('Critic interno reprovou a imagem gerada; aplicando fallback seguro do poster.')
          }
          break
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error
          lastError = error
          if (attemptIndex === promptAttempts.length - 1) throw lastError
        }
      }

      if (!generated) {
        throw lastError instanceof Error ? lastError : new Error('Falha ao gerar imagem v2.')
      }

      composed = await renderPresentationSlidePoster(presentation, slide, {
        backgroundImageUrl: generated.imageDataUrl,
      })
      execution = {
        phase: 'presentation_v2_image_generator',
        agent_name: 'Gerador de Imagens v2',
        model: generated.model,
        provider_id: generated.provider_id ?? null,
        provider_label: generated.provider_label ?? null,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: generated.cost_usd,
        duration_ms: Date.now() - startedAt,
        execution_state: 'waiting_io',
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      finalQualityWarnings = dedupeStrings([
        ...finalQualityWarnings,
        'Fallback seguro aplicado: o critic interno não aprovou a imagem gerada para persistência final.',
      ])
      finalQualityScore = Math.min(finalQualityScore, 57)
      composed = await renderPresentationSlidePoster(presentation, slide)
      execution = {
        phase: 'presentation_v2_visual_render',
        agent_name: 'Renderizador Visual v2',
        model: 'browser/svg-render',
        provider_id: 'browser',
        provider_label: 'Browser',
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        duration_ms: Date.now() - startedAt,
        execution_state: 'waiting_io',
      }
    }

    slideVisuals.push({
      slideNumber: slide.number,
      assetId: prompt.assetId,
      blob: composed.blob,
      mimeType: composed.mimeType,
      extension: composed.extension,
      model: execution.model,
      providerId: execution.provider_id,
      providerLabel: execution.provider_label,
      costUsd: execution.cost_usd,
      prompt: finalPrompt,
      negativePrompt: prompt.negativePrompt,
      qualityScore: finalQualityScore,
      qualityWarnings: finalQualityWarnings,
      retryCount: Math.max(0, attemptsUsed - 1),
    })
    executions.push(execution)

    const completionMetaParts = [
      execution.model.split('/').pop() || execution.model,
      `${Math.max(1, Math.round(execution.duration_ms / 1000))}s`,
    ]
    if (execution.cost_usd > 0) completionMetaParts.splice(1, 0, formatCostBadge(execution.cost_usd))
    onProgress?.(targetIndex + 1, targetSlides.length, `Visual v2 do slide ${slide.number} concluído.`, {
      executionState: 'running',
      stageMeta: completionMetaParts.join(' • '),
      costUsd: execution.cost_usd,
      durationMs: execution.duration_ms,
    })
  }

  return { slideVisuals, executions }
}

export async function generatePresentationV2StructuredVisualAssets(
  rawPresentationContent: string,
  options: { maxAssets?: number; signal?: AbortSignal; slideNumbers?: number[] } = {},
): Promise<PresentationV2StructuredVisualGenerationResult> {
  throwIfAborted(options.signal)
  const parsed = parseArtifactContent('apresentacao_v2', rawPresentationContent)
  if (parsed.kind !== 'presentation_v2') {
    throw new Error('A apresentação v2 não possui estrutura válida para gerar gráficos e diagramas.')
  }

  const deck = parsed.data.deck
  const focusedSlideNumbers = new Set((options.slideNumbers || []).filter(Number.isFinite))
  const candidateSlides = focusedSlideNumbers.size > 0
    ? deck.slides.filter(slide => focusedSlideNumbers.has(slide.number))
    : deck.slides
  const plannedTargets = candidateSlides.flatMap(slide => {
    const explicitAssets = (slide.assets || [])
      .filter(asset => (asset.type === 'chart' || asset.type === 'diagram') && asset.status !== 'stored' && asset.status !== 'skipped')
      .map(asset => ({ slide, asset }))
    if (explicitAssets.length > 0) return explicitAssets
    if (slide.chartSpec) {
      return [{
        slide,
        asset: {
          id: `slide-${slide.number}-chart`,
          type: 'chart' as const,
          status: 'planned' as const,
          prompt: slide.visualBrief,
          altText: `Gráfico do slide ${slide.number}: ${slide.title}`,
        },
      }]
    }
    return []
  }).slice(0, options.maxAssets || 8)

  const structuredVisuals: GeneratedPresentationV2StructuredVisual[] = []
  const executions: StudioStepExecution[] = []

  for (const target of plannedTargets) {
    throwIfAborted(options.signal)
    const startedAt = Date.now()
    const rendered = await renderPresentationV2StructuredAsset(deck, target.slide, target.asset)
    structuredVisuals.push({
      slideNumber: target.slide.number,
      assetId: target.asset.id,
      assetType: target.asset.type === 'diagram' ? 'diagram' : 'chart',
      blob: rendered.blob,
      mimeType: rendered.mimeType,
      extension: rendered.extension,
      model: 'browser/svg-data-render',
      prompt: target.asset.prompt,
      altText: target.asset.altText,
    })
    executions.push({
      phase: 'presentation_v2_structured_visual_render',
      agent_name: 'Renderizador de Dados e Diagramas v2',
      model: 'browser/svg-data-render',
      provider_id: 'browser',
      provider_label: 'Browser',
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      duration_ms: Date.now() - startedAt,
      execution_state: 'waiting_io',
    })
  }

  return { structuredVisuals, executions }
}

function joinPromptSections(sections: Array<string | undefined>): string {
  return sections
    .map(section => section?.trim() || '')
    .filter(Boolean)
    .join('\n\n')
}

function buildOrchestratorPrompt(input: StudioPipelineInput): { system: string; user: string } {
  return {
    system: [
      'Você é o Orquestrador do Gerador de Apresentação v2 do Lexio.',
      'Seu papel é comandar a execução inteira, liberar ondas paralelas seguras e orientar cada agente em tempo real.',
      'Responda SOMENTE em JSON válido com: summary, globalDirectives[], riskFlags[], agentBriefs{}, waves[].',
      'agentBriefs deve usar apenas estas chaves: presentation_v2_context_auditor, presentation_v2_narrative_planner, presentation_v2_researcher, presentation_v2_content_architect, presentation_v2_slide_writer, presentation_v2_visual_director, presentation_v2_data_diagrammer, presentation_v2_asset_planner, presentation_v2_reviewer, presentation_v2_packager.',
      'waves deve conter apenas agentes permitidos e respeitar este DAG: context_auditor -> [narrative_planner + researcher] -> content_architect -> [slide_writer + visual_director + data_diagrammer] -> asset_planner -> reviewer -> packager.',
      'Não crie agentes novos, não remova o revisor e nunca mova o packager para antes do reviewer.',
    ].join(' '),
    user: buildInputBrief(input),
  }
}

function normalizePresentationV2WaveAgentKey(value: unknown): PresentationV2WaveAgentKey | null {
  const candidate = String(value || '').trim() as PresentationV2WaveAgentKey
  return PRESENTATION_V2_WAVE_AGENT_KEYS.includes(candidate) ? candidate : null
}

function parsePresentationV2OrchestratorPlan(content: string): PresentationV2OrchestratorPlan {
  const parsed = parseJsonObject(content)
  const agentBriefsRaw = typeof parsed.agentBriefs === 'object' && parsed.agentBriefs !== null
    ? parsed.agentBriefs as Record<string, unknown>
    : typeof parsed.agent_briefs === 'object' && parsed.agent_briefs !== null
      ? parsed.agent_briefs as Record<string, unknown>
      : {}
  const rawWaves = Array.isArray(parsed.waves) ? parsed.waves as Record<string, unknown>[] : []
  const waveObjectives = new Map<string, string>()

  for (const wave of rawWaves) {
    const objective = String(wave.objective ?? wave.reason ?? wave.summary ?? '').trim()
    if (!objective) continue
    const agents = Array.isArray(wave.agents) ? wave.agents : []
    const normalizedAgents = agents
      .map(agent => normalizePresentationV2WaveAgentKey(agent))
      .filter((agent): agent is PresentationV2WaveAgentKey => Boolean(agent))
    const matchedWave = PRESENTATION_V2_DEFAULT_WAVES.find((candidate) => (
      candidate.agents.length === normalizedAgents.length
      && candidate.agents.every(agent => normalizedAgents.includes(agent))
    ))
    if (matchedWave) {
      waveObjectives.set(matchedWave.key, objective)
    }
  }

  const agentBriefs = Object.fromEntries(
    Object.entries(agentBriefsRaw)
      .map(([key, value]) => [normalizePresentationV2WaveAgentKey(key), String(value || '').trim()] as const)
      .filter((entry): entry is readonly [PresentationV2WaveAgentKey, string] => Boolean(entry[0] && entry[1])),
  ) as Partial<Record<PresentationV2WaveAgentKey, string>>

  return {
    summary: String(parsed.summary ?? parsed.objective ?? '').trim() || undefined,
    globalDirectives: toTrimmedStringArray(parsed.globalDirectives ?? parsed.global_directives).slice(0, 8),
    riskFlags: toTrimmedStringArray(parsed.riskFlags ?? parsed.risk_flags).slice(0, 8),
    agentBriefs,
    waves: PRESENTATION_V2_DEFAULT_WAVES.map(wave => ({
      ...wave,
      objective: waveObjectives.get(wave.key) || wave.objective,
    })),
  }
}

function buildPresentationV2AgentDirective(
  plan: PresentationV2OrchestratorPlan,
  agentKey: PresentationV2WaveAgentKey,
): string | undefined {
  const parts = [
    plan.summary ? `Resumo do orquestrador: ${plan.summary}` : '',
    plan.globalDirectives.length > 0 ? `Diretrizes globais: ${plan.globalDirectives.join(' | ')}` : '',
    plan.agentBriefs[agentKey] ? `Diretiva específica para ${agentKey}: ${plan.agentBriefs[agentKey]}` : '',
    plan.riskFlags.length > 0 ? `Riscos a vigiar: ${plan.riskFlags.join(' | ')}` : '',
  ].filter(Boolean)

  return parts.length > 0 ? parts.join('\n') : undefined
}

function buildClarifierPrompt(input: StudioPipelineInput): { system: string; user: string } {
  return {
    system: [
      'Você é o Clarificador do Gerador de Apresentação v2 do Lexio.',
      'Avalie se a solicitação já é suficiente para gerar uma apresentação multimodal profissional.',
      'Responda somente em JSON válido com: needsClarification:boolean, consolidatedBrief:string, questions:[{id, question, category, rationale, suggestedAnswer, options}].',
      'Faça no máximo 6 perguntas, somente quando a resposta mudar conteúdo, profundidade, duração, design, público ou mídia.',
      'Priorize lacunas sobre tese central, critério de sucesso, carga cognitiva por slide, exigência de evidência e distinção entre mídia opcional e obrigatória.',
    ].join(' '),
    user: buildInputBrief(input),
  }
}

function buildContextAuditPrompt(input: StudioPipelineInput, orchestratorDirective?: string): { system: string; user: string } {
  return {
    system: 'Você é o Auditor de Contexto do Gerador de Apresentação v2. Responda em JSON com: usableSources[], gaps[], risks[], constraints[], contentSignals[], designSignals[], mediaOpportunities[].',
    user: joinPromptSections([
      buildInputBrief(input),
      orchestratorDirective ? `Diretrizes do orquestrador:\n${orchestratorDirective}` : undefined,
    ]),
  }
}

function buildNarrativePlanPrompt(input: StudioPipelineInput, contextAudit: string, orchestratorDirective?: string): { system: string; user: string } {
  return {
    system: 'Você é o Planejador Narrativo. Crie começo, meio e fim. Responda em JSON com: title, subtitle, audience, objective, slideCount, durationMinutes, depth, narrativeArc, sections[], slideIntentMap[].',
    user: joinPromptSections([
      buildInputBrief(input),
      'Auditoria de contexto:',
      contextAudit,
      orchestratorDirective ? `Diretrizes do orquestrador:\n${orchestratorDirective}` : undefined,
    ]),
  }
}

function buildResearchPrompt(input: StudioPipelineInput, contextAudit: string, orchestratorDirective?: string): { system: string; user: string } {
  return {
    system: 'Você é o Pesquisador da Apresentação v2. Responda em JSON com: claims[], evidence[], citations[], examples[], numbers[], controversies[], cautions[]. Preserve fonte e confiabilidade.',
    user: joinPromptSections([
      buildInputBrief(input),
      'Auditoria de contexto:',
      contextAudit,
      orchestratorDirective ? `Diretrizes do orquestrador:\n${orchestratorDirective}` : undefined,
    ]),
  }
}

function buildContentArchitecturePrompt(narrativePlan: string, research: string, orchestratorDirective?: string): { system: string; user: string } {
  return {
    system: 'Você é o Arquiteto de Conteúdo. Responda em JSON com slides[] contendo number, sectionId, title, purpose, keyMessage, evidenceRefs, cognitiveLoad, transition, recommendedLayout.',
    user: joinPromptSections([
      'Plano narrativo:',
      narrativePlan,
      'Pesquisa consolidada:',
      research,
      orchestratorDirective ? `Diretrizes do orquestrador:\n${orchestratorDirective}` : undefined,
    ]),
  }
}

function buildSlideWriterPrompt(input: StudioPipelineInput, architecture: string, research: string, orchestratorDirective?: string): { system: string; user: string } {
  return {
    system: [
      'Você é o Redator de Slides da Apresentação v2.',
      'Responda em JSON com: title, subtitle, slides:[{id, number, sectionId, title, purpose, layout, bullets, speakerNotes, transition, visualBrief, designNotes}].',
      'Cada slide deve ter título forte, até 5 bullets densos, notas completas e transição narrativa para o próximo slide.',
    ].join(' '),
    user: joinPromptSections([
      buildInputBrief(input),
      'Arquitetura:',
      architecture,
      'Pesquisa:',
      research,
      orchestratorDirective ? `Diretrizes do orquestrador:\n${orchestratorDirective}` : undefined,
    ]),
  }
}

function buildVisualDirectorPrompt(
  input: StudioPipelineInput,
  narrativePlan: string,
  architecture: string,
  research: string,
  orchestratorDirective?: string,
): { system: string; user: string } {
  return {
    system: 'Você é o Diretor Visual. Receba narrativa, arquitetura e pesquisa e devolva JSON com: theme{name,mood,palette,fontPairing,layoutPrinciples,accessibilityNotes,designSystem{narrativeMode,surfaceStyle,contrastStrategy,accentStrategy,hierarchyRules[],layoutFamilies[]}}, slides[] com number, sectionId, layout, visualBrief e designNotes. Não precisa repetir bullets nem speakerNotes.',
    user: joinPromptSections([
      buildInputBrief(input),
      'Plano narrativo:',
      narrativePlan,
      'Arquitetura:',
      architecture,
      'Pesquisa consolidada:',
      research,
      orchestratorDirective ? `Diretrizes do orquestrador:\n${orchestratorDirective}` : undefined,
    ]),
  }
}

function buildDataDiagrammerPrompt(architecture: string, research: string, orchestratorDirective?: string): { system: string; user: string } {
  return {
    system: [
      'Você é o especialista em Dados e Diagramas da Apresentação v2.',
      'Responda em JSON com: slides[] atualizados com chartSpec quando houver valor analítico, assets[] de type="chart" ou type="diagram", e dataWarnings[].',
      'Use gráficos apenas quando houver dado, comparação, linha temporal, processo, matriz, fluxo decisório ou estrutura conceitual real. Não invente números; quando não houver número confiável, prefira diagramas conceituais.',
    ].join(' '),
    user: joinPromptSections([
      'Arquitetura:',
      architecture,
      'Pesquisa/evidências:',
      research,
      orchestratorDirective ? `Diretrizes do orquestrador:\n${orchestratorDirective}` : undefined,
    ]),
  }
}

function buildAssetPlannerPrompt(slidesJson: string, visualDirection: string, dataDiagramming: string, orchestratorDirective?: string): { system: string; user: string } {
  return {
    system: 'Você é o Planejador de Assets. Responda em JSON com assets[] e slides[] atualizados. Assets devem ter id,type,status="planned",prompt,negativePrompt,altText. Planeje imagens, backgrounds, charts, áudio e vídeo apenas quando agregarem valor.',
    user: joinPromptSections([
      'Slides:',
      slidesJson,
      'Direção visual:',
      visualDirection,
      'Specs de dados e diagramas:',
      dataDiagramming,
      orchestratorDirective ? `Diretrizes do orquestrador:\n${orchestratorDirective}` : undefined,
    ]),
  }
}

function buildReviewerPrompt(input: StudioPipelineInput, draftDeck: string, orchestratorDirective?: string): { system: string; user: string } {
  return {
    system: [
      'Você é o Revisor Multimodal.',
      'Audite narrativa, precisão jurídica, acessibilidade, design, carga cognitiva e coerência multimodal.',
      'Responda SOMENTE em JSON com quality{score,strengths,warnings,accessibility,legalAccuracyNotes} e revisionNotes[].',
      'Cada item de revisionNotes deve ter, quando aplicável: slideNumber, severity, category, issue, recommendedAgent, repairPrompt.',
      'recommendedAgent deve ser um entre: presentation_v2_slide_writer, presentation_v2_content_architect, presentation_v2_visual_director, presentation_v2_data_diagrammer.',
    ].join(' '),
    user: joinPromptSections([
      buildInputBrief(input),
      'Deck preliminar:',
      draftDeck,
      orchestratorDirective ? `Diretrizes do orquestrador:\n${orchestratorDirective}` : undefined,
    ]),
  }
}

function buildPackagerPrompt(input: StudioPipelineInput, parts: {
  contextAudit: string
  narrativePlan: string
  research: string
  architecture: string
  slides: string
  visualDirection: string
  dataDiagramming: string
  assetPlan: string
  review: string
}, orchestratorDirective?: string): { system: string; user: string } {
  return {
    system: [
      'Você é o Empacotador do Gerador de Apresentação v2.',
      'Produza SOMENTE JSON válido no schema PresentationV2Deck.',
      'Campos obrigatórios: schemaVersion="presentation_v2.1", title, generationSpec, outline{narrativeArc,sections}, theme, slides, assets, quality, exportHints, revisionHistory.',
      'Theme deve preservar ou sintetizar designSystem{narrativeMode,surfaceStyle,contrastStrategy,accentStrategy,hierarchyRules,layoutFamilies} quando houver sinal suficiente.',
      'Slides devem preservar bullets e speakerNotes, ter layout, visualBrief e assets planejados. Mídias não materializadas devem ficar status="planned" ou "pending", nunca como data URL falsa.',
    ].join(' '),
    user: joinPromptSections([
      buildInputBrief(input),
      'Auditoria de contexto:',
      parts.contextAudit,
      'Plano narrativo:',
      parts.narrativePlan,
      'Pesquisa:',
      parts.research,
      'Arquitetura de conteúdo:',
      parts.architecture,
      'Slides redigidos:',
      parts.slides,
      'Direção visual:',
      parts.visualDirection,
      'Dados e diagramas:',
      parts.dataDiagramming,
      'Plano de assets:',
      parts.assetPlan,
      'Revisão:',
      parts.review,
      orchestratorDirective ? `Diretrizes do orquestrador:\n${orchestratorDirective}` : undefined,
    ]),
  }
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
}

function inferPresentationV2LayoutFamily(slide: PresentationV2Slide): { id: string; label: string; usage: string } {
  const fingerprint = `${slide.layout || ''} ${slide.purpose || ''} ${slide.title}`.toLowerCase()
  if (/(hero|cover|opening|abertura|statement|headline)/.test(fingerprint)) {
    return { id: 'hero', label: 'Hero / abertura', usage: 'Abrir seções e frames decisórios com mensagem central dominante.' }
  }
  if (/(two|split|column|compare|comparison|argument|versus|duo)/.test(fingerprint)) {
    return { id: 'split', label: 'Split argumentativo', usage: 'Comparar opções, argumentos ou blocos complementares lado a lado.' }
  }
  if (/(timeline|flow|process|agenda|sequence|roadmap|journey)/.test(fingerprint)) {
    return { id: 'sequence', label: 'Sequência / processo', usage: 'Explicar progressão, processo ou roteiro em etapas.' }
  }
  if (/(grid|matrix|card|cards|dashboard|quad)/.test(fingerprint)) {
    return { id: 'grid', label: 'Grid / cards', usage: 'Organizar múltiplos blocos equivalentes com hierarquia controlada.' }
  }
  if (/(chart|data|diagram|evidence|proof|analytics|matriz)/.test(fingerprint)) {
    return { id: 'evidence', label: 'Evidência / analítico', usage: 'Dar protagonismo a gráficos, matrizes, provas e visualizações estruturadas.' }
  }
  return { id: 'focus', label: 'Focus narrative', usage: 'Conduzir um único argumento principal com apoio textual e visual secundário.' }
}

function synthesizePresentationV2DesignSystem(deck: PresentationV2Deck): PresentationV2Deck {
  const nextDeck = JSON.parse(JSON.stringify(deck)) as PresentationV2Deck
  const existingSystem = nextDeck.theme.designSystem
  const familyMap = new Map<string, { id: string; label: string; usage: string; slideNumbers: number[] }>()

  for (const slide of nextDeck.slides) {
    const family = inferPresentationV2LayoutFamily(slide)
    const current = familyMap.get(family.id) || { ...family, slideNumbers: [] }
    current.slideNumbers.push(slide.number)
    familyMap.set(family.id, current)
  }

  const minutesPerSlide = nextDeck.generationSpec.durationMinutes && nextDeck.slides.length > 0
    ? (nextDeck.generationSpec.durationMinutes / nextDeck.slides.length).toFixed(1)
    : null

  nextDeck.theme.designSystem = {
    narrativeMode: existingSystem?.narrativeMode
      || (nextDeck.outline.sections.length > 2 ? 'editorial-seccional' : 'linear-decisorio'),
    surfaceStyle: existingSystem?.surfaceStyle
      || (nextDeck.theme.mood ? `Superfícies alinhadas ao mood "${nextDeck.theme.mood}".` : 'Superfícies limpas, institucionais e de alto contraste.'),
    contrastStrategy: existingSystem?.contrastStrategy
      || (nextDeck.theme.palette && nextDeck.theme.palette.length >= 2
        ? `Base clara/escura controlada com contraste principal entre ${nextDeck.theme.palette[0]} e ${nextDeck.theme.palette[1]}.`
        : 'Contraste alto entre título, fundo e elementos de decisão.'),
    accentStrategy: existingSystem?.accentStrategy
      || (nextDeck.theme.palette?.[2]
        ? `Usar ${nextDeck.theme.palette[2]} apenas para ênfases, divisores e chamadas de decisão.`
        : 'Usar um único acento visual para decisão, navegação e ênfase.'),
    hierarchyRules: dedupeStrings([
      ...(existingSystem?.hierarchyRules || []),
      nextDeck.theme.layoutPrinciples?.[0] ? `Princípio estrutural: ${nextDeck.theme.layoutPrinciples[0]}.` : 'Hierarquia tipográfica consistente entre títulos, corpo e notas.',
      nextDeck.generationSpec.depth === 'executiva'
        ? 'Slides executivos priorizam uma tese por tela e no máximo 3 bullets críticos.'
        : 'Cada slide deve manter um foco dominante, com até 5 bullets e notas sustentando a fala.',
      minutesPerSlide ? `Cadência média alvo: ${minutesPerSlide} min por slide.` : '',
      'Cada slide deve ter um único centro de gravidade visual, evitando competição entre texto e asset.',
    ]),
    layoutFamilies: Array.from(familyMap.values()).map((family) => ({
      id: family.id,
      label: family.label,
      usage: family.usage,
      slideNumbers: family.slideNumbers,
    })),
  }

  return nextDeck
}

function parseJsonObject(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(extractJsonPayload(content)) as unknown
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function toTrimmedStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean) : []
}

function inferRepairAgent(category: string, issue: string): PresentationV2RepairAgent {
  const fingerprint = `${category} ${issue}`.toLowerCase()
  if (fingerprint.includes('design') || fingerprint.includes('visual') || fingerprint.includes('layout')) {
    return 'presentation_v2_visual_director'
  }
  if (fingerprint.includes('chart') || fingerprint.includes('diagram') || fingerprint.includes('dados') || fingerprint.includes('data')) {
    return 'presentation_v2_data_diagrammer'
  }
  if (fingerprint.includes('narrativa') || fingerprint.includes('transition') || fingerprint.includes('transição') || fingerprint.includes('section')) {
    return 'presentation_v2_content_architect'
  }
  return 'presentation_v2_slide_writer'
}

function normalizeRepairAgent(value: unknown, category: string, issue: string): PresentationV2RepairAgent {
  const candidate = String(value || '').trim()
  if (
    candidate === 'presentation_v2_slide_writer'
    || candidate === 'presentation_v2_content_architect'
    || candidate === 'presentation_v2_visual_director'
    || candidate === 'presentation_v2_data_diagrammer'
  ) {
    return candidate
  }
  return inferRepairAgent(category, issue)
}

function parseReviewerAudit(content: string): PresentationV2ReviewerAudit {
  const parsed = parseJsonObject(content)
  const quality = typeof parsed.quality === 'object' && parsed.quality !== null
    ? parsed.quality as Record<string, unknown>
    : {}
  const revisionNotesRaw = Array.isArray(parsed.revisionNotes) ? parsed.revisionNotes : []

  return {
    quality: {
      score: typeof quality.score === 'number' ? quality.score : undefined,
      strengths: toTrimmedStringArray(quality.strengths),
      warnings: toTrimmedStringArray(quality.warnings),
      accessibility: toTrimmedStringArray(quality.accessibility),
      legalAccuracyNotes: toTrimmedStringArray(quality.legalAccuracyNotes ?? quality.legal_accuracy_notes),
    },
    revisionNotes: revisionNotesRaw.map((entry) => {
      if (typeof entry === 'string') {
        return {
          severity: 'medium' as const,
          category: 'content',
          issue: entry,
          recommendedAgent: inferRepairAgent('content', entry),
        }
      }
      const raw = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {}
      const issue = String(raw.issue ?? raw.warning ?? raw.summary ?? '').trim()
      const category = String(raw.category ?? 'content').trim() || 'content'
      const severityValue = String(raw.severity ?? 'medium').toLowerCase()
      const severity: 'high' | 'low' | 'medium' = severityValue === 'high'
        ? 'high'
        : severityValue === 'low'
          ? 'low'
          : 'medium'
      return {
        slideNumber: Number.isFinite(Number(raw.slideNumber ?? raw.slide_number ?? raw.number))
          ? Number(raw.slideNumber ?? raw.slide_number ?? raw.number)
          : undefined,
        severity,
        category,
        issue: issue || 'Slide com necessidade de reparo seletivo.',
        recommendedAgent: normalizeRepairAgent(raw.recommendedAgent ?? raw.recommended_agent, category, issue),
        repairPrompt: raw.repairPrompt ? String(raw.repairPrompt) : raw.repair_prompt ? String(raw.repair_prompt) : undefined,
      }
    }).filter(note => Boolean(note.issue)),
  }
}

function buildRepairTargets(
  rubric: PresentationV2DeckQualityResult,
  reviewerAudit: PresentationV2ReviewerAudit,
): PresentationV2RepairTarget[] {
  const targets = new Map<number, PresentationV2RepairTarget>()
  const ensureTarget = (slideNumber: number): PresentationV2RepairTarget => {
    const existing = targets.get(slideNumber)
    if (existing) return existing
    const created: PresentationV2RepairTarget = {
      slideNumber,
      reasons: [],
      reviewerPrompts: [],
      recommendedAgents: [],
      severity: 'medium',
    }
    targets.set(slideNumber, created)
    return created
  }

  for (const slide of rubric.repairTargets) {
    const target = ensureTarget(slide.slideNumber)
    target.reasons = dedupeStrings([...target.reasons, ...slide.warnings.slice(0, 4)])
    target.recommendedAgents = Array.from(new Set([...target.recommendedAgents, ...slide.recommendedAgents]))
    if (slide.status === 'critical') target.severity = 'high'
  }

  for (const note of reviewerAudit.revisionNotes) {
    if (!note.slideNumber || note.slideNumber <= 0) continue
    const target = ensureTarget(note.slideNumber)
    target.reasons = dedupeStrings([...target.reasons, note.issue])
    if (note.repairPrompt) {
      target.reviewerPrompts = dedupeStrings([...target.reviewerPrompts, note.repairPrompt])
    }
    if (note.recommendedAgent) {
      target.recommendedAgents = Array.from(new Set([note.recommendedAgent, ...target.recommendedAgents]))
    }
    if (note.severity === 'high') target.severity = 'high'
  }

  return Array.from(targets.values())
    .filter(target => target.recommendedAgents.length > 0 && target.reasons.length > 0)
    .sort((left, right) => {
      const severityWeight = (value: PresentationV2RepairTarget['severity']) => value === 'high' ? 2 : 1
      return severityWeight(right.severity) - severityWeight(left.severity) || left.slideNumber - right.slideNumber
    })
    .slice(0, PRESENTATION_V2_REPAIR_SLIDE_LIMIT)
    .map(target => ({
      ...target,
      recommendedAgents: target.recommendedAgents.slice(0, PRESENTATION_V2_REPAIR_AGENTS_PER_SLIDE),
    }))
}

function buildRepairAgentLabel(agentKey: PresentationV2RepairAgent): string {
  switch (agentKey) {
    case 'presentation_v2_content_architect':
      return 'Arquiteto de Conteúdo (repair)'
    case 'presentation_v2_visual_director':
      return 'Diretor Visual (repair)'
    case 'presentation_v2_data_diagrammer':
      return 'Dados e Diagramas (repair)'
    default:
      return 'Redator de Slides (repair)'
  }
}

function buildRepairPrompt(args: {
  agentKey: PresentationV2RepairAgent
  input: StudioPipelineInput
  deck: PresentationV2Deck
  slide: PresentationV2Slide
  target: PresentationV2RepairTarget
  narrativePlan: string
  research: string
}): { system: string; user: string } {
  const section = args.deck.outline.sections.find(item => item.id === args.slide.sectionId)
  const deckContext = JSON.stringify({
    title: args.deck.title,
    objective: args.deck.generationSpec.objective,
    audience: args.deck.generationSpec.audience,
    narrativeArc: args.deck.outline.narrativeArc,
    section: section ? { id: section.id, title: section.title, purpose: section.purpose } : undefined,
  }, null, 2)
  const repairDirectives = dedupeStrings([...args.target.reasons, ...args.target.reviewerPrompts]).join(' | ')
  const currentSlide = JSON.stringify(args.slide, null, 2)

  if (args.agentKey === 'presentation_v2_content_architect') {
    return {
      system: 'Você é o Arquiteto de Conteúdo da Apresentação v2 em modo de reparo seletivo. Repare SOMENTE o slide indicado. Responda em JSON com slide{number,sectionId,title,purpose,layout,transition}.',
      user: [
        buildInputBrief(args.input),
        'Contexto resumido do deck:',
        deckContext,
        'Plano narrativo:',
        args.narrativePlan,
        'Slide atual:',
        currentSlide,
        'Problemas a corrigir:',
        repairDirectives,
      ].join('\n\n'),
    }
  }

  if (args.agentKey === 'presentation_v2_visual_director') {
    return {
      system: 'Você é o Diretor Visual da Apresentação v2 em modo de reparo seletivo. Repare SOMENTE o slide indicado. Responda em JSON com slide{number,layout,visualBrief,designNotes}.',
      user: [
        buildInputBrief(args.input),
        'Contexto resumido do deck:',
        deckContext,
        'Slide atual:',
        currentSlide,
        'Problemas a corrigir:',
        repairDirectives,
      ].join('\n\n'),
    }
  }

  if (args.agentKey === 'presentation_v2_data_diagrammer') {
    return {
      system: 'Você é o especialista em Dados e Diagramas da Apresentação v2 em modo de reparo seletivo. Repare SOMENTE o slide indicado. Responda em JSON com slide{number,chartSpec,designNotes,visualBrief} e assets[].',
      user: [
        buildInputBrief(args.input),
        'Contexto resumido do deck:',
        deckContext,
        'Pesquisa/evidências disponíveis:',
        args.research,
        'Slide atual:',
        currentSlide,
        'Problemas a corrigir:',
        repairDirectives,
      ].join('\n\n'),
    }
  }

  return {
    system: 'Você é o Redator de Slides da Apresentação v2 em modo de reparo seletivo. Repare SOMENTE o slide indicado. Responda em JSON com slide{number,title,purpose,layout,bullets,speakerNotes,transition,visualBrief,designNotes}. Preserve a tese, use no máximo 5 bullets e fortaleça as speaker notes.',
    user: [
      buildInputBrief(args.input),
      'Contexto resumido do deck:',
      deckContext,
      'Pesquisa/evidências disponíveis:',
      args.research,
      'Slide atual:',
      currentSlide,
      'Problemas a corrigir:',
      repairDirectives,
    ].join('\n\n'),
  }
}

async function runRepairAgentStep(args: {
  apiKey: string
  models: Record<string, string>
  resolveFallback: (agentKey: string, model: string) => string[]
  agentKey: PresentationV2RepairAgent
  agentLabel: string
  prompt: { system: string; user: string }
  slideNumber: number
  onProgress?: StudioProgressCallback
  signal?: AbortSignal
}): Promise<{ content: string; execution: StudioStepExecution }> {
  throwIfAborted(args.signal)
  args.onProgress?.(10, PRESENTATION_V2_TOTAL_STEPS, `Reparando o slide ${args.slideNumber} com ${args.agentLabel}...`, { executionState: 'running' })
  const model = args.models[args.agentKey]
  const result = await callLLMWithFallback(
    args.apiKey,
    args.prompt.system,
    args.prompt.user,
    model,
    args.resolveFallback(args.agentKey, model),
    2600,
    0.18,
    { signal: args.signal },
  )
  args.onProgress?.(10, PRESENTATION_V2_TOTAL_STEPS, `Reparo do slide ${args.slideNumber} com ${args.agentLabel} concluído.`, buildProgressMeta(result))
  return {
    content: result.content,
    execution: toExecution(`${args.agentKey}_repair`, args.agentLabel, result),
  }
}

function normalizeAssetPatch(raw: Record<string, unknown>, slideNumber: number, index: number): PresentationV2SlideAsset | null {
  const type = String(raw.type ?? '').trim()
  if (!type) return null
  return {
    id: String(raw.id ?? `slide-${slideNumber}-repair-asset-${index + 1}`),
    type: type as PresentationV2SlideAsset['type'],
    status: String(raw.status ?? 'planned') as PresentationV2SlideAsset['status'],
    prompt: raw.prompt ? String(raw.prompt) : undefined,
    negativePrompt: raw.negativePrompt ? String(raw.negativePrompt) : raw.negative_prompt ? String(raw.negative_prompt) : undefined,
    providerId: raw.providerId ? String(raw.providerId) : raw.provider_id ? String(raw.provider_id) : undefined,
    providerLabel: raw.providerLabel ? String(raw.providerLabel) : raw.provider_label ? String(raw.provider_label) : undefined,
    model: raw.model ? String(raw.model) : undefined,
    url: raw.url ? String(raw.url) : undefined,
    storagePath: raw.storagePath ? String(raw.storagePath) : raw.storage_path ? String(raw.storage_path) : undefined,
    mimeType: raw.mimeType ? String(raw.mimeType) : raw.mime_type ? String(raw.mime_type) : undefined,
    altText: raw.altText ? String(raw.altText) : raw.alt_text ? String(raw.alt_text) : undefined,
    error: raw.error ? String(raw.error) : undefined,
  }
}

function parseSlideRepairPatch(content: string, slideNumber: number): PresentationV2SlideRepairPatch | null {
  const parsed = parseJsonObject(content)
  const raw = typeof parsed.slide === 'object' && parsed.slide !== null ? parsed.slide as Record<string, unknown> : parsed
  const number = Number(raw.number ?? raw.slideNumber ?? slideNumber)
  if (!Number.isFinite(number) || number <= 0) return null
  return {
    number,
    sectionId: raw.sectionId ? String(raw.sectionId) : raw.section_id ? String(raw.section_id) : undefined,
    title: raw.title ? String(raw.title) : undefined,
    purpose: raw.purpose ? String(raw.purpose) : undefined,
    layout: raw.layout ? String(raw.layout) : undefined,
    bullets: toTrimmedStringArray(raw.bullets).slice(0, 5),
    speakerNotes: raw.speakerNotes ? String(raw.speakerNotes) : raw.speaker_notes ? String(raw.speaker_notes) : undefined,
    transition: raw.transition ? String(raw.transition) : undefined,
    visualBrief: raw.visualBrief ? String(raw.visualBrief) : raw.visual_brief ? String(raw.visual_brief) : undefined,
    designNotes: toTrimmedStringArray(raw.designNotes ?? raw.design_notes),
    chartSpec: typeof raw.chartSpec === 'object' && raw.chartSpec !== null
      ? raw.chartSpec as Record<string, unknown>
      : typeof raw.chart_spec === 'object' && raw.chart_spec !== null
        ? raw.chart_spec as Record<string, unknown>
        : undefined,
    assets: Array.isArray(raw.assets)
      ? (raw.assets as Record<string, unknown>[])
        .map((asset, index) => normalizeAssetPatch(asset, number, index))
        .filter((asset): asset is PresentationV2SlideAsset => Boolean(asset))
      : [],
  }
}

function mergeSlideAssets(existing: PresentationV2SlideAsset[] = [], patchAssets: PresentationV2SlideAsset[] = []): PresentationV2SlideAsset[] {
  const merged = new Map<string, PresentationV2SlideAsset>()
  for (const asset of existing) merged.set(asset.id, asset)
  for (const asset of patchAssets) {
    merged.set(asset.id, { ...(merged.get(asset.id) || {}), ...asset })
  }
  return Array.from(merged.values())
}

function rebuildDeckAssets(deck: PresentationV2Deck): void {
  deck.assets = deck.slides.flatMap(slide => slide.assets || [])
}

function applySlideRepairPatch(deck: PresentationV2Deck, slideNumber: number, patch: PresentationV2SlideRepairPatch): boolean {
  const slide = deck.slides.find(item => item.number === slideNumber)
  if (!slide) return false
  if (patch.sectionId?.trim()) slide.sectionId = patch.sectionId.trim()
  if (patch.title?.trim()) slide.title = patch.title.trim()
  if (patch.purpose?.trim()) slide.purpose = patch.purpose.trim()
  if (patch.layout?.trim()) slide.layout = patch.layout.trim()
  if (patch.bullets && patch.bullets.length > 0) slide.bullets = patch.bullets
  if (patch.speakerNotes?.trim()) slide.speakerNotes = patch.speakerNotes.trim()
  if (patch.transition?.trim()) slide.transition = patch.transition.trim()
  if (patch.visualBrief?.trim()) slide.visualBrief = patch.visualBrief.trim()
  if (patch.designNotes && patch.designNotes.length > 0) slide.designNotes = patch.designNotes
  if (patch.chartSpec) slide.chartSpec = patch.chartSpec
  if (patch.assets && patch.assets.length > 0) slide.assets = mergeSlideAssets(slide.assets, patch.assets)
  rebuildDeckAssets(deck)
  return true
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    : []
}

function toOptionalTrimmedString(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim()
  return normalized || undefined
}

function toPositiveNumber(value: unknown): number | undefined {
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined
}

function normalizeDeckLevelAsset(raw: Record<string, unknown>, index: number): PresentationV2SlideAsset | null {
  const type = String(raw.type ?? '').trim()
  if (!type) return null
  return {
    id: String(raw.id ?? `deck-asset-${index + 1}`),
    type: type as PresentationV2SlideAsset['type'],
    status: String(raw.status ?? 'planned') as PresentationV2SlideAsset['status'],
    prompt: raw.prompt ? String(raw.prompt) : undefined,
    negativePrompt: raw.negativePrompt ? String(raw.negativePrompt) : raw.negative_prompt ? String(raw.negative_prompt) : undefined,
    providerId: raw.providerId ? String(raw.providerId) : raw.provider_id ? String(raw.provider_id) : undefined,
    providerLabel: raw.providerLabel ? String(raw.providerLabel) : raw.provider_label ? String(raw.provider_label) : undefined,
    model: raw.model ? String(raw.model) : undefined,
    url: raw.url ? String(raw.url) : undefined,
    storagePath: raw.storagePath ? String(raw.storagePath) : raw.storage_path ? String(raw.storage_path) : undefined,
    mimeType: raw.mimeType ? String(raw.mimeType) : raw.mime_type ? String(raw.mime_type) : undefined,
    altText: raw.altText ? String(raw.altText) : raw.alt_text ? String(raw.alt_text) : undefined,
    error: raw.error ? String(raw.error) : undefined,
  }
}

function indexSlidePayloadsByNumber(items: Record<string, unknown>[]): Map<number, Record<string, unknown>> {
  const map = new Map<number, Record<string, unknown>>()
  for (const item of items) {
    const number = Number(item.number ?? item.slideNumber ?? item.slide_number)
    if (!Number.isFinite(number) || number <= 0) continue
    const current = map.get(number) || {}
    const mergedAssets = [
      ...toRecordArray(current.assets),
      ...toRecordArray(item.assets),
    ]
    map.set(number, {
      ...current,
      ...item,
      ...(mergedAssets.length > 0 ? { assets: mergedAssets } : {}),
    })
  }
  return map
}

function buildPresentationV2FallbackDeck(args: {
  input: StudioPipelineInput
  parts: {
    narrativePlan: string
    architecture: string
    slides: string
    visualDirection: string
    dataDiagramming: string
    assetPlan: string
  }
  reviewerAudit: PresentationV2ReviewerAudit
  reason: string
}): PresentationV2Deck {
  const briefing = args.input.presentationV2Briefing
  const narrative = parseJsonObject(args.parts.narrativePlan)
  const architecture = parseJsonObject(args.parts.architecture)
  const slidesPayload = parseJsonObject(args.parts.slides)
  const visual = parseJsonObject(args.parts.visualDirection)
  const dataDiagramming = parseJsonObject(args.parts.dataDiagramming)
  const assetPlan = parseJsonObject(args.parts.assetPlan)

  const architectureSlides = indexSlidePayloadsByNumber(toRecordArray(architecture.slides))
  const writerSlides = indexSlidePayloadsByNumber(toRecordArray(slidesPayload.slides))
  const visualSlides = indexSlidePayloadsByNumber(toRecordArray(visual.slides))
  const dataSlides = indexSlidePayloadsByNumber(toRecordArray(dataDiagramming.slides))
  const assetSlides = indexSlidePayloadsByNumber(toRecordArray(assetPlan.slides))
  const deckLevelAssetsRaw = [
    ...toRecordArray(dataDiagramming.assets),
    ...toRecordArray(assetPlan.assets),
  ]

  const slideNumbers = new Set<number>()
  for (const map of [architectureSlides, writerSlides, visualSlides, dataSlides, assetSlides]) {
    for (const key of map.keys()) slideNumbers.add(key)
  }
  const requestedSlideCount = toPositiveNumber(briefing?.slideCount) || toPositiveNumber(narrative.slideCount) || 1
  if (slideNumbers.size === 0) {
    for (let index = 1; index <= requestedSlideCount; index += 1) slideNumbers.add(index)
  }
  const orderedSlideNumbers = Array.from(slideNumbers).sort((left, right) => left - right)

  const slides = orderedSlideNumbers.map((number) => {
    const architectureSlide = architectureSlides.get(number) || {}
    const writerSlide = writerSlides.get(number) || {}
    const visualSlide = visualSlides.get(number) || {}
    const dataSlide = dataSlides.get(number) || {}
    const assetSlide = assetSlides.get(number) || {}
    const slideAssets = [
      ...toRecordArray(writerSlide.assets),
      ...toRecordArray(dataSlide.assets),
      ...toRecordArray(assetSlide.assets),
      ...deckLevelAssetsRaw.filter((asset) => {
        const assetSlideNumber = Number(asset.slideNumber ?? asset.slide_number ?? asset.number)
        return assetSlideNumber === number || String(asset.id ?? '').startsWith(`slide-${number}-`)
      }),
    ]
      .map((asset, index) => normalizeAssetPatch(asset, number, index))
      .filter((asset): asset is PresentationV2SlideAsset => Boolean(asset))

    return {
      id: String(writerSlide.id ?? `slide-${number}`),
      number,
      sectionId: toOptionalTrimmedString(writerSlide.sectionId ?? writerSlide.section_id ?? architectureSlide.sectionId ?? architectureSlide.section_id),
      title: String(writerSlide.title ?? architectureSlide.title ?? `Slide ${number}`),
      purpose: toOptionalTrimmedString(writerSlide.purpose ?? architectureSlide.purpose),
      layout: String(writerSlide.layout ?? visualSlide.layout ?? architectureSlide.recommendedLayout ?? architectureSlide.recommended_layout ?? 'default'),
      bullets: toTrimmedStringArray(writerSlide.bullets).slice(0, 5),
      speakerNotes: String(writerSlide.speakerNotes ?? writerSlide.speaker_notes ?? writerSlide.notes ?? ''),
      transition: toOptionalTrimmedString(writerSlide.transition ?? architectureSlide.transition),
      visualBrief: toOptionalTrimmedString(writerSlide.visualBrief ?? writerSlide.visual_brief ?? visualSlide.visualBrief ?? visualSlide.visual_brief),
      designNotes: dedupeStrings([
        ...toTrimmedStringArray(writerSlide.designNotes ?? writerSlide.design_notes),
        ...toTrimmedStringArray(visualSlide.designNotes ?? visualSlide.design_notes),
      ]),
      chartSpec: typeof (dataSlide.chartSpec ?? dataSlide.chart_spec) === 'object' && (dataSlide.chartSpec ?? dataSlide.chart_spec) !== null
        ? (dataSlide.chartSpec ?? dataSlide.chart_spec) as Record<string, unknown>
        : undefined,
      assets: slideAssets,
    }
  })

  let sections = toRecordArray(narrative.sections).map((section, index) => {
    const id = String(section.id ?? `section-${index + 1}`)
    const explicitSlideNumbers = Array.isArray(section.slideNumbers ?? section.slide_numbers)
      ? ((section.slideNumbers ?? section.slide_numbers) as unknown[]).map(Number).filter(Number.isFinite)
      : []
    const inferredSlideNumbers = slides.filter(slide => slide.sectionId === id).map(slide => slide.number)
    return {
      id,
      title: String(section.title ?? `Seção ${index + 1}`),
      purpose: String(section.purpose ?? ''),
      slideNumbers: explicitSlideNumbers.length > 0 ? explicitSlideNumbers : inferredSlideNumbers,
    }
  }).filter(section => section.slideNumbers.length > 0)

  if (sections.length === 0) {
    const grouped = new Map<string, { id: string; title: string; purpose: string; slideNumbers: number[] }>()
    for (const slide of slides) {
      const id = slide.sectionId || 'section-1'
      const current = grouped.get(id) || {
        id,
        title: id === 'section-1' ? 'Narrativa principal' : id,
        purpose: slide.purpose || '',
        slideNumbers: [],
      }
      current.slideNumbers.push(slide.number)
      if (!current.purpose && slide.purpose) current.purpose = slide.purpose
      grouped.set(id, current)
    }
    sections = Array.from(grouped.values())
  }

  if (sections.length === 0) {
    sections = [{
      id: 'section-1',
      title: 'Narrativa principal',
      purpose: String(narrative.narrativeArc ?? 'Conduzir a decisão principal da apresentação.'),
      slideNumbers: slides.map(slide => slide.number),
    }]
  }

  for (const slide of slides) {
    if (slide.sectionId) continue
    const section = sections.find(entry => entry.slideNumbers.includes(slide.number)) || sections[0]
    slide.sectionId = section?.id
  }

  const themeRaw = typeof visual.theme === 'object' && visual.theme !== null
    ? visual.theme as Record<string, unknown>
    : {}
  const extraDeckAssets = deckLevelAssetsRaw
    .map((asset, index) => normalizeDeckLevelAsset(asset, index))
    .filter((asset): asset is PresentationV2SlideAsset => Boolean(asset))

  const deck: PresentationV2Deck = {
    schemaVersion: 'presentation_v2.1',
    title: String((slidesPayload.title ?? narrative.title ?? args.input.topic) || 'Apresentação v2'),
    subtitle: toOptionalTrimmedString(slidesPayload.subtitle ?? narrative.subtitle),
    generationSpec: {
      request: [args.input.topic, args.input.description, args.input.customInstructions].filter(Boolean).join(' | ') || args.input.topic,
      objective: briefing?.objective || toOptionalTrimmedString(narrative.objective),
      audience: briefing?.audience || toOptionalTrimmedString(narrative.audience),
      slideCount: slides.length,
      depth: briefing?.depth || toOptionalTrimmedString(narrative.depth) || 'profunda',
      durationMinutes: briefing?.durationMinutes || toPositiveNumber(narrative.durationMinutes),
      language: 'pt-BR',
      tone: briefing?.tone,
      visualStyle: briefing?.visualStyle,
      outputFormat: 'pptx',
      multimodal: briefing?.multimodal,
      constraints: dedupeStrings(splitBriefingLines(briefing?.constraints)),
      sourcePriority: dedupeStrings(splitBriefingLines(briefing?.sourcePriority)),
    },
    outline: {
      narrativeArc: String(narrative.narrativeArc ?? narrative.narrative_arc ?? 'Começo, desenvolvimento e fechamento progressivos.'),
      sections,
    },
    theme: {
      name: String(themeRaw.name ?? 'Lexio Presentation v2'),
      mood: toOptionalTrimmedString(themeRaw.mood),
      palette: toTrimmedStringArray(themeRaw.palette),
      fontPairing: typeof themeRaw.fontPairing === 'object' && themeRaw.fontPairing !== null
        ? themeRaw.fontPairing as PresentationV2Deck['theme']['fontPairing']
        : undefined,
      layoutPrinciples: toTrimmedStringArray(themeRaw.layoutPrinciples ?? themeRaw.layout_principles),
      accessibilityNotes: toTrimmedStringArray(themeRaw.accessibilityNotes ?? themeRaw.accessibility_notes),
      designSystem: typeof (themeRaw.designSystem ?? themeRaw.design_system) === 'object' && (themeRaw.designSystem ?? themeRaw.design_system) !== null
        ? (themeRaw.designSystem ?? themeRaw.design_system) as PresentationV2Deck['theme']['designSystem']
        : undefined,
    },
    slides,
    assets: mergeSlideAssets(slides.flatMap(slide => slide.assets || []), extraDeckAssets),
    quality: {
      score: args.reviewerAudit.quality.score,
      strengths: args.reviewerAudit.quality.strengths,
      warnings: dedupeStrings([
        ...args.reviewerAudit.quality.warnings,
        'Manifesto reconstruído localmente a partir das saídas intermediárias do pipeline.',
      ]),
      accessibility: args.reviewerAudit.quality.accessibility,
      legalAccuracyNotes: args.reviewerAudit.quality.legalAccuracyNotes,
    },
    exportHints: {
      aspectRatio: '16:9',
      preferredExport: 'pptx',
      useRenderedSlideFallback: true,
      includeSpeakerNotes: true,
    },
    revisionHistory: [{
      at: new Date().toISOString(),
      agent: 'presentation_v2_packager',
      summary: `Manifesto reconstruído localmente após falha do empacotador: ${args.reason}`,
      repairKind: 'manifest_recovery',
    }],
  }

  rebuildDeckAssets(deck)
  return deck
}

function buildPackagerRepairPrompt(args: {
  input: StudioPipelineInput
  parts: {
    contextAudit: string
    narrativePlan: string
    research: string
    architecture: string
    slides: string
    visualDirection: string
    dataDiagramming: string
    assetPlan: string
    review: string
  }
  invalidManifest: string
  reason: string
  orchestratorDirective?: string
}): { system: string; user: string } {
  return {
    system: [
      'Você é o Empacotador do Gerador de Apresentação v2 em modo de recuperação.',
      'Corrija o manifesto inválido e devolva SOMENTE JSON válido no schema PresentationV2Deck.',
      'Não explique nada fora do JSON. Não perca bullets, speakerNotes, sections, assets nem quality.',
      'Se algum campo estiver faltando, sintetize o mínimo necessário a partir das partes fornecidas para manter o schema íntegro.',
    ].join(' '),
    user: joinPromptSections([
      buildInputBrief(args.input),
      `Falha detectada no manifesto anterior: ${args.reason}`,
      'Manifesto inválido retornado pelo packager:',
      args.invalidManifest,
      'Auditoria de contexto:',
      args.parts.contextAudit,
      'Plano narrativo:',
      args.parts.narrativePlan,
      'Pesquisa:',
      args.parts.research,
      'Arquitetura de conteúdo:',
      args.parts.architecture,
      'Slides redigidos:',
      args.parts.slides,
      'Direção visual:',
      args.parts.visualDirection,
      'Dados e diagramas:',
      args.parts.dataDiagramming,
      'Plano de assets:',
      args.parts.assetPlan,
      'Revisão:',
      args.parts.review,
      args.orchestratorDirective ? `Diretrizes do orquestrador:\n${args.orchestratorDirective}` : undefined,
    ]),
  }
}

function buildPackagerQualityRecoveryPrompt(args: {
  input: StudioPipelineInput
  parts: {
    contextAudit: string
    narrativePlan: string
    research: string
    architecture: string
    slides: string
    visualDirection: string
    dataDiagramming: string
    assetPlan: string
    review: string
  }
  weakManifest: string
  rubric: PresentationV2DeckQualityResult
  reviewerAudit: PresentationV2ReviewerAudit
  orchestratorDirective?: string
}): { system: string; user: string } {
  const rubricWarnings = dedupeStrings([
    ...args.rubric.warnings,
    ...args.rubric.slideRubric
      .filter(slide => slide.status !== 'ok')
      .flatMap((slide) => slide.warnings.slice(0, 3).map((warning) => `Slide ${slide.slideNumber}: ${warning}`)),
  ])
  const reviewerSignals = dedupeStrings([
    ...args.reviewerAudit.quality.warnings,
    ...args.reviewerAudit.revisionNotes.map((note) => `Slide ${note.slideNumber ?? '?'}: ${note.issue}`),
  ])

  return {
    system: [
      'Você é o Empacotador do Gerador de Apresentação v2 em modo de recuperação premium.',
      'Reescreva o manifesto inteiro para atingir um padrão executivo real, devolvendo SOMENTE JSON válido no schema PresentationV2Deck.',
      'Não preserve slides fracos por inércia: elimine títulos genéricos, repetição, layouts default, speaker notes rasas e transições frouxas.',
      'Cada slide deve ter função narrativa explícita, título específico, até 5 bullets densos, speaker notes robustas, transição clara, visualBrief útil e designNotes coerentes.',
      'Preserve fontes prioritárias, seções, assets planejados, restrições institucionais, consistência visual e rastreabilidade jurídica.',
      'Se precisar condensar ou redistribuir conteúdo para melhorar o arco narrativo, faça isso sem quebrar o schema nem inventar lastro inexistente.',
    ].join(' '),
    user: joinPromptSections([
      buildInputBrief(args.input),
      `Rubrica atual do deck: ${args.rubric.score}/100 (${args.rubric.status}).`,
      args.rubric.slidesBelowThreshold.length > 0
        ? `Slides abaixo do limiar: ${args.rubric.slidesBelowThreshold.join(', ')}.`
        : undefined,
      rubricWarnings.length > 0
        ? `Alertas determinísticos a corrigir:\n${rubricWarnings.join('\n')}`
        : undefined,
      reviewerSignals.length > 0
        ? `Alertas do reviewer a corrigir:\n${reviewerSignals.join('\n')}`
        : undefined,
      'Manifesto atual abaixo do padrão premium:',
      args.weakManifest,
      'Auditoria de contexto:',
      args.parts.contextAudit,
      'Plano narrativo:',
      args.parts.narrativePlan,
      'Pesquisa:',
      args.parts.research,
      'Arquitetura de conteúdo:',
      args.parts.architecture,
      'Slides redigidos:',
      args.parts.slides,
      'Direção visual:',
      args.parts.visualDirection,
      'Dados e diagramas:',
      args.parts.dataDiagramming,
      'Plano de assets:',
      args.parts.assetPlan,
      'Revisão:',
      args.parts.review,
      args.orchestratorDirective ? `Diretrizes do orquestrador:\n${args.orchestratorDirective}` : undefined,
    ]),
  }
}

function parseDeckOrThrow(raw: string): PresentationV2Deck {
  const parsed = parseArtifactContent('apresentacao_v2', extractJsonPayload(raw))
  if (parsed.kind !== 'presentation_v2') {
    throw new Error('O Gerador de Apresentação v2 retornou um manifesto JSON inválido.')
  }
  return JSON.parse(JSON.stringify(parsed.data.deck)) as PresentationV2Deck
}

function applyQualitySnapshotToDeck(args: {
  deck: PresentationV2Deck
  rubric: PresentationV2DeckQualityResult
  reviewerAudit: PresentationV2ReviewerAudit
  appliedRepairs: AppliedPresentationV2Repair[]
  repairTargets: PresentationV2RepairTarget[]
  repairOutcome?: 'applied' | 'skipped'
}): PresentationV2Deck {
  const deck = synthesizePresentationV2DesignSystem(args.deck)
  const reviewerScore = args.reviewerAudit.quality.score
  const combinedScore = typeof reviewerScore === 'number'
    ? Math.round((reviewerScore + args.rubric.score) / 2)
    : args.rubric.score
  const repairSummary = dedupeStrings([
    ...args.appliedRepairs.map((repair) => `Slide ${repair.slideNumber}: reparo seletivo aplicado por ${repair.agentKey}.`),
    args.repairOutcome === 'skipped' && args.repairTargets.length > 0
      ? 'O loop de reparo foi tentado, mas o manifesto final preservou o draft original por não haver ganho líquido de qualidade.'
      : '',
    args.repairTargets.length > 0 && args.appliedRepairs.length === 0
      ? `Rubrica identificou reparos pendentes nos slides ${args.repairTargets.map(target => target.slideNumber).join(', ')}.`
      : '',
  ].filter(Boolean))

  deck.quality = {
    ...deck.quality,
    score: combinedScore,
    strengths: dedupeStrings([...(deck.quality?.strengths || []), ...args.reviewerAudit.quality.strengths, ...args.rubric.strengths]).slice(0, 8),
    warnings: dedupeStrings([...(deck.quality?.warnings || []), ...args.reviewerAudit.quality.warnings, ...args.rubric.warnings]).slice(0, 12),
    accessibility: dedupeStrings([...(deck.quality?.accessibility || []), ...args.reviewerAudit.quality.accessibility]),
    legalAccuracyNotes: dedupeStrings([...(deck.quality?.legalAccuracyNotes || []), ...args.reviewerAudit.quality.legalAccuracyNotes]),
    deckRubric: {
      score: args.rubric.score,
      status: args.rubric.status,
      slideThreshold: args.rubric.slideThreshold,
      deckThreshold: args.rubric.deckThreshold,
      slidesBelowThreshold: args.rubric.slidesBelowThreshold,
      repairableSlides: args.rubric.repairableSlides,
      strengths: args.rubric.strengths,
      warnings: args.rubric.warnings,
    },
    slideRubric: args.rubric.slideRubric.map((slide) => ({
      slideNumber: slide.slideNumber,
      score: slide.score,
      status: slide.status,
      strengths: slide.strengths,
      warnings: slide.warnings,
      repairHints: slide.repairHints,
      recommendedAgents: slide.recommendedAgents,
      categories: slide.categories.map((category) => ({
        key: category.key,
        label: category.label,
        score: category.score,
        reasons: category.reasons,
      })),
    })),
    repairSummary,
  }

  deck.revisionHistory = [
    ...(deck.revisionHistory || []),
    {
      at: new Date().toISOString(),
      agent: 'presentation_v2_reviewer',
      summary: `Reviewer score ${reviewerScore ?? 'n/d'}; slides abaixo do limiar: ${args.rubric.slidesBelowThreshold.join(', ') || 'nenhum'}.`,
      repairKind: 'review',
    },
    ...args.appliedRepairs.map((repair) => ({
      at: new Date().toISOString(),
      agent: 'presentation_v2_repair_loop',
      summary: `Slide ${repair.slideNumber} reparado por ${repair.agentKey}.`,
      slideNumbers: [repair.slideNumber],
      repairAgent: repair.agentKey,
      repairKind: 'selective_repair',
    })),
  ]

  return deck
}

function buildPresentationV2ProgressStep(state: PresentationV2RuntimeProgressState): number {
  const provisionalStep = state.completedAgentKeys.size + (state.activeAgentKeys.size > 0 ? 1 : 0)
  return Math.max(0, Math.min(state.totalSteps, provisionalStep))
}

function buildPresentationV2ProgressPercent(state: PresentationV2RuntimeProgressState): number {
  const completed = state.completedAgentKeys.size
  const activeBonus = state.activeAgentKeys.size > 0 ? 0.5 : 0
  const percent = Math.round(((completed + activeBonus) / Math.max(1, state.totalSteps)) * 100)
  return Math.max(0, Math.min(99, percent))
}

function emitPresentationV2Progress(
  state: PresentationV2RuntimeProgressState | undefined,
  phase: string,
  meta?: StudioProgressMeta,
): void {
  if (!state?.onProgress) return
  state.onProgress(
    buildPresentationV2ProgressStep(state),
    state.totalSteps,
    phase,
    {
      ...meta,
      activeAgentKeys: Array.from(state.activeAgentKeys),
      completedAgentKeys: Array.from(state.completedAgentKeys),
      progressPercent: buildPresentationV2ProgressPercent(state),
    },
  )
}

async function runAgentStep(args: {
  apiKey: string
  models: Record<string, string>
  resolveFallback: (agentKey: string, model: string) => string[]
  agentKey: string
  agentLabel: string
  prompt: { system: string; user: string }
  maxTokens: number
  temperature: number
  step: number
  phase: string
  progressState?: PresentationV2RuntimeProgressState
  progressKey?: string
  emitStartProgress?: boolean
  onProgress?: StudioProgressCallback
  signal?: AbortSignal
}): Promise<{ content: string; execution: StudioStepExecution }> {
  const progressKey = args.progressKey || args.agentKey
  if (args.progressState) {
    args.progressState.activeAgentKeys.add(progressKey)
    if (args.emitStartProgress !== false) {
      emitPresentationV2Progress(args.progressState, args.phase, { executionState: 'running' })
    }
  } else {
    args.onProgress?.(args.step, PRESENTATION_V2_TOTAL_STEPS, args.phase, { executionState: 'running' })
  }

  throwIfAborted(args.signal)
  const model = args.models[args.agentKey]
  try {
    const result = await callLLMWithFallback(
      args.apiKey,
      args.prompt.system,
      args.prompt.user,
      model,
      args.resolveFallback(args.agentKey, model),
      args.maxTokens,
      args.temperature,
      { signal: args.signal },
    )
    if (args.progressState) {
      args.progressState.activeAgentKeys.delete(progressKey)
      args.progressState.completedAgentKeys.add(progressKey)
      emitPresentationV2Progress(args.progressState, `${args.phase} concluído.`, buildProgressMeta(result))
    } else {
      args.onProgress?.(args.step, PRESENTATION_V2_TOTAL_STEPS, `${args.phase} concluído.`, buildProgressMeta(result))
    }

    return {
      content: result.content,
      execution: toExecution(args.agentKey, args.agentLabel, result),
    }
  } catch (error) {
    if (args.progressState) {
      args.progressState.activeAgentKeys.delete(progressKey)
    }
    throw error
  }
}

async function runPresentationV2Wave(args: {
  wave: PresentationV2OrchestratorWave
  progressState: PresentationV2RuntimeProgressState
  tasks: Array<Omit<Parameters<typeof runAgentStep>[0], 'step' | 'onProgress' | 'progressState' | 'emitStartProgress'>>
}): Promise<Array<{ content: string; execution: StudioStepExecution }>> {
  for (const task of args.tasks) {
    args.progressState.activeAgentKeys.add(task.progressKey || task.agentKey)
  }

  emitPresentationV2Progress(args.progressState, args.wave.objective, {
    executionState: 'running',
    stageMeta: args.tasks.length > 1
      ? `Paralelo: ${args.tasks.map(task => task.agentLabel).join(' • ')}`
      : args.tasks[0]?.agentLabel,
  })

  return Promise.all(args.tasks.map(task => runAgentStep({
    ...task,
    step: buildPresentationV2ProgressStep(args.progressState),
    progressState: args.progressState,
    emitStartProgress: false,
  })))
}

export async function draftPresentationV2ClarifyingQuestions(
  input: StudioPipelineInput,
  signal?: AbortSignal,
): Promise<PresentationV2ClarificationResult> {
  const models = await loadPresentationV2PipelineModels(input.uid)
  await validateScopedAgentModels('presentation_v2_pipeline_models', omitInactiveMediaModels(models))
  const fallbackConfig = await loadFallbackPriorityConfig().catch(() => ({}))
  const resolveFallback = buildPipelineFallbackResolver(PRESENTATION_V2_PIPELINE_AGENT_DEFS, fallbackConfig)
  const requiredKeys = ['presentation_v2_clarifier'] as const
  const missing = requiredKeys.filter(key => !models[key])
  if (missing.length > 0) {
    throw new Error(`Agente(s) sem modelo no Gerador de Apresentação v2: ${missing.join(', ')}`)
  }

  const prompt = buildClarifierPrompt(input)
  const deterministicQuestions = buildDeterministicClarifierQuestions(input)
  const result = await callLLMWithFallback(
    input.apiKey,
    prompt.system,
    prompt.user,
    models.presentation_v2_clarifier,
    resolveFallback('presentation_v2_clarifier', models.presentation_v2_clarifier),
    2400,
    0.15,
    { signal },
  )

  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(extractJsonPayload(result.content)) as Record<string, unknown>
  } catch {
    parsed = {}
  }

  const modelQuestions = Array.isArray(parsed.questions) ? parsed.questions as PresentationV2ClarificationQuestion[] : []
  const questions = mergeClarificationQuestions(deterministicQuestions, modelQuestions)

  return {
    needsClarification: questions.length > 0 || Boolean(parsed.needsClarification),
    questions,
    consolidatedBrief: String(parsed.consolidatedBrief || buildStructuredClarifierFallbackBrief(input)),
    executions: [toExecution('presentation_v2_clarifier', 'Clarificador', result)],
  }
}

export async function runPresentationGenerationPipelineV2(
  input: StudioPipelineInput,
  onProgress?: StudioProgressCallback,
  signal?: AbortSignal,
): Promise<PresentationV2PipelineResult> {
  const models = await loadPresentationV2PipelineModels(input.uid)
  const orchestratorModel = resolveOrchestratorModel(models, 'presentation_v2_orchestrator', ['presentation_v2_narrative_planner', 'presentation_v2_reviewer'])
  const runtimeModels: Record<string, string> = {
    ...models,
    presentation_v2_orchestrator: orchestratorModel || models.presentation_v2_orchestrator,
  }
  await validateScopedAgentModels('presentation_v2_pipeline_models', omitInactiveMediaModels(runtimeModels))
  const fallbackConfig = await loadFallbackPriorityConfig().catch(() => ({}))
  const resolveFallback = buildPipelineFallbackResolver(PRESENTATION_V2_PIPELINE_AGENT_DEFS, fallbackConfig)

  const missing = PRESENTATION_V2_TEXT_AGENT_KEYS.filter(key => !runtimeModels[key])
  if (missing.length > 0) {
    throw new Error(`Agente(s) sem modelo no Gerador de Apresentação v2: ${missing.join(', ')}`)
  }

  const executions: StudioStepExecution[] = []
  const progressState: PresentationV2RuntimeProgressState = {
    activeAgentKeys: new Set<string>(),
    completedAgentKeys: new Set<string>(),
    totalSteps: PRESENTATION_V2_TOTAL_STEPS,
    onProgress,
  }

  const orchestrator = await runAgentStep({
    apiKey: input.apiKey,
    models: runtimeModels,
    resolveFallback,
    agentKey: 'presentation_v2_orchestrator',
    agentLabel: 'Orquestrador v2',
    prompt: buildOrchestratorPrompt(input),
    maxTokens: 3200,
    temperature: 0.12,
    step: 1,
    phase: 'Orquestrador definindo ondas paralelas e controles da produção',
    onProgress,
    signal,
    progressState,
  })
  executions.push(orchestrator.execution)
  const orchestratorPlan = parsePresentationV2OrchestratorPlan(orchestrator.content)
  const [contextWave, framingWave, architectureWave, compositionWave, assetsWave, reviewWave, packageWave] = orchestratorPlan.waves

  const [contextAudit] = await runPresentationV2Wave({
    wave: contextWave,
    progressState,
    tasks: [{
      apiKey: input.apiKey,
      models: runtimeModels,
      resolveFallback,
      agentKey: 'presentation_v2_context_auditor',
      agentLabel: 'Auditor de Contexto',
      prompt: buildContextAuditPrompt(input, buildPresentationV2AgentDirective(orchestratorPlan, 'presentation_v2_context_auditor')),
      maxTokens: 3000,
      temperature: 0.15,
      phase: 'Auditando contexto, fontes e lacunas',
      signal,
    }],
  })
  executions.push(contextAudit.execution)

  const [narrativePlan, research] = await runPresentationV2Wave({
    wave: framingWave,
    progressState,
    tasks: [
      {
        apiKey: input.apiKey,
        models: runtimeModels,
        resolveFallback,
        agentKey: 'presentation_v2_narrative_planner',
        agentLabel: 'Planejador Narrativo',
        prompt: buildNarrativePlanPrompt(input, contextAudit.content, buildPresentationV2AgentDirective(orchestratorPlan, 'presentation_v2_narrative_planner')),
        maxTokens: 4200,
        temperature: 0.2,
        phase: 'Planejando começo, meio e fim',
        signal,
      },
      {
        apiKey: input.apiKey,
        models: runtimeModels,
        resolveFallback,
        agentKey: 'presentation_v2_researcher',
        agentLabel: 'Pesquisador',
        prompt: buildResearchPrompt(input, contextAudit.content, buildPresentationV2AgentDirective(orchestratorPlan, 'presentation_v2_researcher')),
        maxTokens: 5000,
        temperature: 0.15,
        phase: 'Selecionando evidências e mensagens-chave',
        signal,
      },
    ],
  })
  executions.push(narrativePlan.execution, research.execution)

  const [architecture] = await runPresentationV2Wave({
    wave: architectureWave,
    progressState,
    tasks: [{
      apiKey: input.apiKey,
      models: runtimeModels,
      resolveFallback,
      agentKey: 'presentation_v2_content_architect',
      agentLabel: 'Arquiteto de Conteúdo',
      prompt: buildContentArchitecturePrompt(
        narrativePlan.content,
        research.content,
        buildPresentationV2AgentDirective(orchestratorPlan, 'presentation_v2_content_architect'),
      ),
      maxTokens: 5200,
      temperature: 0.2,
      phase: 'Arquitetando conteúdo slide a slide',
      signal,
    }],
  })
  executions.push(architecture.execution)

  const [slides, visualDirection, dataDiagramming] = await runPresentationV2Wave({
    wave: compositionWave,
    progressState,
    tasks: [
      {
        apiKey: input.apiKey,
        models: runtimeModels,
        resolveFallback,
        agentKey: 'presentation_v2_slide_writer',
        agentLabel: 'Redator de Slides',
        prompt: buildSlideWriterPrompt(
          input,
          architecture.content,
          research.content,
          buildPresentationV2AgentDirective(orchestratorPlan, 'presentation_v2_slide_writer'),
        ),
        maxTokens: 9000,
        temperature: 0.25,
        phase: 'Escrevendo slides e notas do apresentador',
        signal,
      },
      {
        apiKey: input.apiKey,
        models: runtimeModels,
        resolveFallback,
        agentKey: 'presentation_v2_visual_director',
        agentLabel: 'Diretor Visual',
        prompt: buildVisualDirectorPrompt(
          input,
          narrativePlan.content,
          architecture.content,
          research.content,
          buildPresentationV2AgentDirective(orchestratorPlan, 'presentation_v2_visual_director'),
        ),
        maxTokens: 7000,
        temperature: 0.22,
        phase: 'Definindo sistema visual e layouts',
        signal,
      },
      {
        apiKey: input.apiKey,
        models: runtimeModels,
        resolveFallback,
        agentKey: 'presentation_v2_data_diagrammer',
        agentLabel: 'Dados e Diagramas',
        prompt: buildDataDiagrammerPrompt(
          architecture.content,
          research.content,
          buildPresentationV2AgentDirective(orchestratorPlan, 'presentation_v2_data_diagrammer'),
        ),
        maxTokens: 5800,
        temperature: 0.18,
        phase: 'Especificando gráficos, diagramas e visualizações',
        signal,
      },
    ],
  })
  executions.push(slides.execution, visualDirection.execution, dataDiagramming.execution)

  const [assetPlan] = await runPresentationV2Wave({
    wave: assetsWave,
    progressState,
    tasks: [{
      apiKey: input.apiKey,
      models: runtimeModels,
      resolveFallback,
      agentKey: 'presentation_v2_asset_planner',
      agentLabel: 'Planejador de Assets',
      prompt: buildAssetPlannerPrompt(
        slides.content,
        visualDirection.content,
        dataDiagramming.content,
        buildPresentationV2AgentDirective(orchestratorPlan, 'presentation_v2_asset_planner'),
      ),
      maxTokens: 7000,
      temperature: 0.2,
      phase: 'Planejando imagens, áudio, vídeo e diagramas',
      signal,
    }],
  })
  executions.push(assetPlan.execution)

  const [review] = await runPresentationV2Wave({
    wave: reviewWave,
    progressState,
    tasks: [{
      apiKey: input.apiKey,
      models: runtimeModels,
      resolveFallback,
      agentKey: 'presentation_v2_reviewer',
      agentLabel: 'Revisor Multimodal',
      prompt: buildReviewerPrompt(
        input,
        [slides.content, visualDirection.content, dataDiagramming.content, assetPlan.content].join('\n\n'),
        buildPresentationV2AgentDirective(orchestratorPlan, 'presentation_v2_reviewer'),
      ),
      maxTokens: 5000,
      temperature: 0.15,
      phase: 'Auditando qualidade jurídica, visual e multimodal',
      signal,
    }],
  })
  executions.push(review.execution)

  const packagerParts = {
    contextAudit: contextAudit.content,
    narrativePlan: narrativePlan.content,
    research: research.content,
    architecture: architecture.content,
    slides: slides.content,
    visualDirection: visualDirection.content,
    dataDiagramming: dataDiagramming.content,
    assetPlan: assetPlan.content,
    review: review.content,
  }

  const [packager] = await runPresentationV2Wave({
    wave: packageWave,
    progressState,
    tasks: [{
      apiKey: input.apiKey,
      models: runtimeModels,
      resolveFallback,
      agentKey: 'presentation_v2_packager',
      agentLabel: 'Empacotador',
      prompt: buildPackagerPrompt(
        input,
        packagerParts,
        buildPresentationV2AgentDirective(orchestratorPlan, 'presentation_v2_packager'),
      ),
      maxTokens: 11000,
      temperature: 0.1,
      phase: 'Empacotando manifesto final da apresentação v2',
      signal,
    }],
  })
  executions.push(packager.execution)

  const reviewerAudit = parseReviewerAudit(review.content)
  let manifestRecovery: 'repair' | 'local_fallback' | null = null
  let draftDeck: PresentationV2Deck
  try {
    draftDeck = parseDeckOrThrow(packager.content)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'manifesto_invalido'
    try {
      const packagerRepair = await runAgentStep({
        apiKey: input.apiKey,
        models: runtimeModels,
        resolveFallback,
        agentKey: 'presentation_v2_packager',
        agentLabel: 'Empacotador (reparo)',
        prompt: buildPackagerRepairPrompt({
          input,
          parts: packagerParts,
          invalidManifest: packager.content,
          reason,
          orchestratorDirective: buildPresentationV2AgentDirective(orchestratorPlan, 'presentation_v2_packager'),
        }),
        maxTokens: 11000,
        temperature: 0.05,
        step: PRESENTATION_V2_TOTAL_STEPS,
        phase: 'Reparando manifesto final da apresentação v2',
        onProgress,
        signal,
        progressState,
        progressKey: 'presentation_v2_packager',
      })
      executions.push(packagerRepair.execution)
      draftDeck = parseDeckOrThrow(packagerRepair.content)
      manifestRecovery = 'repair'
    } catch {
      draftDeck = buildPresentationV2FallbackDeck({
        input,
        parts: {
          narrativePlan: narrativePlan.content,
          architecture: architecture.content,
          slides: slides.content,
          visualDirection: visualDirection.content,
          dataDiagramming: dataDiagramming.content,
          assetPlan: assetPlan.content,
        },
        reviewerAudit,
        reason,
      })
      manifestRecovery = 'local_fallback'
    }
  }
  const draftRubric = evaluatePresentationV2Quality(draftDeck)
  const repairTargets = buildRepairTargets(draftRubric, reviewerAudit)
  let finalDeck = draftDeck
  let finalRubric = draftRubric
  let repairOutcome: 'applied' | 'skipped' | undefined
  const appliedRepairs: AppliedPresentationV2Repair[] = []
  let qualityRecoveryApplied = false
  let qualityRecoveryPreviousScore: number | null = null

  if (repairTargets.length > 0) {
    const repairedDeck = JSON.parse(JSON.stringify(draftDeck)) as PresentationV2Deck
    for (const target of repairTargets) {
      const slide = repairedDeck.slides.find(item => item.number === target.slideNumber)
      if (!slide) continue
      const repairResults = await Promise.all(target.recommendedAgents.map(agentKey => runRepairAgentStep({
        apiKey: input.apiKey,
        models: runtimeModels,
        resolveFallback,
        agentKey,
        agentLabel: buildRepairAgentLabel(agentKey),
        prompt: buildRepairPrompt({
          agentKey,
          input,
          deck: repairedDeck,
          slide,
          target,
          narrativePlan: narrativePlan.content,
          research: research.content,
        }),
        slideNumber: target.slideNumber,
        onProgress,
        signal,
      })))

      for (const [index, repair] of repairResults.entries()) {
        const agentKey = target.recommendedAgents[index]
        executions.push(repair.execution)
        const patch = parseSlideRepairPatch(repair.content, target.slideNumber)
        if (patch && applySlideRepairPatch(repairedDeck, target.slideNumber, patch)) {
          appliedRepairs.push({
            slideNumber: target.slideNumber,
            agentKey,
            reasons: target.reasons,
          })
        }
      }
    }

    const repairedRubric = evaluatePresentationV2Quality(repairedDeck)
    if (
      repairedRubric.score > draftRubric.score
      || repairedRubric.repairableSlides.length < draftRubric.repairableSlides.length
    ) {
      finalDeck = repairedDeck
      finalRubric = repairedRubric
      repairOutcome = 'applied'
    } else {
      repairOutcome = 'skipped'
    }
  }

  if (finalRubric.status !== 'ok') {
    try {
      const qualityRecovery = await runAgentStep({
        apiKey: input.apiKey,
        models: runtimeModels,
        resolveFallback,
        agentKey: 'presentation_v2_packager',
        agentLabel: 'Empacotador (quality recovery)',
        prompt: buildPackagerQualityRecoveryPrompt({
          input,
          parts: packagerParts,
          weakManifest: JSON.stringify(finalDeck, null, 2),
          rubric: finalRubric,
          reviewerAudit,
          orchestratorDirective: buildPresentationV2AgentDirective(orchestratorPlan, 'presentation_v2_packager'),
        }),
        maxTokens: 12000,
        temperature: 0.08,
        step: PRESENTATION_V2_TOTAL_STEPS,
        phase: 'Reempacotando o manifesto final para atingir o padrão premium',
        onProgress,
        signal,
        progressState,
        progressKey: 'presentation_v2_packager',
      })
      executions.push(qualityRecovery.execution)

      const recoveredDeck = parseDeckOrThrow(qualityRecovery.content)
      const recoveredRubric = evaluatePresentationV2Quality(recoveredDeck)
      const recoveredImproved = (
        recoveredRubric.score > finalRubric.score
        || recoveredRubric.repairableSlides.length < finalRubric.repairableSlides.length
        || recoveredRubric.status === 'ok'
        || (recoveredRubric.status === 'repair' && finalRubric.status === 'critical')
      )

      if (recoveredImproved) {
        qualityRecoveryPreviousScore = finalRubric.score
        finalDeck = recoveredDeck
        finalRubric = recoveredRubric
        qualityRecoveryApplied = true
      }
    } catch {
      // If the premium recovery pass fails, keep the best deck already assembled.
    }
  }

  const finalDeckWithQuality = applyQualitySnapshotToDeck({
    deck: finalDeck,
    rubric: finalRubric,
    reviewerAudit,
    appliedRepairs: repairOutcome === 'applied' ? appliedRepairs : [],
    repairTargets,
    repairOutcome,
  })

  if (manifestRecovery) {
    finalDeckWithQuality.revisionHistory = [
      ...(finalDeckWithQuality.revisionHistory || []),
      {
        at: new Date().toISOString(),
        agent: 'presentation_v2_packager',
        summary: manifestRecovery === 'repair'
          ? 'Manifesto final recuperado por reparo explícito do empacotador.'
          : 'Manifesto final reconstruído localmente a partir das saídas intermediárias.',
        repairKind: 'manifest_recovery',
      },
    ]
  }

  if (qualityRecoveryApplied) {
    finalDeckWithQuality.quality = {
      ...finalDeckWithQuality.quality,
      repairSummary: dedupeStrings([
        ...(finalDeckWithQuality.quality?.repairSummary || []),
        `Recuperação final de qualidade aplicada pelo empacotador: rubrica ${qualityRecoveryPreviousScore ?? 'n/d'} -> ${finalRubric.score}.`,
      ]),
    }
    finalDeckWithQuality.revisionHistory = [
      ...(finalDeckWithQuality.revisionHistory || []),
      {
        at: new Date().toISOString(),
        agent: 'presentation_v2_packager',
        summary: `Recuperação final elevou a rubrica do deck de ${qualityRecoveryPreviousScore ?? 'n/d'} para ${finalRubric.score}.`,
        repairKind: 'quality_recovery',
      },
    ]
  }

  const finalContent = JSON.stringify(finalDeckWithQuality, null, 2)

  return {
    content: finalContent,
    executions,
  }
}
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, HelpCircle, Loader2, SlidersHorizontal, Sparkles } from 'lucide-react'
import DraggablePanel from './DraggablePanel'
import type {
  PresentationV2ClarificationQuestion,
  PresentationV2ClarificationResult,
  PresentationV2PreflightResult,
} from '../lib/presentation-generation-pipeline-v2'
import type { StudioStepExecution } from '../lib/notebook-studio-pipeline'

export type PresentationV2DepthChoice = 'executiva' | 'intermediaria' | 'profunda' | 'tecnica'
export type PresentationV2EvidenceMode = 'padrao' | 'reforcada' | 'estrita'
export type PresentationV2SlideDensity = 'leve' | 'equilibrada' | 'densa'
export type PresentationV2MediaRequirement = 'disabled' | 'optional' | 'required'

const MEDIA_LABELS = {
  images: 'Imagens',
  audio: 'Áudio',
  video: 'Vídeo',
  charts: 'Gráficos',
  diagrams: 'Diagramas',
} as const

const EVIDENCE_MODE_LABELS: Record<PresentationV2EvidenceMode, string> = {
  padrao: 'Padrão',
  reforcada: 'Reforçada',
  estrita: 'Estrita',
}

const SLIDE_DENSITY_LABELS: Record<PresentationV2SlideDensity, string> = {
  leve: 'Leve',
  equilibrada: 'Equilibrada',
  densa: 'Densa',
}

function formatMediaRequirementLabel(requirement: PresentationV2MediaRequirement): string {
  switch (requirement) {
    case 'required':
      return 'obrigatória'
    case 'disabled':
      return 'desativada'
    case 'optional':
    default:
      return 'opcional'
  }
}

export interface PresentationV2BriefingPayload {
  slideCount: number
  depth: PresentationV2DepthChoice
  objective: string
  audience: string
  coreMessage: string
  successCriteria: string
  proofObligations: string
  institutionalConstraints: string
  durationMinutes?: number
  slideDensity: PresentationV2SlideDensity
  evidenceMode: PresentationV2EvidenceMode
  tone: string
  visualStyle: string
  outputFormat: string
  multimodal: {
    images: boolean
    audio: boolean
    video: boolean
    charts: boolean
    diagrams: boolean
  }
  mediaRequirements: {
    images: PresentationV2MediaRequirement
    audio: PresentationV2MediaRequirement
    video: PresentationV2MediaRequirement
    charts: PresentationV2MediaRequirement
    diagrams: PresentationV2MediaRequirement
  }
  constraints: string
  sourcePriority: string
  clarificationAnswers: Array<{
    id: string
    question: string
    answer: string
    category?: PresentationV2ClarificationQuestion['category']
  }>
  consolidatedBrief?: string
  clarificationExecutions?: StudioStepExecution[]
}

export function createDefaultPresentationV2BriefingPayload(): PresentationV2BriefingPayload {
  return {
    slideCount: 12,
    depth: 'profunda',
    objective: '',
    audience: '',
    coreMessage: '',
    successCriteria: '',
    proofObligations: '',
    institutionalConstraints: '',
    durationMinutes: 20,
    slideDensity: 'equilibrada',
    evidenceMode: 'reforcada',
    tone: 'profissional, claro e persuasivo',
    visualStyle: 'editorial moderno, limpo, com hierarquia forte',
    outputFormat: 'pptx',
    multimodal: {
      images: true,
      audio: false,
      video: false,
      charts: true,
      diagrams: true,
    },
    mediaRequirements: {
      images: 'optional',
      audio: 'disabled',
      video: 'disabled',
      charts: 'optional',
      diagrams: 'optional',
    },
    constraints: '',
    sourcePriority: '',
    clarificationAnswers: [],
    consolidatedBrief: '',
    clarificationExecutions: [],
  }
}

export function normalizePresentationV2BriefingPayload(
  payload?: Partial<PresentationV2BriefingPayload> | null,
): PresentationV2BriefingPayload {
  const defaults = createDefaultPresentationV2BriefingPayload()
  const next: PresentationV2BriefingPayload = {
    ...defaults,
    ...payload,
    multimodal: {
      ...defaults.multimodal,
      ...(payload?.multimodal || {}),
    },
    mediaRequirements: {
      ...defaults.mediaRequirements,
      ...(payload?.mediaRequirements || {}),
    },
    clarificationAnswers: [...(payload?.clarificationAnswers || [])],
    clarificationExecutions: [...(payload?.clarificationExecutions || [])],
  }

  next.slideCount = Math.max(3, Math.min(60, Number(next.slideCount) || defaults.slideCount))
  next.durationMinutes = typeof next.durationMinutes === 'number' && Number.isFinite(next.durationMinutes)
    ? Math.max(1, next.durationMinutes)
    : undefined

  for (const key of Object.keys(MEDIA_LABELS) as Array<keyof PresentationV2BriefingPayload['multimodal']>) {
    if (next.mediaRequirements[key] === 'disabled') {
      next.multimodal[key] = false
      continue
    }

    if (next.multimodal[key]) {
      next.mediaRequirements[key] = next.mediaRequirements[key] === 'required' ? 'required' : 'optional'
      continue
    }

    next.mediaRequirements[key] = 'disabled'
  }

  return next
}

interface PresentationV2BriefingModalProps {
  open: boolean
  topic: string
  initialPayload?: Partial<PresentationV2BriefingPayload> | null
  onClose: () => void
  onGenerate: (payload: PresentationV2BriefingPayload) => void
  onClarify: (payload: PresentationV2BriefingPayload) => Promise<PresentationV2ClarificationResult>
  onPreflight?: (payload: PresentationV2BriefingPayload) => Promise<PresentationV2PreflightResult>
}

const INPUT_CLASS = 'w-full rounded-xl border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.92)] px-3 py-2 text-sm text-[var(--v2-ink-strong)] outline-none focus:border-[rgba(15,118,110,0.34)] focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]'
const LABEL_CLASS = 'text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]'

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function getQuestionKey(question: PresentationV2ClarificationQuestion, index: number): string {
  return question.id?.trim() || `question-${index + 1}`
}

export function formatPresentationV2BriefingPayload(payload: PresentationV2BriefingPayload): string {
  const multimodal = Object.entries(payload.multimodal)
    .filter(([, enabled]) => enabled)
    .map(([key]) => {
      const typedKey = key as keyof PresentationV2BriefingPayload['multimodal']
      return `${MEDIA_LABELS[typedKey]} (${formatMediaRequirementLabel(payload.mediaRequirements[typedKey])})`
    })
    .join(', ') || 'somente texto estruturado'

  const answers = payload.clarificationAnswers
    .filter(answer => answer.answer.trim())
    .map(answer => `- ${answer.question}\n  Resposta: ${answer.answer.trim()}`)

  return [
    'Briefing estruturado do Gerador de Apresentação v2:',
    `- Quantidade de slides: ${payload.slideCount}`,
    `- Profundidade: ${payload.depth}`,
    payload.durationMinutes ? `- Duração alvo: ${payload.durationMinutes} minutos` : '',
    payload.objective.trim() ? `- Objetivo: ${payload.objective.trim()}` : '',
    payload.audience.trim() ? `- Público: ${payload.audience.trim()}` : '',
    payload.coreMessage.trim() ? `- Tese ou mensagem central: ${payload.coreMessage.trim()}` : '',
    payload.successCriteria.trim() ? `- Critério de sucesso: ${payload.successCriteria.trim()}` : '',
    splitLines(payload.proofObligations).length > 0 ? `- Obrigações de prova:\n${splitLines(payload.proofObligations).map(line => `  - ${line}`).join('\n')}` : '',
    splitLines(payload.institutionalConstraints).length > 0 ? `- Restrições institucionais/visuais:\n${splitLines(payload.institutionalConstraints).map(line => `  - ${line}`).join('\n')}` : '',
    `- Densidade por slide: ${SLIDE_DENSITY_LABELS[payload.slideDensity]}`,
    `- Exigência de evidência: ${EVIDENCE_MODE_LABELS[payload.evidenceMode]}`,
    payload.tone.trim() ? `- Tom: ${payload.tone.trim()}` : '',
    payload.visualStyle.trim() ? `- Estilo visual: ${payload.visualStyle.trim()}` : '',
    `- Formato de saída preferido: ${payload.outputFormat}`,
    `- Modalidades desejadas: ${multimodal}`,
    splitLines(payload.constraints).length > 0 ? `- Restrições:\n${splitLines(payload.constraints).map(line => `  - ${line}`).join('\n')}` : '',
    splitLines(payload.sourcePriority).length > 0 ? `- Prioridade de fontes:\n${splitLines(payload.sourcePriority).map(line => `  - ${line}`).join('\n')}` : '',
    payload.consolidatedBrief?.trim() ? `Briefing consolidado pelo clarificador:\n${payload.consolidatedBrief.trim()}` : '',
    answers.length > 0 ? `Perguntas complementares respondidas:\n${answers.join('\n')}` : '',
  ].filter(Boolean).join('\n')
}

export default function PresentationV2BriefingModal({
  open,
  topic,
  initialPayload,
  onClose,
  onGenerate,
  onClarify,
  onPreflight,
}: PresentationV2BriefingModalProps) {
  const [slideCount, setSlideCount] = useState(12)
  const [depth, setDepth] = useState<PresentationV2DepthChoice>('profunda')
  const [durationMinutes, setDurationMinutes] = useState('20')
  const [objective, setObjective] = useState('')
  const [audience, setAudience] = useState('')
  const [coreMessage, setCoreMessage] = useState('')
  const [successCriteria, setSuccessCriteria] = useState('')
  const [proofObligations, setProofObligations] = useState('')
  const [institutionalConstraints, setInstitutionalConstraints] = useState('')
  const [slideDensity, setSlideDensity] = useState<PresentationV2SlideDensity>('equilibrada')
  const [evidenceMode, setEvidenceMode] = useState<PresentationV2EvidenceMode>('reforcada')
  const [tone, setTone] = useState('profissional, claro e persuasivo')
  const [visualStyle, setVisualStyle] = useState('editorial moderno, limpo, com hierarquia forte')
  const [outputFormat, setOutputFormat] = useState('pptx')
  const [constraints, setConstraints] = useState('')
  const [sourcePriority, setSourcePriority] = useState('')
  const [multimodal, setMultimodal] = useState({
    images: true,
    audio: false,
    video: false,
    charts: true,
    diagrams: true,
  })
  const [mediaRequirements, setMediaRequirements] = useState<PresentationV2BriefingPayload['mediaRequirements']>({
    images: 'optional',
    audio: 'disabled',
    video: 'disabled',
    charts: 'optional',
    diagrams: 'optional',
  })
  const [questions, setQuestions] = useState<PresentationV2ClarificationQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [consolidatedBrief, setConsolidatedBrief] = useState('')
  const [clarificationExecutions, setClarificationExecutions] = useState<StudioStepExecution[]>([])
  const [clarifying, setClarifying] = useState(false)
  const [clarificationError, setClarificationError] = useState('')
  const [clarificationDone, setClarificationDone] = useState(false)
  const [preflight, setPreflight] = useState<PresentationV2PreflightResult | null>(null)
  const [preflighting, setPreflighting] = useState(false)
  const [preflightError, setPreflightError] = useState('')

  const payload = useMemo<PresentationV2BriefingPayload>(() => ({
    slideCount: Math.max(3, Math.min(60, Number(slideCount) || 12)),
    depth,
    objective,
    audience,
    coreMessage,
    successCriteria,
    proofObligations,
    institutionalConstraints,
    durationMinutes: durationMinutes.trim() ? Math.max(1, Number(durationMinutes) || 0) : undefined,
    slideDensity,
    evidenceMode,
    tone,
    visualStyle,
    outputFormat,
    multimodal,
    mediaRequirements,
    constraints,
    sourcePriority,
    clarificationAnswers: questions.map((question, index) => ({
      id: getQuestionKey(question, index),
      question: question.question,
      category: question.category,
      answer: answers[getQuestionKey(question, index)] || '',
    })),
    consolidatedBrief,
    clarificationExecutions,
  }), [answers, audience, clarificationExecutions, consolidatedBrief, constraints, coreMessage, depth, durationMinutes, evidenceMode, institutionalConstraints, mediaRequirements, multimodal, objective, outputFormat, proofObligations, questions, slideCount, slideDensity, sourcePriority, successCriteria, tone, visualStyle])

  const answeredCount = payload.clarificationAnswers.filter(answer => answer.answer.trim()).length
  const unansweredCount = payload.clarificationAnswers.filter(answer => !answer.answer.trim()).length
  const currentQuestion = questions[currentQuestionIndex]
  const currentQuestionKey = currentQuestion ? getQuestionKey(currentQuestion, currentQuestionIndex) : ''
  const currentAnswer = currentQuestionKey ? answers[currentQuestionKey] || '' : ''

  useEffect(() => {
    if (currentQuestionIndex >= questions.length) {
      setCurrentQuestionIndex(Math.max(0, questions.length - 1))
    }
  }, [currentQuestionIndex, questions.length])

  useEffect(() => {
    if (!open) return

    const next = normalizePresentationV2BriefingPayload(initialPayload)
    const nextQuestions = next.clarificationAnswers.map((answer) => ({
      id: answer.id,
      question: answer.question,
      category: answer.category || 'other',
    }))

    setSlideCount(next.slideCount)
    setDepth(next.depth)
    setDurationMinutes(next.durationMinutes ? String(next.durationMinutes) : '')
    setObjective(next.objective)
    setAudience(next.audience)
    setCoreMessage(next.coreMessage)
    setSuccessCriteria(next.successCriteria)
    setProofObligations(next.proofObligations)
    setInstitutionalConstraints(next.institutionalConstraints)
    setSlideDensity(next.slideDensity)
    setEvidenceMode(next.evidenceMode)
    setTone(next.tone)
    setVisualStyle(next.visualStyle)
    setOutputFormat(next.outputFormat)
    setConstraints(next.constraints)
    setSourcePriority(next.sourcePriority)
    setMultimodal(next.multimodal)
    setMediaRequirements(next.mediaRequirements)
    setQuestions(nextQuestions)
    setAnswers(Object.fromEntries(next.clarificationAnswers.map((answer) => [answer.id, answer.answer])))
    setCurrentQuestionIndex(0)
    setConsolidatedBrief(next.consolidatedBrief || '')
    setClarificationExecutions(next.clarificationExecutions || [])
    setClarifying(false)
    setClarificationError('')
    setClarificationDone(Boolean(next.consolidatedBrief?.trim()) || next.clarificationAnswers.length > 0)
    setPreflight(null)
    setPreflighting(false)
    setPreflightError('')
  }, [initialPayload, open])

  useEffect(() => {
    setPreflight(null)
    setPreflightError('')
  }, [audience, constraints, coreMessage, depth, durationMinutes, evidenceMode, institutionalConstraints, mediaRequirements, multimodal, objective, outputFormat, proofObligations, slideCount, slideDensity, sourcePriority, successCriteria, tone, visualStyle])

  const canGenerate = (!onPreflight || Boolean(preflight?.ready))
    && unansweredCount === 0
    && !clarifying
    && !preflighting

  const generationGuardMessage = (() => {
    if (preflight?.blockers.length) {
      return `Resolva ${preflight.blockers.length} bloqueio(s) do preflight antes de iniciar a geração.`
    }
    if (onPreflight && !preflight) {
      return 'Execute o preflight para validar o contrato premium antes de iniciar a trilha multiagente.'
    }
    if (unansweredCount > 0) {
      return `Responda ${unansweredCount} pergunta(s) complementar(es) para consolidar o briefing antes de gerar.`
    }
    return 'Briefing validado e pronto para geração premium.'
  })()

  const handleClarify = async () => {
    setClarifying(true)
    setClarificationError('')
    setClarificationDone(false)
    try {
      const result = await onClarify(payload)
      setQuestions(result.questions || [])
      setAnswers({})
      setCurrentQuestionIndex(0)
      setConsolidatedBrief(result.consolidatedBrief || '')
      setClarificationExecutions(result.executions || [])
      setClarificationDone(true)
    } catch (error) {
      setClarificationError(error instanceof Error ? error.message : String(error))
    } finally {
      setClarifying(false)
    }
  }

  const handlePreflight = async () => {
    if (!onPreflight) return
    setPreflighting(true)
    setPreflightError('')
    try {
      setPreflight(await onPreflight(payload))
    } catch (error) {
      setPreflight(null)
      setPreflightError(error instanceof Error ? error.message : String(error))
    } finally {
      setPreflighting(false)
    }
  }

  const handleGenerateClick = () => {
    if (!canGenerate) return
    onGenerate(payload)
  }

  const toggleModality = (key: keyof PresentationV2BriefingPayload['multimodal']) => {
    const nextEnabled = !multimodal[key]
    setMultimodal(current => ({ ...current, [key]: nextEnabled }))
    setMediaRequirements(current => ({
      ...current,
      [key]: nextEnabled ? (current[key] === 'required' ? 'required' : 'optional') : 'disabled',
    }))
  }

  const updateMediaRequirement = (key: keyof PresentationV2BriefingPayload['mediaRequirements'], value: PresentationV2MediaRequirement) => {
    setMediaRequirements(current => ({ ...current, [key]: value }))
    setMultimodal(current => ({ ...current, [key]: value !== 'disabled' }))
  }

  const updateCurrentAnswer = (value: string) => {
    if (!currentQuestionKey) return
    setAnswers(current => ({ ...current, [currentQuestionKey]: value }))
  }

  const goToNextQuestion = () => {
    setCurrentQuestionIndex(current => Math.min(questions.length - 1, current + 1))
  }

  const goToPreviousQuestion = () => {
    setCurrentQuestionIndex(current => Math.max(0, current - 1))
  }

  return (
    <DraggablePanel
      open={open}
      onClose={onClose}
      title="Gerador de Apresentação v2"
      icon={<Sparkles size={16} />}
      initialWidth={900}
      initialHeight={720}
      minWidth={320}
      minHeight={360}
      startMaximized={false}
    >
      <div className="flex h-full flex-col bg-[var(--v2-panel-strong)]">
        <div className="border-b border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.68)] px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Briefing inteligente</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--v2-ink-strong)]">{topic || 'Nova apresentação'}</h2>
          <p className="mt-1 text-sm text-[var(--v2-ink-soft)]">Defina a narrativa, a profundidade e os assets antes de iniciar a trilha multiagente.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="space-y-4 rounded-2xl border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] p-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-[var(--v2-accent-strong)]" />
                <h3 className="text-sm font-semibold text-[var(--v2-ink-strong)]">Plano do deck</h3>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1">
                  <span className={LABEL_CLASS}>Slides</span>
                  <input className={INPUT_CLASS} type="number" min={3} max={60} value={slideCount} onChange={(event) => setSlideCount(Number(event.target.value))} />
                </label>
                <label className="space-y-1">
                  <span className={LABEL_CLASS}>Profundidade</span>
                  <select className={INPUT_CLASS} value={depth} onChange={(event) => setDepth(event.target.value as PresentationV2DepthChoice)}>
                    <option value="executiva">Executiva</option>
                    <option value="intermediaria">Intermediária</option>
                    <option value="profunda">Profunda</option>
                    <option value="tecnica">Técnica</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className={LABEL_CLASS}>Duração</span>
                  <input className={INPUT_CLASS} type="number" min={1} max={240} value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} />
                </label>
              </div>

              <label className="space-y-1 block">
                <span className={LABEL_CLASS}>Objetivo</span>
                <textarea className={`${INPUT_CLASS} min-h-[82px] resize-y`} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Ex.: convencer sócios sobre a tese, apresentar diagnóstico, treinar equipe..." />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 block">
                  <span className={LABEL_CLASS}>Tese central</span>
                  <textarea className={`${INPUT_CLASS} min-h-[82px] resize-y`} value={coreMessage} onChange={(event) => setCoreMessage(event.target.value)} placeholder="A mensagem que precisa permanecer depois da apresentação." />
                </label>
                <label className="space-y-1 block">
                  <span className={LABEL_CLASS}>Critério de sucesso</span>
                  <textarea className={`${INPUT_CLASS} min-h-[82px] resize-y`} value={successCriteria} onChange={(event) => setSuccessCriteria(event.target.value)} placeholder="Ex.: decisão aprovada, tese entendida, plano aceito, equipe habilitada." />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 block">
                  <span className={LABEL_CLASS}>Obrigações de prova</span>
                  <textarea className={`${INPUT_CLASS} min-h-[82px] resize-y`} value={proofObligations} onChange={(event) => setProofObligations(event.target.value)} placeholder="Quais fatos, provas, números ou fundamentos precisam necessariamente aparecer." />
                </label>
                <label className="space-y-1 block">
                  <span className={LABEL_CLASS}>Restrições institucionais e visuais</span>
                  <textarea className={`${INPUT_CLASS} min-h-[82px] resize-y`} value={institutionalConstraints} onChange={(event) => setInstitutionalConstraints(event.target.value)} placeholder="Ex.: sem cores saturadas, sem humor, aderência à linguagem institucional, preservar confidencialidade." />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className={LABEL_CLASS}>Público</span>
                  <input className={INPUT_CLASS} value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Ex.: diretoria, cliente, banca, equipe jurídica" />
                </label>
                <label className="space-y-1">
                  <span className={LABEL_CLASS}>Formato</span>
                  <select className={INPUT_CLASS} value={outputFormat} onChange={(event) => setOutputFormat(event.target.value)}>
                    <option value="pptx">PPTX</option>
                    <option value="pdf">PDF</option>
                    <option value="web">Web</option>
                    <option value="images">Imagens</option>
                    <option value="mixed">Misto</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className={LABEL_CLASS}>Tom</span>
                  <input className={INPUT_CLASS} value={tone} onChange={(event) => setTone(event.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className={LABEL_CLASS}>Estilo visual</span>
                  <input className={INPUT_CLASS} value={visualStyle} onChange={(event) => setVisualStyle(event.target.value)} />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className={LABEL_CLASS}>Densidade por slide</span>
                  <select className={INPUT_CLASS} value={slideDensity} onChange={(event) => setSlideDensity(event.target.value as PresentationV2SlideDensity)}>
                    <option value="leve">Leve</option>
                    <option value="equilibrada">Equilibrada</option>
                    <option value="densa">Densa</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className={LABEL_CLASS}>Exigência de evidência</span>
                  <select className={INPUT_CLASS} value={evidenceMode} onChange={(event) => setEvidenceMode(event.target.value as PresentationV2EvidenceMode)}>
                    <option value="padrao">Padrão</option>
                    <option value="reforcada">Reforçada</option>
                    <option value="estrita">Estrita</option>
                  </select>
                </label>
              </div>

              <div>
                <p className={LABEL_CLASS}>Assets multimodais</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {([
                    ['images', 'Imagens'],
                    ['charts', 'Gráficos'],
                    ['diagrams', 'Diagramas'],
                    ['audio', 'Áudio'],
                    ['video', 'Vídeo'],
                  ] as const).map(([key, label]) => {
                    const active = multimodal[key]
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleModality(key)}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${active ? 'border-[rgba(15,118,110,0.35)] bg-[rgba(15,118,110,0.10)] text-[var(--v2-accent-strong)]' : 'border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.82)] text-[var(--v2-ink-soft)]'}`}
                      >
                        {active ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> : null}{label}
                      </button>
                    )
                  })}
                </div>
                {Object.entries(multimodal).some(([, enabled]) => enabled) && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {(Object.entries(multimodal) as Array<[keyof PresentationV2BriefingPayload['multimodal'], boolean]>).filter(([, enabled]) => enabled).map(([key]) => (
                      <label key={`${key}-requirement`} className="space-y-1">
                        <span className={LABEL_CLASS}>{MEDIA_LABELS[key]} no preflight</span>
                        <select className={INPUT_CLASS} value={mediaRequirements[key]} onChange={(event) => updateMediaRequirement(key, event.target.value as PresentationV2MediaRequirement)}>
                          <option value="optional">Opcional</option>
                          <option value="required">Obrigatória</option>
                        </select>
                      </label>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[11px] leading-5 text-[var(--v2-ink-faint)]">
                  Marque como obrigatória apenas a mídia que realmente precisa ser materializada. O preflight bloqueia ausência de provedor ou modelo somente para itens obrigatórios.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className={LABEL_CLASS}>Restrições</span>
                  <textarea className={`${INPUT_CLASS} min-h-[90px] resize-y`} value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="Uma por linha" />
                </label>
                <label className="space-y-1">
                  <span className={LABEL_CLASS}>Prioridade de fontes</span>
                  <textarea className={`${INPUT_CLASS} min-h-[90px] resize-y`} value={sourcePriority} onChange={(event) => setSourcePriority(event.target.value)} placeholder="Uma por linha" />
                </label>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-[var(--v2-accent-strong)]" />
                    <h3 className="text-sm font-semibold text-[var(--v2-ink-strong)]">Perguntas complementares</h3>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[var(--v2-ink-soft)]">O clarificador v2 pode pedir só o que muda o resultado final.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {onPreflight && (
                    <button type="button" onClick={() => void handlePreflight()} disabled={preflighting} className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                      {preflighting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Preflight
                    </button>
                  )}
                  <button type="button" onClick={() => void handleClarify()} disabled={clarifying} className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                    {clarifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Analisar
                  </button>
                </div>
              </div>

              {preflightError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertCircle className="mr-1 inline h-3.5 w-3.5" />{preflightError}
                </div>
              )}

              {preflight && (
                <div className={`rounded-xl border px-3 py-3 text-xs ${preflight.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-rose-200 bg-rose-50 text-rose-950'}`}>
                  <div className="flex items-center gap-2 font-semibold">
                    {preflight.ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                    {preflight.ready ? 'Pronto para gerar' : 'Ajustes necessários'} · {preflight.estimatedSteps} etapas + {preflight.estimatedMediaTasks} tarefa(s) multimodal(is)
                  </div>
                  <div className="mt-2 rounded-lg border border-current/15 bg-white/55 px-2.5 py-2">
                    <p className="font-semibold">Custo conhecido estimado: {preflight.estimatedCost.label}</p>
                    <p className="mt-1 opacity-80">Texto: ${preflight.estimatedCost.knownTextUsdMin.toFixed(4)}-${preflight.estimatedCost.knownTextUsdMax.toFixed(4)} · Mídia conhecida: ${preflight.estimatedCost.knownMediaUsdMin.toFixed(4)}-${preflight.estimatedCost.knownMediaUsdMax.toFixed(4)}</p>
                    {preflight.estimatedCost.unknownCostItems.length > 0 && (
                      <p className="mt-1 text-amber-900">Custos fora da tabela local: {preflight.estimatedCost.unknownCostItems.slice(0, 2).join(' · ')}</p>
                    )}
                    <p className="mt-1 opacity-75">{preflight.estimatedCost.assumptions[0]}</p>
                  </div>
                  <div className="mt-2 space-y-1">
                    {preflight.checks.slice(0, 6).map((check, index) => (
                      <p key={`${check.label}-${index}`}>
                        <strong>{check.label}:</strong> {check.detail}
                      </p>
                    ))}
                  </div>
                  {preflight.blockers.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {preflight.blockers.slice(0, 3).map((blocker, index) => <p key={index}>Bloqueio: {blocker}</p>)}
                    </div>
                  )}
                  {preflight.warnings.length > 0 && (
                    <div className="mt-2 space-y-1 text-amber-900">
                      {preflight.warnings.slice(0, 3).map((warning, index) => <p key={index}>Aviso: {warning}</p>)}
                    </div>
                  )}
                </div>
              )}

              {clarificationError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertCircle className="mr-1 inline h-3.5 w-3.5" />{clarificationError}
                </div>
              )}

              {clarificationDone && questions.length === 0 && !clarificationError && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Briefing suficiente para iniciar a geração.
                </div>
              )}

              {questions.length > 0 && currentQuestion ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.88)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">
                        Pergunta {currentQuestionIndex + 1} de {questions.length}
                      </span>
                      <span className="rounded-full bg-[rgba(15,118,110,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v2-accent-strong)]">
                        {answeredCount}/{questions.length} respondidas
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgba(15,23,42,0.08)]">
                      <div
                        className="h-full rounded-full bg-[var(--v2-accent-strong)] transition-all"
                        style={{ width: `${Math.round(((currentQuestionIndex + 1) / questions.length) * 100)}%` }}
                      />
                    </div>

                    <div className="mt-4">
                      <p className="text-sm font-semibold leading-6 text-[var(--v2-ink-strong)]">{currentQuestion.question}</p>
                      {currentQuestion.rationale && <p className="mt-1 text-xs leading-5 text-[var(--v2-ink-faint)]">{currentQuestion.rationale}</p>}
                    </div>

                    {currentQuestion.options && currentQuestion.options.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {currentQuestion.options.map(option => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => updateCurrentAnswer(option)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${currentAnswer === option ? 'border-[rgba(15,118,110,0.35)] bg-[rgba(15,118,110,0.12)] text-[var(--v2-accent-strong)]' : 'border-[var(--v2-line-soft)] bg-white/75 text-[var(--v2-ink-soft)]'}`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}

                    <textarea
                      className={`${INPUT_CLASS} mt-3 min-h-[96px] resize-y`}
                      value={currentAnswer}
                      onChange={(event) => updateCurrentAnswer(event.target.value)}
                      placeholder={currentQuestion.suggestedAnswer || 'Resposta livre'}
                    />

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={goToPreviousQuestion}
                        disabled={currentQuestionIndex === 0}
                        className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ArrowLeft className="h-4 w-4" /> Anterior
                      </button>
                      <div className="flex flex-wrap gap-2">
                        {currentQuestion.suggestedAnswer && (
                          <button type="button" onClick={() => updateCurrentAnswer(currentQuestion.suggestedAnswer || '')} className="v2-btn-secondary">
                            <Sparkles className="h-4 w-4" /> Usar sugestão
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={goToNextQuestion}
                          disabled={currentQuestionIndex === questions.length - 1}
                          className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Próxima <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.62)] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Histórico compacto</p>
                    {payload.clarificationAnswers.some(answer => answer.answer.trim()) ? (
                      <div className="mt-2 space-y-2">
                        {payload.clarificationAnswers.filter(answer => answer.answer.trim()).slice(0, 4).map(answer => (
                          <div key={answer.id} className="rounded-lg bg-white/70 px-2.5 py-2">
                            <p className="truncate text-[11px] font-semibold text-[var(--v2-ink-strong)]">{answer.question}</p>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--v2-ink-soft)]">{answer.answer}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-[var(--v2-ink-faint)]">As respostas aparecerão aqui para manter o briefing rastreável.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.55)] px-4 py-8 text-center text-sm text-[var(--v2-ink-faint)]">
                  Nenhuma pergunta carregada.
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] px-5 py-4">
          <div>
            <p className="text-xs text-[var(--v2-ink-soft)]">{answeredCount} resposta(s) complementar(es) anexada(s) ao briefing.</p>
            <p className={`mt-1 text-xs ${canGenerate ? 'text-emerald-700' : 'text-[var(--v2-ink-soft)]'}`}>{generationGuardMessage}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onClose} className="v2-btn-secondary">Cancelar</button>
            <button type="button" onClick={handleGenerateClick} disabled={!canGenerate} className="v2-btn-primary disabled:cursor-not-allowed disabled:opacity-50">
              <Sparkles className="h-4 w-4" /> Iniciar geração v2
            </button>
          </div>
        </div>
      </div>
    </DraggablePanel>
  )
}
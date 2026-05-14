import {
  createDefaultPresentationV2BriefingPayload,
  type PresentationV2BriefingPayload,
} from '../../components/PresentationV2BriefingModal'
import type { PresentationV2Deck } from '../../lib/firestore-types'

const PRESENTATION_V2_DEPTH_VALUES = new Set<PresentationV2BriefingPayload['depth']>(['executiva', 'intermediaria', 'profunda', 'tecnica'])

const PRESENTATION_V2_REPAIR_AGENT_LABELS: Record<string, string> = {
  presentation_v2_slide_writer: 'Redator de Slides',
  presentation_v2_content_architect: 'Arquiteto de Conteúdo',
  presentation_v2_visual_director: 'Diretor Visual',
  presentation_v2_data_diagrammer: 'Dados e Diagramas',
  presentation_v2_image_generator: 'Gerador de Imagens',
  presentation_v2_reviewer: 'Revisor Multimodal',
}

export interface PresentationV2BriefingSeedOptions {
  focusSlideNumber?: number
  focusAction?: 'briefing' | 'visual' | 'audio' | 'video'
  focusReason?: string
}

function splitPresentationV2BriefingSeedLines(value?: string) {
  return (value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function resolvePresentationV2BriefingSeedAnswer(
  clarifications: PresentationV2Deck['generationSpec']['clarifications'],
  pattern: RegExp,
) {
  return clarifications?.find((entry) => pattern.test(entry.question))?.answer?.trim() || ''
}

function formatPresentationV2RepairAgentLabel(agentId: string) {
  return PRESENTATION_V2_REPAIR_AGENT_LABELS[agentId]
    || agentId.replace(/^presentation_v2_/, '').replace(/_/g, ' ')
}

function uniquePresentationV2BriefingSeedLines(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function formatPresentationV2FocusAction(action?: PresentationV2BriefingSeedOptions['focusAction']) {
  switch (action) {
    case 'visual':
      return 'reparo visual/materializacao de assets'
    case 'audio':
      return 'reparo de narracao/audio'
    case 'video':
      return 'reparo de clipes/video'
    case 'briefing':
    default:
      return 'reparo de briefing, roteiro, estrutura ou fala'
  }
}

function buildPresentationV2RepairFocusLines(deck: PresentationV2Deck, options: PresentationV2BriefingSeedOptions = {}) {
  const deckRubric = deck.quality?.deckRubric
  const slideRubric = deck.quality?.slideRubric || []
  const multimodalSlides = deck.quality?.multimodalAudit?.slides || []
  const exportReadiness = deck.quality?.exportReadiness
  const repairSlideNumbers = Array.from(new Set([
    ...(deckRubric?.repairableSlides || []),
    ...slideRubric
      .filter((entry) => entry.status !== 'ok' || (entry.warnings?.length ?? 0) > 0 || (entry.repairHints?.length ?? 0) > 0)
      .map((entry) => entry.slideNumber),
    ...multimodalSlides
      .filter((entry) => entry.status !== 'ok' || (entry.warnings?.length ?? 0) > 0)
      .map((entry) => entry.slideNumber),
  ])).sort((left, right) => left - right)

  if (repairSlideNumbers.length === 0 && !options.focusSlideNumber && !exportReadiness?.blockingIssues?.length && !exportReadiness?.warnings?.length) {
    return []
  }

  const orderedRepairSlideNumbers = options.focusSlideNumber
    ? [
        options.focusSlideNumber,
        ...repairSlideNumbers.filter((slideNumber) => slideNumber !== options.focusSlideNumber),
      ]
    : repairSlideNumbers

  const lines: string[] = [
    'Foco de reparo desta regeneração: preserve a intenção geral do deck atual e corrija apenas as pendências priorizadas abaixo.',
  ]

  if (options.focusSlideNumber) {
    lines.push(`Comando do operador: priorize o Slide ${options.focusSlideNumber} (${formatPresentationV2FocusAction(options.focusAction)}).`)
    if (options.focusReason?.trim()) {
      lines.push(`Motivo do operador para o Slide ${options.focusSlideNumber}: ${options.focusReason.trim()}`)
    }
  }

  if (typeof deckRubric?.score === 'number' || deckRubric?.status) {
    lines.push(`Rubrica atual do deck: ${deckRubric.score ?? 'sem score'}/100 (${deckRubric.status || 'sem status'}).`)
  }
  for (const warning of deckRubric?.warnings?.slice(0, 3) || []) {
    lines.push(`Pendência global da rubrica: ${warning}`)
  }

  for (const slideNumber of orderedRepairSlideNumbers.slice(0, 6)) {
    const slide = deck.slides.find((item) => item.number === slideNumber)
    const rubric = slideRubric.find((entry) => entry.slideNumber === slideNumber)
    const multimodal = multimodalSlides.find((entry) => entry.slideNumber === slideNumber)
    const agents = uniquePresentationV2BriefingSeedLines([
      ...(rubric?.recommendedAgents || []),
    ].map(formatPresentationV2RepairAgentLabel))
    const findings = uniquePresentationV2BriefingSeedLines([
      ...(rubric?.repairHints || []),
      ...(rubric?.warnings || []),
      ...(multimodal?.warnings || []),
    ]).slice(0, 4)
    const scoreParts = [
      typeof rubric?.score === 'number' ? `rubrica ${rubric.score}/100` : '',
      typeof multimodal?.score === 'number' ? `multimodal ${multimodal.score}/100` : '',
    ].filter(Boolean).join('; ')
    const slideLabel = slide?.title ? `Slide ${slideNumber} (${slide.title})` : `Slide ${slideNumber}`

    lines.push(`${slideLabel}: ${scoreParts || 'reparo recomendado pelo manifesto atual'}.`)
    if (findings.length > 0) lines.push(`Ajustes do ${slideLabel}: ${findings.join(' | ')}`)
    if (agents.length > 0) lines.push(`Agentes sugeridos para ${slideLabel}: ${agents.join(', ')}.`)
  }

  for (const issue of [
    ...(exportReadiness?.blockingIssues || []),
    ...(exportReadiness?.warnings || []),
    ...(exportReadiness?.accessibilityNotes || []),
    ...(exportReadiness?.legalAccuracyNotes || []),
  ].slice(0, 5)) {
    lines.push(`Gate de exportação: ${issue}`)
  }

  const latestRepair = [...(deck.revisionHistory || [])]
    .reverse()
    .find((entry) => entry.repairKind || entry.repairAgent || entry.slideNumbers?.length)
  if (latestRepair?.summary) {
    lines.push(`Última intervenção registrada: ${latestRepair.summary}`)
  }

  return uniquePresentationV2BriefingSeedLines(lines)
}

export function buildPresentationV2BriefingSeedFromDeck(
  deck: PresentationV2Deck,
  options: PresentationV2BriefingSeedOptions = {},
): PresentationV2BriefingPayload {
  const defaults = createDefaultPresentationV2BriefingPayload()
  const clarifications = deck.generationSpec.clarifications || []
  const repairFocusLines = buildPresentationV2RepairFocusLines(deck, options)
  const institutionalConstraints = Array.from(new Set([
    ...splitPresentationV2BriefingSeedLines(resolvePresentationV2BriefingSeedAnswer(clarifications, /restri[cç].*(institucional|visual)|visual|institucional/i)),
    ...(deck.theme.accessibilityNotes || []),
  ])).join('\n')
  const multimodal = {
    ...defaults.multimodal,
    ...(deck.generationSpec.multimodal || {}),
  }
  const mediaRequirements = {
    ...defaults.mediaRequirements,
    images: multimodal.images ? 'optional' : 'disabled',
    audio: multimodal.audio ? 'optional' : 'disabled',
    video: multimodal.video ? 'optional' : 'disabled',
    charts: multimodal.charts ? 'optional' : 'disabled',
    diagrams: multimodal.diagrams ? 'optional' : 'disabled',
  } satisfies PresentationV2BriefingPayload['mediaRequirements']

  return {
    ...defaults,
    slideCount: deck.generationSpec.slideCount || deck.slides.length || defaults.slideCount,
    depth: PRESENTATION_V2_DEPTH_VALUES.has(deck.generationSpec.depth as PresentationV2BriefingPayload['depth'])
      ? deck.generationSpec.depth as PresentationV2BriefingPayload['depth']
      : defaults.depth,
    objective: deck.generationSpec.objective || '',
    audience: deck.generationSpec.audience || resolvePresentationV2BriefingSeedAnswer(clarifications, /p[úu]blico|audi[eê]ncia/i),
    coreMessage: resolvePresentationV2BriefingSeedAnswer(clarifications, /mensagem central|tese/i),
    proofObligations: resolvePresentationV2BriefingSeedAnswer(clarifications, /obriga[cç][aã]o.*prova|provas?|evid[eê]n/i),
    institutionalConstraints,
    durationMinutes: deck.generationSpec.durationMinutes ?? defaults.durationMinutes,
    successCriteria: resolvePresentationV2BriefingSeedAnswer(clarifications, /crit[eé]rio de sucesso|sucesso/i)
      || (repairFocusLines.length > 0 ? 'Regeneração deve resolver as pendências priorizadas no manifesto atual sem descaracterizar o deck aprovado.' : ''),
    tone: deck.generationSpec.tone || defaults.tone,
    visualStyle: deck.generationSpec.visualStyle || deck.theme.mood || defaults.visualStyle,
    outputFormat: deck.generationSpec.outputFormat || deck.exportHints?.preferredExport || defaults.outputFormat,
    multimodal,
    mediaRequirements,
    constraints: uniquePresentationV2BriefingSeedLines([
      ...(deck.generationSpec.constraints || []),
      ...repairFocusLines,
    ]).join('\n'),
    sourcePriority: (deck.generationSpec.sourcePriority || []).join('\n') || resolvePresentationV2BriefingSeedAnswer(clarifications, /fontes?|prioridade/i),
    clarificationAnswers: [
      ...clarifications.map((entry) => ({
        id: entry.id,
        question: entry.question,
        answer: entry.answer,
        category: entry.category,
      })),
      ...(repairFocusLines.length > 0
        ? [{
            id: 'presentation-v2-regenerate-repair-focus',
            question: 'Qual é o foco de reparo desta regeneração?',
            answer: repairFocusLines.join('\n'),
            category: 'constraints' as const,
          }]
        : []),
    ],
    consolidatedBrief: '',
    clarificationExecutions: [],
  }
}
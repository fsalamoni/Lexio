/**
 * Artifact Exporters — format-specific export utilities for each artifact type.
 *
 * These are lightweight, browser-side exports that avoid heavy dependencies.
 * Uses Blob + URL.createObjectURL for downloads.
 */

import type {
  ParsedPresentation,
  ParsedFlashcards,
  ParsedQuiz,
  ParsedDataTable,
  ParsedAudioScript,
  ParsedVideoScript,
  ParsedPresentationV2,
} from './artifact-parsers'
import type PptxGenJS from 'pptxgenjs'
import { auditPresentationV2ExportReadiness } from '../../lib/presentation-generation-pipeline-v2'

type PptxInstance = InstanceType<typeof PptxGenJS>
type PptxSlide = ReturnType<PptxInstance['addSlide']>

// ── Download helper ─────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function downloadText(content: string, filename: string, mimeType = 'text/plain') {
  downloadBlob(new Blob([content], { type: `${mimeType};charset=utf-8` }), filename)
}

function dataUrlToBlob(url: string): Blob {
  const match = url.match(/^data:([^;,]+)?((?:;[^,]+)*),(.*)$/)
  if (!match) {
    throw new Error('Data URL inválida para exportação de mídia.')
  }

  const mimeType = match[1] || 'application/octet-stream'
  const metadata = match[2] || ''
  const payload = match[3] || ''

  if (metadata.includes(';base64')) {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new Blob([bytes], { type: mimeType })
  }

  return new Blob([decodeURIComponent(payload)], { type: mimeType })
}

async function fetchUrlAsBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) return dataUrlToBlob(url)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Falha ao baixar mídia (${response.status})`)
  }
  return response.blob()
}

function inferExtensionFromBlob(blob: Blob, fallback: string): string {
  const type = blob.type.toLowerCase()
  if (type.includes('image/png')) return '.png'
  if (type.includes('image/jpeg')) return '.jpg'
  if (type.includes('image/webp')) return '.webp'
  if (type.includes('audio/mpeg')) return '.mp3'
  if (type.includes('audio/wav')) return '.wav'
  if (type.includes('audio/ogg')) return '.ogg'
  if (type.includes('video/mp4')) return '.mp4'
  if (type.includes('video/webm')) return '.webm'
  return fallback
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value))))
}

// ── Markdown export (universal fallback) ────────────────────────────────────

export function exportAsMarkdown(content: string, filename: string) {
  downloadText(content, `${filename}.md`, 'text/markdown')
}

export async function exportFileFromUrl(url: string, filename: string, fallbackExtension = '') {
  const blob = await fetchUrlAsBlob(url)
  const extension = inferExtensionFromBlob(blob, fallbackExtension)
  downloadBlob(blob, `${filename}${extension}`)
}

export async function exportPresentationImagesAsZip(data: ParsedPresentation, filename: string) {
  const slideImages = data.slides.filter(slide => slide.renderedImageUrl)
  if (slideImages.length === 0) {
    throw new Error('Nenhum slide visual gerado para exportar.')
  }

  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  await Promise.all(slideImages.map(async (slide) => {
    const blob = await fetchUrlAsBlob(slide.renderedImageUrl!)
    const extension = inferExtensionFromBlob(blob, '.png')
    zip.file(`slide-${String(slide.number).padStart(2, '0')}${extension}`, blob)
  }))

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, `${filename}_slides.zip`)
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Falha ao converter mídia para data URL.'))
    reader.readAsDataURL(blob)
  })
}

function findPresentationV2StructuredAssetUrl(deckSlide: ParsedPresentationV2['deck']['slides'][number] | undefined): string | undefined {
  return deckSlide?.assets?.find(asset => (
    (asset.type === 'chart' || asset.type === 'diagram')
    && asset.url
  ))?.url
}

function findPresentationV2LayoutFamily(deck: ParsedPresentationV2['deck'], slideNumber: number) {
  return deck.theme.designSystem?.layoutFamilies?.find(family => family.slideNumbers.includes(slideNumber))
}

export function summarizePresentationV2DesignSystem(deck: ParsedPresentationV2['deck']) {
  const designSystem = deck.theme.designSystem
  const layoutFamilies = designSystem?.layoutFamilies || []
  return {
    narrativeMode: designSystem?.narrativeMode || 'não definido',
    surfaceStyle: designSystem?.surfaceStyle || 'não definido',
    contrastStrategy: designSystem?.contrastStrategy || 'não definido',
    accentStrategy: designSystem?.accentStrategy || 'não definido',
    hierarchyRules: (designSystem?.hierarchyRules || []).slice(0, 4),
    layoutFamilies: layoutFamilies.map((family) => `${family.label} (${family.slideNumbers.join(', ')})`),
  }
}

export function summarizePresentationV2ExportReadiness(data: ParsedPresentationV2) {
  const exportReadinessSnapshot = data.deck.quality?.exportReadiness
  const inferredReadiness = auditPresentationV2ExportReadiness({
    ...data.deck,
    assets: data.assets,
  })
  const snapshotScore = typeof exportReadinessSnapshot?.score === 'number'
    ? exportReadinessSnapshot.score
    : null
  const inferredScore = typeof inferredReadiness.score === 'number'
    ? inferredReadiness.score
    : null
  const snapshotAltTextCoverage = typeof exportReadinessSnapshot?.altTextCoverage === 'number'
    ? exportReadinessSnapshot.altTextCoverage
    : null
  const inferredAltTextCoverage = typeof inferredReadiness.altTextCoverage === 'number'
    ? inferredReadiness.altTextCoverage
    : null
  const accessibilityNotes = uniqueStrings([
    ...(exportReadinessSnapshot?.accessibilityNotes || []),
    ...(inferredReadiness.accessibilityNotes || []),
    ...(data.deck.quality?.accessibility || []),
  ]).slice(0, 4)
  const legalAccuracyNotes = uniqueStrings([
    ...(exportReadinessSnapshot?.legalAccuracyNotes || []),
    ...(inferredReadiness.legalAccuracyNotes || []),
    ...(data.deck.quality?.legalAccuracyNotes || []),
  ]).slice(0, 4)
  const blockingIssues = uniqueStrings([
    ...(exportReadinessSnapshot?.blockingIssues || []),
    ...(inferredReadiness.blockingIssues || []),
    exportReadinessSnapshot?.status === 'critical' && !(inferredReadiness.blockingIssues || []).length
      ? 'Manifesto v2 ainda sinaliza exportação crítica; revise as pendências antes de exportar.'
      : null,
  ])
  const warnings = uniqueStrings([
    ...blockingIssues,
    ...(exportReadinessSnapshot?.warnings || []),
    ...(inferredReadiness.warnings || []),
    ...accessibilityNotes,
    ...legalAccuracyNotes,
  ])
  const altTextCoverage = snapshotAltTextCoverage != null && inferredAltTextCoverage != null
    ? Math.min(snapshotAltTextCoverage, inferredAltTextCoverage)
    : snapshotAltTextCoverage ?? inferredAltTextCoverage ?? 100
  const visualAssetCount = Math.max(
    exportReadinessSnapshot?.visualAssetCount ?? 0,
    inferredReadiness.visualAssetCount ?? 0,
  )
  const missingAltTextAssets = uniqueStrings([
    ...(exportReadinessSnapshot?.missingAltTextAssets || []),
    ...(inferredReadiness.missingAltTextAssets || []),
  ])
  const score = snapshotScore != null && inferredScore != null
    ? Math.min(snapshotScore, inferredScore)
    : snapshotScore ?? inferredScore

  return {
    score,
    status: blockingIssues.length > 0 || exportReadinessSnapshot?.status === 'critical' || inferredReadiness.status === 'critical'
      ? 'critical' as const
      : exportReadinessSnapshot?.status === 'review' || inferredReadiness.status === 'review'
        ? 'review' as const
        : warnings.length > 0
          ? 'review' as const
          : 'ok' as const,
    canExportPptx: blockingIssues.length === 0 && exportReadinessSnapshot?.status !== 'critical' && inferredReadiness.status !== 'critical',
    visualAssetCount,
    altTextCoverage,
    missingAltTextAssets,
    blockingIssues,
    accessibilityNotes,
    legalAccuracyNotes,
    warnings,
  }
}

export function formatPresentationV2ExportGateLabel(
  exportReadiness: ReturnType<typeof summarizePresentationV2ExportReadiness>,
): string {
  if (!exportReadiness.canExportPptx) return 'BLOQUEADO'
  return exportReadiness.status === 'review' ? 'LIBERADO COM REVISÃO' : 'LIBERADO'
}

export function formatPresentationV2StatusLabel(
  status: string | undefined,
  options: { okLabel?: string; fallbackLabel?: string } = {},
): string {
  const normalized = String(status || '').trim().toLowerCase()
  switch (normalized) {
    case 'ok':
      return options.okLabel || 'ok'
    case 'review':
      return 'em revisão'
    case 'critical':
      return 'crítico'
    case 'repair':
      return 'em reparo'
    default:
      return status?.trim() || options.fallbackLabel || options.okLabel || 'não informado'
  }
}

export function formatPresentationV2ExportStatusLabel(
  exportReadiness: ReturnType<typeof summarizePresentationV2ExportReadiness>,
): string {
  return formatPresentationV2StatusLabel(exportReadiness.status, {
    okLabel: 'liberado',
    fallbackLabel: 'em revisão',
  })
}

function isActionablePresentationV2ExportIssue(value: string): boolean {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  return /\brevis|\bvalid|\bfalt|\bbloque|\bpend|\brisco\b|\balert|\bajust|\bexig|\bincons|\binsuf|\brasa|\borfa|\bainda\b|\bmaterializ|\brefin|\breparo|\bnao\b|\bcritic[ao]\b|\bsem alt text\b|\bsem fontes\b|\bsem restric/.test(normalized)
}

function findFirstActionablePresentationV2ExportIssue(values: string[]): string {
  return values.find(isActionablePresentationV2ExportIssue) || ''
}

export function resolvePresentationV2PrimaryExportIssue(
  exportReadiness: ReturnType<typeof summarizePresentationV2ExportReadiness>,
): string {
  const exportReadinessMessages = splitPresentationV2ExportReadinessMessages(exportReadiness)
  return exportReadinessMessages.blockingIssues[0]
    || findFirstActionablePresentationV2ExportIssue(exportReadinessMessages.accessibilityNotes)
    || findFirstActionablePresentationV2ExportIssue(exportReadinessMessages.legalAccuracyNotes)
    || findFirstActionablePresentationV2ExportIssue(exportReadinessMessages.warnings)
    || ''
}

export function removePresentationV2PrimaryExportIssueFromBuckets(
  exportReadinessMessages: ReturnType<typeof splitPresentationV2ExportReadinessMessages>,
  primaryIssue: string,
) {
  const normalizedPrimaryIssue = primaryIssue.trim()
  if (!normalizedPrimaryIssue || exportReadinessMessages.blockingIssues.includes(normalizedPrimaryIssue)) {
    return exportReadinessMessages
  }

  return {
    ...exportReadinessMessages,
    accessibilityNotes: exportReadinessMessages.accessibilityNotes.filter(note => note !== normalizedPrimaryIssue),
    legalAccuracyNotes: exportReadinessMessages.legalAccuracyNotes.filter(note => note !== normalizedPrimaryIssue),
    warnings: exportReadinessMessages.warnings.filter(warning => warning !== normalizedPrimaryIssue),
  }
}

export function splitPresentationV2ExportReadinessMessages(
  exportReadiness: ReturnType<typeof summarizePresentationV2ExportReadiness>,
) {
  const blockingIssues = uniqueStrings(exportReadiness.blockingIssues || [])
  const accessibilityNotes = uniqueStrings((exportReadiness.accessibilityNotes || []).filter(note => !blockingIssues.includes(note)))
  const legalAccuracyNotes = uniqueStrings((exportReadiness.legalAccuracyNotes || []).filter(note => !blockingIssues.includes(note)))
  const warnings = uniqueStrings((exportReadiness.warnings || []).filter(warning => (
    !blockingIssues.includes(warning)
    && !accessibilityNotes.includes(warning)
    && !legalAccuracyNotes.includes(warning)
  )))

  return {
    blockingIssues,
    accessibilityNotes,
    legalAccuracyNotes,
    warnings,
  }
}

export function resolvePresentationV2SlideChrome(layoutFamilyId?: string) {
  switch ((layoutFamilyId || '').toLowerCase()) {
    case 'hero':
      return {
        title: { x: 0.72, y: 0.72, w: 7.2, h: 0.92, fontSize: 27 },
        contentPanel: { x: 0.72, y: 1.72, w: 5.75, h: 4.75 },
        bulletText: { x: 1.02, y: 2.08, w: 5.08, h: 3.92, fontSize: 15.4 },
        sidePanel: { x: 6.85, y: 1.28, w: 5.65, h: 5.2 },
        sideText: { x: 7.18, y: 1.72, w: 4.95, h: 3.95, fontSize: 12.2 },
      }
    case 'evidence':
      return {
        title: { x: 0.68, y: 0.58, w: 8.5, h: 0.72, fontSize: 24 },
        contentPanel: { x: 0.68, y: 1.52, w: 5.1, h: 5.05 },
        bulletText: { x: 0.96, y: 1.9, w: 4.52, h: 4.18, fontSize: 14.2 },
        sidePanel: { x: 6.05, y: 1.35, w: 6.05, h: 5.25 },
        sideText: { x: 6.38, y: 4.32, w: 5.38, h: 1.62, fontSize: 9.6 },
      }
    case 'split':
      return {
        title: { x: 0.7, y: 0.58, w: 8.1, h: 0.68, fontSize: 24 },
        contentPanel: { x: 0.7, y: 1.55, w: 7.0, h: 4.85 },
        bulletText: { x: 1.05, y: 1.96, w: 6.25, h: 3.9, fontSize: 16.2 },
        sidePanel: { x: 8.05, y: 1.55, w: 4.45, h: 4.85 },
        sideText: { x: 8.38, y: 1.95, w: 3.82, h: 2.1, fontSize: 13.2 },
      }
    default:
      return {
        title: { x: 0.76, y: 0.64, w: 8.3, h: 0.72, fontSize: 25 },
        contentPanel: { x: 0.76, y: 1.55, w: 6.45, h: 4.95 },
        bulletText: { x: 1.08, y: 1.98, w: 5.78, h: 4.02, fontSize: 15.2 },
        sidePanel: { x: 7.62, y: 1.55, w: 4.86, h: 4.95 },
        sideText: { x: 7.96, y: 1.95, w: 4.12, h: 2.2, fontSize: 12.4 },
      }
  }
}

export async function exportPresentationAsPptx(data: ParsedPresentation, filename: string) {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Lexio'
  pptx.company = 'Lexio'
  pptx.subject = data.title || filename
  pptx.title = data.title || filename
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  }

  for (const slideData of data.slides) {
    const slide = pptx.addSlide()
    slide.background = { color: 'F8FAFC' }

    if (slideData.renderedImageUrl) {
      const blob = await fetchUrlAsBlob(slideData.renderedImageUrl)
      const imageData = await blobToDataUrl(blob)
      slide.addImage({ data: imageData, x: 0, y: 0, w: 13.333, h: 7.5 })
    } else {
      slide.addText(slideData.title, {
        x: 0.6,
        y: 0.45,
        w: 12.1,
        h: 0.7,
        fontFace: 'Aptos Display',
        fontSize: 24,
        bold: true,
        color: '0F172A',
        margin: 0,
      })

      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.6,
        y: 1.35,
        w: 12.1,
        h: 4.9,
        rectRadius: 0.12,
        fill: { color: 'FFFFFF' },
        line: { color: 'DBEAFE', pt: 1.2 },
      })

      const bulletRuns = slideData.bullets.length > 0
        ? slideData.bullets.map(bullet => ({ text: bullet, options: { bullet: { indent: 14 } } }))
        : [{ text: slideData.visualSuggestion || 'Slide sem bullets estruturados.' }]

      slide.addText(bulletRuns, {
        x: 1.0,
        y: 1.85,
        w: 6.2,
        h: 3.8,
        fontFace: 'Aptos',
        fontSize: 18,
        color: '1F2937',
        breakLine: true,
        margin: 0,
      })

      slide.addText(slideData.visualSuggestion || 'Direção visual sugerida pelo pipeline.', {
        x: 7.8,
        y: 1.85,
        w: 4.35,
        h: 3.0,
        fontFace: 'Aptos',
        fontSize: 16,
        color: '334155',
        italic: true,
        margin: 0.12,
        fill: { color: 'EFF6FF' },
        line: { color: 'BFDBFE', pt: 1 },
      })
    }

    const notes = [slideData.speakerNotes, slideData.visualSuggestion].filter(Boolean).join('\n\n')
    const notesTarget = slide as unknown as { addNotes?: (text: string) => void }
    notesTarget.addNotes?.(notes)
  }

  await pptx.writeFile({ fileName: `${filename}.pptx` })
}

function normalizePptxColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  const cleaned = value.replace('#', '').trim()
  return /^[0-9a-f]{6}$/i.test(cleaned) ? cleaned.toUpperCase() : fallback
}

function truncateForPptx(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

function formatPresentationV2PptxList(label: string, entries: Array<string | null | undefined>, maxItems = 4): string {
  const values = entries.map(entry => String(entry || '').trim()).filter(Boolean).slice(0, maxItems)
  if (!values.length) return ''
  return `${label}: ${values.join(' | ')}`
}

export function buildPresentationV2CoverNotes(
  data: ParsedPresentationV2,
  designSummary: ReturnType<typeof summarizePresentationV2DesignSystem>,
  exportReadiness: ReturnType<typeof summarizePresentationV2ExportReadiness>,
) {
  const primaryExportIssue = resolvePresentationV2PrimaryExportIssue(exportReadiness)

  return [
    data.deck.outline.narrativeArc,
    data.deck.generationSpec.objective,
    data.deck.generationSpec.audience ? `Público: ${data.deck.generationSpec.audience}` : '',
    data.deck.generationSpec.durationMinutes ? `Duração alvo: ${data.deck.generationSpec.durationMinutes} min` : '',
    `Modo narrativo: ${designSummary.narrativeMode}`,
    `Estilo de superfície: ${designSummary.surfaceStyle}`,
    `Estratégia de contraste: ${designSummary.contrastStrategy}`,
    designSummary.layoutFamilies.length > 0 ? `Famílias de layout: ${designSummary.layoutFamilies.join(' | ')}` : '',
    formatPresentationV2PptxList('Fontes prioritárias', data.deck.generationSpec.sourcePriority || [], 5),
    formatPresentationV2PptxList('Restrições institucionais', data.deck.generationSpec.constraints || [], 5),
    `Gate de exportação: ${formatPresentationV2ExportGateLabel(exportReadiness)}`,
    primaryExportIssue && !exportReadiness.blockingIssues.includes(primaryExportIssue) ? `Pendência prioritária: ${primaryExportIssue}` : '',
    formatPresentationV2PptxList('Bloqueios atuais', exportReadiness.blockingIssues, 4),
  ].filter(Boolean).join('\n\n')
}

export function buildPresentationV2SlideNotes(args: {
  data: ParsedPresentationV2
  slideNumber: number
  exportReadiness: ReturnType<typeof summarizePresentationV2ExportReadiness>
}) {
  const { data, slideNumber, exportReadiness } = args
  const slideData = data.presentation.slides.find(slide => slide.number === slideNumber)
  const deckSlide = data.deck.slides.find(slide => slide.number === slideNumber)
  if (!slideData || !deckSlide) return ''

  const layoutFamily = findPresentationV2LayoutFamily(data.deck, slideNumber)
  const section = deckSlide.sectionId
    ? data.deck.outline.sections.find(entry => entry.id === deckSlide.sectionId)
    : undefined
  const primaryExportIssue = resolvePresentationV2PrimaryExportIssue(exportReadiness)
  const assetLines = (deckSlide.assets || [])
    .filter(asset => asset.url || asset.storagePath || asset.status)
    .map(asset => {
      const parts = [
        `[${asset.type}/${asset.status}]`,
        asset.altText ? `alt: ${truncateForPptx(asset.altText, 90)}` : '',
        asset.qualityWarnings?.[0] ? `aviso: ${truncateForPptx(asset.qualityWarnings[0], 90)}` : '',
        asset.url || asset.storagePath || asset.id,
      ].filter(Boolean)
      return parts.join(' | ')
    })

  return [
    slideData.speakerNotes,
    `Gate do deck: ${formatPresentationV2ExportGateLabel(exportReadiness)}`,
    primaryExportIssue && !exportReadiness.blockingIssues.includes(primaryExportIssue) ? `Pendência prioritária do deck: ${primaryExportIssue}` : '',
    section ? `Seção: ${section.title}${section.purpose ? ` — ${section.purpose}` : ''}` : '',
    deckSlide.purpose ? `Objetivo do slide: ${deckSlide.purpose}` : '',
    layoutFamily ? `Família de layout: ${layoutFamily.label}` : '',
    deckSlide.transition ? `Transição: ${deckSlide.transition}` : '',
    deckSlide.visualBrief ? `Brief visual: ${deckSlide.visualBrief}` : '',
    formatPresentationV2PptxList('Notas de design', deckSlide.designNotes || [], 4),
    formatPresentationV2PptxList('Fontes prioritárias do deck', data.deck.generationSpec.sourcePriority || [], 4),
    formatPresentationV2PptxList('Restrições institucionais do deck', data.deck.generationSpec.constraints || [], 4),
    exportReadiness.blockingIssues.length > 0 ? `Bloqueio principal: ${truncateForPptx(exportReadiness.blockingIssues[0], 140)}` : '',
    ...assetLines,
  ].filter(Boolean).join('\n\n')
}

export function buildPresentationV2AppendixReadinessLines(
  data: ParsedPresentationV2,
  designSummary: ReturnType<typeof summarizePresentationV2DesignSystem>,
  exportReadiness: ReturnType<typeof summarizePresentationV2ExportReadiness>,
) {
  const exportReadinessMessages = splitPresentationV2ExportReadinessMessages(exportReadiness)
  const primaryExportIssue = resolvePresentationV2PrimaryExportIssue(exportReadiness)
  const detailedExportReadinessMessages = removePresentationV2PrimaryExportIssueFromBuckets(
    exportReadinessMessages,
    primaryExportIssue,
  )

  return [
    `Modo narrativo: ${designSummary.narrativeMode}`,
    `Surface: ${designSummary.surfaceStyle}`,
    `Acento: ${designSummary.accentStrategy}`,
    `Status de exportação: ${formatPresentationV2ExportStatusLabel(exportReadiness)}`,
    `Gate operacional: ${formatPresentationV2ExportGateLabel(exportReadiness).toLowerCase()}`,
    primaryExportIssue && !exportReadinessMessages.blockingIssues.includes(primaryExportIssue) ? `Pendência prioritária: ${primaryExportIssue}` : '',
    `Alt text visual: ${exportReadiness.visualAssetCount > 0 ? `${exportReadiness.altTextCoverage}%` : 'N/A'}`,
    exportReadiness.missingAltTextAssets.length > 0 ? `Assets sem alt text: ${exportReadiness.missingAltTextAssets.join(' | ')}` : '',
    exportReadinessMessages.blockingIssues.length > 0 ? `Bloqueios: ${exportReadinessMessages.blockingIssues.join(' | ')}` : '',
    detailedExportReadinessMessages.accessibilityNotes.length > 0 ? `Acessibilidade: ${detailedExportReadinessMessages.accessibilityNotes.join(' | ')}` : '',
    detailedExportReadinessMessages.legalAccuracyNotes.length > 0 ? `Conformidade jurídica: ${detailedExportReadinessMessages.legalAccuracyNotes.join(' | ')}` : '',
    formatPresentationV2PptxList('Fontes prioritárias', data.deck.generationSpec.sourcePriority || [], 5),
    formatPresentationV2PptxList('Restrições institucionais', data.deck.generationSpec.constraints || [], 5),
    designSummary.layoutFamilies.length > 0 ? `Famílias: ${designSummary.layoutFamilies.join(' | ')}` : '',
    ...designSummary.hierarchyRules,
    data.deck.quality?.deckRubric?.score != null
      ? `Rubrica do deck: ${data.deck.quality.deckRubric.score}/100 (${formatPresentationV2StatusLabel(data.deck.quality.deckRubric.status, { okLabel: 'ok', fallbackLabel: 'ok' })})`
      : '',
  ].filter(Boolean)
}

function addV2Footer(
  slide: PptxSlide,
  pptx: PptxInstance,
  label: string,
  accent: string,
) {
  slide.addShape(pptx.ShapeType.line, { x: 0.55, y: 7.08, w: 12.25, h: 0, line: { color: accent, pt: 0.8, transparency: 45 } })
  slide.addText(label, {
    x: 0.6,
    y: 7.14,
    w: 8.5,
    h: 0.18,
    fontFace: 'Aptos',
    fontSize: 7.5,
    color: '64748B',
    margin: 0,
  })
}

export async function exportPresentationV2AsPptx(data: ParsedPresentationV2, filename: string) {
  const exportReadiness = summarizePresentationV2ExportReadiness(data)
  const exportReadinessMessages = splitPresentationV2ExportReadinessMessages(exportReadiness)
  if (!exportReadiness.canExportPptx) {
    throw new Error(
      exportReadiness.blockingIssues[0]
      || 'Exportacao v2 bloqueada: revise as pendencias de acessibilidade e conformidade antes de gerar o PPTX.',
    )
  }

  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  const deck = data.deck
  const designSummary = summarizePresentationV2DesignSystem(deck)
  const palette = deck.theme.palette || []
  const ink = normalizePptxColor(palette[0], '0F172A')
  const paper = normalizePptxColor(palette[1], 'FFFFFF')
  const accent = normalizePptxColor(palette[2], '0F766E')
  const soft = normalizePptxColor(palette[3], 'E0F2FE')

  pptx.layout = deck.exportHints?.aspectRatio === '4:3' ? 'LAYOUT_4X3' : 'LAYOUT_WIDE'
  pptx.author = 'Lexio'
  pptx.company = 'Lexio'
  pptx.subject = deck.generationSpec.objective || deck.title || filename
  pptx.title = deck.title || filename
  pptx.theme = {
    headFontFace: deck.theme.fontPairing?.heading || 'Aptos Display',
    bodyFontFace: deck.theme.fontPairing?.body || 'Aptos',
  }

  const cover = pptx.addSlide()
  cover.background = { color: ink }
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: ink }, line: { transparency: 100 } })
  cover.addShape(pptx.ShapeType.rect, { x: 0.68, y: 0.72, w: 0.16, h: 5.65, fill: { color: accent }, line: { transparency: 100 } })
  cover.addText(deck.title || data.presentation.title || filename, {
    x: 1.08,
    y: 1.28,
    w: 10.6,
    h: 1.55,
    fontFace: deck.theme.fontPairing?.heading || 'Aptos Display',
    fontSize: 34,
    bold: true,
    color: paper,
    margin: 0,
    fit: 'shrink',
  })
  if (deck.subtitle) {
    cover.addText(deck.subtitle, {
      x: 1.1,
      y: 3.02,
      w: 9.6,
      h: 0.65,
      fontFace: deck.theme.fontPairing?.body || 'Aptos',
      fontSize: 16,
      color: 'CBD5E1',
      margin: 0,
      fit: 'shrink',
    })
  }
  cover.addText([
    deck.generationSpec.audience ? `Público: ${deck.generationSpec.audience}` : '',
    deck.generationSpec.durationMinutes ? `Duração alvo: ${deck.generationSpec.durationMinutes} min` : '',
    `${deck.slides.length} slides`,
  ].filter(Boolean).join('  |  '), {
    x: 1.1,
    y: 5.95,
    w: 10.8,
    h: 0.3,
    fontFace: deck.theme.fontPairing?.body || 'Aptos',
    fontSize: 10.5,
    color: 'E2E8F0',
    margin: 0,
  })
  const coverNotes = buildPresentationV2CoverNotes(data, designSummary, exportReadiness)
  ;(cover as unknown as { addNotes?: (text: string) => void }).addNotes?.(coverNotes)

  if (deck.outline.sections.length > 0) {
    const agenda = pptx.addSlide()
    agenda.background = { color: 'F8FAFC' }
    agenda.addText('Roteiro da apresentação', {
      x: 0.65,
      y: 0.55,
      w: 9.8,
      h: 0.45,
      fontFace: deck.theme.fontPairing?.heading || 'Aptos Display',
      fontSize: 24,
      bold: true,
      color: ink,
      margin: 0,
    })
    agenda.addText(deck.outline.narrativeArc, {
      x: 0.68,
      y: 1.1,
      w: 11.4,
      h: 0.58,
      fontFace: deck.theme.fontPairing?.body || 'Aptos',
      fontSize: 11.5,
      color: '475569',
      margin: 0,
      fit: 'shrink',
    })
    deck.outline.sections.slice(0, 8).forEach((section, index) => {
      const y = 1.9 + index * 0.58
      agenda.addShape(pptx.ShapeType.roundRect, { x: 0.7, y, w: 0.38, h: 0.32, rectRadius: 0.08, fill: { color: accent }, line: { transparency: 100 } })
      agenda.addText(String(index + 1).padStart(2, '0'), { x: 0.76, y: y + 0.07, w: 0.28, h: 0.12, fontSize: 6.5, bold: true, color: paper, margin: 0 })
      agenda.addText(section.title, { x: 1.22, y: y - 0.01, w: 4.2, h: 0.24, fontSize: 12.5, bold: true, color: ink, margin: 0 })
      agenda.addText(section.purpose || `Slides ${section.slideNumbers.join(', ')}`, { x: 5.55, y: y, w: 6.8, h: 0.24, fontSize: 9.5, color: '475569', margin: 0, fit: 'shrink' })
    })
    addV2Footer(agenda, pptx, 'Manifesto de estrutura gerado pelo Gerador de Apresentação v2', accent)
  }

  for (const slideData of data.presentation.slides) {
    const deckSlide = deck.slides.find(slide => slide.number === slideData.number)
    const layoutFamily = findPresentationV2LayoutFamily(deck, slideData.number)
    const chrome = resolvePresentationV2SlideChrome(layoutFamily?.id)
    const slide = pptx.addSlide()
    slide.background = { color: 'F8FAFC' }

    if (slideData.renderedImageUrl) {
      const blob = await fetchUrlAsBlob(slideData.renderedImageUrl)
      const imageData = await blobToDataUrl(blob)
      slide.addImage({ data: imageData, x: 0, y: 0, w: 13.333, h: 7.5 })
    } else {
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.18, fill: { color: accent }, line: { transparency: 100 } })
      slide.addText(slideData.title, {
        x: chrome.title.x,
        y: chrome.title.y,
        w: chrome.title.w,
        h: chrome.title.h,
        fontFace: deck.theme.fontPairing?.heading || 'Aptos Display',
        fontSize: chrome.title.fontSize,
        bold: true,
        color: ink,
        margin: 0,
        fit: 'shrink',
      })
      const bulletRuns = slideData.bullets.length > 0
        ? slideData.bullets.slice(0, 6).map(bullet => ({ text: truncateForPptx(bullet, 130), options: { bullet: { indent: 16 } } }))
        : [{ text: deckSlide?.purpose || 'Slide sem bullets estruturados.' }]
      slide.addShape(pptx.ShapeType.roundRect, { x: chrome.contentPanel.x, y: chrome.contentPanel.y, w: chrome.contentPanel.w, h: chrome.contentPanel.h, rectRadius: 0.12, fill: { color: 'FFFFFF' }, line: { color: soft, pt: 1.1 } })
      slide.addText(bulletRuns, {
        x: chrome.bulletText.x,
        y: chrome.bulletText.y,
        w: chrome.bulletText.w,
        h: chrome.bulletText.h,
        fontFace: deck.theme.fontPairing?.body || 'Aptos',
        fontSize: chrome.bulletText.fontSize,
        color: '1F2937',
        breakLine: true,
        margin: 0,
        fit: 'shrink',
      })
      slide.addShape(pptx.ShapeType.roundRect, { x: chrome.sidePanel.x, y: chrome.sidePanel.y, w: chrome.sidePanel.w, h: chrome.sidePanel.h, rectRadius: 0.12, fill: { color: soft }, line: { color: accent, pt: 0.75, transparency: 30 } })
      const structuredAssetUrl = findPresentationV2StructuredAssetUrl(deckSlide)
      if (structuredAssetUrl) {
        try {
          const structuredBlob = await fetchUrlAsBlob(structuredAssetUrl)
          const structuredImageData = await blobToDataUrl(structuredBlob)
          slide.addImage({ data: structuredImageData, x: chrome.sideText.x, y: chrome.sideText.y, w: Math.max(2.9, chrome.sideText.w - 0.1), h: 2.18 })
        } catch {
          slide.addText('Asset estruturado indisponível no momento da exportação.', {
            x: chrome.sideText.x,
            y: chrome.sideText.y,
            w: chrome.sideText.w,
            h: 0.8,
            fontFace: deck.theme.fontPairing?.body || 'Aptos',
            fontSize: 12,
            color: ink,
            margin: 0.06,
            fit: 'shrink',
          })
        }
      } else {
        slide.addText(deckSlide?.visualBrief || slideData.visualSuggestion || deckSlide?.layout || 'Direção visual definida no manifesto v2.', {
          x: chrome.sideText.x,
          y: chrome.sideText.y,
          w: chrome.sideText.w,
          h: chrome.sideText.h,
          fontFace: deck.theme.fontPairing?.body || 'Aptos',
          fontSize: chrome.sideText.fontSize,
          color: ink,
          margin: 0.06,
          fit: 'shrink',
        })
      }
      if (deckSlide?.designNotes?.length) {
        slide.addText(deckSlide.designNotes.slice(0, 4).map(note => ({ text: truncateForPptx(note, 75), options: { bullet: { indent: 10 } } })), {
          x: chrome.sideText.x,
          y: structuredAssetUrl ? chrome.sideText.y + 2.4 : chrome.sideText.y + 2.37,
          w: chrome.sideText.w,
          h: 1.45,
          fontFace: deck.theme.fontPairing?.body || 'Aptos',
          fontSize: 9.8,
          color: '475569',
          breakLine: true,
          margin: 0,
          fit: 'shrink',
        })
      }
      addV2Footer(slide, pptx, `Slide ${slideData.number} | ${layoutFamily?.label || deckSlide?.layout || 'layout v2'}`, accent)
    }

    const notes = buildPresentationV2SlideNotes({
      data,
      slideNumber: slideData.number,
      exportReadiness,
    })
    ;(slide as unknown as { addNotes?: (text: string) => void }).addNotes?.(notes)
  }

  const storedAssets = data.assets.filter(asset => asset.url || asset.storagePath)
  const hasAppendixSignals = storedAssets.length > 0
    || data.qualityWarnings.length > 0
    || exportReadiness.blockingIssues.length > 0
    || exportReadiness.accessibilityNotes.length > 0
    || exportReadiness.legalAccuracyNotes.length > 0
    || exportReadinessMessages.warnings.length > 0

  if (hasAppendixSignals) {
    const appendix = pptx.addSlide()
    appendix.background = { color: 'F8FAFC' }
    appendix.addText('Assets e revisão v2', { x: 0.65, y: 0.55, w: 7.8, h: 0.42, fontSize: 23, bold: true, color: ink, margin: 0 })
    const rows = storedAssets.slice(0, 10).map((asset, index) => `${index + 1}. ${asset.type} | ${asset.status} | ${asset.model || asset.providerLabel || 'sem modelo'} | ${asset.url || asset.storagePath}`)
    appendix.addText(rows.length ? rows.join('\n') : 'Nenhum asset materializado no Storage.', {
      x: 0.75,
      y: 1.35,
      w: 11.8,
      h: 2.75,
      fontFace: deck.theme.fontPairing?.mono || 'Aptos Mono',
      fontSize: 8.2,
      color: '334155',
      margin: 0.06,
      fit: 'shrink',
    })
    const reviewLines = uniqueStrings([
      ...data.qualityWarnings.slice(0, 6),
      ...exportReadinessMessages.warnings,
    ])
    if (reviewLines.length > 0) {
      appendix.addText('Qualidade, acessibilidade e conformidade', { x: 0.75, y: 4.45, w: 5.2, h: 0.22, fontSize: 13, bold: true, color: ink, margin: 0 })
      appendix.addText(reviewLines.slice(0, 6).map(warning => ({ text: truncateForPptx(warning, 120), options: { bullet: { indent: 12 } } })), {
        x: 0.95,
        y: 4.85,
        w: 10.8,
        h: 1.15,
        fontSize: 10.5,
        color: '92400E',
        breakLine: true,
        margin: 0,
        fit: 'shrink',
      })
    }
    appendix.addText('Sistema visual e prontidão de exportação', { x: 6.65, y: 4.45, w: 5.0, h: 0.22, fontSize: 13, bold: true, color: ink, margin: 0 })
    appendix.addText(buildPresentationV2AppendixReadinessLines(data, designSummary, exportReadiness).join('\n'), {
      x: 6.65,
      y: 4.85,
      w: 5.4,
      h: 1.55,
      fontFace: deck.theme.fontPairing?.body || 'Aptos',
      fontSize: 9.4,
      color: '334155',
      margin: 0.06,
      fit: 'shrink',
    })
    addV2Footer(appendix, pptx, 'Apêndice técnico do manifesto v2', accent)
  }

  await pptx.writeFile({ fileName: `${filename}.pptx` })
}

// ── CSV export for DataTable ────────────────────────────────────────────────

export function exportDataTableAsCSV(data: ParsedDataTable, filename: string) {
  const header = data.columns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',')
  const rows = data.rows.map(row =>
    data.columns.map(c => {
      const val = row[c.key] ?? ''
      return `"${String(val).replace(/"/g, '""')}"`
    }).join(',')
  )
  const csv = [header, ...rows].join('\n')
  downloadText(csv, `${filename}.csv`, 'text/csv')
}

// ── Flashcards → CSV (Anki-compatible) ──────────────────────────────────────

export function exportFlashcardsAsCSV(data: ParsedFlashcards, filename: string) {
  const rows = data.categories.flatMap(cat =>
    cat.cards.map(card =>
      `"${card.front.replace(/"/g, '""')}","${card.back.replace(/"/g, '""')}","${cat.name.replace(/"/g, '""')}"`
    )
  )
  const csv = ['Front,Back,Tags', ...rows].join('\n')
  downloadText(csv, `${filename}_anki.csv`, 'text/csv')
}

// ── Quiz → PDF-ready text ───────────────────────────────────────────────────

export function exportQuizAsText(data: ParsedQuiz, filename: string, includeAnswers: boolean) {
  let text = `${data.title}\n`
  text += `Dificuldade: ${data.difficulty || 'Variada'} | Tempo: ${data.estimatedTime || 'N/A'}\n`
  text += '═'.repeat(60) + '\n\n'

  data.questions.forEach(q => {
    text += `${q.number}. [${q.type.replace(/_/g, ' ').toUpperCase()}] ${q.text}\n`
    if (q.options) {
      q.options.forEach(opt => { text += `   ${opt.label}) ${opt.text}\n` })
    }
    if (q.pairs) {
      q.pairs.forEach(p => { text += `   ${p.left} → ___\n` })
    }
    text += '\n'
  })

  if (includeAnswers) {
    text += '\n' + '═'.repeat(60) + '\nGABARITO\n' + '═'.repeat(60) + '\n\n'
    data.questions.forEach(q => {
      text += `${q.number}. ${q.answer}\n`
      if (q.explanation) text += `   ${q.explanation}\n`
      text += '\n'
    })
  }

  downloadText(text, `${filename}${includeAnswers ? '_gabarito' : '_prova'}.txt`)
}

// ── Presentation → plain text slides ────────────────────────────────────────

export function exportPresentationAsText(data: ParsedPresentation, filename: string) {
  let text = data.title ? `${data.title}\n${'═'.repeat(60)}\n\n` : ''

  data.slides.forEach(slide => {
    text += `── Slide ${slide.number}: ${slide.title} ─��\n\n`
    slide.bullets.forEach(b => { text += `  • ${b}\n` })
    if (slide.speakerNotes) {
      text += `\n  [Notas] ${slide.speakerNotes}\n`
    }
    if (slide.visualSuggestion) {
      text += `  [Visual] ${slide.visualSuggestion}\n`
    }
    text += '\n'
  })

  downloadText(text, `${filename}_slides.txt`)
}

// ── Audio/Video Script → formatted text ─────────────────────────────────────

export function exportAudioScriptAsText(data: ParsedAudioScript, filename: string) {
  let text = `${data.title}\nDuração: ${data.duration || 'N/A'}\n${'═'.repeat(60)}\n\n`

  data.segments.forEach(seg => {
    const speaker = seg.speaker ? ` [${seg.speaker}]` : ''
    text += `[${seg.time}] (${seg.type})${speaker}\n`
    text += `${seg.text}\n`
    if (seg.notes) text += `  → ${seg.notes}\n`
    text += '\n'
  })

  if (data.productionNotes?.length) {
    text += '\nNOTAS DE PRODUÇÃO:\n'
    data.productionNotes.forEach(n => { text += `  • ${n}\n` })
  }

  downloadText(text, `${filename}_roteiro.txt`)
}

export function exportVideoScriptAsText(data: ParsedVideoScript, filename: string) {
  let text = `${data.title}\nDuração: ${data.duration || 'N/A'}\n${'═'.repeat(60)}\n\n`

  data.scenes.forEach(scene => {
    text += `── Cena ${scene.number} [${scene.time}] ──\n`
    text += `NARRAÇÃO: ${scene.narration}\n`
    text += `VISUAL: ${scene.visual}\n`
    if (scene.transition) text += `TRANSIÇÃO: ${scene.transition}\n`
    if (scene.broll) text += `B-ROLL: ${scene.broll}\n`
    if (scene.lowerThird) text += `LOWER THIRD: ${scene.lowerThird}\n`
    if (scene.notes) text += `NOTAS: ${scene.notes}\n`
    text += '\n'
  })

  if (data.postProductionNotes?.length) {
    text += '\nNOTAS PÓS-PRODUÇÃO:\n'
    data.postProductionNotes.forEach(n => { text += `  • ${n}\n` })
  }

  downloadText(text, `${filename}_storyboard.txt`)
}

// ── JSON export (for structured artifacts) ──────────────────────────────────

export function exportAsJSON(data: unknown, filename: string) {
  downloadText(JSON.stringify(data, null, 2), `${filename}.json`, 'application/json')
}

// ── HTML export (for visual artifacts) ──────────────────────────────────────

const HTML_STYLE = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #1f2937; }
    h1, h2, h3, h4 { color: #111827; margin-top: 1.5em; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #e5e7eb; padding: 0.75rem; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    tr:nth-child(even) { background: #f9fafb; }
    blockquote { border-left: 4px solid #6366f1; padding-left: 1rem; margin: 1em 0; font-style: italic; color: #4b5563; }
    code { background: #f3f4f6; padding: 0.15em 0.4em; border-radius: 0.25rem; font-size: 0.875em; }
    pre { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
    .stat { font-size: 2.5rem; font-weight: 700; color: #6366f1; }
    .section { margin: 2rem 0; padding: 1.5rem; border-radius: 0.75rem; background: #f9fafb; }
    @media print { body { padding: 0; } @page { margin: 2cm; } }
`

export function exportAsHTML(htmlContent: string, title: string, filename: string) {
  const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${HTML_STYLE}</style>
</head>
<body>
  <h1>${title}</h1>
  ${htmlContent}
  <footer style="margin-top:3rem;padding-top:1rem;border-top:1px solid #e5e7eb;font-size:0.75rem;color:#9ca3af;">
    Gerado por Lexio · ${new Date().toLocaleDateString('pt-BR')}
  </footer>
</body>
</html>`
  downloadText(fullHtml, `${filename}.html`, 'text/html')
}

// ── PDF export (via browser print dialog) ───────────────────────────────────

export function printAsPDF(htmlContent: string, title: string) {
  const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>${HTML_STYLE}</style>
</head>
<body>
  <h1>${title}</h1>
  ${htmlContent}
  <footer style="margin-top:3rem;padding-top:1rem;border-top:1px solid #e5e7eb;font-size:0.75rem;color:#9ca3af;">
    Gerado por Lexio · ${new Date().toLocaleDateString('pt-BR')}
  </footer>
</body>
</html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(fullHtml)
  w.document.close()
  w.addEventListener('load', () => { w.print() })
}

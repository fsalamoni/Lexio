import type { ChatArtifactFormat, ChatArtifactKind, ChatArtifactRef } from './firestore-types'

export interface ChatExpectedDeliverable {
  kind: ChatArtifactKind
  accepted_formats: ChatArtifactFormat[]
  label: string
  reason: string
  requires_preview: boolean
  requires_download: boolean
  strict: boolean
}

const IMAGE_FORMATS: ChatArtifactFormat[] = ['png', 'jpg', 'jpeg', 'webp']
const AUDIO_FORMATS: ChatArtifactFormat[] = ['mp3', 'wav', 'webm']
const VIDEO_FORMATS: ChatArtifactFormat[] = ['mp4', 'webm']
const DOCUMENT_FORMATS: ChatArtifactFormat[] = ['markdown', 'docx', 'pdf', 'txt']
const PRESENTATION_FORMATS: ChatArtifactFormat[] = ['pptx', 'pdf']
const SPREADSHEET_FORMATS: ChatArtifactFormat[] = ['xlsx', 'csv']
const CODE_FORMATS: ChatArtifactFormat[] = ['typescript', 'javascript', 'python', 'txt']

export function inferExpectedDeliverablesFromText(text: string): ChatExpectedDeliverable[] {
  const normalized = normalizeForIntent(text)
  const hasOutputAction = /\b(entreg(?:a|ue|ar|avel|aveis)|disponibiliz(?:a|e|ar)|anex(?:a|e|ar)|baixar|download|export(?:a|e|ar)|gere|gerar|crie|criar|faca|fazer|produza|produzir|renderiz(?:a|e|ar)|render)\b/.test(normalized)
  const explicitFormat = /\b(png|jpe?g|webp|mp3|wav|mp4|webm|docx|pdf|pptx|xlsx|csv|typescript|javascript|python)\b/.test(normalized)
  if (!hasOutputAction && !explicitFormat) return []

  const expected: ChatExpectedDeliverable[] = []

  if (/\b(imagem|imagens|render|renderizacao|renderizacoes|visualizacao|mockup|foto|png|jpe?g|webp)\b/.test(normalized)) {
    expected.push({
      kind: 'image',
      accepted_formats: pickFormats(normalized, IMAGE_FORMATS, IMAGE_FORMATS),
      label: 'imagem',
      reason: 'O usuario pediu uma imagem/renderizacao literal.',
      requires_preview: true,
      requires_download: true,
      strict: true,
    })
  }

  if (/\b(audio|podcast|narracao|mp3|wav)\b/.test(normalized)) {
    expected.push({
      kind: 'audio',
      accepted_formats: pickFormats(normalized, AUDIO_FORMATS, ['mp3', 'wav']),
      label: 'audio',
      reason: 'O usuario pediu audio literal.',
      requires_preview: true,
      requires_download: true,
      strict: true,
    })
  }

  if (/\b(video|videos|mp4|webm)\b/.test(normalized)) {
    expected.push({
      kind: 'video',
      accepted_formats: pickFormats(normalized, VIDEO_FORMATS, ['mp4', 'webm']),
      label: 'video',
      reason: 'O usuario pediu video literal.',
      requires_preview: true,
      requires_download: true,
      strict: true,
    })
  }

  if (/\b(apresentacao|apresentacoes|slides?|deck|pptx)\b/.test(normalized)) {
    expected.push({
      kind: 'presentation',
      accepted_formats: pickFormats(normalized, PRESENTATION_FORMATS, PRESENTATION_FORMATS),
      label: 'apresentacao',
      reason: 'O usuario pediu uma apresentacao como entregavel.',
      requires_preview: false,
      requires_download: true,
      strict: true,
    })
  }

  if (/\b(planilha|planilhas|tabela|tabelas|xlsx|csv)\b/.test(normalized)) {
    expected.push({
      kind: 'spreadsheet',
      accepted_formats: pickFormats(normalized, SPREADSHEET_FORMATS, SPREADSHEET_FORMATS),
      label: 'planilha',
      reason: 'O usuario pediu dados tabulares em arquivo.',
      requires_preview: false,
      requires_download: true,
      strict: true,
    })
  }

  if (/\b(codigo|script|typescript|javascript|python)\b/.test(normalized)) {
    expected.push({
      kind: 'code',
      accepted_formats: pickFormats(normalized, CODE_FORMATS, CODE_FORMATS),
      label: 'codigo',
      reason: 'O usuario pediu codigo como entregavel.',
      requires_preview: false,
      requires_download: true,
      strict: true,
    })
  }

  if (isTextualDocumentRequest(normalized)) {
    expected.push({
      kind: 'legal_document',
      accepted_formats: pickFormats(normalized, DOCUMENT_FORMATS, DOCUMENT_FORMATS),
      label: 'documento',
      reason: 'O usuario pediu documento ou arquivo textual.',
      requires_preview: false,
      requires_download: true,
      strict: false,
    })
  }

  return dedupeExpectedDeliverables(expected)
}

export function hasSatisfiedExpectedDeliverables(
  expected: ChatExpectedDeliverable[],
  artifacts: Iterable<{ artifact: ChatArtifactRef }>,
): boolean {
  if (!expected.length) return false
  return findUnsatisfiedExpectedDeliverables(expected, artifacts).length === 0
}

export function findUnsatisfiedExpectedDeliverables(
  expected: ChatExpectedDeliverable[],
  artifacts: Iterable<{ artifact: ChatArtifactRef }>,
): ChatExpectedDeliverable[] {
  const materialized = [...artifacts]
  return expected.filter(item => !materialized.some(({ artifact }) => artifactSatisfiesExpectedDeliverable(artifact, item)))
}

export function artifactSatisfiesExpectedDeliverable(artifact: ChatArtifactRef, expected: ChatExpectedDeliverable): boolean {
  if (!kindMatches(artifact.kind, expected.kind)) return false
  if (artifact.download_url && expected.accepted_formats.includes(artifact.format)) return true
  return (artifact.exports ?? []).some(exportRef =>
    exportRef.status === 'ready'
    && Boolean(exportRef.download_url)
    && expected.accepted_formats.includes(exportRef.format),
  )
}

export function hasStrictExpectedDeliverables(expected: ChatExpectedDeliverable[]): boolean {
  return expected.some(item => item.strict)
}

export function shouldUseTextFallbackForExpectedDeliverables(expected: ChatExpectedDeliverable[]): boolean {
  if (!expected.length) return true
  return expected.every(item => !item.strict && (item.kind === 'text' || item.kind === 'legal_document'))
}

export function describeExpectedDeliverable(expected: ChatExpectedDeliverable): string {
  return `${expected.label} (${expected.accepted_formats.map(format => format.toUpperCase()).join('/')})`
}

export function buildExpectedDeliverableFeedback(missing: ChatExpectedDeliverable[]): string {
  const lines = missing.map(item => `- ${describeExpectedDeliverable(item)}: ${item.reason}`)
  return [
    'Validacao de entrega literal falhou.',
    'Nao finalize como sucesso enquanto o artifact real solicitado nao existir.',
    'Prompt, descricao, Markdown, DOCX, PDF ou ZIP generico nao substituem o formato pedido.',
    'Entregaveis ainda pendentes:',
    ...lines,
    'Acione a skill apropriada, por exemplo generate_image para imagem/renderizacao, ou finalize com falha operacional acionavel se faltar provider/chave.',
  ].join('\n')
}

function normalizeForIntent(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function isTextualDocumentRequest(normalized: string): boolean {
  if (/\b(relatorio|relatorios|parecer|peticao|contestacao|recurso|minuta|minutas|docx|markdown|txt)\b/.test(normalized)) {
    return true
  }

  if (/\b(fa(?:ca|zer)|crie|criar|gere|gerar|produza|produzir|elabore|elaborar|redija|redigir|monte|montar|prepare|preparar|construa|construir)\s+(?:um|uma|o|os|a|as)?\s*(?:novo|nova|novos|novas)?\s*(documentos?|arquivos?)\b/.test(normalized)) {
    return true
  }

  return /\b(documentos?|arquivos?)\b/.test(normalized)
    && /\b(entreg(?:a|ue|ar|avel|aveis)|disponibiliz(?:a|e|ar)|anex(?:a|e|ar)|baixar|download|export(?:a|e|ar))\b/.test(normalized)
}

function pickFormats(normalized: string, candidates: ChatArtifactFormat[], fallback: ChatArtifactFormat[]): ChatArtifactFormat[] {
  const requested = candidates.filter(format => {
    if (format === 'jpg') return /\bjpg\b/.test(normalized)
    if (format === 'jpeg') return /\bjpeg\b/.test(normalized)
    return new RegExp(`\\b${format}\\b`).test(normalized)
  })
  return requested.length ? requested : fallback
}

function dedupeExpectedDeliverables(items: ChatExpectedDeliverable[]): ChatExpectedDeliverable[] {
  const byKind = new Map<ChatArtifactKind, ChatExpectedDeliverable>()
  for (const item of items) {
    const current = byKind.get(item.kind)
    if (!current) {
      byKind.set(item.kind, item)
      continue
    }
    byKind.set(item.kind, {
      ...current,
      accepted_formats: Array.from(new Set([...current.accepted_formats, ...item.accepted_formats])),
      strict: current.strict || item.strict,
      requires_preview: current.requires_preview || item.requires_preview,
      requires_download: current.requires_download || item.requires_download,
    })
  }
  return [...byKind.values()]
}

function kindMatches(actual: ChatArtifactKind, expected: ChatArtifactKind): boolean {
  if (actual === expected) return true
  if (expected === 'legal_document') return actual === 'legal_document' || actual === 'text'
  if (expected === 'text') return actual === 'text' || actual === 'legal_document'
  if (expected === 'spreadsheet') return actual === 'spreadsheet' || actual === 'data'
  return false
}
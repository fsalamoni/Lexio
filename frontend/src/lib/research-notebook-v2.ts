import { AREA_LABELS } from './constants'
import type {
  AcervoDocumentData,
  NotebookResearchAuditEntry,
  NotebookSavedSearchEntry,
  NotebookSource,
  NotebookSourceType,
  ResearchNotebookData,
} from './firestore-types'

type SourceTypeCounts = Partial<Record<NotebookSourceType, number>>

export interface ResearchNotebookV2Snapshot {
  sourceCount: number
  indexedSourceCount: number
  textReadySourceCount: number
  totalSourceChars: number
  artifactCount: number
  messageCount: number
  savedSearchCount: number
  researchAuditCount: number
  acervoSourceCount: number
  uploadSourceCount: number
  webSourceCount: number
  latestActivityAt?: string
  sourceTypeCounts: SourceTypeCounts
}

export type SavedSearchVariantFilter = 'all' | NotebookSavedSearchEntry['variant']

function parseIsoMs(value: string | undefined) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function buildNotebookSavedSearchTitle(audit: NotebookResearchAuditEntry): string {
  const prefix = audit.variant === 'jurisprudencia'
    ? 'Jurisprudência'
    : audit.variant === 'deep'
      ? 'Pesquisa profunda'
      : 'Pesquisa externa'

  const trimmedQuery = audit.query.trim()
  if (!trimmedQuery) return prefix

  const compactQuery = trimmedQuery.length > 56 ? `${trimmedQuery.slice(0, 53)}...` : trimmedQuery
  return `${prefix}: ${compactQuery}`
}

export function buildNotebookSavedSearchTags(audit: NotebookResearchAuditEntry): string[] {
  const tags = new Set<string>()

  if (audit.variant === 'jurisprudencia') tags.add('jurisprudencia')
  else if (audit.variant === 'deep') tags.add('pesquisa-profunda')
  else tags.add('pesquisa-externa')

  if (audit.legalArea) {
    const areaLabel = AREA_LABELS[audit.legalArea] || audit.legalArea
    if (areaLabel) tags.add(areaLabel.toLowerCase())
  }

  if (audit.dateRangeLabel) tags.add('recorte-temporal')
  if ((audit.tribunalCount || 0) > 0) tags.add('tribunais')
  if (audit.usedSnippetFallback) tags.add('fallback-snippets')

  return Array.from(tags).slice(0, 5)
}

export function normalizeNotebookSavedSearchTags(rawValue: string): string[] {
  return Array.from(new Set(
    rawValue
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  )).slice(0, 8)
}

export function countNotebookSavedSearchesByVariant(savedSearches: NotebookSavedSearchEntry[]) {
  return {
    all: savedSearches.length,
    external: savedSearches.filter((search) => search.variant === 'external').length,
    deep: savedSearches.filter((search) => search.variant === 'deep').length,
    jurisprudencia: savedSearches.filter((search) => search.variant === 'jurisprudencia').length,
  }
}

export function filterNotebookSavedSearches(
  savedSearches: NotebookSavedSearchEntry[],
  query: string,
  variantFilter: SavedSearchVariantFilter,
) {
  const normalizedQuery = query.trim().toLowerCase()

  return savedSearches
    .filter((search) => {
      if (variantFilter !== 'all' && search.variant !== variantFilter) return false
      if (!normalizedQuery) return true

      return search.title.toLowerCase().includes(normalizedQuery)
        || search.query.toLowerCase().includes(normalizedQuery)
        || (search.sourceKindLabel || '').toLowerCase().includes(normalizedQuery)
        || (search.tags || []).some((tag) => tag.toLowerCase().includes(normalizedQuery))
    })
    .slice()
    .sort((left, right) => {
      const pinDelta = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
      if (pinDelta !== 0) return pinDelta
      return parseIsoMs(right.updated_at) - parseIsoMs(left.updated_at)
    })
}

export function canOpenNotebookSourceViewer(source: NotebookSource | null | undefined) {
  if (!source) return false
  return Boolean(source.text_content?.trim()) || Boolean(source.results_raw?.trim())
}

export function buildNotebookSourcePreview(source: NotebookSource | null | undefined) {
  if (!source) return 'Selecione uma fonte para inspecionar o texto indexado neste workbench.'

  const text = source.text_content?.trim()
  if (text) {
    return text.length > 3200 ? `${text.slice(0, 3200)}\n\n[...]` : text
  }

  if (source.results_raw) {
    try {
      const parsed = JSON.parse(source.results_raw) as unknown[]
      return `Esta fonte guarda ${parsed.length} resultado(s) estruturado(s) para inspeção rica no viewer avançado deste workbench.`
    } catch {
      return 'A fonte mantém resultados estruturados, mas a prévia textual não está disponível nesta superfície.'
    }
  }

  return 'Esta fonte ainda não possui texto indexado suficiente para pré-visualização no V2.'
}

export function buildResearchNotebookV2Snapshot(notebook: ResearchNotebookData): ResearchNotebookV2Snapshot {
  const sourceTypeCounts = notebook.sources.reduce<SourceTypeCounts>((counts, source) => {
    counts[source.type] = (counts[source.type] || 0) + 1
    return counts
  }, {})

  const latestActivityAt = [
    notebook.updated_at,
    notebook.created_at,
    ...notebook.sources.map((source) => source.added_at),
    ...notebook.messages.map((message) => message.created_at),
    ...notebook.artifacts.map((artifact) => artifact.created_at),
    ...(notebook.saved_searches || []).flatMap((entry) => [entry.updated_at, entry.created_at]),
    ...(notebook.research_audits || []).map((entry) => entry.created_at),
  ]
    .filter(Boolean)
    .sort((left, right) => parseIsoMs(right) - parseIsoMs(left))[0]

  return {
    sourceCount: notebook.sources.length,
    indexedSourceCount: notebook.sources.filter((source) => source.status === 'indexed').length,
    textReadySourceCount: notebook.sources.filter((source) => (source.text_content?.trim().length || 0) > 0).length,
    totalSourceChars: notebook.sources.reduce((total, source) => total + (source.text_content?.length || 0), 0),
    artifactCount: notebook.artifacts.length,
    messageCount: notebook.messages.length,
    savedSearchCount: notebook.saved_searches?.length || 0,
    researchAuditCount: notebook.research_audits?.length || 0,
    acervoSourceCount: sourceTypeCounts.acervo || 0,
    uploadSourceCount: sourceTypeCounts.upload || 0,
    webSourceCount: (sourceTypeCounts.link || 0) + (sourceTypeCounts.external || 0) + (sourceTypeCounts.external_deep || 0) + (sourceTypeCounts.jurisprudencia || 0),
    latestActivityAt,
    sourceTypeCounts,
  }
}

export function filterNotebookAcervoCandidates(
  acervoDocs: AcervoDocumentData[],
  notebook: ResearchNotebookData | null,
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase()
  const existingIds = new Set(
    (notebook?.sources || [])
      .filter((source) => source.type === 'acervo' && source.reference)
      .map((source) => source.reference),
  )

  return acervoDocs.filter((doc) => {
    if (doc.id && existingIds.has(doc.id)) return false
    if (!normalizedQuery) return true

    return doc.filename.toLowerCase().includes(normalizedQuery)
      || (doc.ementa?.toLowerCase().includes(normalizedQuery) ?? false)
      || (doc.assuntos?.some((assunto) => assunto.toLowerCase().includes(normalizedQuery)) ?? false)
      || (doc.area_direito?.some((area) => area.toLowerCase().includes(normalizedQuery)) ?? false)
  })
}
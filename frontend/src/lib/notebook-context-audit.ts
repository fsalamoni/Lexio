import type { NotebookMessage, NotebookSource } from './firestore-service'

const CHAT_SEARCH_CONTEXT_MAX_CHARS = 2000

export interface ContextAuditSearchEntry {
  id: string
  label: string
  originalChars: number
  includedChars: number
  truncated: boolean
}

export interface ContextAuditSourceEntry {
  id: string
  name: string
  type: NotebookSource['type']
  originalChars: number
  includedChars: number
  truncated: boolean
  included: boolean
  exclusionReason?: 'too_short' | 'missing_text'
}

export interface ContextAuditConversationSummary {
  totalMessages: number
  includedMessages: number
  droppedMessages: number
  rawChars: number
  includedChars: number
  truncatedByChars: boolean
}

export interface ContextAuditSourceSummary {
  totalSources: number
  eligibleSources: number
  includedSources: number
  droppedSources: number
  truncatedSources: number
  includedChars: number
}

export interface StudioContextAuditSummary {
  sourceText: string
  conversationText: string
  sourceSummary: ContextAuditSourceSummary
  conversationSummary: ContextAuditConversationSummary
  sourceEntries: ContextAuditSourceEntry[]
  customInstructionsChars: number
  totalContextChars: number
}

export interface ChatContextAuditSummary {
  sourceText: string
  conversationText: string
  searchHistoryText: string
  sourceSummary: ContextAuditSourceSummary
  conversationSummary: ContextAuditConversationSummary
  searchSummary: {
    totalEntries: number
    includedChars: number
    truncated: boolean
  }
  sourceEntries: ContextAuditSourceEntry[]
  searchEntries: ContextAuditSearchEntry[]
  liveWebEnabled: boolean
  liveWebChars: number
  totalContextChars: number
}

export interface ResearchContextAuditSummary {
  variant: 'external' | 'deep' | 'jurisprudencia'
  mode: 'preview' | 'executed'
  query: string
  queryChars: number
  tribunalCount?: number
  tribunalAliases?: string[]
  resultCount?: number
  selectedCount?: number
  extractedCount?: number
  compiledChars?: number
  usedSnippetFallback?: boolean
  legalArea?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  graus?: string[]
  maxPerTribunal?: number
  dateRangeLabel?: string | null
  sourceKindLabel?: string
  totalContextChars: number
}

export interface StudioContextAuditOptions {
  sources: NotebookSource[]
  messages: NotebookMessage[]
  customInstructions?: string
  minSourceChars: number
  maxSourceCharsPerSource: number
  maxConversationMessages: number
  maxConversationChars: number
}

export interface ChatContextAuditOptions {
  sources: NotebookSource[]
  messages: NotebookMessage[]
  minSourceChars: number
  maxSourceCharsPerSource: number
  maxConversationMessages: number
  maxConversationChars: number
  liveWebEnabled?: boolean
  liveWebSnippet?: string
}

export interface ResearchContextAuditOptions {
  variant: 'external' | 'deep' | 'jurisprudencia'
  mode?: 'preview' | 'executed'
  query: string
  tribunalCount?: number
  tribunalAliases?: string[]
  resultCount?: number
  selectedCount?: number
  extractedCount?: number
  compiledChars?: number
  usedSnippetFallback?: boolean
  legalArea?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  graus?: string[]
  maxPerTribunal?: number
  sourceKindLabel?: string
}

function buildDateRangeLabel(dateFrom?: string | null, dateTo?: string | null): string | null {
  if (!dateFrom && !dateTo) return null
  if (dateFrom && dateTo) return `${dateFrom} → ${dateTo}`
  return dateFrom ? `desde ${dateFrom}` : `até ${dateTo}`
}

function buildSourceEntries(options: {
  sources: NotebookSource[]
  minSourceChars: number
  maxSourceCharsPerSource: number
}): ContextAuditSourceEntry[] {
  return options.sources.map(source => {
    const textLength = source.text_content?.length ?? 0
    const hasText = textLength > 0
    const included = hasText && textLength >= options.minSourceChars
    const includedChars = included ? Math.min(textLength, options.maxSourceCharsPerSource) : 0

    return {
      id: source.id,
      name: source.name,
      type: source.type,
      originalChars: textLength,
      includedChars,
      truncated: included && textLength > options.maxSourceCharsPerSource,
      included,
      exclusionReason: included ? undefined : (hasText ? 'too_short' : 'missing_text'),
    }
  })
}

function buildSourceText(
  sources: NotebookSource[],
  entries: ContextAuditSourceEntry[],
  maxSourceCharsPerSource: number,
): string {
  return entries
    .filter(entry => entry.included)
    .map(entry => {
      const source = sources.find(item => item.id === entry.id)
      return source?.text_content
        ? `[FONTE: ${entry.name}]\n${source.text_content.slice(0, maxSourceCharsPerSource)}`
        : ''
    })
    .filter(Boolean)
    .join('\n\n---\n\n')
}

function buildConversationSummary(messages: NotebookMessage[], maxMessages: number, maxChars: number) {
  const selectedMessages = messages.slice(-maxMessages)
  const conversationRaw = selectedMessages
    .map(message => `${message.role}: ${message.content}`)
    .join('\n')
  const conversationText = conversationRaw.slice(0, maxChars)

  return {
    selectedMessages,
    conversationRaw,
    conversationText,
    summary: {
      totalMessages: messages.length,
      includedMessages: selectedMessages.length,
      droppedMessages: Math.max(0, messages.length - selectedMessages.length),
      rawChars: conversationRaw.length,
      includedChars: conversationText.length,
      truncatedByChars: conversationRaw.length > maxChars,
    } satisfies ContextAuditConversationSummary,
  }
}

function buildSearchEntries(sources: NotebookSource[]): ContextAuditSearchEntry[] {
  return sources.flatMap(source => {
    if (source.type === 'jurisprudencia') {
      let resultCount = 0
      if (source.results_raw) {
        try { resultCount = (JSON.parse(source.results_raw) as unknown[]).length } catch { /* ignore */ }
      }
      const label = `- Jurisprudência: "${source.reference}" → ${resultCount} resultado(s)`
      return [{
        id: source.id,
        label,
        originalChars: label.length,
        includedChars: label.length,
        truncated: false,
      }]
    }

    if (source.type === 'external' || source.type === 'external_deep') {
      const label = `- Pesquisa web: "${source.reference}"`
      return [{
        id: source.id,
        label,
        originalChars: label.length,
        includedChars: label.length,
        truncated: false,
      }]
    }

    return []
  })
}

export function buildStudioContextAudit(options: StudioContextAuditOptions): StudioContextAuditSummary {
  const sourceEntries = buildSourceEntries(options)
  const includedSources = sourceEntries.filter(entry => entry.included)
  const sourceText = buildSourceText(options.sources, sourceEntries, options.maxSourceCharsPerSource)
  const conversation = buildConversationSummary(
    options.messages,
    options.maxConversationMessages,
    options.maxConversationChars,
  )

  return {
    sourceText,
    conversationText: conversation.conversationText,
    sourceSummary: {
      totalSources: options.sources.length,
      eligibleSources: includedSources.length,
      includedSources: includedSources.length,
      droppedSources: sourceEntries.filter(entry => !entry.included).length,
      truncatedSources: includedSources.filter(entry => entry.truncated).length,
      includedChars: includedSources.reduce((sum, entry) => sum + entry.includedChars, 0),
    },
    conversationSummary: conversation.summary,
    sourceEntries,
    customInstructionsChars: options.customInstructions?.trim().length ?? 0,
    totalContextChars: sourceText.length + conversation.conversationText.length + (options.customInstructions?.trim().length ?? 0),
  }
}

export function buildChatContextAudit(options: ChatContextAuditOptions): ChatContextAuditSummary {
  const sourceEntries = buildSourceEntries(options)
  const includedSources = sourceEntries.filter(entry => entry.included)
  const sourceText = buildSourceText(options.sources, sourceEntries, options.maxSourceCharsPerSource)
  const conversation = buildConversationSummary(
    options.messages,
    options.maxConversationMessages,
    options.maxConversationChars,
  )

  const searchEntries = buildSearchEntries(options.sources)
  const searchHistoryRaw = searchEntries.map(entry => entry.label).join('\n')
  const searchHistoryText = searchEntries.length > 0
    ? searchHistoryRaw.slice(0, CHAT_SEARCH_CONTEXT_MAX_CHARS)
    : ''
  const liveWebSnippet = options.liveWebSnippet?.trim() || ''

  return {
    sourceText,
    conversationText: conversation.conversationText,
    searchHistoryText,
    sourceSummary: {
      totalSources: options.sources.length,
      eligibleSources: includedSources.length,
      includedSources: includedSources.length,
      droppedSources: sourceEntries.filter(entry => !entry.included).length,
      truncatedSources: includedSources.filter(entry => entry.truncated).length,
      includedChars: includedSources.reduce((sum, entry) => sum + entry.includedChars, 0),
    },
    conversationSummary: conversation.summary,
    searchSummary: {
      totalEntries: searchEntries.length,
      includedChars: searchHistoryText.length,
      truncated: searchHistoryRaw.length > CHAT_SEARCH_CONTEXT_MAX_CHARS,
    },
    sourceEntries,
    searchEntries,
    liveWebEnabled: Boolean(options.liveWebEnabled),
    liveWebChars: liveWebSnippet.length,
    totalContextChars: sourceText.length + conversation.conversationText.length + searchHistoryText.length + liveWebSnippet.length,
  }
}

export function buildResearchContextAudit(options: ResearchContextAuditOptions): ResearchContextAuditSummary {
  return {
    variant: options.variant,
    mode: options.mode || 'preview',
    query: options.query,
    queryChars: options.query.trim().length,
    tribunalCount: options.tribunalCount,
    tribunalAliases: options.tribunalAliases,
    resultCount: options.resultCount,
    selectedCount: options.selectedCount,
    extractedCount: options.extractedCount,
    compiledChars: options.compiledChars,
    usedSnippetFallback: options.usedSnippetFallback,
    legalArea: options.legalArea ?? null,
    dateFrom: options.dateFrom ?? null,
    dateTo: options.dateTo ?? null,
    graus: options.graus,
    maxPerTribunal: options.maxPerTribunal,
    dateRangeLabel: buildDateRangeLabel(options.dateFrom, options.dateTo),
    sourceKindLabel: options.sourceKindLabel,
    totalContextChars: (options.query.trim().length) + (options.compiledChars ?? 0),
  }
}
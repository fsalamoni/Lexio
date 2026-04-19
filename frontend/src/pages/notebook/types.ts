export type NotebookResearchVariant = 'external' | 'deep' | 'jurisprudencia'

export interface SearchResultItem {
  id: string
  title: string
  subtitle: string
  snippet: string
  fullContent?: string
  metadata: Record<string, string>
  url?: string
  selected: boolean
  _raw?: unknown
}
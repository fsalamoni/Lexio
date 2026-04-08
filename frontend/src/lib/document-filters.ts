/**
 * document-filters — Pure utility functions for filtering document lists.
 * Extracted from DocumentList.tsx for testability.
 */

export interface DocumentFilterItem {
  id: string
  document_type_id: string
  tema: string | null
  texto_completo?: string | null
  status: string
  quality_score: number | null
  created_at: string
  /** Origin of the document. Known values: 'caderno' | 'web' | 'whatsapp' */
  origem: string
  notebook_id?: string | null
  notebook_title?: string | null
}

/**
 * Filter documents by origin value.
 * When `origem` is empty string, all documents are returned (no filter).
 */
export function applyOrigemFilter(
  items: DocumentFilterItem[],
  origem: string,
): DocumentFilterItem[] {
  if (!origem) return items
  return items.filter(d => d.origem === origem)
}

/**
 * Toggle an active filter value.
 * If the new value equals the current one, clears the filter (returns '').
 * This mirrors the handleOriginFilter / handleStatusFilter toggle pattern in DocumentList.
 */
export function toggleFilter(current: string, next: string): string {
  return current === next ? '' : next
}

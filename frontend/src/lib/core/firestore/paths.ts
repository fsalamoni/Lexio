export const NOTEBOOK_SEARCH_MEMORY_DOC_ID = 'search_memory'
export const NOTEBOOK_CONTENT_MESSAGES_DOC_ID = 'messages'
export const NOTEBOOK_CONTENT_ARTIFACTS_DOC_ID = 'artifacts'

export function normalizeFirestoreDocumentId(value: string): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) return trimmed

  const documentsMarker = '/documents/'
  if (trimmed.includes(documentsMarker)) {
    const [, pathAfterDocuments = ''] = trimmed.split(documentsMarker)
    const segments = pathAfterDocuments.split('/').filter(Boolean)
    return segments.length > 0 ? segments[segments.length - 1] : trimmed
  }

  const segments = trimmed.split('/').filter(Boolean)
  return segments.length > 1 ? segments[segments.length - 1] : trimmed
}

export function getRefUserId(refPath: string): string | null {
  const parts = refPath.split('/').filter(Boolean)
  if (parts.length >= 2 && parts[0] === 'users') return parts[1]
  return null
}

export function getRefNotebookIdFromSearchMemoryPath(refPath: string): string | null {
  const parts = refPath.split('/').filter(Boolean)
  const notebookIndex = parts.findIndex((part, index) => part === 'research_notebooks' && index < parts.length - 1)
  if (notebookIndex === -1) return null
  return parts[notebookIndex + 1] || null
}

export function buildUserSubcollectionPath(uid: string, collectionName: string): [string, string, string] {
  return ['users', uid, collectionName]
}

export function buildUserSubcollectionDocPath(uid: string, collectionName: string, documentId: string): [string, string, string, string] {
  return [...buildUserSubcollectionPath(uid, collectionName), normalizeFirestoreDocumentId(documentId)]
}

export function buildResearchNotebookDocPath(uid: string, notebookId: string): [string, string, string, string] {
  return buildUserSubcollectionDocPath(uid, 'research_notebooks', notebookId)
}

export function buildNotebookSearchMemoryDocPath(uid: string, notebookId: string): [string, string, string, string, string, string] {
  return [...buildResearchNotebookDocPath(uid, notebookId), 'memory', NOTEBOOK_SEARCH_MEMORY_DOC_ID]
}

export function buildNotebookContentDocPath(uid: string, notebookId: string, contentDocId: string): [string, string, string, string, string, string] {
  return [...buildResearchNotebookDocPath(uid, notebookId), 'content', normalizeFirestoreDocumentId(contentDocId)]
}

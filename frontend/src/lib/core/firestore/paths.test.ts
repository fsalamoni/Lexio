import { describe, expect, it } from 'vitest'

import {
  NOTEBOOK_CONTENT_ARTIFACTS_DOC_ID,
  NOTEBOOK_CONTENT_MESSAGES_DOC_ID,
  NOTEBOOK_SEARCH_MEMORY_DOC_ID,
  buildNotebookContentDocPath,
  buildNotebookSearchMemoryDocPath,
  buildResearchNotebookDocPath,
  buildUserSubcollectionDocPath,
  buildUserSubcollectionPath,
  getRefNotebookIdFromSearchMemoryPath,
  getRefUserId,
  normalizeFirestoreDocumentId,
} from './paths'

describe('core Firestore path helpers', () => {
  it('normalizes Firestore document IDs from ids and full paths', () => {
    expect(normalizeFirestoreDocumentId('abc')).toBe('abc')
    expect(normalizeFirestoreDocumentId(' users/u1/documents/doc-123 ')).toBe('doc-123')
    expect(normalizeFirestoreDocumentId('/users/u1/research_notebooks/notebook-9')).toBe('notebook-9')
    expect(normalizeFirestoreDocumentId('')).toBe('')
  })

  it('extracts owner and notebook IDs from collection group reference paths', () => {
    expect(getRefUserId('users/u1/research_notebooks/n1')).toBe('u1')
    expect(getRefUserId('/users/u2/documents/d1')).toBe('u2')
    expect(getRefUserId('settings/platform')).toBeNull()

    expect(getRefNotebookIdFromSearchMemoryPath('users/u1/research_notebooks/n1/memory/search_memory')).toBe('n1')
    expect(getRefNotebookIdFromSearchMemoryPath('/users/u2/research_notebooks/n2/memory/search_memory')).toBe('n2')
    expect(getRefNotebookIdFromSearchMemoryPath('users/u1/documents/d1')).toBeNull()
  })

  it('builds canonical user-scoped Firestore paths with normalized document IDs', () => {
    expect(buildUserSubcollectionPath('u1', 'documents')).toEqual(['users', 'u1', 'documents'])
    expect(buildUserSubcollectionDocPath('u1', 'documents', 'users/u1/documents/d1')).toEqual(['users', 'u1', 'documents', 'd1'])
    expect(buildResearchNotebookDocPath('u1', '/users/u1/research_notebooks/n1')).toEqual(['users', 'u1', 'research_notebooks', 'n1'])
    expect(buildNotebookSearchMemoryDocPath('u1', '/users/u1/research_notebooks/n1')).toEqual([
      'users',
      'u1',
      'research_notebooks',
      'n1',
      'memory',
      NOTEBOOK_SEARCH_MEMORY_DOC_ID,
    ])
    expect(buildNotebookContentDocPath('u1', '/users/u1/research_notebooks/n1', NOTEBOOK_CONTENT_MESSAGES_DOC_ID)).toEqual([
      'users',
      'u1',
      'research_notebooks',
      'n1',
      'content',
      NOTEBOOK_CONTENT_MESSAGES_DOC_ID,
    ])
    expect(buildNotebookContentDocPath('u1', '/users/u1/research_notebooks/n1', `content/${NOTEBOOK_CONTENT_ARTIFACTS_DOC_ID}`)).toEqual([
      'users',
      'u1',
      'research_notebooks',
      'n1',
      'content',
      NOTEBOOK_CONTENT_ARTIFACTS_DOC_ID,
    ])
  })
})

import { createHash } from 'node:crypto'

export const DEFAULT_LEXIO_TARGET_DATABASE_ID = 'lexio-prod'

export const LEXIO_ROOT_DOCUMENTS = new Set([
  'settings/platform',
])

export const LEXIO_USER_SUBCOLLECTIONS = new Set([
  'profile',
  'settings',
  'documents',
  'theses',
  'thesis_analysis_sessions',
  'acervo',
  'research_notebooks',
  'sidecar_devices',
  'chat_workspace_roots',
  'chat_conversations',
])

export const LEXIO_NESTED_USER_SUBCOLLECTIONS = new Set([
  'memory',
  'turns',
  'workspace_bindings',
  'sidecar_commands',
  'approvals',
  'audit',
])

export const LEXIO_COLLECTION_GROUPS = [
  'documents',
  'theses',
  'thesis_analysis_sessions',
  'acervo',
  'research_notebooks',
  'memory',
  'sidecar_devices',
  'chat_workspace_roots',
  'chat_conversations',
  'turns',
  'workspace_bindings',
  'sidecar_commands',
  'approvals',
  'audit',
]

export function normalizeDocumentPath(documentPath) {
  return String(documentPath || '').replace(/^\/+|\/+$/g, '')
}

export function splitDocumentPath(documentPath) {
  return normalizeDocumentPath(documentPath).split('/').filter(Boolean)
}

export function anonymizeId(value, length = 10) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, length)
}

export function collectionGroupFromPath(documentPath) {
  const segments = splitDocumentPath(documentPath)
  return segments.length >= 2 ? segments[segments.length - 2] : null
}

export function rootCollectionFromPath(documentPath) {
  return splitDocumentPath(documentPath)[0] || null
}

export function userIdFromPath(documentPath) {
  const segments = splitDocumentPath(documentPath)
  return segments[0] === 'users' && segments[1] ? segments[1] : null
}

export function isUserRootPath(documentPath) {
  const segments = splitDocumentPath(documentPath)
  return segments.length === 2 && segments[0] === 'users'
}

export function isLexioKnownUserDocumentPath(documentPath) {
  const segments = splitDocumentPath(documentPath)
  if (segments[0] !== 'users' || !segments[1] || segments.length < 4) return false

  for (let index = 2; index < segments.length; index += 2) {
    const collectionId = segments[index]
    if (index === 2 && LEXIO_USER_SUBCOLLECTIONS.has(collectionId)) return true
    if (index > 2 && LEXIO_NESTED_USER_SUBCOLLECTIONS.has(collectionId)) return true
  }

  return false
}

export function collectLexioUidSignals(documents) {
  const signalsByUid = new Map()

  for (const item of documents || []) {
    const documentPath = normalizeDocumentPath(item.path)
    const uid = userIdFromPath(documentPath)
    if (!uid || isUserRootPath(documentPath)) continue

    const segments = splitDocumentPath(documentPath)
    const firstSubcollection = segments[2]
    if (!firstSubcollection) continue

    if (LEXIO_USER_SUBCOLLECTIONS.has(firstSubcollection) || isLexioKnownUserDocumentPath(documentPath)) {
      if (!signalsByUid.has(uid)) {
        signalsByUid.set(uid, {
          uid,
          uidHash: anonymizeId(uid),
          subcollections: new Set(),
          documentCount: 0,
        })
      }
      const signal = signalsByUid.get(uid)
      signal.subcollections.add(firstSubcollection)
      signal.documentCount += 1
    }
  }

  return new Map([...signalsByUid.entries()].map(([uid, signal]) => [uid, {
    ...signal,
    subcollections: [...signal.subcollections].sort(),
  }]))
}

export function classifyLexioDocumentPath(documentPath, options = {}) {
  const normalizedPath = normalizeDocumentPath(documentPath)
  const segments = splitDocumentPath(normalizedPath)
  const lexioUidSignals = options.lexioUidSignals || new Map()
  const includeAllUserRoots = Boolean(options.includeAllUserRoots)

  if (!normalizedPath) {
    return { category: 'invalid', includeByDefault: false, reason: 'empty_path' }
  }

  if (LEXIO_ROOT_DOCUMENTS.has(normalizedPath)) {
    return { category: 'lexio_root', includeByDefault: true, reason: 'known_lexio_root_document' }
  }

  if (segments[0] === 'users') {
    const uid = segments[1]
    if (!uid) {
      return { category: 'ambiguous', includeByDefault: false, reason: 'users_path_without_uid' }
    }

    if (isUserRootPath(normalizedPath)) {
      if (includeAllUserRoots) {
        return { category: 'lexio_user_root_forced', includeByDefault: true, reason: 'include_all_user_roots_enabled' }
      }
      if (lexioUidSignals.has(uid)) {
        return { category: 'lexio_user_root_with_signals', includeByDefault: true, reason: 'uid_has_lexio_descendants' }
      }
      return { category: 'ambiguous_user_root', includeByDefault: false, reason: 'uid_has_no_known_lexio_descendants' }
    }

    const firstSubcollection = segments[2]
    if (LEXIO_USER_SUBCOLLECTIONS.has(firstSubcollection) || isLexioKnownUserDocumentPath(normalizedPath)) {
      return { category: 'lexio_user_data', includeByDefault: true, reason: `known_user_subcollection:${firstSubcollection}` }
    }

    return { category: 'unknown_user_data', includeByDefault: false, reason: `unknown_user_subcollection:${firstSubcollection || 'missing'}` }
  }

  return { category: 'unknown_top_level', includeByDefault: false, reason: `unknown_top_level:${segments[0] || 'missing'}` }
}

export function selectLexioDocuments(documents, options = {}) {
  const lexioUidSignals = collectLexioUidSignals(documents)
  const included = []
  const excluded = []

  for (const item of documents || []) {
    const classification = classifyLexioDocumentPath(item.path, {
      ...options,
      lexioUidSignals,
    })
    const classified = {
      ...item,
      classification,
    }
    if (classification.includeByDefault) included.push(classified)
    else excluded.push(classified)
  }

  included.sort((left, right) => normalizeDocumentPath(left.path).localeCompare(normalizeDocumentPath(right.path)))
  excluded.sort((left, right) => normalizeDocumentPath(left.path).localeCompare(normalizeDocumentPath(right.path)))

  return { included, excluded, lexioUidSignals }
}

export function summarizeBy(items, getKey) {
  const counts = {}
  for (const item of items || []) {
    const key = getKey(item) || 'unknown'
    counts[key] = (counts[key] || 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

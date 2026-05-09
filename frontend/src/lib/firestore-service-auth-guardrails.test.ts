import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./firestore-service.ts', import.meta.url), 'utf-8')
const generationServiceSource = readFileSync(new URL('./generation-service.ts', import.meta.url), 'utf-8')
const platformAnalyticsSource = readFileSync(new URL('./platform-analytics.ts', import.meta.url), 'utf-8')
const acervoRepositorySource = readFileSync(new URL('./modules/acervo/repository.ts', import.meta.url), 'utf-8')
const documentsRepositorySource = readFileSync(new URL('./modules/documents/repository.ts', import.meta.url), 'utf-8')
const chatRepositorySource = readFileSync(new URL('./modules/chat/repository.ts', import.meta.url), 'utf-8')
const notebookRepositorySource = readFileSync(new URL('./modules/notebook/repository.ts', import.meta.url), 'utf-8')
const profileRepositorySource = readFileSync(new URL('./modules/profile/repository.ts', import.meta.url), 'utf-8')
const settingsRepositorySource = readFileSync(new URL('./modules/settings/repository.ts', import.meta.url), 'utf-8')
const thesesRepositorySource = readFileSync(new URL('./modules/theses/repository.ts', import.meta.url), 'utf-8')
const firestoreRepositoryBoundarySource = `${source}\n${acervoRepositorySource}\n${documentsRepositorySource}\n${chatRepositorySource}\n${notebookRepositorySource}\n${profileRepositorySource}\n${settingsRepositorySource}\n${thesesRepositorySource}`
const firestoreBoundarySource = `${source}\n${platformAnalyticsSource}\n${acervoRepositorySource}\n${documentsRepositorySource}\n${chatRepositorySource}\n${notebookRepositorySource}\n${profileRepositorySource}\n${settingsRepositorySource}\n${thesesRepositorySource}`

describe('firestore-service auth guardrails', () => {
  it('avoids raw user-scoped read calls with unresolved uid', () => {
    const forbiddenReadPatterns = [
      /getDocs\(\s*query\(\s*collection\(db,\s*['\"]users['\"],\s*uid,/,
      /getDocs\(\s*collection\(db,\s*['\"]users['\"],\s*uid,/,
      /getDoc\(\s*doc\(db,\s*['\"]users['\"],\s*uid,/,
    ]

    for (const pattern of forbiddenReadPatterns) {
      expect(firestoreRepositoryBoundarySource).not.toMatch(pattern)
    }
  })

  it('keeps auth-hardened read entrypoints wired to effective uid resolution', () => {
    const requiredGuards = [
      /resolveEffectiveUid\(uid,\s*'getDocument'\)/,
      /resolveEffectiveUid\(uid,\s*'listDocuments'\)/,
      /resolveEffectiveUid\(uid,\s*'listTheses'\)/,
      /resolveEffectiveUid\(uid,\s*'getThesisStats'\)/,
      /resolveEffectiveUid\(uid,\s*'getAcervoAnalysisStatus'\)/,
      /resolveEffectiveUid\(uid,\s*'getResearchNotebook'\)/,
      /resolveEffectiveUid\(uid,\s*'listResearchNotebooks'\)/,
      /resolveEffectiveUid\(uid,\s*'getProfile'\)/,
      /resolveEffectiveUid\(uid,\s*'getUserSettings'\)/,
      /resolveEffectiveUid\(uid,\s*'listChatConversations'\)/,
      /resolveEffectiveUid\(uid,\s*'getChatConversation'\)/,
      /resolveEffectiveUid\(uid,\s*'createChatConversation'\)/,
      /resolveEffectiveUid\(uid,\s*'ensureChatConversation'\)/,
      /resolveEffectiveUid\(uid,\s*'renameChatConversation'\)/,
      /resolveEffectiveUid\(uid,\s*'updateChatConversationEffort'\)/,
      /resolveEffectiveUid\(uid,\s*'updateChatConversationPreview'\)/,
      /resolveEffectiveUid\(uid,\s*'deleteChatConversation'\)/,
      /resolveEffectiveUid\(uid,\s*'listChatTurns'\)/,
      /resolveEffectiveUid\(uid,\s*'appendChatTurn'\)/,
      /resolveEffectiveUid\(uid,\s*'updateChatTurn'\)/,
      /resolveEffectiveUid\(uid,\s*'saveChatSidecarDevice'\)/,
      /resolveEffectiveUid\(uid,\s*'listChatSidecarDevices'\)/,
      /resolveEffectiveUid\(uid,\s*'saveChatWorkspaceRoot'\)/,
      /resolveEffectiveUid\(uid,\s*'listChatWorkspaceRoots'\)/,
      /resolveEffectiveUid\(uid,\s*'bindChatWorkspaceRoot'\)/,
      /resolveEffectiveUid\(uid,\s*'listChatWorkspaceBindings'\)/,
      /resolveEffectiveUid\(uid,\s*'createChatSidecarCommand'\)/,
      /resolveEffectiveUid\(uid,\s*'updateChatSidecarCommand'\)/,
      /resolveEffectiveUid\(uid,\s*'createChatApprovalRequest'\)/,
      /resolveEffectiveUid\(uid,\s*'updateChatApprovalRequest'\)/,
      /resolveEffectiveUid\(uid,\s*'appendChatSidecarAuditEntry'\)/,
    ]

    for (const pattern of requiredGuards) {
      expect(firestoreRepositoryBoundarySource).toMatch(pattern)
    }
  })

  it('does not allow sign-out side effects inside Firestore retry layer', () => {
    const retryLayerStart = source.indexOf('async function withFirestoreRetry')
    const retryLayerEnd = source.indexOf('const settingsRepository')
    const retryLayer = retryLayerStart >= 0 && retryLayerEnd > retryLayerStart
      ? source.slice(retryLayerStart, retryLayerEnd)
      : source
    const platformRetryLayerStart = platformAnalyticsSource.indexOf('async function withPlatformFirestoreRetry')
    const platformRetryLayerEnd = platformAnalyticsSource.indexOf('function round6')
    const platformRetryLayer = platformRetryLayerStart >= 0 && platformRetryLayerEnd > platformRetryLayerStart
      ? platformAnalyticsSource.slice(platformRetryLayerStart, platformRetryLayerEnd)
      : platformAnalyticsSource
    const retryBoundary = `${retryLayer}\n${platformRetryLayer}`

    expect(retryBoundary).not.toMatch(/signOut\s*\(/)
    expect(retryBoundary).not.toMatch(/firebaseLogout\s*\(/)
  })

  it('keeps platform and admin reads behind Firestore retry helpers', () => {
    const requiredRetryContexts = [
      'getSettings',
      'getLegacySettingsDocData.',
      'loadPlatformCollections.users',
      'loadPlatformCollections.documents',
      'loadPlatformCollections.theses',
      'loadPlatformCollections.thesisAnalysisSessions',
      'loadPlatformCollections.acervo',
      'loadPlatformCollections.researchNotebooks',
      'loadPlatformCollections.notebookSearchMemory',
      'backfillNotebookSearchMemoryAcrossPlatform.notebooks',
      'backfillNotebookSearchMemoryAcrossPlatform.memory.',
    ]

    for (const contextLabel of requiredRetryContexts) {
      expect(firestoreBoundarySource).toContain(contextLabel)
    }

    expect(firestoreBoundarySource).not.toMatch(/await\s+getDocs\(\s*collectionGroup/)
    expect(firestoreBoundarySource).not.toMatch(/await\s+getDoc\(\s*doc\(db,\s*['"]settings['"]/)
  })

  it('keeps legacy document generation persistence behind user-scoped writes', () => {
    expect(generationServiceSource).toContain('writeUserScoped(uid, contextLabel')
    expect(generationServiceSource).toContain("'generateDocument.start'")
    expect(generationServiceSource).toContain("'generateDocument.persistTema'")
    expect(generationServiceSource).toContain("'generateDocument.complete'")
    expect(generationServiceSource).toContain("'generateDocument.error'")
    expect(generationServiceSource).not.toMatch(/doc\(firestore,\s*['"]users['"],\s*uid,\s*['"]documents['"],\s*docId\)/)
  })

  it('keeps global settings writes behind the shared Firestore retry helper', () => {
    expect(settingsRepositorySource).toMatch(/async function saveSettings[\s\S]*deps\.withFirestoreRetry\(\s*\(\)\s*=>\s*setDoc\(ref,/)
  })
})

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore'

import { normalizeFirestoreDocumentId } from '../../core/firestore'
import { LEGACY_RECOVERED_CONVERSATION_TITLE } from '../../chat-conversation-integrity'
import type {
  ChatAgentWorkPackage,
  ChatApprovalRequestData,
  ChatArtifactData,
  ChatArtifactExportData,
  ChatArtifactVersionData,
  ChatConversationData,
  ChatEffortLevel,
  ChatSidecarPermission,
  ChatSidecarAuditEntryData,
  ChatSidecarCommandData,
  ChatSidecarDeviceData,
  ChatTurnData,
  ChatWorkspaceBindingData,
  ChatWorkspaceRootData,
} from '../../firestore-types'

export type ChatRepositoryDependencies = {
  ensureFirestore: () => Firestore
  resolveEffectiveUid: (uid: string, contextLabel: string) => Promise<string>
  withFirestoreRetry: <T>(operation: () => Promise<T>, contextLabel: string) => Promise<T>
  isAuthAccessFirestoreError: (error: unknown) => boolean
  getErrorMessage: (error: unknown) => string
  getCreatedAtValue: (value: unknown) => number
  stripUndefined: <T extends Record<string, unknown>>(value: T) => T
}

type ChatConversationInput = Partial<Pick<ChatConversationData, 'title' | 'effort' | 'sidecar_root_path' | 'last_preview'>>

const CHAT_CONVERSATIONS_COLLECTION = 'chat_conversations'
const CHAT_TURNS_SUBCOLLECTION = 'turns'
const SIDECAR_DEVICES_COLLECTION = 'sidecar_devices'
const CHAT_WORKSPACE_ROOTS_COLLECTION = 'chat_workspace_roots'
const CHAT_WORKSPACE_BINDINGS_SUBCOLLECTION = 'workspace_bindings'
const CHAT_SIDECAR_COMMANDS_SUBCOLLECTION = 'sidecar_commands'
const CHAT_APPROVALS_SUBCOLLECTION = 'approvals'
const CHAT_AUDIT_SUBCOLLECTION = 'audit'
const CHAT_WORK_PACKAGES_SUBCOLLECTION = 'work_packages'
const CHAT_ARTIFACTS_SUBCOLLECTION = 'artifacts'
const CHAT_ARTIFACT_VERSIONS_SUBCOLLECTION = 'artifact_versions'
const CHAT_ARTIFACT_EXPORTS_SUBCOLLECTION = 'artifact_exports'
const DEFAULT_CHAT_EFFORT: ChatEffortLevel = 'medio'
const MAX_APPROVAL_COMMAND_IDS = 25
const MAX_APPROVAL_TITLE_CHARS = 160
const MAX_APPROVAL_SUMMARY_CHARS = 2_000
const MAX_APPROVAL_ACTOR_CHARS = 120
const ALLOWED_APPROVAL_PERMISSIONS: ChatSidecarPermission[] = ['read', 'write', 'delete', 'rename', 'execute', 'network']

function resolveConversationTitleForRepair(data: ChatConversationInput): string {
  return data.title?.trim() || LEGACY_RECOVERED_CONVERSATION_TITLE
}

function chatConversationCollection(db: Firestore, uid: string) {
  return collection(db, 'users', uid, CHAT_CONVERSATIONS_COLLECTION)
}

function chatConversationDoc(db: Firestore, uid: string, conversationId: string) {
  return doc(
    db,
    'users',
    uid,
    CHAT_CONVERSATIONS_COLLECTION,
    normalizeFirestoreDocumentId(conversationId),
  )
}

function chatTurnsCollection(db: Firestore, uid: string, conversationId: string) {
  return collection(
    db,
    'users',
    uid,
    CHAT_CONVERSATIONS_COLLECTION,
    normalizeFirestoreDocumentId(conversationId),
    CHAT_TURNS_SUBCOLLECTION,
  )
}

function userSubcollection(db: Firestore, uid: string, name: string) {
  return collection(db, 'users', uid, name)
}

function userSubcollectionDoc(db: Firestore, uid: string, name: string, documentId: string) {
  return doc(db, 'users', uid, name, normalizeFirestoreDocumentId(documentId))
}

function sanitizeChatApprovalRequestData(
  data: Omit<ChatApprovalRequestData, 'id' | 'conversation_id' | 'created_at' | 'updated_at' | 'status'> & { status?: ChatApprovalRequestData['status'] },
): Omit<ChatApprovalRequestData, 'id' | 'conversation_id' | 'created_at' | 'updated_at'> {
  return {
    command_ids: normalizeApprovalCommandIds(data.command_ids),
    status: normalizeApprovalStatus(data.status),
    title: clipApprovalText(data.title, MAX_APPROVAL_TITLE_CHARS) || 'Aprovar ação do chat',
    summary: clipApprovalText(data.summary, MAX_APPROVAL_SUMMARY_CHARS) || 'O orquestrador precisa de aprovação explícita para prosseguir.',
    risk_level: normalizeApprovalRisk(data.risk_level),
    requested_permissions: normalizeApprovalPermissions(data.requested_permissions),
    expires_at: normalizeOptionalIsoLike(data.expires_at),
    decided_at: normalizeOptionalIsoLike(data.decided_at),
    decided_by: clipApprovalText(data.decided_by, MAX_APPROVAL_ACTOR_CHARS) || undefined,
  }
}

function sanitizeChatApprovalUpdateData(data: Partial<ChatApprovalRequestData>): Partial<ChatApprovalRequestData> {
  return {
    command_ids: data.command_ids ? normalizeApprovalCommandIds(data.command_ids) : undefined,
    status: data.status ? normalizeApprovalStatus(data.status) : undefined,
    title: data.title != null ? (clipApprovalText(data.title, MAX_APPROVAL_TITLE_CHARS) || undefined) : undefined,
    summary: data.summary != null ? (clipApprovalText(data.summary, MAX_APPROVAL_SUMMARY_CHARS) || undefined) : undefined,
    risk_level: data.risk_level ? normalizeApprovalRisk(data.risk_level) : undefined,
    requested_permissions: data.requested_permissions ? normalizeApprovalPermissions(data.requested_permissions) : undefined,
    expires_at: normalizeOptionalIsoLike(data.expires_at),
    decided_at: normalizeOptionalIsoLike(data.decided_at),
    decided_by: data.decided_by != null ? (clipApprovalText(data.decided_by, MAX_APPROVAL_ACTOR_CHARS) || undefined) : undefined,
  }
}

function normalizeApprovalCommandIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : []
  const unique = new Set<string>()
  for (const item of raw) {
    const normalized = normalizeFirestoreDocumentId(String(item || '').trim())
    if (normalized) unique.add(normalized)
    if (unique.size >= MAX_APPROVAL_COMMAND_IDS) break
  }
  return [...unique]
}

function normalizeApprovalStatus(value: unknown): ChatApprovalRequestData['status'] {
  if (value === 'approved' || value === 'rejected' || value === 'expired' || value === 'cancelled') return value
  return 'pending'
}

function normalizeApprovalRisk(value: unknown): ChatApprovalRequestData['risk_level'] {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return 'medium'
}

function normalizeApprovalPermissions(value: unknown): ChatSidecarPermission[] {
  const raw = Array.isArray(value) ? value : []
  const normalized = raw
    .map(item => String(item || '').trim().toLowerCase())
    .filter((item): item is ChatSidecarPermission => ALLOWED_APPROVAL_PERMISSIONS.includes(item as ChatSidecarPermission))
  return normalized.length ? [...new Set(normalized)] : ['network']
}

function normalizeOptionalIsoLike(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return clipApprovalText(trimmed, 64)
}

function clipApprovalText(value: unknown, maxChars: number): string {
  const text = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(0, maxChars - 15)).trimEnd()}...[truncado]`
}

function chatConversationSubcollection(db: Firestore, uid: string, conversationId: string, name: string) {
  return collection(
    db,
    'users',
    uid,
    CHAT_CONVERSATIONS_COLLECTION,
    normalizeFirestoreDocumentId(conversationId),
    name,
  )
}

function chatConversationSubcollectionDoc(
  db: Firestore,
  uid: string,
  conversationId: string,
  name: string,
  documentId: string,
) {
  return doc(
    db,
    'users',
    uid,
    CHAT_CONVERSATIONS_COLLECTION,
    normalizeFirestoreDocumentId(conversationId),
    name,
    normalizeFirestoreDocumentId(documentId),
  )
}

function chatTurnDoc(db: Firestore, uid: string, conversationId: string, turnId: string) {
  return doc(
    db,
    'users',
    uid,
    CHAT_CONVERSATIONS_COLLECTION,
    normalizeFirestoreDocumentId(conversationId),
    CHAT_TURNS_SUBCOLLECTION,
    normalizeFirestoreDocumentId(turnId),
  )
}

export function createChatRepository(deps: ChatRepositoryDependencies) {
  async function listChatConversations(
    uid: string,
    opts?: { startAfter?: string; limit?: number },
  ): Promise<{ items: ChatConversationData[]; hasMore?: boolean }> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'listChatConversations')
    const colRef = chatConversationCollection(db, effectiveUid)
    const pageLimit = Math.max(1, Math.min(50, opts?.limit ?? 50))
    const constraints: QueryConstraint[] = [orderBy('updated_at', 'desc'), limit(pageLimit + 1)]
    if (opts?.startAfter) {
      const cursorRef = chatConversationDoc(db, effectiveUid, opts.startAfter)
      const cursorSnap = await deps.withFirestoreRetry(() => getDoc(cursorRef), 'listChatConversations.cursor')
      if (cursorSnap.exists()) {
        constraints.push(startAfter(cursorSnap))
      }
    }
    try {
      const snap = await deps.withFirestoreRetry(
        () => getDocs(query(colRef, ...constraints)),
        'listChatConversations.query',
      )
      const docs = snap.docs
      const hasMore = docs.length > pageLimit
      const visibleDocs = docs.filter(docSnapshot => !docSnapshot.data().deleted_at)
      const items = visibleDocs.slice(0, pageLimit).map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ChatConversationData))
      return { items, hasMore }
    } catch (error) {
      if (deps.isAuthAccessFirestoreError(error)) {
        throw error
      }
      console.warn(
        'Firestore chat conversations query failed; using client-side fallback:',
        deps.getErrorMessage(error),
      )
      const fallbackSnap = await deps.withFirestoreRetry(
        () => getDocs(colRef),
        'listChatConversations.fallback',
      )
      const allItems = fallbackSnap.docs
        .map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ChatConversationData))
        .filter(item => !item.deleted_at)
        .sort((left, right) => deps.getCreatedAtValue(right.updated_at ?? right.created_at)
          - deps.getCreatedAtValue(left.updated_at ?? left.created_at))
      const startIdx = opts?.startAfter
        ? allItems.findIndex(item => item.id === opts.startAfter)
        : 0
      const slice = startIdx >= 0 ? allItems.slice(startIdx + 1, startIdx + 1 + pageLimit + 1) : allItems.slice(0, pageLimit + 1)
      const hasMore = slice.length > pageLimit
      return { items: slice.slice(0, pageLimit), hasMore }
    }
  }

  async function getChatConversation(uid: string, conversationId: string): Promise<ChatConversationData | null> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'getChatConversation')
    const ref = chatConversationDoc(db, effectiveUid, conversationId)
    const snap = await deps.withFirestoreRetry(() => getDoc(ref), 'getChatConversation')
    if (!snap.exists()) return null
    return { id: snap.id, ...snap.data() } as ChatConversationData
  }

  async function createChatConversation(uid: string, data: ChatConversationInput = {}): Promise<string> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'createChatConversation')
    const now = new Date().toISOString()
    const sanitized = deps.stripUndefined({
      title: data.title?.trim() || 'Nova conversa',
      effort: (data.effort ?? DEFAULT_CHAT_EFFORT) as ChatEffortLevel,
      sidecar_root_path: data.sidecar_root_path,
      last_preview: data.last_preview ?? '',
      created_at: now,
      updated_at: now,
    })
    const ref = await deps.withFirestoreRetry(
      () => addDoc(chatConversationCollection(db, effectiveUid), sanitized),
      'createChatConversation.write',
    )
    return ref.id
  }

  async function ensureChatConversation(
    uid: string,
    conversationId: string,
    data: ChatConversationInput = {},
  ): Promise<ChatConversationData> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'ensureChatConversation')
    const normalizedConversationId = normalizeFirestoreDocumentId(conversationId)
    const ref = chatConversationDoc(db, effectiveUid, normalizedConversationId)
    const now = new Date().toISOString()
    const snap = await deps.withFirestoreRetry(() => getDoc(ref), 'ensureChatConversation.read')

    if (snap.exists()) {
      const existing = { id: snap.id, ...snap.data() } as ChatConversationData
      const patch = deps.stripUndefined({
        ...(existing.title ? {} : { title: resolveConversationTitleForRepair(data) }),
        ...(existing.effort ? {} : { effort: data.effort ?? DEFAULT_CHAT_EFFORT }),
        ...(existing.created_at ? {} : { created_at: now }),
        ...(existing.updated_at ? {} : { updated_at: now }),
        ...(existing.last_preview !== undefined || data.last_preview === undefined ? {} : { last_preview: data.last_preview }),
        ...(existing.sidecar_root_path !== undefined || data.sidecar_root_path === undefined ? {} : { sidecar_root_path: data.sidecar_root_path }),
      })
      if (Object.keys(patch).length > 0) {
        await deps.withFirestoreRetry(() => setDoc(ref, patch, { merge: true }), 'ensureChatConversation.repair')
      }
      return { ...existing, ...patch }
    }

    const created = deps.stripUndefined({
      title: resolveConversationTitleForRepair(data),
      effort: data.effort ?? DEFAULT_CHAT_EFFORT,
      sidecar_root_path: data.sidecar_root_path,
      last_preview: data.last_preview ?? '',
      created_at: now,
      updated_at: now,
    }) as Omit<ChatConversationData, 'id'>
    await deps.withFirestoreRetry(() => setDoc(ref, created, { merge: true }), 'ensureChatConversation.create')
    return { id: normalizedConversationId, ...created }
  }

  async function renameChatConversation(uid: string, conversationId: string, title: string): Promise<void> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'renameChatConversation')
    const ref = chatConversationDoc(db, effectiveUid, conversationId)
    const trimmed = title.trim() || 'Nova conversa'
    await deps.withFirestoreRetry(
      () => updateDoc(ref, { title: trimmed, updated_at: new Date().toISOString() }),
      'renameChatConversation.update',
    )
  }

  async function updateChatConversationEffort(uid: string, conversationId: string, effort: ChatEffortLevel): Promise<void> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'updateChatConversationEffort')
    const ref = chatConversationDoc(db, effectiveUid, conversationId)
    await deps.withFirestoreRetry(
      () => updateDoc(ref, { effort, updated_at: new Date().toISOString() }),
      'updateChatConversationEffort.update',
    )
  }

  async function updateChatConversationPreview(uid: string, conversationId: string, preview: string): Promise<void> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'updateChatConversationPreview')
    const ref = chatConversationDoc(db, effectiveUid, conversationId)
    const trimmed = preview.length > 240 ? `${preview.slice(0, 237)}…` : preview
    await ensureChatConversation(effectiveUid, conversationId, { last_preview: trimmed })
    await deps.withFirestoreRetry(
      () => updateDoc(ref, { last_preview: trimmed, updated_at: new Date().toISOString() }),
      'updateChatConversationPreview.update',
    )
  }

  async function deleteChatConversation(uid: string, conversationId: string): Promise<void> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'deleteChatConversation')
    const now = new Date().toISOString()
    await deps.withFirestoreRetry(
      () => setDoc(chatConversationDoc(db, effectiveUid, conversationId), {
        deleted_at: now,
        deleted_by: effectiveUid,
        updated_at: now,
      }, { merge: true }),
      'deleteChatConversation.archive',
    )
  }

  async function listChatTurns(uid: string, conversationId: string): Promise<{ items: ChatTurnData[] }> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'listChatTurns')
    const colRef = chatTurnsCollection(db, effectiveUid, conversationId)
    try {
      const snap = await deps.withFirestoreRetry(
        () => getDocs(query(colRef, orderBy('created_at', 'asc'))),
        'listChatTurns.query',
      )
      return {
        items: snap.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ChatTurnData)),
      }
    } catch (error) {
      if (deps.isAuthAccessFirestoreError(error)) throw error
      console.warn('Firestore chat turns query failed; using client-side fallback:', deps.getErrorMessage(error))
      const fallbackSnap = await deps.withFirestoreRetry(() => getDocs(colRef), 'listChatTurns.fallback')
      const items = fallbackSnap.docs
        .map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ChatTurnData))
        .sort((left, right) => deps.getCreatedAtValue(left.created_at) - deps.getCreatedAtValue(right.created_at))
      return { items }
    }
  }

  async function appendChatTurn(
    uid: string,
    conversationId: string,
    data: Omit<ChatTurnData, 'id' | 'created_at'> & { created_at?: string },
  ): Promise<string> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'appendChatTurn')
    const now = data.created_at ?? new Date().toISOString()
    await ensureChatConversation(effectiveUid, conversationId, {
      title: data.user_input ? data.user_input.slice(0, 80) : 'Nova conversa',
    })
    const sanitized = deps.stripUndefined({
      ...data,
      conversation_id: conversationId,
      trail: data.trail ?? [],
      assistant_markdown: data.assistant_markdown ?? null,
      status: data.status,
      created_at: now,
    })
    const ref = await deps.withFirestoreRetry(
      () => addDoc(chatTurnsCollection(db, effectiveUid, conversationId), sanitized),
      'appendChatTurn.write',
    )
    try {
      await deps.withFirestoreRetry(
        () => updateDoc(chatConversationDoc(db, effectiveUid, conversationId), { updated_at: now }),
        'appendChatTurn.bumpConversation',
      )
    } catch (error) {
      if (deps.isAuthAccessFirestoreError(error)) throw error
      console.warn('Chat: failed to bump conversation updated_at; repairing parent document:', deps.getErrorMessage(error))
      await ensureChatConversation(effectiveUid, conversationId, {
        title: data.user_input ? data.user_input.slice(0, 80) : 'Nova conversa',
      })
    }
    return ref.id
  }

  async function updateChatTurn(uid: string, conversationId: string, turnId: string, data: Partial<ChatTurnData>): Promise<void> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'updateChatTurn')
    const ref = chatTurnDoc(db, effectiveUid, conversationId, turnId)
    const { id, conversation_id, ...rest } = data
    void id
    void conversation_id
    const sanitized = deps.stripUndefined({ ...rest })
    await deps.withFirestoreRetry(() => updateDoc(ref, sanitized), 'updateChatTurn.update')
    if (data.status === 'done' || data.status === 'error' || data.status === 'cancelled') {
      try {
        await deps.withFirestoreRetry(
          () => updateDoc(chatConversationDoc(db, effectiveUid, conversationId), {
            updated_at: new Date().toISOString(),
          }),
          'updateChatTurn.bumpConversation',
        )
      } catch (error) {
        if (deps.isAuthAccessFirestoreError(error)) throw error
        console.warn('Chat: failed to bump conversation after turn finalisation; repairing parent document:', deps.getErrorMessage(error))
        await ensureChatConversation(effectiveUid, conversationId)
      }
    }
  }

  async function persistChatAgentWorkPackage(
    uid: string,
    conversationId: string,
    workPackage: ChatAgentWorkPackage,
  ): Promise<ChatAgentWorkPackage> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'persistChatAgentWorkPackage')
    const now = new Date().toISOString()
    await ensureChatConversation(effectiveUid, conversationId)

    const packageId = normalizeFirestoreDocumentId(workPackage.id || [
      workPackage.turn_id,
      workPackage.agent_key,
      workPackage.completed_at || workPackage.created_at || now,
    ].join('-'))
    const normalizedPackage: ChatAgentWorkPackage = deps.stripUndefined({
      ...workPackage,
      id: packageId,
      conversation_id: normalizeFirestoreDocumentId(conversationId),
      completed_at: workPackage.completed_at ?? now,
    })

    await deps.withFirestoreRetry(
      () => setDoc(
        chatConversationSubcollectionDoc(db, effectiveUid, conversationId, CHAT_WORK_PACKAGES_SUBCOLLECTION, packageId),
        normalizedPackage,
        { merge: true },
      ),
      'persistChatAgentWorkPackage.package',
    )

    await Promise.all((normalizedPackage.artifacts ?? []).map(async (artifact) => {
      const artifactId = normalizeFirestoreDocumentId(artifact.artifact_id)
      const artifactData: ChatArtifactData = deps.stripUndefined({
        ...artifact,
        artifact_id: artifactId,
        logical_document_id: normalizeFirestoreDocumentId(artifact.logical_document_id),
        conversation_id: normalizeFirestoreDocumentId(conversationId),
        turn_id: normalizeFirestoreDocumentId(workPackage.turn_id),
        created_by_agent_key: workPackage.agent_key,
        created_at: workPackage.created_at || now,
        updated_at: now,
      })
      const versionId = normalizeFirestoreDocumentId(`${artifactData.logical_document_id}-v${artifactData.version}`)
      const versionData: ChatArtifactVersionData = deps.stripUndefined({ ...artifactData, version_id: versionId })

      await Promise.all([
        deps.withFirestoreRetry(
          () => setDoc(
            chatConversationSubcollectionDoc(db, effectiveUid, conversationId, CHAT_ARTIFACTS_SUBCOLLECTION, artifactId),
            artifactData,
            { merge: true },
          ),
          'persistChatAgentWorkPackage.artifact',
        ),
        deps.withFirestoreRetry(
          () => setDoc(
            chatConversationSubcollectionDoc(db, effectiveUid, conversationId, CHAT_ARTIFACT_VERSIONS_SUBCOLLECTION, versionId),
            versionData,
            { merge: true },
          ),
          'persistChatAgentWorkPackage.version',
        ),
        ...((artifact.exports ?? []).map((exportRef) => {
          const exportId = normalizeFirestoreDocumentId(exportRef.export_id || `${artifactId}-${exportRef.format}-${exportRef.label}`)
          const exportData: ChatArtifactExportData = deps.stripUndefined({
            ...exportRef,
            id: exportId,
            conversation_id: normalizeFirestoreDocumentId(conversationId),
            turn_id: normalizeFirestoreDocumentId(workPackage.turn_id),
            artifact_id: artifactId,
            logical_document_id: artifactData.logical_document_id,
            version: artifactData.version,
            created_at: now,
            updated_at: now,
          })
          return deps.withFirestoreRetry(
            () => setDoc(
              chatConversationSubcollectionDoc(db, effectiveUid, conversationId, CHAT_ARTIFACT_EXPORTS_SUBCOLLECTION, exportId),
              exportData,
              { merge: true },
            ),
            'persistChatAgentWorkPackage.export',
          )
        })),
      ])
    }))

    return normalizedPackage
  }

  async function saveChatSidecarDevice(
    uid: string,
    data: Omit<ChatSidecarDeviceData, 'paired_at'> & { paired_at?: string },
  ): Promise<string> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'saveChatSidecarDevice')
    const now = new Date().toISOString()
    const { id, ...rest } = data
    const sanitized = deps.stripUndefined({
      ...rest,
      label: rest.label?.trim() || 'Lexio Sidecar',
      capabilities: rest.capabilities ?? ['read'],
      status: rest.status ?? 'offline',
      paired_at: rest.paired_at ?? now,
      last_seen_at: rest.last_seen_at ?? now,
    })

    if (id) {
      const normalizedId = normalizeFirestoreDocumentId(id)
      await deps.withFirestoreRetry(
        () => setDoc(userSubcollectionDoc(db, effectiveUid, SIDECAR_DEVICES_COLLECTION, normalizedId), sanitized, { merge: true }),
        'saveChatSidecarDevice.set',
      )
      return normalizedId
    }

    const ref = await deps.withFirestoreRetry(
      () => addDoc(userSubcollection(db, effectiveUid, SIDECAR_DEVICES_COLLECTION), sanitized),
      'saveChatSidecarDevice.add',
    )
    return ref.id
  }

  async function listChatSidecarDevices(uid: string): Promise<{ items: ChatSidecarDeviceData[] }> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'listChatSidecarDevices')
    const colRef = userSubcollection(db, effectiveUid, SIDECAR_DEVICES_COLLECTION)
    const snap = await deps.withFirestoreRetry(
      () => getDocs(query(colRef, orderBy('last_seen_at', 'desc'))),
      'listChatSidecarDevices.query',
    )
    return { items: snap.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ChatSidecarDeviceData)) }
  }

  async function saveChatWorkspaceRoot(
    uid: string,
    data: Omit<ChatWorkspaceRootData, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string },
  ): Promise<string> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'saveChatWorkspaceRoot')
    const now = new Date().toISOString()
    const { id, ...rest } = data
    const sanitized = deps.stripUndefined({
      ...rest,
      label: rest.label?.trim() || 'Workspace',
      permissions: rest.permissions ?? ['read'],
      approval_policy: rest.approval_policy ?? 'always',
      sync_enabled: rest.sync_enabled ?? true,
      created_at: rest.created_at ?? now,
      updated_at: now,
    })

    if (id) {
      const normalizedId = normalizeFirestoreDocumentId(id)
      await deps.withFirestoreRetry(
        () => setDoc(userSubcollectionDoc(db, effectiveUid, CHAT_WORKSPACE_ROOTS_COLLECTION, normalizedId), sanitized, { merge: true }),
        'saveChatWorkspaceRoot.set',
      )
      return normalizedId
    }

    const ref = await deps.withFirestoreRetry(
      () => addDoc(userSubcollection(db, effectiveUid, CHAT_WORKSPACE_ROOTS_COLLECTION), sanitized),
      'saveChatWorkspaceRoot.add',
    )
    return ref.id
  }

  async function listChatWorkspaceRoots(uid: string): Promise<{ items: ChatWorkspaceRootData[] }> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'listChatWorkspaceRoots')
    const colRef = userSubcollection(db, effectiveUid, CHAT_WORKSPACE_ROOTS_COLLECTION)
    const snap = await deps.withFirestoreRetry(
      () => getDocs(query(colRef, orderBy('updated_at', 'desc'))),
      'listChatWorkspaceRoots.query',
    )
    return { items: snap.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ChatWorkspaceRootData)) }
  }

  async function bindChatWorkspaceRoot(
    uid: string,
    conversationId: string,
    root: Pick<ChatWorkspaceBindingData, 'root_id' | 'provider' | 'label' | 'permissions' | 'approval_policy'>,
  ): Promise<string> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'bindChatWorkspaceRoot')
    const now = new Date().toISOString()
    await ensureChatConversation(effectiveUid, conversationId)
    const bindingId = normalizeFirestoreDocumentId(root.root_id)
    const sanitized = deps.stripUndefined({
      conversation_id: normalizeFirestoreDocumentId(conversationId),
      root_id: bindingId,
      provider: root.provider,
      label: root.label?.trim() || root.provider,
      permissions: root.permissions,
      approval_policy: root.approval_policy,
      created_at: now,
      updated_at: now,
    })
    await deps.withFirestoreRetry(
      () => setDoc(chatConversationSubcollectionDoc(db, effectiveUid, conversationId, CHAT_WORKSPACE_BINDINGS_SUBCOLLECTION, bindingId), sanitized, { merge: true }),
      'bindChatWorkspaceRoot.set',
    )
    return bindingId
  }

  async function listChatWorkspaceBindings(uid: string, conversationId: string): Promise<{ items: ChatWorkspaceBindingData[] }> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'listChatWorkspaceBindings')
    const colRef = chatConversationSubcollection(db, effectiveUid, conversationId, CHAT_WORKSPACE_BINDINGS_SUBCOLLECTION)
    const snap = await deps.withFirestoreRetry(
      () => getDocs(query(colRef, orderBy('updated_at', 'desc'))),
      'listChatWorkspaceBindings.query',
    )
    return { items: snap.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ChatWorkspaceBindingData)) }
  }

  async function createChatSidecarCommand(
    uid: string,
    conversationId: string,
    data: Omit<ChatSidecarCommandData, 'id' | 'conversation_id' | 'created_at' | 'updated_at' | 'status'> & { status?: ChatSidecarCommandData['status'] },
  ): Promise<string> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'createChatSidecarCommand')
    const now = new Date().toISOString()
    await ensureChatConversation(effectiveUid, conversationId)
    const sanitized = deps.stripUndefined({
      ...data,
      conversation_id: normalizeFirestoreDocumentId(conversationId),
      status: data.status ?? 'waiting_approval',
      created_at: now,
      updated_at: now,
    })
    const ref = await deps.withFirestoreRetry(
      () => addDoc(chatConversationSubcollection(db, effectiveUid, conversationId, CHAT_SIDECAR_COMMANDS_SUBCOLLECTION), sanitized),
      'createChatSidecarCommand.add',
    )
    return ref.id
  }

  async function updateChatSidecarCommand(
    uid: string,
    conversationId: string,
    commandId: string,
    data: Partial<ChatSidecarCommandData>,
  ): Promise<void> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'updateChatSidecarCommand')
    const { id, conversation_id, created_at, ...rest } = data
    void id
    void conversation_id
    void created_at
    await deps.withFirestoreRetry(
      () => updateDoc(
        chatConversationSubcollectionDoc(db, effectiveUid, conversationId, CHAT_SIDECAR_COMMANDS_SUBCOLLECTION, commandId),
        deps.stripUndefined({ ...rest, updated_at: new Date().toISOString() }),
      ),
      'updateChatSidecarCommand.update',
    )
  }

  async function createChatApprovalRequest(
    uid: string,
    conversationId: string,
    data: Omit<ChatApprovalRequestData, 'id' | 'conversation_id' | 'created_at' | 'updated_at' | 'status'> & { status?: ChatApprovalRequestData['status'] },
  ): Promise<string> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'createChatApprovalRequest')
    const now = new Date().toISOString()
    await ensureChatConversation(effectiveUid, conversationId)
    const approval = sanitizeChatApprovalRequestData(data)
    const sanitized = deps.stripUndefined({
      ...approval,
      conversation_id: normalizeFirestoreDocumentId(conversationId),
      status: approval.status ?? 'pending',
      created_at: now,
      updated_at: now,
    })
    const ref = await deps.withFirestoreRetry(
      () => addDoc(chatConversationSubcollection(db, effectiveUid, conversationId, CHAT_APPROVALS_SUBCOLLECTION), sanitized),
      'createChatApprovalRequest.add',
    )
    return ref.id
  }

  async function updateChatApprovalRequest(
    uid: string,
    conversationId: string,
    approvalId: string,
    data: Partial<ChatApprovalRequestData>,
  ): Promise<void> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'updateChatApprovalRequest')
    const { id, conversation_id, created_at, ...rest } = data
    void id
    void conversation_id
    void created_at
    const sanitizedRest = sanitizeChatApprovalUpdateData(rest)
    await deps.withFirestoreRetry(
      () => updateDoc(
        chatConversationSubcollectionDoc(db, effectiveUid, conversationId, CHAT_APPROVALS_SUBCOLLECTION, approvalId),
        deps.stripUndefined({ ...sanitizedRest, updated_at: new Date().toISOString() }),
      ),
      'updateChatApprovalRequest.update',
    )
  }

  async function appendChatSidecarAuditEntry(
    uid: string,
    conversationId: string,
    data: Omit<ChatSidecarAuditEntryData, 'id' | 'conversation_id' | 'created_at'> & { created_at?: string },
  ): Promise<string> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'appendChatSidecarAuditEntry')
    await ensureChatConversation(effectiveUid, conversationId)
    const sanitized = deps.stripUndefined({
      ...data,
      conversation_id: normalizeFirestoreDocumentId(conversationId),
      created_at: data.created_at ?? new Date().toISOString(),
    })
    const ref = await deps.withFirestoreRetry(
      () => addDoc(chatConversationSubcollection(db, effectiveUid, conversationId, CHAT_AUDIT_SUBCOLLECTION), sanitized),
      'appendChatSidecarAuditEntry.add',
    )
    return ref.id
  }

  return {
    listChatConversations,
    getChatConversation,
    createChatConversation,
    ensureChatConversation,
    renameChatConversation,
    updateChatConversationEffort,
    updateChatConversationPreview,
    deleteChatConversation,
    listChatTurns,
    appendChatTurn,
    updateChatTurn,
    persistChatAgentWorkPackage,
    saveChatSidecarDevice,
    listChatSidecarDevices,
    saveChatWorkspaceRoot,
    listChatWorkspaceRoots,
    bindChatWorkspaceRoot,
    listChatWorkspaceBindings,
    createChatSidecarCommand,
    updateChatSidecarCommand,
    createChatApprovalRequest,
    updateChatApprovalRequest,
    appendChatSidecarAuditEntry,
  }
}

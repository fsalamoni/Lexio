import type {
  ChatAgentWorkPackage,
  ChatArtifactExportRef,
  ChatArtifactFormat,
  ChatArtifactRef,
  ChatDeliverableBundle,
  ChatDeliverableItem,
  ChatExportRetryState,
  ChatTrailEvent,
  ChatTurnData,
} from './firestore-types'

export interface ChatExportRetryRequest {
  turnId: string
  artifactId: string
  format: ChatArtifactFormat
  exportId?: string
}

interface ArtifactEntry {
  artifact: ChatArtifactRef
  agentKey?: string
}

export function buildChatDeliverableBundleForTurn(turn: ChatTurnData): ChatDeliverableBundle | null {
  return buildChatDeliverableBundle({
    conversationId: turn.conversation_id,
    turnId: turn.id ?? turn.conversation_id,
    trail: turn.trail,
    createdAt: turn.completed_at ?? turn.created_at,
  })
}

export function buildChatDeliverableBundle(args: {
  conversationId: string
  turnId: string
  trail: ChatTrailEvent[]
  createdAt: string
}): ChatDeliverableBundle | null {
  const entries = collectLatestDeliverableArtifacts(args.trail)
  if (!entries.length) return null

  const items = entries
    .sort((a, b) => a.artifact.title.localeCompare(b.artifact.title, 'pt-BR'))
    .map(({ artifact, agentKey }) => buildDeliverableItem(artifact, agentKey))

  const counts = countBundleExports(items)
  const status = resolveBundleStatus(counts)
  return {
    bundle_id: `${args.turnId}-deliverables`,
    conversation_id: args.conversationId,
    turn_id: args.turnId,
    title: 'Arquivos gerados',
    status,
    items,
    ready_count: counts.ready,
    failed_count: counts.failed,
    planned_count: counts.planned,
    unavailable_count: counts.unavailable,
    created_at: args.createdAt,
    updated_at: new Date().toISOString(),
  }
}

export function buildRetryState(args: {
  artifact: ChatArtifactRef
  format: ChatArtifactFormat
  exportId?: string
  status: ChatExportRetryState['status']
  error?: string
}): ChatExportRetryState {
  const now = new Date().toISOString()
  return {
    retry_id: `${args.artifact.artifact_id}-${args.format}-${Date.now()}`,
    artifact_id: args.artifact.artifact_id,
    logical_document_id: args.artifact.logical_document_id,
    export_id: args.exportId,
    format: args.format,
    status: args.status,
    requested_at: now,
    completed_at: args.status === 'ready' || args.status === 'failed' ? now : undefined,
    error: args.error,
  }
}

export function findWorkPackageForExportRetry(
  turn: ChatTurnData,
  request: ChatExportRetryRequest,
): ChatAgentWorkPackage | null {
  for (let index = turn.trail.length - 1; index >= 0; index -= 1) {
    const event = turn.trail[index]
    if (event.type !== 'agent_work_package') continue
    if ((event.package.artifacts ?? []).some(artifact => artifact.artifact_id === request.artifactId)) {
      return event.package
    }
  }
  return null
}

export function prepareWorkPackageForExportRetry(
  workPackage: ChatAgentWorkPackage,
  request: ChatExportRetryRequest,
): ChatAgentWorkPackage {
  return {
    ...workPackage,
    artifacts: (workPackage.artifacts ?? []).map(artifact => {
      if (artifact.artifact_id !== request.artifactId) return artifact
      const exports = ensureExportForRetry(artifact, request)
      return { ...artifact, exports }
    }),
  }
}

export function replaceWorkPackageInTrail(
  trail: ChatTrailEvent[],
  updatedPackage: ChatAgentWorkPackage,
): ChatTrailEvent[] {
  let replaced = false
  const next = trail.map(event => {
    if (event.type !== 'agent_work_package') return event
    const samePackage = Boolean(updatedPackage.id && event.package.id === updatedPackage.id)
    const sameArtifact = (event.package.artifacts ?? []).some(artifact =>
      (updatedPackage.artifacts ?? []).some(updated => updated.artifact_id === artifact.artifact_id),
    )
    if (!replaced && (samePackage || sameArtifact)) {
      replaced = true
      return { ...event, package: updatedPackage }
    }
    return event
  })
  return replaced ? next : trail
}

export function appendOrReplaceBundleEvent(trail: ChatTrailEvent[], bundle: ChatDeliverableBundle): ChatTrailEvent[] {
  const next = trail.filter(event => event.type !== 'deliverable_bundle_ready')
  return [...next, { type: 'deliverable_bundle_ready', bundle, ts: new Date().toISOString() }]
}

export function findArtifactInWorkPackage(
  workPackage: ChatAgentWorkPackage,
  artifactId: string,
): ChatArtifactRef | null {
  return (workPackage.artifacts ?? []).find(artifact => artifact.artifact_id === artifactId) ?? null
}

function collectLatestDeliverableArtifacts(trail: ChatTrailEvent[]): ArtifactEntry[] {
  const byLogicalId = new Map<string, ArtifactEntry>()

  for (const event of trail) {
    if (event.type === 'agent_work_package') {
      for (const artifact of event.package.artifacts ?? []) {
        if (artifact.is_latest === false) continue
        upsertArtifact(byLogicalId, artifact, event.package.agent_key)
      }
    }
    if (event.type === 'agent_artifact_created' || event.type === 'agent_artifact_updated') {
      if (event.artifact.is_latest === false) continue
      upsertArtifact(byLogicalId, event.artifact, event.agent_key)
    }
  }

  return [...byLogicalId.values()]
}

function upsertArtifact(
  byLogicalId: Map<string, ArtifactEntry>,
  artifact: ChatArtifactRef,
  agentKey?: string,
): void {
  const current = byLogicalId.get(artifact.logical_document_id)
  if (!current || artifact.version >= current.artifact.version) {
    byLogicalId.set(artifact.logical_document_id, { artifact, agentKey })
  }
}

function buildDeliverableItem(artifact: ChatArtifactRef, agentKey?: string): ChatDeliverableItem {
  const exports = normalizeDisplayExports(artifact)
  return {
    item_id: `${artifact.artifact_id}-v${artifact.version}`,
    artifact_id: artifact.artifact_id,
    logical_document_id: artifact.logical_document_id,
    title: artifact.title,
    kind: artifact.kind,
    format: artifact.format,
    version: artifact.version,
    source_agent_key: agentKey,
    summary: artifact.summary,
    primary_download_url: artifact.download_url,
    exports,
    status: resolveItemStatus(exports),
  }
}

function normalizeDisplayExports(artifact: ChatArtifactRef): ChatArtifactExportRef[] {
  const exports = [...(artifact.exports ?? [])]
  if (artifact.download_url && !exports.some(exportRef => exportRef.download_url === artifact.download_url)) {
    exports.unshift({
      label: artifact.format.toUpperCase(),
      format: artifact.format,
      status: 'ready',
      download_url: artifact.download_url,
      storage_path: artifact.storage_path,
      mime_type: artifact.mime_type,
      extension: artifact.extension,
    })
  }
  return exports
}

function countBundleExports(items: ChatDeliverableItem[]) {
  return items.reduce((acc, item) => {
    if (!item.exports.length) {
      if (item.status === 'ready') acc.ready += 1
      else if (item.status === 'failed') acc.failed += 1
      else if (item.status === 'unavailable') acc.unavailable += 1
      else acc.planned += 1
      return acc
    }
    for (const exportRef of item.exports) {
      if (exportRef.status === 'ready' && exportRef.download_url) acc.ready += 1
      else if (exportRef.status === 'failed') acc.failed += 1
      else if (exportRef.status === 'unavailable') acc.unavailable += 1
      else acc.planned += 1
    }
    return acc
  }, { ready: 0, failed: 0, planned: 0, unavailable: 0 })
}

function resolveBundleStatus(counts: ReturnType<typeof countBundleExports>): ChatDeliverableBundle['status'] {
  if (counts.ready > 0 && counts.failed + counts.planned + counts.unavailable === 0) return 'ready'
  if (counts.ready > 0) return 'partial'
  if (counts.failed > 0) return 'failed'
  if (counts.planned > 0) return 'planned'
  return 'unavailable'
}

function resolveItemStatus(exports: ChatArtifactExportRef[]): ChatDeliverableItem['status'] {
  if (!exports.length) return 'planned'
  const ready = exports.filter(exportRef => exportRef.status === 'ready' && exportRef.download_url).length
  const failed = exports.filter(exportRef => exportRef.status === 'failed').length
  const planned = exports.filter(exportRef => exportRef.status === 'planned' || exportRef.status === 'retrying').length
  const unavailable = exports.filter(exportRef => exportRef.status === 'unavailable').length
  if (ready > 0 && failed + planned + unavailable === 0) return 'ready'
  if (ready > 0) return 'partial'
  if (failed > 0) return 'failed'
  if (planned > 0) return 'planned'
  return 'unavailable'
}

function ensureExportForRetry(artifact: ChatArtifactRef, request: ChatExportRetryRequest): ChatArtifactExportRef[] {
  const exports = [...(artifact.exports ?? [])]
  const matchIndex = exports.findIndex(exportRef =>
    (request.exportId && exportRef.export_id === request.exportId)
    || (!request.exportId && exportRef.format === request.format),
  )

  if (matchIndex >= 0) {
    const current = exports[matchIndex]
    exports[matchIndex] = {
      ...current,
      status: 'retrying',
      reason: undefined,
      download_url: current.status === 'ready' ? current.download_url : undefined,
      storage_path: current.status === 'ready' ? current.storage_path : undefined,
      attempt_count: (current.attempt_count ?? 0) + 1,
      last_attempt_at: new Date().toISOString(),
    }
    return exports
  }

  return [
    ...exports,
    {
      label: request.format.toUpperCase(),
      format: request.format,
      status: 'retrying',
      attempt_count: 1,
      last_attempt_at: new Date().toISOString(),
    },
  ]
}

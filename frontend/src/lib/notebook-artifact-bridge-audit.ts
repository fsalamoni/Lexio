import { isStructuredArtifactType, parseArtifactContent, type ParsedArtifact } from './artifact-parsers'
import type { ChatArtifactExportRef, StudioArtifact, StudioArtifactType } from './firestore-types'

export type NotebookArtifactBridgeStatus = 'ready' | 'partial' | 'needs_action' | 'invalid'
export type NotebookArtifactParseStatus = 'structured' | 'markdown' | 'invalid'

export interface NotebookArtifactExportAudit {
  total: number
  ready: number
  storageBackedReady: number
  failed: number
  planned: number
  unavailable: number
  needsMaterialization: boolean
}

export interface NotebookArtifactMediaAudit {
  kind: 'none' | 'visual' | 'audio' | 'video' | 'presentation_v2'
  totalUnits: number
  storedUnits: number
  pendingUnits: number
  failedUnits: number
  hasFinalMedia: boolean
  multimodalStatus?: 'ok' | 'review' | 'critical'
  exportReadinessStatus?: 'ok' | 'review' | 'critical'
}

export interface NotebookArtifactBridgeAuditItem {
  artifactId: string
  title: string
  type: StudioArtifactType
  status: NotebookArtifactBridgeStatus
  parseStatus: NotebookArtifactParseStatus
  exports: NotebookArtifactExportAudit
  media: NotebookArtifactMediaAudit
  issues: string[]
  recommendations: string[]
}

export interface NotebookArtifactBridgeAuditSummary {
  totalArtifacts: number
  readyArtifacts: number
  partialArtifacts: number
  needsActionArtifacts: number
  invalidArtifacts: number
  readyExports: number
  failedExports: number
  plannedExports: number
  storageBackedExports: number
  mediaReadyArtifacts: number
  issues: string[]
  recommendations: string[]
  items: NotebookArtifactBridgeAuditItem[]
}

const STRUCTURED_TYPES_WITH_MARKDOWN_FALLBACK = new Set<StudioArtifactType>([
  'resumo',
  'relatorio',
  'documento',
  'guia_estruturado',
  'outro',
  'video_production',
])

export function auditNotebookArtifactBridge(artifact: StudioArtifact): NotebookArtifactBridgeAuditItem {
  const parsed = parseArtifactContent(artifact.type, artifact.content)
  const parseStatus = resolveParseStatus(artifact.type, parsed)
  const exports = auditArtifactExports(artifact.exports)
  const media = auditArtifactMedia(artifact, parsed)
  const issues: string[] = []
  const recommendations: string[] = []

  if (parseStatus === 'invalid') {
    issues.push('structured_parse_failed')
    recommendations.push('regenerate_structured_artifact')
  }

  if (exports.needsMaterialization) {
    issues.push('exports_not_ready')
    recommendations.push('materialize_exports')
  }
  if (exports.failed > 0) {
    issues.push('export_failed')
    recommendations.push('retry_failed_exports')
  }

  if (media.failedUnits > 0) {
    issues.push('media_failed')
    recommendations.push('regenerate_failed_media')
  }
  if (media.pendingUnits > 0 && media.storedUnits === 0) {
    issues.push('media_not_materialized')
    recommendations.push('generate_media_assets')
  }
  if (media.multimodalStatus === 'critical') {
    issues.push('presentation_v2_multimodal_critical')
    recommendations.push('review_presentation_v2_assets')
  }
  if (media.exportReadinessStatus === 'critical') {
    issues.push('presentation_v2_export_blocked')
    recommendations.push('resolve_presentation_v2_export_readiness')
  }

  const status = resolveArtifactBridgeStatus({ parseStatus, exports, media, issues })

  return {
    artifactId: artifact.id,
    title: artifact.title,
    type: artifact.type,
    status,
    parseStatus,
    exports,
    media,
    issues: uniqueStrings(issues),
    recommendations: uniqueStrings(recommendations),
  }
}

export function auditNotebookArtifactBridges(artifacts: StudioArtifact[]): NotebookArtifactBridgeAuditSummary {
  const items = artifacts.map(auditNotebookArtifactBridge)
  const issues = uniqueStrings(items.flatMap(item => item.issues)).slice(0, 12)
  const recommendations = uniqueStrings(items.flatMap(item => item.recommendations)).slice(0, 12)

  return {
    totalArtifacts: items.length,
    readyArtifacts: items.filter(item => item.status === 'ready').length,
    partialArtifacts: items.filter(item => item.status === 'partial').length,
    needsActionArtifacts: items.filter(item => item.status === 'needs_action').length,
    invalidArtifacts: items.filter(item => item.status === 'invalid').length,
    readyExports: items.reduce((sum, item) => sum + item.exports.ready, 0),
    failedExports: items.reduce((sum, item) => sum + item.exports.failed, 0),
    plannedExports: items.reduce((sum, item) => sum + item.exports.planned, 0),
    storageBackedExports: items.reduce((sum, item) => sum + item.exports.storageBackedReady, 0),
    mediaReadyArtifacts: items.filter(item => item.media.hasFinalMedia).length,
    issues,
    recommendations,
    items,
  }
}

function resolveParseStatus(type: StudioArtifactType, parsed: ParsedArtifact): NotebookArtifactParseStatus {
  if (parsed.kind !== 'markdown') return 'structured'
  if (!isStructuredArtifactType(type) || STRUCTURED_TYPES_WITH_MARKDOWN_FALLBACK.has(type)) return 'markdown'
  return 'invalid'
}

function auditArtifactExports(exports: ChatArtifactExportRef[] | undefined): NotebookArtifactExportAudit {
  const refs = exports ?? []
  const ready = refs.filter(exportRef => exportRef.status === 'ready' && Boolean(exportRef.download_url || exportRef.storage_path))
  const failed = refs.filter(exportRef => exportRef.status === 'failed')
  const planned = refs.filter(exportRef => exportRef.status === 'planned' || exportRef.status === 'retrying')
  const unavailable = refs.filter(exportRef => exportRef.status === 'unavailable')

  return {
    total: refs.length,
    ready: ready.length,
    storageBackedReady: ready.filter(exportRef => Boolean(exportRef.storage_path)).length,
    failed: failed.length,
    planned: planned.length,
    unavailable: unavailable.length,
    needsMaterialization: refs.length === 0 || refs.some(exportRef => exportRef.status !== 'ready' || !exportRef.download_url),
  }
}

function auditArtifactMedia(artifact: StudioArtifact, parsed: ParsedArtifact): NotebookArtifactMediaAudit {
  switch (parsed.kind) {
    case 'presentation': {
      const storedUnits = parsed.data.slides.filter(slide => Boolean(slide.renderedImageUrl || slide.renderedImageStoragePath)).length
      return {
        kind: 'visual',
        totalUnits: parsed.data.slides.length,
        storedUnits,
        pendingUnits: Math.max(0, parsed.data.slides.length - storedUnits),
        failedUnits: 0,
        hasFinalMedia: storedUnits > 0,
      }
    }
    case 'presentation_v2': {
      const assets = collectPresentationV2Assets(parsed.data)
      const storedUnits = assets.filter(isStoredMediaUnit).length
      const failedUnits = assets.filter(asset => asset.status === 'failed').length
      const pendingUnits = assets.filter(asset => !isStoredMediaUnit(asset) && asset.status !== 'failed' && asset.status !== 'skipped').length
      const renderedSlideCount = parsed.data.presentation.slides.filter(slide => Boolean(slide.renderedImageUrl || slide.renderedImageStoragePath)).length
      return {
        kind: 'presentation_v2',
        totalUnits: assets.length || parsed.data.deck.slides.length,
        storedUnits: storedUnits + renderedSlideCount,
        pendingUnits,
        failedUnits,
        hasFinalMedia: storedUnits > 0 || renderedSlideCount > 0,
        multimodalStatus: normalizeAuditStatus(parsed.data.deck.quality?.multimodalAudit?.status),
        exportReadinessStatus: normalizeAuditStatus(parsed.data.deck.quality?.exportReadiness?.status),
      }
    }
    case 'mindmap':
      return auditRootVisualMedia(Boolean(parsed.data.renderedImageUrl || parsed.data.renderedImageStoragePath))
    case 'datatable':
      return auditRootVisualMedia(Boolean(parsed.data.renderedImageUrl || parsed.data.renderedImageStoragePath))
    case 'infographic':
      return auditRootVisualMedia(Boolean(parsed.data.renderedImageUrl || parsed.data.renderedImageStoragePath))
    case 'audio_script': {
      const hasFinalMedia = Boolean(parsed.data.audioUrl || parsed.data.audioStoragePath)
      return { kind: 'audio', totalUnits: parsed.data.segments.length, storedUnits: hasFinalMedia ? 1 : 0, pendingUnits: hasFinalMedia ? 0 : 1, failedUnits: 0, hasFinalMedia }
    }
    case 'video_script': {
      const hasFinalMedia = Boolean(parsed.data.renderedVideoUrl || parsed.data.renderedVideoStoragePath)
      return { kind: 'video', totalUnits: parsed.data.scenes.length, storedUnits: hasFinalMedia ? 1 : 0, pendingUnits: hasFinalMedia ? 0 : 1, failedUnits: 0, hasFinalMedia }
    }
    default:
      if (artifact.type === 'video_production') return auditVideoProductionContent(artifact.content)
      return { kind: 'none', totalUnits: 0, storedUnits: 0, pendingUnits: 0, failedUnits: 0, hasFinalMedia: false }
  }
}

function auditRootVisualMedia(hasFinalMedia: boolean): NotebookArtifactMediaAudit {
  return { kind: 'visual', totalUnits: 1, storedUnits: hasFinalMedia ? 1 : 0, pendingUnits: hasFinalMedia ? 0 : 1, failedUnits: 0, hasFinalMedia }
}

function auditVideoProductionContent(content: string): NotebookArtifactMediaAudit {
  try {
    const production = JSON.parse(content) as {
      renderedVideo?: { url?: string; storagePath?: string }
      renderedScopes?: Array<{ url?: string; storagePath?: string }>
      sceneAssets?: Array<{
        imageUrl?: string
        imageStoragePath?: string
        narrationUrl?: string
        narrationStoragePath?: string
        videoClips?: Array<{ url?: string; storagePath?: string }>
      }>
    }
    const finalVideoReady = Boolean(production.renderedVideo?.url || production.renderedVideo?.storagePath)
    const renderedScopes = production.renderedScopes ?? []
    const sceneAssets = production.sceneAssets ?? []
    const storedSceneMedia = sceneAssets.reduce((sum, scene) => {
      const sceneReady = Number(Boolean(scene.imageUrl || scene.imageStoragePath))
        + Number(Boolean(scene.narrationUrl || scene.narrationStoragePath))
        + (scene.videoClips ?? []).filter(clip => Boolean(clip.url || clip.storagePath)).length
      return sum + sceneReady
    }, 0)
    const storedUnits = Number(finalVideoReady)
      + renderedScopes.filter(scope => Boolean(scope.url || scope.storagePath)).length
      + storedSceneMedia

    return {
      kind: 'video',
      totalUnits: Math.max(1, renderedScopes.length + sceneAssets.length + Number(finalVideoReady)),
      storedUnits,
      pendingUnits: storedUnits > 0 ? 0 : 1,
      failedUnits: 0,
      hasFinalMedia: finalVideoReady || storedUnits > 0,
    }
  } catch {
    return { kind: 'video', totalUnits: 1, storedUnits: 0, pendingUnits: 0, failedUnits: 1, hasFinalMedia: false }
  }
}

function collectPresentationV2Assets(data: Extract<ParsedArtifact, { kind: 'presentation_v2' }>['data']) {
  const byId = new Map<string, typeof data.assets[number]>()
  for (const asset of data.assets) byId.set(asset.id, asset)
  for (const slide of data.deck.slides) {
    for (const asset of slide.assets || []) byId.set(asset.id, asset)
  }
  return [...byId.values()]
}

function isStoredMediaUnit(asset: { status?: string; url?: string; storagePath?: string }): boolean {
  return asset.status === 'stored' || Boolean(asset.url || asset.storagePath)
}

function normalizeAuditStatus(value: unknown): 'ok' | 'review' | 'critical' | undefined {
  return value === 'ok' || value === 'review' || value === 'critical' ? value : undefined
}

function resolveArtifactBridgeStatus(args: {
  parseStatus: NotebookArtifactParseStatus
  exports: NotebookArtifactExportAudit
  media: NotebookArtifactMediaAudit
  issues: string[]
}): NotebookArtifactBridgeStatus {
  if (args.parseStatus === 'invalid') return 'invalid'
  if (args.exports.failed > 0 || args.media.failedUnits > 0 || args.media.exportReadinessStatus === 'critical' || args.media.multimodalStatus === 'critical') return 'needs_action'
  if (args.exports.needsMaterialization || args.media.pendingUnits > 0) {
    return args.exports.ready > 0 || args.media.storedUnits > 0 ? 'partial' : 'needs_action'
  }
  return 'ready'
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

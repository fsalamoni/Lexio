import { parseArtifactContent } from './artifact-parsers'
import type { PresentationV2Deck, PresentationV2Slide, PresentationV2SlideAsset, StudioArtifact } from './firestore-types'

const INLINE_MEDIA_URL_PATTERN = /^(data|blob):/i
const PERSISTED_MEDIA_URL_MAX_LENGTH = 32768
const MAX_TEXT_FIELD_LENGTH = 6000
const MAX_ASSET_PROMPT_LENGTH = 1200
const MAX_ASSET_NEGATIVE_PROMPT_LENGTH = 600
const MAX_QUALITY_ENTRY_LENGTH = 500
const MAX_QUALITY_ENTRIES = 8
const MAX_REVISION_HISTORY_ENTRIES = 12
const MAX_PRESENTATION_V2_CONTENT_BYTES = 850_000
const textEncoder = new TextEncoder()

function byteLength(value: string): number {
  return textEncoder.encode(value).length
}

function compactText(value: string | undefined, maxLength: number): string | undefined {
  if (typeof value !== 'string' || value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function compactTextList(values: string[] | undefined, maxEntries = MAX_QUALITY_ENTRIES, maxLength = MAX_QUALITY_ENTRY_LENGTH): string[] | undefined {
  if (!Array.isArray(values)) return values
  return values
    .slice(0, maxEntries)
    .map(value => compactText(value, maxLength) || '')
    .filter(Boolean)
}

function isNonPersistableMediaUrl(value: unknown): value is string {
  return typeof value === 'string' && (
    INLINE_MEDIA_URL_PATTERN.test(value.trim()) ||
    value.length > PERSISTED_MEDIA_URL_MAX_LENGTH
  )
}

function sanitizeAssetForFirestore(asset: PresentationV2SlideAsset): PresentationV2SlideAsset {
  const sanitized: PresentationV2SlideAsset = {
    ...asset,
    prompt: compactText(asset.prompt, MAX_ASSET_PROMPT_LENGTH),
    negativePrompt: compactText(asset.negativePrompt, MAX_ASSET_NEGATIVE_PROMPT_LENGTH),
    qualityWarnings: compactTextList(asset.qualityWarnings),
    altText: compactText(asset.altText, MAX_QUALITY_ENTRY_LENGTH),
    error: compactText(asset.error, MAX_QUALITY_ENTRY_LENGTH),
    url: isNonPersistableMediaUrl(asset.url) ? undefined : asset.url,
    storagePath: isNonPersistableMediaUrl(asset.storagePath) ? undefined : asset.storagePath,
  }

  if (asset.status === 'stored' && !sanitized.url && !sanitized.storagePath) {
    sanitized.status = 'generated'
  }

  return sanitized
}

function sanitizeSlideForFirestore(slide: PresentationV2Slide): PresentationV2Slide {
  return {
    ...slide,
    purpose: compactText(slide.purpose, MAX_TEXT_FIELD_LENGTH),
    speakerNotes: compactText(slide.speakerNotes, MAX_TEXT_FIELD_LENGTH) || '',
    visualBrief: compactText(slide.visualBrief, MAX_TEXT_FIELD_LENGTH),
    designNotes: compactTextList(slide.designNotes),
    renderedImageUrl: isNonPersistableMediaUrl(slide.renderedImageUrl) ? undefined : slide.renderedImageUrl,
    renderedImageStoragePath: isNonPersistableMediaUrl(slide.renderedImageStoragePath) ? undefined : slide.renderedImageStoragePath,
    assets: (slide.assets || []).map(sanitizeAssetForFirestore),
  }
}

type MediaFieldGroup = {
  urlFields: string[]
  storagePathFields: string[]
}

function sanitizeStructuredMediaFields<T extends Record<string, unknown>>(
  value: T,
  fieldGroups: MediaFieldGroup[],
): T {
  const sanitized: Record<string, unknown> = { ...value }

  for (const group of fieldGroups) {
    for (const urlField of group.urlFields) {
      if (isNonPersistableMediaUrl(sanitized[urlField])) {
        sanitized[urlField] = undefined
      }
    }
    for (const storagePathField of group.storagePathFields) {
      if (isNonPersistableMediaUrl(sanitized[storagePathField])) {
        sanitized[storagePathField] = undefined
      }
    }
  }

  return sanitized as T
}

function sanitizeJsonArtifactContent(
  raw: string,
  sanitizer: (value: Record<string, unknown>) => Record<string, unknown>,
): string | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return JSON.stringify(sanitizer(parsed))
  } catch {
    return null
  }
}

function sanitizeLegacyPresentationSlide(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  return sanitizeStructuredMediaFields(value as Record<string, unknown>, [
    {
      urlFields: ['renderedImageUrl', 'rendered_image_url'],
      storagePathFields: ['renderedImageStoragePath', 'rendered_image_storage_path'],
    },
  ])
}

function trySanitizeLegacyPresentationArtifactContent(raw: string): string | null {
  const parsed = parseArtifactContent('apresentacao', raw)
  if (parsed.kind !== 'presentation') return null

  return sanitizeJsonArtifactContent(raw, (value) => ({
    ...value,
    slides: Array.isArray(value.slides) ? value.slides.map(sanitizeLegacyPresentationSlide) : value.slides,
  }))
}

function sanitizeStructuredArtifactRootMediaContent(
  artifactType: StudioArtifact['type'],
  raw: string,
): string | null {
  const parsed = parseArtifactContent(artifactType, raw)
  if (parsed.kind === 'markdown') return null

  const mediaFields: Record<StudioArtifact['type'], MediaFieldGroup[] | undefined> = {
    resumo: undefined,
    apresentacao: undefined,
    apresentacao_v2: undefined,
    mapa_mental: [
      {
        urlFields: ['renderedImageUrl', 'rendered_image_url'],
        storagePathFields: ['renderedImageStoragePath', 'rendered_image_storage_path'],
      },
    ],
    cartoes_didaticos: undefined,
    infografico: [
      {
        urlFields: ['renderedImageUrl', 'rendered_image_url'],
        storagePathFields: ['renderedImageStoragePath', 'rendered_image_storage_path'],
      },
    ],
    teste: undefined,
    relatorio: undefined,
    tabela_dados: [
      {
        urlFields: ['renderedImageUrl', 'rendered_image_url'],
        storagePathFields: ['renderedImageStoragePath', 'rendered_image_storage_path'],
      },
    ],
    documento: undefined,
    audio_script: [
      {
        urlFields: ['audioUrl', 'audio_url'],
        storagePathFields: ['audioStoragePath', 'audio_storage_path'],
      },
    ],
    video_script: [
      {
        urlFields: ['renderedVideoUrl', 'rendered_video_url'],
        storagePathFields: ['renderedVideoStoragePath', 'rendered_video_storage_path'],
      },
    ],
    video_production: undefined,
    guia_estruturado: undefined,
    outro: undefined,
  }

  const fieldGroups = mediaFields[artifactType]
  if (!fieldGroups?.length) return null
  return sanitizeJsonArtifactContent(raw, value => sanitizeStructuredMediaFields(value, fieldGroups))
}

function mergeDeckAssets(deckAssets: PresentationV2SlideAsset[] = [], slides: PresentationV2Slide[] = []): PresentationV2SlideAsset[] {
  const merged = new Map<string, PresentationV2SlideAsset>()
  for (const asset of deckAssets) {
    merged.set(asset.id, sanitizeAssetForFirestore(asset))
  }
  for (const asset of slides.flatMap(slide => slide.assets || [])) {
    merged.set(asset.id, sanitizeAssetForFirestore(asset))
  }
  return Array.from(merged.values())
}

function compactPresentationV2DeckForFirestore(deck: PresentationV2Deck): PresentationV2Deck {
  const slideAssetIds = new Set(deck.slides.flatMap(slide => (slide.assets || []).map(asset => asset.id)))
  return {
    ...deck,
    generationSpec: {
      ...deck.generationSpec,
      request: compactText(deck.generationSpec.request, MAX_TEXT_FIELD_LENGTH) || deck.generationSpec.request,
      objective: compactText(deck.generationSpec.objective, MAX_TEXT_FIELD_LENGTH),
      audience: compactText(deck.generationSpec.audience, MAX_TEXT_FIELD_LENGTH),
      tone: compactText(deck.generationSpec.tone, MAX_QUALITY_ENTRY_LENGTH),
      sourcePriority: compactTextList(deck.generationSpec.sourcePriority),
    },
    outline: {
      ...deck.outline,
      narrativeArc: compactText(deck.outline.narrativeArc, MAX_TEXT_FIELD_LENGTH) || deck.outline.narrativeArc,
    },
    quality: deck.quality ? {
      ...deck.quality,
      strengths: compactTextList(deck.quality.strengths),
      warnings: compactTextList(deck.quality.warnings),
      accessibility: compactTextList(deck.quality.accessibility),
      legalAccuracyNotes: compactTextList(deck.quality.legalAccuracyNotes),
      repairSummary: compactTextList(deck.quality.repairSummary),
      deckRubric: deck.quality.deckRubric ? {
        ...deck.quality.deckRubric,
        strengths: compactTextList(deck.quality.deckRubric.strengths),
        warnings: compactTextList(deck.quality.deckRubric.warnings),
      } : deck.quality.deckRubric,
      slideRubric: deck.quality.slideRubric?.slice(0, deck.slides.length).map(item => ({
        ...item,
        strengths: compactTextList(item.strengths),
        warnings: compactTextList(item.warnings),
        repairHints: compactTextList(item.repairHints),
      })),
      multimodalAudit: deck.quality.multimodalAudit ? {
        ...deck.quality.multimodalAudit,
        strengths: compactTextList(deck.quality.multimodalAudit.strengths),
        warnings: compactTextList(deck.quality.multimodalAudit.warnings),
      } : deck.quality.multimodalAudit,
      exportReadiness: deck.quality.exportReadiness ? {
        ...deck.quality.exportReadiness,
        blockingIssues: compactTextList(deck.quality.exportReadiness.blockingIssues),
        accessibilityNotes: compactTextList(deck.quality.exportReadiness.accessibilityNotes),
        legalAccuracyNotes: compactTextList(deck.quality.exportReadiness.legalAccuracyNotes),
        warnings: compactTextList(deck.quality.exportReadiness.warnings),
      } : deck.quality.exportReadiness,
    } : deck.quality,
    revisionHistory: deck.revisionHistory?.slice(-MAX_REVISION_HISTORY_ENTRIES).map(entry => ({
      ...entry,
      summary: compactText(entry.summary, MAX_QUALITY_ENTRY_LENGTH) || entry.summary,
      operatorReason: compactText(entry.operatorReason, MAX_QUALITY_ENTRY_LENGTH),
    })),
    assets: deck.assets.filter(asset => !slideAssetIds.has(asset.id)),
  }
}

function dropOptionalPresentationV2PersistenceFields(deck: PresentationV2Deck): PresentationV2Deck {
  return {
    ...deck,
    slides: deck.slides.map(slide => ({
      ...slide,
      assets: (slide.assets || []).map(asset => ({
        ...asset,
        prompt: undefined,
        negativePrompt: undefined,
        qualityWarnings: undefined,
        error: undefined,
      })),
    })),
    assets: deck.assets.map(asset => ({
      ...asset,
      prompt: undefined,
      negativePrompt: undefined,
      qualityWarnings: undefined,
      error: undefined,
    })),
    quality: deck.quality ? {
      score: deck.quality.score,
      warnings: compactTextList(deck.quality.warnings, 4, 240),
      exportReadiness: deck.quality.exportReadiness ? {
        score: deck.quality.exportReadiness.score,
        status: deck.quality.exportReadiness.status,
        visualAssetCount: deck.quality.exportReadiness.visualAssetCount,
        altTextCoverage: deck.quality.exportReadiness.altTextCoverage,
        blockingIssues: compactTextList(deck.quality.exportReadiness.blockingIssues, 4, 240),
      } : undefined,
    } : undefined,
    revisionHistory: deck.revisionHistory?.slice(-4),
  }
}

export function sanitizePresentationV2DeckForFirestore(deck: PresentationV2Deck): PresentationV2Deck {
  const slides = (deck.slides || []).map(sanitizeSlideForFirestore)
  return {
    ...deck,
    slides,
    assets: mergeDeckAssets(deck.assets || [], slides),
  }
}

export function stringifyPresentationV2DeckForFirestore(deck: PresentationV2Deck): string {
  const sanitizedDeck = sanitizePresentationV2DeckForFirestore(deck)
  const compactDeck = compactPresentationV2DeckForFirestore(sanitizedDeck)
  const compactJson = JSON.stringify(compactDeck)
  if (byteLength(compactJson) <= MAX_PRESENTATION_V2_CONTENT_BYTES) return compactJson

  return JSON.stringify(dropOptionalPresentationV2PersistenceFields(compactDeck))
}

export function sanitizePresentationV2ArtifactForFirestore(artifact: StudioArtifact): StudioArtifact {
  if (artifact.type === 'apresentacao_v2') {
    try {
      const deck = JSON.parse(artifact.content) as PresentationV2Deck
      return {
        ...artifact,
        content: stringifyPresentationV2DeckForFirestore(deck),
      }
    } catch {
      return artifact
    }
  }

  if (artifact.type === 'apresentacao') {
    const content = trySanitizeLegacyPresentationArtifactContent(artifact.content)
    return content ? { ...artifact, content } : artifact
  }

  const content = sanitizeStructuredArtifactRootMediaContent(artifact.type, artifact.content)
  return content ? { ...artifact, content } : artifact
}

export function sanitizePresentationV2ArtifactsForFirestore(artifacts: StudioArtifact[]): StudioArtifact[] {
  return artifacts.map(sanitizePresentationV2ArtifactForFirestore)
}

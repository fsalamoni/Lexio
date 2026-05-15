import { parseArtifactContent } from './artifact-parsers'
import type { PresentationV2Deck, PresentationV2Slide, PresentationV2SlideAsset, StudioArtifact } from './firestore-types'

const INLINE_MEDIA_URL_PATTERN = /^(data|blob):/i
const PERSISTED_MEDIA_URL_MAX_LENGTH = 32768

function isNonPersistableMediaUrl(value: unknown): value is string {
  return typeof value === 'string' && (
    INLINE_MEDIA_URL_PATTERN.test(value.trim()) ||
    value.length > PERSISTED_MEDIA_URL_MAX_LENGTH
  )
}

function sanitizeAssetForFirestore(asset: PresentationV2SlideAsset): PresentationV2SlideAsset {
  const sanitized: PresentationV2SlideAsset = {
    ...asset,
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

function trySanitizeLegacyPresentationArtifactContent(raw: string): string | null {
  const parsed = parseArtifactContent('apresentacao', raw)
  if (parsed.kind !== 'presentation') return null

  return sanitizeJsonArtifactContent(raw, (value) => ({
    ...value,
    slides: Array.isArray(value.slides)
      ? value.slides.map((slide) => (
          slide && typeof slide === 'object'
            ? sanitizeStructuredMediaFields(slide as Record<string, unknown>, [
                {
                  urlFields: ['renderedImageUrl', 'rendered_image_url'],
                  storagePathFields: ['renderedImageStoragePath', 'rendered_image_storage_path'],
                },
              ])
            : slide
        ))
      : value.slides,
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
    assets: deck.assets.filter(asset => !slideAssetIds.has(asset.id)),
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
  return JSON.stringify(compactPresentationV2DeckForFirestore(sanitizedDeck))
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

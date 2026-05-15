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

export function sanitizePresentationV2DeckForFirestore(deck: PresentationV2Deck): PresentationV2Deck {
  return {
    ...deck,
    slides: (deck.slides || []).map(sanitizeSlideForFirestore),
    assets: (deck.assets || []).map(sanitizeAssetForFirestore),
  }
}

export function stringifyPresentationV2DeckForFirestore(deck: PresentationV2Deck): string {
  return JSON.stringify(sanitizePresentationV2DeckForFirestore(deck), null, 2)
}

export function sanitizePresentationV2ArtifactForFirestore(artifact: StudioArtifact): StudioArtifact {
  if (artifact.type !== 'apresentacao_v2') return artifact

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

export function sanitizePresentationV2ArtifactsForFirestore(artifacts: StudioArtifact[]): StudioArtifact[] {
  return artifacts.map(sanitizePresentationV2ArtifactForFirestore)
}
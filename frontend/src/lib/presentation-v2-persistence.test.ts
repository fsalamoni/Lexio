import { describe, expect, it } from 'vitest'

import type { PresentationV2Deck, StudioArtifact } from './firestore-types'
import {
  sanitizePresentationV2ArtifactForFirestore,
  sanitizePresentationV2DeckForFirestore,
  sanitizePresentationV2ArtifactsForFirestore,
  stringifyPresentationV2DeckForFirestore,
} from './presentation-v2-persistence'

function buildDeck(): PresentationV2Deck {
  return {
    schemaVersion: 'presentation_v2.1',
    title: 'Deck teste',
    generationSpec: { request: 'Teste' },
    outline: {
      narrativeArc: 'Abertura, prova e decisao.',
      sections: [{ id: 's1', title: 'Secao', purpose: 'Testar', slideNumbers: [1] }],
    },
    theme: { name: 'Institucional' },
    slides: [
      {
        id: 'slide-1',
        number: 1,
        title: 'Slide 1',
        layout: 'hero-left',
        bullets: ['Ponto principal com lastro.'],
        speakerNotes: 'Notas de apresentacao com contexto suficiente.',
        renderedImageUrl: 'data:image/png;base64,AAAA',
        renderedImageStoragePath: 'research_notebooks/user/nb/images/slide.png',
        assets: [
          {
            id: 'render-1',
            type: 'render',
            status: 'stored',
            url: 'data:image/png;base64,BBBB',
            storagePath: 'research_notebooks/user/nb/images/render.png',
            mimeType: 'image/png',
          },
          {
            id: 'chart-1',
            type: 'chart',
            status: 'stored',
            url: 'blob:http://localhost/chart',
            mimeType: 'image/svg+xml',
          },
          {
            id: 'oversized-1',
            type: 'image',
            status: 'stored',
            url: `https://example.test/${'a'.repeat(40000)}`,
            mimeType: 'image/png',
          },
        ],
      },
    ],
    assets: [
      {
        id: 'render-1',
        type: 'render',
        status: 'stored',
        url: 'data:image/png;base64,CCCC',
        storagePath: 'research_notebooks/user/nb/images/render.png',
        mimeType: 'image/png',
      },
      {
        id: 'remote-1',
        type: 'image',
        status: 'stored',
        url: 'https://firebasestorage.googleapis.com/v0/b/demo/o/image.png',
        storagePath: 'research_notebooks/user/nb/images/image.png',
        mimeType: 'image/png',
      },
      {
        id: 'deck-audio-1',
        type: 'audio',
        status: 'stored',
        url: 'https://firebasestorage.googleapis.com/v0/b/demo/o/audio.mp3',
        storagePath: 'research_notebooks/user/nb/audio/audio.mp3',
        mimeType: 'audio/mpeg',
      },
    ],
  }
}

describe('presentation-v2-persistence', () => {
  it('removes data/blob media URLs while preserving remote storage references', () => {
    const sanitized = sanitizePresentationV2DeckForFirestore(buildDeck())

    expect(sanitized.slides[0].renderedImageUrl).toBeUndefined()
    expect(sanitized.slides[0].renderedImageStoragePath).toBe('research_notebooks/user/nb/images/slide.png')
    expect(sanitized.slides[0].assets?.[0].url).toBeUndefined()
    expect(sanitized.slides[0].assets?.[0].storagePath).toBe('research_notebooks/user/nb/images/render.png')
    expect(sanitized.slides[0].assets?.[1].url).toBeUndefined()
    expect(sanitized.slides[0].assets?.[1].status).toBe('generated')
    expect(sanitized.slides[0].assets?.[2].url).toBeUndefined()
    expect(sanitized.slides[0].assets?.[2].status).toBe('generated')
    expect(sanitized.assets[1].url).toContain('https://firebasestorage.googleapis.com')
  })

  it('stringifies decks without inline media payloads', () => {
    const content = stringifyPresentationV2DeckForFirestore(buildDeck())
    const persisted = JSON.parse(content) as PresentationV2Deck

    expect(content).not.toContain('data:image')
    expect(content).not.toContain('blob:http')
    expect(content).not.toContain('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(content).toContain('firebasestorage.googleapis.com')
    expect(content).not.toContain('\n  ')
    expect(persisted.assets.some((asset) => asset.id === 'render-1')).toBe(false)
    expect(persisted.assets.some((asset) => asset.id === 'deck-audio-1')).toBe(true)
  })

  it('sanitizes only Presentation V2 artifacts in artifact arrays', () => {
    const artifacts: StudioArtifact[] = [
      {
        id: 'v2',
        type: 'apresentacao_v2',
        title: 'V2',
        content: JSON.stringify(buildDeck()),
        format: 'json',
        created_at: '2026-05-14T20:00:00.000Z',
      },
      {
        id: 'doc',
        type: 'documento',
        title: 'Documento',
        content: 'data:image/png;base64,SHOULD_STAY_BECAUSE_NOT_JSON_V2',
        format: 'markdown',
        created_at: '2026-05-14T20:00:00.000Z',
      },
    ]

    const [v2Artifact, documentArtifact] = sanitizePresentationV2ArtifactsForFirestore(artifacts)

    expect(v2Artifact.content).not.toContain('data:image')
    expect(documentArtifact.content).toContain('SHOULD_STAY_BECAUSE_NOT_JSON_V2')
    expect(sanitizePresentationV2ArtifactForFirestore(documentArtifact)).toBe(documentArtifact)
  })

  it('sanitizes inline media URLs for legacy presentation and structured notebook artifacts', () => {
    const legacyPresentation: StudioArtifact = {
      id: 'presentation',
      type: 'apresentacao',
      title: 'Deck legado',
      format: 'json',
      created_at: '2026-05-14T20:00:00.000Z',
      content: JSON.stringify({
        slides: [
          {
            number: 1,
            title: 'Slide 1',
            bullets: ['Teste'],
            speakerNotes: 'Notas',
            renderedImageUrl: 'data:image/png;base64,INLINE',
            renderedImageStoragePath: 'research_notebooks/user/nb/images/legacy-slide.png',
          },
        ],
      }),
    }
    const infographic: StudioArtifact = {
      id: 'infographic',
      type: 'infografico',
      title: 'Infográfico',
      format: 'json',
      created_at: '2026-05-14T20:00:00.000Z',
      content: JSON.stringify({
        title: 'Resumo',
        sections: [{ title: 'Secao', content: 'Conteúdo' }],
        renderedImageUrl: 'blob:http://localhost/final-image',
        renderedImageStoragePath: 'research_notebooks/user/nb/images/infographic.png',
      }),
    }

    const sanitizedLegacy = sanitizePresentationV2ArtifactForFirestore(legacyPresentation)
    const sanitizedInfographic = sanitizePresentationV2ArtifactForFirestore(infographic)

    expect(sanitizedLegacy.content).not.toContain('data:image/png;base64,INLINE')
    expect(sanitizedLegacy.content).toContain('legacy-slide.png')
    expect(sanitizedInfographic.content).not.toContain('blob:http://localhost/final-image')
    expect(sanitizedInfographic.content).toContain('infographic.png')
  })
})

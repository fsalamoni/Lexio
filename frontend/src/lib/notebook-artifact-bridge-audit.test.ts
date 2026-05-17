import { describe, expect, it } from 'vitest'
import type { ChatArtifactExportRef, StudioArtifact } from './firestore-types'
import { auditNotebookArtifactBridge, auditNotebookArtifactBridges } from './notebook-artifact-bridge-audit'

const readyMarkdownExport: ChatArtifactExportRef = {
  label: 'Markdown',
  format: 'markdown',
  status: 'ready',
  download_url: 'https://cdn.lexio.test/artifact.md',
  storage_path: 'notebook_artifacts/user-1/nb-1/artifact.md',
}

function makeArtifact(overrides: Partial<StudioArtifact>): StudioArtifact {
  return {
    id: 'art-1',
    type: 'resumo',
    title: 'Artefato',
    content: '# Conteudo',
    format: 'markdown',
    created_at: '2026-05-17T10:00:00.000Z',
    exports: [readyMarkdownExport],
    ...overrides,
  }
}

describe('auditNotebookArtifactBridge', () => {
  it('marks a storage-backed text artifact as ready', () => {
    const audit = auditNotebookArtifactBridge(makeArtifact({
      type: 'relatorio',
      title: 'Relatorio pronto',
      content: '# Relatorio',
    }))

    expect(audit.status).toBe('ready')
    expect(audit.parseStatus).toBe('markdown')
    expect(audit.exports.ready).toBe(1)
    expect(audit.exports.storageBackedReady).toBe(1)
    expect(audit.issues).toEqual([])
  })

  it('flags structured artifacts that no longer parse as their expected format', () => {
    const audit = auditNotebookArtifactBridge(makeArtifact({
      type: 'apresentacao',
      title: 'Deck quebrado',
      content: 'texto solto sem JSON de slides',
      format: 'json',
      exports: [readyMarkdownExport],
    }))

    expect(audit.status).toBe('invalid')
    expect(audit.parseStatus).toBe('invalid')
    expect(audit.issues).toContain('structured_parse_failed')
    expect(audit.recommendations).toContain('regenerate_structured_artifact')
  })

  it('captures presentation v2 media and export blockers in one bridge audit', () => {
    const deck = {
      title: 'Deck v2',
      generationSpec: {
        request: 'Preparar apresentacao executiva',
        sourcePriority: ['Fonte A'],
        multimodal: { images: true, audio: true, video: true },
      },
      outline: {
        narrativeArc: 'Problema, tese e prova.',
        sections: [{ id: 's1', title: 'Abertura', purpose: 'contexto', slideNumbers: [1] }],
      },
      theme: { name: 'Institucional' },
      quality: {
        multimodalAudit: { status: 'critical', score: 55, warnings: ['Sem visual final'], strengths: [], auditedAssetTypes: [], slides: [] },
        exportReadiness: { status: 'critical', score: 62, visualAssetCount: 1, altTextCoverage: 0, missingAltTextAssets: ['render:asset-1'], blockingIssues: ['Alt text ausente'], accessibilityNotes: [], legalAccuracyNotes: [], warnings: ['Alt text ausente'] },
      },
      slides: [{
        id: 'slide-1',
        number: 1,
        sectionId: 's1',
        title: 'Abertura',
        layout: 'default',
        bullets: ['Tese central'],
        speakerNotes: 'Notas do apresentador com contexto suficiente para narracao.',
        visualBrief: 'Visual institucional',
        assets: [
          { id: 'asset-1', type: 'render', status: 'planned', altText: '' },
          { id: 'asset-2', type: 'audio', status: 'stored', storagePath: 'notebook_media/user-1/nb-1/audio.mp3' },
        ],
      }],
      assets: [
        { id: 'asset-1', type: 'render', status: 'planned', altText: '' },
        { id: 'asset-2', type: 'audio', status: 'stored', storagePath: 'notebook_media/user-1/nb-1/audio.mp3' },
      ],
    }

    const audit = auditNotebookArtifactBridge(makeArtifact({
      type: 'apresentacao_v2',
      title: 'Deck v2',
      content: JSON.stringify(deck),
      format: 'json',
      exports: [],
    }))

    expect(audit.status).toBe('needs_action')
    expect(audit.parseStatus).toBe('structured')
    expect(audit.media.kind).toBe('presentation_v2')
    expect(audit.media.storedUnits).toBe(1)
    expect(audit.media.pendingUnits).toBe(1)
    expect(audit.issues).toEqual(expect.arrayContaining([
      'exports_not_ready',
      'presentation_v2_multimodal_critical',
      'presentation_v2_export_blocked',
    ]))
  })

  it('summarizes audio and video artifacts with persisted final media', () => {
    const audio = makeArtifact({
      id: 'audio-1',
      type: 'audio_script',
      title: 'Audio',
      content: JSON.stringify({
        title: 'Audio',
        segments: [{ time: '00:00', type: 'narracao', text: 'Abertura.' }],
        audioStoragePath: 'notebook_media/user-1/nb-1/audio.mp3',
      }),
      format: 'json',
    })
    const video = makeArtifact({
      id: 'video-1',
      type: 'video_script',
      title: 'Video',
      content: JSON.stringify({
        title: 'Video',
        scenes: [{ number: 1, time: '00:00', narration: 'Abertura.', visual: 'Tela inicial.' }],
        renderedVideoStoragePath: 'notebook_media/user-1/nb-1/video.mp4',
      }),
      format: 'json',
    })

    const summary = auditNotebookArtifactBridges([audio, video])

    expect(summary.totalArtifacts).toBe(2)
    expect(summary.readyArtifacts).toBe(2)
    expect(summary.mediaReadyArtifacts).toBe(2)
    expect(summary.readyExports).toBe(2)
    expect(summary.issues).toEqual([])
  })
})

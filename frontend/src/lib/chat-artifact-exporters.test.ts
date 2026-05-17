import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioArtifact } from './firestore-types'

const storageMocks = vi.hoisted(() => ({
  uploadChatArtifactFile: vi.fn(async (args: { exportId: string }) => ({
    url: `blob:mock/${args.exportId}`,
    path: `mock/${args.exportId}`,
  })),
  uploadNotebookArtifactFile: vi.fn(async (args: { exportId: string }) => ({
    url: `blob:notebook/${args.exportId}`,
    path: `notebook/${args.exportId}`,
  })),
}))

const pptxMocks = vi.hoisted(() => ({
  addText: vi.fn(),
  addNotes: vi.fn(),
}))

vi.mock('./chat-artifact-storage', () => ({
  uploadChatArtifactFile: (args: { exportId: string }) => storageMocks.uploadChatArtifactFile(args),
  uploadNotebookArtifactFile: (args: { exportId: string }) => storageMocks.uploadNotebookArtifactFile(args),
}))

vi.mock('pptxgenjs', () => ({
  default: class MockPptxGen {
    layout = ''
    author = ''
    company = ''
    subject = ''
    title = ''
    theme = {}
    addSlide() {
      return {
        background: {},
        addText: (...args: unknown[]) => pptxMocks.addText(...args),
        addNotes: (...args: unknown[]) => pptxMocks.addNotes(...args),
      }
    }
    async write() {
      return new Blob(['pptx'], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
    }
  },
}))

import { materializeChatAgentWorkPackageExports, materializeStudioArtifactExports } from './chat-artifact-exporters'
import type { ChatAgentWorkPackage } from './firestore-types'

const basePackage: ChatAgentWorkPackage = {
  conversation_id: 'conv-1',
  turn_id: 'turn-1',
  agent_key: 'chat_data_builder',
  task: 'Criar tabela',
  result_markdown: 'Resultado em markdown',
  created_at: '2026-05-16T10:00:00.000Z',
  artifacts: [],
}

describe('materializeChatAgentWorkPackageExports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('materializes supported JSON and CSV exports from manifest data', async () => {
    const result = await materializeChatAgentWorkPackageExports({
      ...basePackage,
      artifacts: [
        {
          artifact_id: 'dados-v1',
          logical_document_id: 'dados',
          title: 'Tabela de dados',
          kind: 'data',
          format: 'json',
          version: 1,
          manifest_json: {
            rows: [
              { nome: 'Ana', valor: 10 },
              { nome: 'Bruno', valor: 20 },
            ],
          },
          exports: [
            { label: 'JSON', format: 'json', status: 'planned' },
            { label: 'CSV', format: 'csv', status: 'planned' },
          ],
        },
      ],
    }, {
      userId: 'u1',
      conversationId: 'conv-1',
      turnId: 'turn-1',
    })

    const exports = result.artifacts?.[0]?.exports ?? []
    expect(exports.find(exportRef => exportRef.format === 'json')).toMatchObject({ status: 'ready', extension: '.json' })
    expect(exports.find(exportRef => exportRef.format === 'csv')).toMatchObject({ status: 'ready', extension: '.csv' })
  })

  it('materializes native XLSX and PPTX exports when requested', async () => {
    const result = await materializeChatAgentWorkPackageExports({
      ...basePackage,
      artifacts: [
        {
          artifact_id: 'dados-v1',
          logical_document_id: 'dados',
          title: 'Tabela de dados',
          kind: 'data',
          format: 'json',
          version: 1,
          manifest_json: { rows: [{ nome: 'Ana', valor: 10 }] },
          exports: [{ label: 'XLSX', format: 'xlsx', status: 'planned' }],
        },
        {
          artifact_id: 'deck-v1',
          logical_document_id: 'deck',
          title: 'Apresentação',
          kind: 'presentation',
          format: 'json',
          version: 1,
          manifest_json: { slides: [{ title: 'Intro', bullets: ['Um', 'Dois'] }] },
          exports: [{ label: 'PPTX', format: 'pptx', status: 'planned' }],
        },
      ],
    }, {
      userId: 'u1',
      conversationId: 'conv-1',
      turnId: 'turn-1',
    })

    expect(result.artifacts?.[0]?.exports?.find(exportRef => exportRef.format === 'xlsx')).toMatchObject({ status: 'ready', extension: '.xlsx' })
    expect(result.artifacts?.[1]?.exports?.find(exportRef => exportRef.format === 'pptx')).toMatchObject({ status: 'ready', extension: '.pptx' })
    expect(pptxMocks.addText).toHaveBeenCalledWith('Intro', expect.objectContaining({ fontSize: 24 }))
  })

  it('reads presentation v2 slides from nested manifests for PPTX exports', async () => {
    await materializeChatAgentWorkPackageExports({
      ...basePackage,
      artifacts: [
        {
          artifact_id: 'deck-v2',
          logical_document_id: 'deck-v2',
          title: 'Apresentação v2',
          kind: 'presentation',
          format: 'json',
          version: 1,
          manifest_json: {
            deck: {
              slides: [
                {
                  title: 'Diagnóstico institucional',
                  keyPoints: ['Risco mapeado', 'Plano de ação'],
                  speakerNotes: 'Notas executivas do slide.',
                },
              ],
            },
          },
          exports: [{ label: 'PPTX', format: 'pptx', status: 'planned' }],
        },
      ],
    }, {
      userId: 'u1',
      conversationId: 'conv-1',
      turnId: 'turn-1',
    })

    expect(pptxMocks.addText).toHaveBeenCalledWith('Diagnóstico institucional', expect.objectContaining({ fontSize: 24 }))
    expect(pptxMocks.addText).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ text: 'Risco mapeado' }),
      expect.objectContaining({ text: 'Plano de ação' }),
    ]), expect.any(Object))
    expect(pptxMocks.addNotes).toHaveBeenCalledWith('Notas executivas do slide.')
  })

  it('materializes native PDF and ZIP exports when requested', async () => {
    const result = await materializeChatAgentWorkPackageExports({
      ...basePackage,
      artifacts: [
        {
          artifact_id: 'texto-v1',
          logical_document_id: 'texto',
          title: 'Parecer jurídico',
          kind: 'legal_document',
          format: 'markdown',
          version: 1,
          content_preview: '# Parecer\n\nConteúdo do parecer.',
          manifest_json: { document_id: 'doc-1' },
          exports: [
            { label: 'PDF', format: 'pdf', status: 'planned' },
            { label: 'ZIP', format: 'zip', status: 'planned' },
          ],
        },
      ],
    }, {
      userId: 'u1',
      conversationId: 'conv-1',
      turnId: 'turn-1',
    })

    expect(result.artifacts?.[0]?.exports?.find(exportRef => exportRef.format === 'pdf')).toMatchObject({ status: 'ready', extension: '.pdf' })
    expect(result.artifacts?.[0]?.exports?.find(exportRef => exportRef.format === 'zip')).toMatchObject({ status: 'ready', extension: '.zip' })
  })

  it('materializes notebook studio artifact exports with notebook storage paths', async () => {
    const artifact: StudioArtifact = {
      id: 'art-1',
      type: 'relatorio',
      title: 'Relatório do caderno',
      content: '# Relatório\n\nConteúdo do caderno.',
      format: 'markdown',
      created_at: '2026-05-17T10:00:00.000Z',
    }

    const result = await materializeStudioArtifactExports(artifact, {
      userId: 'u1',
      notebookId: 'nb-1',
    })

    expect(result.exports?.map(exportRef => exportRef.format)).toEqual(expect.arrayContaining(['markdown', 'docx', 'pdf', 'zip']))
    expect(result.exports?.filter(exportRef => exportRef.status === 'ready').length).toBeGreaterThanOrEqual(4)
    expect(result.download_url).toBe('blob:notebook/art-1-markdown')
    expect(storageMocks.uploadNotebookArtifactFile).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      notebookId: 'nb-1',
      artifactId: 'art-1',
      exportId: 'art-1-markdown',
    }))
  })
})

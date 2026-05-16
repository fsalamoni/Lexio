import { describe, expect, it, vi } from 'vitest'

vi.mock('./chat-artifact-storage', () => ({
  uploadChatArtifactFile: vi.fn(async (args: { exportId: string }) => ({
    url: `blob:mock/${args.exportId}`,
    path: `mock/${args.exportId}`,
  })),
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
        addText: vi.fn(),
        addNotes: vi.fn(),
      }
    }
    async write() {
      return new Blob(['pptx'], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
    }
  },
}))

import { materializeChatAgentWorkPackageExports } from './chat-artifact-exporters'
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
  })

  it('marks unsupported formats as unavailable instead of pretending success', async () => {
    const result = await materializeChatAgentWorkPackageExports({
      ...basePackage,
      artifacts: [
        {
          artifact_id: 'deck-v1',
          logical_document_id: 'deck',
          title: 'Apresentação',
          kind: 'presentation',
          format: 'pdf',
          version: 1,
          exports: [{ label: 'PDF', format: 'pdf', status: 'planned' }],
        },
      ],
    }, {
      userId: 'u1',
      conversationId: 'conv-1',
      turnId: 'turn-1',
    })

    expect(result.artifacts?.[0]?.exports?.[0]).toMatchObject({
      label: 'PDF',
      format: 'pdf',
      status: 'unavailable',
    })
  })
})

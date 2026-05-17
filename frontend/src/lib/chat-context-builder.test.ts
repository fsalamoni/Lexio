import { describe, expect, it } from 'vitest'
import type { ChatTurnAttachment, ChatTurnData } from './firestore-types'
import { buildAttachmentContextSources, renderCurrentTurnUserContent, renderTurnUserContentForHistory } from './chat-context-builder'

const attachment: ChatTurnAttachment = {
  attachment_id: 'att-1',
  filename: 'custos.csv',
  mime_type: 'text/csv',
  extension: '.csv',
  size_bytes: 128,
  kind: 'spreadsheet',
  upload_status: 'uploaded',
  storage_path: 'chat_inputs/u/c/t/att-1/custos.csv',
  download_url: 'https://cdn.lexio.test/custos.csv',
  extraction: {
    status: 'ready',
    mode: 'structured_data',
    text_preview: 'Planilha: custos.csv\nHonorários | 1000',
    text_char_count: 39,
    truncated: false,
    sheet_count: 1,
  },
  created_at: '2026-05-16T12:00:00.000Z',
}

describe('chat context builder', () => {
  it('creates citation-ready context source refs for attachments', () => {
    const sources = buildAttachmentContextSources([attachment])

    expect(sources).toEqual([
      expect.objectContaining({
        source_id: 'attachment:att-1',
        source_type: 'attachment',
        title: 'custos.csv',
        attachment_id: 'att-1',
        citation_label: '[Anexo 1: custos.csv]',
        confidence: 1,
      }),
    ])
    expect(sources[0].summary).toContain('Honorários | 1000')
  })

  it('renders current-turn attachment context in a bounded structured manifest', () => {
    const rendered = renderCurrentTurnUserContent({
      userInput: 'Analise a planilha.',
      attachments: [attachment],
      contextSources: buildAttachmentContextSources([attachment]),
    })

    expect(rendered).toContain('## Anexos recebidos neste turno')
    expect(rendered).toContain('Tipo: spreadsheet')
    expect(rendered).toContain('Upload: uploaded')
    expect(rendered).toContain('Abas: 1')
    expect(rendered).toContain('Honorários | 1000')
    expect(rendered).toContain('## Fontes de contexto vinculadas')
  })

  it('renders previous turns with attachment manifests for history replay', () => {
    const turn: ChatTurnData = {
      id: 'turn-1',
      conversation_id: 'conv-1',
      user_input: 'Use isto no próximo turno.',
      input_attachments: [attachment],
      context_sources: buildAttachmentContextSources([attachment]),
      trail: [],
      assistant_markdown: null,
      status: 'done',
      created_at: '2026-05-16T12:00:00.000Z',
    }

    const rendered = renderTurnUserContentForHistory(turn)

    expect(rendered).toContain('## Anexos do turno')
    expect(rendered).toContain('custos.csv')
    expect(rendered).toContain('chat_inputs/u/c/t/att-1/custos.csv')
  })

  it('renders generated deliverable bundles for follow-up turns', () => {
    const turn: ChatTurnData = {
      id: 'turn-2',
      conversation_id: 'conv-1',
      user_input: 'Gere os arquivos finais.',
      trail: [],
      assistant_markdown: '# Entrega pronta',
      status: 'done',
      created_at: '2026-05-16T12:00:00.000Z',
      deliverable_bundles: [
        {
          bundle_id: 'bundle-1',
          conversation_id: 'conv-1',
          turn_id: 'turn-2',
          title: 'Arquivos gerados',
          status: 'partial',
          ready_count: 1,
          failed_count: 1,
          planned_count: 0,
          unavailable_count: 0,
          created_at: '2026-05-16T12:00:00.000Z',
          items: [
            {
              item_id: 'doc-v1',
              artifact_id: 'doc-v1',
              logical_document_id: 'doc',
              title: 'Documento final',
              kind: 'legal_document',
              format: 'markdown',
              version: 1,
              status: 'partial',
              exports: [
                { label: 'DOCX', format: 'docx', status: 'ready', storage_path: 'chat_artifacts/u/c/t/doc/doc.docx' },
                { label: 'PDF', format: 'pdf', status: 'failed', reason: 'Falha temporaria.' },
              ],
            },
          ],
        },
      ],
    }

    const rendered = renderTurnUserContentForHistory(turn)

    expect(rendered).toContain('## Entregaveis gerados no turno')
    expect(rendered).toContain('Documento final')
    expect(rendered).toContain('DOCX em chat_artifacts/u/c/t/doc/doc.docx')
    expect(rendered).toContain('PDF (Falha temporaria.)')
  })

  it('renders media metadata as attachment context', () => {
    const mediaAttachment: ChatTurnAttachment = {
      attachment_id: 'att-video',
      filename: 'audiencia.mp4',
      mime_type: 'video/mp4',
      extension: '.mp4',
      size_bytes: 1234,
      kind: 'video',
      created_at: '2026-05-16T12:00:00.000Z',
      extraction: {
        status: 'partial',
        mode: 'video',
        duration_seconds: 45.2,
        media_width: 1920,
        media_height: 1080,
        processed_at: '2026-05-16T12:00:00.000Z',
      },
    }

    const rendered = renderCurrentTurnUserContent({
      userInput: 'Analise o vídeo.',
      attachments: [mediaAttachment],
      contextSources: [],
    })

    expect(rendered).toContain('Duração: 45.2s')
    expect(rendered).toContain('Dimensões: 1920x1080')
  })
})

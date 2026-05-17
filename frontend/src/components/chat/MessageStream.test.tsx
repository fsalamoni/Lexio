// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import MessageStream from './MessageStream'

describe('MessageStream', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the provided empty state when there are no turns', () => {
    render(
      <MessageStream
        turns={[]}
        liveTurn={null}
        emptyState={<div data-testid="chat-empty-state">Nenhuma mensagem</div>}
      />,
    )

    expect(screen.getByTestId('chat-empty-state')).toBeTruthy()
  })

  it('renders completed turns with orchestrator thoughts, agent trail, pending question and markdown', () => {
    render(
      <MessageStream
        turns={[
          {
            id: 'turn-1',
            conversation_id: 'conv-1',
            user_input: 'Preciso de um resumo.',
            input_attachments: [
              {
                attachment_id: 'att-1',
                filename: 'contrato.txt',
                mime_type: 'text/plain',
                extension: '.txt',
                size_bytes: 24,
                kind: 'document',
                extraction: { status: 'ready', mode: 'text', text_preview: 'cláusula', text_char_count: 7, truncated: false },
                created_at: '2026-05-08T10:00:00.000Z',
              },
            ],
            trail: [
              { type: 'orchestrator_thought', delta: 'Analisando', total: 'Analisando o pedido', ts: '2026-05-08T10:00:00.000Z' },
              { type: 'attachment_upload_started', attachment_id: 'att-1', filename: 'contrato.txt', size_bytes: 24, ts: '2026-05-08T10:00:00.100Z' },
              {
                type: 'attachment_processed',
                attachment: {
                  attachment_id: 'att-1',
                  filename: 'contrato.txt',
                  mime_type: 'text/plain',
                  extension: '.txt',
                  size_bytes: 24,
                  kind: 'document',
                  upload_status: 'uploaded',
                  storage_path: 'chat_inputs/user/conv/turn/att/contrato.txt',
                  download_url: 'https://cdn.lexio.test/contrato.txt',
                  extraction: { status: 'ready', mode: 'text', text_preview: 'cláusula', text_char_count: 7, truncated: false },
                  created_at: '2026-05-08T10:00:00.000Z',
                },
                ts: '2026-05-08T10:00:00.200Z',
              },
              {
                type: 'multimodal_analysis_skipped',
                attachment_id: 'att-1',
                filename: 'contrato.txt',
                mode: 'text',
                model: 'openai/gpt-4o-mini',
                reason: 'Limite de 1 anexo multimodal por turno atingido.',
                ts: '2026-05-08T10:00:00.300Z',
              },
              { type: 'agent_call', agent_key: 'chat_planner', task: 'Planejar resposta', ts: '2026-05-08T10:00:01.000Z' },
              { type: 'agent_response', agent_key: 'chat_planner', output: 'Plano inicial', ts: '2026-05-08T10:00:02.000Z' },
              {
                type: 'agent_work_package',
                ts: '2026-05-08T10:00:02.500Z',
                package: {
                  conversation_id: 'conv-1',
                  turn_id: 'turn-1',
                  agent_key: 'chat_planner',
                  task: 'Planejar resposta',
                  result_markdown: 'Plano inicial',
                  thought: {
                    summary: 'Organizei a execução antes da próxima iteração.',
                    decisions: ['Gerar uma síntese curta'],
                  },
                  artifacts: [
                    {
                      artifact_id: 'sintese-v1',
                      logical_document_id: 'sintese',
                      version: 1,
                      title: 'Síntese do caso',
                      kind: 'text',
                      format: 'markdown',
                      summary: 'Documento textual inicial.',
                      manifest_json: { sections: ['Resumo'] },
                      exports: [{ label: 'DOCX', format: 'docx', status: 'planned' }],
                    },
                  ],
                  created_at: '2026-05-08T10:00:02.500Z',
                },
              },
              { type: 'final_answer', ts: '2026-05-08T10:00:03.000Z' },
            ],
            assistant_markdown: '## Síntese\n- ponto **forte**\n- item com `código`',
            pending_question: {
              text: 'Qual recorte você prefere?',
              options: ['Só fatos', 'Fatos e jurisprudência'],
            },
            status: 'done',
            created_at: '2026-05-08T10:00:00.000Z',
          },
        ]}
        liveTurn={null}
      />,
    )

    expect(screen.getByText('Preciso de um resumo.')).toBeTruthy()
    expect(screen.getByText('contrato.txt')).toBeTruthy()
    expect(screen.getByText('ready')).toBeTruthy()
    expect(screen.getByText(/anexo recebido/i)).toBeTruthy()
    expect(screen.getByText(/anexo processado/i)).toBeTruthy()
    expect(screen.getByText(/multimodal ignorado/i)).toBeTruthy()
    expect(screen.getByText(/pensamento do orquestrador/i)).toBeTruthy()
    expect(screen.getByText(/analisando o pedido/i)).toBeTruthy()
    expect(screen.getByText(/trilha de agentes/i)).toBeTruthy()
    expect(screen.getByText(/chama chat_planner/i)).toBeTruthy()
    expect(screen.getByText(/pacote de trabalho/i)).toBeTruthy()
    expect(screen.getByText(/pensamento do agente/i)).toBeTruthy()
    expect(screen.getAllByText('Síntese do caso').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/documento json/i)).toBeTruthy()
    expect(screen.getByText(/DOCX: planejado/i)).toBeTruthy()
    expect(screen.getByText(/pergunta do orquestrador/i)).toBeTruthy()
    expect(screen.getByText(/qual recorte você prefere/i)).toBeTruthy()
    expect(screen.getByText('Só fatos')).toBeTruthy()
    expect(screen.getByText('Síntese')).toBeTruthy()
    expect(screen.getByText('forte')).toBeTruthy()
    expect(screen.getByText('código')).toBeTruthy()
  })

  it('renders live execution, cancelled state and error state cues', () => {
    render(
      <MessageStream
        turns={[
          {
            id: 'turn-cancelled',
            conversation_id: 'conv-1',
            user_input: 'Cancelar isso',
            trail: [],
            assistant_markdown: null,
            status: 'cancelled',
            created_at: '2026-05-08T10:00:00.000Z',
          },
          {
            id: 'turn-error',
            conversation_id: 'conv-1',
            user_input: 'Isso falhou?',
            trail: [],
            assistant_markdown: null,
            status: 'error',
            created_at: '2026-05-08T10:00:00.000Z',
          },
        ]}
        liveTurn={{
          id: 'turn-live',
          conversation_id: 'conv-1',
          user_input: 'Ainda processando',
          trail: [
            { type: 'agent_call', agent_key: 'chat_writer', task: 'Escrever resposta', ts: '2026-05-08T10:00:00.000Z' },
          ],
          assistant_markdown: null,
          status: 'running',
          created_at: '2026-05-08T10:00:00.000Z',
        }}
      />,
    )

    expect(screen.getByText(/turno cancelado pelo usuário/i)).toBeTruthy()
    expect(screen.getByText(/erro ao executar este turno/i)).toBeTruthy()
    expect(screen.getByText(/agente "chat_writer" em execução/i)).toBeTruthy()
  })

  it('aggregates generated files and exposes retry for failed exports', () => {
    const onRetryExport = vi.fn()
    render(
      <MessageStream
        turns={[
          {
            id: 'turn-downloads',
            conversation_id: 'conv-1',
            user_input: 'Gere os documentos para baixar.',
            trail: [
              {
                type: 'agent_work_package',
                ts: '2026-05-08T10:00:00.000Z',
                package: {
                  conversation_id: 'conv-1',
                  turn_id: 'turn-downloads',
                  agent_key: 'chat_export_packager',
                  task: 'Empacotar entrega',
                  result_markdown: '# Entrega',
                  artifacts: [
                    {
                      artifact_id: 'doc-v1',
                      logical_document_id: 'doc',
                      version: 1,
                      title: 'Documento final',
                      kind: 'legal_document',
                      format: 'markdown',
                      summary: 'Minuta consolidada.',
                      exports: [
                        { label: 'DOCX', format: 'docx', status: 'ready', download_url: 'https://cdn.lexio.test/doc.docx' },
                        { label: 'PDF', format: 'pdf', status: 'failed', reason: 'Storage temporariamente indisponivel.' },
                        { label: 'ZIP', format: 'zip', status: 'ready', download_url: 'https://cdn.lexio.test/doc.zip' },
                      ],
                    },
                  ],
                  created_at: '2026-05-08T10:00:00.000Z',
                },
              },
            ],
            assistant_markdown: '# Entrega pronta',
            status: 'done',
            created_at: '2026-05-08T10:00:00.000Z',
          },
        ]}
        liveTurn={null}
        onRetryExport={onRetryExport}
      />,
    )

    expect(screen.getByText(/arquivos gerados/i)).toBeTruthy()
    expect(screen.getByText(/2 prontos/i)).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /docx/i }).length).toBeGreaterThanOrEqual(1)
    fireEvent.click(screen.getByRole('button', { name: /tentar pdf/i }))
    expect(onRetryExport).toHaveBeenCalledWith({
      turnId: 'turn-downloads',
      artifactId: 'doc-v1',
      format: 'pdf',
      exportId: undefined,
    })
  })

  it('renders image artifacts inline with enlarge modal and download', () => {
    render(
      <MessageStream
        turns={[
          {
            id: 'turn-image',
            conversation_id: 'conv-1',
            user_input: 'Gere a renderização em PNG.',
            trail: [
              {
                type: 'agent_work_package',
                ts: '2026-05-08T10:00:00.000Z',
                package: {
                  conversation_id: 'conv-1',
                  turn_id: 'turn-image',
                  agent_key: 'generate_image',
                  task: 'Gerar imagem literal',
                  result_markdown: 'Imagem gerada.',
                  artifacts: [
                    {
                      artifact_id: 'render-v1',
                      logical_document_id: 'render-v1',
                      version: 1,
                      title: 'Render do armário de TV',
                      kind: 'image',
                      format: 'png',
                      summary: 'Renderização literal pronta.',
                      download_url: 'https://cdn.lexio.test/render.png',
                      mime_type: 'image/png',
                      extension: '.png',
                      exports: [
                        { label: 'PNG', format: 'png', status: 'ready', download_url: 'https://cdn.lexio.test/render.png' },
                      ],
                    },
                  ],
                  created_at: '2026-05-08T10:00:00.000Z',
                },
              },
            ],
            assistant_markdown: 'Imagem pronta.',
            status: 'done',
            created_at: '2026-05-08T10:00:00.000Z',
          },
        ]}
        liveTurn={null}
      />,
    )

    const image = screen.getByRole('img', { name: 'Render do armário de TV' })
    expect(image.getAttribute('src')).toBe('https://cdn.lexio.test/render.png')
    expect(screen.getAllByRole('link', { name: /png/i }).length).toBeGreaterThanOrEqual(1)

    fireEvent.click(screen.getByRole('button', { name: /render do armário de tv/i }))

    expect(screen.getByRole('dialog', { name: 'Render do armário de TV' })).toBeTruthy()
    const downloadLinks = screen.getAllByRole('link', { name: /baixar/i })
    expect(downloadLinks.some(link => link.getAttribute('href') === 'https://cdn.lexio.test/render.png')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /fechar/i }))
    expect(screen.queryByRole('dialog', { name: 'Render do armário de TV' })).toBeNull()
  })
})
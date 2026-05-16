// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
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
            trail: [
              { type: 'orchestrator_thought', delta: 'Analisando', total: 'Analisando o pedido', ts: '2026-05-08T10:00:00.000Z' },
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
    expect(screen.getByText(/pensamento do orquestrador/i)).toBeTruthy()
    expect(screen.getByText(/analisando o pedido/i)).toBeTruthy()
    expect(screen.getByText(/trilha de agentes/i)).toBeTruthy()
    expect(screen.getByText(/chama chat_planner/i)).toBeTruthy()
    expect(screen.getByText(/pacote de trabalho/i)).toBeTruthy()
    expect(screen.getByText(/pensamento do agente/i)).toBeTruthy()
    expect(screen.getByText('Síntese do caso')).toBeTruthy()
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
})
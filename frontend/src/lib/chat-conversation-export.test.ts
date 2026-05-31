import { describe, expect, it } from 'vitest'
import { buildConversationJson, buildConversationMarkdown } from './chat-conversation-export'
import type { ChatConversationData, ChatTurnData } from './firestore-types'

const conversation: ChatConversationData = {
  id: 'c1',
  title: 'Análise de cláusula',
  effort: 'medio',
  created_at: '2026-05-01T12:00:00.000Z',
  updated_at: '2026-05-01T12:30:00.000Z',
  last_preview: '',
}

const turns: ChatTurnData[] = [
  {
    id: 't1',
    conversation_id: 'c1',
    user_input: 'Analise esta cláusula.',
    trail: [],
    assistant_markdown: '## Resposta\nA cláusula é válida.',
    status: 'done',
    created_at: '2026-05-01T12:00:00.000Z',
    completed_at: '2026-05-01T12:01:00.000Z',
  },
]

describe('chat-conversation-export', () => {
  it('builds a Markdown transcript with title and turns', () => {
    const md = buildConversationMarkdown(conversation, turns)
    expect(md).toContain('# Análise de cláusula')
    expect(md).toContain('## 1. Você')
    expect(md).toContain('Analise esta cláusula.')
    expect(md).toContain('### Assistente')
    expect(md).toContain('A cláusula é válida.')
  })

  it('builds a JSON snapshot of the transcript', () => {
    const json = JSON.parse(buildConversationJson(conversation, turns))
    expect(json.title).toBe('Análise de cláusula')
    expect(json.turns).toHaveLength(1)
    expect(json.turns[0].assistant_markdown).toContain('válida')
    expect(json.turns[0]).not.toHaveProperty('trail') // internal trail is not exported
  })

  it('handles an empty conversation gracefully', () => {
    const md = buildConversationMarkdown(null, [])
    expect(md).toContain('# Conversa')
  })
})

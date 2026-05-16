import { describe, expect, it } from 'vitest'
import type { ChatTurnData } from './firestore-types'
import {
  deriveChatConversationPreviewFromTurns,
  deriveChatConversationTitleFromTurns,
  isArchivedChatConversation,
  isLegacyRecoveredConversation,
} from './chat-conversation-integrity'

describe('chat conversation integrity helpers', () => {
  it('detects archived conversations and empty legacy recovered placeholders', () => {
    expect(isArchivedChatConversation({ deleted_at: '2026-05-10T10:00:00.000Z' })).toBe(true)
    expect(isArchivedChatConversation({ deleted_at: undefined })).toBe(false)
    expect(isLegacyRecoveredConversation({ title: 'Conversa recuperada', last_preview: '' })).toBe(true)
    expect(isLegacyRecoveredConversation({ title: 'Conversa recuperada', last_preview: 'Historico preservado' })).toBe(false)
    expect(isLegacyRecoveredConversation({ title: 'Parecer tributario', last_preview: '' })).toBe(false)
  })

  it('derives recovered metadata from preserved turns', () => {
    const turns: ChatTurnData[] = [
      {
        id: 'turn-1',
        conversation_id: 'conv-1',
        user_input: '  Elabore um parecer sobre nepotismo.  ',
        trail: [],
        assistant_markdown: null,
        status: 'done',
        created_at: '2026-05-08T10:00:00.000Z',
      },
      {
        id: 'turn-2',
        conversation_id: 'conv-1',
        user_input: 'Refine a conclusão.',
        trail: [],
        assistant_markdown: 'Conclusao refinada com fundamentos constitucionais.',
        status: 'done',
        created_at: '2026-05-08T10:10:00.000Z',
      },
    ]

    expect(deriveChatConversationTitleFromTurns(turns)).toBe('Elabore um parecer sobre nepotismo.')
    expect(deriveChatConversationPreviewFromTurns(turns)).toBe('Conclusao refinada com fundamentos constitucionais.')
  })
})
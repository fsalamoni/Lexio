import type { ChatConversationData, ChatTurnData } from './firestore-types'

export const LEGACY_RECOVERED_CONVERSATION_TITLE = 'Conversa recuperada'

export function isArchivedChatConversation(conversation: Pick<ChatConversationData, 'deleted_at'>): boolean {
  return Boolean(conversation.deleted_at)
}

export function isLegacyRecoveredConversation(
  conversation: Pick<ChatConversationData, 'title' | 'last_preview'>,
): boolean {
  return conversation.title.trim().toLowerCase() === LEGACY_RECOVERED_CONVERSATION_TITLE.toLowerCase()
    && !conversation.last_preview?.trim()
}

export function deriveChatConversationTitleFromTurns(turns: ChatTurnData[], fallback = 'Conversa recuperada com historico'): string {
  const firstUserInput = turns.find(turn => turn.user_input?.trim())?.user_input.trim()
  return clipSingleLine(firstUserInput || fallback, 80)
}

export function deriveChatConversationPreviewFromTurns(turns: ChatTurnData[]): string {
  const lastAssistantText = [...turns].reverse().find(turn => turn.assistant_markdown?.trim())?.assistant_markdown?.trim()
  return clipSingleLine(lastAssistantText || '', 240)
}

function clipSingleLine(value: string, maxChars: number): string {
  const singleLine = value.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= maxChars) return singleLine
  return `${singleLine.slice(0, Math.max(0, maxChars - 3)).trim()}...`
}
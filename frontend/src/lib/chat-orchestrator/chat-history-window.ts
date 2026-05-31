/**
 * Cross-turn memory via history windowing (FF_CHAT_ENGINE_PLUS).
 *
 * The controller normally replays every prior turn verbatim as history, which
 * grows unbounded on long conversations. When enabled, this collapses the
 * older turns into a compact rolling-summary note and keeps only the most
 * recent turns verbatim — bounding token cost while preserving context.
 *
 * Pure functions (no React / Firestore) so they are unit-testable.
 */
import type { ChatTurnData } from '../firestore-types'

export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export const DEFAULT_HISTORY_WINDOW = 8
const SUMMARY_USER_GIST = 320
const SUMMARY_ASSISTANT_GIST = 320

function clip(text: string, max: number): string {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

function flattenTurns(turns: ChatTurnData[], renderUserContent: (turn: ChatTurnData) => string): ChatHistoryMessage[] {
  return turns.flatMap(turn => [
    { role: 'user' as const, content: renderUserContent(turn) },
    ...(turn.assistant_markdown ? [{ role: 'assistant' as const, content: turn.assistant_markdown }] : []),
  ])
}

/** Build a compact rolling-summary note covering the older (windowed-out) turns. */
export function buildRollingSummaryNote(
  olderTurns: ChatTurnData[],
  renderUserContent: (turn: ChatTurnData) => string,
): string {
  const lines = olderTurns.map((turn, index) => {
    const user = clip(renderUserContent(turn), SUMMARY_USER_GIST) || '(sem texto)'
    const assistant = turn.assistant_markdown ? clip(turn.assistant_markdown, SUMMARY_ASSISTANT_GIST) : '(sem resposta)'
    return `- Turno ${index + 1}: pedido — ${user}\n  resposta — ${assistant}`
  })
  return `[Resumo dos turnos anteriores desta conversa — preserve estes fatos e decisões]\n${lines.join('\n')}`
}

/**
 * Build the history messages for a turn. When the conversation exceeds
 * `window` turns, the oldest are replaced by a single rolling-summary message
 * and only the last `window` turns are kept verbatim.
 */
export function buildWindowedChatHistory(
  turns: ChatTurnData[],
  renderUserContent: (turn: ChatTurnData) => string,
  window: number = DEFAULT_HISTORY_WINDOW,
): ChatHistoryMessage[] {
  if (turns.length <= window) return flattenTurns(turns, renderUserContent)
  const olderCount = turns.length - window
  const older = turns.slice(0, olderCount)
  const recent = turns.slice(olderCount)
  return [
    { role: 'user', content: buildRollingSummaryNote(older, renderUserContent) },
    ...flattenTurns(recent, renderUserContent),
  ]
}

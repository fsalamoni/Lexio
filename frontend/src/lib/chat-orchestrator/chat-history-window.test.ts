import { describe, expect, it } from 'vitest'
import { buildWindowedChatHistory, buildRollingSummaryNote } from './chat-history-window'
import type { ChatTurnData } from '../firestore-types'

function turn(n: number, withAnswer = true): ChatTurnData {
  return {
    id: `t${n}`,
    conversation_id: 'c1',
    user_input: `pergunta ${n}`,
    trail: [],
    assistant_markdown: withAnswer ? `resposta ${n}` : null,
    status: 'done',
    created_at: new Date(2026, 0, n).toISOString(),
  }
}

const render = (t: ChatTurnData) => t.user_input

describe('chat-history-window', () => {
  it('returns every turn verbatim when within the window', () => {
    const turns = [turn(1), turn(2), turn(3)]
    const history = buildWindowedChatHistory(turns, render, 8)
    // 3 user + 3 assistant
    expect(history).toHaveLength(6)
    expect(history[0]).toEqual({ role: 'user', content: 'pergunta 1' })
    expect(history.every(m => !m.content.includes('Resumo dos turnos'))).toBe(true)
  })

  it('collapses older turns into a single rolling-summary note when exceeding the window', () => {
    const turns = Array.from({ length: 10 }, (_, i) => turn(i + 1))
    const history = buildWindowedChatHistory(turns, render, 4)
    // 1 summary message + last 4 turns (4 user + 4 assistant)
    expect(history[0].role).toBe('user')
    expect(history[0].content).toContain('Resumo dos turnos anteriores')
    expect(history[0].content).toContain('pergunta 1')
    expect(history[0].content).toContain('pergunta 6') // older = turns 1..6
    expect(history[0].content).not.toContain('pergunta 7') // recent kept verbatim
    expect(history).toHaveLength(1 + 4 * 2)
    expect(history[1]).toEqual({ role: 'user', content: 'pergunta 7' })
  })

  it('omits assistant messages for turns without an answer', () => {
    const history = buildWindowedChatHistory([turn(1, false)], render, 8)
    expect(history).toHaveLength(1)
    expect(history[0].role).toBe('user')
  })

  it('builds a readable rolling summary', () => {
    const note = buildRollingSummaryNote([turn(1), turn(2)], render)
    expect(note).toContain('Turno 1: pedido — pergunta 1')
    expect(note).toContain('resposta — resposta 1')
  })
})

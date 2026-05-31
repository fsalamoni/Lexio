/**
 * Export a chat conversation to a downloadable file (Markdown or JSON).
 *
 * Pure builders + a tiny browser download helper. No Firestore or network
 * access — operates on the turns already loaded in the controller state.
 */
import type { ChatConversationData, ChatTurnData } from './firestore-types'

export type ChatExportFormat = 'md' | 'json'

function formatDate(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch {
    return iso
  }
}

/** Build a human-readable Markdown transcript of the conversation. */
export function buildConversationMarkdown(
  conversation: ChatConversationData | null,
  turns: ChatTurnData[],
): string {
  const lines: string[] = []
  lines.push(`# ${conversation?.title?.trim() || 'Conversa'}`)
  const meta: string[] = []
  if (conversation?.created_at) meta.push(`Criada em ${formatDate(conversation.created_at)}`)
  meta.push(`${turns.length} mensagem(ns)`)
  meta.push(`Exportada em ${formatDate(new Date().toISOString())}`)
  lines.push('', `_${meta.join(' · ')}_`, '')

  turns.forEach((turn, index) => {
    lines.push(`## ${index + 1}. Você`)
    lines.push('', (turn.user_input || '(sem texto)').trim(), '')
    if (turn.assistant_markdown?.trim()) {
      lines.push('### Assistente', '', turn.assistant_markdown.trim(), '')
    } else if (turn.status && turn.status !== 'done') {
      lines.push('### Assistente', '', `_(turno ${turn.status})_`, '')
    }
    lines.push('---', '')
  })

  return lines.join('\n')
}

/** Build a structured JSON snapshot (transcript only — no internal trail dumps). */
export function buildConversationJson(
  conversation: ChatConversationData | null,
  turns: ChatTurnData[],
): string {
  return JSON.stringify(
    {
      title: conversation?.title ?? null,
      conversation_id: conversation?.id ?? null,
      created_at: conversation?.created_at ?? null,
      exported_at: new Date().toISOString(),
      effort: conversation?.effort ?? null,
      turns: turns.map(turn => ({
        user_input: turn.user_input,
        assistant_markdown: turn.assistant_markdown ?? null,
        status: turn.status ?? null,
        created_at: turn.created_at ?? null,
        completed_at: turn.completed_at ?? null,
      })),
    },
    null,
    2,
  )
}

/** Slugify a title into a safe filename stem. */
function slugify(text: string): string {
  return (text || 'conversa')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'conversa'
}

/** Trigger a browser download of `content`. No-op outside the browser. */
export function downloadTextFile(filename: string, content: string, mime: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Build + download a conversation export in the requested format. */
export function exportChatConversation(
  conversation: ChatConversationData | null,
  turns: ChatTurnData[],
  format: ChatExportFormat,
): void {
  const stem = slugify(conversation?.title ?? 'conversa')
  if (format === 'json') {
    downloadTextFile(`${stem}.json`, buildConversationJson(conversation, turns), 'application/json')
    return
  }
  downloadTextFile(`${stem}.md`, buildConversationMarkdown(conversation, turns), 'text/markdown')
}

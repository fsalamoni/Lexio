import type { ChatContextSourceRef, ChatTurnAttachment, ChatTurnData } from './firestore-types'

export function buildAttachmentContextSources(attachments: ChatTurnAttachment[]): ChatContextSourceRef[] {
  return attachments.map((attachment, index) => ({
    source_id: `attachment:${attachment.attachment_id}`,
    source_type: 'attachment',
    title: attachment.filename,
    attachment_id: attachment.attachment_id,
    summary: summarizeAttachmentForContext(attachment),
    citation_label: `[Anexo ${index + 1}: ${attachment.filename}]`,
    confidence: attachment.extraction.status === 'ready' ? 1 : attachment.extraction.status === 'partial' ? 0.75 : 0.4,
  }))
}

export function renderTurnUserContentForHistory(turn: ChatTurnData): string {
  if (!turn.input_attachments?.length && !turn.context_sources?.length) return turn.user_input
  return renderUserInputWithContext({
    userInput: turn.user_input,
    attachments: turn.input_attachments ?? [],
    contextSources: turn.context_sources ?? [],
    attachmentHeading: '## Anexos do turno',
  })
}

export function renderCurrentTurnUserContent(args: {
  userInput: string
  attachments?: ChatTurnAttachment[]
  contextSources?: ChatContextSourceRef[]
}): string {
  return renderUserInputWithContext({
    userInput: args.userInput,
    attachments: args.attachments ?? [],
    contextSources: args.contextSources ?? [],
    attachmentHeading: '## Anexos recebidos neste turno',
  })
}

function renderUserInputWithContext(args: {
  userInput: string
  attachments: ChatTurnAttachment[]
  contextSources: ChatContextSourceRef[]
  attachmentHeading: string
}): string {
  const sections = [args.userInput]
  if (args.attachments.length) {
    sections.push('', args.attachmentHeading)
    args.attachments.forEach((attachment, index) => {
      sections.push(renderAttachmentForPrompt(attachment, index))
    })
  }
  if (args.contextSources.length) {
    sections.push('', '## Fontes de contexto vinculadas')
    args.contextSources.forEach((source, index) => {
      sections.push(`- Fonte ${index + 1}: ${source.title} (${source.source_type})${source.summary ? ` - ${clip(source.summary, 900)}` : ''}`)
    })
  }
  return sections.join('\n')
}

function renderAttachmentForPrompt(attachment: ChatTurnAttachment, index: number): string {
  const lines = [
    `### Anexo ${index + 1}: ${attachment.filename}`,
    `Tipo: ${attachment.kind}`,
    `MIME: ${attachment.mime_type || 'desconhecido'}`,
    `Tamanho: ${attachment.size_bytes} bytes`,
    `Extração: ${attachment.extraction.status}`,
  ]
  if (attachment.upload_status) lines.push(`Upload: ${attachment.upload_status}`)
  if (attachment.storage_path) lines.push(`Storage: ${attachment.storage_path}`)
  if (attachment.extraction.mode) lines.push(`Modo: ${attachment.extraction.mode}`)
  if (attachment.extraction.page_count) lines.push(`Páginas: ${attachment.extraction.page_count}`)
  if (attachment.extraction.sheet_count) lines.push(`Abas: ${attachment.extraction.sheet_count}`)
  if (attachment.extraction.text_preview) {
    lines.push('', 'Texto extraído:', clip(attachment.extraction.text_preview, 12_000))
  } else if (attachment.extraction.error || attachment.upload_error) {
    lines.push(`Erro: ${[attachment.extraction.error, attachment.upload_error].filter(Boolean).join(' | ')}`)
  } else {
    lines.push('Conteúdo binário disponível como referência; use ferramentas multimodais quando habilitadas.')
  }
  return lines.join('\n')
}

function summarizeAttachmentForContext(attachment: ChatTurnAttachment): string {
  if (attachment.extraction.text_preview) return clip(attachment.extraction.text_preview, 600)
  if (attachment.extraction.error) return attachment.extraction.error
  if (attachment.upload_error) return attachment.upload_error
  return `${attachment.kind} (${attachment.mime_type || 'sem MIME'}), ${attachment.extraction.status}${attachment.upload_status ? `, ${attachment.upload_status}` : ''}`
}

function clip(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}\n...[conteudo truncado]`
}

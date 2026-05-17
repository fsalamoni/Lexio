import { describe, expect, it } from 'vitest'
import {
  classifyChatAttachment,
  isAcceptedChatAttachment,
  MAX_INLINE_CHAT_ATTACHMENT_TEXT_CHARS,
  prepareChatInputAttachment,
  prepareChatInputAttachmentCandidate,
} from './chat-attachment-ingestion'

describe('chat attachment ingestion', () => {
  it('classifies common multimodal attachment types', () => {
    expect(classifyChatAttachment(new File(['x'], 'contrato.pdf', { type: 'application/pdf' }))).toBe('document')
    expect(classifyChatAttachment(new File(['x'], 'dados.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))).toBe('spreadsheet')
    expect(classifyChatAttachment(new File(['x'], 'foto.png', { type: 'image/png' }))).toBe('image')
    expect(classifyChatAttachment(new File(['x'], 'audio.mp3', { type: 'audio/mpeg' }))).toBe('audio')
    expect(classifyChatAttachment(new File(['x'], 'video.mp4', { type: 'video/mp4' }))).toBe('video')
  })

  it('extracts text attachments into bounded previews', async () => {
    const file = new File(['Linha 1\nLinha 2'], 'notas.txt', { type: 'text/plain' })

    const attachment = await prepareChatInputAttachment(file, {
      now: '2026-05-16T12:00:00.000Z',
      attachmentId: 'att-test',
    })

    expect(attachment).toMatchObject({
      attachment_id: 'att-test',
      filename: 'notas.txt',
      kind: 'document',
      extraction: {
        status: 'ready',
        mode: 'text',
        text_preview: 'Linha 1\nLinha 2',
        text_char_count: 15,
        truncated: false,
      },
    })
  })

  it('returns raw file candidates paired with prepared metadata', async () => {
    const file = new File(['conteúdo'], 'notas.txt', { type: 'text/plain' })

    const candidate = await prepareChatInputAttachmentCandidate(file, {
      now: '2026-05-16T12:00:00.000Z',
      attachmentId: 'att-candidate',
    })

    expect(candidate.file).toBe(file)
    expect(candidate.attachment).toMatchObject({
      attachment_id: 'att-candidate',
      filename: 'notas.txt',
      extraction: { status: 'ready' },
    })
  })

  it('marks long extracted text as partial instead of inlining everything', async () => {
    const longText = 'a'.repeat(MAX_INLINE_CHAT_ATTACHMENT_TEXT_CHARS + 25)
    const file = new File([longText], 'long.md', { type: 'text/markdown' })

    const attachment = await prepareChatInputAttachment(file, {
      now: '2026-05-16T12:00:00.000Z',
      attachmentId: 'att-long',
    })

    expect(attachment.extraction.status).toBe('partial')
    expect(attachment.extraction.truncated).toBe(true)
    expect(attachment.extraction.text_preview).toHaveLength(MAX_INLINE_CHAT_ATTACHMENT_TEXT_CHARS)
    expect(attachment.extraction.text_char_count).toBe(MAX_INLINE_CHAT_ATTACHMENT_TEXT_CHARS + 25)
  })

  it('accepts known media files but leaves analysis pending for later providers', async () => {
    const file = new File(['image-bytes'], 'foto.webp', { type: 'image/webp' })

    expect(isAcceptedChatAttachment(file)).toBe(true)
    const attachment = await prepareChatInputAttachment(file, {
      now: '2026-05-16T12:00:00.000Z',
      attachmentId: 'att-image',
    })

    expect(attachment).toMatchObject({
      kind: 'image',
      extraction: {
        status: 'pending',
        mode: 'image',
      },
    })
  })

  it('extracts CSV spreadsheets as structured data context', async () => {
    const file = new File(['Nome;Valor\nHonorários;1000'], 'custos.csv', { type: 'text/csv' })

    const attachment = await prepareChatInputAttachment(file, {
      now: '2026-05-16T12:00:00.000Z',
      attachmentId: 'att-csv',
    })

    expect(attachment.kind).toBe('spreadsheet')
    expect(attachment.extraction).toMatchObject({
      status: 'ready',
      mode: 'structured_data',
      sheet_count: 1,
    })
    expect(attachment.extraction.text_preview).toContain('Honorários | 1000')
  })

  it('rejects empty files with a visible extraction error', async () => {
    const file = new File([], 'vazio.txt', { type: 'text/plain' })

    expect(isAcceptedChatAttachment(file)).toBe(false)
    const attachment = await prepareChatInputAttachment(file, {
      now: '2026-05-16T12:00:00.000Z',
      attachmentId: 'att-empty',
    })

    expect(attachment.extraction.status).toBe('failed')
    expect(attachment.extraction.error).toContain('Arquivo vazio')
  })
})

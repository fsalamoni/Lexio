import { describe, expect, it, vi } from 'vitest'
import type { ChatTurnAttachment } from './firestore-types'
import {
  analyzeChatMultimodalAttachment,
  analyzeChatMultimodalAttachments,
  CHAT_IMAGE_ANALYSIS_MAX_BYTES,
  CHAT_VIDEO_ANALYSIS_MAX_BYTES,
  resolveChatMultimodalMaxAttachments,
  resolveChatMultimodalModel,
} from './chat-multimodal-analysis'

function imageAttachment(overrides: Partial<ChatTurnAttachment> = {}): ChatTurnAttachment {
  return {
    attachment_id: 'att-img',
    filename: 'placa.png',
    mime_type: 'image/png',
    extension: '.png',
    size_bytes: 8,
    kind: 'image',
    created_at: '2026-05-16T12:00:00.000Z',
    extraction: {
      status: 'pending',
      mode: 'image',
      processed_at: '2026-05-16T12:00:00.000Z',
    },
    ...overrides,
  }
}

function videoAttachment(overrides: Partial<ChatTurnAttachment> = {}): ChatTurnAttachment {
  return {
    attachment_id: 'att-video',
    filename: 'audiencia.mp4',
    mime_type: 'video/mp4',
    extension: '.mp4',
    size_bytes: 1024,
    kind: 'video',
    created_at: '2026-05-16T12:00:00.000Z',
    extraction: {
      status: 'partial',
      mode: 'video',
      duration_seconds: 9,
      media_width: 1920,
      media_height: 1080,
      processed_at: '2026-05-16T12:00:00.000Z',
    },
    ...overrides,
  }
}

describe('chat multimodal analysis', () => {
  it('turns an image into OCR-ready text context without persisting base64', async () => {
    const llmCall = vi.fn().mockResolvedValue({
      content: 'Descrição: foto de uma placa.\nOCR: Processo 0001234-56.2026.8.00.0000.',
      model: 'openai/gpt-4o-mini',
      tokens_in: 120,
      tokens_out: 40,
      cost_usd: 0.002,
      duration_ms: 250,
      provider_id: 'openai',
      provider_label: 'OpenAI',
    })
    const attachment = imageAttachment()
    const file = new File(['img-data'], 'placa.png', { type: 'image/png' })

    const result = await analyzeChatMultimodalAttachment({
      file,
      attachment,
      apiKey: 'test-key',
      userInput: 'Analise esta prova.',
      now: '2026-05-16T12:01:00.000Z',
      llmCall,
    })

    expect(result.attachment.extraction).toMatchObject({
      status: 'ready',
      mode: 'image',
      analysis_model: 'openai/gpt-4o-mini',
      analysis_provider: 'OpenAI',
      analysis_tokens_in: 120,
      analysis_tokens_out: 40,
    })
    expect(result.attachment.extraction.text_preview).toContain('Processo 0001234')
    expect(result.attachment.extraction.text_preview).not.toContain('data:image')
    expect(result.usage).toMatchObject({
      source_type: 'chat_multimodal_analysis',
      phase: 'chat_multimodal_analysis',
      model: 'openai/gpt-4o-mini',
      tokens_in: 120,
      tokens_out: 40,
    })
    const messages = llmCall.mock.calls[0][0].messages
    expect(messages[1].content[1].image_url.url).toMatch(/^data:image\/png;base64,/)
  })

  it('emits trail events while enriching image attachments in batch', async () => {
    const events: unknown[] = []
    const llmCall = vi.fn().mockResolvedValue({
      content: 'OCR: texto da imagem.',
      model: 'openai/gpt-4o-mini',
      tokens_in: 20,
      tokens_out: 10,
      cost_usd: 0.001,
      duration_ms: 100,
    })
    const file = new File(['img-data'], 'placa.png', { type: 'image/png' })
    const attachment = imageAttachment()
    const result = await analyzeChatMultimodalAttachments({
      attachments: [attachment],
      attachmentFiles: [{ file, attachment }],
      apiKey: 'test-key',
      userInput: 'Leia a imagem.',
      now: () => '2026-05-16T12:01:00.000Z',
      onTrail: event => events.push(event),
      model: 'openai/gpt-4o-mini',
      fallbackModels: [],
      llmCall,
    })

    expect(result.changed).toBe(true)
    expect(result.attachments[0].extraction.status).toBe('ready')
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'multimodal_analysis_started', filename: 'placa.png' }),
      expect.objectContaining({ type: 'multimodal_analysis_completed', filename: 'placa.png' }),
    ]))
  })

  it('limits multimodal analysis volume per turn and emits skipped events', async () => {
    const events: unknown[] = []
    const llmCall = vi.fn().mockResolvedValue({
      content: 'OCR: texto da primeira imagem.',
      model: 'openai/gpt-4o-mini',
      tokens_in: 20,
      tokens_out: 10,
      cost_usd: 0.001,
      duration_ms: 100,
    })
    const first = imageAttachment({ attachment_id: 'att-1', filename: 'primeira.png' })
    const second = imageAttachment({ attachment_id: 'att-2', filename: 'segunda.png' })

    const result = await analyzeChatMultimodalAttachments({
      attachments: [first, second],
      attachmentFiles: [
        { file: new File(['first'], 'primeira.png', { type: 'image/png' }), attachment: first },
        { file: new File(['second'], 'segunda.png', { type: 'image/png' }), attachment: second },
      ],
      apiKey: 'test-key',
      userInput: 'Leia as imagens.',
      now: () => '2026-05-16T12:01:00.000Z',
      onTrail: event => events.push(event),
      model: 'openai/gpt-4o-mini',
      maxAnalyzedAttachments: 1,
      llmCall,
    })

    expect(llmCall).toHaveBeenCalledTimes(1)
    expect(result.attachments[0].extraction.status).toBe('ready')
    expect(result.attachments[1]).toBe(second)
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'multimodal_analysis_skipped', filename: 'segunda.png' }),
    ]))
  })

  it('skips oversized images with an explicit unsupported state', async () => {
    const attachment = imageAttachment({ size_bytes: CHAT_IMAGE_ANALYSIS_MAX_BYTES + 1 })
    const file = new File([new Uint8Array(CHAT_IMAGE_ANALYSIS_MAX_BYTES + 1)], 'grande.png', { type: 'image/png' })

    const result = await analyzeChatMultimodalAttachment({
      file,
      attachment,
      apiKey: 'test-key',
      userInput: 'Analise.',
      now: '2026-05-16T12:01:00.000Z',
      llmCall: vi.fn(),
    })

    expect(result.skipped).toBe(true)
    expect(result.attachment.extraction).toMatchObject({
      status: 'unsupported',
      mode: 'image',
    })
  })

  it('turns sampled video frames into text context without persisting frame images', async () => {
    const llmCall = vi.fn().mockResolvedValue({
      content: 'Frame início: audiência em sala. OCR: Processo 0009999-11.2026.8.00.0000.',
      model: 'openai/gpt-4o-mini',
      tokens_in: 220,
      tokens_out: 60,
      cost_usd: 0.004,
      duration_ms: 300,
      provider_label: 'OpenAI',
    })
    const attachment = videoAttachment()
    const result = await analyzeChatMultimodalAttachment({
      file: new File(['video'], 'audiencia.mp4', { type: 'video/mp4' }),
      attachment,
      apiKey: 'test-key',
      userInput: 'Analise este vídeo.',
      now: '2026-05-16T12:01:00.000Z',
      llmCall,
      videoFrameExtractor: vi.fn().mockResolvedValue([
        { label: 'início', timeSeconds: 0.5, dataUrl: 'data:image/jpeg;base64,frame-a' },
        { label: 'meio', timeSeconds: 4.5, dataUrl: 'data:image/jpeg;base64,frame-b' },
        { label: 'final', timeSeconds: 8.5, dataUrl: 'data:image/jpeg;base64,frame-c' },
      ]),
    })

    expect(result.attachment.extraction).toMatchObject({
      status: 'ready',
      mode: 'video',
      video_frame_count: 3,
      video_frame_timestamps: [0.5, 4.5, 8.5],
      analysis_model: 'openai/gpt-4o-mini',
    })
    expect(result.attachment.extraction.text_preview).toContain('Análise multimodal do vídeo')
    expect(result.attachment.extraction.text_preview).not.toContain('data:image')
    const content = llmCall.mock.calls[0][0].messages[1].content as Array<{ type: string; image_url?: { url: string } }>
    expect(content.filter(part => part.type === 'image_url')).toHaveLength(3)
  })

  it('skips oversized videos with an explicit unsupported state', async () => {
    const attachment = videoAttachment({ size_bytes: CHAT_VIDEO_ANALYSIS_MAX_BYTES + 1 })
    const file = new File([new Uint8Array(CHAT_VIDEO_ANALYSIS_MAX_BYTES + 1)], 'grande.mp4', { type: 'video/mp4' })

    const result = await analyzeChatMultimodalAttachment({
      file,
      attachment,
      apiKey: 'test-key',
      userInput: 'Analise.',
      now: '2026-05-16T12:01:00.000Z',
      llmCall: vi.fn(),
    })

    expect(result.skipped).toBe(true)
    expect(result.attachment.extraction).toMatchObject({
      status: 'unsupported',
      mode: 'video',
    })
  })

  it('uses the dedicated multimodal model and ignores blank saved values', () => {
    expect(resolveChatMultimodalModel({
      chat_multimodal_analysis: '',
      chat_legal_researcher: 'google/gemini-2.5-flash',
      chat_orchestrator: 'anthropic/claude-sonnet-4',
    })).toBe('google/gemini-2.5-flash')

    expect(resolveChatMultimodalModel({
      chat_multimodal_analysis: 'openai/gpt-4o',
      chat_legal_researcher: 'google/gemini-2.5-flash',
    })).toBe('openai/gpt-4o')
  })

  it('clamps configured multimodal attachment limits', () => {
    expect(resolveChatMultimodalMaxAttachments(undefined)).toBe(4)
    expect(resolveChatMultimodalMaxAttachments('2')).toBe(2)
    expect(resolveChatMultimodalMaxAttachments('99')).toBe(12)
    expect(resolveChatMultimodalMaxAttachments('-1')).toBe(0)
  })
})

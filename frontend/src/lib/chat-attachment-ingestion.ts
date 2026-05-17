import type { ChatAttachmentKind, ChatTurnAttachment } from './firestore-types'
import {
  extractFileTextWithMeta,
  getFileExtension,
  isSupportedTextFile,
  SUPPORTED_TEXT_FILE_EXTENSIONS,
} from './file-text-extractor'
import { extractSpreadsheetTextWithMeta } from './spreadsheet-extractor'
import { extractPresentationTextWithMeta } from './presentation-extractor'

export const MAX_INLINE_CHAT_ATTACHMENT_TEXT_CHARS = 20_000
export const MAX_CHAT_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024

export const CHAT_ATTACHMENT_EXTRA_EXTENSIONS = [
  '.xls',
  '.xlsx',
  '.ods',
  '.ppt',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
  '.mp3',
  '.wav',
  '.m4a',
  '.ogg',
  '.flac',
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  '.zip',
  '.rar',
  '.7z',
] as const

export const CHAT_ATTACHMENT_ACCEPTED_EXTENSIONS = [
  ...SUPPORTED_TEXT_FILE_EXTENSIONS,
  ...CHAT_ATTACHMENT_EXTRA_EXTENSIONS,
]

export interface PrepareChatAttachmentOptions {
  now?: string
  attachmentId?: string
}

export interface PreparedChatInputAttachment {
  file: File
  attachment: ChatTurnAttachment
}

export function classifyChatAttachment(file: Pick<File, 'name' | 'type'>): ChatAttachmentKind {
  const extension = getFileExtension(file.name)
  const mimeType = file.type || ''

  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || ['.xls', '.xlsx', '.ods', '.csv'].includes(extension)) return 'spreadsheet'
  if (mimeType.includes('presentation') || ['.ppt', '.pptx'].includes(extension)) return 'presentation'
  if (['.zip', '.rar', '.7z'].includes(extension)) return 'archive'
  if (['.ts', '.tsx', '.js', '.jsx', '.py', '.sql', '.css', '.html', '.json', '.xml', '.yaml', '.yml'].includes(extension)) return 'code'
  if (isProbablyDocumentExtension(extension) || mimeType.startsWith('text/') || mimeType.includes('pdf') || mimeType.includes('word')) return 'document'
  return 'other'
}

export function isAcceptedChatAttachment(file: File): boolean {
  if (file.size <= 0 || file.size > MAX_CHAT_ATTACHMENT_SIZE_BYTES) return false
  return isSupportedTextFile(file) || CHAT_ATTACHMENT_EXTRA_EXTENSIONS.includes(getFileExtension(file.name) as typeof CHAT_ATTACHMENT_EXTRA_EXTENSIONS[number])
}

export async function prepareChatInputAttachment(
  file: File,
  options: PrepareChatAttachmentOptions = {},
): Promise<ChatTurnAttachment> {
  const createdAt = options.now ?? new Date().toISOString()
  const attachmentId = options.attachmentId ?? makeAttachmentId()
  const extension = getFileExtension(file.name)
  const kind = classifyChatAttachment(file)
  const base = {
    attachment_id: attachmentId,
    filename: file.name,
    mime_type: file.type || 'application/octet-stream',
    extension: extension || undefined,
    size_bytes: file.size,
    kind,
    created_at: createdAt,
  }

  if (file.size <= 0) {
    return {
      ...base,
      extraction: {
        status: 'failed',
        mode: 'unknown',
        error: 'Arquivo vazio.',
        processed_at: createdAt,
      },
    }
  }

  if (file.size > MAX_CHAT_ATTACHMENT_SIZE_BYTES) {
    return {
      ...base,
      extraction: {
        status: 'failed',
        mode: 'binary',
        error: 'Arquivo excede o limite inicial de 50 MB para anexos do chat.',
        processed_at: createdAt,
      },
    }
  }

  if (kind === 'spreadsheet' && ['.csv', '.xlsx'].includes(extension)) {
    try {
      const extracted = await extractSpreadsheetTextWithMeta(file)
      const text = extracted.text.trim()
      const truncated = text.length > MAX_INLINE_CHAT_ATTACHMENT_TEXT_CHARS
      return {
        ...base,
        extraction: {
          status: text ? (truncated ? 'partial' : 'ready') : 'partial',
          mode: 'structured_data',
          text_preview: truncated ? text.slice(0, MAX_INLINE_CHAT_ATTACHMENT_TEXT_CHARS) : text,
          text_char_count: text.length,
          truncated,
          sheet_count: extracted.sheetCount,
          processed_at: createdAt,
        },
      }
    } catch (error) {
      return {
        ...base,
        extraction: {
          status: 'failed',
          mode: 'structured_data',
          error: error instanceof Error ? error.message : String(error),
          processed_at: createdAt,
        },
      }
    }
  }

  if (kind === 'presentation' && extension === '.pptx') {
    try {
      const extracted = await extractPresentationTextWithMeta(file)
      const text = extracted.text.trim()
      const truncated = text.length > MAX_INLINE_CHAT_ATTACHMENT_TEXT_CHARS
      return {
        ...base,
        extraction: {
          status: text ? (truncated ? 'partial' : 'ready') : 'partial',
          mode: 'text',
          text_preview: truncated ? text.slice(0, MAX_INLINE_CHAT_ATTACHMENT_TEXT_CHARS) : text,
          text_char_count: text.length,
          truncated,
          slide_count: extracted.slideCount,
          processed_at: createdAt,
        },
      }
    } catch (error) {
      return {
        ...base,
        extraction: {
          status: 'failed',
          mode: 'text',
          error: error instanceof Error ? error.message : String(error),
          processed_at: createdAt,
        },
      }
    }
  }

  if (isSupportedTextFile(file)) {
    try {
      const extracted = await extractFileTextWithMeta(file)
      const text = extracted.text.trim()
      const truncated = text.length > MAX_INLINE_CHAT_ATTACHMENT_TEXT_CHARS
      return {
        ...base,
        extraction: {
          status: text ? (truncated ? 'partial' : 'ready') : 'partial',
          mode: kind === 'spreadsheet' ? 'structured_data' : 'text',
          text_preview: truncated ? text.slice(0, MAX_INLINE_CHAT_ATTACHMENT_TEXT_CHARS) : text,
          text_char_count: text.length,
          truncated,
          page_count: extracted.pageCount,
          pages_with_text: extracted.pagesWithText,
          processed_at: createdAt,
        },
      }
    } catch (error) {
      return {
        ...base,
        extraction: {
          status: 'failed',
          mode: kind === 'spreadsheet' ? 'structured_data' : 'text',
          error: error instanceof Error ? error.message : String(error),
          processed_at: createdAt,
        },
      }
    }
  }

  return {
    ...base,
    extraction: {
      status: kind === 'other' || kind === 'archive' ? 'unsupported' : 'pending',
      mode: kindToExtractionMode(kind),
      error: kind === 'other' || kind === 'archive'
        ? 'Arquivo anexado, mas a extração automática deste formato ainda não está habilitada.'
        : undefined,
      processed_at: createdAt,
    },
  }
}

export async function prepareChatInputAttachmentCandidate(
  file: File,
  options: PrepareChatAttachmentOptions = {},
): Promise<PreparedChatInputAttachment> {
  return {
    file,
    attachment: await prepareChatInputAttachment(file, options),
  }
}

function isProbablyDocumentExtension(extension: string): boolean {
  return ['.pdf', '.doc', '.docx', '.rtf', '.txt', '.md'].includes(extension)
}

function kindToExtractionMode(kind: ChatAttachmentKind): ChatTurnAttachment['extraction']['mode'] {
  if (kind === 'image') return 'image'
  if (kind === 'audio') return 'audio'
  if (kind === 'video') return 'video'
  if (kind === 'spreadsheet') return 'structured_data'
  if (kind === 'document' || kind === 'code' || kind === 'presentation') return 'text'
  if (kind === 'archive') return 'binary'
  return 'unknown'
}

function makeAttachmentId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12)
  return `att-${random}`
}

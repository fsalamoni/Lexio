import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { IS_FIREBASE, storage } from './firebase'

export interface StoredChatInputFile {
  url: string
  path?: string
  status: 'local' | 'uploaded'
}

const MAX_SANITIZED_SEGMENT_LENGTH = 80

function sanitizePathSegment(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SANITIZED_SEGMENT_LENGTH)
  return normalized || fallback
}

function normalizeExtension(extension: string): string {
  if (!extension.trim()) return ''
  return extension.startsWith('.') ? extension : `.${extension}`
}

function extensionFromFileName(fileName: string): string {
  const match = fileName.match(/\.[a-zA-Z0-9]+$/)
  return match ? match[0].toLowerCase() : ''
}

function describeStorageUploadError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : ''
  const message = error instanceof Error ? error.message : String(error || '')

  if (code === 'storage/unauthorized') {
    return 'Sem permissão para salvar anexos do chat no Cloud Storage. Publique as storage rules ou revise o usuário autenticado.'
  }
  if (code === 'storage/canceled') return 'Upload do anexo do chat cancelado.'
  if (code === 'storage/retry-limit-exceeded') return 'O upload do anexo do chat excedeu o limite de tentativas.'
  return message || 'Falha desconhecida ao salvar anexo do chat no Cloud Storage.'
}

export async function uploadChatInputAttachmentFile(args: {
  userId: string
  conversationId: string
  turnId: string
  attachmentId: string
  filename: string
  file: File
}): Promise<StoredChatInputFile> {
  if (!IS_FIREBASE || !storage) {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      return { url: URL.createObjectURL(args.file), status: 'local' }
    }
    return { url: '', status: 'local' }
  }

  const conversationId = sanitizePathSegment(args.conversationId, 'conversation')
  const turnId = sanitizePathSegment(args.turnId, 'turn')
  const attachmentId = sanitizePathSegment(args.attachmentId, 'attachment')
  const baseName = sanitizePathSegment(args.filename.replace(/\.[a-zA-Z0-9]+$/, ''), 'attachment')
  const extension = normalizeExtension(extensionFromFileName(args.filename))
  const path = `chat_inputs/${args.userId}/${conversationId}/${turnId}/${attachmentId}/${baseName}${extension}`
  const storageRef = ref(storage, path)

  try {
    await uploadBytes(storageRef, args.file, {
      contentType: args.file.type || 'application/octet-stream',
      cacheControl: 'private,max-age=3600',
      customMetadata: {
        conversationId,
        turnId,
        attachmentId,
      },
    })
  } catch (error) {
    throw new Error(describeStorageUploadError(error))
  }

  return {
    url: await getDownloadURL(storageRef),
    path,
    status: 'uploaded',
  }
}

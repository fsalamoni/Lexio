import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { IS_FIREBASE, storage } from './firebase'

export interface StoredChatArtifactFile {
  url: string
  path?: string
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

function describeStorageUploadError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : ''
  const message = error instanceof Error ? error.message : String(error || '')

  if (code === 'storage/unauthorized') {
    return 'Sem permissão para salvar o artefato do chat no Cloud Storage. Publique as storage rules ou revise o usuário autenticado.'
  }
  if (code === 'storage/canceled') return 'Upload do artefato do chat cancelado.'
  if (code === 'storage/retry-limit-exceeded') return 'O upload do artefato do chat excedeu o limite de tentativas.'
  return message || 'Falha desconhecida ao salvar artefato do chat no Cloud Storage.'
}

export async function uploadChatArtifactFile(args: {
  userId: string
  conversationId: string
  turnId: string
  artifactId: string
  exportId: string
  title: string
  extension: string
  blob: Blob
}): Promise<StoredChatArtifactFile> {
  if (!IS_FIREBASE || !storage) {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      return { url: URL.createObjectURL(args.blob) }
    }
    return { url: '' }
  }

  const conversationId = sanitizePathSegment(args.conversationId, 'conversation')
  const turnId = sanitizePathSegment(args.turnId, 'turn')
  const artifactId = sanitizePathSegment(args.artifactId, 'artifact')
  const exportId = sanitizePathSegment(args.exportId, 'export')
  const title = sanitizePathSegment(args.title, 'artifact')
  const extension = normalizeExtension(args.extension)
  const path = `chat_artifacts/${args.userId}/${conversationId}/${turnId}/${artifactId}/${title}-${exportId}${extension}`
  const storageRef = ref(storage, path)

  try {
    await uploadBytes(storageRef, args.blob, {
      contentType: args.blob.type || 'application/octet-stream',
      cacheControl: 'private,max-age=3600',
    })
  } catch (error) {
    throw new Error(describeStorageUploadError(error))
  }

  return {
    url: await getDownloadURL(storageRef),
    path,
  }
}
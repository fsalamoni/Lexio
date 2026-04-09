import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { IS_FIREBASE, storage } from './firebase'

export interface StoredNotebookMedia {
  url: string
  path?: string
}

type NotebookMediaKind = 'videos' | 'audios' | 'images'

const MAX_SANITIZED_FILENAME_LENGTH = 80

function sanitizeFileName(value: string): string {
  if (!value.trim()) return 'media'
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    // Keep paths compact to avoid very long object keys in storage paths.
    .slice(0, MAX_SANITIZED_FILENAME_LENGTH)
    .trim() || 'media'
}

function inferExtensionFromMimeType(mimeType?: string, fallback = ''): string {
  if (!mimeType) return fallback
  const value = mimeType.toLowerCase()
  if (value.includes('video/mp4')) return '.mp4'
  if (value.includes('video/webm')) return '.webm'
  if (value.includes('video/ogg')) return '.ogv'
  if (value.includes('video/quicktime')) return '.mov'
  return fallback
}

function describeStorageUploadError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : ''
  const message = error instanceof Error ? error.message : String(error || '')

  if (code === 'storage/unauthorized') {
    return 'Sem permissão para salvar mídia no Cloud Storage. Publique as storage rules do projeto ou revise o acesso do usuário autenticado.'
  }
  if (code === 'storage/canceled') {
    return 'Upload de mídia cancelado antes da conclusão.'
  }
  if (code === 'storage/retry-limit-exceeded') {
    return 'O upload de mídia excedeu o limite de tentativas. Verifique a conexão e tente novamente.'
  }
  if (code === 'storage/unknown' && message) {
    return `Falha no upload de mídia: ${message}`
  }
  return message || 'Falha desconhecida ao salvar mídia no Cloud Storage.'
}

export async function uploadNotebookVideoArtifact(
  userId: string,
  notebookId: string,
  title: string,
  blob: Blob,
): Promise<StoredNotebookMedia> {
  const extension = inferExtensionFromMimeType(blob.type, '.webm')
  return uploadNotebookMediaArtifact(userId, notebookId, title, blob, 'videos', extension)
}

export async function uploadNotebookMediaArtifact(
  userId: string,
  notebookId: string,
  title: string,
  blob: Blob,
  mediaKind: NotebookMediaKind,
  extension = '',
): Promise<StoredNotebookMedia> {
  if (!IS_FIREBASE || !storage) {
    return { url: URL.createObjectURL(blob) }
  }

  const safeExt = extension && extension.startsWith('.') ? extension : extension ? `.${extension}` : ''
  const fileName = `${sanitizeFileName(title)}-${Date.now()}${safeExt}`
  const path = `research_notebooks/${userId}/${notebookId}/${mediaKind}/${fileName}`
  const storageRef = ref(storage, path)

  try {
    await uploadBytes(storageRef, blob, {
      contentType: blob.type || 'application/octet-stream',
      cacheControl: 'public,max-age=31536000,immutable',
    })
  } catch (error) {
    throw new Error(describeStorageUploadError(error))
  }

  return {
    url: await getDownloadURL(storageRef),
    path,
  }
}

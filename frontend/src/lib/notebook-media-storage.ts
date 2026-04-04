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

  await uploadBytes(storageRef, blob, {
    contentType: blob.type || 'application/octet-stream',
    cacheControl: 'public,max-age=31536000,immutable',
  })

  return {
    url: await getDownloadURL(storageRef),
    path,
  }
}

import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { IS_FIREBASE, storage } from './firebase'

export interface StoredNotebookMedia {
  url: string
  path?: string
}

type NotebookMediaKind = 'videos' | 'audios' | 'images'

const MAX_SANITIZED_FILENAME_LENGTH = 80

function sanitizeFileName(value: string): string {
  if (!value.trim()) return 'video'
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    // Keep paths compact to avoid very long object keys in storage paths.
    .slice(0, MAX_SANITIZED_FILENAME_LENGTH) || 'video'
}

export async function uploadNotebookVideoArtifact(
  userId: string,
  notebookId: string,
  title: string,
  blob: Blob,
): Promise<StoredNotebookMedia> {
  return uploadNotebookMediaArtifact(userId, notebookId, title, blob, 'videos', '.webm')
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

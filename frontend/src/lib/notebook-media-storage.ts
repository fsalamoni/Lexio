import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { IS_FIREBASE, storage } from './firebase'

export interface StoredNotebookMedia {
  url: string
  path?: string
}

function sanitizeFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'video'
}

export async function uploadNotebookVideoArtifact(
  userId: string,
  notebookId: string,
  title: string,
  blob: Blob,
): Promise<StoredNotebookMedia> {
  if (!IS_FIREBASE || !storage) {
    return { url: URL.createObjectURL(blob) }
  }

  const fileName = `${sanitizeFileName(title)}-${Date.now()}.webm`
  const path = `research_notebooks/${userId}/${notebookId}/videos/${fileName}`
  const storageRef = ref(storage, path)

  await uploadBytes(storageRef, blob, {
    contentType: blob.type || 'video/webm',
    cacheControl: 'public,max-age=31536000,immutable',
  })

  return {
    url: await getDownloadURL(storageRef),
    path,
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRef = vi.fn()
const mockUploadBytes = vi.fn()
const mockGetDownloadURL = vi.fn()
const mockCreateObjectURL = vi.fn()

const { firebaseState } = vi.hoisted(() => ({
  firebaseState: {
    isFirebase: true,
    storage: { _fake: true } as Record<string, unknown> | null,
  },
}))

vi.mock('firebase/storage', () => ({
  ref: (...args: unknown[]) => mockRef(...args),
  uploadBytes: (...args: unknown[]) => mockUploadBytes(...args),
  getDownloadURL: (...args: unknown[]) => mockGetDownloadURL(...args),
}))

vi.mock('./firebase', () => ({
  get IS_FIREBASE() {
    return firebaseState.isFirebase
  },
  get storage() {
    return firebaseState.storage
  },
}))

import { uploadNotebookMediaArtifact, uploadNotebookVideoArtifact } from './notebook-media-storage'

describe('notebook media storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL })
    firebaseState.isFirebase = true
    firebaseState.storage = { _fake: true }
    mockCreateObjectURL.mockReturnValue('blob:local-media')
    mockRef.mockImplementation((_storage: unknown, path: string) => ({ path }))
    mockUploadBytes.mockResolvedValue(undefined)
    mockGetDownloadURL.mockResolvedValue('https://cdn.lexio.test/media.webm')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a local object URL when Firebase storage is unavailable', async () => {
    firebaseState.isFirebase = false
    firebaseState.storage = null

    const result = await uploadNotebookMediaArtifact(
      'user-1',
      'nb-1',
      'Video aula',
      new Blob(['abc'], { type: 'video/webm' }),
      'videos',
      '.webm',
    )

    expect(result).toEqual({ url: 'blob:local-media' })
    expect(mockCreateObjectURL).toHaveBeenCalledOnce()
    expect(mockUploadBytes).not.toHaveBeenCalled()
    expect(mockGetDownloadURL).not.toHaveBeenCalled()
  })

  it('surfaces unauthorized storage uploads with actionable guidance', async () => {
    mockUploadBytes.mockRejectedValueOnce(Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'storage/unauthorized',
    }))

    await expect(
      uploadNotebookMediaArtifact(
        'user-1',
        'nb-1',
        'Video aula',
        new Blob(['abc'], { type: 'video/webm' }),
        'videos',
        '.webm',
      ),
    ).rejects.toThrow('Sem permissão para salvar mídia no Cloud Storage.')

    expect(mockGetDownloadURL).not.toHaveBeenCalled()
  })

  it('surfaces canceled uploads as an interrupted media upload error', async () => {
    mockUploadBytes.mockRejectedValueOnce(Object.assign(new Error('Upload canceled by client.'), {
      code: 'storage/canceled',
    }))

    await expect(
      uploadNotebookMediaArtifact(
        'user-1',
        'nb-1',
        'Video aula',
        new Blob(['abc'], { type: 'video/webm' }),
        'videos',
        '.webm',
      ),
    ).rejects.toThrow('Upload de mídia cancelado antes da conclusão.')

    expect(mockGetDownloadURL).not.toHaveBeenCalled()
  })

  it('uploads notebook video artifacts with a sanitized storage path', async () => {
    const blob = new Blob(['abc'], { type: 'video/webm' })

    const result = await uploadNotebookVideoArtifact(
      'user-1',
      'nb-1',
      'Vídeo aula: Direito Constitucional',
      blob,
    )

    const path = mockRef.mock.calls[0]?.[1] as string
    expect(path).toMatch(/^research_notebooks\/user-1\/nb-1\/videos\/Video-aula-Direito-Constitucional-\d+\.webm$/)
    expect(mockUploadBytes).toHaveBeenCalledWith(
      { path },
      blob,
      expect.objectContaining({
        contentType: 'video/webm',
        cacheControl: 'public,max-age=31536000,immutable',
      }),
    )
    expect(result).toEqual({
      url: 'https://cdn.lexio.test/media.webm',
      path,
    })
  })
})
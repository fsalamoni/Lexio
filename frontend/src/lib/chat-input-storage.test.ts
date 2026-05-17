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

import { uploadChatInputAttachmentFile } from './chat-input-storage'

describe('chat input storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL })
    firebaseState.isFirebase = true
    firebaseState.storage = { _fake: true }
    mockCreateObjectURL.mockReturnValue('blob:local-input')
    mockRef.mockImplementation((_storage: unknown, path: string) => ({ path }))
    mockUploadBytes.mockResolvedValue(undefined)
    mockGetDownloadURL.mockResolvedValue('https://cdn.lexio.test/input.pdf')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a local object URL when Firebase storage is unavailable', async () => {
    firebaseState.isFirebase = false
    firebaseState.storage = null

    const result = await uploadChatInputAttachmentFile({
      userId: 'user-1',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      attachmentId: 'att-1',
      filename: 'contrato.pdf',
      file: new File(['abc'], 'contrato.pdf', { type: 'application/pdf' }),
    })

    expect(result).toEqual({ url: 'blob:local-input', status: 'local' })
    expect(mockCreateObjectURL).toHaveBeenCalledOnce()
    expect(mockUploadBytes).not.toHaveBeenCalled()
  })

  it('uploads raw chat inputs with sanitized storage paths and private cache policy', async () => {
    const file = new File(['abc'], 'Contrato nº 42.pdf', { type: 'application/pdf' })

    const result = await uploadChatInputAttachmentFile({
      userId: 'user-1',
      conversationId: 'conv A',
      turnId: 'turn:1',
      attachmentId: 'att/1',
      filename: file.name,
      file,
    })

    const path = mockRef.mock.calls[0]?.[1] as string
    expect(path).toBe('chat_inputs/user-1/conv-A/turn-1/att-1/Contrato-n-42.pdf')
    expect(mockUploadBytes).toHaveBeenCalledWith(
      { path },
      file,
      expect.objectContaining({
        contentType: 'application/pdf',
        cacheControl: 'private,max-age=3600',
      }),
    )
    expect(result).toEqual({
      url: 'https://cdn.lexio.test/input.pdf',
      path,
      status: 'uploaded',
    })
  })

  it('surfaces unauthorized uploads with actionable guidance', async () => {
    mockUploadBytes.mockRejectedValueOnce(Object.assign(new Error('Missing permissions'), {
      code: 'storage/unauthorized',
    }))

    await expect(uploadChatInputAttachmentFile({
      userId: 'user-1',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      attachmentId: 'att-1',
      filename: 'contrato.pdf',
      file: new File(['abc'], 'contrato.pdf', { type: 'application/pdf' }),
    })).rejects.toThrow('Sem permissão para salvar anexos do chat no Cloud Storage')

    expect(mockGetDownloadURL).not.toHaveBeenCalled()
  })
})

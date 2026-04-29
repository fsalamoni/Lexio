import { describe, expect, it, vi } from 'vitest'

import {
  shouldRetryTransientFirebaseAuthError,
  withTransientFirebaseAuthRetry,
} from './firebase-auth-retry'

describe('firebase-auth-retry', () => {
  it('retries once when firebase auth is still hydrating', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('Sessão do Firebase não sincronizada. Faça login novamente.'), {
        code: 'firestore/unauthenticated',
      }))
      .mockResolvedValueOnce('ok')

    await expect(withTransientFirebaseAuthRetry(operation, 0)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('does not retry permission-denied errors that Firestore already exhausted internally', async () => {
    const error = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })
    const operation = vi.fn().mockRejectedValue(error)

    await expect(withTransientFirebaseAuthRetry(operation, 0)).rejects.toBe(error)
    expect(operation).toHaveBeenCalledTimes(1)
    expect(shouldRetryTransientFirebaseAuthError(error)).toBe(false)
  })
})

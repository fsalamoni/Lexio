function getFirebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  if ('code' in error && typeof error.code === 'string') {
    return error.code.replace(/^firestore\//, '')
  }
  return null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return ''
}

export function shouldRetryTransientFirebaseAuthError(error: unknown): boolean {
  const code = getFirebaseErrorCode(error)
  if (code === 'unauthenticated') return true

  const message = getErrorMessage(error)
  return /sessão do firebase não sincronizada/i.test(message)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function withTransientFirebaseAuthRetry<T>(
  operation: () => Promise<T>,
  delayMs = 700,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!shouldRetryTransientFirebaseAuthError(error)) throw error
    await wait(delayMs)
    return operation()
  }
}

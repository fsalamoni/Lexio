/**
 * Lightweight per-key rate limiter for client-side media API calls.
 * Uses a simple token bucket over a rolling minute window.
 */

interface RateLimitWindow {
  timestamps: number[]
}

const windows = new Map<string, RateLimitWindow>()

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function withRateLimit<T>(
  key: string,
  maxPerMinute: number,
  task: () => Promise<T>,
): Promise<T> {
  const now = Date.now()
  const window = windows.get(key) || { timestamps: [] }
  window.timestamps = window.timestamps.filter(ts => now - ts < 60_000)

  if (window.timestamps.length >= Math.max(1, maxPerMinute)) {
    const oldest = window.timestamps[0]
    const waitMs = Math.max(0, 60_000 - (now - oldest) + 50)
    await sleep(waitMs)
    return withRateLimit(key, maxPerMinute, task)
  }

  window.timestamps.push(Date.now())
  windows.set(key, window)
  return task()
}

export async function withRetryAfterDelay<T>(
  task: () => Promise<T>,
  opts?: { retries?: number; baseDelayMs?: number },
): Promise<T> {
  const retries = opts?.retries ?? 2
  const baseDelayMs = opts?.baseDelayMs ?? 1200

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (attempt >= retries) break
      await sleep(baseDelayMs * (attempt + 1))
    }
  }

  throw lastError
}

/**
 * Connection auth for the sidecar — dependency-free so it can be unit-tested
 * without the `ws` runtime dependency. The token is the pairing secret the user
 * copies from the sidecar banner into Lexio settings.
 */
export const SIDECAR_HOST = '127.0.0.1'

/** Token may arrive as `?token=` query param or `x-lexio-token` header. */
export function isAuthorized(req, expectedToken) {
  if (!expectedToken) return false
  const headerToken = req?.headers?.['x-lexio-token']
  if (typeof headerToken === 'string' && safeEqual(headerToken, expectedToken)) return true
  try {
    const url = new URL(req?.url ?? '', `http://${SIDECAR_HOST}`)
    const queryToken = url.searchParams.get('token')
    if (queryToken && safeEqual(queryToken, expectedToken)) return true
  } catch { /* malformed URL → unauthorized */ }
  return false
}

/** Constant-time-ish string compare to avoid trivial timing leaks. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

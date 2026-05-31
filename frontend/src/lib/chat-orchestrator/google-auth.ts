/**
 * Google OAuth (client-side) via Google Identity Services (GIS) token model.
 *
 * No backend / no client secret: the GIS popup returns a short-lived access
 * token that is held **in memory only** (never persisted). Consent must be
 * triggered by a user gesture (the connector card button), so skills running
 * mid-turn use the cached token and ask the user to reconnect if it expired.
 */
import { GOOGLE_OAUTH_SCOPES } from './google-config'

const GIS_SRC = 'https://accounts.google.com/gsi/client'

interface GisTokenResponse {
  access_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

interface GisTokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void
}

interface GoogleGlobal {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (response: GisTokenResponse) => void
        error_callback?: (error: { type?: string; message?: string }) => void
      }) => GisTokenClient
      revoke?: (token: string, done?: () => void) => void
    }
  }
}

function getGoogle(): GoogleGlobal | undefined {
  return (globalThis as unknown as { google?: GoogleGlobal }).google
}

let gisLoading: Promise<void> | null = null

/** Inject the GIS client script once. */
export function loadGisScript(): Promise<void> {
  if (getGoogle()?.accounts?.oauth2) return Promise.resolve()
  if (gisLoading) return gisLoading
  gisLoading = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('GIS indisponível fora do browser.'))
      return
    }
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar o Google Identity Services.')), { once: true })
      if (getGoogle()?.accounts?.oauth2) resolve()
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Falha ao carregar o Google Identity Services.'))
    document.head.appendChild(script)
  })
  return gisLoading
}

// ── In-memory token cache ──────────────────────────────────────────────────────

interface CachedToken {
  token: string
  expiresAt: number // epoch ms
}

let cached: CachedToken | null = null

/** Returns a valid (non-expired, 60s skew) access token, or null. */
export function getCachedGoogleToken(): string | null {
  if (!cached) return null
  if (Date.now() >= cached.expiresAt - 60_000) {
    cached = null
    return null
  }
  return cached.token
}

export function googleConnectionStatus(): { connected: boolean; expiresAt?: number } {
  const token = getCachedGoogleToken()
  return token ? { connected: true, expiresAt: cached?.expiresAt } : { connected: false }
}

export function disconnectGoogle(): void {
  const token = cached?.token
  cached = null
  try {
    if (token) getGoogle()?.accounts?.oauth2?.revoke?.(token)
  } catch {
    // best-effort
  }
}

/**
 * Trigger the consent popup and cache the resulting access token. MUST be called
 * from a user gesture (button click). Resolves once the token is obtained.
 */
export function connectGoogle(clientId: string, scope: string = GOOGLE_OAUTH_SCOPES): Promise<{ expiresAt: number }> {
  return loadGisScript().then(() => new Promise((resolve, reject) => {
    const oauth2 = getGoogle()?.accounts?.oauth2
    if (!oauth2) {
      reject(new Error('Google Identity Services não disponível.'))
      return
    }
    let settled = false
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (response) => {
        if (settled) return
        settled = true
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Consentimento Google não concluído.'))
          return
        }
        const expiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000
        cached = { token: response.access_token, expiresAt }
        resolve({ expiresAt })
      },
      error_callback: (error) => {
        if (settled) return
        settled = true
        reject(new Error(error.message || 'Falha no fluxo OAuth do Google.'))
      },
    })
    tokenClient.requestAccessToken({ prompt: cached ? '' : 'consent' })
  }))
}

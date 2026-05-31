/**
 * Minimal Google Drive + Gmail REST client. Browser fetch with a GIS access
 * token (Bearer). `*.googleapis.com` is already allowed by the app CSP
 * (`connect-src https:`). Pure helpers — exported for unit testing.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1'

async function googleRequest<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    let detail = ''
    try { const j = await res.json(); detail = j?.error?.message ?? '' } catch { /* non-json */ }
    throw new Error(`Google API ${res.status}: ${detail || res.statusText}`)
  }
  return res.json() as Promise<T>
}

// ── base64 helpers (UTF-8 safe) ────────────────────────────────────────────────

function base64ToUtf8(b64: string): string {
  const binary = atob(b64)
  return new TextDecoder('utf-8').decode(Uint8Array.from(binary, c => c.charCodeAt(0)))
}
export function base64UrlToUtf8(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
  return base64ToUtf8(b64 + pad)
}
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary)
}
export function utf8ToBase64Url(str: string): string {
  return utf8ToBase64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ── Drive ───────────────────────────────────────────────────────────────────

export interface DriveFile { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string }

export async function driveListFiles(token: string, query?: string, signal?: AbortSignal): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    pageSize: '25',
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
    q: query && query.trim() ? query.trim() : 'trashed = false',
  })
  const data = await googleRequest<{ files?: DriveFile[] }>(token, `${DRIVE_API}/files?${params.toString()}`, { signal })
  return data.files ?? []
}

const GOOGLE_DOC_EXPORTS: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
}

export async function driveReadFile(token: string, fileId: string, signal?: AbortSignal): Promise<{ name: string; content: string; truncated: boolean }> {
  const meta = await googleRequest<{ name: string; mimeType: string }>(token, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=name,mimeType`, { signal })
  let text: string
  if (meta.mimeType.startsWith('application/vnd.google-apps.')) {
    const exportMime = GOOGLE_DOC_EXPORTS[meta.mimeType]
    if (!exportMime) throw new Error(`Tipo Google "${meta.mimeType}" não suportado para leitura textual.`)
    const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`, { headers: { Authorization: `Bearer ${token}` }, signal })
    if (!res.ok) throw new Error(`Google API ${res.status} ao exportar o arquivo.`)
    text = await res.text()
  } else if (/^(text\/|application\/(json|xml|javascript|x-)|.*\+xml)/.test(meta.mimeType)) {
    const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, signal })
    if (!res.ok) throw new Error(`Google API ${res.status} ao baixar o arquivo.`)
    text = await res.text()
  } else {
    throw new Error(`Arquivo binário (${meta.mimeType}) não suportado para leitura textual.`)
  }
  const truncated = text.length > 8000
  return { name: meta.name, content: truncated ? `${text.slice(0, 8000)}…` : text, truncated }
}

// ── Gmail ──────────────────────────────────────────────────────────────────

export interface GmailMessageHeader { id: string; subject: string; from: string; date: string; snippet: string }

interface GmailPayloadPart {
  mimeType?: string
  body?: { data?: string; size?: number }
  parts?: GmailPayloadPart[]
  headers?: Array<{ name: string; value: string }>
}

export async function gmailSearch(token: string, query: string, signal?: AbortSignal): Promise<Array<{ id: string }>> {
  const params = new URLSearchParams({ maxResults: '15', q: query || '' })
  const data = await googleRequest<{ messages?: Array<{ id: string }> }>(token, `${GMAIL_API}/users/me/messages?${params.toString()}`, { signal })
  return data.messages ?? []
}

/** Walk the MIME tree for the first text/plain (fallback text/html) body. */
export function extractGmailBody(payload: GmailPayloadPart | undefined): string {
  if (!payload) return ''
  if (payload.body?.data && (payload.mimeType === 'text/plain' || !payload.parts)) {
    return base64UrlToUtf8(payload.body.data)
  }
  for (const part of payload.parts ?? []) {
    if (part.mimeType === 'text/plain' && part.body?.data) return base64UrlToUtf8(part.body.data)
  }
  for (const part of payload.parts ?? []) {
    const nested = extractGmailBody(part)
    if (nested) return nested
  }
  return ''
}

export async function gmailGetMessage(token: string, id: string, signal?: AbortSignal): Promise<GmailMessageHeader & { body: string }> {
  const msg = await googleRequest<{ snippet?: string; payload?: GmailPayloadPart }>(token, `${GMAIL_API}/users/me/messages/${encodeURIComponent(id)}?format=full`, { signal })
  const headers = msg.payload?.headers ?? []
  const header = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  const body = extractGmailBody(msg.payload)
  return { id, subject: header('Subject'), from: header('From'), date: header('Date'), snippet: msg.snippet ?? '', body: body.slice(0, 8000) }
}

/** Build an RFC822 message and base64url-encode it for the Gmail drafts API. */
export function buildGmailRaw(params: { to: string; subject: string; body: string }): string {
  const encodedSubject = /[^\x20-\x7E]/.test(params.subject) ? `=?UTF-8?B?${utf8ToBase64(params.subject)}?=` : params.subject
  const lines = [
    `To: ${params.to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    params.body,
  ]
  return utf8ToBase64Url(lines.join('\r\n'))
}

export async function gmailCreateDraft(token: string, params: { to: string; subject: string; body: string }, signal?: AbortSignal): Promise<{ id: string }> {
  const raw = buildGmailRaw(params)
  return googleRequest<{ id: string }>(token, `${GMAIL_API}/users/me/drafts`, { method: 'POST', body: JSON.stringify({ message: { raw } }), signal })
}

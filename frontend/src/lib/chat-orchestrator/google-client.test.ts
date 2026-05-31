import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  base64UrlToUtf8,
  buildGmailRaw,
  driveListFiles,
  extractGmailBody,
  gmailCreateDraft,
  utf8ToBase64Url,
} from './google-client'

afterEach(() => { vi.restoreAllMocks() })

describe('google-client base64 helpers', () => {
  it('round-trips UTF-8 through base64url', () => {
    const original = 'Olá, mundo — café ☕'
    expect(base64UrlToUtf8(utf8ToBase64Url(original))).toBe(original)
  })

  it('base64url has no +, / or = padding', () => {
    const encoded = utf8ToBase64Url('a?b?c>>>')
    expect(encoded).not.toMatch(/[+/=]/)
  })
})

describe('extractGmailBody', () => {
  it('finds the first text/plain part and decodes it', () => {
    const data = utf8ToBase64Url('corpo do email')
    const body = extractGmailBody({ mimeType: 'multipart/alternative', parts: [
      { mimeType: 'text/html', body: { data: utf8ToBase64Url('<b>x</b>') } },
      { mimeType: 'text/plain', body: { data } },
    ] })
    expect(body).toBe('corpo do email')
  })

  it('handles a flat text/plain payload', () => {
    expect(extractGmailBody({ mimeType: 'text/plain', body: { data: utf8ToBase64Url('plano') } })).toBe('plano')
  })
})

describe('buildGmailRaw', () => {
  it('produces a base64url RFC822 with To/Subject and encodes non-ASCII subjects', () => {
    const raw = buildGmailRaw({ to: 'a@b.com', subject: 'Olá', body: 'oi' })
    const decoded = base64UrlToUtf8(raw)
    expect(decoded).toContain('To: a@b.com')
    expect(decoded).toContain('=?UTF-8?B?') // non-ASCII subject is encoded-word
    expect(decoded).toContain('oi')
  })
})

describe('google-client REST', () => {
  it('driveListFiles sends Bearer auth and a default query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => ({ files: [{ id: '1', name: 'a', mimeType: 'text/plain' }] }) })
    vi.stubGlobal('fetch', fetchMock)
    const files = await driveListFiles('tok')
    expect(files[0].name).toBe('a')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('https://www.googleapis.com/drive/v3/files')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('gmailCreateDraft posts a base64url raw message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => ({ id: 'draft1' }) })
    vi.stubGlobal('fetch', fetchMock)
    const draft = await gmailCreateDraft('tok', { to: 'a@b.com', subject: 'Hi', body: 'msg' })
    expect(draft.id).toBe('draft1')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(String(init.body))
    expect(payload.message.raw).toBeTruthy()
    expect(base64UrlToUtf8(payload.message.raw)).toContain('To: a@b.com')
  })

  it('throws a helpful error on non-ok responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden', json: async () => ({ error: { message: 'Insufficient Permission' } }) }))
    await expect(driveListFiles('tok')).rejects.toThrow(/403/)
  })
})

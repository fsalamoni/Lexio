import { afterEach, describe, expect, it, vi } from 'vitest'
import { githubCreateIssue, githubGetFile, githubListRepos } from './github-client'

function okFetch(payload: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => payload })
}

afterEach(() => { vi.restoreAllMocks() })

describe('github-client', () => {
  it('lists repos with Bearer auth and the right path', async () => {
    const fetchMock = okFetch([{ full_name: 'me/repo', private: false }])
    vi.stubGlobal('fetch', fetchMock)
    const repos = await githubListRepos('tok')
    expect(repos[0].full_name).toBe('me/repo')
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('https://api.github.com/user/repos')
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('decodes base64 file content as UTF-8', async () => {
    const b64 = Buffer.from('olá mundo', 'utf8').toString('base64')
    vi.stubGlobal('fetch', okFetch({ type: 'file', encoding: 'base64', content: b64 }))
    const file = await githubGetFile('tok', 'o', 'r', 'a.txt')
    expect(file.content).toBe('olá mundo')
  })

  it('POSTs an issue body', async () => {
    const fetchMock = okFetch({ number: 7, html_url: 'https://github.com/o/r/issues/7' })
    vi.stubGlobal('fetch', fetchMock)
    const issue = await githubCreateIssue('tok', 'o', 'r', 'Bug', 'detalhes')
    expect(issue.number).toBe(7)
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(opts.method).toBe('POST')
    expect(JSON.parse(String(opts.body))).toEqual({ title: 'Bug', body: 'detalhes' })
  })

  it('throws a helpful error on non-ok responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found', json: async () => ({ message: 'Not Found' }),
    }))
    await expect(githubGetFile('tok', 'o', 'r', 'missing')).rejects.toThrow(/404/)
  })
})

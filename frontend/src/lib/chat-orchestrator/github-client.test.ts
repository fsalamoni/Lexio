import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  encodeBase64Utf8,
  githubCommitTree,
  githubCreateBranch,
  githubCreateIssue,
  githubDeleteFile,
  githubGetFile,
  githubGetFileSha,
  githubListRepos,
  githubPutFile,
} from './github-client'

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

describe('github-client write helpers', () => {
  it('round-trips base64 UTF-8', () => {
    expect(encodeBase64Utf8('olá mundo')).toBe(Buffer.from('olá mundo', 'utf8').toString('base64'))
  })

  it('githubGetFileSha returns undefined on 404 (new file)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found', json: async () => ({ message: 'Not Found' }),
    }))
    await expect(githubGetFileSha('tok', 'o', 'r', 'new.txt', 'feature')).resolves.toBeUndefined()
  })

  it('githubPutFile PUTs base64 content with branch and sha', async () => {
    const fetchMock = okFetch({ commit: { sha: 'abc' }, content: { path: 'a.txt', sha: 'blob' } })
    vi.stubGlobal('fetch', fetchMock)
    await githubPutFile('tok', 'o', 'r', { path: 'a.txt', content: 'hi', message: 'm', branch: 'feature', sha: 'old' })
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/repos/o/r/contents/a.txt')
    expect(opts.method).toBe('PUT')
    const body = JSON.parse(String(opts.body))
    expect(body).toMatchObject({ message: 'm', branch: 'feature', sha: 'old', content: encodeBase64Utf8('hi') })
  })

  it('githubDeleteFile DELETEs with the current sha', async () => {
    const fetchMock = okFetch({ commit: { sha: 'del' } })
    vi.stubGlobal('fetch', fetchMock)
    await githubDeleteFile('tok', 'o', 'r', { path: 'a.txt', message: 'm', sha: 'old', branch: 'feature' })
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(opts.method).toBe('DELETE')
    expect(JSON.parse(String(opts.body))).toMatchObject({ message: 'm', sha: 'old', branch: 'feature' })
  })

  it('githubCreateBranch resolves base sha then POSTs a new ref', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({ object: { sha: 'base123' } }) })
      .mockResolvedValueOnce({ ok: true, status: 201, statusText: 'Created', json: async () => ({ ref: 'refs/heads/feature', object: { sha: 'base123' } }) })
    vi.stubGlobal('fetch', fetchMock)
    const res = await githubCreateBranch('tok', 'o', 'r', { newBranch: 'feature', fromBranch: 'main' })
    expect(res.sha).toBe('base123')
    const [refUrl] = fetchMock.mock.calls[0] as [string]
    expect(refUrl).toContain('/git/ref/heads/main')
    const [, createOpts] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(String(createOpts.body))).toMatchObject({ ref: 'refs/heads/feature', sha: 'base123' })
  })

  it('githubCommitTree builds blobs/tree/commit and updates the ref', async () => {
    const fetchMock = vi.fn()
      // getRefSha
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({ object: { sha: 'parent1' } }) })
      // getCommit
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({ tree: { sha: 'tree1' } }) })
      // create tree
      .mockResolvedValueOnce({ ok: true, status: 201, statusText: 'Created', json: async () => ({ sha: 'tree2' }) })
      // create commit
      .mockResolvedValueOnce({ ok: true, status: 201, statusText: 'Created', json: async () => ({ sha: 'commit9', html_url: 'https://x/commit9' }) })
      // update ref
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    const res = await githubCommitTree('tok', 'o', 'r', {
      branch: 'feature', message: 'change', files: [{ path: 'a.txt', content: 'x' }, { path: 'old.txt', delete: true }],
    })
    expect(res.sha).toBe('commit9')
    const treeBody = JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body))
    expect(treeBody.base_tree).toBe('tree1')
    expect(treeBody.tree).toEqual([
      { path: 'a.txt', mode: '100644', type: 'blob', content: 'x' },
      { path: 'old.txt', mode: '100644', type: 'blob', sha: null },
    ])
    const [updateUrl, updateOpts] = fetchMock.mock.calls[4] as [string, RequestInit]
    expect(updateUrl).toContain('/git/refs/heads/feature')
    expect(updateOpts.method).toBe('PATCH')
  })
})

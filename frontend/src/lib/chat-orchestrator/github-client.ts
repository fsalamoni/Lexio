/**
 * Minimal GitHub REST client used by the chat connector skills. Browser fetch
 * with a fine-grained PAT (Bearer). No SDK dependency. `api.github.com` is
 * already allowed by the app CSP (`connect-src https:`).
 */

const GITHUB_API = 'https://api.github.com'

export interface GithubRepoSummary {
  full_name: string
  private: boolean
  description?: string | null
  default_branch?: string
}

interface GithubRequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  signal?: AbortSignal
}

async function githubRequest<T>(token: string, path: string, opts: GithubRequestOptions = {}): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })
  if (!res.ok) {
    let detail = ''
    try {
      const json = await res.json()
      detail = (json && typeof json.message === 'string') ? json.message : ''
    } catch {
      // non-JSON error body
    }
    throw new Error(`GitHub API ${res.status}: ${detail || res.statusText}`)
  }
  return res.json() as Promise<T>
}

/** Encode each path segment but keep the slashes (GitHub contents API needs them). */
function encodePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

function decodeBase64Utf8(b64: string): string {
  const clean = b64.replace(/\s/g, '')
  const binary = atob(clean)
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

export async function githubGetAuthenticatedUser(token: string, signal?: AbortSignal): Promise<{ login: string }> {
  return githubRequest<{ login: string }>(token, '/user', { signal })
}

export async function githubListRepos(token: string, signal?: AbortSignal): Promise<GithubRepoSummary[]> {
  return githubRequest<GithubRepoSummary[]>(token, '/user/repos?per_page=50&sort=updated', { signal })
}

export async function githubGetFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
  signal?: AbortSignal,
): Promise<{ path: string; content: string; truncated: boolean }> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  const data = await githubRequest<{ content?: string; encoding?: string; type?: string; size?: number }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}${query}`,
    { signal },
  )
  if (data.type !== 'file' || typeof data.content !== 'string') {
    throw new Error(`"${path}" não é um arquivo de texto recuperável.`)
  }
  const decoded = data.encoding === 'base64' ? decodeBase64Utf8(data.content) : data.content
  const truncated = decoded.length > 8000
  return { path, content: truncated ? `${decoded.slice(0, 8000)}…` : decoded, truncated }
}

export async function githubCreateIssue(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  signal?: AbortSignal,
): Promise<{ number: number; html_url: string }> {
  return githubRequest<{ number: number; html_url: string }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
    { method: 'POST', body: { title, body }, signal },
  )
}

export async function githubCreatePullRequest(
  token: string,
  owner: string,
  repo: string,
  params: { title: string; head: string; base: string; body?: string },
  signal?: AbortSignal,
): Promise<{ number: number; html_url: string }> {
  return githubRequest<{ number: number; html_url: string }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    { method: 'POST', body: params, signal },
  )
}

export async function githubAddIssueComment(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  signal?: AbortSignal,
): Promise<{ id: number; html_url: string }> {
  return githubRequest<{ id: number; html_url: string }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
    { method: 'POST', body: { body }, signal },
  )
}

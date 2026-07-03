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
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
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

/** Encode a UTF-8 string to base64 (mirror of {@link decodeBase64Utf8}). */
export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
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

// ── Write helpers ─────────────────────────────────────────────────────────────

const CONTENTS_NOT_FOUND = Symbol('contents-not-found')

/**
 * Fetch a file's blob SHA (needed to update/delete existing contents). Returns
 * `undefined` when the path does not exist yet (a create, not an update).
 */
export async function githubGetFileSha(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  try {
    const data = await githubRequest<{ sha?: string; type?: string } | typeof CONTENTS_NOT_FOUND>(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}${query}`,
      { signal },
    )
    if (data && typeof (data as { sha?: string }).sha === 'string') return (data as { sha: string }).sha
    return undefined
  } catch (err) {
    if (err instanceof Error && /GitHub API 404/.test(err.message)) return undefined
    throw err
  }
}

/**
 * Create or update a single file via the contents API. When `sha` is omitted
 * the caller intends a create; GitHub rejects an update without the current
 * blob SHA, so callers should resolve it with {@link githubGetFileSha} first.
 */
export async function githubPutFile(
  token: string,
  owner: string,
  repo: string,
  params: { path: string; content: string; message: string; branch?: string; sha?: string },
  signal?: AbortSignal,
): Promise<{ commit: { sha: string; html_url?: string }; content: { path: string; sha: string } }> {
  const body: Record<string, unknown> = {
    message: params.message,
    content: encodeBase64Utf8(params.content),
  }
  if (params.branch) body.branch = params.branch
  if (params.sha) body.sha = params.sha
  return githubRequest(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(params.path)}`,
    { method: 'PUT', body, signal },
  )
}

/** Delete a single file via the contents API. Requires the current blob SHA. */
export async function githubDeleteFile(
  token: string,
  owner: string,
  repo: string,
  params: { path: string; message: string; sha: string; branch?: string },
  signal?: AbortSignal,
): Promise<{ commit: { sha: string; html_url?: string } }> {
  const body: Record<string, unknown> = { message: params.message, sha: params.sha }
  if (params.branch) body.branch = params.branch
  return githubRequest(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(params.path)}`,
    { method: 'DELETE', body, signal },
  )
}

/** Resolve the commit SHA a branch/ref points to. */
export async function githubGetRefSha(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  signal?: AbortSignal,
): Promise<string> {
  const data = await githubRequest<{ object?: { sha?: string } }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodePath(branch)}`,
    { signal },
  )
  const sha = data.object?.sha
  if (!sha) throw new Error(`Branch "${branch}" não encontrado.`)
  return sha
}

/** Create a new branch (git ref) pointing at `fromBranch`'s current head. */
export async function githubCreateBranch(
  token: string,
  owner: string,
  repo: string,
  params: { newBranch: string; fromBranch: string },
  signal?: AbortSignal,
): Promise<{ ref: string; sha: string }> {
  const baseSha = await githubGetRefSha(token, owner, repo, params.fromBranch, signal)
  const data = await githubRequest<{ ref: string; object: { sha: string } }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
    { method: 'POST', body: { ref: `refs/heads/${params.newBranch}`, sha: baseSha }, signal },
  )
  return { ref: data.ref, sha: data.object.sha }
}

export interface GithubCommitFile {
  path: string
  /** File content; when omitted with `delete: true`, the path is removed. */
  content?: string
  delete?: boolean
}

/**
 * Commit multiple file changes to a branch in a single commit using the Git
 * Data API (blobs → tree → commit → update ref). Deletions set the tree entry
 * SHA to null.
 */
export async function githubCommitTree(
  token: string,
  owner: string,
  repo: string,
  params: { branch: string; message: string; files: GithubCommitFile[] },
  signal?: AbortSignal,
): Promise<{ sha: string; html_url?: string }> {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  const parentSha = await githubGetRefSha(token, owner, repo, params.branch, signal)
  const parentCommit = await githubRequest<{ tree: { sha: string } }>(
    token,
    `${base}/git/commits/${parentSha}`,
    { signal },
  )
  const treeItems = [] as Array<{ path: string; mode: '100644'; type: 'blob'; sha: string | null; content?: string }>
  for (const file of params.files) {
    if (file.delete) {
      treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: null })
    } else {
      treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: null, content: file.content ?? '' })
    }
  }
  const tree = await githubRequest<{ sha: string }>(
    token,
    `${base}/git/trees`,
    { method: 'POST', body: { base_tree: parentCommit.tree.sha, tree: treeItems.map(({ sha, content, ...rest }) => (content !== undefined ? { ...rest, content } : { ...rest, sha })) }, signal },
  )
  const commit = await githubRequest<{ sha: string; html_url?: string }>(
    token,
    `${base}/git/commits`,
    { method: 'POST', body: { message: params.message, tree: tree.sha, parents: [parentSha] }, signal },
  )
  await githubRequest(
    token,
    `${base}/git/refs/heads/${encodePath(params.branch)}`,
    { method: 'PATCH', body: { sha: commit.sha, force: false }, signal },
  )
  return { sha: commit.sha, html_url: commit.html_url }
}

/** Combined commit status (CI checks) for a ref. */
export async function githubGetCombinedStatus(
  token: string,
  owner: string,
  repo: string,
  ref: string,
  signal?: AbortSignal,
): Promise<{ state: string; total_count: number; statuses: Array<{ context: string; state: string; target_url?: string }> }> {
  return githubRequest(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodePath(ref)}/status`,
    { signal },
  )
}

/** List files changed by a pull request. */
export async function githubListPullRequestFiles(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number,
  signal?: AbortSignal,
): Promise<Array<{ filename: string; status: string; additions: number; deletions: number; changes: number }>> {
  return githubRequest(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/files?per_page=100`,
    { signal },
  )
}

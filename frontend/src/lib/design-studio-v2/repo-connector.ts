/**
 * Design Studio v2 — repository connectors.
 *
 * Two ways to bind a session to a repository:
 *   - `local`  : an in-browser workspace. The virtual project IS the source of
 *                truth; "apply" is an export (the page offers a ZIP download).
 *                No credentials needed; nothing leaves the browser.
 *   - `github` : a real GitHub repo reached with the user's fine-grained PAT
 *                (the same connector the Chat uses). The connector imports the
 *                file tree and key file contents, and applies the current
 *                project as a commit on a new branch, optionally opening a PR.
 *
 * All GitHub access goes through the shared `github-client` (browser fetch to
 * api.github.com, allowed by the app CSP). No backend is involved.
 */

import {
  githubCommitTree,
  githubCreateBranch,
  githubCreatePullRequest,
  githubGetFile,
  githubGetRepo,
  githubGetTree,
  type GithubCommitFile,
} from '../chat-orchestrator/github-client'
import { loadGithubConnectorConfig } from '../chat-orchestrator/github-config'
import type { DesignStudioRepoRef } from '../firestore-types'
import { createEmptyProject, normalizeProjectPath, projectToFiles } from './project'
import type { DesignStudioProject } from './types'

/** How many file contents to eagerly import from a connected GitHub repo. */
const MAX_IMPORT_FILES = 40
const MAX_IMPORT_FILE_BYTES = 24_000

/** Files worth importing eagerly, most useful first. */
const PRIORITY_IMPORT_PATTERNS: RegExp[] = [
  /^readme(\.md)?$/i,
  /^package\.json$/i,
  /^index\.html$/i,
  /^(public|src)\/index\.html$/i,
  /^(src|app)\//i,
  /\.(html|css|scss|tsx?|jsx?|vue|svelte|py|go|rb|json|md|ya?ml|toml)$/i,
]

/** Skip these dirs/paths — noise or too large to be useful in a prompt. */
const IMPORT_IGNORE = /(^|\/)(node_modules|dist|build|\.git|\.next|\.turbo|vendor|coverage|\.venv|__pycache__)(\/|$)|\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|lock|woff2?|ttf|mp4|mp3)$/i

export interface RepoApplyResult {
  provider: 'local' | 'github'
  branch?: string
  commitUrl?: string
  prUrl?: string
  committedPaths: string[]
  skippedPaths: string[]
  note?: string
}

export interface RepoImportResult {
  project: DesignStudioProject
  /** Every path in the repo tree (for the file tree UI), not just imported ones. */
  allPaths: string[]
  truncated: boolean
  note?: string
}

export interface RepoConnector {
  ref: DesignStudioRepoRef
  importProject(signal?: AbortSignal): Promise<RepoImportResult>
  readFile(path: string, signal?: AbortSignal): Promise<string | null>
  apply(project: DesignStudioProject, options: RepoApplyOptions, signal?: AbortSignal): Promise<RepoApplyResult>
}

export interface RepoApplyOptions {
  commitMessage: string
  /** Branch to create/commit to. Defaults to a timestamped studio branch. */
  branch?: string
  /** Open a PR from the working branch back into the default branch. */
  openPullRequest?: boolean
  prTitle?: string
  prBody?: string
}

// ── Local workspace connector ───────────────────────────────────────────────

export function createLocalConnector(label = 'Workspace local'): RepoConnector {
  const ref: DesignStudioRepoRef = { provider: 'local', label }
  return {
    ref,
    async importProject() {
      return { project: createEmptyProject(), allPaths: [], truncated: false }
    },
    async readFile() {
      return null
    },
    async apply(project) {
      return {
        provider: 'local',
        committedPaths: projectToFiles(project).map((file) => file.path),
        skippedPaths: [],
        note: 'Workspace local: os arquivos vivem no estúdio. Use "Baixar projeto" para exportar um ZIP, ou conecte um repositório GitHub para aplicar como commit/PR.',
      }
    },
  }
}

// ── GitHub connector ──────────────────────────────────────────────────────────

function shouldImportContent(path: string): boolean {
  if (IMPORT_IGNORE.test(path)) return false
  return PRIORITY_IMPORT_PATTERNS.some((re) => re.test(path))
}

function importPriority(path: string): number {
  for (let i = 0; i < PRIORITY_IMPORT_PATTERNS.length; i++) {
    if (PRIORITY_IMPORT_PATTERNS[i].test(path)) return i
  }
  return PRIORITY_IMPORT_PATTERNS.length
}

export interface GithubConnectorParams {
  owner: string
  repo: string
  branch?: string
  token: string
  defaultBranch?: string
}

export function createGithubConnector(params: GithubConnectorParams): RepoConnector {
  const { owner, repo, token } = params
  const ref: DesignStudioRepoRef = {
    provider: 'github',
    label: `${owner}/${repo}`,
    owner,
    repo,
    branch: params.branch,
    default_branch: params.defaultBranch,
  }

  async function resolveBaseBranch(signal?: AbortSignal): Promise<string> {
    if (ref.branch) return ref.branch
    if (ref.default_branch) return ref.default_branch
    const meta = await githubGetRepo(token, owner, repo, signal)
    ref.default_branch = meta.default_branch || 'main'
    if (!ref.branch) ref.branch = ref.default_branch
    return ref.default_branch
  }

  return {
    ref,
    async importProject(signal) {
      const baseBranch = await resolveBaseBranch(signal)
      const { entries, truncated } = await githubGetTree(token, owner, repo, baseBranch, signal)
      const blobPaths = entries
        .filter((entry) => entry.type === 'blob')
        .map((entry) => entry.path)

      const importable = blobPaths
        .filter((path) => shouldImportContent(path))
        .filter((path) => {
          const entry = entries.find((e) => e.path === path)
          return !entry?.size || entry.size <= MAX_IMPORT_FILE_BYTES
        })
        .sort((a, b) => importPriority(a) - importPriority(b) || a.length - b.length)
        .slice(0, MAX_IMPORT_FILES)

      const project = createEmptyProject()
      const results = await Promise.allSettled(
        importable.map((path) => githubGetFile(token, owner, repo, path, baseBranch, signal)),
      )
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const path = normalizeProjectPath(result.value.path)
          if (path) project.files[path] = { path, content: result.value.content }
        }
      }
      // Preview entry defaults to an imported index.html if present.
      const { guessPreviewEntry } = await import('./project')
      project.previewEntry = guessPreviewEntry(project)

      const note = truncated
        ? 'O repositório é grande e a árvore foi truncada pelo GitHub. O estúdio importou uma amostra dos arquivos mais relevantes; peça para ler arquivos específicos conforme precisar.'
        : blobPaths.length > importable.length
          ? `Importei o conteúdo de ${project.files ? Object.keys(project.files).length : 0} de ${blobPaths.length} arquivos (os mais relevantes). A árvore completa está disponível; peça para ler outros arquivos quando precisar.`
          : undefined

      return { project, allPaths: blobPaths.sort(), truncated, note }
    },

    async readFile(path, signal) {
      const baseBranch = await resolveBaseBranch(signal)
      try {
        const file = await githubGetFile(token, owner, repo, normalizeProjectPath(path), baseBranch, signal)
        return file.content
      } catch {
        return null
      }
    },

    async apply(project, options, signal) {
      const baseBranch = await resolveBaseBranch(signal)
      const workingBranch = options.branch
        || `lexio/design-studio-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`

      const files = projectToFiles(project)
      const committable: GithubCommitFile[] = []
      const skippedPaths: string[] = []
      for (const file of files) {
        if (file.binary) {
          skippedPaths.push(file.path)
          continue
        }
        committable.push({ path: file.path, content: file.content })
      }

      if (committable.length === 0) {
        return {
          provider: 'github',
          committedPaths: [],
          skippedPaths,
          note: 'Nenhum arquivo de texto para commitar. Assets binários gerados não são versionados automaticamente nesta versão.',
        }
      }

      await githubCreateBranch(token, owner, repo, { newBranch: workingBranch, fromBranch: baseBranch }, signal)
      const commit = await githubCommitTree(
        token,
        owner,
        repo,
        { branch: workingBranch, message: options.commitMessage, files: committable },
        signal,
      )

      let prUrl: string | undefined
      if (options.openPullRequest) {
        const pr = await githubCreatePullRequest(
          token,
          owner,
          repo,
          {
            title: options.prTitle || options.commitMessage,
            head: workingBranch,
            base: baseBranch,
            body: options.prBody || 'Alterações geradas pelo Design Studio v2 do Lexio.',
          },
          signal,
        )
        prUrl = pr.html_url
      }

      return {
        provider: 'github',
        branch: workingBranch,
        commitUrl: commit.html_url,
        prUrl,
        committedPaths: committable.map((file) => file.path),
        skippedPaths,
        note: skippedPaths.length
          ? `${skippedPaths.length} asset(s) binário(s) não foram versionados nesta versão.`
          : undefined,
      }
    },
  }
}

/**
 * Build a GitHub connector from the user's stored PAT config. Returns null when
 * the connector is not configured (no token), so callers can guide the user to
 * set it up in Settings.
 */
export async function createGithubConnectorFromConfig(
  params: { owner: string; repo: string; branch?: string; defaultBranch?: string },
  uid?: string,
): Promise<RepoConnector | null> {
  const config = await loadGithubConnectorConfig(uid)
  if (!config.token) return null
  return createGithubConnector({ ...params, token: config.token })
}

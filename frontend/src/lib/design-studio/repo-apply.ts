/**
 * Design Studio — apply a generated design to a connected GitHub repository.
 *
 * This is the final phase of the studio: the same {@link DesignSpec} that powers
 * "create by text", manual editing and export can be committed straight into a
 * repository the user connected through the chat GitHub connector (a fine-grained
 * PAT stored in their settings). To keep the contract auditable and safe:
 *
 *  - writes ALWAYS land on a fresh feature branch, never directly on a protected
 *    branch (`main`/`master`) — a pull request carries the change onward;
 *  - the selected export formats (HTML / template JSON / Markdown) become the
 *    committed files, mirroring the local export surface exactly;
 *  - planning is pure and offline ({@link describeDesignApplyPlan}) so the UI can
 *    preview the branch, files and commit before any network call — which is what
 *    the `plan` / `ask` execution modes rely on.
 */

import {
  githubCommitTree,
  githubCreateBranch,
  githubCreatePullRequest,
  type GithubCommitFile,
} from '../chat-orchestrator/github-client'
import {
  DESIGN_TEMPLATE_EXTENSION,
  renderSpec,
  renderSpecMarkdown,
  serializeTemplate,
  type DesignSpec,
} from './design-spec'
import { designExportFileName } from './templates'

/** Export formats that can be committed to a repository. */
export type DesignApplyFormat = 'html' | 'json' | 'markdown'

export const DESIGN_APPLY_FORMATS: DesignApplyFormat[] = ['html', 'json', 'markdown']

/** Branches we never write to directly — the change flows through a pull request. */
const PROTECTED_BRANCHES = new Set(['main', 'master'])

/** Fail-safe cap on how many files a single apply may touch. */
const MAX_APPLY_FILES = 12

export function isProtectedDesignBranch(branch: string): boolean {
  return PROTECTED_BRANCHES.has(branch.trim().toLowerCase())
}

/** Lowercase ASCII slug used for branch names and file paths. */
export function slugifyDesign(value: string, fallback = 'design'): string {
  const slug = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48)
  return slug || fallback
}

/**
 * Normalise a target directory: strip leading/trailing slashes, collapse repeats
 * and drop any `.`/`..` segments so a design can never escape the repo root.
 */
export function sanitizeRepoDir(dir: string): string {
  return String(dir ?? '')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    .join('/')
}

/** Deterministic UTC timestamp suffix (`YYYYMMDD-HHMMSS`) for branch names. */
function branchTimestamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  )
}

/** Build a unique, non-protected feature branch name for a design. */
export function buildDesignBranchName(title: string, now: Date = new Date()): string {
  return `design/${slugifyDesign(title)}-${branchTimestamp(now)}`
}

/** Repository-relative file name for a design in a given export format. */
export function designRepoFileName(spec: DesignSpec, format: DesignApplyFormat): string {
  if (format === 'json') return designExportFileName(spec.title, spec.kind, DESIGN_TEMPLATE_EXTENSION)
  if (format === 'markdown') return designExportFileName(spec.title, spec.kind, 'md')
  return designExportFileName(spec.title, spec.kind, 'html')
}

/** Join a sanitised directory with a file name. */
function joinRepoPath(dir: string, fileName: string): string {
  const clean = sanitizeRepoDir(dir)
  return clean ? `${clean}/${fileName}` : fileName
}

/** Rendered contents for a design in a given export format. */
function renderDesignFormat(spec: DesignSpec, format: DesignApplyFormat, templateName: string): string {
  if (format === 'json') return serializeTemplate(templateName || spec.title, spec)
  if (format === 'markdown') return renderSpecMarkdown(spec)
  return renderSpec(spec)
}

export interface BuildDesignFilesOptions {
  dir?: string
  formats: DesignApplyFormat[]
  templateName?: string
}

/**
 * Build the ordered, de-duplicated list of files to commit for a design. The
 * format order is stable (html → json → markdown) regardless of input order.
 */
export function buildDesignCommitFiles(
  spec: DesignSpec,
  options: BuildDesignFilesOptions,
): GithubCommitFile[] {
  const selected = DESIGN_APPLY_FORMATS.filter((format) => options.formats.includes(format))
  const seen = new Set<string>()
  const files: GithubCommitFile[] = []
  for (const format of selected) {
    const path = joinRepoPath(options.dir ?? '', designRepoFileName(spec, format))
    if (seen.has(path)) continue
    seen.add(path)
    files.push({ path, content: renderDesignFormat(spec, format, options.templateName ?? '') })
  }
  return files
}

/** Default commit message for a design apply. */
export function defaultDesignCommitMessage(spec: DesignSpec): string {
  const title = spec.title.trim() || 'design'
  return `Design Studio: ${title} (${spec.kind})`
}

export interface DesignApplyPlan {
  owner: string
  repo: string
  baseBranch: string
  branch: string
  commitMessage: string
  openPr: boolean
  prTitle: string
  /** Repository-relative paths that will be created/updated. */
  files: string[]
}

export interface DescribeDesignApplyOptions {
  owner: string
  repo: string
  baseBranch: string
  dir?: string
  formats: DesignApplyFormat[]
  templateName?: string
  commitMessage?: string
  openPr?: boolean
  branchName?: string
  now?: Date
}

/**
 * Compute an offline preview of an apply (branch, files, commit, PR) without any
 * network call. Powers the `plan` and `ask` execution modes.
 */
export function describeDesignApplyPlan(
  spec: DesignSpec,
  options: DescribeDesignApplyOptions,
): DesignApplyPlan {
  const branch = (options.branchName && options.branchName.trim()) || buildDesignBranchName(spec.title, options.now)
  const files = buildDesignCommitFiles(spec, {
    dir: options.dir,
    formats: options.formats,
    templateName: options.templateName,
  })
  const commitMessage = options.commitMessage?.trim() || defaultDesignCommitMessage(spec)
  return {
    owner: options.owner.trim(),
    repo: options.repo.trim(),
    baseBranch: options.baseBranch.trim(),
    branch,
    commitMessage,
    openPr: options.openPr ?? true,
    prTitle: commitMessage,
    files: files.map((file) => file.path),
  }
}

export interface ApplyDesignToRepoParams extends DescribeDesignApplyOptions {
  token: string
  prBody?: string
  signal?: AbortSignal
}

export interface DesignApplyResult {
  branch: string
  baseBranch: string
  commitSha: string
  commitUrl?: string
  files: string[]
  prNumber?: number
  prUrl?: string
}

/**
 * Apply a design to a repository: create a feature branch, commit the selected
 * files in one commit and (optionally) open a pull request into the base branch.
 * Throws a descriptive error on any invalid input or GitHub failure.
 */
export async function applyDesignToRepo(
  spec: DesignSpec,
  params: ApplyDesignToRepoParams,
): Promise<DesignApplyResult> {
  const token = params.token?.trim()
  if (!token) throw new Error('Conector GitHub não configurado. Adicione um token (PAT) nas configurações.')

  const owner = params.owner.trim()
  const repo = params.repo.trim()
  if (!owner || !repo) throw new Error('Informe o proprietário (owner) e o repositório de destino.')

  const baseBranch = params.baseBranch.trim()
  if (!baseBranch) throw new Error('Informe a branch base (ex.: main).')

  const files = buildDesignCommitFiles(spec, {
    dir: params.dir,
    formats: params.formats,
    templateName: params.templateName,
  })
  if (files.length === 0) throw new Error('Selecione ao menos um formato para aplicar (HTML, JSON ou Markdown).')
  if (files.length > MAX_APPLY_FILES) throw new Error(`Muitos arquivos para um único envio (máx. ${MAX_APPLY_FILES}).`)

  const branch = (params.branchName && params.branchName.trim()) || buildDesignBranchName(spec.title, params.now)
  if (isProtectedDesignBranch(branch)) {
    throw new Error('O design é enviado sempre em uma nova branch, nunca diretamente em main/master.')
  }

  const commitMessage = params.commitMessage?.trim() || defaultDesignCommitMessage(spec)

  await githubCreateBranch(token, owner, repo, { newBranch: branch, fromBranch: baseBranch }, params.signal)
  const commit = await githubCommitTree(token, owner, repo, { branch, message: commitMessage, files }, params.signal)

  const result: DesignApplyResult = {
    branch,
    baseBranch,
    commitSha: commit.sha,
    commitUrl: commit.html_url,
    files: files.map((file) => file.path),
  }

  const openPr = params.openPr ?? true
  if (openPr) {
    const pr = await githubCreatePullRequest(
      token,
      owner,
      repo,
      { title: commitMessage, head: branch, base: baseBranch, body: params.prBody ?? commitMessage },
      params.signal,
    )
    result.prNumber = pr.number
    result.prUrl = pr.html_url
  }

  return result
}

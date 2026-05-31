/**
 * Git helper for the Lexio desktop sidecar.
 *
 * All commands run through `execFile('git', [...args])` — never a shell string —
 * so user/agent-supplied values (commit messages, branch names) cannot inject
 * shell metacharacters. Every call is confined to a `cwd` the handler already
 * resolved inside the workspace root.
 */
import { execFile } from 'node:child_process'
import { SandboxError } from './sandbox.mjs'

const GIT_TIMEOUT_MS = 30_000
const GIT_MAX_BUFFER = 8 * 1024 * 1024
const GIT_OUTPUT_CAP = 16_000

/**
 * Build the env that authenticates a single git invocation with a GitHub token,
 * WITHOUT touching argv (so the token never appears in `ps`) or persisting it to
 * the repo config. Uses git's env-based config (`GIT_CONFIG_*`) to inject an
 * `http.extraHeader` Basic auth header. Returns undefined when no token.
 */
export function buildGitAuthEnv(token) {
  if (!token || typeof token !== 'string') return undefined
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraHeader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
    GIT_TERMINAL_PROMPT: '0', // never block waiting for a credential prompt
  }
}

/** Run a git subcommand, resolving with `{ code, stdout, stderr }`. */
export function runGit(args, cwd, timeoutMs = GIT_TIMEOUT_MS, authEnv) {
  return new Promise((resolve, reject) => {
    const env = authEnv ? { ...process.env, ...authEnv } : process.env
    execFile('git', args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: GIT_MAX_BUFFER, env }, (err, stdout, stderr) => {
      // Spawn-level failure (git missing, timeout) → reject as a SandboxError.
      if (err && typeof err.code !== 'number') {
        if (err.code === 'ENOENT') {
          reject(new SandboxError('git não está instalado ou não está no PATH.', 'GIT_MISSING'))
          return
        }
        if (err.killed) {
          reject(new SandboxError('Comando git excedeu o tempo limite.', 'TIMEOUT'))
          return
        }
        reject(new SandboxError(`Falha ao executar git: ${err.message}`, 'GIT_ERROR'))
        return
      }
      resolve({
        code: err && typeof err.code === 'number' ? err.code : 0,
        stdout: String(stdout ?? '').slice(0, GIT_OUTPUT_CAP),
        stderr: String(stderr ?? '').slice(0, GIT_OUTPUT_CAP),
      })
    })
  })
}

/** Parse `git status --porcelain=v1 --branch` into a structured summary. */
export function parsePorcelainStatus(text) {
  const lines = String(text ?? '').split(/\r?\n/).filter(Boolean)
  let branch
  let ahead = 0
  let behind = 0
  const files = []
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const header = line.slice(3)
      const branchPart = header.split(/\s*\[/)[0]
      branch = branchPart.split('...')[0].trim() || undefined
      const aheadMatch = header.match(/ahead (\d+)/)
      const behindMatch = header.match(/behind (\d+)/)
      if (aheadMatch) ahead = Number(aheadMatch[1])
      if (behindMatch) behind = Number(behindMatch[1])
      continue
    }
    const code = line.slice(0, 2)
    const file = line.slice(3)
    files.push({ code, path: file })
  }
  return { branch, ahead, behind, files, clean: files.length === 0 }
}

export async function gitStatus(cwd) {
  const res = await runGit(['status', '--porcelain=v1', '--branch'], cwd)
  if (res.code !== 0 && res.stderr) {
    throw new SandboxError(res.stderr.trim() || 'git status falhou.', 'GIT_STATUS_FAILED')
  }
  return parsePorcelainStatus(res.stdout)
}

export async function gitDiff(cwd, payload = {}) {
  const args = ['--no-pager', 'diff']
  if (payload.staged === true) args.push('--staged')
  const file = typeof payload.path === 'string' ? payload.path.trim() : ''
  if (file) args.push('--', file)
  const res = await runGit(args, cwd)
  return { diff: res.stdout, truncated: res.stdout.length >= GIT_OUTPUT_CAP, stderr: res.stderr || undefined }
}

export async function gitCommit(cwd, payload = {}) {
  const message = typeof payload.message === 'string' ? payload.message.trim() : ''
  if (!message) throw new SandboxError('git commit requer "message".', 'EMPTY_MESSAGE')
  if (payload.add_all === true) {
    const add = await runGit(['add', '-A'], cwd)
    if (add.code !== 0) throw new SandboxError(add.stderr.trim() || 'git add falhou.', 'GIT_ADD_FAILED')
  }
  const res = await runGit(['commit', '-m', message], cwd)
  const output = `${res.stdout}${res.stderr ? `\n${res.stderr}` : ''}`.trim()
  return { code: res.code, output, committed: res.code === 0 }
}

export async function gitPull(cwd, payload = {}) {
  const args = ['pull']
  if (typeof payload.remote === 'string' && payload.remote.trim()) args.push(payload.remote.trim())
  if (typeof payload.branch === 'string' && payload.branch.trim()) args.push(payload.branch.trim())
  const res = await runGit(args, cwd, GIT_TIMEOUT_MS, buildGitAuthEnv(payload.token))
  const output = `${res.stdout}${res.stderr ? `\n${res.stderr}` : ''}`.trim()
  return { code: res.code, output, ok: res.code === 0 }
}

export async function gitPush(cwd, payload = {}) {
  const args = ['push']
  if (typeof payload.remote === 'string' && payload.remote.trim()) args.push(payload.remote.trim())
  if (typeof payload.branch === 'string' && payload.branch.trim()) args.push(payload.branch.trim())
  const res = await runGit(args, cwd, GIT_TIMEOUT_MS, buildGitAuthEnv(payload.token))
  const output = `${res.stdout}${res.stderr ? `\n${res.stderr}` : ''}`.trim()
  return { code: res.code, output, ok: res.code === 0 }
}

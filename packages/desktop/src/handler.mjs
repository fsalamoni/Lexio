/**
 * Request handler — maps the WebSocket protocol the Lexio frontend speaks
 * (`{ id, type, op, payload }` → `{ id, ok, result?, error? }`) onto sandboxed
 * filesystem + shell operations. Kept independent of the socket layer so it can
 * be unit-tested with an in-memory config and a temp directory.
 *
 * Protocol ops (matching frontend/src/lib/chat-orchestrator/sidecar-skills.ts):
 *   shell/ping            → liveness + capability handshake
 *   fs/read   {path,max_lines}
 *   fs/list   {path,pattern}
 *   fs/write  {path,content}
 *   shell/exec {cmd,cwd,timeout_sec}
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { exec } from 'node:child_process'
import {
  resolveInsideRoots,
  isForbiddenRoot,
  matchesAnyGlob,
  isBlockedByGlob,
  findDestructivePattern,
  assertPermission,
  SandboxError,
} from './sandbox.mjs'
import { gitStatus, gitDiff, gitCommit, gitPull, gitPush } from './git.mjs'

const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB read/write ceiling
const SHELL_MAX_TIMEOUT_SEC = 30
const SHELL_OUTPUT_CAP = 12_000

/**
 * @param {object} config
 * @param {string} config.root            absolute workspace root
 * @param {string[]} config.permissions   ['read','write','execute',...]
 * @param {string[]} [config.allowedGlobs]
 * @param {string[]} [config.blockedGlobs]
 * @param {number} [config.maxFileBytes]
 * @param {string} config.version
 */
export function createHandler(config) {
  // Allowlist of authorized roots. Mutable: the `grant` op can add/remove roots
  // at runtime (session-only or persisted) after the user approves a folder.
  let roots = Array.isArray(config.roots) && config.roots.length
    ? config.roots.map(r => path.resolve(r))
    : [path.resolve(config.root)]
  // Optional callback to persist the allowlist across restarts ("permitir sempre").
  const persistRoots = typeof config.persistRoots === 'function' ? config.persistRoots : null
  const permissions = Array.isArray(config.permissions) ? config.permissions : ['read']
  const allowedGlobs = config.allowedGlobs ?? []
  const blockedGlobs = config.blockedGlobs ?? ['.env', '*.key', '*.pem', 'id_rsa*']
  const maxFileBytes = config.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  const version = config.version ?? '0.1.0'

  async function handle(request) {
    const id = request?.id ?? null
    try {
      const result = await dispatch(request)
      return { id, ok: true, result }
    } catch (err) {
      const code = err instanceof SandboxError ? err.code : 'ERROR'
      return { id, ok: false, error: `${err.message}`, code }
    }
  }

  async function dispatch(request) {
    const { type, op, payload = {} } = request ?? {}

    if (type === 'shell' && op === 'ping') {
      return {
        pong: true,
        version,
        root: roots[0],
        roots,
        permissions,
        platform: process.platform,
      }
    }

    if (type === 'fs') {
      if (op === 'read') return readFile(payload)
      if (op === 'list') return listDir(payload)
      if (op === 'write') return writeFile(payload)
      if (op === 'delete') return deleteEntry(payload)
      if (op === 'rename' || op === 'move') return renameEntry(payload)
    }

    if (type === 'shell' && op === 'exec') {
      return runShell(payload)
    }

    if (type === 'git') {
      return runGitOp(op, payload)
    }

    if (type === 'grant') {
      return manageRoots(op, payload)
    }

    throw new SandboxError(`Operação não suportada: ${type}/${op}`, 'UNSUPPORTED_OP')
  }

  /**
   * Manage the authorized-folder allowlist at runtime. The connection is already
   * authenticated by the pairing token (= the user), and the UI gates this
   * behind an explicit approval, so granting is allowed — but never for system
   * or secret directories (`isForbiddenRoot`). With `persist: true` the grant is
   * written to the config file so it survives restarts ("permitir sempre");
   * otherwise it lasts only for this running process ("permitir desta vez").
   */
  async function manageRoots(op, payload = {}) {
    if (op === 'list') return { roots }

    if (op === 'add') {
      const candidate = String(payload.path ?? '').trim()
      if (!candidate) throw new SandboxError('Informe a pasta a autorizar.', 'EMPTY_PATH')
      const resolved = path.resolve(candidate)
      if (isForbiddenRoot(resolved)) {
        throw new SandboxError(`A pasta "${resolved}" é de sistema/credenciais e não pode ser autorizada.`, 'FORBIDDEN_ROOT')
      }
      await fs.mkdir(resolved, { recursive: true })
      const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved
      const already = roots.some(r => (process.platform === 'win32' ? r.toLowerCase() : r) === key)
      if (!already) roots = [...roots, resolved]
      if (payload.persist && persistRoots) {
        try { roots = persistRoots(roots).map(r => path.resolve(r)) } catch { /* keep in-memory grant */ }
      }
      return { roots, added: resolved, persisted: Boolean(payload.persist) }
    }

    if (op === 'remove') {
      const candidate = path.resolve(String(payload.path ?? '').trim())
      const key = process.platform === 'win32' ? candidate.toLowerCase() : candidate
      roots = roots.filter(r => (process.platform === 'win32' ? r.toLowerCase() : r) !== key)
      if (payload.persist && persistRoots) {
        try { roots = persistRoots(roots).map(r => path.resolve(r)) } catch { /* keep in-memory state */ }
      }
      return { roots, removed: candidate, persisted: Boolean(payload.persist) }
    }

    throw new SandboxError(`Operação grant não suportada: ${op}`, 'UNSUPPORTED_OP')
  }

  async function readFile(payload) {
    assertPermission(permissions, 'read')
    const target = resolveInsideRoots(roots, payload.path).path
    const base = path.basename(target)
    if (isBlockedByGlob(base, blockedGlobs)) {
      throw new SandboxError(`Arquivo "${base}" está na lista de bloqueio.`, 'BLOCKED')
    }
    const stat = await fs.stat(target)
    if (stat.size > maxFileBytes) {
      throw new SandboxError(`Arquivo excede o limite de ${maxFileBytes} bytes.`, 'TOO_LARGE')
    }
    const maxLines = Number(payload.max_lines) > 0 ? Number(payload.max_lines) : 200
    const content = await fs.readFile(target, 'utf8')
    const lines = content.split(/\r?\n/)
    const clipped = lines.slice(0, maxLines).join('\n')
    return clipped
  }

  async function listDir(payload) {
    assertPermission(permissions, 'read')
    const target = resolveInsideRoots(roots, payload.path).path
    const pattern = typeof payload.pattern === 'string' && payload.pattern.trim() ? payload.pattern.trim() : undefined
    const dirents = await fs.readdir(target, { withFileTypes: true })
    const entries = []
    for (const dirent of dirents) {
      if (isBlockedByGlob(dirent.name, blockedGlobs)) continue
      const isDir = dirent.isDirectory()
      if (!isDir && pattern && !matchesAnyGlob(dirent.name, [pattern])) continue
      let size
      if (!isDir) {
        try {
          size = (await fs.stat(path.join(target, dirent.name))).size
        } catch { /* unreadable entry — skip size */ }
      }
      entries.push({ name: isDir ? `${dirent.name}/` : dirent.name, type: isDir ? 'dir' : 'file', ...(size !== undefined ? { size } : {}) })
    }
    return entries
  }

  async function writeFile(payload) {
    assertPermission(permissions, 'write')
    const target = resolveInsideRoots(roots, payload.path).path
    const base = path.basename(target)
    if (isBlockedByGlob(base, blockedGlobs)) {
      throw new SandboxError(`Escrita em "${base}" bloqueada pela lista de bloqueio.`, 'BLOCKED')
    }
    const content = typeof payload.content === 'string' ? payload.content : ''
    const bytes = Buffer.byteLength(content, 'utf8')
    if (bytes > maxFileBytes) {
      throw new SandboxError(`Conteúdo excede o limite de ${maxFileBytes} bytes.`, 'TOO_LARGE')
    }
    if (allowedGlobs.length > 0 && !matchesAnyGlob(base, allowedGlobs)) {
      throw new SandboxError(`Escrita em "${base}" não corresponde aos padrões permitidos.`, 'NOT_ALLOWED')
    }
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content, 'utf8')
    return { path: target, bytes }
  }

  async function deleteEntry(payload) {
    assertPermission(permissions, 'delete')
    const target = resolveInsideRoots(roots, payload.path).path
    if (roots.some(r => path.resolve(target) === r)) {
      throw new SandboxError('Não é permitido apagar a raiz de uma pasta de trabalho.', 'ROOT_PROTECTED')
    }
    const base = path.basename(target)
    if (isBlockedByGlob(base, blockedGlobs)) {
      throw new SandboxError(`Remoção de "${base}" bloqueada pela lista de bloqueio.`, 'BLOCKED')
    }
    const stat = await fs.stat(target)
    if (stat.isDirectory()) {
      // Only empty directories are removed; recursive deletes are refused as a
      // defense-in-depth measure even with the `delete` permission granted.
      await fs.rmdir(target)
    } else {
      await fs.unlink(target)
    }
    return { path: target, deleted: true, kind: stat.isDirectory() ? 'dir' : 'file' }
  }

  async function renameEntry(payload) {
    assertPermission(permissions, 'rename')
    // `from` and `to` may live in different authorized roots (move between
    // folders), as long as each one is inside the allowlist.
    const from = resolveInsideRoots(roots, payload.from ?? payload.path).path
    const to = resolveInsideRoots(roots, payload.to ?? payload.target_path).path
    if (roots.some(r => path.resolve(from) === r || path.resolve(to) === r)) {
      throw new SandboxError('Não é permitido renomear/mover a raiz de uma pasta de trabalho.', 'ROOT_PROTECTED')
    }
    const fromBase = path.basename(from)
    const toBase = path.basename(to)
    if (isBlockedByGlob(fromBase, blockedGlobs) || isBlockedByGlob(toBase, blockedGlobs)) {
      throw new SandboxError('Origem ou destino está na lista de bloqueio.', 'BLOCKED')
    }
    if (allowedGlobs.length > 0 && !matchesAnyGlob(toBase, allowedGlobs)) {
      throw new SandboxError(`Destino "${toBase}" não corresponde aos padrões permitidos.`, 'NOT_ALLOWED')
    }
    await fs.mkdir(path.dirname(to), { recursive: true })
    await fs.rename(from, to)
    return { from, to, moved: true }
  }

  async function runGitOp(op, payload = {}) {
    assertPermission(permissions, 'execute')
    const cwd = payload.cwd ? resolveInsideRoots(roots, payload.cwd).path : roots[0]
    switch (op) {
      case 'status': return gitStatus(cwd)
      case 'diff': return gitDiff(cwd, payload)
      case 'commit': return gitCommit(cwd, payload)
      case 'pull': return gitPull(cwd, payload)
      case 'push': return gitPush(cwd, payload)
      default: throw new SandboxError(`Operação git não suportada: ${op}`, 'UNSUPPORTED_OP')
    }
  }

  function runShell(payload) {
    assertPermission(permissions, 'execute')
    const cmd = String(payload.cmd ?? '').trim()
    if (!cmd) throw new SandboxError('Comando vazio.', 'EMPTY_CMD')
    const destructive = findDestructivePattern(cmd)
    if (destructive) {
      throw new SandboxError(`Comando bloqueado por segurança (padrão: ${destructive}).`, 'DESTRUCTIVE')
    }
    const cwd = payload.cwd ? resolveInsideRoots(roots, payload.cwd).path : roots[0]
    const timeoutSec = Math.min(Number(payload.timeout_sec) > 0 ? Number(payload.timeout_sec) : 10, SHELL_MAX_TIMEOUT_SEC)
    return new Promise((resolve, reject) => {
      exec(cmd, { cwd, timeout: timeoutSec * 1000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        const out = `${stdout ?? ''}${stderr ? `\n${stderr}` : ''}`.slice(0, SHELL_OUTPUT_CAP)
        if (err && err.killed) {
          reject(new SandboxError(`Comando excedeu o tempo limite de ${timeoutSec}s.`, 'TIMEOUT'))
          return
        }
        // Non-zero exit is returned as result text (not an error) so the agent
        // can read the command's own diagnostics.
        resolve(out || (err ? `(sem saída; código ${err.code ?? 'desconhecido'})` : '(sem saída)'))
      })
    })
  }

  return {
    handle,
    dispatch,
    get roots() { return roots },
    get root() { return roots[0] },
    permissions,
    version,
  }
}

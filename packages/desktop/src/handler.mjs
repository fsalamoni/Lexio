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
  resolveInsideRoot,
  matchesAnyGlob,
  isBlockedByGlob,
  findDestructivePattern,
  assertPermission,
  SandboxError,
} from './sandbox.mjs'

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
  const root = path.resolve(config.root)
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
        root,
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

    throw new SandboxError(`Operação não suportada: ${type}/${op}`, 'UNSUPPORTED_OP')
  }

  async function readFile(payload) {
    assertPermission(permissions, 'read')
    const target = resolveInsideRoot(root, payload.path)
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
    const target = resolveInsideRoot(root, payload.path)
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
    const target = resolveInsideRoot(root, payload.path)
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
    const target = resolveInsideRoot(root, payload.path)
    if (path.resolve(target) === root) {
      throw new SandboxError('Não é permitido apagar a raiz da pasta de trabalho.', 'ROOT_PROTECTED')
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
    const from = resolveInsideRoot(root, payload.from ?? payload.path)
    const to = resolveInsideRoot(root, payload.to ?? payload.target_path)
    if (path.resolve(from) === root || path.resolve(to) === root) {
      throw new SandboxError('Não é permitido renomear a raiz da pasta de trabalho.', 'ROOT_PROTECTED')
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

  function runShell(payload) {
    assertPermission(permissions, 'execute')
    const cmd = String(payload.cmd ?? '').trim()
    if (!cmd) throw new SandboxError('Comando vazio.', 'EMPTY_CMD')
    const destructive = findDestructivePattern(cmd)
    if (destructive) {
      throw new SandboxError(`Comando bloqueado por segurança (padrão: ${destructive}).`, 'DESTRUCTIVE')
    }
    const cwd = payload.cwd ? resolveInsideRoot(root, payload.cwd) : root
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

  return { handle, dispatch, root, permissions, version }
}

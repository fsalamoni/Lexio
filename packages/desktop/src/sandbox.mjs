/**
 * Sandbox — the security core of the Lexio desktop sidecar.
 *
 * Every filesystem op is confined to a single configured WORKSPACE ROOT (the
 * "local folder" the user picks), mirroring how Claude Desktop's filesystem
 * server only operates inside allowed directories. Pure functions here so they
 * can be unit-tested without touching the disk or the network.
 */
import path from 'node:path'

/**
 * Resolve a user/agent-supplied path against the workspace root and assert it
 * stays inside it. Accepts absolute paths (must be within root), `~`-relative,
 * or root-relative paths. Throws on traversal escapes.
 *
 * @param {string} root absolute, already-resolved workspace root
 * @param {string} candidate path from the request (may be '', '.', 'a/b', abs)
 * @returns {string} absolute resolved path guaranteed inside root
 */
export function resolveInsideRoot(root, candidate) {
  const normalizedRoot = path.resolve(root)
  const raw = typeof candidate === 'string' ? candidate.trim() : ''
  // Treat empty / '~' / '.' as the root itself.
  let rel = raw
  if (rel === '' || rel === '~' || rel === '.') rel = '.'
  else if (rel.startsWith('~/') || rel.startsWith('~\\')) rel = rel.slice(2)

  // If an absolute path was given, re-base it: only accept it when it already
  // sits inside the root; otherwise treat its basename-relative form as relative.
  let resolved
  if (path.isAbsolute(rel)) {
    resolved = path.resolve(rel)
  } else {
    resolved = path.resolve(normalizedRoot, rel)
  }

  const relToRoot = path.relative(normalizedRoot, resolved)
  const escapes = relToRoot.startsWith('..') || path.isAbsolute(relToRoot)
  if (escapes) {
    throw new SandboxError(
      `Caminho "${candidate}" está fora da pasta de trabalho permitida.`,
      'PATH_OUTSIDE_ROOT',
    )
  }
  return resolved
}

/** Convert a simple glob (`*.pdf`, `notes*`, `*report*`) to a RegExp. */
export function globToRegExp(glob) {
  const escaped = String(glob)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

/** True when `name` matches any of the provided globs (empty list = match all). */
export function matchesAnyGlob(name, globs) {
  if (!globs || globs.length === 0) return true
  return globs.some(g => globToRegExp(g).test(name))
}

/** True when `name` matches a blocked glob. */
export function isBlockedByGlob(name, blockedGlobs) {
  if (!blockedGlobs || blockedGlobs.length === 0) return false
  return blockedGlobs.some(g => globToRegExp(g).test(name))
}

/**
 * Destructive-command patterns refused even when `execute` is granted. This is
 * defense-in-depth on top of the approval flow — the orchestrator already gates
 * costly/side-effectful actions, but a runaway command must never wipe a disk.
 */
const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-rf?\b/i,
  /\brmdir\s+\/s\b/i,
  /\bdel\s+\/[sfq]/i,
  /\bformat\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  />\s*\/dev\/[sh]d/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bhalt\b/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, // fork bomb
  /\bmv\s+.*\s+\/dev\/null\b/i,
  /\bchmod\s+-R\s+0\b/i,
  /\b(sudo|su)\b/i,
  /\bcurl\b.*\|\s*(sh|bash)\b/i,
  /\bwget\b.*\|\s*(sh|bash)\b/i,
]

/** Returns the matched destructive pattern source, or null when the command is allowed. */
export function findDestructivePattern(cmd) {
  const text = String(cmd ?? '')
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(text)) return pattern.source
  }
  return null
}

export class SandboxError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'SandboxError'
    this.code = code || 'SANDBOX_ERROR'
  }
}

/** Permission helpers — the workspace declares which capabilities are granted. */
export function assertPermission(permissions, required) {
  const granted = Array.isArray(permissions) ? permissions : []
  if (!granted.includes(required)) {
    throw new SandboxError(
      `Operação requer a permissão "${required}", que não foi concedida a esta pasta.`,
      'PERMISSION_DENIED',
    )
  }
}

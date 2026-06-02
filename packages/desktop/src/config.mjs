/**
 * Config + pairing-token persistence for the sidecar.
 *
 * Stores a small JSON at ~/.lexio/desktop.json with the chosen workspace root,
 * granted permissions, and a generated pairing token. The token is shown to the
 * user once at startup so they can paste it into Lexio → Configurações → Pasta
 * local. Mirrors how desktop agents persist a local config + device secret.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { isForbiddenRoot } from './sandbox.mjs'

const CONFIG_DIR = path.join(os.homedir(), '.lexio')
const CONFIG_PATH = path.join(CONFIG_DIR, 'desktop.json')

export function getConfigPath() {
  return CONFIG_PATH
}

export function generateToken() {
  return crypto.randomBytes(24).toString('base64url')
}

/** Load existing config or null. */
export function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Persist config (chmod 600 so the token isn't world-readable). */
export function saveConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 })
  try { fs.chmodSync(CONFIG_PATH, 0o600) } catch { /* best-effort on platforms without chmod */ }
  return config
}

/**
 * Resolve, de-duplicate and filter a list of candidate roots, dropping any that
 * are forbidden (system/secret dirs). Order is preserved; the first survivor is
 * the "primary" workspace. This is the allowlist the sidecar enforces.
 */
export function normalizeRootList(list) {
  const seen = new Set()
  const out = []
  for (const item of Array.isArray(list) ? list : []) {
    if (typeof item !== 'string' || !item.trim()) continue
    const resolved = path.resolve(item.trim())
    if (isForbiddenRoot(resolved)) continue
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved
    if (seen.has(key)) continue
    seen.add(key)
    out.push(resolved)
  }
  return out
}

/**
 * Resolve the effective config from CLI args + env + persisted file, creating a
 * token on first run. Precedence for the allowlist: CLI roots > env root >
 * persisted roots. Previously granted roots persist across restarts.
 *
 * @param {object} [argv]  parsed CLI flags ({ root, rootList, permissions })
 */
export function resolveConfig(argv = {}) {
  const existing = loadConfig() ?? {}
  const home = os.homedir()

  const argvRoots = Array.isArray(argv.rootList) && argv.rootList.length
    ? argv.rootList
    : (argv.root ? [argv.root] : [])
  const envRoot = process.env.LEXIO_DESKTOP_ROOT
  // Migrate legacy single `root` into the new `roots` allowlist.
  const persisted = Array.isArray(existing.roots)
    ? existing.roots
    : (existing.root ? [existing.root] : [])

  let roots = normalizeRootList([...argvRoots, ...(envRoot ? [envRoot] : []), ...persisted])
  if (roots.length === 0) roots = normalizeRootList([path.join(home, 'Lexio')])

  const permissions = parsePermissions(
    argv.permissions
      || process.env.LEXIO_DESKTOP_PERMISSIONS
      || (existing.permissions ? existing.permissions.join(',') : 'read,write'),
  )
  const token = existing.token || generateToken()
  const config = {
    root: roots[0],   // primary workspace — kept for backward compatibility
    roots,            // full allowlist of authorized folders
    permissions,
    token,
    blockedGlobs: existing.blockedGlobs ?? ['.env', '*.key', '*.pem', 'id_rsa*', '*.crt'],
    maxFileBytes: existing.maxFileBytes ?? 5 * 1024 * 1024,
    updated_at: new Date().toISOString(),
  }
  saveConfig(config)
  return config
}

/**
 * Persist a new allowlist of roots to the config file — used when the user
 * approves "permitir sempre" for a folder so the grant survives restarts.
 * Returns the normalized roots actually stored.
 */
export function persistRoots(newRoots) {
  const existing = loadConfig() ?? {}
  const roots = normalizeRootList(newRoots)
  saveConfig({
    ...existing,
    roots,
    root: roots[0] ?? existing.root,
    updated_at: new Date().toISOString(),
  })
  return roots
}

function parsePermissions(value) {
  const allowed = new Set(['read', 'write', 'delete', 'rename', 'execute', 'network'])
  const parts = String(value)
    .split(',')
    .map(p => p.trim().toLowerCase())
    .filter(p => allowed.has(p))
  return parts.length > 0 ? Array.from(new Set(parts)) : ['read']
}

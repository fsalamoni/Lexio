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
 * Resolve the effective config from CLI args + env + persisted file, creating a
 * token on first run. Precedence: CLI flag > env > persisted > default.
 *
 * @param {object} [argv]  parsed CLI flags ({ root, permissions })
 */
export function resolveConfig(argv = {}) {
  const existing = loadConfig() ?? {}
  const root = path.resolve(
    argv.root
      || process.env.LEXIO_DESKTOP_ROOT
      || existing.root
      || path.join(os.homedir(), 'Lexio'),
  )
  const permissions = parsePermissions(
    argv.permissions
      || process.env.LEXIO_DESKTOP_PERMISSIONS
      || (existing.permissions ? existing.permissions.join(',') : 'read,write'),
  )
  const token = existing.token || generateToken()
  const config = {
    root,
    permissions,
    token,
    blockedGlobs: existing.blockedGlobs ?? ['.env', '*.key', '*.pem', 'id_rsa*', '*.crt'],
    maxFileBytes: existing.maxFileBytes ?? 5 * 1024 * 1024,
    updated_at: new Date().toISOString(),
  }
  saveConfig(config)
  return config
}

function parsePermissions(value) {
  const allowed = new Set(['read', 'write', 'delete', 'rename', 'execute', 'network'])
  const parts = String(value)
    .split(',')
    .map(p => p.trim().toLowerCase())
    .filter(p => allowed.has(p))
  return parts.length > 0 ? Array.from(new Set(parts)) : ['read']
}

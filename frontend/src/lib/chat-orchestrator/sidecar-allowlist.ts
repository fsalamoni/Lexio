/**
 * Sidecar allowlist — the persisted "permitir sempre" grants, stored per user
 * under `users/{uid}/settings/preferences.sidecar_allowlist`.
 *
 * A rule authorizes a folder (root) on a given device for a set of operations,
 * covering the whole subtree. Before prompting the user for a write/delete/
 * rename/execute, the chat checks this list; a match means "the user already
 * said always for this folder", so we skip the prompt. Mirrors (on the browser
 * side) the allowlist the sidecar enforces on the PC.
 *
 * Pure helpers (match/add/remove/path checks) are exported and unit tested
 * without Firestore; only `load*`/`save*` touch persistence.
 */
import { IS_FIREBASE } from '../firebase'
import { ensureUserSettingsMigrated, getCurrentUserId, saveUserSettings } from '../firestore-service'
import type { ChatSidecarPermission, SidecarAllowlistRule, UserSettingsData } from '../firestore-types'

function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `grant-${crypto.randomUUID()}`
    }
  } catch {
    // fall through
  }
  return `grant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

/** Normalize a path for comparison: unify separators, drop trailing slash, and
 * lowercase Windows-style paths (drive letter or backslashes). */
function normPath(p: string): string {
  if (typeof p !== 'string') return ''
  const looksWindows = /^[a-zA-Z]:[\\/]/.test(p) || p.includes('\\')
  let s = p.replace(/\\/g, '/').replace(/\/+$/, '')
  if (looksWindows) s = s.toLowerCase()
  return s
}

/** True when `target` is `root` itself or lives inside the `root` subtree. */
export function pathIsWithin(root: string, target: string): boolean {
  const r = normPath(root)
  const t = normPath(target)
  if (!r || !t) return false
  return t === r || t.startsWith(`${r}/`)
}

function opsCover(ops: SidecarAllowlistRule['ops'], op: ChatSidecarPermission): boolean {
  return ops === 'all' || (Array.isArray(ops) && ops.includes(op))
}

export function normalizeRule(input: unknown): SidecarAllowlistRule | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<SidecarAllowlistRule>
  const root = typeof raw.root === 'string' ? raw.root.trim() : ''
  const device_id = typeof raw.device_id === 'string' ? raw.device_id.trim() : ''
  if (!root || !device_id) return null
  let ops: SidecarAllowlistRule['ops']
  if (raw.ops === 'all') ops = 'all'
  else if (Array.isArray(raw.ops)) ops = raw.ops.filter((o): o is ChatSidecarPermission => typeof o === 'string')
  else ops = []
  if (Array.isArray(ops) && ops.length === 0) return null
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : genId(),
    device_id,
    root,
    ops,
    created_at: typeof raw.created_at === 'string' && raw.created_at ? raw.created_at : nowIso(),
  }
}

export function normalizeRules(stored: unknown): SidecarAllowlistRule[] {
  const list = Array.isArray(stored) ? stored : []
  const out: SidecarAllowlistRule[] = []
  const seen = new Set<string>()
  for (const entry of list) {
    const rule = normalizeRule(entry)
    if (!rule || seen.has(rule.id)) continue
    seen.add(rule.id)
    out.push(rule)
  }
  return out
}

/** Find a rule that already authorizes `op` on `path` for `deviceId`. */
export function matchAllowlist(
  rules: SidecarAllowlistRule[],
  deviceId: string,
  op: ChatSidecarPermission,
  path: string,
): SidecarAllowlistRule | null {
  for (const rule of rules) {
    if (rule.device_id !== deviceId) continue
    if (!opsCover(rule.ops, op)) continue
    if (pathIsWithin(rule.root, path)) return rule
  }
  return null
}

/**
 * Add (or merge) a "permitir sempre" rule. If a rule for the same device+root
 * already exists, its ops are unioned (or widened to 'all'); otherwise a new
 * rule is appended. Returns a new array.
 */
export function addRule(
  rules: SidecarAllowlistRule[],
  input: { device_id: string; root: string; ops: ChatSidecarPermission[] | 'all' },
): SidecarAllowlistRule[] {
  const created = normalizeRule({ ...input, created_at: nowIso() })
  if (!created) return rules
  const rootKey = normPath(created.root)
  const idx = rules.findIndex(r => r.device_id === created.device_id && normPath(r.root) === rootKey)
  if (idx === -1) return [...rules, created]

  const existing = rules[idx]
  let mergedOps: SidecarAllowlistRule['ops']
  if (existing.ops === 'all' || created.ops === 'all') {
    mergedOps = 'all'
  } else {
    mergedOps = Array.from(new Set([...existing.ops, ...created.ops]))
  }
  const next = [...rules]
  next[idx] = { ...existing, ops: mergedOps }
  return next
}

export function removeRule(rules: SidecarAllowlistRule[], id: string): SidecarAllowlistRule[] {
  return rules.filter(r => r.id !== id)
}

// ── Firestore-backed load/save ────────────────────────────────────────────────

let cached: { uid: string | undefined; rules: SidecarAllowlistRule[] } | null = null

export function invalidateSidecarAllowlistCache(): void {
  cached = null
}

function resolveScopedUid(uid?: string): string | undefined {
  return uid ?? getCurrentUserId() ?? undefined
}

export async function loadSidecarAllowlist(uid?: string): Promise<SidecarAllowlistRule[]> {
  if (!IS_FIREBASE) return []
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) return []
  if (cached && cached.uid === resolvedUid) return cached.rules
  try {
    const settings = await ensureUserSettingsMigrated(resolvedUid)
    const rules = normalizeRules(settings.sidecar_allowlist)
    cached = { uid: resolvedUid, rules }
    return rules
  } catch {
    return []
  }
}

export async function saveSidecarAllowlist(rules: SidecarAllowlistRule[], uid?: string): Promise<void> {
  if (!IS_FIREBASE) return
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) return
  const normalized = normalizeRules(rules)
  await saveUserSettings(resolvedUid, { sidecar_allowlist: normalized } as Partial<UserSettingsData>)
  cached = { uid: resolvedUid, rules: normalized }
}

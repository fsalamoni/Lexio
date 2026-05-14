const ADMIN_ROLE_VALUES = new Set(['admin', 'platform_admin'])

export function isAdminLikeRole(role: unknown): boolean {
  const normalizedRole = String(role || '').trim().toLowerCase()
  return ADMIN_ROLE_VALUES.has(normalizedRole)
}

export function resolveAdminAwareRole(profileRole: unknown, email?: string | null): 'admin' | 'user' {
  if (isAdminLikeRole(profileRole)) return 'admin'

  const adminEmail = String(import.meta.env.VITE_ADMIN_EMAIL || '').trim().toLowerCase()
  const normalizedEmail = String(email || '').trim().toLowerCase()

  if (adminEmail && normalizedEmail && normalizedEmail === adminEmail) {
    return 'admin'
  }

  return 'user'
}
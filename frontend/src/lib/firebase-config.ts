function normalizeHost(value: string | undefined | null): string | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized || undefined
}

function toProjectFromAuthDomain(authDomain: string | undefined): string | undefined {
  const normalized = normalizeHost(authDomain)
  if (!normalized) return undefined
  const firebaseAppSuffix = '.firebaseapp.com'
  if (normalized.endsWith(firebaseAppSuffix)) {
    return normalized.slice(0, -firebaseAppSuffix.length)
  }
  const webSuffix = '.web.app'
  if (normalized.endsWith(webSuffix)) {
    return normalized.slice(0, -webSuffix.length)
  }
  return undefined
}

/**
 * Resolve the Firebase Auth domain.
 *
 * For Google Sign-In popup to work correctly, authDomain MUST point to the
 * project's `.firebaseapp.com` domain (e.g. `hocapp-44760.firebaseapp.com`).
 * This ensures the `/__/auth/handler` page is served by Firebase's own
 * infrastructure without interference from custom CSP headers.
 *
 * Previous approach of overriding authDomain to the hosting domain
 * (e.g. `lexio.web.app`) caused popup failures because custom headers in
 * firebase.json were applied to `/__/auth/handler`, breaking the OAuth flow.
 */
export function resolveFirebaseAuthDomain(
  configuredAuthDomain: string | undefined,
): string | undefined {
  return normalizeHost(configuredAuthDomain)
}

export function validateFirebaseWebConfig(config: {
  projectId?: string
  authDomain?: string
  storageBucket?: string
  appId?: string
}): string[] {
  const issues: string[] = []
  const normalizedProjectId = String(config.projectId || '').trim()
  const normalizedAuthDomain = resolveFirebaseAuthDomain(config.authDomain)
  const normalizedStorageBucket = String(config.storageBucket || '').trim().toLowerCase()
  const authDomainProject = toProjectFromAuthDomain(normalizedAuthDomain)

  if (!normalizedProjectId) {
    issues.push('VITE_FIREBASE_PROJECT_ID ausente.')
    return issues
  }

  if (authDomainProject && authDomainProject !== normalizedProjectId) {
    issues.push(`VITE_FIREBASE_AUTH_DOMAIN (${normalizedAuthDomain}) não corresponde ao projeto ${normalizedProjectId}.`)
  }

  if (normalizedStorageBucket && !normalizedStorageBucket.startsWith(`${normalizedProjectId}.`)) {
    issues.push(`VITE_FIREBASE_STORAGE_BUCKET (${normalizedStorageBucket}) não corresponde ao projeto ${normalizedProjectId}.`)
  }
  return issues
}

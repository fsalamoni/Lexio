function normalizeHost(value: string | undefined | null): string | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized || undefined
}

function isFirebaseHostedDomain(host: string): boolean {
  return host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')
}

export function resolveFirebaseAuthDomain(
  configuredAuthDomain: string | undefined,
  currentHost = typeof window !== 'undefined' ? window.location.hostname : undefined,
): string | undefined {
  const normalizedCurrentHost = normalizeHost(currentHost)
  if (normalizedCurrentHost && isFirebaseHostedDomain(normalizedCurrentHost)) {
    return normalizedCurrentHost
  }

  return normalizeHost(configuredAuthDomain)
}

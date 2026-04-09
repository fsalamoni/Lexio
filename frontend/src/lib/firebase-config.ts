function normalizeHost(value: string | undefined | null): string | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized || undefined
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

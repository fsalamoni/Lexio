import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./AuthContext.tsx', import.meta.url), 'utf-8')

describe('AuthContext session recovery guardrails', () => {
  it('tries to force-refresh and re-sync firebase session before sign-out', () => {
    expect(source).toMatch(/syncAuthFromFirebaseUser\(firebaseAuth\.currentUser,\s*\{\s*forceRefreshToken:\s*true\s*\}\)/)
  })

  it('clears local auth state only when recovery fails', () => {
    expect(source).toMatch(/if \(!recovered\) \{\s*clearAuthState\(\)\s*\}/)
    expect(source).not.toMatch(/finally\s*\{\s*clearAuthState\(\)/)
  })
})

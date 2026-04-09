import { describe, expect, it } from 'vitest'
import { resolveFirebaseAuthDomain } from './firebase-config'

describe('resolveFirebaseAuthDomain', () => {
  it('returns the configured auth domain as-is', () => {
    expect(resolveFirebaseAuthDomain('hocapp-44760.firebaseapp.com')).toBe('hocapp-44760.firebaseapp.com')
  })

  it('normalizes spaces and casing', () => {
    expect(resolveFirebaseAuthDomain(' Hocapp-44760.Firebaseapp.Com ')).toBe('hocapp-44760.firebaseapp.com')
  })

  it('returns undefined for empty/undefined input', () => {
    expect(resolveFirebaseAuthDomain(undefined)).toBeUndefined()
    expect(resolveFirebaseAuthDomain('')).toBeUndefined()
  })
})

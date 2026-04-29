import { describe, expect, it } from 'vitest'
import { resolveFirebaseAuthDomain, validateFirebaseWebConfig } from './firebase-config'

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

describe('validateFirebaseWebConfig', () => {
  it('returns no issues when firebase variables are consistent', () => {
    expect(validateFirebaseWebConfig({
      projectId: 'hocapp-44760',
      authDomain: 'hocapp-44760.firebaseapp.com',
      storageBucket: 'hocapp-44760.firebasestorage.app',
      appId: '1:143237037612:web:85bd9ddaf81973d5031b89',
    })).toEqual([])
  })

  it('flags project mismatches across firebase variables', () => {
    const issues = validateFirebaseWebConfig({
      projectId: 'hocapp-44760',
      authDomain: 'other-project.firebaseapp.com',
      storageBucket: 'other-project.firebasestorage.app',
      appId: '1:other-project:web:85bd9ddaf81973d5031b89',
    })

    expect(issues.length).toBeGreaterThanOrEqual(3)
    expect(issues.join('\n')).toContain('AUTH_DOMAIN')
    expect(issues.join('\n')).toContain('STORAGE_BUCKET')
    expect(issues.join('\n')).toContain('APP_ID')
  })
})

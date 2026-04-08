import { describe, expect, it } from 'vitest'
import { resolveFirebaseAuthDomain } from './firebase-config'

describe('resolveFirebaseAuthDomain', () => {
  it('prefers the current host on production web.app domains', () => {
    expect(resolveFirebaseAuthDomain('hocapp-44760.firebaseapp.com', 'lexio.web.app')).toBe('lexio.web.app')
  })

  it('prefers the current host on Firebase Hosting preview domains', () => {
    expect(resolveFirebaseAuthDomain('hocapp-44760.firebaseapp.com', 'lexio--pr-12-abcd.web.app')).toBe('lexio--pr-12-abcd.web.app')
  })

  it('keeps the configured domain outside Firebase Hosting', () => {
    expect(resolveFirebaseAuthDomain('lexio.web.app', 'localhost')).toBe('lexio.web.app')
  })

  it('normalizes spaces and casing', () => {
    expect(resolveFirebaseAuthDomain(' Lexio.Web.App ', ' LEXIO.WEB.APP ')).toBe('lexio.web.app')
  })
})

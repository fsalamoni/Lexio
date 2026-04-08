import { describe, expect, it } from 'vitest'
import { resolveFirebaseAuthDomain } from './firebase-config'

describe('resolveFirebaseAuthDomain', () => {
  it('prefere o host atual em produção no domínio web.app', () => {
    expect(resolveFirebaseAuthDomain('hocapp-44760.firebaseapp.com', 'lexio.web.app')).toBe('lexio.web.app')
  })

  it('prefere o host atual em previews do Firebase Hosting', () => {
    expect(resolveFirebaseAuthDomain('hocapp-44760.firebaseapp.com', 'lexio--pr-12-abcd.web.app')).toBe('lexio--pr-12-abcd.web.app')
  })

  it('mantém o domínio configurado fora do Firebase Hosting', () => {
    expect(resolveFirebaseAuthDomain('lexio.web.app', 'localhost')).toBe('lexio.web.app')
  })

  it('normaliza espaços e caixa', () => {
    expect(resolveFirebaseAuthDomain(' Lexio.Web.App ', ' LEXIO.WEB.APP ')).toBe('lexio.web.app')
  })
})

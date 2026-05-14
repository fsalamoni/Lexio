// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const authServiceMocks = vi.hoisted(() => {
  const currentUser = {
    uid: 'user-1',
    email: 'admin@example.com',
    displayName: 'Admin User',
    getIdToken: vi.fn().mockResolvedValue('token-123'),
  }

  return {
    currentUser,
    signInWithEmailAndPassword: vi.fn(),
    signInWithPopup: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    signInWithRedirect: vi.fn(),
    getRedirectResult: vi.fn(),
    signOut: vi.fn(),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
    serverTimestamp: vi.fn(() => '__server_timestamp__'),
  }
})

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args: unknown[]) => authServiceMocks.signInWithEmailAndPassword(...args),
  createUserWithEmailAndPassword: (...args: unknown[]) => authServiceMocks.createUserWithEmailAndPassword(...args),
  signInWithPopup: (...args: unknown[]) => authServiceMocks.signInWithPopup(...args),
  signInWithRedirect: (...args: unknown[]) => authServiceMocks.signInWithRedirect(...args),
  getRedirectResult: (...args: unknown[]) => authServiceMocks.getRedirectResult(...args),
  GoogleAuthProvider: class {},
  signOut: (...args: unknown[]) => authServiceMocks.signOut(...args),
}))

vi.mock('firebase/firestore', () => ({
  doc: authServiceMocks.doc,
  getDoc: authServiceMocks.getDoc,
  setDoc: authServiceMocks.setDoc,
  serverTimestamp: () => authServiceMocks.serverTimestamp(),
}))

vi.mock('./firebase', () => ({
  IS_FIREBASE: true,
  firebaseAuth: { currentUser: authServiceMocks.currentUser },
  firestore: { _fake: true },
}))

import { firebaseGoogleLogin, firebaseLogin } from './auth-service'

describe('auth-service admin role resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    authServiceMocks.currentUser.uid = 'user-1'
    authServiceMocks.currentUser.email = 'admin@example.com'
    authServiceMocks.currentUser.displayName = 'Admin User'
    authServiceMocks.currentUser.getIdToken.mockResolvedValue('token-123')

    authServiceMocks.signInWithEmailAndPassword.mockResolvedValue({ user: authServiceMocks.currentUser })
    authServiceMocks.signInWithPopup.mockResolvedValue({ user: authServiceMocks.currentUser })
    authServiceMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ role: 'user', full_name: 'Admin User' }),
    })
    authServiceMocks.setDoc.mockResolvedValue(undefined)
  })

  it('returns admin and repairs the persisted profile for configured admin email on email login', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', 'ADMIN@example.com')

    const result = await firebaseLogin('admin@example.com', 'secret')

    expect(result.role).toBe('admin')
    expect(authServiceMocks.setDoc).toHaveBeenCalledWith(
      { path: 'users/user-1' },
      expect.objectContaining({
        email: 'admin@example.com',
        full_name: 'Admin User',
        role: 'admin',
        updated_at: '__server_timestamp__',
      }),
      { merge: true },
    )
  })

  it('returns admin and repairs the persisted profile for configured admin email on Google login', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', 'admin@example.com')
    authServiceMocks.currentUser.email = 'ADMIN@example.com'

    const result = await firebaseGoogleLogin()

    expect(result.role).toBe('admin')
    expect(authServiceMocks.setDoc).toHaveBeenCalledWith(
      { path: 'users/user-1' },
      expect.objectContaining({
        email: 'ADMIN@example.com',
        full_name: 'Admin User',
        role: 'admin',
        updated_at: '__server_timestamp__',
      }),
      { merge: true },
    )
  })
})
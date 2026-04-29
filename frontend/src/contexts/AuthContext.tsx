import { createContext, useCallback, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { onAuthStateChanged, onIdTokenChanged, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { firebaseAuth, IS_FIREBASE } from '../lib/firebase'
import { firestore } from '../lib/firebase'
import { firebaseLogin, firebaseRegister, firebaseLogout, firebaseGoogleLogin, handleGoogleRedirectResult, translateFirebaseError } from '../lib/auth-service'
import api from '../api/client'
import {
  FIRESTORE_AUTH_SESSION_INVALID_EVENT,
  getSessionFingerprint,
  type FirestoreAuthSessionInvalidEventDetail,
} from '../lib/auth-session-events'

interface AuthContextType {
  token: string | null
  userId: string | null
  role: string | null
  fullName: string | null
  isReady: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  register: (email: string, password: string, fullName: string, title?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

function persist(token: string, uid: string, role: string, name: string) {
  localStorage.setItem('lexio_token', token)
  localStorage.setItem('lexio_user_id', uid)
  localStorage.setItem('lexio_role', role)
  localStorage.setItem('lexio_full_name', name)
}

function clearStorage() {
  localStorage.removeItem('lexio_token')
  localStorage.removeItem('lexio_user_id')
  localStorage.removeItem('lexio_role')
  localStorage.removeItem('lexio_full_name')
}

function readStoredAuthState(): {
  token: string
  userId: string
  role: string
  fullName: string
} | null {
  if (typeof window === 'undefined') return null

  try {
    const storedToken = localStorage.getItem('lexio_token')
    const storedUserId = localStorage.getItem('lexio_user_id')
    if (!storedToken || !storedUserId) return null

    return {
      token: storedToken,
      userId: storedUserId,
      role: localStorage.getItem('lexio_role') || 'user',
      fullName: localStorage.getItem('lexio_full_name') || '',
    }
  } catch {
    return null
  }
}

const SESSION_INVALID_RECOVERY_COOLDOWN_MS = 12_000

const AUTH_ACCESS_ERROR_CODES = new Set([
  'permission-denied',
  'unauthenticated',
  'firestore/permission-denied',
  'firestore/unauthenticated',
  'auth-session-invalid',
  'firestore/auth-session-invalid',
])

function isAuthAccessError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' && AUTH_ACCESS_ERROR_CODES.has(code)) return true
  const message = (error as { message?: unknown }).message
  if (typeof message === 'string' && /missing or insufficient permissions/i.test(message)) {
    return true
  }
  return false
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token,    setToken]    = useState<string | null>(localStorage.getItem('lexio_token'))
  const [userId,   setUserId]   = useState<string | null>(localStorage.getItem('lexio_user_id'))
  const [role,     setRole]     = useState<string | null>(localStorage.getItem('lexio_role'))
  const [fullName, setFullName] = useState<string | null>(localStorage.getItem('lexio_full_name'))
  // Demo mode is immediately ready; Firebase mode waits for onAuthStateChanged
  const [isReady,  setIsReady]  = useState(!IS_FIREBASE)
  const sessionRecoveryRef = useRef({
    inProgress: false,
    lastAt: 0,
    lastFingerprint: '',
  })
  const manualLogoutRef = useRef(false)

  const clearAuthState = useCallback(() => {
    clearStorage()
    setToken(null)
    setUserId(null)
    setRole(null)
    setFullName(null)
  }, [])

  const restoreAuthStateFromStorage = useCallback((): boolean => {
    const snapshot = readStoredAuthState()
    if (!snapshot) return false

    setToken(snapshot.token)
    setUserId(snapshot.userId)
    setRole(snapshot.role)
    setFullName(snapshot.fullName)
    return true
  }, [])

  const syncAuthFromFirebaseUser = useCallback(async (
    fbUser: User,
    options?: { forceRefreshToken?: boolean },
  ) => {
    const newToken = await fbUser.getIdToken(Boolean(options?.forceRefreshToken))
    localStorage.setItem('lexio_token', newToken)
    localStorage.setItem('lexio_user_id', fbUser.uid)
    setToken(newToken)
    setUserId(fbUser.uid)

    if (!firestore) return

    try {
      const userSnap = await getDoc(doc(firestore, 'users', fbUser.uid))
      if (userSnap.exists()) {
        const userData = userSnap.data() as { role?: string; full_name?: string }
        const nextRole = userData.role ?? 'user'
        const nextName = userData.full_name ?? fbUser.displayName ?? localStorage.getItem('lexio_full_name') ?? ''
        localStorage.setItem('lexio_role', nextRole)
        localStorage.setItem('lexio_full_name', nextName)
        setRole(nextRole)
        setFullName(nextName)
      } else {
        const nextName = fbUser.displayName ?? localStorage.getItem('lexio_full_name') ?? ''
        localStorage.setItem('lexio_role', 'user')
        localStorage.setItem('lexio_full_name', nextName)
        setRole('user')
        setFullName(nextName)
      }
    } catch (error) {
      // If reading the user's own profile fails with an auth/permission error,
      // the freshly-issued token is still being rejected by Firestore — meaning
      // the session is not actually recoverable. Propagate so the caller can
      // clear the dead session instead of silently leaving the user "logged in"
      // with an unusable session (which causes an infinite "Sessão inválida"
      // loop on the dashboard).
      if (isAuthAccessError(error)) {
        throw error
      }
      // Non-auth errors (transient network, offline, etc.) keep the soft
      // fallback so we don't log users out on flaky connectivity.
      const nextName = fbUser.displayName ?? localStorage.getItem('lexio_full_name') ?? ''
      if (!localStorage.getItem('lexio_role')) {
        localStorage.setItem('lexio_role', 'user')
      }
      localStorage.setItem('lexio_full_name', nextName)
      setRole((prev) => prev ?? 'user')
      setFullName(nextName)
    }
  }, [])

  const currentSessionFingerprint = useCallback(() => {
    return getSessionFingerprint(firebaseAuth?.currentUser?.uid ?? userId)
  }, [userId])

  const recoverInvalidSession = useCallback(async (detail?: FirestoreAuthSessionInvalidEventDetail) => {
    if (!IS_FIREBASE) return

    const signalFingerprint = detail?.sessionFingerprint || ''
    const liveFingerprint = currentSessionFingerprint()

    // Ignore stale signals from an already-rotated session.
    if (signalFingerprint && signalFingerprint !== liveFingerprint) {
      return
    }

    const now = Date.now()
    if (sessionRecoveryRef.current.inProgress) return
    if (
      sessionRecoveryRef.current.lastFingerprint === liveFingerprint
      && now - sessionRecoveryRef.current.lastAt < SESSION_INVALID_RECOVERY_COOLDOWN_MS
    ) {
      return
    }

    const liveUid = firebaseAuth?.currentUser?.uid ?? null
    if (detail?.authUid && liveUid && detail.authUid !== liveUid) {
      return
    }

    sessionRecoveryRef.current.inProgress = true
    sessionRecoveryRef.current.lastAt = now
    sessionRecoveryRef.current.lastFingerprint = liveFingerprint

    let recovered = false
    try {
      if (firebaseAuth?.currentUser) {
        try {
          await syncAuthFromFirebaseUser(firebaseAuth.currentUser, { forceRefreshToken: true })
          recovered = true
        } catch (error) {
          console.warn('[AuthContext] Failed to refresh Firebase session token and profile data after auth-session-invalid signal:', error)
        }
      }

      if (!recovered) {
        // Keep the user active unless they explicitly request logout.
        restoreAuthStateFromStorage()
      }
    } finally {
      setIsReady(true)
      sessionRecoveryRef.current.inProgress = false
    }
  }, [currentSessionFingerprint, restoreAuthStateFromStorage, syncAuthFromFirebaseUser])

  useEffect(() => {
    if (!IS_FIREBASE || typeof window === 'undefined') return

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<FirestoreAuthSessionInvalidEventDetail>).detail
      void recoverInvalidSession(detail)
    }

    window.addEventListener(FIRESTORE_AUTH_SESSION_INVALID_EVENT, handler as EventListener)
    return () => {
      window.removeEventListener(FIRESTORE_AUTH_SESSION_INVALID_EVENT, handler as EventListener)
    }
  }, [recoverInvalidSession])

  // Listen to Firebase auth state (token refresh, logout from another tab, etc.)
  useEffect(() => {
    if (!IS_FIREBASE || !firebaseAuth) return

    // Handle redirect result from signInWithRedirect (Google login fallback).
    // Must run before onAuthStateChanged so the user profile is persisted.
    handleGoogleRedirectResult().then((r) => {
      if (r) {
        persist(r.token, r.uid, r.role, r.full_name)
        setToken(r.token); setUserId(r.uid); setRole(r.role); setFullName(r.full_name)
      }
    }).catch(() => {})

    const unsub = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      const callbackUid = fbUser?.uid ?? null
      try {
        if (fbUser) {
          manualLogoutRef.current = false
          await syncAuthFromFirebaseUser(fbUser)
        } else {
          if (manualLogoutRef.current) {
            manualLogoutRef.current = false
            clearAuthState()
          } else if (!restoreAuthStateFromStorage()) {
            clearAuthState()
          }
        }
      } catch (error) {
        console.warn('[AuthContext] Failed to hydrate Firebase auth session:', error)
        if (manualLogoutRef.current) {
          manualLogoutRef.current = false
          clearAuthState()
        } else if (!restoreAuthStateFromStorage()) {
          if (callbackUid) {
            localStorage.setItem('lexio_user_id', callbackUid)
            setUserId(callbackUid)
          }
          setRole((prev) => prev ?? localStorage.getItem('lexio_role') ?? 'user')
          setFullName((prev) => prev ?? localStorage.getItem('lexio_full_name') ?? '')
        }
      } finally {
        setIsReady(true)
      }
    })

    return unsub
  }, [clearAuthState, restoreAuthStateFromStorage, syncAuthFromFirebaseUser])

  // Keep the locally-persisted ID token in sync with whatever Firebase Auth
  // currently considers valid. The Firebase SDK rotates tokens automatically
  // (~hourly, plus when Firestore reports auth issues); listening here means
  // the rest of the app — and any reload that hydrates from localStorage —
  // always has the freshest token, eliminating the silent "zombie session"
  // class of bugs where the UI looked logged in but Firestore rejected
  // queries with `permission-denied`.
  useEffect(() => {
    if (!IS_FIREBASE || !firebaseAuth) return

    const unsub = onIdTokenChanged(firebaseAuth, async (fbUser) => {
      if (!fbUser) return
      try {
        const freshToken = await fbUser.getIdToken()
        localStorage.setItem('lexio_token', freshToken)
        setToken(freshToken)
      } catch (error) {
        console.warn('[AuthContext] Failed to capture rotated ID token:', error)
      }
    })

    return unsub
  }, [])

  // Proactively refresh the ID token on a regular cadence so the SDK never
  // serves Firestore a stale credential. Firebase Auth itself refreshes tokens
  // ~every 55 minutes, but doing it explicitly here also covers cases where
  // the tab was backgrounded for a long time and the next user action would
  // have raced against the lazy refresh.
  useEffect(() => {
    if (!IS_FIREBASE || !firebaseAuth) return
    if (!userId) return

    const intervalMs = 25 * 60 * 1000 // 25 minutes
    const intervalId = setInterval(() => {
      const current = firebaseAuth?.currentUser
      if (!current) return
      current.getIdToken(true).catch((error) => {
        console.warn('[AuthContext] Proactive token refresh failed:', error)
      })
    }, intervalMs)

    // Also refresh as soon as a tab regains focus after being backgrounded —
    // long idle periods are a common trigger for "Missing or insufficient
    // permissions" the moment the user returns and the page issues queries
    // before the SDK has had a chance to renew its credentials.
    const handleVisibility = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState !== 'visible') return
      const current = firebaseAuth?.currentUser
      if (!current) return
      current.getIdToken(true).catch(() => undefined)
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility)
    }

    return () => {
      clearInterval(intervalId)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility)
      }
    }
  }, [userId])

  const login = async (email: string, password: string) => {
    if (IS_FIREBASE) {
      try {
        const r = await firebaseLogin(email, password)
        persist(r.token, r.uid, r.role, r.full_name)
        setToken(r.token); setUserId(r.uid); setRole(r.role); setFullName(r.full_name)
      } catch (err: any) {
        throw new Error(translateFirebaseError(err.code ?? ''))
      }
    } else {
      const res  = await api.post('/auth/login', { email, password })
      const data = res.data
      const name = data.full_name ?? ''
      persist(data.access_token, data.user_id, data.role, name)
      setToken(data.access_token); setUserId(data.user_id); setRole(data.role); setFullName(name)
    }
  }

  const loginWithGoogle = async () => {
    try {
      const r = await firebaseGoogleLogin()
      persist(r.token, r.uid, r.role, r.full_name)
      setToken(r.token); setUserId(r.uid); setRole(r.role); setFullName(r.full_name)
    } catch (err: any) {
      throw new Error(translateFirebaseError(err.code ?? ''))
    }
  }

  const register = async (email: string, password: string, fullNameInput: string, _title?: string) => {
    if (IS_FIREBASE) {
      try {
        const r = await firebaseRegister(email, password, fullNameInput)
        persist(r.token, r.uid, r.role, r.full_name)
        setToken(r.token); setUserId(r.uid); setRole(r.role); setFullName(r.full_name)
      } catch (err: any) {
        throw new Error(translateFirebaseError(err.code ?? ''))
      }
    } else {
      const res  = await api.post('/auth/register', { email, password, full_name: fullNameInput })
      const data = res.data
      const name = data.full_name ?? fullNameInput
      persist(data.access_token, data.user_id, data.role, name)
      setToken(data.access_token); setUserId(data.user_id); setRole(data.role); setFullName(name)
    }
  }

  const logout = async () => {
    manualLogoutRef.current = true
    if (IS_FIREBASE) await firebaseLogout().catch(() => undefined)
    clearAuthState()
  }

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm animate-pulse">Verificando autenticação…</div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ token, userId, role, fullName, isReady, login, loginWithGoogle, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}

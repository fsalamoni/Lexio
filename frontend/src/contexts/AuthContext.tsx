import { createContext, useCallback, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { onAuthStateChanged, onIdTokenChanged, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { firebaseAuth, IS_FIREBASE } from '../lib/firebase'
import { firestore } from '../lib/firebase'
import { firebaseLogin, firebaseRegister, firebaseLogout, firebaseGoogleLogin, handleGoogleRedirectResult, translateFirebaseError } from '../lib/auth-service'
import api from '../api/client'

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

function readStored() {
  if (typeof window === 'undefined') return { token: null, userId: null, role: null, fullName: null }
  return {
    token: localStorage.getItem('lexio_token'),
    userId: localStorage.getItem('lexio_user_id'),
    role: localStorage.getItem('lexio_role'),
    fullName: localStorage.getItem('lexio_full_name'),
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initial = readStored()
  const [token,    setToken]    = useState<string | null>(initial.token)
  const [userId,   setUserId]   = useState<string | null>(initial.userId)
  const [role,     setRole]     = useState<string | null>(initial.role)
  const [fullName, setFullName] = useState<string | null>(initial.fullName)
  const [isReady,  setIsReady]  = useState(!IS_FIREBASE)
  const tokenRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Soft hydration of role/full_name from /users/{uid}. NEVER throws and
  // NEVER logs the user out on failure: a transient permission-denied (token
  // rotation, brief Auth/Firestore desync) is normal and must not destroy a
  // live session. The fallback to localStorage / Firebase displayName keeps
  // the UI usable; the next Firestore call will retry the read normally.
  const hydrateProfile = useCallback(async (fbUser: User) => {
    if (!firestore) return
    try {
      const snap = await getDoc(doc(firestore, 'users', fbUser.uid))
      if (snap.exists()) {
        const data = snap.data() as { role?: string; full_name?: string }
        const nextRole = data.role ?? 'user'
        const nextName = data.full_name ?? fbUser.displayName ?? localStorage.getItem('lexio_full_name') ?? ''
        localStorage.setItem('lexio_role', nextRole)
        localStorage.setItem('lexio_full_name', nextName)
        setRole(nextRole)
        setFullName(nextName)
        return
      }
      const nextName = fbUser.displayName ?? localStorage.getItem('lexio_full_name') ?? ''
      localStorage.setItem('lexio_role', 'user')
      localStorage.setItem('lexio_full_name', nextName)
      setRole('user')
      setFullName(nextName)
    } catch (error) {
      // Soft fallback: keep whatever we already had locally; don't touch session.
      const nextName = fbUser.displayName ?? localStorage.getItem('lexio_full_name') ?? ''
      if (!localStorage.getItem('lexio_role')) {
        localStorage.setItem('lexio_role', 'user')
      }
      localStorage.setItem('lexio_full_name', nextName)
      setRole((prev) => prev ?? 'user')
      setFullName((prev) => prev ?? nextName)
      console.warn('[AuthContext] Profile hydration deferred (non-fatal):', error)
    }
  }, [])

  // Single source of session truth: onAuthStateChanged.
  // If Firebase reports a user, we keep the session.
  // If Firebase reports no user (signed out, account disabled, refresh token
  // permanently invalid), we clear local state. NO other code path clears
  // the session — Firestore read failures, permission-denied, network blips,
  // none of these are allowed to log the user out.
  useEffect(() => {
    if (!IS_FIREBASE || !firebaseAuth) return

    handleGoogleRedirectResult().then((r) => {
      if (r) {
        persist(r.token, r.uid, r.role, r.full_name)
        setToken(r.token); setUserId(r.uid); setRole(r.role); setFullName(r.full_name)
      }
    }).catch(() => {})

    const unsub = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      try {
        if (fbUser) {
          let newToken: string | null = null
          try {
            newToken = await fbUser.getIdToken()
          } catch (error) {
            // Token mint failed transiently — keep the previous token; SDK
            // will retry on next operation. Don't logout here.
            console.warn('[AuthContext] Initial getIdToken failed; keeping previous session:', error)
          }
          if (newToken) {
            localStorage.setItem('lexio_token', newToken)
            setToken(newToken)
          }
          localStorage.setItem('lexio_user_id', fbUser.uid)
          setUserId(fbUser.uid)

          await hydrateProfile(fbUser)
        } else {
          clearStorage()
          setToken(null); setUserId(null); setRole(null); setFullName(null)
        }
      } finally {
        setIsReady(true)
      }
    })

    return unsub
  }, [hydrateProfile])

  // Mirror rotated ID tokens into localStorage so the rest of the app and
  // any reload pick up the freshest credential.
  useEffect(() => {
    if (!IS_FIREBASE || !firebaseAuth) return
    const unsub = onIdTokenChanged(firebaseAuth, async (fbUser) => {
      if (!fbUser) return
      try {
        const fresh = await fbUser.getIdToken()
        localStorage.setItem('lexio_token', fresh)
        setToken(fresh)
      } catch (error) {
        // Best-effort: never destroy the session here.
        console.warn('[AuthContext] Could not capture rotated ID token:', error)
      }
    })
    return unsub
  }, [])

  // Best-effort proactive refresh: nudge the SDK to renew the token every
  // 25 minutes and when the tab regains focus after long idle. Failures are
  // logged and ignored — the SDK has its own retry path.
  useEffect(() => {
    if (!IS_FIREBASE || !firebaseAuth) return
    if (!userId) return

    const refresh = () => {
      const current = firebaseAuth?.currentUser
      if (!current) return
      current.getIdToken(true).catch((error) => {
        console.warn('[AuthContext] Best-effort token refresh failed:', error)
      })
    }

    tokenRefreshTimerRef.current = setInterval(refresh, 25 * 60 * 1000)

    const onVisible = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState === 'visible') refresh()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible)
    }

    return () => {
      if (tokenRefreshTimerRef.current) {
        clearInterval(tokenRefreshTimerRef.current)
        tokenRefreshTimerRef.current = null
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible)
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
    if (IS_FIREBASE) await firebaseLogout().catch(() => undefined)
    clearStorage()
    setToken(null); setUserId(null); setRole(null); setFullName(null)
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

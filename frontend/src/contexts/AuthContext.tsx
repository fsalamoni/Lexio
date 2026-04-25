import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token,    setToken]    = useState<string | null>(localStorage.getItem('lexio_token'))
  const [userId,   setUserId]   = useState<string | null>(localStorage.getItem('lexio_user_id'))
  const [role,     setRole]     = useState<string | null>(localStorage.getItem('lexio_role'))
  const [fullName, setFullName] = useState<string | null>(localStorage.getItem('lexio_full_name'))
  // Demo mode is immediately ready; Firebase mode waits for onAuthStateChanged
  const [isReady,  setIsReady]  = useState(!IS_FIREBASE)

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
      if (fbUser) {
        const newToken = await fbUser.getIdToken()
        localStorage.setItem('lexio_token', newToken)
        localStorage.setItem('lexio_user_id', fbUser.uid)
        setToken(newToken)
        setUserId(fbUser.uid)

        if (firestore) {
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
          } catch {
            const nextName = fbUser.displayName ?? localStorage.getItem('lexio_full_name') ?? ''
            if (!localStorage.getItem('lexio_role')) {
              localStorage.setItem('lexio_role', 'user')
            }
            localStorage.setItem('lexio_full_name', nextName)
            setRole((prev) => prev ?? 'user')
            setFullName(nextName)
          }
        }
      } else {
        clearStorage()
        setToken(null); setUserId(null); setRole(null); setFullName(null)
      }
      setIsReady(true)
    })

    return unsub
  }, [])

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
    if (IS_FIREBASE) await firebaseLogout()
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

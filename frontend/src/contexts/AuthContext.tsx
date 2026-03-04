import { createContext, useContext, useState, ReactNode } from 'react'
import api, { DEMO_MODE } from '../api/client'
import { DEMO_USER } from '../api/mock'

interface AuthContextType {
  token: string | null
  userId: string | null
  role: string | null
  fullName: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName: string, title?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('lexio_token'))
  const [userId, setUserId] = useState<string | null>(localStorage.getItem('lexio_user_id'))
  const [role, setRole] = useState<string | null>(localStorage.getItem('lexio_role'))
  const [fullName, setFullName] = useState<string | null>(localStorage.getItem('lexio_full_name'))

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password })
    const data = res.data
    const accessToken = data.access_token
    const uid = data.user_id
    const userRole = data.role
    const name = data.full_name || null

    localStorage.setItem('lexio_token', accessToken)
    localStorage.setItem('lexio_user_id', uid)
    localStorage.setItem('lexio_role', userRole)
    if (name) localStorage.setItem('lexio_full_name', name)

    setToken(accessToken)
    setUserId(uid)
    setRole(userRole)
    setFullName(name)
  }

  const register = async (email: string, password: string, fullNameInput: string, title?: string) => {
    const res = await api.post('/auth/register', { email, password, full_name: fullNameInput, title })
    const data = res.data
    const accessToken = data.access_token
    const uid = data.user_id
    const userRole = data.role
    const name = data.full_name || fullNameInput

    localStorage.setItem('lexio_token', accessToken)
    localStorage.setItem('lexio_user_id', uid)
    localStorage.setItem('lexio_role', userRole)
    if (name) localStorage.setItem('lexio_full_name', name)

    setToken(accessToken)
    setUserId(uid)
    setRole(userRole)
    setFullName(name)
  }

  const logout = () => {
    localStorage.removeItem('lexio_token')
    localStorage.removeItem('lexio_user_id')
    localStorage.removeItem('lexio_role')
    localStorage.removeItem('lexio_full_name')
    setToken(null)
    setUserId(null)
    setRole(null)
    setFullName(null)
  }

  return (
    <AuthContext.Provider value={{ token, userId, role, fullName, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}

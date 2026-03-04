import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import api from '../api/client'

interface AuthContextType {
  token: string | null
  userId: string | null
  role: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName: string, title?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('lexio_token'))
  const [userId, setUserId] = useState<string | null>(localStorage.getItem('lexio_user_id'))
  const [role, setRole] = useState<string | null>(localStorage.getItem('lexio_role'))

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password })
    const { access_token, user_id, role: userRole } = res.data
    localStorage.setItem('lexio_token', access_token)
    localStorage.setItem('lexio_user_id', user_id)
    localStorage.setItem('lexio_role', userRole)
    setToken(access_token)
    setUserId(user_id)
    setRole(userRole)
  }

  const register = async (email: string, password: string, fullName: string, title?: string) => {
    const res = await api.post('/auth/register', { email, password, full_name: fullName, title })
    const { access_token, user_id, role: userRole } = res.data
    localStorage.setItem('lexio_token', access_token)
    localStorage.setItem('lexio_user_id', user_id)
    localStorage.setItem('lexio_role', userRole)
    setToken(access_token)
    setUserId(user_id)
    setRole(userRole)
  }

  const logout = () => {
    localStorage.removeItem('lexio_token')
    localStorage.removeItem('lexio_user_id')
    localStorage.removeItem('lexio_role')
    setToken(null)
    setUserId(null)
    setRole(null)
  }

  return (
    <AuthContext.Provider value={{ token, userId, role, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}

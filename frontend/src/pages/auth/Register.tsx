import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Scale, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0
  if (password.length >= 8) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1

  if (score <= 1) return { score, label: 'Fraca', color: 'bg-red-500' }
  if (score === 2) return { score, label: 'Média', color: 'bg-amber-500' }
  if (score === 3) return { score, label: 'Boa', color: 'bg-lime-500' }
  return { score, label: 'Forte', color: 'bg-emerald-600' }
}

function getAuthErrorMessage(err: any): string {
  const raw = String(err?.message || err?.response?.data?.detail || '')
  const msg = raw.toLowerCase()
  if (msg.includes('email-already-in-use')) return 'Este email já está em uso.'
  if (msg.includes('invalid-email')) return 'Email inválido.'
  if (msg.includes('weak-password')) return 'Use uma senha mais forte para continuar.'
  if (msg.includes('network')) return 'Falha de conexão. Verifique sua internet e tente novamente.'
  return raw || 'Erro ao cadastrar'
}

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [fullName, setFullName] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()
  const trimmedEmail = email.trim()
  const trimmedName = fullName.trim()
  const isEmailValid = !trimmedEmail || EMAIL_REGEX.test(trimmedEmail)
  const passwordStrength = getPasswordStrength(password)
  const hasMinLength = password.length >= 8
  const hasMixedCase = /[A-Z]/.test(password) && /[a-z]/.test(password)
  const hasNumber = /\d/.test(password)
  const canSubmit = !loading && Boolean(trimmedName) && Boolean(trimmedEmail) && isEmailValid && hasMinLength

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!trimmedName) {
      setError('Informe seu nome completo.')
      return
    }
    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setError('Informe um email válido para continuar.')
      return
    }
    if (!hasMinLength) {
      setError('A senha deve conter ao menos 8 caracteres.')
      return
    }
    setLoading(true)
    try {
      await register(trimmedEmail, password, trimmedName, title.trim() || undefined)
      navigate('/')
    } catch (err: any) {
      setError(getAuthErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Scale className="w-12 h-12 text-teal-600 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-teal-900">Lexio</h1>
          <p className="text-gray-500 mt-1">Crie sua conta</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-8 space-y-4" autoComplete="on">
          <h2 className="text-xl font-semibold text-center mb-4">Cadastro</h2>
          {error && <p className="text-red-600 text-sm text-center">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
            <input
              type="text"
              name="name"
              autoComplete="name"
              inputMode="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              required
            />
            {!isEmailValid && <p className="text-xs text-red-600 mt-1">Digite um email válido.</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                name="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded-lg px-4 py-2 pr-10 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Força da senha: <span className="font-semibold">{passwordStrength.label}</span></p>
            <div className="mt-1 grid grid-cols-4 gap-1" aria-hidden="true">
              {[0, 1, 2, 3].map(i => (
                <span
                  key={i}
                  className={`h-1 rounded ${i < passwordStrength.score ? passwordStrength.color : 'bg-gray-200'}`}
                />
              ))}
            </div>
            <ul className="text-xs text-gray-500 mt-2 space-y-1">
              <li className={hasMinLength ? 'text-emerald-700' : ''}>Mínimo de 8 caracteres</li>
              <li className={hasMixedCase ? 'text-emerald-700' : ''}>Letras maiúsculas e minúsculas</li>
              <li className={hasNumber ? 'text-emerald-700' : ''}>Pelo menos um número</li>
            </ul>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cargo (opcional)</label>
            <input
              type="text"
              name="organization-title"
              autoComplete="organization-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Promotor de Justiça"
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Cadastrando...' : 'Cadastrar'}
          </button>
          <p className="text-center text-sm text-gray-500">
            Já tem conta?{' '}
            <Link to="/login" className="text-teal-600 hover:underline">Entrar</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

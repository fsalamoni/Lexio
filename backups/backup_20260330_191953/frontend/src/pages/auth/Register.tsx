import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Scale, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(email, password, fullName, title || undefined)
      navigate('/')
    } catch (err: any) {
      setError(err.message || err.response?.data?.detail || 'Erro ao cadastrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Scale className="w-12 h-12 text-brand-600 mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-brand-900">Lexio</h1>
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
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              required
            />
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
                className="w-full border rounded-lg px-4 py-2 pr-10 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
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
            <p className="text-xs text-gray-400 mt-1">Mínimo de 8 caracteres</p>
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
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 text-white py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium"
          >
            {loading ? 'Cadastrando...' : 'Cadastrar'}
          </button>
          <p className="text-center text-sm text-gray-500">
            Já tem conta?{' '}
            <Link to="/login" className="text-brand-600 hover:underline">Entrar</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

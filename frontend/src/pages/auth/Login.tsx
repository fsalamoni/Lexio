import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Scale, Zap } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { DEMO_MODE } from '../../api/client'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async () => {
    setError('')
    setLoading(true)
    try {
      await login('demo@lexio.app', 'demo')
      navigate('/')
    } catch (err: any) {
      setError('Erro ao entrar no modo demonstração')
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
          <p className="text-gray-500 mt-1">Produção Jurídica com IA</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-8 space-y-4">
          <h2 className="text-xl font-semibold text-center mb-4">Entrar</h2>
          {error && <p className="text-red-600 text-sm text-center">{error}</p>}

          {DEMO_MODE && (
            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand-50 text-brand-700 border-2 border-brand-200 py-3 rounded-lg hover:bg-brand-100 disabled:opacity-50 font-medium transition-colors"
            >
              <Zap className="w-4 h-4" />
              Entrar no Modo Demonstração
            </button>
          )}

          {DEMO_MODE && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-400">ou entre com suas credenciais</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              required={!DEMO_MODE}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              required={!DEMO_MODE}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 text-white py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          <p className="text-center text-sm text-gray-500">
            Não tem conta?{' '}
            <Link to="/register" className="text-brand-600 hover:underline">Cadastre-se</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

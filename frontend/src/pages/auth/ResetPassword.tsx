import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Scale, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'
import api from '../../api/client'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenEmail, setTokenEmail] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setValidating(false)
      return
    }
    api.get(`/auth/validate-reset-token/${token}`)
      .then(res => {
        setTokenValid(res.data?.valid === true)
        setTokenEmail(res.data?.email || '')
      })
      .catch(() => setTokenValid(false))
      .finally(() => setValidating(false))
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('As senhas não coincidem')
      return
    }
    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, new_password: password })
      setDone(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao redefinir senha')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Scale className="w-12 h-12 text-teal-600 mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-teal-900">Lexio</h1>
          <p className="text-gray-500 mt-1">Produção Jurídica com IA</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-8 space-y-4">
          <h2 className="text-xl font-semibold">Redefinir senha</h2>

          {validating ? (
            <p className="text-sm text-gray-500 text-center py-4">Verificando token...</p>
          ) : done ? (
            <div className="text-center space-y-3 py-2">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <p className="font-medium text-gray-800">Senha redefinida com sucesso!</p>
              <p className="text-sm text-gray-500">Redirecionando para o login...</p>
            </div>
          ) : !tokenValid || !token ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800">Link inválido ou expirado</p>
                  <p className="text-xs text-red-600 mt-1">
                    Este link de redefinição de senha expirou ou já foi utilizado.
                  </p>
                </div>
              </div>
              <Link
                to="/forgot-password"
                className="block text-center text-sm text-teal-600 hover:underline"
              >
                Solicitar novo link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {tokenEmail && (
                <p className="text-sm text-gray-500">
                  Redefinindo senha para <strong>{tokenEmail}</strong>
                </p>
              )}

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full border rounded-lg px-4 py-2 pr-10 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    required
                    minLength={8}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 disabled:opacity-50 font-semibold text-sm transition-colors"
              >
                {loading ? 'Redefinindo...' : 'Redefinir senha'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

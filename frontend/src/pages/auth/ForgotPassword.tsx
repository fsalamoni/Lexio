import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Scale, ArrowLeft, Mail } from 'lucide-react'
import api from '../../api/client'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [devToken, setDevToken] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/forgot-password', { email })
      setSent(true)
      if (res.data?.dev_reset_token) {
        setDevToken(res.data.dev_reset_token)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao processar solicitação')
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
          <p className="text-gray-500 mt-1">Produção Jurídica com IA</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-8 space-y-4">
          <Link to="/login" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft className="w-4 h-4" /> Voltar ao login
          </Link>

          <h2 className="text-xl font-semibold">Esqueci minha senha</h2>

          {sent ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <Mail className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-green-800">
                  Se o email estiver cadastrado, você receberá as instruções de redefinição em breve.
                </p>
              </div>

              {devToken && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                  <p className="text-xs font-semibold text-amber-800">
                    Modo desenvolvimento — link de redefinição:
                  </p>
                  <Link
                    to={`/reset-password?token=${devToken}`}
                    className="block text-xs text-teal-600 hover:underline break-all font-mono"
                  >
                    /reset-password?token={devToken}
                  </Link>
                </div>
              )}

              <Link
                to="/login"
                className="block text-center text-sm text-teal-600 hover:underline"
              >
                Voltar ao login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-500">
                Digite seu email de cadastro e enviaremos um link para redefinir sua senha.
              </p>

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-teal-600 text-white py-2.5 rounded-lg hover:bg-teal-700 disabled:opacity-50 font-semibold text-sm transition-colors"
              >
                {loading ? 'Enviando...' : 'Enviar link de redefinição'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

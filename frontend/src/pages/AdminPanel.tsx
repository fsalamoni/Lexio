import { useEffect, useState } from 'react'
import { Shield, CheckCircle, XCircle, Activity, Server, Database, Brain, Search } from 'lucide-react'
import api from '../api/client'

interface ModuleInfo {
  id: string
  name: string
  type: string
  version: string
  is_enabled: boolean
  is_healthy: boolean
  error: string | null
  description: string
}

interface HealthData {
  status: string
  app: string
  version: string
  services: Record<string, string>
  modules: { total: number; healthy: number }
}

const serviceIcons: Record<string, typeof Server> = {
  postgres: Database,
  qdrant: Database,
  ollama: Brain,
  searxng: Search,
}

export default function AdminPanel() {
  const [modules, setModules] = useState<ModuleInfo[]>([])
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/admin/modules').then(res => setModules(res.data)),
      api.get('/health').then(res => setHealth(res.data)),
    ]).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-gray-500">Carregando painel admin...</p>

  const docTypes = modules.filter(m => m.type === 'document_type')
  const legalAreas = modules.filter(m => m.type === 'legal_area')

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-8 h-8 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Painel Administrativo</h1>
          <p className="text-gray-500">Monitoramento de módulos e serviços</p>
        </div>
      </div>

      {/* System Health */}
      {health && (
        <div className="bg-white rounded-xl border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-600" />
            Saúde do Sistema
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(health.services).map(([name, status]) => {
              const Icon = serviceIcons[name] || Server
              const isOk = status === 'ok'
              return (
                <div key={name} className={`rounded-lg border p-4 ${isOk ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${isOk ? 'text-green-600' : 'text-red-600'}`} />
                    <span className="text-sm font-medium capitalize">{name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {isOk ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className={`text-xs ${isOk ? 'text-green-700' : 'text-red-700'}`}>
                      {isOk ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
            <span>App: <strong>{health.app} v{health.version}</strong></span>
            <span>Módulos: <strong>{health.modules.healthy}/{health.modules.total}</strong> saudáveis</span>
          </div>
        </div>
      )}

      {/* Document Type Modules */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Tipos de Documento</h2>
        <div className="space-y-3">
          {docTypes.map(m => (
            <div key={m.id} className="flex items-center justify-between p-4 rounded-lg border hover:bg-gray-50">
              <div className="flex items-center gap-3">
                {m.is_healthy ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                <div>
                  <p className="font-medium text-gray-900">{m.name}</p>
                  <p className="text-sm text-gray-500">{m.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">v{m.version}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  m.is_enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {m.is_enabled ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legal Area Modules */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-4">Áreas do Direito</h2>
        <div className="space-y-3">
          {legalAreas.map(m => (
            <div key={m.id} className="flex items-center justify-between p-4 rounded-lg border hover:bg-gray-50">
              <div className="flex items-center gap-3">
                {m.is_healthy ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                <div>
                  <p className="font-medium text-gray-900">{m.name}</p>
                  <p className="text-sm text-gray-500">{m.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">v{m.version}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  m.is_enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {m.is_enabled ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

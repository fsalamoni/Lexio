import { useEffect, useState } from 'react'
import {
  Shield, CheckCircle, XCircle, Activity, Server, Database, Brain, Search,
  BarChart3, DollarSign, FileText, TrendingUp, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
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

interface StatsData {
  total_documents: number
  completed_documents: number
  processing_documents: number
  average_quality_score: number | null
  total_cost_usd: number
}

const serviceIcons: Record<string, typeof Server> = {
  postgres: Database,
  qdrant: Database,
  ollama: Brain,
  searxng: Search,
}

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']

export default function AdminPanel() {
  const [modules, setModules] = useState<ModuleInfo[]>([])
  const [health, setHealth] = useState<HealthData | null>(null)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  const fetchData = () => {
    Promise.all([
      api.get('/admin/modules').then(res => setModules(res.data)).catch(() => {}),
      api.get('/health').then(res => setHealth(res.data)).catch(() => {}),
      api.get('/stats').then(res => setStats(res.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const handleToggle = async (moduleId: string) => {
    setToggling(moduleId)
    try {
      const res = await api.post(`/admin/modules/${moduleId}/toggle`)
      setModules(prev =>
        prev.map(m => m.id === moduleId ? { ...m, is_enabled: res.data.is_enabled } : m)
      )
    } catch {}
    setToggling(null)
  }

  if (loading) return <p className="text-gray-500">Carregando painel admin...</p>

  const docTypes = modules.filter(m => m.type === 'document_type')
  const legalAreas = modules.filter(m => m.type === 'legal_area')
  const features = modules.filter(m => m.type === 'feature')
  const healthyModules = modules.filter(m => m.is_healthy).length

  const moduleTypePieData = [
    { name: 'Tipos Documento', value: docTypes.length },
    { name: 'Áreas Direito', value: legalAreas.length },
    { name: 'Features', value: features.length },
  ].filter(d => d.value > 0)

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-8 h-8 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Painel Administrativo</h1>
          <p className="text-gray-500">Monitoramento de módulos, serviços e métricas</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-brand-600" />
            <span className="text-xs text-gray-500">Documentos</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats?.total_documents || 0}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-xs text-gray-500">Concluídos</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats?.completed_documents || 0}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-brand-600" />
            <span className="text-xs text-gray-500">Score Médio</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {stats?.average_quality_score ? `${stats.average_quality_score}` : '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-amber-600" />
            <span className="text-xs text-gray-500">Custo Total</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            ${stats?.total_cost_usd?.toFixed(2) || '0.00'}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-purple-600" />
            <span className="text-xs text-gray-500">Módulos</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{healthyModules}/{modules.length}</p>
        </div>
      </div>

      {/* System Health + Module Pie */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {health && (
          <div className="bg-white rounded-xl border p-6 md:col-span-2">
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
                      {isOk ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
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

        {moduleTypePieData.length > 0 && (
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold mb-4">Módulos por Tipo</h2>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={moduleTypePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {moduleTypePieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {moduleTypePieData.map((d, i) => (
                <span key={d.name} className="flex items-center gap-1 text-xs text-gray-600">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                  {d.name} ({d.value})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Document Type Modules */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Tipos de Documento ({docTypes.length})</h2>
        <div className="space-y-3">
          {docTypes.map(m => (
            <ModuleRow key={m.id} module={m} onToggle={handleToggle} toggling={toggling} />
          ))}
        </div>
      </div>

      {/* Legal Area Modules */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Áreas do Direito ({legalAreas.length})</h2>
        <div className="space-y-3">
          {legalAreas.map(m => (
            <ModuleRow key={m.id} module={m} onToggle={handleToggle} toggling={toggling} />
          ))}
        </div>
      </div>

      {/* Feature Modules */}
      {features.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-4">Módulos Funcionais ({features.length})</h2>
          <div className="space-y-3">
            {features.map(m => (
              <ModuleRow key={m.id} module={m} onToggle={handleToggle} toggling={toggling} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ModuleRow({
  module: m,
  onToggle,
  toggling,
}: {
  module: ModuleInfo
  onToggle: (id: string) => void
  toggling: string | null
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-gray-50">
      <div className="flex items-center gap-3">
        {m.is_healthy ? (
          <CheckCircle className="w-5 h-5 text-green-500" />
        ) : (
          <XCircle className="w-5 h-5 text-red-500" />
        )}
        <div>
          <p className="font-medium text-gray-900">{m.name}</p>
          <p className="text-sm text-gray-500">{m.description}</p>
          {m.error && <p className="text-xs text-red-500 mt-1">{m.error}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400">v{m.version}</span>
        <button
          onClick={() => onToggle(m.id)}
          disabled={toggling === m.id}
          className="transition-colors"
          title={m.is_enabled ? 'Desativar' : 'Ativar'}
        >
          {m.is_enabled ? (
            <ToggleRight className="w-6 h-6 text-green-600" />
          ) : (
            <ToggleLeft className="w-6 h-6 text-gray-400" />
          )}
        </button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import {
  Shield, CheckCircle, XCircle, Activity, Server, Database, Brain, Search,
  BarChart3, DollarSign, FileText, TrendingUp, ToggleLeft, ToggleRight,
  Key, Eye, EyeOff, Save, ExternalLink, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, BookOpen, Zap,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../api/client'
import { loadApiKeys, saveApiKeys, type ApiKeyEntry } from '../lib/settings-store'
import { useToast } from '../components/Toast'

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

// ApiKeyDef is now imported as ApiKeyEntry from settings-store

const serviceIcons: Record<string, typeof Server> = {
  postgres: Database,
  qdrant: Database,
  ollama: Brain,
  searxng: Search,
}

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']

// ── API Keys Card ─────────────────────────────────────────────────────────────

function ApiKeysCard() {
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([])
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSettings = async () => {
    try {
      const entries = await loadApiKeys()
      setApiKeys(entries)
    } catch {
      setError('Não foi possível carregar as configurações.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSettings() }, [])

  const handleSave = async () => {
    const updates: Record<string, string> = {}
    for (const [k, v] of Object.entries(edits)) {
      if (v !== undefined && v !== '') updates[k] = v
    }
    if (Object.keys(updates).length === 0) return

    setSaving(true)
    setError(null)
    try {
      await saveApiKeys(updates)
      setSaved(true)
      setEdits({})
      await fetchSettings()
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar configurações.')
    } finally {
      setSaving(false)
    }
  }

  const hasPendingChanges = Object.values(edits).some(v => v !== '')

  if (loading) return (
    <div className="bg-white rounded-xl border p-6 mb-6">
      <p className="text-gray-400 text-sm">Carregando configurações...</p>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Key className="w-5 h-5 text-brand-600" />
          Chaves de API
        </h2>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
              <CheckCircle2 className="w-4 h-4" /> Salvo com sucesso
            </span>
          )}
          {error && (
            <span className="flex items-center gap-1 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" /> {error}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!hasPendingChanges || saving}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        As chaves inseridas aqui são <strong>persistidas no banco de dados</strong> e aplicadas
        imediatamente — sem necessidade de reiniciar o servidor. Apenas administradores têm acesso.
      </p>

      <div className="space-y-4">
        {apiKeys.map((def) => {
          const isEditing = edits[def.key] !== undefined
          const currentValue = isEditing ? edits[def.key] : ''
          const isShown = visible[def.key]
          const isExpanded = expanded[def.key]
          const hasGuide = def.guide && def.guide.length > 0

          return (
            <div
              key={def.key}
              className={`border rounded-xl overflow-hidden transition-all ${
                def.is_set ? 'border-gray-200' : 'border-amber-200 bg-amber-50/30'
              }`}
            >
              {/* Row header */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{def.label}</span>
                      {def.is_auto && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                          <Zap className="w-3 h-3" /> pré-configurado
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        def.is_set
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {def.is_set ? `✓ configurado · ${def.source}` : '⚠ não configurado'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{def.description}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={def.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-600 hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Site
                    </a>
                    {hasGuide && (
                      <button
                        onClick={() => setExpanded(prev => ({ ...prev, [def.key]: !prev[def.key] }))}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border rounded px-2 py-1"
                      >
                        <BookOpen className="w-3 h-3" />
                        {isExpanded ? 'Fechar guia' : 'Como configurar'}
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Masked value display */}
                {def.is_set && !isEditing && (
                  <div className="mt-2">
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-600">
                      {def.masked_value}
                    </code>
                  </div>
                )}

                {/* Edit field */}
                <div className="flex gap-2 mt-3">
                  <div className="relative flex-1">
                    <input
                      type={isShown ? 'text' : 'password'}
                      value={currentValue}
                      onChange={(e) => setEdits(prev => ({ ...prev, [def.key]: e.target.value }))}
                      placeholder={def.is_set ? 'Nova chave (deixe vazio para manter a atual)' : def.placeholder}
                      className="w-full text-sm border rounded-lg px-3 py-2 pr-10 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                      onFocus={() => !isEditing && setEdits(prev => ({ ...prev, [def.key]: '' }))}
                      onBlur={() => {
                        if (isEditing && edits[def.key] === '') {
                          setEdits(prev => { const n = { ...prev }; delete n[def.key]; return n })
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setVisible(prev => ({ ...prev, [def.key]: !prev[def.key] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {isShown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {isEditing && edits[def.key] !== '' && (
                    <button
                      onClick={() => setEdits(prev => { const n = { ...prev }; delete n[def.key]; return n })}
                      className="text-xs text-gray-500 hover:text-gray-700 border rounded-lg px-3"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>

              {/* Step-by-step guide (expandable) */}
              {hasGuide && isExpanded && (
                <div className="border-t bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    Guia de configuração — {def.label}
                  </p>
                  <ol className="space-y-2">
                    {def.guide.map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm text-gray-700">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  {!def.is_set && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                      ⚠ Esta chave ainda não está configurada. Siga os passos acima e cole a chave no campo de edição.
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Admin Panel ──────────────────────────────────────────────────────────

export default function AdminPanel() {
  const [modules, setModules] = useState<ModuleInfo[]>([])
  const [health, setHealth] = useState<HealthData | null>(null)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const toast = useToast()

  const fetchData = () => {
    Promise.all([
      api.get('/admin/modules').then(res => setModules(Array.isArray(res.data) ? res.data : [])).catch(() => toast.error('Erro ao carregar módulos')),
      api.get('/health').then(res => { if (res.data && typeof res.data === 'object') setHealth(res.data) }).catch(() => toast.error('Erro ao verificar saúde do sistema')),
      api.get('/stats').then(res => { if (res.data && typeof res.data === 'object') setStats(res.data) }).catch(() => toast.error('Erro ao carregar estatísticas')),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async (moduleId: string) => {
    setToggling(moduleId)
    try {
      const res = await api.post(`/admin/modules/${moduleId}/toggle`)
      setModules(prev =>
        prev.map(m => m.id === moduleId ? { ...m, is_enabled: res.data.is_enabled } : m)
      )
      toast.success(res.data.is_enabled ? 'Módulo ativado' : 'Módulo desativado')
    } catch {
      toast.error('Erro ao alterar estado do módulo')
    }
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
          <p className="text-gray-500">Configurações, módulos, serviços e métricas</p>
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

      {/* API Keys */}
      <ApiKeysCard />

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
                <Pie data={moduleTypePieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={5} dataKey="value">
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

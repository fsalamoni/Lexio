import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Shield, CheckCircle, XCircle, Activity, Server, Database, Brain, Search,
  BarChart3, DollarSign, FileText, TrendingUp, ToggleLeft, ToggleRight,
  Key, Eye, EyeOff, Save, ExternalLink, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, BookOpen, Zap, Clock, ThumbsUp, ThumbsDown, Users, Terminal, RefreshCw,
  Plus, Pencil, Trash2, X, Scale, Tags, Video, Headphones, Presentation,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../api/client'
import { loadApiKeys, saveApiKeys, type ApiKeyEntry } from '../lib/settings-store'
import { useToast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { DOCTYPE_LABELS } from '../lib/constants'
import { IS_FIREBASE } from '../lib/firebase'
import { getStats as firestoreGetStats,
  listDocuments, updateDocument,
  loadAdminDocumentTypes, saveAdminDocumentTypes,
  loadAdminLegalAreas, saveAdminLegalAreas,
  loadAdminClassificationTipos, saveAdminClassificationTipos,
  DEFAULT_DOC_STRUCTURES,
  type AdminDocumentType, type AdminLegalArea,
} from '../lib/firestore-service'
import { NATUREZA_OPTIONS } from '../lib/generation-service'
import { useAuth } from '../contexts/AuthContext'
import ModelConfigCard from '../components/ModelConfigCard'
import ThesisAnalystConfigCard from '../components/ThesisAnalystConfigCard'
import ContextDetailConfigCard from '../components/ContextDetailConfigCard'
import AcervoClassificadorConfigCard from '../components/AcervoClassificadorConfigCard'
import AcervoEmentaConfigCard from '../components/AcervoEmentaConfigCard'
import ResearchNotebookConfigCard from '../components/ResearchNotebookConfigCard'
import NotebookAcervoConfigCard from '../components/NotebookAcervoConfigCard'
import VideoPipelineConfigCard from '../components/VideoPipelineConfigCard'
import AudioPipelineConfigCard from '../components/AudioPipelineConfigCard'
import PresentationPipelineConfigCard from '../components/PresentationPipelineConfigCard'
import ModelCatalogCard from '../components/ModelCatalogCard'
import ConfirmDialog from '../components/ConfirmDialog'
import { V2MetricGrid, V2PageHero } from '../components/v2/V2PagePrimitives'
import { buildWorkspaceDocumentDetailPath } from '../lib/workspace-routes'

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
  pending_review_documents: number
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
const ADMIN_INSET_CARD = 'rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.68)]'
const ADMIN_INPUT = 'w-full mt-1 rounded-[1rem] border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-3 py-2 text-sm text-[var(--v2-ink-strong)] outline-none focus:border-[rgba(15,118,110,0.34)] focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]'
const ADMIN_INPUT_MONO = 'w-full mt-1 rounded-[1rem] border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-3 py-2 font-mono text-sm text-[var(--v2-ink-strong)] outline-none focus:border-[rgba(15,118,110,0.34)] focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]'
const ADMIN_SECONDARY_BUTTON = 'rounded-lg border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-4 py-2 text-sm text-[var(--v2-ink-soft)] hover:bg-[rgba(255,255,255,0.82)]'
const ADMIN_ICON_BUTTON = 'rounded-lg p-1.5 text-[var(--v2-ink-faint)] transition-colors hover:bg-[rgba(15,118,110,0.08)] hover:text-[var(--v2-ink-strong)]'
const ADMIN_DASHED_BUTTON = 'w-full flex items-center justify-center gap-2 rounded-[1.1rem] border-2 border-dashed border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.48)] p-3 text-sm text-[var(--v2-ink-soft)] transition-colors hover:border-[rgba(15,118,110,0.28)] hover:text-[var(--v2-ink-strong)]'

// ── Collapse state persistence ───────────────────────────────────────────────

const ADMIN_COLLAPSE_KEY = 'lexio_admin_collapse_state'

function loadAdminCollapseState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(ADMIN_COLLAPSE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveAdminCollapseState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(ADMIN_COLLAPSE_KEY, JSON.stringify(state))
  } catch { /* non-critical */ }
}

// ── Collapsible Section wrapper ──────────────────────────────────────────────

function AdminCollapsibleSection({
  id,
  title,
  icon: Icon,
  iconColor,
  badge,
  children,
  collapseState,
  onToggle,
  defaultOpen = true,
}: {
  id: string
  title: string
  icon: React.ElementType
  iconColor?: string
  badge?: string | number
  children: React.ReactNode
  collapseState: Record<string, boolean>
  onToggle: (id: string) => void
  defaultOpen?: boolean
}) {
  const isOpen = collapseState[id] ?? defaultOpen
  return (
    <div className="v2-panel mb-6 overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-[rgba(255,255,255,0.58)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${iconColor || 'text-brand-600'}`} />
          <h2 className="text-lg font-semibold text-[var(--v2-ink-strong)]">{title}</h2>
          {badge != null && (
            <span className="ml-1 rounded-full bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-xs font-medium text-[var(--v2-ink-soft)]">{badge}</span>
          )}
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-[var(--v2-ink-faint)]" /> : <ChevronDown className="w-4 h-4 text-[var(--v2-ink-faint)]" />}
      </button>
      {isOpen && <div className="px-6 pb-6">{children}</div>}
    </div>
  )
}

/** Generate a normalized slug ID from a display name. */
function generateSlugId(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

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
    <div className="rounded-[1.25rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.68)] px-4 py-4">
      <p className="text-sm text-[var(--v2-ink-faint)]">Carregando configurações...</p>
    </div>
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void handleSave()
      }}
    >
      {/* Save button bar */}
      <div className="flex items-center justify-end gap-3 mb-4">
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
          type="submit"
          disabled={!hasPendingChanges || saving}
          className="v2-btn-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>

      <p className="mb-6 text-sm text-[var(--v2-ink-soft)]">
        As chaves inseridas aqui são <strong>persistidas no seu perfil</strong> e aplicadas
        imediatamente às suas execuções, sem afetar outros usuários.
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
              className={`overflow-hidden rounded-[1.35rem] border transition-all ${
                def.is_set
                  ? 'border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)]'
                  : 'border-amber-200 bg-[rgba(245,158,11,0.08)]'
              }`}
            >
              {/* Row header */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[var(--v2-ink-strong)]">{def.label}</span>
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
                    <p className="mt-0.5 text-xs text-[var(--v2-ink-soft)]">{def.description}</p>
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
                          type="button"
                          onClick={() => setExpanded(prev => ({ ...prev, [def.key]: !prev[def.key] }))}
                          className="flex items-center gap-1 rounded-lg border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-2 py-1 text-xs text-[var(--v2-ink-soft)] hover:text-[var(--v2-ink-strong)]"
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
                    <code className="rounded bg-[rgba(15,23,42,0.06)] px-2 py-1 font-mono text-xs text-[var(--v2-ink-soft)]">
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
                      autoComplete="new-password"
                      className="w-full rounded-[1.05rem] border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-3 py-2 pr-10 font-mono text-sm text-[var(--v2-ink-strong)] outline-none focus:border-[rgba(15,118,110,0.34)] focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]"
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--v2-ink-faint)] hover:text-[var(--v2-ink-strong)]"
                    >
                      {isShown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {isEditing && edits[def.key] !== '' && (
                      <button
                        type="button"
                        onClick={() => setEdits(prev => { const n = { ...prev }; delete n[def.key]; return n })}
                        className="rounded-lg border border-[var(--v2-line-soft)] px-3 text-xs text-[var(--v2-ink-soft)] hover:text-[var(--v2-ink-strong)]"
                      >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>

              {/* Step-by-step guide (expandable) */}
              {hasGuide && isExpanded && (
                <div className="border-t border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.62)] p-4">
                  <p className="mb-3 flex items-center gap-1 text-xs font-semibold text-[var(--v2-ink-strong)]">
                    <BookOpen className="w-3 h-3" />
                    Guia de configuração — {def.label}
                  </p>
                  <ol className="space-y-2">
                    {def.guide.map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm text-[var(--v2-ink-strong)]">
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
    </form>
  )
}

// ── Review Queue ──────────────────────────────────────────────────────────────

interface ReviewDoc {
  id: string
  document_type_id: string
  tema: string | null
  original_request: string
  created_at: string
  quality_score: number | null
}

function ReviewQueue() {
  const [docs, setDocs] = useState<ReviewDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)
  const [rejectForm, setRejectForm] = useState<{ id: string; reason: string } | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const { userId } = useAuth()

  const fetchQueue = () => {
    if (IS_FIREBASE) {
      if (!userId) { setLoading(false); return }
      listDocuments(userId, { status: 'em_revisao' })
        .then(result => setDocs(result.items.filter(d => d.id).map(d => ({
          id: d.id!, document_type_id: d.document_type_id,
          tema: d.tema ?? null, original_request: d.original_request,
          created_at: d.created_at, quality_score: d.quality_score ?? null,
        }))))
        .catch(() => toast.error('Erro ao carregar fila de revisão'))
        .finally(() => setLoading(false))
    } else {
      api.get('/documents', { params: { status: 'em_revisao', limit: 20 } })
        .then(res => setDocs(res.data?.items || []))
        .catch(() => toast.error('Erro ao carregar fila de revisão'))
        .finally(() => setLoading(false))
    }
  }

  useEffect(() => { fetchQueue() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async (docId: string, action: 'approve' | 'reject', reason?: string) => {
    setActioning(docId)
    try {
      if (IS_FIREBASE && userId) {
        const newStatus = action === 'approve' ? 'aprovado' : 'rejeitado'
        await updateDocument(userId, docId, { status: newStatus } as any)
        toast.success(action === 'approve' ? 'Documento aprovado' : 'Documento rejeitado')
        if (action === 'reject') setRejectForm(null)
      } else {
        if (action === 'approve') {
          await api.post(`/documents/${docId}/approve`)
          toast.success('Documento aprovado')
        } else {
          await api.post(`/documents/${docId}/reject`, { reason: reason || '' })
          toast.success('Documento rejeitado')
          setRejectForm(null)
        }
      }
      setDocs(prev => prev.filter(d => d.id !== docId))
    } catch (err: any) {
      toast.error('Erro ao processar revisão', err?.response?.data?.detail)
    } finally {
      setActioning(null)
    }
  }

  if (loading) return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-16 rounded-lg" />
      <Skeleton className="h-16 rounded-lg" />
    </div>
  )

  return (
    <div>
      {docs.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--v2-ink-faint)]">Nenhum documento aguardando revisão.</p>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => (
            <div key={doc.id} className="overflow-hidden rounded-[1.25rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)]">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-[var(--v2-ink-strong)]">
                      {DOCTYPE_LABELS[doc.document_type_id] || doc.document_type_id}
                      {doc.tema && <span className="font-normal text-[var(--v2-ink-soft)]"> — {doc.tema}</span>}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[var(--v2-ink-faint)]">{doc.original_request}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-[var(--v2-ink-faint)]">
                        {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                      </span>
                      {doc.quality_score != null && (
                        <span className={`text-xs font-medium ${
                          doc.quality_score >= 80 ? 'text-green-600' : doc.quality_score >= 60 ? 'text-yellow-600' : 'text-red-600'
                        }`}>Score: {doc.quality_score}/100</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => navigate(buildWorkspaceDocumentDetailPath(doc.id, { preserveSearch: location.search }))}
                      className="rounded-lg border border-[var(--v2-line-soft)] px-3 py-1.5 text-xs text-[var(--v2-ink-soft)] hover:text-[var(--v2-ink-strong)]"
                    >
                      Ver
                    </button>
                    <button
                      onClick={() => handleAction(doc.id, 'approve')}
                      disabled={actioning === doc.id}
                      className="inline-flex items-center gap-1 bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      Aprovar
                    </button>
                    <button
                      onClick={() => setRejectForm({ id: doc.id, reason: '' })}
                      disabled={actioning === doc.id}
                      className="inline-flex items-center gap-1 bg-orange-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-orange-600 disabled:opacity-50"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      Rejeitar
                    </button>
                  </div>
                </div>

                {/* Reject form inline */}
                {rejectForm?.id === doc.id && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={rejectForm.reason}
                      onChange={e => setRejectForm(f => f ? { ...f, reason: e.target.value } : null)}
                      placeholder="Motivo da rejeição (opcional)..."
                      rows={2}
                      className="w-full resize-none rounded-[1.05rem] border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-3 py-2 text-sm text-[var(--v2-ink-strong)] outline-none focus:border-orange-300 focus:ring-4 focus:ring-[rgba(249,115,22,0.12)]"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(doc.id, 'reject', rejectForm.reason)}
                        disabled={actioning === doc.id}
                        className="bg-orange-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-orange-600 disabled:opacity-50"
                      >
                        Confirmar Rejeição
                      </button>
                      <button
                        onClick={() => setRejectForm(null)}
                        className="rounded-lg border border-[var(--v2-line-soft)] px-3 py-1.5 text-xs text-[var(--v2-ink-soft)] hover:bg-[rgba(255,255,255,0.78)]"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Reindex Card ──────────────────────────────────────────────────────────────

interface ReindexResult {
  indexed_documents: number
  total_documents: number
  total_chunks: number
  errors: number
  message: string
}

function ReindexCard() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReindexResult | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const toast = useToast()

  const handleReindex = async () => {
    setShowConfirm(true)
  }

  const confirmReindex = async () => {
    setShowConfirm(false)
    setLoading(true)
    setResult(null)
    try {
      const res = await api.post('/admin/reindex')
      setResult(res.data)
      toast.success('Reindexação concluída', res.data.message)
    } catch (err: any) {
      const { humanizeError } = await import('../lib/error-humanizer')
      const h = humanizeError(err)
      toast.error('Erro na reindexação', h.detail)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="v2-panel mb-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-brand-600" />
          <div>
            <h2 className="text-lg font-semibold text-[var(--v2-ink-strong)]">Reindexação Vetorial</h2>
            <p className="text-sm text-[var(--v2-ink-soft)]">Re-indexa documentos concluídos/aprovados no Qdrant para busca semântica</p>
          </div>
        </div>
        <button
          onClick={handleReindex}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Reindexando...' : 'Reindexar Documentos'}
        </button>
      </div>
      <ConfirmDialog
        open={showConfirm}
        title="Reindexar documentos"
        description="Todos os documentos concluídos/aprovados serão reindexados no Qdrant. Esse processo pode levar alguns minutos."
        confirmText="Iniciar reindexação"
        cancelText="Cancelar"
        loading={loading}
        onCancel={() => setShowConfirm(false)}
        onConfirm={confirmReindex}
      />
      {result && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.68)] p-3 text-center">
            <p className="text-2xl font-bold text-[var(--v2-ink-strong)]">{result.indexed_documents}</p>
            <p className="text-xs text-[var(--v2-ink-faint)]">Indexados</p>
          </div>
          <div className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.68)] p-3 text-center">
            <p className="text-2xl font-bold text-[var(--v2-ink-strong)]">{result.total_documents}</p>
            <p className="text-xs text-[var(--v2-ink-faint)]">Total</p>
          </div>
          <div className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.68)] p-3 text-center">
            <p className="text-2xl font-bold text-brand-700">{result.total_chunks}</p>
            <p className="text-xs text-[var(--v2-ink-faint)]">Chunks</p>
          </div>
          <div className={`rounded-[1.15rem] border p-3 text-center ${result.errors > 0 ? 'border-red-200 bg-[rgba(239,68,68,0.08)]' : 'border-emerald-200 bg-[rgba(16,185,129,0.08)]'}`}>
            <p className={`text-2xl font-bold ${result.errors > 0 ? 'text-red-700' : 'text-green-700'}`}>{result.errors}</p>
            <p className="text-xs text-[var(--v2-ink-faint)]">Erros</p>
          </div>
        </div>
      )}
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
  const [collapseState, setCollapseState] = useState<Record<string, boolean>>(loadAdminCollapseState)
  const toast = useToast()
  const { role, userId } = useAuth()
  const location = useLocation()
  const showPlatformSections = false
  const showPersonalModelCatalog = IS_FIREBASE

  const toggleCollapse = useCallback((id: string) => {
    setCollapseState(prev => {
      const next = { ...prev, [id]: prev[id] === undefined ? false : !prev[id] }
      saveAdminCollapseState(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (location.hash !== '#section_model_catalog') return
    setCollapseState(prev => {
      if (prev.section_model_catalog === true) return prev
      const next = { ...prev, section_model_catalog: true }
      saveAdminCollapseState(next)
      return next
    })
  }, [location.hash])

  const fetchData = () => {
    if (IS_FIREBASE) {
      if (!userId) { setLoading(false); return }
      Promise.all([
        loadAdminDocumentTypes(),
        loadAdminLegalAreas(),
        firestoreGetStats(userId),
      ]).then(([documentTypes, legalAreas, stats]) => {
        const docTypes = documentTypes.map(dt => ({
          id: dt.id, name: dt.name, type: 'document_type' as const, version: '1.0.0',
          is_enabled: true, is_healthy: true, error: null, description: dt.description,
        }))
        const areas = legalAreas.map(la => ({
          id: la.id, name: la.name, type: 'legal_area' as const, version: '1.0.0',
          is_enabled: true, is_healthy: true, error: null, description: la.description,
        }))
        setModules([...docTypes, ...areas])
        setHealth({
          status: 'ok', app: 'Lexio', version: '1.0.0',
          services: { firebase: 'ok', openrouter: 'ok' },
          modules: { total: docTypes.length + areas.length, healthy: docTypes.length + areas.length },
        })
        setStats({
          total_documents: stats.total_documents,
          completed_documents: stats.completed_documents,
          processing_documents: stats.processing_documents,
          pending_review_documents: stats.pending_review_documents,
          average_quality_score: stats.average_quality_score,
          total_cost_usd: stats.total_cost_usd,
        })
      }).catch(() => toast.error('Erro ao carregar configurações e estatísticas do Firebase')).finally(() => setLoading(false))
    } else {
      if (role !== 'admin') {
        setModules([])
        setHealth(null)
        setStats(null)
        setLoading(false)
        return
      }
      Promise.all([
        api.get('/admin/modules').then(res => setModules(Array.isArray(res.data) ? res.data : [])).catch(() => toast.error('Erro ao carregar módulos')),
        api.get('/health').then(res => { if (res.data && typeof res.data === 'object') setHealth(res.data) }).catch(() => toast.error('Erro ao verificar saúde do sistema')),
        api.get('/stats').then(res => { if (res.data && typeof res.data === 'object') setStats(res.data) }).catch(() => toast.error('Erro ao carregar estatísticas')),
      ]).finally(() => setLoading(false))
    }
  }

  useEffect(() => { fetchData() }, [role, userId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
    </div>
  )

  const features = modules.filter(m => m.type === 'feature')
  const healthyModules = modules.filter(m => m.is_healthy).length

  const docTypesCount = modules.filter(m => m.type === 'document_type').length
  const legalAreasCount = modules.filter(m => m.type === 'legal_area').length

  const moduleTypePieData = [
    { name: 'Tipos Documento', value: docTypesCount },
    { name: 'Áreas Direito', value: legalAreasCount },
    { name: 'Features', value: features.length },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6">
      <V2PageHero
        eyebrow={<><Key className="h-3.5 w-3.5" /> Configuracoes pessoais V2</>}
        title="Modelos, chaves e governanca pessoal no mesmo plano de controle"
        description="Centralize catalogo, pipelines, preferencias e fila de revisao em uma superficie unica, preparada para operar o workspace inteiro sem alternar entre layouts antigos." 
        actions={(
          <>
            <button
              onClick={() => {
                const allOpen: Record<string, boolean> = {}
                Object.keys(collapseState).forEach(k => { allOpen[k] = true })
                ;['section_review_queue', 'section_model_catalog', 'section_pipelines', 'section_document_types', 'section_legal_areas', 'section_advanced'].forEach(k => { allOpen[k] = true })
                setCollapseState(allOpen)
                saveAdminCollapseState(allOpen)
              }}
              className="v2-btn-secondary"
            >
              Expandir tudo
            </button>
            <button
              onClick={() => {
                const allClosed: Record<string, boolean> = {}
                Object.keys(collapseState).forEach(k => { allClosed[k] = false })
                setCollapseState(allClosed)
                saveAdminCollapseState(allClosed)
              }}
              className="v2-btn-secondary"
            >
              Recolher tudo
            </button>
          </>
        )}
        aside={(
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Estado do painel</p>
            <div className="rounded-[1.4rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">Catalogo pessoal</p>
              <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">{showPersonalModelCatalog ? 'Ativo' : 'Inativo'}</p>
            </div>
            <div className="rounded-[1.4rem] bg-[rgba(255,255,255,0.82)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">Superficies abertas</p>
              <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">{Object.keys(collapseState).length || 0}</p>
            </div>
          </div>
        )}
      />

      {/* Quick Stats — always visible */}
      <V2MetricGrid
        className={showPlatformSections ? 'md:grid-cols-3 xl:grid-cols-6' : 'md:grid-cols-3 xl:grid-cols-5'}
        items={[
          {
            label: 'Documentos',
            value: (stats?.total_documents || 0).toLocaleString('pt-BR'),
            icon: FileText,
            tone: 'accent',
          },
          {
            label: 'Concluidos',
            value: (stats?.completed_documents || 0).toLocaleString('pt-BR'),
            icon: CheckCircle,
            tone: 'success',
          },
          {
            label: 'Em revisao',
            value: (stats?.pending_review_documents || 0).toLocaleString('pt-BR'),
            icon: Clock,
            tone: stats?.pending_review_documents ? 'accent' : 'default',
          },
          {
            label: 'Score medio',
            value: stats?.average_quality_score ? `${stats.average_quality_score}` : '—',
            icon: TrendingUp,
          },
          {
            label: 'Custo total',
            value: `$${stats?.total_cost_usd?.toFixed(2) || '0.00'}`,
            icon: DollarSign,
            tone: 'warm',
          },
          ...(showPlatformSections ? [{
            label: 'Modulos',
            value: `${healthyModules}/${modules.length}`,
            icon: BarChart3,
          }] : []),
        ]}
      />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── BLOCO: Operação ─────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* Review Queue */}
      <AdminCollapsibleSection
        id="section_review_queue"
        title="Fila de Revisão"
        icon={Clock}
        iconColor="text-blue-600"
        collapseState={collapseState}
        onToggle={toggleCollapse}
      >
        <ReviewQueue />
      </AdminCollapsibleSection>

      {/* Reindex — API mode only */}
      {!IS_FIREBASE && showPlatformSections && (
        <AdminCollapsibleSection
          id="section_reindex"
          title="Reindexação Vetorial"
          icon={RefreshCw}
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <ReindexCard />
        </AdminCollapsibleSection>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── BLOCO: Configuração Geral ──────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {IS_FIREBASE && (
        <div className="mt-8 mb-3">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--v2-ink-faint)]">
            <Key className="w-3.5 h-3.5" /> Configuração Geral
          </h2>
        </div>
      )}

      {/* API Keys */}
      {(IS_FIREBASE || showPlatformSections) && (
        <AdminCollapsibleSection
          id="section_api_keys"
          title="Chaves de API"
          icon={Key}
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <ApiKeysCard />
        </AdminCollapsibleSection>
      )}

      {/* Model Catalog — user-scoped catalog for each authenticated profile */}
      {showPersonalModelCatalog && (
        <AdminCollapsibleSection
          id="section_model_catalog"
          title="Catálogo de Modelos"
          icon={Brain}
          iconColor="text-indigo-600"
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <div className="v2-bridge-surface">
            <ModelCatalogCard />
          </div>
        </AdminCollapsibleSection>
      )}

      {/* Model Configuration — Firebase mode */}
      {IS_FIREBASE && (
        <AdminCollapsibleSection
          id="section_model_config"
          title="Configuração de Modelos (Documentos)"
          icon={Brain}
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <div className="v2-bridge-surface">
            <ModelConfigCard />
          </div>
        </AdminCollapsibleSection>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── BLOCO: Agentes de Documentos ───────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {IS_FIREBASE && (
        <div className="mt-8 mb-3">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--v2-ink-faint)]">
            <FileText className="w-3.5 h-3.5" /> Agentes de Documentos & Acervo
          </h2>
        </div>
      )}

      {/* Thesis Analyst Model Configuration — Firebase mode */}
      {IS_FIREBASE && (
        <AdminCollapsibleSection
          id="section_thesis_config"
          title="Analista de Teses"
          icon={BookOpen}
          iconColor="text-purple-600"
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <div className="v2-bridge-surface">
            <ThesisAnalystConfigCard />
          </div>
        </AdminCollapsibleSection>
      )}

      {/* Context Detail Model Configuration — Firebase mode */}
      {IS_FIREBASE && (
        <AdminCollapsibleSection
          id="section_context_detail_config"
          title="Detalhamento de Contexto"
          icon={Brain}
          iconColor="text-purple-600"
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <div className="v2-bridge-surface">
            <ContextDetailConfigCard />
          </div>
        </AdminCollapsibleSection>
      )}

      {/* Acervo Classificador Config (Firebase-only) */}
      {IS_FIREBASE && (
        <AdminCollapsibleSection
          id="section_acervo_classificador_config"
          title="Classificador de Acervo"
          icon={Tags}
          iconColor="text-teal-600"
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <div className="v2-bridge-surface">
            <AcervoClassificadorConfigCard />
          </div>
        </AdminCollapsibleSection>
      )}

      {/* Acervo Ementa Config (Firebase-only) */}
      {IS_FIREBASE && (
        <AdminCollapsibleSection
          id="section_acervo_ementa_config"
          title="Gerador de Ementa"
          icon={FileText}
          iconColor="text-blue-600"
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <div className="v2-bridge-surface">
            <AcervoEmentaConfigCard />
          </div>
        </AdminCollapsibleSection>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── BLOCO: Caderno de Pesquisa ─────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {IS_FIREBASE && (
        <div className="mt-8 mb-3">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--v2-ink-faint)]">
            <BookOpen className="w-3.5 h-3.5" /> Caderno de Pesquisa
          </h2>
        </div>
      )}

      {/* Research Notebook Config (Firebase-only) */}
      {IS_FIREBASE && (
        <AdminCollapsibleSection
          id="section_research_notebook_config"
          title="Agentes do Caderno de Pesquisa"
          icon={BookOpen}
          iconColor="text-indigo-600"
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <div className="v2-bridge-surface">
            <ResearchNotebookConfigCard />
          </div>
        </AdminCollapsibleSection>
      )}

      {/* Notebook Acervo Config (Firebase-only) */}
      {IS_FIREBASE && (
        <AdminCollapsibleSection
          id="section_notebook_acervo_config"
          title="Analisador de Acervo (Caderno)"
          icon={Database}
          iconColor="text-emerald-600"
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <div className="v2-bridge-surface">
            <NotebookAcervoConfigCard />
          </div>
        </AdminCollapsibleSection>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── BLOCO: Pipelines Multiagente ───────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {IS_FIREBASE && (
        <div className="mt-8 mb-3">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--v2-ink-faint)]">
            <Video className="w-3.5 h-3.5" /> Pipelines Multiagente (Vídeo · Áudio · Apresentação)
          </h2>
        </div>
      )}

      {/* Video Pipeline Config (Firebase-only) */}
      {IS_FIREBASE && (
        <AdminCollapsibleSection
          id="section_video_pipeline_config"
          title="Pipeline de Vídeo"
          icon={Video}
          iconColor="text-rose-600"
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <div className="v2-bridge-surface">
            <VideoPipelineConfigCard />
          </div>
        </AdminCollapsibleSection>
      )}

      {/* Audio Pipeline Config (Firebase-only) */}
      {IS_FIREBASE && (
        <AdminCollapsibleSection
          id="section_audio_pipeline_config"
          title="Pipeline de Áudio"
          icon={Headphones}
          iconColor="text-violet-600"
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <div className="v2-bridge-surface">
            <AudioPipelineConfigCard />
          </div>
        </AdminCollapsibleSection>
      )}

      {/* Presentation Pipeline Config (Firebase-only) */}
      {IS_FIREBASE && (
        <AdminCollapsibleSection
          id="section_presentation_pipeline_config"
          title="Pipeline de Apresentação"
          icon={Presentation}
          iconColor="text-sky-600"
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <div className="v2-bridge-surface">
            <PresentationPipelineConfigCard />
          </div>
        </AdminCollapsibleSection>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── BLOCO: Dados & Sistema ─────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {showPlatformSections && (
        <div className="mt-8 mb-3">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--v2-ink-faint)]">
            <Activity className="w-3.5 h-3.5" /> Dados, Módulos & Sistema
          </h2>
        </div>
      )}

      {/* System Health + Module Pie */}
      {showPlatformSections && (
      <AdminCollapsibleSection
        id="section_health"
        title="Saúde do Sistema"
        icon={Activity}
        collapseState={collapseState}
        onToggle={toggleCollapse}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {health && (
            <div className="md:col-span-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(health.services).map(([name, status]) => {
                  const Icon = serviceIcons[name] || Server
                  const isOk = status === 'ok'
                  return (
                    <div key={name} className={`rounded-[1.15rem] border p-4 ${isOk ? 'border-emerald-200 bg-[rgba(16,185,129,0.08)]' : 'border-red-200 bg-[rgba(239,68,68,0.08)]'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${isOk ? 'text-green-600' : 'text-red-600'}`} />
                        <span className="text-sm font-medium capitalize text-[var(--v2-ink-strong)]">{name}</span>
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
              <div className="mt-4 flex items-center gap-4 text-sm text-[var(--v2-ink-soft)]">
                <span>App: <strong>{health.app} v{health.version}</strong></span>
                <span>Módulos: <strong>{health.modules.healthy}/{health.modules.total}</strong> saudáveis</span>
              </div>
            </div>
          )}

          {moduleTypePieData.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-[var(--v2-ink-strong)]">Módulos por Tipo</h3>
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
                  <span key={d.name} className="flex items-center gap-1 text-xs text-[var(--v2-ink-soft)]">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </AdminCollapsibleSection>
      )}

      {/* Document Types — CRUD */}
      {showPlatformSections && (
        <AdminCollapsibleSection
          id="section_document_types"
          title="Tipos de Documento"
          icon={FileText}
          iconColor="text-blue-600"
          badge={docTypesCount}
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <DocumentTypesCrud />
        </AdminCollapsibleSection>
      )}

      {/* Legal Areas — CRUD */}
      {showPlatformSections && (
        <AdminCollapsibleSection
          id="section_legal_areas"
          title="Áreas do Direito"
          icon={Scale}
          iconColor="text-purple-600"
          badge={legalAreasCount}
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <LegalAreasCrud />
        </AdminCollapsibleSection>
      )}

      {/* Classification Tipos — CRUD */}
      {showPlatformSections && (
        <AdminCollapsibleSection
          id="section_classification_tipos"
          title="Tipos de Documento por Classificação"
          icon={Tags}
          iconColor="text-green-600"
          collapseState={collapseState}
          onToggle={toggleCollapse}
          defaultOpen={false}
        >
          <ClassificationTiposCrud />
        </AdminCollapsibleSection>
      )}

      {/* Features */}
      {showPlatformSections && features.length > 0 && (
        <AdminCollapsibleSection
          id="section_features"
          title={`Módulos Funcionais (${features.length})`}
          icon={Zap}
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <div className="space-y-3">
            {features.map(m => (
              <ModuleRow key={m.id} module={m} onToggle={handleToggle} toggling={toggling} />
            ))}
          </div>
        </AdminCollapsibleSection>
      )}

      {/* Pipeline Execution Logs — API mode only */}
      {!IS_FIREBASE && showPlatformSections && <PipelineLogs />}

      {/* User Management — API mode only */}
      {!IS_FIREBASE && showPlatformSections && (
        <AdminCollapsibleSection
          id="section_users"
          title="Usuários"
          icon={Users}
          collapseState={collapseState}
          onToggle={toggleCollapse}
        >
          <UsersSection />
        </AdminCollapsibleSection>
      )}
    </div>
  )
}

// ── Pipeline Logs ─────────────────────────────────────────────────────────────

interface PipelineLog {
  id: string
  document_id: string
  document_type: string
  tema: string | null
  doc_status: string
  agent_name: string
  phase: string
  model: string | null
  tokens_in: number | null
  tokens_out: number | null
  cost_usd: number | null
  duration_ms: number | null
  created_at: string | null
}


function PipelineLogs() {
  const [logs, setLogs] = useState<PipelineLog[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api.get('/admin/pipeline-logs', { params: { limit: 30 } })
      .then(res => setLogs(Array.isArray(res.data) ? res.data : []))
      .catch(() => toast.error('Erro ao carregar logs de pipeline'))
      .finally(() => setLoading(false))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const statusColor: Record<string, string> = {
    concluido: 'bg-green-100 text-green-700',
    processando: 'bg-blue-100 text-blue-700',
    erro: 'bg-red-100 text-red-700',
    em_revisao: 'bg-amber-100 text-amber-700',
  }

  return (
    <div className="v2-panel mb-6 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 transition-colors hover:bg-[rgba(255,255,255,0.58)]"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-[var(--v2-ink-strong)]">Logs de Execução do Pipeline</h2>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[var(--v2-ink-faint)]" /> : <ChevronDown className="w-4 h-4 text-[var(--v2-ink-faint)]" />}
      </button>

      {open && (
        <div className="border-t border-[var(--v2-line-soft)]">
          {loading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 rounded" />)}
            </div>
          ) : logs.length === 0 ? (
            <p className="p-6 text-center text-sm text-[var(--v2-ink-faint)]">Nenhum log de execução encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] text-[var(--v2-ink-faint)] uppercase tracking-wide">
                    <th className="px-4 py-2 text-left">Documento</th>
                    <th className="px-4 py-2 text-left">Agente / Fase</th>
                    <th className="px-4 py-2 text-left">Modelo</th>
                    <th className="px-4 py-2 text-right">Tokens</th>
                    <th className="px-4 py-2 text-right">Custo</th>
                    <th className="px-4 py-2 text-right">Duração</th>
                    <th className="px-4 py-2 text-left">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--v2-line-soft)]">
                  {logs.map(log => (
                    <tr key={log.id} className="transition-colors hover:bg-[rgba(255,255,255,0.58)]">
                      <td className="px-4 py-2">
                        <button
                          onClick={() => navigate(buildWorkspaceDocumentDetailPath(log.document_id, { preserveSearch: location.search }))}
                          className="text-left transition-colors hover:text-brand-600"
                        >
                          <p className="font-medium text-[var(--v2-ink-strong)]">{log.document_type}</p>
                          {log.tema && <p className="max-w-[180px] truncate text-[var(--v2-ink-faint)]">{log.tema}</p>}
                        </button>
                        <span className={`inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColor[log.doc_status] || 'bg-[rgba(15,23,42,0.08)] text-[var(--v2-ink-soft)]'}`}>
                          {log.doc_status}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-medium text-[var(--v2-ink-strong)]">{log.agent_name}</p>
                        <p className="text-[var(--v2-ink-faint)]">{log.phase}</p>
                      </td>
                      <td className="px-4 py-2 font-mono text-[var(--v2-ink-soft)]">
                        {log.model ? log.model.split('/').pop() : '—'}
                      </td>
                      <td className="px-4 py-2 text-right text-[var(--v2-ink-soft)]">
                        {log.tokens_in != null && log.tokens_out != null
                          ? `${(log.tokens_in + log.tokens_out).toLocaleString()}`
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-right text-[var(--v2-ink-soft)]">
                        {log.cost_usd != null ? `$${log.cost_usd.toFixed(4)}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right text-[var(--v2-ink-soft)]">
                        {log.duration_ms != null ? `${(log.duration_ms / 1000).toFixed(1)}s` : '—'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-[var(--v2-ink-faint)]">
                        {log.created_at
                          ? new Date(log.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Users Section ─────────────────────────────────────────────────────────────

interface OrgUser {
  id: string
  email: string
  full_name: string
  title: string | null
  role: string
  is_active: boolean
  created_at: string | null
}


function UsersSection() {
  const [users, setUsers] = useState<OrgUser[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    api.get('/admin/users')
      .then(res => setUsers(Array.isArray(res.data) ? res.data : []))
      .catch(() => toast.error('Erro ao carregar usuários'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpdate = async (userId: string, patch: { role?: string; is_active?: boolean }) => {
    setUpdating(userId)
    try {
      const res = await api.patch(`/admin/users/${userId}`, patch)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...res.data } : u))
      toast.success('Usuário atualizado')
    } catch (err: any) {
      toast.error('Erro ao atualizar usuário', err?.response?.data?.detail)
    } finally {
      setUpdating(null)
    }
  }

  const ROLE_LABELS: Record<string, string> = { admin: 'Admin', user: 'Usuário', viewer: 'Leitor' }
  const ROLE_COLORS: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    user: 'bg-blue-100 text-blue-700',
    viewer: 'bg-[rgba(15,23,42,0.08)] text-[var(--v2-ink-soft)]',
  }

  return (
    <div>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : users.length === 0 ? (
        <p className="text-center text-sm text-[var(--v2-ink-faint)]">Nenhum usuário encontrado.</p>
      ) : (
        <div className="overflow-hidden rounded-[1.2rem] border border-[var(--v2-line-soft)] divide-y divide-[var(--v2-line-soft)]">
          {users.map(u => (
            <div key={u.id} className={`flex items-center gap-4 px-6 py-3 ${!u.is_active ? 'bg-[rgba(15,23,42,0.04)] opacity-60' : 'bg-[rgba(255,255,255,0.68)]'}`}>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-[var(--v2-ink-strong)]">{u.full_name}</p>
                <p className="truncate text-xs text-[var(--v2-ink-soft)]">{u.email}{u.title ? ` — ${u.title}` : ''}</p>
              </div>

              {/* Role selector */}
              <select
                value={u.role}
                disabled={updating === u.id}
                onChange={e => handleUpdate(u.id, { role: e.target.value })}
                className={`cursor-pointer rounded-full border border-current/10 px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-brand-500 ${ROLE_COLORS[u.role] || 'bg-[rgba(15,23,42,0.08)] text-[var(--v2-ink-soft)]'}`}
              >
                <option value="admin">Admin</option>
                <option value="user">Usuário</option>
                <option value="viewer">Leitor</option>
              </select>

              {/* Active toggle */}
              <button
                onClick={() => handleUpdate(u.id, { is_active: !u.is_active })}
                disabled={updating === u.id}
                title={u.is_active ? 'Desativar conta' : 'Ativar conta'}
                className="transition-colors disabled:opacity-50"
              >
                {u.is_active
                  ? <ToggleRight className="w-6 h-6 text-green-600" />
                  : <ToggleLeft className="w-6 h-6 text-[var(--v2-ink-faint)]" />
                }
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Document Types CRUD Section ───────────────────────────────────────────────

function DocumentTypesCrud() {
  const [items, setItems] = useState<AdminDocumentType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingItem, setEditingItem] = useState<AdminDocumentType | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    loadAdminDocumentTypes()
      .then(setItems)
      .catch(() => toast.error('Erro ao carregar tipos de documento'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (updated: AdminDocumentType[]) => {
    setSaving(true)
    try {
      if (IS_FIREBASE) {
        await saveAdminDocumentTypes(updated)
      }
      setItems(updated)
      toast.success('Tipos de documento atualizados')
    } catch {
      toast.error('Erro ao salvar tipos de documento')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (id: string) => {
    const updated = items.map(item =>
      item.id === id ? { ...item, is_enabled: !item.is_enabled } : item
    )
    await handleSave(updated)
  }

  const handleDelete = async (id: string) => {
    setPendingDeleteId(id)
  }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    const updated = items.filter(item => item.id !== id)
    await handleSave(updated)
  }

  const handleEdit = (item: AdminDocumentType) => {
    const structure = item.structure?.trim()
      ? item.structure
      : (DEFAULT_DOC_STRUCTURES[item.id] ?? '')
    setEditingItem({ ...item, structure })
    setIsCreating(false)
  }

  const handleCreate = () => {
    setEditingItem({ id: '', name: '', description: '', templates: ['generic'], is_enabled: true, structure: '' })
    setIsCreating(true)
  }

  const handleEditSave = async () => {
    if (!editingItem) return
    if (!editingItem.name.trim()) { toast.error('Nome é obrigatório'); return }

    const itemToSave = { ...editingItem }
    if (isCreating) {
      // Generate ID from name
      itemToSave.id = editingItem.id.trim() || generateSlugId(editingItem.name)
      if (items.some(i => i.id === itemToSave.id)) {
        toast.error('Já existe um tipo de documento com este ID')
        return
      }
      await handleSave([...items, itemToSave])
    } else {
      const updated = items.map(item => item.id === editingItem.id ? itemToSave : item)
      await handleSave(updated)
    }
    setEditingItem(null)
    setIsCreating(false)
  }

  if (loading) return <p className="py-4 text-sm text-[var(--v2-ink-faint)]">Carregando...</p>

  return (
    <div className="space-y-3">
      {/* Edit/Create modal */}
      {editingItem && (
        <div className="space-y-3 rounded-[1.2rem] border border-[rgba(59,130,246,0.18)] bg-[rgba(59,130,246,0.08)] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--v2-ink-strong)]">
              {isCreating ? 'Novo Tipo de Documento' : `Editar: ${editingItem.name}`}
            </h3>
            <button onClick={() => setEditingItem(null)} className="text-[var(--v2-ink-faint)] hover:text-[var(--v2-ink-strong)]">
              <X className="w-4 h-4" />
            </button>
          </div>
          {isCreating && (
            <div>
              <label className="text-xs font-medium text-[var(--v2-ink-soft)]">ID (gerado automaticamente se vazio)</label>
              <input
                type="text"
                value={editingItem.id}
                onChange={e => setEditingItem({ ...editingItem, id: e.target.value })}
                className={ADMIN_INPUT}
                placeholder="ex: recurso_especial"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-[var(--v2-ink-soft)]">Nome</label>
            <input
              type="text"
              value={editingItem.name}
              onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
              className={ADMIN_INPUT}
              placeholder="Nome do tipo de documento"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--v2-ink-soft)]">Descrição</label>
            <textarea
              value={editingItem.description}
              onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
              className={`${ADMIN_INPUT} resize-none`}
              rows={2}
              placeholder="Descrição do tipo de documento"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--v2-ink-soft)]">Estrutura do Documento (Markdown)</label>
            <p className="mb-1 mt-0.5 text-xs text-[var(--v2-ink-faint)]">
              Defina a estrutura/modelo que será utilizado para gerar este tipo de documento. Use formato Markdown.
            </p>
            <textarea
              value={editingItem.structure || ''}
              onChange={e => setEditingItem({ ...editingItem, structure: e.target.value })}
              className={`${ADMIN_INPUT_MONO} resize-y`}
              rows={12}
              placeholder={`Exemplo de estrutura em Markdown:\n\n# TÍTULO DO DOCUMENTO\n\n## 1. QUALIFICAÇÃO DAS PARTES\n- Nome, qualificação e endereço\n\n## 2. DOS FATOS\n- Narração cronológica dos fatos\n- Contextualização com referências legais\n\n## 3. DO DIREITO\n### 3.1 Fundamentação Constitucional\n### 3.2 Fundamentação Legal\n### 3.3 Fundamentação Jurisprudencial\n\n## 4. DOS PEDIDOS\n- Pedidos claros e específicos`}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleEditSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              onClick={() => { setEditingItem(null); setIsCreating(false) }}
              className={ADMIN_SECONDARY_BUTTON}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      {items.map(item => (
        <div
          key={item.id}
          className={`flex items-center justify-between rounded-[1.15rem] border p-4 transition-colors ${!item.is_enabled ? 'border-[var(--v2-line-soft)] bg-[rgba(15,23,42,0.04)] opacity-60' : 'border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] hover:bg-[rgba(255,255,255,0.9)]'}`}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <CheckCircle className={`w-5 h-5 flex-shrink-0 ${item.is_enabled ? 'text-green-500' : 'text-[var(--v2-ink-faint)]'}`} />
            <div className="min-w-0">
              <p className="font-medium text-[var(--v2-ink-strong)]">{item.name}</p>
              <p className="truncate text-sm text-[var(--v2-ink-soft)]">{item.description}</p>
              <p className="mt-0.5 text-xs text-[var(--v2-ink-faint)]">ID: {item.id} · Templates: {item.templates.join(', ')}{item.structure ? ' · Estrutura definida' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <button
              onClick={() => handleEdit(item)}
              className={ADMIN_ICON_BUTTON}
              title="Editar"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDelete(item.id)}
              className="rounded-lg p-1.5 text-[var(--v2-ink-faint)] transition-colors hover:bg-[rgba(239,68,68,0.08)] hover:text-red-600"
              title="Excluir"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleToggle(item.id)}
              disabled={saving}
              className="transition-colors"
              title={item.is_enabled ? 'Desativar' : 'Ativar'}
            >
              {item.is_enabled ? (
                <ToggleRight className="w-6 h-6 text-green-600" />
              ) : (
                <ToggleLeft className="w-6 h-6 text-[var(--v2-ink-faint)]" />
              )}
            </button>
          </div>
        </div>
      ))}

      {/* Add new button */}
      <button
        onClick={handleCreate}
        className={ADMIN_DASHED_BUTTON}
      >
        <Plus className="w-4 h-4" />
        Adicionar novo tipo de documento
      </button>

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Excluir tipo de documento"
        description="Este tipo de documento será removido da configuração administrativa."
        confirmText="Excluir"
        cancelText="Cancelar"
        danger
        loading={saving}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

// ── Legal Areas CRUD Section ─────────────────────────────────────────────────

function LegalAreasCrud() {
  const [items, setItems] = useState<AdminLegalArea[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingItem, setEditingItem] = useState<AdminLegalArea | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [expandedArea, setExpandedArea] = useState<string | null>(null)
  const [newAssunto, setNewAssunto] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    loadAdminLegalAreas()
      .then(setItems)
      .catch(() => toast.error('Erro ao carregar áreas do direito'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (updated: AdminLegalArea[]) => {
    setSaving(true)
    try {
      if (IS_FIREBASE) {
        await saveAdminLegalAreas(updated)
      }
      setItems(updated)
      toast.success('Áreas do direito atualizadas')
    } catch {
      toast.error('Erro ao salvar áreas do direito')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (id: string) => {
    const updated = items.map(item =>
      item.id === id ? { ...item, is_enabled: !item.is_enabled } : item
    )
    await handleSave(updated)
  }

  const handleDelete = async (id: string) => {
    setPendingDeleteId(id)
  }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    const updated = items.filter(item => item.id !== id)
    await handleSave(updated)
  }

  const handleEdit = (item: AdminLegalArea) => {
    setEditingItem({ ...item })
    setIsCreating(false)
  }

  const handleCreate = () => {
    setEditingItem({ id: '', name: '', description: '', is_enabled: true, assuntos: [] })
    setIsCreating(true)
  }

  const handleEditSave = async () => {
    if (!editingItem) return
    if (!editingItem.name.trim()) { toast.error('Nome é obrigatório'); return }

    const itemToSave = { ...editingItem }
    if (isCreating) {
      itemToSave.id = editingItem.id.trim() || generateSlugId(editingItem.name)
      if (items.some(i => i.id === itemToSave.id)) {
        toast.error('Já existe uma área com este ID')
        return
      }
      await handleSave([...items, itemToSave])
    } else {
      const updated = items.map(item => item.id === editingItem.id ? itemToSave : item)
      await handleSave(updated)
    }
    setEditingItem(null)
    setIsCreating(false)
  }

  const handleAddAssunto = async (areaId: string) => {
    const trimmed = newAssunto.trim()
    if (!trimmed) return
    const updated = items.map(item => {
      if (item.id !== areaId) return item
      const current = item.assuntos || []
      if (current.includes(trimmed)) { toast.error('Assunto já existe nesta área'); return item }
      return { ...item, assuntos: [...current, trimmed] }
    })
    await handleSave(updated)
    setNewAssunto('')
  }

  const handleRemoveAssunto = async (areaId: string, assunto: string) => {
    const updated = items.map(item => {
      if (item.id !== areaId) return item
      return { ...item, assuntos: (item.assuntos || []).filter(a => a !== assunto) }
    })
    await handleSave(updated)
  }

  if (loading) return <p className="py-4 text-sm text-[var(--v2-ink-faint)]">Carregando...</p>

  return (
    <div className="space-y-3">
      {/* Edit/Create form */}
      {editingItem && (
        <div className="space-y-3 rounded-[1.2rem] border border-[rgba(147,51,234,0.18)] bg-[rgba(147,51,234,0.08)] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--v2-ink-strong)]">
              {isCreating ? 'Nova Área do Direito' : `Editar: ${editingItem.name}`}
            </h3>
            <button onClick={() => setEditingItem(null)} className="text-[var(--v2-ink-faint)] hover:text-[var(--v2-ink-strong)]">
              <X className="w-4 h-4" />
            </button>
          </div>
          {isCreating && (
            <div>
              <label className="text-xs font-medium text-[var(--v2-ink-soft)]">ID (gerado automaticamente se vazio)</label>
              <input
                type="text"
                value={editingItem.id}
                onChange={e => setEditingItem({ ...editingItem, id: e.target.value })}
                className={ADMIN_INPUT}
                placeholder="ex: direito_ambiental"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-[var(--v2-ink-soft)]">Nome</label>
            <input
              type="text"
              value={editingItem.name}
              onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
              className={ADMIN_INPUT}
              placeholder="Nome da área do direito"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--v2-ink-soft)]">Descrição</label>
            <textarea
              value={editingItem.description}
              onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
              className={`${ADMIN_INPUT} resize-none`}
              rows={2}
              placeholder="Descrição da área do direito"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleEditSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              onClick={() => { setEditingItem(null); setIsCreating(false) }}
              className={ADMIN_SECONDARY_BUTTON}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      {items.map(item => (
        <div key={item.id} className={`rounded-[1.15rem] border transition-colors ${!item.is_enabled ? 'border-[var(--v2-line-soft)] bg-[rgba(15,23,42,0.04)] opacity-60' : 'border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)]'}`}>
          <div className="flex items-center justify-between p-4 hover:bg-[rgba(255,255,255,0.88)]">
            <div
              className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
              onClick={() => setExpandedArea(expandedArea === item.id ? null : item.id)}
            >
              <Scale className={`w-5 h-5 flex-shrink-0 ${item.is_enabled ? 'text-purple-500' : 'text-[var(--v2-ink-faint)]'}`} />
              <div className="min-w-0">
                <p className="font-medium text-[var(--v2-ink-strong)]">{item.name}</p>
                <p className="truncate text-sm text-[var(--v2-ink-soft)]">{item.description}</p>
                <p className="mt-0.5 text-xs text-[var(--v2-ink-faint)]">
                  ID: {item.id} · {(item.assuntos || []).length} assunto{(item.assuntos || []).length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
              <button
                onClick={() => setExpandedArea(expandedArea === item.id ? null : item.id)}
                className="rounded-lg p-1.5 text-[var(--v2-ink-faint)] transition-colors hover:bg-[rgba(147,51,234,0.08)] hover:text-purple-600"
                title="Ver assuntos"
              >
                {expandedArea === item.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <button
                onClick={() => handleEdit(item)}
                className={ADMIN_ICON_BUTTON}
                title="Editar"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(item.id)}
                className="rounded-lg p-1.5 text-[var(--v2-ink-faint)] transition-colors hover:bg-[rgba(239,68,68,0.08)] hover:text-red-600"
                title="Excluir"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleToggle(item.id)}
                disabled={saving}
                className="transition-colors"
                title={item.is_enabled ? 'Desativar' : 'Ativar'}
              >
                {item.is_enabled ? (
                  <ToggleRight className="w-6 h-6 text-green-600" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-[var(--v2-ink-faint)]" />
                )}
              </button>
            </div>
          </div>
          {/* Assuntos panel */}
          {expandedArea === item.id && (
            <div className="border-t border-[rgba(147,51,234,0.14)] bg-[rgba(147,51,234,0.05)] px-4 pb-4">
              <p className="text-xs font-semibold text-purple-700 mt-3 mb-2">
                Assuntos ({(item.assuntos || []).length})
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(item.assuntos || []).map(assunto => (
                  <span
                    key={assunto}
                    className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full group"
                  >
                    {assunto}
                    <button
                      onClick={() => handleRemoveAssunto(item.id, assunto)}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                      title="Remover assunto"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {(item.assuntos || []).length === 0 && (
                  <span className="text-xs italic text-[var(--v2-ink-faint)]">Nenhum assunto cadastrado</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAssunto}
                  onChange={e => setNewAssunto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAssunto(item.id) } }}
                  className="flex-1 rounded-lg border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-3 py-1.5 text-xs text-[var(--v2-ink-strong)] outline-none focus:border-purple-300 focus:ring-4 focus:ring-[rgba(147,51,234,0.12)]"
                  placeholder="Novo assunto..."
                />
                <button
                  onClick={() => handleAddAssunto(item.id)}
                  disabled={saving || !newAssunto.trim()}
                  className="inline-flex items-center gap-1 bg-purple-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  <Plus className="w-3 h-3" />
                  Adicionar
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add new button */}
      <button
        onClick={handleCreate}
        className={ADMIN_DASHED_BUTTON}
      >
        <Plus className="w-4 h-4" />
        Adicionar nova área do direito
      </button>

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Excluir área do direito"
        description="A área selecionada será removida da configuração administrativa."
        confirmText="Excluir"
        cancelText="Cancelar"
        danger
        loading={saving}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function ClassificationTiposCrud() {
  const [tipos, setTipos] = useState<Record<string, Record<string, string[]>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedNatureza, setSelectedNatureza] = useState<string>('')
  const [selectedArea, setSelectedArea] = useState<string>('_default')
  const [legalAreas, setLegalAreas] = useState<AdminLegalArea[]>([])
  const [newTipo, setNewTipo] = useState('')
  const toast = useToast()

  useEffect(() => {
    Promise.all([
      loadAdminClassificationTipos(),
      loadAdminLegalAreas(),
    ]).then(([tiposData, areasData]) => {
      setTipos(tiposData.tipos)
      setLegalAreas(areasData)
      // Select first natureza by default
      const first = NATUREZA_OPTIONS[0]?.value
      if (first) setSelectedNatureza(first)
    }).catch(() => toast.error('Erro ao carregar tipos de classificação'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveTipos = async (updated: Record<string, Record<string, string[]>>) => {
    setSaving(true)
    try {
      if (IS_FIREBASE) {
        await saveAdminClassificationTipos(updated)
      }
      setTipos(updated)
      toast.success('Tipos de classificação atualizados')
    } catch {
      toast.error('Erro ao salvar tipos de classificação')
    } finally {
      setSaving(false)
    }
  }

  const handleAddTipo = async () => {
    const trimmed = newTipo.trim()
    if (!trimmed || !selectedNatureza) return
    const current = tipos[selectedNatureza]?.[selectedArea] || []
    if (current.includes(trimmed)) { toast.error('Tipo já existe nesta classificação'); return }
    const updated = {
      ...tipos,
      [selectedNatureza]: {
        ...(tipos[selectedNatureza] || {}),
        [selectedArea]: [...current, trimmed],
      },
    }
    await handleSaveTipos(updated)
    setNewTipo('')
  }

  const handleRemoveTipo = async (tipo: string) => {
    if (!selectedNatureza) return
    const current = tipos[selectedNatureza]?.[selectedArea] || []
    const updated = {
      ...tipos,
      [selectedNatureza]: {
        ...(tipos[selectedNatureza] || {}),
        [selectedArea]: current.filter(t => t !== tipo),
      },
    }
    await handleSaveTipos(updated)
  }

  const currentTipos = tipos[selectedNatureza]?.[selectedArea] || []

  if (loading) return <p className="py-4 text-sm text-[var(--v2-ink-faint)]">Carregando...</p>

  const naturezaLabel = NATUREZA_OPTIONS.find(o => o.value === selectedNatureza)?.label || selectedNatureza

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--v2-ink-soft)]">
        Configure os tipos de documento disponíveis para cada combinação de natureza e área do direito.
        Os tipos definidos em "Geral (padrão)" se aplicam a todas as áreas. Tipos específicos por área complementam os gerais.
      </p>

      {/* Natureza selector */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-[var(--v2-ink-soft)]">Natureza</label>
          <select
            value={selectedNatureza}
            onChange={e => { setSelectedNatureza(e.target.value); setSelectedArea('_default') }}
            className={ADMIN_INPUT}
          >
            {NATUREZA_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label} — {o.description}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-[var(--v2-ink-soft)]">Área do Direito</label>
          <select
            value={selectedArea}
            onChange={e => setSelectedArea(e.target.value)}
            className={ADMIN_INPUT}
          >
            <option value="_default">Geral (padrão)</option>
            {legalAreas.filter(a => a.is_enabled).map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Current tipos */}
      <div className="rounded-[1.15rem] border border-[rgba(34,197,94,0.18)] bg-[rgba(34,197,94,0.08)] p-4">
        <p className="text-xs font-semibold text-green-700 mb-2">
          Tipos para {naturezaLabel} / {selectedArea === '_default' ? 'Geral' : legalAreas.find(a => a.id === selectedArea)?.name || selectedArea}
          <span className="ml-1 font-normal text-[var(--v2-ink-soft)]">({currentTipos.length})</span>
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {currentTipos.map(tipo => (
            <span
              key={tipo}
              className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full group"
            >
              {tipo}
              <button
                onClick={() => handleRemoveTipo(tipo)}
                className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                title="Remover tipo"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {currentTipos.length === 0 && (
            <span className="text-xs italic text-[var(--v2-ink-faint)]">Nenhum tipo cadastrado para esta combinação</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTipo}
            onChange={e => setNewTipo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTipo() } }}
            className="flex-1 rounded-lg border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-3 py-1.5 text-xs text-[var(--v2-ink-strong)] outline-none focus:border-green-300 focus:ring-4 focus:ring-[rgba(34,197,94,0.12)]"
            placeholder="Novo tipo de documento..."
          />
          <button
            onClick={handleAddTipo}
            disabled={saving || !newTipo.trim()}
            className="inline-flex items-center gap-1 bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Plus className="w-3 h-3" />
            Adicionar
          </button>
        </div>
      </div>
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
    <div className="flex items-center justify-between rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] p-4 hover:bg-[rgba(255,255,255,0.9)]">
      <div className="flex items-center gap-3">
        {m.is_healthy ? (
          <CheckCircle className="w-5 h-5 text-green-500" />
        ) : (
          <XCircle className="w-5 h-5 text-red-500" />
        )}
        <div>
          <p className="font-medium text-[var(--v2-ink-strong)]">{m.name}</p>
          <p className="text-sm text-[var(--v2-ink-soft)]">{m.description}</p>
          {m.error && <p className="text-xs text-red-500 mt-1">{m.error}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--v2-ink-faint)]">v{m.version}</span>
        <button
          onClick={() => onToggle(m.id)}
          disabled={toggling === m.id}
          className="transition-colors"
          title={m.is_enabled ? 'Desativar' : 'Ativar'}
        >
          {m.is_enabled ? (
            <ToggleRight className="w-6 h-6 text-green-600" />
          ) : (
            <ToggleLeft className="w-6 h-6 text-[var(--v2-ink-faint)]" />
          )}
        </button>
      </div>
    </div>
  )
}

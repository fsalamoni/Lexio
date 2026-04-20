import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BookOpen, Search, Tag, ChevronDown, ChevronUp, Star, Copy, Check as CheckIcon, Download, Plus, Pencil, Trash2, FileText } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { SkeletonItem } from '../components/Skeleton'
import { AREA_LABELS, AREA_COLORS } from '../lib/constants'
import { IS_FIREBASE } from '../lib/firebase'
import {
  listTheses, createThesis, updateThesis, deleteThesis, getThesisStats,
  seedThesesIfEmpty,
  type ThesisData,
} from '../lib/firestore-service'
import ThesisAnalysisCard from '../components/ThesisAnalysisCard'
import DraggablePanel from '../components/DraggablePanel'
import ConfirmDialog from '../components/ConfirmDialog'
import { V2EmptyState, V2MetricGrid, V2PageHero } from '../components/v2/V2PagePrimitives'
import { buildWorkspaceNewDocumentPath } from '../lib/workspace-routes'

interface ThesisItem {
  id: string
  title: string
  content: string
  summary: string | null
  legal_area_id: string
  document_type_id: string | null
  tags: string[] | null
  category: string | null
  quality_score: number | null
  usage_count: number
  source_type: string
  created_at: string
}

interface ThesisStats {
  total_theses: number
  by_area: Record<string, number>
  average_quality_score: number | null
  most_used: { id: string; title: string; usage_count: number }[]
}

interface ThesisFormData {
  title: string
  content: string
  summary: string
  legal_area_id: string
  tags: string
  quality_score: string
}

const EMPTY_FORM: ThesisFormData = {
  title: '',
  content: '',
  summary: '',
  legal_area_id: 'administrative',
  tags: '',
  quality_score: '',
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handle}
      title="Copiar conteúdo"
      className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600 transition-colors"
    >
      {copied
        ? <><CheckIcon className="w-3.5 h-3.5 text-green-500" /> Copiado</>
        : <><Copy className="w-3.5 h-3.5" /> Copiar</>
      }
    </button>
  )
}

// ── Thesis Form Modal ─────────────────────────────────────────────────────────

function ThesisModal({
  thesis,
  onClose,
  onSaved,
}: {
  thesis: ThesisItem | null  // null = create mode
  onClose: () => void
  onSaved: (saved: ThesisItem) => void
}) {
  const [form, setForm] = useState<ThesisFormData>(
    thesis
      ? {
          title: thesis.title,
          content: thesis.content,
          summary: thesis.summary || '',
          legal_area_id: thesis.legal_area_id,
          tags: (thesis.tags || []).join(', '),
          quality_score: thesis.quality_score != null ? String(thesis.quality_score) : '',
        }
      : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const { userId } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('Título e conteúdo são obrigatórios')
      return
    }
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      summary: form.summary.trim() || undefined,
      legal_area_id: form.legal_area_id,
      tags: form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      quality_score: form.quality_score ? parseFloat(form.quality_score) : undefined,
    }
    try {
      let saved: ThesisItem
      if (IS_FIREBASE && userId) {
        if (thesis) {
          const result = await updateThesis(userId, thesis.id, payload)
          saved = { ...result, id: result.id!, usage_count: result.usage_count ?? 0, source_type: result.source_type ?? 'manual' } as ThesisItem
          toast.success('Tese atualizada')
        } else {
          const result = await createThesis(userId, payload)
          saved = { ...result, id: result.id!, usage_count: 0, source_type: 'manual' } as ThesisItem
          toast.success('Tese criada')
        }
      } else {
        let res
        if (thesis) {
          res = await api.patch(`/theses/${thesis.id}`, payload)
          toast.success('Tese atualizada')
        } else {
          res = await api.post('/theses/', payload)
          toast.success('Tese criada')
        }
        saved = res.data
      }
      onSaved(saved)
      onClose()
    } catch (err: any) {
      const { humanizeError } = await import('../lib/error-humanizer')
      const h = humanizeError(err)
      toast.error('Erro ao salvar tese', h.detail)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DraggablePanel
      open={true}
      onClose={onClose}
      title={thesis ? 'Editar Tese' : 'Nova Tese'}
      icon={<BookOpen size={16} />}
      initialWidth={650}
      initialHeight={600}
      minWidth={400}
      minHeight={300}
    >
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Título *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Título da tese jurídica"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Área do Direito *</label>
            <select
              value={form.legal_area_id}
              onChange={e => setForm(f => ({ ...f, legal_area_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              {Object.entries(AREA_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Resumo</label>
            <input
              type="text"
              value={form.summary}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              placeholder="Resumo curto (opcional)"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Conteúdo *</label>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Texto completo da tese..."
              rows={8}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm resize-y focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Tags</label>
              <input
                type="text"
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="Separe por vírgula"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Score de qualidade (0-100)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.quality_score}
                onChange={e => setForm(f => ({ ...f, quality_score: e.target.value }))}
                placeholder="Ex: 85"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {saving ? 'Salvando...' : thesis ? 'Salvar alterações' : 'Criar tese'}
          </button>
        </div>
    </DraggablePanel>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ThesisBank() {
  const location = useLocation()
  const [theses, setTheses] = useState<ThesisItem[]>([])
  const [stats, setStats] = useState<ThesisStats | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [sortBy, setSortBy] = useState<'recent' | 'quality' | 'usage'>('recent')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingThesis, setEditingThesis] = useState<ThesisItem | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toast = useToast()
  const { userId } = useAuth()

  const PAGE = 50

  const fetchTheses = useCallback((q: string, area: string) => {
    setLoading(true)
    setOffset(0)

    if (IS_FIREBASE && userId) {
      listTheses(userId, { q: q || undefined, legalAreaId: area || undefined, limit: PAGE })
        .then(result => {
          setTheses(result.items.map(t => ({ ...t, id: t.id! } as ThesisItem)))
          setTotal(result.total)
        })
        .catch(() => toast.error('Erro ao carregar teses'))
        .finally(() => setLoading(false))
    } else {
      const params = new URLSearchParams()
      if (q)    params.set('q', q)
      if (area) params.set('legal_area_id', area)
      params.set('limit', String(PAGE))
      params.set('skip', '0')
      api.get(`/theses?${params.toString()}`)
        .then(res => {
          setTheses(Array.isArray(res.data?.items) ? res.data.items : [])
          setTotal(typeof res.data?.total === 'number' ? res.data.total : 0)
        })
        .catch(() => toast.error('Erro ao carregar teses'))
        .finally(() => setLoading(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const loadMore = () => {
    const nextOffset = offset + PAGE
    setLoadingMore(true)

    if (IS_FIREBASE && userId) {
      listTheses(userId, {
        q: search || undefined,
        legalAreaId: areaFilter || undefined,
        limit: PAGE,
        skip: nextOffset,
      })
        .then(result => {
          setTheses(prev => [...prev, ...result.items.map(t => ({ ...t, id: t.id! } as ThesisItem))])
          setOffset(nextOffset)
        })
        .catch(() => toast.error('Erro ao carregar mais teses'))
        .finally(() => setLoadingMore(false))
    } else {
      const params = new URLSearchParams()
      if (search)     params.set('q', search)
      if (areaFilter) params.set('legal_area_id', areaFilter)
      params.set('limit', String(PAGE))
      params.set('skip', String(nextOffset))
      api.get(`/theses?${params.toString()}`)
        .then(res => {
          const items = Array.isArray(res.data?.items) ? res.data.items : []
          setTheses(prev => [...prev, ...items])
          setOffset(nextOffset)
        })
        .catch(() => toast.error('Erro ao carregar mais teses'))
        .finally(() => setLoadingMore(false))
    }
  }

  useEffect(() => {
    fetchTheses('', '')
    if (IS_FIREBASE && userId) {
      getThesisStats(userId)
        .then(s => setStats(s))
        .catch(() => toast.warning('Não foi possível atualizar estatísticas do banco de teses no momento'))
    } else {
      api.get('/theses/stats')
        .then(res => setStats(res.data))
        .catch(() => toast.error('Erro ao carregar estatísticas do banco de teses'))
    }
    if (IS_FIREBASE && !userId) return // Wait for auth

    // Auto-seed thesis bank on first load if empty (Firebase mode only)
    const initAndFetch = async () => {
      if (IS_FIREBASE && userId) {
        try {
          const seeded = await seedThesesIfEmpty(userId)
          if (seeded > 0) {
            toast.success(`Banco de teses populado com ${seeded} teses do acervo jurídico`)
          }
        } catch (e) {
          console.warn('Thesis seed check failed:', e)
        }
      }
      fetchTheses('', '')
      if (IS_FIREBASE && userId) {
        getThesisStats(userId)
          .then(s => setStats(s))
          .catch(() => toast.warning('Não foi possível atualizar estatísticas do banco de teses no momento'))
      } else {
        api.get('/theses/stats')
          .then(res => setStats(res.data))
          .catch(() => toast.error('Erro ao carregar estatísticas do banco de teses'))
      }
    }

    initAndFetch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Debounced search (400ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchTheses(search, areaFilter)
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, areaFilter])

  const handleAreaFilter = (area: string) => {
    setAreaFilter(prev => prev === area ? '' : area)
  }

  const sortedTheses = useMemo(() => {
    const copy = [...theses]
    switch (sortBy) {
      case 'quality': return copy.sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0))
      case 'usage': return copy.sort((a, b) => b.usage_count - a.usage_count)
      default: return copy // already sorted by recency from API
    }
  }, [theses, sortBy])

  const areaColor = (area: string) =>
    AREA_COLORS[area] ?? 'bg-gray-50 text-gray-700 border-gray-200'

  const activeAreaCount = stats ? Object.keys(stats.by_area).length : 0
  const activeFilterLabel = areaFilter
    ? AREA_LABELS[areaFilter] || areaFilter
    : search
      ? 'Busca ativa'
      : 'Sem filtros'

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(theses, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `teses-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCSV = () => {
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`
    const header = ['id', 'title', 'legal_area_id', 'quality_score', 'usage_count', 'tags', 'summary', 'content']
    const rows = theses.map(t => [
      t.id, t.title, t.legal_area_id,
      t.quality_score ?? '',
      t.usage_count,
      (t.tags || []).join(';'),
      t.summary ?? '',
      t.content,
    ].map(v => escape(String(v))).join(','))
    const csv = [header.join(','), ...rows].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `teses-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleThesisSaved = (saved: ThesisItem) => {
    setTheses(prev => {
      const idx = prev.findIndex(t => t.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [saved, ...prev]
    })
    if (!editingThesis) setTotal(t => t + 1)
    setEditingThesis(null)
    setModalOpen(false)
  }

  const handleThesisDelete = async (thesisId: string) => {
    setPendingDeleteId(thesisId)
  }

  const confirmDeleteThesis = async () => {
    if (!pendingDeleteId) return
    const thesisId = pendingDeleteId
    setPendingDeleteId(null)
    try {
      if (IS_FIREBASE && userId) {
        await deleteThesis(userId, thesisId)
      } else {
        await api.delete(`/theses/${thesisId}`)
      }
      setTheses(prev => prev.filter(t => t.id !== thesisId))
      setTotal(t => t - 1)
      if (expandedId === thesisId) setExpandedId(null)
      toast.success('Tese excluída com sucesso')
    } catch {
      toast.error('Erro ao excluir tese')
    }
  }

  return (
    <div className="space-y-6 v2-bridge-surface">
      {(modalOpen || editingThesis) && (
        <ThesisModal
          thesis={editingThesis}
          onClose={() => { setModalOpen(false); setEditingThesis(null) }}
          onSaved={handleThesisSaved}
        />
      )}

      {/* Analysis card — manual thesis curation pipeline (Firebase mode only) */}
      {IS_FIREBASE && userId && (
        <ThesisAnalysisCard
          onThesesChanged={() => {
            fetchTheses(search, areaFilter)
            if (userId) {
              getThesisStats(userId)
                .then(s => setStats(s))
                .catch(() => toast.warning('Não foi possível atualizar estatísticas do banco de teses no momento'))
            }
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Excluir tese"
        description="A tese selecionada será removida permanentemente."
        confirmText="Excluir tese"
        cancelText="Cancelar"
        danger
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={confirmDeleteThesis}
      />

      <V2PageHero
        eyebrow={<><BookOpen className="h-3.5 w-3.5" /> Banco de teses</>}
        title="Teses, padrões e repertório prontos para reutilização estratégica"
        description="Organize precedentes internos, compare qualidade, aplique filtros por área e mantenha um banco vivo para redação, revisão e análise crítica do acervo jurídico." 
        actions={(
          <>
            <button
              onClick={() => { setEditingThesis(null); setModalOpen(true) }}
              className="v2-btn-primary"
            >
              <Plus className="h-4 w-4" />
              Nova tese
            </button>
            {theses.length > 0 && (
              <>
                <button
                  onClick={handleExportCSV}
                  title="Exportar teses visíveis como CSV"
                  className="v2-btn-secondary"
                >
                  <Download className="h-4 w-4" />
                  CSV
                </button>
                <button
                  onClick={handleExport}
                  title="Exportar teses visíveis como JSON"
                  className="v2-btn-secondary"
                >
                  <Download className="h-4 w-4" />
                  JSON
                </button>
              </>
            )}
          </>
        )}
        aside={(
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Foco atual</p>
            <div className="rounded-[1.4rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">Filtro</p>
              <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">{activeFilterLabel}</p>
            </div>
            <div className="rounded-[1.4rem] bg-[rgba(255,255,255,0.82)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">Ordenação</p>
              <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">
                {sortBy === 'quality' ? 'Maior score' : sortBy === 'usage' ? 'Mais usada' : 'Mais recente'}
              </p>
            </div>
          </div>
        )}
      />

      <V2MetricGrid
        className="xl:grid-cols-4"
        items={[
          {
            label: 'Teses totais',
            value: total.toLocaleString('pt-BR'),
            helper: `${theses.length.toLocaleString('pt-BR')} carregadas nesta visao`,
            icon: BookOpen,
            tone: 'accent',
          },
          {
            label: 'Score medio',
            value: stats?.average_quality_score != null ? stats.average_quality_score.toFixed(1) : '—',
            helper: 'Qualidade consolidada do banco',
            icon: Star,
            tone: 'warm',
          },
          {
            label: 'Areas mapeadas',
            value: activeAreaCount.toLocaleString('pt-BR'),
            helper: 'Distribuicao atual do repertorio',
            icon: Tag,
          },
          {
            label: 'Busca e filtro',
            value: areaFilter || search ? 'Ativos' : 'Livres',
            helper: areaFilter ? AREA_LABELS[areaFilter] || areaFilter : search || 'Sem restricao operacional',
            icon: Search,
          },
        ]}
      />

      {/* Area stat cards */}
      {stats && Object.keys(stats.by_area).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {Object.entries(stats.by_area).map(([area, count]) => (
            <button
              key={area}
              onClick={() => handleAreaFilter(area)}
              className={`rounded-xl border-2 p-3 text-left transition-all ${
                areaFilter === area
                  ? 'border-brand-500 bg-brand-50 shadow-sm'
                  : 'border-transparent bg-white hover:border-gray-200 hover:shadow-sm'
              }`}
            >
              <p className="text-xs text-gray-500 mb-1">{AREA_LABELS[area] || area}</p>
              <p className="text-xl font-bold text-gray-900">{count}</p>
            </button>
          ))}
        </div>
      )}

      {/* Search + sort */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por título, conteúdo ou resumo..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'recent' | 'quality' | 'usage')}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:ring-2 focus:ring-brand-500"
        >
          <option value="recent">Mais recente</option>
          <option value="quality">Maior score</option>
          <option value="usage">Mais usada</option>
        </select>
      </div>

      {/* Area filter chip */}
      {areaFilter && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-gray-500">Filtrado por:</span>
          <button
            onClick={() => setAreaFilter('')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${areaColor(areaFilter)}`}
          >
            {AREA_LABELS[areaFilter] || areaFilter}
            <span className="opacity-60">×</span>
          </button>
        </div>
      )}

      {/* Thesis list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonItem key={i} />)}
        </div>
      ) : theses.length === 0 ? (
        <V2EmptyState
          icon={BookOpen}
          title="Nenhuma tese encontrada"
          description={search
            ? `Nenhum resultado para "${search}". Ajuste os termos, remova filtros ou amplie a area de busca.`
            : 'As teses passam a compor este banco automaticamente a partir dos documentos gerados. Voce tambem pode criar entradas manuais para consolidar seu repertorio.'
          }
          action={!search ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => { setEditingThesis(null); setModalOpen(true) }}
                className="v2-btn-primary"
              >
                <Plus className="h-4 w-4" />
                Criar tese manualmente
              </button>
              <Link
                to={buildWorkspaceNewDocumentPath({ preserveSearch: location.search })}
                className="v2-btn-secondary"
              >
                <FileText className="h-4 w-4" />
                Gerar documento
              </Link>
            </div>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {sortedTheses.map(thesis => (
            <ThesisCard
              key={thesis.id}
              thesis={thesis}
              expanded={expandedId === thesis.id}
              onToggle={() => setExpandedId(expandedId === thesis.id ? null : thesis.id)}
              onEdit={() => setEditingThesis(thesis)}
              onDelete={() => handleThesisDelete(thesis.id)}
              areaColor={areaColor(thesis.legal_area_id)}
            />
          ))}
          {theses.length < total && (
            <div className="text-center pt-2">
              <p className="text-xs text-gray-400 mb-2">
                Mostrando {theses.length} de {total} teses
              </p>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-50 transition-colors"
              >
                {loadingMore ? 'Carregando…' : 'Carregar mais 50'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ThesisCard({ thesis, expanded, onToggle, onEdit, onDelete, areaColor }: {
  thesis: ThesisItem
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  areaColor: string
}) {
  const scoreColor = !thesis.quality_score ? 'text-gray-400'
    : thesis.quality_score >= 80 ? 'text-green-600'
    : thesis.quality_score >= 60 ? 'text-amber-600'
    : 'text-red-600'

  return (
    <div className="v2-panel overflow-hidden border border-[var(--v2-line-soft)] transition-all hover:-translate-y-0.5">
      <button
        onClick={onToggle}
        className="w-full text-left p-5 flex items-start justify-between gap-4"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-medium text-[var(--v2-ink-strong)]">{thesis.title}</h3>
            {thesis.quality_score != null && (
              <span className={`flex items-center gap-0.5 text-xs font-medium whitespace-nowrap ${scoreColor}`}>
                <Star className="w-3 h-3 fill-current" />
                {thesis.quality_score}
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--v2-ink-soft)] line-clamp-2">
            {thesis.summary || thesis.content.substring(0, 160)}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`px-2 py-0.5 text-xs rounded-full border font-medium ${areaColor}`}>
              {AREA_LABELS[thesis.legal_area_id] || thesis.legal_area_id}
            </span>
            {thesis.source_type === 'auto_extracted' && (
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs rounded-full">
                Auto-extraída
              </span>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {thesis.usage_count}x utilizada
            </span>
          </div>
        </div>
        <span className="flex-shrink-0 mt-1 text-gray-400">
          {expanded
            ? <ChevronUp className="w-4 h-4" />
            : <ChevronDown className="w-4 h-4" />
          }
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--v2-line-soft)] px-5 pb-5 pt-4 space-y-3 bg-[rgba(255,255,255,0.55)]">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-[var(--v2-ink-faint)] uppercase tracking-wide">Conteudo completo</h4>
            <div className="flex items-center gap-3">
              <button
                onClick={e => { e.stopPropagation(); onEdit() }}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--v2-ink-soft)] hover:text-brand-600 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Editar
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDelete() }}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--v2-ink-soft)] hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir
              </button>
              <CopyButton text={thesis.content} />
            </div>
          </div>
          <div className="rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.84)] p-4">
            <p className="text-sm text-[var(--v2-ink-strong)] whitespace-pre-wrap leading-relaxed">{thesis.content}</p>
          </div>

          {thesis.tags && thesis.tags.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-[var(--v2-ink-faint)] uppercase tracking-wide mb-2">Tags</h4>
              <div className="flex flex-wrap gap-1.5">
                {thesis.tags.map((tag, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[rgba(15,23,42,0.06)] text-[var(--v2-ink-soft)] text-xs rounded-lg border border-[var(--v2-line-soft)]">
                    <Tag className="w-3 h-3" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-[var(--v2-ink-faint)]">
            Criada em {new Date(thesis.created_at).toLocaleDateString('pt-BR', {
              day: '2-digit', month: 'long', year: 'numeric',
            })}
            {thesis.document_type_id && ` · Tipo: ${thesis.document_type_id}`}
          </p>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plus, ChevronLeft, ChevronRight, Search, X, Trash2, Download, BookOpen, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import StatusBadge from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import { SkeletonRow } from '../components/Skeleton'
import ConfirmDialog from '../components/ConfirmDialog'
import { IS_FIREBASE } from '../lib/firebase'
import { listDocuments, deleteDocument as firestoreDeleteDoc } from '../lib/firestore-service'
import { DOCTYPE_LABELS } from '../lib/constants'
import { applyOrigemFilter, toggleFilter } from '../lib/document-filters'

interface Document {
  id: string
  document_type_id: string
  tema: string | null
  texto_completo?: string | null
  status: string
  quality_score: number | null
  created_at: string
  origem: string
  notebook_id?: string | null
  notebook_title?: string | null
}

const PAGE_SIZE = 20

export default function DocumentList() {
  const [docs, setDocs] = useState<Document[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('date_desc')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [originFilter, setOriginFilter] = useState('')
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkExporting, setBulkExporting] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { userId } = useAuth()
  const toast = useToast()

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Ctrl+K keyboard shortcut to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Debounce search input → searchQuery
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput.trim())
      setPage(0)
    }, 350)
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }
  }, [searchInput])

  useEffect(() => {
    setLoading(true)

    if (IS_FIREBASE && userId) {
      const [sbField, sbDir] = sortBy.split('_')
      listDocuments(userId, {
        status: statusFilter || undefined,
        document_type_id: typeFilter || undefined,
        sortBy: sbField === 'date' ? 'created_at' : 'quality_score',
        sortDir: sbDir,
      })
        .then(result => {
          let items = result.items.map(d => ({
            ...d,
            origem: d.origem || 'web',
            notebook_id: d.notebook_id ?? null,
            notebook_title: d.notebook_title ?? null,
          })) as Document[]
          // Client-side search filtering for Firebase mode
          if (searchQuery) {
            const q = searchQuery.toLowerCase()
            items = items.filter(d =>
              (d.tema && d.tema.toLowerCase().includes(q)) ||
              d.document_type_id.toLowerCase().includes(q) ||
              (d.texto_completo && d.texto_completo.toLowerCase().includes(q))
            )
          }
          // Client-side date filtering for Firebase mode
          if (dateFrom) {
            const fromDate = new Date(dateFrom).toISOString()
            items = items.filter(d => d.created_at >= fromDate)
          }
          if (dateTo) {
            const toDate = new Date(dateTo + 'T23:59:59').toISOString()
            items = items.filter(d => d.created_at <= toDate)
          }
          // Client-side origin filtering
          if (originFilter) {
            items = applyOrigemFilter(items, originFilter)
          }
          const totalFiltered = items.length
          // Client-side pagination
          const start = page * PAGE_SIZE
          items = items.slice(start, start + PAGE_SIZE)
          setDocs(items)
          setTotal(totalFiltered)
        })
        .catch(() => toast.error('Erro ao carregar documentos'))
        .finally(() => setLoading(false))
    } else {
      const params = new URLSearchParams({
        skip: String(page * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      })
      if (statusFilter) params.set('status', statusFilter)
      if (typeFilter) params.set('document_type_id', typeFilter)
      if (searchQuery) params.set('q', searchQuery)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      if (originFilter) params.set('origem', originFilter)
      const [sbField, sbDir] = sortBy.split('_')
      params.set('sort_by', sbField === 'date' ? 'created_at' : 'quality_score')
      params.set('sort_dir', sbDir)

      api.get(`/documents?${params}`)
        .then(res => {
          setDocs(Array.isArray(res.data?.items) ? res.data.items : [])
          setTotal(typeof res.data?.total === 'number' ? res.data.total : 0)
        })
        .catch(() => toast.error('Erro ao carregar documentos'))
        .finally(() => setLoading(false))
    }
  }, [page, statusFilter, typeFilter, searchQuery, sortBy, dateFrom, dateTo, originFilter, refreshKey]) // eslint-disable-line

  const handleStatusFilter = (s: string) => {
    setStatusFilter(prev => prev === s ? '' : s)
    setPage(0)
    setSelected(new Set())
  }

  const handleOriginFilter = (o: string) => {
    setOriginFilter(prev => toggleFilter(prev, o))
    setPage(0)
    setSelected(new Set())
  }

  const hasActiveFilters = statusFilter || typeFilter || searchQuery || dateFrom || dateTo || originFilter

  const clearAll = () => {
    setStatusFilter('')
    setTypeFilter('')
    setSearchInput('')
    setSearchQuery('')
    setSortBy('date_desc')
    setDateFrom('')
    setDateTo('')
    setOriginFilter('')
    setPage(0)
    setSelected(new Set())
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected(selected.size === docs.length && docs.length > 0
      ? new Set()
      : new Set(docs.map(d => d.id))
    )
  }

  const handleBulkExport = async () => {
    if (!selected.size) return
    setBulkExporting(true)
    try {
      const res = await api.post('/documents/bulk-export', { ids: Array.from(selected) }, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `lexio-${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      const { humanizeError } = await import('../lib/error-humanizer')
      const h = humanizeError(err)
      toast.error('Erro ao exportar', h.detail)
    } finally {
      setBulkExporting(false)
    }
  }

  const handleBulkDelete = async () => {
    if (!selected.size) return
    setShowBulkDeleteConfirm(true)
  }

  const confirmBulkDelete = async () => {
    if (!selected.size) return
    setBulkDeleting(true)
    setShowBulkDeleteConfirm(false)
    const ids = Array.from(selected)
    let errors = 0
    for (const docId of ids) {
      try {
        if (IS_FIREBASE && userId) {
          await firestoreDeleteDoc(userId, docId)
        } else {
          await api.delete(`/documents/${docId}`)
        }
      } catch { errors++ }
    }
    setBulkDeleting(false)
    setSelected(new Set())
    if (errors > 0) {
      toast.error(`${ids.length - errors} excluído(s), ${errors} com erro`)
    } else {
      toast.success(`${ids.length} documento(s) excluído(s)`)
    }
    setRefreshKey(k => k + 1)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Documentos</h1>
        <Link
          to="/documents/new"
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700"
        >
          <Plus className="w-4 h-4" />
          Novo Documento
        </Link>
      </div>

      {/* Search + type filter row */}
      <div className="flex gap-3 mb-3">
        {/* Search input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar por tema ou pedido… (Ctrl+K)"
            className="w-full pl-9 pr-8 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(''); setSearchQuery('') }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(0) }}
          className="text-sm border rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(DOCTYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => { setSortBy(e.target.value); setPage(0) }}
          className="text-sm border rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="date_desc">Mais recente</option>
          <option value="date_asc">Mais antigo</option>
          <option value="quality_desc">Maior score</option>
          <option value="quality_asc">Menor score</option>
        </select>
      </div>

      {/* Date range filter row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-gray-500 whitespace-nowrap">Período:</span>
        <button
          onClick={() => { const d = new Date(); d.setDate(d.getDate() - 7); setDateFrom(d.toISOString().slice(0, 10)); setDateTo(''); setPage(0) }}
          className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
            dateFrom && !dateTo && new Date(dateFrom).getTime() >= Date.now() - 8 * 86400000
              ? 'bg-brand-50 text-brand-700 border-brand-200'
              : 'bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          7 dias
        </button>
        <button
          onClick={() => { const d = new Date(); setDateFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); setDateTo(''); setPage(0) }}
          className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
            dateFrom && dateFrom.endsWith('-01') && !dateTo
              ? 'bg-brand-50 text-brand-700 border-brand-200'
              : 'bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          Este mês
        </button>
        <input
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={e => { setDateFrom(e.target.value); setPage(0) }}
          className="text-sm border rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <span className="text-xs text-gray-400">até</span>
        <input
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={e => { setDateTo(e.target.value); setPage(0) }}
          className="text-sm border rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setPage(0) }}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Limpar datas
          </button>
        )}
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {([
          { key: 'processando', label: 'Em processamento' },
          { key: 'concluido', label: 'Concluídos' },
          { key: 'em_revisao', label: 'Em revisão' },
          { key: 'aprovado', label: 'Aprovados' },
          { key: 'rejeitado', label: 'Rejeitados' },
          { key: 'erro', label: 'Com erro' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleStatusFilter(key)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              statusFilter === key
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
        {/* Origin filter chip */}
        <button
          onClick={() => handleOriginFilter('caderno')}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-colors ${
            originFilter === 'caderno'
              ? 'bg-violet-600 text-white border-violet-600'
              : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50'
          }`}
        >
          <BookOpen className="w-3 h-3" />
          Do Caderno
        </button>
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="px-3 py-1 rounded-full text-xs border text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Limpar filtros
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Tema</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Score</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
            </tbody>
          </table>
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-300" />
          </div>
          <p className="font-medium text-gray-700 mb-1">Nenhum documento encontrado</p>
          <p className="text-sm text-gray-400 mb-4">
            {hasActiveFilters ? 'Nenhum documento corresponde aos filtros ativos.' : 'Comece gerando seu primeiro documento jurídico com IA.'}
          </p>
          {hasActiveFilters ? (
            <button onClick={clearAll} className="text-sm text-brand-600 hover:underline">
              Limpar filtros
            </button>
          ) : (
            <Link
              to="/documents/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Gerar primeiro documento
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-brand-50 border border-brand-200 rounded-lg">
              <span className="text-sm text-brand-700 font-medium flex-1">
                {selected.size} documento{selected.size !== 1 ? 's' : ''} selecionado{selected.size !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-brand-500 hover:text-brand-700"
              >
                Desmarcar
              </button>
              <button
                onClick={handleBulkExport}
                disabled={bulkExporting}
                className="inline-flex items-center gap-1.5 text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {bulkExporting ? 'Exportando…' : 'Baixar .zip'}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="inline-flex items-center gap-1.5 text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {bulkDeleting ? 'Excluindo…' : 'Excluir selecionados'}
              </button>
            </div>
          )}

          {/* Mobile-scrollable table wrapper */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="pl-4 pr-2 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === docs.length && docs.length > 0}
                        ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < docs.length }}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-brand-600"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Tema</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {docs.map((doc) => (
                    <tr key={doc.id} className={`hover:bg-gray-50 transition-colors ${selected.has(doc.id) ? 'bg-brand-50/50' : ''}`}>
                      <td className="pl-4 pr-2 py-4">
                        <input
                          type="checkbox"
                          checked={selected.has(doc.id)}
                          onChange={() => toggleSelect(doc.id)}
                          className="rounded border-gray-300 text-brand-600"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <Link to={`/documents/${doc.id}`} className="text-brand-600 hover:text-brand-800 hover:underline font-medium text-sm">
                          {DOCTYPE_LABELS[doc.document_type_id] || (doc.document_type_id === 'documento_caderno' ? 'Documento' : doc.document_type_id)}
                        </Link>
                        {doc.origem === 'caderno' ? (
                          <>
                          {doc.notebook_id ? (
                            <Link
                              to={`/notebook?open=${doc.notebook_id}`}
                              className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-50 text-violet-700 border border-violet-100 hover:bg-violet-100 transition-colors"
                              title={doc.notebook_title ? `Abrir caderno: ${doc.notebook_title}` : 'Abrir Caderno de Pesquisa'}
                            >
                              <BookOpen className="w-2.5 h-2.5" />
                              Caderno
                            </Link>
                          ) : (
                            <span
                              className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-50 text-violet-700 border border-violet-100"
                              title="Gerado no Caderno de Pesquisa"
                            >
                              <BookOpen className="w-2.5 h-2.5" />
                              Caderno
                            </span>
                          )}
                          <Link
                            to={`/documents/new?request=${encodeURIComponent(doc.tema || '')}`}
                            className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100 transition-colors"
                            title="Recriar no Gerador"
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                            Gerador
                          </Link>
                          </>
                        ) : doc.origem && doc.origem !== 'web' && (
                          <span className={`ml-2 inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${
                            doc.origem === 'whatsapp'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {doc.origem === 'whatsapp' ? 'WhatsApp' : doc.origem.toUpperCase()}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700 max-w-md">
                        <span className="line-clamp-1 font-medium">{doc.tema || <span className="text-gray-400">—</span>}</span>
                        {doc.texto_completo && (
                          <p className="line-clamp-2 text-xs text-gray-400 mt-0.5 leading-relaxed">
                            {doc.texto_completo.replace(/^#+\s.+\n+/gm, '').replace(/\*+/g, '').trim().slice(0, 200)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4"><StatusBadge status={doc.status} /></td>
                      <td className="px-4 py-4 text-sm">
                        {doc.quality_score != null ? (
                          <span className={`font-semibold ${
                            doc.quality_score >= 80 ? 'text-green-600'
                            : doc.quality_score >= 60 ? 'text-amber-600'
                            : 'text-red-600'
                          }`}>
                            {doc.quality_score}/100
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {format(new Date(doc.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total} documentos
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </button>
                <span className="flex items-center px-3 py-1.5 text-sm text-gray-600">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  Próxima <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        title="Excluir documentos selecionados"
        description={`Você está prestes a remover ${selected.size} documento(s) permanentemente. Esta ação não pode ser desfeita.`}
        confirmText="Excluir permanentemente"
        cancelText="Cancelar"
        danger
        loading={bulkDeleting}
        onCancel={() => setShowBulkDeleteConfirm(false)}
        onConfirm={confirmBulkDelete}
      />
    </div>
  )
}

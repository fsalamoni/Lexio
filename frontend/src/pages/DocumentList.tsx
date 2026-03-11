import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plus, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import api from '../api/client'
import StatusBadge from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import { SkeletonRow } from '../components/Skeleton'

interface Document {
  id: string
  document_type_id: string
  tema: string | null
  status: string
  quality_score: number | null
  created_at: string
  origem: string
}

const DOCTYPE_LABELS: Record<string, string> = {
  parecer: 'Parecer',
  peticao_inicial: 'Petição Inicial',
  contestacao: 'Contestação',
  recurso: 'Recurso',
  sentenca: 'Sentença',
  acao_civil_publica: 'Ação Civil Pública',
}

const STATUS_LABELS: Record<string, string> = {
  processando: 'Em processamento',
  concluido: 'Concluídos',
  em_revisao: 'Em revisão',
  aprovado: 'Aprovados',
  rejeitado: 'Rejeitados',
  erro: 'Com erro',
}

const PAGE_SIZE = 20

export default function DocumentList() {
  const [docs, setDocs] = useState<Document[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toast = useToast()

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({
      skip: String(page * PAGE_SIZE),
      limit: String(PAGE_SIZE),
    })
    if (statusFilter) params.set('status', statusFilter)
    if (typeFilter) params.set('document_type_id', typeFilter)
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim())

    api.get(`/documents?${params}`)
      .then(res => {
        setDocs(Array.isArray(res.data?.items) ? res.data.items : [])
        setTotal(typeof res.data?.total === 'number' ? res.data.total : 0)
      })
      .catch(() => toast.error('Erro ao carregar documentos'))
      .finally(() => setLoading(false))
  }, [page, statusFilter, typeFilter, debouncedSearch]) // eslint-disable-line

  const clearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setStatusFilter('')
    setTypeFilter('')
    setPage(0)
  }

  const hasActiveFilters = statusFilter || typeFilter || debouncedSearch

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

      {/* Search bar */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por tema ou descrição..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Status filters */}
        {(['processando', 'concluido', 'em_revisao', 'aprovado', 'rejeitado', 'erro'] as const).map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(prev => prev === s ? '' : s); setPage(0) }}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              statusFilter === s
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}

        {/* Separator */}
        <span className="w-px bg-gray-200 my-0.5" />

        {/* Type filters */}
        {Object.entries(DOCTYPE_LABELS).map(([id, label]) => (
          <button
            key={id}
            onClick={() => { setTypeFilter(prev => prev === id ? '' : id); setPage(0) }}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              typeFilter === id
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-1 rounded-full text-xs border text-gray-400 hover:text-gray-600"
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
          <p className="text-sm text-gray-400">
            {hasActiveFilters
              ? 'Nenhum resultado com os filtros aplicados.'
              : 'Crie seu primeiro documento usando o botão acima.'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-3 text-xs text-brand-600 hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Result count when searching */}
          {hasActiveFilters && (
            <p className="text-xs text-gray-500 mb-2">{total} resultado{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}</p>
          )}

          {/* Mobile-scrollable table wrapper */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Tema</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Score</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {docs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <Link to={`/documents/${doc.id}`} className="text-brand-600 hover:text-brand-800 hover:underline font-medium text-sm">
                          {DOCTYPE_LABELS[doc.document_type_id] || doc.document_type_id}
                        </Link>
                        {doc.origem === 'whatsapp' && (
                          <span className="ml-1.5 text-xs text-green-600 font-medium">WhatsApp</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 max-w-xs">
                        <span className="line-clamp-1">{doc.tema || <span className="text-gray-400">—</span>}</span>
                      </td>
                      <td className="px-6 py-4"><StatusBadge status={doc.status} /></td>
                      <td className="px-6 py-4 text-sm">
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
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
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
    </div>
  )
}

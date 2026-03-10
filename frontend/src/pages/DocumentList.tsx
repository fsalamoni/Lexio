import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
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

const PAGE_SIZE = 20

export default function DocumentList() {
  const [docs, setDocs] = useState<Document[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const toast = useToast()

  const totalPages = Math.ceil(total / PAGE_SIZE)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({
      skip: String(page * PAGE_SIZE),
      limit: String(PAGE_SIZE),
    })
    if (statusFilter) params.set('status', statusFilter)

    api.get(`/documents?${params}`)
      .then(res => {
        setDocs(Array.isArray(res.data?.items) ? res.data.items : [])
        setTotal(typeof res.data?.total === 'number' ? res.data.total : 0)
      })
      .catch(() => toast.error('Erro ao carregar documentos'))
      .finally(() => setLoading(false))
  }, [page, statusFilter]) // eslint-disable-line

  const handleStatusFilter = (s: string) => {
    setStatusFilter(prev => prev === s ? '' : s)
    setPage(0)
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
        {statusFilter && (
          <button
            onClick={() => { setStatusFilter(''); setPage(0) }}
            className="px-3 py-1 rounded-full text-xs border text-gray-400 hover:text-gray-600"
          >
            Limpar filtro
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
            {statusFilter ? 'Nenhum documento com esse status.' : 'Crie seu primeiro documento usando o botão acima.'}
          </p>
        </div>
      ) : (
        <>
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

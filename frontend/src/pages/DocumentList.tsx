import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import api from '../api/client'
import StatusBadge from '../components/StatusBadge'

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
        setDocs(res.data.items)
        setTotal(res.data.total)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, statusFilter])

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
      <div className="flex gap-2 mb-4">
        {['processando', 'concluido', 'erro'].map(s => (
          <button
            key={s}
            onClick={() => handleStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors capitalize ${
              statusFilter === s
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s === 'processando' ? 'Em processamento' : s === 'concluido' ? 'Concluídos' : 'Com erro'}
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
        <p className="text-gray-500">Carregando...</p>
      ) : docs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Nenhum documento encontrado</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tema</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link to={`/documents/${doc.id}`} className="text-brand-600 hover:underline font-medium">
                        {DOCTYPE_LABELS[doc.document_type_id] || doc.document_type_id}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">{doc.tema || '—'}</td>
                    <td className="px-6 py-4"><StatusBadge status={doc.status} /></td>
                    <td className="px-6 py-4 text-sm">
                      {doc.quality_score != null ? (
                        <span className={`font-medium ${doc.quality_score >= 80 ? 'text-green-600' : doc.quality_score >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {doc.quality_score}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {format(new Date(doc.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

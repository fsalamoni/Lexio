import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, FileText } from 'lucide-react'
import api from '../api/client'
import StatusBadge from '../components/StatusBadge'
import ProgressTracker from '../components/ProgressTracker'

interface DocumentData {
  id: string
  document_type_id: string
  tema: string | null
  status: string
  quality_score: number | null
  original_request: string
  created_at: string
  docx_path: string | null
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>()
  const [doc, setDoc] = useState<DocumentData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const fetchDoc = () => {
      api.get(`/documents/${id}`)
        .then((res) => setDoc(res.data))
        .catch(() => {})
        .finally(() => setLoading(false))
    }
    fetchDoc()
    const interval = setInterval(fetchDoc, 5000)
    return () => clearInterval(interval)
  }, [id])

  if (loading) return <p className="text-gray-500">Carregando...</p>
  if (!doc) return <p className="text-red-500">Documento não encontrado</p>

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <FileText className="w-8 h-8 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 capitalize">{doc.document_type_id}</h1>
          <p className="text-gray-500">{doc.tema || 'Processando...'}</p>
        </div>
        <div className="ml-auto">
          <StatusBadge status={doc.status} />
        </div>
      </div>

      {doc.status === 'processando' && id && (
        <div className="mb-6">
          <ProgressTracker documentId={id} />
        </div>
      )}

      <div className="bg-white rounded-xl border p-6 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-1">Solicitação Original</h2>
          <p className="text-gray-800">{doc.original_request}</p>
        </div>

        {doc.quality_score !== null && (
          <div>
            <h2 className="text-sm font-medium text-gray-500 mb-1">Score de Qualidade</h2>
            <p className="text-2xl font-bold text-brand-600">{doc.quality_score}/100</p>
          </div>
        )}

        {doc.status === 'concluido' && doc.docx_path && (
          <a
            href={`/api/v1/documents/${doc.id}/download`}
            className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700"
          >
            <Download className="w-4 h-4" />
            Baixar DOCX
          </a>
        )}
      </div>
    </div>
  )
}

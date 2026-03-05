import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, FileText, Edit3 } from 'lucide-react'
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
  legal_area_ids: string[]
  texto_completo: string | null
}

const DOCTYPE_LABELS: Record<string, string> = {
  parecer: 'Parecer',
  peticao_inicial: 'Petição Inicial',
  contestacao: 'Contestação',
  recurso: 'Recurso',
  sentenca: 'Sentença',
  acao_civil_publica: 'Ação Civil Pública',
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
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

  const docLabel = DOCTYPE_LABELS[doc.document_type_id] || doc.document_type_id

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <FileText className="w-8 h-8 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{docLabel}</h1>
          <p className="text-gray-500">{doc.tema || 'Processando...'}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
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

        {/* Action buttons */}
        {doc.status === 'concluido' && (
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => navigate(`/documents/${doc.id}/edit`)}
              className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors"
            >
              <Edit3 className="w-4 h-4" />
              Editar Documento
            </button>
            {doc.docx_path && (
              <a
                href={`/api/v1/documents/${doc.id}/download`}
                className="inline-flex items-center gap-2 border border-brand-600 text-brand-600 px-4 py-2 rounded-lg hover:bg-brand-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Baixar DOCX
              </a>
            )}
          </div>
        )}
      </div>

      {/* Document preview */}
      {doc.texto_completo && (
        <div className="bg-white rounded-xl border p-6 mt-6">
          <h2 className="text-sm font-medium text-gray-500 mb-3">Pré-visualização</h2>
          <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap">
            {doc.texto_completo.length > 2000
              ? doc.texto_completo.substring(0, 2000) + '...'
              : doc.texto_completo
            }
          </div>
          {doc.texto_completo.length > 2000 && (
            <button
              onClick={() => navigate(`/documents/${doc.id}/edit`)}
              className="mt-3 text-sm text-brand-600 hover:underline"
            >
              Ver documento completo no editor
            </button>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="bg-white rounded-xl border p-6 mt-6">
        <h2 className="text-sm font-medium text-gray-500 mb-3">Informações</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Tipo</dt>
            <dd className="font-medium text-gray-900">{docLabel}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Criado em</dt>
            <dd className="font-medium text-gray-900">
              {new Date(doc.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </dd>
          </div>
          {doc.legal_area_ids && doc.legal_area_ids.length > 0 && (
            <div className="col-span-2">
              <dt className="text-gray-500 mb-1">Áreas do Direito</dt>
              <dd className="flex gap-2">
                {doc.legal_area_ids.map(area => (
                  <span key={area} className="px-2 py-0.5 bg-brand-50 text-brand-700 text-xs rounded-full">
                    {area}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}

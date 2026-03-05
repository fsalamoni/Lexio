import { useState, useEffect } from 'react'
import { BookOpen, Search, Tag, ChevronDown, ChevronUp, Plus, Star } from 'lucide-react'
import api from '../api/client'

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

const AREA_LABELS: Record<string, string> = {
  administrative: 'Administrativo',
  constitutional: 'Constitucional',
  civil: 'Civil',
  tax: 'Tributário',
  labor: 'Trabalho',
}

export default function ThesisBank() {
  const [theses, setTheses] = useState<ThesisItem[]>([])
  const [stats, setStats] = useState<ThesisStats | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchTheses = (q?: string, area?: string) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (area) params.set('legal_area_id', area)
    params.set('limit', '50')

    api.get(`/theses?${params.toString()}`)
      .then(res => {
        setTheses(res.data.items)
        setTotal(res.data.total)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchTheses()
    api.get('/theses/stats')
      .then(res => setStats(res.data))
      .catch(() => {})
  }, [])

  const handleSearch = () => {
    setLoading(true)
    fetchTheses(search, areaFilter)
  }

  const handleAreaFilter = (area: string) => {
    const newArea = area === areaFilter ? '' : area
    setAreaFilter(newArea)
    setLoading(true)
    fetchTheses(search, newArea)
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <BookOpen className="w-8 h-8 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Banco de Teses</h1>
          <p className="text-gray-500">
            {total} teses jurídicas
            {stats?.average_quality_score && (
              <span className="ml-2">· Score médio: {stats.average_quality_score}</span>
            )}
          </p>
        </div>
      </div>

      {/* Stats */}
      {stats && Object.keys(stats.by_area).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {Object.entries(stats.by_area).map(([area, count]) => (
            <button
              key={area}
              onClick={() => handleAreaFilter(area)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                areaFilter === area
                  ? 'border-brand-600 bg-brand-50'
                  : 'hover:bg-gray-50'
              }`}
            >
              <p className="text-xs text-gray-500">{AREA_LABELS[area] || area}</p>
              <p className="text-lg font-bold text-gray-900">{count}</p>
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Buscar teses por título, conteúdo ou resumo..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
        >
          Buscar
        </button>
      </div>

      {/* Thesis List */}
      {loading ? (
        <p className="text-gray-500">Carregando teses...</p>
      ) : theses.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-1">Nenhuma tese encontrada</p>
          <p className="text-sm text-gray-400">
            As teses são extraídas automaticamente dos documentos gerados.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {theses.map(thesis => (
            <div
              key={thesis.id}
              className="bg-white rounded-xl border overflow-hidden hover:shadow-sm transition-shadow"
            >
              <button
                onClick={() => setExpandedId(expandedId === thesis.id ? null : thesis.id)}
                className="w-full text-left p-4 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-gray-900 truncate">{thesis.title}</h3>
                    {thesis.quality_score != null && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-600 whitespace-nowrap">
                        <Star className="w-3 h-3 fill-amber-400" />
                        {thesis.quality_score}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-2">
                    {thesis.summary || thesis.content.substring(0, 150)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-0.5 bg-brand-50 text-brand-700 text-xs rounded-full">
                      {AREA_LABELS[thesis.legal_area_id] || thesis.legal_area_id}
                    </span>
                    {thesis.source_type === 'auto_extracted' && (
                      <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full">
                        Auto
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      Usado {thesis.usage_count}x
                    </span>
                  </div>
                </div>
                {expandedId === thesis.id ? (
                  <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
                )}
              </button>

              {expandedId === thesis.id && (
                <div className="px-4 pb-4 border-t pt-4 space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Conteúdo</h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{thesis.content}</p>
                  </div>

                  {thesis.tags && thesis.tags.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Tags</h4>
                      <div className="flex flex-wrap gap-1">
                        {thesis.tags.map((tag, i) => (
                          <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                            <Tag className="w-3 h-3" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-400">
                    Criada em {new Date(thesis.created_at).toLocaleDateString('pt-BR')}
                    {thesis.document_type_id && ` · Tipo: ${thesis.document_type_id}`}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

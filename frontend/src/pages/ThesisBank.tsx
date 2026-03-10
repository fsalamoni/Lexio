import { useState, useEffect, useRef, useCallback } from 'react'
import { BookOpen, Search, Tag, ChevronDown, ChevronUp, Star, Copy, Check as CheckIcon } from 'lucide-react'
import api from '../api/client'
import { useToast } from '../components/Toast'
import { SkeletonItem } from '../components/Skeleton'

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

const AREA_COLORS: Record<string, string> = {
  administrative: 'bg-purple-50 text-purple-700 border-purple-200',
  constitutional:  'bg-red-50    text-red-700    border-red-200',
  civil:           'bg-blue-50   text-blue-700   border-blue-200',
  tax:             'bg-orange-50 text-orange-700 border-orange-200',
  labor:           'bg-teal-50   text-teal-700   border-teal-200',
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

export default function ThesisBank() {
  const [theses, setTheses] = useState<ThesisItem[]>([])
  const [stats, setStats] = useState<ThesisStats | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toast = useToast()

  const fetchTheses = useCallback((q: string, area: string) => {
    const params = new URLSearchParams()
    if (q)    params.set('q', q)
    if (area) params.set('legal_area_id', area)
    params.set('limit', '50')

    setLoading(true)
    api.get(`/theses?${params.toString()}`)
      .then(res => {
        setTheses(Array.isArray(res.data?.items) ? res.data.items : [])
        setTotal(typeof res.data?.total === 'number' ? res.data.total : 0)
      })
      .catch(() => toast.error('Erro ao carregar teses'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchTheses('', '')
    api.get('/theses/stats')
      .then(res => setStats(res.data))
      .catch(() => toast.error('Erro ao carregar estatísticas do banco de teses'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const areaColor = (area: string) =>
    AREA_COLORS[area] ?? 'bg-gray-50 text-gray-700 border-gray-200'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Banco de Teses</h1>
          <p className="text-sm text-gray-500">
            {total} teses jurídicas
            {stats?.average_quality_score != null && (
              <span className="ml-2 text-amber-600">
                · Score médio: <strong>{stats.average_quality_score.toFixed(1)}</strong>
              </span>
            )}
          </p>
        </div>
      </div>

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

      {/* Search */}
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
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-gray-300" />
          </div>
          <p className="font-medium text-gray-700 mb-1">Nenhuma tese encontrada</p>
          <p className="text-sm text-gray-400">
            {search
              ? `Nenhum resultado para "${search}". Tente outros termos.`
              : 'As teses são extraídas automaticamente dos documentos gerados.'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {theses.map(thesis => (
            <ThesisCard
              key={thesis.id}
              thesis={thesis}
              expanded={expandedId === thesis.id}
              onToggle={() => setExpandedId(expandedId === thesis.id ? null : thesis.id)}
              areaColor={areaColor(thesis.legal_area_id)}
            />
          ))}
          {total > 50 && (
            <p className="text-sm text-gray-400 text-center pt-2">
              Mostrando 50 de {total} teses. Refine a busca para ver resultados mais específicos.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ThesisCard({ thesis, expanded, onToggle, areaColor }: {
  thesis: ThesisItem
  expanded: boolean
  onToggle: () => void
  areaColor: string
}) {
  const scoreColor = !thesis.quality_score ? 'text-gray-400'
    : thesis.quality_score >= 80 ? 'text-green-600'
    : thesis.quality_score >= 60 ? 'text-amber-600'
    : 'text-red-600'

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-sm hover:border-gray-300 transition-all">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 flex items-start justify-between gap-4"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-medium text-gray-900">{thesis.title}</h3>
            {thesis.quality_score != null && (
              <span className={`flex items-center gap-0.5 text-xs font-medium whitespace-nowrap ${scoreColor}`}>
                <Star className="w-3 h-3 fill-current" />
                {thesis.quality_score}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 line-clamp-2">
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
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conteúdo Completo</h4>
            <CopyButton text={thesis.content} />
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{thesis.content}</p>
          </div>

          {thesis.tags && thesis.tags.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tags</h4>
              <div className="flex flex-wrap gap-1.5">
                {thesis.tags.map((tag, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg border border-gray-200">
                    <Tag className="w-3 h-3" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400">
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

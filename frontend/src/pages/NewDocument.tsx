import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, FileText } from 'lucide-react'
import api from '../api/client'
import { useToast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'

interface DocType {
  id: string
  name: string
  description: string
  templates: string[]
}

interface LegalAreaOption {
  id: string
  name: string
  description: string
}

interface ContextField {
  key: string
  label: string
  type: string
  placeholder?: string
  required?: boolean
  options?: { value: string; label: string }[]
  default?: any
}

export default function NewDocument() {
  const [docTypes, setDocTypes] = useState<DocType[]>([])
  const [legalAreas, setLegalAreas] = useState<LegalAreaOption[]>([])
  const [contextFields, setContextFields] = useState<ContextField[]>([])
  const [selectedType, setSelectedType] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [selectedAreas, setSelectedAreas] = useState<string[]>([])
  const [request, setRequest] = useState('')
  const [contextData, setContextData] = useState<Record<string, any>>({})
  const [showContext, setShowContext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingTypes, setLoadingTypes] = useState(true)
  const navigate = useNavigate()
  const toast = useToast()

  const MAX_REQUEST = 2000

  useEffect(() => {
    Promise.all([
      api.get('/document-types').then(res => setDocTypes(res.data)),
      api.get('/legal-areas').then(res => setLegalAreas(res.data)),
    ]).catch(() => {}).finally(() => setLoadingTypes(false))
  }, [])

  // Load context fields when document type changes
  useEffect(() => {
    if (selectedType) {
      api.get(`/anamnesis/request-fields/${selectedType}`)
        .then(res => {
          setContextFields(res.data.fields || [])
          setContextData({})
        })
        .catch(() => setContextFields([]))
    } else {
      setContextFields([])
      setContextData({})
    }
  }, [selectedType])

  const currentType = docTypes.find((t) => t.id === selectedType)

  const updateContextField = (key: string, value: any) => {
    setContextData(prev => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedType || !request.trim()) return
    setLoading(true)
    try {
      const res = await api.post('/documents', {
        document_type_id: selectedType,
        original_request: request,
        template_variant: selectedTemplate || null,
        legal_area_ids: selectedAreas.length > 0 ? selectedAreas : null,
        request_context: Object.keys(contextData).length > 0 ? contextData : null,
      })
      navigate(`/documents/${res.data.id}`)
    } catch (err: any) {
      toast.error('Erro ao criar documento', err?.response?.data?.detail || err?.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Novo Documento</h1>
          <p className="text-sm text-gray-500">Preencha os campos abaixo para iniciar a geração</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Main form */}
        <div className="bg-white rounded-xl border shadow-sm p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Documento <span className="text-red-500">*</span>
            </label>
            {loadingTypes ? (
              <Skeleton className="h-10 w-full rounded-lg" />
            ) : (
              <select
                value={selectedType}
                onChange={(e) => { setSelectedType(e.target.value); setSelectedTemplate(''); }}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                required
              >
                <option value="">Selecione o tipo...</option>
                {docTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {currentType && currentType.templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Template</label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full border rounded-lg px-4 py-2"
              >
                <option value="">Genérico</option>
                {currentType.templates.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Áreas do Direito</label>
            <div className="flex flex-wrap gap-2">
              {legalAreas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => setSelectedAreas((prev) =>
                    prev.includes(area.id)
                      ? prev.filter((a) => a !== area.id)
                      : [...prev, area.id]
                  )}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    selectedAreas.includes(area.id)
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {area.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Solicitação <span className="text-red-500">*</span>
              </label>
              <span className={`text-xs tabular-nums ${request.length > MAX_REQUEST * 0.9 ? 'text-amber-600' : 'text-gray-400'}`}>
                {request.length}/{MAX_REQUEST}
              </span>
            </div>
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value.slice(0, MAX_REQUEST))}
              rows={6}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm resize-y"
              placeholder="Descreva a questão jurídica que deseja analisar..."
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Seja específico — inclua fatos, legislação aplicável e o resultado esperado.
            </p>
          </div>
        </div>

        {/* Anamnesis context fields (collapsible) */}
        {contextFields.length > 0 && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <button
              type="button"
              onClick={() => setShowContext(!showContext)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
            >
              <div>
                <span className="text-sm font-medium text-gray-700">Contexto detalhado</span>
                <span className="text-xs text-gray-400 ml-2">(opcional — melhora a qualidade)</span>
              </div>
              {showContext
                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                : <ChevronDown className="w-4 h-4 text-gray-400" />
              }
            </button>
            {showContext && (
              <div className="p-6 pt-0 space-y-4">
                {contextFields.map(field => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {(field.type === 'text') && (
                      <input
                        type="text"
                        value={contextData[field.key] || ''}
                        onChange={e => updateContextField(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500"
                      />
                    )}
                    {field.type === 'textarea' && (
                      <textarea
                        value={contextData[field.key] || ''}
                        onChange={e => updateContextField(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        rows={3}
                        className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500"
                      />
                    )}
                    {field.type === 'select' && (
                      <select
                        value={contextData[field.key] || ''}
                        onChange={e => updateContextField(field.key, e.target.value)}
                        className="w-full border rounded-lg px-4 py-2"
                      >
                        <option value="">Selecione...</option>
                        {field.options?.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                    {field.type === 'boolean' && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={contextData[field.key] ?? field.default ?? false}
                          onChange={e => updateContextField(field.key, e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-brand-600"
                        />
                        <span className="text-sm text-gray-600">Sim</span>
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || loadingTypes || !selectedType || !request.trim()}
          className="w-full bg-brand-600 text-white py-3.5 rounded-xl hover:bg-brand-700 disabled:opacity-50 font-semibold text-sm transition-colors shadow-sm disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Gerando documento...
            </span>
          ) : 'Gerar Documento com IA'}
        </button>
      </form>
    </div>
  )
}

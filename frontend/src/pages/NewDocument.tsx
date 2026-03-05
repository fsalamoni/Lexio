import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import api from '../api/client'

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
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/document-types').then((res) => setDocTypes(res.data)).catch(() => {})
    api.get('/legal-areas').then((res) => setLegalAreas(res.data)).catch(() => {})
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
    } catch {
      alert('Erro ao criar documento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Novo Documento</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Main form */}
        <div className="bg-white rounded-xl border p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Documento</label>
            <select
              value={selectedType}
              onChange={(e) => { setSelectedType(e.target.value); setSelectedTemplate(''); }}
              className="w-full border rounded-lg px-4 py-2"
              required
            >
              <option value="">Selecione...</option>
              {docTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Solicitação</label>
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              rows={6}
              className="w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand-500"
              placeholder="Descreva a questão jurídica que deseja analisar..."
              required
            />
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
          disabled={loading || !selectedType || !request.trim()}
          className="w-full bg-brand-600 text-white py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium"
        >
          {loading ? 'Criando...' : 'Gerar Documento'}
        </button>
      </form>
    </div>
  )
}

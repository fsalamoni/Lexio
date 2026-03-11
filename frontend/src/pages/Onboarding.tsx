import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scale, ChevronRight, ChevronLeft, Check } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { IS_FIREBASE } from '../lib/firebase'
import { getWizardData, completeOnboarding } from '../lib/firestore-service'

interface WizardStep {
  step: number
  title: string
  description: string
  fields: Field[]
}

interface Field {
  key: string
  label: string
  type: string
  placeholder?: string
  required?: boolean
  options?: { value: string; label: string }[]
  default?: any
}

export default function Onboarding() {
  const [steps, setSteps] = useState<WizardStep[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [data, setData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { userId } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  useEffect(() => {
    if (IS_FIREBASE && userId) {
      getWizardData(userId)
        .then(result => {
          setSteps(result.onboarding_steps || [])
          if (result.profile) {
            setData(result.profile)
          }
          if (result.onboarding_completed) {
            navigate('/')
          }
        })
        .catch(() => toast.error('Erro ao carregar configurações de perfil'))
        .finally(() => setLoading(false))
    } else {
      api.get('/anamnesis/wizard')
        .then(res => {
          setSteps(res.data.onboarding_steps || [])
          if (res.data.profile) {
            setData(res.data.profile)
          }
          if (res.data.onboarding_completed) {
            navigate('/')
          }
        })
        .catch(() => toast.error('Erro ao carregar configurações de perfil'))
        .finally(() => setLoading(false))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateField = (key: string, value: any) => {
    setData(prev => ({ ...prev, [key]: value }))
  }

  const toggleMultiSelect = (key: string, value: string) => {
    setData(prev => {
      const current = prev[key] || []
      const updated = current.includes(value)
        ? current.filter((v: string) => v !== value)
        : [...current, value]
      return { ...prev, [key]: updated }
    })
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleComplete = async () => {
    setSaving(true)
    try {
      if (IS_FIREBASE && userId) {
        await completeOnboarding(userId, data)
      } else {
        await api.post('/anamnesis/onboarding', data)
      }
      navigate('/')
    } catch (err: any) {
      toast.error('Erro ao salvar perfil', err?.response?.data?.detail || err?.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = async () => {
    setSaving(true)
    try {
      if (IS_FIREBASE && userId) {
        await completeOnboarding(userId, {})
      } else {
        await api.post('/anamnesis/onboarding', {})
      }
      navigate('/')
    } catch {
      navigate('/')
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Carregando...</p></div>
  if (steps.length === 0) return null

  const step = steps[currentStep]
  const isLast = currentStep === steps.length - 1

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <Scale className="w-10 h-10 text-brand-600 mx-auto mb-2" />
          <h1 className="text-2xl font-bold text-brand-900">Bem-vindo ao Lexio</h1>
          <p className="text-gray-500 mt-1">Configure seu perfil para resultados personalizados</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((_, i) => (
            <div key={i} className={`h-2 w-12 rounded-full transition-colors ${
              i <= currentStep ? 'bg-brand-600' : 'bg-gray-200'
            }`} />
          ))}
        </div>

        {/* Step content */}
        <div className="bg-white rounded-xl border shadow-sm p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900">{step.title}</h2>
            <p className="text-gray-500 text-sm mt-1">{step.description}</p>
          </div>

          <div className="space-y-5">
            {step.fields.map(field => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                {field.type === 'text' && (
                  <input
                    type="text"
                    value={data[field.key] || ''}
                    onChange={e => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500"
                  />
                )}
                {field.type === 'number' && (
                  <input
                    type="number"
                    value={data[field.key] || ''}
                    onChange={e => updateField(field.key, parseInt(e.target.value) || null)}
                    placeholder={field.placeholder}
                    className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500"
                  />
                )}
                {field.type === 'textarea' && (
                  <textarea
                    value={data[field.key] || ''}
                    onChange={e => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500"
                  />
                )}
                {field.type === 'select' && (
                  <select
                    value={data[field.key] || ''}
                    onChange={e => updateField(field.key, e.target.value)}
                    className="w-full border rounded-lg px-4 py-2"
                  >
                    <option value="">Selecione...</option>
                    {field.options?.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                )}
                {field.type === 'multiselect' && (
                  <div className="flex flex-wrap gap-2">
                    {field.options?.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleMultiSelect(field.key, opt.value)}
                        className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                          (data[field.key] || []).includes(opt.value)
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                {field.type === 'boolean' && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={data[field.key] ?? field.default ?? false}
                      onChange={e => updateField(field.key, e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-700">Ativado</span>
                  </label>
                )}
                {field.type === 'tags' && (
                  <input
                    type="text"
                    value={(data[field.key] || []).join(', ')}
                    onChange={e => updateField(field.key, e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                    placeholder={field.placeholder}
                    className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <div>
              {currentStep > 0 ? (
                <button onClick={handleBack} className="flex items-center gap-1 text-gray-600 hover:text-gray-900">
                  <ChevronLeft className="w-4 h-4" /> Voltar
                </button>
              ) : (
                <button onClick={handleSkip} className="text-gray-400 hover:text-gray-600 text-sm">
                  Pular configuração
                </button>
              )}
            </div>
            <div>
              {isLast ? (
                <button
                  onClick={handleComplete}
                  disabled={saving}
                  className="flex items-center gap-2 bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {saving ? 'Salvando...' : 'Concluir'}
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="flex items-center gap-1 bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700"
                >
                  Próximo <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { User, Save, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import api, { invalidateApiCache } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { IS_FIREBASE, firebaseAuth } from '../lib/firebase'
import { getProfile, saveProfile } from '../lib/firestore-service'

interface ProfileData {
  institution?: string
  position?: string
  jurisdiction?: string
  experience_years?: number | null
  primary_areas?: string[]
  specializations?: string[]
  formality_level?: string
  connective_style?: string
  citation_style?: string
  preferred_expressions?: string[]
  avoided_expressions?: string[]
  paragraph_length?: string
  default_document_type?: string
  default_template?: string
  signature_block?: string
  header_text?: string
  preferred_model?: string
  detail_level?: string
  argument_depth?: string
  include_opposing_view?: boolean
}

const SECTIONS = [
  {
    id: 'professional',
    title: 'Perfil Profissional',
    description: 'Informações sobre sua atuação profissional',
    fields: [
      { key: 'institution', label: 'Instituição', type: 'text', placeholder: 'Ex: Ministério Público do Estado do RS' },
      { key: 'position', label: 'Cargo/Função', type: 'text', placeholder: 'Ex: Promotor de Justiça' },
      { key: 'jurisdiction', label: 'Jurisdição/Comarca', type: 'text', placeholder: 'Ex: Comarca de Porto Alegre' },
      { key: 'experience_years', label: 'Anos de experiência', type: 'number' },
    ],
  },
  {
    id: 'areas',
    title: 'Áreas de Atuação',
    description: 'Selecione suas áreas de atuação e especialidades',
    fields: [
      { key: 'primary_areas', label: 'Áreas principais', type: 'multiselect', options: [
        { value: 'administrative', label: 'Direito Administrativo' },
        { value: 'constitutional', label: 'Direito Constitucional' },
        { value: 'civil', label: 'Direito Civil' },
        { value: 'tax', label: 'Direito Tributário' },
        { value: 'labor', label: 'Direito do Trabalho' },
        { value: 'criminal', label: 'Direito Penal' },
        { value: 'criminal_procedure', label: 'Processo Penal' },
        { value: 'civil_procedure', label: 'Processo Civil' },
        { value: 'consumer', label: 'Direito do Consumidor' },
        { value: 'environmental', label: 'Direito Ambiental' },
        { value: 'business', label: 'Direito Empresarial' },
        { value: 'family', label: 'Direito de Família' },
        { value: 'inheritance', label: 'Direito das Sucessões' },
        { value: 'social_security', label: 'Direito Previdenciário' },
        { value: 'electoral', label: 'Direito Eleitoral' },
        { value: 'international', label: 'Direito Internacional' },
        { value: 'digital', label: 'Direito Digital' },
      ]},
      { key: 'specializations', label: 'Especializações', type: 'tags', placeholder: 'Separe por vírgula: licitações, improbidade...' },
    ],
  },
  {
    id: 'writing',
    title: 'Preferências de Redação',
    description: 'Como você prefere que seus documentos sejam redigidos',
    fields: [
      { key: 'formality_level', label: 'Nível de formalidade', type: 'select', options: [
        { value: 'formal', label: 'Formal (linguagem jurídica clássica)' },
        { value: 'semiformal', label: 'Semiformal (claro e objetivo)' },
      ]},
      { key: 'connective_style', label: 'Estilo de conectivos', type: 'select', options: [
        { value: 'classico', label: 'Clássico (destarte, outrossim, mormente)' },
        { value: 'moderno', label: 'Moderno (portanto, além disso)' },
      ]},
      { key: 'paragraph_length', label: 'Tamanho dos parágrafos', type: 'select', options: [
        { value: 'curto', label: 'Curto (3-5 linhas)' },
        { value: 'medio', label: 'Médio (5-10 linhas)' },
        { value: 'longo', label: 'Longo (10+ linhas)' },
      ]},
      { key: 'citation_style', label: 'Estilo de citações', type: 'select', options: [
        { value: 'inline', label: 'Inline (no corpo do texto)' },
        { value: 'footnote', label: 'Notas de rodapé' },
        { value: 'abnt', label: 'ABNT' },
      ]},
      { key: 'preferred_expressions', label: 'Expressões preferidas', type: 'tags', placeholder: 'Separe por vírgula' },
      { key: 'avoided_expressions', label: 'Expressões a evitar', type: 'tags', placeholder: 'Separe por vírgula' },
    ],
  },
  {
    id: 'document',
    title: 'Preferências de Documento',
    description: 'Configurações padrão para seus documentos',
    fields: [
      { key: 'signature_block', label: 'Assinatura padrão', type: 'textarea', placeholder: 'Nome\nCargo\nInstituição' },
      { key: 'header_text', label: 'Cabeçalho padrão', type: 'textarea', placeholder: 'Texto que aparece no cabeçalho dos documentos' },
    ],
  },
  {
    id: 'ai',
    title: 'Preferências de IA',
    description: 'Configure como a IA deve trabalhar para você',
    fields: [
      { key: 'detail_level', label: 'Nível de detalhamento', type: 'select', options: [
        { value: 'conciso', label: 'Conciso (direto ao ponto)' },
        { value: 'detalhado', label: 'Detalhado (análise completa)' },
        { value: 'exaustivo', label: 'Exaustivo (todas as possibilidades)' },
      ]},
      { key: 'argument_depth', label: 'Profundidade argumentativa', type: 'select', options: [
        { value: 'superficial', label: 'Superficial (principais argumentos)' },
        { value: 'moderado', label: 'Moderado (argumentos e contra-argumentos)' },
        { value: 'profundo', label: 'Profundo (análise exaustiva)' },
      ]},
      { key: 'include_opposing_view', label: 'Incluir visão contrária automaticamente', type: 'boolean' },
    ],
  },
]

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['professional']))
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [savingPw, setSavingPw] = useState(false)
  const { userId } = useAuth()
  const toast = useToast()

  useEffect(() => {
    if (IS_FIREBASE && userId) {
      getProfile(userId)
        .then(data => setProfile(data || {}))
        .catch(() => toast.error('Erro ao carregar perfil'))
        .finally(() => setLoading(false))
    } else {
      api.get('/anamnesis/profile')
        .then(res => setProfile(res.data || {}))
        .catch(() => toast.error('Erro ao carregar perfil'))
        .finally(() => setLoading(false))
    }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateField = (key: string, value: any) => {
    setProfile(prev => ({ ...prev, [key]: value }))
  }

  const toggleMultiSelect = (key: string, value: string) => {
    setProfile(prev => {
      const current = (prev[key as keyof ProfileData] as string[]) || []
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value]
      return { ...prev, [key]: updated }
    })
  }

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (IS_FIREBASE && userId) {
        await saveProfile(userId, profile)
      } else {
        await api.patch('/anamnesis/profile', profile)
      }
      invalidateApiCache('/anamnesis/profile')
      toast.success('Perfil atualizado com sucesso')
    } catch (err: any) {
      toast.error('Erro ao salvar perfil', err?.response?.data?.detail || err?.message)
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    if (pwForm.new_password !== pwForm.confirm_password) {
      toast.error('As senhas não coincidem')
      return
    }
    if (pwForm.new_password.length < 8) {
      toast.error('A nova senha deve ter pelo menos 8 caracteres')
      return
    }
    setSavingPw(true)
    try {
      if (IS_FIREBASE && firebaseAuth?.currentUser) {
        const { updatePassword, EmailAuthProvider, reauthenticateWithCredential } = await import('firebase/auth')
        const credential = EmailAuthProvider.credential(
          firebaseAuth.currentUser.email!,
          pwForm.current_password,
        )
        await reauthenticateWithCredential(firebaseAuth.currentUser, credential)
        await updatePassword(firebaseAuth.currentUser, pwForm.new_password)
      } else {
        await api.post('/auth/change-password', {
          current_password: pwForm.current_password,
          new_password: pwForm.new_password,
        })
      }
      toast.success('Senha alterada com sucesso')
      setPwForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch (err: any) {
      toast.error('Erro ao alterar senha', err?.response?.data?.detail || err?.message)
    } finally {
      setSavingPw(false)
    }
  }

  const renderField = (field: any) => {
    const value = profile[field.key as keyof ProfileData]

    if (field.type === 'text') {
      return (
        <input
          type="text"
          value={(value as string) || ''}
          onChange={e => updateField(field.key, e.target.value)}
          placeholder={field.placeholder}
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
        />
      )
    }
    if (field.type === 'number') {
      return (
        <input
          type="number"
          value={(value as number) ?? ''}
          onChange={e => {
            const num = parseInt(e.target.value)
            updateField(field.key, isNaN(num) ? null : num)
          }}
          placeholder={field.placeholder}
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
        />
      )
    }
    if (field.type === 'textarea') {
      return (
        <textarea
          value={(value as string) || ''}
          onChange={e => updateField(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm resize-y"
        />
      )
    }
    if (field.type === 'select') {
      return (
        <select
          value={(value as string) || ''}
          onChange={e => updateField(field.key, e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm bg-white"
        >
          <option value="">Selecione...</option>
          {field.options?.map((opt: any) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )
    }
    if (field.type === 'multiselect') {
      const selected = (value as string[]) || []
      return (
        <div className="flex flex-wrap gap-2">
          {field.options?.map((opt: any) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleMultiSelect(field.key, opt.value)}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                selected.includes(opt.value)
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )
    }
    if (field.type === 'tags') {
      const tags = (value as string[]) || []
      return (
        <input
          type="text"
          value={tags.join(', ')}
          onChange={e => updateField(field.key, e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
          placeholder={field.placeholder}
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
        />
      )
    }
    if (field.type === 'boolean') {
      return (
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={(value as boolean) ?? false}
            onChange={e => updateField(field.key, e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">Ativado</span>
        </label>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meu Perfil</h1>
          <p className="text-sm text-gray-500">Preferências pessoais e de redação jurídica</p>
        </div>
      </div>

      <div className="space-y-4">
        {SECTIONS.map(section => {
          const isOpen = openSections.has(section.id)
          return (
            <div key={section.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-800">{section.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>
                </div>
                {isOpen
                  ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                }
              </button>
              {isOpen && (
                <div className="px-5 pb-5 space-y-4 border-t">
                  <div className="pt-4 space-y-4">
                    {section.fields.map(field => (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          {field.label}
                        </label>
                        {renderField(field)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Security / Change Password */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden mt-4">
        <button
          type="button"
          onClick={() => toggleSection('security')}
          className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
        >
          <div>
            <p className="text-sm font-semibold text-gray-800">Segurança</p>
            <p className="text-xs text-gray-500 mt-0.5">Alterar sua senha de acesso</p>
          </div>
          {openSections.has('security')
            ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
            : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
          }
        </button>
        {openSections.has('security') && (
          <div className="px-5 pb-5 border-t">
            <div className="pt-4 space-y-4">
              {(['current_password', 'new_password', 'confirm_password'] as const).map(key => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {key === 'current_password' ? 'Senha atual' : key === 'new_password' ? 'Nova senha' : 'Confirmar nova senha'}
                  </label>
                  <input
                    type="password"
                    value={pwForm[key]}
                    onChange={e => setPwForm(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={key === 'current_password' ? 'Digite sua senha atual' : 'Mínimo 8 caracteres'}
                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={handlePasswordChange}
                disabled={savingPw || !pwForm.current_password || !pwForm.new_password || !pwForm.confirm_password}
                className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2.5 rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                <Lock className="w-4 h-4" />
                {savingPw ? 'Alterando...' : 'Alterar Senha'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-brand-600 text-white py-3.5 rounded-xl hover:bg-brand-700 disabled:opacity-50 font-semibold text-sm transition-colors shadow-sm disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Salvando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Salvar Perfil
            </>
          )}
        </button>
      </div>
    </div>
  )
}

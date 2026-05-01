import { useState, useEffect } from 'react'
import { User, Save, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import api, { invalidateApiCache } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { IS_FIREBASE, firebaseAuth } from '../lib/firebase'
import { getProfile, saveProfile } from '../lib/firestore-service'
import { withTransientFirebaseAuthRetry } from '../lib/firebase-auth-retry'
import { PROFILE_SECTIONS, type ProfileData } from '../lib/profile-preferences'

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['professional']))
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [savingPw, setSavingPw] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const { userId, isReady } = useAuth()
  const toast = useToast()

  useEffect(() => {
    if (IS_FIREBASE && (!isReady || !userId)) {
      // Aguarda hidratação do Firebase Auth antes de qualquer leitura no Firestore.
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    const run = async () => {
      try {
        if (IS_FIREBASE && userId) {
          const data = await withTransientFirebaseAuthRetry(() => getProfile(userId))
          if (!cancelled) setProfile(data || {})
        } else {
          const res = await api.get('/anamnesis/profile')
          if (!cancelled) setProfile(res.data || {})
        }
      } catch {
        if (!cancelled) setLoadError('Não foi possível carregar seu perfil. Tente novamente.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [userId, isReady, reloadTick]) // eslint-disable-line react-hooks/exhaustive-deps

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
      const { humanizeError } = await import('../lib/error-humanizer')
      const h = humanizeError(err)
      toast.error('Erro ao salvar perfil', h.detail)
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
      const { humanizeError } = await import('../lib/error-humanizer')
      const h = humanizeError(err)
      toast.error('Erro ao alterar senha', h.detail)
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
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
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
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
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
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm resize-y"
        />
      )
    }
    if (field.type === 'select') {
      return (
        <select
          value={(value as string) || ''}
          onChange={e => updateField(field.key, e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white"
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
                  ? 'bg-teal-600 text-white border-teal-600'
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
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
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
            className="w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
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

  if (loadError) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-center justify-between gap-4">
          <span>{loadError}</span>
          <button
            onClick={() => setReloadTick(t => t + 1)}
            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 text-teal-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Meu Perfil</h1>
          <p className="text-sm text-gray-500">Preferências pessoais e de redação jurídica</p>
        </div>
      </div>



      {/* Account info bar */}
      {IS_FIREBASE && firebaseAuth?.currentUser && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 bg-gray-50 rounded-lg px-4 py-2.5 mb-4 border">
          <span>{firebaseAuth.currentUser.email}</span>
          {firebaseAuth.currentUser.metadata.creationTime && (
            <span>Membro desde {new Date(firebaseAuth.currentUser.metadata.creationTime).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
          )}
        </div>
      )}

      <div className="space-y-4">
        {PROFILE_SECTIONS.map(section => {
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
                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={handlePasswordChange}
                disabled={savingPw || !pwForm.current_password || !pwForm.new_password || !pwForm.confirm_password}
                className="inline-flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
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
          className="w-full bg-teal-600 text-white py-3.5 rounded-xl hover:bg-teal-700 disabled:opacity-50 font-semibold text-sm transition-colors shadow-sm disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
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

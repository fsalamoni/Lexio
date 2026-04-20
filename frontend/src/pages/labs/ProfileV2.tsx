import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Lock, Save, ShieldCheck, Sparkles, User } from 'lucide-react'
import api, { invalidateApiCache } from '../../api/client'
import { Skeleton } from '../../components/Skeleton'
import ThemeSkinSelector from '../../components/ThemeSkinSelector'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../contexts/AuthContext'
import { IS_FIREBASE, firebaseAuth } from '../../lib/firebase'
import { getProfile, getUserSettings, saveProfile, saveUserSettings } from '../../lib/firestore-service'
import { PROFILE_SECTIONS, type ProfileData, type ProfileField } from '../../lib/profile-preferences'
import { calculateProfileCompletion, countSectionFields, PROFILE_CORE_FIELDS } from '../../lib/profile-progress'

type CurrencyPreference = 'BRL' | 'USD' | 'EUR'
type LocalePreference = 'pt-BR' | 'en-US' | 'es-ES'
type DateFormatPreference = 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd'

type PlatformPreferences = {
  currency_preference: CurrencyPreference
  locale_preference: LocalePreference
  date_format_preference: DateFormatPreference
  compact_numbers: boolean
}

const PLATFORM_PREFS_STORAGE_KEY = 'lexio_platform_preferences'

const DEFAULT_PLATFORM_PREFERENCES: PlatformPreferences = {
  currency_preference: 'BRL',
  locale_preference: 'pt-BR',
  date_format_preference: 'dd/MM/yyyy',
  compact_numbers: false,
}

function normalizePlatformPreferences(raw: Partial<PlatformPreferences> | null | undefined): PlatformPreferences {
  const currency = raw?.currency_preference
  const locale = raw?.locale_preference
  const dateFormat = raw?.date_format_preference

  return {
    currency_preference: currency === 'USD' || currency === 'EUR' || currency === 'BRL' ? currency : DEFAULT_PLATFORM_PREFERENCES.currency_preference,
    locale_preference: locale === 'en-US' || locale === 'es-ES' || locale === 'pt-BR' ? locale : DEFAULT_PLATFORM_PREFERENCES.locale_preference,
    date_format_preference: dateFormat === 'MM/dd/yyyy' || dateFormat === 'yyyy-MM-dd' || dateFormat === 'dd/MM/yyyy'
      ? dateFormat
      : DEFAULT_PLATFORM_PREFERENCES.date_format_preference,
    compact_numbers: Boolean(raw?.compact_numbers),
  }
}

function loadStoredPlatformPreferences(): PlatformPreferences {
  try {
    const raw = localStorage.getItem(PLATFORM_PREFS_STORAGE_KEY)
    if (!raw) return DEFAULT_PLATFORM_PREFERENCES
    return normalizePlatformPreferences(JSON.parse(raw) as Partial<PlatformPreferences>)
  } catch {
    return DEFAULT_PLATFORM_PREFERENCES
  }
}

function persistPlatformPreferences(preferences: PlatformPreferences) {
  try {
    localStorage.setItem(PLATFORM_PREFS_STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Ignore local storage quota issues.
  }
}

function formatSampleDate(dateFormat: DateFormatPreference, locale: LocalePreference) {
  const date = new Date('2026-04-19T00:00:00.000Z')
  const parts = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date)

  const day = parts.find((part) => part.type === 'day')?.value || '19'
  const month = parts.find((part) => part.type === 'month')?.value || '04'
  const year = parts.find((part) => part.type === 'year')?.value || '2026'

  if (dateFormat === 'MM/dd/yyyy') return `${month}/${day}/${year}`
  if (dateFormat === 'yyyy-MM-dd') return `${year}-${month}-${day}`
  return `${day}/${month}/${year}`
}

export default function ProfileV2() {
  const [profile, setProfile] = useState<ProfileData>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [platformPreferences, setPlatformPreferences] = useState<PlatformPreferences>(loadStoredPlatformPreferences)
  const [platformPrefsDirty, setPlatformPrefsDirty] = useState(false)
  const [platformPrefsSaving, setPlatformPrefsSaving] = useState(false)
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [savingPw, setSavingPw] = useState(false)
  const { userId } = useAuth()
  const toast = useToast()

  useEffect(() => {
    let cancelled = false

    const loadPlatformPreferences = async () => {
      if (!IS_FIREBASE || !userId) {
        const localPrefs = loadStoredPlatformPreferences()
        if (!cancelled) {
          setPlatformPreferences(localPrefs)
          setPlatformPrefsDirty(false)
        }
        return
      }

      try {
        const settings = await getUserSettings(userId)
        const normalized = normalizePlatformPreferences({
          currency_preference: settings.currency_preference,
          locale_preference: settings.locale_preference,
          date_format_preference: settings.date_format_preference,
          compact_numbers: settings.compact_numbers,
        })

        if (!cancelled) {
          setPlatformPreferences(normalized)
          persistPlatformPreferences(normalized)
          setPlatformPrefsDirty(false)
        }
      } catch {
        if (!cancelled) {
          const localPrefs = loadStoredPlatformPreferences()
          setPlatformPreferences(localPrefs)
        }
      }
    }

    void loadPlatformPreferences()

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (IS_FIREBASE && userId) {
      getProfile(userId)
        .then((data) => setProfile(data || {}))
        .catch(() => toast.error('Erro ao carregar perfil'))
        .finally(() => setLoading(false))
      return
    }

    api.get('/anamnesis/profile')
      .then((res) => setProfile(res.data || {}))
      .catch(() => toast.error('Erro ao carregar perfil'))
      .finally(() => setLoading(false))
  }, [toast, userId])

  const completion = useMemo(() => {
    return calculateProfileCompletion(profile, PROFILE_CORE_FIELDS)
  }, [profile])

  const completedSections = useMemo(() => {
    return PROFILE_SECTIONS.filter((section) => countSectionFields(profile, section.fields) > 0).length
  }, [profile])

  const updateField = (key: string, value: string | number | boolean | null | string[]) => {
    setProfile((prev) => ({ ...prev, [key]: value }))
  }

  const toggleMultiSelect = (key: string, value: string) => {
    setProfile((prev) => {
      const current = (prev[key as keyof ProfileData] as string[]) || []
      const updated = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value]
      return { ...prev, [key]: updated }
    })
  }

  const updatePlatformPreference = <T extends keyof PlatformPreferences>(
    key: T,
    value: PlatformPreferences[T],
  ) => {
    setPlatformPreferences((current) => {
      const updated = { ...current, [key]: value }
      persistPlatformPreferences(updated)
      return updated
    })
    setPlatformPrefsDirty(true)
  }

  const handleSavePlatformPreferences = async () => {
    setPlatformPrefsSaving(true)
    try {
      persistPlatformPreferences(platformPreferences)
      if (IS_FIREBASE && userId) {
        await saveUserSettings(userId, {
          currency_preference: platformPreferences.currency_preference,
          locale_preference: platformPreferences.locale_preference,
          date_format_preference: platformPreferences.date_format_preference,
          compact_numbers: platformPreferences.compact_numbers,
        })
      }
      setPlatformPrefsDirty(false)
      toast.success('Preferencias da plataforma atualizadas')
    } catch (err: any) {
      const { humanizeError } = await import('../../lib/error-humanizer')
      const humanized = humanizeError(err)
      toast.error('Erro ao salvar preferencias da plataforma', humanized.detail)
    } finally {
      setPlatformPrefsSaving(false)
    }
  }

  const currencyPreview = useMemo(() => {
    const value = platformPreferences.currency_preference === 'BRL'
      ? 2840.75
      : platformPreferences.currency_preference === 'EUR'
        ? 510.24
        : 560.32

    return value.toLocaleString(platformPreferences.locale_preference, {
      style: 'currency',
      currency: platformPreferences.currency_preference,
      notation: platformPreferences.compact_numbers ? 'compact' : 'standard',
      maximumFractionDigits: 2,
    })
  }, [platformPreferences])

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
      const { humanizeError } = await import('../../lib/error-humanizer')
      const humanized = humanizeError(err)
      toast.error('Erro ao salvar perfil', humanized.detail)
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    if (pwForm.new_password !== pwForm.confirm_password) {
      toast.error('As senhas nao coincidem')
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
      const { humanizeError } = await import('../../lib/error-humanizer')
      const humanized = humanizeError(err)
      toast.error('Erro ao alterar senha', humanized.detail)
    } finally {
      setSavingPw(false)
    }
  }

  const renderField = (field: ProfileField) => {
    const value = profile[field.key]

    if (field.type === 'text') {
      return (
        <input
          type="text"
          value={(value as string) || ''}
          onChange={(event) => updateField(field.key, event.target.value)}
          placeholder={field.placeholder}
          className="v2-field"
        />
      )
    }

    if (field.type === 'number') {
      return (
        <input
          type="number"
          value={(value as number) ?? ''}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10)
            updateField(field.key, Number.isNaN(parsed) ? null : parsed)
          }}
          className="v2-field"
        />
      )
    }

    if (field.type === 'textarea') {
      return (
        <textarea
          rows={4}
          value={(value as string) || ''}
          onChange={(event) => updateField(field.key, event.target.value)}
          placeholder={field.placeholder}
          className="v2-field min-h-[126px] resize-y"
        />
      )
    }

    if (field.type === 'select') {
      return (
        <select
          value={(value as string) || ''}
          onChange={(event) => updateField(field.key, event.target.value)}
          className="v2-field"
        >
          <option value="">Selecione...</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      )
    }

    if (field.type === 'multiselect') {
      const selected = (value as string[]) || []
      return (
        <div className="flex flex-wrap gap-2">
          {field.options?.map((option) => {
            const active = selected.includes(option.value)
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleMultiSelect(field.key, option.value)}
                className={active ? 'v2-chip v2-chip-active' : 'v2-chip'}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      )
    }

    if (field.type === 'tags') {
      const tags = (value as string[]) || []
      return (
        <input
          type="text"
          value={tags.join(', ')}
          onChange={(event) => updateField(field.key, event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean))}
          placeholder={field.placeholder}
          className="v2-field"
        />
      )
    }

    if (field.type === 'boolean') {
      const checked = (value as boolean) ?? false
      return (
        <button
          type="button"
          onClick={() => updateField(field.key, !checked)}
          className={checked ? 'v2-toggle v2-toggle-active' : 'v2-toggle'}
        >
          <span className="v2-toggle-track">
            <span className="v2-toggle-thumb" />
          </span>
          <span className="text-sm font-medium">{checked ? 'Ativado' : 'Desativado'}</span>
        </button>
      )
    }

    return null
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="v2-panel p-6">
          <Skeleton className="h-6 w-48 rounded-full" />
          <Skeleton className="mt-4 h-20 rounded-[1.5rem]" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <Skeleton className="h-72 rounded-[1.8rem]" />
            <Skeleton className="h-72 rounded-[1.8rem]" />
          </div>
          <Skeleton className="h-80 rounded-[1.8rem]" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="v2-panel p-6 lg:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--v2-line-strong)] bg-[rgba(255,255,255,0.74)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--v2-ink-soft)]">
              <Sparkles className="h-3.5 w-3.5" />
              Perfil profissional
            </div>
            <div className="space-y-3">
              <h1 className="v2-display text-4xl leading-tight text-[var(--v2-ink-strong)]">Seu contexto juridico</h1>
              <p className="max-w-2xl text-sm leading-7 text-[var(--v2-ink-soft)] sm:text-[15px]">
                Gerencie suas preferencias de redacao, areas de atuacao e estilo de argumentacao. Estas informacoes orientam a geracao de documentos pela IA.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleSave} disabled={saving} className="v2-btn-primary disabled:cursor-not-allowed disabled:opacity-60">
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar alteracoes'}
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="v2-panel p-6 lg:p-7">
            <div className="flex flex-col gap-3 border-b border-[var(--v2-line-soft)] pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">plataforma</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--v2-ink-strong)]">Aparencia e formatos</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--v2-ink-soft)]">Defina o tema visual e os padroes de moeda, localizacao, datas e numeros em todo o workspace.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1.5 text-xs font-semibold text-[var(--v2-ink-soft)]">
                <BadgeCheck className="h-4 w-4 text-[var(--v2-accent-strong)]" />
                Preferencias pessoais da interface
              </div>
            </div>

            <div className="mt-6 space-y-6">
              <ThemeSkinSelector />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[var(--v2-ink-strong)]">Moeda padrao</label>
                  <select
                    value={platformPreferences.currency_preference}
                    onChange={(event) => updatePlatformPreference('currency_preference', event.target.value as CurrencyPreference)}
                    className="v2-field"
                  >
                    <option value="BRL">Real brasileiro (BRL)</option>
                    <option value="USD">Dolar americano (USD)</option>
                    <option value="EUR">Euro (EUR)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[var(--v2-ink-strong)]">Localizacao</label>
                  <select
                    value={platformPreferences.locale_preference}
                    onChange={(event) => updatePlatformPreference('locale_preference', event.target.value as LocalePreference)}
                    className="v2-field"
                  >
                    <option value="pt-BR">Portugues (Brasil)</option>
                    <option value="en-US">English (United States)</option>
                    <option value="es-ES">Espanol (Espana)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[var(--v2-ink-strong)]">Formato de data</label>
                  <select
                    value={platformPreferences.date_format_preference}
                    onChange={(event) => updatePlatformPreference('date_format_preference', event.target.value as DateFormatPreference)}
                    className="v2-field"
                  >
                    <option value="dd/MM/yyyy">dd/MM/yyyy</option>
                    <option value="MM/dd/yyyy">MM/dd/yyyy</option>
                    <option value="yyyy-MM-dd">yyyy-MM-dd</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[var(--v2-ink-strong)]">Numeracao</label>
                  <button
                    type="button"
                    onClick={() => updatePlatformPreference('compact_numbers', !platformPreferences.compact_numbers)}
                    className={platformPreferences.compact_numbers ? 'v2-toggle v2-toggle-active' : 'v2-toggle'}
                  >
                    <span className="v2-toggle-track">
                      <span className="v2-toggle-thumb" />
                    </span>
                    <span className="text-sm font-medium">
                      {platformPreferences.compact_numbers ? 'Compacta (ex.: 1,2 mi)' : 'Completa (ex.: 1.200.000)'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.78)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Preview de moeda</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">{currencyPreview}</p>
                </div>
                <div className="rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.78)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Preview de data</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">
                    {formatSampleDate(platformPreferences.date_format_preference, platformPreferences.locale_preference)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleSavePlatformPreferences()}
                  disabled={!platformPrefsDirty || platformPrefsSaving}
                  className="v2-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {platformPrefsSaving ? 'Salvando...' : 'Salvar preferencias da plataforma'}
                </button>
              </div>
            </div>
          </section>

          {PROFILE_SECTIONS.map((section) => {
            const sectionCompletion = countSectionFields(profile, section.fields)
            return (
              <section key={section.id} className="v2-panel p-6 lg:p-7">
                <div className="flex flex-col gap-3 border-b border-[var(--v2-line-soft)] pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">perfil</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--v2-ink-strong)]">{section.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--v2-ink-soft)]">{section.description}</p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1.5 text-xs font-semibold text-[var(--v2-ink-soft)]">
                    <BadgeCheck className="h-4 w-4 text-[var(--v2-accent-strong)]" />
                    {sectionCompletion}/{section.fields.length} campos preenchidos
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {section.fields.map((field) => {
                    const expandedField = field.type === 'textarea' || field.type === 'multiselect' || field.type === 'tags'
                    return (
                      <div key={field.key} className={expandedField ? 'space-y-2 md:col-span-2' : 'space-y-2'}>
                        <label className="text-sm font-semibold text-[var(--v2-ink-strong)]">{field.label}</label>
                        {renderField(field)}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}

          <section className="v2-panel p-6 lg:p-7">
            <div className="flex flex-col gap-3 border-b border-[var(--v2-line-soft)] pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">security</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--v2-ink-strong)]">Seguranca de acesso</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--v2-ink-soft)]">Atualize a senha sem sair da superficie de configuracao.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1.5 text-xs font-semibold text-[var(--v2-ink-soft)]">
                <ShieldCheck className="h-4 w-4 text-[var(--v2-accent-strong)]" />
                Controle local e credencial valida
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {(['current_password', 'new_password', 'confirm_password'] as const).map((key) => (
                <div key={key} className={key === 'confirm_password' ? 'space-y-2 md:col-span-2' : 'space-y-2'}>
                  <label className="text-sm font-semibold text-[var(--v2-ink-strong)]">
                    {key === 'current_password' ? 'Senha atual' : key === 'new_password' ? 'Nova senha' : 'Confirmar nova senha'}
                  </label>
                  <input
                    type="password"
                    value={pwForm[key]}
                    onChange={(event) => setPwForm((prev) => ({ ...prev, [key]: event.target.value }))}
                    placeholder={key === 'current_password' ? 'Digite sua senha atual' : 'Minimo 8 caracteres'}
                    className="v2-field"
                  />
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handlePasswordChange}
                disabled={savingPw || !pwForm.current_password || !pwForm.new_password || !pwForm.confirm_password}
                className="v2-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Lock className="h-4 w-4" />
                {savingPw ? 'Alterando...' : 'Alterar senha'}
              </button>
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className="v2-panel p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--v2-ink-faint)]">Prontidao do perfil</p>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="v2-display text-5xl leading-none">{completion}%</p>
                <p className="mt-2 text-sm leading-6 text-[var(--v2-ink-soft)]">Campos essenciais preenchidos para alimentar geracao, pesquisa e automacoes.</p>
              </div>
              <div className="rounded-[1.2rem] bg-[rgba(13,148,136,0.12)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-accent-strong)]">
                {completedSections}/{PROFILE_SECTIONS.length} blocos ativos
              </div>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-[rgba(15,23,42,0.08)]">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--v2-accent-strong),var(--v2-accent-warm))]" style={{ width: `${completion}%` }} />
            </div>
          </section>

          <section className="v2-panel p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--v2-ink-faint)]">Sinais operacionais</p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--v2-ink-soft)]">
              <div className="rounded-[1.2rem] bg-[rgba(255,255,255,0.78)] px-4 py-3">
                <p className="font-semibold text-[var(--v2-ink-strong)]">Areas principais</p>
                <p>{(profile.primary_areas || []).length} frentes selecionadas</p>
              </div>
              <div className="rounded-[1.2rem] bg-[rgba(255,255,255,0.78)] px-4 py-3">
                <p className="font-semibold text-[var(--v2-ink-strong)]">Redacao base</p>
                <p>{profile.formality_level || 'Nao definida'} · {profile.connective_style || 'sem conectivo padrao'}</p>
              </div>
              <div className="rounded-[1.2rem] bg-[rgba(255,255,255,0.78)] px-4 py-3">
                <p className="font-semibold text-[var(--v2-ink-strong)]">Profundidade IA</p>
                <p>{profile.detail_level || 'Nao definida'} · {profile.argument_depth || 'sem nivel de argumento'}</p>
              </div>
              <div className="rounded-[1.2rem] bg-[rgba(255,255,255,0.78)] px-4 py-3">
                <p className="font-semibold text-[var(--v2-ink-strong)]">Padrao regional</p>
                <p>{platformPreferences.currency_preference} · {platformPreferences.locale_preference} · {platformPreferences.date_format_preference}</p>
              </div>
            </div>
          </section>

          <section className="v2-panel p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--v2-ink-faint)]">Conta ativa</p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--v2-ink-soft)]">
              <div className="flex items-start gap-3 rounded-[1.2rem] bg-[rgba(255,255,255,0.78)] px-4 py-3">
                <User className="mt-0.5 h-5 w-5 text-[var(--v2-accent-strong)]" />
                <div>
                  <p className="font-semibold text-[var(--v2-ink-strong)]">Identidade</p>
                  <p>{firebaseAuth?.currentUser?.email || 'Conta via API local'}</p>
                </div>
              </div>
              {IS_FIREBASE && firebaseAuth?.currentUser?.metadata.creationTime && (
                <div className="rounded-[1.2rem] bg-[rgba(255,255,255,0.78)] px-4 py-3">
                  <p className="font-semibold text-[var(--v2-ink-strong)]">Membro desde</p>
                  <p>{new Date(firebaseAuth.currentUser.metadata.creationTime).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
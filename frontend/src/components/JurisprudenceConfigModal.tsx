/**
 * JurisprudenceConfigModal — Pre-search configuration for DataJud jurisprudence search.
 * JusBrasil-inspired UX: tribunal selection with collapsible groups, date range, grau filter.
 */
import React, { useCallback, useMemo, useState } from 'react'
import {
  X, Search, ChevronDown, ChevronUp, CheckSquare, Square,
  MinusSquare, Library, Calendar, Filter, Loader2,
} from 'lucide-react'
import {
  TRIBUNAL_GROUPS,
  DEFAULT_TRIBUNALS,
  DATAJUD_GRAUS,
  type TribunalInfo,
} from '../lib/datajud-service'
import { AREA_LABELS } from '../lib/constants'

export interface JurisprudenceSearchConfig {
  query: string
  tribunals: TribunalInfo[]
  dateFrom: string
  dateTo: string
  graus: string[]
  maxPerTribunal: number
  legalArea: string
}

interface JurisprudenceConfigModalProps {
  isOpen: boolean
  query: string
  initialSelectedAliases?: string[]
  initialConfig?: Partial<JurisprudenceSearchConfig> | null
  onSearch: (config: JurisprudenceSearchConfig) => void
  onClose: () => void
}

export default function JurisprudenceConfigModal({
  isOpen,
  query: initialQuery,
  initialSelectedAliases,
  initialConfig,
  onSearch,
  onClose,
}: JurisprudenceConfigModalProps) {
  const defaultAliases = useMemo(
    () => new Set((initialSelectedAliases && initialSelectedAliases.length > 0)
      ? initialSelectedAliases
      : DEFAULT_TRIBUNALS.map(t => t.alias)),
    [initialSelectedAliases],
  )

  const [query, setQuery] = useState(initialQuery)
  const [selectedAliases, setSelectedAliases] = useState<Set<string>>(() => new Set(defaultAliases))
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(['superiores', 'federal']))
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedGraus, setSelectedGraus] = useState<Set<string>>(new Set())
  const [maxPerTribunal, setMaxPerTribunal] = useState(5)
  const [legalArea, setLegalArea] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  React.useEffect(() => {
    if (!isOpen) return
    setQuery(initialConfig?.query ?? initialQuery)
    setSelectedAliases(new Set((initialConfig?.tribunals?.map(tribunal => tribunal.alias) ?? Array.from(defaultAliases))))
    setDateFrom(initialConfig?.dateFrom ?? '')
    setDateTo(initialConfig?.dateTo ?? '')
    setSelectedGraus(new Set(initialConfig?.graus ?? []))
    setMaxPerTribunal(initialConfig?.maxPerTribunal ?? 5)
    setLegalArea(initialConfig?.legalArea ?? '')
  }, [isOpen, initialConfig, initialQuery, defaultAliases])

  const toggleGroup = useCallback((category: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }, [])

  const toggleTribunal = useCallback((alias: string) => {
    setSelectedAliases(prev => {
      const next = new Set(prev)
      if (next.has(alias)) next.delete(alias)
      else next.add(alias)
      return next
    })
  }, [])

  const toggleGroupAll = useCallback((tribunals: TribunalInfo[]) => {
    setSelectedAliases(prev => {
      const next = new Set(prev)
      const allSelected = tribunals.every(t => next.has(t.alias))
      if (allSelected) {
        tribunals.forEach(t => next.delete(t.alias))
      } else {
        tribunals.forEach(t => next.add(t.alias))
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    const all = new Set<string>()
    TRIBUNAL_GROUPS.forEach(g => g.tribunals.forEach(t => all.add(t.alias)))
    setSelectedAliases(all)
  }, [])

  const clearAll = useCallback(() => {
    setSelectedAliases(new Set())
  }, [])

  const resetToDefaults = useCallback(() => {
    setSelectedAliases(new Set(defaultAliases))
  }, [defaultAliases])

  const toggleGrau = useCallback((value: string) => {
    setSelectedGraus(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }, [])

  const totalSelected = selectedAliases.size
  const totalTribunals = useMemo(() => TRIBUNAL_GROUPS.reduce((sum, g) => sum + g.tribunals.length, 0), [])

  const handleSearch = () => {
    const tribunals = TRIBUNAL_GROUPS.flatMap(g => g.tribunals).filter(t => selectedAliases.has(t.alias))
    onSearch({
      query: query.trim(),
      tribunals,
      dateFrom,
      dateTo,
      graus: Array.from(selectedGraus),
      maxPerTribunal,
      legalArea,
    })
  }

  if (!isOpen) return null

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--v2-line-soft)',
    borderRadius: '0.625rem',
    fontSize: '0.8125rem',
    fontFamily: "var(--v2-font-sans, 'Inter', sans-serif)",
    color: 'var(--v2-ink-strong)',
    background: 'rgba(255,255,255,0.9)',
    outline: 'none',
    transition: 'border-color 150ms',
  }

  return (
    <div className="v2-modal-overlay" onClick={onClose}>
      <div
        className="v2-modal"
        style={{ maxWidth: '42rem', maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="v2-modal-header">
          <div
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(15,118,110,0.10)', color: 'var(--v2-accent-strong)' }}
          >
            <Library className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>
              Pesquisa de Jurisprudência
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--v2-ink-faint)' }}>
              Selecione tribunais e filtros antes de pesquisar
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ color: 'var(--v2-ink-faint)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Query input */}
        <div className="px-6 pt-4 pb-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--v2-ink-faint)' }}
            />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Tema para buscar na jurisprudência..."
              style={{ ...inputStyle, paddingLeft: '2.25rem' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--v2-accent-strong)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--v2-line-soft)')}
              onKeyDown={e => { if (e.key === 'Enter' && query.trim() && totalSelected > 0) handleSearch() }}
            />
          </div>
        </div>

        {/* Toolbar */}
        <div
          className="px-6 pb-2.5 flex items-center gap-2 flex-wrap"
          style={{ borderBottom: '1px solid var(--v2-line-soft)' }}
        >
          <span className="text-xs" style={{ color: 'var(--v2-ink-faint)' }}>
            {totalSelected} de {totalTribunals} tribunais
          </span>
          <button
            onClick={selectAll}
            className="text-[11px] font-medium transition-colors"
            style={{ color: 'var(--v2-accent-strong)' }}
          >
            Todos
          </button>
          <span style={{ color: 'var(--v2-line-soft)' }}>·</span>
          <button
            onClick={clearAll}
            className="text-[11px] font-medium transition-colors"
            style={{ color: 'var(--v2-ink-faint)' }}
          >
            Nenhum
          </button>
          <span style={{ color: 'var(--v2-line-soft)' }}>·</span>
          <button
            onClick={resetToDefaults}
            className="text-[11px] font-medium transition-colors"
            style={{ color: 'var(--v2-ink-faint)' }}
          >
            Padrão
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-[11px] font-medium px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
            style={{
              background: showFilters ? 'rgba(15,118,110,0.08)' : 'transparent',
              color: showFilters ? 'var(--v2-accent-strong)' : 'var(--v2-ink-soft)',
              border: `1px solid ${showFilters ? 'rgba(15,118,110,0.20)' : 'var(--v2-line-soft)'}`,
            }}
          >
            <Filter className="w-3 h-3" />
            Filtros
            {(dateFrom || dateTo || selectedGraus.size > 0 || legalArea) && (
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--v2-accent-strong)' }} />
            )}
          </button>
        </div>

        {/* Filters panel (collapsible) */}
        {showFilters && (
          <div
            className="px-6 py-4 space-y-4"
            style={{ borderBottom: '1px solid var(--v2-line-soft)', background: 'rgba(15,23,42,0.02)' }}
          >
            <div className="flex gap-4">
              {[
                { label: 'A partir de', value: dateFrom, setter: setDateFrom, type: 'date' },
                { label: 'Até', value: dateTo, setter: setDateTo, type: 'date' },
              ].map(({ label, value, setter, type }) => (
                <div key={label} className="flex-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--v2-ink-faint)' }}>
                    <Calendar className="w-3 h-3 inline mr-1" />
                    {label}
                  </label>
                  <input
                    type={type}
                    value={value}
                    onChange={e => setter(e.target.value)}
                    style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--v2-accent-strong)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--v2-line-soft)')}
                  />
                </div>
              ))}
              <div className="flex-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--v2-ink-faint)' }}>
                  Máx. por tribunal
                </label>
                <select
                  value={maxPerTribunal}
                  onChange={e => setMaxPerTribunal(Number(e.target.value))}
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--v2-accent-strong)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--v2-line-soft)')}
                >
                  {[1, 3, 5, 10, 15, 20].map(n => (
                    <option key={n} value={n}>{n} resultado(s)</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--v2-ink-faint)' }}>
                Grau / Instância
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DATAJUD_GRAUS.map(g => (
                  <button
                    key={g.value}
                    onClick={() => toggleGrau(g.value)}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                    style={{
                      background: selectedGraus.has(g.value) ? 'rgba(15,118,110,0.10)' : 'rgba(255,255,255,0.9)',
                      border: `1px solid ${selectedGraus.has(g.value) ? 'rgba(15,118,110,0.30)' : 'var(--v2-line-soft)'}`,
                      color: selectedGraus.has(g.value) ? 'var(--v2-accent-strong)' : 'var(--v2-ink-soft)',
                    }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--v2-ink-faint)' }}>
                Área do Direito
              </label>
              <select
                value={legalArea}
                onChange={e => setLegalArea(e.target.value)}
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--v2-accent-strong)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--v2-line-soft)')}
              >
                <option value="">Todas as áreas</option>
                {Object.entries(AREA_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Tribunal groups */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {TRIBUNAL_GROUPS.map(group => {
            const groupSelected = group.tribunals.filter(t => selectedAliases.has(t.alias)).length
            const allGroupSelected = groupSelected === group.tribunals.length
            const someGroupSelected = groupSelected > 0 && !allGroupSelected
            const isExpanded = expandedGroups.has(group.category)
            const GroupCheck = allGroupSelected ? CheckSquare : someGroupSelected ? MinusSquare : Square

            return (
              <div
                key={group.category}
                className="overflow-hidden rounded-xl"
                style={{ border: '1px solid var(--v2-line-soft)' }}
              >
                <div
                  className="flex items-center gap-2 px-4 py-2.5 cursor-pointer transition-colors"
                  style={{ background: isExpanded ? 'rgba(15,118,110,0.04)' : 'rgba(255,255,255,0.7)' }}
                  onClick={() => toggleGroup(group.category)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = isExpanded ? 'rgba(15,118,110,0.04)' : 'rgba(255,255,255,0.7)')}
                >
                  <button
                    onClick={e => { e.stopPropagation(); toggleGroupAll(group.tribunals) }}
                    className="flex-shrink-0"
                    style={{ color: allGroupSelected || someGroupSelected ? 'var(--v2-accent-strong)' : 'var(--v2-ink-faint)' }}
                  >
                    <GroupCheck className="w-4 h-4" />
                  </button>
                  <span className="flex-1 text-xs font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>
                    {group.label}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--v2-ink-faint)' }}>
                    {groupSelected}/{group.tribunals.length}
                  </span>
                  {isExpanded
                    ? <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--v2-ink-faint)' }} />
                    : <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--v2-ink-faint)' }} />
                  }
                </div>
                {isExpanded && (
                  <div
                    className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-1"
                    style={{ borderTop: '1px solid var(--v2-line-soft)', background: 'rgba(255,255,255,0.5)' }}
                  >
                    {group.tribunals.map(t => {
                      const isSelected = selectedAliases.has(t.alias)
                      const Check = isSelected ? CheckSquare : Square
                      return (
                        <button
                          key={t.alias}
                          onClick={() => toggleTribunal(t.alias)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-left transition-colors"
                          style={{
                            background: isSelected ? 'rgba(15,118,110,0.08)' : 'transparent',
                            color: isSelected ? 'var(--v2-accent-strong)' : 'var(--v2-ink-soft)',
                          }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(15,23,42,0.04)' }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                        >
                          <Check
                            className="w-3.5 h-3.5 flex-shrink-0"
                            style={{ color: isSelected ? 'var(--v2-accent-strong)' : 'var(--v2-ink-faint)' }}
                          />
                          <span className="truncate">{t.alias.toUpperCase()}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="v2-modal-footer">
          <button onClick={onClose} className="v2-btn-secondary">
            Cancelar
          </button>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || totalSelected === 0}
            className="v2-btn-primary disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            Pesquisar em {totalSelected} tribunal(is)
          </button>
        </div>
      </div>
    </div>
  )
}

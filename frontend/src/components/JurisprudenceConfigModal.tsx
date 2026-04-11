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

export interface JurisprudenceSearchConfig {
  query: string
  tribunals: TribunalInfo[]
  dateFrom: string
  dateTo: string
  graus: string[]
  maxPerTribunal: number
}

interface JurisprudenceConfigModalProps {
  isOpen: boolean
  query: string
  initialSelectedAliases?: string[]
  onSearch: (config: JurisprudenceSearchConfig) => void
  onClose: () => void
}

export default function JurisprudenceConfigModal({
  isOpen,
  query: initialQuery,
  initialSelectedAliases,
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
  const [showFilters, setShowFilters] = useState(false)

  React.useEffect(() => {
    if (!isOpen) return
    setQuery(initialQuery)
    setSelectedAliases(new Set(defaultAliases))
  }, [isOpen, initialQuery, defaultAliases])

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
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 flex items-center gap-3">
          <Library className="w-5 h-5 text-white/80" />
          <div className="flex-1">
            <h2 className="text-white font-semibold text-sm">Pesquisa de Jurisprudência</h2>
            <p className="text-emerald-100 text-xs mt-0.5">Selecione tribunais e filtros antes de pesquisar</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 text-white/80 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Query input */}
        <div className="px-6 pt-4 pb-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Tema para buscar na jurisprudência..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                onKeyDown={e => { if (e.key === 'Enter' && query.trim() && totalSelected > 0) handleSearch() }}
              />
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-6 pb-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">
            {totalSelected} de {totalTribunals} tribunais
          </span>
          <button onClick={selectAll} className="text-[11px] text-emerald-600 hover:text-emerald-700 font-medium">
            Todos
          </button>
          <span className="text-gray-300">·</span>
          <button onClick={clearAll} className="text-[11px] text-gray-500 hover:text-gray-700 font-medium">
            Nenhum
          </button>
          <span className="text-gray-300">·</span>
          <button onClick={resetToDefaults} className="text-[11px] text-gray-500 hover:text-gray-700 font-medium">
            Padrão
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`text-[11px] font-medium px-2 py-1 rounded flex items-center gap-1 transition-colors ${
              showFilters ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Filter className="w-3 h-3" />
            Filtros
            {(dateFrom || dateTo || selectedGraus.size > 0) && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            )}
          </button>
        </div>

        {/* Filters panel (collapsible) */}
        {showFilters && (
          <div className="px-6 pb-3 space-y-3 border-t border-b border-gray-100 py-3 bg-gray-50/50">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  A partir de
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  Até
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  Máx. por tribunal
                </label>
                <select
                  value={maxPerTribunal}
                  onChange={e => setMaxPerTribunal(Number(e.target.value))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                >
                  {[1, 3, 5, 10, 15, 20].map(n => (
                    <option key={n} value={n}>{n} resultado(s)</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1.5">Grau / Instância</label>
              <div className="flex flex-wrap gap-2">
                {DATAJUD_GRAUS.map(g => (
                  <button
                    key={g.value}
                    onClick={() => toggleGrau(g.value)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                      selectedGraus.has(g.value)
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tribunal groups */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1">
          {TRIBUNAL_GROUPS.map(group => {
            const groupSelected = group.tribunals.filter(t => selectedAliases.has(t.alias)).length
            const allGroupSelected = groupSelected === group.tribunals.length
            const someGroupSelected = groupSelected > 0 && !allGroupSelected
            const isExpanded = expandedGroups.has(group.category)

            const GroupCheck = allGroupSelected ? CheckSquare : someGroupSelected ? MinusSquare : Square

            return (
              <div key={group.category} className="border border-gray-100 rounded-lg overflow-hidden">
                <div
                  className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
                  onClick={() => toggleGroup(group.category)}
                >
                  <button
                    onClick={e => { e.stopPropagation(); toggleGroupAll(group.tribunals) }}
                    className={`flex-shrink-0 ${allGroupSelected || someGroupSelected ? 'text-emerald-600' : 'text-gray-400'}`}
                  >
                    <GroupCheck className="w-4 h-4" />
                  </button>
                  <span className="flex-1 text-xs font-semibold text-gray-700">{group.label}</span>
                  <span className="text-[11px] text-gray-400">{groupSelected}/{group.tribunals.length}</span>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                </div>
                {isExpanded && (
                  <div className="px-3 py-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
                    {group.tribunals.map(t => {
                      const isSelected = selectedAliases.has(t.alias)
                      const Check = isSelected ? CheckSquare : Square
                      return (
                        <button
                          key={t.alias}
                          onClick={() => toggleTribunal(t.alias)}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] text-left transition-colors ${
                            isSelected
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <Check className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-emerald-600' : 'text-gray-300'}`} />
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
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || totalSelected === 0}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            Pesquisar em {totalSelected} tribunal(is)
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * SearchResultsModal — Post-search review & selection modal.
 * Reusable across jurisprudence, external, and deep search types.
 * Shows individual search results for user review before adding as sources.
 */
import React, { useCallback, useState } from 'react'
import {
  X, CheckSquare, Square, ChevronDown, ChevronUp,
  ExternalLink, Library, Globe, Brain, Copy,
} from 'lucide-react'
import type { SearchResultItem } from '../pages/notebook/types'

interface SearchResultsModalProps {
  isOpen: boolean
  items: SearchResultItem[]
  variant: 'external' | 'deep' | 'jurisprudencia'
  onConfirm: (selected: SearchResultItem[]) => void
  onClose: () => void
}

const VARIANT_CONFIG = {
  external: {
    icon: Globe,
    gradient: 'from-blue-600 to-blue-700',
    accent: 'blue',
    title: 'Resultados da Pesquisa Externa',
  },
  deep: {
    icon: Brain,
    gradient: 'from-indigo-600 to-indigo-700',
    accent: 'indigo',
    title: 'Resultados da Pesquisa Profunda',
  },
  jurisprudencia: {
    icon: Library,
    gradient: 'from-emerald-600 to-emerald-700',
    accent: 'emerald',
    title: 'Resultados da Jurisprudência',
  },
}

export default function SearchResultsModal({
  isOpen,
  items: initialItems,
  variant,
  onConfirm,
  onClose,
}: SearchResultsModalProps) {
  const [items, setItems] = useState<SearchResultItem[]>(initialItems)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Sync if items change (modal reopened)
  React.useEffect(() => {
    setItems(initialItems)
    setExpandedId(null)
  }, [initialItems])

  const config = VARIANT_CONFIG[variant]
  const VarIcon = config.icon
  const selectedCount = items.filter(i => i.selected).length

  const toggleItem = useCallback((id: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, selected: !item.selected } : item,
    ))
  }, [])

  const toggleAll = useCallback(() => {
    const allSelected = items.every(i => i.selected)
    setItems(prev => prev.map(item => ({ ...item, selected: !allSelected })))
  }, [items])

  const handleConfirm = () => {
    onConfirm(items.filter(i => i.selected))
  }

  if (!isOpen || items.length === 0) return null

  const accentClasses = ({
    blue: { bg50: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', btn: 'bg-blue-600 hover:bg-blue-700' },
    indigo: { bg50: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', btn: 'bg-indigo-600 hover:bg-indigo-700' },
    emerald: { bg50: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  } as const)[config.accent] ?? { bg50: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', btn: 'bg-blue-600 hover:bg-blue-700' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`bg-gradient-to-r ${config.gradient} px-6 py-4 flex items-center gap-3`}>
          <VarIcon className="w-5 h-5 text-white/80" />
          <div className="flex-1">
            <h2 className="text-white font-semibold text-sm">{config.title}</h2>
            <p className="text-white/70 text-xs mt-0.5">{items.length} resultado(s) encontrado(s) · Selecione os que deseja adicionar</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 text-white/80 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-2.5 border-b flex items-center gap-3">
          <button onClick={toggleAll} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-800">
            {items.every(i => i.selected) ? <CheckSquare className="w-3.5 h-3.5 text-emerald-600" /> : <Square className="w-3.5 h-3.5" />}
            {items.every(i => i.selected) ? 'Desmarcar Todos' : 'Selecionar Todos'}
          </button>
          <span className="text-[11px] text-gray-400">{selectedCount} de {items.length} selecionado(s)</span>
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {items.map(item => {
            const isExpanded = expandedId === item.id
            return (
              <div key={item.id} className={`${item.selected ? accentClasses.bg50 : 'bg-white'} transition-colors`}>
                <div className="flex items-start gap-3 px-6 py-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleItem(item.id)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {item.selected
                      ? <CheckSquare className={`w-4 h-4 ${accentClasses.text}`} />
                      : <Square className="w-4 h-4 text-gray-300" />
                    }
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 leading-snug">{item.title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{item.subtitle}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Abrir em nova aba"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Metadata badges */}
                    {Object.keys(item.metadata).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {Object.entries(item.metadata).slice(0, 5).map(([key, value]) => (
                          <span key={key} className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-gray-600">
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Snippet */}
                    <p className="text-xs text-gray-600 mt-1.5 leading-relaxed line-clamp-2">{item.snippet}</p>

                    {/* Expand toggle */}
                    {item.fullContent && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="text-[11px] text-gray-500 hover:text-gray-700 mt-1.5 flex items-center gap-1"
                      >
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {isExpanded ? 'Recolher' : 'Ver detalhes'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && item.fullContent && (
                  <div className="px-14 pb-3">
                    <div className="bg-white border rounded-lg p-3 max-h-64 overflow-y-auto">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-medium text-gray-400">Conteúdo completo</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(item.fullContent || '')}
                          className="text-[10px] text-gray-500 hover:text-gray-700 flex items-center gap-0.5"
                        >
                          <Copy className="w-3 h-3" /> Copiar
                        </button>
                      </div>
                      <div className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {item.fullContent}
                      </div>
                    </div>
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
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className={`px-6 py-2 ${accentClasses.btn} text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors`}
          >
            Adicionar {selectedCount} como Fonte{selectedCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

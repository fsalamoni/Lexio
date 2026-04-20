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
    <div className="v2-modal-overlay" onClick={onClose}>
      <div
        className="v2-modal"
        style={{ maxWidth: '48rem', maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="v2-modal-header">
          <div
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(15,118,110,0.10)', color: 'var(--v2-accent-strong)' }}
          >
            <VarIcon className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>{config.title}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--v2-ink-faint)' }}>
              {items.length} resultado(s) · Selecione os que deseja adicionar
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

        {/* Toolbar */}
        <div
          className="px-5 py-2.5 flex items-center gap-3"
          style={{ borderBottom: '1px solid var(--v2-line-soft)', background: 'rgba(255,255,255,0.5)' }}
        >
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-xs font-medium transition-colors"
            style={{ color: 'var(--v2-ink-soft)' }}
          >
            {items.every(i => i.selected)
              ? <CheckSquare className="w-3.5 h-3.5" style={{ color: 'var(--v2-accent-strong)' }} />
              : <Square className="w-3.5 h-3.5" />}
            {items.every(i => i.selected) ? 'Desmarcar Todos' : 'Selecionar Todos'}
          </button>
          <span className="text-xs" style={{ color: 'var(--v2-ink-faint)' }}>
            {selectedCount} de {items.length} selecionado(s)
          </span>
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto" style={{ borderBottom: '1px solid var(--v2-line-soft)' }}>
          {items.map(item => {
            const isExpanded = expandedId === item.id
            return (
              <div
                key={item.id}
                style={{
                  background: item.selected ? 'rgba(15,118,110,0.05)' : 'transparent',
                  borderBottom: '1px solid var(--v2-line-soft)',
                  transition: 'background 150ms',
                }}
              >
                <div className="flex items-start gap-3 px-5 py-3">
                  <button
                    onClick={() => toggleItem(item.id)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {item.selected
                      ? <CheckSquare className="w-4 h-4" style={{ color: 'var(--v2-accent-strong)' }} />
                      : <Square className="w-4 h-4" style={{ color: 'var(--v2-ink-faint)' }} />
                    }
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug" style={{ color: 'var(--v2-ink-strong)' }}>
                          {item.title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--v2-ink-faint)' }}>{item.subtitle}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="p-1.5 rounded-lg transition-colors"
                            style={{ color: 'var(--v2-ink-faint)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.07)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            title="Abrir em nova aba"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {Object.keys(item.metadata).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {Object.entries(item.metadata).slice(0, 5).map(([key, value]) => (
                          <span
                            key={key}
                            className="px-1.5 py-0.5 rounded-md text-[10px]"
                            style={{ background: 'rgba(15,23,42,0.05)', color: 'var(--v2-ink-soft)' }}
                          >
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-xs mt-1.5 leading-relaxed line-clamp-2" style={{ color: 'var(--v2-ink-soft)' }}>
                      {item.snippet}
                    </p>

                    {item.fullContent && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="text-xs mt-1.5 flex items-center gap-1 transition-colors"
                        style={{ color: 'var(--v2-ink-faint)' }}
                      >
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {isExpanded ? 'Recolher' : 'Ver detalhes'}
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && item.fullContent && (
                  <div className="px-12 pb-3">
                    <div
                      className="rounded-xl p-3 max-h-56 overflow-y-auto"
                      style={{ border: '1px solid var(--v2-line-soft)', background: 'rgba(255,252,247,0.9)' }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                          Conteúdo completo
                        </span>
                        <button
                          onClick={() => navigator.clipboard.writeText(item.fullContent || '')}
                          className="text-xs flex items-center gap-0.5 transition-colors"
                          style={{ color: 'var(--v2-ink-faint)' }}
                        >
                          <Copy className="w-3 h-3" /> Copiar
                        </button>
                      </div>
                      <div className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--v2-ink-soft)' }}>
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
        <div className="v2-modal-footer">
          <button onClick={onClose} className="v2-btn-secondary">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className="v2-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Adicionar {selectedCount} como Fonte{selectedCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

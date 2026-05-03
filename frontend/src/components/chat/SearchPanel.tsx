/**
 * SearchPanel — Busca Híbrida integrada ao Chat Orquestrador.
 *
 * Permite que o usuário faça buscas semânticas + lexicais diretamente
 * da interface de chat, sem sair do contexto da conversa.
 *
 * Integra com POST /api/v1/search/hybrid (RRF fusion Qdrant + DataJud).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Cpu,
  ExternalLink,
  FileText,
  Search as SearchIcon,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { hybridSearch, type HybridResultItem, type HybridSearchStats } from '../../lib/search-client'

export interface SearchPanelProps {
  /** Query inicial (opcional) — se fornecida, dispara busca automaticamente. */
  initialQuery?: string
  /** Callback quando o usuário clica em um resultado para expandir. */
  onResultClick?: (result: HybridResultItem) => void
  /** Callback quando o usuário quer anexar resultados ao contexto do chat. */
  onAttachToContext?: (results: HybridResultItem[]) => void
  /** Se true, fecha o painel (controlado externamente). */
  onClose?: () => void
}

type SearchStatus = 'idle' | 'searching' | 'done' | 'error'

export default function SearchPanel({
  initialQuery,
  onResultClick,
  onAttachToContext,
  onClose,
}: SearchPanelProps) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [results, setResults] = useState<HybridResultItem[]>([])
  const [stats, setStats] = useState<HybridSearchStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [semanticWeight, setSemanticWeight] = useState(0.5)
  const [lexicalWeight, setLexicalWeight] = useState(0.5)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-search quando initialQuery é fornecida
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setQuery(initialQuery)
      void performSearch(initialQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const performSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim()
      if (!trimmed) return

      // Cancela busca anterior
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setStatus('searching')
      setError(null)
      setResults([])
      setStats(null)
      setExpandedIndex(null)

      try {
        const response = await hybridSearch(trimmed, {
          topK: 15,
          semanticWeight,
          lexicalWeight,
          signal: controller.signal,
        })

        // Ignora se abortado
        if (controller.signal.aborted) return

        setResults(response.results)
        setStats(response.stats)
        setStatus('done')
      } catch (err) {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : 'Erro desconhecido na busca'
        setError(message)
        setStatus('error')
      }
    },
    [semanticWeight, lexicalWeight],
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void performSearch(query)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void performSearch(query)
    }
  }

  const toggleExpand = (idx: number) => {
    setExpandedIndex(prev => (prev === idx ? null : idx))
    if (onResultClick && results[idx]) {
      onResultClick(results[idx])
    }
  }

  return (
    <div className="flex h-full flex-col border-l border-[var(--v2-border)] bg-white/95">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--v2-border)] px-3 py-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--v2-ink-strong)]">
          <SearchIcon className="h-3.5 w-3.5 text-indigo-500" />
          Busca Híbrida
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--v2-ink-faint)] hover:bg-[var(--v2-border)] hover:text-[var(--v2-ink-strong)]"
            title="Fechar painel de busca"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Formulário de busca */}
      <form onSubmit={handleSubmit} className="border-b border-[var(--v2-border)] p-3">
        <div className="relative">
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Buscar na base jurídica (Qdrant + DataJud)…"
            className="w-full resize-none rounded-xl border border-[var(--v2-border)] bg-white px-3 py-2 text-xs text-[var(--v2-ink-strong)] placeholder:text-[var(--v2-ink-faint)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            disabled={status === 'searching'}
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); setStats(null); setStatus('idle'); }}
              className="absolute right-2 top-2 rounded-md p-0.5 text-[var(--v2-ink-faint)] hover:bg-[var(--v2-border)]"
              title="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-[11px] text-[var(--v2-ink-faint)] hover:text-[var(--v2-ink-strong)]"
          >
            <SlidersHorizontal className="h-3 w-3" />
            Ajustar pesos
            {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          <button
            type="submit"
            disabled={!query.trim() || status === 'searching'}
            className={clsx(
              'rounded-lg px-3 py-1 text-xs font-semibold transition',
              !query.trim() || status === 'searching'
                ? 'bg-[var(--v2-border)] text-[var(--v2-ink-faint)] cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700',
            )}
          >
            {status === 'searching' ? 'Buscando…' : 'Buscar'}
          </button>
        </div>

        {/* Ajustes avançados */}
        {showAdvanced && (
          <div className="mt-2 space-y-1.5 rounded-lg border border-[var(--v2-border)] bg-[rgba(99,102,241,0.03)] p-2.5">
            <p className="text-[11px] font-semibold text-[var(--v2-ink-muted)]">
              Pesos da fusão RRF
            </p>
            <div className="flex items-center gap-2">
              <label className="flex-1 text-[11px] text-[var(--v2-ink-faint)]">
                Semântico (Qdrant)
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={semanticWeight}
                  onChange={e => setSemanticWeight(Number(e.target.value))}
                  className="mt-0.5 w-full accent-indigo-500"
                />
                <span className="font-mono text-[10px]">{semanticWeight.toFixed(1)}</span>
              </label>
              <label className="flex-1 text-[11px] text-[var(--v2-ink-faint)]">
                Lexical (DataJud)
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={lexicalWeight}
                  onChange={e => setLexicalWeight(Number(e.target.value))}
                  className="mt-0.5 w-full accent-amber-500"
                />
                <span className="font-mono text-[10px]">{lexicalWeight.toFixed(1)}</span>
              </label>
            </div>
          </div>
        )}
      </form>

      {/* Área de resultados */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--v2-border)] scrollbar-track-transparent">
        {/* Loading */}
        {status === 'searching' && (
          <div className="flex items-center justify-center gap-2 p-6 text-xs text-[var(--v2-ink-faint)]">
            <Cpu className="h-3.5 w-3.5 animate-pulse" />
            Buscando em Qdrant + DataJud…
          </div>
        )}

        {/* Erro */}
        {status === 'error' && (
          <div className="m-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <p className="font-semibold">Erro na busca</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Vazio */}
        {status === 'done' && results.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-6 text-xs text-[var(--v2-ink-faint)]">
            <SearchIcon className="h-5 w-5" />
            Nenhum resultado encontrado.
          </div>
        )}

        {/* Resultados */}
        {status === 'done' && results.length > 0 && (
          <>
            {/* Estatísticas */}
            {stats && (
              <div className="flex flex-wrap gap-1.5 border-b border-[var(--v2-border)] px-3 py-2 text-[10px] text-[var(--v2-ink-faint)]">
                <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                  {stats.fused_count} resultados
                </span>
                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                  {stats.total_time_ms}ms
                </span>
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-amber-700">
                  DataJud: {stats.lexical_count}
                </span>
                <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-violet-700">
                  Qdrant: {stats.semantic_count}
                </span>
              </div>
            )}

            {/* Botão "anexar ao contexto" */}
            {onAttachToContext && results.length > 0 && (
              <div className="border-b border-[var(--v2-border)] px-3 py-2">
                <button
                  onClick={() => onAttachToContext(results)}
                  className="w-full rounded-lg border border-[var(--v2-border)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--v2-ink-strong)] hover:bg-indigo-50 hover:border-indigo-300 transition"
                >
                  Anexar {results.length} resultado{results.length !== 1 ? 's' : ''} ao contexto do chat
                </button>
              </div>
            )}

            {/* Lista de resultados */}
            <ul className="flex flex-col">
              {results.map((item, idx) => (
                <li key={`${item.source}-${idx}`}>
                  <ResultRow
                    item={item}
                    expanded={expandedIndex === idx}
                    onToggle={() => toggleExpand(idx)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function ResultRow({
  item,
  expanded,
  onToggle,
}: {
  item: HybridResultItem
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full border-b border-[var(--v2-border)] px-3 py-2.5 text-left transition hover:bg-[rgba(99,102,241,0.03)]"
    >
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--v2-ink-faint)]" />
        <div className="min-w-0 flex-1">
          {/* Cabeçalho do resultado */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="font-semibold text-[var(--v2-ink-strong)] truncate">
              {item.source}
            </span>
            {item.origins && item.origins.length > 0 && (
              <span className="shrink-0 rounded-full bg-[var(--v2-border)] px-1.5 py-px text-[10px] text-[var(--v2-ink-faint)]">
                {item.origins.join('+')}
              </span>
            )}
            <span
              className={clsx(
                'ml-auto shrink-0 rounded-full px-1.5 py-px text-[10px] font-mono',
                item.score >= 0.7
                  ? 'bg-emerald-50 text-emerald-700'
                  : item.score >= 0.4
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-gray-100 text-gray-600',
              )}
            >
              {item.score.toFixed(2)}
            </span>
          </div>

          {/* Preview do conteúdo */}
          <p className="mt-1 text-xs text-[var(--v2-ink-muted)] line-clamp-2">
            {item.content}
          </p>

          {/* Conteúdo expandido */}
          {expanded && (
            <div className="mt-2 rounded-lg border border-[var(--v2-border)] bg-white p-2.5 text-xs text-[var(--v2-ink-strong)] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--v2-border)]">
              {item.content}
            </div>
          )}
        </div>

        {/* Ícone de expandir */}
        <div className="shrink-0 pt-0.5">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--v2-ink-faint)]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[var(--v2-ink-faint)]" />
          )}
        </div>
      </div>

      {/* Link externo para DataJud */}
      {item.process_number && item.process_number !== '?' && (
        <div className="ml-5.5 mt-1 flex items-center gap-1 text-[10px] text-[var(--v2-ink-faint)]">
          <ExternalLink className="h-3 w-3" />
          Processo {item.process_number}
        </div>
      )}
    </button>
  )
}
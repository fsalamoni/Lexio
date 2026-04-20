/**
 * Small reusable sub-components used by ResearchNotebook.
 */
import React, { useEffect, useRef, useState } from 'react'
import {
  Copy, Check as CheckIcon, Clock, MoreVertical, Trash2,
} from 'lucide-react'
import type { ResearchNotebookData } from '../../lib/firestore-service'
import { formatDate } from './utils'

// ── Copy Button ───────────────────────────────────────────────────────────────

export function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard not available */ }
  }
  return (
    <button
      onClick={e => { e.stopPropagation(); handle() }}
      title="Copiar conteúdo"
      aria-label="Copiar conteúdo"
      className={`inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-teal-600 transition-colors ${className}`}
    >
      {copied
        ? <><CheckIcon className="w-3.5 h-3.5 text-green-500" /> Copiado</>
        : <><Copy className="w-3.5 h-3.5" /> Copiar</>
      }
    </button>
  )
}

// ── Notebook List Item ───────────────────────────────────────────────────────

export function NotebookListItem({
  notebook,
  onSelect,
  onDelete,
}: {
  notebook: ResearchNotebookData
  onSelect: () => void
  onDelete: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  return (
    <div
      className="group bg-white rounded-xl border border-gray-200 p-4 hover:border-teal-300 hover:shadow-md transition-all cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{notebook.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{notebook.topic}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(notebook.created_at)}
            </span>
            <span>{notebook.sources.length} fonte{notebook.sources.length !== 1 ? 's' : ''}</span>
            <span>{notebook.messages.length} msg</span>
            <span>{notebook.artifacts.length} artefato{notebook.artifacts.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div ref={menuRef} className="relative flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}
            className="p-1 rounded hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
          >
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-8 z-10 w-36 bg-white border rounded-lg shadow-lg py-1">
              <button
                onClick={e => { e.stopPropagation(); onDelete(); setShowMenu(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3 h-3" /> Excluir
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

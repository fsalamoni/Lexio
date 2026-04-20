/**
 * DataTableViewer — interactive data table with sorting, search, pagination,
 * zebra striping, and responsive horizontal scrolling.
 * Pure React + Tailwind CSS, uses lucide-react icons.
 */

import { useState, useMemo, useCallback } from 'react'
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Pencil, Check } from 'lucide-react'
import type { ParsedDataTable } from './artifact-parsers'

// ── Types ──────────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc'
interface SortState {
  key: string
  dir: SortDir
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const

// ── Helpers ────────────────────────────────────────────────────────────────

function compareValues(a: string | number, b: string | number, dir: SortDir): number {
  // Try numeric comparison first
  const numA = typeof a === 'number' ? a : parseFloat(String(a).replace(/[^\d.,-]/g, '').replace(',', '.'))
  const numB = typeof b === 'number' ? b : parseFloat(String(b).replace(/[^\d.,-]/g, '').replace(',', '.'))

  if (!isNaN(numA) && !isNaN(numB)) {
    return dir === 'asc' ? numA - numB : numB - numA
  }

  // Fall back to string comparison
  const strA = String(a).toLowerCase()
  const strB = String(b).toLowerCase()
  const cmp = strA.localeCompare(strB, 'pt-BR')
  return dir === 'asc' ? cmp : -cmp
}

function alignClass(align?: 'left' | 'right' | 'center'): string {
  switch (align) {
    case 'right': return 'text-right'
    case 'center': return 'text-center'
    default: return 'text-left'
  }
}

// ── Main Component ─────────────────────────────────────────────────────────

interface DataTableViewerProps {
  data: ParsedDataTable
  onChange?: (data: ParsedDataTable) => void
}

export default function DataTableViewer({ data, onChange }: DataTableViewerProps) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState | null>(null)
  const [pageSize, setPageSize] = useState<number>(10)
  const [currentPage, setCurrentPage] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [editedRows, setEditedRows] = useState<typeof data.rows>(() => data.rows.map(r => ({ ...r })))

  const activeRows = editMode ? editedRows : data.rows

  // ── Filtering ────────────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    if (!search.trim()) return activeRows
    const term = search.toLowerCase().trim()
    return activeRows.filter(row =>
      data.columns.some(col => {
        const val = row[col.key]
        return val !== undefined && String(val).toLowerCase().includes(term)
      })
    )
  }, [activeRows, data.columns, search])

  // ── Sorting ────────────────────────────────────────────────────────────

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows
    const { key, dir } = sort
    return [...filteredRows].sort((a, b) => {
      const valA = a[key] ?? ''
      const valB = b[key] ?? ''
      return compareValues(valA, valB, dir)
    })
  }, [filteredRows, sort])

  // ── Pagination ─────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const safePage = Math.min(currentPage, totalPages - 1)
  const pageRows = sortedRows.slice(safePage * pageSize, (safePage + 1) * pageSize)

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleSort = useCallback((key: string) => {
    setSort(prev => {
      if (prev?.key === key) {
        return prev.dir === 'asc' ? { key, dir: 'desc' } : null
      }
      return { key, dir: 'asc' }
    })
  }, [])

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setCurrentPage(0)
  }, [])

  const handlePageSizeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(e.target.value))
    setCurrentPage(0)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────

  if (data.columns.length === 0 || data.rows.length === 0) {
    return <div className="text-center py-12" style={{ color: 'var(--v2-ink-faint)' }}>Tabela vazia.</div>
  }

  return (
    <div className="flex flex-col gap-4">
      {data.renderedImageUrl && (
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: 'var(--v2-line-soft)' }}>
          <img src={data.renderedImageUrl} alt={data.title} className="w-full h-auto object-contain" />
        </div>
      )}

      {/* Title + search + edit toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-lg font-bold truncate" style={{ color: 'var(--v2-ink-strong)' }}>{data.title}</h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onChange && (
            <button
              onClick={() => {
                if (editMode) {
                  onChange({ ...data, rows: editedRows })
                }
                setEditMode(m => !m)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={editMode
                ? { background: 'rgba(15,118,110,0.10)', color: 'var(--v2-accent-strong)', border: '1px solid var(--v2-accent-strong)' }
                : { background: 'rgba(15,23,42,0.05)', color: 'var(--v2-ink-soft)', border: '1px solid var(--v2-line-soft)' }}
            >
              {editMode ? <><Check className="w-3.5 h-3.5" /> Salvar</> : <><Pencil className="w-3.5 h-3.5" /> Editar</>}
            </button>
          )}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--v2-ink-faint)' }} />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Buscar na tabela..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none"
              style={{ border: '1px solid var(--v2-line-soft)', background: 'var(--v2-panel-strong)', color: 'var(--v2-ink-strong)', fontFamily: 'var(--v2-font-sans)' }}
            />
          </div>
        </div>
      </div>

      {/* Table wrapper with horizontal scroll */}
      <div className="overflow-x-auto rounded-xl border" style={{ background: 'var(--v2-panel-strong)', borderColor: 'var(--v2-line-soft)' }}>
        <table className="w-full text-sm">
          {/* Header */}
          <thead>
            <tr className="border-b" style={{ background: 'rgba(15,23,42,0.03)', borderColor: 'var(--v2-line-soft)' }}>
              {/* Row number header */}
              <th
                className="px-2 py-3 w-10 text-center text-xs font-semibold select-none"
                style={{ color: 'var(--v2-ink-faint)', fontFamily: 'var(--v2-font-sans)', borderRight: '1px solid var(--v2-line-soft)' }}
              >
                #
              </th>
              {data.columns.map(col => {
                const isActive = sort?.key === col.key
                return (
                  <th
                    key={col.key}
                    className={`
                      px-4 py-3 font-semibold select-none cursor-pointer
                      whitespace-nowrap transition-colors
                      ${alignClass(col.align)}
                    `}
                    style={{ color: 'var(--v2-ink-strong)', fontFamily: 'var(--v2-font-sans)' }}
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {col.label}
                      {isActive ? (
                        sort!.dir === 'asc' ? (
                          <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--v2-accent-strong)' }} />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--v2-accent-strong)' }} />
                        )
                      ) : (
                        <ChevronsUpDown className="w-3.5 h-3.5" style={{ color: 'var(--v2-ink-faint)' }} />
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={data.columns.length + 1}
                  className="px-4 py-8 text-center"
                  style={{ color: 'var(--v2-ink-faint)' }}
                >
                  Nenhum resultado para &quot;{search}&quot;
                </td>
              </tr>
            ) : (
              pageRows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="border-b transition-colors"
                  style={{ borderColor: 'var(--v2-line-soft)', background: rowIdx % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.02)' }}
                >
                  {/* Row number */}
                  <td
                    className="px-2 py-2.5 text-center text-xs tabular-nums w-10 select-none"
                    style={{ color: 'var(--v2-ink-faint)', borderRight: '1px solid var(--v2-line-soft)', background: 'rgba(15,23,42,0.02)' }}
                  >
                    {safePage * pageSize + rowIdx + 1}
                  </td>
                  {data.columns.map((col, colIdx) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 ${alignClass(col.align)}`}
                      style={{ color: 'var(--v2-ink-strong)' }}
                    >
                      {editMode ? (
                        <input
                          id={`cell-r${safePage * pageSize + rowIdx}-c${colIdx}`}
                          type="text"
                          value={String(editedRows[safePage * pageSize + rowIdx]?.[col.key] ?? '')}
                          onChange={e => {
                            const newRows = editedRows.map((r, ri) =>
                              ri === safePage * pageSize + rowIdx ? { ...r, [col.key]: e.target.value } : r
                            )
                            setEditedRows(newRows)
                          }}
                          onKeyDown={e => {
                            const absRowIdx = safePage * pageSize + rowIdx
                            if (e.key === 'Tab') {
                              e.preventDefault()
                              const next = e.shiftKey ? colIdx - 1 : colIdx + 1
                              if (next >= 0 && next < data.columns.length) {
                                document.getElementById(`cell-r${absRowIdx}-c${next}`)?.focus()
                              } else if (!e.shiftKey && next >= data.columns.length && absRowIdx + 1 < editedRows.length) {
                                document.getElementById(`cell-r${absRowIdx + 1}-c0`)?.focus()
                              } else if (e.shiftKey && next < 0 && absRowIdx > 0) {
                                document.getElementById(`cell-r${absRowIdx - 1}-c${data.columns.length - 1}`)?.focus()
                              }
                            } else if (e.key === 'Enter') {
                              e.preventDefault()
                              if (absRowIdx + 1 < editedRows.length) {
                                document.getElementById(`cell-r${absRowIdx + 1}-c${colIdx}`)?.focus()
                              }
                            }
                          }}
                          className="w-full min-w-[80px] px-2 py-1 text-sm rounded outline-none"
                          style={{ border: '1px solid var(--v2-line-soft)', background: 'var(--v2-panel-strong)', color: 'var(--v2-ink-strong)', fontFamily: 'var(--v2-font-sans)' }}
                        />
                      ) : (
                        row[col.key] !== undefined ? String(row[col.key]) : ''
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>

          {/* Summary row */}
          {data.summary && (
            <tfoot>
              <tr className="border-t-2 font-semibold" style={{ background: 'rgba(15,23,42,0.04)', borderColor: 'var(--v2-line-soft)', color: 'var(--v2-ink-strong)' }}>
                {/* empty row number cell */}
                <td className="w-10" />
                {data.columns.map((col, colIdx) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 ${alignClass(col.align)}`}
                  >
                    {data.summary![col.key] !== undefined
                      ? String(data.summary![col.key])
                      : colIdx === 0
                        ? 'Total'
                        : ''
                    }
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm" style={{ color: 'var(--v2-ink-soft)' }}>
        <div className="flex items-center gap-2">
          <span>Exibindo</span>
          <select
            value={pageSize}
            onChange={handlePageSizeChange}
            className="rounded-md px-2 py-1 text-sm outline-none"
            style={{ border: '1px solid var(--v2-line-soft)', background: 'var(--v2-panel-strong)', color: 'var(--v2-ink-strong)' }}
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <span>
            de {sortedRows.length} {sortedRows.length !== data.rows.length && `(${data.rows.length} total)`}
          </span>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(0)}
              disabled={safePage === 0}
              className="px-2 py-1 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              style={{ color: 'var(--v2-ink-soft)' }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(15,23,42,0.07)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              title="Primeira"
            >
              <ChevronLeft className="w-4 h-4" />
              <ChevronLeft className="w-4 h-4 -ml-3" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="px-2 py-1 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              style={{ color: 'var(--v2-ink-soft)' }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(15,23,42,0.07)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              title="Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page number buttons */}
            {Array.from({ length: totalPages }, (_, i) => i)
              .filter(i => {
                // Show first, last, and pages near current
                if (i === 0 || i === totalPages - 1) return true
                return Math.abs(i - safePage) <= 1
              })
              .reduce<(number | 'ellipsis')[]>((acc, pageNum, idx, arr) => {
                if (idx > 0) {
                  const prev = arr[idx - 1]
                  if (pageNum - prev > 1) acc.push('ellipsis')
                }
                acc.push(pageNum)
                return acc
              }, [])
              .map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`ellipsis-${idx}`} className="px-1" style={{ color: 'var(--v2-ink-faint)' }}>...</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setCurrentPage(item)}
                    className="min-w-[32px] px-2 py-1 rounded text-sm font-medium transition-colors"
                    style={item === safePage
                      ? { background: 'var(--v2-accent-strong)', color: '#fff' }
                      : { color: 'var(--v2-ink-soft)' }}
                  >
                    {item + 1}
                  </button>
                )
              )}

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="px-2 py-1 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              style={{ color: 'var(--v2-ink-soft)' }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(15,23,42,0.07)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              title="Proxima"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages - 1)}
              disabled={safePage >= totalPages - 1}
              className="px-2 py-1 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              style={{ color: 'var(--v2-ink-soft)' }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(15,23,42,0.07)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              title="Ultima"
            >
              <ChevronRight className="w-4 h-4" />
              <ChevronRight className="w-4 h-4 -ml-3" />
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      {data.legend && (
        <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <strong>Legenda:</strong> {data.legend}
        </div>
      )}

      {/* Footnotes */}
      {data.footnotes && data.footnotes.length > 0 && (
        <div className="text-xs text-gray-500 space-y-0.5">
          {data.footnotes.map((note, i) => (
            <p key={i}>
              <sup>{i + 1}</sup> {note}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

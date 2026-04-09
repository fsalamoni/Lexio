/**
 * DataTableViewer — interactive data table with sorting, search, pagination,
 * zebra striping, and responsive horizontal scrolling.
 * Pure React + Tailwind CSS, uses lucide-react icons.
 */

import { useState, useMemo, useCallback } from 'react'
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
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
}

export default function DataTableViewer({ data }: DataTableViewerProps) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState | null>(null)
  const [pageSize, setPageSize] = useState<number>(10)
  const [currentPage, setCurrentPage] = useState(0)

  // ── Filtering ──────────────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    if (!search.trim()) return data.rows
    const term = search.toLowerCase().trim()
    return data.rows.filter(row =>
      data.columns.some(col => {
        const val = row[col.key]
        return val !== undefined && String(val).toLowerCase().includes(term)
      })
    )
  }, [data.rows, data.columns, search])

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
    return <div className="text-center py-12 text-gray-500">Tabela vazia.</div>
  }

  return (
    <div className="flex flex-col gap-4">
      {data.renderedImageUrl && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <img src={data.renderedImageUrl} alt={data.title} className="w-full h-auto object-contain" />
        </div>
      )}

      {/* Title + search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-lg font-bold text-gray-900 truncate">{data.title}</h3>
        <div className="relative flex-shrink-0 w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Buscar na tabela..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
          />
        </div>
      </div>

      {/* Table wrapper with horizontal scroll */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          {/* Header */}
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {data.columns.map(col => {
                const isActive = sort?.key === col.key
                return (
                  <th
                    key={col.key}
                    className={`
                      px-4 py-3 font-semibold text-gray-700 select-none cursor-pointer
                      hover:bg-gray-100 transition-colors whitespace-nowrap
                      ${alignClass(col.align)}
                    `}
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {col.label}
                      {isActive ? (
                        sort!.dir === 'asc' ? (
                          <ChevronUp className="w-3.5 h-3.5 text-brand-600" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-brand-600" />
                        )
                      ) : (
                        <ChevronsUpDown className="w-3.5 h-3.5 text-gray-300" />
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
                  colSpan={data.columns.length}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  Nenhum resultado para &quot;{search}&quot;
                </td>
              </tr>
            ) : (
              pageRows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={`
                    border-b border-gray-100 transition-colors
                    hover:bg-brand-50/40
                    ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                  `}
                >
                  {data.columns.map(col => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 text-gray-700 ${alignClass(col.align)}`}
                    >
                      {row[col.key] !== undefined ? String(row[col.key]) : ''}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>

          {/* Summary row */}
          {data.summary && (
            <tfoot>
              <tr className="bg-gray-100 border-t-2 border-gray-300 font-semibold text-gray-800">
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <span>Exibindo</span>
          <select
            value={pageSize}
            onChange={handlePageSizeChange}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
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
              className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Primeira"
            >
              <ChevronLeft className="w-4 h-4" />
              <ChevronLeft className="w-4 h-4 -ml-3" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                  <span key={`ellipsis-${idx}`} className="px-1 text-gray-400">...</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setCurrentPage(item)}
                    className={`
                      min-w-[32px] px-2 py-1 rounded text-sm font-medium transition-colors
                      ${item === safePage
                        ? 'bg-brand-600 text-white'
                        : 'hover:bg-gray-100 text-gray-600'
                      }
                    `}
                  >
                    {item + 1}
                  </button>
                )
              )}

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Proxima"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages - 1)}
              disabled={safePage >= totalPages - 1}
              className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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

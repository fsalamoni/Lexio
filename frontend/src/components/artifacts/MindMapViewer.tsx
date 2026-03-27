/**
 * MindMapViewer — pure React/CSS horizontal tree visualization for mind maps.
 * No external dependencies (no D3). Uses nested divs with CSS connecting lines.
 * Supports collapse/expand with smooth transitions.
 */

import { useState, useCallback } from 'react'
import type { ParsedMindMap, MindMapNode } from './artifact-parsers'

// ── Color palette for branches without explicit colors ─────────────────────

const BRANCH_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#14B8A6', // teal
  '#6366F1', // indigo
]

function getColor(node: MindMapNode, branchIndex: number): string {
  return node.color || BRANCH_COLORS[branchIndex % BRANCH_COLORS.length]
}

function lighten(hex: string, amount: number): string {
  // Simple lighten: blend toward white
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(amount * 255))
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(amount * 255))
  const b = Math.min(255, (num & 0xff) + Math.round(amount * 255))
  return `rgb(${r}, ${g}, ${b})`
}

// ── Recursive tree node ────────────────────────────────────────────────────

interface TreeNodeProps {
  node: MindMapNode
  branchColor: string
  depth: number
  branchIndex: number
  collapsedSet: Set<string>
  toggleCollapsed: (key: string) => void
  nodeKeyPrefix: string
}

function TreeNode({
  node,
  branchColor,
  depth,
  branchIndex,
  collapsedSet,
  toggleCollapsed,
  nodeKeyPrefix,
}: TreeNodeProps) {
  const nodeKey = `${nodeKeyPrefix}-${node.label}`
  const hasChildren = node.children && node.children.length > 0
  const isCollapsed = collapsedSet.has(nodeKey)
  const color = getColor(node, branchIndex)

  // Progressively lighter backgrounds at deeper levels
  const bgColor = depth === 0
    ? color
    : lighten(color, 0.25 + depth * 0.1)
  const textColor = depth === 0 ? '#ffffff' : '#1f2937'
  const borderColor = color

  return (
    <div className="flex items-start">
      {/* Connecting line from parent */}
      {depth > 0 && (
        <div className="flex flex-col items-center justify-center flex-shrink-0" style={{ width: 24 }}>
          <div
            className="w-6 border-t-2"
            style={{ borderColor }}
          />
        </div>
      )}

      <div className="flex flex-col">
        {/* Node pill */}
        <button
          onClick={hasChildren ? () => toggleCollapsed(nodeKey) : undefined}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
            border-2 whitespace-nowrap transition-all duration-200
            ${hasChildren ? 'cursor-pointer hover:shadow-md active:scale-95' : 'cursor-default'}
          `}
          style={{
            backgroundColor: bgColor,
            color: textColor,
            borderColor,
          }}
          title={hasChildren ? (isCollapsed ? 'Expandir' : 'Recolher') : undefined}
        >
          {node.icon && <span className="flex-shrink-0">{node.icon}</span>}
          <span>{node.label}</span>
          {hasChildren && (
            <span
              className="ml-1 text-xs opacity-60 transition-transform duration-200"
              style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
            >
              ▼
            </span>
          )}
        </button>

        {/* Children container with smooth expand/collapse */}
        {hasChildren && (
          <div
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{
              maxHeight: isCollapsed ? 0 : 9999,
              opacity: isCollapsed ? 0 : 1,
            }}
          >
            <div className="flex flex-col gap-1.5 ml-3 mt-1.5 pl-3 border-l-2" style={{ borderColor }}>
              {node.children!.map((child, i) => (
                <TreeNode
                  key={`${nodeKey}-${i}-${child.label}`}
                  node={child}
                  branchColor={color}
                  depth={depth + 1}
                  branchIndex={branchIndex}
                  collapsedSet={collapsedSet}
                  toggleCollapsed={toggleCollapsed}
                  nodeKeyPrefix={nodeKey}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

interface MindMapViewerProps {
  data: ParsedMindMap
}

export default function MindMapViewer({ data }: MindMapViewerProps) {
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set())

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsedSet(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setCollapsedSet(new Set())
  }, [])

  const collapseAll = useCallback(() => {
    // Collect all keys for nodes that have children
    const keys = new Set<string>()
    function walk(node: MindMapNode, prefix: string) {
      const key = `${prefix}-${node.label}`
      if (node.children && node.children.length > 0) {
        keys.add(key)
        node.children.forEach((child, i) => walk(child, key))
      }
    }
    data.branches.forEach((branch, i) => walk(branch, `root-${i}`))
    setCollapsedSet(keys)
  }, [data])

  if (data.branches.length === 0) {
    return <div className="text-center py-12 text-gray-500">Mapa mental vazio.</div>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900 truncate">{data.centralNode}</h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={expandAll}
            className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Expandir tudo
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Recolher tudo
          </button>
        </div>
      </div>

      {/* Tree container */}
      <div className="overflow-auto rounded-xl bg-gray-50 border border-gray-200 p-6">
        <div className="flex items-start gap-6">
          {/* Central node */}
          <div className="flex flex-col items-center justify-center flex-shrink-0">
            <div className="px-5 py-3 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 text-white font-bold text-base shadow-lg whitespace-nowrap">
              {data.centralNode}
            </div>
          </div>

          {/* Branches */}
          <div className="flex flex-col gap-3">
            {data.branches.map((branch, i) => (
              <div key={`root-${i}-${branch.label}`} className="flex items-start">
                {/* Horizontal connector from central node */}
                <div className="flex items-center flex-shrink-0" style={{ width: 32 }}>
                  <div
                    className="w-full border-t-2"
                    style={{ borderColor: getColor(branch, i) }}
                  />
                </div>
                <TreeNode
                  node={branch}
                  branchColor={getColor(branch, i)}
                  depth={0}
                  branchIndex={i}
                  collapsedSet={collapsedSet}
                  toggleCollapsed={toggleCollapsed}
                  nodeKeyPrefix={`root-${i}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hint */}
      <p className="text-[10px] text-gray-400 text-center">
        Clique em um ramo para expandir ou recolher
      </p>
    </div>
  )
}

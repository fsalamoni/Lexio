/**
 * DraggablePanel — A non-blocking, movable, resizable, collapsible panel.
 *
 * Replaces traditional modal dialogs. Does NOT use a backdrop overlay,
 * so the user can interact with the rest of the page while the panel is open.
 *
 * Features:
 *  - Drag by header
 *  - Resize from edges/corners
 *  - Collapse/minimize to a compact bar
 *  - Bring to front on click
 *  - Escape to close
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { X, Minus, Maximize2, Minimize2 } from 'lucide-react'

// ── Z-index management ──────────────────────────────────────────────────────
let globalZCounter = 1000

function bringToFront(): number {
  globalZCounter += 1
  return globalZCounter
}

// ── Types ───────────────────────────────────────────────────────────────────

interface DraggablePanelProps {
  /** Whether the panel is visible */
  open: boolean
  /** Called when user closes the panel */
  onClose: () => void
  /** Panel title shown in the header */
  title: string
  /** Optional icon element to show before title */
  icon?: ReactNode
  /** Panel content */
  children: ReactNode
  /** Initial width in px (default: 600) */
  initialWidth?: number
  /** Initial height in px (default: 500) */
  initialHeight?: number
  /** Minimum width (default: 320) */
  minWidth?: number
  /** Minimum height (default: 200) */
  minHeight?: number
  /** Start maximized */
  startMaximized?: boolean
  /** Optional className for the content area */
  className?: string
  /** Whether close on Escape is enabled (default: true) */
  closeOnEscape?: boolean
}

// ── Component ───────────────────────────────────────────────────────────────

export default function DraggablePanel({
  open,
  onClose,
  title,
  icon,
  children,
  initialWidth = 600,
  initialHeight = 500,
  minWidth = 320,
  minHeight = 200,
  startMaximized = false,
  className = '',
  closeOnEscape = true,
}: DraggablePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [zIndex, setZIndex] = useState(() => bringToFront())
  const [collapsed, setCollapsed] = useState(false)
  const [maximized, setMaximized] = useState(startMaximized)

  // Position and size state
  const [pos, setPos] = useState({ x: -1, y: -1 })
  const [size, setSize] = useState({ w: initialWidth, h: initialHeight })
  const [preMaxState, setPreMaxState] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // Dragging state
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  // Resizing state
  const resizing = useRef<string | null>(null)
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, px: 0, py: 0 })

  // Center on first open
  useEffect(() => {
    if (open && pos.x === -1) {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = startMaximized ? vw : Math.min(initialWidth, vw - 40)
      const h = startMaximized ? vh : Math.min(initialHeight, vh - 40)
      setPos({
        x: startMaximized ? 0 : Math.max(20, (vw - w) / 2),
        y: startMaximized ? 0 : Math.max(20, (vh - h) / 2),
      })
      setSize({ w, h })
    }
  }, [open, pos.x, initialWidth, initialHeight, startMaximized])

  // Escape key handler
  useEffect(() => {
    if (!open || !closeOnEscape) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose, closeOnEscape])

  // Focus trap: bring to front on click
  const handleFocus = useCallback(() => {
    setZIndex(bringToFront())
  }, [])

  // ── Drag handlers ───────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (maximized) return
    e.preventDefault()
    dragging.current = true
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    setZIndex(bringToFront())
  }, [pos, maximized])

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (dragging.current) {
        const newX = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x))
        const newY = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.current.y))
        setPos({ x: newX, y: newY })
      }
      if (resizing.current) {
        const dx = e.clientX - resizeStart.current.x
        const dy = e.clientY - resizeStart.current.y
        const edge = resizing.current
        let newW = resizeStart.current.w
        let newH = resizeStart.current.h
        let newX = resizeStart.current.px
        let newY = resizeStart.current.py

        if (edge.includes('e')) newW = Math.max(minWidth, resizeStart.current.w + dx)
        if (edge.includes('s')) newH = Math.max(minHeight, resizeStart.current.h + dy)
        if (edge.includes('w')) {
          const dw = Math.min(dx, resizeStart.current.w - minWidth)
          newW = resizeStart.current.w - dw
          newX = resizeStart.current.px + dw
        }
        if (edge.includes('n')) {
          const dh = Math.min(dy, resizeStart.current.h - minHeight)
          newH = resizeStart.current.h - dh
          newY = resizeStart.current.py + dh
        }

        setSize({ w: newW, h: newH })
        setPos({ x: newX, y: newY })
      }
    }
    const handleUp = () => {
      dragging.current = false
      resizing.current = null
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [minWidth, minHeight])

  // ── Resize edge start ─────────────────────────────────────────────────

  const handleResizeStart = useCallback((edge: string) => (e: React.MouseEvent) => {
    if (maximized) return
    e.preventDefault()
    e.stopPropagation()
    resizing.current = edge
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h, px: pos.x, py: pos.y }
    setZIndex(bringToFront())
  }, [size, pos, maximized])

  // ── Maximize toggle ───────────────────────────────────────────────────

  const toggleMaximize = useCallback(() => {
    if (maximized) {
      if (preMaxState) {
        setPos({ x: preMaxState.x, y: preMaxState.y })
        setSize({ w: preMaxState.w, h: preMaxState.h })
      }
      setMaximized(false)
    } else {
      setPreMaxState({ x: pos.x, y: pos.y, w: size.w, h: size.h })
      setPos({ x: 0, y: 0 })
      setSize({ w: window.innerWidth, h: window.innerHeight })
      setMaximized(true)
    }
  }, [maximized, pos, size, preMaxState])

  if (!open) return null

  const headerHeight = 40
  const resizeEdgeSize = 6

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      onMouseDown={handleFocus}
      className="fixed flex flex-col overflow-hidden select-none"
      style={{
        zIndex,
        left: pos.x,
        top: pos.y,
        width: maximized ? '100vw' : size.w,
        height: collapsed ? headerHeight : (maximized ? '100vh' : size.h),
        transition: collapsed ? 'height 0.15s ease' : undefined,
        background: 'var(--v2-panel-strong, #fff)',
        border: '1px solid var(--v2-line-soft, rgba(15,23,42,0.08))',
        borderRadius: maximized ? '0' : '1.25rem',
        boxShadow: '0 32px 80px rgba(15,23,42,0.18), 0 8px 24px rgba(15,23,42,0.10)',
        fontFamily: "var(--v2-font-sans, 'Inter', sans-serif)",
      }}
    >
      {/* ── Header (drag handle) ─────────────────────────────────────────── */}
      <div
        onMouseDown={handleDragStart}
        onDoubleClick={toggleMaximize}
        className="flex items-center gap-2 px-4 flex-shrink-0 select-none cursor-move"
        style={{
          height: headerHeight,
          borderBottom: '1px solid var(--v2-line-soft, rgba(15,23,42,0.08))',
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {icon && (
          <span
            className="flex-shrink-0 flex items-center justify-center"
            style={{ color: 'var(--v2-ink-faint, #7d8797)' }}
          >
            {icon}
          </span>
        )}
        <span
          className="flex-1 truncate text-sm font-semibold"
          style={{ color: 'var(--v2-ink-strong, #172033)' }}
        >
          {title}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); setCollapsed(c => !c) }}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
            style={{ color: 'var(--v2-ink-faint)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            title={collapsed ? 'Expandir' : 'Minimizar'}
          >
            <Minus size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleMaximize() }}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
            style={{ color: 'var(--v2-ink-faint)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            title={maximized ? 'Restaurar' : 'Maximizar'}
          >
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose() }}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
            style={{ color: 'var(--v2-ink-faint)' }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(239,68,68,0.12)'
              e.currentTarget.style.color = 'rgb(220,38,38)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--v2-ink-faint)'
            }}
            title="Fechar"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {!collapsed && (
        <div
          className={`flex-1 overflow-auto ${className}`}
          style={{ background: 'var(--v2-panel-strong, #fff)' }}
        >
          {children}
        </div>
      )}

      {/* ── Resize handles (only when not maximized/collapsed) ───────────── */}
      {!maximized && !collapsed && (
        <>
          {/* Edges */}
          <div onMouseDown={handleResizeStart('n')} className="absolute top-0 left-2 right-2 cursor-n-resize" style={{ height: resizeEdgeSize }} />
          <div onMouseDown={handleResizeStart('s')} className="absolute bottom-0 left-2 right-2 cursor-s-resize" style={{ height: resizeEdgeSize }} />
          <div onMouseDown={handleResizeStart('w')} className="absolute left-0 top-2 bottom-2 cursor-w-resize" style={{ width: resizeEdgeSize }} />
          <div onMouseDown={handleResizeStart('e')} className="absolute right-0 top-2 bottom-2 cursor-e-resize" style={{ width: resizeEdgeSize }} />
          {/* Corners */}
          <div onMouseDown={handleResizeStart('nw')} className="absolute top-0 left-0 cursor-nw-resize" style={{ width: resizeEdgeSize * 2, height: resizeEdgeSize * 2 }} />
          <div onMouseDown={handleResizeStart('ne')} className="absolute top-0 right-0 cursor-ne-resize" style={{ width: resizeEdgeSize * 2, height: resizeEdgeSize * 2 }} />
          <div onMouseDown={handleResizeStart('sw')} className="absolute bottom-0 left-0 cursor-sw-resize" style={{ width: resizeEdgeSize * 2, height: resizeEdgeSize * 2 }} />
          <div onMouseDown={handleResizeStart('se')} className="absolute bottom-0 right-0 cursor-se-resize" style={{ width: resizeEdgeSize * 2, height: resizeEdgeSize * 2 }} />
        </>
      )}
    </div>
  )
}

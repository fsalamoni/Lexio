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
const MOBILE_BREAKPOINT_PX = 768
const MOBILE_PANEL_MARGIN_PX = 8
const COMPACT_PANEL_MIN_WIDTH_PX = 280
const COMPACT_PANEL_MIN_HEIGHT_PX = 220
const DEFAULT_VIEWPORT_WIDTH_PX = 1280
const DEFAULT_VIEWPORT_HEIGHT_PX = 720

function bringToFront(): number {
  globalZCounter += 1
  return globalZCounter
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

function readViewportSize(): { w: number; h: number } {
  if (typeof window === 'undefined') {
    return { w: DEFAULT_VIEWPORT_WIDTH_PX, h: DEFAULT_VIEWPORT_HEIGHT_PX }
  }

  const visualViewport = window.visualViewport
  const width = visualViewport?.width ?? window.innerWidth
  const height = visualViewport?.height ?? window.innerHeight

  return {
    w: Math.max(1, Math.round(width)),
    h: Math.max(1, Math.round(height)),
  }
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
  const [viewport, setViewport] = useState(() => readViewportSize())

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
  const isCompactViewport = viewport.w < MOBILE_BREAKPOINT_PX
  const headerHeight = 40
  const compactWidth = Math.max(1, viewport.w - MOBILE_PANEL_MARGIN_PX * 2)
  const compactHeight = Math.max(1, viewport.h - MOBILE_PANEL_MARGIN_PX * 2)

  useEffect(() => {
    const handleViewportChange = () => {
      setViewport(readViewportSize())
    }
    const visualViewport = window.visualViewport

    window.addEventListener('resize', handleViewportChange)
    visualViewport?.addEventListener('resize', handleViewportChange)
    visualViewport?.addEventListener('scroll', handleViewportChange)

    return () => {
      window.removeEventListener('resize', handleViewportChange)
      visualViewport?.removeEventListener('resize', handleViewportChange)
      visualViewport?.removeEventListener('scroll', handleViewportChange)
    }
  }, [])

  const applyCompactGeometry = useCallback(() => {
    const compactMinWidth = Math.min(COMPACT_PANEL_MIN_WIDTH_PX, compactWidth)
    const compactMinHeight = Math.min(COMPACT_PANEL_MIN_HEIGHT_PX, compactHeight)
    const nextWidth = clamp(initialWidth, compactMinWidth, compactWidth)
    const nextHeight = clamp(initialHeight, compactMinHeight, compactHeight)

    setPos({ x: MOBILE_PANEL_MARGIN_PX, y: MOBILE_PANEL_MARGIN_PX })
    setSize({ w: nextWidth, h: nextHeight })
  }, [compactWidth, compactHeight, initialWidth, initialHeight])

  // Center on first open
  useEffect(() => {
    if (open && pos.x === -1) {
      if (isCompactViewport) {
        applyCompactGeometry()
        return
      }

      const w = startMaximized ? viewport.w : Math.min(initialWidth, viewport.w - 40)
      const h = startMaximized ? viewport.h : Math.min(initialHeight, viewport.h - 40)
      setPos({
        x: startMaximized ? 0 : Math.max(20, (viewport.w - w) / 2),
        y: startMaximized ? 0 : Math.max(20, (viewport.h - h) / 2),
      })
      setSize({ w, h })
    }
  }, [open, pos.x, initialWidth, initialHeight, startMaximized, isCompactViewport, applyCompactGeometry, viewport.w, viewport.h])

  useEffect(() => {
    if (!open || maximized) return

    if (isCompactViewport) {
      applyCompactGeometry()
      return
    }

    setSize((prev) => {
      const nextW = Math.min(prev.w, viewport.w)
      const nextH = Math.min(prev.h, viewport.h)
      if (nextW === prev.w && nextH === prev.h) return prev
      return { w: nextW, h: nextH }
    })

    setPos((prev) => {
      const boundedWidth = Math.min(size.w, viewport.w)
      const boundedHeight = Math.min(size.h, viewport.h)
      const maxX = Math.max(0, viewport.w - boundedWidth)
      const maxY = Math.max(0, viewport.h - (collapsed ? headerHeight : boundedHeight))
      const nextX = clamp(prev.x, 0, maxX)
      const nextY = clamp(prev.y, 0, maxY)
      if (nextX === prev.x && nextY === prev.y) return prev
      return { x: nextX, y: nextY }
    })
  }, [open, maximized, isCompactViewport, applyCompactGeometry, viewport.w, viewport.h, size.w, size.h, collapsed])

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
    if (maximized || isCompactViewport) return
    e.preventDefault()
    dragging.current = true
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    setZIndex(bringToFront())
  }, [pos, maximized, isCompactViewport])

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (dragging.current && !isCompactViewport) {
        const boundedWidth = Math.min(size.w, viewport.w)
        const boundedHeight = Math.min(size.h, viewport.h)
        const maxX = Math.max(0, viewport.w - boundedWidth)
        const maxY = Math.max(0, viewport.h - (collapsed ? headerHeight : boundedHeight))
        const newX = clamp(e.clientX - dragOffset.current.x, 0, maxX)
        const newY = clamp(e.clientY - dragOffset.current.y, 0, maxY)
        setPos({ x: newX, y: newY })
      }
      if (resizing.current && !isCompactViewport) {
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

        newW = Math.min(newW, viewport.w)
        newH = Math.min(newH, viewport.h)
        newX = clamp(newX, 0, Math.max(0, viewport.w - newW))
        newY = clamp(newY, 0, Math.max(0, viewport.h - newH))

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
  }, [minWidth, minHeight, viewport.w, viewport.h, size.w, size.h, collapsed, isCompactViewport])

  // ── Resize edge start ─────────────────────────────────────────────────

  const handleResizeStart = useCallback((edge: string) => (e: React.MouseEvent) => {
    if (maximized || isCompactViewport) return
    e.preventDefault()
    e.stopPropagation()
    resizing.current = edge
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h, px: pos.x, py: pos.y }
    setZIndex(bringToFront())
  }, [size, pos, maximized, isCompactViewport])

  // ── Maximize toggle ───────────────────────────────────────────────────

  const toggleMaximize = useCallback(() => {
    if (isCompactViewport) return
    if (maximized) {
      if (preMaxState) {
        setPos({ x: preMaxState.x, y: preMaxState.y })
        setSize({ w: preMaxState.w, h: preMaxState.h })
      }
      setMaximized(false)
    } else {
      setPreMaxState({ x: pos.x, y: pos.y, w: size.w, h: size.h })
      setPos({ x: 0, y: 0 })
      setSize({ w: viewport.w, h: viewport.h })
      setMaximized(true)
    }
  }, [maximized, pos, size, preMaxState, isCompactViewport, viewport.w, viewport.h])

  if (!open) return null

  const resizeEdgeSize = 6
  const renderedWidth = isCompactViewport
    ? compactWidth
    : (maximized ? viewport.w : size.w)
  const renderedHeight = collapsed
    ? headerHeight
    : (isCompactViewport ? compactHeight : (maximized ? viewport.h : size.h))

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      onMouseDown={handleFocus}
      className="fixed flex flex-col overflow-hidden select-none"
      style={{
        zIndex,
        left: isCompactViewport ? MOBILE_PANEL_MARGIN_PX : pos.x,
        top: isCompactViewport ? MOBILE_PANEL_MARGIN_PX : pos.y,
        width: renderedWidth,
        height: renderedHeight,
        transition: collapsed ? 'height 0.15s ease' : undefined,
        background: 'var(--v2-panel-strong, #fff)',
        border: '1px solid var(--v2-line-soft, rgba(15,23,42,0.08))',
        borderRadius: maximized ? '0' : (isCompactViewport ? '1rem' : '1.25rem'),
        boxShadow: '0 32px 80px rgba(15,23,42,0.18), 0 8px 24px rgba(15,23,42,0.10)',
        fontFamily: "var(--v2-font-sans, 'Inter', sans-serif)",
      }}
    >
      {/* ── Header (drag handle) ─────────────────────────────────────────── */}
      <div
        onMouseDown={handleDragStart}
        onDoubleClick={isCompactViewport ? undefined : toggleMaximize}
        className={`flex items-center gap-2 px-4 flex-shrink-0 select-none ${isCompactViewport ? 'cursor-default' : 'cursor-move'}`}
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
            disabled={isCompactViewport}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
            style={{
              color: 'var(--v2-ink-faint)',
              opacity: isCompactViewport ? 0.5 : 1,
              cursor: isCompactViewport ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={e => {
              if (isCompactViewport) return
              e.currentTarget.style.background = 'rgba(15,23,42,0.07)'
            }}
            onMouseLeave={e => {
              if (isCompactViewport) return
              e.currentTarget.style.background = 'transparent'
            }}
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
      {!maximized && !collapsed && !isCompactViewport && (
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

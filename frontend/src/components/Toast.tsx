/**
 * Lexio — Toast notification system
 *
 * Usage:
 *   const toast = useToast()
 *   toast.success('Documento salvo!')
 *   toast.error('Erro ao carregar')
 *   toast.info('Indexando...')
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
}

interface ToastContextType {
  success: (title: string, description?: string) => void
  error:   (title: string, description?: string) => void
  info:    (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

const ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error:   XCircle,
  info:    Info,
  warning: AlertTriangle,
}

const STYLES: Record<ToastType, string> = {
  success: 'border-green-200 bg-green-50  text-green-900',
  error:   'border-red-200   bg-red-50    text-red-900',
  info:    'border-blue-200  bg-blue-50   text-blue-900',
  warning: 'border-amber-200 bg-amber-50  text-amber-900',
}

const ICON_STYLES: Record<ToastType, string> = {
  success: 'text-green-500',
  error:   'text-red-500',
  info:    'text-blue-500',
  warning: 'text-amber-500',
}

let counter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  const add = useCallback((type: ToastType, title: string, description?: string) => {
    const id = `toast-${++counter}`
    setToasts(prev => [...prev.slice(-4), { id, type, title, description }])
    const t = setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4000)
    timers.current.set(id, t)
  }, [dismiss])

  const ctx: ToastContextType = {
    success: (t, d) => add('success', t, d),
    error:   (t, d) => add('error',   t, d),
    info:    (t, d) => add('info',    t, d),
    warning: (t, d) => add('warning', t, d),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Container */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map(toast => {
          const Icon = ICONS[toast.type]
          return (
            <div
              key={toast.id}
              role="alert"
              className={`
                pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3
                shadow-lg shadow-black/5 toast-enter
                ${STYLES[toast.type]}
              `}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${ICON_STYLES[toast.type]}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description && (
                  <p className="text-xs mt-0.5 opacity-80">{toast.description}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Fechar notificação"
                className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

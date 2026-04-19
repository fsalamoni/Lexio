import { useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import { Menu, ArrowUp } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { ErrorBoundary } from './ErrorBoundary'
import NotificationBell from './NotificationBell'
import { useToast } from './Toast'
import api from '../api/client'
import { IS_FIREBASE } from '../lib/firebase'
import { runModelHealthCheck, formatHealthCheckMessage } from '../lib/model-health-check'
import { buildWorkspaceDocumentDetailPath } from '../lib/workspace-routes'

const POLL_INTERVAL = 30_000 // 30 seconds

export default function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const processingRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)
  const lastRuntimeToastRef = useRef(0)

  useEffect(() => {
    const handler = () => toast.error('Muitas requisições', 'Aguarde um momento e tente novamente.')
    window.addEventListener('lexio:rate-limit', handler)
    return () => window.removeEventListener('lexio:rate-limit', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Global runtime error handlers to avoid silent failures and improve recovery UX.
  useEffect(() => {
    const shouldNotify = () => {
      const now = Date.now()
      if (now - lastRuntimeToastRef.current < 4000) return false
      lastRuntimeToastRef.current = now
      return true
    }

    const onError = (event: ErrorEvent) => {
      if (!shouldNotify()) return
      const message = event.message || 'Erro inesperado no aplicativo.'
      toast.error('Erro inesperado', message)
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!shouldNotify()) return
      const reason = event.reason
      const message = reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Falha inesperada durante a operação.'
      toast.error('Falha na operação', message)
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for document completion every 30s (API mode only)
  useEffect(() => {
    if (IS_FIREBASE) return // Firebase mode handles completion via Firestore
    const fetchAndCheck = async () => {
      try {
        const res = await api.get('/documents', { params: { limit: 50 } })
        const docs: Array<{ id: string; status: string; document_type_id: string; tema?: string }> =
          res.data?.items || []

        if (!initializedRef.current) {
          docs.filter(d => d.status === 'processando').forEach(d => processingRef.current.add(d.id))
          initializedRef.current = true
          return
        }

        const nowProcessing = new Set(docs.filter(d => d.status === 'processando').map(d => d.id))

        for (const doc of docs) {
          if (processingRef.current.has(doc.id) && doc.status === 'concluido') {
            toast.success('Documento concluído', doc.tema || doc.document_type_id)
            const docId = doc.id
            setTimeout(() => navigate(buildWorkspaceDocumentDetailPath(docId, { preserveSearch: location.search })), 300)
          }
        }

        processingRef.current = nowProcessing
      } catch {
        // Silently ignore poll errors
      }
    }

    fetchAndCheck()
    const timer = setInterval(fetchAndCheck, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [location.search]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Model health check — runs once per session, max once per 24h ──
  useEffect(() => {
    if (!IS_FIREBASE) return
    runModelHealthCheck().then(result => {
      if (result.didRun && result.removedModels.length > 0) {
        const msg = formatHealthCheckMessage(result)
        toast.warning(msg.title, msg.message)
      }
    }).catch((err) => {
      console.warn('Model health check failed:', err)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll-to-top button
  const [showScrollTop, setShowScrollTop] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    const el = mainRef.current
    if (el) setShowScrollTop(el.scrollTop > 400)
  }, [])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div ref={mainRef} onScroll={handleScroll} className="flex-1 flex flex-col min-w-0 overflow-auto">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-semibold text-gray-800 text-sm">Lexio</span>
          </div>
          <NotificationBell />
        </header>

        {/* Desktop top-right notification bell */}
        <div className="hidden md:flex justify-end px-6 pt-4 pb-0">
          <NotificationBell />
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 md:pt-2">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>

        {/* Scroll to top */}
        {showScrollTop && (
          <button
            onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 z-40 p-2.5 bg-brand-600 text-white rounded-full shadow-lg hover:bg-brand-700 transition-all opacity-80 hover:opacity-100"
            aria-label="Voltar ao topo"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}

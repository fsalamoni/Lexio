import { useState, useEffect, useRef, ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { ErrorBoundary } from './ErrorBoundary'
import NotificationBell from './NotificationBell'
import { useToast } from './Toast'
import api from '../api/client'
import { IS_FIREBASE } from '../lib/firebase'
import { runModelHealthCheck, formatHealthCheckMessage } from '../lib/model-health-check'

const POLL_INTERVAL = 30_000 // 30 seconds

export default function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()
  const processingRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)

  useEffect(() => {
    const handler = () => toast.error('Muitas requisições', 'Aguarde um momento e tente novamente.')
    window.addEventListener('lexio:rate-limit', handler)
    return () => window.removeEventListener('lexio:rate-limit', handler)
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
            setTimeout(() => navigate(`/documents/${docId}`), 300)
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Model health check — runs once per session, max once per 24h ──
  useEffect(() => {
    if (!IS_FIREBASE) return
    runModelHealthCheck().then(result => {
      if (result.didRun && result.removedModels.length > 0) {
        const msg = formatHealthCheckMessage(result)
        toast.warning(msg.title, msg.message)
      }
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-auto">

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
      </div>
    </div>
  )
}

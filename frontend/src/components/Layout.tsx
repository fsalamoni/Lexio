import { useState, useEffect, ReactNode } from 'react'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import { ErrorBoundary } from './ErrorBoundary'
import { useToast } from './Toast'
export default function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const toast = useToast()

  useEffect(() => {
    const handler = () => toast.error('Muitas requisições', 'Aguarde um momento e tente novamente.')
    window.addEventListener('lexio:rate-limit', handler)
    return () => window.removeEventListener('lexio:rate-limit', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-auto">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-gray-800 text-sm">Lexio</span>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

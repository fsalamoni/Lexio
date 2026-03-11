import { useState, ReactNode } from 'react'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import { ErrorBoundary } from './ErrorBoundary'
import NotificationBell from './NotificationBell'

export default function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

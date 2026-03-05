import { ReactNode } from 'react'
import Sidebar from './Sidebar'
import { IS_DEMO } from '../demo/interceptor'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-auto">
        {IS_DEMO && (
          <div className="bg-brand-600 text-white text-center text-sm py-2 px-4">
            Modo demonstração — dados simulados.
            Para uso completo, faça o deploy com Docker Compose.
          </div>
        )}
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  )
}

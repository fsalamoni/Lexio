import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FileText, PlusCircle, Upload, Scale, LogOut, Shield } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../contexts/AuthContext'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/documents', label: 'Documentos', icon: FileText },
  { to: '/documents/new', label: 'Novo Documento', icon: PlusCircle },
  { to: '/upload', label: 'Upload', icon: Upload },
]

export default function Sidebar() {
  const { logout, role } = useAuth()

  return (
    <aside className="w-64 bg-brand-900 text-white min-h-screen flex flex-col">
      <div className="p-6 flex items-center gap-3 border-b border-white/10">
        <Scale className="w-8 h-8 text-brand-300" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">Lexio</h1>
          <p className="text-xs text-brand-300">Produção Jurídica com IA</p>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-brand-200 hover:bg-white/10'
              )
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
        {role === 'admin' && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-brand-200 hover:bg-white/10'
              )
            }
          >
            <Shield className="w-5 h-5" />
            Admin
          </NavLink>
        )}
      </nav>
      <div className="p-4 border-t border-white/10">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-brand-200 hover:bg-white/10 w-full"
        >
          <LogOut className="w-5 h-5" />
          Sair
        </button>
        <p className="text-xs text-brand-400 mt-2 px-4">v1.0.0 — Lexio</p>
      </div>
    </aside>
  )
}

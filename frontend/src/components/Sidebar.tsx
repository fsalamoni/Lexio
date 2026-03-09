import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FileText, PlusCircle, Upload,
  Scale, LogOut, Shield, BookOpen, ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../contexts/AuthContext'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/documents', label: 'Documentos', icon: FileText },
  { to: '/documents/new', label: 'Novo Documento', icon: PlusCircle },
  { to: '/theses', label: 'Banco de Teses', icon: BookOpen },
  { to: '/upload', label: 'Acervo', icon: Upload },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

function NavItem({
  to, label, icon: Icon, end, onClick,
}: {
  to: string; label: string; icon: React.ElementType; end?: boolean; onClick?: () => void
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150',
          isActive
            ? 'bg-white/15 text-white font-medium'
            : 'text-brand-200 hover:bg-white/10 hover:text-white'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={clsx('w-5 h-5 flex-shrink-0 transition-transform', !isActive && 'group-hover:scale-110')} />
          <span className="flex-1">{label}</span>
          {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-50" />}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { logout, role, fullName } = useAuth()

  const sidebar = (
    <aside className="w-64 bg-brand-900 text-white h-full flex flex-col">
      {/* Logo */}
      <div className="p-5 flex items-center gap-3 border-b border-white/10">
        <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
          <Scale className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight leading-none">Lexio</h1>
          <p className="text-xs text-brand-300 mt-0.5">Produção Jurídica com IA</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {links.map(({ to, label, icon }) => (
          <NavItem key={to} to={to} label={label} icon={icon} end={to === '/'} onClick={onClose} />
        ))}
        {role === 'admin' && (
          <NavItem to="/admin" label="Administração" icon={Shield} onClick={onClose} />
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/10 space-y-1">
        {fullName && (
          <div className="px-4 py-2">
            <p className="text-xs text-brand-300 truncate">{fullName}</p>
            <p className="text-xs text-brand-400 capitalize">{role || 'user'}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-brand-200 hover:bg-white/10 hover:text-white w-full transition-colors"
          aria-label="Sair da conta"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          Sair
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex flex-col min-h-screen">
        {sidebar}
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Panel */}
          <div className="relative flex flex-col w-64 h-full z-10">
            {sidebar}
          </div>
        </div>
      )}
    </>
  )
}

import { NavLink, matchPath, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, PlusCircle, Upload,
  Scale, LogOut, Settings, BookOpen, ChevronRight, UserCircle, DollarSign, Brain, Shield,
  MessagesSquare,
} from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/client'
import ConfirmDialog from './ConfirmDialog'
import { IS_FIREBASE } from '../lib/firebase'
import { listDocuments } from '../lib/firestore-service'
import { buildWorkspaceShellPath } from '../lib/workspace-routes'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/chat', label: 'Chat', icon: MessagesSquare },
  {
    to: '/documents',
    label: 'Documentos',
    icon: FileText,
    activePatterns: ['/documents', '/documents/:id', '/documents/:id/edit'],
    inactivePatterns: ['/documents/new'],
  },
  {
    to: '/documents/new',
    label: 'Novo Documento',
    icon: PlusCircle,
    activePatterns: ['/documents/new'],
  },
  { to: '/theses', label: 'Banco de Teses', icon: BookOpen },
  { to: '/notebook', label: 'Caderno de Pesquisa', icon: Brain },
  { to: '/upload', label: 'Biblioteca e Acervo', icon: Upload },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

function NavItem({
  to, label, icon: Icon, end, onClick, badge, activePatterns, inactivePatterns,
}: {
  to: string
  label: string
  icon: React.ElementType
  end?: boolean
  onClick?: () => void
  badge?: number
  activePatterns?: string[]
  inactivePatterns?: string[]
}) {
  const { pathname } = useLocation()
  const matchesInactivePattern = useMemo(() => inactivePatterns?.some(pattern =>
    !!matchPath({ path: pattern, end: true }, pathname),
  ), [inactivePatterns, pathname])
  const matchesCustomPattern = useMemo(() => activePatterns?.some(pattern =>
    !!matchPath({ path: pattern, end: true }, pathname),
  ), [activePatterns, pathname])
  const resolvedActive = matchesInactivePattern ? false : (matchesCustomPattern ?? undefined)

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150',
          (resolvedActive ?? isActive)
            ? 'bg-white/15 text-white font-medium'
            : 'text-teal-200 hover:bg-white/10 hover:text-white'
        )
      }
    >
      {({ isActive }) => {
        const active = resolvedActive ?? isActive
        return (
        <>
          <Icon className={clsx('w-5 h-5 flex-shrink-0 transition-transform', !active && 'group-hover:scale-110')} />
          <span className="flex-1">{label}</span>
          {badge != null && badge > 0 && (
            <span className="bg-blue-500 text-white text-xs font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
          {active && !badge && <ChevronRight className="w-3.5 h-3.5 opacity-50" />}
        </>
        )
      }}
    </NavLink>
  )
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation()
  const { logout, role, fullName, userId } = useAuth()
  const [pendingReview, setPendingReview] = useState(0)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const buildSidebarPath = (to: string) => buildWorkspaceShellPath(to, { preserveSearch: location.search })

  // Poll the current user's pending review count every 60s.
  useEffect(() => {
    if (!userId) return
    const fetchPending = () => {
      if (IS_FIREBASE && userId) {
        listDocuments(userId, { status: 'em_revisao' })
          .then(result => setPendingReview(result.items.length))
          .catch(() => {/* non-critical */})
      } else {
        api.get('/stats').then(res => {
          setPendingReview(res.data?.pending_review_documents || 0)
        }).catch(() => {/* non-critical */})
      }
    }
    fetchPending()
    const interval = setInterval(fetchPending, 60_000)
    return () => clearInterval(interval)
  }, [userId])

  const handleLogout = () => {
    setShowLogoutConfirm(true)
  }

  const confirmLogout = () => {
    setShowLogoutConfirm(false)
    logout()
  }

  const sidebar = (
    <aside className="w-64 bg-teal-900 text-white h-full flex flex-col">
      {/* Logo */}
      <div className="p-5 flex items-center gap-3 border-b border-white/10">
        <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center flex-shrink-0">
          <Scale className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight leading-none">Lexio</h1>
          <p className="text-xs text-teal-300 mt-0.5">Produção Jurídica com IA</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 overflow-y-auto">
        {/* Work section */}
        <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-teal-400">Trabalho</p>
        <div className="space-y-0.5">
          {links.map(({ to, label, icon, activePatterns, inactivePatterns }) => (
            <NavItem
              key={to}
              to={buildSidebarPath(to)}
              label={label}
              icon={icon}
              end={to === '/'}
              onClick={onClose}
              activePatterns={to === '/notebook' ? ['/notebook'] : activePatterns}
              inactivePatterns={inactivePatterns}
            />
          ))}
        </div>

        {/* Settings section */}
        <p className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-teal-400">Gestão</p>
        <div className="space-y-0.5">
          <NavItem
            to={buildSidebarPath('/settings')}
            label="Configurações"
            icon={Settings}
            onClick={onClose}
            badge={pendingReview}
          />
          <NavItem
            to={buildSidebarPath('/settings/costs')}
            label="Uso e Custos"
            icon={DollarSign}
            onClick={onClose}
          />
          {role === 'admin' && (
            <>
              <NavItem
                to={buildSidebarPath('/admin')}
                label="Administração"
                icon={Shield}
                onClick={onClose}
              />
              <NavItem
                to={buildSidebarPath('/admin/costs')}
                label="Custos da Plataforma"
                icon={DollarSign}
                onClick={onClose}
              />
            </>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/10 space-y-1">
        {fullName && (
          <NavLink
            to={buildSidebarPath('/profile')}
            onClick={onClose}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all',
                isActive
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-teal-200 hover:bg-white/10 hover:text-white'
              )
            }
          >
            <UserCircle className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate font-medium">{fullName}</p>
              <p className="text-xs text-teal-400 capitalize">{role || 'user'}</p>
            </div>
          </NavLink>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-teal-200 hover:bg-white/10 hover:text-white w-full transition-colors"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span>Sair</span>
        </button>
      </div>

      <ConfirmDialog
        open={showLogoutConfirm}
        title="Sair da conta?"
        description="Sua sessão atual será encerrada neste dispositivo."
        confirmText="Sair"
        cancelText="Cancelar"
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
      />
    </aside>
  )

  return (
    <>
      {/* Desktop — sticky so profile & logout stay visible */}
      <div className="hidden md:flex flex-col h-screen sticky top-0">
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

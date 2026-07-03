import { ReactNode, useEffect, useState } from 'react'
import { Link, matchPath, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { ExternalLink, LogOut, Menu, Sparkles, UserCircle, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { buildWorkspaceShellPath } from '../../lib/workspace-routes'
import { isEnabled } from '../../lib/feature-flags'
import ConfirmDialog from '../ConfirmDialog'

interface WorkspaceNavItem {
  label: string
  to: string
  activePatterns?: string[]
}

interface WorkspaceNavGroup {
  label: string
  items: WorkspaceNavItem[]
}

function NavCard({
  label,
  to,
  activePatterns,
  onNavigate,
}: {
  label: string
  to: string
  activePatterns?: string[]
  onNavigate?: () => void
}) {
  const location = useLocation()
  const isActive = activePatterns?.some((pattern) =>
    !!matchPath({ path: pattern, end: true }, location.pathname),
  ) ?? false
  const resolvedPath = buildWorkspaceShellPath(to, { preserveSearch: location.search })

  return (
    <Link
      to={resolvedPath}
      onClick={onNavigate}
      className={clsx(
        'v2-nav-card',
        isActive && 'v2-nav-card-active',
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <ExternalLink className="h-4 w-4 flex-shrink-0 opacity-70" />
    </Link>
  )
}

export default function V2WorkspaceLayout({ children }: { children: ReactNode }) {
  const { fullName, role, logout } = useAuth()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileNavOpen(false) }, [location.pathname])

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const previous = document.body.style.overflow
    if (mobileNavOpen) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [mobileNavOpen])

  const primaryNav: WorkspaceNavGroup[] = [
    {
      label: 'Principal',
      items: [
        { label: 'Dashboard', to: '/', activePatterns: ['/'] },
        { label: 'Chat', to: '/chat', activePatterns: ['/chat'] },
        { label: 'Novo documento', to: '/documents/new', activePatterns: ['/documents/new', '/documents/new-v3'] },
        { label: 'Documentos', to: '/documents', activePatterns: ['/documents', '/documents/:id', '/documents/:id/edit'] },
        { label: 'Caderno de pesquisa', to: '/notebook', activePatterns: ['/notebook'] },
        ...(isEnabled('FF_DESIGN_STUDIO')
          ? [{ label: 'Design Studio', to: '/design', activePatterns: ['/design'] }]
          : []),
        { label: 'Biblioteca e acervo', to: '/upload', activePatterns: ['/upload'] },
        { label: 'Banco de teses', to: '/theses', activePatterns: ['/theses'] },
      ],
    },
    {
      label: 'Conta',
      items: [
        { label: 'Meu perfil', to: '/profile', activePatterns: ['/profile'] },
        { label: 'Configuracoes', to: '/settings', activePatterns: ['/settings'] },
        { label: 'Uso e custos', to: '/settings/costs', activePatterns: ['/settings/costs'] },
        ...(role === 'admin'
          ? [
              { label: 'Administracao', to: '/admin', activePatterns: ['/admin'] },
              { label: 'Custos da plataforma', to: '/admin/costs', activePatterns: ['/admin/costs'] },
            ]
          : []),
      ],
    },
  ]

  // Shared nav body for both the desktop sidebar and the mobile drawer.
  const renderNav = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col gap-4">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--v2-ink-strong)] text-[var(--v2-canvas)] shadow-[var(--v2-shadow-strong)]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--v2-ink-soft)]">Lexio</p>
            <h1 className="v2-display text-lg leading-tight">Workspace</h1>
          </div>
        </div>

        <p className="text-xs leading-5 text-[var(--v2-ink-soft)]">
          Navegue por documentos, caderno, acervo, perfil e custos em um unico painel.
        </p>
      </div>

      <div className="space-y-3">
        {primaryNav.map((group) => (
          <section key={group.label} className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--v2-ink-faint)]">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavCard
                  key={item.label}
                  label={item.label}
                  to={item.to}
                  activePatterns={item.activePatterns}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="v2-divider" />

      <div className="mt-auto space-y-2.5">
        <div className="flex items-center gap-2.5 rounded-[1.2rem] bg-[rgba(15,23,42,0.05)] px-3 py-2.5">
          <UserCircle className="h-7 w-7 text-[var(--v2-accent-strong)]" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[var(--v2-ink-strong)]">{fullName || 'Usuario Lexio'}</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">{role || 'user'}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => { onNavigate?.(); setShowLogoutConfirm(true) }}
          className="flex w-full items-center gap-2.5 rounded-[1.2rem] border border-[var(--v2-border)] bg-white/70 px-3 py-2.5 text-xs font-semibold text-[var(--v2-ink-strong)] transition hover:bg-white"
        >
          <LogOut className="h-4 w-4" />
          <span>Logoff</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="v2-theme min-h-screen bg-[var(--v2-canvas)] text-[var(--v2-ink-strong)]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-8rem] top-[-8rem] h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(13,148,136,0.22),_transparent_72%)]" />
        <div className="absolute right-[-6rem] top-20 h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(234,179,8,0.2),_transparent_70%)]" />
        <div className="absolute bottom-[-10rem] left-1/3 h-96 w-96 rounded-full bg-[radial-gradient(circle,_rgba(15,23,42,0.08),_transparent_72%)]" />
      </div>

      {/* Mobile top bar (hamburger) — the desktop sidebar is hidden below lg */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--v2-border)] bg-[var(--v2-canvas)]/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Abrir menu de navegação"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--v2-border)] bg-white/70 text-[var(--v2-ink-strong)]"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--v2-ink-strong)] text-[var(--v2-canvas)]">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold">Lexio</span>
        </div>
        <span aria-hidden className="h-9 w-9" />
      </header>

      <div className="relative mx-auto flex min-h-screen max-w-[1680px] gap-5 px-4 py-4 sm:px-5 lg:px-6">
        <aside className="hidden w-[260px] shrink-0 lg:block">
          <div className="v2-panel sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col gap-4 overflow-y-auto p-4">
            {renderNav()}
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de navegação">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
          <div className="absolute left-0 top-0 h-full w-[280px] max-w-[85%] overflow-y-auto bg-[var(--v2-canvas)] p-4 shadow-2xl">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Fechar menu"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--v2-ink-faint)] hover:bg-black/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderNav(() => setMobileNavOpen(false))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showLogoutConfirm}
        title="Sair da conta?"
        description="Voce sera desconectado deste dispositivo."
        confirmText="Sair"
        cancelText="Cancelar"
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false)
          void logout()
        }}
      />
    </div>
  )
}

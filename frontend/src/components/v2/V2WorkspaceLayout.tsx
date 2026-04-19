import { ReactNode } from 'react'
import { Link, matchPath, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { ExternalLink, Sparkles, UserCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { buildWorkspaceShellPath } from '../../lib/workspace-routes'

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
}: {
  label: string
  to: string
  activePatterns?: string[]
}) {
  const location = useLocation()
  const isActive = activePatterns?.some((pattern) => matchPath(pattern, location.pathname)) ?? false
  const resolvedPath = buildWorkspaceShellPath(to, { preserveSearch: location.search })

  return (
    <Link
      to={resolvedPath}
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
  const location = useLocation()
  const { fullName, role } = useAuth()
  const primaryNav: WorkspaceNavGroup[] = [
    {
      label: 'Workspace',
      items: [
        { label: 'Dashboard', to: '/labs/dashboard-v2', activePatterns: ['/labs/dashboard-v2'] },
        { label: 'Caderno de pesquisa', to: '/notebook', activePatterns: ['/notebook', '/labs/notebook-v2'] },
        { label: 'Documentos', to: '/documents', activePatterns: ['/documents', '/documents/:id', '/documents/:id/edit'] },
        { label: 'Novo documento', to: '/documents/new', activePatterns: ['/documents/new'] },
        { label: 'Biblioteca e acervo', to: '/upload', activePatterns: ['/upload'] },
        { label: 'Banco de teses', to: '/theses', activePatterns: ['/theses'] },
        { label: 'Meu perfil', to: '/profile', activePatterns: ['/profile'] },
      ],
    },
    {
      label: 'Governanca',
      items: [
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

  return (
    <div className="v2-theme min-h-screen bg-[var(--v2-canvas)] text-[var(--v2-ink-strong)]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-8rem] top-[-8rem] h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(13,148,136,0.22),_transparent_72%)]" />
        <div className="absolute right-[-6rem] top-20 h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(234,179,8,0.2),_transparent_70%)]" />
        <div className="absolute bottom-[-10rem] left-1/3 h-96 w-96 rounded-full bg-[radial-gradient(circle,_rgba(15,23,42,0.08),_transparent_72%)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1680px] gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <aside className="hidden w-[280px] shrink-0 lg:block">
          <div className="v2-panel flex h-full flex-col gap-6 p-5">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--v2-ink-strong)] text-[var(--v2-canvas)] shadow-[var(--v2-shadow-strong)]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--v2-ink-soft)]">Lexio</p>
                  <h1 className="v2-display text-2xl">Workspace</h1>
                </div>
              </div>

              <p className="text-sm leading-6 text-[var(--v2-ink-soft)]">
                Gerencie documentos, pesquisas, teses e configuracoes a partir de um unico painel integrado.
              </p>
            </div>

            <div className="space-y-5">
              {primaryNav.map((group) => (
                <section key={group.label} className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--v2-ink-faint)]">{group.label}</p>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <NavCard
                        key={item.label}
                        label={item.label}
                        to={item.to}
                        activePatterns={item.activePatterns}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="v2-divider" />

            <div className="flex items-center gap-3 rounded-[1.4rem] bg-[rgba(15,23,42,0.05)] px-4 py-3">
              <UserCircle className="h-8 w-8 text-[var(--v2-accent-strong)]" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">{fullName || 'Usuario Lexio'}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">{role || 'user'}</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
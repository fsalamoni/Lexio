import { ReactNode } from 'react'
import { Link, matchPath, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { ArrowLeft, ExternalLink, Shield, Sparkles, UserCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { buildWorkspaceProfileClassicPath, buildWorkspaceShellPath } from '../../lib/workspace-routes'

interface WorkspaceNavItem {
  label: string
  to: string
  activePatterns?: string[]
}

interface WorkspaceNavGroup {
  label: string
  caption: string
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
      caption: 'Hub pessoal e operacao cotidiana no rail promovido.',
      items: [
        { label: 'Dashboard V2', to: '/labs/dashboard-v2', activePatterns: ['/labs/dashboard-v2'] },
        { label: 'Workbench principal', to: '/notebook', activePatterns: ['/notebook', '/labs/notebook-v2'] },
        { label: 'Documentos', to: '/documents', activePatterns: ['/documents', '/documents/:id', '/documents/:id/edit'] },
        { label: 'Novo documento', to: '/documents/new', activePatterns: ['/documents/new'] },
        { label: 'Biblioteca e acervo', to: '/upload', activePatterns: ['/upload'] },
        { label: 'Banco de teses', to: '/theses', activePatterns: ['/theses'] },
        { label: 'Meu perfil', to: '/profile', activePatterns: ['/profile'] },
      ],
    },
    {
      label: 'Governanca',
      caption: 'Custos, configuracoes, catalogo e a administracao executiva ja rodam integralmente no rail V2; o trilho classico ficou como contingencia estrutural controlada.',
      items: [
        { label: 'Configuracoes', to: '/settings', activePatterns: ['/settings'] },
        { label: 'Uso e custos', to: '/settings/costs', activePatterns: ['/settings/costs'] },
        ...(role === 'admin'
          ? [
              { label: 'Administracao', to: '/admin', activePatterns: ['/admin'] },
              { label: 'Custos da plataforma', to: '/admin/costs', activePatterns: ['/admin/costs'] },
            ]
          : []),
        { label: 'Trilho classico', to: '/profile/classic', activePatterns: ['/profile/classic', '/notebook/classic'] },
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
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--v2-ink-soft)]">Lexio Labs</p>
                  <h1 className="v2-display text-2xl">Workspace V2</h1>
                </div>
              </div>

              <p className="text-sm leading-6 text-[var(--v2-ink-soft)]">
                Segunda experiencia controlada para o redesign profundo do produto,
                com shell desktop-first e governanca separada da operacao atual,
                agora tambem cobrindo documentos, teses, perfil, custos, configuracoes e a governanca operacional no mesmo rail, deixando o classico apenas como contingencia estrutural e comparativa.
              </p>
            </div>

            <div className="space-y-5">
              {primaryNav.map((group) => (
                <section key={group.label} className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--v2-ink-faint)]">{group.label}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--v2-ink-soft)]">{group.caption}</p>
                  </div>
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

            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-[1.4rem] bg-[rgba(15,23,42,0.05)] px-4 py-3">
                <UserCircle className="h-8 w-8 text-[var(--v2-accent-strong)]" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">{fullName || 'Usuario Lexio'}</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">{role || 'user'}</p>
                </div>
              </div>
              <div className="rounded-[1.4rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] px-4 py-4 text-sm leading-6 text-[var(--v2-ink-soft)]">
                O shell novo ja sustenta dashboard, workbench principal, documentos,
                teses, perfil, custos, catalogo, configuracoes e a governanca executiva com leitura nativa em V2,
                preservando o classico apenas como trilho de contingencia e comparacao controlada.
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="v2-panel flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--v2-line-strong)] bg-[rgba(255,255,255,0.82)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--v2-ink-soft)]">
                <Shield className="h-3.5 w-3.5" />
                Preview controlado
              </div>
              <div>
                <p className="text-sm text-[var(--v2-ink-soft)]">Branch de trabalho: redesign/v2-pilot</p>
                <h2 className="v2-display text-3xl">Fundacao do novo workspace juridico</h2>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link to={buildWorkspaceShellPath('/labs/dashboard-v2', { preserveSearch: location.search })} className="v2-btn-secondary">
                Abrir dashboard V2
              </Link>
              <Link to={buildWorkspaceShellPath('/documents', { preserveSearch: location.search })} className="v2-btn-secondary">
                Abrir documentos
              </Link>
              <Link to={buildWorkspaceShellPath('/notebook', { preserveSearch: location.search })} className="v2-btn-secondary">
                Abrir workbench principal
              </Link>
              <Link to={buildWorkspaceProfileClassicPath({ preserveSearch: location.search })} className="v2-btn-secondary">
                <ArrowLeft className="h-4 w-4" />
                Abrir trilho classico
              </Link>
              <Link to={buildWorkspaceShellPath('/settings', { preserveSearch: location.search })} className="v2-btn-primary">
                Abrir configuracoes atuais
              </Link>
            </div>
          </header>

          <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <main className="min-w-0">{children}</main>

            <aside className="space-y-4">
              <div className="v2-panel p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--v2-ink-faint)]">Leituras ativas</p>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--v2-ink-soft)]">
                  <li>1. Shell desktop-first com trilha de navegação persistente.</li>
                  <li>2. Superficie piloto conectada ao dado real do usuario.</li>
                  <li>3. Governanca, custos e superficies centrais ja entram no mesmo rail promovido.</li>
                </ul>
              </div>

              <div className="v2-panel p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--v2-ink-faint)]">Proxima entrega</p>
                <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--v2-ink-soft)]">
                    <p>O proximo corte natural e consolidar cobertura de testes das superficies promovidas e estreitar o trilho classico ao papel de contingencia estrutural controlada.</p>
                  <p className="rounded-[1.1rem] bg-[rgba(13,148,136,0.08)] px-3 py-3 text-[var(--v2-ink-strong)]">
                      O objetivo agora e tratar o rail V2 como superficie primaria tambem na validacao continua, deixando o legado apenas para comparacao, rollback e casos excepcionais.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
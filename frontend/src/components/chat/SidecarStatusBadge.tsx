import { useEffect, useRef, useState } from 'react'
import { Loader2, Wifi, WifiOff } from 'lucide-react'
import clsx from 'clsx'
import { checkSidecarStatus } from '../../lib/chat-orchestrator'
import { buildSidecarWsUrl, loadSidecarConnectionConfig } from '../../lib/chat-orchestrator/sidecar-config'
import { useAuth } from '../../contexts/AuthContext'

type SidecarStatus = 'unconfigured' | 'connecting' | 'online' | 'offline'

const POLL_INTERVAL_MS = 20_000

/**
 * Live sidecar (@lexio/desktop) status indicator. Polls the local process via
 * the same `checkSidecarStatus` ping the skills use. Shown behind
 * `FF_CHAT_PC_APPROVALS`; falls back to a static placeholder when off.
 */
export default function SidecarStatusBadge() {
  const { userId } = useAuth()
  const [status, setStatus] = useState<SidecarStatus>('connecting')
  const [root, setRoot] = useState<string | undefined>(undefined)
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const schedule = () => {
      if (cancelledRef.current) return
      timer = setTimeout(tick, POLL_INTERVAL_MS)
    }

    const tick = async () => {
      try {
        const cfg = await loadSidecarConnectionConfig(userId ?? undefined)
        if (cancelledRef.current) return
        if (!cfg.enabled || !cfg.token) {
          setStatus('unconfigured')
          setRoot(undefined)
          return
        }
        const res = await checkSidecarStatus({ wsUrl: buildSidecarWsUrl(cfg), timeoutMs: 2500 })
        if (cancelledRef.current) return
        setStatus(res.available ? 'online' : 'offline')
        setRoot(res.available ? res.root : undefined)
      } catch {
        if (!cancelledRef.current) setStatus('offline')
      } finally {
        schedule()
      }
    }

    tick()
    return () => {
      cancelledRef.current = true
      if (timer) clearTimeout(timer)
    }
  }, [userId])

  const meta = STATUS_META[status]
  const title = status === 'online' && root
    ? `Sidecar @lexio/desktop online · pasta: ${root}`
    : meta.title

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px]',
        meta.className,
      )}
      title={title}
    >
      {status === 'connecting'
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : status === 'online'
          ? <Wifi className="h-3 w-3" />
          : <WifiOff className="h-3 w-3" />}
      {meta.label}
    </span>
  )
}

const STATUS_META: Record<SidecarStatus, { label: string; title: string; className: string }> = {
  unconfigured: {
    label: 'Sidecar não configurado',
    title: 'Conecte o @lexio/desktop em Configurações para habilitar ações locais de arquivos/shell.',
    className: 'border-[var(--v2-border)] bg-white text-[var(--v2-ink-faint)]',
  },
  connecting: {
    label: 'Sidecar…',
    title: 'Verificando o status do sidecar @lexio/desktop…',
    className: 'border-[var(--v2-border)] bg-white text-[var(--v2-ink-faint)]',
  },
  online: {
    label: 'Sidecar online',
    title: 'Sidecar @lexio/desktop conectado.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  offline: {
    label: 'Sidecar offline',
    title: 'O sidecar @lexio/desktop não respondeu. Inicie o processo local ou verifique o token.',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
}

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div
      className="v2-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.currentTarget === event.target && !loading) {
          onCancel()
        }
      }}
    >
      <div className="v2-modal" style={{ maxWidth: '26rem' }}>
        <div className="v2-modal-header">
          <div
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: danger ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)',
              color: danger ? 'rgb(220,38,38)' : 'rgb(217,119,6)',
            }}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>{title}</h2>
            {description && (
              <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--v2-ink-soft)' }}>
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="v2-modal-footer">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="v2-btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="v2-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            style={danger ? { background: 'linear-gradient(135deg,#b91c1c,#991b1b)' } : undefined}
          >
            {loading ? 'Processando...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

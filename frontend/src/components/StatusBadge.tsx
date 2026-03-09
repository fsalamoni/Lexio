import clsx from 'clsx'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

const statusConfig: Record<string, {
  label: string
  className: string
  icon: React.ElementType
  animate?: boolean
}> = {
  processando: {
    label: 'Processando',
    className: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    icon: Loader2,
    animate: true,
  },
  concluido: {
    label: 'Concluído',
    className: 'bg-green-50 text-green-700 border border-green-200',
    icon: CheckCircle,
  },
  erro: {
    label: 'Erro',
    className: 'bg-red-50 text-red-700 border border-red-200',
    icon: XCircle,
  },
}

export default function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || {
    label: status,
    className: 'bg-gray-100 text-gray-700 border border-gray-200',
    icon: () => null,
  }
  const Icon = config.icon
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', config.className)}>
      <Icon className={clsx('w-3.5 h-3.5', config.animate && 'animate-spin')} />
      {config.label}
    </span>
  )
}

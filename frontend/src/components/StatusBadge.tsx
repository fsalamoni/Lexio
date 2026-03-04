import clsx from 'clsx'

const statusConfig: Record<string, { label: string; className: string }> = {
  processando: { label: 'Processando', className: 'bg-yellow-100 text-yellow-800' },
  concluido: { label: 'Concluído', className: 'bg-green-100 text-green-800' },
  erro: { label: 'Erro', className: 'bg-red-100 text-red-800' },
}

export default function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' }
  return (
    <span className={clsx('px-2 py-1 rounded-full text-xs font-medium', config.className)}>
      {config.label}
    </span>
  )
}

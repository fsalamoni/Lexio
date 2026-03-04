import { useEffect, useState } from 'react'
import { FileText, CheckCircle, Clock, DollarSign } from 'lucide-react'
import api from '../api/client'

interface Stats {
  total_documents: number
  completed_documents: number
  processing_documents: number
  average_quality_score: number | null
  total_cost_usd: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    api.get('/stats').then((res) => setStats(res.data)).catch(() => {})
  }, [])

  const cards = stats
    ? [
        { label: 'Total de Documentos', value: stats.total_documents, icon: FileText, color: 'blue' },
        { label: 'Concluídos', value: stats.completed_documents, icon: CheckCircle, color: 'green' },
        { label: 'Em Processamento', value: stats.processing_documents, icon: Clock, color: 'yellow' },
        { label: 'Score Médio', value: stats.average_quality_score ?? '—', icon: CheckCircle, color: 'purple' },
      ]
    : []

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-500">{card.label}</span>
              <card.icon className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>
      {stats && (
        <div className="mt-6 bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-2">Custo Total</h2>
          <p className="text-2xl font-bold text-brand-600">${stats.total_cost_usd.toFixed(4)}</p>
        </div>
      )}
    </div>
  )
}

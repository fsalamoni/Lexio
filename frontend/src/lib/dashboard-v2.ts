import { formatCost } from './currency-utils'
import { type DashboardRecentDoc, type DashboardStats, getResumableDocument } from './dashboard-data'

export interface DashboardPriorityAction {
  key: string
  title: string
  description: string
  to: string
  tone: 'ink' | 'teal' | 'amber'
}

export interface DashboardSignal {
  label: string
  value: string
  emphasis?: 'muted' | 'good' | 'warn'
}

export function getGreetingForHour(hour: number) {
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function getFirstName(fullName: string | null | undefined) {
  if (!fullName) return ''
  return fullName.trim().split(/\s+/)[0] || ''
}

export function buildDashboardPriorityActions(input: {
  stats: DashboardStats | null
  recent: DashboardRecentDoc[]
  docsThisWeek: number
}) {
  const actions: DashboardPriorityAction[] = []
  const resumable = getResumableDocument(input.recent)
  const pendingReview = input.stats?.pending_review_documents ?? 0

  if (resumable) {
    const statusLabel = resumable.status === 'processando'
      ? 'Documento ainda em execucao.'
      : resumable.status === 'em_revisao'
        ? 'Fluxo esperando sua aprovacao.'
        : 'Ultima entrega pronta para iteracao.'

    actions.push({
      key: 'resume',
      title: 'Retomar o fluxo mais recente',
      description: statusLabel,
      to: `/documents/${resumable.id}`,
      tone: 'ink',
    })
  }

  if (pendingReview > 0) {
    actions.push({
      key: 'review',
      title: 'Esvaziar fila de revisao',
      description: `${pendingReview} item(ns) aguardando decisao no seu workspace.`,
      to: '/settings',
      tone: 'amber',
    })
  }

  actions.push(
    input.docsThisWeek === 0
      ? {
        key: 'create',
        title: 'Abrir um novo documento',
        description: 'Comece a semana com um fluxo novo no gerador principal.',
        to: '/documents/new',
        tone: 'teal',
      }
      : {
        key: 'research',
        title: 'Continuar pesquisa orientada por fontes',
        description: 'Use o notebook como workbench para aprofundar a proxima entrega.',
        to: '/notebook',
        tone: 'teal',
      },
  )

  if (actions.length < 3) {
    actions.push({
      key: 'profile',
      title: 'Refinar contexto profissional',
      description: 'Melhore defaults de redacao e contexto institucional.',
      to: '/profile',
      tone: 'ink',
    })
  }

  return actions.slice(0, 3)
}

export function buildDashboardSignals(stats: DashboardStats | null) {
  return [
    {
      label: 'Qualidade media',
      value: stats?.average_quality_score != null ? `${stats.average_quality_score}/100` : 'Sem historico',
      emphasis: stats?.average_quality_score && stats.average_quality_score >= 80 ? 'good' : 'muted',
    },
    {
      label: 'Fila ativa',
      value: stats ? `${stats.processing_documents} em processamento` : 'Sem dados',
      emphasis: stats?.processing_documents ? 'warn' : 'muted',
    },
    {
      label: 'Custos',
      value: stats ? formatCost(stats.total_cost_usd) : 'Sem dados',
      emphasis: 'muted',
    },
  ]
}
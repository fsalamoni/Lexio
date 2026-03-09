import { useEffect, useState } from 'react'
import { Loader2, Search, Scale, Shield, CheckCircle, FileText, ClipboardCheck } from 'lucide-react'

interface Progress {
  phase: string
  message: string
  progress: number
}

const PHASE_ICONS: Record<string, React.ElementType> = {
  triagem:         Search,
  moderador:       Scale,
  jurista:         Scale,
  advogado:        Shield,
  fact_checker:    ClipboardCheck,
  redator:         FileText,
  revisor:         CheckCircle,
}

function getPhaseIcon(phase: string): React.ElementType {
  const key = Object.keys(PHASE_ICONS).find(k => phase?.toLowerCase().includes(k))
  return key ? PHASE_ICONS[key] : Loader2
}

const PHASE_STEPS = [
  { key: 'triagem',   label: 'Triagem' },
  { key: 'debate',    label: 'Debate' },
  { key: 'pesquisa',  label: 'Pesquisa' },
  { key: 'redacao',   label: 'Redação' },
  { key: 'revisao',   label: 'Revisão' },
]

function guessStepIndex(phase: string): number {
  const p = phase?.toLowerCase() ?? ''
  if (p.includes('triagem'))                         return 0
  if (p.includes('moderador') || p.includes('jurista') || p.includes('advogado')) return 1
  if (p.includes('fact'))                            return 2
  if (p.includes('redator') || p.includes('plano'))  return 3
  if (p.includes('revisor'))                         return 4
  return -1
}

export default function ProgressTracker({ documentId }: { documentId: string }) {
  const [progress, setProgress] = useState<Progress | null>(null)

  useEffect(() => {
    const wsUrl = `${location.origin.replace(/^http/, 'ws')}/ws/document/${documentId}`
    const ws = new WebSocket(wsUrl)
    ws.onmessage = (e) => {
      try { setProgress(JSON.parse(e.data)) } catch {}
    }
    ws.onerror = () => ws.close()
    return () => ws.close()
  }, [documentId])

  if (!progress) return null

  const PhaseIcon = getPhaseIcon(progress.phase)
  const stepIdx = guessStepIndex(progress.phase)

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
      {/* Phase steps */}
      <div className="flex items-center justify-between">
        {PHASE_STEPS.map((step, i) => {
          const done   = stepIdx > i
          const active = stepIdx === i
          return (
            <div key={step.key} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                done   ? 'bg-brand-600 text-white' :
                active ? 'bg-brand-100 border-2 border-brand-600 text-brand-700' :
                         'bg-gray-100 text-gray-400'
              }`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-xs hidden sm:block ${active ? 'text-brand-700 font-medium' : 'text-gray-400'}`}>
                {step.label}
              </span>
              {i < PHASE_STEPS.length - 1 && (
                <div className={`absolute h-0.5 w-full hidden`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Progress bar + message */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <PhaseIcon className="w-4 h-4 text-brand-500 animate-pulse flex-shrink-0" />
          <span className="text-sm text-gray-700 truncate">{progress.message}</span>
          <span className="ml-auto text-sm font-semibold text-brand-600 tabular-nums">
            {progress.progress}%
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="bg-gradient-to-r from-brand-500 to-brand-400 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}

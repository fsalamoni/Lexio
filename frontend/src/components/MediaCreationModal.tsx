import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  X, Video, Mic, Presentation, Calculator, AlertTriangle,
  CheckCircle2, Loader2, Scissors, DollarSign, Clock, Cpu,
  FileText,
} from 'lucide-react'
import {
  VIDEO_PIPELINE_AGENT_DEFS,
  AUDIO_PIPELINE_AGENT_DEFS,
  PRESENTATION_PIPELINE_AGENT_DEFS,
} from '../lib/model-config'

// ── Types ───────────────────────────────────────────────────────────────────

export interface MediaCreationOptions {
  mediaType: 'video' | 'audio' | 'presentation'
  // Video specific
  format?: string
  quality?: string
  resolution?: string
  fps?: number
  duration?: number
  // Audio specific
  audioFormat?: string
  voices?: number
  audioDuration?: number
  musicBackground?: boolean
  // Presentation specific
  slideCount?: number
  presentationStyle?: string
  targetAudience?: string
  // Common
  description?: string
  script?: string
  language?: string
}

export interface CostEstimate {
  totalTokensEstimated: number
  estimatedCostUsd: number
  estimatedDurationMinutes: number
  agentBreakdown: { agent: string; tokensEstimated: number; costEstimated: number }[]
  warnings: string[]
  suggestSplit: boolean
  splitParts?: number
  splitDescription?: string
}

interface MediaCreationModalProps {
  open: boolean
  onClose: () => void
  mediaType: 'video' | 'audio' | 'presentation'
  topic: string
  onApprove: (options: MediaCreationOptions) => void
}

// ── Constants ───────────────────────────────────────────────────────────────

const QUALITY_RESOLUTION_MAP: Record<string, string> = {
  standard: '720p',
  hd: '1080p',
  full_hd: '1440p',
  '4k': '2160p',
}

const MEDIA_ICONS: Record<string, React.ElementType> = {
  video: Video,
  audio: Mic,
  presentation: Presentation,
}

const MEDIA_LABELS: Record<string, string> = {
  video: 'Vídeo',
  audio: 'Áudio',
  presentation: 'Apresentação',
}

const BRL_RATE = 5.7 // Cotação referencial BRL/USD — atualizada em Jun/2025

// Cost per token: average Claude Sonnet 4 rates ($3/1M input + $15/1M output),
// erring high to avoid under-estimating. Actual cost depends on pipeline models.
const COST_PER_TOKEN = 9.0 / 1_000_000

// Agent names sourced from the actual pipeline definitions in model-config.ts
const VIDEO_AGENTS = VIDEO_PIPELINE_AGENT_DEFS.map(d => d.label)
const AUDIO_AGENTS = AUDIO_PIPELINE_AGENT_DEFS.map(d => d.label)
const PRESENTATION_AGENTS = PRESENTATION_PIPELINE_AGENT_DEFS.map(d => d.label)

// ── Cost Estimation ─────────────────────────────────────────────────────────

export function estimateMediaCost(options: MediaCreationOptions): CostEstimate {
  const warnings: string[] = []
  let totalTokens = 0
  let agentBreakdown: { agent: string; tokensEstimated: number; costEstimated: number }[] = []
  let durationMinutes = 5
  let suggestSplit = false
  let splitParts: number | undefined
  let splitDescription: string | undefined

  if (options.mediaType === 'video') {
    const dur = options.duration ?? 1
    const agents = VIDEO_AGENTS
    const basePerAgent = 5000
    const perMinutePerScene = 2000
    const safetyMargin = 1.3

    agentBreakdown = agents.map(agent => {
      const raw = basePerAgent + dur * perMinutePerScene
      const tokens = Math.ceil(raw * safetyMargin)
      return { agent, tokensEstimated: tokens, costEstimated: tokens * COST_PER_TOKEN }
    })

    totalTokens = agentBreakdown.reduce((sum, a) => sum + a.tokensEstimated, 0)
    durationMinutes = Math.ceil(2 + dur * 3)

    if (dur > 5) {
      suggestSplit = true
      splitParts = Math.ceil(dur / 5)
      splitDescription = `Recomendamos dividir em ${splitParts} partes de ~${Math.ceil(dur / splitParts)} minutos cada para melhor qualidade e menor risco de falha.`
    }
  } else if (options.mediaType === 'audio') {
    const dur = options.audioDuration ?? 5
    const agents = AUDIO_AGENTS
    const basePerAgent = 3000
    const perMinute = 1500
    const safetyMargin = 1.2

    agentBreakdown = agents.map(agent => {
      const raw = basePerAgent + dur * perMinute
      const tokens = Math.ceil(raw * safetyMargin)
      return { agent, tokensEstimated: tokens, costEstimated: tokens * COST_PER_TOKEN }
    })

    totalTokens = agentBreakdown.reduce((sum, a) => sum + a.tokensEstimated, 0)
    durationMinutes = Math.ceil(1 + dur * 2)
  } else {
    const slides = options.slideCount ?? 10
    const agents = PRESENTATION_AGENTS
    const basePerAgent = 2000
    const perSlide = 500
    const safetyMargin = 1.15

    agentBreakdown = agents.map(agent => {
      const raw = basePerAgent + slides * perSlide
      const tokens = Math.ceil(raw * safetyMargin)
      return { agent, tokensEstimated: tokens, costEstimated: tokens * COST_PER_TOKEN }
    })

    totalTokens = agentBreakdown.reduce((sum, a) => sum + a.tokensEstimated, 0)
    durationMinutes = Math.ceil(1 + slides * 0.5)
  }

  const estimatedCostUsd = totalTokens * COST_PER_TOKEN

  if (estimatedCostUsd > 1.0) {
    warnings.push('⚠️ O custo estimado excede $1.00 USD. Considere reduzir a duração ou complexidade.')
  }

  warnings.push('Os custos em tokens são estimados e podem variar. A estimativa erra para mais por segurança.')

  return {
    totalTokensEstimated: totalTokens,
    estimatedCostUsd,
    estimatedDurationMinutes: durationMinutes,
    agentBreakdown,
    warnings,
    suggestSplit,
    splitParts,
    splitDescription,
  }
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function fmtUsd(value: number) {
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`
}

function fmtBrl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtInt(value: number) {
  return value.toLocaleString('pt-BR')
}

// ── Form Section Components ─────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

const selectClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none transition-colors'
const inputClass = selectClass
const textareaClass = `${selectClass} resize-none`

function VideoForm({
  options,
  onChange,
}: {
  options: MediaCreationOptions
  onChange: (patch: Partial<MediaCreationOptions>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Formato">
          <select
            className={selectClass}
            value={options.format ?? '16:9'}
            onChange={e => onChange({ format: e.target.value })}
          >
            <option value="16:9">16:9 (Widescreen)</option>
            <option value="9:16">9:16 (Vertical / Reels)</option>
            <option value="4:3">4:3 (Clássico)</option>
            <option value="1:1">1:1 (Quadrado)</option>
          </select>
        </FormField>

        <FormField label="Qualidade">
          <select
            className={selectClass}
            value={options.quality ?? 'hd'}
            onChange={e => onChange({ quality: e.target.value, resolution: QUALITY_RESOLUTION_MAP[e.target.value] })}
          >
            <option value="standard">Standard (720p)</option>
            <option value="hd">HD (1080p)</option>
            <option value="full_hd">Full HD (1440p)</option>
            <option value="4k">4K (2160p)</option>
          </select>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Resolução">
          <input
            className={`${inputClass} bg-gray-50`}
            value={options.resolution ?? QUALITY_RESOLUTION_MAP[options.quality ?? 'hd']}
            readOnly
            tabIndex={-1}
          />
        </FormField>

        <FormField label="FPS">
          <select
            className={selectClass}
            value={options.fps ?? 30}
            onChange={e => onChange({ fps: Number(e.target.value) })}
          >
            <option value={24}>24 fps (Cinema)</option>
            <option value={30}>30 fps (Padrão)</option>
            <option value={60}>60 fps (Suave)</option>
          </select>
        </FormField>
      </div>

      <FormField label="Duração (minutos)">
        <input
          type="number"
          className={inputClass}
          value={options.duration ?? 1}
          min={0.5}
          max={30}
          step={0.5}
          onChange={e => onChange({ duration: Number(e.target.value) })}
        />
      </FormField>

      <FormField label="Descrição (opcional)">
        <textarea
          className={textareaClass}
          rows={3}
          placeholder="Descreva o vídeo que deseja criar..."
          value={options.description ?? ''}
          onChange={e => onChange({ description: e.target.value })}
        />
      </FormField>

      <FormField label="Roteiro (opcional)">
        <textarea
          className={textareaClass}
          rows={4}
          placeholder="Se já possui um roteiro, cole aqui. O agente roteirista irá utilizá-lo como base."
          value={options.script ?? ''}
          onChange={e => onChange({ script: e.target.value })}
        />
      </FormField>
    </div>
  )
}

function AudioForm({
  options,
  onChange,
}: {
  options: MediaCreationOptions
  onChange: (patch: Partial<MediaCreationOptions>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Formato">
          <select
            className={selectClass}
            value={options.audioFormat ?? 'podcast'}
            onChange={e => onChange({ audioFormat: e.target.value })}
          >
            <option value="podcast">Podcast</option>
            <option value="narration">Narração</option>
            <option value="audiobook">Audiobook</option>
            <option value="lecture">Aula</option>
          </select>
        </FormField>

        <FormField label="Vozes">
          <select
            className={selectClass}
            value={options.voices ?? 2}
            onChange={e => onChange({ voices: Number(e.target.value) })}
          >
            <option value={1}>1 voz</option>
            <option value={2}>2 vozes</option>
            <option value={3}>3 vozes</option>
          </select>
        </FormField>
      </div>

      <FormField label="Duração (minutos)">
        <input
          type="number"
          className={inputClass}
          value={options.audioDuration ?? 5}
          min={1}
          max={60}
          step={1}
          onChange={e => onChange({ audioDuration: Number(e.target.value) })}
        />
      </FormField>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="musicBackground"
          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          checked={options.musicBackground ?? false}
          onChange={e => onChange({ musicBackground: e.target.checked })}
        />
        <label htmlFor="musicBackground" className="text-sm text-gray-700">
          Música de fundo
        </label>
      </div>

      <FormField label="Descrição (opcional)">
        <textarea
          className={textareaClass}
          rows={3}
          placeholder="Descreva o áudio que deseja criar..."
          value={options.description ?? ''}
          onChange={e => onChange({ description: e.target.value })}
        />
      </FormField>

      <FormField label="Roteiro (opcional)">
        <textarea
          className={textareaClass}
          rows={4}
          placeholder="Se já possui um roteiro, cole aqui. O agente roteirista irá utilizá-lo como base."
          value={options.script ?? ''}
          onChange={e => onChange({ script: e.target.value })}
        />
      </FormField>
    </div>
  )
}

function PresentationForm({
  options,
  onChange,
}: {
  options: MediaCreationOptions
  onChange: (patch: Partial<MediaCreationOptions>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Número de slides">
          <select
            className={selectClass}
            value={options.slideCount ?? 10}
            onChange={e => onChange({ slideCount: Number(e.target.value) })}
          >
            <option value={5}>5 slides</option>
            <option value={10}>10 slides</option>
            <option value={15}>15 slides</option>
            <option value={20}>20 slides</option>
            <option value={30}>30 slides</option>
          </select>
        </FormField>

        <FormField label="Estilo">
          <select
            className={selectClass}
            value={options.presentationStyle ?? 'professional'}
            onChange={e => onChange({ presentationStyle: e.target.value })}
          >
            <option value="professional">Profissional</option>
            <option value="creative">Criativo</option>
            <option value="academic">Acadêmico</option>
            <option value="minimal">Minimalista</option>
          </select>
        </FormField>
      </div>

      <FormField label="Público-alvo (opcional)">
        <input
          type="text"
          className={inputClass}
          placeholder="Ex: estudantes universitários, executivos, professores..."
          value={options.targetAudience ?? ''}
          onChange={e => onChange({ targetAudience: e.target.value })}
        />
      </FormField>

      <FormField label="Descrição (opcional)">
        <textarea
          className={textareaClass}
          rows={3}
          placeholder="Descreva a apresentação que deseja criar..."
          value={options.description ?? ''}
          onChange={e => onChange({ description: e.target.value })}
        />
      </FormField>

      <FormField label="Roteiro (opcional)">
        <textarea
          className={textareaClass}
          rows={4}
          placeholder="Se já possui um roteiro, cole aqui. O agente roteirista irá utilizá-lo como base."
          value={options.script ?? ''}
          onChange={e => onChange({ script: e.target.value })}
        />
      </FormField>
    </div>
  )
}

// ── Cost Estimate Display ───────────────────────────────────────────────────

function CostEstimatePanel({ estimate }: { estimate: CostEstimate }) {
  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-violet-500" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Tokens</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{fmtInt(estimate.totalTokensEstimated)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-amber-500" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Custo</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{fmtUsd(estimate.estimatedCostUsd)}</p>
          <p className="text-xs text-gray-500 mt-0.5">{fmtBrl(estimate.estimatedCostUsd * BRL_RATE)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-sky-500" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Tempo</span>
          </div>
          <p className="text-lg font-bold text-gray-900">~{estimate.estimatedDurationMinutes} min</p>
        </div>
      </div>

      {/* Agent breakdown table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">Detalhamento por agente</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Detalhamento de custo por agente">
            <caption className="sr-only">Estimativa de custos detalhada por agente do pipeline</caption>
            <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
              <tr>
                <th scope="col" className="px-4 py-2 text-left">Agente</th>
                <th scope="col" className="px-4 py-2 text-right">Tokens</th>
                <th scope="col" className="px-4 py-2 text-right">USD</th>
                <th scope="col" className="px-4 py-2 text-right">R$</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {estimate.agentBreakdown.map(row => (
                <tr key={row.agent} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2 text-gray-800">{row.agent}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{fmtInt(row.tokensEstimated)}</td>
                  <td className="px-4 py-2 text-right font-medium text-amber-700">{fmtUsd(row.costEstimated)}</td>
                  <td className="px-4 py-2 text-right font-medium text-emerald-700">{fmtBrl(row.costEstimated * BRL_RATE)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td className="px-4 py-2 text-gray-800">Total</td>
                <td className="px-4 py-2 text-right text-gray-800">{fmtInt(estimate.totalTokensEstimated)}</td>
                <td className="px-4 py-2 text-right text-amber-700">{fmtUsd(estimate.estimatedCostUsd)}</td>
                <td className="px-4 py-2 text-right text-emerald-700">{fmtBrl(estimate.estimatedCostUsd * BRL_RATE)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Split suggestion */}
      {estimate.suggestSplit && estimate.splitDescription && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <Scissors className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-800">Recomendação: dividir em partes</p>
            <p className="text-sm text-blue-700 mt-1">{estimate.splitDescription}</p>
          </div>
        </div>
      )}

      {/* Warnings */}
      {estimate.warnings.map((warning, i) => (
        <div
          key={i}
          className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">{warning}</p>
        </div>
      ))}
    </div>
  )
}

// ── Main Modal ──────────────────────────────────────────────────────────────

export default function MediaCreationModal({
  open,
  onClose,
  mediaType,
  topic,
  onApprove,
}: MediaCreationModalProps) {
  const [options, setOptions] = useState<MediaCreationOptions>(() => buildDefaults(mediaType))
  const [estimate, setEstimate] = useState<CostEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)

  const Icon = MEDIA_ICONS[mediaType] ?? Video
  const label = MEDIA_LABELS[mediaType] ?? mediaType

  // Reset state when modal opens or mediaType changes
  useEffect(() => {
    if (open) {
      setOptions(buildDefaults(mediaType))
      setEstimate(null)
      setEstimating(false)
    }
  }, [open, mediaType])

  // Close on Escape & prevent body scroll
  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  const handleChange = useCallback((patch: Partial<MediaCreationOptions>) => {
    setOptions(prev => ({ ...prev, ...patch }))
    setEstimate(null)
  }, [])

  const handleEstimate = useCallback(() => {
    setEstimating(true)
    // Simulate brief async to show loading state
    setTimeout(() => {
      setEstimate(estimateMediaCost(options))
      setEstimating(false)
    }, 400)
  }, [options])

  const handleApprove = useCallback(() => {
    if (estimate) {
      onApprove(options)
    }
  }, [estimate, options, onApprove])

  const formTitle = useMemo(() => {
    switch (mediaType) {
      case 'video': return 'Configurar Vídeo'
      case 'audio': return 'Configurar Áudio'
      case 'presentation': return 'Configurar Apresentação'
    }
  }, [mediaType])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={`Criar ${label}`}
    >
      <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-50 rounded-lg">
              <Icon className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Criar {label}</h2>
              <p className="text-sm text-gray-500 mt-0.5 truncate max-w-md" title={topic}>
                Tema: {topic}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — two-panel layout */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* Left panel: Form */}
          <div className="flex-1 overflow-y-auto p-6 border-b lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2 mb-5">
              <FileText className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-700">{formTitle}</h3>
            </div>

            {mediaType === 'video' && <VideoForm options={options} onChange={handleChange} />}
            {mediaType === 'audio' && <AudioForm options={options} onChange={handleChange} />}
            {mediaType === 'presentation' && <PresentationForm options={options} onChange={handleChange} />}

            {/* Estimate button */}
            <div className="mt-6">
              <button
                onClick={handleEstimate}
                disabled={estimating}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white font-medium text-sm hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {estimating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Calculando...
                  </>
                ) : (
                  <>
                    <Calculator className="w-4 h-4" />
                    Estimar Custos
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right panel: Cost estimate */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            <div className="flex items-center gap-2 mb-5">
              <DollarSign className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-700">Estimativa de Custos</h3>
            </div>

            {!estimate && !estimating && (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Calculator className="w-10 h-10 text-gray-300 mb-3" />
                <p className="text-sm text-gray-400">
                  Configure as opções e clique em <strong>"Estimar Custos"</strong> para ver a proposta.
                </p>
              </div>
            )}

            {estimating && (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin mb-3" />
                <p className="text-sm text-gray-500">Calculando estimativa...</p>
              </div>
            )}

            {estimate && !estimating && <CostEstimatePanel estimate={estimate} />}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-white">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleApprove}
            disabled={!estimate}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            Aprovar e Iniciar Produção
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildDefaults(mediaType: 'video' | 'audio' | 'presentation'): MediaCreationOptions {
  const base: MediaCreationOptions = { mediaType, language: 'pt-BR' }

  switch (mediaType) {
    case 'video':
      return {
        ...base,
        format: '16:9',
        quality: 'hd',
        resolution: '1080p',
        fps: 30,
        duration: 1,
      }
    case 'audio':
      return {
        ...base,
        audioFormat: 'podcast',
        voices: 2,
        audioDuration: 5,
        musicBackground: false,
      }
    case 'presentation':
      return {
        ...base,
        slideCount: 10,
        presentationStyle: 'professional',
      }
  }
}

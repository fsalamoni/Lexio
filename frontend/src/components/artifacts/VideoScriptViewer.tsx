/**
 * VideoScriptViewer — professional storyboard-style viewer for video scripts
 * with scene cards, cost estimation panel, and "Generate Full Video" button.
 *
 * This is the FIRST stage of video generation. After reviewing the script,
 * users can see the token cost estimate and trigger the full video pipeline.
 */

import { useState, useCallback, useMemo } from 'react'
import {
  Clock, Film, ChevronDown, ChevronUp, Camera,
  ArrowRightLeft, Layers, Type, StickyNote,
  Zap, DollarSign, LayoutGrid, Play, Loader2,
  AlertTriangle, CheckCircle2, Coins,
} from 'lucide-react'
import type { ParsedVideoScript, VideoScene } from './artifact-parsers'
import { estimateVideoFromScript } from '../../lib/media-production-pipeline'

// ── Cost Estimation Panel ─────────────────────────────────────────────────

interface CostEstimatePanelProps {
  script: ParsedVideoScript
  onGenerateVideo?: () => void
  isGenerating?: boolean
  generationProgress?: { step: number; total: number; phase: string; detail?: string }
}

function CostEstimatePanel({ script, onGenerateVideo, isGenerating, generationProgress }: CostEstimatePanelProps) {
  const estimate = useMemo(() => estimateVideoFromScript(script), [script])

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  const progressPercent = generationProgress
    ? Math.round((generationProgress.step / generationProgress.total) * 100)
    : 0

  return (
    <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 rounded-2xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-violet-100 rounded-xl">
          <Zap className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h3 className="text-base font-bold text-gray-900">Estimativa de Geração de Vídeo</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Custo estimado para gerar o vídeo completo a partir deste roteiro
          </p>
        </div>
      </div>

      {/* Token Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3 border border-violet-100">
          <div className="flex items-center gap-1.5 mb-1">
            <Film className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-500">Expansão</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{formatTokens(estimate.breakdown.scriptExpansion)}</p>
          <p className="text-[10px] text-gray-400">tokens</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-violet-100">
          <div className="flex items-center gap-1.5 mb-1">
            <Camera className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">Detalhamento</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{formatTokens(estimate.breakdown.sceneDetailing)}</p>
          <p className="text-[10px] text-gray-400">tokens</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-violet-100">
          <div className="flex items-center gap-1.5 mb-1">
            <Play className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">Geração</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{formatTokens(estimate.breakdown.videoGeneration)}</p>
          <p className="text-[10px] text-gray-400">tokens</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-violet-100">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">Revisão</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{formatTokens(estimate.breakdown.review)}</p>
          <p className="text-[10px] text-gray-400">tokens</p>
        </div>
      </div>

      {/* Totals */}
      <div className="flex flex-wrap items-center gap-4 py-3 px-4 bg-white rounded-xl border border-violet-100">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-violet-600" />
          <div>
            <p className="text-xs text-gray-500">Tokens Totais</p>
            <p className="text-sm font-bold text-gray-900">{estimate.totalTokens.toLocaleString('pt-BR')}</p>
          </div>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-600" />
          <div>
            <p className="text-xs text-gray-500">Custo Estimado</p>
            <p className="text-sm font-bold text-gray-900">${estimate.totalCostUSD.toFixed(2)} USD</p>
          </div>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-blue-600" />
          <div>
            <p className="text-xs text-gray-500">Cenas / Partes</p>
            <p className="text-sm font-bold text-gray-900">{script.scenes.length} cenas · {estimate.parts} parte{estimate.parts > 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {estimate.parts > 1 && (
        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            O vídeo tem {script.scenes.length} cenas e será gerado em <strong>{estimate.parts} partes</strong> para
            melhor qualidade. Cada parte será processada sequencialmente.
          </p>
        </div>
      )}

      <p className="text-[10px] text-gray-400 italic">
        * Estimativa conservadora com margem de segurança de 30%. Custos reais podem ser menores.
        O custo depende dos modelos configurados em Administração &gt; Produção de Mídia.
      </p>

      {/* Generation Progress */}
      {isGenerating && generationProgress && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-violet-700">{generationProgress.phase}</span>
            <span className="text-gray-500">{generationProgress.step}/{generationProgress.total}</span>
          </div>
          <div className="w-full bg-violet-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {generationProgress.detail && (
            <p className="text-[11px] text-gray-500 italic">{generationProgress.detail}</p>
          )}
        </div>
      )}

      {/* Generate Button */}
      {onGenerateVideo && (
        <button
          onClick={onGenerateVideo}
          disabled={isGenerating}
          className={`w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl font-semibold text-sm transition-all
            ${isGenerating
              ? 'bg-violet-200 text-violet-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-200 hover:shadow-xl hover:shadow-violet-300 active:scale-[0.98]'
            }`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Gerando vídeo... {progressPercent}%
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Gerar Vídeo Completo ({formatTokens(estimate.totalTokens)} tokens · ${estimate.totalCostUSD.toFixed(2)})
            </>
          )}
        </button>
      )}
    </div>
  )
}

// ── Scene card ─────────────────────────────────────────────────────────────

interface SceneCardProps {
  scene: VideoScene
}

function SceneCard({ scene }: SceneCardProps) {
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white">
      {/* Scene header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-900 text-white">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/15 text-sm font-bold">
            {scene.number}
          </span>
          <span className="text-sm font-semibold">Cena {scene.number}</span>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-mono text-gray-300 bg-white/10 px-2.5 py-1 rounded-md">
          <Clock className="w-3 h-3" />
          {scene.time}
        </span>
      </div>

      {/* Main content: visual + narration */}
      <div className="flex flex-col sm:flex-row">
        {/* Visual description (the "frame") */}
        <div className="sm:w-2/5 bg-gray-100 p-5 border-b sm:border-b-0 sm:border-r border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <Camera className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Visual
            </span>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {scene.visual}
          </p>
        </div>

        {/* Narration */}
        <div className="sm:w-3/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Film className="w-3.5 h-3.5 text-brand-500" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-500">
              Narração
            </span>
          </div>
          <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-line">
            {scene.narration}
          </p>
        </div>
      </div>

      {/* Bottom badges + notes */}
      {(scene.transition || scene.broll || scene.lowerThird || scene.notes) && (
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {scene.transition && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-purple-100 text-purple-700">
                <ArrowRightLeft className="w-3 h-3" />
                {scene.transition}
              </span>
            )}
            {scene.broll && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
                <Layers className="w-3 h-3" />
                B-Roll: {scene.broll}
              </span>
            )}
            {scene.lowerThird && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700">
                <Type className="w-3 h-3" />
                {scene.lowerThird}
              </span>
            )}
          </div>

          {/* Notes */}
          {scene.notes && (
            <div className="flex items-start gap-2 mt-2.5">
              <StickyNote className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-500 italic leading-relaxed">{scene.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export interface VideoScriptViewerProps {
  data: ParsedVideoScript
  onGenerateVideo?: () => void
  isGenerating?: boolean
  generationProgress?: { step: number; total: number; phase: string; detail?: string }
}

export default function VideoScriptViewer({
  data,
  onGenerateVideo,
  isGenerating,
  generationProgress,
}: VideoScriptViewerProps) {
  const [notesOpen, setNotesOpen] = useState(false)

  if (data.scenes.length === 0) {
    return <div className="text-center py-12 text-gray-500">Roteiro sem cenas.</div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-gray-200">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{data.title}</h1>
          <p className="text-sm text-gray-500">
            Etapa 1: Roteiro · {data.scenes.length} cena{data.scenes.length !== 1 ? 's' : ''}
          </p>
        </div>
        {data.duration && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-medium text-gray-700 flex-shrink-0">
            <Clock className="w-4 h-4 text-gray-400" />
            {data.duration}
          </div>
        )}
      </div>

      {/* Cost Estimation + Generate Button (BEFORE storyboard) */}
      <CostEstimatePanel
        script={data}
        onGenerateVideo={onGenerateVideo}
        isGenerating={isGenerating}
        generationProgress={generationProgress}
      />

      {/* Storyboard */}
      <div className="space-y-5">
        {data.scenes.map(scene => (
          <SceneCard key={scene.number} scene={scene} />
        ))}
      </div>

      {/* Post-production notes (collapsible) */}
      {data.postProductionNotes && data.postProductionNotes.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setNotesOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="text-sm font-semibold text-gray-700">
              Notas de Pós-Produção ({data.postProductionNotes.length})
            </span>
            {notesOpen ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {notesOpen && (
            <div className="px-5 py-4 space-y-2 bg-white">
              {data.postProductionNotes.map((note, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs text-gray-400 font-mono mt-0.5 flex-shrink-0">
                    {String(i + 1).padStart(2, '0')}.
                  </span>
                  <p className="text-sm text-gray-600 leading-relaxed">{note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom Generate Button (convenience duplicate) */}
      {onGenerateVideo && !isGenerating && (
        <div className="pt-2">
          <button
            onClick={onGenerateVideo}
            className="w-full flex items-center justify-center gap-2.5 py-3 px-6 rounded-xl font-semibold text-sm
              bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700
              shadow-lg shadow-violet-200 hover:shadow-xl active:scale-[0.98] transition-all"
          >
            <Play className="w-4 h-4" />
            Gerar Vídeo Completo
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * VideoGenerationCostModal — shows estimated token cost for full video generation
 * and allows the user to approve or skip video production.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  X, Video, Zap, DollarSign, Loader2,
  AlertCircle, Clock, Layers, CheckCircle2,
} from 'lucide-react'
import { estimateVideoGenerationCost } from '../lib/video-generation-pipeline'

interface VideoGenerationCostModalProps {
  scriptContent: string
  topic: string
  onGenerate: () => void
  onSkip: () => void
  isGenerating: boolean
  generationProgress?: { step: number; total: number; phase: string; agent: string }
}

export default function VideoGenerationCostModal({
  scriptContent,
  topic,
  onGenerate,
  onSkip,
  isGenerating,
  generationProgress,
}: VideoGenerationCostModalProps) {
  const estimate = useMemo(() => estimateVideoGenerationCost(scriptContent), [scriptContent])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isGenerating) onSkip()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onSkip, isGenerating])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={isGenerating ? undefined : onSkip}
      />

      {/* Modal */}
      <div className="relative w-[95vw] max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-rose-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 rounded-lg">
              <Video className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {isGenerating ? 'Gerando Vídeo...' : 'Gerar Vídeo Completo'}
              </h2>
              <p className="text-xs text-rose-700 truncate max-w-md">{topic}</p>
            </div>
          </div>
          {!isGenerating && (
            <button onClick={onSkip} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {isGenerating ? (
            /* Generation progress view */
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-rose-50 rounded-xl border border-rose-200">
                <Loader2 className="w-5 h-5 text-rose-600 animate-spin flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    Etapa {generationProgress?.step || 1} de {generationProgress?.total || 8}
                  </p>
                  <p className="text-xs text-gray-600 truncate">
                    {generationProgress?.agent || 'Iniciando pipeline...'}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-gradient-to-r from-rose-500 to-orange-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${((generationProgress?.step || 0) / (generationProgress?.total || 8)) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 text-center">
                  {Math.round(((generationProgress?.step || 0) / (generationProgress?.total || 8)) * 100)}% concluído
                </p>
              </div>

              {/* Agent pipeline steps */}
              <div className="space-y-1.5">
                {[
                  'Planejador de Produção',
                  'Roteirista',
                  'Diretor de Cenas',
                  'Storyboarder',
                  'Designer Visual',
                  'Compositor de Vídeo',
                  'Narrador',
                  'Revisor Final',
                ].map((agent, i) => {
                  const step = i + 1
                  const current = generationProgress?.step || 0
                  const isDone = step < current
                  const isActive = step === current
                  return (
                    <div
                      key={agent}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs ${
                        isDone
                          ? 'bg-green-50 text-green-700'
                          : isActive
                          ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                          : 'bg-gray-50 text-gray-400'
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      ) : isActive ? (
                        <Loader2 className="w-3.5 h-3.5 text-rose-500 animate-spin" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                      <span className="font-medium">{step}. {agent}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* Cost estimation view */
            <>
              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold mb-1">O roteiro foi salvo com sucesso!</p>
                  <p>Agora você pode gerar o vídeo completo. O pipeline de 8 agentes especializados irá criar todos os elementos de produção: cenas detalhadas, storyboard, prompts visuais, timeline, narração e revisão final.</p>
                </div>
              </div>

              {/* Cost summary */}
              <div className="bg-gray-50 rounded-xl p-5 border">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-4 h-4 text-gray-600" />
                  <h3 className="text-sm font-bold text-gray-900">Custo Estimado</h3>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-white rounded-lg p-3 border">
                    <p className="text-xs text-gray-500 mb-1">Tokens Totais</p>
                    <p className="text-lg font-bold text-gray-900">
                      {estimate.estimatedTokens.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border">
                    <p className="text-xs text-gray-500 mb-1">Custo Estimado (USD)</p>
                    <p className="text-lg font-bold text-rose-600">
                      ${estimate.estimatedCostUsd.toFixed(4)}
                    </p>
                  </div>
                </div>

                {/* Per-agent breakdown */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                    Detalhamento por Agente
                  </p>
                  {estimate.breakdown.map((item) => (
                    <div
                      key={item.agent}
                      className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border text-xs"
                    >
                      <span className="font-medium text-gray-700">{item.label}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-500">
                          <Zap className="w-3 h-3 inline mr-1" />
                          {item.estimatedTokens.toLocaleString('pt-BR')} tokens
                        </span>
                        <span className="font-mono text-gray-600">
                          ${item.estimatedCostUsd.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pipeline info */}
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <Layers className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-800">
                  <p className="font-semibold mb-1">Pipeline de 8 Agentes</p>
                  <p>Planejador → Roteirista → Diretor de Cenas → Storyboarder → Designer Visual → Compositor → Narrador → Revisor Final</p>
                  <p className="mt-1 text-blue-600">Após a geração, você terá acesso ao editor de estúdio com todas as faixas.</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!isGenerating && (
          <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50/80">
            <p className="text-xs text-gray-500">
              Os custos reais podem variar conforme o modelo configurado.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onSkip}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Apenas salvar roteiro
              </button>
              <button
                onClick={onGenerate}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 transition-colors shadow-sm"
              >
                <Video className="w-4 h-4" />
                Gerar Vídeo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

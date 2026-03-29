/**
 * VideoGenerationCostModal — shows estimated token cost for full video generation,
 * allows the user to review/edit the script before generating, and displays
 * recommended model types per pipeline agent.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  X, Video, Zap, DollarSign, Loader2,
  AlertCircle, Clock, Layers, CheckCircle2,
  Eye, Edit3, ChevronDown, ChevronUp,
  Image, Mic, Film, FileText,
} from 'lucide-react'
import { estimateVideoGenerationCost } from '../lib/video-generation-pipeline'

/** Model type recommendation per agent — agents with ⚠️ require specialized (non-text) models */
const AGENT_MODEL_RECOMMENDATIONS: Record<string, { icon: React.ElementType; capability: string; note: string }> = {
  video_planejador:   { icon: FileText, capability: 'Texto', note: 'Claude Sonnet, GPT-4o ou equivalente' },
  video_roteirista:   { icon: FileText, capability: 'Texto', note: 'Claude Sonnet, GPT-4o (escrita criativa)' },
  video_diretor_cena: { icon: FileText, capability: 'Texto', note: 'Claude Sonnet, GPT-4o (estruturação)' },
  video_storyboarder: { icon: FileText, capability: 'Texto', note: 'Claude Sonnet, GPT-4o (descrição visual)' },
  video_designer:     { icon: Image,    capability: 'Imagem', note: '⚠️ Requer modelo de imagem: DALL-E, Midjourney, Stable Diffusion' },
  video_compositor:   { icon: Film,     capability: 'Vídeo', note: '⚠️ Requer modelo de vídeo: Sora, Runway, Pika Labs' },
  video_narrador:     { icon: Mic,      capability: 'Áudio', note: '⚠️ Requer modelo de áudio: ElevenLabs, OpenAI TTS' },
  video_revisor:      { icon: FileText, capability: 'Texto', note: 'Claude Sonnet, GPT-4o (revisão)' },
}

interface VideoGenerationCostModalProps {
  scriptContent: string
  topic: string
  onGenerate: (editedContent: string) => void
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
  const [editedContent, setEditedContent] = useState(scriptContent)
  const [activeTab, setActiveTab] = useState<'cost' | 'script'>('cost')
  const [scriptMode, setScriptMode] = useState<'preview' | 'edit'>('preview')
  const [showAgentDetails, setShowAgentDetails] = useState(false)

  const estimate = useMemo(() => estimateVideoGenerationCost(editedContent), [editedContent])
  const hasEdits = editedContent !== scriptContent

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
      <div className="relative w-[95vw] max-w-4xl h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-rose-50 to-orange-50 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-rose-100 rounded-lg flex-shrink-0">
              <Video className="w-5 h-5 text-rose-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900">
                {isGenerating ? 'Gerando Vídeo...' : 'Proposta de Geração de Vídeo'}
              </h2>
              <p className="text-xs text-rose-700 truncate">{topic}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isGenerating && (
              <>
                {/* Tab switcher */}
                <div className="flex bg-gray-100 rounded-lg p-0.5 mr-2">
                  <button
                    onClick={() => setActiveTab('cost')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      activeTab === 'cost' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    Custos
                  </button>
                  <button
                    onClick={() => setActiveTab('script')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      activeTab === 'script' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Roteiro
                    {hasEdits && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />}
                  </button>
                </div>
                <button onClick={onSkip} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
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
          ) : activeTab === 'cost' ? (
            /* ── Cost estimation tab ── */
            <>
              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold mb-1">Proposta de geração de vídeo</p>
                  <p>Revise o roteiro na aba <strong>Roteiro</strong> antes de gerar. Você pode editar cenas, narrações e descrições livremente. O pipeline de 8 agentes criará todos os elementos de produção.</p>
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

                {/* Per-agent breakdown with model recommendations */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Detalhamento por Agente
                    </p>
                    <button
                      onClick={() => setShowAgentDetails(d => !d)}
                      className="text-[10px] text-rose-600 hover:underline flex items-center gap-1"
                    >
                      {showAgentDetails ? 'Menos detalhes' : 'Modelos recomendados'}
                      {showAgentDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>
                  {estimate.breakdown.map((item) => {
                    const rec = AGENT_MODEL_RECOMMENDATIONS[item.agent]
                    const RecIcon = rec?.icon || FileText
                    return (
                      <div key={item.agent} className="bg-white rounded-lg border overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 text-xs">
                          <div className="flex items-center gap-2">
                            <RecIcon className="w-3.5 h-3.5 text-gray-400" />
                            <span className="font-medium text-gray-700">{item.label}</span>
                            {rec && rec.capability !== 'Texto' && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                rec.capability === 'Imagem' ? 'bg-pink-100 text-pink-700' :
                                rec.capability === 'Áudio' ? 'bg-violet-100 text-violet-700' :
                                rec.capability === 'Vídeo' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {rec.capability}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-gray-500">
                              <Zap className="w-3 h-3 inline mr-1" />
                              {item.estimatedTokens.toLocaleString('pt-BR')}
                            </span>
                            <span className="font-mono text-gray-600">
                              ${item.estimatedCostUsd.toFixed(4)}
                            </span>
                          </div>
                        </div>
                        {showAgentDetails && rec && (
                          <div className="px-3 py-1.5 bg-gray-50 border-t text-[10px] text-gray-500">
                            💡 {rec.note}
                          </div>
                        )}
                      </div>
                    )
                  })}
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
          ) : (
            /* ── Script editing tab ── */
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-900">Roteiro do Vídeo</h3>
                  {hasEdits && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      Editado
                    </span>
                  )}
                </div>
                <div className="flex bg-gray-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setScriptMode('preview')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      scriptMode === 'preview' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Visualizar
                  </button>
                  <button
                    onClick={() => setScriptMode('edit')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      scriptMode === 'edit' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Edite livremente o roteiro, cenas, narrações e descrições visuais antes de gerar o vídeo. As alterações serão usadas pelo pipeline de geração.
              </p>

              {scriptMode === 'preview' ? (
                <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap font-mono text-xs leading-relaxed bg-gray-50 rounded-xl p-6 border min-h-[40vh]">
                  {editedContent}
                </div>
              ) : (
                <textarea
                  value={editedContent}
                  onChange={e => setEditedContent(e.target.value)}
                  className="w-full min-h-[50vh] p-6 bg-gray-50 rounded-xl border font-mono text-xs leading-relaxed text-gray-800 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none resize-none"
                  placeholder="Edite o roteiro do vídeo aqui..."
                />
              )}

              {hasEdits && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditedContent(scriptContent)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                  >
                    Restaurar original
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!isGenerating && (
          <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50/80 flex-shrink-0">
            <p className="text-xs text-gray-500">
              {hasEdits ? '⚠️ O roteiro foi editado. As alterações serão usadas na geração.' : 'Os custos reais podem variar conforme o modelo configurado.'}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onSkip}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Apenas salvar roteiro
              </button>
              <button
                onClick={() => onGenerate(editedContent)}
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

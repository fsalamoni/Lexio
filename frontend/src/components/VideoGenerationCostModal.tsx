/**
 * VideoGenerationCostModal — shows estimated token cost for full video generation,
 * allows the user to review/edit the script before generating, and displays
 * recommended model types per pipeline agent.
 */

import { useState, useMemo } from 'react'
import {
  Video, Zap, DollarSign, Loader2,
  AlertCircle, Clock, Layers, CheckCircle2,
  Eye, Edit3, ChevronDown, ChevronUp,
  Image, Mic, Film, FileText, ImagePlus, Volume2,
} from 'lucide-react'
import { estimateVideoGenerationCost } from '../lib/video-generation-pipeline'
import { VIDEO_PIPELINE_STAGES, type VideoPipelineProgressState } from '../lib/video-pipeline-progress'
import DraggablePanel from './DraggablePanel'

/** Model type recommendation per agent — pipeline textual + geração real de mídia */
const AGENT_MODEL_RECOMMENDATIONS: Record<string, { icon: React.ElementType; capability: string; note: string }> = {
  video_planejador:   { icon: FileText, capability: 'Texto', note: 'Premium: Claude Sonnet, GPT-4o, GPT-4.1. Baratos: DeepSeek V3, Gemini 2.5 Flash, GPT-4o Mini, Llama 4 Maverick, Qwen 2.5 72B. Grátis: Gemini 2.0 Flash:free, DeepSeek R1:free' },
  video_roteirista:   { icon: FileText, capability: 'Texto', note: 'Premium: Claude Sonnet, GPT-4.1, GPT-4o. Baratos: DeepSeek V3, Llama 4 Maverick, Gemini 2.5 Flash, Qwen 2.5 72B, Llama 3.3 70B. Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free' },
  video_diretor_cena: { icon: FileText, capability: 'Texto', note: 'Premium: Claude Sonnet, GPT-4.1. Baratos: DeepSeek V3, Gemini 2.5 Flash, GPT-4o Mini, GPT-4.1 Mini, Llama 4 Maverick, Qwen 2.5 72B. Grátis: Gemini 2.0 Flash:free, Qwen3 30B:free' },
  video_storyboarder: { icon: FileText, capability: 'Texto', note: 'Premium: Claude Sonnet, GPT-4.1, GPT-4o. Baratos: DeepSeek V3, Gemini 2.5 Flash, Llama 4 Maverick, Qwen 2.5 72B, Llama 3.3 70B. Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free' },
  video_designer:     { icon: Image,    capability: 'Texto', note: 'Define direção visual e prompts em JSON para a etapa de mídia literal.' },
  video_compositor:   { icon: Film,     capability: 'Texto', note: 'Monta a timeline e a estrutura de composição antes da renderização literal.' },
  video_narrador:     { icon: Mic,      capability: 'Texto', note: 'Gera roteiro de narração e marcações de timing para a etapa de TTS.' },
  video_revisor:      { icon: FileText, capability: 'Texto', note: 'Premium: Claude Sonnet, GPT-4.1. Baratos: DeepSeek V3, Gemini 2.5 Flash, GPT-4o Mini, Qwen 2.5 72B, Llama 3.3 70B. Grátis: Gemini 2.0 Flash:free, Mistral Small:free' },
  video_clip_planner: { icon: Film,     capability: 'Texto', note: 'Chamado 1x por cena. Baratos e rápidos: Gemini 2.5 Flash, GPT-4o Mini, DeepSeek V3. Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free' },
}

interface VideoGenerationCostModalProps {
  scriptContent: string
  topic: string
  onGenerate: (editedContent: string) => void
  onSkip: () => void
  isGenerating: boolean
  generationProgress?: VideoPipelineProgressState
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

  return (
    <DraggablePanel
      open={true}
      onClose={isGenerating ? () => {} : onSkip}
      title={isGenerating ? 'Fase 1 em execução: Planejamento do Vídeo...' : `Plano de Produção (Fase 1) — ${topic}`}
      icon={<Video size={16} />}
      initialWidth={900}
      initialHeight={700}
      minWidth={500}
      minHeight={400}
      closeOnEscape={!isGenerating}
    >
        {/* Header controls */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-gradient-to-r from-rose-50 to-orange-50 flex-shrink-0">
          <p className="text-xs text-rose-700 truncate">{topic}</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isGenerating && (
              <div className="flex bg-gray-100 rounded-lg p-0.5">
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
                    Etapa {generationProgress?.step || 1} de {generationProgress?.total || VIDEO_PIPELINE_STAGES.length}
                  </p>
                  <p className="text-xs text-gray-600 truncate">
                    {generationProgress?.stageLabel || generationProgress?.agent || 'Iniciando pipeline...'}
                  </p>
                  {generationProgress?.stageDescription && (
                    <p className="text-[11px] text-rose-700 mt-1 line-clamp-2">
                      {generationProgress.stageDescription}
                    </p>
                  )}
                  {generationProgress?.stageMeta && (
                    <p className="text-[10px] text-rose-500 mt-1 truncate">
                      {generationProgress.stageMeta}
                    </p>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-gradient-to-r from-rose-500 to-orange-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${generationProgress?.percent || 0}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 text-center">
                  {generationProgress?.percent || 0}% concluído
                </p>
              </div>

              {/* Pipeline steps — 8 LLM agents + 3 media generation steps */}
              <div className="space-y-1.5">
                {VIDEO_PIPELINE_STAGES.map((agent, i) => {
                  const step = i + 1
                  const current = generationProgress?.step || 0
                  const isDone = step < current
                  const isActive = step === current
                  const isMedia = agent.category === 'media'
                  const AgentIcon = step <= 2
                    ? FileText
                    : step === 3 || step === 6 || step === 9
                      ? Film
                      : step === 4 || step === 5 || step === 10
                        ? Image
                        : step === 7 || step === 11
                          ? Mic
                          : FileText
                  return (
                    <div
                      key={agent.key}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs ${
                        isDone
                          ? 'bg-green-50 text-green-700'
                          : isActive
                          ? isMedia ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                          : 'bg-gray-50 text-gray-400'
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      ) : isActive ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <AgentIcon className="w-3.5 h-3.5" />
                      )}
                      <span className="font-medium">{step}. {agent.label}</span>
                      {isActive && generationProgress?.agent && step >= 9 && (
                        <span className="text-[10px] text-gray-500 ml-auto truncate max-w-[200px]">
                          {generationProgress.agent}
                        </span>
                      )}
                      {isActive && generationProgress?.stageMeta && (
                        <span className="text-[10px] text-gray-500 ml-auto truncate max-w-[220px]">
                          {generationProgress.stageMeta}
                        </span>
                      )}
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
                  <p className="font-semibold mb-1">Geração completa de vídeo com mídia real</p>
                  <p>Revise o roteiro na aba <strong>Roteiro</strong> antes de gerar. O pipeline de <strong>11 etapas</strong> irá:</p>
                  <ul className="mt-1.5 space-y-0.5 text-xs">
                    <li>1–8. Planejar, roteirizar, dirigir cenas, criar storyboard, prompts visuais, timeline e narração</li>
                    <li><strong>9. Subdividir cada cena em clips</strong> sequenciais (~8s cada) com continuidade visual</li>
                    <li><strong>10. Gerar imagens reais</strong> para cada clip usando IA generativa</li>
                    <li><strong>11. Gerar narração com voz</strong> sintetizada (TTS) para cada segmento</li>
                  </ul>
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

              {/* Media generation cost breakdown */}
              {estimate.mediaBreakdown && estimate.mediaBreakdown.length > 0 && (
                <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <ImagePlus className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-bold text-blue-900">Geração de Mídia Real</h3>
                    <span className="text-xs text-blue-600 ml-auto font-mono">
                      ${estimate.mediaCostUsd.toFixed(4)}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {estimate.mediaBreakdown.map((item) => (
                      <div key={item.type} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border text-xs">
                        <div className="flex items-center gap-2">
                          {item.type === 'image' ? <Image className="w-3.5 h-3.5 text-rose-500" /> : <Volume2 className="w-3.5 h-3.5 text-violet-500" />}
                          <span className="font-medium text-gray-700">{item.label}</span>
                          <span className="text-gray-400">({item.count} itens)</span>
                        </div>
                        <span className="font-mono text-gray-600">${item.estimatedCostUsd.toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pipeline info */}
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <Layers className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-800">
                  <p className="font-semibold mb-1">Pipeline de 11 Etapas</p>
                  <p>Planejador → Roteirista → Diretor → Storyboarder → Designer → Compositor → Narrador → Revisor → <strong>Clips por Cena</strong> → <strong>Imagens IA</strong> → <strong>Narração TTS</strong></p>
                  <p className="mt-1 text-blue-600">Cada cena é subdividida em clips sequenciais (~8s cada). Imagens e narração são geradas automaticamente para cada clip.</p>
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
              {hasEdits ? '⚠️ O roteiro foi editado. As alterações serão usadas na Fase 1.' : 'Os custos de mídia literal da Fase 2 podem variar conforme modelo e número de cenas.'}
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
                Executar Fase 1
              </button>
            </div>
          </div>
        )}
    </DraggablePanel>
  )
}

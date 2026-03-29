/**
 * GeneratedVideoViewer — displays the full video production output with
 * video generation prompts, camera specs, audio specs, overlays, and
 * post-production notes for each scene. This is the result of the
 * multi-agent video generation pipeline.
 */

import { useState } from 'react'
import {
  Clock, Film, Camera, Volume2, Layers, Type,
  StickyNote, ChevronDown, ChevronUp, Copy, Check,
  Clapperboard, Palette, Move3D, Music, Sparkles, Star,
} from 'lucide-react'
import type { ParsedGeneratedVideo, GeneratedVideoScene } from './artifact-parsers'

// ── Copy button for prompts ─────────────────────────────────────────────

function CopyPromptButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
      title={`Copiar ${label}`}
    >
      {copied ? <Check className="w-2.5 h-2.5 text-green-600" /> : <Copy className="w-2.5 h-2.5" />}
      {copied ? 'Copiado' : label}
    </button>
  )
}

// ── Scene card for generated video ──────────────────────────────────────

function GeneratedSceneCard({ scene }: { scene: GeneratedVideoScene }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white">
      {/* Scene header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-violet-900 to-indigo-900 text-white">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/15 text-sm font-bold">
            {scene.number}
          </span>
          <span className="text-sm font-semibold">Cena {scene.number}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-mono text-gray-300 bg-white/10 px-2.5 py-1 rounded-md">
            <Clock className="w-3 h-3" />
            {scene.timeCode}
          </span>
          <span className="text-[10px] px-2 py-0.5 bg-white/15 rounded-md text-gray-300">
            {scene.durationSeconds}s
          </span>
        </div>
      </div>

      {/* Narration */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <Film className="w-3.5 h-3.5 text-violet-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-500">Narração Final</span>
        </div>
        <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-line">
          {scene.narrationFinal}
        </p>
      </div>

      {/* Video Generation Prompt */}
      {scene.videoGenerationPrompt && (
        <div className="p-5 bg-violet-50 border-b border-violet-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Clapperboard className="w-3.5 h-3.5 text-violet-600" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-600">Prompt de Vídeo IA</span>
            </div>
            <CopyPromptButton text={scene.videoGenerationPrompt} label="Copiar prompt" />
          </div>
          <p className="text-xs text-violet-800 leading-relaxed font-mono bg-white/60 rounded-lg p-3 border border-violet-200">
            {scene.videoGenerationPrompt}
          </p>
        </div>
      )}

      {/* Image Generation Prompt */}
      {scene.imageGenerationPrompt && (
        <div className="p-5 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Camera className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">Prompt de Imagem</span>
            </div>
            <CopyPromptButton text={scene.imageGenerationPrompt} label="Copiar prompt" />
          </div>
          <p className="text-xs text-blue-800 leading-relaxed font-mono bg-white/60 rounded-lg p-3 border border-blue-200">
            {scene.imageGenerationPrompt}
          </p>
        </div>
      )}

      {/* Expandable tech details */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-xs font-medium text-gray-600"
      >
        <span>Especificações Técnicas</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="px-5 py-4 bg-gray-50/50 space-y-3 border-t border-gray-100">
          {/* Camera */}
          {scene.cameraSpec && (
            <div className="flex items-start gap-2">
              <Move3D className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[10px] font-semibold uppercase text-gray-400">Câmera</span>
                <p className="text-xs text-gray-600">
                  {[scene.cameraSpec.movement, scene.cameraSpec.angle, scene.cameraSpec.speed].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          )}

          {/* Audio */}
          {scene.audioSpec && (
            <div className="flex items-start gap-2">
              <Music className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[10px] font-semibold uppercase text-gray-400">Áudio</span>
                <div className="text-xs text-gray-600 space-y-0.5">
                  {scene.audioSpec.music && <p>Música: {scene.audioSpec.music}</p>}
                  {scene.audioSpec.ambience && <p>Ambiente: {scene.audioSpec.ambience}</p>}
                  {scene.audioSpec.sfx && scene.audioSpec.sfx.length > 0 && (
                    <p>SFX: {scene.audioSpec.sfx.join(', ')}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Transition */}
          {scene.transition && (
            <div className="flex items-start gap-2">
              <Layers className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[10px] font-semibold uppercase text-gray-400">Transição</span>
                <p className="text-xs text-gray-600">
                  {scene.transition.type}{scene.transition.durationMs ? ` (${scene.transition.durationMs}ms)` : ''}
                </p>
              </div>
            </div>
          )}

          {/* Overlays */}
          {scene.overlays && scene.overlays.length > 0 && (
            <div className="flex items-start gap-2">
              <Type className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[10px] font-semibold uppercase text-gray-400">Overlays</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {scene.overlays.map((ov, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      [{ov.type}] {ov.content}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Post-production notes */}
          {scene.postProduction && (
            <div className="flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[10px] font-semibold uppercase text-gray-400">Pós-produção</span>
                <p className="text-xs text-gray-600 italic">{scene.postProduction}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────

interface GeneratedVideoViewerProps {
  data: ParsedGeneratedVideo
}

export default function GeneratedVideoViewer({ data }: GeneratedVideoViewerProps) {
  const [notesOpen, setNotesOpen] = useState(false)

  if (data.scenes.length === 0) {
    return <div className="text-center py-12 text-gray-500">Vídeo sem cenas.</div>
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-gray-200">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{data.title}</h1>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{data.totalScenes} cena{data.totalScenes !== 1 ? 's' : ''}</span>
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <span>{formatDuration(data.totalDurationSeconds)}</span>
            {data.qualityScore && (
              <>
                <span className="w-1 h-1 rounded-full bg-gray-300" />
                <span className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  {data.qualityScore}/10
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-100 to-indigo-100 rounded-lg text-xs font-semibold text-violet-700 flex-shrink-0">
          <Clapperboard className="w-4 h-4" />
          Vídeo Gerado
        </div>
      </div>

      {/* Review Notes */}
      {data.reviewNotes && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700">Notas do Revisor</span>
          </div>
          <p className="text-sm text-emerald-800 leading-relaxed">{data.reviewNotes}</p>
        </div>
      )}

      {/* Scenes */}
      <div className="space-y-5">
        {data.scenes.map(scene => (
          <GeneratedSceneCard key={scene.number} scene={scene} />
        ))}
      </div>

      {/* Post-production notes */}
      {data.postProductionNotes && data.postProductionNotes.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setNotesOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="text-sm font-semibold text-gray-700">
              Notas de Pós-Produção ({data.postProductionNotes.length})
            </span>
            {notesOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
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
    </div>
  )
}

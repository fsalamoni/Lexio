/**
 * VideoScriptViewer — professional storyboard-style viewer for video scripts
 * with scene cards, visual description frames, and collapsible post-production notes.
 */

import { useState, useCallback } from 'react'
import {
  Clock, Film, ChevronDown, ChevronUp, Camera,
  ArrowRightLeft, Layers, Type, StickyNote,
} from 'lucide-react'
import type { ParsedVideoScript, VideoScene } from './artifact-parsers'

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
              Narracao
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

interface VideoScriptViewerProps {
  data: ParsedVideoScript
}

export default function VideoScriptViewer({ data }: VideoScriptViewerProps) {
  const [notesOpen, setNotesOpen] = useState(false)

  if (data.scenes.length === 0) {
    return <div className="text-center py-12 text-gray-500">Vídeo sem cenas.</div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-gray-200">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{data.title}</h1>
          <p className="text-sm text-gray-500">
            {data.scenes.length} cena{data.scenes.length !== 1 ? 's' : ''}
          </p>
        </div>
        {data.duration && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-medium text-gray-700 flex-shrink-0">
            <Clock className="w-4 h-4 text-gray-400" />
            {data.duration}
          </div>
        )}
      </div>

      {data.renderedVideoUrl && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 mb-2">
            Video literal gerado
          </p>
          <video controls preload="metadata" className="w-full rounded-xl bg-black">
            <source src={data.renderedVideoUrl} type="video/mp4" />
            Seu navegador nao suporta reproducao de video.
          </video>
        </div>
      )}

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
              Notas de Pos-Producao ({data.postProductionNotes.length})
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
    </div>
  )
}

/**
 * VideoStudioEditor — timeline-based video studio editor that displays all
 * production tracks (video, narration, music, SFX, overlays) and allows
 * the user to edit, cut, extend, and create new segments.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  Video, Mic, Music, Sparkles, Type, Clock, Plus,
  Scissors, Maximize2, Minimize2, Play, Pause, SkipBack,
  ChevronDown, ChevronUp, Palette, Eye, EyeOff,
  Camera, Layers, X, Save, Download, ZoomIn, ZoomOut,
  Film, AlertCircle, CheckCircle2, RefreshCw, ImagePlus,
  Volume2, Loader2,
} from 'lucide-react'
import type {
  VideoProductionPackage,
  VideoTrack,
  TrackSegment,
  VideoScene,
  VideoClip,
  NarrationSegment,
} from '../../lib/video-generation-pipeline'

// ── Constants ─────────────────────────────────────────────────────────────────

const TRACK_COLORS: Record<string, { bg: string; border: string; segment: string; text: string }> = {
  video:     { bg: 'bg-rose-50',   border: 'border-rose-200',   segment: 'bg-rose-100 border-rose-300 hover:bg-rose-200',   text: 'text-rose-700' },
  narration: { bg: 'bg-violet-50', border: 'border-violet-200', segment: 'bg-violet-100 border-violet-300 hover:bg-violet-200', text: 'text-violet-700' },
  music:     { bg: 'bg-emerald-50', border: 'border-emerald-200', segment: 'bg-emerald-100 border-emerald-300 hover:bg-emerald-200', text: 'text-emerald-700' },
  sfx:       { bg: 'bg-amber-50',  border: 'border-amber-200',  segment: 'bg-amber-100 border-amber-300 hover:bg-amber-200',  text: 'text-amber-700' },
  overlay:   { bg: 'bg-sky-50',    border: 'border-sky-200',    segment: 'bg-sky-100 border-sky-300 hover:bg-sky-200',    text: 'text-sky-700' },
}

const TRACK_ICONS: Record<string, React.ElementType> = {
  video: Video,
  narration: Mic,
  music: Music,
  sfx: Sparkles,
  overlay: Type,
}

const PIXELS_PER_SECOND_BASE = 8

// ── Types ─────────────────────────────────────────────────────────────────────

interface VideoStudioEditorProps {
  production: VideoProductionPackage
  onClose: () => void
  onSave?: (production: VideoProductionPackage) => void | Promise<void>
  onGenerateLiteralMedia?: (production: VideoProductionPackage) => void | Promise<void>
  onGenerateClipVideo?: (production: VideoProductionPackage, sceneNumber: number, clipNumber: number) => Promise<VideoProductionPackage | null>
  isLiteralGenerating?: boolean
  literalProgress?: { step: number; total: number; phase: string; agent: string }
  /** Callback to regenerate image for a specific scene */
  onRegenerateImage?: (sceneNumber: number) => Promise<string | null>
  /** Callback to regenerate TTS for a specific narration segment */
  onRegenerateTTS?: (sceneNumber: number) => Promise<string | null>
}

interface SelectedSegment {
  trackIndex: number
  segmentIndex: number
}

// ── Timeline Ruler ────────────────────────────────────────────────────────────

function TimelineRuler({ totalDuration, pixelsPerSecond }: { totalDuration: number; pixelsPerSecond: number }) {
  const markers: { time: number; label: string }[] = []
  const interval = totalDuration > 300 ? 30 : totalDuration > 60 ? 10 : 5

  for (let t = 0; t <= totalDuration; t += interval) {
    const mins = Math.floor(t / 60)
    const secs = t % 60
    markers.push({
      time: t,
      label: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
    })
  }

  return (
    <div
      className="relative h-7 bg-gray-100 border-b border-gray-300 flex-shrink-0"
      style={{ width: `${totalDuration * pixelsPerSecond}px`, minWidth: '100%' }}
    >
      {markers.map(m => (
        <div
          key={m.time}
          className="absolute top-0 h-full flex flex-col items-center"
          style={{ left: `${m.time * pixelsPerSecond}px` }}
        >
          <div className="w-px h-2.5 bg-gray-400" />
          <span className="text-[9px] font-mono text-gray-500 mt-0.5">{m.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Track Row ─────────────────────────────────────────────────────────────────

function TrackRow({
  track,
  trackIndex,
  totalDuration,
  pixelsPerSecond,
  selectedSegment,
  onSelectSegment,
  isVisible,
}: {
  track: VideoTrack
  trackIndex: number
  totalDuration: number
  pixelsPerSecond: number
  selectedSegment: SelectedSegment | null
  onSelectSegment: (sel: SelectedSegment | null) => void
  isVisible: boolean
}) {
  const colors = TRACK_COLORS[track.type] || TRACK_COLORS.video
  const TrackIcon = TRACK_ICONS[track.type] || Video

  if (!isVisible) return null

  return (
    <div className={`flex ${colors.bg} border-b ${colors.border}`}>
      {/* Track label */}
      <div className={`w-36 flex-shrink-0 flex items-center gap-2 px-3 py-2 border-r ${colors.border}`}>
        <TrackIcon className={`w-3.5 h-3.5 ${colors.text}`} />
        <span className={`text-xs font-semibold ${colors.text} truncate`}>{track.label}</span>
      </div>

      {/* Timeline area */}
      <div
        className="relative h-14 flex-1"
        style={{ width: `${totalDuration * pixelsPerSecond}px`, minWidth: '100%' }}
      >
        {track.segments.map((seg, segIdx) => {
          const left = seg.startTime * pixelsPerSecond
          const width = Math.max((seg.endTime - seg.startTime) * pixelsPerSecond, 20)
          const isSelected = selectedSegment?.trackIndex === trackIndex && selectedSegment?.segmentIndex === segIdx
          const hasImage = track.type === 'video' && seg.generatedMediaUrl
          const hasAudio = track.type === 'narration' && seg.generatedMediaUrl

          return (
            <div
              key={seg.id}
              className={`absolute top-1.5 h-11 rounded-md border cursor-pointer transition-all overflow-hidden
                ${colors.segment}
                ${isSelected ? 'ring-2 ring-offset-1 ring-gray-900 shadow-md' : 'shadow-sm'}
              `}
              style={{ left: `${left}px`, width: `${width}px` }}
              onClick={() => onSelectSegment(isSelected ? null : { trackIndex, segmentIndex: segIdx })}
              title={seg.label}
            >
              {/* Show thumbnail for video segments with generated images */}
              {hasImage ? (
                <div className="flex h-full">
                  <img
                    src={seg.generatedMediaUrl}
                    alt={seg.label}
                    className="h-full w-16 object-cover flex-shrink-0 rounded-l-md"
                  />
                  <div className="px-1.5 py-1 overflow-hidden flex-1 min-w-0">
                    <p className="text-[10px] font-semibold truncate leading-tight">{seg.label}</p>
                  </div>
                </div>
              ) : hasAudio ? (
                <div className="px-1.5 py-1 overflow-hidden h-full flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3 text-violet-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold truncate leading-tight">{seg.label}</p>
                    <p className="text-[9px] text-gray-500 truncate leading-tight mt-0.5">{seg.content.slice(0, 40)}</p>
                  </div>
                </div>
              ) : (
                <div className="px-1.5 py-1 overflow-hidden h-full">
                  <p className="text-[10px] font-semibold truncate leading-tight">{seg.label}</p>
                  <p className="text-[9px] text-gray-500 truncate leading-tight mt-0.5">{seg.content.slice(0, 60)}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Segment Detail Panel ──────────────────────────────────────────────────────

function SegmentDetailPanel({
  segment,
  track,
  onUpdate,
  onDelete,
  onClose,
  onRegenerateMedia,
  isRegenerating,
  regenerateLabel,
  generatedVideoUrl,
}: {
  segment: TrackSegment
  track: VideoTrack
  onUpdate: (updated: TrackSegment) => void
  onDelete: () => void
  onClose: () => void
  onRegenerateMedia?: () => void
  isRegenerating?: boolean
  regenerateLabel?: string
  generatedVideoUrl?: string
}) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(segment.content)
  const [editLabel, setEditLabel] = useState(segment.label)
  const colors = TRACK_COLORS[track.type] || TRACK_COLORS.video

  const handleSave = () => {
    onUpdate({ ...segment, label: editLabel, content: editContent })
    setEditing(false)
  }

  const duration = segment.endTime - segment.startTime
  const startMin = Math.floor(segment.startTime / 60)
  const startSec = segment.startTime % 60
  const endMin = Math.floor(segment.endTime / 60)
  const endSec = segment.endTime % 60

  const hasImage = track.type === 'video' && segment.generatedMediaUrl
  const hasAudio = track.type === 'narration' && segment.generatedMediaUrl
  const hasVideo = track.type === 'video' && Boolean(generatedVideoUrl)

  return (
    <div className={`border rounded-xl ${colors.border} ${colors.bg} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {React.createElement(TRACK_ICONS[track.type] || Video, { className: `w-4 h-4 ${colors.text}` })}
          {editing ? (
            <input
              type="text"
              value={editLabel}
              onChange={e => setEditLabel(e.target.value)}
              className="text-sm font-bold text-gray-900 bg-white border rounded px-2 py-0.5"
            />
          ) : (
            <h4 className="text-sm font-bold text-gray-900">{segment.label}</h4>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-gray-500 bg-white px-2 py-0.5 rounded border">
            {String(startMin).padStart(2, '0')}:{String(Math.floor(startSec)).padStart(2, '0')} →{' '}
            {String(endMin).padStart(2, '0')}:{String(Math.floor(endSec)).padStart(2, '0')}
          </span>
          <span className="text-[10px] text-gray-500 bg-white px-2 py-0.5 rounded border">
            <Clock className="w-3 h-3 inline mr-0.5" />
            {duration}s
          </span>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Generated image preview */}
      {hasVideo && generatedVideoUrl ? (
        <div className="rounded-lg overflow-hidden border border-rose-200 bg-black">
          <video
            src={generatedVideoUrl}
            controls
            className="w-full h-44"
          />
        </div>
      ) : hasImage && (
        <div className="rounded-lg overflow-hidden border border-rose-200">
          <img
            src={segment.generatedMediaUrl}
            alt={segment.label}
            className="w-full h-40 object-cover"
          />
        </div>
      )}

      {/* Generated audio player */}
      {hasAudio && (
        <div className="bg-white rounded-lg p-2.5 border border-violet-200">
          <audio
            controls
            src={segment.generatedMediaUrl}
            className="w-full h-8"
            style={{ height: '32px' }}
          />
        </div>
      )}

      {editing ? (
        <textarea
          value={editContent}
          onChange={e => setEditContent(e.target.value)}
          className="w-full h-32 p-3 bg-white border rounded-lg text-xs font-mono text-gray-700 resize-none focus:ring-2 focus:ring-rose-300 focus:border-rose-300 outline-none"
        />
      ) : (
        <p className="text-xs text-gray-700 leading-relaxed bg-white/50 rounded-lg p-3 border">
          {segment.content || <span className="text-gray-400 italic">Sem conteúdo</span>}
        </p>
      )}

      {segment.metadata && Object.keys(segment.metadata).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(segment.metadata).map(([k, v]) => (
            <span key={k} className="text-[10px] px-2 py-0.5 bg-white rounded-full border">
              <strong>{k}:</strong> {v}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        {editing ? (
          <>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700"
            >
              <Save className="w-3 h-3" />
              Salvar
            </button>
            <button
              onClick={() => { setEditing(false); setEditContent(segment.content); setEditLabel(segment.label) }}
              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-lg"
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 border"
            >
              <Scissors className="w-3 h-3" />
              Editar
            </button>
            {/* Regenerate media button for video/narration tracks */}
            {onRegenerateMedia && (track.type === 'video' || track.type === 'narration') && (
              <button
                onClick={onRegenerateMedia}
                disabled={isRegenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 border border-blue-200 disabled:opacity-50"
              >
                {isRegenerating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : segment.generatedMediaUrl ? (
                  <RefreshCw className="w-3 h-3" />
                ) : regenerateLabel?.includes('Vídeo') ? (
                  <Film className="w-3 h-3" />
                ) : track.type === 'video' ? (
                  <ImagePlus className="w-3 h-3" />
                ) : (
                  <Volume2 className="w-3 h-3" />
                )}
                {regenerateLabel || (segment.generatedMediaUrl
                  ? 'Regenerar'
                  : track.type === 'video' ? 'Gerar Imagem' : 'Gerar Narração')}
              </button>
            )}
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 text-xs font-medium hover:bg-red-50 rounded-lg border border-red-200"
            >
              <X className="w-3 h-3" />
              Remover
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Scene Navigator ───────────────────────────────────────────────────────────

function SceneNavigator({
  scenes,
  selectedScene,
  onSelectScene,
}: {
  scenes: VideoScene[]
  selectedScene: number | null
  onSelectScene: (n: number | null) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const displayScenes = expanded ? scenes : scenes.slice(0, 5)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
          <Film className="w-3.5 h-3.5" />
          Cenas ({scenes.length})
        </h3>
        {scenes.length > 5 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] text-rose-600 hover:underline"
          >
            {expanded ? 'Mostrar menos' : `Mostrar todas (${scenes.length})`}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {displayScenes.map(scene => (
          <button
            key={scene.number}
            onClick={() => onSelectScene(selectedScene === scene.number ? null : scene.number)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all text-xs ${
              selectedScene === scene.number
                ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-200'
                : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <span className="flex items-center justify-center w-6 h-6 rounded bg-gray-900 text-white text-[10px] font-bold flex-shrink-0">
              {scene.number}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 truncate">
                {scene.timeStart} → {scene.timeEnd}
              </p>
              <p className="text-gray-500 truncate">{scene.narration.slice(0, 50)}...</p>
            </div>
            <div className="flex flex-col items-end flex-shrink-0">
              <span className="text-[10px] text-gray-400">
                {scene.duration}s
              </span>
              {scene.clips && scene.clips.length > 0 && (
                <span className="text-[9px] text-rose-400">
                  {scene.clips.filter(c => c.generatedImageUrl).length}/{scene.clips.length} clips
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Design Guide Panel ────────────────────────────────────────────────────────

function DesignGuidePanel({ designGuide }: { designGuide: VideoProductionPackage['designGuide'] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5" />
          Guia de Design
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {open && (
        <div className="p-4 space-y-3 bg-white">
          {/* Color palette */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Paleta de Cores</p>
            <div className="flex gap-2">
              {designGuide.colorPalette.map((color, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-lg border shadow-sm" style={{ backgroundColor: color }} />
                  <span className="text-[9px] font-mono text-gray-400">{color}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Style */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Estilo</p>
            <p className="text-xs text-gray-700">{designGuide.style}</p>
          </div>

          {/* Font */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Fonte</p>
            <p className="text-xs text-gray-700">{designGuide.fontFamily}</p>
          </div>

          {/* Characters */}
          {designGuide.characterDescriptions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Personagens</p>
              <div className="space-y-1.5">
                {designGuide.characterDescriptions.map((char, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2.5 border">
                    <p className="text-xs font-semibold text-gray-900">{char.name}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">{char.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recurring elements */}
          {designGuide.recurringElements.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Elementos Recorrentes</p>
              <div className="flex flex-wrap gap-1.5">
                {designGuide.recurringElements.map((el, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 bg-gray-100 rounded-full border">
                    {el}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

// Import React explicitly for createElement usage in SegmentDetailPanel
import React from 'react'

export default function VideoStudioEditor({
  production,
  onClose,
  onSave,
  onGenerateLiteralMedia,
  onGenerateClipVideo,
  isLiteralGenerating,
  literalProgress,
  onRegenerateImage,
  onRegenerateTTS,
}: VideoStudioEditorProps) {
  const [selectedSegment, setSelectedSegment] = useState<SelectedSegment | null>(null)
  const [selectedScene, setSelectedScene] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [trackVisibility, setTrackVisibility] = useState<Record<string, boolean>>(() => {
    const vis: Record<string, boolean> = {}
    production.tracks.forEach(t => { vis[t.type] = true })
    return vis
  })
  const [localTracks, setLocalTracks] = useState<VideoTrack[]>(production.tracks)
  const [localScenes, setLocalScenes] = useState(production.scenes)
  const [localNarration, setLocalNarration] = useState(production.narration)
  const [localSceneAssets, setLocalSceneAssets] = useState(production.sceneAssets || [])
  const [qualityOpen, setQualityOpen] = useState(false)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)
  const autosaveTimerRef = useRef<number | null>(null)
  const lastSavedSnapshotRef = useRef('')

  const productionSnapshot = useMemo(
    () => JSON.stringify({ tracks: production.tracks, scenes: production.scenes, narration: production.narration, sceneAssets: production.sceneAssets || [] }),
    [production.narration, production.scenes, production.sceneAssets, production.tracks],
  )

  const localSnapshot = useMemo(
    () => JSON.stringify({ tracks: localTracks, scenes: localScenes, narration: localNarration, sceneAssets: localSceneAssets }),
    [localNarration, localSceneAssets, localScenes, localTracks],
  )

  const isDirty = localSnapshot !== productionSnapshot

  useEffect(() => {
    if (isDirty && productionSnapshot !== lastSavedSnapshotRef.current) return
    setLocalTracks(production.tracks)
    setLocalScenes(production.scenes)
    setLocalNarration(production.narration)
    setLocalSceneAssets(production.sceneAssets || [])
    lastSavedSnapshotRef.current = productionSnapshot
  }, [isDirty, production, productionSnapshot])

  useEffect(() => {
    lastSavedSnapshotRef.current = productionSnapshot
  }, [productionSnapshot])

  const pixelsPerSecond = PIXELS_PER_SECOND_BASE * zoom
  const totalDuration = production.totalDuration || 600

  const toggleTrackVisibility = useCallback((type: string) => {
    setTrackVisibility(prev => ({ ...prev, [type]: !prev[type] }))
  }, [])

  const handleUpdateSegment = useCallback((trackIdx: number, segIdx: number, updated: TrackSegment) => {
    setLocalTracks(prev => {
      const next = [...prev]
      const track = { ...next[trackIdx], segments: [...next[trackIdx].segments] }
      track.segments[segIdx] = updated
      next[trackIdx] = track
      return next
    })
  }, [])

  const handleDeleteSegment = useCallback((trackIdx: number, segIdx: number) => {
    setLocalTracks(prev => {
      const next = [...prev]
      const track = { ...next[trackIdx], segments: [...next[trackIdx].segments] }
      track.segments.splice(segIdx, 1)
      next[trackIdx] = track
      return next
    })
    setSelectedSegment(null)
  }, [])

  const handleAddSegment = useCallback((trackIdx: number) => {
    setLocalTracks(prev => {
      const next = [...prev]
      const track = { ...next[trackIdx], segments: [...next[trackIdx].segments] }
      const lastEnd = track.segments.length > 0 ? Math.max(...track.segments.map(s => s.endTime)) : 0
      const newSeg: TrackSegment = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        startTime: lastEnd,
        endTime: Math.min(lastEnd + 30, totalDuration),
        label: 'Novo Segmento',
        content: '',
      }
      track.segments.push(newSeg)
      next[trackIdx] = track
      return next
    })
  }, [totalDuration])

  const buildCurrentProduction = useCallback((): VideoProductionPackage => ({
    ...production,
    tracks: localTracks,
    scenes: localScenes,
    narration: localNarration,
    sceneAssets: localSceneAssets,
  }), [localNarration, localSceneAssets, localScenes, localTracks, production])

  const handleSave = useCallback(async () => {
    if (onSave) {
      lastSavedSnapshotRef.current = localSnapshot
      await onSave(buildCurrentProduction())
    }
  }, [buildCurrentProduction, localSnapshot, onSave])

  const handleGenerateLiteral = useCallback(async () => {
    if (!onGenerateLiteralMedia || isLiteralGenerating) return
    const nextProduction = buildCurrentProduction()
    if (onSave && isDirty) {
      lastSavedSnapshotRef.current = localSnapshot
      await onSave(nextProduction)
    }
    await onGenerateLiteralMedia(nextProduction)
  }, [buildCurrentProduction, isDirty, isLiteralGenerating, localSnapshot, onGenerateLiteralMedia, onSave])

  const handleClose = useCallback(async () => {
    if (isDirty && onSave) {
      await handleSave()
    }
    onClose()
  }, [handleSave, isDirty, onClose, onSave])

  useEffect(() => {
    if (!onSave || !isDirty || isLiteralGenerating) return
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      setIsAutoSaving(true)
      Promise.resolve(handleSave()).finally(() => {
        setIsAutoSaving(false)
      })
    }, 1200)

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [handleSave, isDirty, isLiteralGenerating, onSave])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  // Handle media regeneration for a specific segment
  const handleRegenerateMedia = useCallback(async (trackType: string, sceneNumber: number | undefined, clipNumber?: number) => {
    if (!sceneNumber) return
    const regenId = clipNumber ? `${trackType}_${sceneNumber}_${clipNumber}` : `${trackType}_${sceneNumber}`
    setRegeneratingId(regenId)

    try {
      if (trackType === 'video' && clipNumber && onGenerateClipVideo) {
        const updatedProduction = await onGenerateClipVideo(buildCurrentProduction(), sceneNumber, clipNumber)
        if (updatedProduction) {
          setLocalSceneAssets(updatedProduction.sceneAssets || [])
        }
      } else if (trackType === 'video' && onRegenerateImage) {
        const newImageUrl = await onRegenerateImage(sceneNumber)
        if (newImageUrl) {
          // Update local scenes
          setLocalScenes(prev => prev.map(s =>
            s.number === sceneNumber ? { ...s, generatedImageUrl: newImageUrl } : s
          ))
          // Update video track segment
          setLocalTracks(prev => prev.map(t => {
            if (t.type !== 'video') return t
            return {
              ...t,
              segments: t.segments.map(seg =>
                seg.sceneNumber === sceneNumber ? { ...seg, generatedMediaUrl: newImageUrl } : seg
              ),
            }
          }))
        }
      } else if (trackType === 'narration' && onRegenerateTTS) {
        const newAudioUrl = await onRegenerateTTS(sceneNumber)
        if (newAudioUrl) {
          // Update local narration
          setLocalNarration(prev => prev.map(n =>
            n.sceneNumber === sceneNumber ? { ...n, generatedAudioUrl: newAudioUrl } : n
          ))
          // Update narration track segment
          setLocalTracks(prev => prev.map(t => {
            if (t.type !== 'narration') return t
            return {
              ...t,
              segments: t.segments.map(seg =>
                seg.sceneNumber === sceneNumber ? { ...seg, generatedMediaUrl: newAudioUrl } : seg
              ),
            }
          }))
        }
      }
    } finally {
      setRegeneratingId(null)
    }
  }, [buildCurrentProduction, onGenerateClipVideo, onRegenerateImage, onRegenerateTTS])

  // Get selected segment data
  const selectedSeg = selectedSegment
    ? localTracks[selectedSegment.trackIndex]?.segments[selectedSegment.segmentIndex]
    : null
  const selectedTrack = selectedSegment
    ? localTracks[selectedSegment.trackIndex]
    : null
  const selectedClipAsset = selectedTrack?.type === 'video' && selectedSeg?.sceneNumber && selectedSeg?.clipNumber
    ? localSceneAssets
      .find(item => item.sceneNumber === selectedSeg.sceneNumber)
      ?.videoClips?.find(item => item.partNumber === selectedSeg.clipNumber)
    : undefined

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-rose-600 rounded-lg">
            <Video className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white truncate max-w-md">
              {production.title}
            </h1>
            <p className="text-[10px] text-gray-400">
              {localScenes.length} cenas · {Math.floor(totalDuration / 60)}:{String(totalDuration % 60).padStart(2, '0')} min
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {isAutoSaving ? 'Salvando alterações...' : isDirty ? 'Alterações pendentes' : 'Tudo salvo'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onGenerateLiteralMedia && (
            <button
              onClick={() => {
                void handleGenerateLiteral()
              }}
              disabled={isLiteralGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white text-xs font-medium rounded-lg hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLiteralGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
              {production.literalGenerationState?.status === 'failed' || production.literalGenerationState?.status === 'running'
                ? 'Retomar Vídeo Literal'
                : 'Gerar Vídeo Literal'}
            </button>
          )}

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-1">
            <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="p-0.5 hover:bg-gray-700 rounded">
              <ZoomOut className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <span className="text-[10px] text-gray-400 font-mono min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="p-0.5 hover:bg-gray-700 rounded">
              <ZoomIn className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>

          {onSave && (
            <button
              onClick={() => {
                void handleSave()
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar
            </button>
          )}

          <button
            onClick={() => {
              void handleClose()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 text-gray-300 text-xs font-medium rounded-lg hover:bg-gray-600"
          >
            <X className="w-3.5 h-3.5" />
            Fechar
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Scenes + Design Guide */}
        <div className="w-72 bg-white border-r border-gray-200 overflow-y-auto p-4 space-y-4 flex-shrink-0">
          {literalProgress && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-700">
                {isLiteralGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
                {literalProgress.agent}
              </div>
              <p className="mt-1 text-[11px] text-rose-800">{literalProgress.phase}</p>
              <p className="mt-1 text-[10px] text-rose-500">Etapa {literalProgress.step} de {literalProgress.total}</p>
            </div>
          )}

          <SceneNavigator
            scenes={localScenes}
            selectedScene={selectedScene}
            onSelectScene={setSelectedScene}
          />

          <DesignGuidePanel designGuide={production.designGuide} />

          {/* Quality Report */}
          <div className="border rounded-xl overflow-hidden">
            <button
              onClick={() => setQualityOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                Relatório de Qualidade
              </span>
              {qualityOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
            </button>
            {qualityOpen && (
              <div className="p-4 bg-white">
                <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {production.qualityReport}
                </p>
              </div>
            )}
          </div>

          {/* Production Notes */}
          {production.productionNotes.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Notas de Produção
              </h3>
              {production.productionNotes.map((note, i) => (
                <p key={i} className="text-[10px] text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border">
                  {note}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Center - Timeline */}
        <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
          {/* Track visibility toggles */}
          <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mr-2">Faixas:</span>
            {localTracks.map((track) => {
              const colors = TRACK_COLORS[track.type] || TRACK_COLORS.video
              const isVisible = trackVisibility[track.type] !== false
              return (
                <button
                  key={track.type}
                  onClick={() => toggleTrackVisibility(track.type)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${
                    isVisible
                      ? `${colors.segment} ${colors.text}`
                      : 'bg-gray-100 text-gray-400 border-gray-200'
                  }`}
                >
                  {isVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {track.label}
                </button>
              )
            })}
          </div>

          {/* Timeline */}
          <div className="flex-1 overflow-auto" ref={timelineRef}>
            <TimelineRuler totalDuration={totalDuration} pixelsPerSecond={pixelsPerSecond} />

            {localTracks.map((track, trackIdx) => (
              <TrackRow
                key={track.type}
                track={track}
                trackIndex={trackIdx}
                totalDuration={totalDuration}
                pixelsPerSecond={pixelsPerSecond}
                selectedSegment={selectedSegment}
                onSelectSegment={setSelectedSegment}
                isVisible={trackVisibility[track.type] !== false}
              />
            ))}
          </div>

          {/* Add segment buttons */}
          <div className="flex items-center gap-2 px-4 py-2 bg-white border-t border-gray-200 flex-shrink-0">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mr-2">Adicionar:</span>
            {localTracks.map((track, idx) => {
              const colors = TRACK_COLORS[track.type] || TRACK_COLORS.video
              return (
                <button
                  key={track.type}
                  onClick={() => handleAddSegment(idx)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border hover:shadow-sm transition-all ${colors.segment} ${colors.text}`}
                >
                  <Plus className="w-3 h-3" />
                  {track.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right sidebar - Segment details */}
        <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto p-4 flex-shrink-0">
          {selectedSeg && selectedTrack ? (
            <SegmentDetailPanel
              segment={selectedSeg}
              track={selectedTrack}
              onUpdate={(updated) => handleUpdateSegment(selectedSegment!.trackIndex, selectedSegment!.segmentIndex, updated)}
              onDelete={() => handleDeleteSegment(selectedSegment!.trackIndex, selectedSegment!.segmentIndex)}
              onClose={() => setSelectedSegment(null)}
              onRegenerateMedia={
                (selectedTrack.type === 'video' || selectedTrack.type === 'narration') && selectedSeg.sceneNumber
                  ? () => handleRegenerateMedia(selectedTrack.type, selectedSeg.sceneNumber, selectedSeg.clipNumber)
                  : undefined
              }
              isRegenerating={regeneratingId === (selectedSeg.clipNumber ? `${selectedTrack.type}_${selectedSeg.sceneNumber}_${selectedSeg.clipNumber}` : `${selectedTrack.type}_${selectedSeg.sceneNumber}`)}
              regenerateLabel={selectedTrack.type === 'video'
                ? (selectedSeg.clipNumber ? (selectedClipAsset?.url ? 'Regenerar Vídeo' : 'Gerar Vídeo') : (selectedSeg.generatedMediaUrl ? 'Regenerar Imagem' : 'Gerar Imagem'))
                : (selectedSeg.generatedMediaUrl ? 'Regenerar Narração' : 'Gerar Narração')}
              generatedVideoUrl={selectedClipAsset?.url}
            />
          ) : selectedScene ? (
            /* Scene detail view with clips */
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Camera className="w-4 h-4 text-rose-600" />
                Cena {selectedScene}
              </h3>
              {(() => {
                const scene = localScenes.find(s => s.number === selectedScene)
                if (!scene) return <p className="text-xs text-gray-400">Cena não encontrada</p>
                const narSeg = localNarration.find(n => n.sceneNumber === selectedScene)
                const clips = scene.clips || []
                const sceneAsset = localSceneAssets.find(item => item.sceneNumber === selectedScene)
                const generatedClipAssets = sceneAsset?.videoClips || []
                const clipsWithVideo = generatedClipAssets.filter(c => Boolean(c.url))

                return (
                  <div className="space-y-3">
                    {/* Clips grid — the core visual sequence */}
                    {clips.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
                          <Film className="w-3 h-3" />
                          Clips ({clipsWithVideo.length}/{clips.length} vídeos gerados)
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {clips.map(clip => {
                            const clipAsset = generatedClipAssets.find(item => item.partNumber === clip.clipNumber)
                            const clipRegenId = `video_${scene.number}_${clip.clipNumber}`

                            return (
                              <div
                                key={`clip_${clip.sceneNumber}_${clip.clipNumber}`}
                                className="border rounded-lg overflow-hidden bg-white hover:shadow-sm transition-shadow"
                              >
                                {clipAsset?.url ? (
                                  <video
                                    src={clipAsset.url}
                                    className="w-full h-20 object-cover bg-black"
                                    muted
                                    controls
                                    playsInline
                                  />
                                ) : clip.generatedImageUrl ? (
                                  <img
                                    src={clip.generatedImageUrl}
                                    alt={`Cena ${clip.sceneNumber} Clip ${clip.clipNumber}`}
                                    className="w-full h-20 object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-20 bg-gray-100 flex items-center justify-center">
                                    <Film className="w-4 h-4 text-gray-300" />
                                  </div>
                                )}
                                <div className="px-1.5 py-1">
                                  <p className="text-[9px] font-semibold text-gray-700">
                                    Clip {clip.clipNumber} · {clip.duration}s
                                  </p>
                                  <p className="text-[8px] text-gray-400 truncate" title={clip.description}>
                                    {clip.description.slice(0, 60)}
                                  </p>
                                  {clip.motionDescription && (
                                    <p className="text-[8px] text-rose-400 truncate mt-0.5">
                                      🎬 {clip.motionDescription}
                                    </p>
                                  )}
                                </div>
                                {onGenerateClipVideo && (
                                  <button
                                    onClick={() => handleRegenerateMedia('video', scene.number, clip.clipNumber)}
                                    disabled={Boolean(regeneratingId)}
                                    className="w-full flex items-center justify-center gap-1 py-1 text-[9px] text-rose-600 hover:bg-rose-50 border-t disabled:opacity-40"
                                  >
                                    {regeneratingId === clipRegenId ? (
                                      <><Loader2 className="w-2.5 h-2.5 animate-spin" /> Gerando vídeo</>
                                    ) : clipAsset?.url ? (
                                      <><RefreshCw className="w-2.5 h-2.5" /> Regenerar Vídeo</>
                                    ) : (
                                      <><Film className="w-2.5 h-2.5" /> Gerar Vídeo</>
                                    )}
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Scene thumbnail (first clip) when no clips */}
                    {clips.length === 0 && scene.generatedImageUrl && (
                      <div className="rounded-lg overflow-hidden border border-rose-200">
                        <img
                          src={scene.generatedImageUrl}
                          alt={`Cena ${scene.number}`}
                          className="w-full h-44 object-cover"
                        />
                      </div>
                    )}

                    {/* Generated narration audio */}
                    {narSeg?.generatedAudioUrl && (
                      <div className="bg-violet-50 rounded-lg p-2.5 border border-violet-200">
                        <p className="text-[10px] font-semibold text-violet-600 uppercase mb-1.5">Narração Gerada</p>
                        <audio
                          controls
                          src={narSeg.generatedAudioUrl}
                          className="w-full"
                          style={{ height: '32px' }}
                        />
                      </div>
                    )}

                    {/* Regenerate TTS button */}
                    {onRegenerateTTS && (
                      <button
                        onClick={() => handleRegenerateMedia('narration', scene.number)}
                        disabled={regeneratingId === `narration_${scene.number}`}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-50 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-100 border border-violet-200 disabled:opacity-50"
                      >
                        {regeneratingId === `narration_${scene.number}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : narSeg?.generatedAudioUrl ? (
                          <RefreshCw className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                        {narSeg?.generatedAudioUrl ? 'Regenerar Narração' : 'Gerar Narração'}
                      </button>
                    )}

                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Timing</p>
                      <p className="text-xs text-gray-700">
                        {scene.timeStart} → {scene.timeEnd} ({scene.duration}s)
                        {clips.length > 0 && (
                          <span className="text-gray-400 ml-1">· {clips.length} clips</span>
                        )}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Visual</p>
                      <p className="text-xs text-gray-700 leading-relaxed">{scene.visual}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Narração</p>
                      <p className="text-xs text-gray-700 leading-relaxed">{scene.narration}</p>
                    </div>
                    {scene.transition && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full border border-purple-200">
                          Transição: {scene.transition}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <Layers className="w-8 h-8 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-500">Selecione um segmento</p>
              <p className="text-xs text-gray-400 mt-1">
                Clique em um segmento na timeline ou em uma cena para ver os detalhes
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

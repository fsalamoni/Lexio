/**
 * VideoStudioEditor — timeline-based video studio editor that displays all
 * production tracks (video, narration, music, SFX, overlays) and allows
 * the user to edit, cut, extend, and create new segments.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Video, Mic, Music, Sparkles, Type, Clock, Plus,
  Scissors, ChevronDown, ChevronUp, Palette, Eye, EyeOff,
  Camera, Layers, X, Save, ZoomIn, ZoomOut,
  Film, CheckCircle2, Image, Loader2, Volume2, BookOpen,
} from 'lucide-react'
import type {
  VideoProductionPackage,
  VideoTrack,
  TrackSegment,
  VideoScene,
} from '../../lib/video-generation-pipeline'
import { generateImageViaOpenRouter } from '../../lib/image-generation-client'
import { generateTTSViaOpenRouter } from '../../lib/tts-client'
import { useToast } from '../Toast'

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
  apiKey?: string
  onClose: () => void
  onSave?: (production: VideoProductionPackage) => void
  onSaveToNotebook?: (production: VideoProductionPackage) => void | Promise<void>
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

          return (
            <div
              key={seg.id}
              className={`absolute top-1.5 h-11 rounded-md border cursor-pointer transition-all
                ${colors.segment}
                ${isSelected ? 'ring-2 ring-offset-1 ring-gray-900 shadow-md' : 'shadow-sm'}
              `}
              style={{ left: `${left}px`, width: `${width}px` }}
              onClick={() => onSelectSegment(isSelected ? null : { trackIndex, segmentIndex: segIdx })}
              title={seg.label}
            >
              <div className="px-1.5 py-1 overflow-hidden h-full">
                <p className="text-[10px] font-semibold truncate leading-tight">{seg.label}</p>
                <p className="text-[9px] text-gray-500 truncate leading-tight mt-0.5">{seg.content.slice(0, 60)}</p>
              </div>
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
}: {
  segment: TrackSegment
  track: VideoTrack
  onUpdate: (updated: TrackSegment) => void
  onDelete: () => void
  onClose: () => void
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
            <span className="text-[10px] text-gray-400 flex-shrink-0">
              {scene.duration}s
            </span>
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

export default function VideoStudioEditor({ production, apiKey, onClose, onSave, onSaveToNotebook }: VideoStudioEditorProps) {
  const toast = useToast()
  const [selectedSegment, setSelectedSegment] = useState<SelectedSegment | null>(null)
  const [selectedScene, setSelectedScene] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [trackVisibility, setTrackVisibility] = useState<Record<string, boolean>>(() => {
    const vis: Record<string, boolean> = {}
    production.tracks.forEach(t => { vis[t.type] = true })
    return vis
  })
  const [localTracks, setLocalTracks] = useState<VideoTrack[]>(production.tracks)
  const [qualityOpen, setQualityOpen] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)

  // Media generation state
  const [generatedImages, setGeneratedImages] = useState<Record<number, string>>({})
  const [generatingImageFor, setGeneratingImageFor] = useState<number | null>(null)
  const [imageError, setImageError] = useState<Record<number, string>>({})

  const [generatedAudio, setGeneratedAudio] = useState<Record<number, string>>({})
  const [generatingAudioFor, setGeneratingAudioFor] = useState<number | null>(null)
  const [audioError, setAudioError] = useState<Record<number, string>>({})

  const [savingToNotebook, setSavingToNotebook] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      Object.values(generatedAudio).forEach(url => {
        try { URL.revokeObjectURL(url) } catch { /* ignore */ }
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    setHasUnsavedChanges(true)
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
    setHasUnsavedChanges(true)
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
    setHasUnsavedChanges(true)
  }, [totalDuration])

  const handleSave = useCallback(() => {
    if (onSave) {
      setSaving(true)
      onSave({ ...production, tracks: localTracks })
      setHasUnsavedChanges(false)
      setSaving(false)
    }
  }, [onSave, production, localTracks])

  const handleSaveToNotebook = useCallback(async () => {
    if (!onSaveToNotebook) return
    setSavingToNotebook(true)
    try {
      await onSaveToNotebook({ ...production, tracks: localTracks })
      setHasUnsavedChanges(false)
    } finally {
      setSavingToNotebook(false)
    }
  }, [onSaveToNotebook, production, localTracks])

  const handleCloseRequest = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowCloseConfirm(true)
    } else {
      onClose()
    }
  }, [hasUnsavedChanges, onClose])

  const handleConfirmClose = useCallback(async () => {
    // Auto-save to notebook before closing if possible
    if (onSaveToNotebook) {
      setSavingToNotebook(true)
      try {
        await onSaveToNotebook({ ...production, tracks: localTracks })
      } catch { /* ignore save error on close */ }
      setSavingToNotebook(false)
    }
    setShowCloseConfirm(false)
    onClose()
  }, [onSaveToNotebook, onClose, production, localTracks])

  const handleDiscardClose = useCallback(() => {
    setShowCloseConfirm(false)
    onClose()
  }, [onClose])

  // ── Image generation per scene ────────────────────────────────────────────
  const handleGenerateImage = useCallback(async (scene: VideoScene) => {
    if (!apiKey || !scene.imagePrompt || generatingImageFor !== null) return
    setGeneratingImageFor(scene.number)
    setImageError(prev => ({ ...prev, [scene.number]: '' }))
    try {
      const result = await generateImageViaOpenRouter({
        apiKey,
        prompt: scene.imagePrompt,
        size: '1792x1024',
      })
      if (result.url) {
        setGeneratedImages(prev => ({ ...prev, [scene.number]: result.url! }))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar imagem'
      setImageError(prev => ({ ...prev, [scene.number]: msg }))
      toast.error('Falha ao gerar imagem', msg.length > 80 ? msg.slice(0, 80) + '...' : msg)
    } finally {
      setGeneratingImageFor(null)
    }
  }, [apiKey, generatingImageFor])

  // ── TTS generation per narration segment ─────────────────────────────────
  const handleGenerateNarration = useCallback(async (sceneNumber: number, text: string) => {
    if (!apiKey || !text || generatingAudioFor !== null) return
    // Revoke previous blob URL to prevent memory leak
    if (generatedAudio[sceneNumber]) {
      try { URL.revokeObjectURL(generatedAudio[sceneNumber]) } catch { /* ignore */ }
    }
    setGeneratingAudioFor(sceneNumber)
    setAudioError(prev => ({ ...prev, [sceneNumber]: '' }))
    try {
      const result = await generateTTSViaOpenRouter({
        apiKey,
        text,
        voice: 'nova',
        model: 'openai/tts-1-hd',
      })
      const url = URL.createObjectURL(result.audioBlob)
      setGeneratedAudio(prev => ({ ...prev, [sceneNumber]: url }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar narração'
      setAudioError(prev => ({ ...prev, [sceneNumber]: msg }))
      toast.error('Falha ao gerar narração', msg.length > 80 ? msg.slice(0, 80) + '...' : msg)
    } finally {
      setGeneratingAudioFor(null)
    }
  }, [apiKey, generatingAudioFor, generatedAudio])

  // Get selected segment data
  const selectedSeg = selectedSegment
    ? localTracks[selectedSegment.trackIndex]?.segments[selectedSegment.segmentIndex]
    : null
  const selectedTrack = selectedSegment
    ? localTracks[selectedSegment.trackIndex]
    : null

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
              {hasUnsavedChanges && <span className="ml-2 text-amber-400 text-[10px] font-normal">● não salvo</span>}
            </h1>
            <p className="text-[10px] text-gray-400">
              {production.scenes.length} cenas · {Math.floor(totalDuration / 60)}:{String(totalDuration % 60).padStart(2, '0')} min
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-60"
            >
              {saving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Save className="w-3.5 h-3.5" />}
              Salvar
            </button>
          )}

          {onSaveToNotebook && (
            <button
              onClick={handleSaveToNotebook}
              disabled={savingToNotebook}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {savingToNotebook
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <BookOpen className="w-3.5 h-3.5" />}
              Salvar no Caderno
            </button>
          )}

          <button
            onClick={handleCloseRequest}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 text-gray-300 text-xs font-medium rounded-lg hover:bg-gray-600"
          >
            <X className="w-3.5 h-3.5" />
            Fechar
          </button>
        </div>
      </div>

      {/* Unsaved changes confirmation dialog */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Alterações não salvas</h3>
            <p className="text-sm text-gray-600 mb-6">
              Você tem alterações que ainda não foram salvas no caderno. O que deseja fazer?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDiscardClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Descartar e fechar
              </button>
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Voltar ao estúdio
              </button>
              <button
                onClick={handleConfirmClose}
                disabled={savingToNotebook}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {savingToNotebook ? 'Salvando...' : 'Salvar e fechar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Scenes + Design Guide */}
        <div className="w-72 bg-white border-r border-gray-200 overflow-y-auto p-4 space-y-4 flex-shrink-0">
          <SceneNavigator
            scenes={production.scenes}
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
            />
          ) : selectedScene ? (
            /* Scene detail view */
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Camera className="w-4 h-4 text-rose-600" />
                Cena {selectedScene}
              </h3>
              {(() => {
                const scene = production.scenes.find(s => s.number === selectedScene)
                if (!scene) return <p className="text-xs text-gray-400">Cena não encontrada</p>
                const sceneImage = generatedImages[scene.number]
                const sceneAudio = generatedAudio[scene.number]
                const isGeneratingImage = generatingImageFor === scene.number
                const isGeneratingAudio = generatingAudioFor === scene.number
                return (
                  <div className="space-y-3">
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Timing</p>
                      <p className="text-xs text-gray-700">{scene.timeStart} → {scene.timeEnd} ({scene.duration}s)</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Visual</p>
                      <p className="text-xs text-gray-700 leading-relaxed">{scene.visual}</p>
                    </div>

                    {/* Narration + TTS generation */}
                    <div className="bg-violet-50 rounded-lg p-3 border border-violet-200 space-y-2">
                      <p className="text-[10px] font-semibold text-violet-600 uppercase">Narração</p>
                      <p className="text-xs text-gray-700 leading-relaxed">{scene.narration}</p>
                      {apiKey && scene.narration && (
                        <button
                          onClick={() => handleGenerateNarration(scene.number, scene.narration)}
                          disabled={isGeneratingAudio}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 disabled:opacity-60 mt-1"
                        >
                          {isGeneratingAudio
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Mic className="w-3 h-3" />}
                          {isGeneratingAudio ? 'Gerando...' : 'Gerar Narração (TTS)'}
                        </button>
                      )}
                      {audioError[scene.number] && (
                        <p className="text-[10px] text-red-600">{audioError[scene.number]}</p>
                      )}
                      {sceneAudio && (
                        <div className="mt-1">
                          <p className="text-[10px] font-semibold text-violet-600 mb-1 flex items-center gap-1">
                            <Volume2 className="w-3 h-3" /> Narração Gerada
                          </p>
                          <audio controls src={sceneAudio} className="w-full h-8" />
                        </div>
                      )}
                    </div>

                    {/* Image prompt + generation */}
                    {scene.imagePrompt && (
                      <div className="bg-rose-50 rounded-lg p-3 border border-rose-200 space-y-2">
                        <p className="text-[10px] font-semibold text-rose-600 uppercase">Prompt de Imagem</p>
                        <p className="text-xs text-gray-600 leading-relaxed font-mono">{scene.imagePrompt}</p>
                        {apiKey && (
                          <button
                            onClick={() => handleGenerateImage(scene)}
                            disabled={isGeneratingImage}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white text-xs font-medium rounded-lg hover:bg-rose-700 disabled:opacity-60 mt-1"
                          >
                            {isGeneratingImage
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Image className="w-3 h-3" />}
                            {isGeneratingImage ? 'Gerando...' : 'Gerar Imagem (DALL-E)'}
                          </button>
                        )}
                        {imageError[scene.number] && (
                          <p className="text-[10px] text-red-600">{imageError[scene.number]}</p>
                        )}
                        {sceneImage && (
                          <div className="mt-1">
                            <p className="text-[10px] font-semibold text-rose-600 mb-1">Imagem Gerada</p>
                            <img
                              src={sceneImage}
                              alt={`Cena ${scene.number}`}
                              className="w-full rounded-lg border shadow-sm"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {scene.videoPrompt && (
                      <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                        <p className="text-[10px] font-semibold text-amber-600 uppercase mb-1">Prompt de Vídeo</p>
                        <p className="text-xs text-gray-700 leading-relaxed font-mono">{scene.videoPrompt}</p>
                      </div>
                    )}
                    {scene.transition && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full border border-purple-200">
                          Transição: {scene.transition}
                        </span>
                      </div>
                    )}
                    {scene.soundtrack && (
                      <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                        <p className="text-[10px] font-semibold text-emerald-600 uppercase mb-1 flex items-center gap-1">
                          <Music className="w-3 h-3" /> Trilha Sonora
                        </p>
                        <p className="text-xs text-gray-700 leading-relaxed">{scene.soundtrack}</p>
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

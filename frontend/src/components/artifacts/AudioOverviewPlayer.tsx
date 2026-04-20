/**
 * AudioOverviewPlayer — podcast-style player for Audio Overview feature.
 * Shows the script with synchronized highlighting and audio playback controls.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Mic, Loader2, Download, Clock,
} from 'lucide-react'
import type { AudioSegment } from './artifact-parsers'

// ── Types ───────────────────────────────────────────────────────────────────

interface AudioOverviewPlayerProps {
  title: string
  duration: string
  segments: AudioSegment[]
  audioBlob?: Blob | null
  onGenerateAudio?: () => void
  isGeneratingAudio?: boolean
}

// ── Segment type colors ─────────────────────────────────────────────────────

const SEGMENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  narracao:   { bg: 'bg-white', border: 'border-gray-200', text: 'text-gray-800' },
  transicao:  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  vinheta:    { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700' },
  efeito:     { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  musica:     { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  pausa:      { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-500' },
}

const SPEAKER_COLORS: Record<string, string> = {
  'Host A': 'text-blue-600',
  'Host B': 'text-emerald-600',
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function AudioOverviewPlayer({
  title,
  duration,
  segments,
  audioBlob,
  onGenerateAudio,
  isGeneratingAudio,
}: AudioOverviewPlayerProps) {
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([])

  // Create audio URL from blob
  const audioUrl = useMemo(() => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    if (!audioBlob || audioBlob.size === 0) return null
    const url = URL.createObjectURL(audioBlob)
    audioUrlRef.current = url
    return url
  }, [audioBlob])

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    }
  }, [])

  // Scroll active segment into view
  useEffect(() => {
    if (activeIndex >= 0 && segmentRefs.current[activeIndex]) {
      segmentRefs.current[activeIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeIndex])

  const handlePlay = useCallback(() => {
    if (audioRef.current && audioUrl) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }, [isPlaying, audioUrl])

  const handleSpeedChange = useCallback(() => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2]
    const currentIdx = speeds.indexOf(playbackSpeed)
    const nextSpeed = speeds[(currentIdx + 1) % speeds.length]
    setPlaybackSpeed(nextSpeed)
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed
  }, [playbackSpeed])

  const handleDownload = useCallback(() => {
    if (!audioBlob) return
    const url = URL.createObjectURL(audioBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_podcast.mp3`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [audioBlob, title])

  const narrationSegments = segments.filter(s => s.type === 'narracao')
  const hostACount = narrationSegments.filter(s => s.speaker === 'Host A').length
  const hostBCount = narrationSegments.filter(s => s.speaker === 'Host B').length

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Mic className="w-6 h-6" style={{ color: 'var(--v2-accent-strong)' }} />
          <h2 className="text-xl font-bold" style={{ color: 'var(--v2-ink-strong)' }}>{title}</h2>
        </div>
        <div className="flex items-center justify-center gap-4 text-sm" style={{ color: 'var(--v2-ink-faint)' }}>
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {duration}</span>
          <span>{segments.length} segmentos</span>
          <span className="text-blue-600">Host A: {hostACount}</span>
          <span className="text-emerald-600">Host B: {hostBCount}</span>
        </div>
      </div>

      {/* Audio Player */}
      {audioUrl ? (
        <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg, var(--v2-accent-strong), #0891b2)' }}>
          <audio
            ref={audioRef}
            src={audioUrl}
            onEnded={() => setIsPlaying(false)}
            muted={isMuted}
          />
          <div className="flex items-center gap-4">
            <button onClick={handlePlay} className="p-3 bg-white/20 rounded-full hover:bg-white/30 transition-colors">
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <div className="flex-1">
              <p className="text-sm font-medium opacity-90">{title}</p>
              <p className="text-xs opacity-60">{duration}</p>
            </div>
            <button onClick={handleSpeedChange} className="px-2 py-1 bg-white/20 rounded text-xs font-bold hover:bg-white/30">
              {playbackSpeed}x
            </button>
            <button onClick={() => setIsMuted(m => !m)} className="p-2 hover:bg-white/20 rounded-full">
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button onClick={handleDownload} className="p-2 hover:bg-white/20 rounded-full" title="Download MP3">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-2xl p-6 text-center">
          {onGenerateAudio ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                O roteiro está pronto. Gere o áudio para ouvir como podcast.
              </p>
              <button
                onClick={onGenerateAudio}
                disabled={isGeneratingAudio}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium text-sm disabled:opacity-60"
              >
                {isGeneratingAudio ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Gerando áudio...</>
                ) : (
                  <><Mic className="w-4 h-4" /> Gerar Áudio (TTS)</>
                )}
              </button>
              <p className="text-xs text-gray-400">Requer modelo TTS configurado (ex: openai/tts-1-hd)</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Áudio não disponível para este roteiro.</p>
          )}
        </div>
      )}

      {/* Transcript / Script */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>Transcrição</h3>
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-2">
          {segments.map((seg, i) => {
            const colors = SEGMENT_COLORS[seg.type] || SEGMENT_COLORS.narracao
            const speakerColor = seg.speaker ? (SPEAKER_COLORS[seg.speaker] || 'text-gray-600') : ''
            const isActive = i === activeIndex

            return (
              <div
                key={i}
                ref={el => { segmentRefs.current[i] = el }}
                onClick={() => setActiveIndex(i === activeIndex ? -1 : i)}
                className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-all ${colors.bg} ${colors.border} ${
                  isActive ? 'ring-2 ring-teal-500 shadow-sm' : 'hover:shadow-sm'
                }`}
              >
                {/* Time badge */}
                <span className="flex-shrink-0 text-[10px] font-mono text-gray-400 pt-1 w-10 text-right">
                  {seg.time}
                </span>

                <div className="flex-1 min-w-0">
                  {/* Speaker */}
                  {seg.speaker && (
                    <span className={`text-xs font-bold ${speakerColor}`}>{seg.speaker}</span>
                  )}
                  {/* Type badge for non-narration */}
                  {seg.type !== 'narracao' && (
                    <span className={`text-[10px] font-medium uppercase tracking-wider ${colors.text} ml-1`}>
                      [{seg.type}]
                    </span>
                  )}
                  {/* Text */}
                  <p className={`text-sm leading-relaxed mt-0.5 ${seg.type === 'narracao' ? 'text-gray-800' : colors.text}`}>
                    {seg.text}
                  </p>
                  {/* Notes */}
                  {seg.notes && (
                    <p className="text-[10px] text-gray-400 mt-1 italic">🎵 {seg.notes}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

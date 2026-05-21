/**
 * VideoSequencePlayer — plays an ordered set of video clips back-to-back as a
 * single continuous video. The Video Studio uses it to preview the full
 * long-form video assembled from its parts, without concatenating files. Each
 * part stays individually downloadable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, Download, Film } from 'lucide-react'
import type { VideoClipAsset } from '../../lib/video-generation-pipeline'
import { formatSecondsToMMSS } from '../../lib/time-format'

interface VideoSequencePlayerProps {
  clips: VideoClipAsset[]
  title?: string
}

export default function VideoSequencePlayer({ clips, title }: VideoSequencePlayerProps) {
  const ordered = useMemo(
    () => [...clips]
      .filter(clip => Boolean(clip.url))
      .sort((left, right) => left.sceneNumber - right.sceneNumber || left.partNumber - right.partNumber),
    [clips],
  )

  const videoRef = useRef<HTMLVideoElement>(null)
  const playingRef = useRef(false)
  const pendingSeekRef = useRef<number | null>(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [clipTime, setClipTime] = useState(0)

  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  // Keep the index valid if the clip set shrinks underneath us.
  useEffect(() => {
    setIndex(current => (current >= ordered.length ? 0 : current))
  }, [ordered.length])

  const clipDurations = useMemo(
    () => ordered.map(clip => Math.max(0.1, clip.duration || 0)),
    [ordered],
  )
  const totalDuration = useMemo(
    () => clipDurations.reduce((sum, value) => sum + value, 0),
    [clipDurations],
  )
  const elapsedBefore = useMemo(
    () => clipDurations.slice(0, index).reduce((sum, value) => sum + value, 0),
    [clipDurations, index],
  )

  const activeClip = ordered[index]
  const globalTime = Math.min(totalDuration, elapsedBefore + clipTime)
  const progressPct = totalDuration > 0 ? (globalTime / totalDuration) * 100 : 0

  // Load the active clip whenever the index (or clip set) changes.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeClip) return
    video.src = activeClip.url
    video.load()
    setClipTime(0)
  }, [activeClip])

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (pendingSeekRef.current != null) {
      try {
        video.currentTime = pendingSeekRef.current
      } catch {
        /* seeking before the clip is ready — ignore */
      }
      pendingSeekRef.current = null
    }
    if (playingRef.current) {
      void video.play().catch(() => setPlaying(false))
    }
  }, [])

  const handleEnded = useCallback(() => {
    setIndex(current => {
      if (current < ordered.length - 1) return current + 1
      setPlaying(false)
      return current
    })
  }, [ordered.length])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (playing) {
      video.pause()
      setPlaying(false)
      return
    }
    setPlaying(true)
    void video.play().catch(() => setPlaying(false))
  }, [playing])

  const goTo = useCallback((nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= ordered.length || nextIndex === index) return
    setIndex(nextIndex)
  }, [ordered.length, index])

  const handleSeek = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (totalDuration <= 0 || ordered.length === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const targetGlobal = fraction * totalDuration

    let cursor = 0
    for (let i = 0; i < ordered.length; i++) {
      const boundary = cursor + clipDurations[i]
      if (targetGlobal <= boundary || i === ordered.length - 1) {
        const offsetInClip = Math.max(0, targetGlobal - cursor)
        if (i === index) {
          const video = videoRef.current
          if (video) {
            try {
              video.currentTime = offsetInClip
            } catch {
              /* ignore */
            }
          }
          setClipTime(offsetInClip)
        } else {
          pendingSeekRef.current = offsetInClip
          setIndex(i)
        }
        break
      }
      cursor = boundary
    }
  }, [totalDuration, ordered, clipDurations, index])

  if (ordered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-10 text-center">
        <Film className="mb-2 h-7 w-7 text-gray-300" />
        <p className="text-sm font-medium text-gray-500">Nenhum clipe de vídeo gerado ainda</p>
        <p className="mt-1 text-xs text-gray-400">Gere os clipes das cenas para reproduzir o vídeo completo.</p>
      </div>
    )
  }

  const downloadExtension = activeClip?.mimeType?.includes('mp4') ? 'mp4' : 'webm'

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Film className="h-4 w-4 text-rose-600" />
        <h3 className="text-sm font-bold text-gray-900">{title || 'Vídeo completo'}</h3>
        <span className="ml-auto text-[11px] text-gray-400">
          {ordered.length} {ordered.length === 1 ? 'parte' : 'partes'}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-black">
        <video
          ref={videoRef}
          className="aspect-video w-full bg-black"
          playsInline
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={() => setClipTime(videoRef.current?.currentTime || 0)}
          onEnded={handleEnded}
        />
      </div>

      <div
        className="h-2 w-full cursor-pointer rounded-full bg-gray-200"
        onClick={handleSeek}
        role="presentation"
      >
        <div
          className="h-full rounded-full bg-rose-500 transition-[width] duration-150"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          aria-label="Parte anterior"
        >
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? 'Pausar' : 'Reproduzir tudo'}
        </button>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={index >= ordered.length - 1}
          className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          aria-label="Próxima parte"
        >
          <SkipForward className="h-3.5 w-3.5" />
        </button>

        <span className="ml-1 font-mono text-[11px] text-gray-500">
          {formatSecondsToMMSS(Math.round(globalTime))} / {formatSecondsToMMSS(Math.round(totalDuration))}
        </span>

        {activeClip?.url && (
          <a
            href={activeClip.url}
            download={`cena-${activeClip.sceneNumber}-parte-${activeClip.partNumber}.${downloadExtension}`}
            className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            Baixar parte
          </a>
        )}
      </div>

      <p className="text-[11px] text-gray-400">
        Reproduzindo parte {index + 1} de {ordered.length}
        {activeClip ? ` · cena ${activeClip.sceneNumber}, parte ${activeClip.partNumber}` : ''}
        {' '}— as partes tocam em sequência como um vídeo contínuo.
      </p>
    </div>
  )
}

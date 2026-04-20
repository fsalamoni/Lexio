import { formatCostBadge } from './currency-utils'
import { generateImageViaOpenRouter } from './image-generation-client'
import { requestExternalVideoClip } from './external-video-provider'
import { loadVideoPipelineModels } from './model-config'
import { formatSecondsToMMSS } from './time-format'
import { generateTTSViaOpenRouter, DEFAULT_OPENROUTER_TTS_MODEL } from './tts-client'
import { createVideoRenderScopeLabel } from './video-generation-pipeline'
import type { VideoPipelineProgressMeta } from './video-pipeline-progress'
import type {
  LiteralGenerationEvent,
  LiteralGenerationState,
  LiteralSceneCheckpoint,
  VideoClipAsset,
  RenderedVideoAsset,
  ScopedRenderedVideoAsset,
  VideoRenderPreset,
  VideoRenderScope,
  VideoAudioAsset,
  VideoGenerationStepExecution,
  VideoProductionPackage,
  VideoScene,
  VideoSceneAsset,
} from './video-generation-pipeline'

export type LiteralVideoProgressCallback = (
  step: number,
  totalSteps: number,
  phase: string,
  agentLabel: string,
  meta?: VideoPipelineProgressMeta,
) => void

export interface LiteralVideoProductionResult {
  production: VideoProductionPackage
  videoBlob: Blob
  executions: VideoGenerationStepExecution[]
}

export interface LiteralMediaGenerationResult {
  production: VideoProductionPackage
  executions: VideoGenerationStepExecution[]
  errors: string[]
}

export interface LiteralClipGenerationResult {
  production: VideoProductionPackage
  clip: VideoClipAsset
  execution: VideoGenerationStepExecution
}

const MIN_SOUNDTRACK_DURATION_SECONDS = 1
const INT16_PCM_MIN = -0x8000
const INT16_PCM_MAX = 0x7fff
const DEFAULT_SCENE_CLIP_DURATION_SECONDS = 8
const MAX_LITERAL_STEP_ATTEMPTS = 3
const MAX_LITERAL_EVENT_LOG = 120
const MIN_RENDER_WIDTH = 160
const MIN_RENDER_HEIGHT = 90
const DEFAULT_RENDER_FRAME_RATE = 30
const MIN_RENDER_VIDEO_BITRATE = 250_000
const DEFAULT_RENDER_VIDEO_BITRATE = 6_000_000
const DEFAULT_RENDER_PRESETS: VideoRenderPreset[] = [
  {
    id: 'render-fast-540p',
    name: 'Rascunho (540p)',
    description: 'Prévia rápida para revisão',
    width: 960,
    height: 540,
    frameRate: 24,
    videoBitsPerSecond: 3_000_000,
  },
  {
    id: 'render-standard-720p',
    name: 'Padrão (720p)',
    description: 'Equilíbrio entre qualidade e velocidade',
    width: 1280,
    height: 720,
    frameRate: 30,
    videoBitsPerSecond: DEFAULT_RENDER_VIDEO_BITRATE,
  },
  {
    id: 'render-high-1080p',
    name: 'Alta (1080p)',
    description: 'Qualidade máxima para exportação final',
    width: 1920,
    height: 1080,
    frameRate: 30,
    videoBitsPerSecond: 10_000_000,
  },
]

interface RenderLiteralVideoOptions {
  preset?: VideoRenderPreset
}

interface RenderByScopeOptions {
  scope: VideoRenderScope
  sceneNumber?: number
  partNumber?: number
  preset?: VideoRenderPreset
  onProgress?: LiteralVideoProgressCallback
}

interface LiteralMediaGenerationOptions {
  signal?: AbortSignal
}

interface PreparedSceneTiming {
  scene: VideoScene
  start: number
  end: number
}

interface ScenePartTiming {
  sceneNumber: number
  partNumber: number
  startTime: number
  endTime: number
  duration: number
}

function makeExecution(
  phase: string,
  model: string,
  durationMs: number,
  costUsd = 0,
): VideoGenerationStepExecution {
  const agentName = {
    media_image_generation: 'Gerador de Imagens',
    media_tts_generation: 'Narrador TTS',
    media_video_clip_generation: 'Gerador de Clipes',
    media_soundtrack_generation: 'Trilha Sonora',
    media_video_render: 'Renderizador de Vídeo',
  }[phase] ?? phase

  return {
    phase,
    agent_name: agentName,
    model,
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: Math.max(0, costUsd),
    duration_ms: Math.max(0, Math.round(durationMs)),
  }
}

function formatUsd(costUsd: number): string {
  return formatCostBadge(costUsd)
}

function buildLiteralProgressMeta(options: {
  stageMeta: string
  costUsd?: number
  durationMs?: number
  retryCount?: number
  usedFallback?: boolean
  fallbackFrom?: string
}): VideoPipelineProgressMeta {
  return {
    stageMeta: options.stageMeta,
    costUsd: options.costUsd,
    durationMs: options.durationMs,
    retryCount: options.retryCount,
    usedFallback: options.usedFallback,
    fallbackFrom: options.fallbackFrom,
  }
}

function parseTimeToSeconds(value?: string): number {
  if (!value) return 0
  const parts = value.split(':').map(part => Number.parseInt(part, 10))
  if (parts.some(Number.isNaN)) return 0
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

function prepareTimings(production: VideoProductionPackage): PreparedSceneTiming[] {
  let cursor = 0
  return production.scenes.map(scene => {
    const parsedStart = parseTimeToSeconds(scene.timeStart)
    const parsedEnd = parseTimeToSeconds(scene.timeEnd)
    const duration = Math.max(1, scene.duration || parsedEnd - parsedStart || 6)
    const start = parsedStart > 0 || cursor === 0 ? parsedStart || cursor : cursor
    const end = Math.max(start + 1, parsedEnd || start + duration)
    cursor = end
    return { scene, start, end }
  })
}

function buildLiteralClipPrompt(scene: VideoScene, clipNumber: number): string {
  const plannedClip = scene.clips?.find(clip => clip.clipNumber === clipNumber)
  if (!plannedClip) return scene.videoPrompt || scene.imagePrompt || scene.visual

  return [
    scene.videoPrompt,
    `Scene ${scene.number}, clip ${plannedClip.clipNumber}.`,
    `Visual moment: ${plannedClip.description}.`,
    plannedClip.motionDescription ? `Camera and motion: ${plannedClip.motionDescription}.` : '',
    `Transition to next beat: ${plannedClip.transition || scene.transition || 'cut'}.`,
    `Maintain absolute continuity with the rest of scene ${scene.number}: same characters, wardrobe, palette, lighting, setting, and chronology.`,
  ].filter(Boolean).join(' ')
}

function getPlannedClipImage(scene: VideoScene, clipNumber: number): string | undefined {
  return scene.clips?.find(clip => clip.clipNumber === clipNumber)?.generatedImageUrl
}

function buildScenePartTimings(
  sceneTiming: PreparedSceneTiming,
  clipDurationSeconds: number,
): ScenePartTiming[] {
  const duration = Math.max(1, sceneTiming.end - sceneTiming.start)
  const chunk = Math.max(1, Math.floor(clipDurationSeconds))
  const parts = Math.max(1, Math.ceil(duration / chunk))
  const list: ScenePartTiming[] = []
  for (let i = 0; i < parts; i++) {
    const startTime = sceneTiming.start + i * chunk
    const endTime = Math.min(sceneTiming.end, startTime + chunk)
    list.push({
      sceneNumber: sceneTiming.scene.number,
      partNumber: i + 1,
      startTime,
      endTime,
      duration: Math.max(1, endTime - startTime),
    })
  }
  return list
}

function createScopeKey(scope: VideoRenderScope, sceneNumber?: number, partNumber?: number): string {
  if (scope === 'scene') return `scene:${sceneNumber ?? 'unknown'}`
  if (scope === 'part') return `part:${sceneNumber ?? 'unknown'}:${partNumber ?? 'unknown'}`
  return 'full'
}

function nowIso(): string {
  return new Date().toISOString()
}

function createInitialLiteralState(production: VideoProductionPackage): LiteralGenerationState {
  const startedAt = nowIso()
  const scenes: LiteralSceneCheckpoint[] = production.scenes.map(scene => ({
    sceneNumber: scene.number,
    imageStatus: 'pending',
    narrationStatus: 'pending',
    clipsStatus: 'pending',
    imageAttempts: 0,
    narrationAttempts: 0,
    clipsAttempts: 0,
    clipPartsCompleted: 0,
    clipPartsTotal: 0,
    updatedAt: startedAt,
  }))

  return {
    status: 'running',
    phase: 'image_generation',
    startedAt,
    updatedAt: startedAt,
    checkpointVersion: 1,
    runCount: 1,
    resumeCount: 0,
    errors: [],
    events: [{ at: startedAt, type: 'start', phase: 'image_generation', message: 'Execucao literal iniciada' }],
    scenes,
  }
}

function cloneLiteralState(state: LiteralGenerationState): LiteralGenerationState {
  return {
    ...state,
    scenes: state.scenes.map(scene => ({ ...scene })),
    errors: [...state.errors],
  }
}

function updateSceneCheckpoint(
  state: LiteralGenerationState,
  sceneNumber: number,
  update: Partial<LiteralSceneCheckpoint>,
): void {
  const index = state.scenes.findIndex(scene => scene.sceneNumber === sceneNumber)
  const patch = { ...update, updatedAt: nowIso() }
  if (index === -1) {
    state.scenes.push({
      sceneNumber,
      imageStatus: 'pending',
      narrationStatus: 'pending',
      clipsStatus: 'pending',
      clipPartsCompleted: 0,
      clipPartsTotal: 0,
      ...patch,
    })
    return
  }

  state.scenes[index] = {
    ...state.scenes[index],
    ...patch,
  }
}

function touchLiteralState(state: LiteralGenerationState): void {
  state.checkpointVersion += 1
  state.updatedAt = nowIso()
}

function pushLiteralEvent(state: LiteralGenerationState, event: Omit<LiteralGenerationEvent, 'at'>): void {
  const nextEvent: LiteralGenerationEvent = { ...event, at: nowIso() }
  const current = state.events || []
  const next = [...current, nextEvent]
  state.events = next.slice(-MAX_LITERAL_EVENT_LOG)
}

function shouldRetryLiteralError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return lower.includes('429')
    || lower.includes('rate_limit')
    || lower.includes('timeout')
    || lower.includes('network')
    || lower.includes('failed to fetch')
    || lower.includes('abort')
}

async function waitBeforeRetry(attempt: number, signal?: AbortSignal): Promise<void> {
  const delayMs = 900 * attempt
  if (!signal) {
    await new Promise(resolve => setTimeout(resolve, delayMs))
    return
  }
  if (signal.aborted) {
    throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
  }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve(undefined)
    }, delayMs)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Operação cancelada pelo usuário.', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Literal media generation cancelled by user')
  }
}

export function getDefaultVideoRenderPresets(): VideoRenderPreset[] {
  return DEFAULT_RENDER_PRESETS.map(preset => ({ ...preset }))
}

export function resolveVideoRenderPreset(
  production?: VideoProductionPackage,
  presetId?: string,
): VideoRenderPreset {
  const available = [...(production?.renderPresets || []), ...DEFAULT_RENDER_PRESETS]
  const fallback = available.find(item => item.id === 'render-standard-720p') || available[0]
  if (!fallback) {
    return {
      id: 'render-fallback',
      name: 'Fallback',
      width: 1280,
      height: 720,
      frameRate: 30,
      videoBitsPerSecond: DEFAULT_RENDER_VIDEO_BITRATE,
    }
  }
  if (!presetId) return { ...fallback }
  const chosen = available.find(item => item.id === presetId)
  return chosen ? { ...chosen } : { ...fallback }
}

async function renderSceneClip(
  scene: VideoScene,
  part: ScenePartTiming,
  imageUrl: string | undefined,
  audioUrl: string | undefined,
): Promise<VideoClipAsset | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 720
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const image = imageUrl ? await loadImage(imageUrl).catch(() => null) : null

  const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return null
  const audioContext = new AudioContextCtor()
  const destination = audioContext.createMediaStreamDestination()
  const masterGain = audioContext.createGain()
  masterGain.gain.value = 0.92
  masterGain.connect(destination)

  if (audioUrl) {
    try {
      const response = await fetch(audioUrl)
      const arrayBuffer = await response.arrayBuffer()
      const buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0))
      const source = audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(masterGain)
      source.start(audioContext.currentTime + 0.1)
    } catch {
      // keep clip render even if audio fails
    }
  }

  const canvasStream = canvas.captureStream(30)
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ])
  const mimeType = getSupportedVideoMimeType()
  const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: DEFAULT_RENDER_VIDEO_BITRATE })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = event => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = (event) => reject((event as unknown as { error?: Error })?.error ?? new Error('Falha ao gravar clipe'))
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
  })

  const clipScene: VideoScene = {
    ...scene,
    duration: part.duration,
  }
  const clipTiming: PreparedSceneTiming = {
    scene: clipScene,
    start: 0,
    end: part.duration,
  }

  drawSceneFrame(ctx, canvas, clipTiming, image, 0)
  recorder.start(500)
  await audioContext.resume()

  let raf = 0
  const startedAt = performance.now()
  const renderLoop = () => {
    const elapsed = (performance.now() - startedAt) / 1000
    drawSceneFrame(ctx, canvas, clipTiming, image, Math.min(elapsed, part.duration))
    if (elapsed < part.duration + 0.1) {
      raf = window.requestAnimationFrame(renderLoop)
    } else {
      recorder.stop()
    }
  }
  raf = window.requestAnimationFrame(renderLoop)
  const blob = await done.finally(async () => {
    window.cancelAnimationFrame(raf)
    canvasStream.getTracks().forEach(track => track.stop())
    destination.stream.getTracks().forEach(track => track.stop())
    await audioContext.close().catch((err) => {
      console.warn('Failed to close audio context after clip render:', err)
    })
  })

  return {
    sceneNumber: part.sceneNumber,
    partNumber: part.partNumber,
    startTime: part.startTime,
    endTime: part.endTime,
    duration: part.duration,
    url: URL.createObjectURL(blob),
    mimeType,
    generatedAt: new Date().toISOString(),
    source: 'generated',
    blob,
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Falha ao converter blob em data URL'))
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler blob'))
    reader.readAsDataURL(blob)
  })
}

function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

async function remoteImageToDataUrl(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem gerada (${response.status}) em ${url}`)
  }
  return blobToDataUrl(await response.blob())
}

async function remoteVideoToBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Falha ao baixar vídeo gerado (${response.status}) em ${url}`)
  }
  return response.blob()
}

function chooseImageModel(model?: string): string | undefined {
  if (!model) return undefined
  return /(dall-e|image|flux|sdxl|stable|ideogram|recraft|playground)/i.test(model) ? model : undefined
}

function chooseAudioModel(model?: string): string | undefined {
  if (!model) return undefined
  return /(tts|audio|voice|speech|eleven)/i.test(model) ? model : undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function encodeWavFromFloat32(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const sample = clamp(samples[i], -1, 1)
    view.setInt16(offset, sample < 0 ? sample * INT16_PCM_MIN : sample * INT16_PCM_MAX, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function createProceduralSoundtrack(
  durationSeconds: number,
  descriptor: string,
): Blob {
  const sampleRate = 22050
  // Keep at least one second of soundtrack to avoid zero/near-zero audio buffers
  // that can fail decode/scheduling in some browser media pipelines.
  const totalSamples = Math.max(
    sampleRate * MIN_SOUNDTRACK_DURATION_SECONDS,
    Math.floor(durationSeconds * sampleRate),
  )
  const samples = new Float32Array(totalSamples)
  const energetic = /(energi|din[aâ]m|impact|rápid|epic|drama|forte)/i.test(descriptor)
  const progression = energetic
    ? [220, 277.18, 329.63, 246.94]
    : [196, 246.94, 220, 174.61]
  const pulse = energetic ? 0.18 : 0.08

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate
    const base = progression[Math.floor(t / 8) % progression.length]
    const pad =
      Math.sin(2 * Math.PI * base * t) * 0.28 +
      Math.sin(2 * Math.PI * base * 1.5 * t) * 0.14 +
      Math.sin(2 * Math.PI * base * 2 * t) * 0.09
    const rhythm = Math.sin(2 * Math.PI * pulse * t) * 0.5 + 0.5
    const shimmer = Math.sin(2 * Math.PI * (base / 2) * t) * 0.06
    const fadeIn = Math.min(1, t / 2.5)
    const fadeOut = Math.min(1, Math.max(0, (durationSeconds - t) / 3))
    samples[i] = (pad * (0.45 + rhythm * 0.18) + shimmer) * fadeIn * fadeOut
  }

  return encodeWavFromFloat32(samples, sampleRate)
}

function getSupportedVideoMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }
  return 'video/webm'
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Falha ao carregar a imagem da cena'))
    image.src = url
  })
}

function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  timing: PreparedSceneTiming,
  image: HTMLImageElement | null,
  elapsed: number,
  nextTiming?: PreparedSceneTiming,
  nextImage?: HTMLImageElement | null,
) {
  const duration = Math.max(1, timing.end - timing.start)
  const localProgress = clamp((elapsed - timing.start) / duration, 0, 1)
  const transitionDuration = Math.min(0.8, duration / 3)
  const blendToNext = nextTiming
    ? clamp((elapsed - (timing.end - transitionDuration)) / transitionDuration, 0, 1)
    : 0

  const paint = (targetImage: HTMLImageElement | null, scene: VideoScene, progress: number, alpha = 1) => {
    ctx.save()
    ctx.globalAlpha = alpha
    if (targetImage) {
      const scale = 1.02 + progress * 0.08
      const drawWidth = canvas.width * scale
      const drawHeight = canvas.height * scale
      const offsetX = (scene.number % 2 === 0 ? -1 : 1) * progress * 70
      const offsetY = ((scene.number % 3) - 1) * progress * 28
      ctx.drawImage(
        targetImage,
        (canvas.width - drawWidth) / 2 + offsetX,
        (canvas.height - drawHeight) / 2 + offsetY,
        drawWidth,
        drawHeight,
      )
    } else {
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      gradient.addColorStop(0, '#0f172a')
      gradient.addColorStop(1, '#1e293b')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.font = 'bold 44px Inter, Arial, sans-serif'
      ctx.fillText(`Cena ${scene.number}`, 72, 140)
      ctx.font = '28px Inter, Arial, sans-serif'
      wrapText(ctx, scene.visual || scene.narration || 'Sem visual gerado', 72, 210, canvas.width - 144, 40, 8)
    }

    ctx.fillStyle = 'rgba(10, 14, 24, 0.30)'
    ctx.fillRect(0, canvas.height - 168, canvas.width, 168)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 28px Inter, Arial, sans-serif'
    ctx.fillText(`Cena ${scene.number}`, 54, canvas.height - 112)
    ctx.font = '22px Inter, Arial, sans-serif'
    wrapText(ctx, scene.lowerThird || scene.narration || scene.visual, 54, canvas.height - 74, canvas.width - 108, 30, 3)
    ctx.restore()
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  paint(image, timing.scene, localProgress, 1)
  if (nextTiming && blendToNext > 0.001) {
    paint(nextImage || null, nextTiming.scene, clamp(blendToNext, 0, 1), blendToNext)
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
      if (lines.length >= maxLines - 1) break
    } else {
      currentLine = candidate
    }
  }
  if (currentLine && lines.length < maxLines) lines.push(currentLine)

  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight))
}

export async function renderLiteralVideo(
  production: VideoProductionPackage,
  onProgress?: LiteralVideoProgressCallback,
  options?: RenderLiteralVideoOptions,
): Promise<{ blob: Blob; asset: RenderedVideoAsset }> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('A renderização real de vídeo requer navegador.')
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('O navegador atual não suporta MediaRecorder para gerar vídeo.')
  }

  const sceneAssets = production.sceneAssets || []
  const timings = prepareTimings(production)
  const totalDuration = Math.max(
    production.totalDuration || 0,
    timings.length > 0 ? timings[timings.length - 1].end : 1,
  )

  const images = new Map<number, HTMLImageElement | null>()
  for (const scene of production.scenes) {
    const asset = sceneAssets.find(item => item.sceneNumber === scene.number)
    if (asset?.imageUrl) {
      images.set(scene.number, await loadImage(asset.imageUrl).catch(() => null))
    } else {
      images.set(scene.number, null)
    }
  }

  const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) {
    throw new Error('O navegador atual não suporta AudioContext para gerar vídeo com áudio.')
  }

  const audioContext = new AudioContextCtor()
  const destination = audioContext.createMediaStreamDestination()
  const masterGain = audioContext.createGain()
  masterGain.gain.value = 0.92
  masterGain.connect(destination)

  const scheduleAudio = async (url: string, startAt: number, gainValue: number) => {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    // Safari/WebKit can expose consumed/unstable buffers across fetch/decode paths;
    // cloning keeps decodeAudioData stable for object URLs and data URLs.
    const buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0))
    const source = audioContext.createBufferSource()
    const gain = audioContext.createGain()
    gain.gain.value = gainValue
    source.buffer = buffer
    source.connect(gain)
    gain.connect(masterGain)
    source.start(startAt)
  }

  const startAt = audioContext.currentTime + 0.25
  for (const sceneAsset of sceneAssets) {
    if (!sceneAsset.narrationUrl) continue
    const timing = timings.find(item => item.scene.number === sceneAsset.sceneNumber)
    const sceneStart = timing?.start ?? 0
    await scheduleAudio(sceneAsset.narrationUrl, startAt + sceneStart, 1)
  }

  if (production.soundtrackAsset?.url) {
    await scheduleAudio(production.soundtrackAsset.url, startAt, 0.18)
  }

  const preset = options?.preset || resolveVideoRenderPreset(production, production.selectedRenderPresetId)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(MIN_RENDER_WIDTH, Math.floor(preset.width))
  canvas.height = Math.max(MIN_RENDER_HEIGHT, Math.floor(preset.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Falha ao criar canvas para renderização do vídeo.')

  const frameRate = Math.max(1, Math.floor(preset.frameRate || DEFAULT_RENDER_FRAME_RATE))
  const canvasStream = canvas.captureStream(frameRate)
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ])

  const mimeType = getSupportedVideoMimeType()
  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: Math.max(MIN_RENDER_VIDEO_BITRATE, Math.floor(preset.videoBitsPerSecond || DEFAULT_RENDER_VIDEO_BITRATE)),
  })
  const chunks: BlobPart[] = []

  recorder.ondataavailable = event => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = (event) => reject((event as unknown as { error?: Error })?.error ?? new Error('Falha ao gravar o vídeo final'))
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
  })

  drawSceneFrame(ctx, canvas, timings[0] || { scene: production.scenes[0], start: 0, end: Math.max(1, totalDuration) }, images.get(production.scenes[0]?.number) || null, 0)
  recorder.start(1000)
  await audioContext.resume()

  let raf = 0
  let lastProgressStamp = 0
  const startedAt = performance.now()

  const renderLoop = () => {
    const elapsed = (performance.now() - startedAt) / 1000
    const sceneIndex = timings.findIndex(item => elapsed >= item.start && elapsed < item.end)
    const activeIndex = sceneIndex >= 0 ? sceneIndex : Math.max(0, timings.length - 1)
    const activeTiming = timings[activeIndex]
    const nextTiming = timings[activeIndex + 1]

    drawSceneFrame(
      ctx,
      canvas,
      activeTiming,
      images.get(activeTiming.scene.number) || null,
      Math.min(elapsed, totalDuration),
      nextTiming,
      nextTiming ? images.get(nextTiming.scene.number) || null : null,
    )

    if (performance.now() - lastProgressStamp > 500) {
      const percent = Math.round((Math.min(elapsed, totalDuration) / totalDuration) * 100)
      onProgress?.(
        4,
        4,
        'media_video_render',
        `Renderizando vídeo final (${percent}%)`,
        buildLiteralProgressMeta({ stageMeta: `Renderer local • ${percent}% concluído` }),
      )
      lastProgressStamp = performance.now()
    }

    if (elapsed < totalDuration + 0.2) {
      raf = window.requestAnimationFrame(renderLoop)
    } else {
      recorder.stop()
    }
  }

  raf = window.requestAnimationFrame(renderLoop)
  const blob = await done.finally(async () => {
    window.cancelAnimationFrame(raf)
    canvasStream.getTracks().forEach(track => track.stop())
    destination.stream.getTracks().forEach(track => track.stop())
    await audioContext.close().catch((err) => {
      console.warn('Failed to close audio context after final render:', err)
    })
  })

  return {
    blob,
    asset: {
      url: blobToObjectUrl(blob),
      mimeType,
      generatedAt: new Date().toISOString(),
      blob,
    },
  }
}

export async function renderLiteralVideoByScope(
  production: VideoProductionPackage,
  {
    scope,
    sceneNumber,
    partNumber,
    preset,
    onProgress,
  }: RenderByScopeOptions,
): Promise<{ blob: Blob; asset: ScopedRenderedVideoAsset }> {
  const chosenPreset = preset || resolveVideoRenderPreset(production, production.selectedRenderPresetId)
  const clipDuration = Math.max(1, production.sceneClipDurationSeconds || DEFAULT_SCENE_CLIP_DURATION_SECONDS)

  if (scope === 'full') {
    const rendered = await renderLiteralVideo(production, onProgress, { preset: chosenPreset })
    return {
      blob: rendered.blob,
      asset: {
        ...rendered.asset,
        scope: 'full',
        scopeKey: createScopeKey('full'),
        label: createVideoRenderScopeLabel('full'),
        presetId: chosenPreset.id,
      },
    }
  }

  if (scope === 'scene') {
    const scene = production.scenes.find(item => item.number === sceneNumber)
    if (!scene) {
      throw new Error(`Cena ${sceneNumber ?? '?'} não encontrada para render por escopo.`)
    }
    const sceneAsset = (production.sceneAssets || []).find(item => item.sceneNumber === scene.number)
    const sceneDuration = Math.max(
      1,
      scene.duration || parseTimeToSeconds(scene.timeEnd) - parseTimeToSeconds(scene.timeStart) || 1,
    )
    const sceneOnly: VideoProductionPackage = {
      ...production,
      totalDuration: sceneDuration,
      scenes: [{ ...scene, timeStart: '00:00', timeEnd: formatSecondsToMMSS(sceneDuration), duration: sceneDuration }],
      sceneAssets: sceneAsset ? [{ ...sceneAsset }] : [],
    }
    const rendered = await renderLiteralVideo(sceneOnly, onProgress, { preset: chosenPreset })
    return {
      blob: rendered.blob,
      asset: {
        ...rendered.asset,
        scope: 'scene',
        scopeKey: createScopeKey('scene', scene.number),
        label: createVideoRenderScopeLabel('scene', scene.number),
        presetId: chosenPreset.id,
        sceneNumber: scene.number,
      },
    }
  }

  const scene = production.scenes.find(item => item.number === sceneNumber)
  if (!scene) {
    throw new Error(`Cena ${sceneNumber ?? '?'} não encontrada para render de parte.`)
  }
  if (!partNumber || partNumber < 1) {
    throw new Error('Parte inválida para render por escopo.')
  }

  const sceneStart = parseTimeToSeconds(scene.timeStart)
  const sceneDuration = Math.max(
    1,
    scene.duration || parseTimeToSeconds(scene.timeEnd) - parseTimeToSeconds(scene.timeStart) || 1,
  )
  const partStart = sceneStart + (partNumber - 1) * clipDuration
  const partEnd = Math.min(sceneStart + sceneDuration, partStart + clipDuration)
  if (partStart >= sceneStart + sceneDuration) {
    throw new Error(`Parte ${partNumber} fora da duração da cena ${scene.number}.`)
  }
  const clipLength = Math.max(1, partEnd - partStart)
  const sceneAsset = (production.sceneAssets || []).find(item => item.sceneNumber === scene.number)
  const partProduction: VideoProductionPackage = {
    ...production,
    totalDuration: clipLength,
    scenes: [{ ...scene, duration: clipLength, timeStart: '00:00', timeEnd: formatSecondsToMMSS(clipLength) }],
    sceneAssets: sceneAsset ? [{ ...sceneAsset }] : [],
  }
  const rendered = await renderLiteralVideo(partProduction, onProgress, { preset: chosenPreset })
  return {
    blob: rendered.blob,
    asset: {
      ...rendered.asset,
      scope: 'part',
      scopeKey: createScopeKey('part', scene.number, partNumber),
      label: createVideoRenderScopeLabel('part', scene.number, partNumber),
      presetId: chosenPreset.id,
      sceneNumber: scene.number,
      partNumber,
    },
  }
}

export async function produceLiteralVideoProduction(
  apiKey: string,
  production: VideoProductionPackage,
  onProgress?: LiteralVideoProgressCallback,
): Promise<LiteralVideoProductionResult> {
  const media = await generateLiteralMediaAssets(apiKey, production, onProgress)
  const renderStartedAt = performance.now()
  const rendered = await renderLiteralVideo(media.production, onProgress)
  const executions = [
    ...media.executions,
    makeExecution('media_video_render', `browser/${rendered.asset.mimeType}`, performance.now() - renderStartedAt),
  ]

  return {
    production: {
      ...media.production,
      renderedVideo: rendered.asset,
    },
    videoBlob: rendered.blob,
    executions,
  }
}

export async function generateLiteralVideoClipAsset(
  apiKey: string,
  production: VideoProductionPackage,
  sceneNumber: number,
  partNumber: number,
  signal?: AbortSignal,
): Promise<LiteralClipGenerationResult> {
  assertNotCancelled(signal)

  const models = await loadVideoPipelineModels()
  const clipDurationSeconds = Math.max(1, production.sceneClipDurationSeconds || DEFAULT_SCENE_CLIP_DURATION_SECONDS)
  const timings = prepareTimings(production)
  const scene = production.scenes.find(item => item.number === sceneNumber)
  const timing = timings.find(item => item.scene.number === sceneNumber)

  if (!scene || !timing) {
    throw new Error(`Cena ${sceneNumber} não encontrada para geração literal do clip.`)
  }

  const part = buildScenePartTimings(timing, clipDurationSeconds).find(item => item.partNumber === partNumber)
  if (!part) {
    throw new Error(`Parte ${partNumber} não encontrada na cena ${sceneNumber}.`)
  }

  const sceneAsset = (production.sceneAssets || []).find(item => item.sceneNumber === sceneNumber) || { sceneNumber }
  const plannedClipImage = getPlannedClipImage(scene, partNumber)
  const literalClipPrompt = buildLiteralClipPrompt(scene, partNumber)
  const startedAt = performance.now()
  let clip: VideoClipAsset | null = null

  if (literalClipPrompt) {
    try {
      const providerResult = await requestExternalVideoClip({
        prompt: literalClipPrompt,
        durationSeconds: part.duration,
        sceneNumber,
        partNumber,
        aspectRatio: '16:9',
        signal,
      })

      if (providerResult?.url) {
        const providerBlob = await remoteVideoToBlob(providerResult.url)
        clip = {
          sceneNumber: part.sceneNumber,
          partNumber: part.partNumber,
          startTime: part.startTime,
          endTime: part.endTime,
          duration: part.duration,
          url: blobToObjectUrl(providerBlob),
          mimeType: providerResult.mimeType || 'video/mp4',
          generatedAt: new Date().toISOString(),
          source: 'generated',
          generationEngine: 'external-provider',
          providerName: providerResult.provider,
          providerJobId: providerResult.jobId,
          blob: providerBlob,
        }
      }
    } catch {
      // Fallback to local browser render when the external provider fails.
    }
  }

  if (!clip) {
    clip = await renderSceneClip(
      scene,
      part,
      plannedClipImage || sceneAsset.imageUrl,
      sceneAsset.narrationUrl,
    )

    if (clip) {
      clip = {
        ...clip,
        generationEngine: 'browser-local',
        providerName: 'browser-renderer',
      }
    }
  }

  if (!clip) {
    throw new Error(`Não foi possível gerar o vídeo da cena ${sceneNumber}, parte ${partNumber}.`)
  }

  const nextSceneAssets = [...(production.sceneAssets || [])]
  const sceneAssetIndex = nextSceneAssets.findIndex(item => item.sceneNumber === sceneNumber)
  const existingSceneAsset = sceneAssetIndex >= 0 ? nextSceneAssets[sceneAssetIndex] : sceneAsset
  const mergedSceneAsset: VideoSceneAsset = {
    ...existingSceneAsset,
    sceneNumber,
    videoClips: [
      ...((existingSceneAsset.videoClips || []).filter(item => item.partNumber !== partNumber)),
      clip,
    ].sort((left, right) => left.partNumber - right.partNumber),
  }

  if (sceneAssetIndex >= 0) {
    nextSceneAssets[sceneAssetIndex] = mergedSceneAsset
  } else {
    nextSceneAssets.push(mergedSceneAsset)
  }

  const executionModel = clip.generationEngine === 'external-provider'
    ? `${clip.providerName || 'external-provider'}/${clip.mimeType}`
    : `browser/${clip.mimeType}`

  return {
    production: {
      ...production,
      sceneAssets: nextSceneAssets,
    },
    clip,
    execution: makeExecution('media_video_clip_generation', executionModel, performance.now() - startedAt),
  }
}

export async function generateLiteralMediaAssets(
  apiKey: string,
  production: VideoProductionPackage,
  onProgress?: LiteralVideoProgressCallback,
  onPartialProduction?: (partialProduction: VideoProductionPackage) => void | Promise<void>,
  options?: LiteralMediaGenerationOptions,
): Promise<LiteralMediaGenerationResult> {
  const executions: VideoGenerationStepExecution[] = []
  const errors: string[] = []
  const signal = options?.signal
  const models = await loadVideoPipelineModels()
  const clipDurationSeconds = Math.max(1, production.sceneClipDurationSeconds || DEFAULT_SCENE_CLIP_DURATION_SECONDS)
  const timings = prepareTimings(production)
  const existingAssets = new Map(
    (production.sceneAssets || []).map(asset => [asset.sceneNumber, asset]),
  )
  const literalState = production.literalGenerationState
    ? cloneLiteralState(production.literalGenerationState)
    : createInitialLiteralState(production)
  if (production.literalGenerationState) {
    literalState.runCount = (literalState.runCount || 1) + 1
    literalState.resumeCount = (literalState.resumeCount || 0) + 1
    pushLiteralEvent(literalState, {
      type: 'resume',
      phase: literalState.phase,
      message: 'Retomada a partir de checkpoint persistido',
    })
  }
  literalState.status = 'running'
  literalState.phase = 'image_generation'
  literalState.completedAt = undefined
  literalState.errors = []
  touchLiteralState(literalState)

  onProgress?.(1, 4, 'media_image_generation', 'Preparando geração real das imagens')
  const generatedAssets: VideoSceneAsset[] = []
  for (let index = 0; index < production.scenes.length; index++) {
    assertNotCancelled(signal)
    const scene = production.scenes[index]
    const existing = existingAssets.get(scene.number)
    const nextAsset: VideoSceneAsset = { sceneNumber: scene.number, ...existing }

    onProgress?.(1, 4, 'media_image_generation', `Gerando imagens das cenas (${index + 1}/${production.scenes.length})`)
    updateSceneCheckpoint(literalState, scene.number, { imageStatus: 'running' })
    const plannedSceneImage = scene.generatedImageUrl || getPlannedClipImage(scene, 1)
    if (!nextAsset.imageUrl && plannedSceneImage) {
      nextAsset.imageUrl = plannedSceneImage
      updateSceneCheckpoint(literalState, scene.number, { imageStatus: 'completed', lastError: undefined })
    } else if (!nextAsset.imageUrl && scene.imagePrompt) {
      let success = false
      for (let attempt = 1; attempt <= MAX_LITERAL_STEP_ATTEMPTS; attempt++) {
        assertNotCancelled(signal)
        updateSceneCheckpoint(literalState, scene.number, { imageAttempts: attempt })
        try {
          const startedAt = performance.now()
          const result = await generateImageViaOpenRouter({
            apiKey,
            model: chooseImageModel(models.video_image_generator),
            prompt: scene.imagePrompt,
            aspectRatio: '16:9',
            signal,
          })
          nextAsset.imageUrl = result.imageDataUrl
          executions.push(makeExecution(
            'media_image_generation',
            chooseImageModel(models.video_image_generator) || 'openai/dall-e-3',
            performance.now() - startedAt,
            result.cost_usd,
          ))
          onProgress?.(
            1,
            4,
            'media_image_generation',
            'Gerador de Imagens',
            buildLiteralProgressMeta({
              stageMeta: `${(chooseImageModel(models.video_image_generator) || 'openai/dall-e-3').split('/').pop() || chooseImageModel(models.video_image_generator) || 'openai/dall-e-3'} • cena ${scene.number} • ${Math.max(1, Math.round((performance.now() - startedAt) / 1000))}s • ${formatUsd(result.cost_usd)}`,
              costUsd: result.cost_usd,
              durationMs: performance.now() - startedAt,
              retryCount: attempt > 1 ? attempt - 1 : 0,
            }),
          )
          updateSceneCheckpoint(literalState, scene.number, { imageStatus: 'completed', lastError: undefined })
          pushLiteralEvent(literalState, {
            type: 'step_success',
            phase: 'image_generation',
            sceneNumber: scene.number,
            attempt,
            message: `Imagem gerada para cena ${scene.number}`,
          })
          success = true
          break
        } catch (error) {
          const message = `Cena ${scene.number}: falha ao gerar imagem (${error instanceof Error ? error.message : String(error)})`
          const retryable = shouldRetryLiteralError(error)
          if (attempt < MAX_LITERAL_STEP_ATTEMPTS && retryable) {
            pushLiteralEvent(literalState, {
              type: 'retry',
              phase: 'image_generation',
              sceneNumber: scene.number,
              attempt,
              message,
            })
            await waitBeforeRetry(attempt, signal)
            assertNotCancelled(signal)
            continue
          }
          errors.push(message)
          updateSceneCheckpoint(literalState, scene.number, { imageStatus: 'failed', lastError: message })
          pushLiteralEvent(literalState, {
            type: 'step_failed',
            phase: 'image_generation',
            sceneNumber: scene.number,
            attempt,
            message,
          })
          break
        }
      }
      if (!success && !nextAsset.imageUrl) {
        updateSceneCheckpoint(literalState, scene.number, { imageStatus: 'failed' })
      }
    } else {
      updateSceneCheckpoint(literalState, scene.number, { imageStatus: 'completed', lastError: undefined })
    }

    generatedAssets.push(nextAsset)

    if (onPartialProduction) {
      touchLiteralState(literalState)
      await onPartialProduction({
        ...production,
        sceneAssets: generatedAssets.filter(item => item.imageUrl || item.narrationUrl || (item.videoClips && item.videoClips.length > 0)),
        literalGenerationState: cloneLiteralState(literalState),
      })
    }
  }

  onProgress?.(2, 4, 'media_tts_generation', 'Preparando geração real das narrações')
  literalState.phase = 'tts_generation'
  touchLiteralState(literalState)
  for (let index = 0; index < production.scenes.length; index++) {
    assertNotCancelled(signal)
    const scene = production.scenes[index]
    const asset = generatedAssets.find(item => item.sceneNumber === scene.number)
    if (!asset) continue

    onProgress?.(2, 4, 'media_tts_generation', `Gerando narrações das cenas (${index + 1}/${production.scenes.length})`)
    updateSceneCheckpoint(literalState, scene.number, { narrationStatus: 'running' })
    if (!asset.narrationUrl && scene.narration) {
      let success = false
      for (let attempt = 1; attempt <= MAX_LITERAL_STEP_ATTEMPTS; attempt++) {
        assertNotCancelled(signal)
        updateSceneCheckpoint(literalState, scene.number, { narrationAttempts: attempt })
        try {
          const startedAt = performance.now()
          const result = await generateTTSViaOpenRouter({
            apiKey,
            model: chooseAudioModel(models.video_tts),
            text: scene.narration,
            voice: 'nova',
            signal,
          })
          asset.narrationBlob = result.audioBlob
          asset.narrationUrl = blobToObjectUrl(result.audioBlob)
          executions.push(makeExecution(
            'media_tts_generation',
            chooseAudioModel(models.video_tts) || DEFAULT_OPENROUTER_TTS_MODEL,
            performance.now() - startedAt,
            0.015 * (scene.narration.length / 1000),
          ))
          onProgress?.(
            2,
            4,
            'media_tts_generation',
            'Narrador TTS',
            buildLiteralProgressMeta({
              stageMeta: `${(chooseAudioModel(models.video_tts) || DEFAULT_OPENROUTER_TTS_MODEL).split('/').pop() || chooseAudioModel(models.video_tts) || DEFAULT_OPENROUTER_TTS_MODEL} • cena ${scene.number} • ${Math.max(1, Math.round((performance.now() - startedAt) / 1000))}s • ${formatUsd(0.015 * (scene.narration.length / 1000))}`,
              costUsd: 0.015 * (scene.narration.length / 1000),
              durationMs: performance.now() - startedAt,
              retryCount: attempt > 1 ? attempt - 1 : 0,
            }),
          )
          updateSceneCheckpoint(literalState, scene.number, { narrationStatus: 'completed', lastError: undefined })
          pushLiteralEvent(literalState, {
            type: 'step_success',
            phase: 'tts_generation',
            sceneNumber: scene.number,
            attempt,
            message: `Narracao gerada para cena ${scene.number}`,
          })
          success = true
          break
        } catch (error) {
          const message = `Cena ${scene.number}: falha ao gerar narração (${error instanceof Error ? error.message : String(error)})`
          const retryable = shouldRetryLiteralError(error)
          if (attempt < MAX_LITERAL_STEP_ATTEMPTS && retryable) {
            pushLiteralEvent(literalState, {
              type: 'retry',
              phase: 'tts_generation',
              sceneNumber: scene.number,
              attempt,
              message,
            })
            await waitBeforeRetry(attempt, signal)
            assertNotCancelled(signal)
            continue
          }
          errors.push(message)
          updateSceneCheckpoint(literalState, scene.number, { narrationStatus: 'failed', lastError: message })
          pushLiteralEvent(literalState, {
            type: 'step_failed',
            phase: 'tts_generation',
            sceneNumber: scene.number,
            attempt,
            message,
          })
          break
        }
      }
      if (!success && !asset.narrationUrl) {
        updateSceneCheckpoint(literalState, scene.number, { narrationStatus: 'failed' })
      }
    } else {
      updateSceneCheckpoint(literalState, scene.number, { narrationStatus: 'completed', lastError: undefined })
    }

    if (onPartialProduction) {
      touchLiteralState(literalState)
      await onPartialProduction({
        ...production,
        sceneAssets: generatedAssets.filter(item => item.imageUrl || item.narrationUrl),
        literalGenerationState: cloneLiteralState(literalState),
      })
    }
  }

  onProgress?.(3, 4, 'media_video_clip_generation', 'Gerando clipes por partes das cenas')
  literalState.phase = 'clip_generation'
  touchLiteralState(literalState)
  for (let index = 0; index < production.scenes.length; index++) {
    assertNotCancelled(signal)
    const scene = production.scenes[index]
    const timing = timings.find(item => item.scene.number === scene.number)
    const sceneAsset = generatedAssets.find(item => item.sceneNumber === scene.number)
    if (!sceneAsset || !timing) continue
    const existingClips = sceneAsset.videoClips || []
    const parts = buildScenePartTimings(timing, clipDurationSeconds)
    updateSceneCheckpoint(literalState, scene.number, {
      clipsStatus: 'running',
      clipPartsTotal: parts.length,
      clipPartsCompleted: existingClips.length,
      clipsAttempts: 0,
      lastError: undefined,
    })

    for (const part of parts) {
      assertNotCancelled(signal)
      const hasClip = existingClips.some(clip => clip.partNumber === part.partNumber && Boolean(clip.url))
      if (hasClip) continue

      onProgress?.(
        3,
        4,
        'media_video_clip_generation',
        `Gerando clipe da cena ${scene.number} (${part.partNumber}/${parts.length})`,
      )
      let rendered = false
      for (let attempt = 1; attempt <= MAX_LITERAL_STEP_ATTEMPTS; attempt++) {
        assertNotCancelled(signal)
        const startedAt = performance.now()
        updateSceneCheckpoint(literalState, scene.number, { clipsAttempts: attempt })
        try {
          let clip = null as VideoClipAsset | null
          const plannedClipImage = getPlannedClipImage(scene, part.partNumber)
          const literalClipPrompt = buildLiteralClipPrompt(scene, part.partNumber)

          if (literalClipPrompt) {
            try {
              const providerResult = await requestExternalVideoClip({
                prompt: literalClipPrompt,
                durationSeconds: part.duration,
                sceneNumber: scene.number,
                partNumber: part.partNumber,
                aspectRatio: '16:9',
                signal,
              })
              if (providerResult?.url) {
                const providerBlob = await remoteVideoToBlob(providerResult.url)
                clip = {
                  sceneNumber: part.sceneNumber,
                  partNumber: part.partNumber,
                  startTime: part.startTime,
                  endTime: part.endTime,
                  duration: part.duration,
                  url: blobToObjectUrl(providerBlob),
                  mimeType: providerResult.mimeType || 'video/mp4',
                  generatedAt: new Date().toISOString(),
                  source: 'generated',
                  generationEngine: 'external-provider',
                  providerName: providerResult.provider,
                  providerJobId: providerResult.jobId,
                  blob: providerBlob,
                }
              }
            } catch {
              // Fallback para render local quando provedor externo falha.
            }
          }

          if (!clip) {
            clip = await renderSceneClip(
              scene,
              part,
              plannedClipImage || sceneAsset.imageUrl,
              sceneAsset.narrationUrl,
            )
            if (clip) {
              clip = {
                ...clip,
                generationEngine: 'browser-local',
                providerName: 'browser-renderer',
              }
            }
          }

          if (clip) {
            existingClips.push(clip)
            sceneAsset.videoClips = [...existingClips].sort((a, b) => a.partNumber - b.partNumber)
            executions.push(makeExecution('media_video_clip_generation', `browser/${clip.mimeType}`, performance.now() - startedAt))
            onProgress?.(
              3,
              4,
              'media_video_clip_generation',
              'Gerador de Clipes',
              buildLiteralProgressMeta({
                stageMeta: `${clip.generationEngine === 'external-provider' ? (clip.providerName || 'provedor-externo') : 'renderer-local'} • cena ${scene.number} parte ${part.partNumber} • ${Math.max(1, Math.round((performance.now() - startedAt) / 1000))}s${clip.generationEngine === 'external-provider' ? ' • fallback externo' : ''}`,
                durationMs: performance.now() - startedAt,
                retryCount: attempt > 1 ? attempt - 1 : 0,
                usedFallback: clip.generationEngine === 'external-provider',
                fallbackFrom: clip.generationEngine === 'external-provider' ? 'browser-renderer' : undefined,
              }),
            )
            updateSceneCheckpoint(literalState, scene.number, {
              clipPartsCompleted: existingClips.length,
              clipsStatus: existingClips.length >= parts.length ? 'completed' : 'running',
              lastError: undefined,
            })
            pushLiteralEvent(literalState, {
              type: 'step_success',
              phase: 'clip_generation',
              sceneNumber: scene.number,
              partNumber: part.partNumber,
              attempt,
              message: `Clipe gerado para cena ${scene.number} parte ${part.partNumber}`,
            })
            rendered = true
          }
          break
        } catch (error) {
          const message = `Cena ${scene.number} parte ${part.partNumber}: falha ao gerar clipe (${error instanceof Error ? error.message : String(error)})`
          const retryable = shouldRetryLiteralError(error)
          if (attempt < MAX_LITERAL_STEP_ATTEMPTS && retryable) {
            pushLiteralEvent(literalState, {
              type: 'retry',
              phase: 'clip_generation',
              sceneNumber: scene.number,
              partNumber: part.partNumber,
              attempt,
              message,
            })
            await waitBeforeRetry(attempt, signal)
            assertNotCancelled(signal)
            continue
          }
          errors.push(message)
          updateSceneCheckpoint(literalState, scene.number, {
            clipsStatus: 'failed',
            lastError: message,
          })
          pushLiteralEvent(literalState, {
            type: 'step_failed',
            phase: 'clip_generation',
            sceneNumber: scene.number,
            partNumber: part.partNumber,
            attempt,
            message,
          })
          break
        }
      }
      if (!rendered && !existingClips.some(clip => clip.partNumber === part.partNumber)) {
        updateSceneCheckpoint(literalState, scene.number, {
          clipsStatus: 'failed',
        })
      }
    }

    if (existingClips.length >= parts.length) {
      updateSceneCheckpoint(literalState, scene.number, { clipsStatus: 'completed', lastError: undefined })
    }

    if (onPartialProduction) {
      touchLiteralState(literalState)
      await onPartialProduction({
        ...production,
        sceneClipDurationSeconds: clipDurationSeconds,
        sceneAssets: generatedAssets.filter(item => item.imageUrl || item.narrationUrl || (item.videoClips && item.videoClips.length > 0)),
        literalGenerationState: cloneLiteralState(literalState),
      })
    }
  }

  onProgress?.(4, 4, 'media_soundtrack_generation', 'Gerando trilha sonora da produção')
  literalState.phase = 'soundtrack_generation'
  touchLiteralState(literalState)
  let soundtrackAsset = production.soundtrackAsset
  if (!soundtrackAsset?.url) {
    try {
      const soundtrackStartedAt = performance.now()
      const soundtrackBlob = createProceduralSoundtrack(
        Math.max(1, production.totalDuration || (() => {
          const timings = prepareTimings(production)
          return timings.length > 0 ? timings[timings.length - 1].end : 1
        })() || 1),
        production.scenes.map(scene => scene.soundtrack).join(' '),
      )
      soundtrackAsset = {
        url: blobToObjectUrl(soundtrackBlob),
        mimeType: soundtrackBlob.type || 'audio/wav',
        generatedAt: new Date().toISOString(),
        description: 'Trilha sonora procedural gerada automaticamente',
        blob: soundtrackBlob,
      }
      executions.push(makeExecution('media_soundtrack_generation', 'browser/procedural-audio', performance.now() - soundtrackStartedAt))
      onProgress?.(
        4,
        4,
        'media_soundtrack_generation',
        'Trilha Sonora',
        buildLiteralProgressMeta({
          stageMeta: `browser/procedural-audio • ${Math.max(1, Math.round((performance.now() - soundtrackStartedAt) / 1000))}s`,
          durationMs: performance.now() - soundtrackStartedAt,
        }),
      )
    } catch (error) {
      const message = `Trilha sonora: falha na geração (${error instanceof Error ? error.message : String(error)})`
      errors.push(message)
    }
  }

  literalState.errors = [...errors]
  literalState.status = errors.length > 0 ? 'failed' : 'completed'
  literalState.phase = errors.length > 0 ? 'failed' : 'completed'
  literalState.completedAt = nowIso()
  pushLiteralEvent(literalState, {
    type: 'completed',
    phase: errors.length > 0 ? 'failed' : 'completed',
    message: errors.length > 0 ? `Concluido com ${errors.length} erro(s)` : 'Concluido sem erros',
  })
  touchLiteralState(literalState)

  const mediaProduction: VideoProductionPackage = {
    ...production,
    sceneClipDurationSeconds: clipDurationSeconds,
    sceneAssets: generatedAssets.filter(item => item.imageUrl || item.narrationUrl || (item.videoClips && item.videoClips.length > 0)),
    soundtrackAsset,
    literalGenerationState: cloneLiteralState(literalState),
  }

  if (onPartialProduction) {
    await onPartialProduction(mediaProduction)
  }

  return {
    production: mediaProduction,
    executions,
    errors,
  }
}

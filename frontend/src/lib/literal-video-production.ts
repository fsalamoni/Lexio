import { generateImageViaOpenRouter } from './image-generation-client'
import { loadVideoPipelineModels } from './model-config'
import { generateTTSViaOpenRouter } from './tts-client'
import type {
  RenderedVideoAsset,
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

interface PreparedSceneTiming {
  scene: VideoScene
  start: number
  end: number
}

function makeExecution(
  phase: string,
  model: string,
  durationMs: number,
): VideoGenerationStepExecution {
  return {
    phase,
    agent_name: phase,
    model,
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
    duration_ms: Math.max(0, Math.round(durationMs)),
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

async function remoteImageToDataUrl(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem gerada (${response.status}) em ${url}`)
  }
  return blobToDataUrl(await response.blob())
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
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function createProceduralSoundtrack(
  durationSeconds: number,
  descriptor: string,
): Blob {
  const sampleRate = 22050
  const totalSamples = Math.max(sampleRate, Math.floor(durationSeconds * sampleRate))
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
    // Some browsers hand out a detached/consumed buffer after fetch pipelines;
    // cloning keeps decodeAudioData stable across object URLs and data URLs.
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
  for (const narration of sceneAssets) {
    if (!narration.narrationUrl) continue
    const timing = timings.find(item => item.scene.number === narration.sceneNumber)
    const sceneStart = timing?.start ?? 0
    await scheduleAudio(narration.narrationUrl, startAt + sceneStart, 1)
  }

  if (production.soundtrackAsset?.url) {
    await scheduleAudio(production.soundtrackAsset.url, startAt, 0.18)
  }

  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 720
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Falha ao criar canvas para renderização do vídeo.')

  const canvasStream = canvas.captureStream(30)
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ])

  const mimeType = getSupportedVideoMimeType()
  const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 6_000_000 })
  const chunks: BlobPart[] = []

  recorder.ondataavailable = event => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(recorder.error ?? new Error('Falha ao gravar o vídeo final'))
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
      onProgress?.(4, 4, 'media_video_render', `Renderizando vídeo final (${percent}%)`)
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
    await audioContext.close().catch(() => {})
  })

  return {
    blob,
    asset: {
      url: URL.createObjectURL(blob),
      mimeType,
      generatedAt: new Date().toISOString(),
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

export async function generateLiteralMediaAssets(
  apiKey: string,
  production: VideoProductionPackage,
  onProgress?: LiteralVideoProgressCallback,
  onPartialProduction?: (partialProduction: VideoProductionPackage) => void | Promise<void>,
): Promise<LiteralMediaGenerationResult> {
  const executions: VideoGenerationStepExecution[] = []
  const errors: string[] = []
  const models = await loadVideoPipelineModels()
  const existingAssets = new Map(
    (production.sceneAssets || []).map(asset => [asset.sceneNumber, asset]),
  )

  onProgress?.(1, 4, 'media_image_generation', 'Preparando geração real das imagens')
  const generatedAssets: VideoSceneAsset[] = []
  for (let index = 0; index < production.scenes.length; index++) {
    const scene = production.scenes[index]
    const existing = existingAssets.get(scene.number)
    const nextAsset: VideoSceneAsset = { sceneNumber: scene.number, ...existing }

    onProgress?.(1, 4, 'media_image_generation', `Gerando imagens das cenas (${index + 1}/${production.scenes.length})`)
    if (!nextAsset.imageUrl && scene.imagePrompt) {
      try {
        const startedAt = performance.now()
        const result = await generateImageViaOpenRouter({
          apiKey,
          model: chooseImageModel(models.video_designer),
          prompt: scene.imagePrompt,
          size: '1792x1024',
        })
        nextAsset.imageUrl = result.b64_json
          ? `data:image/png;base64,${result.b64_json}`
          : result.url
          ? await remoteImageToDataUrl(result.url)
          : undefined
        executions.push(makeExecution('media_image_generation', chooseImageModel(models.video_designer) || 'openai/dall-e-3', performance.now() - startedAt))
      } catch (error) {
        errors.push(`Cena ${scene.number}: falha ao gerar imagem (${error instanceof Error ? error.message : String(error)})`)
      }
    }

    generatedAssets.push(nextAsset)
  }

  onProgress?.(2, 4, 'media_tts_generation', 'Preparando geração real das narrações')
  for (let index = 0; index < production.scenes.length; index++) {
    const scene = production.scenes[index]
    const asset = generatedAssets.find(item => item.sceneNumber === scene.number)
    if (!asset) continue

    onProgress?.(2, 4, 'media_tts_generation', `Gerando narrações das cenas (${index + 1}/${production.scenes.length})`)
    if (!asset.narrationUrl && scene.narration) {
      try {
        const startedAt = performance.now()
        const result = await generateTTSViaOpenRouter({
          apiKey,
          model: chooseAudioModel(models.video_narrador),
          text: scene.narration,
          voice: 'nova',
        })
        asset.narrationUrl = await blobToDataUrl(result.audioBlob)
        executions.push(makeExecution('media_tts_generation', chooseAudioModel(models.video_narrador) || 'openai/tts-1-hd', performance.now() - startedAt))
      } catch (error) {
        errors.push(`Cena ${scene.number}: falha ao gerar narração (${error instanceof Error ? error.message : String(error)})`)
      }
    }

    if (onPartialProduction) {
      await onPartialProduction({
        ...production,
        sceneAssets: generatedAssets.filter(item => item.imageUrl || item.narrationUrl),
      })
    }
  }

  onProgress?.(3, 4, 'media_soundtrack_generation', 'Gerando trilha sonora da produção')
  let soundtrackAsset = production.soundtrackAsset
  if (!soundtrackAsset?.url) {
    try {
      const soundtrackStartedAt = performance.now()
      const soundtrackBlob = createProceduralSoundtrack(
        Math.max(1, production.totalDuration || prepareTimings(production).at(-1)?.end || 1),
        production.scenes.map(scene => scene.soundtrack).join(' '),
      )
      soundtrackAsset = {
        url: await blobToDataUrl(soundtrackBlob),
        mimeType: soundtrackBlob.type || 'audio/wav',
        generatedAt: new Date().toISOString(),
        description: 'Trilha sonora procedural gerada automaticamente',
      }
      executions.push(makeExecution('media_soundtrack_generation', 'browser/procedural-audio', performance.now() - soundtrackStartedAt))
    } catch (error) {
      errors.push(`Trilha sonora: falha na geração (${error instanceof Error ? error.message : String(error)})`)
    }
  }

  const mediaProduction: VideoProductionPackage = {
    ...production,
    sceneAssets: generatedAssets.filter(item => item.imageUrl || item.narrationUrl),
    soundtrackAsset,
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

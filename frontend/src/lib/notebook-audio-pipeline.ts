/**
 * Notebook Audio Overview Pipeline — generates podcast-style audio discussions
 * from notebook sources, similar to Google NotebookLM's Audio Overview feature.
 *
 * Pipeline:
 *   1. Script Generator — creates a natural 2-voice podcast script from sources
 *   2. TTS Generation — converts script segments to audio via OpenRouter TTS
 *
 * The script uses two hosts (A and B) discussing the topic naturally.
 */

import { callLLM, type LLMResult } from './llm-client'
import { loadResearchNotebookModels } from './model-config'
import type { AudioSegment } from '../components/artifacts/artifact-parsers'
import { generateTTSViaOpenRouter, type TTSResult } from './tts-client'

// ── Types ───────────────────────────────────────────────────────────────────

export interface AudioOverviewInput {
  apiKey: string
  topic: string
  description?: string
  sourceContext: string
}

export interface AudioOverviewScript {
  title: string
  duration: string
  segments: AudioSegment[]
}

export interface AudioOverviewResult {
  script: AudioOverviewScript
  audioBlob?: Blob          // Combined MP3 if TTS succeeded
  scriptExecution: {
    model: string
    tokens_in: number
    tokens_out: number
    cost_usd: number
    duration_ms: number
  }
}

export type AudioOverviewProgress = (phase: string, detail?: string) => void

export interface SynthesizeAudioFromScriptInput {
  apiKey: string
  rawScriptContent: string
  voice?: string
  model?: string
}

export interface SynthesizeAudioFromScriptResult {
  audioBlob: Blob
  mimeType: string
  chunkCount: number
  segmentCount: number
}

// ── Script generation ───────────────────────────────────────────────────────

const SCRIPT_SYSTEM_PROMPT = `Você é um roteirista de podcast profissional. Sua tarefa é criar um roteiro de podcast envolvente com DOIS apresentadores (Host A e Host B) discutindo um tema baseado nas fontes fornecidas.

RESPONDA com um JSON puro no seguinte schema (sem \`\`\`json):
{
  "title": "Título do episódio",
  "duration": "12-18 minutos",
  "segments": [
    {
      "time": "00:00",
      "type": "narracao",
      "speaker": "Host A" ou "Host B",
      "text": "Texto falado pelo host",
      "notes": "Indicação de tom, pausa, efeito (opcional)"
    }
  ]
}

Regras do roteiro:
- Host A é o apresentador principal: introduz o tema, guia a conversa, faz perguntas
- Host B é o especialista: traz insights, dados, exemplos, perspectivas diferentes
- A conversa deve ser NATURAL e ENGAJANTE — como dois amigos inteligentes conversando
- Use linguagem acessível mas informada
- Inclua momentos de humor leve, surpresa ("Nossa, isso é fascinante!")
- Faça perguntas retóricas ("E você sabia que...")
- Referencie as fontes naturalmente ("De acordo com os dados que analisamos...")
- Crie transições suaves entre subtemas
- Mínimo 30 segmentos para cobrir 12-18 minutos
- Abertura: Host A cumprimenta e apresenta o tema (2-3 segmentos)
- Desenvolvimento: alternância natural entre hosts (20+ segmentos)
- Fechamento: recap dos pontos principais + despedida (3-4 segmentos)
- Cada segmento de fala deve ter 2-4 frases (30-60 palavras)
- Inclua segmentos type "transicao" para mudanças de tema
- Inclua segmentos type "vinheta" para abertura e encerramento
- Responda em português brasileiro com tom conversacional`

function buildScriptPrompt(input: AudioOverviewInput): { system: string; user: string } {
  return {
    system: SCRIPT_SYSTEM_PROMPT,
    user: `Tema do episódio: "${input.topic}"
${input.description ? `Foco/objetivo: ${input.description}` : ''}

FONTES DISPONÍVEIS:
${input.sourceContext || '(Sem fontes — crie um episódio baseado em conhecimento geral sobre o tema)'}

Crie um roteiro de podcast profissional com dois hosts discutindo este tema.`,
  }
}

// ── Parse script response ───────────────────────────────────────────────────

function parseScriptResponse(content: string): AudioOverviewScript | null {
  try {
    // Try to extract JSON from response
    const fenceMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
    const jsonStr = fenceMatch ? fenceMatch[1].trim() : content.trim()

    const braceStart = jsonStr.indexOf('{')
    if (braceStart === -1) return null

    let depth = 0
    let end = braceStart
    for (let i = braceStart; i < jsonStr.length; i++) {
      if (jsonStr[i] === '{') depth++
      else if (jsonStr[i] === '}') depth--
      if (depth === 0) { end = i; break }
    }

    const obj = JSON.parse(jsonStr.slice(braceStart, end + 1))
    if (!obj.segments || !Array.isArray(obj.segments)) return null

    return {
      title: String(obj.title || 'Audio Overview'),
      duration: String(obj.duration || '15 minutos'),
      segments: obj.segments.map((s: Record<string, unknown>) => ({
        time: String(s.time || '00:00'),
        type: String(s.type || 'narracao'),
        speaker: s.speaker ? String(s.speaker) : undefined,
        text: String(s.text || ''),
        notes: s.notes ? String(s.notes) : undefined,
      })),
    }
  } catch {
    return null
  }
}

function buildNarrationTextFromRawScript(rawScriptContent: string): { text: string; segmentCount: number } {
  const parsed = parseScriptResponse(rawScriptContent)

  if (parsed?.segments?.length) {
    const fromSegments = parsed.segments
      .filter(s => s.type === 'narracao' && s.text.trim())
      .map(s => {
        const prefix = s.speaker ? `${s.speaker}: ` : ''
        return `${prefix}${s.text}`
      })
      .join('\n\n')

    if (fromSegments.trim().length > 50) {
      return { text: fromSegments, segmentCount: parsed.segments.length }
    }

    const fallbackAllSegments = parsed.segments
      .filter(s => s.text.trim())
      .map(s => {
        const prefix = s.speaker ? `${s.speaker}: ` : ''
        return `${prefix}${s.text}`
      })
      .join('\n\n')

    return { text: fallbackAllSegments, segmentCount: parsed.segments.length }
  }

  return {
    text: rawScriptContent.trim(),
    segmentCount: 0,
  }
}

function splitForTTS(text: string, maxChunkSize = 4000): string[] {
  const normalized = text.trim()
  if (!normalized) return []
  if (normalized.length <= maxChunkSize) return [normalized]

  const chunks: string[] = []
  let current = ''

  for (const sentence of normalized.split(/(?<=[.!?])\s+/)) {
    if (current.length + sentence.length > maxChunkSize && current.length > 0) {
      chunks.push(current)
      current = sentence
    } else {
      current += (current ? ' ' : '') + sentence
    }
  }

  if (current) chunks.push(current)
  return chunks
}

export async function synthesizeAudioFromScript(
  input: SynthesizeAudioFromScriptInput,
  onProgress?: AudioOverviewProgress,
): Promise<SynthesizeAudioFromScriptResult> {
  const { text, segmentCount } = buildNarrationTextFromRawScript(input.rawScriptContent)
  if (text.length < 20) {
    throw new Error('Roteiro sem conteúdo suficiente para sintetizar áudio.')
  }

  const chunks = splitForTTS(text)
  if (chunks.length === 0) {
    throw new Error('Não foi possível gerar blocos de áudio para TTS.')
  }

  const audioBlobs: Blob[] = []
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.('Gerando áudio literal...', `Parte ${i + 1} de ${chunks.length}`)
    const ttsResult: TTSResult = await generateTTSViaOpenRouter({
      apiKey: input.apiKey,
      text: chunks[i],
      voice: input.voice || 'nova',
      model: input.model || 'openai/tts-1-hd',
    })
    audioBlobs.push(ttsResult.audioBlob)

    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  const mimeType = audioBlobs[0]?.type || 'audio/mpeg'
  return {
    audioBlob: new Blob(audioBlobs, { type: mimeType }),
    mimeType,
    chunkCount: chunks.length,
    segmentCount,
  }
}

// ── Main pipeline ───────────────────────────────────────────────────────────

/**
 * Generate an Audio Overview — a podcast-style discussion of notebook sources.
 *
 * @param input — topic, sources, API key
 * @param onProgress — callback for UI progress updates
 * @param generateAudio — whether to also generate TTS audio (requires TTS model access)
 */
export async function generateAudioOverview(
  input: AudioOverviewInput,
  onProgress?: AudioOverviewProgress,
  generateAudio = false,
): Promise<AudioOverviewResult> {
  const models = await loadResearchNotebookModels()
  const scriptModel = models.studio_roteirista

  if (!scriptModel) {
    throw new Error('Modelo do Roteirista não configurado. Vá em Configurações > Caderno de Pesquisa e configure o agente "Roteirista".')
  }

  // ── Step 1: Generate script ──────────────────────────────────────────
  onProgress?.('Gerando roteiro do podcast...', 'Criando diálogo entre os hosts')

  const prompt = buildScriptPrompt(input)
  const llmResult: LLMResult = await callLLM(
    input.apiKey,
    prompt.system,
    prompt.user,
    scriptModel,
    10000,
    0.6, // Higher temperature for more natural conversation
  )

  const script = parseScriptResponse(llmResult.content)
  if (!script) {
    throw new Error('Falha ao gerar o roteiro do podcast. O modelo não retornou JSON válido.')
  }

  onProgress?.('Roteiro gerado!', `${script.segments.length} segmentos · ${script.duration}`)

  const result: AudioOverviewResult = {
    script,
    scriptExecution: {
      model: llmResult.model,
      tokens_in: llmResult.tokens_in,
      tokens_out: llmResult.tokens_out,
      cost_usd: llmResult.cost_usd,
      duration_ms: llmResult.duration_ms,
    },
  }

  // ── Step 2: Generate audio (optional) ────────────────────────────────
  if (generateAudio) {
    onProgress?.('Gerando áudio...', 'Convertendo texto em fala via TTS')

    try {
      // Combine all narration segments into one text for TTS
      const narrationText = script.segments
        .filter(s => s.type === 'narracao' && s.text.trim())
        .map(s => {
          const prefix = s.speaker ? `${s.speaker}: ` : ''
          return `${prefix}${s.text}`
        })
        .join('\n\n')

      if (narrationText.length > 50) {
        // For long texts, split into chunks (TTS APIs have limits)
        const maxChunkSize = 4000
        const chunks: string[] = []
        let current = ''

        for (const sentence of narrationText.split(/(?<=[.!?])\s+/)) {
          if (current.length + sentence.length > maxChunkSize && current.length > 0) {
            chunks.push(current)
            current = sentence
          } else {
            current += (current ? ' ' : '') + sentence
          }
        }
        if (current) chunks.push(current)

        const audioBlobs: Blob[] = []
        for (let i = 0; i < chunks.length; i++) {
          onProgress?.('Gerando áudio...', `Parte ${i + 1} de ${chunks.length}`)
          const ttsResult: TTSResult = await generateTTSViaOpenRouter({
            apiKey: input.apiKey,
            text: chunks[i],
            voice: 'nova',
            model: 'openai/tts-1-hd',
          })
          audioBlobs.push(ttsResult.audioBlob)
          // Brief pause between TTS calls
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }

        // Combine audio blobs
        result.audioBlob = new Blob(audioBlobs, { type: 'audio/mpeg' })
        onProgress?.('Áudio gerado!', `${chunks.length} partes combinadas`)
      }
    } catch (err) {
      // TTS failure is non-fatal — user still gets the script
      console.warn('TTS generation failed:', err)
      onProgress?.('Áudio indisponível', 'O roteiro foi gerado com sucesso. TTS falhou.')
    }
  }

  return result
}

import { parseArtifactContent } from '../components/artifacts/artifact-parsers'
import { callLLM, type LLMResult } from './llm-client'
import { synthesizeAudioFromScript } from './notebook-audio-pipeline'
import {
  loadAudioPipelineModels,
  validateScopedAgentModels,
} from './model-config'
import type {
  StudioPipelineInput,
  StudioProgressCallback,
  StudioStepExecution,
} from './notebook-studio-pipeline'

export interface AudioGenerationPipelineResult {
  content: string
  executions: StudioStepExecution[]
}

export interface AudioLiteralGenerationResult {
  audioBlob: Blob
  mimeType: string
  chunkCount: number
  segmentCount: number
  execution: StudioStepExecution
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
  }
}

function extractJsonPayload(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (fenced?.[1] || content).trim()
}

function normalizeAudioScript(raw: string): string {
  const parsed = parseArtifactContent('audio_script', extractJsonPayload(raw))
  if (parsed.kind !== 'audio_script') {
    throw new Error('O pipeline de áudio retornou um roteiro inválido. Ajuste o modelo configurado para o pipeline de áudio.')
  }

  return JSON.stringify({
    title: parsed.data.title,
    duration: parsed.data.duration,
    segments: parsed.data.segments,
    productionNotes: parsed.data.productionNotes,
  }, null, 2)
}

function buildPlanPrompt(input: StudioPipelineInput): { system: string; user: string } {
  return {
    system: 'Você é um Planejador de Áudio sênior. Estruture um plano editorial e técnico para um resumo em áudio jurídico. Responda em JSON puro com: title, objective, targetDuration, tone, segmentPlan[], soundIdentity, risks, sourceUsePlan.',
    user: [
      `Tema: ${input.topic}`,
      input.description ? `Objetivo adicional: ${input.description}` : '',
      input.customInstructions ? `Instruções do usuário: ${input.customInstructions}` : '',
      'Fontes disponíveis:',
      input.sourceContext || 'Sem fontes adicionais.',
      'Contexto recente da conversa:',
      input.conversationContext || 'Sem conversa anterior relevante.',
    ].filter(Boolean).join('\n\n'),
  }
}

function buildWriterPrompt(input: StudioPipelineInput, plan: string, research: string): { system: string; user: string } {
  return {
    system: 'Você é um Roteirista de Áudio profissional. Responda em JSON puro no schema: { title, duration, segments: [{ time, type, speaker, text, notes }], productionNotes[] }. O texto deve ser natural, falável, em português brasileiro, com progressão lógica e densidade jurídica alta.',
    user: [
      `Tema: ${input.topic}`,
      input.customInstructions ? `Instruções extras: ${input.customInstructions}` : '',
      'Plano editorial:',
      plan,
      'Pesquisa consolidada:',
      research,
      'Crie um resumo em áudio completo, pronto para edição e locução.',
    ].filter(Boolean).join('\n\n'),
  }
}

function buildDirectorPrompt(script: string): { system: string; user: string } {
  return {
    system: 'Você é um Diretor de Áudio. Receba um roteiro JSON e devolva o MESMO schema, refinando ordenação, tempo, transições e equilíbrio entre blocos. Responda apenas com JSON válido.',
    user: `Roteiro atual:\n\n${script}`,
  }
}

function buildProducerPrompt(script: string): { system: string; user: string } {
  return {
    system: 'Você é um Produtor Sonoro. Receba um roteiro JSON e devolva o MESMO schema, enriquecendo o campo notes e productionNotes com trilha, pausas, ambiência, intensidade e cues de produção. Responda apenas com JSON válido.',
    user: `Roteiro dirigido:\n\n${script}`,
  }
}

function buildReviewPrompt(script: string): { system: string; user: string } {
  return {
    system: 'Você é o Revisor Final de Áudio. Valide coerência, clareza, fluxo narrativo, redundâncias e prontidão para síntese. Devolva o mesmo schema JSON, corrigido e consistente. Responda apenas com JSON válido.',
    user: `Pacote final para revisão:\n\n${script}`,
  }
}

function toExecution(
  phase: string,
  agentName: string,
  result: LLMResult,
): StudioStepExecution {
  return {
    phase,
    agent_name: agentName,
    model: result.model,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    cost_usd: result.cost_usd,
    duration_ms: result.duration_ms,
  }
}

export async function runAudioGenerationPipeline(
  input: StudioPipelineInput,
  onProgress?: StudioProgressCallback,
  signal?: AbortSignal,
): Promise<AudioGenerationPipelineResult> {
  const models = await loadAudioPipelineModels()
  await validateScopedAgentModels('audio_pipeline_models', models)

  const requiredKeys = [
    'audio_planejador',
    'audio_roteirista',
    'audio_diretor',
    'audio_produtor_sonoro',
    'audio_revisor',
  ] as const

  const missing = requiredKeys.filter(key => !models[key])
  if (missing.length > 0) {
    throw new Error(`Agente(s) sem modelo no pipeline de áudio: ${missing.join(', ')}`)
  }

  const executions: StudioStepExecution[] = []

  throwIfAborted(signal)
  onProgress?.(1, 5, 'Planejando estrutura do áudio…')
  const planPrompt = buildPlanPrompt(input)
  const planResult = await callLLM(input.apiKey, planPrompt.system, planPrompt.user, models.audio_planejador, 2500, 0.2, { signal })
  executions.push(toExecution('audio_planejador', 'Planejador de Áudio', planResult))

  throwIfAborted(signal)
  onProgress?.(2, 5, 'Escrevendo o roteiro-base do áudio…')
  const writerPrompt = buildWriterPrompt(input, planResult.content, input.sourceContext || 'Sem fontes adicionais.')
  const writerResult = await callLLM(input.apiKey, writerPrompt.system, writerPrompt.user, models.audio_roteirista, 7000, 0.35, { signal })
  const writerDraft = normalizeAudioScript(writerResult.content)
  executions.push(toExecution('audio_roteirista', 'Roteirista de Áudio', writerResult))

  throwIfAborted(signal)
  onProgress?.(3, 5, 'Estruturando timing e transições…')
  const directorPrompt = buildDirectorPrompt(writerDraft)
  const directorResult = await callLLM(input.apiKey, directorPrompt.system, directorPrompt.user, models.audio_diretor, 7000, 0.25, { signal })
  const directedDraft = normalizeAudioScript(directorResult.content)
  executions.push(toExecution('audio_diretor', 'Diretor de Áudio', directorResult))

  throwIfAborted(signal)
  onProgress?.(4, 5, 'Aplicando direção sonora e cues…')
  const producerPrompt = buildProducerPrompt(directedDraft)
  const producerResult = await callLLM(input.apiKey, producerPrompt.system, producerPrompt.user, models.audio_produtor_sonoro, 7000, 0.25, { signal })
  const producedDraft = normalizeAudioScript(producerResult.content)
  executions.push(toExecution('audio_produtor_sonoro', 'Produtor Sonoro', producerResult))

  throwIfAborted(signal)
  onProgress?.(5, 5, 'Revisando o resumo em áudio…')
  const reviewPrompt = buildReviewPrompt(producedDraft)
  const reviewResult = await callLLM(input.apiKey, reviewPrompt.system, reviewPrompt.user, models.audio_revisor, 7000, 0.15, { signal })
  const finalContent = normalizeAudioScript(reviewResult.content)
  executions.push(toExecution('audio_revisor', 'Revisor Final de Áudio', reviewResult))

  return {
    content: finalContent,
    executions,
  }
}

export async function generateAudioLiteralMedia(
  input: {
    apiKey: string
    rawScriptContent: string
    voice?: string
    model?: string
  },
  onProgress?: StudioProgressCallback,
): Promise<AudioLiteralGenerationResult> {
  const models = await loadAudioPipelineModels()
  const ttsModel = input.model || models.audio_narrador || 'openai/tts-1-hd'
  const startedAt = Date.now()
  onProgress?.(1, 1, 'Gerando áudio literal…')

  const synthesis = await synthesizeAudioFromScript({
    apiKey: input.apiKey,
    rawScriptContent: input.rawScriptContent,
    voice: input.voice,
    model: ttsModel,
  })

  return {
    ...synthesis,
    execution: {
      phase: 'audio_literal_generation',
      agent_name: 'Narrador / TTS',
      model: ttsModel,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0.015 * (input.rawScriptContent.length / 1000),
      duration_ms: Date.now() - startedAt,
    },
  }
}
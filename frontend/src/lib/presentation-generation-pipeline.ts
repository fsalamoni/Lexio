import { parseArtifactContent } from '../components/artifacts/artifact-parsers'
import { callLLM, type LLMResult } from './llm-client'
import {
  loadPresentationPipelineModels,
  validateScopedAgentModels,
} from './model-config'
import type {
  StudioPipelineInput,
  StudioProgressCallback,
  StudioStepExecution,
} from './notebook-studio-pipeline'

export interface PresentationGenerationPipelineResult {
  content: string
  executions: StudioStepExecution[]
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

function normalizePresentation(raw: string): string {
  const parsed = parseArtifactContent('apresentacao', extractJsonPayload(raw))
  if (parsed.kind !== 'presentation') {
    throw new Error('O pipeline de apresentação retornou um JSON inválido. Ajuste o modelo configurado para o pipeline de apresentação.')
  }

  return JSON.stringify({
    title: parsed.data.title,
    slides: parsed.data.slides.map(slide => ({
      number: slide.number,
      title: slide.title,
      bullets: slide.bullets,
      speakerNotes: slide.speakerNotes,
      visualSuggestion: slide.visualSuggestion,
    })),
  }, null, 2)
}

function buildPlanPrompt(input: StudioPipelineInput): { system: string; user: string } {
  return {
    system: 'Você é um Planejador de Apresentação sênior. Responda em JSON puro com: title, audience, objective, narrativeArc, slidePlan[] (number, title, goal, keyPoints), visualDirection, risks.',
    user: [
      `Tema: ${input.topic}`,
      input.description ? `Objetivo e contexto: ${input.description}` : '',
      input.customInstructions ? `Instruções extras: ${input.customInstructions}` : '',
      'Fontes disponíveis:',
      input.sourceContext || 'Sem fontes adicionais.',
      'Contexto recente da conversa:',
      input.conversationContext || 'Sem conversa anterior relevante.',
    ].filter(Boolean).join('\n\n'),
  }
}

function buildResearchPrompt(input: StudioPipelineInput, plan: string): { system: string; user: string } {
  return {
    system: 'Você é um Pesquisador de Conteúdo para apresentações jurídicas. Responda em JSON puro com: centralClaims[], evidence[], examples[], numbers[], citations[], cautions[].',
    user: [
      `Tema: ${input.topic}`,
      'Plano narrativo:',
      plan,
      'Fontes para minerar:',
      input.sourceContext || 'Sem fontes adicionais.',
    ].join('\n\n'),
  }
}

function buildWriterPrompt(input: StudioPipelineInput, plan: string, research: string): { system: string; user: string } {
  return {
    system: 'Você é um Redator de Slides. Responda somente com JSON puro no schema: { title, slides: [{ number, title, bullets, speakerNotes, visualSuggestion }] }. Gere bullets densos e speaker notes completos em português brasileiro.',
    user: [
      `Tema: ${input.topic}`,
      'Plano da apresentação:',
      plan,
      'Pesquisa consolidada:',
      research,
      'Crie uma apresentação profissional, clara, progressiva e pronta para revisão.',
    ].join('\n\n'),
  }
}

function buildDesignerPrompt(slidesJson: string): { system: string; user: string } {
  return {
    system: 'Você é um Designer de Apresentação. Receba um JSON de slides e devolva o mesmo schema, aprimorando visualSuggestion, hierarquia, contraste, ritmo visual e coerência entre slides. Responda apenas com JSON válido.',
    user: `Apresentação atual:\n\n${slidesJson}`,
  }
}

function buildReviewPrompt(slidesJson: string): { system: string; user: string } {
  return {
    system: 'Você é o Revisor Final de Apresentação. Verifique fluxo, concisão, coerência, repetições, clareza e poder expositivo. Devolva o mesmo schema JSON, corrigido e consistente. Responda apenas com JSON válido.',
    user: `Apresentação para revisão:\n\n${slidesJson}`,
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

export async function runPresentationGenerationPipeline(
  input: StudioPipelineInput,
  onProgress?: StudioProgressCallback,
  signal?: AbortSignal,
): Promise<PresentationGenerationPipelineResult> {
  const models = await loadPresentationPipelineModels()
  await validateScopedAgentModels('presentation_pipeline_models', models)

  const requiredKeys = [
    'pres_planejador',
    'pres_pesquisador',
    'pres_redator',
    'pres_designer',
    'pres_revisor',
  ] as const

  const missing = requiredKeys.filter(key => !models[key])
  if (missing.length > 0) {
    throw new Error(`Agente(s) sem modelo no pipeline de apresentação: ${missing.join(', ')}`)
  }

  const executions: StudioStepExecution[] = []

  throwIfAborted(signal)
  onProgress?.(1, 5, 'Planejando a apresentação…')
  const planPrompt = buildPlanPrompt(input)
  const planResult = await callLLM(input.apiKey, planPrompt.system, planPrompt.user, models.pres_planejador, 3000, 0.2, { signal })
  executions.push(toExecution('pres_planejador', 'Planejador de Apresentação', planResult))

  throwIfAborted(signal)
  onProgress?.(2, 5, 'Pesquisando evidências e mensagens-chave…')
  const researchPrompt = buildResearchPrompt(input, planResult.content)
  const researchResult = await callLLM(input.apiKey, researchPrompt.system, researchPrompt.user, models.pres_pesquisador, 3500, 0.2, { signal })
  executions.push(toExecution('pres_pesquisador', 'Pesquisador de Conteúdo', researchResult))

  throwIfAborted(signal)
  onProgress?.(3, 5, 'Escrevendo os slides…')
  const writerPrompt = buildWriterPrompt(input, planResult.content, researchResult.content)
  const writerResult = await callLLM(input.apiKey, writerPrompt.system, writerPrompt.user, models.pres_redator, 9000, 0.3, { signal })
  const writtenSlides = normalizePresentation(writerResult.content)
  executions.push(toExecution('pres_redator', 'Redator de Slides', writerResult))

  throwIfAborted(signal)
  onProgress?.(4, 5, 'Refinando direção visual dos slides…')
  const designerPrompt = buildDesignerPrompt(writtenSlides)
  const designerResult = await callLLM(input.apiKey, designerPrompt.system, designerPrompt.user, models.pres_designer, 9000, 0.25, { signal })
  const designedSlides = normalizePresentation(designerResult.content)
  executions.push(toExecution('pres_designer', 'Designer de Apresentação', designerResult))

  throwIfAborted(signal)
  onProgress?.(5, 5, 'Revisando a apresentação…')
  const reviewPrompt = buildReviewPrompt(designedSlides)
  const reviewResult = await callLLM(input.apiKey, reviewPrompt.system, reviewPrompt.user, models.pres_revisor, 9000, 0.15, { signal })
  const finalContent = normalizePresentation(reviewResult.content)
  executions.push(toExecution('pres_revisor', 'Revisor de Apresentação', reviewResult))

  return {
    content: finalContent,
    executions,
  }
}
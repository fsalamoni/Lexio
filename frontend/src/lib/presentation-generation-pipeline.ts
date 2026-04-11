import { parseArtifactContent } from './artifact-parsers'
import { generateImageViaOpenRouter, DEFAULT_IMAGE_MODEL } from './image-generation-client'
import { callLLM, type LLMResult } from './llm-client'
import {
  loadPresentationPipelineModels,
  validateScopedAgentModels,
} from './model-config'
import { renderPresentationSlidePoster } from './notebook-visual-artifact-renderer'
import type {
  StudioPipelineInput,
  StudioProgressCallback,
  StudioStepExecution,
} from './notebook-studio-pipeline'
import type { ParsedPresentation, ParsedSlide } from './artifact-parsers'

export interface PresentationGenerationPipelineResult {
  content: string
  executions: StudioStepExecution[]
}

export interface GeneratedPresentationSlideVisual {
  slideNumber: number
  blob: Blob
  mimeType: string
  extension: string
  model: string
  costUsd: number
}

export interface PresentationMediaGenerationResult {
  slideVisuals: GeneratedPresentationSlideVisual[]
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

function buildDeckVisualSystem(input: Pick<StudioPipelineInput, 'topic' | 'description'>, presentation: ParsedPresentation): string {
  const slideTitles = presentation.slides.slice(0, 6).map(slide => slide.title).join(' | ')
  return [
    `Tema central: ${input.topic}.`,
    input.description ? `Objetivo executivo: ${input.description}.` : '',
    `Título da apresentação: ${presentation.title || input.topic}.`,
    slideTitles ? `Linha narrativa dos slides: ${slideTitles}.` : '',
    'Direção visual fixa: premium editorial, jurídico-institucional, elegante, contemporâneo, legível e coeso.',
    'Paleta dominante: navy profundo, azul cobalto, marfim, prata suave e acentos discretos.',
    'A imagem deve reforçar o conteúdo do slide sem introduzir assunto paralelo nem elementos aleatórios.',
  ].filter(Boolean).join(' ')
}

function buildPresentationImagePrompt(
  input: Pick<StudioPipelineInput, 'topic' | 'description'>,
  presentation: ParsedPresentation,
  slide: ParsedSlide,
  slideIndex: number,
): { prompt: string; negativePrompt: string } {
  const previous = slideIndex > 0 ? presentation.slides[slideIndex - 1]?.title : ''
  const next = slideIndex < presentation.slides.length - 1 ? presentation.slides[slideIndex + 1]?.title : ''
  const bulletSummary = slide.bullets.slice(0, 5).join('; ')
  const notesSnippet = slide.speakerNotes ? slide.speakerNotes.slice(0, 260) : ''
  const visualSystem = buildDeckVisualSystem(input, presentation)

  return {
    prompt: [
      'Crie uma imagem premium para compor um slide de apresentação jurídica.',
      visualSystem,
      `Slide ${slide.number} de ${presentation.slides.length}.`,
      `Título do slide: ${slide.title}.`,
      bulletSummary ? `Pontos centrais: ${bulletSummary}.` : '',
      notesSnippet ? `Contexto narrativo do apresentador: ${notesSnippet}.` : '',
      slide.visualSuggestion ? `Direção visual desejada: ${slide.visualSuggestion}.` : '',
      previous ? `Slide anterior: ${previous}.` : '',
      next ? `Próximo slide: ${next}.` : '',
      'A imagem será integrada ao layout final do slide, portanto precisa funcionar como herói visual ou painel editorial sofisticado.',
      'Use composição limpa, elementos relevantes ao conteúdo, profundidade elegante, sem poluição visual.',
      'Se houver pessoas, mantenha expressão profissional e contexto verossímil. Se o conteúdo for normativo, privilegie metáforas visuais institucionais, documentos, arquitetura, fluxos, conexões e símbolos discretos.',
    ].filter(Boolean).join(' '),
    negativePrompt: [
      'texto legível',
      'legendas',
      'parágrafos',
      'watermark',
      'mockup genérico desconexo',
      'elementos infantis',
      'estilo cartoon',
      'baixa resolução',
      'tipografia embutida',
      'infográfico textual',
      'mãos deformadas',
      'assunto fora do contexto',
    ].join(', '),
  }
}

export async function generatePresentationMediaAssets(
  input: Pick<StudioPipelineInput, 'apiKey' | 'topic' | 'description'>,
  rawPresentationContent: string,
  onProgress?: StudioProgressCallback,
  signal?: AbortSignal,
): Promise<PresentationMediaGenerationResult> {
  throwIfAborted(signal)
  const parsed = parseArtifactContent('apresentacao', rawPresentationContent)
  if (parsed.kind !== 'presentation') {
    throw new Error('A apresentação não possui estrutura válida para gerar slides visuais.')
  }

  const models = await loadPresentationPipelineModels()
  await validateScopedAgentModels('presentation_pipeline_models', models)
  const imageModel = models.pres_image_generator || DEFAULT_IMAGE_MODEL

  const slideVisuals: GeneratedPresentationSlideVisual[] = []
  const executions: StudioStepExecution[] = []

  for (let index = 0; index < parsed.data.slides.length; index++) {
    throwIfAborted(signal)
    const slide = parsed.data.slides[index]
    const renderStartedAt = Date.now()
    const stepLabel = `Gerando visual do slide ${index + 1} de ${parsed.data.slides.length}…`
    onProgress?.(index + 1, parsed.data.slides.length, stepLabel)

    let composed
    let execution: StudioStepExecution

    try {
      const prompt = buildPresentationImagePrompt(input, parsed.data, slide, index)
      throwIfAborted(signal)
      const generated = await generateImageViaOpenRouter({
        apiKey: input.apiKey,
        prompt: prompt.prompt,
        negativePrompt: prompt.negativePrompt,
        model: imageModel,
        aspectRatio: '16:9',
        signal,
      })
      composed = await renderPresentationSlidePoster(parsed.data, slide, {
        backgroundImageUrl: generated.imageDataUrl,
      })
      execution = {
        phase: 'pres_image_generator',
        agent_name: 'Gerador de Imagens de Slides',
        model: generated.model,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: generated.cost_usd,
        duration_ms: Date.now() - renderStartedAt,
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }
      composed = await renderPresentationSlidePoster(parsed.data, slide)
      execution = {
        phase: 'visual_artifact_render',
        agent_name: 'Renderizador Visual de Apresentação',
        model: 'browser/svg-render',
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        duration_ms: Date.now() - renderStartedAt,
      }
    }

    slideVisuals.push({
      slideNumber: slide.number,
      blob: composed.blob,
      mimeType: composed.mimeType,
      extension: composed.extension,
      model: execution.model,
      costUsd: execution.cost_usd,
    })
    executions.push(execution)
  }

  return {
    slideVisuals,
    executions,
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

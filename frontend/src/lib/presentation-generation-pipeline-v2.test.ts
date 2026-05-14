import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PresentationV2Deck } from './firestore-types'

const callLLMWithFallbackMock = vi.fn()
const callLLMWithMessagesFallbackMock = vi.fn()
const loadPresentationV2PipelineModelsMock = vi.fn()
const validateScopedAgentModelsMock = vi.fn()
const loadModelCatalogMock = vi.fn()
const isExternalVideoProviderConfiguredMock = vi.fn()
const buildPipelineFallbackResolverMock = vi.fn()
const loadFallbackPriorityConfigMock = vi.fn()
const createOrchestratorUsageExecutionMock = vi.fn()
const resolveOrchestratorModelMock = vi.fn()
const generateImageViaOpenRouterMock = vi.fn()
const renderPresentationSlidePosterMock = vi.fn()
const generateTTSMock = vi.fn()
const requestExternalVideoClipMock = vi.fn()

vi.mock('./llm-client', () => ({
  callLLMWithFallback: (...args: unknown[]) => callLLMWithFallbackMock(...args),
  callLLMWithMessagesFallback: (...args: unknown[]) => callLLMWithMessagesFallbackMock(...args),
}))

vi.mock('./model-catalog', () => ({
  loadModelCatalog: (...args: unknown[]) => loadModelCatalogMock(...args),
}))

vi.mock('./image-generation-client', () => ({
  generateImageViaOpenRouter: (...args: unknown[]) => generateImageViaOpenRouterMock(...args),
  DEFAULT_IMAGE_MODEL: 'demo/image-model',
}))

vi.mock('./notebook-visual-artifact-renderer', () => ({
  renderPresentationSlidePoster: (...args: unknown[]) => renderPresentationSlidePosterMock(...args),
  renderPresentationV2StructuredAsset: vi.fn(),
}))

vi.mock('./tts-client', () => ({
  generateTTS: (...args: unknown[]) => generateTTSMock(...args),
  DEFAULT_OPENROUTER_TTS_MODEL: 'demo/tts-model',
}))

vi.mock('./external-video-provider', () => ({
  isExternalVideoProviderConfigured: (...args: unknown[]) => isExternalVideoProviderConfiguredMock(...args),
  requestExternalVideoClip: (...args: unknown[]) => requestExternalVideoClipMock(...args),
}))

vi.mock('./model-config', () => ({
  buildPipelineFallbackResolver: (...args: unknown[]) => buildPipelineFallbackResolverMock(...args),
  loadFallbackPriorityConfig: (...args: unknown[]) => loadFallbackPriorityConfigMock(...args),
  loadPresentationV2PipelineModels: (...args: unknown[]) => loadPresentationV2PipelineModelsMock(...args),
  PRESENTATION_V2_PIPELINE_AGENT_DEFS: [],
  validateScopedAgentModels: (...args: unknown[]) => validateScopedAgentModelsMock(...args),
}))

vi.mock('./pipeline-orchestrator', () => ({
  createOrchestratorUsageExecution: (...args: unknown[]) => createOrchestratorUsageExecutionMock(...args),
  resolveOrchestratorModel: (...args: unknown[]) => resolveOrchestratorModelMock(...args),
}))

const baseModels = {
  presentation_v2_clarifier: 'demo/text-model',
  presentation_v2_orchestrator: 'demo/text-model',
  presentation_v2_context_auditor: 'demo/text-model',
  presentation_v2_narrative_planner: 'demo/text-model',
  presentation_v2_researcher: 'demo/text-model',
  presentation_v2_content_architect: 'demo/text-model',
  presentation_v2_slide_writer: 'demo/text-model',
  presentation_v2_visual_director: 'demo/text-model',
  presentation_v2_data_diagrammer: 'demo/text-model',
  presentation_v2_asset_planner: 'demo/text-model',
  presentation_v2_reviewer: 'demo/text-model',
  presentation_v2_packager: 'demo/text-model',
  presentation_v2_image_generator: 'demo/image-model',
  presentation_v2_tts: 'demo/tts-model',
}

import {
  auditPresentationV2ExportReadiness,
  auditPresentationV2MultimodalCoherence,
  draftPresentationV2ClarifyingQuestions,
  generatePresentationV2AudioNarration,
  generatePresentationV2MediaAssets,
  generatePresentationV2VideoClips,
  inspectPresentationV2Preflight,
  runPresentationGenerationPipelineV2,
} from './presentation-generation-pipeline-v2'

function llmResult(content: string) {
  return {
    content,
    model: 'demo/text-model',
    tokens_in: 120,
    tokens_out: 80,
    cost_usd: 0.001,
    duration_ms: 20,
  }
}

function buildImageDataUrl(base64Length = 180_000) {
  return `data:image/png;base64,${'A'.repeat(base64Length)}`
}

function buildWeakPackagedDeck(): PresentationV2Deck {
  return {
    schemaVersion: 'presentation_v2.1',
    title: 'Estratégia de audiência',
    subtitle: 'Aprovação executiva',
    generationSpec: {
      request: 'Construir a apresentação final para aprovação da estratégia.',
      objective: 'Aprovar a estratégia final do caso.',
      audience: 'Diretoria jurídica',
      slideCount: 2,
      depth: 'profunda',
      durationMinutes: 12,
      language: 'pt-BR',
      outputFormat: 'pptx',
      multimodal: { images: true, charts: true },
      constraints: ['Linguagem sóbria'],
      sourcePriority: ['Parecer interno', 'Matriz de risco'],
    },
    outline: {
      narrativeArc: 'Problema, tese e decisão.',
      sections: [
        { id: 'section-1', title: 'Contexto', purpose: 'Abrir a tese', slideNumbers: [1] },
        { id: 'section-2', title: 'Decisão', purpose: 'Fechar a recomendação', slideNumbers: [2] },
      ],
    },
    theme: {
      name: 'Lexio Premium',
      mood: 'institucional',
      palette: ['#0F172A', '#CBD5E1', '#0EA5E9'],
      layoutPrinciples: ['hierarquia clara', 'alto contraste'],
    },
    slides: [
      {
        id: 'slide-1',
        number: 1,
        sectionId: '',
        title: 'Slide 1',
        purpose: '',
        layout: 'default',
        bullets: [
          'Mesmo argumento repetido.',
          'Mesmo argumento repetido.',
          'Mesmo argumento repetido.',
          'Mesmo argumento repetido.',
          'Mesmo argumento repetido.',
          'Mesmo argumento repetido.',
        ],
        speakerNotes: 'Breve.',
        transition: '',
        visualBrief: '',
        designNotes: [],
        assets: [{ id: 'slide-1-chart', type: 'chart', status: 'planned' }],
      },
      {
        id: 'slide-2',
        number: 2,
        sectionId: 'section-2',
        title: 'Decisão recomendada',
        purpose: 'Fechar a recomendação.',
        layout: 'two-column-argument',
        bullets: [
          'O cenário recomendado preserva caixa e reduz incerteza.',
          'A decisão pedida é autorizar a rodada final de negociação.',
        ],
        speakerNotes: 'Fechar a recomendação, apontando custo evitado e próximo passo imediato.',
        transition: 'Encerrar com decisão e próximos passos.',
        visualBrief: 'Matriz comparativa sóbria.',
        designNotes: ['Comparativo limpo'],
        chartSpec: { type: 'matrix', x: 'risco', y: 'retorno' },
        assets: [{ id: 'slide-2-chart', type: 'chart', status: 'planned', altText: 'Matriz risco-retorno' }],
      },
    ],
    assets: [
      { id: 'slide-1-chart', type: 'chart', status: 'planned' },
      { id: 'slide-2-chart', type: 'chart', status: 'planned', altText: 'Matriz risco-retorno' },
    ],
    quality: {
      score: 68,
      strengths: ['Boa tese central.'],
      warnings: ['Slide 1 ainda fraco.'],
      accessibility: [],
      legalAccuracyNotes: [],
    },
    exportHints: {
      aspectRatio: '16:9',
      preferredExport: 'pptx',
      includeSpeakerNotes: true,
      useRenderedSlideFallback: true,
    },
    revisionHistory: [],
  }
}

describe('inspectPresentationV2Preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadPresentationV2PipelineModelsMock.mockResolvedValue(baseModels)
    validateScopedAgentModelsMock.mockResolvedValue(undefined)
    loadModelCatalogMock.mockResolvedValue([])
    buildPipelineFallbackResolverMock.mockReturnValue(() => [])
    loadFallbackPriorityConfigMock.mockResolvedValue({})
    createOrchestratorUsageExecutionMock.mockReturnValue({
      source_type: 'presentation_pipeline_v2',
      source_id: 'presentation-v2-demo',
      phase: 'presentation_v2_orchestrator',
      agent_name: 'Orquestrador v2',
      model: 'demo/text-model',
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      duration_ms: 0,
    })
    resolveOrchestratorModelMock.mockReturnValue('demo/text-model')
    callLLMWithFallbackMock.mockResolvedValue({
      content: '{"needsClarification":false,"consolidatedBrief":"Briefing consolidado.","questions":[]}',
      model: 'demo/text-model',
      tokens_in: 120,
      tokens_out: 80,
      cost_usd: 0.001,
      duration_ms: 20,
    })
    callLLMWithMessagesFallbackMock.mockResolvedValue(llmResult('{"quality":{"score":88,"strengths":["Boa composição."],"warnings":[]},"retryRecommended":false,"fallbackRecommended":false}'))
    generateImageViaOpenRouterMock.mockResolvedValue({
      imageDataUrl: buildImageDataUrl(),
      model: 'demo/image-model',
      provider_id: 'demo-provider',
      provider_label: 'Demo Provider',
      cost_usd: 0.02,
    })
    renderPresentationSlidePosterMock.mockResolvedValue({
      blob: new Blob(['png'], { type: 'image/png' }),
      mimeType: 'image/png',
      extension: '.png',
    })
  })

  it('blocks requested video when no external provider is configured', async () => {
    isExternalVideoProviderConfiguredMock.mockReturnValue(false)

    const result = await inspectPresentationV2Preflight({
      slideCount: 10,
      objective: 'Convencer o comitê a aprovar a tese',
      audience: 'Comitê executivo',
      coreMessage: 'A tese reduz risco regulatório e destrava expansão.',
      successCriteria: 'Aprovação do plano com próximos passos definidos.',
      sourcePriority: 'Parecer interno\nDados do contencioso',
      slideDensity: 'equilibrada',
      evidenceMode: 'reforcada',
      durationMinutes: 12,
      multimodal: { video: true },
      mediaRequirements: { video: 'required' },
    })

    expect(validateScopedAgentModelsMock).toHaveBeenCalledWith(
      'presentation_v2_pipeline_models',
      expect.objectContaining({ presentation_v2_video_generator: '' }),
      undefined,
    )
    expect(result.activeMediaAgents).not.toContain('presentation_v2_video_generator')
    expect(result.ready).toBe(false)
    expect(result.blockers).toContain('Vídeo obrigatório sem provedor externo configurado. Configure VITE_EXTERNAL_VIDEO_PROVIDER_* ou torne vídeo opcional no briefing.')
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Vídeo', status: 'blocked' }),
    ]))
  })

  it('allows requested video when the provider is configured and validation passes', async () => {
    isExternalVideoProviderConfiguredMock.mockReturnValue(true)

    const result = await inspectPresentationV2Preflight({
      slideCount: 10,
      objective: 'Convencer o comitê a aprovar a tese',
      audience: 'Comitê executivo',
      coreMessage: 'A tese reduz risco regulatório e destrava expansão.',
      successCriteria: 'Aprovação do plano com próximos passos definidos.',
      sourcePriority: 'Parecer interno\nDados do contencioso',
      slideDensity: 'equilibrada',
      evidenceMode: 'reforcada',
      durationMinutes: 12,
      multimodal: { video: true },
      mediaRequirements: { video: 'required' },
    })

    expect(result.activeMediaAgents).not.toContain('presentation_v2_video_generator')
    expect(result.blockers).toEqual([])
    expect(result.ready).toBe(true)
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Vídeo', status: 'ok' }),
    ]))
  })

  it('degrades optional video to warning when no external provider is configured', async () => {
    isExternalVideoProviderConfiguredMock.mockReturnValue(false)

    const result = await inspectPresentationV2Preflight({
      slideCount: 10,
      objective: 'Convencer o comitê a aprovar a tese',
      audience: 'Comitê executivo',
      coreMessage: 'A tese reduz risco regulatório e destrava expansão.',
      successCriteria: 'Aprovação do plano com próximos passos definidos.',
      sourcePriority: 'Parecer interno\nDados do contencioso',
      slideDensity: 'equilibrada',
      evidenceMode: 'reforcada',
      durationMinutes: 12,
      multimodal: { video: true },
      mediaRequirements: { video: 'optional' },
    })

    expect(result.ready).toBe(true)
    expect(result.blockers).toEqual([])
    expect(result.warnings).toContain('Vídeo opcional sem provedor externo configurado; o deck poderá seguir sem clipes materializados.')
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Vídeo', status: 'warning' }),
    ]))
  })

  it('blocks incomplete premium briefs and flags cognitive overload risks', async () => {
    isExternalVideoProviderConfiguredMock.mockReturnValue(true)

    const result = await inspectPresentationV2Preflight({
      slideCount: 18,
      depth: 'tecnica',
      durationMinutes: 8,
      objective: '',
      audience: '',
      coreMessage: '',
      successCriteria: '',
      slideDensity: 'densa',
      evidenceMode: 'estrita',
      sourcePriority: '',
      multimodal: { charts: true, diagrams: true },
      mediaRequirements: { charts: 'required', diagrams: 'optional' },
    })

    expect(result.ready).toBe(false)
    expect(result.blockers).toContain('Defina o objetivo central do deck antes de gerar.')
    expect(result.blockers).toContain('Defina a tese ou mensagem central que deve permanecer após a apresentação.')
    expect(result.blockers).toContain('Modo de evidência estrita exige prioridade de fontes preenchida.')
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Contrato do briefing', status: 'blocked' }),
      expect.objectContaining({ label: 'Fontes e lastro', status: 'blocked' }),
      expect.objectContaining({ label: 'Carga cognitiva e tempo', status: 'blocked' }),
    ]))
    expect(result.warnings).toContain('Especifique o público principal para calibrar repertório, tom e abstração.')
    expect(result.warnings).toContain('Defina o que caracteriza sucesso para o deck final.')
  })

  it('blocks strict evidence mode when the notebook has no promoted sources', async () => {
    isExternalVideoProviderConfiguredMock.mockReturnValue(true)

    const result = await inspectPresentationV2Preflight({
      slideCount: 12,
      depth: 'profunda',
      durationMinutes: 18,
      objective: 'Convencer a diretoria a validar a estratégia.',
      audience: 'Diretoria jurídica',
      coreMessage: 'A tese é defensável e financeiramente melhor.',
      successCriteria: 'Aprovação da estratégia com próximos passos.',
      slideDensity: 'equilibrada',
      evidenceMode: 'estrita',
      sourcePriority: 'Parecer interno\nDados do passivo',
      sourceAudit: {
        includedSources: 0,
        totalSources: 3,
        includedChars: 0,
        truncatedSources: 0,
        totalContextChars: 120,
      },
      multimodal: { charts: true },
      mediaRequirements: { charts: 'required' },
    })

    expect(result.ready).toBe(false)
    expect(result.blockers).toContain('O caderno não possui fontes promovidas para sustentar um deck com evidência estrita.')
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Cobertura real das fontes', status: 'blocked' }),
    ]))
  })

  it('warns when the active notebook window has shallow or truncated source coverage', async () => {
    isExternalVideoProviderConfiguredMock.mockReturnValue(true)

    const result = await inspectPresentationV2Preflight({
      slideCount: 14,
      depth: 'profunda',
      durationMinutes: 18,
      objective: 'Convencer a diretoria a validar a estratégia.',
      audience: 'Diretoria jurídica',
      coreMessage: 'A tese é defensável e financeiramente melhor.',
      successCriteria: 'Aprovação da estratégia com próximos passos.',
      slideDensity: 'equilibrada',
      evidenceMode: 'reforcada',
      sourcePriority: 'Parecer interno\nDados do passivo',
      sourceAudit: {
        includedSources: 1,
        totalSources: 5,
        includedChars: 260,
        truncatedSources: 2,
        totalContextChars: 540,
      },
      multimodal: { images: true },
      mediaRequirements: { images: 'optional' },
    })

    expect(result.ready).toBe(true)
    expect(result.blockers).toEqual([])
    expect(result.warnings).toEqual(expect.arrayContaining([
      'O volume textual promovido do caderno (260 chars) pode ser insuficiente para 14 slides com a profundidade atual.',
      'Somente 1/5 fontes do caderno entraram na janela ativa do estúdio.',
      '2 fonte(s) foram truncadas na janela atual; parte do lastro pode ter ficado fora desta rodada.',
    ]))
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Cobertura real das fontes', status: 'warning' }),
    ]))
  })

  it('warns when strict evidence and visual media lack explicit proof and institutional rules', async () => {
    isExternalVideoProviderConfiguredMock.mockReturnValue(true)

    const result = await inspectPresentationV2Preflight({
      slideCount: 12,
      depth: 'profunda',
      durationMinutes: 16,
      objective: 'Convencer a diretoria a validar a estratégia.',
      audience: 'Diretoria jurídica',
      coreMessage: 'A tese é defensável e financeiramente melhor.',
      successCriteria: 'Aprovação da estratégia com próximos passos.',
      slideDensity: 'equilibrada',
      evidenceMode: 'estrita',
      sourcePriority: 'Parecer interno\nDados do passivo',
      sourceAudit: {
        includedSources: 2,
        totalSources: 2,
        includedChars: 1600,
        truncatedSources: 0,
        totalContextChars: 1800,
      },
      multimodal: { images: true, charts: true },
      mediaRequirements: { images: 'optional', charts: 'required' },
      proofObligations: '',
      institutionalConstraints: '',
    })

    expect(result.ready).toBe(true)
    expect(result.warnings).toEqual(expect.arrayContaining([
      'Modo de evidência estrita sem obrigações de prova explícitas pode deixar o deck sem prioridades probatórias claras.',
      'Restrições institucionais e visuais não foram explicitadas; o design pode sair desalinhado com a governança esperada.',
    ]))
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Regras probatórias e institucionais', status: 'warning' }),
    ]))
  })
})

describe('draftPresentationV2ClarifyingQuestions', () => {
  it('adds deterministic premium-brief questions even when the model returns none', async () => {
    const result = await draftPresentationV2ClarifyingQuestions({
      apiKey: 'demo-key',
      topic: 'Estratégia de audiência',
      sourceContext: 'Fonte resumida',
      conversationContext: 'Conversa curta',
      customInstructions: 'Briefing estruturado do Gerador de Apresentação v2',
      artifactType: 'apresentacao_v2',
      artifactLabel: 'Apresentação v2',
      presentationV2Briefing: {
        slideCount: 18,
        depth: 'profunda',
        objective: '',
        audience: '',
        coreMessage: '',
        successCriteria: '',
        proofObligations: '',
        institutionalConstraints: '',
        slideDensity: 'densa',
        evidenceMode: 'estrita',
        multimodal: { images: true, video: true, charts: true },
        mediaRequirements: { images: 'optional', video: 'optional', charts: 'optional' },
        sourcePriority: '',
      },
    })

    expect(result.needsClarification).toBe(true)
    expect(result.questions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'briefing-objective', category: 'content' }),
      expect.objectContaining({ id: 'briefing-core-message', category: 'content' }),
      expect.objectContaining({ id: 'briefing-audience', category: 'audience' }),
      expect.objectContaining({ id: 'briefing-success-criteria' }),
      expect.objectContaining({ id: 'briefing-proof-obligations', category: 'constraints' }),
      expect.objectContaining({ id: 'briefing-evidence-priority', category: 'constraints' }),
    ]))
    expect(result.questions).toHaveLength(6)
  })

  it('asks for institutional constraints when core briefing and proof obligations are already explicit', async () => {
    const result = await draftPresentationV2ClarifyingQuestions({
      apiKey: 'demo-key',
      topic: 'Estratégia de audiência',
      sourceContext: 'Fonte resumida',
      conversationContext: 'Conversa curta',
      artifactType: 'apresentacao_v2',
      artifactLabel: 'Apresentação v2',
      presentationV2Briefing: {
        slideCount: 10,
        depth: 'profunda',
        objective: 'Aprovar a estratégia de audiência.',
        audience: 'Diretoria jurídica',
        coreMessage: 'A tese oferece a melhor relação risco-retorno.',
        successCriteria: 'Sinal verde para a rodada final.',
        proofObligations: 'Linha do tempo contratual\nImpacto financeiro',
        institutionalConstraints: '',
        durationMinutes: 12,
        slideDensity: 'equilibrada',
        evidenceMode: 'estrita',
        multimodal: { images: true },
        mediaRequirements: { images: 'required' },
        sourcePriority: 'Parecer interno\nMatriz de risco',
      },
    })

    expect(result.questions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'briefing-institutional-constraints', category: 'design' }),
    ]))
  })

  it('merges deterministic questions with model-generated ones without duplicates', async () => {
    callLLMWithFallbackMock.mockResolvedValueOnce({
      content: JSON.stringify({
        needsClarification: true,
        consolidatedBrief: 'Briefing consolidado pelo clarificador.',
        questions: [
          {
            id: 'briefing-audience',
            question: 'Quem é o público principal e qual o nível de tecnicidade esperado?',
            category: 'audience',
          },
          {
            id: 'custom-risk-angle',
            question: 'Há algum risco reputacional que precise aparecer no fechamento?',
            category: 'constraints',
          },
        ],
      }),
      model: 'demo/text-model',
      tokens_in: 140,
      tokens_out: 100,
      cost_usd: 0.0012,
      duration_ms: 24,
    })

    const result = await draftPresentationV2ClarifyingQuestions({
      apiKey: 'demo-key',
      topic: 'Estratégia de audiência',
      sourceContext: 'Fonte resumida',
      conversationContext: 'Conversa curta',
      artifactType: 'apresentacao_v2',
      artifactLabel: 'Apresentação v2',
      presentationV2Briefing: {
        slideCount: 12,
        depth: 'profunda',
        objective: 'Aprovar a linha de negociação',
        audience: '',
        coreMessage: 'A proposta minimiza risco e preserva margem de acordo.',
        successCriteria: 'Sair com autorização para a rodada final.',
        proofObligations: 'Comparativo de cenários',
        institutionalConstraints: 'Linguagem sóbria',
        durationMinutes: 10,
        slideDensity: 'equilibrada',
        evidenceMode: 'reforcada',
        multimodal: { images: true },
        mediaRequirements: { images: 'optional' },
        sourcePriority: 'Minuta de acordo\nMatriz de risco',
      },
    })

    expect(result.questions.filter((question) => question.id === 'briefing-audience')).toHaveLength(1)
    expect(result.questions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'briefing-audience' }),
      expect.objectContaining({ id: 'custom-risk-angle' }),
    ]))
    expect(result.consolidatedBrief).toBe('Briefing consolidado pelo clarificador.')
  })

  it('builds a structured consolidated brief fallback when the model omits it', async () => {
    callLLMWithFallbackMock.mockResolvedValueOnce({
      content: JSON.stringify({
        needsClarification: false,
        questions: [],
      }),
      model: 'demo/text-model',
      tokens_in: 90,
      tokens_out: 60,
      cost_usd: 0.0008,
      duration_ms: 18,
    })

    const result = await draftPresentationV2ClarifyingQuestions({
      apiKey: 'demo-key',
      topic: 'Estratégia de audiência',
      sourceContext: 'Fonte resumida',
      conversationContext: 'Conversa curta',
      artifactType: 'apresentacao_v2',
      artifactLabel: 'Apresentação v2',
      presentationV2Briefing: {
        slideCount: 10,
        depth: 'executiva',
        objective: 'Aprovar a linha de negociação.',
        audience: 'Diretoria jurídica',
        coreMessage: 'O acordo é a opção com melhor relação risco-retorno.',
        successCriteria: 'Autorização para proposta final.',
        proofObligations: 'Matriz de risco e impacto financeiro',
        institutionalConstraints: 'Sem exposição de dados sigilosos',
        durationMinutes: 12,
        slideDensity: 'equilibrada',
        evidenceMode: 'reforcada',
        multimodal: { images: true, charts: true },
        mediaRequirements: { images: 'optional', charts: 'required' },
        sourcePriority: 'Matriz de risco\nMinuta de acordo',
        constraints: 'Sem linguagem agressiva',
      },
    })

    expect(result.consolidatedBrief).toContain('Objetivo: Aprovar a linha de negociação.')
    expect(result.consolidatedBrief).toContain('Mensagem central: O acordo é a opção com melhor relação risco-retorno.')
    expect(result.consolidatedBrief).toContain('Mídias habilitadas: imagens (opcional), gráficos (obrigatória)')
    expect(result.consolidatedBrief).toContain('Obrigações de prova: Matriz de risco e impacto financeiro')
    expect(result.consolidatedBrief).toContain('Restrições institucionais/visuais: Sem exposição de dados sigilosos')
    expect(result.consolidatedBrief).toContain('Fontes prioritárias: Matriz de risco; Minuta de acordo')
  })

  it('applies selective repairs and stores a slide-by-slide rubric in the final deck', async () => {
    callLLMWithFallbackMock
      .mockResolvedValueOnce(llmResult(JSON.stringify({ usableSources: ['Parecer interno'], gaps: [], risks: [], constraints: [], contentSignals: [], designSignals: [], mediaOpportunities: [] })))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        title: 'Estratégia de audiência',
        subtitle: 'Aprovação executiva',
        audience: 'Diretoria jurídica',
        objective: 'Aprovar a estratégia final do caso.',
        slideCount: 2,
        durationMinutes: 12,
        depth: 'profunda',
        narrativeArc: 'Problema, tese e decisão.',
        sections: [
          { id: 'section-1', title: 'Contexto', purpose: 'Abrir a tese' },
          { id: 'section-2', title: 'Decisão', purpose: 'Fechar a recomendação' },
        ],
        slideIntentMap: [],
      })))
      .mockResolvedValueOnce(llmResult(JSON.stringify({ claims: [], evidence: ['Parecer interno'], citations: [], examples: [], numbers: [], controversies: [], cautions: [] })))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        slides: [
          { number: 1, sectionId: 'section-1', title: 'Abertura', purpose: 'Abrir a tese', evidenceRefs: ['e1'], cognitiveLoad: 'medium', transition: '', recommendedLayout: 'default' },
          { number: 2, sectionId: 'section-2', title: 'Decisão', purpose: 'Fechar a recomendação', evidenceRefs: ['e2'], cognitiveLoad: 'medium', transition: 'Encerrar decisão', recommendedLayout: 'two-column-argument' },
        ],
      })))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        title: 'Estratégia de audiência',
        subtitle: 'Aprovação executiva',
        slides: buildWeakPackagedDeck().slides,
      })))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        theme: buildWeakPackagedDeck().theme,
        slides: [
          { number: 1, layout: 'default', visualBrief: '', designNotes: [] },
          { number: 2, layout: 'two-column-argument', visualBrief: 'Matriz comparativa sóbria.', designNotes: ['Comparativo limpo'] },
        ],
      })))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        slides: [{ number: 2, chartSpec: { type: 'matrix', x: 'risco', y: 'retorno' } }],
        assets: [{ id: 'slide-2-chart', type: 'chart', status: 'planned', altText: 'Matriz risco-retorno' }],
        dataWarnings: [],
      })))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        slides: [
          { number: 1, assets: [{ id: 'slide-1-chart', type: 'chart', status: 'planned' }] },
          { number: 2, assets: [{ id: 'slide-2-chart', type: 'chart', status: 'planned', altText: 'Matriz risco-retorno' }] },
        ],
        assets: buildWeakPackagedDeck().assets,
      })))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        quality: {
          score: 68,
          strengths: ['Boa tese central.'],
          warnings: ['Slide 1 ainda fraco.'],
          accessibility: [],
          legalAccuracyNotes: [],
        },
        revisionNotes: [
          {
            slideNumber: 1,
            severity: 'high',
            category: 'content',
            issue: 'Título genérico e speaker notes superficiais.',
            recommendedAgent: 'presentation_v2_slide_writer',
            repairPrompt: 'Reescrever o slide com decisão explícita, notes robustas e melhor transição.',
          },
          {
            slideNumber: 1,
            severity: 'medium',
            category: 'design',
            issue: 'Layout genérico e sem direção visual.',
            recommendedAgent: 'presentation_v2_visual_director',
            repairPrompt: 'Definir layout hero e visual institucional coerente.',
          },
        ],
      })))
      .mockResolvedValueOnce(llmResult(JSON.stringify(buildWeakPackagedDeck())))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        slide: {
          number: 1,
          sectionId: 'section-1',
          title: 'Janela de decisão',
          purpose: 'Abrir a recomendação executiva.',
          layout: 'hero-left',
          bullets: [
            'O caso entrou em janela crítica de negociação com risco financeiro relevante.',
            'A tese recomendada reduz exposição sem sacrificar margem de acordo.',
            'A decisão pedida hoje é autorizar a rodada final com parâmetros claros.',
          ],
          speakerNotes: 'Abrir o deck explicando por que a estratégia proposta concentra o melhor equilíbrio entre risco, custo e viabilidade negocial, preparando a ponte para a decisão final.',
          transition: 'Na sequência, demonstramos por que a tese é a opção com melhor relação risco-retorno.',
        },
      })))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        slide: {
          number: 1,
          layout: 'hero-left',
          visualBrief: 'Mesa executiva institucional com documentos estratégicos e atmosfera sóbria.',
          designNotes: ['Contraste alto', 'Hierarquia editorial forte'],
        },
      })))

    const result = await runPresentationGenerationPipelineV2({
      apiKey: 'demo-key',
      topic: 'Estratégia de audiência',
      description: 'Aprovação final da estratégia do caso.',
      sourceContext: 'Parecer interno e matriz de risco.',
      conversationContext: 'A diretoria precisa decidir hoje.',
      artifactType: 'apresentacao_v2',
      artifactLabel: 'Apresentação v2',
    })

    const deck = JSON.parse(result.content) as PresentationV2Deck

    expect(callLLMWithFallbackMock.mock.calls.length).toBeGreaterThanOrEqual(12)
    expect(deck.slides[0].title).toBe('Janela de decisão')
    expect(deck.slides[0].layout).toBe('hero-left')
    expect(deck.theme.designSystem?.layoutFamilies).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'hero', slideNumbers: expect.arrayContaining([1]) }),
      expect.objectContaining({ id: 'split', slideNumbers: expect.arrayContaining([2]) }),
    ]))
    expect(deck.theme.designSystem?.hierarchyRules?.length).toBeGreaterThan(0)
    expect(deck.quality?.deckRubric?.score).toBeGreaterThanOrEqual(74)
    expect(deck.quality?.slideRubric?.[0]?.recommendedAgents).toEqual(expect.arrayContaining(['presentation_v2_slide_writer']))
    expect(deck.quality?.repairSummary).toEqual(expect.arrayContaining([
      expect.stringContaining('Slide 1: reparo seletivo aplicado por presentation_v2_slide_writer.'),
      expect.stringContaining('Slide 1: reparo seletivo aplicado por presentation_v2_visual_director.'),
    ]))
    expect(deck.revisionHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ repairKind: 'review' }),
      expect.objectContaining({ repairKind: 'selective_repair', repairAgent: 'presentation_v2_slide_writer' }),
    ]))
    expect(result.executions).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: 'presentation_v2_slide_writer_repair' }),
      expect.objectContaining({ phase: 'presentation_v2_visual_director_repair' }),
    ]))
  })
})

describe('generatePresentationV2MediaAssets', () => {
  beforeEach(() => {
    loadPresentationV2PipelineModelsMock.mockResolvedValue(baseModels)
    validateScopedAgentModelsMock.mockResolvedValue(undefined)
    callLLMWithMessagesFallbackMock.mockReset()
    callLLMWithMessagesFallbackMock.mockResolvedValue(llmResult('{"quality":{"score":88,"strengths":["Boa composição."],"warnings":[]},"retryRecommended":false,"fallbackRecommended":false}'))
    generateImageViaOpenRouterMock.mockReset()
    generateImageViaOpenRouterMock.mockResolvedValue({
      imageDataUrl: buildImageDataUrl(),
      model: 'demo/image-model',
      provider_id: 'demo-provider',
      provider_label: 'Demo Provider',
      cost_usd: 0.02,
    })
    renderPresentationSlidePosterMock.mockReset()
    renderPresentationSlidePosterMock.mockResolvedValue({
      blob: new Blob(['png'], { type: 'image/png' }),
      mimeType: 'image/png',
      extension: '.png',
    })
  })

  it('limits generated slide visuals to the requested slide numbers', async () => {
    const result = await generatePresentationV2MediaAssets({
      apiKey: 'demo-key',
      topic: 'Estratégia de audiência',
      description: 'Aprovação da tese final.',
    }, JSON.stringify(buildWeakPackagedDeck()), undefined, undefined, { slideNumbers: [2] })

    expect(result.slideVisuals).toHaveLength(1)
    expect(result.slideVisuals[0].slideNumber).toBe(2)
    expect(generateImageViaOpenRouterMock).toHaveBeenCalledTimes(1)
    expect(renderPresentationSlidePosterMock).toHaveBeenCalledTimes(1)
  })

  it('enriches image prompts with design-system, governance and source signals', async () => {
    await generatePresentationV2MediaAssets({
      apiKey: 'demo-key',
      topic: 'Estratégia de audiência',
      description: 'Aprovação da tese final.',
    }, JSON.stringify({
      ...buildWeakPackagedDeck(),
      generationSpec: {
        ...buildWeakPackagedDeck().generationSpec,
        constraints: ['Sem dramatização visual', 'Identidade institucional sóbria'],
        sourcePriority: ['Parecer interno', 'Matriz de risco'],
      },
      theme: {
        ...buildWeakPackagedDeck().theme,
        accessibilityNotes: ['Preservar contraste alto'],
        designSystem: {
          narrativeMode: 'linear-decisorio',
          surfaceStyle: 'Superfícies limpas e editoriais',
          contrastStrategy: 'Blocos de alto contraste com fundo limpo',
          accentStrategy: 'Acentos teal apenas para decisão',
          hierarchyRules: ['Um ponto focal por slide.'],
          layoutFamilies: [
            { id: 'hero', label: 'Hero / abertura', usage: 'Abrir seções', slideNumbers: [1] },
            { id: 'split', label: 'Split argumentativo', usage: 'Comparar argumentos', slideNumbers: [2] },
          ],
        },
      },
    }))

    const firstCall = generateImageViaOpenRouterMock.mock.calls[0]?.[0]
    expect(firstCall.prompt).toContain('Modo narrativo do deck: linear-decisorio.')
    expect(firstCall.prompt).toContain('Estratégia de contraste: Blocos de alto contraste com fundo limpo.')
    expect(firstCall.prompt).toContain('Família de layout: Hero / abertura.')
    expect(firstCall.prompt).toContain('Lastro documental prioritário: Parecer interno; Matriz de risco.')
    expect(firstCall.prompt).toContain('Restrições institucionais e de acessibilidade: Sem dramatização visual; Identidade institucional sóbria; Preservar contraste alto.')
    expect(firstCall.negativePrompt).toContain('texto legível')
    expect(generateImageViaOpenRouterMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('retries once with a critic-guided prompt before settling on the poster renderer output', async () => {
    generateImageViaOpenRouterMock
      .mockRejectedValueOnce(new Error('temporary image failure'))
      .mockResolvedValueOnce({
        imageDataUrl: buildImageDataUrl(),
        model: 'demo/image-model',
        provider_id: 'demo-provider',
        provider_label: 'Demo Provider',
        cost_usd: 0.03,
      })

    const result = await generatePresentationV2MediaAssets({
      apiKey: 'demo-key',
      topic: 'Estratégia de audiência',
      description: 'Aprovação da tese final.',
    }, JSON.stringify({
      ...buildWeakPackagedDeck(),
      generationSpec: {
        ...buildWeakPackagedDeck().generationSpec,
        constraints: ['Sem dramatização visual'],
        sourcePriority: ['Parecer interno'],
      },
      theme: {
        ...buildWeakPackagedDeck().theme,
        designSystem: {
          narrativeMode: 'linear-decisorio',
          surfaceStyle: 'Superfícies limpas',
          contrastStrategy: 'Contraste alto',
          accentStrategy: 'Acento teal',
          hierarchyRules: ['Um ponto focal por slide.'],
          layoutFamilies: [
            { id: 'hero', label: 'Hero / abertura', usage: 'Abrir seções', slideNumbers: [1] },
            { id: 'split', label: 'Split argumentativo', usage: 'Comparar argumentos', slideNumbers: [2] },
          ],
        },
      },
      slides: buildWeakPackagedDeck().slides.map((slide) => ({
        ...slide,
        visualBrief: '',
        assets: slide.number === 1 ? [] : slide.assets,
      })),
      assets: buildWeakPackagedDeck().assets.filter(asset => asset.id !== 'slide-1-chart'),
    }))

    expect(generateImageViaOpenRouterMock).toHaveBeenCalledTimes(3)
    expect(generateImageViaOpenRouterMock.mock.calls[1][0].prompt).toContain('Regeneração orientada por critic interno')
    expect(renderPresentationSlidePosterMock).toHaveBeenCalledTimes(2)
    expect(result.slideVisuals[0].prompt).toContain('Regeneração orientada por critic interno')
    expect(result.slideVisuals[0].qualityWarnings?.length).toBeGreaterThan(0)
    expect(result.slideVisuals[0].retryCount).toBe(1)
    expect(result.slideVisuals[0].qualityScore).toBeGreaterThanOrEqual(70)
    expect(result.slideVisuals[0].providerId).toBe('demo-provider')
    expect(result.slideVisuals[0].providerLabel).toBe('Demo Provider')
    expect(result.executions).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: 'presentation_v2_image_generator', model: 'demo/image-model' }),
    ]))
  })

  it('forces one critic-guided regeneration when the prompt quality score is below the threshold', async () => {
    const result = await generatePresentationV2MediaAssets({
      apiKey: 'demo-key',
      topic: 'Estratégia de audiência',
      description: 'Aprovação da tese final.',
    }, JSON.stringify({
      ...buildWeakPackagedDeck(),
      generationSpec: {
        ...buildWeakPackagedDeck().generationSpec,
        constraints: [],
        sourcePriority: [],
      },
      theme: {
        ...buildWeakPackagedDeck().theme,
        designSystem: {
          narrativeMode: 'linear-decisorio',
          surfaceStyle: 'Superfícies limpas',
          contrastStrategy: 'Contraste alto',
          accentStrategy: 'Acento teal',
          hierarchyRules: ['Um ponto focal por slide.'],
          layoutFamilies: [
            { id: 'hero', label: 'Hero / abertura', usage: 'Abrir seções', slideNumbers: [1] },
            { id: 'split', label: 'Split argumentativo', usage: 'Comparar argumentos', slideNumbers: [2] },
          ],
        },
      },
      slides: buildWeakPackagedDeck().slides.map((slide) => ({
        ...slide,
        visualBrief: '',
        assets: [],
      })),
      assets: [],
    }))

    expect(generateImageViaOpenRouterMock.mock.calls[1][0].prompt).toContain('Regeneração orientada por critic interno')
    expect(result.slideVisuals[0].retryCount).toBe(1)
    expect(result.slideVisuals[0].prompt).toContain('Regeneração orientada por critic interno')
  })

  it('rejects undersized generated images and persists the browser poster fallback', async () => {
    generateImageViaOpenRouterMock
      .mockResolvedValueOnce({
        imageDataUrl: buildImageDataUrl(24),
        model: 'demo/image-model',
        provider_id: 'demo-provider',
        provider_label: 'Demo Provider',
        cost_usd: 0.03,
      })
      .mockResolvedValueOnce({
        imageDataUrl: buildImageDataUrl(24),
        model: 'demo/image-model',
        provider_id: 'demo-provider',
        provider_label: 'Demo Provider',
        cost_usd: 0.03,
      })

    const result = await generatePresentationV2MediaAssets({
      apiKey: 'demo-key',
      topic: 'Estratégia de audiência',
      description: 'Aprovação da tese final.',
    }, JSON.stringify({
      ...buildWeakPackagedDeck(),
      generationSpec: {
        ...buildWeakPackagedDeck().generationSpec,
        constraints: ['Sem dramatização visual'],
        sourcePriority: ['Parecer interno'],
      },
      theme: {
        ...buildWeakPackagedDeck().theme,
        designSystem: {
          narrativeMode: 'linear-decisorio',
          surfaceStyle: 'Superfícies limpas',
          contrastStrategy: 'Contraste alto',
          accentStrategy: 'Acento teal',
          hierarchyRules: ['Um ponto focal por slide.'],
          layoutFamilies: [
            { id: 'hero', label: 'Hero / abertura', usage: 'Abrir seções', slideNumbers: [1] },
            { id: 'split', label: 'Split argumentativo', usage: 'Comparar argumentos', slideNumbers: [2] },
          ],
        },
      },
      slides: buildWeakPackagedDeck().slides.map((slide) => ({
        ...slide,
        visualBrief: '',
        assets: slide.number === 1 ? [] : slide.assets,
      })),
      assets: buildWeakPackagedDeck().assets.filter(asset => asset.id !== 'slide-1-chart'),
    }))

    expect(generateImageViaOpenRouterMock).toHaveBeenCalledTimes(3)
    expect(result.slideVisuals[0].model).toBe('browser/svg-render')
    expect(result.slideVisuals[0].providerId).toBe('browser')
    expect(result.slideVisuals[0].qualityScore).toBeLessThanOrEqual(57)
    expect(result.slideVisuals[0].qualityWarnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Payload visual muito pequeno'),
      expect.stringContaining('Fallback seguro aplicado'),
    ]))
  })

  it('uses the multimodal reviewer to reject semantically weak images before persistence', async () => {
    callLLMWithMessagesFallbackMock.mockResolvedValue(llmResult('{"quality":{"score":34,"strengths":[],"warnings":["Cena desconectada do argumento do slide."]},"retryRecommended":true,"fallbackRecommended":true,"summary":"Imagem semanticamente inadequada para o slide."}'))

    const result = await generatePresentationV2MediaAssets({
      apiKey: 'demo-key',
      topic: 'Estratégia de audiência',
      description: 'Aprovação da tese final.',
    }, JSON.stringify({
      ...buildWeakPackagedDeck(),
      generationSpec: {
        ...buildWeakPackagedDeck().generationSpec,
        constraints: ['Sem dramatização visual'],
        sourcePriority: ['Parecer interno'],
      },
      theme: {
        ...buildWeakPackagedDeck().theme,
        designSystem: {
          narrativeMode: 'linear-decisorio',
          surfaceStyle: 'Superfícies limpas',
          contrastStrategy: 'Contraste alto',
          accentStrategy: 'Acento teal',
          hierarchyRules: ['Um ponto focal por slide.'],
          layoutFamilies: [
            { id: 'hero', label: 'Hero / abertura', usage: 'Abrir seções', slideNumbers: [1] },
            { id: 'split', label: 'Split argumentativo', usage: 'Comparar argumentos', slideNumbers: [2] },
          ],
        },
      },
      slides: buildWeakPackagedDeck().slides.map((slide) => ({
        ...slide,
        assets: slide.number === 1 ? [] : slide.assets,
      })),
      assets: buildWeakPackagedDeck().assets.filter(asset => asset.id !== 'slide-1-chart'),
    }))

    const criticMessages = callLLMWithMessagesFallbackMock.mock.calls[0]?.[1] as Array<{ role: string; content: unknown }>

    expect(criticMessages[1]?.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text' }),
      expect.objectContaining({
        type: 'image_url',
        image_url: expect.objectContaining({ url: expect.stringContaining('data:image/png;base64,') }),
      }),
    ]))
    expect(result.slideVisuals[0].model).toBe('browser/svg-render')
    expect(result.slideVisuals[0].providerId).toBe('browser')
    expect(result.slideVisuals[0].qualityWarnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Cena desconectada do argumento do slide.'),
      expect.stringContaining('Imagem semanticamente inadequada para o slide.'),
    ]))
    expect(result.executions).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: 'presentation_v2_image_reviewer', agent_name: 'Revisor Multimodal v2 (imagem)' }),
    ]))
  })
})

describe('auditPresentationV2MultimodalCoherence', () => {
  it('builds a deck-level snapshot with slide-level gaps and low-confidence media', () => {
    const deck: PresentationV2Deck = {
      ...buildWeakPackagedDeck(),
      generationSpec: {
        ...buildWeakPackagedDeck().generationSpec,
        multimodal: { images: true, charts: true, audio: true, video: true },
      },
      slides: [
        {
          ...buildWeakPackagedDeck().slides[0],
          visualBrief: 'Abrir com visual executivo.',
          assets: [
            {
              id: 'slide-1-render',
              type: 'render',
              status: 'stored',
              url: 'https://example.com/slide-1.png',
              qualityScore: 84,
            },
          ],
        },
        {
          ...buildWeakPackagedDeck().slides[1],
          visualBrief: '',
          assets: [
            { id: 'slide-2-chart', type: 'chart', status: 'planned', altText: 'Matriz risco-retorno' },
            {
              id: 'slide-2-video',
              type: 'video',
              status: 'stored',
              url: 'https://example.com/slide-2.mp4',
              qualityScore: 66,
              qualityWarnings: ['Clipe ainda desalinhado com o pacing final.'],
            },
          ],
        },
      ],
      assets: [
        {
          id: 'slide-1-render',
          type: 'render',
          status: 'stored',
          url: 'https://example.com/slide-1.png',
          qualityScore: 84,
        },
        { id: 'slide-2-chart', type: 'chart', status: 'planned', altText: 'Matriz risco-retorno' },
        {
          id: 'slide-2-video',
          type: 'video',
          status: 'stored',
          url: 'https://example.com/slide-2.mp4',
          qualityScore: 66,
          qualityWarnings: ['Clipe ainda desalinhado com o pacing final.'],
        },
        {
          id: 'deck-narration-audio',
          type: 'audio',
          status: 'stored',
          url: 'https://example.com/narracao.mp3',
          qualityScore: 70,
          qualityWarnings: ['Duração estimada da narração ficou muito distante do tempo-alvo do deck.'],
        },
      ],
    }

    const audit = auditPresentationV2MultimodalCoherence(deck)

    expect(audit.score).toBeLessThan(75)
    expect(audit.status).toBe('review')
    expect(audit.auditedAssetTypes).toEqual(expect.arrayContaining(['render', 'audio', 'video']))
    expect(audit.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('gráfico/diagrama planejado materializado'),
      expect.stringContaining('narração final ainda exige revisão'),
    ]))
    expect(audit.slides).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slideNumber: 2,
        status: 'review',
        missingAssetTypes: expect.arrayContaining(['chart/diagram']),
      }),
    ]))
  })
})

describe('auditPresentationV2ExportReadiness', () => {
  it('tracks alt-text coverage and export review blockers after media persistence', () => {
    const deck: PresentationV2Deck = {
      ...buildWeakPackagedDeck(),
      outline: {
        ...buildWeakPackagedDeck().outline,
        sections: [{ id: 'section-2', title: 'Decisão', purpose: 'Fechar a recomendação', slideNumbers: [2] }],
      },
      slides: [
        {
          ...buildWeakPackagedDeck().slides[0],
          sectionId: '',
          speakerNotes: 'Curta.',
          assets: [
            {
              id: 'slide-1-render',
              type: 'render',
              status: 'stored',
              url: 'https://example.com/slide-1.png',
            },
          ],
        },
        {
          ...buildWeakPackagedDeck().slides[1],
          sectionId: 'section-2',
          speakerNotes: 'Fechar a recomendação, apontando custo evitado e próximo passo imediato com clareza suficiente para a exportação final.',
        },
      ],
      assets: [
        {
          id: 'slide-1-render',
          type: 'render',
          status: 'stored',
          url: 'https://example.com/slide-1.png',
        },
      ],
      quality: {
        multimodalAudit: { score: 67, status: 'review' },
      },
    }

    const readiness = auditPresentationV2ExportReadiness(deck)

    expect(readiness.status).toBe('critical')
    expect(readiness.altTextCoverage).toBe(0)
    expect(readiness.blockingIssues).toEqual(expect.arrayContaining([
      expect.stringContaining('sem alt text validado'),
    ]))
    expect(readiness.missingAltTextAssets).toEqual(['render:slide-1-render'])
    expect(readiness.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('sem alt text validado'),
      expect.stringContaining('speaker notes rasas'),
      expect.stringContaining('sem seção explícita'),
      expect.stringContaining('Coerência multimodal ainda exige revisão'),
    ]))
  })

  it('blocks export readiness when analytical visuals lose documentary traceability', () => {
    const deck: PresentationV2Deck = {
      ...buildWeakPackagedDeck(),
      slides: buildWeakPackagedDeck().slides.map((slide) => ({
        ...slide,
        sectionId: slide.sectionId || 'section-1',
        speakerNotes: 'Notas completas para exportação com contexto jurídico e próximos passos objetivos.',
      })),
      assets: [
        {
          id: 'slide-1-chart',
          type: 'chart',
          status: 'stored',
          url: 'https://example.com/chart-1.png',
          altText: 'Gráfico comparativo do risco contratual',
        },
      ],
      quality: {
        multimodalAudit: { score: 92, status: 'ok' },
        deckRubric: { score: 91, status: 'ok' },
        legalAccuracyNotes: [],
      },
      generationSpec: {
        ...buildWeakPackagedDeck().generationSpec,
        sourcePriority: [],
      },
    }

    const readiness = auditPresentationV2ExportReadiness(deck)

    expect(readiness.status).toBe('critical')
    expect(readiness.blockingIssues).toEqual([
      'Charts/diagramas materializados ainda sem fontes prioritárias explícitas no manifesto final.',
    ])
    expect(readiness.legalAccuracyNotes).toEqual(expect.arrayContaining([
      'Charts/diagramas materializados ainda sem fontes prioritárias explícitas no manifesto final.',
    ]))
    expect(readiness.warnings).toEqual(expect.arrayContaining([
      'Charts/diagramas materializados ainda sem fontes prioritárias explícitas no manifesto final.',
    ]))
  })

  it('blocks export readiness when the operator rejects a visual asset', () => {
    const baseDeck = buildWeakPackagedDeck()
    const deck: PresentationV2Deck = {
      ...baseDeck,
      slides: baseDeck.slides.map((slide) => ({
        ...slide,
        sectionId: slide.sectionId || 'section-1',
        speakerNotes: 'Notas completas para exportação com contexto jurídico, lastro documental e próximos passos objetivos.',
      })),
      assets: [
        {
          id: 'slide-1-render',
          type: 'render',
          status: 'stored',
          url: 'https://example.com/slide-1.png',
          altText: 'Visual final do slide 1',
          operatorReview: {
            status: 'rejected',
            at: '2026-05-14T10:00:00.000Z',
            source: 'viewer_asset',
          },
        },
      ],
      quality: {
        multimodalAudit: { score: 91, status: 'ok' },
        deckRubric: { score: 91, status: 'ok' },
      },
      generationSpec: {
        ...baseDeck.generationSpec,
        sourcePriority: ['Memorando interno'],
        constraints: ['Usar identidade institucional Lexio'],
      },
    }

    const readiness = auditPresentationV2ExportReadiness(deck)

    expect(readiness.status).toBe('critical')
    expect(readiness.blockingIssues).toEqual(expect.arrayContaining([
      '1 asset(s) visual(is) rejeitado(s) pelo operador ainda constam no manifesto final.',
    ]))
  })
})

describe('generatePresentationV2AudioNarration', () => {
  beforeEach(() => {
    loadPresentationV2PipelineModelsMock.mockResolvedValue(baseModels)
    validateScopedAgentModelsMock.mockResolvedValue(undefined)
    generateTTSMock.mockReset()
    generateTTSMock.mockResolvedValue({
      audioBlob: new Blob(['audio'], { type: 'audio/mpeg' }),
      model: 'demo/tts-model',
      provider_id: 'demo-provider',
      provider_label: 'Demo Provider',
      durationEstimate: 120,
    })
  })

  it('scores narration alignment against the deck pacing', async () => {
    const result = await generatePresentationV2AudioNarration({
      apiKey: 'demo-key',
    }, JSON.stringify(buildWeakPackagedDeck()))

    expect(result.qualityScore).toBeLessThan(72)
    expect(result.qualityWarnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Duração estimada da narração ficou muito distante do tempo-alvo do deck.'),
      expect.stringContaining('Revisão humana recomendada antes de tratar a narração como asset final.'),
    ]))
  })

  it('limits narration text to the selected slide when slide numbers are provided', async () => {
    const result = await generatePresentationV2AudioNarration({
      apiKey: 'demo-key',
    }, JSON.stringify(buildWeakPackagedDeck()), undefined, { slideNumbers: [2] })

    expect(result.slideNumbers).toEqual([2])
    expect(result.narrationText).toContain('Narração parcial focada no(s) slide(s) 2.')
    expect(result.narrationText).toContain('Slide 2: Decisão recomendada.')
    expect(result.narrationText).not.toContain('Slide 1: Slide 1.')
    expect(generateTTSMock).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Slide 2: Decisão recomendada.'),
    }))
  })
})

describe('generatePresentationV2VideoClips', () => {
  beforeEach(() => {
    isExternalVideoProviderConfiguredMock.mockReturnValue(true)
    requestExternalVideoClipMock.mockReset()
    requestExternalVideoClipMock.mockResolvedValue({
      url: 'https://example.com/clip.mp4',
      provider: 'demo-video',
      mimeType: 'video/mp4',
      jobId: 'job-1',
    })
  })

  it('flags fallback clip coverage when no explicit video asset was planned in the deck', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(new Blob(['video'], { type: 'video/mp4' }), { status: 200, headers: { 'Content-Type': 'video/mp4' } }),
    )

    const result = await generatePresentationV2VideoClips(JSON.stringify(buildWeakPackagedDeck()), { maxClips: 1 })

    expect(result.clips).toHaveLength(1)
    expect(result.clips[0].qualityScore).toBeLessThan(86)
    expect(result.clips[0].qualityWarnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Clipe gerado por fallback de cobertura, sem asset de vídeo explicitamente planejado no manifesto.'),
    ]))

    fetchSpy.mockRestore()
  })

  it('limits fallback clip generation to the selected slide', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(new Blob(['video'], { type: 'video/mp4' }), { status: 200, headers: { 'Content-Type': 'video/mp4' } }),
    )

    const result = await generatePresentationV2VideoClips(JSON.stringify(buildWeakPackagedDeck()), { maxClips: 3, slideNumbers: [2] })

    expect(result.clips).toHaveLength(1)
    expect(result.clips[0].slideNumber).toBe(2)
    expect(requestExternalVideoClipMock).toHaveBeenCalledTimes(1)
    expect(requestExternalVideoClipMock).toHaveBeenCalledWith(expect.objectContaining({ sceneNumber: 2 }))

    fetchSpy.mockRestore()
  })
})
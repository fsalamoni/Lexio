import { createUsageExecutionRecord } from '../lib/cost-analytics'
import type { PresentationV2Deck, ResearchNotebookData, StudioArtifact } from '../lib/firestore-types'

function svgDataUrl(title: string, subtitle: string, accent: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f8fafc"/>
          <stop offset="1" stop-color="#e0f2fe"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#bg)"/>
      <rect x="86" y="86" width="1428" height="728" rx="28" fill="#ffffff" stroke="#cbd5e1" stroke-width="4"/>
      <rect x="118" y="118" width="18" height="664" rx="9" fill="${accent}"/>
      <text x="180" y="330" fill="#0f172a" font-size="76" font-family="Arial, Helvetica, sans-serif" font-weight="700">${title}</text>
      <text x="184" y="410" fill="#475569" font-size="38" font-family="Arial, Helvetica, sans-serif">${subtitle}</text>
      <circle cx="1268" cy="270" r="92" fill="${accent}" opacity="0.14"/>
      <circle cx="1378" cy="380" r="58" fill="#14b8a6" opacity="0.16"/>
      <path d="M980 620 C1080 520 1188 690 1310 560 S1488 568 1510 486" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round" opacity="0.45"/>
      <text x="184" y="724" fill="#64748b" font-size="28" font-family="Arial, Helvetica, sans-serif">Lexio Presentation v2 demo</text>
    </svg>
  `
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const slideRenderUrls = [
  svgDataUrl('Tese central', 'Responsabilidade objetiva e prova do dano', '#2563eb'),
  svgDataUrl('Mapa probatorio', 'Fatos, documentos e pontos controvertidos', '#0f766e'),
  svgDataUrl('Risco processual', 'Cenarios de acordo e litigio', '#b45309'),
  svgDataUrl('Plano de acao', 'Proximos movimentos e documentos faltantes', '#7c3aed'),
]

const chartUrl = svgDataUrl('Matriz de risco', 'Probabilidade x impacto por frente juridica', '#dc2626')
const diagramUrl = svgDataUrl('Fluxo decisorio', 'Triagem, evidencia, tese e providencia', '#0891b2')

const demoDeck: PresentationV2Deck = {
  schemaVersion: 'presentation_v2.1',
  title: 'Estrategia juridica para audiencia de conciliacao',
  subtitle: 'Demo local do Gerador de Apresentacao v2 com slides, dados e assets materializados',
  generationSpec: {
    request: 'Criar uma apresentacao executiva para preparar uma audiencia de conciliacao em disputa contratual.',
    objective: 'Alinhar tese, riscos, concessoes possiveis e proximas provas.',
    audience: 'Socios do escritorio e cliente institucional',
    slideCount: 4,
    durationMinutes: 8,
    depth: 'executiva',
    language: 'pt-BR',
    tone: 'tecnico, claro e orientado a decisao',
    visualStyle: 'institucional claro, com graficos e mapa de decisao',
    outputFormat: 'pptx',
    multimodal: {
      images: true,
      audio: true,
      video: true,
      charts: true,
      diagrams: true,
    },
    constraints: ['Nao expor dados pessoais reais', 'Usar linguagem de reuniao executiva'],
    sourcePriority: ['Contrato principal e aditivos', 'Troca de e-mails de aceite parcial', 'Memoria de calculo financeiro consolidada'],
    clarifications: [
      {
        id: 'audience',
        question: 'Quem vai assistir?',
        answer: 'Cliente institucional e equipe juridica interna.',
        category: 'audience',
      },
    ],
  },
  outline: {
    narrativeArc: 'Comeca pela tese, organiza a prova, estima riscos e termina com decisao operacional.',
    sections: [
      { id: 'tese', title: 'Tese', purpose: 'Fixar a posicao juridica', slideNumbers: [1] },
      { id: 'prova', title: 'Provas', purpose: 'Mapear evidencias disponiveis', slideNumbers: [2] },
      { id: 'risco', title: 'Riscos', purpose: 'Comparar cenarios', slideNumbers: [3] },
      { id: 'acao', title: 'Acao', purpose: 'Definir proximos passos', slideNumbers: [4] },
    ],
  },
  theme: {
    name: 'Lexio claro institucional',
    mood: 'Preciso, sobrio e orientado a tomada de decisao.',
    palette: ['#0f172a', '#2563eb', '#0f766e', '#b45309', '#f8fafc'],
    fontPairing: { heading: 'Aptos Display', body: 'Aptos' },
    layoutPrinciples: ['Uma mensagem por slide', 'Evidencia visual antes de texto longo', 'Notas de fala completas'],
    accessibilityNotes: ['Contraste alto', 'Titulos curtos', 'Sem texto embutido em imagens criticas'],
    designSystem: {
      narrativeMode: 'linear-decisorio',
      surfaceStyle: 'Superficies claras, editoriais e juridico-institucionais.',
      contrastStrategy: 'Contraste alto entre blocos de decisao, fundo claro e acentos frios.',
      accentStrategy: 'Azul para decisao, teal para evidencias e ocre apenas para alertas.',
      hierarchyRules: ['Um ponto focal por slide.', 'Area limpa para titulo e bullets.', 'Evitar ruido cenografico sem lastro juridico.'],
      layoutFamilies: [
        { id: 'hero', label: 'Hero / abertura', usage: 'Abrir tese e frames decisorios.', slideNumbers: [1] },
        { id: 'evidence', label: 'Evidence / prova', usage: 'Concentrar evidencias e fluxos probatorios.', slideNumbers: [2, 3] },
        { id: 'sequence', label: 'Sequencia / plano', usage: 'Fechar com checklist e proximos passos.', slideNumbers: [4] },
      ],
    },
  },
  slides: [
    {
      id: 'slide-1',
      number: 1,
      sectionId: 'tese',
      title: 'Tese central para a conciliacao',
      purpose: 'Explicar a posicao juridica em uma frase defensavel.',
      layout: 'headline + evidencia curta',
      bullets: ['Obrigacao principal foi cumprida de forma substancial', 'Eventual inadimplemento residual e mitigavel', 'Proposta deve preservar continuidade contratual'],
      speakerNotes: 'Abrir com a tese simples, depois mostrar que a prova documental sustenta a narrativa sem ampliar o conflito.',
      transition: 'Da tese para a prova que a sustenta.',
      visualBrief: 'Composicao institucional com linha de decisao e destaque para tese principal.',
      renderedImageUrl: slideRenderUrls[0],
      assets: [{
        id: 'slide-1-render',
        type: 'render',
        status: 'stored',
        url: slideRenderUrls[0],
        mimeType: 'image/svg+xml',
        model: 'demo/svg-render',
        providerId: 'demo-smoke',
        providerLabel: 'Demo Smoke',
        altText: 'Slide de tese central',
        qualityScore: 88,
        qualityWarnings: ['Brief visual especifico ainda pode ser refinado para reduzir genericidade.'],
        retryCount: 1,
      }],
    },
    {
      id: 'slide-2',
      number: 2,
      sectionId: 'prova',
      title: 'Mapa probatorio essencial',
      purpose: 'Separar prova forte, prova pendente e ponto controvertido.',
      layout: 'diagram + bullets',
      bullets: ['Contrato e aditivos comprovam escopo', 'E-mails indicam aceitacao parcial', 'Pendencia: demonstrativo financeiro consolidado'],
      speakerNotes: 'Usar o diagrama para orientar a conversa e evitar dispersao em fatos laterais.',
      transition: 'Da qualidade da prova para o risco de resultado.',
      visualBrief: 'Diagrama de fluxo com tres blocos: fato, evidencia, efeito juridico.',
      renderedImageUrl: slideRenderUrls[1],
      assets: [
        { id: 'slide-2-render', type: 'render', status: 'stored', url: slideRenderUrls[1], mimeType: 'image/svg+xml', model: 'demo/svg-render', altText: 'Slide de mapa probatorio' },
        { id: 'slide-2-diagram', type: 'diagram', status: 'stored', url: diagramUrl, mimeType: 'image/svg+xml', model: 'demo/svg-data-render', altText: 'Diagrama de fluxo decisorio' },
      ],
    },
    {
      id: 'slide-3',
      number: 3,
      sectionId: 'risco',
      title: 'Cenarios e risco processual',
      purpose: 'Comparar resultado esperado, custo e exposicao reputacional.',
      layout: 'chart + recommendation',
      bullets: ['Acordo rapido reduz custo e incerteza', 'Litigio preserva tese, mas alonga prazo', 'Concessao maxima deve ser definida antes da audiencia'],
      speakerNotes: 'O grafico sintetiza risco relativo. Evitar numero absoluto quando nao houver base financeira validada.',
      transition: 'Do risco para o plano objetivo de acao.',
      visualBrief: 'Grafico de risco com eixos claros e marcadores por cenario.',
      chartSpec: {
        type: 'bar',
        data: [
          { label: 'Acordo', value: 35 },
          { label: 'Instrucao', value: 64 },
          { label: 'Recurso', value: 78 },
        ],
      },
      renderedImageUrl: slideRenderUrls[2],
      assets: [
        {
          id: 'slide-3-render',
          type: 'render',
          status: 'stored',
          url: slideRenderUrls[2],
          mimeType: 'image/svg+xml',
          model: 'demo/svg-render',
          providerId: 'demo-smoke',
          providerLabel: 'Demo Smoke',
          altText: 'Slide de risco processual',
          qualityScore: 74,
          qualityWarnings: ['Faltam fontes prioritarias explicitas para ancorar melhor a composicao visual.'],
          retryCount: 1,
        },
        { id: 'slide-3-chart', type: 'chart', status: 'stored', url: chartUrl, mimeType: 'image/svg+xml', model: 'demo/svg-data-render', altText: 'Grafico de matriz de risco' },
      ],
    },
    {
      id: 'slide-4',
      number: 4,
      sectionId: 'acao',
      title: 'Plano de acao antes da audiencia',
      purpose: 'Transformar diagnostico em providencias verificaveis.',
      layout: 'checklist executivo',
      bullets: ['Validar limite de concessao', 'Organizar anexo financeiro em uma pagina', 'Preparar minuta de termo com clausula de confidencialidade'],
      speakerNotes: 'Fechar com tres decisoes concretas e responsaveis definidos.',
      transition: 'Encerramento e decisao.',
      visualBrief: 'Checklist executivo com hierarquia clara e sem excesso visual.',
      renderedImageUrl: slideRenderUrls[3],
      assets: [{
        id: 'slide-4-render',
        type: 'render',
        status: 'stored',
        url: slideRenderUrls[3],
        mimeType: 'image/svg+xml',
        model: 'demo/svg-render',
        providerId: 'demo-smoke',
        providerLabel: 'Demo Smoke',
        altText: 'Slide de plano de acao',
        qualityScore: 91,
        qualityWarnings: [],
        retryCount: 0,
      }],
    },
  ],
  assets: [
    { id: 'slide-1-render', type: 'render', status: 'stored', url: slideRenderUrls[0], mimeType: 'image/svg+xml', model: 'demo/svg-render', providerId: 'demo-smoke', providerLabel: 'Demo Smoke', altText: 'Slide de tese central', qualityScore: 88, qualityWarnings: ['Brief visual especifico ainda pode ser refinado para reduzir genericidade.'], retryCount: 1 },
    { id: 'slide-2-render', type: 'render', status: 'stored', url: slideRenderUrls[1], mimeType: 'image/svg+xml', model: 'demo/svg-render', providerId: 'demo-smoke', providerLabel: 'Demo Smoke', altText: 'Slide de mapa probatorio', qualityScore: 84, qualityWarnings: [], retryCount: 0 },
    { id: 'slide-2-diagram', type: 'diagram', status: 'stored', url: diagramUrl, mimeType: 'image/svg+xml', model: 'demo/svg-data-render', altText: 'Diagrama de fluxo decisorio' },
    { id: 'slide-3-render', type: 'render', status: 'stored', url: slideRenderUrls[2], mimeType: 'image/svg+xml', model: 'demo/svg-render', providerId: 'demo-smoke', providerLabel: 'Demo Smoke', altText: 'Slide de risco processual', qualityScore: 74, qualityWarnings: ['Faltam fontes prioritarias explicitas para ancorar melhor a composicao visual.'], retryCount: 1 },
    { id: 'slide-3-chart', type: 'chart', status: 'stored', url: chartUrl, mimeType: 'image/svg+xml', model: 'demo/svg-data-render', altText: 'Grafico de matriz de risco' },
    { id: 'slide-4-render', type: 'render', status: 'stored', url: slideRenderUrls[3], mimeType: 'image/svg+xml', model: 'demo/svg-render', providerId: 'demo-smoke', providerLabel: 'Demo Smoke', altText: 'Slide de plano de acao', qualityScore: 91, qualityWarnings: [], retryCount: 0 },
    { id: 'deck-narration-audio', type: 'audio', status: 'skipped', model: 'demo/not-generated', altText: 'Narração planejada no demo sem chamada TTS' },
    { id: 'slide-3-video-clip', type: 'video', status: 'skipped', model: 'demo/not-generated', altText: 'Clipe planejado no demo sem provedor externo' },
  ],
  quality: {
    score: 91,
    strengths: ['Narrativa curta', 'Assets visuais materializados', 'Notas de fala completas'],
    warnings: ['Valores do grafico sao demonstrativos e nao representam dados reais.'],
    accessibility: ['Contraste alto', 'Paleta com apoio textual'],
    legalAccuracyNotes: ['Conteudo ficticio para smoke test local.'],
    deckRubric: {
      score: 87,
      status: 'repair',
      slideThreshold: 72,
      deckThreshold: 80,
      slidesBelowThreshold: [3],
      repairableSlides: [3],
      strengths: ['Arco narrativo coeso', 'Sistema visual coerente'],
      warnings: ['Slide 3 ainda pede ancoragem visual mais probatoria.'],
    },
    slideRubric: [
      { slideNumber: 1, score: 90, status: 'ok', strengths: ['Tese clara'], warnings: [], repairHints: [], recommendedAgents: [], categories: [] },
      { slideNumber: 2, score: 86, status: 'ok', strengths: ['Fluxo probatorio legivel'], warnings: [], repairHints: [], recommendedAgents: [], categories: [] },
      { slideNumber: 3, score: 74, status: 'repair', strengths: ['Comparacao de cenarios'], warnings: ['Visual ainda pode ser mais especifico.'], repairHints: ['Reforcar pertinencia do visual ao lastro documental.'], recommendedAgents: ['presentation_v2_image_generator'], categories: [] },
      { slideNumber: 4, score: 92, status: 'ok', strengths: ['Fechamento objetivo'], warnings: [], repairHints: [], recommendedAgents: [], categories: [] },
    ],
    multimodalAudit: {
      score: 72,
      status: 'review',
      strengths: ['Todos os slides contam com manifesto visual consistente.'],
      warnings: ['Slides 2 e 3 ainda exigem revisão coordenada entre prova visual e narrativa final.'],
      auditedAssetTypes: ['render', 'chart', 'diagram'],
      slides: [
        { slideNumber: 1, score: 82, status: 'ok', strengths: ['Slide 1 já possui visual final materializado.'], availableAssetTypes: ['render'] },
        { slideNumber: 2, score: 76, status: 'review', warnings: ['Slide 2 ainda pede sincronismo adicional entre diagrama e notas de fala.'], availableAssetTypes: ['render', 'diagram'] },
        { slideNumber: 3, score: 64, status: 'review', warnings: ['Slide 3 ainda exige revisão de alinhamento entre gráfico, render e narrativa de risco.'], availableAssetTypes: ['render', 'chart'] },
        { slideNumber: 4, score: 86, status: 'ok', strengths: ['Slide 4 já fecha a narrativa com visual coerente.'], availableAssetTypes: ['render'] },
      ],
    },
    exportReadiness: {
      score: 78,
      status: 'review',
      visualAssetCount: 6,
      altTextCoverage: 100,
      accessibilityNotes: ['Contraste alto', 'Paleta com apoio textual'],
      legalAccuracyNotes: ['Conteudo ficticio para smoke test local.'],
      warnings: ['Coerência multimodal ainda exige revisão (72/100).'],
    },
    repairSummary: ['Slide 3: critic de imagem indicou uma regeneracao guiada antes da persistencia do visual final.'],
  },
  exportHints: {
    aspectRatio: '16:9',
    preferredExport: 'pptx',
    useRenderedSlideFallback: true,
    includeSpeakerNotes: true,
  },
  revisionHistory: [
    { at: '2026-05-10T00:00:00.000Z', agent: 'demo_seed', summary: 'Manifesto demo v2 criado para smoke local sem Firestore.' },
    { at: '2026-05-12T08:00:00.000Z', agent: 'presentation_v2_image_generator', summary: 'Critic de imagem demo persistido para smoke local.', repairKind: 'selective_repair', repairAgent: 'presentation_v2_image_generator', slideNumbers: [3] },
  ],
}

const demoPresentationArtifact: StudioArtifact = {
  id: 'demo-presentation-v2-artifact',
  type: 'apresentacao_v2',
  title: demoDeck.title,
  content: JSON.stringify(demoDeck, null, 2),
  format: 'json',
  created_at: '2026-05-10T00:00:00.000Z',
}

const demoLegacyPresentationArtifact: StudioArtifact = {
  id: 'demo-presentation-v1-artifact',
  type: 'apresentacao',
  title: 'Apresentacao v1 de regressao',
  format: 'json',
  created_at: '2026-05-10T00:00:00.000Z',
  content: JSON.stringify({
    title: 'Apresentacao v1 de regressao',
    slides: [
      {
        number: 1,
        title: 'Fluxo v1 preservado',
        bullets: ['Parser legado continua ativo', 'Viewer antigo usa o mesmo componente de slides', 'Exportacao PPTX v1 aceita imagem renderizada'],
        speakerNotes: 'Este slide existe apenas para smoke de regressao do artefato apresentacao original.',
        visualSuggestion: 'Slide institucional simples para validacao v1.',
        renderedImageUrl: slideRenderUrls[0],
      },
      {
        number: 2,
        title: 'Sem impacto do v2',
        bullets: ['Tipo apresentacao permanece separado', 'Tipo apresentacao_v2 usa manifesto proprio', 'Acoes multimodais continuam isoladas no v2'],
        speakerNotes: 'Confirmar que o novo gerador nao mudou o contrato basico da apresentacao antiga.',
        visualSuggestion: 'Comparativo de contratos v1 e v2.',
        renderedImageUrl: slideRenderUrls[1],
      },
    ],
  }, null, 2),
}

const demoPresentationV2Executions = [
  createUsageExecutionRecord({
    source_type: 'presentation_pipeline_v2',
    source_id: 'demo-presentation-v2-artifact',
    created_at: '2026-05-10T00:00:01.000Z',
    phase: 'presentation_v2_orchestrator',
    agent_name: 'Apresentação v2: Orquestrador',
    model: 'demo/text-model',
    provider_id: 'browser',
    provider_label: 'Demo Smoke',
    tokens_in: 2400,
    tokens_out: 900,
    cost_usd: 0,
    duration_ms: 1200,
    execution_state: 'completed',
  }),
  createUsageExecutionRecord({
    source_type: 'presentation_pipeline_v2',
    source_id: 'demo-presentation-v2-artifact',
    created_at: '2026-05-10T00:00:02.000Z',
    phase: 'presentation_v2_image_generator',
    agent_name: 'Apresentação v2: Gerador de Imagens',
    model: 'browser/svg-render',
    provider_id: 'browser',
    provider_label: 'Browser',
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
    duration_ms: 840,
    execution_state: 'waiting_io',
    retry_count: 1,
  }),
  createUsageExecutionRecord({
    source_type: 'presentation_pipeline_v2',
    source_id: 'demo-presentation-v2-artifact',
    created_at: '2026-05-10T00:00:03.000Z',
    phase: 'presentation_v2_packager',
    agent_name: 'Apresentação v2: Empacotador',
    model: 'demo/text-model',
    provider_id: 'browser',
    provider_label: 'Demo Smoke',
    tokens_in: 1800,
    tokens_out: 700,
    cost_usd: 0,
    duration_ms: 760,
    execution_state: 'completed',
  }),
]

export function getDemoResearchNotebooks(): ResearchNotebookData[] {
  const now = new Date().toISOString()
  return [
    {
      id: 'demo-notebook-presentation-v2',
      title: 'Demo - Apresentacao v2 multimodal',
      description: 'Caderno local para testar viewer/export do Gerador de Apresentacao v2 sem chamadas externas.',
      topic: 'Preparacao de audiencia de conciliacao em disputa contratual',
      status: 'active',
      created_at: '2026-05-10T00:00:00.000Z',
      updated_at: now,
      sources: [
        {
          id: 'demo-source-brief',
          type: 'upload',
          name: 'Briefing juridico demo.txt',
          reference: 'demo://presentation-v2/briefing',
          content_type: 'text/plain',
          text_content: 'Briefing ficticio usado apenas para smoke local da apresentacao v2.',
          status: 'indexed',
          added_at: '2026-05-10T00:00:00.000Z',
        },
      ],
      messages: [
        {
          id: 'demo-message-1',
          role: 'assistant',
          agent: 'presentation_v2_packager',
          content: 'Manifesto de apresentacao v2 demo pronto para visualizacao e exportacao.',
          created_at: '2026-05-10T00:00:00.000Z',
        },
      ],
      artifacts: [demoLegacyPresentationArtifact, demoPresentationArtifact],
      llm_executions: demoPresentationV2Executions,
      research_audits: [],
      saved_searches: [],
      jurisprudence_semantic_memory: [],
    },
  ]
}
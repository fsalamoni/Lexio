/**
 * Notebook Studio Pipeline — multi-agent artifact generation engine.
 *
 * Each studio artifact is produced by a 3-stage pipeline:
 *   1. Pesquisador do Estúdio — extracts source-relevant data for the artifact
 *   2. Specialist Agent — produces the content (Escritor / Roteirista / Designer Visual)
 *   3. Revisor de Qualidade — refines and enhances the output
 *
 * Agent routing:
 *   - Written content (resumo, relatorio, documento, cartoes_didaticos, teste)
 *       → studio_pesquisador → studio_escritor → studio_revisor
 *   - Visual structures (apresentacao, mapa_mental, infografico, tabela_dados)
 *       → studio_pesquisador → studio_visual → studio_revisor
 *   - Media scripts (audio_script, video_script)
 *       → studio_pesquisador → studio_roteirista → studio_revisor
 */

import { callLLMWithFallback, type LLMResult } from './llm-client'
import { formatCostBadge } from './currency-utils'
import { loadResearchNotebookModels, validateScopedAgentModels, type ResearchNotebookModelMap } from './model-config'
import type { StudioArtifactType } from './firestore-service'
import { isStructuredArtifactType, parseArtifactContent } from './artifact-parsers'
import type { PipelineExecutionState } from './pipeline-execution-contract'
import {
  renderDataTableImage,
  renderInfographicImage,
  renderMindMapImage,
  type RenderedArtifactImage,
} from './notebook-visual-artifact-renderer'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StudioPipelineInput {
  apiKey: string
  topic: string
  description?: string
  sourceContext: string
  conversationContext: string
  customInstructions?: string
  artifactType: StudioArtifactType
  artifactLabel: string
  /** Optional legal area id (e.g. 'civil', 'tax', 'criminal'). When provided, prompts are enriched with area-specific guidance. */
  legalArea?: string
}

export interface StudioPipelineResult {
  content: string
  /** Execution records for each pipeline step */
  executions: StudioStepExecution[]
}

export interface StudioVisualMediaResult {
  rendered: RenderedArtifactImage
  execution: StudioStepExecution
}

export interface StudioStepExecution {
  phase: string
  agent_name: string
  model: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
  duration_ms: number
}

export interface StudioProgressMeta {
  stageMeta?: string
  executionState?: PipelineExecutionState
  costUsd?: number
  durationMs?: number
  retryCount?: number
  usedFallback?: boolean
  fallbackFrom?: string
}

export type StudioProgressCallback = (step: number, totalSteps: number, phase: string, meta?: StudioProgressMeta) => void

function formatUsd(costUsd: number): string {
  return formatCostBadge(costUsd)
}

function resolveExecutionStateFromRetryCount(retryCount?: number): PipelineExecutionState {
  return (retryCount ?? 0) > 0 ? 'retrying' : 'running'
}

function buildStudioProgressMeta(result: LLMResult): StudioProgressMeta {
  const parts: string[] = [result.model.split('/').pop() || result.model]
  if (result.operational?.fallbackUsed && result.operational.fallbackFrom) {
    parts.push(`Fallback de ${result.operational.fallbackFrom.split('/').pop() || result.operational.fallbackFrom}`)
  }
  if ((result.operational?.totalRetryCount ?? 0) > 0) {
    const retries = result.operational?.totalRetryCount ?? 0
    parts.push(`${retries} ${retries === 1 ? 'retry' : 'retries'}`)
  }
  if (result.duration_ms > 0) {
    parts.push(`${Math.max(1, Math.round(result.duration_ms / 1000))}s`)
  }
  if (result.cost_usd > 0) {
    parts.push(formatUsd(result.cost_usd))
  }
  return {
    stageMeta: parts.join(' • '),
    executionState: resolveExecutionStateFromRetryCount(result.operational?.totalRetryCount),
    costUsd: result.cost_usd,
    durationMs: result.duration_ms,
    retryCount: result.operational?.totalRetryCount,
    usedFallback: result.operational?.fallbackUsed,
    fallbackFrom: result.operational?.fallbackFrom,
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise(resolve => setTimeout(resolve, ms))
  if (signal.aborted) return Promise.reject(new DOMException('Operação cancelada pelo usuário.', 'AbortError'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Operação cancelada pelo usuário.', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

// ── Agent routing ─────────────────────────────────────────────────────────────

type SpecialistRole = 'studio_escritor' | 'studio_roteirista' | 'studio_visual'

const ARTIFACT_AGENT_MAP: Record<StudioArtifactType, SpecialistRole> = {
  resumo:            'studio_escritor',
  relatorio:         'studio_escritor',
  documento:         'studio_escritor',
  cartoes_didaticos: 'studio_escritor',
  teste:             'studio_escritor',
  guia_estruturado:  'studio_escritor',
  apresentacao:      'studio_visual',
  mapa_mental:       'studio_visual',
  infografico:       'studio_visual',
  tabela_dados:      'studio_visual',
  audio_script:      'studio_roteirista',
  video_script:      'studio_roteirista',
  video_production:  'studio_roteirista',
  outro:             'studio_escritor',
}

const SPECIALIST_LABELS: Record<SpecialistRole, string> = {
  studio_escritor:    'Escritor',
  studio_roteirista:  'Roteirista',
  studio_visual:      'Designer Visual',
}

// ── Legal area detection and enrichment ───────────────────────────────────────

/** Keyword-based area detection from topic + description. Returns area id or undefined. */
export function detectLegalArea(topic: string, description?: string): string | undefined {
  const text = `${topic} ${description || ''}`.toLowerCase()
  // Order matters: specific areas must come before general ones to avoid false matches.
  // E.g. 'criminal_procedure' before 'criminal', 'digital' (marco civil) before 'civil'.
  const patterns: [string, RegExp][] = [
    ['tax',                /tribut[áa]ri|imposto|icms|iss\b|irpj|csll|pis.?cofins|fiscal|tributo/],
    ['labor',              /trabalh|clt|empregad|trabalhista|rescis[ãa]o.+contrato.+trabalho|justa causa|fgts|hora extra/],
    ['criminal_procedure', /processo penal|inqu[ée]rito policial|flagrante|pris[ãa]o preventiva|a[çc][ãa]o penal/],
    ['criminal',           /\bpenal\b|crime\b|delito|pena privativa|dosimetria|tipicidade|culpabilidade/],
    ['environmental',      /ambiental|meio ambiente|licenciamento ambiental|fauna|flora|saneamento|[áa]rea degradada/],
    ['digital',            /\blgpd\b|dados pessoais|cibern[ée]tic|marco civil da internet|direito digital/],
    ['administrative',     /administrativ|licita[çc][ãa]o|improbidade|ato administrativo|poder de pol[íi]cia|servidor p[úu]blico/],
    ['civil_procedure',    /processo civil|\bcpc\b|tutela antecipada|cumprimento de senten/],
    ['consumer',           /consumidor|\bcdc\b|fornecedor|produto defeituoso|v[íi]cio|rela[çc][ãa]o de consumo/],
    ['inheritance',        /sucess[õo]es|heran[çc]a|invent[áa]rio|testamento|legado|herdeiro|falecido/],
    ['family',             /fam[íi]lia|div[óo]rcio|alimentos|guarda.+compartilhada|uni[ãa]o est[áa]vel|casamento|partilha/],
    ['constitutional',     /constitucional|direito fundamental|controle de constitucionalidade|\badi\b|\badpf\b|mandado de injun/],
    ['business',           /empresarial|societ[áa]rio|fal[êe]ncia|recupera[çc][ãa]o judicial|marca|patente|propriedade intelectual/],
    ['social_security',    /previdenci[áa]rio|inss|aposentadoria|aux[íi]lio.?doen[çc]a|incapacidade laborat/],
    ['electoral',          /eleitoral|elei[çc][ãõo]es|candidat|propaganda eleitoral|partido/],
    ['international',      /internacional|tratado|extradi[çc][ãa]o|homologa[çc][ãa]o de senten[çc]a estrangeira/],
    ['civil',              /responsabilidade civil|obriga[çc][ãõo]es|dano moral|indeniza[çc]|direito civil|contrato.+civil/],
  ]
  for (const [area, re] of patterns) {
    if (re.test(text)) return area
  }
  return undefined
}

/** Area-specific prompt enrichments for legal documents. */
const AREA_PROMPT_ENRICHMENTS: Record<string, string> = {
  tax: `Contexto da área — Direito Tributário:
- Cite a legislação tributária aplicável (CTN, CF arts. 145-162, leis complementares e ordinárias específicas)
- Diferencie tributos por espécie (impostos, taxas, contribuições) e competência (federal, estadual, municipal)
- Considere princípios tributários: legalidade, anterioridade, irretroatividade, capacidade contributiva, não-confisco
- Use jurisprudência do STF (RE com repercussão geral) e STJ (REsp) em matéria tributária
- Considere súmulas vinculantes e enunciados do CARF quando aplicáveis`,

  labor: `Contexto da área — Direito do Trabalho:
- Cite a CLT, CF art. 7º e legislação trabalhista complementar (Lei 13.467/2017 - Reforma Trabalhista)
- Considere princípios: proteção, irrenunciabilidade, primazia da realidade, continuidade
- Use jurisprudência do TST (súmulas, OJs da SDI-1 e SDI-2) e TRTs
- Atenção à competência da Justiça do Trabalho (CF art. 114)
- Considere convenções e acordos coletivos aplicáveis`,

  criminal: `Contexto da área — Direito Penal:
- Cite o Código Penal, legislação penal especial e a CF (garantias individuais)
- Analise elementos do tipo penal: tipicidade, antijuridicidade, culpabilidade
- Considere princípios: legalidade estrita, anterioridade, intervenção mínima, proporcionalidade
- Use jurisprudência do STF e STJ em matéria penal (HC, RHC, REsp)
- Considere causas de aumento, diminuição, agravantes e atenuantes quando aplicável`,

  criminal_procedure: `Contexto da área — Processo Penal:
- Cite o CPP, leis especiais (Lei 12.850/2013, Lei 9.296/1996) e a CF (garantias processuais)
- Considere: devido processo legal, ampla defesa, contraditório, presunção de inocência
- Análise de nulidades processuais (absolutas e relativas)
- Jurisprudência do STF e STJ sobre prisões, provas e procedimentos`,

  civil: `Contexto da área — Direito Civil:
- Cite o Código Civil/2002, legislação extravagante e a CF quando aplicável
- Considere princípios: boa-fé objetiva, função social do contrato, autonomia privada
- Analise: capacidade, validade dos atos jurídicos, prescrição e decadência
- Use jurisprudência do STJ (REsp) para interpretação de normas civis
- Diferencie responsabilidade contratual e extracontratual quando pertinente`,

  civil_procedure: `Contexto da área — Processo Civil:
- Cite o CPC/2015 (Lei 13.105/2015) e a CF (princípios processuais)
- Considere: acesso à justiça, contraditório, fundamentação das decisões, cooperação
- Análise de pressupostos processuais, condições da ação, competência
- Jurisprudência do STJ sobre procedimentos e recursos`,

  consumer: `Contexto da área — Direito do Consumidor:
- Cite o CDC (Lei 8.078/1990), Decreto 2.181/1997, CF art. 5º XXXII e art. 170 V
- Considere: vulnerabilidade do consumidor, inversão do ônus da prova, responsabilidade objetiva
- Análise de práticas abusivas, cláusulas abusivas, vícios e defeitos
- Jurisprudência do STJ (temas repetitivos) sobre relações de consumo`,

  administrative: `Contexto da área — Direito Administrativo:
- Cite a CF (arts. 37-41), Lei 8.666/1993, Lei 14.133/2021, Lei 8.112/1990
- Considere princípios: legalidade, impessoalidade, moralidade, publicidade, eficiência
- Análise de atos administrativos (competência, forma, motivo, objeto, finalidade)
- Jurisprudência do STF e STJ sobre poder discricionário e vinculado`,

  constitutional: `Contexto da área — Direito Constitucional:
- Cite a CF/1988 e emendas constitucionais relevantes
- Considere: princípios fundamentais, direitos e garantias individuais, organização do Estado
- Análise de controle de constitucionalidade (difuso e concentrado)
- Jurisprudência do STF (ADI, ADC, ADPF, RE com repercussão geral)`,

  environmental: `Contexto da área — Direito Ambiental:
- Cite a CF art. 225, Lei 6.938/1981, Lei 9.605/1998, Código Florestal (Lei 12.651/2012)
- Considere princípios: prevenção, precaução, poluidor-pagador, desenvolvimento sustentável
- Responsabilidade ambiental objetiva e solidária
- Jurisprudência do STJ sobre danos ambientais`,

  business: `Contexto da área — Direito Empresarial:
- Cite o Código Civil (Livro II), Lei 11.101/2005, Lei 6.404/1976, Lei 9.279/1996
- Considere: tipos societários, responsabilidade dos sócios, desconsideração da personalidade jurídica
- Análise de contratos empresariais, títulos de crédito, propriedade industrial
- Jurisprudência do STJ sobre matéria empresarial`,

  family: `Contexto da área — Direito de Família:
- Cite o Código Civil (Livro IV), ECA, CF art. 226-230
- Considere: princípio do melhor interesse da criança, dignidade, solidariedade familiar
- Análise de guarda, alimentos, regime de bens, dissolução da união
- Jurisprudência do STJ sobre família e menores`,

  inheritance: `Contexto da área — Direito das Sucessões:
- Cite o Código Civil (Livro V), CPC (inventário e partilha)
- Considere: vocação hereditária, ordem de sucessão, testamentos, legados
- Análise de colação, deserdação, indignidade, cálculo de legítima
- Jurisprudência do STJ sobre sucessões`,

  social_security: `Contexto da área — Direito Previdenciário:
- Cite a CF (arts. 194-204), Lei 8.213/1991, Lei 8.212/1991, Decreto 3.048/1999
- Considere: princípios da universalidade, seletividade, distributividade
- Análise de benefícios: aposentadoria, auxílio-doença, pensão por morte, BPC
- Jurisprudência do STJ e TNU sobre benefícios previdenciários`,

  electoral: `Contexto da área — Direito Eleitoral:
- Cite a CF (arts. 14-16), Código Eleitoral, Lei 9.504/1997, LC 64/1990
- Considere: elegibilidade, inelegibilidade, propaganda eleitoral, prestação de contas
- Jurisprudência do TSE sobre matéria eleitoral`,

  international: `Contexto da área — Direito Internacional:
- Cite tratados internacionais, CF art. 5º §§ 2º e 3º, Lei de Introdução (LINDB)
- Considere: hierarquia dos tratados, recepção no ordenamento, conflito de normas
- Análise de cooperação jurídica internacional, homologação de sentenças estrangeiras`,

  digital: `Contexto da área — Direito Digital:
- Cite a LGPD (Lei 13.709/2018), Marco Civil da Internet (Lei 12.965/2014), CF
- Considere: proteção de dados pessoais, privacidade, liberdade de expressão online
- Análise de responsabilidade de provedores, remoção de conteúdo, contratos digitais
- Jurisprudência do STJ sobre responsabilidade civil na internet`,
}

// ── Prompt templates ──────────────────────────────────────────────────────────

function buildResearchPrompt(input: StudioPipelineInput): { system: string; user: string } {
  const isLegalDoc = input.artifactType === 'documento' || input.artifactType === 'relatorio' || input.artifactType === 'resumo' || input.artifactType === 'guia_estruturado'
  const resolvedArea = input.legalArea || detectLegalArea(input.topic, input.description)
  const areaEnrichment = resolvedArea && AREA_PROMPT_ENRICHMENTS[resolvedArea]
    ? `\n\n${AREA_PROMPT_ENRICHMENTS[resolvedArea]}` : ''
  return {
    system: `Você é um pesquisador especialista${isLegalDoc ? ' jurídico com vasta experiência em análise doutrinária e jurisprudencial' : ''}. Sua tarefa é extrair e organizar as informações mais relevantes das fontes disponíveis para a criação de um(a) ${input.artifactLabel}.

Regras:
- Analise TODAS as fontes disponíveis
- Identifique os dados mais relevantes para o tipo de artefato solicitado
- Organize as informações em seções temáticas claras
- Inclua citações diretas quando relevantes
- Destaque dados quantitativos, datas, nomes e referências normativas${isLegalDoc ? `
- Extraia e destaque: teses jurídicas, fundamentos legais, jurisprudência citada, doutrina relevante
- Identifique: dispositivos legais aplicáveis, entendimentos consolidados, divergências doutrinárias/jurisprudenciais
- Mapeie: precedentes relevantes, ementa de julgados, argumentos favoráveis e contrários` : ''}
- Sinalize contradições ou lacunas entre fontes
- Responda em português brasileiro${areaEnrichment}`,
    user: `Tema: "${input.topic}"
${input.description ? `Objetivo: ${input.description}` : ''}

FONTES DISPONÍVEIS:
${input.sourceContext || '(Sem fontes específicas — indique que o conteúdo será baseado em conhecimento geral)'}

Extraia e organize as informações mais relevantes para a criação de um(a) ${input.artifactLabel}. Forneça um briefing estruturado que será usado pelo próximo agente para produzir o artefato final.`,
  }
}

function buildSpecialistPrompt(
  input: StudioPipelineInput,
  researchBriefing: string,
  role: SpecialistRole,
): { system: string; user: string } {
  const roleInstructions = getSpecialistInstructions(role, input.artifactType, input.artifactLabel)

  const isStructured = isStructuredArtifactType(input.artifactType)
  const formatRules = isStructured
    ? `Regras gerais:
- RESPONDA EXCLUSIVAMENTE com um objeto JSON válido — sem texto antes ou depois
- NÃO inclua blocos \`\`\`json — retorne o JSON puro diretamente
- Siga EXATAMENTE o schema JSON especificado nas instruções acima
- Todo o conteúdo textual dentro do JSON deve ser em português brasileiro
- Seja completo, detalhado e profissional
- Use as informações do briefing de pesquisa como base fundamental`
    : `Regras gerais:
- Gere conteúdo em formato Markdown de alta qualidade
- Seja completo, detalhado e profissional
- Responda em português brasileiro com tom adequado ao tipo de artefato
- Use as informações do briefing de pesquisa como base fundamental`

  const resolvedArea = input.legalArea || detectLegalArea(input.topic, input.description)
  const areaEnrichment = resolvedArea && AREA_PROMPT_ENRICHMENTS[resolvedArea]
    ? `\n\n${AREA_PROMPT_ENRICHMENTS[resolvedArea]}` : ''

  return {
    system: `${roleInstructions}

Contexto do tema: "${input.topic}"
${input.description ? `Objetivo: ${input.description}` : ''}${areaEnrichment}

Conversas anteriores (para manter consistência):
${input.conversationContext || '(Sem conversas anteriores)'}

${formatRules}`,
    user: input.customInstructions
      ? `BRIEFING DE PESQUISA:\n${researchBriefing}\n\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${input.customInstructions}\n\nCrie um(a) ${input.artifactLabel} completo(a) e profissional.`
      : `BRIEFING DE PESQUISA:\n${researchBriefing}\n\nCrie um(a) ${input.artifactLabel} completo(a) e profissional sobre "${input.topic}".`,
  }
}

function buildReviewPrompt(
  input: StudioPipelineInput,
  draft: string,
): { system: string; user: string } {
  const isStructured = isStructuredArtifactType(input.artifactType)
  const isLegalWritten = ['documento', 'relatorio', 'resumo', 'guia_estruturado'].includes(input.artifactType)
  const formatRule = isStructured
    ? `- RETORNE o artefato COMPLETO revisado como JSON válido puro (sem \`\`\`json, sem texto antes ou depois)
- MANTENHA EXATAMENTE a mesma estrutura/schema JSON do rascunho
- Corrija campos vazios, adicione conteúdo onde faltar profundidade
- Garanta que todos os arrays tenham o mínimo de itens solicitados`
    : `- RETORNE o artefato COMPLETO revisado e aprimorado (não apenas sugestões)
- Mantenha o formato original (Markdown)`

  const legalCriteria = isLegalWritten ? `
8. **Qualidade Jurídica** — O texto atinge padrão de produção jurídica profissional?
   - Fundamentação legal está adequada e referenciada?
   - Jurisprudência e doutrina estão integradas (quando presentes nas fontes)?
   - Argumentação é coesa, sem lacunas lógicas ou assertivas sem fundamento?
   - Linguagem é tecnicamente precisa, sem ambiguidades ou termos incorretos?
   - Estrutura segue padrões forenses/acadêmicos esperados para o tipo de documento?
9. **Completude Substantiva** — O conteúdo tem densidade analítica suficiente?
   - Cada seção tem desenvolvimento real, não apenas indicação superficial de tópico?
   - Argumentos são desenvolvidos com premissas, desenvolvimento e conclusão?
   - Evitou-se linguagem genérica, vaga ou puramente introdutória?` : ''

  return {
    system: `Você é um revisor de qualidade de nível mundial${isLegalWritten ? ' com especialização em produção jurídica e técnica' : ''}. Sua missão é aprimorar o artefato abaixo, garantindo que atinja o mais alto padrão de excelência.

Critérios de revisão:
1. **Completude** — O conteúdo cobre todos os aspectos relevantes do tema?
2. **Precisão** — Os dados, referências e citações estão corretos?
3. **Estrutura** — A organização é lógica e facilita a compreensão?
4. **Clareza** — A linguagem é precisa e acessível para o público-alvo?
5. **Formatação** — O formato está correto e bem estruturado?
6. **Profundidade** — O nível de detalhe é adequado ao tipo de artefato?
7. **Originalidade** — O conteúdo traz insights relevantes e diferenciados?${legalCriteria}

Regras:
${formatRule}
- Adicione detalhes, exemplos e aprofundamentos onde necessário
- Corrija erros factuais, gramaticais ou de formatação
- Elimine superficialidade: substitua afirmações genéricas por análise fundamentada
- Responda em português brasileiro`,
    user: `Tipo de artefato: ${input.artifactLabel}
Tema: "${input.topic}"
${input.description ? `Objetivo: ${input.description}` : ''}

RASCUNHO PARA REVISÃO:
${draft}

Revise e aprimore este ${input.artifactLabel}, retornando a versão FINAL completa.`,
  }
}

// ── Specialist instructions per artifact type ────────────────────────────────

function getSpecialistInstructions(
  role: SpecialistRole,
  artifactType: StudioArtifactType,
  artifactLabel: string,
): string {
  if (role === 'studio_roteirista') {
    return artifactType === 'audio_script'
      ? `Você é um roteirista profissional de áudio e podcasts. Crie um roteiro completo para produção de áudio/podcast.

RESPONDA com um JSON puro no seguinte schema (sem \`\`\`json):
{
  "title": "Título do episódio",
  "duration": "15-20 minutos",
  "segments": [
    {
      "time": "00:00",
      "type": "vinheta | narracao | transicao | efeito | musica | pausa",
      "speaker": "Narrador (opcional — use para diferenciar vozes)",
      "text": "Texto completo da narração ou descrição do efeito",
      "notes": "Notas de produção opcionais (música de fundo, efeito sonoro, tom)"
    }
  ],
  "productionNotes": ["Nota geral de produção 1", "..."]
}

Requisitos:
- Mínimo 20 segmentos cobrindo 15-20 minutos
- Abertura com vinheta e apresentação envolvente do tema
- Tom conversacional, natural e engajante (estilo podcast profissional)
- Transições suaves entre segmentos com indicações sonoras
- Citações e referências das fontes integradas naturalmente
- Perguntas retóricas para engajar o ouvinte
- Fechamento com recapitulação e chamada para ação
- Notas de produção detalhadas (efeitos, música, pausas dramáticas)`
      : `Você é um roteirista profissional de vídeo e conteúdo audiovisual. Crie um roteiro completo para produção de vídeo.

RESPONDA com um JSON puro no seguinte schema (sem \`\`\`json):
{
  "title": "Título do vídeo",
  "duration": "10-15 minutos",
  "scenes": [
    {
      "number": 1,
      "time": "00:00",
      "narration": "Texto completo da narração/locução",
      "visual": "Descrição detalhada do enquadramento, elementos visuais, gráficos na tela",
      "transition": "corte | fade | wipe | dissolve (opcional)",
      "broll": "Sugestão de imagem/vídeo complementar (opcional)",
      "lowerThird": "Texto identificativo na tela (opcional)",
      "notes": "Notas de pós-produção (VFX, cor, animação) (opcional)"
    }
  ],
  "postProductionNotes": ["Nota 1", "..."]
}

Requisitos:
- Mínimo 15 cenas cobrindo 10-15 minutos
- Cena por cena com descrição de enquadramentos e ângulos
- Narração/locução com tom profissional
- Indicações visuais detalhadas (gráficos, textos na tela, animações)
- B-roll: sugestões de imagens complementares
- Abertura e encerramento com identidade visual
- Notas de pós-produção (efeitos visuais, correção de cor)`
  }

  if (role === 'studio_visual') {
    switch (artifactType) {
      case 'apresentacao':
        return `Você é um designer de apresentações profissionais. Crie uma apresentação completa em formato de slides.

RESPONDA com um JSON puro no seguinte schema (sem \`\`\`json):
{
  "title": "Título da apresentação",
  "slides": [
    {
      "number": 1,
      "title": "Título do Slide",
      "bullets": ["Tópico 1", "Tópico 2", "..."],
      "speakerNotes": "Roteiro de fala expandido para o apresentador...",
      "visualSuggestion": "Tipo de gráfico, imagem ou diagrama sugerido"
    }
  ]
}

Estrutura obrigatória:
1. Capa (título, subtítulo, autor/data)
2. Agenda/Sumário
3-N. Slides de conteúdo (mínimo 15 slides)
N+1. Conclusões e próximos passos
N+2. Referências
N+3. Slide de encerramento/Q&A

Requisitos:
- Máximo 5 bullets por slide, concisos e impactantes
- Speaker notes detalhadas com roteiro de fala completo (mín. 3 frases por slide)
- Sugestão visual específica para cada slide`
      case 'mapa_mental':
        return `Você é um especialista em mapas mentais e organização visual de conhecimento. Crie um mapa mental completo e profissional.

RESPONDA com um JSON puro no seguinte schema (sem \`\`\`json):
{
  "centralNode": "Tema principal",
  "branches": [
    {
      "label": "Categoria principal",
      "icon": "emoji representativo (ex: 📚)",
      "color": "cor CSS (ex: #3B82F6)",
      "children": [
        {
          "label": "Subtópico",
          "icon": "emoji (opcional)",
          "children": [
            { "label": "Detalhe ou exemplo" }
          ]
        }
      ]
    }
  ]
}

Requisitos:
- 5-7 ramos primários representando categorias principais
- 3-5 sub-ramos por ramo com detalhes e exemplos
- Mínimo 50 nós no total (some todos os nós em todos os níveis)
- Use emojis relevantes como ícones
- Use cores hexadecimais distintas para cada ramo primário
- Profundidade mínima de 3 níveis na hierarquia`
      case 'infografico':
        return `Você é um designer de infográficos que transforma dados complexos em informação visual acessível.

RESPONDA com um JSON puro no seguinte schema (sem \`\`\`json):
{
  "title": "Título impactante",
  "subtitle": "Subtítulo explicativo",
  "sections": [
    {
      "icon": "emoji representativo",
      "title": "Título da seção",
      "content": "Texto explicativo da seção em Markdown",
      "highlight": "Frase ou dado em destaque (opcional)",
      "stats": [
        { "label": "Descrição", "value": 85, "unit": "%" }
      ]
    }
  ],
  "conclusion": "Takeaway principal",
  "sources": ["Fonte 1", "Fonte 2"]
}

Requisitos:
- Mínimo 6 seções temáticas
- Cada seção com pelo menos 1 stat numérico quando possível
- Dados-chave em destaque (números, porcentagens, valores)
- Comparações lado a lado quando relevante
- Conclusão visual clara com main takeaway`
      case 'tabela_dados':
        return `Você é um analista de dados especializado em organização tabular. Crie tabelas de dados completas e informativas.

RESPONDA com um JSON puro no seguinte schema (sem \`\`\`json):
{
  "title": "Título da tabela",
  "columns": [
    { "key": "nome_campo", "label": "Nome Exibição", "align": "left | right | center" }
  ],
  "rows": [
    { "nome_campo": "valor", "outro_campo": 123 }
  ],
  "summary": { "nome_campo": "Total", "outro_campo": 999 },
  "legend": "Explicação de abreviações ou códigos",
  "footnotes": ["Nota 1", "Nota 2"]
}

Requisitos:
- Mínimo 4 colunas e 12 linhas de dados
- Cabeçalhos claros e descritivos
- Alinhe colunas numéricas como "right"
- Inclua tabela de resumo/totais (campo summary) para dados numéricos
- Legenda quando houver abreviações
- Notas de rodapé com fontes e observações
- Os valores em "rows" DEVEM usar as mesmas keys definidas em "columns"`
      default:
        return `Você é um designer visual especializado em ${artifactLabel}. Crie um artefato visual profissional e completo.`
    }
  }

  // studio_escritor
  switch (artifactType) {
    case 'resumo':
      return `Você é um especialista em síntese e análise jurídica/técnica de alto nível. Crie um resumo executivo completo, profissional e com densidade analítica real.

Estrutura obrigatória:
- **Resumo Executivo** (2-3 parágrafos densos de visão geral — não uma lista de tópicos)
- **Contexto e Antecedentes** (cenário, motivação, relevância)
- **Pontos Principais** (5-8 descobertas/argumentos centrais — cada ponto com 1-2 parágrafos de desenvolvimento)
- **Análise Crítica** (pontos fortes, fracos, lacunas, implicações — raciocínio fundamentado)
- **Conclusões** (síntese final e posicionamento claro)
- **Recomendações** (próximos passos concretos e acionáveis)

Requisitos:
- Mínimo 800 palavras
- Se as fontes contiverem jurisprudência, cite processos/ementas relevantes
- Cada ponto principal deve ter desenvolvimento argumentativo, não apenas uma frase
- Use linguagem clara, técnica quando necessário, e inclua referências às fontes
- Evite linguagem genérica, assertivas sem fundamento e repetições`
    case 'relatorio':
      return `Você é um analista sênior especializado em produção de relatórios jurídicos e técnicos de alto padrão. Crie um relatório analítico detalhado, profissional e completo.

Estrutura obrigatória:
- **Sumário Executivo** (1-2 páginas: visão geral para decisores — deve conter as principais conclusões e recomendações)
- **Metodologia** (como as informações foram analisadas e quais critérios foram usados)
- **Contextualização** (panorama, antecedentes, cenário normativo/fático)
- **Análise Detalhada** (múltiplas seções temáticas numeradas, cada uma com: (i) apresentação do ponto, (ii) dados e fontes, (iii) análise crítica, (iv) conclusão parcial)
- **Análise Comparativa** (confronto entre posições, fontes ou entendimentos divergentes, quando aplicável)
- **Riscos e Oportunidades** (identificados na análise com fundamento)
- **Conclusões** (fundamentadas nos dados e análise — sem mera repetição do sumário)
- **Recomendações** (ações concretas priorizadas, com justificativa)
- **Referências** (fontes utilizadas de forma organizada)

Requisitos:
- Mínimo 2.000 palavras
- Use dados, exemplos e fundamentação em cada seção
- Se as fontes incluírem jurisprudência, integre-a na análise com citações específicas
- Cada seção de análise deve ter ao mínimo 3 parágrafos de desenvolvimento real
- Evite: linguagem vaga, seções introdutórias sem conteúdo, repetição de afirmações já feitas
- Formato Markdown com hierarquia clara de títulos`
    case 'documento': {
      const label = artifactLabel.toLowerCase()
      const isParecer = label.includes('parecer')
      const isPeticaoInicial = label.includes('petição inicial') || label.includes('peticao inicial') || label.includes('inicial')
      const isContestacao = label.includes('contestação') || label.includes('contestacao')
      const isRecurso = label.includes('recurso') || label.includes('apelação') || label.includes('apelacao') || label.includes('agravo')
      const isContratoOuNota = label.includes('contrato') || label.includes('nota técnica') || label.includes('nota tecnica')

      if (isParecer) {
        return `Você é um advogado sênior com especialidade em pareceres jurídicos doutrinários de alta qualidade. Produza um **parecer jurídico** completo, tecnicamente rigoroso e fundamentado.

Estrutura obrigatória para parecer jurídico:
- **EMENTA** — Uma síntese precisa de 3-5 linhas contendo as principais conclusões do parecer (redigida ao final e colocada no início)
- **I. DA CONSULTA** — Exposição clara e objetiva da questão submetida a parecer; identificação do consulente (se aplicável)
- **II. DOS FATOS RELEVANTES** — Descrição dos elementos fáticos e contextuais que fundamentam a análise
- **III. DO DIREITO APLICÁVEL** — Levantamento das normas constitucionais, legais e regulamentares pertinentes; com citação expressa dos dispositivos
- **IV. DA DOUTRINA** — Posicionamento dos principais autores sobre o tema; citações doutrinárias com indicação de autor/obra
- **V. DA JURISPRUDÊNCIA** — Precedentes dos tribunais superiores (STF, STJ) e instâncias inferiores quando relevante; cite números de processos e ementas quando disponíveis nas fontes
- **VI. DA ANÁLISE** — Desenvolvimento analítico fundamentado nas normas, doutrina e jurisprudência levantadas; resposta às questões formuladas
- **VII. DAS CONCLUSÕES** — Síntese clara e objetiva das respostas às questões, com indicação expressa das recomendações

Requisitos de qualidade:
- Mínimo de 2.000 palavras no corpo do parecer
- Tom formal, técnico e impessoal (linguagem jurídica profissional)
- Cada afirmação deve ser fundamentada em norma, doutrina ou jurisprudência
- Citação expressa de artigos de lei com número do dispositivo
- Se as fontes contiverem jurisprudência (DataJud), integre as ementas na seção de jurisprudência
- Conclusões claras e inequívocas — evite ambiguidades

Guardrails anti-superficialidade:
- NÃO emita opinião jurídica sem fundamento normativo ou jurisprudencial
- NÃO use linguagem vaga ("pode ser", "talvez") nas conclusões — seja categórico
- NÃO omita a ementa; ela é obrigatória e deve refletir as conclusões reais do parecer`
      }

      if (isPeticaoInicial) {
        return `Você é um advogado processualista experiente em elaboração de petições iniciais. Produza uma **petição inicial** completa, tecnicamente rigorosa e processualmente adequada.

Estrutura obrigatória para petição inicial (art. 319 do CPC):
- **EXCELENTÍSSIMO SENHOR DOUTOR JUIZ...** — Endereçamento correto ao juízo competente
- **I. DOS FATOS** — Narrativa clara, cronológica e completa dos fatos relevantes; enfoque nos elementos que sustentam o pedido
- **II. DO DIREITO** — Fundamentação jurídica: dispositivos legais aplicáveis, doutrina, jurisprudência favorável; cite art. X da Lei Y; integre precedentes das fontes quando disponíveis
- **III. DOS PEDIDOS** — Lista clara e objetiva de todos os pedidos (tutela de urgência se cabível; condenação; declaração; etc.); cada pedido numerado
- **IV. DO VALOR DA CAUSA** — Atribuição motivada do valor (art. 292 CPC)
- **V. DAS PROVAS** — Indicação dos meios de prova pretendidos (documentos, testemunhas, perícia, etc.)
- **FECHO** — Nesses termos, pede deferimento. [Local], [Data]

Requisitos de qualidade:
- Linguagem forense formal e técnica
- Articulação clara entre fatos, direito e pedido
- Pedidos formulados de forma clara e executável
- Se as fontes contiverem jurisprudência (DataJud), cite as ementas favoráveis na fundamentação
- Indicação da competência do juízo e fundamento legal quando relevante

Guardrails anti-superficialidade:
- NÃO omita nenhum dos elementos obrigatórios do art. 319 do CPC
- NÃO faça pedidos sem fundamento fático e jurídico correspondente`
      }

      if (isContestacao) {
        return `Você é um advogado processualista experiente em contestações. Produza uma **contestação** completa, tecnicamente rigorosa e com impugnação específica.

Estrutura obrigatória para contestação (arts. 335-342 CPC):
- **EXCELENTÍSSIMO SENHOR DOUTOR JUIZ...** — Endereçamento e qualificação das partes
- **I. PRELIMINARES** — Arguição de todas as preliminares cabíveis (incompetência, ilegitimidade, falta de interesse de agir, etc.) com fundamentação
- **II. DA IMPUGNAÇÃO ESPECÍFICA AOS FATOS** — Ponto a ponto, aceitação/negação motivada de cada fato narrado na inicial; art. 341 CPC (impugnação específica)
- **III. DO MÉRITO** — Fundamentos jurídicos que afastam o pedido do autor; doutrina e jurisprudência favorável ao réu
- **IV. DOS PEDIDOS** — Requerimento de extinção sem resolução de mérito ou improcedência total/parcial; pedido de condenação em honorários
- **FECHO** — Nesses termos, pede deferimento.

Requisitos de qualidade:
- Impugnação específica e fundamentada a cada ponto da inicial
- Cite dispositivos legais e jurisprudência favorável quando disponíveis nas fontes
- Não deixe pontos sem contestação (confissão ficta — art. 341 CPC)`
      }

      if (isRecurso) {
        return `Você é um advogado especialista em prática recursal. Produza um **recurso** completo, tecnicamente rigoroso e com fundamentação adequada.

Estrutura obrigatória:
- **TEMPESTIVIDADE E PREPARO** — Menção ao prazo e ao preparo (quando cabível)
- **I. DO CABIMENTO** — Demonstração do cabimento do recurso interposto (tipo, fundamento legal, interesse recursal)
- **II. DOS FATOS E DA DECISÃO RECORRIDA** — Síntese da decisão combatida; identificação dos vícios (error in judicando ou in procedendo)
- **III. DAS RAZÕES RECURSAIS** — Desenvolvimento analítico e fundamentado das razões que justificam a reforma ou anulação; cite normas e precedentes relevantes
- **IV. DO PEDIDO** — Requerimento expresso de provimento para reforma/anulação; efeito pretendido

Requisitos de qualidade:
- Argumentação específica contra a decisão recorrida (não genérica)
- Cite jurisprudência dos tribunais superiores quando disponível nas fontes
- Pedido claro sobre o que se pretende com o provimento do recurso`
      }

      if (isContratoOuNota) {
        return `Você é um especialista em redação de documentos técnicos e contratos. Produza um documento formal completo com estrutura adequada ao tipo solicitado (contrato ou nota técnica).

Para **contratos**: inclua qualificação das partes, objeto, obrigações, prazo, valor, penalidades, foro.
Para **notas técnicas**: inclua ementa, objeto de análise, base legal/técnica, desenvolvimento, conclusões, recomendações.

Requisitos de qualidade:
- Linguagem formal, técnica e objetiva
- Cláusulas/seções claramente identificadas e numeradas
- Mínimo de 1.500 palavras
- Fundamentação normativa quando aplicável`
      }

      // Default: generic formal legal/technical document
      return `Você é um redator jurídico/técnico de alto nível com profunda experiência em produção documental forense e acadêmica. Crie um documento formal completo, com densidade analítica e rigor técnico.

Estrutura obrigatória:
- **CABEÇALHO** — Identificação completa: título do documento, data, assunto, autor/destinatário (quando aplicável)
- **I. INTRODUÇÃO** — Objetivo, escopo e delimitação do tema; contextualização fática/jurídica
- **II. FUNDAMENTAÇÃO** — Embasamento legal (dispositivos normativos aplicáveis), doutrina (com referências) e jurisprudência (com citações quando disponíveis nas fontes)
- **III. DESENVOLVIMENTO** — Análise em seções numeradas (III.1, III.2, III.3…), cada qual com:
  - enunciação do problema/ponto a examinar
  - desenvolvimento argumentativo com premissas e raciocínio encadeado
  - conclusão parcial do ponto
- **IV. CONCLUSÕES** — Síntese das principais conclusões, posicionamento fundamentado e implicações práticas
- **V. REFERÊNCIAS** — Dispositivos legais, decisões judiciais e fontes doutrinárias utilizadas

Requisitos de qualidade:
- Mínimo de 1.500 palavras no desenvolvimento total
- Cada seção de desenvolvimento deve ter ao menos 3 parágrafos densos
- Fundamentação jurídica obrigatória: cite dispositivos legais relevantes ao tema
- Se as fontes contiverem jurisprudência (DataJud), integre as ementas e teses identificadas
- Evite linguagem genérica: toda afirmação deve ser fundada em argumento, norma ou precedente
- Linguagem formal, precisa, sem coloquialismos ou ambiguidades
- Evite repetições e afirmações circulares
- Use numeração hierárquica consistente (I, II, III / 1, 2, 3 / a, b, c)

Guardrails anti-superficialidade:
- NÃO escreva apenas tópicos ou listas sem desenvolvimento
- NÃO produza introduções que apenas anunciam o que será dito sem dizer
- NÃO inclua seções vazias ou com menos de 2 parágrafos
- NÃO use fórmulas genéricas como "cumpre observar que" sem desenvolver o ponto
- NÃO ignore a fundamentação normativa e jurisprudencial`
    }
    case 'cartoes_didaticos':
      return `Você é um especialista em educação e técnicas de memorização. Crie cartões didáticos (flashcards) profissionais.

RESPONDA com um JSON puro no seguinte schema (sem \`\`\`json):
{
  "title": "Título do conjunto de flashcards",
  "categories": [
    {
      "name": "Nome da categoria temática",
      "cards": [
        {
          "front": "Pergunta ou conceito (frente do cartão)",
          "back": "Resposta completa (verso do cartão)",
          "difficulty": "basico | intermediario | avancado",
          "tip": "Dica de memorização (opcional)"
        }
      ]
    }
  ]
}

Requisitos:
- Mínimo 25 cartões distribuídos em 3-5 categorias
- Mix de dificuldades: ~30% básico, ~40% intermediário, ~30% avançado
- Perguntas variadas: conceitual, aplicação prática, comparação, verdadeiro/falso
- Respostas completas e didáticas (não apenas uma palavra)
- Dicas de memorização para cartões complexos
- Último cartão de cada categoria deve ser um resumo integrador`
    case 'teste':
      return `Você é um especialista em avaliação educacional. Crie um teste/quiz completo e profissional.

RESPONDA com um JSON puro no seguinte schema (sem \`\`\`json):
{
  "title": "Título do teste",
  "difficulty": "Fácil a Difícil (progressivo)",
  "estimatedTime": "30-45 minutos",
  "questions": [
    {
      "number": 1,
      "type": "multipla_escolha | verdadeiro_falso | dissertativa | caso_pratico | associacao",
      "text": "Enunciado completo da questão",
      "options": [
        { "label": "A", "text": "Texto da alternativa" },
        { "label": "B", "text": "Texto da alternativa" }
      ],
      "pairs": [
        { "left": "Item esquerda", "right": "Item direita" }
      ],
      "answer": "Resposta correta (letra para múltipla escolha, V/F, texto para dissertiva)",
      "explanation": "Justificativa detalhada da resposta correta"
    }
  ],
  "scoring": { "total": 100, "perQuestion": 5 }
}

Requisitos:
- Mínimo 15 questões de tipos variados:
  - multipla_escolha: 5+ questões (4 alternativas A-D em "options")
  - verdadeiro_falso: 3+ questões (options com "V" e "F")
  - dissertativa: 3+ questões (sem options)
  - caso_pratico: 2+ questões (sem options)
  - associacao: 2+ questões (usar "pairs" em vez de "options")
- Nível progressivo de dificuldade
- Explicação detalhada para CADA questão
- Para multipla_escolha e verdadeiro_falso: use "options"
- Para associacao: use "pairs"
- Para dissertativa/caso_pratico: omita "options" e "pairs"`
    case 'guia_estruturado':
      return `Você é um especialista em síntese de conhecimento jurídico e técnico. Crie um guia estruturado completo e profissional, adequado para orientação prática ou estudo aprofundado.

Estrutura obrigatória:
- **Resumo do Tema** — contexto geral, relevância e delimitação (2-3 parágrafos substanciais)
- **Principais Achados** — o mais relevante de cada fonte analisada (com referência explícita à fonte)
- **Marco Normativo / Referencial Teórico** — dispositivos legais, precedentes ou teoria aplicável
- **Conexões e Padrões** — como as fontes e argumentos se relacionam entre si
- **Análise de Controvérsias** — posições divergentes, debates abertos, entendimentos conflitantes
- **Lacunas Identificadas** — o que falta para uma análise completa
- **Questões-Chave** — as 5-7 perguntas mais importantes sobre o tema (com breve resposta fundamentada)
- **Próximos Passos** — como aprofundar a pesquisa, quais fontes buscar, quais aspectos desenvolver

Requisitos:
- Mínimo 1.000 palavras
- Cada seção deve ter desenvolvimento real, não apenas listagem de tópicos
- Se fontes de jurisprudência estiverem disponíveis, cite processos e ementas relevantes
- Use linguagem clara, técnica quando necessário, e inclua referências às fontes
- Responda em português brasileiro com tom técnico e orientado à prática`
    default:
      return `Você é um escritor profissional especializado em ${artifactLabel}. Crie um conteúdo completo, detalhado e de alta qualidade.`
  }
}

// ── Pipeline execution ───────────────────────────────────────────────────────

/**
 * Execute the 3-stage studio pipeline for artifact generation.
 *
 * @param input — artifact context (topic, sources, type, etc.)
 * @param onProgress — callback for UI progress updates
 * @returns final content + execution records for all steps
 */
export async function runStudioPipeline(
  input: StudioPipelineInput,
  onProgress?: StudioProgressCallback,
  signal?: AbortSignal,
): Promise<StudioPipelineResult> {
  throwIfAborted(signal)
  const models: ResearchNotebookModelMap = await loadResearchNotebookModels()
  const specialistRole = ARTIFACT_AGENT_MAP[input.artifactType] ?? 'studio_escritor'
  const executions: StudioStepExecution[] = []

  // Validate all required models exist
  const requiredAgents = [
    { key: 'studio_pesquisador', label: 'Pesquisador do Estúdio' },
    { key: specialistRole, label: SPECIALIST_LABELS[specialistRole] },
    { key: 'studio_revisor', label: 'Revisor de Qualidade' },
  ]
  const missing = requiredAgents.filter(a => !models[a.key])
  if (missing.length > 0) {
    throw new Error(
      `Agente(s) sem modelo configurado: ${missing.map(a => a.label).join(', ')}. ` +
      'Vá em Configurações > Caderno de Pesquisa e selecione modelos para todos os agentes do estúdio.',
    )
  }

  await validateScopedAgentModels('research_notebook_models', {
    studio_pesquisador: models.studio_pesquisador,
    [specialistRole]: models[specialistRole],
    studio_revisor: models.studio_revisor,
  })

  // ── Step 1: Research ────────────────────────────────────────────────
  throwIfAborted(signal)
  onProgress?.(1, 3, 'Pesquisando e organizando fontes…', {
    executionState: 'running',
  })

  const researchPrompt = buildResearchPrompt(input)
  const researchResult: LLMResult = await callLLMWithFallback(
    input.apiKey,
    researchPrompt.system,
    researchPrompt.user,
    models.studio_pesquisador,
    models.studio_pesquisador,
    4000,
    0.2,
    { signal },
  )
  executions.push({
    phase: `studio_pesquisador_${input.artifactType}`,
    agent_name: 'Pesquisador do Estúdio',
    model: researchResult.model,
    tokens_in: researchResult.tokens_in,
    tokens_out: researchResult.tokens_out,
    cost_usd: researchResult.cost_usd,
    duration_ms: researchResult.duration_ms,
  })
  onProgress?.(1, 3, 'Pesquisa de fontes concluída.', buildStudioProgressMeta(researchResult))

  // Brief pause to avoid hitting rate limits on consecutive calls
  await sleep(1000, signal)

  // ── Step 2: Specialist creation ─────────────────────────────────────
  throwIfAborted(signal)
  onProgress?.(2, 3, `${SPECIALIST_LABELS[specialistRole]} criando conteúdo…`, {
    executionState: 'running',
  })

  const specialistPrompt = buildSpecialistPrompt(input, researchResult.content, specialistRole)
  const specialistResult: LLMResult = await callLLMWithFallback(
    input.apiKey,
    specialistPrompt.system,
    specialistPrompt.user,
    models[specialistRole],
    models[specialistRole],
    8000,
    0.4,
    { signal },
  )
  executions.push({
    phase: `${specialistRole}_${input.artifactType}`,
    agent_name: SPECIALIST_LABELS[specialistRole],
    model: specialistResult.model,
    tokens_in: specialistResult.tokens_in,
    tokens_out: specialistResult.tokens_out,
    cost_usd: specialistResult.cost_usd,
    duration_ms: specialistResult.duration_ms,
  })
  onProgress?.(2, 3, `${SPECIALIST_LABELS[specialistRole]} concluiu a primeira versão.`, buildStudioProgressMeta(specialistResult))
  // Brief pause to avoid hitting rate limits on consecutive calls
  await sleep(1000, signal)
  // ── Step 3: Quality review ──────────────────────────────────────────
  throwIfAborted(signal)
  onProgress?.(3, 3, 'Revisando e aprimorando…', {
    executionState: 'running',
  })

  const reviewPrompt = buildReviewPrompt(input, specialistResult.content)
  const reviewResult: LLMResult = await callLLMWithFallback(
    input.apiKey,
    reviewPrompt.system,
    reviewPrompt.user,
    models.studio_revisor,
    models.studio_revisor,
    10000,
    0.2,
    { signal },
  )
  executions.push({
    phase: `studio_revisor_${input.artifactType}`,
    agent_name: 'Revisor de Qualidade',
    model: reviewResult.model,
    tokens_in: reviewResult.tokens_in,
    tokens_out: reviewResult.tokens_out,
    cost_usd: reviewResult.cost_usd,
    duration_ms: reviewResult.duration_ms,
  })
  onProgress?.(3, 3, 'Revisão de qualidade concluída.', buildStudioProgressMeta(reviewResult))

  return {
    content: reviewResult.content,
    executions,
  }
}

export async function generateStructuredVisualArtifactMedia(
  artifactType: StudioArtifactType,
  rawContent: string,
): Promise<StudioVisualMediaResult> {
  const startedAt = Date.now()
  let parsed: ReturnType<typeof parseArtifactContent>
  try {
    parsed = parseArtifactContent(artifactType, rawContent)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'estrutura inválida'
    throw new Error(`O artefato visual "${artifactType}" possui estrutura inválida para gerar imagem final. ${detail}`)
  }

  try {
    if (artifactType === 'infografico' && parsed.kind === 'infographic') {
      return {
        rendered: await renderInfographicImage(parsed.data),
        execution: {
          phase: 'visual_artifact_render',
          agent_name: 'Renderizador Visual Final',
          model: 'browser/svg-render',
          tokens_in: 0,
          tokens_out: 0,
          cost_usd: 0,
          duration_ms: Date.now() - startedAt,
        },
      }
    }

    if (artifactType === 'mapa_mental' && parsed.kind === 'mindmap') {
      return {
        rendered: await renderMindMapImage(parsed.data),
        execution: {
          phase: 'visual_artifact_render',
          agent_name: 'Renderizador Visual Final',
          model: 'browser/svg-render',
          tokens_in: 0,
          tokens_out: 0,
          cost_usd: 0,
          duration_ms: Date.now() - startedAt,
        },
      }
    }

    if (artifactType === 'tabela_dados' && parsed.kind === 'datatable') {
      return {
        rendered: await renderDataTableImage(parsed.data),
        execution: {
          phase: 'visual_artifact_render',
          agent_name: 'Renderizador Visual Final',
          model: 'browser/svg-render',
          tokens_in: 0,
          tokens_out: 0,
          cost_usd: 0,
          duration_ms: Date.now() - startedAt,
        },
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'falha de renderização'
    throw new Error(`O artefato visual "${artifactType}" não pôde ser renderizado. ${detail}`)
  }

  throw new Error(`O artefato visual "${artifactType}" possui estrutura inválida para gerar imagem final.`)
}

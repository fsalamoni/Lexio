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

import { callLLM, type LLMResult } from './llm-client'
import { loadResearchNotebookModels, type ResearchNotebookModelMap } from './model-config'
import type { StudioArtifactType } from './firestore-service'

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
}

export interface StudioPipelineResult {
  content: string
  /** Execution records for each pipeline step */
  executions: StudioStepExecution[]
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

export type StudioProgressCallback = (step: number, totalSteps: number, phase: string) => void

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
  outro:             'studio_escritor',
}

const SPECIALIST_LABELS: Record<SpecialistRole, string> = {
  studio_escritor:    'Escritor',
  studio_roteirista:  'Roteirista',
  studio_visual:      'Designer Visual',
}

// ── Prompt templates ──────────────────────────────────────────────────────────

function buildResearchPrompt(input: StudioPipelineInput): { system: string; user: string } {
  return {
    system: `Você é um pesquisador especialista. Sua tarefa é extrair e organizar as informações mais relevantes das fontes disponíveis para a criação de um(a) ${input.artifactLabel}.

Regras:
- Analise TODAS as fontes disponíveis
- Identifique os dados mais relevantes para o tipo de artefato solicitado
- Organize as informações em seções temáticas claras
- Inclua citações diretas quando relevantes
- Destaque dados quantitativos, datas, nomes e referências normativas
- Sinalize contradições ou lacunas entre fontes
- Responda em português brasileiro`,
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

  return {
    system: `${roleInstructions}

Contexto do tema: "${input.topic}"
${input.description ? `Objetivo: ${input.description}` : ''}

Conversas anteriores (para manter consistência):
${input.conversationContext || '(Sem conversas anteriores)'}

Regras gerais:
- Gere conteúdo em formato Markdown de alta qualidade
- Seja completo, detalhado e profissional
- Responda em português brasileiro com tom adequado ao tipo de artefato
- Use as informações do briefing de pesquisa como base fundamental`,
    user: input.customInstructions
      ? `BRIEFING DE PESQUISA:\n${researchBriefing}\n\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${input.customInstructions}\n\nCrie um(a) ${input.artifactLabel} completo(a) e profissional.`
      : `BRIEFING DE PESQUISA:\n${researchBriefing}\n\nCrie um(a) ${input.artifactLabel} completo(a) e profissional sobre "${input.topic}".`,
  }
}

function buildReviewPrompt(
  input: StudioPipelineInput,
  draft: string,
): { system: string; user: string } {
  return {
    system: `Você é um revisor de qualidade de nível mundial. Sua missão é aprimorar o artefato abaixo, garantindo que atinja o mais alto padrão de excelência.

Critérios de revisão:
1. **Completude** — O conteúdo cobre todos os aspectos relevantes do tema?
2. **Precisão** — Os dados, referências e citações estão corretos?
3. **Estrutura** — A organização é lógica e facilita a compreensão?
4. **Clareza** — A linguagem é precisa e acessível para o público-alvo?
5. **Formatação** — O Markdown está correto e bem formatado?
6. **Profundidade** — O nível de detalhe é adequado ao tipo de artefato?
7. **Originalidade** — O conteúdo traz insights relevantes e diferenciados?

Regras:
- RETORNE o artefato COMPLETO revisado e aprimorado (não apenas sugestões)
- Mantenha o formato original (Markdown)
- Adicione detalhes, exemplos e aprofundamentos onde necessário
- Corrija erros factuais, gramaticais ou de formatação
- Responda em português brasileiro`,
    user: `Tipo de artefato: ${input.artifactLabel}
Tema: "${input.topic}"
${input.description ? `Objetivo: ${input.description}` : ''}

RASCUNHO PARA REVISÃO:
${draft}

Revise e apriore este ${input.artifactLabel}, retornando a versão FINAL completa.`,
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

O roteiro DEVE incluir:
- **Abertura** com vinheta e apresentação do tema
- **Marcações de tempo** estimadas para cada segmento [00:00]
- **Narração principal** com tom conversacional e envolvente
- **Transições** entre segmentos com indicações sonoras
- **Citações e referências** integradas naturalmente na narrativa
- **Perguntas retóricas** para engajar o ouvinte
- **Fechamento** com recapitulação e chamada para ação
- **Notas de produção** (efeitos sonoros, música de fundo, pausas)
- Duração estimada: 15-20 minutos`
      : `Você é um roteirista profissional de vídeo e conteúdo audiovisual. Crie um roteiro completo para produção de vídeo.

O roteiro DEVE incluir:
- **Cena por cena** com descrição de enquadramentos e ângulos
- **Marcações de tempo** estimadas [00:00]
- **Narração/locução** com tom profissional
- **Indicações visuais** (gráficos, textos na tela, animações)
- **Transições** entre cenas (corte, fade, wipe)
- **B-roll** sugestões de imagens complementares
- **Lower thirds** textos identificativos na tela
- **Abertura** e **encerramento** com identidade visual
- **Notas de pós-produção** (efeitos visuais, correção de cor)
- Duração estimada: 10-15 minutos`
  }

  if (role === 'studio_visual') {
    switch (artifactType) {
      case 'apresentacao':
        return `Você é um designer de apresentações profissionais. Crie uma apresentação completa em formato de slides.

Cada slide DEVE ter:
- **Número e título** do slide
- **Tópicos principais** em bullets concisos (máx. 5 por slide)
- **Notas do apresentador** com roteiro de fala expandido
- **Sugestão visual** (tipo de gráfico, imagem ou diagrama para cada slide)

Estrutura obrigatória:
1. Capa (título, subtítulo, autor/data)
2. Agenda/Sumário
3-N. Slides de conteúdo (mínimo 12 slides)
N+1. Conclusões e próximos passos
N+2. Referências
N+3. Slide de encerramento/Q&A

Use linguagem concisa nos slides e detalhada nas notas.`
      case 'mapa_mental':
        return `Você é um especialista em mapas mentais e organização visual de conhecimento. Crie um mapa mental completo e profissional.

Estrutura obrigatória:
- **Nó central** com o tema principal
- **Ramos primários** (3-7) representando categorias principais
- **Sub-ramos** (2-5 por ramo) com detalhes e exemplos
- **Conexões cruzadas** entre ramos relacionados (indicar com →)
- **Ícones sugestivos** para cada categoria (usar emojis)
- **Cores sugeridas** para cada ramo principal

Use listas aninhadas com indentação para representar a hierarquia:
- Nível 1: Tópico principal
  - Nível 2: Subtópico
    - Nível 3: Detalhe
      - Nível 4: Exemplo específico

Inclua no mínimo 40 nós no total.`
      case 'infografico':
        return `Você é um designer de infográficos que transforma dados complexos em informação visual acessível. Crie um infográfico completo em formato texto/Markdown.

Seções obrigatórias:
- **Título impactante** com subtítulo explicativo
- **Dados-chave** em destaque (use blocos de citação/números grandes)
- **Seções visuais** organizadas com ícones (emojis) e separadores
- **Comparações** lado a lado quando relevante
- **Linha do tempo** se aplicável
- **Estatísticas** formatadas em destaque
- **Fontes e referências** no rodapé
- **Conclusão visual** com take-away principal

Use formatação Markdown criativa: tabelas, blocos de citação, separadores, emojis.`
      case 'tabela_dados':
        return `Você é um analista de dados especializado em organização tabular. Crie tabelas de dados completas e informativas.

Requisitos:
- **Tabela principal** com dados organizados logicamente
- **Cabeçalhos claros** e descritivos
- **Categorização** por tipo/grupo quando aplicável
- **Tabela de resumo/totais** quando houver dados numéricos
- **Legenda** explicando abreviações ou códigos
- **Notas de rodapé** com fontes e observações
- **Tabela comparativa** se houver dados para comparação
- Mínimo 10 linhas de dados na tabela principal

Use formato Markdown para tabelas. Alinhe colunas numéricas à direita.`
      default:
        return `Você é um designer visual especializado em ${artifactLabel}. Crie um artefato visual profissional e completo.`
    }
  }

  // studio_escritor
  switch (artifactType) {
    case 'resumo':
      return `Você é um especialista em síntese e análise. Crie um resumo executivo completo e profissional.

Estrutura obrigatória:
- **Resumo Executivo** (2-3 parágrafos de visão geral)
- **Contexto e Antecedentes** (cenário, motivação)
- **Pontos Principais** (5-8 descobertas/argumentos centrais)
- **Análise Crítica** (pontos fortes, fracos, implicações)
- **Conclusões** (síntese final e posicionamento)
- **Recomendações** (próximos passos sugeridos)

Use linguagem clara, técnica quando necessário, e inclua referências às fontes.`
    case 'relatorio':
      return `Você é um analista sênior. Crie um relatório analítico detalhado e profissional.

Estrutura obrigatória:
- **Sumário Executivo** (página de resumo para decisores)
- **Metodologia** (como as informações foram analisadas)
- **Contextualização** (panorama e antecedentes)
- **Análise Detalhada** (múltiplas seções temáticas, cada uma com dados e interpretação)
- **Análise Comparativa** (quando aplicável)
- **Riscos e Oportunidades** (identificados na análise)
- **Conclusões** (fundamentadas nos dados)
- **Recomendações** (ações concretas priorizadas)
- **Referências** (fontes utilizadas)

Mínimo 2.000 palavras. Use dados, exemplos e fundamentação.`
    case 'documento':
      return `Você é um redator jurídico/técnico de alto nível. Crie um documento formal completo.

Estrutura:
- **Cabeçalho** com identificação do documento
- **Introdução** com objetivo e escopo
- **Fundamentação** (legal, técnica ou teórica)
- **Desenvolvimento** em seções numeradas
- **Considerações Finais**
- **Referências Bibliográficas/Normativas**

Use linguagem formal, precisa e tecnicamente correta.`
    case 'cartoes_didaticos':
      return `Você é um especialista em educação e técnicas de memorização. Crie cartões didáticos (flashcards) profissionais.

Requisitos:
- Mínimo **20 cartões**
- Cada cartão com **FRENTE** (pergunta) e **VERSO** (resposta)
- Organize em **categorias temáticas** com títulos
- Inclua cartões de **diferentes níveis de dificuldade**: básico, intermediário, avançado
- Use perguntas variadas: conceitual, aplicação prática, comparação, verdadeiro/falso
- Adicione **dicas de memorização** quando relevante
- Inclua um **cartão-resumo** final com os conceitos mais importantes

Formato: 
### [Categoria]
**Cartão N** ⭐/⭐⭐/⭐⭐⭐
- **Frente:** [pergunta]
- **Verso:** [resposta]`
    case 'teste':
      return `Você é um especialista em avaliação educacional. Crie um teste/quiz completo e profissional.

Requisitos:
- **Cabeçalho** com título, tema, nível de dificuldade e tempo estimado
- Mínimo **15 questões** de tipos variados:
  - Múltipla escolha (5+ questões, 4 alternativas cada)
  - Verdadeiro ou Falso com justificativa (3+ questões)
  - Dissertativas curtas (3+ questões)
  - Questão de análise/caso prático (2+ questões)
  - Questão de associação/correspondência (2+ questões)
- **Nível progressivo** de dificuldade (fácil → difícil)
- **Gabarito completo** no final com:
  - Resposta correta de cada questão
  - Justificativa/explicação
  - Referência à fonte quando aplicável
- **Tabela de pontuação** sugerida`
    case 'guia_estruturado':
      return `Você é um especialista em síntese de conhecimento. Crie um guia estruturado completo e profissional.

Estrutura obrigatória:
- **Resumo do Tema** — contexto geral (2-3 parágrafos)
- **Principais Achados** — o mais relevante de cada fonte analisada
- **Conexões e Padrões** — como as fontes se relacionam entre si
- **Lacunas Identificadas** — o que falta para uma pesquisa completa
- **Questões-Chave** — as 5 perguntas mais importantes sobre o tema
- **Próximos Passos** — como aprofundar a pesquisa

Use linguagem clara, técnica quando necessário, e inclua referências às fontes. Responda em português brasileiro com tom técnico.`
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
): Promise<StudioPipelineResult> {
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
      'Vá em Administração > Caderno de Pesquisa e selecione modelos para todos os agentes do estúdio.',
    )
  }

  // ── Step 1: Research ────────────────────────────────────────────────
  onProgress?.(1, 3, 'Pesquisando e organizando fontes…')

  const researchPrompt = buildResearchPrompt(input)
  const researchResult: LLMResult = await callLLM(
    input.apiKey,
    researchPrompt.system,
    researchPrompt.user,
    models.studio_pesquisador,
    3000,
    0.2,
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

  // Brief pause to avoid hitting rate limits on consecutive calls
  await new Promise(resolve => setTimeout(resolve, 1000))

  // ── Step 2: Specialist creation ─────────────────────────────────────
  onProgress?.(2, 3, `${SPECIALIST_LABELS[specialistRole]} criando conteúdo…`)

  const specialistPrompt = buildSpecialistPrompt(input, researchResult.content, specialistRole)
  const specialistResult: LLMResult = await callLLM(
    input.apiKey,
    specialistPrompt.system,
    specialistPrompt.user,
    models[specialistRole],
    5000,
    0.4,
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
  // Brief pause to avoid hitting rate limits on consecutive calls
  await new Promise(resolve => setTimeout(resolve, 1000))
  // ── Step 3: Quality review ──────────────────────────────────────────
  onProgress?.(3, 3, 'Revisando e aprimorando…')

  const reviewPrompt = buildReviewPrompt(input, specialistResult.content)
  const reviewResult: LLMResult = await callLLM(
    input.apiKey,
    reviewPrompt.system,
    reviewPrompt.user,
    models.studio_revisor,
    6000,
    0.2,
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

  return {
    content: reviewResult.content,
    executions,
  }
}

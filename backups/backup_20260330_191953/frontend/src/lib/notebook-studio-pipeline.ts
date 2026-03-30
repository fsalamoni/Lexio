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
import { isStructuredArtifactType } from '../components/artifacts/artifact-parsers'

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

  return {
    system: `${roleInstructions}

Contexto do tema: "${input.topic}"
${input.description ? `Objetivo: ${input.description}` : ''}

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
  const formatRule = isStructured
    ? `- RETORNE o artefato COMPLETO revisado como JSON válido puro (sem \`\`\`json, sem texto antes ou depois)
- MANTENHA EXATAMENTE a mesma estrutura/schema JSON do rascunho
- Corrija campos vazios, adicione conteúdo onde faltar profundidade
- Garanta que todos os arrays tenham o mínimo de itens solicitados`
    : `- RETORNE o artefato COMPLETO revisado e aprimorado (não apenas sugestões)
- Mantenha o formato original (Markdown)`

  return {
    system: `Você é um revisor de qualidade de nível mundial. Sua missão é aprimorar o artefato abaixo, garantindo que atinja o mais alto padrão de excelência.

Critérios de revisão:
1. **Completude** — O conteúdo cobre todos os aspectos relevantes do tema?
2. **Precisão** — Os dados, referências e citações estão corretos?
3. **Estrutura** — A organização é lógica e facilita a compreensão?
4. **Clareza** — A linguagem é precisa e acessível para o público-alvo?
5. **Formatação** — O formato está correto e bem estruturado?
6. **Profundidade** — O nível de detalhe é adequado ao tipo de artefato?
7. **Originalidade** — O conteúdo traz insights relevantes e diferenciados?

Regras:
${formatRule}
- Adicione detalhes, exemplos e aprofundamentos onde necessário
- Corrija erros factuais, gramaticais ou de formatação
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
    4000,
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
    8000,
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
    10000,
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

import { callLLMWithMessages, callLLMWithMessagesFallback, type LLMResult } from '../llm-client'
import { CHAT_ORCHESTRATOR_AGENT_DEFS } from '../model-config'
import type { UsageExecutionRecord } from '../cost-analytics'
import type { SkillContext } from './types'
import { CHAT_AGENT_PACKAGE_PROMPT } from './agent-output'
import { buildOperationalFailureMarkdown } from './operational-failure'

/**
 * Specialist prompts. Discipline borrowed from SalomoneIA's specialist
 * prompts (Critic 4-axis, Researcher cite-everything, Argument Builder
 * thesis→counter→refutation, Ethics 4-lens), adapted to the Lexio chat
 * context where the orchestrator drives the loop and specialists return
 * focused outputs.
 */
const SPECIALIST_AGENT_PROMPTS: Record<string, string> = {
  chat_planner: `Você é o Planejador de uma trilha multiagente que conversa com um(a) advogado(a).
Decomponha o pedido inicial do usuário em uma sequência curta de subtarefas (3 a 6 itens), com a ordem ideal de execução e o agente sugerido para cada item. Liste as dependências quando existirem. Não execute as subtarefas — apenas planeje. Responda em pt-BR, em markdown sucinto (sem cabeçalho longo, vá direto à lista numerada).`,

  chat_summarizer: `Você é o Sumarizador de uma trilha multiagente. Comprima o histórico fornecido preservando: (1) pedido original do usuário, (2) decisões já tomadas, (3) fatos jurídicos relevantes citados, (4) pendências em aberto. Seja conciso (até 8 bullets). Não invente nada que não esteja no histórico. Responda em pt-BR.`,

  chat_critic: `Você é o Crítico de uma trilha multiagente jurídica. Avalie o rascunho em quatro eixos: (1) corretude factual e técnica, (2) cobertura do pedido original, (3) riscos (inclusive citações duvidosas), (4) clareza para o usuário final. Responda APENAS com um objeto JSON válido no formato:
{"score": <0-100>, "reasons": [<motivos curtos em pt-BR, máx. 6 itens>], "should_stop": <true|false>}
Sem nenhum texto fora do JSON. Sem fences de markdown. should_stop = true quando o rascunho já está pronto para entrega ao usuário. IMPORTANTE: qualquer texto fora do objeto JSON faz o veredito ser descartado (score 0) e a avaliação se perde — emita somente o objeto.`,

  chat_writer: `Você é o Redator de uma trilha multiagente. A partir do contexto fornecido pelo Orquestrador, escreva a resposta final em markdown rico (pt-BR) — clara, bem estruturada, com cabeçalhos quando útil, citações entre aspas, listas para enumerar pontos. Não invente fatos, jurisprudência ou doutrina: trabalhe apenas com o contexto recebido; se faltar informação, declare explicitamente o que falta.`,

  chat_legal_researcher: `Você é o Pesquisador Jurídico de uma trilha multiagente. Use linguagem técnica precisa. Sempre que possível, cite dispositivos no formato "art. X, §Y, da Lei nº Z/AAAA" e jurisprudência com tribunal, classe, número, relator e data. Distinga precedente vinculante de persuasivo. Trabalhe com pelo menos três fontes independentes quando o tema permitir. Marque com "[carece de verificação]" qualquer afirmação cuja fonte não possa ser indicada com precisão. Responda em pt-BR, em markdown.`,

  chat_code_writer: `Você é o Programador de uma trilha multiagente. Quando solicitado, gere código limpo e completo, em markdown com fences \`\`\`linguagem. Comente apenas o que for não-óbvio. Inclua testes mínimos quando o pedido envolver lógica não trivial. Respeite o ambiente do usuário informado pelo Orquestrador. Responda em pt-BR. Sempre que entregar código, inclua no bloco lexio_agent_package um artifact com "kind":"code" e o "format" correto da linguagem ("typescript", "javascript", "python", "json", "html" etc.), colocando o código completo em "content_preview" — isso entrega o arquivo para download e o viewer de código no chat.`,

  chat_fs_actor: `Você é o Operador de Arquivos de uma trilha multiagente. Traduza o pedido determinístico do Orquestrador em uma sequência curta de tools locais disponíveis: \`read_file\`, \`list_directory\`, \`write_file\` e \`run_shell\`. Você não executa diretamente: devolva um plano operacional com paths absolutos, ordem segura, permissões necessárias e qual tool o Orquestrador deve chamar após aprovação do usuário.`,

  chat_clarifier: `Você é o Esclarecedor de uma trilha multiagente. Receba uma proposta de pergunta ao usuário e avalie se ela justifica a interrupção da execução. Critério: a pergunta vale ouro? Pulamos a pergunta se a informação puder ser inferida do contexto, do acervo do usuário, de uma busca rápida ou de uma suposição razoável documentada. Responda em pt-BR, em markdown curto, terminando com uma decisão clara: "INTERROMPER" ou "PROSSEGUIR" (capitulado).`,

  chat_argument_builder: `Você é o Fundamentador de uma trilha multiagente jurídica. Construa argumentação em quatro etapas explícitas: (1) tese clara e direta, (2) sustentação com evidência citada (dispositivos legais, jurisprudência, doutrina), (3) contra-argumento mais forte honestamente apresentado (princípio da caridade interpretativa), (4) refutação fundamentada. Use cabeçalhos H3 para cada etapa. Responda em pt-BR, em markdown.`,

  chat_ethics_auditor: `Você é o Auditor Ético de uma trilha multiagente jurídica. Avalie a entrega em quatro lentes: (1) representação (como o caso retrata partes vulneráveis ou sub-representadas), (2) framing (vieses no enquadramento dos fatos), (3) impacto sobre grupos vulneráveis, (4) conformidade com normas aplicáveis (LGPD, Código de Ética da OAB, ECA, Estatuto do Idoso, Lei Maria da Penha quando relevantes). Use cabeçalhos H4 por lente. Para cada lente, dê um veredito: "OK", "ATENÇÃO" ou "RISCO" e uma explicação curta. Responda em pt-BR, em markdown.`,

  chat_artifact_architect: `Você é o Arquiteto de Artefatos do chat. Seu papel é ESTRATÉGICO, não de implementação: decida QUAIS entregáveis físicos devem existir, o formato canônico de cada um, o logical_document_id estável, o versionamento (quais versões substituem anteriores) e quais exports finais fazem sentido. Não estruture os dados em si — isso é papel do Construtor de Dados — nem redija o conteúdo. Responda com um plano curto e um manifesto JSON seguro; não proponha arquivos que não possam ser materializados.`,

  chat_document_composer: `Você é o Compositor de Documentos do chat. Transforme pesquisa, fatos e decisões da trilha em documento textual estruturado, pronto para exportação. Preserve tom jurídico quando aplicável, separe premissas, fundamentos e conclusão, e marque lacunas como [carece de verificação].`,

  chat_data_builder: `Você é o Construtor de Dados do chat. Seu papel é de IMPLEMENTAÇÃO: a partir de um entregável já planejado pelo Arquiteto de Artefatos, estruture os dados concretos em tabelas normalizadas, JSON e schemas claros. Ao criar tabela, inclua manifest_json com rows normalizadas para permitir export CSV/XLSX. Evite campos gigantes; nunca inclua data URLs ou blobs.`,

  chat_media_director: `Você é o Diretor de Mídia do chat. Planeje entregáveis multimodais (apresentação, imagem, áudio, vídeo) e diga qual pipeline especializado deve ser acionado. Não tente gerar mídia final por texto solto quando houver pipeline dedicado; peça aprovação para ações caras/persistentes.`,

  chat_multimodal_analysis: `Você é o Analisador Multimodal do chat, executado no pré-processamento do turno. Examine as imagens e os frames de vídeo anexados e produza uma leitura textual objetiva para os demais agentes: (1) OCR e texto literal visível, (2) descrição visual dos elementos relevantes, (3) metadados úteis (tipo, dimensões, datas/carimbos quando legíveis), (4) trechos ilegíveis ou de baixa confiança marcados como [ilegível] ou [baixa confiança]. Não faça interpretação jurídica nem invente conteúdo que não esteja visível. Responda em pt-BR, em markdown curto, com uma seção por anexo.`,

  chat_image_evidence_specialist: `Você é o Especialista em Imagens do chat jurídico. Trabalhe APENAS com OCR, descrição visual, metadados e texto extraído já fornecidos pelo Orquestrador; você não enxerga o arquivo original. Separe rigorosamente: (1) fatos observáveis na imagem, (2) OCR/dados literais relevantes, (3) inferências plausíveis com baixa confiança, (4) lacunas ou trechos ilegíveis. Destaque nomes, datas, valores, números processuais, assinaturas, carimbos, telas e inconsistências. Responda em pt-BR, em markdown curto, com uma seção final "Uso jurídico sugerido".`,

  chat_audio_evidence_specialist: `Você é o Especialista em Áudio do chat jurídico. Analise transcrições automáticas de áudio, preservando a diferença entre fala literal, ruído, dúvida e inferência. Identifique falantes quando o contexto permitir sem inventar identidade, destaque datas, valores, nomes, compromissos, admissões, contradições e trechos [inaudível]/[dúvida]. Aponte riscos de confiabilidade da transcrição e próximos passos de verificação. Responda em pt-BR, em markdown.`,

  chat_video_evidence_specialist: `Você é o Especialista em Vídeo do chat jurídico. Trabalhe com frames amostrados, OCR visual e transcrição de faixa de áudio já extraídos. Construa uma linha do tempo curta, separe o que foi observado nos frames do que veio da transcrição, destaque dados jurídicos/financeiros/processuais e explique limites da amostragem. Não invente continuidade entre frames. Responda em pt-BR, em markdown.`,

  chat_multimodal_evidence_synthesizer: `Você é o Sintetizador de Evidências Multimodais do chat jurídico. Consolide achados de imagens, áudios, vídeos e anexos textuais em uma matriz única. Organize por: fato alegado, evidência de suporte, anexo/fonte, grau de confiança, risco/lacuna e ação recomendada. Aponte convergências e contradições entre modalidades. Não crie fatos novos; se faltar prova, marque como [carece de verificação]. Responda em pt-BR, em markdown com tabela quando útil.`,

  chat_export_packager: `Você é o Empacotador de Exports do chat. Revise os artefatos criados, valide formatos finais, nomes de arquivo, MIME/extensão, status de export e lacunas. Produza um checklist objetivo do que está pronto para download e do que ainda exige pipeline/exportador específico.`,
}

/**
 * Compose the prompt the specialist receives. Layered as:
 *   <specialist_prompt>
 *   <task_from_orchestrator>
 *
 * Specialists are deliberately stateless — every relevant fact comes
 * through the task argument so testing stays trivial. The orchestrator is
 * responsible for compressing/forwarding context.
 */
function buildSpecialistMessages(agentKey: string, task: string): Array<{ role: 'system' | 'user'; content: string }> {
  const definedSystemPrompt = SPECIALIST_AGENT_PROMPTS[agentKey]
  const def = CHAT_ORCHESTRATOR_AGENT_DEFS.find(a => a.key === agentKey)
  const header = `Agente: ${def?.label ?? agentKey} (${agentKey}).`
  const outputInstruction = agentKey === 'chat_critic'
    ? ''
    : CHAT_AGENT_PACKAGE_PROMPT
  const systemPrompt = [header, definedSystemPrompt || def?.description || '', outputInstruction].filter(Boolean).join('\n\n')
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task },
  ]
}

export interface DispatchSpecialistArgs {
  agentKey: string
  task: string
  ctx: SkillContext
  /** Override the default temperature (default 0.4 — balanced). */
  temperature?: number
  /** Override the per-call token cap (defaults to ctx-derived). */
  maxTokens?: number
  /** Streaming callback: receives each token delta + the accumulated total so far. */
  onToken?: (delta: string, total: string) => void
}

export interface DispatchSpecialistResult {
  output: string
  usage: UsageExecutionRecord | null
}

/**
 * Run a single specialist agent through OpenRouter / the user-configured
 * provider. Records token usage + cost on the budget tracker so the chat
 * surfaces in cost-analytics with the correct breakdown.
 */
export async function dispatchSpecialistAgent(args: DispatchSpecialistArgs): Promise<DispatchSpecialistResult> {
  const { agentKey, task, ctx, temperature = 0.4, maxTokens, onToken } = args
  const resolvedModel = resolveSpecialistModel(agentKey, ctx.models)
  if (!resolvedModel) {
    return { output: `Modelo do agente "${agentKey}" não está configurado em /settings.`, usage: null }
  }
  const model = resolvedModel.model

  if (ctx.mock) {
    const fake = mockSpecialistOutput(agentKey, task)
    const usage = mockUsageRecord(agentKey, model, fake)
    ctx.budget.recordUsage(usage)
    return { output: fake, usage }
  }

  const messages = buildSpecialistMessages(agentKey, task)
  const resolvedMaxTokens = Math.max(512, Math.floor(maxTokens ?? Math.min(4_000, Math.max(1_000, Math.round((1 - ctx.budget.usedRatio()) * 4_000)))))

  const startedAt = Date.now()
  let result: LLMResult
  try {
    const fallbacks = ctx.fallbackModels?.[agentKey] ?? (resolvedModel.inheritedFrom ? ctx.fallbackModels?.[resolvedModel.inheritedFrom] : undefined) ?? []
    // Always go through the streaming path (a no-op onToken when the caller
    // gave none) so every specialist call is covered by the stream-inactivity
    // stall guard in llm-client — a stalled provider can never hang the turn.
    const callOptions = { signal: ctx.signal, onToken: onToken ?? (() => {}) }
    result = fallbacks.length > 0
      ? await callLLMWithMessagesFallback(ctx.apiKey, messages, model, fallbacks, resolvedMaxTokens, temperature, callOptions)
      : await callLLMWithMessages(ctx.apiKey, messages, model, resolvedMaxTokens, temperature, callOptions)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    return {
      output: buildOperationalFailureMarkdown(
        `Nao foi possível executar o agente ${agentKey}.`,
        err,
      ),
      usage: null,
    }
  }

  const usage = buildUsageRecord({
    agentKey,
    model: result.model,
    requestedModel: model,
    tokensIn: result.tokens_in,
    tokensOut: result.tokens_out,
    costUsd: result.cost_usd,
    durationMs: result.duration_ms,
    providerId: result.provider_id ?? null,
    providerLabel: result.provider_label ?? null,
    sourceId: ctx.turnId,
    startedAt,
  })
  ctx.budget.recordUsage(usage)

  return { output: result.content, usage }
}

interface ResolvedSpecialistModel {
  model: string
  inheritedFrom?: string
}

/**
 * Fallback model chain: when an agent has no model configured, it inherits one
 * from another agent in the same `agentCategory`. This list is HAND-CURATED for
 * semantic fit — it is intentionally NOT derived from `agentCategory`, so an
 * agent may appear in a chain for a category different from its own when that
 * is the better stand-in. `chat_orchestrator`/`chat_writer` are the final
 * fallbacks because the user almost always configures those.
 */
const FALLBACK_AGENT_KEYS_BY_CATEGORY: Record<string, string[]> = {
  extraction: ['chat_clarifier', 'chat_export_packager', 'chat_multimodal_analysis', 'chat_legal_researcher', 'chat_orchestrator'],
  synthesis: ['chat_summarizer', 'chat_artifact_architect', 'chat_data_builder', 'chat_multimodal_analysis', 'chat_orchestrator'],
  reasoning: ['chat_legal_researcher', 'chat_planner', 'chat_orchestrator', 'chat_writer'],
  writing: ['chat_writer', 'chat_document_composer', 'chat_orchestrator'],
}

function resolveSpecialistModel(agentKey: string, models: Record<string, string>): ResolvedSpecialistModel | null {
  const direct = normalizeModelId(models[agentKey])
  if (direct) return { model: direct }

  const def = CHAT_ORCHESTRATOR_AGENT_DEFS.find(agent => agent.key === agentKey)
  const fallbackKeys = [
    ...(def ? FALLBACK_AGENT_KEYS_BY_CATEGORY[def.agentCategory] ?? [] : []),
    'chat_orchestrator',
    'chat_writer',
  ]
  for (const fallbackKey of Array.from(new Set(fallbackKeys))) {
    if (fallbackKey === agentKey) continue
    const inherited = normalizeModelId(models[fallbackKey])
    if (inherited) return { model: inherited, inheritedFrom: fallbackKey }
  }
  return null
}

function normalizeModelId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

interface BuildUsageRecordArgs {
  agentKey: string
  model: string
  requestedModel: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
  providerId: string | null
  providerLabel: string | null
  sourceId: string
  startedAt: number
}

function buildUsageRecord(args: BuildUsageRecordArgs): UsageExecutionRecord {
  const def = CHAT_ORCHESTRATOR_AGENT_DEFS.find(a => a.key === args.agentKey)
  const phaseLabel = def?.label ?? args.agentKey
  return {
    source_type: 'chat_orchestrator',
    source_id: args.sourceId,
    created_at: new Date(args.startedAt).toISOString(),
    function_key: 'chat_orchestrator',
    function_label: 'Orquestrador (Chat)',
    phase: args.agentKey,
    phase_label: `Chat: ${phaseLabel}`,
    agent_name: phaseLabel,
    model: args.model,
    model_label: args.model,
    provider_id: args.providerId,
    provider_label: args.providerLabel,
    requested_model: args.requestedModel,
    resolved_model: args.model,
    tokens_in: args.tokensIn,
    tokens_out: args.tokensOut,
    total_tokens: args.tokensIn + args.tokensOut,
    cost_usd: args.costUsd,
    duration_ms: args.durationMs,
    execution_state: 'completed',
  }
}

function mockSpecialistOutput(agentKey: string, task: string): string {
  switch (agentKey) {
    case 'chat_planner':
      return [
        '## Plano',
        '1. Compreender o pedido.',
        '2. Coletar contexto relevante do acervo / teses.',
        '3. Esboçar a resposta.',
        '4. Revisar com o crítico.',
        '5. Entregar a resposta final.',
      ].join('\n')
    case 'chat_summarizer':
      return `Resumo (mock): ${task.slice(0, 240)}…`
    case 'chat_critic':
      return JSON.stringify({ score: 82, reasons: ['Estrutura clara', 'Faltam citações'], should_stop: true })
    case 'chat_writer':
      return [
        '# Resposta',
        '',
        'Resposta gerada em modo demo. O orquestrador real produzirá uma redação completa em pt-BR a partir do plano e do contexto coletado.',
        '',
        `**Tarefa recebida:** ${task.slice(0, 200)}`,
      ].join('\n')
    default:
      return `(${agentKey} mock) ${task.slice(0, 240)}`
  }
}

function mockUsageRecord(agentKey: string, model: string, output: string): UsageExecutionRecord {
  const tokens = Math.max(64, Math.round(output.length / 4))
  const def = CHAT_ORCHESTRATOR_AGENT_DEFS.find(a => a.key === agentKey)
  return {
    source_type: 'chat_orchestrator',
    source_id: 'demo',
    created_at: new Date().toISOString(),
    function_key: 'chat_orchestrator',
    function_label: 'Orquestrador (Chat)',
    phase: agentKey,
    phase_label: `Chat: ${def?.label ?? agentKey}`,
    agent_name: def?.label ?? agentKey,
    model,
    model_label: model,
    provider_id: 'demo',
    provider_label: 'Demo',
    requested_model: model,
    resolved_model: model,
    tokens_in: Math.round(tokens / 2),
    tokens_out: tokens - Math.round(tokens / 2),
    total_tokens: tokens,
    cost_usd: 0,
    duration_ms: 50,
    execution_state: 'completed',
  }
}

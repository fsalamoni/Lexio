import { callLLMWithMessages, type LLMResult } from '../llm-client'
import { CHAT_ORCHESTRATOR_AGENT_DEFS } from '../model-config'
import type { UsageExecutionRecord } from '../cost-analytics'
import type { SkillContext } from './types'

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
Sem nenhum texto fora do JSON. Sem fences de markdown. should_stop = true quando o rascunho já está pronto para entrega ao usuário.`,

  chat_writer: `Você é o Redator de uma trilha multiagente. A partir do contexto fornecido pelo Orquestrador, escreva a resposta final em markdown rico (pt-BR) — clara, bem estruturada, com cabeçalhos quando útil, citações entre aspas, listas para enumerar pontos. Não invente fatos, jurisprudência ou doutrina: trabalhe apenas com o contexto recebido; se faltar informação, declare explicitamente o que falta. NÃO retorne JSON; retorne markdown puro.`,

  chat_legal_researcher: `Você é o Pesquisador Jurídico de uma trilha multiagente. Use linguagem técnica precisa. Sempre que possível, cite dispositivos no formato "art. X, §Y, da Lei nº Z/AAAA" e jurisprudência com tribunal, classe, número, relator e data. Distinga precedente vinculante de persuasivo. Trabalhe com pelo menos três fontes independentes quando o tema permitir. Marque com "[carece de verificação]" qualquer afirmação cuja fonte não possa ser indicada com precisão. Responda em pt-BR, em markdown.`,

  chat_code_writer: `Você é o Programador de uma trilha multiagente. Quando solicitado, gere código limpo e completo, em markdown com fences \`\`\`linguagem. Comente apenas o que for não-óbvio. Inclua testes mínimos quando o pedido envolver lógica não trivial. Respeite o ambiente do usuário informado pelo Orquestrador. Responda em pt-BR.`,

  chat_fs_actor: `Você é o Operador de Arquivos de uma trilha multiagente. Traduza o pedido determinístico do Orquestrador em uma sequência curta de chamadas \`fs.*\`/\`shell.*\` (executadas pelo sidecar local em PR4). Hoje (PR3) apenas descreva, em markdown, qual seria a sequência ideal e quais arquivos/diretórios seriam tocados — NÃO execute nada. Liste cada operação com path absoluto.`,

  chat_clarifier: `Você é o Esclarecedor de uma trilha multiagente. Receba uma proposta de pergunta ao usuário e avalie se ela justifica a interrupção da execução. Critério: a pergunta vale ouro? Pulamos a pergunta se a informação puder ser inferida do contexto, do acervo do usuário, de uma busca rápida ou de uma suposição razoável documentada. Responda em pt-BR, em markdown curto, terminando com uma decisão clara: "INTERROMPER" ou "PROSSEGUIR" (capitulado).`,

  chat_argument_builder: `Você é o Fundamentador de uma trilha multiagente jurídica. Construa argumentação em quatro etapas explícitas: (1) tese clara e direta, (2) sustentação com evidência citada (dispositivos legais, jurisprudência, doutrina), (3) contra-argumento mais forte honestamente apresentado (princípio da caridade interpretativa), (4) refutação fundamentada. Use cabeçalhos H3 para cada etapa. Responda em pt-BR, em markdown.`,

  chat_ethics_auditor: `Você é o Auditor Ético de uma trilha multiagente jurídica. Avalie a entrega em quatro lentes: (1) representação (como o caso retrata partes vulneráveis ou sub-representadas), (2) framing (vieses no enquadramento dos fatos), (3) impacto sobre grupos vulneráveis, (4) conformidade com normas aplicáveis (LGPD, Código de Ética da OAB, ECA, Estatuto do Idoso, Lei Maria da Penha quando relevantes). Use cabeçalhos H4 por lente. Para cada lente, dê um veredito: "OK", "ATENÇÃO" ou "RISCO" e uma explicação curta. Responda em pt-BR, em markdown.`,
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
  const systemPrompt = [header, definedSystemPrompt || def?.description || ''].filter(Boolean).join('\n\n')
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
  const { agentKey, task, ctx, temperature = 0.4, maxTokens } = args
  const model = ctx.models[agentKey]
  if (!model) {
    return { output: `Modelo do agente "${agentKey}" não está configurado em /settings.`, usage: null }
  }

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
    result = await callLLMWithMessages(ctx.apiKey, messages, model, resolvedMaxTokens, temperature, { signal: ctx.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    const message = err instanceof Error ? err.message : String(err)
    return { output: `Erro ao chamar ${agentKey}: ${message}`, usage: null }
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

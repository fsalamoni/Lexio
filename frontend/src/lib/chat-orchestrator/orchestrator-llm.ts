import { callLLMWithMessages, callLLMWithMessagesFallback } from '../llm-client'
import { CHAT_ORCHESTRATOR_AGENT_DEFS } from '../model-config'
import type { UsageExecutionRecord } from '../cost-analytics'
import type { OrchestratorLLMCall, OrchestratorMessage } from './types'

/**
 * Default LLM bridge used by the orchestrator loop. Tests inject a
 * deterministic implementation through `RunChatTurnInput.llmCall` so the
 * loop's branching logic can be exercised without network access.
 */
export const callOrchestratorLLM: OrchestratorLLMCall = async (params) => {
  const { systemPrompt, history, models, fallbackModels, modelKey, apiKey, signal, perCallTokenCap, agentLabel, onToken } = params
  const model = models[modelKey]
  if (!model) {
    return {
      raw: JSON.stringify({
        tool: 'submit_final_answer',
        args: { markdown: `O modelo do agente "${modelKey}" ainda não está configurado em /settings.` },
        rationale: 'Sem modelo configurado para o orquestrador.',
      }),
      usage: null,
    }
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content })),
  ]

  const startedAt = Date.now()
  
  // ─ Streaming path: use onToken for real-time thought emission ─
  const llmOptions = onToken ? { signal, onToken } : { signal }
  
  let result
  try {
    const fallbacks = fallbackModels?.[modelKey] ?? []
    result = fallbacks.length > 0
      ? await callLLMWithMessagesFallback(apiKey, messages, model, fallbacks, perCallTokenCap, 0.2, llmOptions)
      : await callLLMWithMessages(apiKey, messages, model, perCallTokenCap, 0.2, llmOptions)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    const message = err instanceof Error ? err.message : String(err)
    // Surface a synthetic forced-finalisation so the loop terminates
    // cleanly instead of bubbling the exception to the UI.
    return {
      raw: JSON.stringify({
        tool: 'submit_final_answer',
        args: { markdown: `Erro ao consultar o orquestrador: ${message}.` },
        rationale: 'Falha na chamada LLM.',
      }),
      usage: null,
    }
  }

  const def = CHAT_ORCHESTRATOR_AGENT_DEFS.find(a => a.key === modelKey)
  const phaseLabel = agentLabel ?? def?.label ?? modelKey
  const usage: UsageExecutionRecord = {
    source_type: 'chat_orchestrator',
    source_id: 'turn',
    created_at: new Date(startedAt).toISOString(),
    function_key: 'chat_orchestrator',
    function_label: 'Orquestrador (Chat)',
    phase: modelKey,
    phase_label: `Chat: ${phaseLabel}`,
    agent_name: phaseLabel,
    model: result.model,
    model_label: result.model,
    provider_id: result.provider_id ?? null,
    provider_label: result.provider_label ?? null,
    requested_model: model,
    resolved_model: result.model,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    total_tokens: result.tokens_in + result.tokens_out,
    cost_usd: result.cost_usd,
    duration_ms: result.duration_ms,
    execution_state: 'completed',
  }

  return { raw: result.content, usage }
}

export function appendToolMessage(history: OrchestratorMessage[], content: string, tag?: string): OrchestratorMessage[] {
  return [
    ...history,
    {
      role: 'user',
      content,
      tool_summary: true,
      tag,
    },
  ]
}

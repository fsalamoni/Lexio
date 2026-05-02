import type { OrchestratorLLMCall, OrchestratorMessage } from './types'
import { IS_FIREBASE } from '../firebase'

/**
 * Returns true when the chat must run against the in-memory mock instead of
 * hitting OpenRouter. Triggers:
 *   - explicit `VITE_DEMO_MODE=true`
 *   - Firebase not configured (the SPA is offline)
 */
export function isMockRuntimeActive(): boolean {
  if (typeof import.meta !== 'undefined' && (import.meta as ImportMeta).env?.VITE_DEMO_MODE === 'true') {
    return true
  }
  return !IS_FIREBASE
}

/**
 * Deterministic in-memory replacement for `callOrchestratorLLM`. Walks
 * through a canned plan that exercises every primary skill so the demo
 * mode shows a meaningful agent trail without any network access.
 */
export const mockOrchestratorLLM: OrchestratorLLMCall = async (params) => {
  const { history } = params
  const step = countToolMessages(history)
  const userInput = lastUserMessage(history)

  switch (step) {
    case 0: {
      // First turn — start by planning.
      return jsonDecision({
        tool: 'call_agent',
        args: {
          agent_key: 'chat_planner',
          task: `Decomponha o pedido do usuário em passos curtos: "${userInput}"`,
        },
        rationale: 'Planejar antes de redigir.',
      })
    }
    case 1: {
      // Then redact a draft directly from the planner output.
      return jsonDecision({
        tool: 'call_agent',
        args: {
          agent_key: 'chat_writer',
          task: `Redija a resposta final ao usuário: "${userInput}". Use o plano acima como guia.`,
        },
        rationale: 'Redigir o rascunho a partir do plano.',
      })
    }
    case 2: {
      // Submit a polished closing answer.
      return jsonDecision({
        tool: 'submit_final_answer',
        args: {
          markdown: buildDemoFinal(userInput),
        },
        rationale: 'Encerrar o turno com a resposta consolidada.',
      })
    }
    default:
      return jsonDecision({
        tool: 'submit_final_answer',
        args: { markdown: buildDemoFinal(userInput) },
        rationale: 'Fechamento de segurança.',
      })
  }
}

function countToolMessages(history: OrchestratorMessage[]): number {
  return history.filter(m => m.tool_summary).length
}

function lastUserMessage(history: OrchestratorMessage[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i]
    if (msg.role === 'user' && !msg.tool_summary) return msg.content
  }
  return '(sem input)'
}

function jsonDecision(payload: { tool: string; args: Record<string, unknown>; rationale?: string }) {
  return {
    raw: JSON.stringify(payload),
    usage: null,
  }
}

function buildDemoFinal(userInput: string): string {
  return [
    '# Resposta (modo demo)',
    '',
    'Esta é uma resposta gerada pelo runtime mock do Chat. Nenhuma chamada real foi feita à OpenRouter — toda a trilha acima foi simulada localmente.',
    '',
    '**Pedido recebido:**',
    `> ${userInput.slice(0, 600)}`,
    '',
    '**Próximos passos sugeridos**',
    '- Configure suas chaves de provedor em `/settings`',
    '- Defina os modelos do orquestrador em `Configurações → Orquestrador (Chat)`',
    '- Volte a esta conversa e envie uma nova mensagem com o ambiente real ligado.',
  ].join('\n')
}

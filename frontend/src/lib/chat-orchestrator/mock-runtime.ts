import type { OrchestratorLLMCall, OrchestratorMessage } from './types'
import { IS_FIREBASE } from '../firebase'
import { inferExpectedDeliverablesFromText } from '../chat-deliverable-contract'

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
  const artifactDecision = buildMockArtifactDecision(userInput)

  if (artifactDecision) {
    if (step === 0) return jsonDecision(artifactDecision)
    return jsonDecision({
      tool: 'submit_final_answer',
      args: {
        markdown: buildDemoFinal(userInput, 'O runtime mock acionou a skill de artefato correspondente ao pedido e materializou a entrega localmente.'),
      },
      rationale: 'Encerrar o turno depois de simular o artefato solicitado.',
    })
  }

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

function buildMockArtifactDecision(userInput: string): { tool: string; args: Record<string, unknown>; rationale: string } | null {
  const primary = inferExpectedDeliverablesFromText(userInput)[0]
  if (!primary) return null

  if (primary.kind === 'image') {
    return {
      tool: 'generate_image',
      args: {
        prompt: userInput,
        title: buildMockTitle('Imagem literal', userInput),
        aspect_ratio: inferAspectRatio(userInput),
        approved: true,
      },
      rationale: 'Pedido exige imagem literal; o mock deve acionar a skill real de imagem.',
    }
  }

  if (primary.kind === 'presentation') {
    return {
      tool: 'generate_studio_artifact',
      args: {
        artifact_type: 'apresentacao_v2',
        topic: userInput,
        notebook_title: buildMockTitle('Apresentacao', userInput),
        images: true,
        approved: true,
      },
      rationale: 'Pedido exige apresentação; o mock deve acionar o Estúdio.',
    }
  }

  if (primary.kind === 'spreadsheet') {
    return {
      tool: 'generate_studio_artifact',
      args: {
        artifact_type: 'tabela_dados',
        topic: userInput,
        notebook_title: buildMockTitle('Tabela de dados', userInput),
        approved: true,
      },
      rationale: 'Pedido exige artefato tabular; o mock deve acionar o Estúdio.',
    }
  }

  if (primary.kind === 'legal_document') {
    return {
      tool: 'generate_document',
      args: {
        document_type: inferMockDocumentType(userInput),
        title: buildMockTitle('Documento', userInput),
        description: 'Documento gerado em modo demo para validar a trilha de artefato.',
        content: userInput,
        approved: true,
      },
      rationale: 'Pedido exige documento; o mock deve acionar o pipeline documental.',
    }
  }

  return null
}

function inferMockDocumentType(userInput: string): string {
  const normalized = userInput.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/\bpeticao\b/.test(normalized)) return 'peticao_inicial'
  if (/\bcontestacao\b/.test(normalized)) return 'contestacao'
  if (/\brecurso\b/.test(normalized)) return 'recurso'
  if (/\bsentenca\b/.test(normalized)) return 'sentenca'
  if (/\bacao\s+civil\s+publica\b/.test(normalized)) return 'acao_civil_publica'
  if (/\bmandado\s+de\s+seguranca\b/.test(normalized)) return 'mandado_seguranca'
  if (/\bhabeas\s+corpus\b/.test(normalized)) return 'habeas_corpus'
  if (/\bagravo\b/.test(normalized)) return 'agravo'
  if (/\bembargos\b/.test(normalized)) return 'embargos_declaracao'
  return 'parecer'
}

function inferAspectRatio(userInput: string): string | undefined {
  const match = userInput.match(/\b(1:1|4:3|3:4|16:9|9:16)\b/)
  return match?.[1]
}

function buildMockTitle(prefix: string, userInput: string): string {
  const clipped = userInput.replace(/\s+/g, ' ').trim().slice(0, 72)
  return clipped ? `${prefix} - ${clipped}` : prefix
}

function buildDemoFinal(userInput: string, note?: string): string {
  return [
    '# Resposta (modo demo)',
    '',
    'Esta é uma resposta gerada pelo runtime mock do Chat. Nenhuma chamada real foi feita à OpenRouter — toda a trilha acima foi simulada localmente.',
    ...(note ? ['', note] : []),
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

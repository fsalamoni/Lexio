import { describe, expect, it, vi } from 'vitest'
import type { ChatTrailEvent } from '../firestore-types'
import type { UsageExecutionRecord } from '../cost-analytics'
import { clearRuntimeFeatureFlags, setRuntimeFeatureFlags } from '../feature-flags'
import { runChatTurn } from './orchestrator'
import type { OrchestratorLLMCall } from './types'

// Stub `dispatchSpecialistAgent` so the orchestrator never tries to reach
// OpenRouter. The stub keeps just enough state to exercise the loop's
// branching: a deterministic per-agent reply and a fake usage record.
vi.mock('./dispatch', () => {
  let counter = 0
  return {
    dispatchSpecialistAgent: vi.fn(async (args: { agentKey: string; task: string }) => {
      counter += 1
      const usage = {
        source_type: 'chat_orchestrator',
        source_id: 'turn-stub',
        created_at: new Date().toISOString(),
        function_key: 'chat_orchestrator',
        function_label: 'Orquestrador (Chat)',
        phase: args.agentKey,
        phase_label: `Chat: ${args.agentKey}`,
        agent_name: args.agentKey,
        model: 'demo/x',
        model_label: 'demo/x',
        tokens_in: 100,
        tokens_out: 100,
        total_tokens: 200,
        cost_usd: 0.01,
        duration_ms: 5,
        execution_state: 'completed',
      }
      const output = args.agentKey === 'chat_critic'
        ? JSON.stringify({ score: 90, reasons: ['ok'], should_stop: true })
        : args.task.includes('artifact-json')
          ? [
              'Rascunho criado.',
              '',
              '```json',
              JSON.stringify({
                lexio_agent_package: {
                  thought: {
                    summary: 'Transformei a subtarefa em um artefato versionado.',
                    decisions: ['Usar markdown como fonte inicial'],
                  },
                  result_markdown: '## Minuta\nConteúdo do artefato.',
                  artifacts: [
                    {
                      logical_document_id: 'minuta-principal',
                      title: 'Minuta Principal',
                      kind: 'legal_document',
                      format: 'markdown',
                      version: 1,
                      summary: 'Minuta inicial para revisão.',
                      exports: [{ label: 'DOCX', format: 'docx', status: 'planned' }],
                    },
                  ],
                },
              }),
              '```',
            ].join('\n')
        : `(${args.agentKey} #${counter}) ${args.task.slice(0, 80)}`
      return { output, usage }
    }),
    __reset: () => {
      counter = 0
    },
  }
})

vi.mock('../chat-artifact-storage', () => ({
  uploadChatArtifactFile: vi.fn(async (args: { exportId: string }) => ({
    url: `blob:mock/${args.exportId}`,
    path: `mock/${args.exportId}`,
  })),
}))

const baseModels: Record<string, string> = {
  chat_orchestrator: 'demo/orch',
  chat_planner: 'demo/plan',
  chat_summarizer: 'demo/summ',
  chat_critic: 'demo/crit',
  chat_writer: 'demo/write',
  chat_clarifier: 'demo/clar',
  chat_legal_researcher: 'demo/legal',
  chat_code_writer: 'demo/code',
  chat_fs_actor: 'demo/fs',
}

function makeInput(overrides: Partial<Parameters<typeof runChatTurn>[0]> = {}): Parameters<typeof runChatTurn>[0] {
  return {
    uid: 'u',
    conversationId: 'c',
    turnId: 't',
    effort: 'medio',
    history: [],
    user_input: 'Olá, faça um resumo.',
    models: baseModels,
    apiKey: 'demo',
    signal: new AbortController().signal,
    onTrail: () => {},
    mock: true,
    ...overrides,
  }
}

describe('runChatTurn', () => {
  it('terminates immediately when the orchestrator emits submit_final_answer', async () => {
    const events: ChatTrailEvent[] = []
    const llmCall = vi.fn(async () => ({
      raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# pronto' } }),
      usage: null,
    })) satisfies OrchestratorLLMCall

    const result = await runChatTurn(makeInput({ llmCall, onTrail: e => events.push(e) }))

    expect(result.status).toBe('done')
    expect(result.assistant_markdown).toBe('# pronto')
    expect(llmCall).toHaveBeenCalledTimes(1)
    expect(events.find(e => e.type === 'final_answer')).toBeDefined()
  })

  it('strips a leaked lexio_agent_package block from the final answer', async () => {
    const dirtyMarkdown = [
      '# Pronto',
      '',
      '```json',
      JSON.stringify({ lexio_agent_package: { result_markdown: 'x' } }),
      '```',
    ].join('\n')
    const llmCall = vi.fn(async () => ({
      raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: dirtyMarkdown } }),
      usage: null,
    })) satisfies OrchestratorLLMCall

    const result = await runChatTurn(makeInput({ llmCall }))

    expect(result.status).toBe('done')
    expect(result.assistant_markdown).toContain('# Pronto')
    expect(result.assistant_markdown).not.toContain('lexio_agent_package')
  })

  it('runs the orchestrator uncapped under lean orchestration — no token cap, no auto-summary', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_LEAN_ORCHESTRATION: true })
    try {
      // 6M tokens on the first call would trip the 150k `medio` cap — lean
      // orchestration must ignore it so the orchestrator finalises on its own.
      const heavyUsage: UsageExecutionRecord = {
        source_type: 'chat_orchestrator',
        source_id: 't',
        created_at: '2026-05-21T12:00:00.000Z',
        function_key: 'chat_orchestrator',
        function_label: 'Orquestrador (Chat)',
        phase: 'chat_orchestrator',
        phase_label: 'Chat: orquestrador',
        agent_name: 'chat_orchestrator',
        model: 'demo/x',
        model_label: 'demo/x',
        tokens_in: 3_000_000,
        tokens_out: 3_000_000,
        total_tokens: 6_000_000,
        cost_usd: 1,
        duration_ms: 5,
      }
      const events: ChatTrailEvent[] = []
      let call = 0
      const llmCall = vi.fn(async () => {
        call += 1
        return call === 1
          ? { raw: JSON.stringify({ tool: 'call_agent', args: { agent_key: 'chat_planner', task: 'planejar' } }), usage: heavyUsage }
          : { raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# ok' } }), usage: null }
      }) satisfies OrchestratorLLMCall

      const result = await runChatTurn(makeInput({ llmCall, onTrail: e => events.push(e) }))

      expect(result.status).toBe('done')
      expect(result.assistant_markdown).toContain('# ok')
      expect(events.some(e => e.type === 'budget_hit')).toBe(false)
      expect(events.some(e => e.type === 'agent_call' && e.agent_key === 'chat_summarizer')).toBe(false)
      expect(llmCall).toHaveBeenCalledTimes(2)
    } finally {
      clearRuntimeFeatureFlags()
    }
  })

  it('skips the critic hop after a deterministic PC action under lean orchestration', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_LEAN_ORCHESTRATION: true })
    try {
      const events: ChatTrailEvent[] = []
      let call = 0
      const llmCall = vi.fn(async () => {
        call += 1
        return call === 1
          ? { raw: JSON.stringify({ tool: 'write_file', args: { path: 'notas/a.txt', content: 'oi' } }), usage: null }
          : { raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# salvo' } }), usage: null }
      }) satisfies OrchestratorLLMCall

      const result = await runChatTurn(makeInput({ llmCall, onTrail: e => events.push(e) }))

      expect(result.status).toBe('done')
      expect(result.assistant_markdown).toContain('# salvo')
      // The last real action was a deterministic PC op → critic hop is skipped.
      expect(events.some(e => e.type === 'agent_call' && e.agent_key === 'chat_critic')).toBe(false)
      expect(llmCall).toHaveBeenCalledTimes(2)
    } finally {
      clearRuntimeFeatureFlags()
    }
  })

  it('still runs the critic under lean when the last action was NOT a PC op', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_LEAN_ORCHESTRATION: true })
    try {
      const events: ChatTrailEvent[] = []
      let call = 0
      const llmCall = vi.fn(async () => {
        call += 1
        return call === 1
          ? { raw: JSON.stringify({ tool: 'call_agent', args: { agent_key: 'chat_planner', task: 'planejar' } }), usage: null }
          : { raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# pronto' } }), usage: null }
      }) satisfies OrchestratorLLMCall

      const result = await runChatTurn(makeInput({ llmCall, onTrail: e => events.push(e) }))

      expect(result.status).toBe('done')
      expect(events.some(e => e.type === 'agent_call' && e.agent_key === 'chat_critic')).toBe(true)
    } finally {
      clearRuntimeFeatureFlags()
    }
  })

  it('respects maxIterations when the orchestrator never finalises', async () => {
    const events: ChatTrailEvent[] = []
    const llmCall = vi.fn(async () => ({
      raw: JSON.stringify({ tool: 'call_agent', args: { agent_key: 'chat_planner', task: 'plan' } }),
      usage: null,
    }))

    const result = await runChatTurn(makeInput({ effort: 'rapido', llmCall, onTrail: e => events.push(e) }))

    // rapido caps maxIterations at 3 — orchestrator runs 3 times, then the
    // forced finalisation kicks in and produces a closing answer.
    expect(llmCall).toHaveBeenCalledTimes(3)
    expect(result.status).toBe('done')
    expect(result.assistant_markdown).toBeTruthy()
    const iterEvents = events.filter(e => e.type === 'iteration_start')
    expect(iterEvents).toHaveLength(3)
  })

  it('stops repeating the exact same agent decision in a loop', async () => {
    const events: ChatTrailEvent[] = []
    const llmCall = vi.fn(async () => ({
      raw: JSON.stringify({ tool: 'call_agent', args: { agent_key: 'chat_planner', task: 'plan' } }),
      usage: null,
    }))

    const result = await runChatTurn(makeInput({ effort: 'rapido', llmCall, onTrail: e => events.push(e) }))

    expect(result.status).toBe('done')
    expect(llmCall).toHaveBeenCalledTimes(3)
    expect(events.filter(e => e.type === 'agent_call' && e.agent_key === 'chat_planner')).toHaveLength(1)
    expect(events.some(e => e.type === 'error' && e.message.includes('Loop de orquestração interrompido'))).toBe(true)
  })

  it('pauses the turn with awaiting_user when the orchestrator asks a question', async () => {
    const events: ChatTrailEvent[] = []
    const llmCall = vi.fn(async () => ({
      raw: JSON.stringify({
        tool: 'ask_user_question',
        args: { question: 'Você tem o número do processo?' },
      }),
      usage: null,
    }))

    const result = await runChatTurn(makeInput({ llmCall, onTrail: e => events.push(e) }))

    expect(result.status).toBe('awaiting_user')
    expect(result.pending_question?.text).toContain('número do processo')
    expect(events.some(e => e.type === 'clarification_request')).toBe(true)
  })

  it('allows the orchestrator to call a multimodal evidence specialist', async () => {
    const events: ChatTrailEvent[] = []
    let attempt = 0
    const llmCall = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) {
        return {
          raw: JSON.stringify({
            tool: 'call_agent',
            args: {
              agent_key: 'chat_image_evidence_specialist',
              task: 'Analise o OCR do anexo e separe fatos observaveis de inferencias.',
            },
          }),
          usage: null,
        }
      }
      return {
        raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# Evidencia analisada' } }),
        usage: null,
      }
    })

    const result = await runChatTurn(makeInput({ llmCall, onTrail: e => events.push(e) }))

    expect(result.status).toBe('done')
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'agent_call', agent_key: 'chat_image_evidence_specialist' }),
      expect.objectContaining({ type: 'agent_response', agent_key: 'chat_image_evidence_specialist' }),
    ]))
  })

  it('pauses the turn and emits approval_requested for side-effectful actions', async () => {
    const events: ChatTrailEvent[] = []
    const llmCall = vi.fn(async () => ({
      raw: JSON.stringify({
        tool: 'request_user_approval',
        args: {
          title: 'Gerar Novo Documento',
          summary: 'Criar um documento jurídico persistente a partir da conversa.',
          action: 'generate_document_v3',
          risk_level: 'medium',
          requested_permissions: ['write', 'network'],
          estimated_cost: 'baixo',
          estimated_time: '2 a 5 minutos',
        },
      }),
      usage: null,
    }))

    const result = await runChatTurn(makeInput({ llmCall, onTrail: e => events.push(e) }))

    expect(result.status).toBe('awaiting_user')
    expect(result.pending_question?.text).toContain('Gerar Novo Documento')
    const approvalEvent = events.find(e => e.type === 'approval_requested')
    expect(approvalEvent).toMatchObject({ type: 'approval_requested', title: 'Gerar Novo Documento', risk_level: 'medium' })
  })

  it('carries resume metadata when request_user_approval is used for generate_image', async () => {
    const llmCall = vi.fn(async () => ({
      raw: JSON.stringify({
        tool: 'request_user_approval',
        args: {
          title: 'Gerar imagem da plataforma',
          summary: 'Criar uma imagem literal em PNG.',
          action: 'generate_image',
          risk_level: 'low',
          requested_permissions: ['execute'],
        },
      }),
      usage: null,
    })) satisfies OrchestratorLLMCall

    const result = await runChatTurn(makeInput({
      user_input: 'Crie uma imagem da plataforma jurídica em PNG.',
      llmCall,
    }))

    expect(result.status).toBe('awaiting_user')
    expect(result.pending_question).toMatchObject({
      resume_tool: 'generate_image',
      resume_args: {
        prompt: 'Crie uma imagem da plataforma jurídica em PNG.',
        approved: true,
      },
    })
  })

  it('throws AbortError when the signal is already aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(
      runChatTurn(makeInput({ signal: ac.signal })),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('coaches the orchestrator after a parse failure and finalises on the second try', async () => {
    let attempt = 0
    const llmCall = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) {
        return { raw: 'this is plain prose, not JSON', usage: null }
      }
      return {
        raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# ok' } }),
        usage: null,
      }
    })

    const result = await runChatTurn(makeInput({ llmCall }))

    expect(attempt).toBe(2)
    expect(result.status).toBe('done')
    expect(result.assistant_markdown).toBe('# ok')
  })

  it('tolerates an extra parse retry and bumps temperature under FF_CHAT_ENGINE_PLUS', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_ENGINE_PLUS: true })
    try {
      let attempt = 0
      const llmCall = vi.fn(async () => {
        attempt += 1
        if (attempt <= 2) return { raw: 'not json', usage: null }
        return { raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# ok3' } }), usage: null }
      })

      const result = await runChatTurn(makeInput({ llmCall }))

      // Default tolerance gives up after 2; engine-plus reaches the valid 3rd try.
      expect(attempt).toBe(3)
      expect(result.assistant_markdown).toBe('# ok3')
      // Temperature escalates on each retry: undefined → 0.4 → 0.6.
      const calls = llmCall.mock.calls as unknown as Array<[Parameters<OrchestratorLLMCall>[0]]>
      expect(calls[0][0].temperature).toBeUndefined()
      expect(calls[1][0].temperature).toBeCloseTo(0.4, 5)
      expect(calls[2][0].temperature).toBeCloseTo(0.6, 5)
    } finally {
      clearRuntimeFeatureFlags()
    }
  })

  it('records llm executions in the result so cost-analytics can ingest them', async () => {
    const llmCall = vi.fn(async (params: Parameters<OrchestratorLLMCall>[0]) => ({
      raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# pronto' } }),
      usage: {
        source_type: 'chat_orchestrator' as const,
        source_id: 'turn-stub',
        created_at: new Date().toISOString(),
        function_key: 'chat_orchestrator' as const,
        function_label: 'Orquestrador (Chat)',
        phase: params.modelKey,
        phase_label: `Chat: ${params.modelKey}`,
        agent_name: 'Orquestrador',
        model: 'demo/x',
        model_label: 'demo/x',
        tokens_in: 200,
        tokens_out: 50,
        total_tokens: 250,
        cost_usd: 0.005,
        duration_ms: 12,
        execution_state: 'completed' as const,
      },
    }))
    const result = await runChatTurn(makeInput({ llmCall }))
    expect(result.llm_executions).toHaveLength(1)
    expect(result.llm_executions[0].source_type).toBe('chat_orchestrator')
  })

  it('emits agent work packages and lists latest artifacts in the final answer', async () => {
    const events: ChatTrailEvent[] = []
    let attempt = 0
    const llmCall = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) {
        return {
          raw: JSON.stringify({ tool: 'call_agent', args: { agent_key: 'chat_writer', task: 'artifact-json' } }),
          usage: null,
        }
      }
      return {
        raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# Concluído' } }),
        usage: null,
      }
    })

    const result = await runChatTurn(makeInput({ llmCall, onTrail: e => events.push(e) }))

    expect(result.status).toBe('done')
    expect(events.some(e => e.type === 'agent_work_package')).toBe(true)
    expect(result.assistant_markdown).toContain('Documentos e artefatos do turno')
    expect(result.assistant_markdown).toContain('Minuta Principal')
    expect(result.assistant_markdown).toContain('DOCX (')
  })

  it('materializes a downloadable fallback bundle when a deliverable request has no artifacts', async () => {
    const events: ChatTrailEvent[] = []
    const llmCall = vi.fn(async () => ({
      raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# Projeto\n\nDocumento consolidado.' } }),
      usage: null,
    })) satisfies OrchestratorLLMCall

    const result = await runChatTurn(makeInput({
      user_input: 'Faça um projeto e me entregue os documentos para baixar.',
      llmCall,
      onTrail: e => events.push(e),
    }))

    const packageEvents = events.filter(e => e.type === 'agent_work_package')
    expect(packageEvents).toHaveLength(1)
    const workPackage = packageEvents[0].type === 'agent_work_package' ? packageEvents[0].package : null
    expect(workPackage?.agent_key).toBe('chat_export_packager')
    const artifact = workPackage?.artifacts?.[0]
    expect(artifact?.title).toContain('Pacote de entrega')
    expect(artifact?.exports?.map(exportRef => exportRef.format)).toEqual(expect.arrayContaining(['markdown', 'docx', 'pdf', 'zip']))
    expect(artifact?.exports?.every(exportRef => exportRef.status === 'ready')).toBe(true)
    expect(result.assistant_markdown).toContain('Documentos e artefatos do turno')
    expect(result.assistant_markdown).toContain('Pacote de entrega')
  })

  it('does not satisfy a PNG/JPG image request with a markdown fallback package', async () => {
    const events: ChatTrailEvent[] = []
    const llmCall = vi.fn(async () => ({
      raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: 'Segue um prompt para gerar a imagem em outra ferramenta.' } }),
      usage: null,
    })) satisfies OrchestratorLLMCall

    const result = await runChatTurn(makeInput({
      user_input: 'Eu quero a renderização do projeto em png ou jpg.',
      llmCall,
      onTrail: e => events.push(e),
    }))

    const packageEvents = events.filter(e => e.type === 'agent_work_package')
    const guardPackage = packageEvents.find(e => e.type === 'agent_work_package' && e.package.agent_key === 'chat_deliverable_guard')
    const exportPackage = packageEvents.find(e => e.type === 'agent_work_package' && e.package.agent_key === 'chat_export_packager')
    expect(guardPackage?.type).toBe('agent_work_package')
    if (guardPackage?.type === 'agent_work_package') {
      expect(guardPackage.package.artifacts?.[0]).toEqual(expect.objectContaining({
        kind: 'image',
        format: 'png',
      }))
      expect(guardPackage.package.artifacts?.[0]?.exports?.map(exportRef => exportRef.format)).toEqual(['png', 'jpg'])
      expect(guardPackage.package.artifacts?.[0]?.exports?.every(exportRef => exportRef.status === 'unavailable')).toBe(true)
    }
    expect(exportPackage).toBeUndefined()
    expect(result.assistant_markdown).toContain('Entrega literal pendente')
    expect(result.assistant_markdown).not.toContain('Pacote de entrega')
  })

  it('does not re-loop when the final answer is already an actionable operational failure for a literal image request', async () => {
    const events: ChatTrailEvent[] = []
    const llmCall = vi.fn(async () => ({
      raw: JSON.stringify({
        tool: 'submit_final_answer',
        args: {
          markdown: [
            '## Falha operacional',
            'Nao foi possível gerar a imagem literal solicitada.',
            '',
            '- Motivo: Limite mensal da chave do provedor atingido',
            '- Ação sugerida: Troque a chave em Configurações > Provedores de IA ou ajuste o limite no provedor.',
          ].join('\n'),
        },
      }),
      usage: null,
    })) satisfies OrchestratorLLMCall

    const result = await runChatTurn(makeInput({
      user_input: 'Gere a imagem do projeto para mim em PNG.',
      llmCall,
      onTrail: e => events.push(e),
    }))

    expect(result.status).toBe('done')
    expect(llmCall).toHaveBeenCalledTimes(1)
    expect(result.assistant_markdown).toContain('## Falha operacional')
    expect(result.assistant_markdown).toContain('Entrega literal pendente')
    expect(events.some(e => e.type === 'error' && e.message.includes('Loop de orquestração interrompido'))).toBe(false)
  })

  it('does not create a fallback bundle when an existing artifact already has downloads', async () => {
    const events: ChatTrailEvent[] = []
    let attempt = 0
    const llmCall = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) {
        return {
          raw: JSON.stringify({ tool: 'call_agent', args: { agent_key: 'chat_writer', task: 'artifact-json' } }),
          usage: null,
        }
      }
      return {
        raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# Concluído' } }),
        usage: null,
      }
    })

    await runChatTurn(makeInput({
      user_input: 'Crie os documentos e me entregue para download.',
      llmCall,
      onTrail: e => events.push(e),
    }))

    const packageEvents = events.filter(e => e.type === 'agent_work_package')
    expect(packageEvents).toHaveLength(1)
    const workPackage = packageEvents[0].type === 'agent_work_package' ? packageEvents[0].package : null
    expect(workPackage?.agent_key).toBe('chat_writer')
  })

  it('does not force a deliverable bundle for document analysis requests without an output signal', async () => {
    const events: ChatTrailEvent[] = []
    const llmCall = vi.fn(async () => ({
      raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# Análise\n\nO documento foi analisado.' } }),
      usage: null,
    })) satisfies OrchestratorLLMCall

    const result = await runChatTurn(makeInput({
      user_input: 'Analise este documento e resuma os riscos principais.',
      llmCall,
      onTrail: e => events.push(e),
    }))

    expect(events.some(e => e.type === 'agent_work_package')).toBe(false)
    expect(result.assistant_markdown).toBe('# Análise\n\nO documento foi analisado.')
  })

  it('runs independent specialists through a capped parallel batch', async () => {
    const events: ChatTrailEvent[] = []
    let attempt = 0
    const llmCall = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) {
        return {
          raw: JSON.stringify({
            tool: 'call_agents_parallel',
            args: {
              shared_context: 'Analisar estratégia para audiência.',
              calls: [
                { agent_key: 'chat_planner', task: 'Planeje a abordagem.' },
                { agent_key: 'chat_planner', task: 'Duplicata que deve ser ignorada.' },
                { agent_key: 'chat_writer', task: 'Rascunhe uma resposta.' },
                { agent_key: 'chat_legal_researcher', task: 'Excedente pelo fan-out rápido.' },
              ],
            },
          }),
          usage: null,
        }
      }
      return {
        raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# final' } }),
        usage: null,
      }
    })

    const result = await runChatTurn(makeInput({ effort: 'rapido', llmCall, onTrail: e => events.push(e) }))

    expect(result.status).toBe('done')
    expect(result.assistant_markdown).toBe('# final')
    expect(events.filter(e => e.type === 'agent_call').map(e => e.agent_key)).toEqual(['chat_planner', 'chat_writer'])
    expect(events.some(e => e.type === 'parallel_agents')).toBe(true)
    expect(events.filter(e => e.type === 'agent_response')).toHaveLength(2)
    expect(events.filter(e => e.type === 'agent_work_package')).toHaveLength(2)
  })
})

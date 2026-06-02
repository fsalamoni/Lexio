import { describe, expect, it } from 'vitest'

import { buildCostBreakdown, createUsageExecutionRecord, extractChatTurnExecutions, getPhaseLabel } from './cost-analytics'
import { CHAT_ORCHESTRATOR_AGENT_DEFS } from './pipelines/agent-definitions/chat-orchestrator'

describe('cost analytics coverage', () => {
  it('formats dynamic studio phases with human-friendly labels', () => {
    expect(getPhaseLabel('studio_visual_apresentacao')).toBe('Estúdio: Designer Visual · Apresentação')
    expect(getPhaseLabel('studio_roteirista_audio_script')).toBe('Estúdio: Roteirista · Resumo em Áudio')
    expect(getPhaseLabel('redacao')).toBe('Redação')
    expect(getPhaseLabel('v3_pipeline_orchestrator')).toBe('V3: Orquestrador do Pipeline')
    expect(getPhaseLabel('thesis_catalogador')).toBe('Teses: Inventário Local (legado Catalogador)')
    expect(getPhaseLabel('thesis_analista_repair')).toBe('Analista de Redundâncias (reparo JSON)')
    expect(getPhaseLabel('pres_image_generator')).toBe('Apresentação: Gerador de Imagens')
    expect(getPhaseLabel('media_video_clip_generation')).toBe('Vídeo: Geração de Clipes por Partes')
  })

  it('aggregates video, audio and presentation executions into the proper function breakdowns', () => {
    const executions = [
      createUsageExecutionRecord({ source_type: 'video_pipeline', source_id: 'nb-1', phase: 'media_image_generation', agent_name: 'Gerador de Imagens', model: 'google/gemini-2.5-flash-image', cost_usd: 0.02 }),
      createUsageExecutionRecord({ source_type: 'video_pipeline', source_id: 'nb-1', phase: 'media_video_clip_generation', agent_name: 'Gerador de Clipes', model: 'external-provider/video', cost_usd: 0.07 }),
      createUsageExecutionRecord({ source_type: 'video_pipeline', source_id: 'nb-1', phase: 'media_video_render', agent_name: 'Renderizador de Vídeo', model: 'browser/video-webm', cost_usd: 0 }),
      createUsageExecutionRecord({ source_type: 'audio_pipeline', source_id: 'nb-1', phase: 'audio_literal_generation', agent_name: 'Narrador / TTS', model: 'openai/tts-1-hd', cost_usd: 0.015 }),
      createUsageExecutionRecord({ source_type: 'presentation_pipeline', source_id: 'nb-1', phase: 'pres_planejador', agent_name: 'Planejador de Apresentação', model: 'openai/gpt-4.1-mini', cost_usd: 0.004 }),
      createUsageExecutionRecord({ source_type: 'presentation_pipeline', source_id: 'nb-1', phase: 'pres_image_generator', agent_name: 'Gerador de Imagens de Slides', model: 'google/gemini-2.5-flash-image', cost_usd: 0.03 }),
      createUsageExecutionRecord({ source_type: 'presentation_pipeline', source_id: 'nb-1', phase: 'visual_artifact_render', agent_name: 'Renderizador Visual de Apresentação', model: 'browser/svg-render', cost_usd: 0 }),
    ]

    const breakdown = buildCostBreakdown(executions)

    expect(breakdown.by_function.map(item => item.key)).toEqual(expect.arrayContaining([
      'video_pipeline',
      'audio_pipeline',
      'presentation_pipeline',
    ]))
    expect(breakdown.by_phase.find(item => item.key === 'audio_literal_generation')?.label).toBe('Áudio: Geração Literal Final')
    expect(breakdown.by_phase.find(item => item.key === 'pres_image_generator')?.label).toBe('Apresentação: Gerador de Imagens')
    expect(breakdown.by_phase.find(item => item.key === 'media_video_clip_generation')?.label).toBe('Vídeo: Geração de Clipes por Partes')
    expect(breakdown.by_phase.find(item => item.key === 'visual_artifact_render')?.label).toBe('Caderno: Renderização Visual Final')
    expect(breakdown.by_agent.map(item => item.label)).toEqual(expect.arrayContaining([
      'Gerador de Imagens',
      'Gerador de Imagens de Slides',
      'Gerador de Clipes',
      'Narrador / TTS',
      'Renderizador Visual de Apresentação',
    ]))
  })

  it('merges the v4 single-agent pipeline into the base document function, keeping v4 phase labels', () => {
    const executions = [
      createUsageExecutionRecord({
        source_type: 'document_generation_v4',
        source_id: 'doc-v4-1',
        phase: 'v4_agent_loop',
        agent_name: 'V4: Loop do Agente',
        model: 'anthropic/claude-opus-4',
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        execution_state: 'completed',
      }),
      createUsageExecutionRecord({
        source_type: 'document_generation_v4',
        source_id: 'doc-v4-1',
        phase: 'v4_agent',
        agent_name: 'V4: Agente Principal',
        model: 'anthropic/claude-opus-4',
        cost_usd: 0.12,
      }),
      createUsageExecutionRecord({
        source_type: 'document_generation_v4',
        source_id: 'doc-v4-1',
        phase: 'v4_critic',
        agent_name: 'V4: Crítico',
        model: 'anthropic/claude-sonnet-4',
        cost_usd: 0.02,
      }),
      createUsageExecutionRecord({
        source_type: 'document_generation_v4',
        source_id: 'doc-v4-1',
        phase: 'v4_tool_search_jurisprudence',
        agent_name: 'V4: search_jurisprudence (LLM rerank)',
        model: 'anthropic/claude-opus-4',
        cost_usd: 0.005,
      }),
    ]

    const breakdown = buildCostBreakdown(executions)

    // v4 no longer surfaces as its own function — it rolls into the base document line.
    expect(breakdown.by_function.find(item => item.key === 'document_generation_v4')).toBeUndefined()
    expect(breakdown.by_function.find(item => item.key === 'document_generation')?.label).toBe('Geração de documentos')
    expect(breakdown.by_phase.find(item => item.key === 'v4_agent_loop')?.label).toBe('V4: Loop do Agente')
    expect(breakdown.by_phase.find(item => item.key === 'v4_agent')?.label).toBe('V4: Agente Principal')
    expect(breakdown.by_phase.find(item => item.key === 'v4_critic')?.label).toBe('V4: Crítico')
    expect(breakdown.by_phase.find(item => item.key === 'v4_tool_search_jurisprudence')?.label).toBe('V4: Ferramenta · Jurisprudência')
  })

  it('merges v3 pipeline usage into the base document function (zero-cost operational orchestrator)', () => {
    const executions = [
      createUsageExecutionRecord({
        source_type: 'document_generation_v3',
        source_id: 'doc-v3-1',
        phase: 'v3_pipeline_orchestrator',
        agent_name: 'Orquestrador do Pipeline',
        model: 'anthropic/claude-opus-4.5',
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        execution_state: 'retrying',
        retry_count: 2,
      }),
    ]

    const breakdown = buildCostBreakdown(executions)

    expect(breakdown.by_function.find(item => item.key === 'document_generation_v3')).toBeUndefined()
    expect(breakdown.by_function.find(item => item.key === 'document_generation')?.label).toBe('Geração de documentos')
    expect(breakdown.by_phase.find(item => item.key === 'v3_pipeline_orchestrator')?.label).toBe('V3: Orquestrador do Pipeline')
    expect(breakdown.by_agent.find(item => item.label === 'Orquestrador do Pipeline')?.cost_usd).toBe(0)
    expect(breakdown.by_agent_function.find(item => item.key === 'document_generation::Orquestrador do Pipeline')).toBeDefined()
  })

  it('labels chat attachment, export and multimodal operational usage', () => {
    const executions = [
      createUsageExecutionRecord({ source_type: 'chat_attachment_ingestion', source_id: 'turn-1', phase: 'chat_attachment_ingestion', agent_name: 'Ingestor de anexos', model: 'browser/pptx-parser', cost_usd: 0 }),
      createUsageExecutionRecord({ source_type: 'chat_export_materialization', source_id: 'turn-1', phase: 'chat_export_materialization', agent_name: 'Empacotador', model: 'browser/exporter', cost_usd: 0 }),
      createUsageExecutionRecord({ source_type: 'chat_multimodal_analysis', source_id: 'turn-1', phase: 'chat_multimodal_analysis', agent_name: 'Analisador multimodal', model: 'openai/gpt-4o-mini', cost_usd: 0.01 }),
    ]

    const breakdown = buildCostBreakdown(executions)

    expect(breakdown.by_function.map(item => item.label)).toEqual(expect.arrayContaining([
      'Chat: Ingestão de anexos',
      'Chat: Materialização de exports',
      'Chat: Análise multimodal',
    ]))
    expect(breakdown.by_phase.find(item => item.key === 'chat_export_materialization')?.label).toBe('Chat: Materialização de exports')
  })

  it('maps every chat orchestrator agent to a human-friendly phase label', () => {
    const unmapped: string[] = []
    for (const def of CHAT_ORCHESTRATOR_AGENT_DEFS) {
      const label = getPhaseLabel(def.key)
      // The generic fallback in getPhaseLabel returns the key with underscores
      // replaced by spaces. A real label must differ from that and be prefixed
      // with "Chat:" so cost analytics never surfaces a raw key like "chat fs actor".
      if (label === def.key.replace(/_/g, ' ') || !label.startsWith('Chat:')) {
        unmapped.push(def.key)
      }
    }
    expect(unmapped).toEqual([])
  })

  it('flattens chat conversation turns into per-pipeline usage executions', () => {
    const executions = extractChatTurnExecutions({
      id: 'turn-1',
      conversation_id: 'conv-1',
      created_at: '2026-05-20T10:00:00.000Z',
      llm_executions: [
        createUsageExecutionRecord({ source_type: 'chat_orchestrator', source_id: 'turn-1', phase: 'chat_orchestrator', agent_name: 'Orquestrador', model: 'anthropic/claude-opus-4', cost_usd: 0.4 }),
        createUsageExecutionRecord({ source_type: 'chat_multimodal_analysis', source_id: 'turn-1', phase: 'chat_multimodal_analysis', agent_name: 'Analisador multimodal', model: 'openai/gpt-4o-mini', cost_usd: 0.02 }),
      ],
    })
    expect(executions).toHaveLength(2)
    // Each record keeps its own function key so the cost page attributes it to
    // the right pipeline instead of collapsing all chat calls into one bucket.
    expect(executions.map(item => item.function_key)).toEqual(['chat_orchestrator', 'chat_multimodal_analysis'])
    expect(executions[0].cost_usd).toBeCloseTo(0.4, 6)
  })

  it('synthesizes a chat usage record from a turn summary when executions are absent', () => {
    const executions = extractChatTurnExecutions({
      id: 'turn-2',
      conversation_id: 'conv-1',
      created_at: '2026-05-20T11:00:00.000Z',
      usage_summary: { total_tokens_in: 1200, total_tokens_out: 800, total_cost_usd: 0.15 },
    })
    expect(executions).toHaveLength(1)
    expect(executions[0].function_key).toBe('chat_orchestrator')
    expect(executions[0].total_tokens).toBe(2000)
    expect(extractChatTurnExecutions({ id: 't', created_at: '2026-05-20T12:00:00.000Z' })).toEqual([])
  })

  it('exposes current-month and today spend on the cost breakdown', () => {
    const breakdown = buildCostBreakdown([
      createUsageExecutionRecord({ source_type: 'chat_orchestrator', source_id: 't', created_at: new Date().toISOString(), phase: 'chat_orchestrator', agent_name: 'Orquestrador', cost_usd: 0.5 }),
      createUsageExecutionRecord({ source_type: 'document_generation', source_id: 'd', created_at: '2020-01-01T00:00:00.000Z', phase: 'redacao', agent_name: 'redator', cost_usd: 0.9 }),
    ])
    expect(breakdown.total_cost_usd).toBeCloseTo(1.4, 6)
    // Only the recent execution lands inside the current-month / today windows.
    expect(breakdown.month_cost_usd).toBeCloseTo(0.5, 6)
    expect(breakdown.today_cost_usd).toBeCloseTo(0.5, 6)
  })
})

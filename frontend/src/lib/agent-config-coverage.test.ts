import { describe, expect, it } from 'vitest'

import {
  ACERVO_CLASSIFICADOR_AGENT_DEFS,
  ACERVO_EMENTA_AGENT_DEFS,
  AGENT_CONFIG_DEFS,
  AUDIO_PIPELINE_AGENT_DEFS,
  CHAT_ORCHESTRATOR_AGENT_DEFS,
  CONTEXT_DETAIL_AGENT_DEFS,
  DOCUMENT_V3_PIPELINE_AGENT_DEFS,
  NOTEBOOK_ACERVO_AGENT_DEFS,
  PIPELINE_AGENT_DEFS,
  PRESENTATION_PIPELINE_AGENT_DEFS,
  PRESENTATION_V2_PIPELINE_AGENT_DEFS,
  RESEARCH_NOTEBOOK_AGENT_DEFS,
  THESIS_ANALYST_AGENT_DEFS,
  VIDEO_PIPELINE_AGENT_DEFS,
} from './model-config'
import * as pipelineAgentDefs from './pipelines/agent-definitions'

describe('user-scoped agent configuration coverage', () => {
  it('keeps model-config as the compatibility facade for per-pipeline agent definitions', () => {
    expect(PIPELINE_AGENT_DEFS).toBe(pipelineAgentDefs.PIPELINE_AGENT_DEFS)
    expect(THESIS_ANALYST_AGENT_DEFS).toBe(pipelineAgentDefs.THESIS_ANALYST_AGENT_DEFS)
    expect(CONTEXT_DETAIL_AGENT_DEFS).toBe(pipelineAgentDefs.CONTEXT_DETAIL_AGENT_DEFS)
    expect(ACERVO_CLASSIFICADOR_AGENT_DEFS).toBe(pipelineAgentDefs.ACERVO_CLASSIFICADOR_AGENT_DEFS)
    expect(ACERVO_EMENTA_AGENT_DEFS).toBe(pipelineAgentDefs.ACERVO_EMENTA_AGENT_DEFS)
    expect(RESEARCH_NOTEBOOK_AGENT_DEFS).toBe(pipelineAgentDefs.RESEARCH_NOTEBOOK_AGENT_DEFS)
    expect(NOTEBOOK_ACERVO_AGENT_DEFS).toBe(pipelineAgentDefs.NOTEBOOK_ACERVO_AGENT_DEFS)
    expect(VIDEO_PIPELINE_AGENT_DEFS).toBe(pipelineAgentDefs.VIDEO_PIPELINE_AGENT_DEFS)
    expect(AUDIO_PIPELINE_AGENT_DEFS).toBe(pipelineAgentDefs.AUDIO_PIPELINE_AGENT_DEFS)
    expect(PRESENTATION_PIPELINE_AGENT_DEFS).toBe(pipelineAgentDefs.PRESENTATION_PIPELINE_AGENT_DEFS)
    expect(PRESENTATION_V2_PIPELINE_AGENT_DEFS).toBe(pipelineAgentDefs.PRESENTATION_V2_PIPELINE_AGENT_DEFS)
    expect(DOCUMENT_V3_PIPELINE_AGENT_DEFS).toBe(pipelineAgentDefs.DOCUMENT_V3_PIPELINE_AGENT_DEFS)
    expect(CHAT_ORCHESTRATOR_AGENT_DEFS).toBe(pipelineAgentDefs.CHAT_ORCHESTRATOR_AGENT_DEFS)
  })

  it('keeps all scoped configuration groups registered', () => {
    expect(Object.keys(AGENT_CONFIG_DEFS).sort()).toEqual([
      'acervo_classificador_models',
      'acervo_ementa_models',
      'agent_models',
      'audio_pipeline_models',
      'chat_orchestrator_models',
      'context_detail_models',
      'document_v3_models',
      'notebook_acervo_models',
      'presentation_pipeline_models',
      'presentation_v2_pipeline_models',
      'research_notebook_models',
      'thesis_analyst_models',
      'video_pipeline_models',
    ])
  })

  it('registers every chat orchestrator agent under chat_orchestrator_models', () => {
    expect(AGENT_CONFIG_DEFS.chat_orchestrator_models.map(agent => agent.key)).toEqual([
      'chat_orchestrator',
      'chat_planner',
      'chat_clarifier',
      'chat_legal_researcher',
      'chat_code_writer',
      'chat_fs_actor',
      'chat_summarizer',
      'chat_critic',
      'chat_writer',
      'chat_argument_builder',
      'chat_ethics_auditor',
      'chat_artifact_architect',
      'chat_document_composer',
      'chat_data_builder',
      'chat_media_director',
      'chat_multimodal_analysis',
      'chat_image_evidence_specialist',
      'chat_audio_evidence_specialist',
      'chat_video_evidence_specialist',
      'chat_multimodal_evidence_synthesizer',
      'chat_audio_transcription',
      'chat_export_packager',
    ])
  })

  it('includes the media-critical agents in the user-facing scoped configs', () => {
    expect(AGENT_CONFIG_DEFS.research_notebook_models.map(agent => agent.key)).toEqual(expect.arrayContaining([
      'research_notebook_orchestrator',
      'notebook_pesquisador',
      'notebook_analista',
      'notebook_assistente',
      'notebook_pesquisador_externo',
      'notebook_pesquisador_externo_profundo',
      'notebook_pesquisador_jurisprudencia',
      'notebook_ranqueador_jurisprudencia',
      'studio_pesquisador',
      'studio_escritor',
      'studio_roteirista',
      'studio_visual',
      'studio_revisor',
    ]))

    expect(AGENT_CONFIG_DEFS.video_pipeline_models.map(agent => agent.key)).toEqual(expect.arrayContaining([
      'video_pipeline_orchestrator',
      'video_planejador',
      'video_roteirista',
      'video_diretor_cena',
      'video_storyboarder',
      'video_designer',
      'video_compositor',
      'video_narrador',
      'video_revisor',
      'video_clip_planner',
      'video_image_generator',
      'video_tts',
    ]))

    expect(AGENT_CONFIG_DEFS.presentation_pipeline_models.map(agent => agent.key)).toEqual(expect.arrayContaining([
      'presentation_pipeline_orchestrator',
      'pres_planejador',
      'pres_pesquisador',
      'pres_redator',
      'pres_designer',
      'pres_image_generator',
      'pres_revisor',
    ]))

    expect(AGENT_CONFIG_DEFS.presentation_v2_pipeline_models.map(agent => agent.key)).toEqual(expect.arrayContaining([
      'presentation_v2_orchestrator',
      'presentation_v2_image_generator',
      'presentation_v2_tts',
      'presentation_v2_video_generator',
      'presentation_v2_reviewer',
      'presentation_v2_packager',
    ]))

    expect(AGENT_CONFIG_DEFS.document_v3_models.map(agent => agent.key)).toEqual(expect.arrayContaining([
      'v3_intent_classifier',
      'v3_request_parser',
      'v3_legal_issue_spotter',
      'v3_prompt_architect',
      'v3_acervo_retriever',
      'v3_thesis_retriever',
      'v3_thesis_builder',
      'v3_devil_advocate',
      'v3_thesis_refiner',
      'v3_legislation_researcher',
      'v3_jurisprudence_researcher',
      'v3_doctrine_researcher',
      'v3_citation_verifier',
      'v3_outline_planner',
      'v3_writer',
      'v3_writer_reviser',
      'v3_pipeline_orchestrator',
      'v3_supervisor',
    ]))

    expect(AGENT_CONFIG_DEFS.thesis_analyst_models.map(agent => agent.key)).toEqual([
      'thesis_pipeline_orchestrator',
      'thesis_catalogador',
      'thesis_analista',
      'thesis_compilador',
      'thesis_curador',
      'thesis_revisor',
    ])
  })
})

import { describe, expect, it } from 'vitest'

import { AGENT_CONFIG_DEFS } from './model-config'

describe('user-scoped agent configuration coverage', () => {
  it('keeps all scoped configuration groups registered', () => {
    expect(Object.keys(AGENT_CONFIG_DEFS).sort()).toEqual([
      'acervo_classificador_models',
      'acervo_ementa_models',
      'agent_models',
      'audio_pipeline_models',
      'context_detail_models',
      'document_v3_models',
      'notebook_acervo_models',
      'presentation_pipeline_models',
      'research_notebook_models',
      'thesis_analyst_models',
      'video_pipeline_models',
    ])
  })

  it('includes the media-critical agents in the user-facing scoped configs', () => {
    expect(AGENT_CONFIG_DEFS.research_notebook_models.map(agent => agent.key)).toEqual(expect.arrayContaining([
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
      'pres_planejador',
      'pres_pesquisador',
      'pres_redator',
      'pres_designer',
      'pres_image_generator',
      'pres_revisor',
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
      'v3_supervisor',
    ]))
  })
})
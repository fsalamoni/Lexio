import type { AgentModelDef } from '../../model-config'

// ── Research Notebook (Caderno de Pesquisa) Agent Definitions ─────────────────

/**
 * Multi-agent pipeline for the "Caderno de Pesquisa" feature — an intelligent
 * research assistant similar to NotebookLM. It uses the user's acervo and
 * additional uploaded sources to learn about a topic and answer questions,
 * generate summaries, presentations, mind maps, flashcards, and more.
 *
 * Agent groups:
 *  ── Pesquisa & Análise ──
 *  1. Pesquisador   — deep-searches sources and builds a knowledge base
 *  2. Analista      — analyses, cross-references and synthesises findings
 *  3. Assistente    — answers user questions conversationally using context
 *
 *  ── Estúdio de Criação (multi-agent pipeline) ──
 *  4. Pesquisador do Estúdio — extracts source data relevant to the specific artifact
 *  5. Escritor               — produces written content (summaries, reports, docs, flashcards, quizzes)
 *  6. Roteirista             — creates scripts with narration, timing and production notes (audio/video)
 *  7. Designer Visual        — builds visual structures (presentations, mind maps, infographics, tables)
 *  8. Revisor                — quality-checks, refines and enhances any artifact before delivery
 *
 * Visual artifacts then pass through dedicated media stages in the notebook
 * flow, where structured JSON is rendered into persisted images or posters.
 */
export const RESEARCH_NOTEBOOK_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'research_notebook_orchestrator',
    label: 'Orquestrador do Caderno',
    description: 'Controla retries, retomadas, paralelismo e continuidade operacional do Caderno de Pesquisa',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'activity',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
  },
  // ── Pesquisa & Análise ──
  {
    key: 'notebook_pesquisador',
    label: 'Pesquisador de Fontes',
    description: 'Busca e indexa conteúdo relevante nas fontes do caderno e no acervo',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
  },
  {
    key: 'notebook_analista',
    label: 'Analista de Conhecimento',
    description: 'Analisa, cruza referências e sintetiza descobertas sobre o tema',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'brain',
    agentCategory: 'reasoning',
  },
  {
    key: 'notebook_assistente',
    label: 'Assistente Conversacional',
    description: 'Responde perguntas do usuário com base no conhecimento indexado',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'message-circle',
    agentCategory: 'reasoning',
  },
  {
    key: 'notebook_pesquisador_externo',
    label: 'Pesquisador Externo',
    description: 'Realiza pesquisa externa web para enriquecer as fontes do caderno',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
  },
  {
    key: 'notebook_pesquisador_externo_profundo',
    label: 'Pesquisador Externo Profundo',
    description: 'Conduz pesquisa externa profunda e curadoria avançada de múltiplas fontes',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'brain',
    agentCategory: 'reasoning',
  },
  {
    key: 'notebook_pesquisador_jurisprudencia',
    label: 'Pesquisador de Jurisprudência (DataJud)',
    description: 'Pesquisa jurisprudência na API do CNJ (DataJud) e prepara fontes para o caderno',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
  },
  {
    key: 'notebook_ranqueador_jurisprudencia',
    label: 'Ranqueador de Jurisprudência',
    description: 'Avalia a relevância dos resultados do DataJud em relação à consulta e reordena por importância',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'bar-chart-2',
    agentCategory: 'extraction',
  },
  // ── Estúdio de Criação ──
  {
    key: 'studio_pesquisador',
    label: 'Pesquisador do Estúdio',
    description: 'Extrai e organiza dados relevantes das fontes para o artefato solicitado',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
  },
  {
    key: 'studio_escritor',
    label: 'Escritor',
    description: 'Redige conteúdo textual e gera JSON estruturado para flashcards, quizzes, resumos e relatórios',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'file-text',
    agentCategory: 'writing',
  },
  {
    key: 'studio_roteirista',
    label: 'Roteirista',
    description: 'Cria roteiros profissionais em JSON estruturado com narração, timing e notas de produção',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'mic',
    agentCategory: 'writing',
  },
  {
    key: 'studio_visual',
    label: 'Designer Visual',
    description: 'Gera JSON estruturado para apresentações, mapas mentais, infográficos e tabelas que depois são renderizados em imagem final',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'pen-tool',
    agentCategory: 'synthesis',
  },
  {
    key: 'studio_revisor',
    label: 'Revisor de Qualidade',
    description: 'Revisa, aprimora e garante excelência mantendo o formato (JSON/Markdown) do artefato',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'clipboard-check',
    agentCategory: 'synthesis',
  },
]

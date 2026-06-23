import type { AgentModelDef } from '../../model-config'
import { CHAT_ORCHESTRATOR_AGENT_DEFS } from './chat-orchestrator'

/**
 * Chat Orchestrator v2 — lean agent group + rich tools.
 *
 * Where v1 spreads work across ~28 specialist agents, v2 follows the modern
 * lead-agent + subagent pattern (Claude / Manus / AionUI): a small, fixed group
 * of agents drives the SAME rich tool catalog (image, audio, video,
 * presentation, code/document, web search + site access, and PC/sidecar
 * actions). Runs in parallel to v1 behind FF_CHAT_ORCHESTRATOR_V2.
 *
 * - cv2_orchestrator — the lead. Runs the tool loop, decides every step, and
 *   delegates isolated/parallel subtasks to the worker.
 * - cv2_worker — one versatile specialist the lead calls via `call_agent`
 *   for research, writing, code, analysis and synthesis subtasks (context
 *   isolation + parallel fan-out).
 * - cv2_critic — evaluator-optimizer quality gate over the final draft.
 */
export const CHAT_ORCHESTRATOR_V2_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'cv2_orchestrator',
    label: 'Orquestrador v2 (Líder)',
    description: 'Agente líder que conduz toda a conversa: raciocina, decide e chama ferramentas (mídia, web, PC) e o trabalhador em loop',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'brain',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Modelo reasoning-tier (Opus/Sonnet 4/o3/GPT-4.1) — comanda o loop de ferramentas e a delegação',
  },
  {
    key: 'cv2_worker',
    label: 'Trabalhador v2 (Subagente)',
    description: 'Subagente versátil que recebe subtarefas delegadas (pesquisa, redação, código, análise, síntese) com contexto isolado e em paralelo',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'pen-tool',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Modelo balanced forte (Sonnet/GPT-4o/Gemini 2.5) — executa subtarefas de qualidade sob direção do líder',
  },
  {
    key: 'cv2_critic',
    label: 'Crítico v2',
    description: 'Avalia o rascunho final e emite veredito (score 0-100). Se score < 75, o líder recebe feedback e refina (evaluator-optimizer)',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'shield',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Modelo balanced — uma avaliação crítica independente do rascunho',
  },
]

/**
 * Media-routing agent keys whose models the literal-media super-skills
 * (`generate_image`, `generate_audio`, `generate_presentation`,
 * `generate_video`) resolve at runtime. The v2 lean group drives the SAME rich
 * tool catalog as v1, so these agents must be configurable and resolvable under
 * v2 too — otherwise the orchestrator can plan media but never produce the real
 * artifact (it would look up a model that only exists in the v1 roster).
 *
 * They are NOT conversational agents: the lead never reaches them via
 * `call_agent` (that is gated by the profile's callable set), they are only
 * driven through the media super-skills. Reusing the exact v1 keys keeps the
 * super-skills unchanged and the cost analytics attribution stable.
 */
export const CHAT_V2_MEDIA_AGENT_KEYS = [
  'chat_image_generator',
  'chat_audio_generator',
  'chat_presentation_designer',
  'chat_video_generator',
] as const

/**
 * The media-routing defs, reused verbatim from the v1 roster (single source of
 * truth for labels, descriptions and required capabilities), ordered to match
 * `CHAT_V2_MEDIA_AGENT_KEYS`.
 */
export const CHAT_V2_MEDIA_AGENT_DEFS: AgentModelDef[] = CHAT_V2_MEDIA_AGENT_KEYS
  .map(key => CHAT_ORCHESTRATOR_AGENT_DEFS.find(def => def.key === key))
  .filter((def): def is AgentModelDef => Boolean(def))

/**
 * Full set of agents persisted under the `chat_orchestrator_v2_models` scoped
 * config: the lean conversational group plus the media-routing tool models.
 * The lean group identity (`CHAT_ORCHESTRATOR_V2_AGENT_DEFS`) stays intact for
 * the engine, profile and callable-agent gating; this combined list only drives
 * the model map (defaults / load / save / validation) and the config card.
 */
export const CHAT_ORCHESTRATOR_V2_MODEL_DEFS: AgentModelDef[] = [
  ...CHAT_ORCHESTRATOR_V2_AGENT_DEFS,
  ...CHAT_V2_MEDIA_AGENT_DEFS,
]

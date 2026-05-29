/**
 * Chat Orchestrator v2 — profile + runtime entry.
 *
 * v2 reuses the proven v1 engine (`runChatTurn`) via a `ChatOrchestratorProfile`
 * that swaps the agent roster for a lean group (lead + worker + critic), keeps
 * the full tool catalog, and tags cost under `chat_orchestrator_v2`. The only
 * v2-specific skill added on top of the shared registry is `fetch_url`
 * (site access), reusing the web-search service.
 */
import { runChatTurn } from '../chat-orchestrator/orchestrator'
import { buildSkillRegistry } from '../chat-orchestrator/skill-registry'
import type {
  ChatOrchestratorProfile,
  RunChatTurnInput,
  RunChatTurnOutput,
  Skill,
} from '../chat-orchestrator/types'
import type { ChatTrailEvent } from '../firestore-types'
import { fetchUrlContent } from '../web-search-service'
import { CHAT_ORCHESTRATOR_V2_AGENT_DEFS } from '../model-config'
import { CHAT_V2_ALWAYS_ON_TOOLS } from './tool-catalog'
import {
  getDefaultChatV2ToolsConfig,
  loadChatV2ToolsConfig,
  resolveEnabledChatV2Tools,
} from './tools-config'

function nowIso() {
  return new Date().toISOString()
}

/** v2-only skill: access a website and extract its readable text. */
const fetchUrlSkill: Skill<{ url?: string }> = {
  name: 'fetch_url',
  description: 'Acessa uma URL e extrai o conteúdo textual da página (acesso a sites). Use para ler artigos, decisões publicadas, documentação e páginas indicadas pelo usuário.',
  argsHint: {
    url: 'URL completa (https://...) da página a acessar',
  },
  async run(args, ctx) {
    const url = String(args.url ?? '').trim()
    if (!url) return { tool_message: 'fetch_url: forneça `url`.' }
    ctx.emit({
      type: 'super_skill_call',
      skill: 'fetch_url',
      result_summary: `Acessando ${url}`,
      ts: nowIso(),
    } as ChatTrailEvent)
    try {
      const content = await fetchUrlContent(url)
      if (!content.trim()) {
        return { tool_message: `fetch_url: ${url} retornou conteúdo vazio.` }
      }
      const clipped = content.length > 8000 ? `${content.slice(0, 7999)}…` : content
      return { tool_message: `Conteúdo de ${url} (${content.length} chars):\n${clipped}` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      return { tool_message: `fetch_url: falha ao acessar ${url}: ${(err as Error).message}` }
    }
  },
}

/**
 * Build the v2 skill set: the shared registry + `fetch_url`, filtered by the
 * user's enabled-tools config (always-on tools are kept regardless).
 */
export function buildChatV2Skills(enabled: ReadonlySet<string>): Skill[] {
  const all = [...buildSkillRegistry(), fetchUrlSkill]
  return all.filter(skill => CHAT_V2_ALWAYS_ON_TOOLS.has(skill.name) || enabled.has(skill.name))
}

/** The lean group only delegates to the single versatile worker. */
const CHAT_V2_CALLABLE_AGENT_KEYS: ReadonlySet<string> = new Set(['cv2_worker'])

function listChatV2CallableAgents(): Array<{ key: string; label: string; description: string }> {
  return (CHAT_ORCHESTRATOR_V2_AGENT_DEFS ?? [])
    .filter(def => CHAT_V2_CALLABLE_AGENT_KEYS.has(def.key))
    .map(def => ({ key: def.key, label: def.label, description: def.description }))
}

/** Build the v2 profile over a resolved set of enabled tool names. */
export function buildChatV2Profile(enabled: ReadonlySet<string>): ChatOrchestratorProfile {
  return {
    id: 'v2',
    orchestratorAgentKey: 'cv2_orchestrator',
    orchestratorLabel: 'Orquestrador v2 (Líder)',
    finalForceAgentKey: 'cv2_worker',
    criticAgentKey: 'cv2_critic',
    functionKey: 'chat_orchestrator_v2',
    functionLabel: 'Orquestrador Chat v2',
    callableAgentKeys: CHAT_V2_CALLABLE_AGENT_KEYS,
    listCallableAgents: listChatV2CallableAgents,
    buildSkills: () => buildChatV2Skills(enabled),
  }
}

/**
 * Run a single chat turn through the v2 lean pipeline. Loads the user's v2
 * tools config, builds the profile, then delegates to the shared engine.
 */
export async function runChatTurnV2(input: RunChatTurnInput): Promise<RunChatTurnOutput> {
  const toolsConfig = input.mock
    ? getDefaultChatV2ToolsConfig()
    : await loadChatV2ToolsConfig(input.uid)
  const enabled = resolveEnabledChatV2Tools(toolsConfig)
  const profile = buildChatV2Profile(enabled)
  return runChatTurn({ ...input, profile })
}

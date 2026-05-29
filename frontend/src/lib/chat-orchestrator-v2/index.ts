/**
 * Public surface of the Chat Orchestrator v2 (lean agent group + rich tools).
 * The UI imports `runChatTurnV2` and the tools-config helpers through here.
 */
export { runChatTurnV2, buildChatV2Profile, buildChatV2Skills } from './profile'
export {
  CHAT_V2_TOOL_CATALOG,
  CHAT_V2_TOOL_NAMES,
  CHAT_V2_ALWAYS_ON_TOOLS,
  CHAT_V2_TOOL_CATEGORY_LABELS,
} from './tool-catalog'
export type { ChatV2ToolMeta, ChatV2ToolCategory } from './tool-catalog'
export {
  CHAT_V2_TOOLS_SCHEMA_VERSION,
  getDefaultChatV2ToolsConfig,
  loadChatV2ToolsConfig,
  saveChatV2ToolsConfig,
  resetChatV2ToolsConfig,
  resolveEnabledChatV2Tools,
} from './tools-config'
export type { ChatV2ToolsConfig, ChatV2ToolEntry } from './tools-config'

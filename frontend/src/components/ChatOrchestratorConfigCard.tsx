import type { ElementType } from 'react'
import {
  Code2,
  Compass,
  FileMinus,
  FolderCog,
  Gavel,
  HelpCircle,
  ListChecks,
  MessagesSquare,
  PenLine,
  Scale,
} from 'lucide-react'
import {
  CHAT_ORCHESTRATOR_AGENT_DEFS,
  getDefaultChatOrchestratorModelMap,
  loadChatOrchestratorModels,
  resetChatOrchestratorModels,
  saveChatOrchestratorModels,
} from '../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from './AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  compass: Compass,
  'list-checks': ListChecks,
  'help-circle': HelpCircle,
  gavel: Gavel,
  'code-2': Code2,
  'folder-cog': FolderCog,
  'file-minus': FileMinus,
  scale: Scale,
  'pen-line': PenLine,
}

export default function ChatOrchestratorConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Orquestrador (Chat)..."
      sections={[
        {
          id: 'chat-orchestrator',
          title: 'Trilha Multiagente do Chat',
          titleIcon: MessagesSquare,
          subtitle: `${CHAT_ORCHESTRATOR_AGENT_DEFS.length} agentes · conversa orquestrada com tools, super-skills e ações no PC`,
          agents: CHAT_ORCHESTRATOR_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.indigo,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.indigo.infoBox}`}>
              <p>
                <strong>💡 Como funciona:</strong> o <strong>Orquestrador</strong> decide a próxima
                ação a cada iteração e despacha tools — agentes especialistas, super-skills dos
                pipelines do Lexio (geração de documento, jurisprudência, vídeo, áudio etc.) e,
                quando o sidecar local está pareado, ações de filesystem e shell. O <strong>Crítico</strong>
                força a parada antecipada quando o rascunho já está bom; o <strong>Sumarizador</strong>
                comprime o histórico se o orçamento de tokens apertar.
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadChatOrchestratorModels}
      saveModels={saveChatOrchestratorModels}
      resetModels={resetChatOrchestratorModels}
      getDefaultModels={getDefaultChatOrchestratorModelMap}
    />
  )
}

import { type ElementType } from 'react'
import { Brain, PenTool, Shield, Users } from 'lucide-react'
import {
  CHAT_ORCHESTRATOR_V2_AGENT_DEFS,
  getDefaultChatOrchestratorV2ModelMap,
  loadChatOrchestratorV2Models,
  resetChatOrchestratorV2Models,
  saveChatOrchestratorV2Models,
} from '../../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from '../AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  'brain': Brain,
  'pen-tool': PenTool,
  'shield': Shield,
}

export default function ChatOrchestratorV2ConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Orquestrador v2..."
      sections={[
        {
          id: 'chat-orchestrator-v2',
          title: 'Orquestrador do Chat v2 (grupo enxuto + ferramentas)',
          titleIcon: Users,
          subtitle: `${CHAT_ORCHESTRATOR_V2_AGENT_DEFS.length} modelos · líder + trabalhador + crítico`,
          agents: CHAT_ORCHESTRATOR_V2_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.indigo,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.indigo.infoBox}`}>
              <p>
                <strong>💡 Orquestrador v2:</strong> arquitetura <strong>grupo enxuto + ferramentas</strong> —
                um <strong>líder</strong> reasoning-tier (Opus/Sonnet 4/o3) comanda o loop, decide cada passo e
                delega subtarefas (pesquisa, redação, código, análise) ao <strong>trabalhador</strong>; o
                <strong> crítico</strong> faz o gate de qualidade. Todas as capacidades (imagem, áudio, vídeo,
                apresentação, código, web, acesso a sites e ações no PC) ficam como <strong>ferramentas</strong>,
                configuráveis no cartão abaixo. Habilite o pipeline em Configurações → flags.
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadChatOrchestratorV2Models}
      saveModels={saveChatOrchestratorV2Models}
      resetModels={resetChatOrchestratorV2Models}
      getDefaultModels={getDefaultChatOrchestratorV2ModelMap}
    />
  )
}

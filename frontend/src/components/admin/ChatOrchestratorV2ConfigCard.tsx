import { type ElementType } from 'react'
import { Brain, Clapperboard, Image, Mic, PenTool, Shield, Users, Video } from 'lucide-react'
import {
  CHAT_ORCHESTRATOR_V2_AGENT_DEFS,
  CHAT_V2_MEDIA_AGENT_DEFS,
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
  'image': Image,
  'mic': Mic,
  'video': Video,
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
                <strong> crítico</strong> faz o gate de qualidade. As capacidades de texto, código, web, acesso a
                sites e ações no PC ficam como <strong>ferramentas</strong>. Os modelos de mídia literal (imagem,
                áudio, apresentação e vídeo) são configurados na seção abaixo. Habilite o pipeline em
                Configurações → flags.
              </p>
            </div>
          ),
        },
        {
          id: 'chat-orchestrator-v2-media',
          title: 'Modelos de mídia literal (imagem · áudio · apresentação · vídeo)',
          titleIcon: Clapperboard,
          subtitle: `${CHAT_V2_MEDIA_AGENT_DEFS.length} modelos · ferramentas de produção de artefatos`,
          agents: CHAT_V2_MEDIA_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.purple,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.purple.infoBox}`}>
              <p>
                <strong>🎨 Mídia literal:</strong> o líder aciona estes agentes através das ferramentas
                <em> gerar imagem</em>, <em>gerar áudio</em>, <em>gerar apresentação</em> e <em>gerar vídeo</em>.
                Configure cada um com um modelo que tenha a capacidade nativa correspondente (imagem, áudio ou
                vídeo) no seu catálogo pessoal. Sem um modelo configurado aqui, o chat consegue planejar a mídia
                mas não produz o artefato real.
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

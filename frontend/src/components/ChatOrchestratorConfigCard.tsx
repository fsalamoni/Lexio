import type { ElementType } from 'react'
import {
  Code2,
  Compass,
  Clapperboard,
  Download,
  FileMinus,
  FileText,
  FolderCog,
  Gavel,
  HelpCircle,
  ListChecks,
  Milestone,
  MessagesSquare,
  PackageCheck,
  PenLine,
  Scale,
  ShieldCheck,
  Table2,
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
  milestone: Milestone,
  'shield-check': ShieldCheck,
  'pen-line': PenLine,
  'package-check': PackageCheck,
  'file-text': FileText,
  'table-2': Table2,
  clapperboard: Clapperboard,
  download: Download,
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
          subtitle: `${CHAT_ORCHESTRATOR_AGENT_DEFS.length} agentes configuráveis · tools, super-skills, lotes paralelos e ações locais via sidecar`,
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

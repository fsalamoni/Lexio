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
  Image,
  ListChecks,
  Milestone,
  Mic,
  MessagesSquare,
  PackageCheck,
  PenLine,
  Scale,
  ScanEye,
  ScanSearch,
  ShieldCheck,
  Table2,
  Video,
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
  image: Image,
  mic: Mic,
  'scan-eye': ScanEye,
  'scan-search': ScanSearch,
  video: Video,
  download: Download,
}

/** Agents that literally generate downloadable media artifacts in the chat. */
const ARTIFACT_AGENT_KEYS = new Set([
  'chat_image_generator',
  'chat_audio_generator',
  'chat_presentation_designer',
  'chat_video_generator',
])

export default function ChatOrchestratorConfigCard() {
  const artifactAgents = CHAT_ORCHESTRATOR_AGENT_DEFS.filter(agent => ARTIFACT_AGENT_KEYS.has(agent.key))
  const trackAgents = CHAT_ORCHESTRATOR_AGENT_DEFS.filter(agent => !ARTIFACT_AGENT_KEYS.has(agent.key))

  const sections = [
    {
      id: 'chat-orchestrator',
      title: 'Trilha Multiagente do Chat',
      titleIcon: MessagesSquare,
      subtitle: `${trackAgents.length} agentes configuráveis · tools, super-skills, lotes paralelos e ações locais via sidecar`,
      agents: trackAgents,
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
  ]

  if (artifactAgents.length > 0) {
    sections.push({
      id: 'chat-artifact-agents',
      title: 'Agentes Geradores de Artefatos',
      titleIcon: PackageCheck,
      subtitle: `${artifactAgents.length} agentes de mídia · cada um usa um modelo restrito à capacidade (imagem, áudio, vídeo)`,
      agents: artifactAgents,
      tone: V2_AGENT_CONFIG_TONES.purple,
      showIndex: true,
      afterContent: (
        <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.purple.infoBox}`}>
          <p className="mb-2">
            <strong>🎨 Geração literal:</strong> estes agentes produzem artefatos reais — imagem,
            áudio, apresentação e vídeo — visualizáveis e baixáveis no próprio chat. O catálogo de
            cada um é <strong>restrito a modelos aptos</strong> à função: o Gerador de Imagem só
            lista modelos de imagem, o de Áudio só modelos de TTS e o de Vídeo só modelos de vídeo.
          </p>
          <p className="mb-2">
            <strong>🖼️ Imagem / 🔊 Áudio:</strong> selecione um modelo do seu catálogo pessoal com a
            capacidade correta (ex.: Gemini Flash Image, GPT Image; OpenAI TTS, ElevenLabs). Se o
            seletor estiver vazio, ative o provedor correspondente em <strong>Configurações →
            Provedores de IA</strong> e adicione o modelo ao catálogo.
          </p>
          <p>
            <strong>🎬 Vídeo (passo a passo):</strong> a geração de vídeo real usa o provedor{' '}
            <strong>fal.ai</strong>, que hospeda Veo, Kling, Wan, Hailuo e LTX. (1) Em{' '}
            <strong>Configurações → Provedores de IA</strong>, ative <strong>"fal.ai (Vídeo)"</strong>{' '}
            e cole sua chave de API (fal.ai/dashboard/keys). (2) Adicione um modelo de vídeo ao seu
            catálogo. (3) Aqui no <strong>Gerador de Vídeo Literal</strong>, escolha esse modelo.
            (4) Peça um vídeo no chat — o clipe MP4 é gerado, salvo e exibido com player e download.
            Nenhuma variável de ambiente é necessária: basta a sua chave fal.ai.
          </p>
        </div>
      ),
    })
  }

  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Orquestrador (Chat)..."
      sections={sections}
      agentIcons={AGENT_ICONS}
      loadModels={loadChatOrchestratorModels}
      saveModels={saveChatOrchestratorModels}
      resetModels={resetChatOrchestratorModels}
      getDefaultModels={getDefaultChatOrchestratorModelMap}
    />
  )
}

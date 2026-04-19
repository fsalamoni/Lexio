import type { ElementType } from 'react'
import { ClipboardCheck, FileText, Headphones, Layers, Mic, Music } from 'lucide-react'
import {
  AUDIO_PIPELINE_AGENT_DEFS,
  getDefaultAudioPipelineModelMap,
  loadAudioPipelineModels,
  resetAudioPipelineModels,
  saveAudioPipelineModels,
} from '../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from './AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  'clipboard-check': ClipboardCheck,
  'file-text': FileText,
  'layers': Layers,
  'music': Music,
  'mic': Mic,
}

export default function AudioPipelineConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Pipeline de Áudio..."
      sections={[
        {
          id: 'audio-pipeline',
          title: 'Trilha Multiagente de Áudio',
          titleIcon: Headphones,
          subtitle: '6 agentes · criação de áudio profissional',
          agents: AUDIO_PIPELINE_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.violet,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.violet.infoBox}`}>
              <p>
                <strong>💡 Informações:</strong> Esta trilha configura os agentes textuais que estruturam o
                conteúdo em JSON, inclusive a etapa <strong>Narrador / TTS</strong> dentro do pipeline lógico.
                A síntese de áudio real ocorre em etapa dedicada de geração de mídia.
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadAudioPipelineModels}
      saveModels={saveAudioPipelineModels}
      resetModels={resetAudioPipelineModels}
      getDefaultModels={getDefaultAudioPipelineModelMap}
    />
  )
}

import type { ElementType } from 'react'
import { ClipboardCheck, FileText, Image, PenTool, Presentation, Search } from 'lucide-react'
import {
  PRESENTATION_PIPELINE_AGENT_DEFS,
  getDefaultPresentationPipelineModelMap,
  loadPresentationPipelineModels,
  resetPresentationPipelineModels,
  savePresentationPipelineModels,
} from '../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from './AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  'clipboard-check': ClipboardCheck,
  'file-text': FileText,
  'search': Search,
  'pen-tool': PenTool,
  'image-plus': Image,
}

export default function PresentationPipelineConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Pipeline de Apresentação..."
      sections={[
        {
          id: 'presentation-pipeline',
          title: 'Trilha Multiagente de Apresentação',
          titleIcon: Presentation,
          subtitle: `${PRESENTATION_PIPELINE_AGENT_DEFS.length} agentes · criação de apresentação profissional`,
          agents: PRESENTATION_PIPELINE_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.sky,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.sky.infoBox}`}>
              <p>
                <strong>💡 Informações:</strong> Esta trilha agora cobre tanto a estrutura textual quanto a
                geração das <strong>imagens reais dos slides</strong>. Os 5 primeiros agentes montam o plano,
                a pesquisa e o conteúdo; o agente final <strong>Gerador de Imagens de Slides</strong> é usado
                na etapa automática de mídia para materializar os visuais e registrar seus custos no
                demonstrativo.
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadPresentationPipelineModels}
      saveModels={savePresentationPipelineModels}
      resetModels={resetPresentationPipelineModels}
      getDefaultModels={getDefaultPresentationPipelineModelMap}
    />
  )
}

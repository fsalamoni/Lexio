import type { ElementType } from 'react'
import {
  Boxes,
  BarChart3,
  Brush,
  Compass,
  FileText,
  Film,
  Headphones,
  ImagePlus,
  LayoutTemplate,
  MessageCircleQuestion,
  Mic,
  PackageCheck,
  Palette,
  Route,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
} from 'lucide-react'
import {
  PRESENTATION_V2_PIPELINE_AGENT_DEFS,
  getDefaultPresentationV2PipelineModelMap,
  loadPresentationV2PipelineModels,
  resetPresentationV2PipelineModels,
  savePresentationV2PipelineModels,
} from '../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from './AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  boxes: Boxes,
  'brush': Brush,
  'chart-no-axes-combined': BarChart3,
  compass: Compass,
  'file-text': FileText,
  film: Film,
  headphones: Headphones,
  'image-plus': ImagePlus,
  'layout-template': LayoutTemplate,
  'message-circle-question': MessageCircleQuestion,
  mic: Mic,
  'package-check': PackageCheck,
  palette: Palette,
  route: Route,
  'scan-search': ScanSearch,
  search: Search,
  'shield-check': ShieldCheck,
  sparkles: Sparkles,
  video: Video,
}

export default function PresentationV2PipelineConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Gerador de Apresentação v2..."
      sections={[
        {
          id: 'presentation-v2-pipeline',
          title: 'Gerador de Apresentação v2',
          titleIcon: Sparkles,
          subtitle: `${PRESENTATION_V2_PIPELINE_AGENT_DEFS.length} agentes · narrativa, design, assets multimodais e empacotamento`,
          agents: PRESENTATION_V2_PIPELINE_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.violet,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.violet.infoBox}`}>
              <p>
                <strong>v2 isolado:</strong> estes modelos alimentam apenas o novo tipo <strong>Apresentação v2</strong>.
                O pipeline clássico de apresentação continua usando a configuração antiga, preservando compatibilidade com
                artefatos e exports já existentes.
              </p>
              <p className="mt-2">
                <strong>Vídeo:</strong> o agente <strong>Gerador de Clipes</strong> é operado por provedor externo e não por seleção de modelo.
                A disponibilidade real depende de <strong>VITE_EXTERNAL_VIDEO_PROVIDER_*</strong> e é bloqueada no preflight quando o briefing exigir clipes.
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadPresentationV2PipelineModels}
      saveModels={savePresentationV2PipelineModels}
      resetModels={resetPresentationV2PipelineModels}
      getDefaultModels={getDefaultPresentationV2PipelineModelMap}
    />
  )
}
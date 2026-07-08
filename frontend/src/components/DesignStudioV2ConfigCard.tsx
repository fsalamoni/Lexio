import type { ElementType } from 'react'
import {
  Compass,
  ImagePlus,
  LayoutTemplate,
  ListChecks,
  MessageCircleQuestion,
  Palette,
  Server,
  ShieldCheck,
} from 'lucide-react'
import {
  DESIGN_STUDIO_V2_AGENT_DEFS,
  getDefaultDesignStudioV2ModelMap,
  loadDesignStudioV2Models,
  resetDesignStudioV2Models,
  saveDesignStudioV2Models,
} from '../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from './AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  compass: Compass,
  'list-checks': ListChecks,
  'message-circle-question': MessageCircleQuestion,
  'layout-template': LayoutTemplate,
  server: Server,
  palette: Palette,
  'shield-check': ShieldCheck,
  'image-plus': ImagePlus,
}

export default function DesignStudioV2ConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Design Studio v2..."
      sections={[
        {
          id: 'design-studio-v2',
          title: 'Design Studio v2',
          titleIcon: Compass,
          subtitle: `${DESIGN_STUDIO_V2_AGENT_DEFS.length} agentes · orquestrador, planejamento, engenharia front/back, design, revisão e assets`,
          agents: DESIGN_STUDIO_V2_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.indigo,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.indigo.infoBox}`}>
              <p>
                <strong>Builder conversacional:</strong> o <strong>Orquestrador</strong> lê cada pedido, desenvolve o
                raciocínio e decide o modo (construir, planejar ou perguntar), escrevendo código real de front-end e
                back-end. Ele pode delegar aos <strong>Engenheiros</strong> e ao <strong>Diretor de Design</strong>, e o
                <strong> Revisor</strong> faz uma passada de qualidade após construir.
              </p>
              <p className="mt-2">
                <strong>Catálogo pessoal:</strong> os seletores só exibem modelos do seu catálogo com capability
                compatível. Os agentes de texto exigem <strong>texto</strong>; o <strong>Gerador de Assets</strong> exige
                <strong> imagem</strong>, então só modelos capazes ficam habilitados para cada função.
              </p>
              <p className="mt-2">
                <strong>Recomendação:</strong> use um modelo premium (raciocínio + código) no Orquestrador para melhor
                qualidade. O <strong>Gerador de Assets</strong> inicia com <strong>google/gemini-2.5-flash-image</strong>.
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadDesignStudioV2Models}
      saveModels={saveDesignStudioV2Models}
      resetModels={resetDesignStudioV2Models}
      getDefaultModels={getDefaultDesignStudioV2ModelMap}
    />
  )
}

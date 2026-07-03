import type { ElementType } from 'react'
import {
  Compass,
  FileText,
  ImagePlus,
  LayoutTemplate,
  MessageCircleQuestion,
  PackageCheck,
  Palette,
  Route,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import {
  DESIGN_STUDIO_AGENT_DEFS,
  getDefaultDesignStudioModelMap,
  loadDesignStudioModels,
  resetDesignStudioModels,
  saveDesignStudioModels,
} from '../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from './AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  compass: Compass,
  'file-text': FileText,
  'image-plus': ImagePlus,
  'layout-template': LayoutTemplate,
  'message-circle-question': MessageCircleQuestion,
  'package-check': PackageCheck,
  palette: Palette,
  route: Route,
  'scan-search': ScanSearch,
  'shield-check': ShieldCheck,
  sparkles: Sparkles,
}

export default function DesignStudioConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Design Studio..."
      sections={[
        {
          id: 'design-studio',
          title: 'Design Studio',
          titleIcon: Palette,
          subtitle: `${DESIGN_STUDIO_AGENT_DEFS.length} agentes · briefing, UX, conteúdo, visual, imagens, código e empacotamento`,
          agents: DESIGN_STUDIO_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.purple,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.purple.infoBox}`}>
              <p>
                <strong>Modelo orquestrador:</strong> o <strong>Orquestrador</strong> avalia o briefing inteiro, decide
                perguntas de esclarecimento e escolhe quais especialistas executam. Os agentes geram slides, sites, apps,
                wireframes, documentos e animações e alimentam a exportação (HTML, template JSON e Markdown) e a aplicação
                em repositório.
              </p>
              <p className="mt-2">
                <strong>Catálogo pessoal:</strong> os seletores só exibem modelos do catálogo pessoal do usuário com
                capability compatível. Os agentes de texto exigem <strong>texto</strong>; o <strong>Gerador de Imagens</strong>
                exige <strong>imagem</strong>, então apenas modelos capazes ficam habilitados para cada função.
              </p>
              <p className="mt-2">
                <strong>Modelo multimodal padrão:</strong> o <strong>Gerador de Imagens</strong> inicia com
                <strong> google/gemini-2.5-flash-image</strong> (provider Google no catálogo OpenRouter).
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadDesignStudioModels}
      saveModels={saveDesignStudioModels}
      resetModels={resetDesignStudioModels}
      getDefaultModels={getDefaultDesignStudioModelMap}
    />
  )
}

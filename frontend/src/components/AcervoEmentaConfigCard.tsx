import type { ElementType } from 'react'
import { Brain, FileText, Search } from 'lucide-react'
import {
  ACERVO_EMENTA_AGENT_DEFS,
  getDefaultAcervoEmentaModelMap,
  loadAcervoEmentaModels,
  resetAcervoEmentaModels,
  saveAcervoEmentaModels,
} from '../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from './AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  'search': Search,
  'brain': Brain,
  'file-text': FileText,
}

export default function AcervoEmentaConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Gerador de Ementa..."
      sections={[
        {
          id: 'acervo-summary',
          title: 'Agente Gerador de Ementa',
          titleIcon: FileText,
          subtitle: '1 agente · acionado na indexação do acervo',
          agents: ACERVO_EMENTA_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.blue,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.blue.infoBox}`}>
              <p>
                <strong>📄 Sobre este agente:</strong> O Gerador de Ementa analisa documentos do acervo e
                produz ementas estruturadas com keywords para indexação e busca semântica. Um modelo{' '}
                <strong>rápido</strong> é recomendado por ser eficiente e econômico para esta tarefa de
                sumarização estruturada. Modelos <strong>✦ Grátis</strong> são uma ótima opção para reduzir
                custos.
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadAcervoEmentaModels}
      saveModels={saveAcervoEmentaModels}
      resetModels={resetAcervoEmentaModels}
      getDefaultModels={getDefaultAcervoEmentaModelMap}
    />
  )
}

import type { ElementType } from 'react'
import { Brain, Search, Tags } from 'lucide-react'
import {
  ACERVO_CLASSIFICADOR_AGENT_DEFS,
  getDefaultAcervoClassificadorModelMap,
  loadAcervoClassificadorModels,
  resetAcervoClassificadorModels,
  saveAcervoClassificadorModels,
} from '../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from './AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  'search': Search,
  'brain': Brain,
  'tag': Tags,
}

export default function AcervoClassificadorConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Classificador de Acervo..."
      sections={[
        {
          id: 'acervo-classifier',
          title: 'Agente Classificador',
          titleIcon: Tags,
          subtitle: '1 agente · acionado pelo usuário',
          agents: ACERVO_CLASSIFICADOR_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.teal,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.teal.infoBox}`}>
              <p>
                <strong>🏷️ Sobre este agente:</strong> O Classificador de Acervo analisa documentos e gera
                tags de classificação (natureza, área do direito, assuntos e contexto). Um modelo{' '}
                <strong>rápido</strong> é recomendado por ser eficiente e econômico para esta tarefa de
                classificação estruturada. Modelos <strong>✦ Grátis</strong> são uma ótima opção para
                reduzir custos.
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadAcervoClassificadorModels}
      saveModels={saveAcervoClassificadorModels}
      resetModels={resetAcervoClassificadorModels}
      getDefaultModels={getDefaultAcervoClassificadorModelMap}
    />
  )
}

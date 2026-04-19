import type { ElementType } from 'react'
import { Brain, MessageCircleQuestion, Search } from 'lucide-react'
import {
  CONTEXT_DETAIL_AGENT_DEFS,
  getDefaultContextDetailModelMap,
  loadContextDetailModels,
  resetContextDetailModels,
  saveContextDetailModels,
} from '../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from './AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  'search': Search,
  'brain': Brain,
}

export default function ContextDetailConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Detalhamento de Contexto..."
      sections={[
        {
          id: 'context-detail',
          title: 'Agente de Detalhamento',
          titleIcon: MessageCircleQuestion,
          subtitle: '1 agente · acionado pelo usuário',
          agents: CONTEXT_DETAIL_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.purple,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.purple.infoBox}`}>
              <p>
                <strong>💡 Sobre este agente:</strong> O agente de Detalhamento de Contexto analisa a
                solicitação do usuário e gera perguntas direcionadas para refinar o documento. Um modelo{' '}
                <strong>equilibrado ou premium</strong> é recomendado para gerar perguntas mais pertinentes e
                abrangentes. Modelos <strong>✦ Grátis</strong> são uma ótima opção para reduzir custos.
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadContextDetailModels}
      saveModels={saveContextDetailModels}
      resetModels={resetContextDetailModels}
      getDefaultModels={getDefaultContextDetailModelMap}
    />
  )
}

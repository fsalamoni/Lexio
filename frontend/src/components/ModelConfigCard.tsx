import type { ElementType } from 'react'
import {
  BookOpen,
  ClipboardCheck,
  FileText,
  RefreshCw,
  Scale,
  Search,
  Shield,
  Sparkles,
} from 'lucide-react'
import {
  PIPELINE_AGENT_DEFS,
  getDefaultModelMap,
  loadAgentModels,
  resetAgentModels,
  saveAgentModels,
} from '../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from './AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  'search': Search,
  'book-open': BookOpen,
  'scale': Scale,
  'shield': Shield,
  'refresh-cw': RefreshCw,
  'clipboard-check': ClipboardCheck,
  'file-text': FileText,
}

export default function ModelConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração de modelos..."
      sections={[
        {
          id: 'document-generation',
          title: 'Fluxo do Pipeline de Geração',
          titleIcon: Sparkles,
          subtitle: `${PIPELINE_AGENT_DEFS.length} agentes · execução sequencial`,
          agents: PIPELINE_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.brand,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.brand.infoBox}`}>
              <p>
                <strong>💡 Recomendação:</strong> Use modelos <strong>rápidos</strong> (Haiku, Flash, Mini)
                para Triagem e Fact-Checker (tarefas de extração/verificação). Use modelos{' '}
                <strong>equilibrados ou premium</strong> (Sonnet, GPT-4o, Gemini Pro) para os demais
                agentes que exigem raciocínio jurídico elaborado. Modelos <strong>✦ Grátis</strong> são uma
                ótima opção para reduzir custos.
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadAgentModels}
      saveModels={saveAgentModels}
      resetModels={resetAgentModels}
      getDefaultModels={getDefaultModelMap}
    />
  )
}

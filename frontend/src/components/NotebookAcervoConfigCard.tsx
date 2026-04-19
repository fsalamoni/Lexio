import type { ElementType } from 'react'
import {
  BookOpen,
  Brain,
  ClipboardCheck,
  Database,
  Scale,
  Search,
} from 'lucide-react'
import {
  NOTEBOOK_ACERVO_AGENT_DEFS,
  getDefaultNotebookAcervoModelMap,
  loadNotebookAcervoModels,
  resetNotebookAcervoModels,
  saveNotebookAcervoModels,
} from '../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from './AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  'search': Search,
  'library': BookOpen,
  'scale': Scale,
  'clipboard-check': ClipboardCheck,
  'brain': Brain,
}

export default function NotebookAcervoConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Analisador de Acervo..."
      sections={[
        {
          id: 'notebook-acervo',
          title: 'Pipeline de Análise de Acervo',
          titleIcon: Database,
          subtitle: '4 agentes · análise e curadoria',
          agents: NOTEBOOK_ACERVO_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.emerald,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.emerald.infoBox}`}>
              <p>
                <strong>💡 Recomendação:</strong> O <strong>Triagem</strong> e <strong>Buscador</strong>
                podem usar modelos rápidos (Haiku, Flash). O <strong>Analista</strong> e <strong>Curador</strong>
                exigem modelos com raciocínio profundo; use modelos <strong>equilibrados ou premium</strong>
                para resultados melhores. Modelos <strong>✦ Grátis</strong> são uma ótima opção para
                reduzir custos.
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadNotebookAcervoModels}
      saveModels={saveNotebookAcervoModels}
      resetModels={resetNotebookAcervoModels}
      getDefaultModels={getDefaultNotebookAcervoModelMap}
    />
  )
}

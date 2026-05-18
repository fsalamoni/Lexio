import type { ElementType } from 'react'
import {
  BookOpen,
  Brain,
  ClipboardCheck,
  FlaskConical,
  RefreshCw,
  Scale,
} from 'lucide-react'
import {
  THESIS_ANALYST_AGENT_DEFS,
  getDefaultThesisAnalystModelMap,
  loadThesisAnalystModels,
  resetThesisAnalystModels,
  saveThesisAnalystModels,
} from '../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from './AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  'scale': Scale,
  'refresh-cw': RefreshCw,
  'book-open': BookOpen,
  'clipboard-check': ClipboardCheck,
  'brain': Brain,
}

export default function ThesisAnalystConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Analista de Teses..."
      sections={[
        {
          id: 'thesis-analyst',
          title: 'Pipeline de Análise de Teses',
          titleIcon: FlaskConical,
          subtitle: '4 agentes LLM · inventário local · trilhas paralelas',
          agents: THESIS_ANALYST_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.teal,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.teal.infoBox}`}>
              <p>
                <strong>💡 Recomendação:</strong> O inventário inicial agora é local e resiliente. Use um modelo
                forte no <strong>Analista</strong> para validar os grupos detectados; o <strong>Compilador</strong>,
                o <strong>Curador</strong> e o <strong>Revisor</strong> se beneficiam de modelos equilibrados ou
                premium, pois consolidam, expandem e validam as sugestões finais. Modelos
                <strong> ✦ Grátis</strong> continuam úteis para reduzir custos.
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadThesisAnalystModels}
      saveModels={saveThesisAnalystModels}
      resetModels={resetThesisAnalystModels}
      getDefaultModels={getDefaultThesisAnalystModelMap}
    />
  )
}

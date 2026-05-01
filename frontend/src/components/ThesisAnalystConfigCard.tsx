import type { ElementType } from 'react'
import {
  BookOpen,
  Brain,
  ClipboardCheck,
  FlaskConical,
  RefreshCw,
  Scale,
  Search,
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
  'search': Search,
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
          subtitle: '5 agentes · trilhas paralelas · acionado manualmente',
          agents: THESIS_ANALYST_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.teal,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.teal.infoBox}`}>
              <p>
                <strong>💡 Recomendação:</strong> O <strong>Catalogador</strong> e o <strong>Curador</strong> iniciam
                trilhas paralelas para reduzir latência. O Catalogador pode usar um modelo rápido (Haiku,
                Flash); o <strong>Compilador</strong> e o <strong>Revisor</strong> se beneficiam de modelos
                equilibrados ou premium, pois consolidam e validam as sugestões finais. Modelos
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

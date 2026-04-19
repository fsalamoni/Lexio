import type { ElementType } from 'react'
import {
  BarChart2,
  BookOpen,
  Brain,
  ClipboardCheck,
  FileText,
  Image,
  MessageCircle,
  Mic,
  PenTool,
  Search,
} from 'lucide-react'
import {
  RESEARCH_NOTEBOOK_AGENT_DEFS,
  getDefaultResearchNotebookModelMap,
  loadResearchNotebookModels,
  resetResearchNotebookModels,
  saveResearchNotebookModels,
} from '../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from './AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  'search': Search,
  'brain': Brain,
  'message-circle': MessageCircle,
  'file-text': FileText,
  'mic': Mic,
  'pen-tool': PenTool,
  'image': Image,
  'clipboard-check': ClipboardCheck,
  'bar-chart-2': BarChart2,
}

const STUDIO_AGENT_KEYS = new Set([
  'studio_pesquisador',
  'studio_escritor',
  'studio_roteirista',
  'studio_visual',
  'studio_revisor',
])

const RESEARCH_AGENTS = RESEARCH_NOTEBOOK_AGENT_DEFS.filter(agent => !STUDIO_AGENT_KEYS.has(agent.key))
const STUDIO_AGENTS = RESEARCH_NOTEBOOK_AGENT_DEFS.filter(agent => STUDIO_AGENT_KEYS.has(agent.key))

export default function ResearchNotebookConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Caderno de Pesquisa..."
      sections={[
        {
          id: 'research-analysis',
          title: 'Pesquisa & Análise',
          titleIcon: BookOpen,
          subtitle: `${RESEARCH_AGENTS.length} agentes`,
          agents: RESEARCH_AGENTS,
          tone: V2_AGENT_CONFIG_TONES.indigo,
          beforeContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.indigo.infoBox}`}>
              <p>
                <strong>🔎 Pesquisadores de Fontes:</strong> além do assistente padrão, o caderno pode usar
                <strong> Pesquisa Externa</strong>, <strong>Pesquisa Externa Profunda</strong> e
                <strong> Pesquisa de Jurisprudência (DataJud)</strong> para criar novas fontes automaticamente.
              </p>
            </div>
          ),
        },
        {
          id: 'research-studio',
          title: 'Estúdio de Criação',
          titleIcon: PenTool,
          subtitle: `${STUDIO_AGENTS.length} agentes · pipeline multi-agente`,
          agents: STUDIO_AGENTS,
          tone: V2_AGENT_CONFIG_TONES.purple,
          beforeContent: (
            <>
              <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.purple.infoBox}`}>
                <p>
                  <strong>🎨 Pipeline do Estúdio:</strong> Cada artefato passa por 3 etapas: <strong>Pesquisador</strong>{' '}
                  extrai dados relevantes, <strong>Especialista</strong> (Escritor, Roteirista ou Designer)
                  cria o conteúdo, e <strong>Revisor</strong> aprimora e garante qualidade de nível superior.
                </p>
              </div>
              <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.indigo.infoBox}`}>
                <p>
                  <strong>🖼️ Saída visual real:</strong> quando o estúdio produz <strong>infográficos</strong>,
                  <strong> mapas mentais</strong> ou <strong>tabelas de dados</strong>, o notebook executa uma
                  etapa automática de <strong>renderização final em imagem</strong> depois da revisão, persiste
                  o PNG no notebook e registra a operação no demonstrativo de execuções/custos.
                </p>
              </div>
            </>
          ),
        },
      ]}
      afterSections={
        <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.indigo.infoBox}`}>
          <p>
            <strong>📖 Sobre estes agentes:</strong> O Caderno de Pesquisa conta com {RESEARCH_NOTEBOOK_AGENT_DEFS.length}{' '}
            agentes especializados em dois grupos. <strong>Pesquisa & Análise</strong>: Pesquisador indexa
            fontes, Analista sintetiza descobertas, Assistente responde perguntas. <strong>Estúdio de Criação</strong>:{' '}
            pipeline de 3 etapas (pesquisa, criação especializada e revisão de qualidade) para cada artefato.
            Escritor redige textos, Roteirista cria scripts de áudio e vídeo, Designer Visual estrutura
            apresentações e infográficos, e a etapa automática de mídia transforma os artefatos visuais em
            imagens persistidas. Modelos <strong>✦ Grátis</strong> são uma ótima opção para testes e redução
            de custos.
          </p>
        </div>
      }
      agentIcons={AGENT_ICONS}
      loadModels={loadResearchNotebookModels}
      saveModels={saveResearchNotebookModels}
      resetModels={resetResearchNotebookModels}
      getDefaultModels={getDefaultResearchNotebookModelMap}
    />
  )
}

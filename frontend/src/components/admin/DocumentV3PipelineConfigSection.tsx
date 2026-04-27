import { type ElementType } from 'react'
import {
  BookOpen,
  ClipboardCheck,
  FileText,
  Gavel,
  Layers,
  Library,
  PenTool,
  RefreshCw,
  Scale,
  Search,
  Shield,
} from 'lucide-react'
import {
  DOCUMENT_V3_PIPELINE_AGENT_DEFS,
  getDefaultDocumentV3ModelMap,
  loadDocumentV3Models,
  resetDocumentV3Models,
  saveDocumentV3Models,
} from '../../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from '../AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  'search': Search,
  'clipboard-check': ClipboardCheck,
  'scale': Scale,
  'layers': Layers,
  'library': Library,
  'shield': Shield,
  'refresh-cw': RefreshCw,
  'book-open': BookOpen,
  'gavel': Gavel,
  'pen-tool': PenTool,
  'file-text': FileText,
}

export default function DocumentV3PipelineConfigSection() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Pipeline v3..."
      sections={[
        {
          id: 'document-v3-pipeline',
          title: 'Pipeline de Documentos v3 (4 fases)',
          titleIcon: Layers,
          subtitle: `${DOCUMENT_V3_PIPELINE_AGENT_DEFS.length} agentes configuráveis · supervisor coordena fases paralelas`,
          agents: DOCUMENT_V3_PIPELINE_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.teal,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.teal.infoBox}`}>
              <p>
                <strong>💡 Pipeline v3:</strong> orquestrador supervisor coordena 4 fases —
                <strong> Compreensão</strong>, <strong>Análise</strong>, <strong>Pesquisa</strong> e
                <strong> Redação</strong>. Diversos agentes rodam em <strong>paralelo</strong> dentro
                de cada fase para reduzir latência. O supervisor pode disparar <em>retry</em> e escalar
                para um modelo mais robusto quando a saída não passar nas validações. O resultado é
                persistido na <strong>mesma coleção</strong> de documentos, com o mesmo schema, então
                a página <code>/documents</code> continua funcionando sem alterações.
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadDocumentV3Models}
      saveModels={saveDocumentV3Models}
      resetModels={resetDocumentV3Models}
      getDefaultModels={getDefaultDocumentV3ModelMap}
    />
  )
}

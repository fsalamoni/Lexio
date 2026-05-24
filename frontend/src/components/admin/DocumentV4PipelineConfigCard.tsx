import { type ElementType } from 'react'
import { Layers, PenTool, Shield } from 'lucide-react'
import {
  DOCUMENT_V4_PIPELINE_AGENT_DEFS,
  getDefaultDocumentV4ModelMap,
  loadDocumentV4Models,
  resetDocumentV4Models,
  saveDocumentV4Models,
} from '../../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_TONES,
} from '../AgentModelConfigCard'

const AGENT_ICONS: Record<string, ElementType> = {
  'pen-tool': PenTool,
  'shield': Shield,
}

export default function DocumentV4PipelineConfigCard() {
  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Pipeline v4..."
      sections={[
        {
          id: 'document-v4-pipeline',
          title: 'Pipeline de Documentos v4 (agente único + ferramentas)',
          titleIcon: Layers,
          subtitle: `${DOCUMENT_V4_PIPELINE_AGENT_DEFS.length} modelos configuráveis · 1 agente principal + 1 crítico opcional`,
          agents: DOCUMENT_V4_PIPELINE_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.teal,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.teal.infoBox}`}>
              <p>
                <strong>💡 Pipeline v4:</strong> arquitetura <strong>agente único + ferramentas</strong> —
                um modelo reasoning-tier (Opus/Sonnet 4/o3) executa todo o raciocínio jurídico e decide
                quando chamar ferramentas (buscar acervo, jurisprudência, web, verificar citações…). O
                crítico é opcional e roda <strong>uma única vez</strong> sobre o rascunho final
                (padrão <em>evaluator-optimizer</em>); se o score for menor que 75/100, uma rodada de
                revisão é disparada. Configure as ferramentas no cartão abaixo.
              </p>
            </div>
          ),
        },
      ]}
      agentIcons={AGENT_ICONS}
      loadModels={loadDocumentV4Models}
      saveModels={saveDocumentV4Models}
      resetModels={resetDocumentV4Models}
      getDefaultModels={getDefaultDocumentV4ModelMap}
    />
  )
}

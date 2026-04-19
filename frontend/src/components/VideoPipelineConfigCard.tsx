import { useState, type ElementType } from 'react'
import {
  ClipboardCheck,
  FileText,
  Image,
  Layers,
  Mic,
  Music,
  PenTool,
  RefreshCw,
  Video,
} from 'lucide-react'
import {
  VIDEO_PIPELINE_AGENT_DEFS,
  getDefaultVideoPipelineModelMap,
  loadVideoPipelineModels,
  resetVideoPipelineModels,
  saveVideoPipelineModels,
} from '../lib/model-config'
import AgentModelConfigCard, {
  V2_AGENT_CONFIG_INFO_BOX_BASE,
  V2_AGENT_CONFIG_PANEL_BASE,
  V2_AGENT_CONFIG_TONES,
} from './AgentModelConfigCard'
import {
  checkExternalVideoProviderHealth,
  getExternalVideoProviderDiagnostics,
  type ExternalVideoProviderHealthCheckResult,
} from '../lib/external-video-provider'

const AGENT_ICONS: Record<string, ElementType> = {
  'clipboard-check': ClipboardCheck,
  'file-text':       FileText,
  'layers':          Layers,
  'pen-tool':        PenTool,
  'image':           Image,
  'image-plus':      Image,
  'video':           Video,
  'film':            Video,
  'mic':             Mic,
  'volume-2':        Mic,
  'music':           Music,
}

export default function VideoPipelineConfigCard() {
  const [providerCheckLoading, setProviderCheckLoading] = useState(false)
  const [providerHealth, setProviderHealth] = useState<ExternalVideoProviderHealthCheckResult | null>(null)

  const providerDiagnostics = getExternalVideoProviderDiagnostics()

  const handleCheckProviderHealth = async () => {
    setProviderCheckLoading(true)
    try {
      const result = await checkExternalVideoProviderHealth()
      setProviderHealth(result)
    } finally {
      setProviderCheckLoading(false)
    }
  }

  return (
    <AgentModelConfigCard
      loadingMessage="Carregando configuração do Gerador de Vídeo..."
      sections={[
        {
          id: 'video-pipeline',
          title: 'Trilha Multiagente de Vídeo',
          titleIcon: Video,
          subtitle: `${VIDEO_PIPELINE_AGENT_DEFS.length} agentes configuráveis · criação de vídeo profissional`,
          agents: VIDEO_PIPELINE_AGENT_DEFS,
          tone: V2_AGENT_CONFIG_TONES.rose,
          showIndex: true,
          afterContent: (
            <div className={`${V2_AGENT_CONFIG_INFO_BOX_BASE} ${V2_AGENT_CONFIG_TONES.rose.infoBox}`}>
              <p>
                <strong>💡 Informações:</strong> O pipeline suporta vídeos de <strong>15+ minutos</strong>,
                dividindo inteligentemente em segmentos. Esta configuração já cobre o planejamento textual,
                o <strong>planejador de clips</strong>, o <strong>gerador de imagens</strong> e o <strong>TTS</strong>.
                A geração de clipes e o render final acontecem na etapa literal dedicada, usando o provedor
                externo configurado ou o fallback local do navegador. O <strong>Planejador</strong> estima
                custos em tokens antes de iniciar a produção.
              </p>
            </div>
          ),
        },
      ]}
      afterSections={
        <>
          <div className={`${V2_AGENT_CONFIG_PANEL_BASE} leading-6`}>
            <p>
              <strong>Etapas literais de vídeo:</strong> depois dos agentes configuráveis, o sistema executa
              <strong> geração de clipes por partes</strong>, <strong>trilha sonora</strong> e{' '}
              <strong>renderização final</strong>, com rastreamento nas fases{' '}
              <strong>media_video_clip_generation</strong>, <strong>media_soundtrack_generation</strong> e{' '}
              <strong>media_video_render</strong>.
            </p>
          </div>

          <div className={`${V2_AGENT_CONFIG_PANEL_BASE} space-y-2 text-[11px] leading-5`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-[var(--v2-ink-strong)]">Saúde do Provedor Externo de Vídeo</p>
              <button
                type="button"
                onClick={handleCheckProviderHealth}
                disabled={providerCheckLoading}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.88)] px-3 py-1.5 text-xs font-semibold text-[var(--v2-ink-strong)] transition-colors hover:bg-white disabled:opacity-50"
              >
                {providerCheckLoading ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Testando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Testar conexão
                  </>
                )}
              </button>
            </div>

            <p className="text-[var(--v2-ink-soft)]">
              Provedor: <strong>{providerDiagnostics.provider}</strong> · Configurado:{' '}
              <strong>{providerDiagnostics.configured ? 'sim' : 'não'}</strong>
            </p>
            <p className="break-all text-[var(--v2-ink-faint)]">
              Endpoint: {providerDiagnostics.endpoint || 'não definido'}
            </p>
            <p className="text-[var(--v2-ink-faint)]">
              Poll: {providerDiagnostics.pollIntervalMs}ms · Timeout: {Math.round(providerDiagnostics.pollTimeoutMs / 1000)}s
            </p>

            {providerHealth ? (
              <p className={providerHealth.ok ? 'text-emerald-700' : 'text-amber-700'}>
                {providerHealth.ok ? 'OK' : 'Atenção'} · {providerHealth.message}
                {providerHealth.statusCode ? ` (HTTP ${providerHealth.statusCode})` : ''}
                {providerHealth.latencyMs ? ` · ${providerHealth.latencyMs}ms` : ''}
              </p>
            ) : null}

            {providerDiagnostics.blockingErrors.length > 0 ? (
              <div className="rounded-[0.9rem] border border-red-200 bg-[rgba(254,226,226,0.72)] p-2">
                {providerDiagnostics.blockingErrors.map(item => (
                  <p key={item} className="text-red-700">- {item}</p>
                ))}
              </div>
            ) : null}

            {providerDiagnostics.warnings.length > 0 ? (
              <div className="rounded-[0.9rem] border border-amber-200 bg-[rgba(254,243,199,0.72)] p-2">
                {providerDiagnostics.warnings.map(item => (
                  <p key={item} className="text-amber-700">- {item}</p>
                ))}
              </div>
            ) : null}
          </div>
        </>
      }
      agentIcons={AGENT_ICONS}
      loadModels={loadVideoPipelineModels}
      saveModels={saveVideoPipelineModels}
      resetModels={resetVideoPipelineModels}
      getDefaultModels={getDefaultVideoPipelineModelMap}
    />
  )
}

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
                dividindo inteligentemente em segmentos. O <strong>Gerador de Clipes de Vídeo</strong> produz
                <strong> vídeo real por IA</strong> para cada parte das cenas e encadeia cada clipe ao último
                quadro do anterior (image-to-video), mantendo continuidade visual entre as partes. O{' '}
                <strong>Planejador</strong> estima custos antes de iniciar a produção.
              </p>
              <p className="mt-2">
                <strong>Como ativar o vídeo real (recomendado):</strong> escolha um modelo de vídeo do provedor{' '}
                <strong>fal.ai</strong> (Veo 3, Kling 2.5, Wan 2.2, Hailuo 02, LTX Video) no agente{' '}
                <strong>Gerador de Clipes de Vídeo</strong> e salve sua chave fal.ai em{' '}
                <strong>Configurações → Provedores de IA</strong> — sem variáveis de ambiente. Sem essa
                configuração, a geração de clipes recai, nesta ordem, no provedor externo por variáveis de
                ambiente e depois no renderer local do navegador.
              </p>
              <p className="mt-2">
                <strong>Defaults multimodais:</strong> o <strong>Gerador de Imagens</strong> parte de <strong>google/gemini-2.5-flash-image</strong>
                (provider Google no catalogo OpenRouter) e o <strong>Narrador / TTS</strong> parte de <strong>openai/tts-1-hd</strong>
                (provider OpenAI no catalogo OpenRouter). Ambos ficam restritos a modelos do catalogo pessoal com capability compativel.
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
            <p className="mt-2">
              <strong>Fallback de 3 níveis para os clipes:</strong> (1) vídeo real fal.ai com a sua chave —
              caminho recomendado, configurado no agente <strong>Gerador de Clipes de Vídeo</strong>; (2)
              provedor externo por variáveis de ambiente; (3) renderer local do navegador. A geração nunca
              é interrompida — se um nível falha, o próximo assume.
            </p>
          </div>

          <div className={`${V2_AGENT_CONFIG_PANEL_BASE} space-y-2 text-[11px] leading-5`}>
            <p className="text-xs font-semibold text-[var(--v2-ink-strong)]">Provedores e modelos de vídeo suportados (todos)</p>
            <div className="space-y-1.5 text-[var(--v2-ink-soft)]">
              <p>
                <strong>1. fal.ai nativo</strong> — recomendado, usa <strong>sua</strong> chave (sem variáveis de ambiente).
                Salve a chave em <strong>Configurações → Provedores de IA</strong> (provedor “fal.ai (Vídeo)”) e escolha o
                modelo no agente <strong>Gerador de Clipes de Vídeo</strong>. Base padrão <code>https://queue.fal.run</code>.
                Modelos validados:
              </p>
              <ul className="ml-3 list-disc space-y-0.5 text-[var(--v2-ink-faint)]">
                <li><code>fal-ai/veo3</code> · <code>fal-ai/veo3/fast</code> — Google Veo 3 / Veo 3 Fast</li>
                <li><code>fal-ai/kling-video/v2.5-turbo/pro/text-to-video</code> — Kling 2.5 Turbo Pro</li>
                <li><code>fal-ai/wan/v2.2-a14b/text-to-video</code> — Wan 2.2 A14B</li>
                <li><code>fal-ai/minimax/hailuo-02/standard/text-to-video</code> — MiniMax Hailuo 02</li>
                <li><code>fal-ai/ltx-video-13b-distilled</code> — LTX-Video 13B</li>
              </ul>
              <p className="text-[var(--v2-ink-faint)]">
                Qualquer outra rota de vídeo da fal.ai também funciona; as variantes <em>image-to-video</em> são resolvidas
                automaticamente para encadear clipes com continuidade visual.
              </p>
              <p>
                <strong>2. Provedor externo por env</strong> — um endpoint HTTP que você controla pode intermediar{' '}
                <strong>qualquer</strong> provedor (Google Veo, Replicate, Runway, Pika, fal.ai como agregador, …). O valor
                de <code>VITE_EXTERNAL_VIDEO_PROVIDER</code> é apenas um rótulo, enviado no header{' '}
                <code>X-Lexio-Video-Provider</code> e no corpo. As variáveis estão logo abaixo, em “Saúde do Provedor”.
              </p>
              <p>
                <strong>3. Renderer local do navegador</strong> — fallback final, sem IA de vídeo real: compõe um vídeo a
                partir de imagens/slides localmente quando nenhum provedor está configurado.
              </p>
            </div>
            <p className="text-[var(--v2-ink-faint)]">
              <strong>Onde é usado:</strong> (a) este pipeline de vídeo (11 agentes); (b) a skill <code>generate_video</code>{' '}
              do Chat; (c) o <strong>roteiro de vídeo do Caderno</strong> (Estúdio), que renderiza e persiste o MP4 quando a
              flag <strong>FF_NOTEBOOK_STUDIO_VIDEO</strong> está ligada (Configurações → Recursos beta), com a{' '}
              <strong>mesma resolução do Chat</strong>: fal.ai com a sua chave (usando o modelo do agente{' '}
              <strong>Gerador de Clipes de Vídeo</strong>) e, na ausência dela, o provedor externo por env. O consumo é
              registrado em Usos e Custos e na Administração da plataforma (fase <strong>media_video_render</strong>, com o
              preço do provedor quando ele o retorna).
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
            <div className="rounded-[0.9rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.58)] p-2 text-[11px] leading-5 text-[var(--v2-ink-soft)]">
              <p className="mb-1 text-[var(--v2-ink-faint)]">
                Fallback opcional (nível 2). O caminho recomendado é o provedor <strong>fal.ai</strong> com a sua
                chave no agente <strong>Gerador de Clipes de Vídeo</strong> — não exige nenhuma variável de ambiente.
              </p>
              <p><strong>Env vars esperadas:</strong> VITE_EXTERNAL_VIDEO_PROVIDER, VITE_EXTERNAL_VIDEO_PROVIDER_ENDPOINT, VITE_EXTERNAL_VIDEO_PROVIDER_API_KEY, VITE_EXTERNAL_VIDEO_PROVIDER_STATUS_ENDPOINT, VITE_EXTERNAL_VIDEO_PROVIDER_POLL_INTERVAL_MS (padrão 4000), VITE_EXTERNAL_VIDEO_PROVIDER_TIMEOUT_MS (padrão 180000). Aliases legados ainda aceitos: VITE_LITERAL_VIDEO_PROVIDER, _ENDPOINT, _API_KEY, _STATUS_ENDPOINT, _POLL_INTERVAL_MS, _POLL_TIMEOUT_MS.</p>
              <p className="mt-1"><strong>Contrato do endpoint:</strong> POST JSON com prompt, duration_seconds, aspect_ratio, scene_number, part_number e provider; responda com url/video_url/output_url ou com job_id/poll_url para polling posterior.</p>
            </div>

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

import type { ModelCapability } from './model-config'

export interface MediaCapabilityGuidanceEntry {
  providerLabel: string
  models: string[]
  detail?: string
}

export interface MediaCapabilityGuidance {
  capability: ModelCapability
  summary: string
  routeHint: string
  steps: string[]
  recommendedModels: MediaCapabilityGuidanceEntry[]
  envVars?: string[]
  endpointContractHint?: string
}

const MEDIA_CAPABILITY_GUIDANCE: Partial<Record<ModelCapability, MediaCapabilityGuidance>> = {
  image: {
    capability: 'image',
    summary: 'Nenhum modelo com capacidade real de imagem esta disponivel no catalogo pessoal deste usuario.',
    routeHint: 'Configuracoes -> Provedores de IA -> Catalogos por Provedor -> Catalogo de Modelos.',
    steps: [
      'Habilite um provedor com suporte a imagem e configure a API key do usuario.',
      'Adicione ao catalogo pessoal pelo menos um modelo com capability de imagem.',
      'Salve o catalogo e volte ao agente para selecionar o modelo compativel.',
    ],
    recommendedModels: [
      {
        providerLabel: 'OpenAI direto',
        models: ['gpt-image-1'],
        detail: 'Geracao nativa de imagens no provider OpenAI.',
      },
      {
        providerLabel: 'OpenRouter',
        models: ['google/gemini-2.5-flash-image', 'google/gemini-3.1-flash-image-preview'],
        detail: 'Entrada roteada pelo OpenRouter com provider final Google ou OpenAI.',
      },
    ],
  },
  audio: {
    capability: 'audio',
    summary: 'Nenhum modelo com capacidade real de audio/TTS esta disponivel no catalogo pessoal deste usuario.',
    routeHint: 'Configuracoes -> Provedores de IA -> Catalogos por Provedor -> Catalogo de Modelos.',
    steps: [
      'Habilite um provedor com suporte a TTS e configure a API key do usuario.',
      'Adicione ao catalogo pessoal pelo menos um modelo com capability de audio.',
      'Salve o catalogo e volte ao agente para selecionar o narrador compatível.',
    ],
    recommendedModels: [
      {
        providerLabel: 'OpenAI direto',
        models: ['tts-1-hd', 'tts-1'],
        detail: 'TTS nativo da OpenAI para narracao e locucao.',
      },
      {
        providerLabel: 'OpenRouter',
        models: ['openai/tts-1-hd', 'openai/tts-1'],
        detail: 'Entrada roteada pelo OpenRouter com provider final OpenAI.',
      },
    ],
  },
  video: {
    capability: 'video',
    summary: 'Clipes de video nao usam seletor de modelo; a materializacao depende de um provedor externo conectado ao frontend.',
    routeHint: 'Configure as variaveis de ambiente do build e valide o endpoint no card de saude do provedor externo.',
    steps: [
      'Defina o nome do provedor em VITE_EXTERNAL_VIDEO_PROVIDER e o endpoint em VITE_EXTERNAL_VIDEO_PROVIDER_ENDPOINT.',
      'Se o provedor exigir autenticacao, preencha VITE_EXTERNAL_VIDEO_PROVIDER_API_KEY e opcionalmente VITE_EXTERNAL_VIDEO_PROVIDER_STATUS_ENDPOINT.',
      'Se o provedor responder de forma assincrona, mantenha o endpoint de status retornando uma URL final do video quando o job terminar.',
    ],
    recommendedModels: [],
    envVars: [
      'VITE_EXTERNAL_VIDEO_PROVIDER',
      'VITE_EXTERNAL_VIDEO_PROVIDER_ENDPOINT',
      'VITE_EXTERNAL_VIDEO_PROVIDER_API_KEY',
      'VITE_EXTERNAL_VIDEO_PROVIDER_STATUS_ENDPOINT',
      'VITE_EXTERNAL_VIDEO_PROVIDER_POLL_INTERVAL_MS',
      'VITE_EXTERNAL_VIDEO_PROVIDER_TIMEOUT_MS',
    ],
    endpointContractHint: 'O endpoint deve aceitar POST JSON com prompt, duration_seconds, aspect_ratio, scene_number, part_number e provider; a resposta precisa devolver url/video_url/output_url imediatamente ou job_id/poll_url para polling posterior.',
  },
}

export function getMediaCapabilityGuidance(capability?: ModelCapability): MediaCapabilityGuidance | null {
  if (!capability) return null
  return MEDIA_CAPABILITY_GUIDANCE[capability] ?? null
}
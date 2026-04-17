/**
 * Humanizes raw error messages into user-friendly PT-BR explanations.
 * Centralizes error translation for consistent UX across the app.
 */

const ERROR_PATTERNS: Array<{ pattern: RegExp; message: string; suggestion?: string }> = [
  // Network errors
  { pattern: /network\s*error|ERR_NETWORK|fetch\s*failed/i, message: 'Erro de conexão com o servidor', suggestion: 'Verifique sua conexão com a internet e tente novamente.' },
  { pattern: /timeout|ETIMEDOUT|ECONNABORTED/i, message: 'A operação demorou demais', suggestion: 'O servidor não respondeu a tempo. Tente novamente em alguns instantes.' },
  { pattern: /ECONNREFUSED/i, message: 'Servidor indisponível', suggestion: 'O serviço está temporariamente fora do ar. Tente novamente em alguns minutos.' },

  // HTTP status errors
  { pattern: /401|unauthorized/i, message: 'Sessão expirada', suggestion: 'Faça login novamente para continuar.' },
  { pattern: /403|forbidden/i, message: 'Acesso negado', suggestion: 'Você não tem permissão para realizar esta ação.' },
  { pattern: /404|not\s*found/i, message: 'Recurso não encontrado', suggestion: 'O item solicitado pode ter sido removido ou movido.' },
  { pattern: /429|too\s*many\s*requests|rate\s*limit/i, message: 'Limite de requisições atingido', suggestion: 'Aguarde alguns segundos antes de tentar novamente.' },
  { pattern: /500|internal\s*server/i, message: 'Erro interno do servidor', suggestion: 'O problema é do nosso lado. Tente novamente em instantes.' },
  { pattern: /502|bad\s*gateway/i, message: 'Servidor temporariamente indisponível', suggestion: 'O serviço está sendo reiniciado. Tente em alguns segundos.' },
  { pattern: /503|service\s*unavailable/i, message: 'Serviço indisponível', suggestion: 'O servidor está sobrecarregado ou em manutenção.' },

  // LLM/API specific
  { pattern: /context.*length|token.*limit|max.*tokens/i, message: 'Texto muito longo para o modelo', suggestion: 'Reduza o tamanho da solicitação ou use um modelo com janela maior.' },
  { pattern: /quota|billing|insufficient.*funds/i, message: 'Créditos do provedor esgotados', suggestion: 'Verifique o saldo da sua chave de API nas configurações.' },
  { pattern: /invalid.*api.*key|authentication.*failed/i, message: 'Chave de API inválida', suggestion: 'Verifique suas chaves em Configurações > Chaves de API.' },
  { pattern: /model.*not.*found|model.*unavailable/i, message: 'Modelo indisponível', suggestion: 'O modelo selecionado pode ter sido descontinuado. Escolha outro em Configurações.' },
  { pattern: /content.*filter|safety|moderation/i, message: 'Conteúdo bloqueado pelo provedor', suggestion: 'Reformule sua solicitação para evitar filtros de segurança.' },

  // Firebase specific
  { pattern: /permission.*denied|PERMISSION_DENIED/i, message: 'Permissão negada', suggestion: 'Verifique se sua conta tem acesso a este recurso.' },
  { pattern: /quota.*exceeded|RESOURCE_EXHAUSTED/i, message: 'Limite de uso atingido', suggestion: 'O limite de operações foi alcançado. Tente novamente mais tarde.' },
  { pattern: /unavailable|UNAVAILABLE/i, message: 'Serviço temporariamente indisponível', suggestion: 'Tente novamente em alguns instantes.' },

  // Generic fallbacks
  { pattern: /aborted|cancelled|canceled/i, message: 'Operação cancelada', suggestion: 'A operação foi interrompida antes de completar.' },
  { pattern: /failed\s*to\s*fetch/i, message: 'Falha na comunicação', suggestion: 'Verifique sua conexão e tente novamente.' },
]

export interface HumanizedError {
  title: string
  detail?: string
}

/**
 * Translates a raw error (string, Error object, or API response) into
 * a user-friendly Portuguese message.
 */
export function humanizeError(error: unknown): HumanizedError {
  const raw = extractErrorString(error)

  for (const { pattern, message, suggestion } of ERROR_PATTERNS) {
    if (pattern.test(raw)) {
      return { title: message, detail: suggestion }
    }
  }

  // If no pattern matches, return a cleaned version
  const cleaned = raw.length > 150 ? raw.slice(0, 147) + '...' : raw
  return {
    title: 'Ocorreu um erro',
    detail: cleaned || 'Tente novamente. Se o problema persistir, entre em contato com o suporte.',
  }
}

function extractErrorString(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error === 'object') {
    const e = error as Record<string, unknown>
    // Axios-style response
    if (e.response && typeof e.response === 'object') {
      const resp = e.response as Record<string, unknown>
      if (resp.data && typeof resp.data === 'object') {
        const data = resp.data as Record<string, unknown>
        if (typeof data.detail === 'string') return data.detail
        if (typeof data.message === 'string') return data.message
        if (typeof data.error === 'string') return data.error
      }
      if (typeof resp.status === 'number') return `HTTP ${resp.status}`
    }
    if (typeof e.message === 'string') return e.message
    if (typeof e.code === 'string') return e.code
  }
  return String(error)
}

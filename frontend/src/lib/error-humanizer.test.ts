import { describe, it, expect } from 'vitest'
import { humanizeError } from './error-humanizer'

describe('error-humanizer', () => {
  it('handles network errors', () => {
    const result = humanizeError(new Error('Network Error'))
    expect(result.title).toBe('Erro de conexão com o servidor')
    expect(result.detail).toBeTruthy()
  })

  it('handles timeout errors', () => {
    const result = humanizeError(new Error('timeout of 30000ms exceeded'))
    expect(result.title).toBe('A operação demorou demais')
  })

  it('handles 429 rate limit', () => {
    const result = humanizeError({ response: { status: 429, data: { detail: 'Too Many Requests' } } })
    expect(result.title).toBe('Limite de requisições atingido')
  })

  it('handles 401 unauthorized', () => {
    const result = humanizeError(new Error('401 Unauthorized'))
    expect(result.title).toBe('Sessão expirada')
  })

  it('handles LLM context length errors', () => {
    const result = humanizeError(new Error("This model's maximum context length is 8192 tokens"))
    expect(result.title).toBe('Texto muito longo para o modelo')
  })

  it('handles invalid API key', () => {
    const result = humanizeError(new Error('Invalid API key provided'))
    expect(result.title).toBe('Chave de API inválida')
  })

  it('handles quota/billing errors', () => {
    const result = humanizeError(new Error('You have insufficient funds'))
    expect(result.title).toBe('Créditos do provedor esgotados')
  })

  it('handles Firebase permission denied', () => {
    const result = humanizeError({ code: 'PERMISSION_DENIED', message: 'Missing permissions' })
    expect(result.title).toBe('Permissão negada')
  })

  it('handles content filter errors', () => {
    const result = humanizeError(new Error('Content was flagged by safety filter'))
    expect(result.title).toBe('Conteúdo bloqueado pelo provedor')
  })

  it('handles null/undefined gracefully', () => {
    expect(humanizeError(null).title).toBe('Ocorreu um erro')
    expect(humanizeError(undefined).title).toBe('Ocorreu um erro')
  })

  it('handles plain string errors', () => {
    const result = humanizeError('Something went wrong')
    expect(result.title).toBe('Ocorreu um erro')
    expect(result.detail).toBe('Something went wrong')
  })

  it('truncates very long error messages', () => {
    const longMessage = 'x'.repeat(200)
    const result = humanizeError(new Error(longMessage))
    expect(result.detail!.length).toBeLessThanOrEqual(150)
    expect(result.detail).toContain('...')
  })

  it('extracts from axios-style response objects', () => {
    const result = humanizeError({
      response: { status: 500, data: { detail: 'Internal server error' } },
    })
    expect(result.title).toBe('Erro interno do servidor')
  })

  it('handles model unavailable', () => {
    const result = humanizeError(new Error('model not found: gpt-5'))
    expect(result.title).toBe('Modelo indisponível')
  })
})

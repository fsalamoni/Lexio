// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import DesignStudio from './DesignStudio'

const isEnabledMock = vi.fn()

vi.mock('../../lib/feature-flags', () => ({
  isEnabled: (key: string) => isEnabledMock(key),
}))

afterEach(() => cleanup())
beforeEach(() => {
  isEnabledMock.mockReset()
  window.localStorage.clear()
})

describe('DesignStudio', () => {
  it('shows the gated state when FF_DESIGN_STUDIO is off', () => {
    isEnabledMock.mockReturnValue(false)
    render(<DesignStudio />)
    expect(screen.getByText(/FF_DESIGN_STUDIO/)).toBeDefined()
    expect(screen.queryByRole('button', { name: /Gerar design/ })).toBeNull()
  })

  it('renders the studio shell and every artifact kind when enabled', () => {
    isEnabledMock.mockReturnValue(true)
    render(<DesignStudio />)
    expect(screen.getByRole('button', { name: 'Gerar design/código' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Contexto único do trabalho' })).toBeDefined()
    expect(screen.getByText('Barra do chat')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Perguntar' })).toBeDefined()
    for (const label of ['Slides', 'Site (web)', 'App (mobile)', 'Wireframe', 'Documento', 'Animação', 'Código + design']) {
      expect(screen.getByRole('button', { name: label })).toBeDefined()
    }
  })

  it('requires a workspace repository first, then generates without a mandatory brief', () => {
    isEnabledMock.mockReturnValue(true)
    render(<DesignStudio />)

    const generate = screen.getByRole('button', { name: 'Gerar design/código' }) as HTMLButtonElement
    expect(generate.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Owner do repositório de trabalho'), { target: { value: 'fsalamoni' } })
    fireEvent.change(screen.getByLabelText('Nome do repositório de trabalho'), { target: { value: 'Lexio' } })
    expect(generate.disabled).toBe(false)

    fireEvent.click(generate)

    const frame = screen.getByTitle('Amostra do design') as HTMLIFrameElement
    expect(frame).toBeDefined()
    expect(frame.getAttribute('srcdoc')).toContain('<!doctype html>')
    expect((screen.getByRole('button', { name: /Exportar HTML/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('exposes theme selection, template save and multi-format export once a design exists', () => {
    isEnabledMock.mockReturnValue(true)
    render(<DesignStudio />)

    // Theme picker and starter templates are always present.
    expect(screen.getByLabelText('Tema do design')).toBeDefined()
    expect(screen.getByText('Landing SaaS')).toBeDefined()

    // Export is shown once a design exists; save stays gated until generation.
    expect(screen.queryByRole('button', { name: /Exportar template/ })).toBeNull()
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Owner do repositório de trabalho'), { target: { value: 'fsalamoni' } })
    fireEvent.change(screen.getByLabelText('Nome do repositório de trabalho'), { target: { value: 'Lexio' } })
    fireEvent.change(screen.getByLabelText('Briefing do design'), {
      target: { value: 'Landing page para escritório trabalhista' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar design/código' }))

    // Manual editing surface appears with an editable title.
    const title = screen.getByLabelText('Título do design') as HTMLInputElement
    expect(title.value).toBe('Landing page para escritório trabalhista')

    // Export + Markdown are now enabled.
    expect((screen.getByRole('button', { name: /Exportar template/ }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: /Exportar Markdown/ }) as HTMLButtonElement).disabled).toBe(false)

    // Saving a template persists it and shows it in the gallery.
    fireEvent.change(screen.getByLabelText('Nome do template'), { target: { value: 'Meu modelo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByText('Meu modelo')).toBeDefined()
  })

  it('creates artifacts from the conversational orchestrator and saves recent context', () => {
    isEnabledMock.mockReturnValue(true)
    render(<DesignStudio />)

    fireEvent.change(screen.getByLabelText('Owner do repositório de trabalho'), { target: { value: 'fsalamoni' } })
    fireEvent.change(screen.getByLabelText('Nome do repositório de trabalho'), { target: { value: 'Lexio' } })
    fireEvent.change(screen.getByLabelText('Mensagem para o orquestrador'), {
      target: { value: 'Criar uma área de produto com código e design' },
    })
    fireEvent.click(screen.getByLabelText('Enviar mensagem ao orquestrador'))

    expect(screen.getByText(/Atualizei o contexto em fsalamoni\/Lexio/)).toBeDefined()
    expect(screen.getByText(/modo perguntar/)).toBeDefined()
    expect(screen.getByTitle('Amostra do design')).toBeDefined()
  })

  it('renders the repository apply panel and guides when no token is configured', async () => {
    isEnabledMock.mockReturnValue(true)
    render(<DesignStudio />)
    expect(screen.getByRole('heading', { name: 'Entrega no escopo selecionado' })).toBeDefined()
    // With the connector flag on but no PAT (no Firebase in tests), it guides to settings.
    expect(await screen.findByText(/Nenhum token configurado/)).toBeDefined()
  })
})

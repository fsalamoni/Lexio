// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Falha de teste')
  return <div data-testid="safe-child">Conteúdo seguro</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    console.error = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the recovery UI, error details and retry action after a subtree failure', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { name: /algo deu errado/i })).toBeTruthy()
    expect(screen.getByText(/falha de teste/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeTruthy()
  })

  it('keeps the reload action visible in the fallback controls', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('button', { name: /recarregar página/i })).toBeTruthy()
  })
})
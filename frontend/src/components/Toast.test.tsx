// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from './Toast'

function ToastHarness() {
  const toast = useToast()
  return (
    <div>
      <button onClick={() => toast.success('Salvo', 'Documento atualizado.')}>success</button>
      <button onClick={() => toast.warning('Atenção', 'Revise os dados.')}>warning</button>
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('shows notifications, allows manual dismiss, and auto-dismisses by severity timeout', () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'success' }))
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Salvo')).toBeTruthy()
    expect(screen.getByText('Documento atualizado.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Fechar notificação' }))
    expect(screen.queryByText('Salvo')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'warning' }))
    expect(screen.getByText('Atenção')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(7000)
    })

    expect(screen.queryByText('Atenção')).toBeNull()
  })
})
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ConfirmDialog from './ConfirmDialog'

afterEach(() => {
  cleanup()
})

describe('ConfirmDialog', () => {
  it('renders the dialog and reacts to confirm, cancel, overlay click, and escape', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <ConfirmDialog
        open
        title="Excluir documento"
        description="Essa ação não poderá ser desfeita."
        confirmText="Excluir"
        danger
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Excluir documento' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('dialog', { name: 'Excluir documento' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(3)
  })

  it('blocks cancellation side effects while loading', () => {
    const onCancel = vi.fn()

    render(
      <ConfirmDialog
        open
        title="Processando"
        loading
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByRole('button', { name: 'Processando...' })).toHaveProperty('disabled', true)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('dialog', { name: 'Processando' }))
    expect(onCancel).not.toHaveBeenCalled()
  })
})
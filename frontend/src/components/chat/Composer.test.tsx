// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Composer from './Composer'

describe('Composer', () => {
  afterEach(() => {
    cleanup()
  })

  it('sends trimmed content on Enter and clears the textarea', () => {
    const onSend = vi.fn()

    render(<Composer onSend={onSend} />)

    const textarea = screen.getByPlaceholderText(/pergunte ao orquestrador/i)
    fireEvent.change(textarea, { target: { value: '  tese central  ' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })

    expect(onSend).toHaveBeenCalledWith('tese central')
    expect((textarea as HTMLTextAreaElement).value).toBe('')
  })

  it('keeps multiline composition with Shift+Enter and respects the disabled state', () => {
    const onSend = vi.fn()

    const { rerender } = render(<Composer onSend={onSend} />)

    const textarea = screen.getByPlaceholderText(/pergunte ao orquestrador/i)
    fireEvent.change(textarea, { target: { value: 'linha 1' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
    expect((textarea as HTMLTextAreaElement).value).toBe('linha 1')

    rerender(<Composer onSend={onSend} disabled busy />)

    const disabledTextarea = screen.getByPlaceholderText(/pergunte ao orquestrador/i)
    const sendButton = screen.getByRole('button', { name: /enviar/i })

    expect((disabledTextarea as HTMLTextAreaElement).disabled).toBe(true)
    expect((sendButton as HTMLButtonElement).disabled).toBe(true)
  })
})
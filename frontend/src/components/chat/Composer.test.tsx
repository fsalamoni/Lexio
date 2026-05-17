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

    expect(onSend).toHaveBeenCalledWith({ text: 'tese central', attachments: [], attachmentFiles: [] })
    expect((textarea as HTMLTextAreaElement).value).toBe('')
  })

  it('sends prepared attachments with the text payload', async () => {
    const onSend = vi.fn()

    render(<Composer onSend={onSend} />)

    const textarea = screen.getByPlaceholderText(/pergunte ao orquestrador/i)
    const attachButton = screen.getByRole('button', { name: /anexar arquivos/i })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['conteúdo'], 'notas.txt', { type: 'text/plain' })

    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText('notas.txt')).toBeTruthy()
    expect((attachButton as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(textarea, { target: { value: 'analise' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })

    expect(onSend).toHaveBeenCalledTimes(1)
    const payload = onSend.mock.calls[0][0]
    expect(payload.text).toBe('analise')
    expect(payload.attachments).toHaveLength(1)
    expect(payload.attachments[0]).toMatchObject({ filename: 'notas.txt', extraction: { status: 'ready' } })
    expect(payload.attachmentFiles).toHaveLength(1)
    expect(payload.attachmentFiles[0].file).toBe(file)
  })

  it('limits the number of attachments in a single turn', async () => {
    const onSend = vi.fn()

    render(<Composer onSend={onSend} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const files = Array.from({ length: 13 }, (_, index) => new File([`arquivo ${index}`], `nota-${index}.txt`, { type: 'text/plain' }))

    fireEvent.change(input, { target: { files } })

    expect(await screen.findByText('nota-0.txt')).toBeTruthy()
    expect(screen.queryByText('nota-12.txt')).toBeNull()
    expect(screen.getByText(/excederam o limite/i)).toBeTruthy()
  })

  it('accepts pasted files as attachments', async () => {
    const onSend = vi.fn()

    render(<Composer onSend={onSend} />)

    const textarea = screen.getByPlaceholderText(/pergunte ao orquestrador/i)
    const file = new File(['imagem'], 'print.png', { type: 'image/png' })
    fireEvent.paste(textarea, {
      clipboardData: {
        files: [file],
      },
    })

    expect(await screen.findByText('print.png')).toBeTruthy()
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
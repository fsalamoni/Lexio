// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const richTextMocks = vi.hoisted(() => {
  let currentHtml = '<p>Alpha beta alpha</p>'
  let currentText = 'Alpha beta alpha'
  const chainCalls: Array<{ method: string; args: unknown[] }> = []
  const run = vi.fn(() => true)

  let chainProxy: Record<string, unknown>
  chainProxy = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'run') return run
      return (...args: unknown[]) => {
        chainCalls.push({ method: String(prop), args })
        return chainProxy
      }
    },
  })

  const canProxy = new Proxy({}, {
    get: () => () => true,
  })

  const commands = {
    setContent: vi.fn((html: string) => {
      currentHtml = html
      currentText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      return true
    }),
  }

  const editor = {
    chain: vi.fn(() => chainProxy),
    can: vi.fn(() => canProxy),
    commands,
    getHTML: vi.fn(() => currentHtml),
    getText: vi.fn(() => currentText),
    getAttributes: vi.fn((name: string) => {
      if (name === 'textStyle') return { fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt' }
      if (name === 'link') return { href: undefined }
      return {}
    }),
    isActive: vi.fn(() => false),
    state: {
      doc: {
        descendants: (callback: (node: { isText: boolean; text: string }, pos: number) => void) => {
          callback({ isText: true, text: currentText }, 0)
        },
      },
    },
  }

  return {
    chainCalls,
    commands,
    editor,
    run,
    lastConfig: null as null | Record<string, unknown>,
    setDocument(html: string, text: string) {
      currentHtml = html
      currentText = text
    },
  }
})

vi.mock('@tiptap/react', () => ({
  useEditor: (config: Record<string, unknown>) => {
    richTextMocks.lastConfig = config
    return richTextMocks.editor
  },
  EditorContent: ({ editor }: { editor: { getHTML: () => string } }) => (
    <div data-testid="editor-content">{editor.getHTML()}</div>
  ),
}))

import RichTextEditor from './RichTextEditor'

describe('RichTextEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    richTextMocks.chainCalls.length = 0
    richTextMocks.lastConfig = null
    richTextMocks.setDocument('<p>Alpha beta alpha</p>', 'Alpha beta alpha')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('updates word counts, supports find/replace, and syncs external content changes', () => {
    const onChange = vi.fn()
    const onWordCount = vi.fn()

    const view = render(
      <RichTextEditor
        content="<p>Alpha beta alpha</p>"
        onChange={onChange}
        onWordCount={onWordCount}
      />,
    )

    act(() => {
      ;(richTextMocks.lastConfig?.onUpdate as ((payload: { editor: typeof richTextMocks.editor }) => void))?.({ editor: richTextMocks.editor })
    })

    expect(onChange).toHaveBeenCalledWith('<p>Alpha beta alpha</p>')
    expect(onWordCount).toHaveBeenCalledWith(3, 16)
    expect(screen.getByText('3 palavras · 16 caracteres')).toBeTruthy()

    fireEvent.mouseDown(screen.getByTitle('Localizar e substituir (Ctrl+H)'))
    fireEvent.change(screen.getByPlaceholderText('Localizar...'), { target: { value: 'alpha' } })
    fireEvent.change(screen.getByPlaceholderText('Substituir por...'), { target: { value: 'Omega' } })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(screen.getByText('2 resultados')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Substituir tudo' }))

    const insertCalls = richTextMocks.chainCalls.filter(call => call.method === 'insertContentAt')
    expect(insertCalls).toHaveLength(2)
    expect(screen.getByText('0 resultados')).toBeTruthy()

    view.rerender(
      <RichTextEditor
        content="<p>Novo texto sincronizado</p>"
        onChange={onChange}
        onWordCount={onWordCount}
      />,
    )

    expect(richTextMocks.commands.setContent).toHaveBeenCalledWith('<p>Novo texto sincronizado</p>')
  })

  it('opens link and image dialogs, inserts commands, and prints the current document', () => {
    const printWindow = {
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
    }

    vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as Window)

    render(
      <RichTextEditor
        content="<p>Alpha beta alpha</p>"
        onChange={() => {}}
      />,
    )

    fireEvent.mouseDown(screen.getByTitle('Inserir/editar link'))
    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: 'https://lexio.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(richTextMocks.chainCalls.some(call => call.method === 'extendMarkRange')).toBe(true)
    expect(richTextMocks.chainCalls.some(call => call.method === 'setLink' && JSON.stringify(call.args[0]) === JSON.stringify({ href: 'https://lexio.test', target: '_blank' }))).toBe(true)

    fireEvent.mouseDown(screen.getByTitle('Inserir imagem'))
    fireEvent.change(screen.getByPlaceholderText('https://exemplo.com/imagem.png'), { target: { value: 'https://cdn.lexio.test/image.png' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inserir' }))

    expect(richTextMocks.chainCalls.some(call => call.method === 'setImage' && JSON.stringify(call.args[0]) === JSON.stringify({ src: 'https://cdn.lexio.test/image.png' }))).toBe(true)

    fireEvent.mouseDown(screen.getByTitle('Inserir tabela (3×3)'))
    expect(richTextMocks.chainCalls.some(call => call.method === 'insertTable')).toBe(true)

    fireEvent.mouseDown(screen.getByTitle('Imprimir (Ctrl+P)'))

    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(window.open).toHaveBeenCalled()
    expect(printWindow.document.write).toHaveBeenCalled()
    expect(printWindow.focus).toHaveBeenCalled()
    expect(printWindow.print).toHaveBeenCalledTimes(1)
    expect(printWindow.close).toHaveBeenCalledTimes(1)
  })
})
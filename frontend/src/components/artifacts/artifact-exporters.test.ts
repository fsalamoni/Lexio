// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  exportAsMarkdown,
  exportDataTableAsCSV,
  exportFileFromUrl,
  exportFlashcardsAsCSV,
} from './artifact-exporters'

const appendChildSpy = vi.spyOn(document.body, 'appendChild')
const removeChildSpy = vi.spyOn(document.body, 'removeChild')

describe('artifact-exporters', () => {
  let createObjectUrlMock: ReturnType<typeof vi.fn>
  let revokeObjectUrlMock: ReturnType<typeof vi.fn>
  let fetchMock: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    appendChildSpy.mockClear()
    removeChildSpy.mockClear()
    clickSpy = vi.fn()
    createObjectUrlMock = vi.fn().mockReturnValue('blob:lexio-test')
    revokeObjectUrlMock = vi.fn()
    fetchMock = vi.fn()

    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectUrlMock,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectUrlMock,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      configurable: true,
      writable: true,
    })

    appendChildSpy.mockImplementation((node: Node) => {
      if (node instanceof HTMLAnchorElement) {
        Object.defineProperty(node, 'click', { value: clickSpy, configurable: true })
      }
      return node
    })
    removeChildSpy.mockImplementation((node: Node) => node)
  })

  it('downloads markdown content with the expected filename', async () => {
    exportAsMarkdown('# Relatorio', 'meu-artefato')

    expect(createObjectUrlMock).toHaveBeenCalledTimes(1)
    const blob = createObjectUrlMock.mock.calls[0][0] as Blob
    expect(await blob.text()).toBe('# Relatorio')

    const anchor = appendChildSpy.mock.calls[0][0] as HTMLAnchorElement
    expect(anchor.download).toBe('meu-artefato.md')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:lexio-test')
  })

  it('exports structured CSV payloads for tables and flashcards', async () => {
    exportDataTableAsCSV({
      title: 'Tabela',
      columns: [
        { key: 'tema', label: 'Tema', align: 'left' },
        { key: 'valor', label: 'Valor', align: 'right' },
      ],
      rows: [{ tema: 'Receita', valor: '10,5' }],
    }, 'dados')

    exportFlashcardsAsCSV({
      title: 'Cards',
      categories: [
        {
          name: 'Civil',
          cards: [{ front: 'Pergunta', back: 'Resposta' }],
        },
      ],
    }, 'cards')

    const firstBlob = createObjectUrlMock.mock.calls[0][0] as Blob
    expect(await firstBlob.text()).toContain('"Tema","Valor"')
    expect(await firstBlob.text()).toContain('"Receita","10,5"')

    const secondBlob = createObjectUrlMock.mock.calls[1][0] as Blob
    expect(await secondBlob.text()).toContain('Front,Back,Tags')
    expect(await secondBlob.text()).toContain('"Pergunta","Resposta","Civil"')

    const downloads = appendChildSpy.mock.calls.map(([node]) => (node as HTMLAnchorElement).download)
    expect(downloads).toEqual(['dados.csv', 'cards_anki.csv'])
  })

  it('downloads a remote file using the MIME-derived extension', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['binary'], { type: 'audio/mpeg' }),
    } as Response)

    await exportFileFromUrl('https://example.com/audio', 'podcast', '.bin')

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/audio')
    const anchor = appendChildSpy.mock.calls[0][0] as HTMLAnchorElement
    expect(anchor.download).toBe('podcast.mp3')
  })
})
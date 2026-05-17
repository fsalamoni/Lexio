import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { extractPresentationTextWithMeta } from './presentation-extractor'

describe('presentation extractor', () => {
  it('extracts PPTX slide text and notes into contextual markdown', async () => {
    const zip = new JSZip()
    zip.file('ppt/slides/slide1.xml', [
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
      '<p:cSld><p:spTree>',
      '<a:t>Projeto de Lei</a:t>',
      '<a:t>Objetivo central</a:t>',
      '<a:t>Impactos orçamentários</a:t>',
      '</p:spTree></p:cSld>',
      '</p:sld>',
    ].join(''))
    zip.file('ppt/notesSlides/notesSlide1.xml', [
      '<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
      '<a:t>Falar sobre riscos juridicos.</a:t>',
      '</p:notes>',
    ].join(''))
    zip.file('ppt/slides/slide2.xml', [
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
      '<a:t>Cronograma</a:t>',
      '<a:t>Fase 1</a:t>',
      '</p:sld>',
    ].join(''))
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })
    const file = new File([blob], 'projeto.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })

    const result = await extractPresentationTextWithMeta(file)

    expect(result.slideCount).toBe(2)
    expect(result.slides[0]).toMatchObject({
      slideNumber: 1,
      title: 'Projeto de Lei',
    })
    expect(result.text).toContain('Slides detectados: 2')
    expect(result.text).toContain('Impactos orçamentários')
    expect(result.text).toContain('Falar sobre riscos juridicos')
  })

  it('rejects non-PPTX presentations with a clear message', async () => {
    const file = new File(['legacy'], 'deck.ppt', { type: 'application/vnd.ms-powerpoint' })

    await expect(extractPresentationTextWithMeta(file)).rejects.toThrow(/nao suportado|não suportado/i)
  })
})

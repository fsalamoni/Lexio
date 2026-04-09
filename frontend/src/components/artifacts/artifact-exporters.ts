/**
 * Artifact Exporters — format-specific export utilities for each artifact type.
 *
 * These are lightweight, browser-side exports that avoid heavy dependencies.
 * Uses Blob + URL.createObjectURL for downloads.
 */

import type {
  ParsedPresentation,
  ParsedFlashcards,
  ParsedQuiz,
  ParsedDataTable,
  ParsedAudioScript,
  ParsedVideoScript,
} from './artifact-parsers'

// ── Download helper ─────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function downloadText(content: string, filename: string, mimeType = 'text/plain') {
  downloadBlob(new Blob([content], { type: `${mimeType};charset=utf-8` }), filename)
}

async function fetchUrlAsBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Falha ao baixar mídia (${response.status})`)
  }
  return response.blob()
}

function inferExtensionFromBlob(blob: Blob, fallback: string): string {
  const type = blob.type.toLowerCase()
  if (type.includes('image/png')) return '.png'
  if (type.includes('image/jpeg')) return '.jpg'
  if (type.includes('image/webp')) return '.webp'
  if (type.includes('audio/mpeg')) return '.mp3'
  if (type.includes('audio/wav')) return '.wav'
  if (type.includes('audio/ogg')) return '.ogg'
  if (type.includes('video/mp4')) return '.mp4'
  if (type.includes('video/webm')) return '.webm'
  return fallback
}

// ── Markdown export (universal fallback) ────────────────────────────────────

export function exportAsMarkdown(content: string, filename: string) {
  downloadText(content, `${filename}.md`, 'text/markdown')
}

export async function exportFileFromUrl(url: string, filename: string, fallbackExtension = '') {
  const blob = await fetchUrlAsBlob(url)
  const extension = inferExtensionFromBlob(blob, fallbackExtension)
  downloadBlob(blob, `${filename}${extension}`)
}

export async function exportPresentationImagesAsZip(data: ParsedPresentation, filename: string) {
  const slideImages = data.slides.filter(slide => slide.renderedImageUrl)
  if (slideImages.length === 0) {
    throw new Error('Nenhum slide visual gerado para exportar.')
  }

  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  await Promise.all(slideImages.map(async (slide) => {
    const blob = await fetchUrlAsBlob(slide.renderedImageUrl!)
    const extension = inferExtensionFromBlob(blob, '.png')
    zip.file(`slide-${String(slide.number).padStart(2, '0')}${extension}`, blob)
  }))

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, `${filename}_slides.zip`)
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Falha ao converter mídia para data URL.'))
    reader.readAsDataURL(blob)
  })
}

export async function exportPresentationAsPptx(data: ParsedPresentation, filename: string) {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Lexio'
  pptx.company = 'Lexio'
  pptx.subject = data.title || filename
  pptx.title = data.title || filename
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  }

  for (const slideData of data.slides) {
    const slide = pptx.addSlide()
    slide.background = { color: 'F8FAFC' }

    if (slideData.renderedImageUrl) {
      const blob = await fetchUrlAsBlob(slideData.renderedImageUrl)
      const imageData = await blobToDataUrl(blob)
      slide.addImage({ data: imageData, x: 0, y: 0, w: 13.333, h: 7.5 })
    } else {
      slide.addText(slideData.title, {
        x: 0.6,
        y: 0.45,
        w: 12.1,
        h: 0.7,
        fontFace: 'Aptos Display',
        fontSize: 24,
        bold: true,
        color: '0F172A',
        margin: 0,
      })

      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.6,
        y: 1.35,
        w: 12.1,
        h: 4.9,
        rectRadius: 0.12,
        fill: { color: 'FFFFFF' },
        line: { color: 'DBEAFE', pt: 1.2 },
      })

      const bulletRuns = slideData.bullets.length > 0
        ? slideData.bullets.map(bullet => ({ text: bullet, options: { bullet: { indent: 14 } } }))
        : [{ text: slideData.visualSuggestion || 'Slide sem bullets estruturados.' }]

      slide.addText(bulletRuns, {
        x: 1.0,
        y: 1.85,
        w: 6.2,
        h: 3.8,
        fontFace: 'Aptos',
        fontSize: 18,
        color: '1F2937',
        breakLine: true,
        margin: 0,
      })

      slide.addText(slideData.visualSuggestion || 'Direção visual sugerida pelo pipeline.', {
        x: 7.8,
        y: 1.85,
        w: 4.35,
        h: 3.0,
        fontFace: 'Aptos',
        fontSize: 16,
        color: '334155',
        italic: true,
        margin: 0.12,
        fill: { color: 'EFF6FF' },
        line: { color: 'BFDBFE', pt: 1 },
      })
    }

    const notes = [slideData.speakerNotes, slideData.visualSuggestion].filter(Boolean).join('\n\n')
    const notesTarget = slide as unknown as { addNotes?: (text: string) => void }
    notesTarget.addNotes?.(notes)
  }

  await pptx.writeFile({ fileName: `${filename}.pptx` })
}

// ── CSV export for DataTable ────────────────────────────────────────────────

export function exportDataTableAsCSV(data: ParsedDataTable, filename: string) {
  const header = data.columns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',')
  const rows = data.rows.map(row =>
    data.columns.map(c => {
      const val = row[c.key] ?? ''
      return `"${String(val).replace(/"/g, '""')}"`
    }).join(',')
  )
  const csv = [header, ...rows].join('\n')
  downloadText(csv, `${filename}.csv`, 'text/csv')
}

// ── Flashcards → CSV (Anki-compatible) ──────────────────────────────────────

export function exportFlashcardsAsCSV(data: ParsedFlashcards, filename: string) {
  const rows = data.categories.flatMap(cat =>
    cat.cards.map(card =>
      `"${card.front.replace(/"/g, '""')}","${card.back.replace(/"/g, '""')}","${cat.name.replace(/"/g, '""')}"`
    )
  )
  const csv = ['Front,Back,Tags', ...rows].join('\n')
  downloadText(csv, `${filename}_anki.csv`, 'text/csv')
}

// ── Quiz → PDF-ready text ───────────────────────────────────────────────────

export function exportQuizAsText(data: ParsedQuiz, filename: string, includeAnswers: boolean) {
  let text = `${data.title}\n`
  text += `Dificuldade: ${data.difficulty || 'Variada'} | Tempo: ${data.estimatedTime || 'N/A'}\n`
  text += '═'.repeat(60) + '\n\n'

  data.questions.forEach(q => {
    text += `${q.number}. [${q.type.replace(/_/g, ' ').toUpperCase()}] ${q.text}\n`
    if (q.options) {
      q.options.forEach(opt => { text += `   ${opt.label}) ${opt.text}\n` })
    }
    if (q.pairs) {
      q.pairs.forEach(p => { text += `   ${p.left} → ___\n` })
    }
    text += '\n'
  })

  if (includeAnswers) {
    text += '\n' + '═'.repeat(60) + '\nGABARITO\n' + '═'.repeat(60) + '\n\n'
    data.questions.forEach(q => {
      text += `${q.number}. ${q.answer}\n`
      if (q.explanation) text += `   ${q.explanation}\n`
      text += '\n'
    })
  }

  downloadText(text, `${filename}${includeAnswers ? '_gabarito' : '_prova'}.txt`)
}

// ── Presentation → plain text slides ────────────────────────────────────────

export function exportPresentationAsText(data: ParsedPresentation, filename: string) {
  let text = data.title ? `${data.title}\n${'═'.repeat(60)}\n\n` : ''

  data.slides.forEach(slide => {
    text += `── Slide ${slide.number}: ${slide.title} ─��\n\n`
    slide.bullets.forEach(b => { text += `  • ${b}\n` })
    if (slide.speakerNotes) {
      text += `\n  [Notas] ${slide.speakerNotes}\n`
    }
    if (slide.visualSuggestion) {
      text += `  [Visual] ${slide.visualSuggestion}\n`
    }
    text += '\n'
  })

  downloadText(text, `${filename}_slides.txt`)
}

// ── Audio/Video Script → formatted text ─────────────────────────────────────

export function exportAudioScriptAsText(data: ParsedAudioScript, filename: string) {
  let text = `${data.title}\nDuração: ${data.duration || 'N/A'}\n${'═'.repeat(60)}\n\n`

  data.segments.forEach(seg => {
    const speaker = seg.speaker ? ` [${seg.speaker}]` : ''
    text += `[${seg.time}] (${seg.type})${speaker}\n`
    text += `${seg.text}\n`
    if (seg.notes) text += `  → ${seg.notes}\n`
    text += '\n'
  })

  if (data.productionNotes?.length) {
    text += '\nNOTAS DE PRODUÇÃO:\n'
    data.productionNotes.forEach(n => { text += `  • ${n}\n` })
  }

  downloadText(text, `${filename}_roteiro.txt`)
}

export function exportVideoScriptAsText(data: ParsedVideoScript, filename: string) {
  let text = `${data.title}\nDuração: ${data.duration || 'N/A'}\n${'═'.repeat(60)}\n\n`

  data.scenes.forEach(scene => {
    text += `── Cena ${scene.number} [${scene.time}] ──\n`
    text += `NARRAÇÃO: ${scene.narration}\n`
    text += `VISUAL: ${scene.visual}\n`
    if (scene.transition) text += `TRANSIÇÃO: ${scene.transition}\n`
    if (scene.broll) text += `B-ROLL: ${scene.broll}\n`
    if (scene.lowerThird) text += `LOWER THIRD: ${scene.lowerThird}\n`
    if (scene.notes) text += `NOTAS: ${scene.notes}\n`
    text += '\n'
  })

  if (data.postProductionNotes?.length) {
    text += '\nNOTAS PÓS-PRODUÇÃO:\n'
    data.postProductionNotes.forEach(n => { text += `  • ${n}\n` })
  }

  downloadText(text, `${filename}_storyboard.txt`)
}

// ── JSON export (for structured artifacts) ──────────────────────────────────

export function exportAsJSON(data: unknown, filename: string) {
  downloadText(JSON.stringify(data, null, 2), `${filename}.json`, 'application/json')
}

// ── HTML export (for visual artifacts) ──────────────────────────────────────

const HTML_STYLE = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #1f2937; }
    h1, h2, h3, h4 { color: #111827; margin-top: 1.5em; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #e5e7eb; padding: 0.75rem; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    tr:nth-child(even) { background: #f9fafb; }
    blockquote { border-left: 4px solid #6366f1; padding-left: 1rem; margin: 1em 0; font-style: italic; color: #4b5563; }
    code { background: #f3f4f6; padding: 0.15em 0.4em; border-radius: 0.25rem; font-size: 0.875em; }
    pre { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
    .stat { font-size: 2.5rem; font-weight: 700; color: #6366f1; }
    .section { margin: 2rem 0; padding: 1.5rem; border-radius: 0.75rem; background: #f9fafb; }
    @media print { body { padding: 0; } @page { margin: 2cm; } }
`

export function exportAsHTML(htmlContent: string, title: string, filename: string) {
  const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${HTML_STYLE}</style>
</head>
<body>
  <h1>${title}</h1>
  ${htmlContent}
  <footer style="margin-top:3rem;padding-top:1rem;border-top:1px solid #e5e7eb;font-size:0.75rem;color:#9ca3af;">
    Gerado por Lexio · ${new Date().toLocaleDateString('pt-BR')}
  </footer>
</body>
</html>`
  downloadText(fullHtml, `${filename}.html`, 'text/html')
}

// ── PDF export (via browser print dialog) ───────────────────────────────────

export function printAsPDF(htmlContent: string, title: string) {
  const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>${HTML_STYLE}</style>
</head>
<body>
  <h1>${title}</h1>
  ${htmlContent}
  <footer style="margin-top:3rem;padding-top:1rem;border-top:1px solid #e5e7eb;font-size:0.75rem;color:#9ca3af;">
    Gerado por Lexio · ${new Date().toLocaleDateString('pt-BR')}
  </footer>
</body>
</html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(fullHtml)
  w.document.close()
  w.addEventListener('load', () => { w.print() })
}

import JSZip from 'jszip'
import { getFileExtension } from './file-text-extractor'

export interface PresentationSlideSummary {
  slideNumber: number
  title: string
  text: string
  notes?: string
}

export interface PresentationExtractionResult {
  text: string
  slideCount: number
  slides: PresentationSlideSummary[]
}

const MAX_SLIDES_IN_CONTEXT = 80
const MAX_TEXT_PER_SLIDE = 3000

export async function extractPresentationTextWithMeta(file: File): Promise<PresentationExtractionResult> {
  const extension = getFileExtension(file.name)
  if (extension !== '.pptx') {
    throw new Error(`Formato de apresentação ainda não suportado para extração automática: ${extension || file.type || 'desconhecido'}.`)
  }
  return extractPptx(file)
}

async function extractPptx(file: File): Promise<PresentationExtractionResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const slidePaths = Object.keys(zip.files)
    .filter(path => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort(naturalCompare)

  if (!slidePaths.length) throw new Error('Nenhum slide legível foi encontrado no arquivo PPTX.')

  const slides: PresentationSlideSummary[] = []
  for (const [index, path] of slidePaths.slice(0, MAX_SLIDES_IN_CONTEXT).entries()) {
    const xml = await zip.file(path)?.async('text')
    if (!xml) continue
    const slideNumber = extractSlideNumber(path) ?? index + 1
    const textParts = extractTextNodes(xml)
    const notesXml = await zip.file(`ppt/notesSlides/notesSlide${slideNumber}.xml`)?.async('text')
    const notes = notesXml ? extractTextNodes(notesXml).join('\n').trim() : ''
    const title = textParts[0]?.trim() || `Slide ${slideNumber}`
    const body = textParts.join('\n').trim()
    slides.push({
      slideNumber,
      title,
      text: truncateSlideText(body),
      notes: notes ? truncateSlideText(notes) : undefined,
    })
  }

  if (!slides.length) throw new Error('Nenhum texto legível foi encontrado nos slides do PPTX.')
  return buildPresentationResult(file.name, slides)
}

function buildPresentationResult(fileName: string, slides: PresentationSlideSummary[]): PresentationExtractionResult {
  const lines = [`Apresentação: ${fileName}`, `Slides detectados: ${slides.length}`]
  for (const slide of slides) {
    lines.push('', `## Slide ${slide.slideNumber}: ${slide.title}`)
    if (slide.text) lines.push(slide.text)
    if (slide.notes) lines.push('', 'Notas:', slide.notes)
  }
  return {
    text: lines.join('\n'),
    slideCount: slides.length,
    slides,
  }
}

function extractTextNodes(xml: string): string[] {
  const nodes = [...xml.matchAll(/<(?:[\w-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?t>/g)]
    .map(match => decodeXml(match[1]).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (nodes.length) return nodes
  return [...xml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)]
    .map(match => decodeXml(match[1]).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function extractSlideNumber(path: string): number | null {
  const raw = path.match(/slide(\d+)\.xml$/i)?.[1]
  return raw ? Number(raw) : null
}

function truncateSlideText(value: string): string {
  if (value.length <= MAX_TEXT_PER_SLIDE) return value
  return `${value.slice(0, MAX_TEXT_PER_SLIDE)}\n...[slide truncado para contexto]`
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

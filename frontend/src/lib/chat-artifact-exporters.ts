import type {
  ChatAgentWorkPackage,
  ChatArtifactExportRef,
  ChatArtifactFormat,
  ChatArtifactRef,
} from './firestore-types'
import { generateDocxBlob } from './docx-generator'
import { uploadChatArtifactFile } from './chat-artifact-storage'

const TEXT_FORMATS = new Set<ChatArtifactFormat>(['markdown', 'txt', 'typescript', 'javascript', 'python'])
const SUPPORTED_EXPORT_FORMATS = new Set<ChatArtifactFormat>([
  'markdown',
  'txt',
  'json',
  'html',
  'csv',
  'docx',
  'pptx',
  'xlsx',
  'typescript',
  'javascript',
  'python',
])

interface MaterializeOptions {
  userId: string
  conversationId: string
  turnId: string
}

interface ExportBlobResult {
  blob: Blob
  extension: string
  mimeType: string
}

export async function materializeChatAgentWorkPackageExports(
  workPackage: ChatAgentWorkPackage,
  options: MaterializeOptions,
): Promise<ChatAgentWorkPackage> {
  const artifacts = await Promise.all((workPackage.artifacts ?? []).map(artifact => materializeArtifactExports(artifact, workPackage, options)))
  return { ...workPackage, artifacts }
}

async function materializeArtifactExports(
  artifact: ChatArtifactRef,
  workPackage: ChatAgentWorkPackage,
  options: MaterializeOptions,
): Promise<ChatArtifactRef> {
  const requestedExports = normalizeRequestedExports(artifact)
  const exports: ChatArtifactExportRef[] = []
  let primaryDownloadUrl = artifact.download_url
  let primaryStoragePath = artifact.storage_path

  for (const exportRef of requestedExports) {
    if (exportRef.status === 'ready' && (exportRef.download_url || exportRef.storage_path)) {
      exports.push(exportRef)
      continue
    }

    if (!SUPPORTED_EXPORT_FORMATS.has(exportRef.format)) {
      exports.push({
        ...exportRef,
        status: 'unavailable',
        reason: exportRef.reason || 'Export nativo ainda não implementado para este formato no chat.',
      })
      continue
    }

    try {
      const generated = await buildExportBlob(artifact, workPackage, exportRef.format)
      const exportId = exportRef.export_id || `${artifact.artifact_id}-${exportRef.format}`
      const stored = await uploadChatArtifactFile({
        userId: options.userId,
        conversationId: options.conversationId,
        turnId: options.turnId,
        artifactId: artifact.artifact_id,
        exportId,
        title: artifact.title,
        extension: generated.extension,
        blob: generated.blob,
      })
      const readyExport: ChatArtifactExportRef = {
        ...exportRef,
        export_id: exportId,
        status: 'ready',
        mime_type: generated.mimeType,
        extension: generated.extension,
        download_url: stored.url,
        storage_path: stored.path,
      }
      exports.push(readyExport)
      if (!primaryDownloadUrl && exportRef.format === artifact.format) primaryDownloadUrl = stored.url
      if (!primaryStoragePath && exportRef.format === artifact.format) primaryStoragePath = stored.path
    } catch (error) {
      exports.push({
        ...exportRef,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    ...artifact,
    download_url: primaryDownloadUrl,
    storage_path: primaryStoragePath,
    exports,
  }
}

function normalizeRequestedExports(artifact: ChatArtifactRef): ChatArtifactExportRef[] {
  const byFormat = new Map<ChatArtifactFormat, ChatArtifactExportRef>()
  const hasExplicitExports = Boolean(artifact.exports?.length)
  for (const exportRef of artifact.exports ?? []) {
    byFormat.set(exportRef.format, {
      ...exportRef,
      label: exportRef.label || exportRef.format.toUpperCase(),
      status: exportRef.status || 'planned',
    })
  }

  if (!byFormat.has(artifact.format) && SUPPORTED_EXPORT_FORMATS.has(artifact.format)) {
    byFormat.set(artifact.format, { label: artifact.format.toUpperCase(), format: artifact.format, status: 'planned' })
  }
  if ((artifact.kind === 'text' || artifact.kind === 'legal_document') && !byFormat.has('docx')) {
    byFormat.set('docx', { label: 'DOCX', format: 'docx', status: 'planned' })
  }
  if (!hasExplicitExports && artifact.kind === 'presentation' && !byFormat.has('pptx')) {
    byFormat.set('pptx', { label: 'PPTX', format: 'pptx', status: 'planned' })
  }
  if (!hasExplicitExports && (artifact.kind === 'spreadsheet' || artifact.kind === 'data') && !byFormat.has('xlsx')) {
    byFormat.set('xlsx', { label: 'XLSX', format: 'xlsx', status: 'planned' })
  }
  if (artifact.manifest_json && !byFormat.has('json')) {
    byFormat.set('json', { label: 'JSON', format: 'json', status: 'planned' })
  }

  return [...byFormat.values()]
}

async function buildExportBlob(
  artifact: ChatArtifactRef,
  workPackage: ChatAgentWorkPackage,
  format: ChatArtifactFormat,
): Promise<ExportBlobResult> {
  const text = artifact.content_preview || workPackage.result_markdown || artifact.summary || artifact.title
  if (format === 'json') {
    const payload = artifact.manifest_json ?? { artifact, result_markdown: workPackage.result_markdown }
    return makeTextBlob(JSON.stringify(payload, null, 2), 'application/json', '.json')
  }
  if (format === 'html') {
    return makeTextBlob(renderHtmlDocument(artifact.title, text), 'text/html', '.html')
  }
  if (format === 'csv') {
    return makeTextBlob(renderCsv(artifact.manifest_json, text), 'text/csv', '.csv')
  }
  if (format === 'docx') {
    const blob = await generateDocxBlob(text, artifact.kind === 'legal_document' ? 'Documento jurídico' : 'Documento', artifact.title)
    return { blob, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: '.docx' }
  }
  if (format === 'pptx') {
    const blob = await buildPptxBlob(artifact, text)
    return { blob, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: '.pptx' }
  }
  if (format === 'xlsx') {
    const blob = await buildXlsxBlob(artifact, text)
    return { blob, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: '.xlsx' }
  }
  if (TEXT_FORMATS.has(format)) {
    const extension = format === 'markdown' ? '.md' : format === 'typescript' ? '.ts' : format === 'javascript' ? '.js' : format === 'python' ? '.py' : '.txt'
    const mime = format === 'markdown' ? 'text/markdown' : 'text/plain'
    return makeTextBlob(text, mime, extension)
  }

  throw new Error(`Formato ${format} ainda não possui exportador no chat.`)
}

async function buildPptxBlob(artifact: ChatArtifactRef, fallbackText: string): Promise<Blob> {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Lexio'
  pptx.company = 'Lexio'
  pptx.subject = artifact.summary || artifact.title
  pptx.title = artifact.title
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  }

  const slides = normalizePresentationSlides(artifact, fallbackText)
  for (const slideData of slides) {
    const slide = pptx.addSlide()
    slide.background = { color: 'F8FAFC' }
    slide.addText(slideData.title, {
      x: 0.65,
      y: 0.5,
      w: 12,
      h: 0.6,
      fontFace: 'Aptos Display',
      fontSize: 24,
      bold: true,
      color: '0F172A',
      margin: 0,
    })
    const bulletRuns = slideData.bullets.length
      ? slideData.bullets.map(bullet => ({ text: bullet, options: { bullet: { indent: 14 } } }))
      : [{ text: slideData.body || 'Conteúdo a revisar no Lexio.' }]
    slide.addText(bulletRuns, {
      x: 0.9,
      y: 1.35,
      w: 11.5,
      h: 4.8,
      fontFace: 'Aptos',
      fontSize: 17,
      color: '1F2937',
      breakLine: true,
      margin: 0.06,
      fit: 'shrink',
    })
    const notesTarget = slide as unknown as { addNotes?: (text: string) => void }
    notesTarget.addNotes?.(slideData.notes || slideData.body)
  }

  const writer = pptx as unknown as { write: (options: { outputType: 'blob' }) => Promise<Blob> }
  return writer.write({ outputType: 'blob' })
}

async function buildXlsxBlob(artifact: ChatArtifactRef, fallbackText: string): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const rows = normalizeSpreadsheetRows(artifact.manifest_json, fallbackText)
  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))))
  const zip = new JSZip()

  zip.file('[Content_Types].xml', xmlDeclaration([
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    '</Types>',
  ]))
  zip.folder('_rels')?.file('.rels', xmlDeclaration([
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '</Relationships>',
  ]))
  const xl = zip.folder('xl')
  xl?.file('workbook.xml', xmlDeclaration([
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheets><sheet name="Dados" sheetId="1" r:id="rId1"/></sheets>',
    '</workbook>',
  ]))
  xl?.folder('_rels')?.file('workbook.xml.rels', xmlDeclaration([
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
    '</Relationships>',
  ]))
  xl?.folder('worksheets')?.file('sheet1.xml', xmlDeclaration(renderWorksheetXml(headers, rows)))

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function normalizePresentationSlides(artifact: ChatArtifactRef, fallbackText: string): Array<{ title: string; bullets: string[]; body: string; notes: string }> {
  const rawSlides = artifact.manifest_json?.slides
  if (Array.isArray(rawSlides)) {
    const slides = rawSlides
      .map((rawSlide, idx) => normalizePresentationSlide(rawSlide, idx))
      .filter((slide): slide is { title: string; bullets: string[]; body: string; notes: string } => Boolean(slide))
    if (slides.length) return slides.slice(0, 30)
  }

  const chunks = chunkTextForSlides(fallbackText || artifact.summary || artifact.title)
  return chunks.map((chunk, idx) => ({
    title: idx === 0 ? artifact.title : `${artifact.title} (${idx + 1})`,
    bullets: chunk.split(/\r?\n/).map(line => line.replace(/^[-*]\s+/, '').trim()).filter(Boolean).slice(0, 6),
    body: chunk,
    notes: chunk,
  }))
}

function normalizePresentationSlide(rawSlide: unknown, idx: number): { title: string; bullets: string[]; body: string; notes: string } | null {
  if (!rawSlide || typeof rawSlide !== 'object' || Array.isArray(rawSlide)) return null
  const record = rawSlide as Record<string, unknown>
  const title = String(record.title || record.heading || `Slide ${idx + 1}`).trim()
  const rawBullets = Array.isArray(record.bullets) ? record.bullets : Array.isArray(record.items) ? record.items : []
  const bullets = rawBullets.map(item => String(item).trim()).filter(Boolean).slice(0, 8)
  const body = String(record.body || record.content || record.summary || bullets.join('\n')).trim()
  const notes = String(record.notes || record.speakerNotes || record.speaker_notes || body).trim()
  return { title, bullets, body, notes }
}

function chunkTextForSlides(value: string): string[] {
  const paragraphs = value.split(/\n{2,}/).map(part => part.trim()).filter(Boolean)
  if (!paragraphs.length) return ['Conteúdo gerado pelo Lexio.']
  const chunks: string[] = []
  let current = ''
  for (const paragraph of paragraphs) {
    if (current && `${current}\n${paragraph}`.length > 700) {
      chunks.push(current)
      current = paragraph
    } else {
      current = current ? `${current}\n${paragraph}` : paragraph
    }
  }
  if (current) chunks.push(current)
  return chunks.slice(0, 30)
}

function normalizeSpreadsheetRows(manifest: Record<string, unknown> | undefined, fallbackText: string): Array<Record<string, unknown>> {
  const rows = manifest?.rows
  if (Array.isArray(rows) && rows.every(row => row && typeof row === 'object' && !Array.isArray(row))) {
    return rows as Array<Record<string, unknown>>
  }
  return fallbackText.split(/\r?\n/).map((line, idx) => ({ linha: idx + 1, conteudo: line })).filter(row => String(row.conteudo).trim())
}

function renderWorksheetXml(headers: string[], rows: Array<Record<string, unknown>>): string[] {
  const headerRow = renderWorksheetRow(1, headers.map(header => ({ value: header })))
  const dataRows = rows.map((row, rowIdx) => renderWorksheetRow(rowIdx + 2, headers.map(header => ({ value: row[header] }))))
  return [
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetData>',
    headerRow,
    ...dataRows,
    '</sheetData>',
    '</worksheet>',
  ]
}

function renderWorksheetRow(rowNumber: number, cells: Array<{ value: unknown }>): string {
  const xmlCells = cells.map((cell, cellIdx) => {
    const ref = `${columnName(cellIdx + 1)}${rowNumber}`
    return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(cell.value ?? ''))}</t></is></c>`
  }).join('')
  return `<row r="${rowNumber}">${xmlCells}</row>`
}

function columnName(index: number): string {
  let current = index
  let name = ''
  while (current > 0) {
    const remainder = (current - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    current = Math.floor((current - 1) / 26)
  }
  return name
}

function xmlDeclaration(lines: string[]): string {
  return ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', ...lines].join('\n')
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function makeTextBlob(content: string, mimeType: string, extension: string): ExportBlobResult {
  return {
    blob: new Blob([content], { type: `${mimeType};charset=utf-8` }),
    mimeType,
    extension,
  }
}

function renderHtmlDocument(title: string, body: string): string {
  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(title)}</title>`,
    '<style>body{font-family:Arial,sans-serif;line-height:1.55;max-width:780px;margin:40px auto;padding:0 20px;color:#111827}pre{white-space:pre-wrap}</style>',
    '</head>',
    '<body>',
    `<h1>${escapeHtml(title)}</h1>`,
    `<pre>${escapeHtml(body)}</pre>`,
    '</body>',
    '</html>',
  ].join('\n')
}

function renderCsv(manifest: Record<string, unknown> | undefined, fallback: string): string {
  const rows = manifest?.rows
  if (Array.isArray(rows) && rows.every(row => row && typeof row === 'object' && !Array.isArray(row))) {
    const objects = rows as Array<Record<string, unknown>>
    const headers = Array.from(new Set(objects.flatMap(row => Object.keys(row))))
    return [headers.join(','), ...objects.map(row => headers.map(header => csvCell(row[header])).join(','))].join('\n')
  }
  return `conteudo\n${csvCell(fallback)}`
}

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
import type {
  ChatAgentWorkPackage,
  ChatArtifactExportRef,
  ChatArtifactFormat,
  ChatArtifactKind,
  ChatArtifactRef,
  StudioArtifact,
  StudioArtifactType,
} from './firestore-types'
import { generateDocxBlob } from './docx-generator'
import { uploadChatArtifactFile, uploadNotebookArtifactFile, type StoredChatArtifactFile } from './chat-artifact-storage'

const TEXT_FORMATS = new Set<ChatArtifactFormat>(['markdown', 'txt', 'typescript', 'javascript', 'python'])
const SUPPORTED_EXPORT_FORMATS = new Set<ChatArtifactFormat>([
  'markdown',
  'txt',
  'json',
  'html',
  'csv',
  'docx',
  'pdf',
  'pptx',
  'xlsx',
  'typescript',
  'javascript',
  'python',
  'zip',
])

interface MaterializeOptions {
  userId: string
  conversationId: string
  turnId: string
  uploadFile?: (args: {
    artifactId: string
    exportId: string
    title: string
    extension: string
    blob: Blob
  }) => Promise<StoredChatArtifactFile>
}

interface MaterializeStudioArtifactOptions {
  userId: string
  notebookId: string
}

interface ExportBlobResult {
  blob: Blob
  extension: string
  mimeType: string
}

const EXPORT_UPLOAD_MAX_ATTEMPTS = 3
const EXPORT_UPLOAD_TIMEOUT_MS = 45_000

export async function materializeChatAgentWorkPackageExports(
  workPackage: ChatAgentWorkPackage,
  options: MaterializeOptions,
): Promise<ChatAgentWorkPackage> {
  const artifacts = await Promise.all((workPackage.artifacts ?? []).map(artifact => materializeArtifactExports(artifact, workPackage, options)))
  return { ...workPackage, artifacts }
}

export async function materializeStudioArtifactExports(
  artifact: StudioArtifact,
  options: MaterializeStudioArtifactOptions,
): Promise<StudioArtifact> {
  const chatArtifact = studioArtifactToChatArtifactRef(artifact)
  const workPackage = studioArtifactToWorkPackage(artifact, options.notebookId)
  const materialized = await materializeArtifactExports(chatArtifact, workPackage, {
    userId: options.userId,
    conversationId: `notebook-${options.notebookId}`,
    turnId: 'studio-artifacts',
    uploadFile: ({ artifactId, exportId, title, extension, blob }) => uploadNotebookArtifactFile({
      userId: options.userId,
      notebookId: options.notebookId,
      artifactId,
      exportId,
      title,
      extension,
      blob,
    }),
  })

  return {
    ...artifact,
    download_url: materialized.download_url,
    storage_path: materialized.storage_path,
    mime_type: materialized.mime_type,
    extension: materialized.extension,
    exports: materialized.exports,
  }
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
      const attemptCount = (exportRef.attempt_count ?? 0) + 1
      const uploadFile = options.uploadFile ?? ((args: {
        artifactId: string
        exportId: string
        title: string
        extension: string
        blob: Blob
      }) => uploadChatArtifactFile({
          userId: options.userId,
          conversationId: options.conversationId,
          turnId: options.turnId,
          artifactId: args.artifactId,
          exportId: args.exportId,
          title: args.title,
          extension: args.extension,
          blob: args.blob,
        }))
      const stored = await uploadExportWithRetry(() => uploadFile({
          artifactId: artifact.artifact_id,
          exportId,
          title: artifact.title,
          extension: generated.extension,
          blob: generated.blob,
        }),
        EXPORT_UPLOAD_MAX_ATTEMPTS,
      )
      const readyExport: ChatArtifactExportRef = {
        ...exportRef,
        export_id: exportId,
        status: 'ready',
        mime_type: generated.mimeType,
        extension: generated.extension,
        download_url: stored.url,
        storage_path: stored.path,
        attempt_count: attemptCount,
        last_attempt_at: new Date().toISOString(),
      }
      exports.push(readyExport)
      if (!primaryDownloadUrl && exportRef.format === artifact.format) primaryDownloadUrl = stored.url
      if (!primaryStoragePath && exportRef.format === artifact.format) primaryStoragePath = stored.path
    } catch (error) {
      exports.push({
        ...exportRef,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        attempt_count: (exportRef.attempt_count ?? 0) + 1,
        last_attempt_at: new Date().toISOString(),
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
  if ((artifact.kind === 'text' || artifact.kind === 'legal_document') && !byFormat.has('pdf')) {
    byFormat.set('pdf', { label: 'PDF', format: 'pdf', status: 'planned' })
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
  if (!byFormat.has('zip')) {
    byFormat.set('zip', { label: 'ZIP', format: 'zip', status: 'planned' })
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
  if (format === 'pdf') {
    const blob = buildPdfBlob(artifact.title, text)
    return { blob, mimeType: 'application/pdf', extension: '.pdf' }
  }
  if (format === 'pptx') {
    const blob = await buildPptxBlob(artifact, text)
    return { blob, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: '.pptx' }
  }
  if (format === 'xlsx') {
    const blob = await buildXlsxBlob(artifact, text)
    return { blob, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: '.xlsx' }
  }
  if (format === 'zip') {
    const blob = await buildZipBlob(artifact, workPackage, text)
    return { blob, mimeType: 'application/zip', extension: '.zip' }
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

function buildPdfBlob(title: string, text: string): Blob {
  const pages = paginatePdfLines([title, '', ...wrapPdfText(text || 'Conteúdo gerado pelo Lexio.')])
  const objects: string[] = []
  const pageObjectIds: number[] = []

  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push('')
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  pages.forEach((lines, index) => {
    const contentObjectId = 4 + index * 2
    const pageObjectId = contentObjectId + 1
    pageObjectIds.push(pageObjectId)
    objects.push(renderPdfContentStream(lines, index === 0))
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`)
  })

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`

  const chunks: string[] = ['%PDF-1.4\n']
  const offsets: number[] = [0]
  let cursor = chunks[0].length
  objects.forEach((body, index) => {
    offsets.push(cursor)
    const objectText = `${index + 1} 0 obj\n${body}\nendobj\n`
    chunks.push(objectText)
    cursor += objectText.length
  })
  const xrefOffset = cursor
  chunks.push(`xref\n0 ${objects.length + 1}\n`)
  chunks.push('0000000000 65535 f \n')
  offsets.slice(1).forEach(offset => chunks.push(`${String(offset).padStart(10, '0')} 00000 n \n`))
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)

  return new Blob(chunks, { type: 'application/pdf' })
}

function renderPdfContentStream(lines: string[], firstPage: boolean): string {
  const textOps = lines.map((line, index) => {
    const fontSize = firstPage && index === 0 ? 16 : 11
    const y = firstPage && index === 0 ? 790 : 760 - index * 15
    return `BT /F1 ${fontSize} Tf 56 ${y} Td <${toPdfUtf16Hex(line)}> Tj ET`
  }).join('\n')
  return `<< /Length ${textOps.length} >>\nstream\n${textOps}\nendstream`
}

function wrapPdfText(value: string): string[] {
  const lines: string[] = []
  for (const paragraph of value.replace(/\r\n/g, '\n').split('\n')) {
    const clean = paragraph.trim()
    if (!clean) {
      lines.push('')
      continue
    }
    let current = ''
    for (const word of clean.split(/\s+/)) {
      const next = current ? `${current} ${word}` : word
      if (next.length > 92 && current) {
        lines.push(current)
        current = word
      } else {
        current = next
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

function paginatePdfLines(lines: string[]): string[][] {
  const pageSize = 48
  const pages: string[][] = []
  for (let index = 0; index < lines.length; index += pageSize) {
    pages.push(lines.slice(index, index + pageSize))
  }
  return pages.length ? pages : [['Conteúdo gerado pelo Lexio.']]
}

function toPdfUtf16Hex(value: string): string {
  const bytes = [0xfe, 0xff]
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    bytes.push((code >> 8) & 0xff, code & 0xff)
  }
  return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

async function buildZipBlob(
  artifact: ChatArtifactRef,
  workPackage: ChatAgentWorkPackage,
  fallbackText: string,
): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const baseName = sanitizeFileStem(artifact.title || artifact.artifact_id)
  const primaryExtension = artifact.format === 'markdown' ? 'md' : artifact.format === 'typescript' ? 'ts' : artifact.format === 'javascript' ? 'js' : artifact.format === 'python' ? 'py' : artifact.format

  zip.file('README.md', [
    `# ${artifact.title}`,
    '',
    artifact.summary || 'Pacote de artefato gerado pelo Lexio Chat.',
    '',
    `- Artefato: ${artifact.artifact_id}`,
    `- Documento lógico: ${artifact.logical_document_id}`,
    `- Versão: ${artifact.version}`,
    `- Formato primário: ${artifact.format}`,
  ].join('\n'))
  zip.file(`${baseName}.${primaryExtension}`, fallbackText || artifact.summary || artifact.title)
  zip.file('work-package.json', JSON.stringify(workPackage, null, 2))
  zip.file('artifact.json', JSON.stringify(artifact, null, 2))
  if (artifact.manifest_json) {
    zip.file('manifest.json', JSON.stringify(artifact.manifest_json, null, 2))
  }
  if (workPackage.result_markdown) {
    zip.file('result.md', workPackage.result_markdown)
  }

  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}

function normalizePresentationSlides(artifact: ChatArtifactRef, fallbackText: string): Array<{ title: string; bullets: string[]; body: string; notes: string }> {
  const rawSlides = findPresentationSlides(artifact.manifest_json)
  if (rawSlides.length) {
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

function findPresentationSlides(manifest: Record<string, unknown> | undefined): unknown[] {
  if (!manifest) return []
  const candidates = [
    manifest.slides,
    getRecord(manifest.presentation)?.slides,
    getRecord(manifest.deck)?.slides,
    getRecord(manifest.data)?.slides,
    getRecord(getRecord(manifest.data)?.presentation)?.slides,
    getRecord(getRecord(manifest.data)?.deck)?.slides,
  ]
  const slides = candidates.find(Array.isArray)
  return Array.isArray(slides) ? slides : []
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function normalizePresentationSlide(rawSlide: unknown, idx: number): { title: string; bullets: string[]; body: string; notes: string } | null {
  if (!rawSlide || typeof rawSlide !== 'object' || Array.isArray(rawSlide)) return null
  const record = rawSlide as Record<string, unknown>
  const title = String(record.title || record.heading || `Slide ${idx + 1}`).trim()
  const rawBullets = Array.isArray(record.bullets)
    ? record.bullets
    : Array.isArray(record.items)
      ? record.items
      : Array.isArray(record.keyPoints)
        ? record.keyPoints
        : Array.isArray(record.key_points)
          ? record.key_points
          : Array.isArray(record.bulletPoints)
            ? record.bulletPoints
            : []
  const bullets = rawBullets.map(item => String(item).trim()).filter(Boolean).slice(0, 8)
  const body = String(record.body || record.content || record.summary || record.narrative || bullets.join('\n')).trim()
  const notes = String(record.notes || record.speakerNotes || record.speaker_notes || record.narration || body).trim()
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

function sanitizeFileStem(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return normalized || 'artefato'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function uploadExportWithRetry<T>(operation: () => Promise<T>, maxAttempts: number): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withTimeout(operation(), EXPORT_UPLOAD_TIMEOUT_MS)
    } catch (error) {
      lastError = error
      if (attempt >= maxAttempts || !isTransientExportError(error)) break
      await delay(Math.min(150 * attempt, 500))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Falha ao materializar export do chat.'))
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Tempo limite excedido ao enviar export para o Storage.')), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function isTransientExportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '')
  return /timeout|tempo limite|network|rede|retry|429|5\d\d|tempor/i.test(message)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function studioArtifactToChatArtifactRef(artifact: StudioArtifact): ChatArtifactRef {
  return {
    artifact_id: artifact.id,
    logical_document_id: artifact.id,
    version: 1,
    title: artifact.title,
    kind: mapStudioArtifactKind(artifact.type),
    format: artifact.format,
    summary: summarizeStudioArtifactContent(artifact.content),
    manifest_json: parseStudioArtifactManifest(artifact),
    content_preview: artifact.content,
    storage_path: artifact.storage_path,
    download_url: artifact.download_url,
    mime_type: artifact.mime_type,
    extension: artifact.extension,
    is_latest: true,
    exports: artifact.exports,
  }
}

function studioArtifactToWorkPackage(artifact: StudioArtifact, notebookId: string): ChatAgentWorkPackage {
  return {
    conversation_id: `notebook-${notebookId}`,
    turn_id: 'studio-artifacts',
    agent_key: 'chat_export_packager',
    task: `Materializar exports do artefato ${artifact.title}`,
    result_markdown: artifact.content,
    created_at: artifact.created_at,
    artifacts: [studioArtifactToChatArtifactRef(artifact)],
  }
}

function mapStudioArtifactKind(artifactType: StudioArtifactType): ChatArtifactKind {
  if (artifactType === 'apresentacao' || artifactType === 'apresentacao_v2') return 'presentation'
  if (artifactType === 'audio_script') return 'audio'
  if (artifactType === 'video_script' || artifactType === 'video_production') return 'video'
  if (artifactType === 'tabela_dados') return 'spreadsheet'
  if (artifactType === 'mapa_mental' || artifactType === 'infografico') return 'image'
  if (artifactType === 'teste' || artifactType === 'cartoes_didaticos') return 'data'
  return 'text'
}

function parseStudioArtifactManifest(artifact: StudioArtifact): Record<string, unknown> | undefined {
  if (artifact.format !== 'json') return undefined
  try {
    const parsed = JSON.parse(artifact.content) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { value: parsed }
  } catch {
    return undefined
  }
}

function summarizeStudioArtifactContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 280)
}
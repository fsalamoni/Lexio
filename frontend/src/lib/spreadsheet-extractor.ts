import JSZip from 'jszip'
import { getFileExtension } from './file-text-extractor'

export interface SpreadsheetSheetSummary {
  name: string
  rowCount: number
  columnCount: number
  previewRows: string[][]
}

export interface SpreadsheetExtractionResult {
  text: string
  sheetCount: number
  rowCount: number
  columnCount: number
  sheets: SpreadsheetSheetSummary[]
}

const MAX_PREVIEW_ROWS_PER_SHEET = 20
const MAX_PREVIEW_COLUMNS = 20

export async function extractSpreadsheetTextWithMeta(file: File): Promise<SpreadsheetExtractionResult> {
  const extension = getFileExtension(file.name)
  if (extension === '.csv') return extractCsv(file)
  if (extension === '.xlsx') return extractXlsx(file)
  throw new Error(`Formato de planilha ainda não suportado para extração automática: ${extension || file.type || 'desconhecido'}.`)
}

async function extractCsv(file: File): Promise<SpreadsheetExtractionResult> {
  const text = await file.text()
  const delimiter = guessDelimiter(text)
  const rows = parseDelimitedRows(text, delimiter)
  const normalizedRows = rows.filter(row => row.some(cell => cell.trim()))
  const columnCount = normalizedRows.reduce((max, row) => Math.max(max, row.length), 0)
  const sheet: SpreadsheetSheetSummary = {
    name: 'CSV',
    rowCount: normalizedRows.length,
    columnCount,
    previewRows: normalizedRows.slice(0, MAX_PREVIEW_ROWS_PER_SHEET).map(row => row.slice(0, MAX_PREVIEW_COLUMNS)),
  }
  return buildSpreadsheetResult(file.name, [sheet])
}

async function extractXlsx(file: File): Promise<SpreadsheetExtractionResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const sharedStrings = await readSharedStrings(zip)
  const workbookSheets = await readWorkbookSheets(zip)
  const worksheetPaths = Object.values(workbookSheets).length
    ? Object.values(workbookSheets).map(sheet => sheet.path)
    : Object.keys(zip.files).filter(path => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path)).sort(naturalCompare)

  const sheets: SpreadsheetSheetSummary[] = []
  for (const [index, path] of worksheetPaths.entries()) {
    const xml = await zip.file(path)?.async('text')
    if (!xml) continue
    const byPath = Object.values(workbookSheets).find(sheet => sheet.path === path)
    const rows = parseWorksheetRows(xml, sharedStrings)
    const normalizedRows = rows.filter(row => row.some(cell => cell.trim()))
    sheets.push({
      name: byPath?.name || `Planilha ${index + 1}`,
      rowCount: normalizedRows.length,
      columnCount: normalizedRows.reduce((max, row) => Math.max(max, row.length), 0),
      previewRows: normalizedRows.slice(0, MAX_PREVIEW_ROWS_PER_SHEET).map(row => row.slice(0, MAX_PREVIEW_COLUMNS)),
    })
  }

  if (!sheets.length) throw new Error('Nenhuma aba legível foi encontrada no arquivo XLSX.')
  return buildSpreadsheetResult(file.name, sheets)
}

function buildSpreadsheetResult(fileName: string, sheets: SpreadsheetSheetSummary[]): SpreadsheetExtractionResult {
  const rowCount = sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0)
  const columnCount = sheets.reduce((max, sheet) => Math.max(max, sheet.columnCount), 0)
  const lines = [`Planilha: ${fileName}`, `Abas: ${sheets.length}`, `Linhas detectadas: ${rowCount}`, `Máximo de colunas: ${columnCount}`]
  for (const sheet of sheets) {
    lines.push('', `## Aba: ${sheet.name}`, `Linhas: ${sheet.rowCount} · Colunas: ${sheet.columnCount}`)
    if (sheet.previewRows.length) {
      lines.push('Prévia:')
      for (const row of sheet.previewRows) {
        lines.push(`- ${row.map(cell => cell.trim()).join(' | ')}`)
      }
    }
  }
  return {
    text: lines.join('\n'),
    sheetCount: sheets.length,
    rowCount,
    columnCount,
    sheets,
  }
}

function guessDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n')
  const candidates = [',', ';', '\t']
  return candidates
    .map(delimiter => ({ delimiter, count: (sample.match(new RegExp(escapeRegExp(delimiter), 'g')) ?? []).length }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter || ','
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (!quoted && char === delimiter) {
      row.push(cell)
      cell = ''
      continue
    }
    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += char
  }
  row.push(cell)
  if (row.length > 1 || row[0] !== '') rows.push(row)
  return rows
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const xml = await zip.file('xl/sharedStrings.xml')?.async('text')
  if (!xml) return []
  return [...xml.matchAll(/<si[\s\S]*?<\/si>/g)].map(match => extractTextNodes(match[0]))
}

async function readWorkbookSheets(zip: JSZip): Promise<Record<string, { name: string; path: string }>> {
  const workbook = await zip.file('xl/workbook.xml')?.async('text')
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('text')
  if (!workbook || !rels) return {}

  const relTargetById = new Map<string, string>()
  for (const match of rels.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const attrs = parseXmlAttributes(match[1])
    if (attrs.Id && attrs.Target) {
      relTargetById.set(attrs.Id, attrs.Target.startsWith('xl/') ? attrs.Target : `xl/${attrs.Target.replace(/^\//, '')}`)
    }
  }

  const sheets: Record<string, { name: string; path: string }> = {}
  for (const match of workbook.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const attrs = parseXmlAttributes(match[1])
    const relId = attrs['r:id'] || attrs.id
    const target = relId ? relTargetById.get(relId) : undefined
    if (target) sheets[relId] = { name: decodeXml(attrs.name || 'Planilha'), path: target }
  }
  return sheets
}

function parseWorksheetRows(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = []
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = []
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = parseXmlAttributes(cellMatch[1])
      const colIndex = cellReferenceToColumnIndex(attrs.r || '') ?? row.length
      while (row.length < colIndex) row.push('')
      row[colIndex] = extractCellValue(cellMatch[2], attrs.t, sharedStrings)
    }
    rows.push(row)
  }
  return rows
}

function extractCellValue(xml: string, type: string | undefined, sharedStrings: string[]): string {
  if (type === 'inlineStr') return extractTextNodes(xml)
  const value = xml.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1]
  if (value == null) return extractTextNodes(xml)
  const decoded = decodeXml(value.trim())
  if (type === 's') return sharedStrings[Number(decoded)] ?? decoded
  if (type === 'b') return decoded === '1' ? 'TRUE' : 'FALSE'
  return decoded
}

function extractTextNodes(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
    .map(match => decodeXml(match[1]))
    .join('')
    .trim()
}

function parseXmlAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const match of raw.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXml(match[2])
  }
  return attrs
}

function cellReferenceToColumnIndex(reference: string): number | null {
  const letters = reference.match(/^[A-Z]+/i)?.[0]
  if (!letters) return null
  let index = 0
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + (letter.charCodeAt(0) - 64)
  }
  return index - 1
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

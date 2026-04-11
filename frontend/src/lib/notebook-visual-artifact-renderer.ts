import type {
  ParsedDataTable,
  ParsedInfographic,
  ParsedMindMap,
  ParsedPresentation,
  ParsedSlide,
  MindMapNode,
} from './artifact-parsers'

export interface RenderedArtifactImage {
  blob: Blob
  mimeType: string
  extension: string
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars) {
      current = next
      continue
    }
    if (current) lines.push(current)
    current = word.length > maxChars ? `${word.slice(0, Math.max(0, maxChars - 1))}…` : word
  }

  if (current) lines.push(current)
  return lines
}

function linesToSvg(lines: string[], x: number, y: number, lineHeight: number, className: string): string {
  return lines
    .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" class="${className}">${escapeXml(line)}</text>`)
    .join('')
}

async function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Falha ao carregar SVG renderizado.'))
      img.src = svgUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas 2D indisponível para renderizar imagem.')
    }

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png', 0.96)
    })

    if (!blob) {
      throw new Error('Falha ao converter artefato visual para PNG.')
    }

    return blob
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

function buildBaseSvg(width: number, height: number, body: string, extraStyles = ''): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<defs>',
    '  <linearGradient id="heroGradient" x1="0" x2="1" y1="0" y2="1">',
    '    <stop offset="0%" stop-color="#0f172a"/>',
    '    <stop offset="100%" stop-color="#1d4ed8"/>',
    '  </linearGradient>',
    '  <linearGradient id="softGradient" x1="0" x2="1" y1="0" y2="1">',
    '    <stop offset="0%" stop-color="#eff6ff"/>',
    '    <stop offset="100%" stop-color="#dbeafe"/>',
    '  </linearGradient>',
    '</defs>',
    '<style>',
    '  .title { font: 700 40px Georgia, serif; fill: #0f172a; }',
    '  .subtitle { font: 500 22px Georgia, serif; fill: #475569; }',
    '  .body { font: 500 20px Georgia, serif; fill: #1f2937; }',
    '  .caption { font: 600 16px Georgia, serif; fill: #64748b; letter-spacing: 0.04em; text-transform: uppercase; }',
    '  .small { font: 500 14px Georgia, serif; fill: #475569; }',
    '  .strong { font: 700 24px Georgia, serif; fill: #0f172a; }',
    extraStyles,
    '</style>',
    body,
    '</svg>',
  ].join('')
}

export async function renderPresentationSlidePoster(
  presentation: ParsedPresentation,
  slide: ParsedSlide,
  options?: { backgroundImageUrl?: string },
): Promise<RenderedArtifactImage> {
  const width = 1600
  const height = 900
  const titleLines = wrapText(slide.title, 30).slice(0, 3)
  const bulletLines = slide.bullets.slice(0, 5).flatMap((bullet) => wrapText(bullet, 44).slice(0, 2))
  const suggestionLines = wrapText(slide.visualSuggestion || presentation.title || 'Apresentação jurídica', 32).slice(0, 3)
  const backgroundPanel = options?.backgroundImageUrl
    ? [
        `<rect x="1044" y="228" width="366" height="240" rx="24" fill="#dbeafe"/>`,
        `<clipPath id="slideVisualClip"><rect x="1044" y="228" width="366" height="240" rx="24"/></clipPath>`,
        `<image x="1044" y="228" width="366" height="240" href="${escapeXml(options.backgroundImageUrl)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#slideVisualClip)"/>`,
        '<rect x="1044" y="228" width="366" height="240" rx="24" fill="rgba(15,23,42,0.10)"/>',
      ].join('')
    : [
        '<rect x="1044" y="228" width="366" height="240" rx="24" fill="#dbeafe"/>',
        '<path d="M1086 412 C1166 320, 1274 502, 1364 350" fill="none" stroke="#1d4ed8" stroke-width="14" stroke-linecap="round"/>',
        '<circle cx="1120" cy="308" r="24" fill="#93c5fd"/>',
        '<circle cx="1278" cy="284" r="18" fill="#60a5fa"/>',
        '<circle cx="1358" cy="372" r="28" fill="#3b82f6"/>',
      ].join('')

  const body = [
    `<rect width="${width}" height="${height}" fill="url(#heroGradient)"/>`,
    '<circle cx="1320" cy="160" r="180" fill="rgba(255,255,255,0.10)"/>',
    '<circle cx="1440" cy="740" r="220" fill="rgba(255,255,255,0.08)"/>',
    '<rect x="78" y="84" width="1444" height="732" rx="36" fill="rgba(255,255,255,0.94)"/>',
    `<text x="126" y="152" class="caption">${escapeXml(presentation.title || 'Apresentação')}</text>`,
    linesToSvg(titleLines, 126, 238, 58, 'title'),
    bulletLines
      .map((line, index) => {
        const y = 360 + index * 48
        return [
          `<circle cx="144" cy="${y - 8}" r="7" fill="#2563eb"/>`,
          `<text x="168" y="${y}" class="body">${escapeXml(line)}</text>`,
        ].join('')
      })
      .join(''),
    '<rect x="1012" y="194" width="430" height="468" rx="30" fill="url(#softGradient)" stroke="#bfdbfe" stroke-width="3"/>',
    backgroundPanel,
    linesToSvg(suggestionLines, 1048, 540, 34, 'strong'),
    '<text x="1048" y="678" class="small">Slide visual final pronto para uso no caderno e em exportações.</text>',
    `<text x="126" y="760" class="small">Slide ${slide.number} • Gerado automaticamente pelo Studio Lexio</text>`,
  ].join('')

  return {
    blob: await svgToPngBlob(buildBaseSvg(width, height, body), width, height),
    mimeType: 'image/png',
    extension: '.png',
  }
}

export async function renderInfographicImage(data: ParsedInfographic): Promise<RenderedArtifactImage> {
  const width = 1400
  const height = Math.max(1200, 360 + data.sections.length * 220 + (data.sources?.length ? 120 : 0))
  const palette = ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#e0e7ff', '#cffafe']
  const accent = ['#2563eb', '#059669', '#d97706', '#db2777', '#4f46e5', '#0891b2']

  const sectionBlocks = data.sections.map((section, index) => {
    const top = 260 + index * 210
    const bg = palette[index % palette.length]
    const stroke = accent[index % accent.length]
    const titleLines = wrapText(section.title, 24).slice(0, 2)
    const contentLines = wrapText(section.content, 50).slice(0, 4)
    const highlightLines = wrapText(section.highlight || '', 40).slice(0, 2)
    const stats = (section.stats || []).slice(0, 2)

    return [
      `<rect x="80" y="${top}" width="1240" height="170" rx="28" fill="${bg}" stroke="${stroke}" stroke-width="3"/>`,
      `<text x="118" y="${top + 44}" class="caption">${escapeXml(section.icon || `Seção ${index + 1}`)}</text>`,
      linesToSvg(titleLines, 118, top + 86, 34, 'strong'),
      linesToSvg(contentLines, 118, top + 126, 30, 'body'),
      highlightLines.length
        ? `<text x="118" y="${top + 154}" class="small">${escapeXml(highlightLines.join(' • '))}</text>`
        : '',
      stats.map((stat, statIndex) => {
        const left = 920 + statIndex * 180
        return [
          `<rect x="${left}" y="${top + 34}" width="148" height="92" rx="22" fill="#ffffff" opacity="0.92"/>`,
          `<text x="${left + 18}" y="${top + 76}" class="strong">${escapeXml(String(stat.value))}${stat.unit ? ` ${escapeXml(stat.unit)}` : ''}</text>`,
          `<text x="${left + 18}" y="${top + 108}" class="small">${escapeXml(stat.label)}</text>`,
        ].join('')
      }).join(''),
    ].join('')
  }).join('')

  const sources = (data.sources || []).slice(0, 5)
  const sourceLines = sources.map((source, index) => `<text x="110" y="${height - 84 + index * 20}" class="small">• ${escapeXml(source)}</text>`).join('')

  const body = [
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<rect x="0" y="0" width="${width}" height="180" fill="url(#heroGradient)"/>`,
    `<text x="84" y="82" style="font:700 56px Georgia, serif; fill:#ffffff;">${escapeXml(data.title)}</text>`,
    data.subtitle ? `<text x="84" y="126" style="font:500 24px Georgia, serif; fill:rgba(255,255,255,0.88);">${escapeXml(data.subtitle)}</text>` : '',
    sectionBlocks,
    data.conclusion
      ? `<rect x="80" y="${height - 220}" width="1240" height="88" rx="24" fill="#0f172a"/><text x="112" y="${height - 170}" style="font:500 22px Georgia, serif; fill:#ffffff;">${escapeXml(wrapText(data.conclusion, 88).slice(0, 2).join(' '))}</text>`
      : '',
    sources.length ? `<text x="110" y="${height - 110}" class="caption">Fontes</text>${sourceLines}` : '',
  ].join('')

  return {
    blob: await svgToPngBlob(buildBaseSvg(width, height, body), width, height),
    mimeType: 'image/png',
    extension: '.png',
  }
}

function countMindMapNodes(node: MindMapNode): number {
  return 1 + (node.children || []).reduce((sum, child) => sum + countMindMapNodes(child), 0)
}

function flattenMindMap(node: MindMapNode, depth: number, output: Array<{ label: string; depth: number; color?: string }>): void {
  output.push({ label: node.label, depth, color: node.color })
  for (const child of node.children || []) {
    flattenMindMap(child, depth + 1, output)
  }
}

export async function renderMindMapImage(data: ParsedMindMap): Promise<RenderedArtifactImage> {
  const flattened: Array<{ label: string; depth: number; color?: string }> = []
  data.branches.forEach((branch) => flattenMindMap(branch, 1, flattened))
  const width = 1400
  const nodeCount = data.branches.reduce((sum, branch) => sum + countMindMapNodes(branch), 0)
  const height = Math.max(900, 220 + nodeCount * 56)

  const rows = flattened.map((node, index) => {
    const y = 220 + index * 52
    const x = 110 + (node.depth - 1) * 120
    const widthNode = Math.max(220, 820 - (node.depth - 1) * 90)
    const color = node.color || ['#2563eb', '#059669', '#d97706', '#7c3aed'][index % 4]
    return [
      node.depth > 1 ? `<line x1="${x - 44}" y1="${y + 2}" x2="${x - 8}" y2="${y + 2}" stroke="${color}" stroke-width="3"/>` : '',
      `<rect x="${x}" y="${y - 28}" width="${widthNode}" height="38" rx="18" fill="#ffffff" stroke="${color}" stroke-width="3"/>`,
      `<text x="${x + 20}" y="${y - 3}" class="body">${escapeXml(wrapText(node.label, 54).slice(0, 1)[0] || node.label)}</text>`,
    ].join('')
  }).join('')

  const body = [
    `<rect width="${width}" height="${height}" fill="#f8fafc"/>`,
    `<rect x="64" y="56" width="1272" height="92" rx="32" fill="url(#heroGradient)"/>`,
    `<text x="110" y="116" style="font:700 42px Georgia, serif; fill:#ffffff;">${escapeXml(data.centralNode)}</text>`,
    rows,
    '<text x="110" y="176" class="caption">Mapa mental final em imagem</text>',
  ].join('')

  return {
    blob: await svgToPngBlob(buildBaseSvg(width, height, body), width, height),
    mimeType: 'image/png',
    extension: '.png',
  }
}

export async function renderDataTableImage(data: ParsedDataTable): Promise<RenderedArtifactImage> {
  const width = 1600
  const visibleRows = data.rows.slice(0, 12)
  const height = Math.max(820, 250 + visibleRows.length * 54 + (data.summary ? 68 : 0) + (data.footnotes?.length ? 90 : 0))
  const colWidth = Math.floor(1360 / Math.max(1, data.columns.length))

  const header = data.columns.map((column, index) => {
    const x = 120 + index * colWidth
    return [
      `<rect x="${x}" y="176" width="${colWidth}" height="52" fill="#0f172a"/>`,
      `<text x="${x + 16}" y="208" style="font:700 18px Georgia, serif; fill:#ffffff;">${escapeXml(wrapText(column.label, 16).slice(0, 1)[0] || column.label)}</text>`,
    ].join('')
  }).join('')

  const rows = visibleRows.map((row, rowIndex) => {
    const y = 228 + rowIndex * 52
    return data.columns.map((column, columnIndex) => {
      const x = 120 + columnIndex * colWidth
      const value = row[column.key] === undefined ? '' : String(row[column.key])
      const bg = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc'
      return [
        `<rect x="${x}" y="${y}" width="${colWidth}" height="52" fill="${bg}" stroke="#cbd5e1" stroke-width="1"/>`,
        `<text x="${x + 16}" y="${y + 32}" class="small">${escapeXml(wrapText(value, 18).slice(0, 1)[0] || value)}</text>`,
      ].join('')
    }).join('')
  }).join('')

  const summaryY = 228 + visibleRows.length * 52
  const summary = data.summary ? data.columns.map((column, columnIndex) => {
    const x = 120 + columnIndex * colWidth
    const value = data.summary?.[column.key] === undefined ? (columnIndex === 0 ? 'Total' : '') : String(data.summary[column.key])
    return [
      `<rect x="${x}" y="${summaryY}" width="${colWidth}" height="56" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1"/>`,
      `<text x="${x + 16}" y="${summaryY + 34}" class="body">${escapeXml(wrapText(value, 18).slice(0, 1)[0] || value)}</text>`,
    ].join('')
  }).join('') : ''

  const footnotes = (data.footnotes || []).slice(0, 3).map((note, index) => `<text x="120" y="${height - 60 + index * 18}" class="small">${index + 1}. ${escapeXml(note)}</text>`).join('')

  const body = [
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="120" y="94" class="title">${escapeXml(data.title)}</text>`,
    data.legend ? `<text x="120" y="130" class="subtitle">${escapeXml(wrapText(data.legend, 92).slice(0, 1)[0] || data.legend)}</text>` : '',
    header,
    rows,
    summary,
    footnotes,
  ].join('')

  return {
    blob: await svgToPngBlob(buildBaseSvg(width, height, body), width, height),
    mimeType: 'image/png',
    extension: '.png',
  }
}
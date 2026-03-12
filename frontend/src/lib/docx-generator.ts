/**
 * Client-side DOCX generator.
 *
 * Generates .docx files directly in the browser using the `docx` library.
 * Used in Firebase mode where there's no backend to generate DOCX.
 *
 * Mirrors the formatting from packages/pipeline/docx_generator.py:
 * - A4, Times New Roman 12pt, 1.5 spacing
 * - Section headers (ALL CAPS) centered + bold
 * - Body paragraphs justified with 1.25cm first-line indent
 */

import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  convertInchesToTwip,
  Packer,
  type ISectionOptions,
} from 'docx'
import { saveAs } from 'file-saver'

// ── Constants ─────────────────────────────────────────────────────────────────

const FONT_NAME = 'Times New Roman'
const FONT_SIZE = 24 // half-points (12pt = 24)
const LINE_SPACING = 360 // 1.5 lines in twips (240 * 1.5)

const CM = (cm: number) => Math.round(cm * 567) // cm to twips

// ── Helpers ───────────────────────────────────────────────────────────────────

function isHeaderLine(text: string): boolean {
  return (
    text === text.toUpperCase() &&
    text.length < 200 &&
    text.length > 2 &&
    !text.startsWith('[')
  )
}

function buildParagraphs(text: string): Paragraph[] {
  const blocks = text.split(/\n\n+/)
  const paragraphs: Paragraph[] = []

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed) continue

    if (isHeaderLine(trimmed)) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({
              text: trimmed,
              bold: true,
              font: FONT_NAME,
              size: FONT_SIZE,
            }),
          ],
        }),
      )
    } else {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: CM(1.25) },
          spacing: { after: 120, line: LINE_SPACING },
          children: [
            new TextRun({
              text: trimmed,
              font: FONT_NAME,
              size: FONT_SIZE,
            }),
          ],
        }),
      )
    }
  }

  return paragraphs
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate a DOCX file from plain text and trigger download.
 *
 * @param text     - The full document text (plain text with \\n\\n paragraph separators)
 * @param filename - Output filename (without extension)
 * @param docType  - Document type label for the title
 * @param tema     - Document topic for the subtitle
 */
export async function generateAndDownloadDocx(
  text: string,
  filename: string,
  docType?: string,
  tema?: string,
): Promise<void> {
  const titleParagraphs: Paragraph[] = []

  if (docType) {
    titleParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: docType.toUpperCase(),
            bold: true,
            font: FONT_NAME,
            size: 28, // 14pt
          }),
        ],
      }),
    )
  }

  if (tema) {
    titleParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: tema,
            italics: true,
            font: FONT_NAME,
            size: FONT_SIZE,
          }),
        ],
      }),
    )
  }

  // Add a separator line after the title
  if (titleParagraphs.length > 0) {
    titleParagraphs.push(
      new Paragraph({ spacing: { after: 240 }, children: [] }),
    )
  }

  const section: ISectionOptions = {
    properties: {
      page: {
        size: {
          width: convertInchesToTwip(8.27),  // A4 width
          height: convertInchesToTwip(11.69), // A4 height
        },
        margin: {
          top: CM(3),
          bottom: CM(2),
          left: CM(3),
          right: CM(2),
        },
      },
    },
    children: [...titleParagraphs, ...buildParagraphs(text)],
  }

  const doc = new Document({
    sections: [section],
    styles: {
      default: {
        document: {
          run: {
            font: FONT_NAME,
            size: FONT_SIZE,
          },
          paragraph: {
            spacing: { line: LINE_SPACING },
          },
        },
      },
    },
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `${filename}.docx`)
}

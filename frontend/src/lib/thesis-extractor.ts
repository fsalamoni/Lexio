/**
 * Client-side thesis extraction via LLM.
 *
 * Mirrors the backend `packages/modules/thesis_bank/auto_populate.py`.
 * Calls the LLM to identify reusable legal theses from a text (either
 * a generated document or an uploaded acervo reference document), then
 * stores them in the Firestore thesis bank.
 */

import { callLLM } from './llm-client'
import { createThesis, type ThesisData } from './firestore-service'

// ── Constants ────────────────────────────────────────────────────────────────

/** Minimum text length to attempt thesis extraction. */
const MIN_TEXT_LENGTH = 300

/** Max text sent to the LLM for analysis. */
const MAX_TEXT_FOR_ANALYSIS = 8000

/** Model used for extraction (fast + cheap). */
const EXTRACTION_MODEL = 'anthropic/claude-3.5-haiku'

// ── Prompt ───────────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM = [
  'Você é um analista jurídico especializado em identificar teses reaproveitáveis.',
  'Analise o texto jurídico e extraia TESES JURÍDICAS independentes e reutilizáveis.',
  '',
  'Para cada tese, forneça:',
  '- title: Título curto e descritivo (máx 100 caracteres)',
  '- content: O argumento jurídico completo e autossuficiente',
  '- summary: Resumo em 1-2 frases',
  '- category: Categoria (ex: "constitucional", "processual", "material", "probatório")',
  '- tags: Lista de palavras-chave',
  '- quality_score: Nota de 0 a 100 para qualidade da tese',
  '',
  'Retorne APENAS um JSON array com as teses encontradas.',
  'Extraia entre 2 e 5 teses mais relevantes e reutilizáveis.',
  'Ignore argumentos muito específicos ao caso concreto.',
  'Se o texto não contiver teses jurídicas aproveitáveis, retorne um array vazio [].',
].join('\n')

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseJsonFromLLM(raw: string): unknown[] {
  let content = raw.trim()
  // Extract JSON from markdown fenced blocks
  if (content.includes('```json')) {
    content = content.split('```json')[1].split('```')[0].trim()
  } else if (content.includes('```')) {
    content = content.split('```')[1].split('```')[0].trim()
  }
  const parsed = JSON.parse(content)
  return Array.isArray(parsed) ? parsed : [parsed]
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface ThesisExtractionResult {
  created: number
  theses: Array<{ id: string; title: string }>
}

/**
 * Extract theses from a text and store them in the user's Firestore thesis bank.
 *
 * @param apiKey    OpenRouter API key
 * @param uid       Firebase user ID (owner of the thesis bank)
 * @param text      The document or reference text to analyze
 * @param opts      Optional metadata to attach to the created theses
 * @returns         Number of theses created and their titles
 */
export async function extractAndStoreTheses(
  apiKey: string,
  uid: string,
  text: string,
  opts?: {
    legalAreaId?: string
    documentTypeId?: string
    sourceType?: string
  },
): Promise<ThesisExtractionResult> {
  if (!text || text.length < MIN_TEXT_LENGTH) {
    return { created: 0, theses: [] }
  }

  const textForAnalysis = text.slice(0, MAX_TEXT_FOR_ANALYSIS)

  const result = await callLLM(
    apiKey,
    EXTRACTION_SYSTEM,
    `Texto jurídico para análise:\n\n${textForAnalysis}`,
    EXTRACTION_MODEL,
    3000,
    0.2,
  )

  let extracted: unknown[]
  try {
    extracted = parseJsonFromLLM(result.content)
  } catch {
    console.warn('Thesis extraction: failed to parse LLM response')
    return { created: 0, theses: [] }
  }

  const created: Array<{ id: string; title: string }> = []

  for (const raw of extracted) {
    const item = raw as Record<string, unknown>
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    const content = typeof item.content === 'string' ? item.content.trim() : ''
    if (!title || !content) continue

    const thesisData: Partial<ThesisData> = {
      title,
      content,
      summary: typeof item.summary === 'string' ? item.summary : undefined,
      legal_area_id: opts?.legalAreaId || 'geral',
      document_type_id: opts?.documentTypeId ?? undefined,
      tags: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === 'string') : undefined,
      category: typeof item.category === 'string' ? item.category : undefined,
      quality_score: typeof item.quality_score === 'number' ? item.quality_score : undefined,
      source_type: opts?.sourceType || 'auto_extracted',
      usage_count: 0,
    }

    try {
      const thesis = await createThesis(uid, thesisData)
      created.push({ id: thesis.id!, title: thesis.title })
    } catch (err) {
      console.warn('Failed to store extracted thesis:', err)
    }
  }

  return { created: created.length, theses: created }
}

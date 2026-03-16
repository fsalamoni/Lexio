/**
 * Client-side thesis extraction via LLM.
 *
 * Mirrors the backend `packages/modules/thesis_bank/auto_populate.py`.
 * Calls the LLM to identify reusable legal theses from a text (either
 * a generated document or an uploaded acervo reference document), then
 * stores them in the Firestore thesis bank.
 *
 * **Dedup rule**: If a similar thesis already exists (by normalised title),
 * the two are merged into a single, more complete thesis instead of
 * creating a duplicate.
 */

import { callLLM } from './llm-client'
import { createThesis, listTheses, updateThesis, type ThesisData } from './firestore-service'

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

const MERGE_SYSTEM = [
  'Você é um analista jurídico. Recebe duas versões de uma mesma tese jurídica.',
  'Compile as duas versões em uma ÚNICA tese mais completa e robusta.',
  '',
  'Regras:',
  '- Mantenha TODOS os argumentos, fundamentações legais e jurisprudência de ambas versões',
  '- Elimine redundâncias (não repita o mesmo argumento duas vezes)',
  '- O resultado deve ser um texto coeso e bem estruturado',
  '- Mantenha o estilo formal jurídico',
  '',
  'Retorne APENAS um JSON com:',
  '- title: Título mais descritivo (máx 100 caracteres)',
  '- content: O argumento jurídico compilado e completo',
  '- summary: Resumo em 1-2 frases da tese compilada',
].join('\n')

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseJsonFromLLM(raw: string): unknown[] {
  let content = raw.trim()
  if (content.includes('```json')) {
    content = content.split('```json')[1].split('```')[0].trim()
  } else if (content.includes('```')) {
    content = content.split('```')[1].split('```')[0].trim()
  }
  const parsed = JSON.parse(content)
  return Array.isArray(parsed) ? parsed : [parsed]
}

function parseSingleJsonFromLLM(raw: string): Record<string, unknown> {
  let content = raw.trim()
  if (content.includes('```json')) {
    content = content.split('```json')[1].split('```')[0].trim()
  } else if (content.includes('```')) {
    content = content.split('```')[1].split('```')[0].trim()
  }
  return JSON.parse(content)
}

/** Normalise a thesis title for comparison: lowercase, strip accents & punctuation. */
function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s]/g, '')     // strip punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

/** Check whether two normalised titles are similar enough to be considered duplicates. */
function titlesAreSimilar(a: string, b: string): boolean {
  if (a === b) return true
  // One fully contains the other
  if (a.includes(b) || b.includes(a)) return true
  // Jaccard similarity on word sets ≥ 0.6
  const setA = new Set(a.split(' ').filter(Boolean))
  const setB = new Set(b.split(' ').filter(Boolean))
  if (setA.size === 0 || setB.size === 0) return false
  let intersection = 0
  for (const w of setA) {
    if (setB.has(w)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union > 0 && intersection / union >= 0.6
}

/** Merge tags from two arrays, deduplicating. */
function mergeTags(a?: string[] | null, b?: string[] | null): string[] {
  const set = new Set<string>()
  for (const t of a ?? []) set.add(t.toLowerCase())
  for (const t of b ?? []) set.add(t.toLowerCase())
  return Array.from(set)
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface ThesisExtractionResult {
  created: number
  merged: number
  theses: Array<{ id: string; title: string }>
}

/**
 * Extract theses from a text and store them in the user's Firestore thesis bank.
 *
 * **Dedup**: Before storing, fetches existing theses and checks for title
 * similarity. If a similar thesis exists, the two are merged via LLM into
 * a single, more complete thesis. Otherwise a new thesis is created.
 *
 * @param apiKey    OpenRouter API key
 * @param uid       Firebase user ID (owner of the thesis bank)
 * @param text      The document or reference text to analyze
 * @param opts      Optional metadata to attach to the created theses
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
    return { created: 0, merged: 0, theses: [] }
  }

  const textForAnalysis = text.slice(0, MAX_TEXT_FOR_ANALYSIS)

  // 1. Extract theses from the text via LLM
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
    return { created: 0, merged: 0, theses: [] }
  }

  // 2. Load existing theses for dedup (fetch up to 200)
  let existingTheses: ThesisData[] = []
  try {
    const existing = await listTheses(uid, { limit: 200 })
    existingTheses = existing.items
  } catch {
    console.warn('Thesis dedup: failed to load existing theses')
  }

  // Build normalised title index for quick lookup
  const titleIndex = existingTheses.map(t => ({
    thesis: t,
    normalised: normaliseTitle(t.title),
  }))

  const output: Array<{ id: string; title: string }> = []
  let createdCount = 0
  let mergedCount = 0

  for (const raw of extracted) {
    const item = raw as Record<string, unknown>
    const newTitle = typeof item.title === 'string' ? item.title.trim() : ''
    const newContent = typeof item.content === 'string' ? item.content.trim() : ''
    if (!newTitle || !newContent) continue

    const newNorm = normaliseTitle(newTitle)
    const newTags = Array.isArray(item.tags)
      ? item.tags.filter((t): t is string => typeof t === 'string')
      : []
    const newQuality = typeof item.quality_score === 'number' ? item.quality_score : null
    const newSummary = typeof item.summary === 'string' ? item.summary : ''
    const newCategory = typeof item.category === 'string' ? item.category : undefined

    // 3. Check for a similar existing thesis
    const match = titleIndex.find(e => titlesAreSimilar(e.normalised, newNorm))

    if (match) {
      // 4a. Merge: compile both versions into one via LLM
      try {
        const merged = await mergeTheses(apiKey, match.thesis, {
          title: newTitle,
          content: newContent,
          summary: newSummary,
        })

        await updateThesis(uid, match.thesis.id!, {
          title: merged.title,
          content: merged.content,
          summary: merged.summary,
          tags: mergeTags(match.thesis.tags, newTags),
          quality_score: Math.max(match.thesis.quality_score ?? 0, newQuality ?? 0),
          category: newCategory || match.thesis.category || undefined,
        })

        output.push({ id: match.thesis.id!, title: merged.title })
        mergedCount++
      } catch (err) {
        console.warn('Thesis merge failed, skipping duplicate:', err)
      }
    } else {
      // 4b. Create new thesis
      const thesisData: Partial<ThesisData> = {
        title: newTitle,
        content: newContent,
        summary: newSummary || undefined,
        legal_area_id: opts?.legalAreaId || 'geral',
        document_type_id: opts?.documentTypeId ?? undefined,
        tags: newTags.length > 0 ? newTags : undefined,
        category: newCategory,
        quality_score: newQuality,
        source_type: opts?.sourceType || 'auto_extracted',
        usage_count: 0,
      }

      try {
        const thesis = await createThesis(uid, thesisData)
        output.push({ id: thesis.id!, title: thesis.title })
        // Add to the index so subsequent theses in this batch also dedup
        titleIndex.push({ thesis, normalised: newNorm })
        createdCount++
      } catch (err) {
        console.warn('Failed to store extracted thesis:', err)
      }
    }
  }

  return { created: createdCount, merged: mergedCount, theses: output }
}

// ── Merge helper ─────────────────────────────────────────────────────────────

/**
 * Merge two thesis versions into one via LLM. Returns the compiled result.
 */
async function mergeTheses(
  apiKey: string,
  existing: ThesisData,
  incoming: { title: string; content: string; summary: string },
): Promise<{ title: string; content: string; summary: string }> {
  const userPrompt = [
    'VERSÃO EXISTENTE:',
    `Título: ${existing.title}`,
    `Conteúdo: ${existing.content}`,
    existing.summary ? `Resumo: ${existing.summary}` : '',
    '',
    'NOVA VERSÃO:',
    `Título: ${incoming.title}`,
    `Conteúdo: ${incoming.content}`,
    incoming.summary ? `Resumo: ${incoming.summary}` : '',
    '',
    'Compile as duas versões em uma ÚNICA tese mais completa. Retorne JSON com title, content e summary.',
  ].filter(Boolean).join('\n')

  const result = await callLLM(apiKey, MERGE_SYSTEM, userPrompt, EXTRACTION_MODEL, 2000, 0.1)
  const parsed = parseSingleJsonFromLLM(result.content)

  return {
    title: typeof parsed.title === 'string' ? parsed.title.trim() : existing.title,
    content: typeof parsed.content === 'string' ? parsed.content.trim() : existing.content,
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : existing.summary || '',
  }
}

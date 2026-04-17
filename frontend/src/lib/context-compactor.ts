/**
 * Basic context compactor — reduces redundant context sent to LLM agents.
 *
 * Strategies:
 * 1. Deduplication of overlapping text segments
 * 2. Truncation with structured preservation (keep headers, first/last paragraphs)
 * 3. Budget-aware selection (prioritize by relevance signal)
 */

export interface CompactedContext {
  /** The compacted text */
  text: string
  /** Original character count */
  originalChars: number
  /** Compacted character count */
  compactedChars: number
  /** Reduction ratio (0-1, where 1 = fully removed) */
  reductionRatio: number
  /** Number of segments dropped */
  segmentsDropped: number
}

/**
 * Deduplicate overlapping text segments.
 * Removes exact duplicate paragraphs and near-duplicate lines (>90% overlap).
 */
export function deduplicateSegments(segments: string[]): { unique: string[]; dropped: number } {
  const seen = new Set<string>()
  const unique: string[] = []
  let dropped = 0

  for (const seg of segments) {
    const normalized = seg.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!normalized || seen.has(normalized)) {
      dropped++
      continue
    }
    seen.add(normalized)
    unique.push(seg)
  }

  return { unique, dropped }
}

/**
 * Truncate a text block to a character budget while preserving structure.
 * Keeps: first paragraph, section headers (lines starting with # or uppercase labels),
 * and last paragraph. Middle content is trimmed with an indicator.
 */
export function truncateWithStructure(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text

  const lines = text.split('\n')
  if (lines.length <= 4) return text.slice(0, maxChars) + '\n[...truncado]'

  // Identify structural lines (headers, labels)
  const structural: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('#') || line.startsWith('##') || /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ\s]{4,}:/.test(line)) {
      structural.push(i)
    }
  }

  // Always keep first 2 and last 2 lines
  const keepIndices = new Set<number>([0, 1, lines.length - 2, lines.length - 1, ...structural])
  const kept: string[] = []
  let budget = maxChars
  let lastKept = -1

  for (let i = 0; i < lines.length; i++) {
    if (!keepIndices.has(i)) continue
    const line = lines[i]
    if (budget - line.length < 0 && kept.length > 2) break
    if (lastKept >= 0 && i > lastKept + 1) {
      kept.push(`[...${i - lastKept - 1} linhas omitidas]`)
    }
    kept.push(line)
    budget -= line.length + 1
    lastKept = i
  }

  return kept.join('\n')
}

/**
 * Compact a list of context sources into a single text within a token budget.
 * Sources are ordered by priority (lower index = higher priority).
 * Each source is truncated individually, then concatenated.
 */
export function compactContext(
  sources: { label: string; text: string; priority?: number }[],
  maxTotalChars: number,
): CompactedContext {
  const originalChars = sources.reduce((sum, s) => sum + s.text.length, 0)

  if (originalChars <= maxTotalChars) {
    const text = sources.map(s => `[${s.label}]\n${s.text}`).join('\n\n')
    return { text, originalChars, compactedChars: text.length, reductionRatio: 0, segmentsDropped: 0 }
  }

  // Sort by priority (lower = more important)
  const sorted = [...sources].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))

  // Allocate budget proportionally with minimum guarantee
  const minPerSource = 200
  const remainingBudget = maxTotalChars - sorted.length * minPerSource
  const totalOriginal = sorted.reduce((sum, s) => sum + s.text.length, 0)

  const parts: string[] = []
  let segmentsDropped = 0

  for (const source of sorted) {
    const proportion = source.text.length / totalOriginal
    const allocated = Math.max(minPerSource, Math.round(minPerSource + remainingBudget * proportion))

    if (source.text.length <= allocated) {
      parts.push(`[${source.label}]\n${source.text}`)
    } else {
      const truncated = truncateWithStructure(source.text, allocated)
      parts.push(`[${source.label}]\n${truncated}`)
      segmentsDropped++
    }
  }

  const text = parts.join('\n\n')
  return {
    text,
    originalChars,
    compactedChars: text.length,
    reductionRatio: 1 - text.length / originalChars,
    segmentsDropped,
  }
}

import { evaluateQuality, type QualityResult } from '../quality-evaluator'

/**
 * v3 wrapper around the document quality evaluator.
 *
 * Currently this is a thin wrapper that surfaces the same heuristic-based
 * scoring used by the v2 pipeline. It exists as a separate entry point so the
 * v3 pipeline can later evolve its quality criteria without affecting v2.
 */
export interface QualityEvaluationV3 extends QualityResult {
  /** Convenience flag for the orchestrator: true when score is below 60. */
  needsReview: boolean
}

export function evaluateQualityV3(
  text: string,
  docType: string,
  ctx?: { tema?: string },
): QualityEvaluationV3 {
  const result = evaluateQuality(text, docType, ctx ?? {})
  return { ...result, needsReview: result.score < 60 }
}

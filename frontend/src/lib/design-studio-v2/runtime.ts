/**
 * Design Studio v2 — runtime assembly.
 *
 * Loads everything a turn needs to talk to the models: the per-agent model map
 * (from the user's `design_studio_v2_models` config), the OpenRouter API key and
 * the category-aware fallback resolver. Also builds the optional image-asset
 * generator (used only when the asset agent has an image-capable model).
 */

import { getOpenRouterKey } from '../generation-service'
import {
  DESIGN_STUDIO_V2_AGENT_DEFS,
  buildPipelineFallbackResolver,
  loadDesignStudioV2Models,
  loadFallbackPriorityConfig,
} from '../model-config'
import { generateImage } from '../image-generation-client'
import { createUsageExecutionRecord } from '../cost-analytics'
import type { DesignStudioAssetRequest, DesignStudioRuntime } from './types'

export interface BuildRuntimeOptions {
  uid?: string
  sessionId?: string
}

/** Assemble the LLM runtime for a Design Studio v2 session. */
export async function buildStudioRuntime(options: BuildRuntimeOptions = {}): Promise<DesignStudioRuntime> {
  const [models, apiKey, fallbackConfig] = await Promise.all([
    loadDesignStudioV2Models(options.uid),
    getOpenRouterKey(options.uid).catch(() => ''),
    loadFallbackPriorityConfig(options.uid).catch(() => ({})),
  ])
  const resolver = buildPipelineFallbackResolver(DESIGN_STUDIO_V2_AGENT_DEFS, fallbackConfig)
  return {
    apiKey,
    models,
    resolveFallback: resolver,
    uid: options.uid,
    sessionId: options.sessionId,
  }
}

/**
 * Build an asset generator bound to the runtime's asset model, or return
 * undefined when no image-capable model is configured (so the engine skips
 * asset generation entirely instead of failing).
 */
export function buildAssetGenerator(runtime: DesignStudioRuntime): DesignStudioAssetGenerator | undefined {
  const model = runtime.models.ds2_asset_generator
  if (!model || !runtime.apiKey) return undefined
  return async (request: DesignStudioAssetRequest, signal?: AbortSignal) => {
    const result = await generateImage({
      apiKey: runtime.apiKey,
      uid: runtime.uid,
      prompt: request.prompt,
      model,
      aspectRatio: request.aspectRatio,
      signal,
    })
    const execution = createUsageExecutionRecord({
      source_type: 'design_studio_v2',
      source_id: runtime.sessionId || 'design-studio-v2',
      phase: 'ds2_asset_generator',
      agent_name: 'Design Studio v2: Gerador de Assets',
      model: result.model,
      provider_id: result.provider_id ?? null,
      provider_label: result.provider_label ?? null,
      cost_usd: result.cost_usd,
    })
    return { dataUrl: result.imageDataUrl, execution }
  }
}

export type DesignStudioAssetGenerator = (
  request: DesignStudioAssetRequest,
  signal?: AbortSignal,
) => Promise<{ dataUrl: string; execution: ReturnType<typeof createUsageExecutionRecord> } | null>

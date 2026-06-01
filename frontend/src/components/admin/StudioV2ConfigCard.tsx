/**
 * StudioV2ConfigCard — per-user settings for the Studio v2 refinement motor
 * (FF_NOTEBOOK_STUDIO_V2). Mirrors the Document v4 config cards: load → edit →
 * save against /users/{uid}/settings/preferences.studio_v2_settings.
 *
 * Knobs: max writing passes, soft USD cost cap, and the acceptance threshold
 * (auto per-type, or a fixed override). An advanced critic-model override is
 * validated against the personal catalog on save.
 */
import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Repeat, RotateCcw, Save } from 'lucide-react'
import { loadStudioV2Settings, saveStudioV2Settings } from '../../lib/model-config'
import { DEFAULT_STUDIO_V2_SETTINGS } from '../../lib/notebook-studio-pipeline'
import type { StudioV2SettingsData } from '../../lib/firestore-types'

const DEFAULT_THRESHOLD = 78

export default function StudioV2ConfigCard() {
  const [maxIterations, setMaxIterations] = useState(DEFAULT_STUDIO_V2_SETTINGS.maxIterations)
  const [costCapUsd, setCostCapUsd] = useState(DEFAULT_STUDIO_V2_SETTINGS.costCapUsd)
  const [autoThreshold, setAutoThreshold] = useState(true)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [criticModel, setCriticModel] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null)

  useEffect(() => {
    let cancelled = false
    loadStudioV2Settings().then(s => {
      if (cancelled) return
      setMaxIterations(s.maxIterations ?? DEFAULT_STUDIO_V2_SETTINGS.maxIterations)
      setCostCapUsd(s.costCapUsd ?? DEFAULT_STUDIO_V2_SETTINGS.costCapUsd)
      setAutoThreshold(s.criticThreshold == null)
      setThreshold(s.criticThreshold ?? DEFAULT_THRESHOLD)
      setCriticModel(s.criticModel ?? '')
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function markDirty() {
    setDirty(true)
    setMessage(null)
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const payload: StudioV2SettingsData = { maxIterations, costCapUsd }
      if (!autoThreshold) payload.criticThreshold = threshold
      const cm = criticModel.trim()
      if (cm) payload.criticModel = cm
      await saveStudioV2Settings(payload)
      setDirty(false)
      setMessage({ text: 'Configuração do Estúdio v2 salva.', kind: 'ok' })
    } catch (err) {
      setMessage({ text: `Falha ao salvar: ${(err as Error).message}`, kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setMaxIterations(DEFAULT_STUDIO_V2_SETTINGS.maxIterations)
    setCostCapUsd(DEFAULT_STUDIO_V2_SETTINGS.costCapUsd)
    setAutoThreshold(true)
    setThreshold(DEFAULT_THRESHOLD)
    setCriticModel('')
    setDirty(true)
    setMessage(null)
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Carregando configuração do Estúdio v2…
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Repeat className="h-4 w-4 text-teal-600" />
            Estúdio v2 — motor de refino iterativo
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Controla o loop <code>rascunho → crítica → revisão</code> dos artefatos do Caderno. O motor refina até o
            crítico bater o limiar, limitado por nº de passes e teto de custo.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar padrões
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1 rounded bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`px-6 py-2 text-sm flex items-center gap-2 ${message.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {message.kind === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      <div className="px-6 py-4 space-y-4">
        {/* Max iterations */}
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-700">
            <span className="font-medium">Passes máximos de escrita</span>
            <span className="block text-xs text-slate-500">1 rascunho + revisões. Entre 1 e 6.</span>
          </span>
          <input
            type="number"
            min={1}
            max={6}
            value={maxIterations}
            onChange={e => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) { setMaxIterations(Math.min(6, Math.max(1, Math.floor(n)))); markDirty() }
            }}
            className="w-24 rounded border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-200"
          />
        </label>

        {/* Soft cost cap */}
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-700">
            <span className="font-medium">Teto de custo (US$)</span>
            <span className="block text-xs text-slate-500">Interrompe o refino após exceder este custo por artefato.</span>
          </span>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={costCapUsd}
            onChange={e => {
              const n = Number(e.target.value)
              if (Number.isFinite(n) && n > 0) { setCostCapUsd(Math.min(50, n)); markDirty() }
            }}
            className="w-24 rounded border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-200"
          />
        </label>

        {/* Acceptance threshold */}
        <div className="space-y-2">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-700">
              <span className="font-medium">Limiar de aceitação automático (por tipo)</span>
              <span className="block text-xs text-slate-500">Usa o limiar recomendado de cada tipo de artefato.</span>
            </span>
            <button
              type="button"
              onClick={() => { setAutoThreshold(v => !v); markDirty() }}
              className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoThreshold ? 'bg-teal-500' : 'bg-slate-300'}`}
              aria-label={autoThreshold ? 'Usar limiar fixo' : 'Usar limiar automático'}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${autoThreshold ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </label>
          {!autoThreshold && (
            <label className="flex items-center justify-between gap-3 pl-1">
              <span className="text-sm text-slate-700">
                <span className="font-medium">Limiar fixo (0–100)</span>
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={threshold}
                onChange={e => {
                  const n = Number(e.target.value)
                  if (Number.isFinite(n)) { setThreshold(Math.min(100, Math.max(0, Math.floor(n)))); markDirty() }
                }}
                className="w-24 rounded border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-200"
              />
            </label>
          )}
        </div>

        {/* Critic model override (advanced) */}
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-700">
            <span className="font-medium">Modelo do crítico (avançado)</span>
            <span className="block text-xs text-slate-500">Opcional. Vazio = usa o Revisor de Qualidade. Deve estar no seu catálogo pessoal.</span>
          </span>
          <input
            type="text"
            value={criticModel}
            placeholder="Padrão: Revisor de Qualidade"
            onChange={e => { setCriticModel(e.target.value); markDirty() }}
            className="rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-200"
          />
        </label>
      </div>
    </div>
  )
}

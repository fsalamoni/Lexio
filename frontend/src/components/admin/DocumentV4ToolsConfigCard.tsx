/**
 * DocumentV4ToolsConfigCard — UI for the per-user Document v4 tool catalog.
 *
 * Renders one row per tool from `DOCUMENT_V4_TOOLS_CATALOG`: enable toggle +
 * an expandable params block with simple controls (toggle/number/text/select)
 * driven by each tool's `paramSchema`. The catalog itself is curated and
 * non-extensible — users can only enable/disable known tools and tweak knobs.
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Hammer, RotateCcw, Save } from 'lucide-react'
import { DOCUMENT_V4_TOOLS_CATALOG, type DocumentV4Tool, type DocumentV4ToolParam } from '../../lib/document-v4-tools'
import {
  getDefaultDocumentV4ToolsConfig,
  loadDocumentV4ToolsConfig,
  saveDocumentV4ToolsConfig,
  type DocumentV4ToolsConfig,
} from '../../lib/document-v4-tools-config'

interface ToolControlProps {
  tool: DocumentV4Tool
  entry: { enabled: boolean; params: Record<string, unknown> }
  expanded: boolean
  onToggleEnabled: () => void
  onToggleExpanded: () => void
  onParamChange: (key: string, value: unknown) => void
}

function ToolControl({ tool, entry, expanded, onToggleEnabled, onToggleExpanded, onParamChange }: ToolControlProps) {
  const hasParams = tool.paramSchema && tool.paramSchema.length > 0
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggleEnabled}
          className={`mt-0.5 inline-flex h-5 w-9 items-center rounded-full transition-colors ${entry.enabled ? 'bg-teal-500' : 'bg-slate-300'}`}
          aria-label={entry.enabled ? 'Desativar ferramenta' : 'Ativar ferramenta'}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${entry.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm font-medium text-slate-800">{tool.name}</code>
            {tool.name === 'submit_final_answer' && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">obrigatória</span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">{tool.description}</p>
        </div>
        {hasParams && (
          <button
            type="button"
            onClick={onToggleExpanded}
            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
            aria-label={expanded ? 'Recolher parâmetros' : 'Expandir parâmetros'}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
      </div>
      {expanded && hasParams && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-3">
          {tool.paramSchema!.map(param => (
            <ParamControl
              key={param.key}
              param={param}
              value={entry.params[param.key] ?? param.defaultValue}
              onChange={value => onParamChange(param.key, value)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ParamControl({ param, value, onChange }: { param: DocumentV4ToolParam; value: unknown; onChange: (value: unknown) => void }) {
  if (param.type === 'boolean') {
    const checked = typeof value === 'boolean' ? value : false
    return (
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-700">
          <span className="font-medium">{param.label}</span>
          {param.description && <span className="block text-xs text-slate-500">{param.description}</span>}
        </span>
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-teal-500' : 'bg-slate-300'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-1'}`} />
        </button>
      </label>
    )
  }
  if (param.type === 'number') {
    const num = typeof value === 'number' ? value : Number(value) || (typeof param.defaultValue === 'number' ? param.defaultValue : 0)
    return (
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-700">
          <span className="font-medium">{param.label}</span>
          {param.description && <span className="block text-xs text-slate-500">{param.description}</span>}
        </span>
        <input
          type="number"
          value={num}
          min={param.min}
          max={param.max}
          onChange={e => {
            const next = Number(e.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
          className="w-24 rounded border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-200"
        />
      </label>
    )
  }
  if (param.type === 'select' && param.options) {
    const str = typeof value === 'string' ? value : String(param.defaultValue ?? '')
    return (
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-700">
          <span className="font-medium">{param.label}</span>
          {param.description && <span className="block text-xs text-slate-500">{param.description}</span>}
        </span>
        <select
          value={str}
          onChange={e => onChange(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-200"
        >
          {param.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>
    )
  }
  // text
  const str = typeof value === 'string' ? value : ''
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-slate-700">
        <span className="font-medium">{param.label}</span>
        {param.description && <span className="block text-xs text-slate-500">{param.description}</span>}
      </span>
      <input
        type="text"
        value={str}
        onChange={e => onChange(e.target.value)}
        className="rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-200"
      />
    </label>
  )
}

export default function DocumentV4ToolsConfigCard() {
  const [config, setConfig] = useState<DocumentV4ToolsConfig>(getDefaultDocumentV4ToolsConfig())
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null)

  useEffect(() => {
    let cancelled = false
    loadDocumentV4ToolsConfig().then(loaded => {
      if (!cancelled) {
        setConfig(loaded)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const enabledCount = useMemo(
    () => Object.values(config.tools).filter(t => t.enabled).length,
    [config],
  )

  function toggleEnabled(toolName: string) {
    setConfig(prev => ({
      ...prev,
      tools: {
        ...prev.tools,
        [toolName]: {
          ...prev.tools[toolName],
          enabled: !prev.tools[toolName].enabled,
        },
      },
    }))
    setDirty(true)
  }

  function updateParam(toolName: string, paramKey: string, value: unknown) {
    setConfig(prev => ({
      ...prev,
      tools: {
        ...prev.tools,
        [toolName]: {
          ...prev.tools[toolName],
          params: { ...(prev.tools[toolName].params ?? {}), [paramKey]: value },
        },
      },
    }))
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      await saveDocumentV4ToolsConfig(config)
      setDirty(false)
      setMessage({ text: 'Configuração de ferramentas salva.', kind: 'ok' })
    } catch (err) {
      setMessage({ text: `Falha ao salvar: ${(err as Error).message}`, kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setConfig(getDefaultDocumentV4ToolsConfig())
    setDirty(true)
    setMessage(null)
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Carregando catálogo de ferramentas v4…
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Hammer className="h-4 w-4 text-teal-600" />
            Ferramentas do agente v4 — catálogo
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {enabledCount} de {DOCUMENT_V4_TOOLS_CATALOG.length} ferramentas habilitadas.
            <span className="text-slate-500"> Ative/desative o que o agente principal pode usar e ajuste os parâmetros simples. <code>submit_final_answer</code> é sempre habilitada — é a única forma de terminar o loop.</span>
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
      <div className="px-6 py-4 space-y-2">
        {DOCUMENT_V4_TOOLS_CATALOG.map(tool => (
          <ToolControl
            key={tool.name}
            tool={tool}
            entry={{
              enabled: config.tools[tool.name]?.enabled ?? true,
              params: config.tools[tool.name]?.params ?? {},
            }}
            expanded={!!expanded[tool.name]}
            onToggleEnabled={() => toggleEnabled(tool.name)}
            onToggleExpanded={() => setExpanded(prev => ({ ...prev, [tool.name]: !prev[tool.name] }))}
            onParamChange={(key, value) => updateParam(tool.name, key, value)}
          />
        ))}
      </div>
    </div>
  )
}

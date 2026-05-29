/**
 * ChatOrchestratorV2ToolsConfigCard — per-user tool catalog for the Chat v2
 * lean pipeline. Renders one toggle per tool, grouped by category. Always-on
 * tools (call_agent, submit_final_answer) are locked enabled.
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Hammer, RotateCcw, Save } from 'lucide-react'
import {
  CHAT_V2_TOOL_CATALOG,
  CHAT_V2_TOOL_CATEGORY_LABELS,
  CHAT_V2_ALWAYS_ON_TOOLS,
  type ChatV2ToolCategory,
} from '../../lib/chat-orchestrator-v2/tool-catalog'
import {
  getDefaultChatV2ToolsConfig,
  loadChatV2ToolsConfig,
  saveChatV2ToolsConfig,
  type ChatV2ToolsConfig,
} from '../../lib/chat-orchestrator-v2/tools-config'

const CATEGORY_ORDER: ChatV2ToolCategory[] = ['orquestracao', 'midia', 'documentos', 'web', 'pc']

export default function ChatOrchestratorV2ToolsConfigCard() {
  const [config, setConfig] = useState<ChatV2ToolsConfig>(getDefaultChatV2ToolsConfig())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null)

  useEffect(() => {
    let cancelled = false
    loadChatV2ToolsConfig().then(loaded => {
      if (!cancelled) { setConfig(loaded); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const enabledCount = useMemo(
    () => Object.values(config.tools).filter(t => t.enabled).length,
    [config],
  )

  function toggle(name: string) {
    if (CHAT_V2_ALWAYS_ON_TOOLS.has(name)) return
    setConfig(prev => ({
      ...prev,
      tools: { ...prev.tools, [name]: { enabled: !(prev.tools[name]?.enabled ?? true) } },
    }))
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      await saveChatV2ToolsConfig(config)
      setDirty(false)
      setMessage({ text: 'Ferramentas do Chat v2 salvas.', kind: 'ok' })
    } catch (err) {
      setMessage({ text: `Falha ao salvar: ${(err as Error).message}`, kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setConfig(getDefaultChatV2ToolsConfig())
    setDirty(true)
    setMessage(null)
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Carregando catálogo de ferramentas do Chat v2…
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Hammer className="h-4 w-4 text-indigo-600" />
            Ferramentas do Chat v2 — catálogo
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {enabledCount} de {CHAT_V2_TOOL_CATALOG.length} ferramentas habilitadas.
            <span className="text-slate-500"> Ative/desative o que o líder pode usar. <code>call_agent</code> e <code>submit_final_answer</code> são sempre habilitadas.</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={handleReset} className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrões
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !dirty} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
            <Save className="h-3.5 w-3.5" /> {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
      {message && (
        <div className={`px-6 py-2 text-sm flex items-center gap-2 ${message.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {message.kind === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}
      <div className="px-6 py-4 space-y-5">
        {CATEGORY_ORDER.map(category => {
          const tools = CHAT_V2_TOOL_CATALOG.filter(t => t.category === category)
          if (!tools.length) return null
          return (
            <div key={category}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {CHAT_V2_TOOL_CATEGORY_LABELS[category]}
              </h4>
              <div className="space-y-2">
                {tools.map(tool => {
                  const locked = CHAT_V2_ALWAYS_ON_TOOLS.has(tool.name)
                  const enabled = locked || (config.tools[tool.name]?.enabled ?? true)
                  return (
                    <div key={tool.name} className="flex items-start gap-3 border border-slate-200 rounded-lg px-4 py-3 bg-white">
                      <button
                        type="button"
                        onClick={() => toggle(tool.name)}
                        disabled={locked}
                        className={`mt-0.5 inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-indigo-500' : 'bg-slate-300'} ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}
                        aria-label={enabled ? 'Desativar ferramenta' : 'Ativar ferramenta'}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-sm font-medium text-slate-800">{tool.name}</code>
                          <span className="text-xs text-slate-500">· {tool.label}</span>
                          {locked && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">obrigatória</span>}
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{tool.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

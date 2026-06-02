/**
 * SidecarDevicesCard — manage MULTIPLE paired PCs and the folders each one is
 * authorized to act on. Shown only when `FF_CHAT_PC_DEVICES` is on.
 *
 *  - "Meus PCs": add / rename / remove / activate named devices. All bind to
 *    127.0.0.1; only the active one is used at a time (its token feeds the chat
 *    connection). Migrated automatically from the legacy single pairing.
 *  - "Pastas autorizadas": for the active PC, list the folders the agent may
 *    use (live roots reported by the agent + the "permitir sempre" allowlist),
 *    authorize a new folder (desta vez / sempre), or revoke one.
 *
 * Folder authorization talks to the local agent over the same localhost socket
 * via the `grant` op; "sempre" also persists an allowlist rule scoped to the PC.
 */
import { useEffect, useState } from 'react'
import {
  AlertCircle, CheckCircle2, FolderPlus, Laptop, Plug, Plus, Star, Trash2, WifiOff,
} from 'lucide-react'
import { checkSidecarStatus, sendSidecarGrant } from '../../lib/chat-orchestrator'
import { buildSidecarWsUrl, invalidateSidecarConnectionCache } from '../../lib/chat-orchestrator/sidecar-config'
import {
  addDevice, getActiveDevice, getDefaultSidecarDevicesState, invalidateSidecarDevicesCache,
  loadSidecarDevices, removeDevice, renameDevice, saveSidecarDevices, setActiveDevice,
  type SidecarDevicesState,
} from '../../lib/chat-orchestrator/sidecar-devices'
import {
  addRule, invalidateSidecarAllowlistCache, loadSidecarAllowlist, removeRule, saveSidecarAllowlist,
} from '../../lib/chat-orchestrator/sidecar-allowlist'
import type { SidecarAllowlistRule, SidecarDeviceConfig } from '../../lib/firestore-types'

type Msg = { text: string; kind: 'ok' | 'error' } | null

export default function SidecarDevicesCard() {
  const [state, setState] = useState<SidecarDevicesState>(getDefaultSidecarDevicesState())
  const [rules, setRules] = useState<SidecarAllowlistRule[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<Msg>(null)

  const [newLabel, setNewLabel] = useState('')
  const [newToken, setNewToken] = useState('')
  const [newFolder, setNewFolder] = useState('')

  const [testing, setTesting] = useState(false)
  const [liveRoots, setLiveRoots] = useState<string[] | null>(null)
  const [connected, setConnected] = useState<boolean | null>(null)

  const active = getActiveDevice(state)

  useEffect(() => {
    let cancelled = false
    Promise.all([loadSidecarDevices(), loadSidecarAllowlist()])
      .then(([devices, allow]) => {
        if (cancelled) return
        setState(devices)
        setRules(allow)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // `resetLive` clears the tested folder list — only needed when the ACTIVE
  // device changes (its folders differ). A rename keeps the list on screen.
  async function persistDevices(next: SidecarDevicesState, opts: { resetLive?: boolean } = {}) {
    setState(next)
    if (opts.resetLive ?? true) {
      setLiveRoots(null)
      setConnected(null)
    }
    try {
      await saveSidecarDevices(next)
      invalidateSidecarDevicesCache()
      invalidateSidecarConnectionCache() // active device feeds the chat connection
    } catch (err) {
      setMsg({ text: `Falha ao salvar PCs: ${(err as Error).message}`, kind: 'error' })
    }
  }

  async function persistRules(next: SidecarAllowlistRule[]) {
    setRules(next)
    try {
      await saveSidecarAllowlist(next)
      invalidateSidecarAllowlistCache()
    } catch (err) {
      setMsg({ text: `Falha ao salvar autorizações: ${(err as Error).message}`, kind: 'error' })
    }
  }

  function handleAddDevice() {
    const token = newToken.trim()
    if (!token) { setMsg({ text: 'Cole o token do PC antes de adicionar.', kind: 'error' }); return }
    persistDevices(addDevice(state, { label: newLabel.trim() || 'Meu PC', token }))
    setNewLabel(''); setNewToken('')
    setMsg({ text: 'PC adicionado.', kind: 'ok' })
  }

  function activeWsUrl(device: SidecarDeviceConfig | null): string | null {
    if (!device) return null
    return buildSidecarWsUrl({ token: device.token, host: device.host, port: device.port, enabled: true })
  }

  async function handleTest() {
    if (!active) return
    setTesting(true); setMsg(null)
    const status = await checkSidecarStatus({ wsUrl: activeWsUrl(active)! })
    setConnected(status.available)
    setLiveRoots(status.available ? (status.roots ?? []) : null)
    if (!status.available) setMsg({ text: status.error ?? 'Agente indisponível.', kind: 'error' })
    setTesting(false)
  }

  async function handleAddFolder(persist: boolean) {
    const path = newFolder.trim()
    if (!path) return
    if (!active) { setMsg({ text: 'Adicione e ative um PC primeiro.', kind: 'error' }); return }
    const res = await sendSidecarGrant({ wsUrl: activeWsUrl(active)!, op: 'add', path, persist })
    if (!res.ok) { setMsg({ text: res.error ?? 'Não foi possível autorizar a pasta.', kind: 'error' }); return }
    if (res.roots) setLiveRoots(res.roots)
    if (persist) await persistRules(addRule(rules, { device_id: active.id, root: path, ops: 'all' }))
    setNewFolder('')
    setMsg({ text: persist ? 'Pasta autorizada e memorizada.' : 'Pasta autorizada nesta sessão.', kind: 'ok' })
  }

  async function handleRevokeFolder(root: string, rule?: SidecarAllowlistRule) {
    if (active) {
      const res = await sendSidecarGrant({ wsUrl: activeWsUrl(active)!, op: 'remove', path: root, persist: Boolean(rule) })
      if (res.roots) setLiveRoots(res.roots)
    }
    if (rule) await persistRules(removeRule(rules, rule.id))
    setMsg({ text: `Pasta revogada: ${root}`, kind: 'ok' })
  }

  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">Carregando PCs…</div>
  }

  const activeRules = active ? rules.filter(r => r.device_id === active.id) : []
  const ruleRoots = new Set(activeRules.map(r => r.root))
  // Authorized folders = live roots reported by the agent ∪ remembered rule roots.
  const folderRoots = Array.from(new Set([...(liveRoots ?? []), ...activeRules.map(r => r.root)]))

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4">
        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <Laptop className="h-4 w-4 text-indigo-600" /> Meus PCs e pastas autorizadas
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Pareie <strong>vários computadores</strong> (use um por vez) e gerencie as <strong>pastas</strong> que o
          assistente pode acessar em cada um. O PC <strong>ativo</strong> é o que o chat usa.
        </p>
      </div>

      {msg && (
        <div className={`px-6 py-2 text-sm flex items-center gap-2 ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{msg.text}
        </div>
      )}

      <div className="px-6 py-4 space-y-5">
        {/* ── Meus PCs ─────────────────────────────────────────────────────── */}
        <section>
          <h4 className="text-sm font-semibold text-slate-800">Meus PCs</h4>
          <ul className="mt-2 space-y-2">
            {state.devices.length === 0 && (
              <li className="text-sm text-slate-500">Nenhum PC pareado ainda. Adicione abaixo com o token do agente local.</li>
            )}
            {state.devices.map(device => (
              <li key={device.id} className={`flex items-center gap-2 rounded border px-3 py-2 ${device.id === state.activeId ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}>
                <button
                  type="button"
                  title={device.id === state.activeId ? 'PC ativo' : 'Tornar ativo'}
                  onClick={() => persistDevices(setActiveDevice(state, device.id))}
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${device.id === state.activeId ? 'text-amber-500' : 'text-slate-300 hover:text-slate-500'}`}
                >
                  <Star className="h-4 w-4" fill={device.id === state.activeId ? 'currentColor' : 'none'} />
                </button>
                <input
                  key={`${device.id}:${device.label}`}
                  defaultValue={device.label}
                  aria-label="Nome do PC"
                  onBlur={e => {
                    const v = e.target.value.trim()
                    if (v && v !== device.label) persistDevices(renameDevice(state, device.id, v), { resetLive: false })
                    else e.target.value = device.label // restore on empty/unchanged
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-slate-800 hover:border-slate-200 focus:border-indigo-300 focus:outline-none"
                />
                {device.id === state.activeId && <span className="text-xs font-medium text-indigo-600">ativo</span>}
                <button type="button" title="Remover PC" onClick={() => persistDevices(removeDevice(state, device.id))} className="text-slate-400 hover:text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Nome (ex.: Notebook)" className="rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            <input value={newToken} onChange={e => setNewToken(e.target.value)} placeholder="token do agente local" className="rounded border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            <button type="button" onClick={handleAddDevice} className="inline-flex items-center justify-center gap-1 rounded bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700">
              <Plus className="h-4 w-4" /> Adicionar PC
            </button>
          </div>
        </section>

        {/* ── Pastas autorizadas ───────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800">
              Pastas autorizadas {active ? <span className="font-normal text-slate-500">— {active.label}</span> : null}
            </h4>
            <button
              type="button"
              onClick={handleTest}
              disabled={!active || testing}
              className="inline-flex items-center gap-1 rounded border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              <Plug className="h-3.5 w-3.5" /> {testing ? 'Testando…' : 'Testar e listar'}
            </button>
          </div>

          {connected === false && (
            <p className="mt-2 inline-flex items-center gap-1 text-sm text-rose-600"><WifiOff className="h-4 w-4" /> Agente do PC ativo não respondeu.</p>
          )}

          {!active ? (
            <p className="mt-2 text-sm text-slate-500">Ative um PC para ver e gerenciar suas pastas.</p>
          ) : (
            <>
              <ul className="mt-2 space-y-1.5">
                {folderRoots.length === 0 && (
                  <li className="text-sm text-slate-500">{liveRoots === null ? 'Clique em "Testar e listar" para ver as pastas ativas no agente.' : 'Nenhuma pasta autorizada ainda.'}</li>
                )}
                {folderRoots.map(root => (
                  <li key={root} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm">
                    <span className="flex-1 truncate font-mono text-slate-700" title={root}>{root}</span>
                    {ruleRoots.has(root)
                      ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">permitir sempre</span>
                      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">sessão</span>}
                    <button type="button" onClick={() => handleRevokeFolder(root, activeRules.find(r => r.root === root))} className="text-slate-400 hover:text-rose-600" title="Revogar pasta">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input value={newFolder} onChange={e => setNewFolder(e.target.value)} placeholder="Caminho da pasta (ex.: C:\Casos\Cliente X)" className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleAddFolder(false)} disabled={!newFolder.trim()} className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50" title="Permitir só nesta sessão">
                    <FolderPlus className="h-4 w-4" /> Desta vez
                  </button>
                  <button type="button" onClick={() => handleAddFolder(true)} disabled={!newFolder.trim()} className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-2 text-sm text-white hover:bg-amber-600 disabled:opacity-50" title="Memorizar esta pasta">
                    <Star className="h-4 w-4" /> Sempre
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Pastas de sistema e de credenciais (Windows, Arquivos de Programas, <code>.ssh</code>, <code>.aws</code>…) nunca podem ser autorizadas.
                As pastas "permitir sempre" continuam valendo entre reinícios do agente.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

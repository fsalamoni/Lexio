/**
 * SidecarConnectionCard — configures the "Pasta local (PC)" connection that
 * lets the chat orchestrator read/write files and run commands on the user's
 * machine, inside a sandboxed workspace folder.
 *
 * Flow (like Claude Desktop / Manus / AionUI local connectors):
 *  1. User runs the @lexio/desktop sidecar locally (chooses a workspace folder).
 *  2. The sidecar prints a pairing token + the workspace path.
 *  3. User pastes the token here, clicks "Testar conexão" → handshake shows the
 *     real workspace root + permissions the local process granted.
 *
 * The card embeds a full, collapsible "Como funciona" explainer covering the
 * mental model, local setup, platform setup, in-chat usage, and security — so
 * the documentation lives where the user configures the feature.
 */
import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderCog,
  Info,
  MonitorSmartphone,
  Plug,
  RotateCcw,
  Save,
  ShieldCheck,
  Terminal,
  WifiOff,
} from 'lucide-react'
import { checkSidecarStatus } from '../../lib/chat-orchestrator'
import {
  buildSidecarWsUrl,
  getDefaultSidecarConnectionConfig,
  invalidateSidecarConnectionCache,
  loadSidecarConnectionConfig,
  saveSidecarConnectionConfig,
  type SidecarConnectionConfig,
} from '../../lib/chat-orchestrator/sidecar-config'

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; version?: string; root?: string; permissions?: string[] }
  | { kind: 'fail'; error: string }

export default function SidecarConnectionCard() {
  const [config, setConfig] = useState<SidecarConnectionConfig>(getDefaultSidecarConnectionConfig())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null)
  const [howToOpen, setHowToOpen] = useState(true)

  useEffect(() => {
    let cancelled = false
    loadSidecarConnectionConfig().then(loaded => {
      if (!cancelled) { setConfig(loaded); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function patch(next: Partial<SidecarConnectionConfig>) {
    setConfig(prev => ({ ...prev, ...next }))
    setDirty(true)
    setTest({ kind: 'idle' })
  }

  async function handleTest() {
    setTest({ kind: 'testing' })
    const status = await checkSidecarStatus({ wsUrl: buildSidecarWsUrl(config) })
    if (status.available) {
      setTest({ kind: 'ok', version: status.version, root: status.root, permissions: status.permissions })
    } else {
      setTest({ kind: 'fail', error: status.error ?? 'Sidecar indisponível.' })
    }
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      await saveSidecarConnectionConfig(config)
      invalidateSidecarConnectionCache()
      setDirty(false)
      setMessage({ text: 'Conexão com o PC salva.', kind: 'ok' })
    } catch (err) {
      setMessage({ text: `Falha ao salvar: ${(err as Error).message}`, kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setConfig(getDefaultSidecarConnectionConfig())
    setDirty(true)
    setTest({ kind: 'idle' })
    setMessage(null)
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Carregando configuração da pasta local…
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <FolderCog className="h-4 w-4 text-indigo-600" />
            Pasta local (PC) — ações de arquivos e comandos
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Permite que o orquestrador do chat leia, escreva e execute comandos <strong>dentro de uma pasta de trabalho</strong> no seu computador (sandbox). Requer o agente local <code>@lexio/desktop</code> em execução.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={handleReset} className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            <RotateCcw className="h-3.5 w-3.5" /> Limpar
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

      <div className="px-6 py-4 space-y-4">
        {/* ── Como funciona (explicação completa, recolhível) ───────────────── */}
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/50">
          <button
            type="button"
            onClick={() => setHowToOpen(o => !o)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
            aria-expanded={howToOpen}
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-900">
              <Info className="h-4 w-4" /> Como funciona a Pasta local (PC)
            </span>
            {howToOpen ? <ChevronDown className="h-4 w-4 text-indigo-700" /> : <ChevronRight className="h-4 w-4 text-indigo-700" />}
          </button>

          {howToOpen && (
            <div className="space-y-4 border-t border-indigo-100 px-4 py-4 text-sm text-slate-700">
              {/* Modelo mental */}
              <div>
                <p className="font-semibold text-slate-800">Por que existem dois lados</p>
                <p className="mt-1 text-slate-600">
                  O Lexio roda <strong>no navegador</strong>, e o navegador não tem acesso ao disco do seu PC.
                  Para o agente ler/escrever arquivos e rodar comandos, um <strong>programa local</strong> faz isso por
                  ele — e a página aciona esse programa por uma conexão <strong>somente local</strong>. As duas peças se
                  ligam por um <strong>token</strong>: o programa local gera, você cola aqui.
                </p>
                <pre className="mt-2 overflow-x-auto rounded-md bg-white/70 p-3 text-[11px] leading-relaxed text-slate-600 border border-indigo-100">{`PLATAFORMA (web)        ──ws://127.0.0.1:9420 (token)──▶   SEU PC (sidecar @lexio/desktop)
chat + orquestrador     ◀──── {ok, result} / erro ──────   confinado a 1 pasta de trabalho`}</pre>
              </div>

              {/* 1. Configuração no PC */}
              <div>
                <p className="inline-flex items-center gap-2 font-semibold text-slate-800">
                  <Terminal className="h-4 w-4 text-indigo-600" /> 1. Configuração no seu PC
                </p>
                <p className="mt-1 text-slate-600">Inicie o agente local escolhendo a pasta e o que ele pode fazer:</p>
                <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">{`node packages/desktop/bin/lexio-desktop.mjs \\
  --root "/caminho/da/pasta" \\
  --permissions read,write,execute`}</pre>
                <p className="mt-2 text-slate-600">Ao iniciar, ele mostra a pasta de trabalho e um <strong>token de pareamento</strong>:</p>
                <pre className="mt-2 overflow-x-auto rounded-md bg-white/70 p-3 text-[11px] leading-relaxed text-slate-600 border border-indigo-100">{`Pasta de trabalho : /caminho/da/pasta
Permissões        : read, write, execute
Endpoint          : ws://127.0.0.1:9420
COLE este token no Lexio → kJ8x...token...A2c`}</pre>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-slate-600">
                  <li><code>--root</code>: a <strong>pasta de trabalho</strong> (a sandbox). O agente só enxerga aqui dentro. Padrão: <code>~/Lexio</code>.</li>
                  <li><code>--permissions</code>: <code>read,write,execute,delete,rename</code>. Padrão: <code>read,write</code>.</li>
                  <li>O token é guardado em <code>~/.lexio/desktop.json</code> e se mantém entre reinícios.</li>
                  <li><strong>Para revogar:</strong> feche o processo (Ctrl+C) — sem ele rodando, o chat não acessa o PC.</li>
                </ul>
              </div>

              {/* 2. Configuração na plataforma */}
              <div>
                <p className="inline-flex items-center gap-2 font-semibold text-slate-800">
                  <MonitorSmartphone className="h-4 w-4 text-indigo-600" /> 2. Configuração aqui na plataforma
                </p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-slate-600">
                  <li>Ligue <strong>Habilitar ações no PC</strong> abaixo.</li>
                  <li>Cole o <strong>token de pareamento</strong> no campo correspondente.</li>
                  <li>Host/Porta: deixe <code>127.0.0.1</code> / <code>9420</code> (padrão).</li>
                  <li>Clique em <strong>Testar conexão</strong> — confirma a pasta e as permissões reais.</li>
                  <li>Clique em <strong>Salvar</strong> — a configuração fica vinculada à sua conta.</li>
                </ol>
              </div>

              {/* 3. Uso no chat */}
              <div>
                <p className="inline-flex items-center gap-2 font-semibold text-slate-800">
                  <FolderCog className="h-4 w-4 text-indigo-600" /> 3. Uso no chat
                </p>
                <p className="mt-1 text-slate-600">
                  No <code>/chat</code>, peça em linguagem natural (ex.: <em>“leia o <code>contrato.docx</code> da minha
                  pasta e salve um parecer como <code>parecer.md</code>”</em>). O agente decide as ações e mostra cada
                  passo na trilha. Ferramentas disponíveis e a permissão que cada uma exige:
                </p>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-slate-600">
                  <li><code>list_directory</code> — lista arquivos/pastas (exige <strong>read</strong>)</li>
                  <li><code>read_file</code> — lê um arquivo (exige <strong>read</strong>)</li>
                  <li><code>write_file</code> — cria/sobrescreve um arquivo (exige <strong>write</strong>)</li>
                  <li><code>run_shell</code> — executa um comando (exige <strong>execute</strong>)</li>
                </ul>
                <p className="mt-2 text-slate-600">
                  Caminhos podem ser relativos (<code>notas/a.txt</code>), <code>~/…</code> ou absolutos — desde que
                  <strong> dentro</strong> da pasta. Ações que alteram/executam podem pedir sua <strong>aprovação</strong> antes.
                  Se o agente local não estiver rodando, as ferramentas entram em <strong>modo demonstração</strong> (nada é gravado).
                </p>
              </div>

              {/* 4. Segurança */}
              <div>
                <p className="inline-flex items-center gap-2 font-semibold text-slate-800">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" /> Segurança
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
                  <li><strong>Sandbox de pasta:</strong> caminhos com <code>../</code> ou fora da raiz são recusados.</li>
                  <li><strong>Permissões explícitas:</strong> sem <code>write</code>/<code>execute</code>, essas ações são bloqueadas.</li>
                  <li><strong>Comandos destrutivos bloqueados</strong> mesmo com <code>execute</code> (<code>rm -rf</code>, <code>sudo</code>, <code>curl|bash</code>, etc.).</li>
                  <li><strong>Arquivos sensíveis</strong> nunca tocados: <code>.env</code>, <code>*.key</code>, <code>*.pem</code>, <code>id_rsa*</code>.</li>
                  <li><strong>Só local + token:</strong> servidor em <code>127.0.0.1</code> (fora da rede) e toda conexão exige o token.</li>
                  <li><strong>Limites:</strong> arquivos até 5 MB; comandos com timeout (até 30s). Encerrar o processo revoga tudo.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-700">Habilitar ações no PC</span>
          <button
            type="button"
            onClick={() => patch({ enabled: !config.enabled })}
            className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${config.enabled ? 'bg-indigo-500' : 'bg-slate-300'}`}
            aria-label={config.enabled ? 'Desabilitar' : 'Habilitar'}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${config.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
          </button>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Token de pareamento</span>
          <input
            type="password"
            value={config.token}
            onChange={e => patch({ token: e.target.value })}
            placeholder="cole aqui o token exibido pelo @lexio/desktop"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Host</span>
            <input
              type="text"
              value={config.host}
              onChange={e => patch({ host: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Porta</span>
            <input
              type="number"
              value={config.port}
              onChange={e => patch({ port: Number(e.target.value) || config.port })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Política de aprovação</span>
          <select
            value={config.approval_policy ?? 'per_command'}
            onChange={e => patch({ approval_policy: e.target.value as 'per_command' | 'always' })}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="per_command">Por ação (padrão) — escrever/apagar/executar pedem aprovação; leituras livres</option>
            <option value="always">Máxima cautela — toda ação pede aprovação, inclusive leituras</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Vale quando o portão "Recursos beta do Chat → Aprovação de ações no PC" (<code>FF_CHAT_PC_APPROVALS</code>) está ligado.
          </p>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={!config.token || test.kind === 'testing'}
            className="inline-flex items-center gap-1 rounded border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plug className="h-3.5 w-3.5" /> {test.kind === 'testing' ? 'Testando…' : 'Testar conexão'}
          </button>

          {test.kind === 'ok' && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Conectado{test.version ? ` (v${test.version})` : ''}
            </span>
          )}
          {test.kind === 'fail' && (
            <span className="inline-flex items-center gap-1 text-sm text-rose-700">
              <WifiOff className="h-4 w-4" /> {test.error}
            </span>
          )}
        </div>

        {test.kind === 'ok' && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p><strong>Pasta de trabalho:</strong> <code>{test.root ?? '—'}</code></p>
            <p className="mt-1"><strong>Permissões concedidas:</strong> {(test.permissions ?? []).join(', ') || '—'}</p>
            <p className="mt-1 text-emerald-700">O agente só pode atuar dentro desta pasta. Nada fora dela é acessível.</p>
          </div>
        )}

        <p className="text-xs text-slate-500">
          🔒 Segurança: a conexão é apenas local (<code>ws://{config.host}:{config.port}</code>), autenticada pelo token. O agente local recusa comandos destrutivos e qualquer caminho fora da pasta escolhida. Pare o processo a qualquer momento para revogar o acesso.
        </p>
      </div>
    </div>
  )
}

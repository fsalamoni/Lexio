/**
 * PR4 — Desktop Sidecar Skills
 *
 * Expõe operações de sistema de arquivos e shell como skills do orquestrador.
 * Estas skills dependem de um processo sidecar local (`@lexio/desktop`) que
 * executa as operações no sistema do usuário.
 *
 * Arquitetura:
 *  - O frontend envia comandos para o sidecar via WebSocket (ws://localhost:9420)
 *  - O sidecar executa as operações com controle de segurança (sandbox)
 *  - Os resultados são retornados ao orquestrador como eventos na trilha
 *
 * Modo mock:
 *  - Quando o sidecar não está disponível (ex.: GitHub Pages), as skills operam
 *    em modo simulado, retornando resultados de demonstração.
 */

import type { ChatSidecarPermission, ChatTrailEvent } from '../firestore-types'
import type { ChatSidecarAuditEntryInput, Skill, SkillContext, SkillResult } from './types'
import { DEFAULT_SIDECAR_HOST, DEFAULT_SIDECAR_PORT } from './sidecar-config'
import { LEGACY_DEVICE_ID, loadSidecarDevices } from './sidecar-devices'
import { addRule, loadSidecarAllowlist, matchAllowlist, saveSidecarAllowlist } from './sidecar-allowlist'
import { loadGithubConnectorConfig } from './github-config'
import { isEnabled } from '../feature-flags'

// ── Configuração do Sidecar ───────────────────────────────────────────────────

const SIDECAR_WS_TIMEOUT_MS = 5000

// ── Approval gate + audit (Wave 1: PC action safety) ──────────────────────────

/**
 * Mutating operations that require explicit user approval before running when
 * `FF_CHAT_PC_APPROVALS` is on. Reads (`read`/`list`/`git_status`/`git_diff`)
 * are never gated.
 */
type GatedSidecarOp = 'read' | 'list' | 'write' | 'delete' | 'rename' | 'move' | 'shell' | 'git_status' | 'git_diff' | 'git_commit' | 'git_push' | 'git_pull'

/** True when the approval gate is active (the user opted in via the flag). */
function approvalGateActive(): boolean {
  return isEnabled('FF_CHAT_PC_APPROVALS')
}

/**
 * Whether read operations also require approval. Reads are free under the
 * default policy; only the `always` ("máxima cautela") policy gates them too.
 */
function readsRequireApproval(ctx: SkillContext): boolean {
  return approvalGateActive() && ctx.sidecar?.approval_policy === 'always'
}

/** Append an audit entry, swallowing errors — auditing must never block an action. */
async function auditSafe(ctx: SkillContext, entry: ChatSidecarAuditEntryInput): Promise<void> {
  if (!ctx.appendAuditEntry) return
  try {
    await ctx.appendAuditEntry(entry)
  } catch {
    // best-effort — never fail the action because the audit write failed.
  }
}

/** Clip free-text for the compact audit `message` field. */
function clipAudit(text: string, max = 200): string {
  const value = String(text ?? '')
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

/** Small non-cryptographic content fingerprint for the audit trail (djb2). */
function shortHash(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0
  }
  return `djb2:${hash.toString(16)}`
}

function riskForOp(op: GatedSidecarOp): 'low' | 'medium' | 'high' {
  if (op === 'shell' || op === 'delete' || op === 'git_push') return 'high'
  if (op === 'read' || op === 'list' || op === 'git_status' || op === 'git_diff') return 'low'
  return 'medium'
}

/**
 * Pause the turn to ask the user to approve a mutating PC action. Mirrors the
 * `request_user_approval` skill so the existing controller resume path
 * (`runApprovedResumeTool`) picks it up: it persists an approval request, emits
 * the `approval_requested` trail event, records a `proposed` audit entry, and
 * returns `awaiting_user` with `resume_tool`/`resume_args` (carrying
 * `approved: true`) so the same skill re-runs and executes after approval.
 */
async function requestSidecarApproval(
  ctx: SkillContext,
  opts: {
    op: GatedSidecarOp
    title: string
    summary: string
    permissions: ChatSidecarPermission[]
    resourcePath?: string
    resumeTool: string
    resumeArgs: Record<string, unknown>
  },
): Promise<SkillResult> {
  const risk = riskForOp(opts.op)
  let approvalId = `local-${Date.now()}`
  if (ctx.createApprovalRequest) {
    try {
      approvalId = await ctx.createApprovalRequest({
        command_ids: [],
        title: opts.title,
        summary: opts.summary,
        risk_level: risk,
        requested_permissions: opts.permissions,
      })
    } catch {
      // keep the local id; the approval still surfaces in the UI.
    }
  }
  ctx.emit({
    type: 'approval_requested',
    approval_id: approvalId,
    title: opts.title,
    summary: opts.summary,
    risk_level: risk,
    ts: nowIso(),
  } as ChatTrailEvent)
  await auditSafe(ctx, {
    operation: opts.op,
    actor: 'orchestrator',
    status: 'proposed',
    resource_path: opts.resourcePath,
    approval_id: approvalId,
    message: opts.title,
  })
  // With the multi-PC connector on, offer "permitir desta vez / sempre / negar";
  // otherwise keep the legacy aprovar/rejeitar/ajustar buttons.
  const offerRemember = devicesFeatureActive()
  const options = offerRemember
    ? ['permitir desta vez', 'permitir sempre', 'negar']
    : ['aprovar', 'rejeitar', 'ajustar']
  const instruction = offerRemember
    ? 'Responda "permitir desta vez" para autorizar só agora, "permitir sempre" para autorizar esta pasta daqui em diante, ou "negar" para cancelar.'
    : 'Responda "aprovar" para autorizar, "rejeitar" para cancelar ou "ajustar" para mudar antes de executar.'
  const question = [opts.title, '', opts.summary, '', instruction].join('\n')
  return {
    tool_message: `Aguardando aprovação do usuário (${approvalId}): ${opts.title}`,
    awaiting_user: {
      question,
      options,
      approval_id: approvalId,
      resume_tool: opts.resumeTool,
      resume_args: { ...opts.resumeArgs, approved: true, approval_id: approvalId },
    },
  }
}

// ── Allowlist ("permitir sempre") integration — Onda 4 ────────────────────────

/** Multi-PC features (per-device allowlist) are active only behind the flag. */
function devicesFeatureActive(): boolean {
  return isEnabled('FF_CHAT_PC_DEVICES')
}

/** Directory portion of a path (handles both "/" and "\" separators). */
function dirOf(p: string): string {
  const s = String(p ?? '').replace(/[\\/]+$/, '')
  const idx = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  return idx > 0 ? s.slice(0, idx) : s
}

async function activeDeviceIdFor(ctx: SkillContext): Promise<string> {
  try {
    const state = await loadSidecarDevices(ctx.uid)
    return state.activeId ?? LEGACY_DEVICE_ID
  } catch {
    return LEGACY_DEVICE_ID
  }
}

/**
 * True when a persisted "permitir sempre" rule already authorizes `op` on
 * `path` for the active PC — so the action runs without prompting again.
 */
async function isPreApproved(ctx: SkillContext, op: ChatSidecarPermission, path: string): Promise<boolean> {
  if (!devicesFeatureActive() || !path) return false
  try {
    const [rules, deviceId] = await Promise.all([loadSidecarAllowlist(ctx.uid), activeDeviceIdFor(ctx)])
    return matchAllowlist(rules, deviceId, op, path) !== null
  } catch {
    return false
  }
}

/**
 * After the user approved with "permitir sempre", persist an allowlist grant for
 * `scopeRoot` (a folder): store the rule and ask the sidecar to add the folder
 * to its own persisted roots so it survives restarts. Best-effort; never throws.
 */
async function rememberScopeIfRequested(
  ctx: SkillContext,
  op: ChatSidecarPermission,
  scopeRoot: string,
  remember: boolean,
): Promise<void> {
  if (!remember || !devicesFeatureActive() || !scopeRoot) return
  try {
    const deviceId = await activeDeviceIdFor(ctx)
    const rules = await loadSidecarAllowlist(ctx.uid)
    await saveSidecarAllowlist(addRule(rules, { device_id: deviceId, root: scopeRoot, ops: [op] }), ctx.uid)
  } catch {
    // allowlist persistence is best-effort
  }
  try {
    const wsUrl = resolveSidecarWsUrl(ctx)
    if (wsUrl) {
      await callSidecar(
        { id: uid(), type: 'grant', op: 'add', payload: { path: scopeRoot, persist: true } },
        ctx.signal,
        wsUrl,
      )
    }
  } catch {
    // mirroring the grant on the sidecar is best-effort
  }
}

/** Build the ws URL (+ token) from the per-turn sidecar config on the context. */
function resolveSidecarWsUrl(ctx: SkillContext): string | null {
  const cfg = ctx.sidecar
  if (!cfg || !cfg.enabled || !cfg.token) return null
  const host = cfg.host || DEFAULT_SIDECAR_HOST
  const port = cfg.port || DEFAULT_SIDECAR_PORT
  return `ws://${host}:${port}/?token=${encodeURIComponent(cfg.token)}`
}

/** Tipos de mensagem trocadas com o sidecar. */
interface SidecarRequest {
  id: string
  type: 'fs' | 'shell' | 'git' | 'grant'
  op: string
  payload: Record<string, unknown>
}

interface SidecarResponse {
  id: string
  ok: boolean
  result?: unknown
  error?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString()
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Envia um comando ao sidecar e aguarda a resposta.
 * Retorna null se o sidecar não estiver disponível (modo mock ativado).
 */
async function callSidecar(
  request: SidecarRequest,
  signal: AbortSignal,
  wsUrl: string,
): Promise<SidecarResponse | null> {
  // Verificar se estamos em ambiente que suporta WebSocket
  if (typeof WebSocket === 'undefined') return null

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close()
      resolve(null) // sidecar indisponível → fallback para mock
    }, SIDECAR_WS_TIMEOUT_MS)

    const abortHandler = () => {
      clearTimeout(timeout)
      ws.close()
      reject(new DOMException('Sidecar call aborted', 'AbortError'))
    }
    signal.addEventListener('abort', abortHandler, { once: true })

    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
    } catch {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abortHandler)
      resolve(null)
      return
    }

    ws.onopen = () => {
      ws.send(JSON.stringify(request))
    }

    ws.onmessage = (event) => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abortHandler)
      try {
        const response: SidecarResponse = JSON.parse(String(event.data))
        if (response.id === request.id) {
          ws.close()
          resolve(response)
        }
      } catch {
        ws.close()
        resolve(null)
      }
    }

    ws.onerror = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abortHandler)
      ws.close()
      resolve(null) // erro de conexão → fallback para mock
    }

    ws.onclose = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abortHandler)
    }
  })
}

/**
 * Resolve se devemos usar sidecar real ou mock.
 * Sidecar só está disponível em ambiente desktop com o processo rodando.
 */
async function isSidecarAvailable(signal: AbortSignal, wsUrl: string | null): Promise<boolean> {
  if (!wsUrl) return false
  const ping: SidecarRequest = {
    id: uid(),
    type: 'shell',
    op: 'ping',
    payload: {},
  }
  const response = await callSidecar(ping, signal, wsUrl)
  return response !== null && response.ok
}

// ── Sidecar Skill Helpers ─────────────────────────────────────────────────────

/**
 * Cria um evento de trail para ações de sistema de arquivos.
 */
function fsTrailEvent(op: string, path: string, result?: string, error?: string): ChatTrailEvent {
  return {
    type: 'fs_action',
    op,
    path,
    ...(result ? { result: result.slice(0, 500) } : {}),
    ts: nowIso(),
  } as ChatTrailEvent
}

/**
 * Cria um evento de trail para ações de shell.
 */
function shellTrailEvent(cmd: string, result?: string, error?: string): ChatTrailEvent {
  return {
    type: 'shell_action',
    cmd,
    ...(result ? { result: result.slice(0, 500) } : {}),
    ts: nowIso(),
  } as ChatTrailEvent
}

// ── Skill: Ler Arquivo ────────────────────────────────────────────────────────

interface ReadFileArgs {
  path?: string
  max_lines?: number
  approved?: boolean
  approval_id?: string
}

const readFileSkill: Skill<ReadFileArgs> = {
  name: 'read_file',
  description:
    'Lê o conteúdo de um arquivo no sistema de arquivos local. ' +
    'Use quando o usuário pedir para analisar ou consultar um arquivo específico. ' +
    'Requer o sidecar @lexio/desktop rodando localmente.',
  argsHint: {
    path: 'Caminho absoluto do arquivo (ex.: "C:\\Users\\...\\documento.docx" ou "/home/user/doc.pdf")',
    max_lines: 'Número máximo de linhas a retornar (padrão: 200)',
  },
  async run(args, ctx): Promise<SkillResult> {
    const path = String(args.path ?? '').trim()
    if (!path) {
      return { tool_message: 'Erro: "path" é obrigatório.' }
    }
    const maxLines = Number(args.max_lines ?? 200) || 200

    if (readsRequireApproval(ctx) && args.approved !== true) {
      return requestSidecarApproval(ctx, {
        op: 'read',
        title: `Ler arquivo: ${path}`,
        summary: `O assistente quer ler "${path}" no seu computador (política de máxima cautela: leituras também pedem aprovação).`,
        permissions: ['read'],
        resourcePath: path,
        resumeTool: 'read_file',
        resumeArgs: { path, max_lines: maxLines },
      })
    }

    const wsUrl = resolveSidecarWsUrl(ctx)
    const sidecarOk = await isSidecarAvailable(ctx.signal, wsUrl)
    const useSidecar = sidecarOk && !ctx.mock && !!wsUrl

    let content: string
    let success: boolean

    if (useSidecar) {
      const response = await callSidecar(
        {
          id: uid(),
          type: 'fs',
          op: 'read',
          payload: { path, max_lines: maxLines },
        },
        ctx.signal,
        wsUrl!,
      )
      if (!response) {
        return { tool_message: 'Sidecar não respondeu. Verifique se @lexio/desktop está rodando.' }
      }
      success = response.ok
      content = response.ok ? String(response.result ?? '') : ''
      if (!response.ok) {
        ctx.emit(fsTrailEvent('read', path, undefined, response.error))
        return { tool_message: `Falha ao ler "${path}": ${response.error ?? 'Erro desconhecido'}` }
      }
      ctx.emit(fsTrailEvent('read', path, `${content.split(/\r?\n/).length} linhas lidas`))
    } else {
      // Modo mock / sidecar indisponível
      ctx.emit(fsTrailEvent('read', path, '(modo demonstração)'))
      content =
        `[CONTEÚDO SIMULADO — Sidecar não disponível]\n` +
        `Arquivo: ${path}\n` +
        `Para leitura real, instale e inicie @lexio/desktop.\n\n` +
        `(Em modo produção, este seria o conteúdo real do arquivo.)`
      success = true
    }

    return {
      tool_message: `📄 Conteúdo de "${path}" (${maxLines} linhas máx.):\n\n\`\`\`\n${content.slice(0, 4000)}\n\`\`\`\n\n${
        useSidecar ? '' : '⚠️ Modo demonstração — conteúdo simulado. Instale @lexio/desktop para leitura real.'
      }`,
    }
  },
}

// ── Skill: Listar Diretório ───────────────────────────────────────────────────

interface ListDirArgs {
  path?: string
  pattern?: string
  approved?: boolean
  approval_id?: string
}

const listDirSkill: Skill<ListDirArgs> = {
  name: 'list_directory',
  description:
    'Lista arquivos e diretórios em um caminho do sistema local. ' +
    'Use quando o usuário pedir para explorar uma pasta ou encontrar arquivos.',
  argsHint: {
    path: 'Caminho absoluto do diretório (padrão: diretório home do usuário)',
    pattern: 'Filtro glob (opcional). Ex.: "*.pdf", "*.docx"',
  },
  async run(args, ctx): Promise<SkillResult> {
    const path = String(args.path ?? '').trim() || '~'
    const pattern = String(args.pattern ?? '').trim() || undefined

    if (readsRequireApproval(ctx) && args.approved !== true) {
      return requestSidecarApproval(ctx, {
        op: 'list',
        title: `Listar diretório: ${path}`,
        summary: `O assistente quer listar "${path}" no seu computador (política de máxima cautela: leituras também pedem aprovação).`,
        permissions: ['read'],
        resourcePath: path,
        resumeTool: 'list_directory',
        resumeArgs: { path, ...(pattern ? { pattern } : {}) },
      })
    }

    const wsUrl = resolveSidecarWsUrl(ctx)
    const sidecarOk = await isSidecarAvailable(ctx.signal, wsUrl)
    const useSidecar = sidecarOk && !ctx.mock && !!wsUrl

    let entries: Array<{ name: string; type: string; size?: number }>

    if (useSidecar) {
      const response = await callSidecar(
        {
          id: uid(),
          type: 'fs',
          op: 'list',
          payload: { path, ...(pattern ? { pattern } : {}) },
        },
        ctx.signal,
        wsUrl!,
      )
      if (!response || !response.ok) {
        ctx.emit(fsTrailEvent('list', path, undefined, response?.error))
        return { tool_message: `Falha ao listar "${path}": ${response?.error ?? 'Sidecar indisponível'}` }
      }
      entries = Array.isArray(response.result) ? (response.result as Array<{ name: string; type: string; size?: number }>) : []
      ctx.emit(fsTrailEvent('list', path, `${entries.length} itens`))
    } else {
      ctx.emit(fsTrailEvent('list', path, '(modo demonstração)'))
      entries = [
        { name: 'documento_exemplo.docx', type: 'file', size: 245760 },
        { name: 'peticao_inicial_v2.docx', type: 'file', size: 358400 },
        { name: 'evidencias/', type: 'dir' },
        { name: 'jurisprudencia_coletada.pdf', type: 'file', size: 1024000 },
        { name: 'notas_audiencia.txt', type: 'file', size: 4096 },
      ]
    }

    if (!entries.length) {
      return { tool_message: `Nenhum arquivo encontrado em "${path}"${pattern ? ` com padrão "${pattern}"` : ''}.` }
    }

    const listing = entries
      .map(e => {
        const icon = e.type === 'dir' ? '📁' : '📄'
        const size = e.size !== undefined ? ` (${formatBytes(e.size)})` : ''
        return `${icon} ${e.name}${size}`
      })
      .join('\n')

    return {
      tool_message:
        `📂 Conteúdo de "${path}"${pattern ? ` (filtro: "${pattern}")` : ''}:\n\n${listing}\n\n` +
        `${useSidecar ? '' : '⚠️ Modo demonstração — listagem simulada.'}`,
    }
  },
}

// ── Skill: Escrever Arquivo ───────────────────────────────────────────────────

interface WriteFileArgs {
  path?: string
  content?: string
  /** Set to true by the approval-resume path so the write actually runs. */
  approved?: boolean
  /** Approval id threaded from the proposal, for the executed audit entry. */
  approval_id?: string
  /** Set when the user chose "permitir sempre" — persist an allowlist grant. */
  remember_scope?: boolean
}

const writeFileSkill: Skill<WriteFileArgs> = {
  name: 'write_file',
  description:
    'Escreve conteúdo em um arquivo no sistema local. ' +
    'Use quando o usuário pedir para salvar um documento, rascunho ou resultado. ' +
    'Quando a aprovação de ações no PC está ativa, esta ação pede confirmação do usuário antes de executar.',
  argsHint: {
    path: 'Caminho absoluto do arquivo (ex.: "C:\\Users\\...\\peticao.docx")',
    content: 'Conteúdo a ser escrito no arquivo',
  },
  async run(args, ctx): Promise<SkillResult> {
    const path = String(args.path ?? '').trim()
    const content = String(args.content ?? '').trim()
    if (!path) return { tool_message: 'Erro: "path" é obrigatório.' }
    if (!content) return { tool_message: 'Erro: "content" é obrigatório.' }

    const preApprovedWrite = await isPreApproved(ctx, 'write', path)
    if (approvalGateActive() && args.approved !== true && !preApprovedWrite) {
      return requestSidecarApproval(ctx, {
        op: 'write',
        title: `Escrever arquivo: ${path}`,
        summary: `O assistente quer gravar ${formatBytes(content.length)} em "${path}". Confirme para autorizar a escrita no seu computador.`,
        permissions: ['write'],
        resourcePath: path,
        resumeTool: 'write_file',
        resumeArgs: { path, content },
      })
    }
    await rememberScopeIfRequested(ctx, 'write', dirOf(path), args.remember_scope === true)

    const wsUrl = resolveSidecarWsUrl(ctx)
    const sidecarOk = await isSidecarAvailable(ctx.signal, wsUrl)
    const useSidecar = sidecarOk && !ctx.mock && !!wsUrl

    if (useSidecar) {
      const response = await callSidecar(
        {
          id: uid(),
          type: 'fs',
          op: 'write',
          payload: { path, content },
        },
        ctx.signal,
        wsUrl!,
      )
      if (!response || !response.ok) {
        ctx.emit(fsTrailEvent('write', path, undefined, response?.error))
        await auditSafe(ctx, {
          operation: 'write', actor: 'sidecar', status: 'failed', resource_path: path,
          approval_id: args.approval_id, message: response?.error ?? 'Sidecar indisponível',
        })
        return { tool_message: `Falha ao escrever em "${path}": ${response?.error ?? 'Sidecar indisponível'}` }
      }
      const size = content.length
      ctx.emit(fsTrailEvent('write', path, `${formatBytes(size)} escritos`))
      await auditSafe(ctx, {
        operation: 'write', actor: 'sidecar', status: 'executed', resource_path: path,
        approval_id: args.approval_id, content_hash_after: shortHash(content),
        message: `${formatBytes(size)} escritos`,
      })
      return {
        tool_message: `✅ Arquivo salvo com sucesso:\n- Caminho: ${path}\n- Tamanho: ${formatBytes(size)}`,
      }
    } else {
      ctx.emit(fsTrailEvent('write', path, '(modo demonstração)'))
      return {
        tool_message:
          `⚠️ Modo demonstração — arquivo NÃO foi salvo.\n\n` +
          `Caminho simulado: ${path}\n` +
          `Tamanho: ${formatBytes(content.length)}\n\n` +
          `Instale @lexio/desktop para salvar arquivos reais.`,
      }
    }
  },
}

// ── Skill: Executar Comando Shell ─────────────────────────────────────────────

interface ShellArgs {
  cmd?: string
  cwd?: string
  timeout_sec?: number
  /** Set to true by the approval-resume path so the command actually runs. */
  approved?: boolean
  /** Approval id threaded from the proposal, for the executed audit entry. */
  approval_id?: string
  /** Set when the user chose "permitir sempre" — persist an allowlist grant. */
  remember_scope?: boolean
}

const shellSkill: Skill<ShellArgs> = {
  name: 'run_shell',
  description:
    'Executa um comando shell no sistema local. ' +
    'Use com extrema cautela — apenas para comandos não-destrutivos que o usuário solicitou explicitamente. ' +
    'Exemplos seguros: listar processos, verificar espaço em disco, executar scripts de build.',
  argsHint: {
    cmd: 'Comando shell a executar (ex.: "dir", "ls -la", "python --version")',
    cwd: 'Diretório de trabalho (opcional)',
    timeout_sec: 'Timeout em segundos (padrão: 10, máximo: 30)',
  },
  async run(args, ctx): Promise<SkillResult> {
    const cmd = String(args.cmd ?? '').trim()
    if (!cmd) return { tool_message: 'Erro: "cmd" é obrigatório.' }
    const cwd = String(args.cwd ?? '').trim() || undefined
    const timeoutSec = Math.min(Number(args.timeout_sec ?? 10) || 10, 30)

    // ⚠️ Sanitização básica — previne comandos obviamente destrutivos
    const destructivePatterns = [
      /rm\s+-rf/i,
      /del\s+\/[sfq]/i,
      /format\s/i,
      />\s*\/dev\//i,
      /mkfs/i,
      /dd\s+if=/i,
      /shutdown/i,
      /reboot/i,
      /:\(\)\s*\{/i, // fork bomb
    ]
    for (const pattern of destructivePatterns) {
      if (pattern.test(cmd)) {
        const blockedEvent: ChatTrailEvent = {
          type: 'shell_action',
          cmd,
          ts: nowIso(),
        } as ChatTrailEvent
        ctx.emit(blockedEvent)
        await auditSafe(ctx, { operation: 'shell', actor: 'sidecar', status: 'rejected', resource_path: cwd, message: `Bloqueado por segurança: ${cmd}` })
        return {
          tool_message: `🚫 Comando bloqueado por segurança: "${cmd}" parece ser destrutivo. Esta operação não é permitida pelo sidecar.`,
        }
      }
    }

    const preApprovedShell = cwd ? await isPreApproved(ctx, 'execute', cwd) : false
    if (approvalGateActive() && args.approved !== true && !preApprovedShell) {
      return requestSidecarApproval(ctx, {
        op: 'shell',
        title: `Executar comando: ${cmd}`,
        summary: `O assistente quer executar \`${cmd}\`${cwd ? ` em "${cwd}"` : ''} no seu computador (timeout ${timeoutSec}s). Confirme para autorizar a execução.`,
        permissions: ['execute'],
        resourcePath: cwd,
        resumeTool: 'run_shell',
        resumeArgs: { cmd, ...(cwd ? { cwd } : {}), timeout_sec: timeoutSec },
      })
    }
    if (cwd) await rememberScopeIfRequested(ctx, 'execute', cwd, args.remember_scope === true)

    const wsUrl = resolveSidecarWsUrl(ctx)
    const sidecarOk = await isSidecarAvailable(ctx.signal, wsUrl)
    const useSidecar = sidecarOk && !ctx.mock && !!wsUrl

    if (useSidecar) {
      const response = await callSidecar(
        {
          id: uid(),
          type: 'shell',
          op: 'exec',
          payload: { cmd, ...(cwd ? { cwd } : {}), timeout_sec: timeoutSec },
        },
        ctx.signal,
        wsUrl!,
      )
      if (!response || !response.ok) {
        ctx.emit(shellTrailEvent(cmd, undefined, response?.error))
        await auditSafe(ctx, {
          operation: 'shell', actor: 'sidecar', status: 'failed', resource_path: cwd,
          approval_id: args.approval_id, message: response?.error ?? 'Sidecar indisponível',
        })
        return { tool_message: `Falha ao executar "${cmd}": ${response?.error ?? 'Sidecar indisponível'}` }
      }
      const output = String(response.result ?? '').slice(0, 3000)
      ctx.emit(shellTrailEvent(cmd, output.slice(0, 500)))
      await auditSafe(ctx, {
        operation: 'shell', actor: 'sidecar', status: 'executed', resource_path: cwd,
        approval_id: args.approval_id, message: clipAudit(cmd),
      })
      return {
        tool_message: `🖥️ Resultado de \`${cmd}\`:\n\n\`\`\`\n${output}\n\`\`\``,
      }
    } else {
      ctx.emit(shellTrailEvent(cmd, '(modo demonstração)'))
      return {
        tool_message:
          `⚠️ Modo demonstração — comando NÃO executado.\n\n` +
          `Comando: \`${cmd}\`\n\n` +
          `Instale @lexio/desktop para executar comandos reais.`,
      }
    }
  },
}

// ── Skill: Apagar Arquivo ─────────────────────────────────────────────────────

interface DeleteFileArgs {
  path?: string
  approved?: boolean
  approval_id?: string
  remember_scope?: boolean
}

const deleteFileSkill: Skill<DeleteFileArgs> = {
  name: 'delete_file',
  description:
    'Apaga um arquivo (ou pasta vazia) na pasta de trabalho do sidecar. ' +
    'Ação destrutiva — exige aprovação do usuário quando a aprovação de ações no PC está ativa.',
  argsHint: {
    path: 'Caminho do arquivo a apagar (relativo à pasta de trabalho do sidecar)',
  },
  async run(args, ctx): Promise<SkillResult> {
    const path = String(args.path ?? '').trim()
    if (!path) return { tool_message: 'Erro: "path" é obrigatório.' }

    const preApprovedDelete = await isPreApproved(ctx, 'delete', path)
    if (approvalGateActive() && args.approved !== true && !preApprovedDelete) {
      return requestSidecarApproval(ctx, {
        op: 'delete',
        title: `Apagar: ${path}`,
        summary: `O assistente quer apagar "${path}" do seu computador. Esta ação é destrutiva e não pode ser desfeita pelo sidecar.`,
        permissions: ['delete'],
        resourcePath: path,
        resumeTool: 'delete_file',
        resumeArgs: { path },
      })
    }
    await rememberScopeIfRequested(ctx, 'delete', dirOf(path), args.remember_scope === true)

    const wsUrl = resolveSidecarWsUrl(ctx)
    const sidecarOk = await isSidecarAvailable(ctx.signal, wsUrl)
    const useSidecar = sidecarOk && !ctx.mock && !!wsUrl

    if (useSidecar) {
      const response = await callSidecar({ id: uid(), type: 'fs', op: 'delete', payload: { path } }, ctx.signal, wsUrl!)
      if (!response || !response.ok) {
        ctx.emit(fsTrailEvent('delete', path, undefined, response?.error))
        await auditSafe(ctx, {
          operation: 'delete', actor: 'sidecar', status: 'failed', resource_path: path,
          approval_id: args.approval_id, message: response?.error ?? 'Sidecar indisponível',
        })
        return { tool_message: `Falha ao apagar "${path}": ${response?.error ?? 'Sidecar indisponível'}` }
      }
      ctx.emit(fsTrailEvent('delete', path, 'removido'))
      await auditSafe(ctx, {
        operation: 'delete', actor: 'sidecar', status: 'executed', resource_path: path,
        approval_id: args.approval_id, message: 'removido',
      })
      return { tool_message: `🗑️ Removido com sucesso: ${path}` }
    }
    ctx.emit(fsTrailEvent('delete', path, '(modo demonstração)'))
    return {
      tool_message: `⚠️ Modo demonstração — nada foi apagado.\n\nCaminho simulado: ${path}\n\nInstale @lexio/desktop para apagar arquivos reais.`,
    }
  },
}

// ── Skill: Renomear / Mover Arquivo ───────────────────────────────────────────

interface RenameFileArgs {
  from?: string
  to?: string
  approved?: boolean
  approval_id?: string
  remember_scope?: boolean
}

const renameFileSkill: Skill<RenameFileArgs> = {
  name: 'rename_file',
  description:
    'Renomeia ou move um arquivo dentro da pasta de trabalho do sidecar. ' +
    'Exige aprovação do usuário quando a aprovação de ações no PC está ativa.',
  argsHint: {
    from: 'Caminho atual do arquivo',
    to: 'Novo caminho/nome do arquivo (dentro da mesma pasta de trabalho)',
  },
  async run(args, ctx): Promise<SkillResult> {
    const from = String(args.from ?? '').trim()
    const to = String(args.to ?? '').trim()
    if (!from || !to) return { tool_message: 'Erro: "from" e "to" são obrigatórios.' }

    // A move is only pre-approved when BOTH ends sit in already-granted folders.
    const preApprovedRename = (await isPreApproved(ctx, 'rename', from)) && (await isPreApproved(ctx, 'rename', to))
    if (approvalGateActive() && args.approved !== true && !preApprovedRename) {
      return requestSidecarApproval(ctx, {
        op: 'rename',
        title: `Renomear/mover: ${from} → ${to}`,
        summary: `O assistente quer mover "${from}" para "${to}" no seu computador.`,
        permissions: ['rename'],
        resourcePath: from,
        resumeTool: 'rename_file',
        resumeArgs: { from, to },
      })
    }
    if (args.remember_scope === true) {
      await rememberScopeIfRequested(ctx, 'rename', dirOf(from), true)
      await rememberScopeIfRequested(ctx, 'rename', dirOf(to), true)
    }

    const wsUrl = resolveSidecarWsUrl(ctx)
    const sidecarOk = await isSidecarAvailable(ctx.signal, wsUrl)
    const useSidecar = sidecarOk && !ctx.mock && !!wsUrl

    if (useSidecar) {
      const response = await callSidecar({ id: uid(), type: 'fs', op: 'rename', payload: { from, to } }, ctx.signal, wsUrl!)
      if (!response || !response.ok) {
        ctx.emit(fsTrailEvent('rename', from, undefined, response?.error))
        await auditSafe(ctx, {
          operation: 'rename', actor: 'sidecar', status: 'failed', resource_path: from,
          approval_id: args.approval_id, message: response?.error ?? 'Sidecar indisponível',
        })
        return { tool_message: `Falha ao mover "${from}" → "${to}": ${response?.error ?? 'Sidecar indisponível'}` }
      }
      ctx.emit(fsTrailEvent('rename', `${from} → ${to}`, 'movido'))
      await auditSafe(ctx, {
        operation: 'rename', actor: 'sidecar', status: 'executed', resource_path: `${from} → ${to}`,
        approval_id: args.approval_id, message: 'movido',
      })
      return { tool_message: `📁 Movido com sucesso:\n- De: ${from}\n- Para: ${to}` }
    }
    ctx.emit(fsTrailEvent('rename', `${from} → ${to}`, '(modo demonstração)'))
    return {
      tool_message: `⚠️ Modo demonstração — nada foi movido.\n\n${from} → ${to}\n\nInstale @lexio/desktop para mover arquivos reais.`,
    }
  },
}

// ── Git skills (Wave 2: FF_CHAT_PC_GIT) ───────────────────────────────────────

interface GitCallResult {
  useSidecar: boolean
  ok: boolean
  result?: unknown
  error?: string
}

/** Send a `git/<op>` request to the sidecar, signalling demo mode when absent. */
async function callGit(ctx: SkillContext, op: string, payload: Record<string, unknown>): Promise<GitCallResult> {
  const wsUrl = resolveSidecarWsUrl(ctx)
  const sidecarOk = await isSidecarAvailable(ctx.signal, wsUrl)
  const useSidecar = sidecarOk && !ctx.mock && !!wsUrl
  if (!useSidecar) return { useSidecar: false, ok: false }
  const response = await callSidecar({ id: uid(), type: 'git', op, payload }, ctx.signal, wsUrl!)
  if (!response) return { useSidecar: true, ok: false, error: 'Sidecar não respondeu.' }
  return { useSidecar: true, ok: response.ok, result: response.result, error: response.error }
}

const DEMO_GIT_MESSAGE = '⚠️ Modo demonstração — operação git indisponível sem o sidecar @lexio/desktop em execução.'

interface GitStatusArgs { cwd?: string; approved?: boolean; approval_id?: string }
const gitStatusSkill: Skill<GitStatusArgs> = {
  name: 'git_status',
  description: 'Mostra o status do repositório git na pasta de trabalho do sidecar (branch, arquivos alterados, ahead/behind). Somente leitura.',
  argsHint: { cwd: 'Subpasta do repositório (opcional)' },
  async run(args, ctx): Promise<SkillResult> {
    const cwd = String(args.cwd ?? '').trim() || undefined
    if (readsRequireApproval(ctx) && args.approved !== true) {
      return requestSidecarApproval(ctx, {
        op: 'git_status', title: 'git status', summary: 'O assistente quer consultar o status do repositório (política de máxima cautela).',
        permissions: ['execute'], resumeTool: 'git_status', resumeArgs: { ...(cwd ? { cwd } : {}) },
      })
    }
    const res = await callGit(ctx, 'status', { ...(cwd ? { cwd } : {}) })
    if (!res.useSidecar) { ctx.emit(shellTrailEvent('git status', '(modo demonstração)')); return { tool_message: DEMO_GIT_MESSAGE } }
    if (!res.ok) { ctx.emit(shellTrailEvent('git status', undefined, res.error)); return { tool_message: `Falha no git status: ${res.error ?? 'erro desconhecido'}` } }
    const s = res.result as { branch?: string; ahead: number; behind: number; clean: boolean; files: Array<{ code: string; path: string }> }
    ctx.emit(shellTrailEvent('git status', s.clean ? 'árvore limpa' : `${s.files.length} alteração(ões)`))
    const head = `🌿 git status (${s.branch ?? '—'})${s.ahead ? ` ↑${s.ahead}` : ''}${s.behind ? ` ↓${s.behind}` : ''}`
    if (s.clean) return { tool_message: `${head}\nÁrvore de trabalho limpa.` }
    const lines = (s.files ?? []).slice(0, 80).map(f => `${f.code} ${f.path}`).join('\n')
    return { tool_message: `${head}:\n\`\`\`\n${lines}\n\`\`\`` }
  },
}

interface GitDiffArgs { cwd?: string; path?: string; staged?: boolean; approved?: boolean; approval_id?: string }
const gitDiffSkill: Skill<GitDiffArgs> = {
  name: 'git_diff',
  description: 'Mostra o diff do repositório git (alterações não comitadas, ou em staging com staged=true). Somente leitura.',
  argsHint: { cwd: 'Subpasta do repositório (opcional)', path: 'Limitar a um arquivo (opcional)', staged: 'true para o diff em staging' },
  async run(args, ctx): Promise<SkillResult> {
    const payload: Record<string, unknown> = {}
    if (String(args.cwd ?? '').trim()) payload.cwd = String(args.cwd).trim()
    if (String(args.path ?? '').trim()) payload.path = String(args.path).trim()
    if (args.staged === true) payload.staged = true
    if (readsRequireApproval(ctx) && args.approved !== true) {
      return requestSidecarApproval(ctx, {
        op: 'git_diff', title: 'git diff', summary: 'O assistente quer ver o diff do repositório (política de máxima cautela).',
        permissions: ['execute'], resumeTool: 'git_diff', resumeArgs: { ...payload },
      })
    }
    const res = await callGit(ctx, 'diff', payload)
    if (!res.useSidecar) { ctx.emit(shellTrailEvent('git diff', '(modo demonstração)')); return { tool_message: DEMO_GIT_MESSAGE } }
    if (!res.ok) { ctx.emit(shellTrailEvent('git diff', undefined, res.error)); return { tool_message: `Falha no git diff: ${res.error ?? 'erro desconhecido'}` } }
    const d = res.result as { diff: string; truncated?: boolean }
    ctx.emit(shellTrailEvent('git diff', `${d.diff.length} chars`))
    if (!d.diff.trim()) return { tool_message: '🔍 git diff: sem alterações.' }
    return { tool_message: `🔍 git diff${d.truncated ? ' (truncado)' : ''}:\n\`\`\`diff\n${d.diff.slice(0, 6000)}\n\`\`\`` }
  },
}

interface GitCommitArgs { message?: string; add_all?: boolean; cwd?: string; approved?: boolean; approval_id?: string }
const gitCommitSkill: Skill<GitCommitArgs> = {
  name: 'git_commit',
  description: 'Cria um commit git na pasta de trabalho do sidecar. Exige aprovação do usuário quando a aprovação de ações no PC está ativa.',
  argsHint: { message: 'Mensagem do commit', add_all: 'true para "git add -A" antes do commit', cwd: 'Subpasta do repositório (opcional)' },
  async run(args, ctx): Promise<SkillResult> {
    const message = String(args.message ?? '').trim()
    if (!message) return { tool_message: 'Erro: "message" é obrigatório.' }
    const cwd = String(args.cwd ?? '').trim() || undefined
    if (approvalGateActive() && args.approved !== true) {
      return requestSidecarApproval(ctx, {
        op: 'git_commit',
        title: `git commit: ${clipAudit(message, 80)}`,
        summary: `O assistente quer criar um commit${args.add_all ? ' (após git add -A)' : ''} com a mensagem "${message}".`,
        permissions: ['execute'],
        resumeTool: 'git_commit',
        resumeArgs: { message, ...(args.add_all ? { add_all: true } : {}), ...(cwd ? { cwd } : {}) },
      })
    }
    const res = await callGit(ctx, 'commit', { message, add_all: args.add_all === true, ...(cwd ? { cwd } : {}) })
    if (!res.useSidecar) { ctx.emit(shellTrailEvent('git commit', '(modo demonstração)')); return { tool_message: DEMO_GIT_MESSAGE } }
    if (!res.ok) {
      ctx.emit(shellTrailEvent('git commit', undefined, res.error))
      await auditSafe(ctx, { operation: 'git_commit', actor: 'sidecar', status: 'failed', approval_id: args.approval_id, message: res.error })
      return { tool_message: `Falha no git commit: ${res.error ?? 'erro desconhecido'}` }
    }
    const c = res.result as { committed: boolean; output: string }
    ctx.emit(shellTrailEvent('git commit', c.committed ? 'commit criado' : 'nada a comitar'))
    await auditSafe(ctx, { operation: 'git_commit', actor: 'sidecar', status: 'executed', approval_id: args.approval_id, message: clipAudit(message, 80) })
    return { tool_message: `✅ git commit:\n\`\`\`\n${c.output.slice(0, 2000)}\n\`\`\`` }
  },
}

interface GitRemoteArgs { remote?: string; branch?: string; cwd?: string; approved?: boolean; approval_id?: string }

function buildGitRemoteSkill(op: 'pull' | 'push'): Skill<GitRemoteArgs> {
  const isPush = op === 'push'
  return {
    name: `git_${op}`,
    description: `Executa git ${op} na pasta de trabalho do sidecar. Exige aprovação do usuário quando a aprovação de ações no PC está ativa.`,
    argsHint: { remote: 'Nome do remoto (ex.: origin)', branch: 'Branch (opcional)', cwd: 'Subpasta do repositório (opcional)' },
    async run(args, ctx): Promise<SkillResult> {
      const remote = String(args.remote ?? '').trim() || undefined
      const branch = String(args.branch ?? '').trim() || undefined
      const cwd = String(args.cwd ?? '').trim() || undefined
      if (approvalGateActive() && args.approved !== true) {
        return requestSidecarApproval(ctx, {
          op: isPush ? 'git_push' : 'git_pull',
          title: `git ${op}${remote ? ` ${remote}` : ''}${branch ? ` ${branch}` : ''}`,
          summary: `O assistente quer executar git ${op}${remote ? ` para "${remote}"` : ''}${branch ? ` (branch ${branch})` : ''} no seu repositório local.`,
          permissions: ['execute', 'network'],
          resumeTool: `git_${op}`,
          resumeArgs: { ...(remote ? { remote } : {}), ...(branch ? { branch } : {}), ...(cwd ? { cwd } : {}) },
        })
      }
      // Authenticate against GitHub remotes with the user's PAT when the GitHub
      // connector is on. Loaded fresh at execution time — never stored in the
      // approval/resume args. The sidecar uses it via an ephemeral http header.
      let token: string | undefined
      if (isEnabled('FF_CHAT_GITHUB')) {
        try { token = (await loadGithubConnectorConfig(ctx.uid)).token || undefined } catch { /* no token */ }
      }
      const res = await callGit(ctx, op, { ...(remote ? { remote } : {}), ...(branch ? { branch } : {}), ...(cwd ? { cwd } : {}), ...(token ? { token } : {}) })
      if (!res.useSidecar) { ctx.emit(shellTrailEvent(`git ${op}`, '(modo demonstração)')); return { tool_message: DEMO_GIT_MESSAGE } }
      if (!res.ok) {
        ctx.emit(shellTrailEvent(`git ${op}`, undefined, res.error))
        await auditSafe(ctx, { operation: `git_${op}`, actor: 'sidecar', status: 'failed', approval_id: args.approval_id, message: res.error })
        return { tool_message: `Falha no git ${op}: ${res.error ?? 'erro desconhecido'}` }
      }
      const r = res.result as { ok: boolean; output: string }
      ctx.emit(shellTrailEvent(`git ${op}`, r.ok ? 'concluído' : 'com avisos'))
      await auditSafe(ctx, { operation: `git_${op}`, actor: 'sidecar', status: 'executed', approval_id: args.approval_id, message: `git ${op}` })
      return { tool_message: `${isPush ? '⬆️' : '⬇️'} git ${op}:\n\`\`\`\n${r.output.slice(0, 2000)}\n\`\`\`` }
    },
  }
}

const gitPullSkill = buildGitRemoteSkill('pull')
const gitPushSkill = buildGitRemoteSkill('push')

/** Git skills exposed only when `FF_CHAT_PC_GIT` is on. */
export function buildGitSkills(): Skill[] {
  return [gitStatusSkill, gitDiffSkill, gitCommitSkill, gitPullSkill, gitPushSkill]
}

// ── Utility ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Skill: Autorizar Pasta (grant) ────────────────────────────────────────────

interface GrantFolderArgs {
  path?: string
  approved?: boolean
  approval_id?: string
  remember_scope?: boolean
}

const grantFolderSkill: Skill<GrantFolderArgs> = {
  name: 'grant_folder',
  description:
    'Autoriza o assistente a atuar em uma NOVA pasta do PC (fora das já liberadas). ' +
    'Use quando o usuário pedir para trabalhar ou organizar em uma pasta ainda não autorizada. ' +
    'Pede confirmação: "permitir desta vez" libera só nesta sessão; "permitir sempre" memoriza a pasta.',
  argsHint: {
    path: 'Caminho absoluto da pasta a autorizar (ex.: "C:\\Casos\\Cliente X")',
  },
  async run(args, ctx): Promise<SkillResult> {
    const path = String(args.path ?? '').trim()
    if (!path) return { tool_message: 'Erro: "path" (pasta a autorizar) é obrigatório.' }

    if (approvalGateActive() && args.approved !== true) {
      return requestSidecarApproval(ctx, {
        op: 'write',
        title: `Autorizar pasta: ${path}`,
        summary:
          `O assistente quer passar a atuar na pasta "${path}" do seu computador. ` +
          `Pastas de sistema e de credenciais nunca são autorizadas.`,
        permissions: ['write'],
        resourcePath: path,
        resumeTool: 'grant_folder',
        resumeArgs: { path },
      })
    }

    const persist = args.remember_scope === true
    const wsUrl = resolveSidecarWsUrl(ctx)
    const sidecarOk = await isSidecarAvailable(ctx.signal, wsUrl)
    const useSidecar = sidecarOk && !ctx.mock && !!wsUrl

    if (useSidecar) {
      const response = await callSidecar(
        { id: uid(), type: 'grant', op: 'add', payload: { path, persist } },
        ctx.signal,
        wsUrl!,
      )
      if (!response || !response.ok) {
        ctx.emit(fsTrailEvent('grant', path, undefined, response?.error))
        await auditSafe(ctx, {
          operation: 'grant', actor: 'sidecar', status: 'failed', resource_path: path,
          approval_id: args.approval_id, message: response?.error ?? 'Sidecar indisponível',
        })
        return { tool_message: `Não foi possível autorizar a pasta "${path}": ${response?.error ?? 'Sidecar indisponível'}` }
      }
      // When the user chose "sempre", mirror the grant into the allowlist too.
      if (persist && devicesFeatureActive()) {
        try {
          const deviceId = await activeDeviceIdFor(ctx)
          const rules = await loadSidecarAllowlist(ctx.uid)
          await saveSidecarAllowlist(addRule(rules, { device_id: deviceId, root: path, ops: 'all' }), ctx.uid)
        } catch {
          // best-effort
        }
      }
      ctx.emit(fsTrailEvent('grant', path, persist ? 'autorizada (sempre)' : 'autorizada (sessão)'))
      await auditSafe(ctx, {
        operation: 'grant', actor: 'sidecar', status: 'executed', resource_path: path,
        approval_id: args.approval_id, message: persist ? 'permitir sempre' : 'permitir desta vez',
      })
      return {
        tool_message: `✅ Pasta autorizada${persist ? ' (memorizada para as próximas vezes)' : ' (somente nesta sessão)'}:\n- ${path}`,
      }
    }
    ctx.emit(fsTrailEvent('grant', path, '(modo demonstração)'))
    return {
      tool_message: `⚠️ Modo demonstração — pasta NÃO autorizada de fato.\n\nPasta: ${path}\n\nInstale @lexio/desktop para autorizar pastas reais.`,
    }
  },
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * PR4 sidecar skills — file system and shell access via local desktop agent.
 * Extend this array when adding new sidecar-backed capabilities.
 *
 * The destructive `delete_file`/`rename_file` skills are only exposed when the
 * approval gate (`FF_CHAT_PC_APPROVALS`) is on, so they can never run ungated.
 * `grant_folder` (authorize a new folder) appears only with the multi-PC flag.
 */
export function buildSidecarSkills(): Skill[] {
  const base: Skill[] = [readFileSkill, listDirSkill, writeFileSkill, shellSkill]
  if (approvalGateActive()) {
    base.push(deleteFileSkill, renameFileSkill)
  }
  if (devicesFeatureActive()) {
    base.push(grantFolderSkill)
  }
  if (isEnabled('FF_CHAT_PC_GIT')) {
    base.push(...buildGitSkills())
  }
  return base
}

/**
 * Verifica se o sidecar está disponível.
 * Útil para a UI mostrar indicador de status.
 */
export async function checkSidecarStatus(opts?: {
  wsUrl?: string
  timeoutMs?: number
}): Promise<{
  available: boolean
  version?: string
  root?: string
  roots?: string[]
  permissions?: string[]
  error?: string
}> {
  const wsUrl = opts?.wsUrl ?? null
  if (!wsUrl) return { available: false, error: 'Sidecar não configurado.' }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 2500)
    const response = await callSidecar({ id: uid(), type: 'shell', op: 'ping', payload: {} }, controller.signal, wsUrl)
    clearTimeout(timeout)
    if (!response || !response.ok) return { available: false, error: 'Sidecar não respondeu.' }
    const result = (response.result ?? {}) as { version?: string; root?: string; roots?: string[]; permissions?: string[] }
    return {
      available: true,
      version: result.version,
      root: result.root,
      roots: Array.isArray(result.roots) ? result.roots : (result.root ? [result.root] : undefined),
      permissions: result.permissions,
    }
  } catch {
    return { available: false, error: 'Falha ao conectar (token inválido ou processo parado?).' }
  }
}
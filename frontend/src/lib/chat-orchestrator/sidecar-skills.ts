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

import type { ChatTrailEvent } from '../firestore-types'
import type { Skill, SkillContext, SkillResult } from './types'

// ── Configuração do Sidecar ───────────────────────────────────────────────────

const SIDECAR_WS_URL = 'ws://localhost:9420'
const SIDECAR_WS_TIMEOUT_MS = 5000

/** Tipos de mensagem trocadas com o sidecar. */
interface SidecarRequest {
  id: string
  type: 'fs' | 'shell'
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
      ws = new WebSocket(SIDECAR_WS_URL)
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
async function isSidecarAvailable(signal: AbortSignal): Promise<boolean> {
  const ping: SidecarRequest = {
    id: uid(),
    type: 'shell',
    op: 'ping',
    payload: {},
  }
  const response = await callSidecar(ping, signal)
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

    const sidecarOk = await isSidecarAvailable(ctx.signal)
    const useSidecar = sidecarOk && !ctx.mock

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

    const sidecarOk = await isSidecarAvailable(ctx.signal)
    const useSidecar = sidecarOk && !ctx.mock

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
}

const writeFileSkill: Skill<WriteFileArgs> = {
  name: 'write_file',
  description:
    'Escreve conteúdo em um arquivo no sistema local. ' +
    'Use quando o usuário pedir para salvar um documento, rascunho ou resultado.',
  argsHint: {
    path: 'Caminho absoluto do arquivo (ex.: "C:\\Users\\...\\peticao.docx")',
    content: 'Conteúdo a ser escrito no arquivo',
  },
  async run(args, ctx): Promise<SkillResult> {
    const path = String(args.path ?? '').trim()
    const content = String(args.content ?? '').trim()
    if (!path) return { tool_message: 'Erro: "path" é obrigatório.' }
    if (!content) return { tool_message: 'Erro: "content" é obrigatório.' }

    const sidecarOk = await isSidecarAvailable(ctx.signal)
    const useSidecar = sidecarOk && !ctx.mock

    if (useSidecar) {
      const response = await callSidecar(
        {
          id: uid(),
          type: 'fs',
          op: 'write',
          payload: { path, content },
        },
        ctx.signal,
      )
      if (!response || !response.ok) {
        ctx.emit(fsTrailEvent('write', path, undefined, response?.error))
        return { tool_message: `Falha ao escrever em "${path}": ${response?.error ?? 'Sidecar indisponível'}` }
      }
      const size = content.length
      ctx.emit(fsTrailEvent('write', path, `${formatBytes(size)} escritos`))
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
        return {
          tool_message: `🚫 Comando bloqueado por segurança: "${cmd}" parece ser destrutivo. Esta operação não é permitida pelo sidecar.`,
        }
      }
    }

    const sidecarOk = await isSidecarAvailable(ctx.signal)
    const useSidecar = sidecarOk && !ctx.mock

    if (useSidecar) {
      const response = await callSidecar(
        {
          id: uid(),
          type: 'shell',
          op: 'exec',
          payload: { cmd, ...(cwd ? { cwd } : {}), timeout_sec: timeoutSec },
        },
        ctx.signal,
      )
      if (!response || !response.ok) {
        ctx.emit(shellTrailEvent(cmd, undefined, response?.error))
        return { tool_message: `Falha ao executar "${cmd}": ${response?.error ?? 'Sidecar indisponível'}` }
      }
      const output = String(response.result ?? '').slice(0, 3000)
      ctx.emit(shellTrailEvent(cmd, output.slice(0, 500)))
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

// ── Utility ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * PR4 sidecar skills — file system and shell access via local desktop agent.
 * Extend this array when adding new sidecar-backed capabilities.
 */
export function buildSidecarSkills(): Skill[] {
  return [readFileSkill, listDirSkill, writeFileSkill, shellSkill]
}

/**
 * Verifica se o sidecar está disponível.
 * Útil para a UI mostrar indicador de status.
 */
export async function checkSidecarStatus(): Promise<{
  available: boolean
  version?: string
  error?: string
}> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    const available = await isSidecarAvailable(controller.signal)
    clearTimeout(timeout)
    return { available }
  } catch {
    return { available: false, error: 'Timeout ao conectar' }
  }
}
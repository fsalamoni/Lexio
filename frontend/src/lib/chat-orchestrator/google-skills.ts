/**
 * Google connector skills (Drive + Gmail). Behind `FF_CHAT_GOOGLE`.
 *
 * Auth is the in-memory GIS token (`google-auth.ts`); the user connects via the
 * settings card (user gesture). Read skills run freely; `gmail_create_draft`
 * pauses for approval when `FF_CHAT_PC_APPROVALS` is on. No token in memory →
 * the skill asks the user to (re)connect.
 */
import type { ChatTrailEvent } from '../firestore-types'
import type { ChatSidecarAuditEntryInput, Skill, SkillContext, SkillResult } from './types'
import { isEnabled } from '../feature-flags'
import { getCachedGoogleToken } from './google-auth'
import {
  driveListFiles,
  driveReadFile,
  gmailCreateDraft,
  gmailGetMessage,
  gmailSearch,
} from './google-client'

function nowIso(): string { return new Date().toISOString() }
function approvalGateActive(): boolean { return isEnabled('FF_CHAT_PC_APPROVALS') }

async function auditSafe(ctx: SkillContext, entry: ChatSidecarAuditEntryInput): Promise<void> {
  if (!ctx.appendAuditEntry) return
  try { await ctx.appendAuditEntry(entry) } catch { /* best-effort */ }
}

function emitConnector(ctx: SkillContext, summary: string): void {
  ctx.emit({ type: 'super_skill_call', skill: 'google', result_summary: summary, ts: nowIso() } as ChatTrailEvent)
}

const NO_TOKEN_MESSAGE = 'Conector Google não conectado. Vá em Configurações → Conector Google e clique em "Conectar" (o consentimento expira após ~1h).'

async function requestGoogleApproval(
  ctx: SkillContext,
  opts: { title: string; summary: string; resumeTool: string; resumeArgs: Record<string, unknown> },
): Promise<SkillResult> {
  let approvalId = `local-${Date.now()}`
  if (ctx.createApprovalRequest) {
    try {
      approvalId = await ctx.createApprovalRequest({
        command_ids: [], title: opts.title, summary: opts.summary, risk_level: 'medium', requested_permissions: ['network'],
      })
    } catch { /* keep local id */ }
  }
  ctx.emit({ type: 'approval_requested', approval_id: approvalId, title: opts.title, summary: opts.summary, risk_level: 'medium', ts: nowIso() } as ChatTrailEvent)
  await auditSafe(ctx, { operation: opts.resumeTool, actor: 'connector', status: 'proposed', approval_id: approvalId, message: opts.title })
  return {
    tool_message: `Aguardando aprovação do usuário (${approvalId}): ${opts.title}`,
    awaiting_user: {
      question: [opts.title, '', opts.summary, '', 'Responda "aprovar", "rejeitar" ou "ajustar".'].join('\n'),
      options: ['aprovar', 'rejeitar', 'ajustar'],
      approval_id: approvalId,
      resume_tool: opts.resumeTool,
      resume_args: { ...opts.resumeArgs, approved: true, approval_id: approvalId },
    },
  }
}

// ── Drive (read) ──────────────────────────────────────────────────────────────

interface DriveListArgs { query?: string }
const driveListSkill: Skill<DriveListArgs> = {
  name: 'drive_list_files',
  description: 'Lista arquivos do Google Drive do usuário (mais recentes primeiro). Aceita uma query do Drive (ex.: "name contains \'contrato\'"). Somente leitura.',
  argsHint: { query: 'Query da Drive API (opcional)' },
  async run(args, ctx): Promise<SkillResult> {
    const token = getCachedGoogleToken()
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    try {
      const files = await driveListFiles(token, String(args.query ?? '').trim() || undefined, ctx.signal)
      emitConnector(ctx, `Drive: ${files.length} arquivo(s)`)
      const lines = files.slice(0, 25).map(f => `- ${f.name} · ${f.mimeType} · id=${f.id}`).join('\n')
      return { tool_message: `🗂️ Google Drive:\n${lines || '(nenhum)'}` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      return { tool_message: `Falha ao listar o Drive: ${(err as Error).message}` }
    }
  },
}

interface DriveReadArgs { file_id?: string }
const driveReadSkill: Skill<DriveReadArgs> = {
  name: 'drive_read_file',
  description: 'Lê o conteúdo textual de um arquivo do Google Drive (Docs/Sheets/Slides são exportados como texto). Somente leitura.',
  argsHint: { file_id: 'ID do arquivo no Drive (de drive_list_files)' },
  async run(args, ctx): Promise<SkillResult> {
    const token = getCachedGoogleToken()
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    const fileId = String(args.file_id ?? '').trim()
    if (!fileId) return { tool_message: 'Erro: "file_id" é obrigatório.' }
    try {
      const file = await driveReadFile(token, fileId, ctx.signal)
      emitConnector(ctx, `Drive: leu ${file.name}`)
      return { tool_message: `📄 ${file.name}${file.truncated ? ' (truncado)' : ''}:\n\`\`\`\n${file.content}\n\`\`\`` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      return { tool_message: `Falha ao ler o arquivo: ${(err as Error).message}` }
    }
  },
}

// ── Gmail (read + draft) ───────────────────────────────────────────────────────

interface GmailSearchArgs { query?: string }
const gmailSearchSkill: Skill<GmailSearchArgs> = {
  name: 'gmail_search',
  description: 'Busca e-mails no Gmail do usuário (sintaxe de busca do Gmail, ex.: "from:fulano após:2026/01/01"). Retorna ids para gmail_read. Somente leitura.',
  argsHint: { query: 'Query de busca do Gmail' },
  async run(args, ctx): Promise<SkillResult> {
    const token = getCachedGoogleToken()
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    try {
      const messages = await gmailSearch(token, String(args.query ?? '').trim(), ctx.signal)
      emitConnector(ctx, `Gmail: ${messages.length} resultado(s)`)
      if (!messages.length) return { tool_message: '📧 Nenhum e-mail encontrado.' }
      return { tool_message: `📧 ${messages.length} e-mail(s). Ids:\n${messages.map(m => `- ${m.id}`).join('\n')}\n\nUse gmail_read com um id para ler.` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      return { tool_message: `Falha na busca do Gmail: ${(err as Error).message}` }
    }
  },
}

interface GmailReadArgs { message_id?: string }
const gmailReadSkill: Skill<GmailReadArgs> = {
  name: 'gmail_read',
  description: 'Lê um e-mail do Gmail por id (assunto, remetente, data e corpo em texto). Somente leitura.',
  argsHint: { message_id: 'ID da mensagem (de gmail_search)' },
  async run(args, ctx): Promise<SkillResult> {
    const token = getCachedGoogleToken()
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    const id = String(args.message_id ?? '').trim()
    if (!id) return { tool_message: 'Erro: "message_id" é obrigatório.' }
    try {
      const m = await gmailGetMessage(token, id, ctx.signal)
      emitConnector(ctx, `Gmail: leu ${id}`)
      return { tool_message: `📧 **${m.subject || '(sem assunto)'}**\nDe: ${m.from}\nData: ${m.date}\n\n${m.body || m.snippet}` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      return { tool_message: `Falha ao ler o e-mail: ${(err as Error).message}` }
    }
  },
}

interface GmailDraftArgs { to?: string; subject?: string; body?: string; approved?: boolean; approval_id?: string }
const gmailDraftSkill: Skill<GmailDraftArgs> = {
  name: 'gmail_create_draft',
  description: 'Cria um RASCUNHO de e-mail no Gmail (não envia). Pede aprovação do usuário quando o portão de ações está ativo.',
  argsHint: { to: 'Destinatário', subject: 'Assunto', body: 'Corpo do e-mail (texto)' },
  async run(args, ctx): Promise<SkillResult> {
    const token = getCachedGoogleToken()
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    const to = String(args.to ?? '').trim()
    const subject = String(args.subject ?? '').trim()
    const body = String(args.body ?? '')
    if (!to || !subject) return { tool_message: 'Erro: "to" e "subject" são obrigatórios.' }
    if (approvalGateActive() && args.approved !== true) {
      return requestGoogleApproval(ctx, {
        title: `Criar rascunho no Gmail para ${to}`,
        summary: `Assunto: "${subject}". Um rascunho é criado (não enviado).`,
        resumeTool: 'gmail_create_draft',
        resumeArgs: { to, subject, body },
      })
    }
    try {
      const draft = await gmailCreateDraft(token, { to, subject, body }, ctx.signal)
      emitConnector(ctx, `Gmail: rascunho ${draft.id} criado`)
      await auditSafe(ctx, { operation: 'gmail_create_draft', actor: 'connector', status: 'executed', approval_id: args.approval_id, resource_path: to, message: subject.slice(0, 120) })
      return { tool_message: `✅ Rascunho criado no Gmail (id ${draft.id}). Revise e envie pelo Gmail.` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      await auditSafe(ctx, { operation: 'gmail_create_draft', actor: 'connector', status: 'failed', approval_id: args.approval_id, resource_path: to, message: (err as Error).message })
      return { tool_message: `Falha ao criar rascunho: ${(err as Error).message}` }
    }
  },
}

/** Google connector skills, exposed only when `FF_CHAT_GOOGLE` is on. */
export function buildGoogleSkills(): Skill[] {
  if (!isEnabled('FF_CHAT_GOOGLE')) return []
  return [driveListSkill, driveReadSkill, gmailSearchSkill, gmailReadSkill, gmailDraftSkill]
}

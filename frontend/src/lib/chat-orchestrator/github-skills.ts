/**
 * GitHub connector skills (Wave 5). Behind `FF_CHAT_GITHUB`.
 *
 * Read skills (list_repos/read_file) run freely; write skills (create_issue/
 * open_pr/comment) pause for user approval when `FF_CHAT_PC_APPROVALS` is on,
 * reusing the same awaiting_user/resume flow as the PC sidecar skills.
 */
import type { ChatTrailEvent } from '../firestore-types'
import type { ChatSidecarAuditEntryInput, Skill, SkillContext, SkillResult } from './types'
import { isEnabled } from '../feature-flags'
import { loadGithubConnectorConfig } from './github-config'
import {
  githubAddIssueComment,
  githubCreateIssue,
  githubCreatePullRequest,
  githubGetFile,
  githubListRepos,
} from './github-client'

function nowIso(): string {
  return new Date().toISOString()
}

function approvalGateActive(): boolean {
  return isEnabled('FF_CHAT_PC_APPROVALS')
}

async function auditSafe(ctx: SkillContext, entry: ChatSidecarAuditEntryInput): Promise<void> {
  if (!ctx.appendAuditEntry) return
  try {
    await ctx.appendAuditEntry(entry)
  } catch {
    // best-effort
  }
}

function emitConnector(ctx: SkillContext, summary: string): void {
  ctx.emit({ type: 'super_skill_call', skill: 'github', result_summary: summary, ts: nowIso() } as ChatTrailEvent)
}

/** Resolve the PAT for this turn (cached loader). */
async function resolveToken(ctx: SkillContext): Promise<{ token: string; defaultOwner?: string; defaultRepo?: string }> {
  const cfg = await loadGithubConnectorConfig(ctx.uid)
  return { token: cfg.token, defaultOwner: cfg.default_owner, defaultRepo: cfg.default_repo }
}

const NO_TOKEN_MESSAGE = 'Conector GitHub não configurado. Adicione um token (PAT) em Configurações → Conector GitHub.'

function resolveOwnerRepo(args: { owner?: string; repo?: string }, defaults: { defaultOwner?: string; defaultRepo?: string }): { owner: string; repo: string } | null {
  const owner = String(args.owner ?? '').trim() || defaults.defaultOwner || ''
  const repo = String(args.repo ?? '').trim() || defaults.defaultRepo || ''
  if (!owner || !repo) return null
  return { owner, repo }
}

/** Inline approval prompt for a GitHub write action (mirrors the PC gate). */
async function requestGithubApproval(
  ctx: SkillContext,
  opts: { title: string; summary: string; resumeTool: string; resumeArgs: Record<string, unknown> },
): Promise<SkillResult> {
  let approvalId = `local-${Date.now()}`
  if (ctx.createApprovalRequest) {
    try {
      approvalId = await ctx.createApprovalRequest({
        command_ids: [],
        title: opts.title,
        summary: opts.summary,
        risk_level: 'medium',
        requested_permissions: ['network'],
      })
    } catch {
      // keep local id
    }
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

// ── Read skills ───────────────────────────────────────────────────────────────

const githubListReposSkill: Skill = {
  name: 'github_list_repos',
  description: 'Lista os repositórios do GitHub acessíveis pelo token configurado (mais recentes primeiro). Somente leitura.',
  async run(_args, ctx): Promise<SkillResult> {
    const { token } = await resolveToken(ctx)
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    try {
      const repos = await githubListRepos(token, ctx.signal)
      emitConnector(ctx, `GitHub: ${repos.length} repositório(s)`)
      const lines = repos.slice(0, 50).map(r => `- ${r.full_name}${r.private ? ' (privado)' : ''}${r.description ? ` — ${r.description}` : ''}`).join('\n')
      return { tool_message: `📦 Repositórios GitHub:\n${lines || '(nenhum)'}` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      return { tool_message: `Falha ao listar repositórios: ${(err as Error).message}` }
    }
  },
}

interface GithubReadFileArgs { owner?: string; repo?: string; path?: string; ref?: string }
const githubReadFileSkill: Skill<GithubReadFileArgs> = {
  name: 'github_read_file',
  description: 'Lê o conteúdo de um arquivo de um repositório GitHub. Somente leitura.',
  argsHint: { owner: 'Dono/org', repo: 'Repositório', path: 'Caminho do arquivo no repo', ref: 'Branch/tag/commit (opcional)' },
  async run(args, ctx): Promise<SkillResult> {
    const { token, defaultOwner, defaultRepo } = await resolveToken(ctx)
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    const target = resolveOwnerRepo(args, { defaultOwner, defaultRepo })
    if (!target) return { tool_message: 'Informe "owner" e "repo" (ou configure padrões no conector).' }
    const path = String(args.path ?? '').trim()
    if (!path) return { tool_message: 'Erro: "path" é obrigatório.' }
    try {
      const file = await githubGetFile(token, target.owner, target.repo, path, String(args.ref ?? '').trim() || undefined, ctx.signal)
      emitConnector(ctx, `GitHub: leu ${target.owner}/${target.repo}/${path}`)
      return { tool_message: `📄 ${target.owner}/${target.repo}/${path}${file.truncated ? ' (truncado)' : ''}:\n\`\`\`\n${file.content}\n\`\`\`` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      return { tool_message: `Falha ao ler ${path}: ${(err as Error).message}` }
    }
  },
}

// ── Write skills (gated) ──────────────────────────────────────────────────────

interface GithubCreateIssueArgs { owner?: string; repo?: string; title?: string; body?: string; approved?: boolean; approval_id?: string }
const githubCreateIssueSkill: Skill<GithubCreateIssueArgs> = {
  name: 'github_create_issue',
  description: 'Cria uma issue em um repositório GitHub. Pede aprovação do usuário quando o portão de ações no PC está ativo.',
  argsHint: { owner: 'Dono/org', repo: 'Repositório', title: 'Título da issue', body: 'Corpo (markdown)' },
  async run(args, ctx): Promise<SkillResult> {
    const { token, defaultOwner, defaultRepo } = await resolveToken(ctx)
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    const target = resolveOwnerRepo(args, { defaultOwner, defaultRepo })
    if (!target) return { tool_message: 'Informe "owner" e "repo" (ou configure padrões no conector).' }
    const title = String(args.title ?? '').trim()
    if (!title) return { tool_message: 'Erro: "title" é obrigatório.' }
    const body = String(args.body ?? '').trim()
    if (approvalGateActive() && args.approved !== true) {
      return requestGithubApproval(ctx, {
        title: `Criar issue em ${target.owner}/${target.repo}`,
        summary: `Título: "${title}".`,
        resumeTool: 'github_create_issue',
        resumeArgs: { owner: target.owner, repo: target.repo, title, body },
      })
    }
    try {
      const issue = await githubCreateIssue(token, target.owner, target.repo, title, body, ctx.signal)
      emitConnector(ctx, `GitHub: issue #${issue.number} criada`)
      await auditSafe(ctx, { operation: 'github_create_issue', actor: 'connector', status: 'executed', approval_id: args.approval_id, resource_path: `${target.owner}/${target.repo}`, message: `issue #${issue.number}` })
      return { tool_message: `✅ Issue criada: ${issue.html_url}` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      await auditSafe(ctx, { operation: 'github_create_issue', actor: 'connector', status: 'failed', approval_id: args.approval_id, resource_path: `${target.owner}/${target.repo}`, message: (err as Error).message })
      return { tool_message: `Falha ao criar issue: ${(err as Error).message}` }
    }
  },
}

interface GithubOpenPrArgs { owner?: string; repo?: string; title?: string; head?: string; base?: string; body?: string; approved?: boolean; approval_id?: string }
const githubOpenPrSkill: Skill<GithubOpenPrArgs> = {
  name: 'github_open_pr',
  description: 'Abre um pull request em um repositório GitHub. Pede aprovação do usuário quando o portão de ações no PC está ativo.',
  argsHint: { owner: 'Dono/org', repo: 'Repositório', title: 'Título do PR', head: 'Branch de origem', base: 'Branch de destino', body: 'Descrição (markdown)' },
  async run(args, ctx): Promise<SkillResult> {
    const { token, defaultOwner, defaultRepo } = await resolveToken(ctx)
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    const target = resolveOwnerRepo(args, { defaultOwner, defaultRepo })
    if (!target) return { tool_message: 'Informe "owner" e "repo" (ou configure padrões no conector).' }
    const title = String(args.title ?? '').trim()
    const head = String(args.head ?? '').trim()
    const base = String(args.base ?? '').trim()
    if (!title || !head || !base) return { tool_message: 'Erro: "title", "head" e "base" são obrigatórios.' }
    const body = String(args.body ?? '').trim()
    if (approvalGateActive() && args.approved !== true) {
      return requestGithubApproval(ctx, {
        title: `Abrir PR em ${target.owner}/${target.repo}`,
        summary: `"${title}" (${head} → ${base}).`,
        resumeTool: 'github_open_pr',
        resumeArgs: { owner: target.owner, repo: target.repo, title, head, base, body },
      })
    }
    try {
      const pr = await githubCreatePullRequest(token, target.owner, target.repo, { title, head, base, body }, ctx.signal)
      emitConnector(ctx, `GitHub: PR #${pr.number} aberto`)
      await auditSafe(ctx, { operation: 'github_open_pr', actor: 'connector', status: 'executed', approval_id: args.approval_id, resource_path: `${target.owner}/${target.repo}`, message: `PR #${pr.number}` })
      return { tool_message: `✅ Pull request aberto: ${pr.html_url}` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      await auditSafe(ctx, { operation: 'github_open_pr', actor: 'connector', status: 'failed', approval_id: args.approval_id, resource_path: `${target.owner}/${target.repo}`, message: (err as Error).message })
      return { tool_message: `Falha ao abrir PR: ${(err as Error).message}` }
    }
  },
}

interface GithubCommentArgs { owner?: string; repo?: string; issue_number?: number; body?: string; approved?: boolean; approval_id?: string }
const githubCommentSkill: Skill<GithubCommentArgs> = {
  name: 'github_comment',
  description: 'Comenta em uma issue ou pull request do GitHub. Pede aprovação do usuário quando o portão de ações no PC está ativo.',
  argsHint: { owner: 'Dono/org', repo: 'Repositório', issue_number: 'Número da issue/PR', body: 'Texto do comentário' },
  async run(args, ctx): Promise<SkillResult> {
    const { token, defaultOwner, defaultRepo } = await resolveToken(ctx)
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    const target = resolveOwnerRepo(args, { defaultOwner, defaultRepo })
    if (!target) return { tool_message: 'Informe "owner" e "repo" (ou configure padrões no conector).' }
    const issueNumber = Number(args.issue_number)
    if (!Number.isFinite(issueNumber) || issueNumber <= 0) return { tool_message: 'Erro: "issue_number" inválido.' }
    const body = String(args.body ?? '').trim()
    if (!body) return { tool_message: 'Erro: "body" é obrigatório.' }
    if (approvalGateActive() && args.approved !== true) {
      return requestGithubApproval(ctx, {
        title: `Comentar em ${target.owner}/${target.repo}#${issueNumber}`,
        summary: body.slice(0, 240),
        resumeTool: 'github_comment',
        resumeArgs: { owner: target.owner, repo: target.repo, issue_number: issueNumber, body },
      })
    }
    try {
      const comment = await githubAddIssueComment(token, target.owner, target.repo, issueNumber, body, ctx.signal)
      emitConnector(ctx, `GitHub: comentário em #${issueNumber}`)
      await auditSafe(ctx, { operation: 'github_comment', actor: 'connector', status: 'executed', approval_id: args.approval_id, resource_path: `${target.owner}/${target.repo}#${issueNumber}` })
      return { tool_message: `✅ Comentário publicado: ${comment.html_url}` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      await auditSafe(ctx, { operation: 'github_comment', actor: 'connector', status: 'failed', approval_id: args.approval_id, resource_path: `${target.owner}/${target.repo}#${issueNumber}`, message: (err as Error).message })
      return { tool_message: `Falha ao comentar: ${(err as Error).message}` }
    }
  },
}

/** GitHub connector skills, exposed only when `FF_CHAT_GITHUB` is on. */
export function buildGithubSkills(): Skill[] {
  if (!isEnabled('FF_CHAT_GITHUB')) return []
  return [githubListReposSkill, githubReadFileSkill, githubCreateIssueSkill, githubOpenPrSkill, githubCommentSkill]
}

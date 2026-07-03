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
  githubCommitTree,
  githubCreateBranch,
  githubCreateIssue,
  githubCreatePullRequest,
  githubDeleteFile,
  githubGetCombinedStatus,
  githubGetFile,
  githubGetFileSha,
  githubListPullRequestFiles,
  githubListRepos,
  githubPutFile,
} from './github-client'
import type { GithubCommitFile } from './github-client'

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

/** Branches we never allow direct writes to — mutations must go through a PR. */
const PROTECTED_BRANCHES = new Set(['main', 'master'])

/** Max files a single multi-file commit may touch (fail-safe, plan §Prevenção). */
const MAX_COMMIT_FILES = 50

function isProtectedBranch(branch: string): boolean {
  return PROTECTED_BRANCHES.has(branch.trim().toLowerCase())
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

// ── Write skills: repository contents (gated) ─────────────────────────────────

interface GithubWriteFileArgs { owner?: string; repo?: string; path?: string; content?: string; message?: string; branch?: string; approved?: boolean; approval_id?: string }
const githubWriteFileSkill: Skill<GithubWriteFileArgs> = {
  name: 'github_write_file',
  description: 'Cria ou atualiza um arquivo em um repositório GitHub (contents API). Nunca escreve direto em main/master. Pede aprovação quando o portão de ações está ativo.',
  argsHint: { owner: 'Dono/org', repo: 'Repositório', path: 'Caminho do arquivo', content: 'Conteúdo completo do arquivo', message: 'Mensagem de commit', branch: 'Branch alvo (não pode ser main/master)' },
  async run(args, ctx): Promise<SkillResult> {
    const { token, defaultOwner, defaultRepo } = await resolveToken(ctx)
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    const target = resolveOwnerRepo(args, { defaultOwner, defaultRepo })
    if (!target) return { tool_message: 'Informe "owner" e "repo" (ou configure padrões no conector).' }
    const path = String(args.path ?? '').trim()
    if (!path) return { tool_message: 'Erro: "path" é obrigatório.' }
    if (typeof args.content !== 'string') return { tool_message: 'Erro: "content" é obrigatório.' }
    const branch = String(args.branch ?? '').trim()
    if (!branch) return { tool_message: 'Erro: "branch" é obrigatório (nunca escrevemos direto em main/master).' }
    if (isProtectedBranch(branch)) return { tool_message: `Erro: escrita direta em "${branch}" bloqueada. Crie um branch dedicado e abra um PR.` }
    const message = String(args.message ?? '').trim() || `Atualiza ${path}`
    if (approvalGateActive() && args.approved !== true) {
      return requestGithubApproval(ctx, {
        title: `Gravar arquivo em ${target.owner}/${target.repo}`,
        summary: `${path} em ${branch} (${args.content.length} caracteres).`,
        resumeTool: 'github_write_file',
        resumeArgs: { owner: target.owner, repo: target.repo, path, content: args.content, message, branch },
      })
    }
    try {
      const sha = await githubGetFileSha(token, target.owner, target.repo, path, branch, ctx.signal)
      const res = await githubPutFile(token, target.owner, target.repo, { path, content: args.content, message, branch, sha }, ctx.signal)
      emitConnector(ctx, `GitHub: ${sha ? 'atualizou' : 'criou'} ${path} em ${branch}`)
      await auditSafe(ctx, { operation: 'github_write_file', actor: 'connector', status: 'executed', approval_id: args.approval_id, resource_path: `${target.owner}/${target.repo}/${path}@${branch}`, message: res.commit.sha })
      return { tool_message: `✅ ${sha ? 'Arquivo atualizado' : 'Arquivo criado'}: ${path} (${res.commit.sha.slice(0, 7)})${res.commit.html_url ? ` — ${res.commit.html_url}` : ''}` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      await auditSafe(ctx, { operation: 'github_write_file', actor: 'connector', status: 'failed', approval_id: args.approval_id, resource_path: `${target.owner}/${target.repo}/${path}@${branch}`, message: (err as Error).message })
      return { tool_message: `Falha ao gravar ${path}: ${(err as Error).message}` }
    }
  },
}

interface GithubDeleteFileArgs { owner?: string; repo?: string; path?: string; message?: string; branch?: string; approved?: boolean; approval_id?: string }
const githubDeleteFileSkill: Skill<GithubDeleteFileArgs> = {
  name: 'github_delete_file',
  description: 'Remove um arquivo de um repositório GitHub. Nunca apaga direto em main/master. Pede aprovação quando o portão de ações está ativo.',
  argsHint: { owner: 'Dono/org', repo: 'Repositório', path: 'Caminho do arquivo', message: 'Mensagem de commit', branch: 'Branch alvo (não pode ser main/master)' },
  async run(args, ctx): Promise<SkillResult> {
    const { token, defaultOwner, defaultRepo } = await resolveToken(ctx)
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    const target = resolveOwnerRepo(args, { defaultOwner, defaultRepo })
    if (!target) return { tool_message: 'Informe "owner" e "repo" (ou configure padrões no conector).' }
    const path = String(args.path ?? '').trim()
    if (!path) return { tool_message: 'Erro: "path" é obrigatório.' }
    const branch = String(args.branch ?? '').trim()
    if (!branch) return { tool_message: 'Erro: "branch" é obrigatório (nunca apagamos direto em main/master).' }
    if (isProtectedBranch(branch)) return { tool_message: `Erro: remoção direta em "${branch}" bloqueada. Crie um branch dedicado e abra um PR.` }
    const message = String(args.message ?? '').trim() || `Remove ${path}`
    if (approvalGateActive() && args.approved !== true) {
      return requestGithubApproval(ctx, {
        title: `Remover arquivo em ${target.owner}/${target.repo}`,
        summary: `${path} em ${branch}.`,
        resumeTool: 'github_delete_file',
        resumeArgs: { owner: target.owner, repo: target.repo, path, message, branch },
      })
    }
    try {
      const sha = await githubGetFileSha(token, target.owner, target.repo, path, branch, ctx.signal)
      if (!sha) return { tool_message: `Erro: "${path}" não existe em ${branch}.` }
      const res = await githubDeleteFile(token, target.owner, target.repo, { path, message, sha, branch }, ctx.signal)
      emitConnector(ctx, `GitHub: removeu ${path} em ${branch}`)
      await auditSafe(ctx, { operation: 'github_delete_file', actor: 'connector', status: 'executed', approval_id: args.approval_id, resource_path: `${target.owner}/${target.repo}/${path}@${branch}`, message: res.commit.sha })
      return { tool_message: `✅ Arquivo removido: ${path} (${res.commit.sha.slice(0, 7)})` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      await auditSafe(ctx, { operation: 'github_delete_file', actor: 'connector', status: 'failed', approval_id: args.approval_id, resource_path: `${target.owner}/${target.repo}/${path}@${branch}`, message: (err as Error).message })
      return { tool_message: `Falha ao remover ${path}: ${(err as Error).message}` }
    }
  },
}

interface GithubCreateBranchArgs { owner?: string; repo?: string; branch?: string; from?: string; approved?: boolean; approval_id?: string }
const githubCreateBranchSkill: Skill<GithubCreateBranchArgs> = {
  name: 'github_create_branch',
  description: 'Cria um novo branch a partir de outro (base) em um repositório GitHub. Pede aprovação quando o portão de ações está ativo.',
  argsHint: { owner: 'Dono/org', repo: 'Repositório', branch: 'Nome do novo branch', from: 'Branch base (ex.: main)' },
  async run(args, ctx): Promise<SkillResult> {
    const { token, defaultOwner, defaultRepo } = await resolveToken(ctx)
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    const target = resolveOwnerRepo(args, { defaultOwner, defaultRepo })
    if (!target) return { tool_message: 'Informe "owner" e "repo" (ou configure padrões no conector).' }
    const branch = String(args.branch ?? '').trim()
    const from = String(args.from ?? '').trim()
    if (!branch || !from) return { tool_message: 'Erro: "branch" (novo) e "from" (base) são obrigatórios.' }
    if (isProtectedBranch(branch)) return { tool_message: `Erro: "${branch}" é um branch protegido.` }
    if (approvalGateActive() && args.approved !== true) {
      return requestGithubApproval(ctx, {
        title: `Criar branch em ${target.owner}/${target.repo}`,
        summary: `"${branch}" a partir de "${from}".`,
        resumeTool: 'github_create_branch',
        resumeArgs: { owner: target.owner, repo: target.repo, branch, from },
      })
    }
    try {
      const res = await githubCreateBranch(token, target.owner, target.repo, { newBranch: branch, fromBranch: from }, ctx.signal)
      emitConnector(ctx, `GitHub: branch ${branch} criado`)
      await auditSafe(ctx, { operation: 'github_create_branch', actor: 'connector', status: 'executed', approval_id: args.approval_id, resource_path: `${target.owner}/${target.repo}@${branch}`, message: res.sha })
      return { tool_message: `✅ Branch criado: ${branch} (${res.sha.slice(0, 7)})` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      await auditSafe(ctx, { operation: 'github_create_branch', actor: 'connector', status: 'failed', approval_id: args.approval_id, resource_path: `${target.owner}/${target.repo}@${branch}`, message: (err as Error).message })
      return { tool_message: `Falha ao criar branch: ${(err as Error).message}` }
    }
  },
}

interface GithubCommitArgs { owner?: string; repo?: string; branch?: string; message?: string; files?: unknown; approved?: boolean; approval_id?: string }
function parseCommitFiles(raw: unknown): GithubCommitFile[] | { error: string } {
  if (!Array.isArray(raw)) return { error: '"files" deve ser uma lista de { path, content } ou { path, delete: true }.' }
  const files: GithubCommitFile[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return { error: 'Cada entrada de "files" deve ser um objeto.' }
    const path = String((item as { path?: unknown }).path ?? '').trim()
    if (!path) return { error: 'Cada entrada de "files" precisa de "path".' }
    const del = (item as { delete?: unknown }).delete === true
    const content = (item as { content?: unknown }).content
    if (!del && typeof content !== 'string') return { error: `"${path}" precisa de "content" (ou delete: true).` }
    files.push(del ? { path, delete: true } : { path, content: String(content) })
  }
  if (files.length === 0) return { error: '"files" está vazio.' }
  if (files.length > MAX_COMMIT_FILES) return { error: `Limite de ${MAX_COMMIT_FILES} arquivos por commit excedido (${files.length}).` }
  return files
}
const githubCommitSkill: Skill<GithubCommitArgs> = {
  name: 'github_commit',
  description: 'Faz um único commit com múltiplas alterações de arquivos (criar/atualizar/remover) em um branch. Nunca commita direto em main/master. Pede aprovação quando o portão de ações está ativo.',
  argsHint: { owner: 'Dono/org', repo: 'Repositório', branch: 'Branch alvo (não pode ser main/master)', message: 'Mensagem de commit', files: 'Lista [{ path, content } | { path, delete: true }]' },
  async run(args, ctx): Promise<SkillResult> {
    const { token, defaultOwner, defaultRepo } = await resolveToken(ctx)
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    const target = resolveOwnerRepo(args, { defaultOwner, defaultRepo })
    if (!target) return { tool_message: 'Informe "owner" e "repo" (ou configure padrões no conector).' }
    const branch = String(args.branch ?? '').trim()
    if (!branch) return { tool_message: 'Erro: "branch" é obrigatório (nunca commitamos direto em main/master).' }
    if (isProtectedBranch(branch)) return { tool_message: `Erro: commit direto em "${branch}" bloqueado. Crie um branch dedicado e abra um PR.` }
    const message = String(args.message ?? '').trim()
    if (!message) return { tool_message: 'Erro: "message" é obrigatório.' }
    const parsed = parseCommitFiles(args.files)
    if (!Array.isArray(parsed)) return { tool_message: `Erro: ${parsed.error}` }
    if (approvalGateActive() && args.approved !== true) {
      const changed = parsed.map(f => `${f.delete ? '− ' : '± '}${f.path}`).join('\n')
      return requestGithubApproval(ctx, {
        title: `Commit em ${target.owner}/${target.repo}@${branch}`,
        summary: `${message}\n\n${changed}`,
        resumeTool: 'github_commit',
        resumeArgs: { owner: target.owner, repo: target.repo, branch, message, files: parsed },
      })
    }
    try {
      const res = await githubCommitTree(token, target.owner, target.repo, { branch, message, files: parsed }, ctx.signal)
      emitConnector(ctx, `GitHub: commit ${res.sha.slice(0, 7)} em ${branch} (${parsed.length} arquivo(s))`)
      await auditSafe(ctx, { operation: 'github_commit', actor: 'connector', status: 'executed', approval_id: args.approval_id, resource_path: `${target.owner}/${target.repo}@${branch}`, message: res.sha })
      return { tool_message: `✅ Commit criado: ${res.sha.slice(0, 7)} em ${branch} (${parsed.length} arquivo(s))${res.html_url ? ` — ${res.html_url}` : ''}` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      await auditSafe(ctx, { operation: 'github_commit', actor: 'connector', status: 'failed', approval_id: args.approval_id, resource_path: `${target.owner}/${target.repo}@${branch}`, message: (err as Error).message })
      return { tool_message: `Falha ao commitar: ${(err as Error).message}` }
    }
  },
}

// ── Read skills: status / PR files (freely) ───────────────────────────────────

interface GithubGetStatusArgs { owner?: string; repo?: string; ref?: string }
const githubGetStatusSkill: Skill<GithubGetStatusArgs> = {
  name: 'github_get_status',
  description: 'Consulta o status combinado (checks de CI) de um branch ou commit. Somente leitura.',
  argsHint: { owner: 'Dono/org', repo: 'Repositório', ref: 'Branch, tag ou SHA' },
  async run(args, ctx): Promise<SkillResult> {
    const { token, defaultOwner, defaultRepo } = await resolveToken(ctx)
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    const target = resolveOwnerRepo(args, { defaultOwner, defaultRepo })
    if (!target) return { tool_message: 'Informe "owner" e "repo" (ou configure padrões no conector).' }
    const ref = String(args.ref ?? '').trim()
    if (!ref) return { tool_message: 'Erro: "ref" é obrigatório.' }
    try {
      const status = await githubGetCombinedStatus(token, target.owner, target.repo, ref, ctx.signal)
      emitConnector(ctx, `GitHub: status ${status.state} para ${ref}`)
      const lines = status.statuses.map(s => `- ${s.context}: ${s.state}`).join('\n')
      return { tool_message: `🔎 Status de ${ref}: ${status.state} (${status.total_count} check(s))${lines ? `\n${lines}` : ''}` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      return { tool_message: `Falha ao obter status: ${(err as Error).message}` }
    }
  },
}

interface GithubListPrFilesArgs { owner?: string; repo?: string; pull_number?: number }
const githubListPrFilesSkill: Skill<GithubListPrFilesArgs> = {
  name: 'github_list_pr_files',
  description: 'Lista os arquivos alterados em um pull request. Somente leitura.',
  argsHint: { owner: 'Dono/org', repo: 'Repositório', pull_number: 'Número do PR' },
  async run(args, ctx): Promise<SkillResult> {
    const { token, defaultOwner, defaultRepo } = await resolveToken(ctx)
    if (!token) return { tool_message: NO_TOKEN_MESSAGE }
    const target = resolveOwnerRepo(args, { defaultOwner, defaultRepo })
    if (!target) return { tool_message: 'Informe "owner" e "repo" (ou configure padrões no conector).' }
    const pullNumber = Number(args.pull_number)
    if (!Number.isFinite(pullNumber) || pullNumber <= 0) return { tool_message: 'Erro: "pull_number" inválido.' }
    try {
      const files = await githubListPullRequestFiles(token, target.owner, target.repo, pullNumber, ctx.signal)
      emitConnector(ctx, `GitHub: PR #${pullNumber} com ${files.length} arquivo(s)`)
      const lines = files.slice(0, 100).map(f => `- ${f.filename} (${f.status}, +${f.additions}/−${f.deletions})`).join('\n')
      return { tool_message: `📝 Arquivos do PR #${pullNumber}:\n${lines || '(nenhum)'}` }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      return { tool_message: `Falha ao listar arquivos do PR: ${(err as Error).message}` }
    }
  },
}

/** GitHub connector skills, exposed only when `FF_CHAT_GITHUB` is on. */
export function buildGithubSkills(): Skill[] {
  if (!isEnabled('FF_CHAT_GITHUB')) return []
  return [
    githubListReposSkill,
    githubReadFileSkill,
    githubCreateIssueSkill,
    githubOpenPrSkill,
    githubCommentSkill,
    githubWriteFileSkill,
    githubDeleteFileSkill,
    githubCreateBranchSkill,
    githubCommitSkill,
    githubGetStatusSkill,
    githubListPrFilesSkill,
  ]
}

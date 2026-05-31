/**
 * Chat Orchestrator v2 — tool catalog metadata.
 *
 * The v2 lead drives the SAME skill registry the v1 runtime exposes, plus a v2
 * `fetch_url` site-access tool. This catalog is metadata only (name + label +
 * description + category) used by the per-user tools config and its settings
 * card. The runtime maps these names onto the real `Skill` objects.
 */

export type ChatV2ToolCategory =
  | 'orquestracao'
  | 'midia'
  | 'documentos'
  | 'web'
  | 'pc'
  | 'github'
  | 'google'

export interface ChatV2ToolMeta {
  name: string
  label: string
  description: string
  category: ChatV2ToolCategory
  /** When true the tool cannot be disabled (the loop needs it). */
  alwaysOn?: boolean
}

export const CHAT_V2_TOOL_CATEGORY_LABELS: Record<ChatV2ToolCategory, string> = {
  orquestracao: 'Orquestração & controle',
  midia: 'Geração de mídia',
  documentos: 'Documentos & artefatos',
  web: 'Pesquisa & acesso à web',
  pc: 'Ações no PC (sidecar)',
  github: 'Conector GitHub',
  google: 'Conectores Google (Drive + Gmail)',
}

/**
 * Curated catalog. The lead agent (cv2_orchestrator) delegates to the worker
 * (cv2_worker) via `call_agent` and finalizes via `submit_final_answer` — both
 * are always on. Everything else is user-toggleable.
 */
export const CHAT_V2_TOOL_CATALOG: ChatV2ToolMeta[] = [
  // ── Orquestração & controle ──
  { name: 'call_agent', label: 'Delegar ao trabalhador', description: 'Delega uma subtarefa focada ao subagente trabalhador (pesquisa, redação, código, análise).', category: 'orquestracao', alwaysOn: true },
  { name: 'call_agents_parallel', label: 'Delegar em paralelo', description: 'Despacha múltiplas subtarefas independentes ao trabalhador em paralelo (fan-out por esforço).', category: 'orquestracao' },
  { name: 'summarize_context', label: 'Resumir histórico', description: 'Comprime o histórico longo para liberar orçamento de tokens.', category: 'orquestracao' },
  { name: 'critique_draft', label: 'Criticar rascunho', description: 'Aciona o crítico sobre o rascunho atual (score 0-100 + razões).', category: 'orquestracao' },
  { name: 'ask_user_question', label: 'Perguntar ao usuário', description: 'Pausa o turno para perguntar algo que só o usuário sabe.', category: 'orquestracao' },
  { name: 'request_user_approval', label: 'Pedir aprovação', description: 'Solicita aprovação do usuário para ações caras ou com efeitos colaterais.', category: 'orquestracao' },
  { name: 'submit_final_answer', label: 'Finalizar resposta', description: 'Encerra o turno com a resposta final em markdown.', category: 'orquestracao', alwaysOn: true },

  // ── Geração de mídia ──
  { name: 'generate_image', label: 'Gerar imagem', description: 'Gera imagem literal (PNG/JPG/WebP) via provedor configurado.', category: 'midia' },
  { name: 'generate_audio', label: 'Gerar áudio', description: 'Gera áudio/narração literal (MP3/WAV) via TTS.', category: 'midia' },
  { name: 'generate_video', label: 'Gerar vídeo', description: 'Gera vídeo literal (MP4) via provedor de vídeo por IA.', category: 'midia' },
  { name: 'generate_presentation', label: 'Gerar apresentação', description: 'Gera um deck de apresentação com export PPTX.', category: 'midia' },

  // ── Documentos & artefatos ──
  { name: 'generate_document', label: 'Gerar documento jurídico', description: 'Gera documento jurídico (parecer, petição, etc.) com export DOCX.', category: 'documentos' },
  { name: 'check_document_status', label: 'Status do documento', description: 'Consulta o status de uma geração de documento em andamento.', category: 'documentos' },
  { name: 'generate_studio_artifact', label: 'Gerar artefato do estúdio', description: 'Gera artefatos ricos (tabelas, mapas mentais, infográficos, scripts, código).', category: 'documentos' },

  // ── Pesquisa & acesso à web ──
  { name: 'hybrid_search', label: 'Busca web híbrida', description: 'Pesquisa na web (semântica + lexical) com fusão de resultados.', category: 'web' },
  { name: 'fetch_url', label: 'Acessar site (URL)', description: 'Acessa uma URL e extrai o conteúdo textual da página para análise.', category: 'web' },
  { name: 'search_jurisprudence', label: 'Buscar jurisprudência', description: 'Pesquisa jurisprudência real no DataJud (STF/STJ/tribunais).', category: 'web' },
  { name: 'analyze_thesis', label: 'Analisar teses', description: 'Aciona o pipeline de análise de teses do usuário.', category: 'web' },

  // ── Ações no PC (sidecar @lexio/desktop) ──
  { name: 'read_file', label: 'Ler arquivo (PC)', description: 'Lê o conteúdo de um arquivo no PC do usuário via sidecar.', category: 'pc' },
  { name: 'list_directory', label: 'Listar diretório (PC)', description: 'Lista o conteúdo de um diretório no PC do usuário via sidecar.', category: 'pc' },
  { name: 'write_file', label: 'Escrever arquivo (PC)', description: 'Escreve conteúdo em um arquivo no PC do usuário via sidecar. Pede aprovação quando o portão de ações no PC está ativo.', category: 'pc' },
  { name: 'run_shell', label: 'Executar comando (PC)', description: 'Executa um comando de shell no PC do usuário via sidecar (com bloqueio de comandos destrutivos). Pede aprovação quando o portão de ações no PC está ativo.', category: 'pc' },
  { name: 'delete_file', label: 'Apagar arquivo (PC)', description: 'Apaga um arquivo (ou pasta vazia) no PC via sidecar. Só disponível com o portão de aprovação ativo; sempre pede confirmação.', category: 'pc' },
  { name: 'rename_file', label: 'Renomear/mover arquivo (PC)', description: 'Renomeia ou move um arquivo no PC via sidecar. Só disponível com o portão de aprovação ativo; sempre pede confirmação.', category: 'pc' },
  { name: 'git_status', label: 'git status (PC)', description: 'Mostra o status do repositório git na pasta do sidecar. Somente leitura.', category: 'pc' },
  { name: 'git_diff', label: 'git diff (PC)', description: 'Mostra alterações não comitadas do repositório git na pasta do sidecar. Somente leitura.', category: 'pc' },
  { name: 'git_commit', label: 'git commit (PC)', description: 'Cria um commit no repositório git da pasta do sidecar. Pede aprovação quando o portão de ações no PC está ativo.', category: 'pc' },
  { name: 'git_pull', label: 'git pull (PC)', description: 'Executa git pull no repositório da pasta do sidecar. Pede aprovação quando o portão de ações no PC está ativo.', category: 'pc' },
  { name: 'git_push', label: 'git push (PC)', description: 'Executa git push no repositório da pasta do sidecar. Pede aprovação quando o portão de ações no PC está ativo.', category: 'pc' },

  // ── Conector GitHub (PAT) ──
  { name: 'github_list_repos', label: 'GitHub: listar repos', description: 'Lista os repositórios acessíveis pelo token GitHub. Somente leitura.', category: 'github' },
  { name: 'github_read_file', label: 'GitHub: ler arquivo', description: 'Lê o conteúdo de um arquivo de um repositório GitHub. Somente leitura.', category: 'github' },
  { name: 'github_create_issue', label: 'GitHub: criar issue', description: 'Cria uma issue em um repositório GitHub. Pede aprovação quando o portão de ações no PC está ativo.', category: 'github' },
  { name: 'github_open_pr', label: 'GitHub: abrir PR', description: 'Abre um pull request em um repositório GitHub. Pede aprovação quando o portão de ações no PC está ativo.', category: 'github' },
  { name: 'github_comment', label: 'GitHub: comentar', description: 'Comenta em uma issue ou PR do GitHub. Pede aprovação quando o portão de ações no PC está ativo.', category: 'github' },

  // ── Conectores Google (Drive + Gmail) ──
  { name: 'drive_list_files', label: 'Drive: listar arquivos', description: 'Lista arquivos do Google Drive (somente leitura).', category: 'google' },
  { name: 'drive_read_file', label: 'Drive: ler arquivo', description: 'Lê o conteúdo textual de um arquivo do Google Drive (Docs/Sheets/Slides exportados como texto). Somente leitura.', category: 'google' },
  { name: 'gmail_search', label: 'Gmail: buscar', description: 'Busca e-mails no Gmail (sintaxe do Gmail). Somente leitura.', category: 'google' },
  { name: 'gmail_read', label: 'Gmail: ler', description: 'Lê um e-mail do Gmail por id. Somente leitura.', category: 'google' },
  { name: 'gmail_create_draft', label: 'Gmail: criar rascunho', description: 'Cria um rascunho de e-mail (não envia). Pede aprovação quando o portão de ações está ativo.', category: 'google' },
]

export const CHAT_V2_TOOL_NAMES: string[] = CHAT_V2_TOOL_CATALOG.map(t => t.name)
export const CHAT_V2_ALWAYS_ON_TOOLS: ReadonlySet<string> = new Set(
  CHAT_V2_TOOL_CATALOG.filter(t => t.alwaysOn).map(t => t.name),
)

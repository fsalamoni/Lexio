/**
 * Research Notebook (Caderno de Pesquisa) — an intelligent research assistant
 * and annotation tool inspired by NotebookLM. Users can create topic-based
 * notebooks that index content from the acervo and uploaded sources, then
 * chat with an AI assistant and use the Studio to generate artifacts.
 *
 * Stored permanently per-user in Firestore under /users/{uid}/research_notebooks.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, Search, BookOpen, MessageCircle, Sparkles, FileText, Trash2,
  ArrowLeft, Send, Database, Clock, Upload,
  MoreVertical, Loader2,
  PenTool, Map, CreditCard, BarChart3, Table, FileQuestion,
  Presentation, Mic, Video, X, CheckCircle2, Brain, Link2,
  Copy, Check as CheckIcon, Download, RotateCcw, Edit3, Info,
  Globe, BookMarked, AlertCircle, ChevronUp, ChevronDown,
  Library, ScanSearch,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { IS_FIREBASE } from '../lib/firebase'
import {
  listResearchNotebooks,
  createResearchNotebook,
  updateResearchNotebook,
  deleteResearchNotebook,
  getResearchNotebook,
  listAcervoDocuments,
  type ResearchNotebookData,
  type NotebookSource,
  type NotebookMessage,
  type StudioArtifact,
  type StudioArtifactType,
  type AcervoDocumentData,
} from '../lib/firestore-service'
import { callLLM, callLLMWithMessages, ModelUnavailableError, type LLMResult } from '../lib/llm-client'
import { getOpenRouterKey } from '../lib/generation-service'
import { loadResearchNotebookModels } from '../lib/model-config'
import {
  createUsageExecutionRecord,
} from '../lib/cost-analytics'
import { analyzeNotebookAcervo, type AnalyzedDocument, type AcervoAnalysisProgress } from '../lib/notebook-acervo-analyzer'

// ── Constants ────────────────────────────────────────────────────────────────

/** Max characters stored per source text content */
const MAX_SOURCE_TEXT_LENGTH = 50_000
/** Max characters per source included in LLM context */
const MAX_CONTEXT_TEXT_LENGTH = 15_000
/** Max messages from conversation to include as context */
const MAX_CONVERSATION_CONTEXT_MESSAGES = 20
/** Max messages from conversation included in studio prompts */
const MAX_STUDIO_CONTEXT_MESSAGES = 10
/** Max characters of conversation context included in studio prompts */
const MAX_STUDIO_CONTEXT_CHARS = 5_000
/** Max visible length for suggestion button labels */
const MAX_SUGGESTION_LABEL_LENGTH = 60
/** Max chars from web search snippets injected into chat context */
const MAX_WEB_SEARCH_CHARS = 3_000
/** Min chars in source text_content to be considered indexed */
const MIN_SOURCE_CHARS = 20

/** Human-readable agent labels for error messages */
const AGENT_LABELS: Record<string, string> = {
  notebook_pesquisador: 'Pesquisador de Fontes',
  notebook_analista: 'Analista de Conhecimento',
  notebook_assistente: 'Assistente Conversacional',
  notebook_criador: 'Criador de Conteúdo (Estúdio)',
  nb_acervo_triagem: 'Triagem de Acervo',
  nb_acervo_buscador: 'Buscador de Acervo',
  nb_acervo_analista: 'Analista de Acervo',
  nb_acervo_curador: 'Curador de Fontes',
}

// ── URL Fetching via CORS proxy ───────────────────────────────────────────────

/**
 * Fetches readable text from a URL using Jina Reader, falling back to
 * allorigins CORS proxy. Both are free, no-auth CORS-friendly services.
 */
async function fetchUrlContent(url: string): Promise<string> {
  // Try Jina Reader — returns clean readable text for any webpage
  try {
    const jinaUrl = `https://r.jina.ai/${url}`
    const resp = await fetch(jinaUrl, {
      headers: { Accept: 'text/plain', 'X-Return-Format': 'text' },
      signal: AbortSignal.timeout(20_000),
    })
    if (resp.ok) {
      const text = await resp.text()
      if (text && text.length > 100) return text.slice(0, MAX_SOURCE_TEXT_LENGTH)
    }
  } catch { /* try next */ }

  // Fallback: allorigins proxy
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(15_000) })
    if (resp.ok) {
      const data = await resp.json() as { contents?: string }
      const raw = data.contents || ''
      const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s{3,}/g, ' ').trim()
      if (text.length > 100) return text.slice(0, MAX_SOURCE_TEXT_LENGTH)
    }
  } catch { /* not available */ }

  return ''
}

// ── Web Search via DuckDuckGo Instant Answer ──────────────────────────────────

/**
 * Lightweight web search using DuckDuckGo's instant answer API.
 * No API key required; CORS-friendly.
 */
async function searchWeb(query: string): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!resp.ok) return ''
    const data = await resp.json() as {
      AbstractText?: string
      RelatedTopics?: { Text?: string; FirstURL?: string }[]
    }
    const parts: string[] = []
    if (data.AbstractText) parts.push(data.AbstractText)
    for (const t of (data.RelatedTopics || []).slice(0, 5)) {
      if (t.Text) parts.push(`• ${t.Text}${t.FirstURL ? ` (${t.FirstURL})` : ''}`)
    }
    const result = parts.join('\n')
    return result.length > 50 ? result.slice(0, MAX_WEB_SEARCH_CHARS) : ''
  } catch {
    return ''
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const ARTIFACT_TYPES: { type: StudioArtifactType; label: string; icon: React.ElementType; description: string }[] = [
  { type: 'resumo', label: 'Resumo', icon: FileText, description: 'Síntese completa do tema pesquisado' },
  { type: 'mapa_mental', label: 'Mapa Mental', icon: Map, description: 'Estrutura visual de conceitos e relações' },
  { type: 'cartoes_didaticos', label: 'Cartões Didáticos', icon: CreditCard, description: 'Flashcards para revisão e memorização' },
  { type: 'apresentacao', label: 'Apresentação', icon: Presentation, description: 'Slides estruturados para apresentação' },
  { type: 'relatorio', label: 'Relatório', icon: BarChart3, description: 'Relatório analítico detalhado' },
  { type: 'tabela_dados', label: 'Tabela de Dados', icon: Table, description: 'Dados organizados em formato tabular' },
  { type: 'teste', label: 'Teste / Quiz', icon: FileQuestion, description: 'Questões para avaliação de conhecimento' },
  { type: 'infografico', label: 'Infográfico', icon: PenTool, description: 'Informações visuais em formato texto' },
  { type: 'documento', label: 'Documento', icon: FileText, description: 'Documento formal estruturado' },
  { type: 'audio_script', label: 'Roteiro de Áudio', icon: Mic, description: 'Script para produção de áudio/podcast' },
  { type: 'video_script', label: 'Roteiro de Vídeo', icon: Video, description: 'Script para produção de vídeo' },
]

const SOURCE_TYPE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  acervo:  { label: 'Acervo', icon: Database },
  upload:  { label: 'Upload', icon: Upload },
  link:    { label: 'Link', icon: Link2 },
}

// ── Lightweight Markdown renderer ─────────────────────────────────────────────

/** Escape HTML entities to prevent XSS when rendering markdown. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Only allow http/https links — block javascript:, data:, etc. */
function sanitizeUrl(url: string): string {
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return '#'
}

/**
 * Converts basic Markdown to sanitised HTML for assistant messages.
 * Supports: headers, bold, italic, inline code, code blocks, lists, links, hr.
 * All text content is HTML-escaped before transformation to prevent XSS.
 * Only assistant LLM output passes through this function.
 */
function renderMarkdownToHtml(md: string): string {
  // First, extract code blocks and inline code to protect them from HTML escaping
  const codeBlocks: string[] = []
  let safe = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    const idx = codeBlocks.length
    codeBlocks.push(`<pre class="bg-gray-800 text-gray-100 rounded-lg p-3 my-2 overflow-x-auto text-xs"><code>${escapeHtml(code)}</code></pre>`)
    return `\x00CODEBLOCK${idx}\x00`
  })

  const inlineCodes: string[] = []
  safe = safe.replace(/`([^`]+)`/g, (_match, code) => {
    const idx = inlineCodes.length
    inlineCodes.push(`<code class="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-xs">${escapeHtml(code)}</code>`)
    return `\x00INLINECODE${idx}\x00`
  })

  // Escape remaining HTML entities
  safe = escapeHtml(safe)

  let html = safe
    // Headers
    .replace(/^#### (.+)$/gm, '<h4 class="font-semibold text-gray-900 mt-3 mb-1 text-sm">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-gray-900 mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-bold text-gray-900 mt-4 mb-1 text-base">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold text-gray-900 mt-4 mb-2 text-lg">$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Horizontal rule
    .replace(/^---+$/gm, '<hr class="my-3 border-gray-200" />')
    // Links [text](url) — only allow http/https
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) =>
      `<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer" class="text-brand-600 hover:underline">${text}</a>`,
    )
    // Unordered list items
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Line breaks (double newline -> paragraph break)
    .replace(/\n\n/g, '</p><p class="mt-2">')
    // Single line breaks within paragraphs
    .replace(/\n/g, '<br />')

  // Restore code blocks and inline codes
  html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_m, idx) => codeBlocks[Number(idx)])
  html = html.replace(/\x00INLINECODE(\d+)\x00/g, (_m, idx) => inlineCodes[Number(idx)])

  return `<p>${html}</p>`
}

// ── Copy Button ───────────────────────────────────────────────────────────────

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard not available */ }
  }
  return (
    <button
      onClick={e => { e.stopPropagation(); handle() }}
      title="Copiar conteúdo"
      aria-label="Copiar conteúdo"
      className={`inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600 transition-colors ${className}`}
    >
      {copied
        ? <><CheckIcon className="w-3.5 h-3.5 text-green-500" /> Copiado</>
        : <><Copy className="w-3.5 h-3.5" /> Copiar</>
      }
    </button>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function NotebookListItem({
  notebook,
  onSelect,
  onDelete,
}: {
  notebook: ResearchNotebookData
  onSelect: () => void
  onDelete: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  return (
    <div
      className="group bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-300 hover:shadow-md transition-all cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{notebook.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{notebook.topic}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(notebook.created_at)}
            </span>
            <span>{notebook.sources.length} fonte{notebook.sources.length !== 1 ? 's' : ''}</span>
            <span>{notebook.messages.length} msg</span>
            <span>{notebook.artifacts.length} artefato{notebook.artifacts.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div ref={menuRef} className="relative flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}
            className="p-1 rounded hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
          >
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-8 z-10 w-36 bg-white border rounded-lg shadow-lg py-1">
              <button
                onClick={e => { e.stopPropagation(); onDelete(); setShowMenu(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3 h-3" /> Excluir
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'detail'
type DetailTab = 'chat' | 'sources' | 'studio' | 'artifacts'

export default function ResearchNotebook() {
  const { userId } = useAuth()
  const toast = useToast()

  // List state
  const [notebooks, setNotebooks] = useState<ResearchNotebookData[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  // Detail state
  const [activeNotebook, setActiveNotebook] = useState<ResearchNotebookData | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>('chat')

  // Create dialog
  const [showCreate, setShowCreate] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createTopic, setCreateTopic] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [suggestedAcervoDocs, setSuggestedAcervoDocs] = useState<AcervoDocumentData[]>([])
  const [selectedAcervoIds, setSelectedAcervoIds] = useState<Set<string>>(new Set())

  // Chat state
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [useWebSearch, setUseWebSearch] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  // Source addition
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceUrlLoading, setSourceUrlLoading] = useState(false)
  const [acervoDocs, setAcervoDocs] = useState<AcervoDocumentData[]>([])
  const [acervoLoading, setAcervoLoading] = useState(false)

  // Notebook Guide
  const [guideLoading, setGuideLoading] = useState(false)

  // Dynamic suggested questions
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)

  // Studio
  const [studioLoading, setStudioLoading] = useState(false)
  const [selectedArtifactType, setSelectedArtifactType] = useState<StudioArtifactType | null>(null)
  const [studioCustomPrompt, setStudioCustomPrompt] = useState('')

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceSearch, setSourceSearch] = useState('')

  // Acervo analysis (multi-agent pipeline)
  const [acervoAnalysisLoading, setAcervoAnalysisLoading] = useState(false)
  const [acervoAnalysisPhase, setAcervoAnalysisPhase] = useState('')
  const [acervoAnalysisMessage, setAcervoAnalysisMessage] = useState('')
  const [acervoAnalysisPercent, setAcervoAnalysisPercent] = useState(0)
  const [acervoAnalysisResults, setAcervoAnalysisResults] = useState<AnalyzedDocument[]>([])
  const [selectedAnalysisIds, setSelectedAnalysisIds] = useState<Set<string>>(new Set())

  // Edit notebook info
  const [showEditInfo, setShowEditInfo] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editTopic, setEditTopic] = useState('')
  const [editDescription, setEditDescription] = useState('')

  // ── Load notebooks ──────────────────────────────────────────────────
  const loadNotebooks = useCallback(async () => {
    if (!userId) return
    if (!IS_FIREBASE) { setLoading(false); return }
    setLoading(true)
    try {
      const result = await listResearchNotebooks(userId)
      setNotebooks(result.items)
    } catch {
      toast.error('Erro ao carregar cadernos de pesquisa')
    } finally {
      setLoading(false)
    }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadNotebooks() }, [loadNotebooks])

  // ── Auto-scroll chat to bottom on new messages ──────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeNotebook?.messages.length, chatLoading])

  // ── Auto-grow chat textarea ─────────────────────────────────────────
  useEffect(() => {
    const el = chatInputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [chatInput])

  // ── Load acervo docs for source picker ──────────────────────────────
  const loadAcervoDocs = useCallback(async () => {
    if (!userId) return
    setAcervoLoading(true)
    try {
      if (IS_FIREBASE) {
        const result = await listAcervoDocuments(userId)
        setAcervoDocs(result.items)
      }
    } catch {
      // non-critical
    } finally {
      setAcervoLoading(false)
    }
  }, [userId])

  // ── buildSourceContext (needed by guide and suggestions) ───────────────
  const buildSourceContext = useCallback((): string => {
    if (!activeNotebook) return ''
    const parts: string[] = []
    for (const source of activeNotebook.sources) {
      if (source.text_content && source.text_content.length >= MIN_SOURCE_CHARS) {
        parts.push(`[FONTE: ${source.name}]\n${source.text_content.slice(0, MAX_CONTEXT_TEXT_LENGTH)}`)
      }
    }
    return parts.join('\n\n---\n\n')
  }, [activeNotebook])

  // ── Generate Notebook Guide ───────────────────────────────────────
  const handleGenerateGuide = useCallback(async () => {
    if (!userId || !activeNotebook?.id || guideLoading) return
    if (activeNotebook.sources.length === 0) {
      toast.error('Adicione fontes antes de gerar a Visão Geral'); return
    }
    setGuideLoading(true)
    try {
      const apiKey = await getOpenRouterKey()
      const models = await loadResearchNotebookModels()
      const model = models.notebook_analista || 'anthropic/claude-sonnet-4'
      const sourceCtx = buildSourceContext()

      const system = `Você é um especialista em síntese de conhecimento jurídico. Analise as fontes e gere uma Visão Geral completa do caderno.`
      const user = `Tema: "${activeNotebook.topic}"
${activeNotebook.description ? `Objetivo: ${activeNotebook.description}\n` : ''}
FONTES:
${sourceCtx || '(Nenhuma fonte com conteúdo extraído)'}

Gere uma VISÃO GERAL em Markdown com:
1. **Resumo do Tema** — contexto geral (2-3 parágrafos)
2. **Principais Achados** — o mais relevante de cada fonte
3. **Conexões e Padrões** — como as fontes se relacionam
4. **Lacunas Identificadas** — o que falta para pesquisa completa
5. **Questões-Chave** — as 5 perguntas mais importantes
6. **Próximos Passos** — como aprofundar a pesquisa

Responda em português brasileiro com tom técnico-jurídico.`

      const result: LLMResult = await callLLM(apiKey, system, user, model, 4000, 0.3)

      const guideArtifact: StudioArtifact = {
        id: generateId(), type: 'resumo',
        title: `📋 Visão Geral — ${activeNotebook.topic}`,
        content: result.content, format: 'markdown',
        created_at: new Date().toISOString(),
      }
      const updatedArtifacts = [guideArtifact, ...activeNotebook.artifacts]
      const execution = createUsageExecutionRecord({
        source_type: 'caderno_pesquisa', source_id: activeNotebook.id,
        phase: 'notebook_analista', agent_name: 'Analista de Conhecimento',
        model: result.model, tokens_in: result.tokens_in, tokens_out: result.tokens_out,
        cost_usd: result.cost_usd, duration_ms: result.duration_ms,
      })
      const updatedExecutions = [...(activeNotebook.llm_executions || []), execution]
      await updateResearchNotebook(userId, activeNotebook.id, {
        artifacts: updatedArtifacts, llm_executions: updatedExecutions,
      })
      setActiveNotebook({ ...activeNotebook, artifacts: updatedArtifacts, llm_executions: updatedExecutions })
      setActiveTab('artifacts')
      toast.success('Visão Geral gerada!')
    } catch (err) {
      console.error('Guide error:', err)
      if (err instanceof ModelUnavailableError) {
        toast.warning(
          `Modelo indisponível: ${err.modelId}`,
          `O modelo do agente "${AGENT_LABELS.notebook_analista}" foi removido do OpenRouter. Vá em Administração > Caderno de Pesquisa e substitua-o.`,
        )
      } else {
        toast.error('Erro ao gerar Visão Geral. Verifique sua chave de API.')
      }
    } finally {
      setGuideLoading(false)
    }
  }, [userId, activeNotebook, guideLoading, buildSourceContext]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Generate dynamic suggested questions ────────────────────────────
  const generateSuggestions = useCallback(async () => {
    if (!activeNotebook || suggestionsLoading) return
    const sourceCtx = buildSourceContext()
    if (!sourceCtx) {
      setSuggestions([
        `Quais os principais conceitos sobre "${activeNotebook.topic}"?`,
        `Faça um resumo geral sobre "${activeNotebook.topic}"`,
        'Quais são os pontos controversos?',
        'Liste as fontes normativas aplicáveis',
      ])
      return
    }
    setSuggestionsLoading(true)
    try {
      const apiKey = await getOpenRouterKey()
      const models = await loadResearchNotebookModels()
      const model = models.notebook_pesquisador || 'anthropic/claude-3.5-haiku'
      const preview = sourceCtx.slice(0, 4_000)
      const result = await callLLM(apiKey,
        'Você gera perguntas de pesquisa relevantes com base em fontes jurídicas.',
        `Tema: "${activeNotebook.topic}"
Resumo das fontes:\n${preview}\n\nGere exatamente 5 perguntas curtas e objetivas que o usuário poderia fazer ao assistente.\nFormato: uma pergunta por linha, sem numeração, sem prefixos.`,
        model, 300, 0.5)
      const lines = result.content
        .split('\n')
        .map(l => l.replace(/^[-•*\d.]+\s*/, '').trim())
        .filter(l => l.length > 10 && l.length < 120)
        .slice(0, 5)
      if (lines.length >= 3) setSuggestions(lines)
    } catch { /* keep static */ }
    finally { setSuggestionsLoading(false) }
  }, [activeNotebook, suggestionsLoading, buildSourceContext]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generate suggestions when chat tab opens
  useEffect(() => {
    if (activeTab === 'chat' && activeNotebook && activeNotebook.sources.length > 0 && suggestions.length === 0) {
      generateSuggestions()
    }
  }, [activeTab, activeNotebook?.sources.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Suggest acervo docs while typing topic ───────────────────────────
  const handleTopicChange = useCallback((topic: string) => {
    setCreateTopic(topic)
    if (topic.trim().length < 4 || acervoDocs.length === 0) {
      setSuggestedAcervoDocs([]); return
    }
    const q = topic.toLowerCase()
    const matches = acervoDocs.filter(d =>
      d.filename.toLowerCase().includes(q) ||
      (d.ementa && d.ementa.toLowerCase().includes(q)) ||
      (d.assuntos && d.assuntos.some(a => a.toLowerCase().includes(q))) ||
      (d.area_direito && d.area_direito.some(a => a.toLowerCase().includes(q)))
    ).slice(0, 6)
    setSuggestedAcervoDocs(matches)
  }, [acervoDocs])

  // ── Create notebook ─────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!userId || !createTitle.trim() || !createTopic.trim()) return
    setCreating(true)
    try {
      // Build initial sources from selected acervo docs
      const initialSources: NotebookSource[] = acervoDocs
        .filter(d => d.id && selectedAcervoIds.has(d.id))
        .map(d => ({
          id: generateId(), type: 'acervo' as const, name: d.filename,
          reference: d.id || '', content_type: d.content_type || '',
          size_bytes: d.size_bytes ?? 0,
          text_content: (d.text_content || '').slice(0, MAX_SOURCE_TEXT_LENGTH),
          status: 'indexed' as const, added_at: new Date().toISOString(),
        }))

      const id = await createResearchNotebook(userId, {
        title: createTitle.trim(),
        topic: createTopic.trim(),
        description: createDescription.trim() || '',
        sources: initialSources,
        messages: [],
        artifacts: [],
        status: 'active',
      })
      toast.success(`Caderno criado${initialSources.length > 0 ? ` com ${initialSources.length} fonte(s) do acervo` : ''}!`)
      setShowCreate(false)
      setCreateTitle('')
      setCreateTopic('')
      setCreateDescription('')
      setSelectedAcervoIds(new Set())
      setSuggestedAcervoDocs([])
      await loadNotebooks()
      const nb = await getResearchNotebook(userId, id)
      if (nb) { setActiveNotebook(nb); setViewMode('detail') }
    } catch {
      toast.error('Erro ao criar caderno de pesquisa')
    } finally {
      setCreating(false)
    }
  }

  // ── Select notebook ─────────────────────────────────────────────────
  const handleSelect = async (nb: ResearchNotebookData) => {
    if (!userId || !nb.id) return
    try {
      const full = await getResearchNotebook(userId, nb.id)
      if (full) {
        setActiveNotebook(full)
        setViewMode('detail')
        setActiveTab('chat')
        setSuggestions([])
      }
    } catch {
      toast.error('Erro ao abrir caderno')
    }
  }

  // ── Delete notebook ─────────────────────────────────────────────────
  const handleDelete = async (nb: ResearchNotebookData) => {
    if (!userId || !nb.id) return
    if (!window.confirm(`Excluir o caderno "${nb.title}"? Esta ação é irreversível.`)) return
    try {
      await deleteResearchNotebook(userId, nb.id)
      toast.success('Caderno excluído')
      if (activeNotebook?.id === nb.id) {
        setActiveNotebook(null)
        setViewMode('list')
      }
      await loadNotebooks()
    } catch {
      toast.error('Erro ao excluir caderno')
    }
  }

  // ── Add acervo source ───────────────────────────────────────────────
  const handleAddAcervoSource = async (acervoDoc: AcervoDocumentData) => {
    if (!userId || !activeNotebook?.id) return
    const exists = activeNotebook.sources.some(s => s.type === 'acervo' && s.reference === acervoDoc.id)
    if (exists) { toast.info('Documento já adicionado como fonte'); return }

    try {
      const newSource: NotebookSource = {
        id: generateId(),
        type: 'acervo',
        name: acervoDoc.filename,
        reference: acervoDoc.id || '',
        content_type: acervoDoc.content_type || '',
        size_bytes: acervoDoc.size_bytes ?? 0,
        text_content: acervoDoc.text_content?.slice(0, MAX_SOURCE_TEXT_LENGTH) || '',
        status: 'indexed',
        added_at: new Date().toISOString(),
      }

      const updatedSources = [...activeNotebook.sources, newSource]
      await updateResearchNotebook(userId, activeNotebook.id, { sources: updatedSources })
      setActiveNotebook({ ...activeNotebook, sources: updatedSources })
      toast.success(`Fonte "${acervoDoc.filename}" adicionada`)
    } catch (err) {
      console.error('Error adding acervo source:', err)
      toast.error('Erro ao adicionar fonte do acervo')
    }
  }

  // ── Analyze acervo with multi-agent pipeline ────────────────────────
  const handleAnalyzeAcervo = async () => {
    if (!userId || !activeNotebook?.id) return
    const nb = activeNotebook

    setAcervoAnalysisLoading(true)
    setAcervoAnalysisResults([])
    setSelectedAnalysisIds(new Set())
    setAcervoAnalysisPhase('')
    setAcervoAnalysisMessage('Iniciando análise...')
    setAcervoAnalysisPercent(0)

    try {
      const existingSourceNames = nb.sources.map(s => s.name)
      const existingSourceIds = new Set(
        nb.sources.filter(s => s.type === 'acervo' && s.reference).map(s => s.reference!),
      )

      const result = await analyzeNotebookAcervo(
        userId,
        nb.id!,
        nb.topic || nb.title,
        nb.description || '',
        existingSourceNames,
        existingSourceIds,
        (progress: AcervoAnalysisProgress) => {
          setAcervoAnalysisPhase(progress.phase)
          setAcervoAnalysisMessage(progress.message)
          setAcervoAnalysisPercent(progress.percent)
        },
      )

      // Save execution records to notebook
      if (result.executions.length > 0) {
        const existingExecs = nb.llm_executions || []
        await updateResearchNotebook(userId, nb.id!, {
          llm_executions: [...existingExecs, ...result.executions],
        })
      }

      if (result.documents.length > 0) {
        setAcervoAnalysisResults(result.documents)
        // Pre-select all recommended documents
        setSelectedAnalysisIds(new Set(result.documents.map(d => d.id)))
        toast.success(`${result.documents.length} documento(s) relevante(s) encontrado(s) no acervo!`)
      } else {
        toast.info('Nenhum documento relevante encontrado no acervo para este tema.')
      }
    } catch (err) {
      console.error('Acervo analysis error:', err)
      if (err instanceof ModelUnavailableError) {
        toast.warning(
          'Modelo indisponível',
          `O modelo "${err.modelId}" está indisponível. Altere nas configurações de modelos.`,
        )
      } else {
        toast.error('Erro ao analisar acervo', (err as Error).message)
      }
    } finally {
      setAcervoAnalysisLoading(false)
    }
  }

  // ── Add selected analysis results as sources ────────────────────────
  const handleAddAnalysisResults = async () => {
    if (!userId || !activeNotebook?.id || selectedAnalysisIds.size === 0) return
    const nb = activeNotebook

    try {
      const docsToAdd = acervoAnalysisResults.filter(d => selectedAnalysisIds.has(d.id))
      const newSources: NotebookSource[] = docsToAdd.map(doc => ({
        id: generateId(),
        type: 'acervo' as const,
        name: doc.filename,
        reference: doc.id,
        content_type: doc.content_type || '',
        size_bytes: doc.size_bytes ?? 0,
        text_content: doc.text_content.slice(0, MAX_SOURCE_TEXT_LENGTH),
        status: 'indexed' as const,
        added_at: new Date().toISOString(),
      }))

      const updatedSources = [...nb.sources, ...newSources]
      await updateResearchNotebook(userId, nb.id!, { sources: updatedSources })
      setActiveNotebook({ ...nb, sources: updatedSources })
      setAcervoAnalysisResults([])
      setSelectedAnalysisIds(new Set())
      toast.success(`${docsToAdd.length} fonte(s) adicionada(s) ao caderno!`)
    } catch (err) {
      console.error('Error adding analysis results:', err)
      toast.error('Erro ao adicionar fontes')
    }
  }

  // ── Add link source ─────────────────────────────────────────────────
  const handleAddLinkSource = async () => {
    if (!userId || !activeNotebook?.id || !sourceUrl.trim()) return

    const trimmedUrl = sourceUrl.trim()
    if (!/^https?:\/\/.+/i.test(trimmedUrl)) {
      toast.error('URL inválida — use um endereço que comece com http:// ou https://')
      return
    }

    setSourceUrlLoading(true)
    toast.info('Buscando conteúdo do link...')
    try {
      const textContent = await fetchUrlContent(trimmedUrl)
      const newSource: NotebookSource = {
        id: generateId(),
        type: 'link',
        name: trimmedUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
        reference: trimmedUrl,
        content_type: 'text/html',
        size_bytes: textContent.length,
        text_content: textContent,
        status: textContent.length > 100 ? 'indexed' : 'pending',
        added_at: new Date().toISOString(),
      }

      const updatedSources = [...activeNotebook.sources, newSource]
      await updateResearchNotebook(userId, activeNotebook.id, { sources: updatedSources })
      setActiveNotebook({ ...activeNotebook, sources: updatedSources })
      setSourceUrl('')
      setSuggestions([])
      toast.success(textContent.length > 100
        ? `Link adicionado com ${(textContent.length / 1000).toFixed(0)}K chars de conteúdo`
        : 'Link adicionado (conteúdo não pôde ser extraído automaticamente)')
    } catch (err) {
      console.error('Error adding link source:', err)
      toast.error('Erro ao adicionar link como fonte')
    } finally {
      setSourceUrlLoading(false)
    }
  }

  // ── Remove source ───────────────────────────────────────────────────
  const handleRemoveSource = async (sourceId: string) => {
    if (!userId || !activeNotebook?.id) return
    try {
      const updatedSources = activeNotebook.sources.filter(s => s.id !== sourceId)
      await updateResearchNotebook(userId, activeNotebook.id, { sources: updatedSources })
      setActiveNotebook({ ...activeNotebook, sources: updatedSources })
      setSuggestions([])
    } catch (err) {
      console.error('Error removing source:', err)
      toast.error('Erro ao remover fonte')
    }
  }

  // (buildSourceContext defined earlier above handleGenerateGuide)

  // ── Chat: send message ──────────────────────────────────────────────
  const handleSendMessage = async () => {
    if (!userId || !activeNotebook?.id || !chatInput.trim() || chatLoading) return

    const userMsg: NotebookMessage = {
      id: generateId(),
      role: 'user',
      content: chatInput.trim(),
      created_at: new Date().toISOString(),
    }

    const updatedMessages = [...activeNotebook.messages, userMsg]
    setActiveNotebook({ ...activeNotebook, messages: updatedMessages })
    setChatInput('')
    setChatLoading(true)

    try {
      const apiKey = await getOpenRouterKey()
      const models = await loadResearchNotebookModels()
      const model = models.notebook_assistente || 'anthropic/claude-sonnet-4'
      const sourceContext = buildSourceContext()

      // Optional web search enrichment
      let webSnippet = ''
      if (useWebSearch) {
        try { webSnippet = await searchWeb(`${activeNotebook.topic} ${userMsg.content}`) } catch { /* non-critical */ }
      }

      const systemPrompt = `Você é um assistente de pesquisa jurídica especializado no tema: "${activeNotebook.topic}".
${activeNotebook.description ? `Objetivo: ${activeNotebook.description}\n` : ''}
${sourceContext
  ? `FONTES DO USUÁRIO (use prioritariamente):\n${sourceContext}`
  : '(Nenhuma fonte adicionada — responda com base no seu conhecimento geral)'
}
${webSnippet ? `\nBUSCA WEB:\n${webSnippet}` : ''}

Instruções:
- Responda sempre em português brasileiro
- Cite fontes com [FONTE: nome] quando embasar-se nas fontes do usuário
- Use [WEB] quando usar resultado da busca web
- Seja preciso, detalhado e fundamentado em legislação, doutrina e jurisprudência
- Se não souber algo, diga honestamente e sugira onde procurar
- Mantenha o tom profissional e técnico-jurídico`

      // Build proper multi-turn messages array from conversation history
      const previousMsgs = updatedMessages.slice(0, -1).slice(-(MAX_CONVERSATION_CONTEXT_MESSAGES - 1))
      const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...previousMsgs.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: userMsg.content },
      ]

      const result: LLMResult = await callLLMWithMessages(apiKey, llmMessages, model, 4000, 0.3)

      const assistantMsg: NotebookMessage = {
        id: generateId(),
        role: 'assistant',
        content: result.content,
        agent: 'notebook_assistente',
        model: result.model,
        created_at: new Date().toISOString(),
      }

      const finalMessages = [...updatedMessages, assistantMsg]

      // Track usage
      const execution = createUsageExecutionRecord({
        source_type: 'caderno_pesquisa',
        source_id: activeNotebook.id,
        phase: 'notebook_assistente',
        agent_name: 'Assistente Conversacional',
        model: result.model,
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
        cost_usd: result.cost_usd,
        duration_ms: result.duration_ms,
      })

      const updatedExecutions = [...(activeNotebook.llm_executions || []), execution]

      await updateResearchNotebook(userId, activeNotebook.id, {
        messages: finalMessages,
        llm_executions: updatedExecutions,
      })

      setActiveNotebook({
        ...activeNotebook,
        messages: finalMessages,
        llm_executions: updatedExecutions,
      })
    } catch (err) {
      console.error('Chat error:', err)
      if (err instanceof ModelUnavailableError) {
        toast.warning(
          `Modelo indisponível: ${err.modelId}`,
          `O modelo do agente "${AGENT_LABELS.notebook_assistente}" foi removido do OpenRouter. Vá em Administração > Caderno de Pesquisa e substitua-o.`,
        )
      } else {
        toast.error('Erro ao gerar resposta. Verifique sua chave de API.')
      }
    } finally {
      setChatLoading(false)
    }
  }

  // ── Studio: generate artifact ───────────────────────────────────────
  const handleGenerateArtifact = async (artifactType: StudioArtifactType) => {
    if (!userId || !activeNotebook?.id || studioLoading) return

    setStudioLoading(true)
    setSelectedArtifactType(artifactType)

    try {
      const apiKey = await getOpenRouterKey()
      const models = await loadResearchNotebookModels()
      const model = models.notebook_criador || 'anthropic/claude-sonnet-4'
      const sourceContext = buildSourceContext()
      const artifactDef = ARTIFACT_TYPES.find(a => a.type === artifactType)

      const systemPrompt = `Você é um criador de conteúdo especializado. Gere um(a) ${artifactDef?.label || artifactType} sobre o tema: "${activeNotebook.topic}".
${activeNotebook.description ? `Objetivo: ${activeNotebook.description}` : ''}

Fontes disponíveis:
${sourceContext || '(Sem fontes específicas — use conhecimento geral)'}

Conversas anteriores (contexto):
${activeNotebook.messages.slice(-MAX_STUDIO_CONTEXT_MESSAGES).map(m => `${m.role}: ${m.content}`).join('\n').slice(0, MAX_STUDIO_CONTEXT_CHARS)}

Instruções:
- Gere o conteúdo em formato Markdown
- Seja completo e detalhado
- Use a estrutura adequada para ${artifactDef?.label || artifactType}
- Responda em português brasileiro
- Para mapas mentais, use listas aninhadas com indentação
- Para cartões didáticos, use formato de pergunta/resposta
- Para testes, inclua gabarito
- Para tabelas, use formato Markdown
- Para apresentações, organize em slides com títulos
- Para roteiros de áudio/vídeo, inclua marcações de tempo e narração`

      const userPrompt = studioCustomPrompt.trim()
        ? `Gere um(a) ${artifactDef?.label || artifactType} completo(a) sobre "${activeNotebook.topic}".\n\nInstruções adicionais do usuário: ${studioCustomPrompt.trim()}`
        : `Gere um(a) ${artifactDef?.label || artifactType} completo(a) sobre "${activeNotebook.topic}".`

      const result: LLMResult = await callLLM(apiKey, systemPrompt, userPrompt, model, 4000, 0.3)

      const artifact: StudioArtifact = {
        id: generateId(),
        type: artifactType,
        title: `${artifactDef?.label || artifactType} — ${activeNotebook.topic}`,
        content: result.content,
        format: 'markdown',
        created_at: new Date().toISOString(),
      }

      const updatedArtifacts = [...activeNotebook.artifacts, artifact]

      const execution = createUsageExecutionRecord({
        source_type: 'caderno_pesquisa',
        source_id: activeNotebook.id,
        phase: 'notebook_criador',
        agent_name: 'Criador de Conteúdo',
        model: result.model,
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
        cost_usd: result.cost_usd,
        duration_ms: result.duration_ms,
      })

      const updatedExecutions = [...(activeNotebook.llm_executions || []), execution]

      await updateResearchNotebook(userId, activeNotebook.id, {
        artifacts: updatedArtifacts,
        llm_executions: updatedExecutions,
      })

      setActiveNotebook({
        ...activeNotebook,
        artifacts: updatedArtifacts,
        llm_executions: updatedExecutions,
      })

      setActiveTab('artifacts')
      setStudioCustomPrompt('')
      toast.success(`${artifactDef?.label || 'Artefato'} gerado com sucesso!`)
    } catch (err) {
      console.error('Studio error:', err)
      if (err instanceof ModelUnavailableError) {
        toast.warning(
          `Modelo indisponível: ${err.modelId}`,
          `O modelo do agente "${AGENT_LABELS.notebook_criador}" foi removido do OpenRouter. Vá em Administração > Caderno de Pesquisa e substitua-o.`,
        )
      } else {
        toast.error('Erro ao gerar artefato. Verifique sua chave de API.')
      }
    } finally {
      setStudioLoading(false)
      setSelectedArtifactType(null)
    }
  }

  // ── Delete artifact ─────────────────────────────────────────────────
  const handleDeleteArtifact = async (artifactId: string) => {
    if (!userId || !activeNotebook?.id) return
    try {
      const updated = activeNotebook.artifacts.filter(a => a.id !== artifactId)
      await updateResearchNotebook(userId, activeNotebook.id, { artifacts: updated })
      setActiveNotebook({ ...activeNotebook, artifacts: updated })
      toast.success('Artefato removido')
    } catch (err) {
      console.error('Error deleting artifact:', err)
      toast.error('Erro ao remover artefato')
    }
  }

  // ── Clear chat history ──────────────────────────────────────────────
  const handleClearChat = async () => {
    if (!userId || !activeNotebook?.id) return
    if (!window.confirm('Limpar todo o histórico de conversa? As fontes e artefatos serão mantidos.')) return
    try {
      await updateResearchNotebook(userId, activeNotebook.id, { messages: [] })
      setActiveNotebook({ ...activeNotebook, messages: [] })
      toast.success('Histórico de conversa limpo')
    } catch (err) {
      console.error('Error clearing chat:', err)
      toast.error('Erro ao limpar histórico')
    }
  }

  // ── Edit notebook info ──────────────────────────────────────────────
  const openEditInfo = () => {
    if (!activeNotebook) return
    setEditTitle(activeNotebook.title)
    setEditTopic(activeNotebook.topic)
    setEditDescription(activeNotebook.description || '')
    setShowEditInfo(true)
  }

  const handleSaveInfo = async () => {
    if (!userId || !activeNotebook?.id || !editTitle.trim() || !editTopic.trim()) return
    try {
      const updates = {
        title: editTitle.trim(),
        topic: editTopic.trim(),
        description: editDescription.trim() || '',
      }
      await updateResearchNotebook(userId, activeNotebook.id, updates)
      setActiveNotebook({ ...activeNotebook, ...updates })
      setShowEditInfo(false)
      toast.success('Caderno atualizado')
    } catch (err) {
      console.error('Error updating notebook info:', err)
      toast.error('Erro ao atualizar caderno')
    }
  }

  // ── Download artifact ───────────────────────────────────────────────
  const handleDownloadArtifact = (artifact: StudioArtifact) => {
    const blob = new Blob([artifact.content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${artifact.title.replace(/[^a-zA-Z0-9À-ÿ ]/g, '_').replace(/_{2,}/g, '_').trim()}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── Filtered notebooks ──────────────────────────────────────────────
  const filteredNotebooks = useMemo(() => {
    if (!searchQuery.trim()) return notebooks
    const q = searchQuery.toLowerCase()
    return notebooks.filter(nb =>
      nb.title.toLowerCase().includes(q) ||
      nb.topic.toLowerCase().includes(q) ||
      (nb.description?.toLowerCase().includes(q) ?? false),
    )
  }, [notebooks, searchQuery])

  // ── Render: List View ───────────────────────────────────────────────

  if (viewMode === 'list') {
    // Non-Firebase mode: feature requires Firestore
    if (!IS_FIREBASE) {
      return (
        <div className="max-w-6xl mx-auto px-4 py-12 text-center">
          <BookOpen className="w-14 h-14 text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-700">Caderno de Pesquisa</h1>
          <p className="text-sm text-gray-500 mt-2 max-w-lg mx-auto">
            Esta funcionalidade requer a integração com Firebase/Firestore para armazenar os cadernos, fontes e conversas.
            Configure o Firebase no painel de administração para habilitar o Caderno de Pesquisa.
          </p>
        </div>
      )
    }

    return (
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-7 h-7 text-brand-600" />
              Caderno de Pesquisa
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Assistente inteligente de pesquisa e anotações — pesquise, aprenda e crie com IA
            </p>
          </div>
          <button
            onClick={() => { setShowCreate(true); loadAcervoDocs() }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Novo Caderno
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar cadernos por título, tema ou descrição..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
            <span className="ml-2 text-sm text-gray-500">Carregando cadernos...</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && notebooks.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">Nenhum caderno ainda</h3>
            <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
              Crie seu primeiro caderno de pesquisa para começar a explorar temas com a ajuda da IA.
              Adicione fontes do seu acervo, faça perguntas e gere conteúdos no Estúdio.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Criar Caderno
            </button>
          </div>
        )}

        {/* Notebook grid */}
        {!loading && filteredNotebooks.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredNotebooks.map(nb => (
              <NotebookListItem
                key={nb.id}
                notebook={nb}
                onSelect={() => handleSelect(nb)}
                onDelete={() => handleDelete(nb)}
              />
            ))}
          </div>
        )}

        {!loading && searchQuery && filteredNotebooks.length === 0 && notebooks.length > 0 && (
          <p className="text-center text-sm text-gray-400 py-8">
            Nenhum caderno encontrado para &quot;{searchQuery}&quot;
          </p>
        )}

        {/* Create dialog */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-brand-600" />
                Novo Caderno de Pesquisa
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                  <input
                    type="text"
                    placeholder="Ex: Responsabilidade Civil em Contratos Digitais"
                    value={createTitle}
                    onChange={e => setCreateTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tema da Pesquisa *</label>
                  <input
                    type="text"
                    placeholder="Ex: Nepotismo no serviço público federal"
                    value={createTopic}
                    onChange={e => handleTopicChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    O tema guia o assistente e é usado para sugerir documentos do acervo
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição / Objetivo (opcional)</label>
                  <textarea
                    placeholder="Descreva o objetivo da pesquisa, perguntas-chave, escopo..."
                    value={createDescription}
                    onChange={e => setCreateDescription(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
                  />
                </div>

                {/* Acervo suggestions */}
                {suggestedAcervoDocs.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-brand-600" />
                      Documentos do acervo relacionados ao tema:
                    </p>
                    <div className="space-y-1 max-h-40 overflow-y-auto border rounded-lg p-1">
                      {suggestedAcervoDocs.map(doc => (
                        <label key={doc.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={selectedAcervoIds.has(doc.id || '')}
                            onChange={e => {
                              const next = new Set(selectedAcervoIds)
                              if (e.target.checked) next.add(doc.id || '')
                              else next.delete(doc.id || '')
                              setSelectedAcervoIds(next)
                            }}
                            className="rounded text-brand-600"
                          />
                          <Database className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{doc.filename}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {selectedAcervoIds.size} selecionado(s) — adicionados automaticamente como fontes do caderno
                    </p>
                  </div>
                )}
                {acervoLoading && (
                  <p className="text-xs text-gray-400 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando acervo...
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={() => { setShowCreate(false); setSuggestedAcervoDocs([]); setSelectedAcervoIds(new Set()) }}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!createTitle.trim() || !createTopic.trim() || creating}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                >
                  {creating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</>
                  ) : (
                    <><Plus className="w-4 h-4" /> Criar Caderno</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Render: Detail View ─────────────────────────────────────────────

  if (!activeNotebook) return null

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-7xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-white shrink-0">
        <button
          onClick={() => { setViewMode('list'); setActiveNotebook(null); setSuggestions([]) }}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900 truncate">{activeNotebook.title}</h2>
            <button
              onClick={openEditInfo}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
              title="Editar informações do caderno"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-gray-500 truncate">{activeNotebook.topic}</p>
          {activeNotebook.description && (
            <p className="text-[10px] text-gray-400 truncate mt-0.5" title={activeNotebook.description}>
              <Info className="w-3 h-3 inline mr-0.5" />{activeNotebook.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleGenerateGuide}
            disabled={guideLoading || activeNotebook.sources.length === 0}
            title="Gerar Visão Geral das fontes"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {guideLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookMarked className="w-3.5 h-3.5" />}
            Visão Geral
          </button>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {([
            { key: 'chat' as DetailTab, icon: MessageCircle, label: 'Chat' },
            { key: 'sources' as DetailTab, icon: Database, label: 'Fontes' },
            { key: 'studio' as DetailTab, icon: Sparkles, label: 'Estúdio' },
            { key: 'artifacts' as DetailTab, icon: FileText, label: 'Artefatos' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key)
                if (tab.key === 'sources' && acervoDocs.length === 0) loadAcervoDocs()
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.key === 'chat' && activeNotebook.messages.length > 0 && (
                <span className="text-[10px] bg-brand-100 text-brand-700 rounded-full px-1.5">
                  {activeNotebook.messages.length}
                </span>
              )}
              {tab.key === 'sources' && activeNotebook.sources.length > 0 && (
                <span className="text-[10px] bg-brand-100 text-brand-700 rounded-full px-1.5">
                  {activeNotebook.sources.length}
                </span>
              )}
              {tab.key === 'artifacts' && activeNotebook.artifacts.length > 0 && (
                <span className="text-[10px] bg-brand-100 text-brand-700 rounded-full px-1.5">
                  {activeNotebook.artifacts.length}
                </span>
              )}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* Edit Notebook Info Modal */}
      {showEditInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowEditInfo(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-brand-600" />
              Editar Caderno
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tema da Pesquisa *</label>
                <input
                  type="text"
                  value={editTopic}
                  onChange={e => setEditTopic(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição / Objetivo</label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowEditInfo(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSaveInfo}
                disabled={!editTitle.trim() || !editTopic.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {/* ── Chat Tab ──────────────────────────────────────────── */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeNotebook.messages.length === 0 && (
                <div className="text-center py-16">
                  <Brain className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600">Assistente de Pesquisa</h3>
                  <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto">
                    Faça perguntas sobre &quot;{activeNotebook.topic}&quot; e o assistente responderá
                    com base nas fontes adicionadas. Adicione fontes na aba &quot;Fontes&quot; para respostas mais precisas.
                  </p>
                  {activeNotebook.sources.length === 0 && (
                    <p className="text-xs text-amber-600 mt-3 flex items-center justify-center gap-1">
                      <Info className="w-3.5 h-3.5" />
                      Nenhuma fonte adicionada — vá na aba &quot;Fontes&quot; para começar
                    </p>
                  )}
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {suggestionsLoading ? (
                      <span className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Gerando sugestões…
                      </span>
                    ) : (suggestions.length > 0 ? suggestions : [
                      `Quais os principais conceitos sobre "${activeNotebook.topic}"?`,
                      `Faça um resumo geral sobre "${activeNotebook.topic}"`,
                      'Quais são os pontos controversos?',
                      'Liste as fontes normativas aplicáveis',
                    ]).map(suggestion => (
                      <button
                        key={suggestion}
                        onClick={() => setChatInput(suggestion)}
                        className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-brand-50 hover:text-brand-700 transition-colors"
                      >
                        {suggestion.length > MAX_SUGGESTION_LABEL_LENGTH ? suggestion.slice(0, MAX_SUGGESTION_LABEL_LENGTH - 3) + '...' : suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeNotebook.messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-brand-600 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div
                        className="break-words prose-sm [&_strong]:font-semibold [&_a]:text-brand-600 [&_a]:underline [&_pre]:my-2 [&_code]:text-xs"
                        dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(msg.content) }}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    )}
                    <div className={`flex items-center gap-2 text-[10px] mt-1.5 ${
                      msg.role === 'user' ? 'text-white/60' : 'text-gray-400'
                    }`}>
                      <span>
                        {formatDate(msg.created_at)}
                        {msg.agent && <span className="ml-2">· {msg.agent}</span>}
                      </span>
                      {msg.role === 'assistant' && (
                        <CopyButton text={msg.content} />
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                      <span className="text-sm text-gray-500">Pesquisando e analisando...</span>
                    </div>
                  </div>
                </div>
              )}
              {/* Auto-scroll anchor */}
              <div ref={chatEndRef} />
            </div>

            {/* Inline suggestion chips when conversation is active */}
            {activeNotebook.messages.length > 0 && suggestions.length > 0 && (
              <div className="px-4 pb-2 flex flex-wrap gap-2 border-t pt-2">
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => setChatInput(s)}
                    className="px-3 py-1 text-xs bg-gray-50 border border-gray-200 text-gray-600 rounded-full hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-colors"
                  >
                    {s.length > MAX_SUGGESTION_LABEL_LENGTH ? s.slice(0, MAX_SUGGESTION_LABEL_LENGTH - 3) + '...' : s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="border-t bg-white p-4 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder="Faça uma pergunta sobre o tema..."
                  rows={1}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || chatLoading}
                  className="p-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between mt-1.5 px-1">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useWebSearch}
                    onChange={e => setUseWebSearch(e.target.checked)}
                    className="w-3 h-3 rounded accent-brand-600"
                  />
                  <Globe className="w-3 h-3 text-gray-400" />
                  <span className="text-[10px] text-gray-400">Busca web</span>
                </label>
                {activeNotebook.messages.length > 0 ? (
                  <button
                    onClick={handleClearChat}
                    className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                    title="Limpar histórico de conversa"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Limpar conversa
                  </button>
                ) : (
                  <span className="text-[10px] text-gray-400">Enter para enviar · Shift+Enter para nova linha</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Sources Tab ───────────────────────────────────────── */}
        {activeTab === 'sources' && (
          <div className="h-full overflow-y-auto p-4 space-y-6">
            {/* Add source */}
            <div className="bg-white rounded-xl border p-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-brand-600" />
                Adicionar Fontes
              </h3>

              {/* Link input */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="url"
                    placeholder="Cole um link (URL) para adicionar como fonte..."
                    value={sourceUrl}
                    onChange={e => setSourceUrl(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>
                <button
                  onClick={handleAddLinkSource}
                  disabled={!sourceUrl.trim() || sourceUrlLoading}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-40 text-sm font-medium transition-colors flex items-center gap-1.5"
                >
                  {sourceUrlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {sourceUrlLoading ? 'Carregando...' : 'Adicionar'}
                </button>
              </div>

              {/* Acervo documents */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500">Documentos do Acervo:</p>
                  {!acervoLoading && acervoDocs.length > 5 && (
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Filtrar..."
                        value={sourceSearch}
                        onChange={e => setSourceSearch(e.target.value)}
                        className="pl-7 pr-2 py-1 border border-gray-200 rounded text-[11px] w-36 focus:ring-1 focus:ring-brand-500 outline-none"
                      />
                    </div>
                  )}
                </div>
                {acervoLoading && (
                  <div className="flex items-center gap-2 py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    <span className="text-xs text-gray-400">Carregando acervo...</span>
                  </div>
                )}
                {!acervoLoading && acervoDocs.length === 0 && (
                  <p className="text-xs text-gray-400 py-2">Nenhum documento no acervo. Faça upload na página de Acervo.</p>
                )}
                {!acervoLoading && acervoDocs.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {acervoDocs
                      .filter(doc => !sourceSearch.trim() || doc.filename.toLowerCase().includes(sourceSearch.toLowerCase()))
                      .map(doc => {
                      const alreadyAdded = activeNotebook.sources.some(s => s.type === 'acervo' && s.reference === doc.id)
                      return (
                        <button
                          key={doc.id}
                          onClick={() => handleAddAcervoSource(doc)}
                          disabled={alreadyAdded}
                          className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                            alreadyAdded
                              ? 'bg-green-50 text-green-700 cursor-default'
                              : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <Database className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate flex-1">{doc.filename}</span>
                          {alreadyAdded && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Analisar Acervo — Multi-agent intelligent search */}
            <div className="bg-gradient-to-r from-brand-50 to-indigo-50 rounded-xl border border-brand-200 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <ScanSearch className="w-4 h-4 text-brand-600" />
                    Análise Inteligente do Acervo
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Agentes de IA buscam automaticamente documentos relevantes no seu acervo
                  </p>
                </div>
                <button
                  onClick={handleAnalyzeAcervo}
                  disabled={acervoAnalysisLoading || !activeNotebook.topic}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-40 text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  {acervoAnalysisLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    <>
                      <Library className="w-4 h-4" />
                      Analisar Acervo
                    </>
                  )}
                </button>
              </div>

              {/* Progress indicator */}
              {acervoAnalysisLoading && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-brand-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-brand-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${acervoAnalysisPercent}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-brand-600 font-medium whitespace-nowrap">{acervoAnalysisPercent}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500" />
                    <span className="text-xs text-brand-700">{acervoAnalysisMessage}</span>
                  </div>
                  {/* Agent progress steps */}
                  <div className="flex items-center gap-1 mt-1">
                    {(['nb_acervo_triagem', 'nb_acervo_buscador', 'nb_acervo_analista', 'nb_acervo_curador'] as const).map((step) => {
                      const labels: Record<string, string> = {
                        nb_acervo_triagem: 'Triagem',
                        nb_acervo_buscador: 'Buscador',
                        nb_acervo_analista: 'Analista',
                        nb_acervo_curador: 'Curador',
                      }
                      const isActive = acervoAnalysisPhase === step
                      const stepOrder = ['nb_acervo_triagem', 'nb_acervo_buscador', 'nb_acervo_analista', 'nb_acervo_curador']
                      const isCompleted = stepOrder.indexOf(acervoAnalysisPhase) > stepOrder.indexOf(step) || acervoAnalysisPhase === 'concluido'
                      return (
                        <div key={step} className="flex items-center gap-1">
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                            isActive ? 'bg-brand-600 text-white' :
                            isCompleted ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-400'
                          }`}>
                            {isActive && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                            {isCompleted && <CheckCircle2 className="w-2.5 h-2.5" />}
                            {labels[step]}
                          </div>
                          {step !== 'nb_acervo_curador' && (
                            <ChevronDown className="w-3 h-3 text-gray-300 rotate-[-90deg]" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Analysis results */}
              {!acervoAnalysisLoading && acervoAnalysisResults.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-700">
                      {acervoAnalysisResults.length} documento(s) recomendado(s):
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (selectedAnalysisIds.size === acervoAnalysisResults.length) {
                            setSelectedAnalysisIds(new Set())
                          } else {
                            setSelectedAnalysisIds(new Set(acervoAnalysisResults.map(d => d.id)))
                          }
                        }}
                        className="text-[10px] text-brand-600 hover:text-brand-700 font-medium"
                      >
                        {selectedAnalysisIds.size === acervoAnalysisResults.length ? 'Desmarcar todos' : 'Selecionar todos'}
                      </button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {acervoAnalysisResults.map(doc => {
                      const isSelected = selectedAnalysisIds.has(doc.id)
                      const alreadySource = activeNotebook.sources.some(s => s.type === 'acervo' && s.reference === doc.id)
                      return (
                        <div
                          key={doc.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                            alreadySource ? 'bg-green-50 border-green-200 opacity-60' :
                            isSelected ? 'bg-brand-50 border-brand-300' :
                            'bg-white border-gray-200 hover:border-brand-200'
                          }`}
                          onClick={() => {
                            if (alreadySource) return
                            setSelectedAnalysisIds(prev => {
                              const next = new Set(prev)
                              if (next.has(doc.id)) next.delete(doc.id)
                              else next.add(doc.id)
                              return next
                            })
                          }}
                        >
                          <div className="pt-0.5">
                            {alreadySource ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : (
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected ? 'bg-brand-600 border-brand-600' : 'border-gray-300'
                              }`}>
                                {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Database className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="text-xs font-medium text-gray-800 truncate">{doc.filename}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                doc.score >= 0.7 ? 'bg-green-100 text-green-700' :
                                doc.score >= 0.4 ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {Math.round(doc.score * 100)}%
                              </span>
                              {alreadySource && <span className="text-[10px] text-green-600 font-medium">Já adicionado</span>}
                            </div>
                            <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{doc.summary}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-brand-100">
                    <span className="text-[11px] text-gray-500">
                      {selectedAnalysisIds.size} de {acervoAnalysisResults.length} selecionado(s)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setAcervoAnalysisResults([]); setSelectedAnalysisIds(new Set()) }}
                        className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 transition-colors"
                      >
                        Descartar
                      </button>
                      <button
                        onClick={handleAddAnalysisResults}
                        disabled={selectedAnalysisIds.size === 0}
                        className="px-4 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-40 text-xs font-medium transition-colors flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar {selectedAnalysisIds.size} fonte(s)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Current sources */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Fontes ({activeNotebook.sources.length})
              </h3>
              {activeNotebook.sources.length === 0 && (
                <p className="text-sm text-gray-400 py-4">Nenhuma fonte adicionada ainda.</p>
              )}
              <div className="space-y-2">
                {activeNotebook.sources.map(source => {
                  const typeInfo = SOURCE_TYPE_LABELS[source.type] || SOURCE_TYPE_LABELS.upload
                  const TypeIcon = typeInfo.icon
                  return (
                    <div key={source.id} className="flex items-center gap-3 bg-white rounded-lg border p-3">
                      <TypeIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{source.name}</p>
                        <p className="text-[11px] text-gray-400">
                          {typeInfo.label} · {source.type === 'link' ? (
                            (source.text_content?.length ?? 0) >= MIN_SOURCE_CHARS
                              ? <span className="text-green-600">✓ {Math.round((source.text_content?.length ?? 0) / 1000)}K chars indexados</span>
                              : <span className="text-amber-600 flex items-center gap-0.5 inline-flex"><AlertCircle className="w-3 h-3" />Sem conteúdo extraído</span>
                          ) : source.status === 'indexed' ? 'Indexado' : source.status === 'error' ? 'Erro' : 'Pendente'}
                          {source.added_at && ` · ${formatDate(source.added_at)}`}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveSource(source.id)}
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Studio Tab ────────────────────────────────────────── */}
        {activeTab === 'studio' && (
          <div className="h-full overflow-y-auto p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Estúdio de Criação
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Gere diferentes tipos de conteúdo a partir das fontes e conversas deste caderno
              </p>
            </div>

            {/* Visão Geral shortcut */}
            <div className="mb-4">
              <button
                onClick={handleGenerateGuide}
                disabled={guideLoading || activeNotebook.sources.length === 0}
                className="w-full flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
              >
                <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
                  {guideLoading ? <Loader2 className="w-5 h-5 text-amber-600 animate-spin" /> : <BookMarked className="w-5 h-5 text-amber-600" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Visão Geral do Caderno</p>
                  <p className="text-xs text-amber-600 mt-0.5">Gera um guia estruturado com os principais conceitos e pontos das fontes adicionadas</p>
                </div>
              </button>
            </div>

            {/* Custom instructions */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Instruções adicionais (opcional)
              </label>
              <textarea
                value={studioCustomPrompt}
                onChange={e => setStudioCustomPrompt(e.target.value)}
                placeholder="Ex: Foque nos aspectos práticos, use linguagem acessível, inclua exemplos de RPG..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ARTIFACT_TYPES.map(art => {
                const ArtIcon = art.icon
                const isGenerating = studioLoading && selectedArtifactType === art.type
                return (
                  <button
                    key={art.type}
                    onClick={() => handleGenerateArtifact(art.type)}
                    disabled={studioLoading}
                    className={`flex flex-col items-start gap-2 p-4 bg-white rounded-xl border hover:border-brand-300 hover:shadow-sm transition-all text-left ${
                      studioLoading ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isGenerating ? (
                        <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
                      ) : (
                        <ArtIcon className="w-5 h-5 text-brand-600" />
                      )}
                      <span className="text-sm font-semibold text-gray-900">{art.label}</span>
                    </div>
                    <p className="text-xs text-gray-500">{art.description}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Artifacts Tab ─────────────────────────────────────── */}
        {activeTab === 'artifacts' && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Artefatos Gerados ({activeNotebook.artifacts.length})
            </h3>

            {activeNotebook.artifacts.length === 0 && (
              <div className="text-center py-12">
                <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Nenhum artefato gerado ainda.</p>
                <p className="text-xs text-gray-400 mt-1">Use o Estúdio para criar resumos, mapas mentais, cartões e mais.</p>
              </div>
            )}

            {activeNotebook.artifacts.map(artifact => {
              const artDef = ARTIFACT_TYPES.find(a => a.type === artifact.type)
              const ArtIcon = artDef?.icon || FileText
              return (
                <ArtifactCard
                  key={artifact.id}
                  artifact={artifact}
                  icon={ArtIcon}
                  label={artDef?.label || artifact.type}
                  onDelete={() => handleDeleteArtifact(artifact.id)}
                  onDownload={() => handleDownloadArtifact(artifact)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Artifact Card (collapsible) ──────────────────────────────────────────────

function ArtifactCard({
  artifact,
  icon: Icon,
  label,
  onDelete,
  onDownload,
}: {
  artifact: StudioArtifact
  icon: React.ElementType
  label: string
  onDelete: () => void
  onDownload: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm(`Excluir "${artifact.title}"? Esta ação é irreversível.`)) {
      onDelete()
    }
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-brand-600" />
          <div>
            <p className="text-sm font-semibold text-gray-900">{artifact.title}</p>
            <p className="text-[11px] text-gray-400">{label} · {formatDate(artifact.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={artifact.content} />
          <button
            onClick={e => { e.stopPropagation(); onDownload() }}
            className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors"
            title="Baixar como Markdown"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t">
          <div
            className="prose prose-sm max-w-none mt-3 text-gray-700 [&_strong]:font-semibold [&_a]:text-brand-600 [&_a]:underline [&_pre]:my-2 [&_code]:text-xs"
            dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(artifact.content) }}
          />
        </div>
      )}
    </div>
  )
}

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
  Library, ScanSearch, Save, Eye,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTaskManager } from '../contexts/TaskManagerContext'
import { useToast } from '../components/Toast'
import { IS_FIREBASE } from '../lib/firebase'
import {
  listResearchNotebooks,
  createResearchNotebook,
  updateResearchNotebook,
  deleteResearchNotebook,
  getResearchNotebook,
  listAcervoDocuments,
  saveNotebookDocumentToDocuments,
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
  type UsageFunctionKey,
} from '../lib/cost-analytics'
import { analyzeNotebookAcervo, type AnalyzedDocument, type AcervoAnalysisProgress } from '../lib/notebook-acervo-analyzer'
import { runStudioPipeline, type StudioProgressCallback } from '../lib/notebook-studio-pipeline'
import {
  runVideoGenerationPipeline,
  type VideoProductionPackage,
  type VideoGenerationProgressCallback,
} from '../lib/video-generation-pipeline'
import {
  uploadNotebookMediaArtifact,
  uploadNotebookVideoArtifact,
} from '../lib/notebook-media-storage'
import { synthesizeAudioFromScript } from '../lib/notebook-audio-pipeline'
import { extractFileText, isSupportedTextFile, SUPPORTED_TEXT_FILE_EXTENSIONS } from '../lib/file-text-extractor'
import ArtifactViewerModal from '../components/artifacts/ArtifactViewerModal'
import VideoGenerationCostModal from '../components/VideoGenerationCostModal'
import VideoStudioEditor from '../components/artifacts/VideoStudioEditor'
import DraggablePanel from '../components/DraggablePanel'
import SourceContentViewer from '../components/SourceContentViewer'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  DeepResearchModal,
  type ResearchStep,
  type ResearchStats,
  createExternalSearchSteps,
  createDeepSearchSteps,
  createJurisprudenceSteps,
} from '../components/DeepResearchModal'
import JurisprudenceConfigModal, { type JurisprudenceSearchConfig } from '../components/JurisprudenceConfigModal'
import SearchResultsModal from '../components/SearchResultsModal'
import AgentTrailProgressModal from '../components/AgentTrailProgressModal'
import {
  searchDataJud,
  formatDataJudResults,
  DEFAULT_TRIBUNALS,
  TRIBUNAL_GROUPS,
  DATAJUD_GRAUS,
  ALL_TRIBUNALS,
  type TribunalInfo,
  type DataJudSearchProgress,
  type DataJudErrorType,
  type DataJudResult,
} from '../lib/datajud-service'
import {
  searchWebResultsWithDiagnostics,
  deepWebSearch,
  searchWeb as searchWebService,
  fetchUrlContent as fetchUrlContentService,
  type WebSearchErrorType,
} from '../lib/web-search-service'
import {
  MAX_SOURCE_TEXT_LENGTH,
  MAX_CONTEXT_TEXT_LENGTH,
  MAX_CONVERSATION_CONTEXT_MESSAGES,
  MAX_STUDIO_CONTEXT_MESSAGES,
  MAX_STUDIO_CONTEXT_CHARS,
  MAX_SUGGESTION_LABEL_LENGTH,
  MAX_WEB_SEARCH_CHARS,
  MAX_DEEP_EXTERNAL_TEXT_CHARS,
  MAX_DEEP_EXTERNAL_SOURCE_SNIPPET_CHARS,
  MIN_SOURCE_CHARS,
  ENABLE_LITERAL_MEDIA_AUTOGENERATION,
  REVIEWABLE_ARTIFACT_TYPES,
  ARTIFACT_COST_KEY,
  STUDIO_SPECIALIST_LABEL,
  ACERVO_TRAIL_STEPS,
  AGENT_LABELS,
  ARTIFACT_CATEGORIES,
  ARTIFACT_TYPES,
  SOURCE_TYPE_LABELS,
  CopyButton,
  NotebookListItem,
  type ArtifactDef,
  type ArtifactCategory,
} from './notebook'
import {
  generateId,
  formatDate,
  getExtensionFromMimeType,
  renderMarkdownToHtml,
} from './notebook/utils'

/** Individual search result item for review modal */
export interface SearchResultItem {
  id: string
  title: string
  subtitle: string
  snippet: string
  fullContent?: string
  metadata: Record<string, string>
  url?: string
  selected: boolean
  /** Raw data from the original search result (for synthesis) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _raw?: any
}

// ── Jurisprudence Prompts ────────────────────────────────────────────────────

const JURISPRUDENCE_RANKING_SYSTEM = [
  'Você é um especialista em relevância jurisprudencial.',
  'Avalie cada processo quanto à relevância para a consulta do usuário.',
  'Retorne APENAS um JSON com um array "ranking" onde cada item tem',
  '"index" (número do processo na lista, começando em 1) e "score" (0 a 100,',
  'sendo 100 = máxima relevância). Ordene do mais relevante para o menos relevante.',
  'Considere: (1) alinhamento temático dos assuntos com a consulta,',
  '(2) grau hierárquico (tribunais superiores têm mais peso como precedente),',
  '(3) movimentações recentes indicam processos ativos,',
  '(4) data de ajuizamento mais recente pode indicar jurisprudência atualizada.',
].join(' ')

const JURISPRUDENCE_SYNTHESIS_SYSTEM = [
  'Você é um pesquisador jurídico especializado em jurisprudência brasileira.',
  'Organize e sintetize os resultados do DataJud em português, produzindo as seguintes seções:',
  '',
  '1. **Panorama Jurisprudencial**: Visão geral das tendências identificadas,',
  'incluindo a evolução temporal dos processos com base nas movimentações processuais.',
  '2. **Precedentes-Chave**: Processos mais relevantes como precedentes,',
  'priorizando tribunais superiores e decisões recentes.',
  '3. **Fundamentos Jurídicos**: Principais teses e argumentos jurídicos',
  'identificados nos assuntos e classes processuais.',
  '4. **Análise Temporal**: Evolução processual baseada nas movimentações',
  '(andamentos) dos processos, identificando padrões e status atual.',
  '5. **Lista de Processos**: Relação completa com número, tribunal, classe,',
  'órgão julgador e status mais recente.',
].join('\n')

// ── Main Page ────────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'detail'
type DetailTab = 'overview' | 'chat' | 'sources' | 'studio' | 'artifacts'

export default function ResearchNotebook() {
  const { userId } = useAuth()
  const toast = useToast()
  const { startTask } = useTaskManager()

  // List state
  const [notebooks, setNotebooks] = useState<ResearchNotebookData[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  // Detail state
  const [activeNotebook, setActiveNotebook] = useState<ResearchNotebookData | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')

  // Artifact viewer modal
  const [viewingArtifact, setViewingArtifact] = useState<StudioArtifact | null>(null)

  // Create dialog
  const [showCreate, setShowCreate] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createTopic, setCreateTopic] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [pendingNotebookDelete, setPendingNotebookDelete] = useState<ResearchNotebookData | null>(null)
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
  const [externalSearchQuery, setExternalSearchQuery] = useState('')
  const [externalResearchLoading, setExternalResearchLoading] = useState(false)
  const [externalDeepLoading, setExternalDeepLoading] = useState(false)
  const [jurisprudenceLoading, setJurisprudenceLoading] = useState(false)

  // Deep Research Modal state
  const [researchModalOpen, setResearchModalOpen] = useState(false)
  const [researchModalTitle, setResearchModalTitle] = useState('')
  const [researchModalSubtitle, setResearchModalSubtitle] = useState('')
  const [researchModalVariant, setResearchModalVariant] = useState<'external' | 'deep' | 'jurisprudencia'>('external')
  const [researchModalSteps, setResearchModalSteps] = useState<ResearchStep[]>([])
  const [researchModalStats, setResearchModalStats] = useState<ResearchStats>({ sourcesFound: 0, urlsExamined: 0, tribunalsQueried: 0, tokensUsed: 0, elapsedMs: 0 })
  const [researchModalCanClose, setResearchModalCanClose] = useState(false)
  const researchAbortRef = useRef<AbortController | null>(null)
  const suggestionModelWarnedRef = useRef(false)
  const [sourceUploadLoading, setSourceUploadLoading] = useState(false)
  const [acervoDocs, setAcervoDocs] = useState<AcervoDocumentData[]>([])
  const [acervoLoading, setAcervoLoading] = useState(false)
  const sourceUploadInputRef = useRef<HTMLInputElement>(null)

  // Source content viewer (floating panel)
  const [viewerSource, setViewerSource] = useState<import('../lib/firestore-service').NotebookSource | null>(null)

  // Jurisprudence config modal (pre-search)
  const [jurisprudenceConfigOpen, setJurisprudenceConfigOpen] = useState(false)

  // Search results review modal (post-search)
  const [searchResultsModalOpen, setSearchResultsModalOpen] = useState(false)
  const [searchResultsItems, setSearchResultsItems] = useState<SearchResultItem[]>([])
  const [searchResultsVariant, setSearchResultsVariant] = useState<'external' | 'deep' | 'jurisprudencia'>('external')
  const [searchResultsCallback, setSearchResultsCallback] = useState<((selected: SearchResultItem[]) => Promise<void>) | null>(null)

  // Dynamic suggested questions
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)

  // Studio
  const [studioLoading, setStudioLoading] = useState(false)
  const [selectedArtifactType, setSelectedArtifactType] = useState<StudioArtifactType | null>(null)
  const [studioCustomPrompt, setStudioCustomPrompt] = useState('')
  const [studioProgress, setStudioProgress] = useState<{ step: number; total: number; phase: string } | null>(null)
  const [studioLastProgress, setStudioLastProgress] = useState<{ step: number; total: number; phase: string } | null>(null)
  const [studioErrorMessage, setStudioErrorMessage] = useState('')
  const [showStudioProgressModal, setShowStudioProgressModal] = useState(false)
  const studioAbortRef = useRef<AbortController | null>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceSearch, setSourceSearch] = useState('')

  // Acervo analysis (multi-agent pipeline)
  const [acervoAnalysisLoading, setAcervoAnalysisLoading] = useState(false)
  const [acervoAnalysisPhase, setAcervoAnalysisPhase] = useState('')
  const [acervoAnalysisMessage, setAcervoAnalysisMessage] = useState('')
  const [acervoAnalysisPercent, setAcervoAnalysisPercent] = useState(0)
  const [acervoAnalysisError, setAcervoAnalysisError] = useState('')
  const [showAcervoProgressModal, setShowAcervoProgressModal] = useState(false)
  const [acervoAnalysisResults, setAcervoAnalysisResults] = useState<AnalyzedDocument[]>([])
  const [selectedAnalysisIds, setSelectedAnalysisIds] = useState<Set<string>>(new Set())
  const acervoAbortRef = useRef<AbortController | null>(null)

  // Script review/edit before saving (for media artifacts: video, audio, presentation)
  const [pendingArtifact, setPendingArtifact] = useState<{
    artifact: StudioArtifact
    executions: { phase: string; agent_name: string; model: string; tokens_in: number; tokens_out: number; cost_usd: number; duration_ms: number }[]
  } | null>(null)
  const [pendingContent, setPendingContent] = useState('')
  const [pendingArtifactDelete, setPendingArtifactDelete] = useState<{ id: string; title: string } | null>(null)
  const [clearingChat, setClearingChat] = useState(false)

  // Video generation flow
  const [showVideoGenCost, setShowVideoGenCost] = useState(false)
  const [videoGenSavedArtifact, setVideoGenSavedArtifact] = useState<StudioArtifact | null>(null)
  const [videoGenLoading, setVideoGenLoading] = useState(false)
  const [videoGenProgress, setVideoGenProgress] = useState<{ step: number; total: number; phase: string; agent: string } | null>(null)
  const [videoProduction, setVideoProduction] = useState<VideoProductionPackage | null>(null)
  const [videoStudioApiKey, setVideoStudioApiKey] = useState<string | undefined>(undefined)
  const [videoStudioAutoGenerate, setVideoStudioAutoGenerate] = useState(false)
  const [audioGenLoading, setAudioGenLoading] = useState(false)
  const [audioGeneratingArtifactId, setAudioGeneratingArtifactId] = useState<string | null>(null)
  const [showClearChatConfirm, setShowClearChatConfirm] = useState(false)

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

  // Ensure in-flight research tasks are canceled when leaving the page.
  useEffect(() => {
    return () => {
      researchAbortRef.current?.abort()
      researchAbortRef.current = null
      acervoAbortRef.current?.abort()
      acervoAbortRef.current = null
      studioAbortRef.current?.abort()
      studioAbortRef.current = null
    }
  }, [])

  const getFreshNotebookOrThrow = useCallback(async (notebookId: string) => {
    if (!userId) throw new Error('Usuário não autenticado')
    const fresh = await getResearchNotebook(userId, notebookId)
    if (!fresh) throw new Error('Caderno não encontrado para atualização')
    return fresh
  }, [userId])

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
      toast.warning('Não foi possível carregar o acervo neste momento.')
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
      const model = models.notebook_pesquisador
      if (!model) {
        if (!suggestionModelWarnedRef.current) {
          suggestionModelWarnedRef.current = true
          toast.warning('Sugestões automáticas indisponíveis', 'Configure o agente Pesquisador de Fontes no painel administrativo para habilitar sugestões dinâmicas.')
        }
        return
      }
      const preview = sourceCtx.slice(0, 4_000)
      const result = await callLLM(apiKey,
        'Você gera perguntas de pesquisa relevantes com base em fontes jurídicas.',
        `Tema: "${activeNotebook.topic}"
Resumo das fontes:\n${preview}\n\nGere exatamente 5 perguntas curtas e objetivas que o usuário poderia fazer ao assistente.\nFormato: uma pergunta por linha, sem numeração, sem prefixos.`,
        model, 300, 0.5)

      // Track usage for suggestions
      const execution = createUsageExecutionRecord({
        source_type: 'caderno_pesquisa', source_id: activeNotebook.id!,
        phase: 'notebook_pesquisador', agent_name: 'Pesquisador de Fontes',
        model: result.model, tokens_in: result.tokens_in, tokens_out: result.tokens_out,
        cost_usd: result.cost_usd, duration_ms: result.duration_ms,
      })
      const updatedExecutions = [...(activeNotebook.llm_executions || []), execution]
      if (userId && activeNotebook.id) {
        await updateResearchNotebook(userId, activeNotebook.id, {
          llm_executions: updatedExecutions,
        })
        setActiveNotebook(prev => prev ? { ...prev, llm_executions: updatedExecutions } : prev)
      }

      const lines = result.content
        .split(/[\r\n]+/)
        .map(l => l.replace(/^[\s\-•*\d\.)]+/, '').trim())
        .filter(l => l.length > 10 && l.length < 140)
        .slice(0, 5)
      if (lines.length >= 3) setSuggestions(lines)
    } catch (err) {
      console.warn('Failed to generate notebook suggestions:', err)
    }
    finally { setSuggestionsLoading(false) }
  }, [activeNotebook, suggestionsLoading, buildSourceContext, toast]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setPendingNotebookDelete(nb)
  }

  const confirmDeleteNotebook = async () => {
    if (!userId || !pendingNotebookDelete?.id) return
    try {
      await deleteResearchNotebook(userId, pendingNotebookDelete.id)
      toast.success('Caderno excluído')
      if (activeNotebook?.id === pendingNotebookDelete.id) {
        setActiveNotebook(null)
        setViewMode('list')
      }
      await loadNotebooks()
    } catch {
      toast.error('Erro ao excluir caderno')
    } finally {
      setPendingNotebookDelete(null)
    }
  }

  // ── Add acervo source ───────────────────────────────────────────────
  const handleAddAcervoSource = async (acervoDoc: AcervoDocumentData) => {
    if (!userId || !activeNotebook?.id) return
    const notebookId = activeNotebook.id
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

      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const updatedSources = [...freshNotebook.sources, newSource]
      await updateResearchNotebook(userId, notebookId, { sources: updatedSources })
      setActiveNotebook(prev => prev && prev.id === notebookId ? { ...prev, sources: updatedSources } : prev)
      toast.success(`Fonte "${acervoDoc.filename}" adicionada`)
    } catch (err) {
      console.error('Error adding acervo source:', err)
      toast.error('Erro ao adicionar fonte do acervo')
    }
  }

  // ── Analyze acervo with multi-agent pipeline ────────────────────────
  const handleAnalyzeAcervo = async () => {
    if (!userId || !activeNotebook?.id) return
    if (acervoAnalysisLoading) return
    const nb = activeNotebook
    const abortController = new AbortController()
    acervoAbortRef.current = abortController

    setAcervoAnalysisLoading(true)
    setAcervoAnalysisResults([])
    setSelectedAnalysisIds(new Set())
    setAcervoAnalysisPhase('')
    setAcervoAnalysisMessage('Iniciando análise...')
    setAcervoAnalysisPercent(0)
    setAcervoAnalysisError('')
    setShowAcervoProgressModal(true)

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
        abortController.signal,
      )

      // Save execution records to notebook
      if (result.executions.length > 0) {
        const freshNotebook = await getFreshNotebookOrThrow(nb.id!)
        const existingExecs = freshNotebook.llm_executions || []
        await updateResearchNotebook(userId, nb.id!, {
          llm_executions: [...existingExecs, ...result.executions],
        })
        setActiveNotebook(prev => prev && prev.id === nb.id
          ? { ...prev, llm_executions: [...existingExecs, ...result.executions] }
          : prev)
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
      if (err instanceof DOMException && err.name === 'AbortError') {
        setAcervoAnalysisError('')
        setAcervoAnalysisMessage('Análise de acervo cancelada pelo usuário.')
        toast.info('Análise de acervo cancelada')
        return
      }
      setAcervoAnalysisError(err instanceof Error ? err.message : 'Erro inesperado')
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
      acervoAbortRef.current = null
    }
  }

  // ── Add selected analysis results as sources ────────────────────────
  const handleAddAnalysisResults = async () => {
    if (!userId || !activeNotebook?.id || selectedAnalysisIds.size === 0) return
    const notebookId = activeNotebook.id

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

      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const updatedSources = [...freshNotebook.sources, ...newSources]
      await updateResearchNotebook(userId, notebookId, { sources: updatedSources })
      setActiveNotebook(prev => prev && prev.id === notebookId ? { ...prev, sources: updatedSources } : prev)
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
    const notebookId = activeNotebook.id

    const trimmedUrl = sourceUrl.trim()
    let parsedUrl: URL
    try {
      parsedUrl = new URL(trimmedUrl)
    } catch {
      toast.error('URL inválida — informe uma URL HTTPS válida (ex.: https://exemplo.com/pagina).')
      return
    }
    if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname || /\s/.test(trimmedUrl)) {
      toast.error('URL inválida — informe uma URL HTTPS válida com domínio (ex.: https://exemplo.com/pagina).')
      return
    }

    setSourceUrlLoading(true)
    toast.info('Buscando conteúdo do link...')
    try {
      const textContent = await fetchUrlContentService(trimmedUrl)
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

      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const updatedSources = [...freshNotebook.sources, newSource]
      await updateResearchNotebook(userId, notebookId, { sources: updatedSources })
      setActiveNotebook(prev => prev && prev.id === notebookId ? { ...prev, sources: updatedSources } : prev)
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

  // ── Modal step updater helper ─────────────────────────────────────────────
  const isAnyResearchLoading = externalResearchLoading || externalDeepLoading || jurisprudenceLoading

  const updateModalStep = (stepId: string, update: Partial<ResearchStep>) => {
    setResearchModalSteps(prev => prev.map(s =>
      s.id === stepId ? { ...s, ...update } : s,
    ))
  }

  const addModalSubstep = (stepId: string, substep: string) => {
    setResearchModalSteps(prev => prev.map(s =>
      s.id === stepId
        ? {
            ...s,
            substeps: s.substeps[s.substeps.length - 1] === substep
              ? s.substeps
              : [...s.substeps, substep],
          }
        : s,
    ))
  }

  /** Mark all active/pending steps as error — used in catch blocks */
  const failAllActiveSteps = (errorDetail: string) => {
    setResearchModalSteps(prev => prev.map(s =>
      s.status === 'active' || s.status === 'pending'
        ? { ...s, status: 'error' as const, detail: s.status === 'active' ? errorDetail : undefined }
        : s,
    ))
  }

  /** Auto-close modal after a brief delay so user can see success state */
  const autoCloseModal = (delayMs = 1800) => {
    setTimeout(() => {
      setResearchModalOpen(false)
    }, delayMs)
  }

  const webErrorHint = (errorType: WebSearchErrorType): string => {
    if (errorType === 'rate_limit') return 'Provedor em limite de requisições. Tente novamente em alguns segundos.'
    if (errorType === 'timeout') return 'Tempo limite excedido na busca externa. Tente novamente com termos mais curtos.'
    if (errorType === 'network') return 'Falha de rede ao consultar provedores externos. Verifique a conexão e tente novamente.'
    if (errorType === 'http') return 'Provedor externo indisponível no momento. Tente novamente em instantes.'
    return 'Falha técnica durante a busca externa.'
  }

  const dataJudErrorLabel = (errorType: DataJudErrorType): string => {
    if (errorType === 'rate_limit') return 'limite de taxa'
    if (errorType === 'timeout') return 'timeout'
    if (errorType === 'network') return 'rede'
    if (errorType === 'auth') return 'autenticação'
    if (errorType === 'aborted') return 'cancelado'
    if (errorType === 'http') return 'erro HTTP'
    return 'erro desconhecido'
  }

  const appendNotebookSourceWithExecution = async (
    notebookId: string,
    source: NotebookSource,
    execution: ReturnType<typeof createUsageExecutionRecord> | ReturnType<typeof createUsageExecutionRecord>[],
  ) => {
    if (!userId) throw new Error('Usuário não autenticado')
    const freshNotebook = await getFreshNotebookOrThrow(notebookId)
    const updatedSources = [...freshNotebook.sources, source]
    const executions = Array.isArray(execution) ? execution : [execution]
    const updatedExecutions = [...(freshNotebook.llm_executions || []), ...executions]

    await updateResearchNotebook(userId, notebookId, {
      sources: updatedSources,
      llm_executions: updatedExecutions,
    })

    setActiveNotebook(prev => prev && prev.id === notebookId
      ? { ...prev, sources: updatedSources, llm_executions: updatedExecutions }
      : prev)
  }

  const handleAddExternalSearchSource = async () => {
    if (!userId || !activeNotebook?.id || !externalSearchQuery.trim()) return
    const query = externalSearchQuery.trim()
    const notebookId = activeNotebook.id

    // Open modal
    const steps = createExternalSearchSteps()
    setResearchModalTitle('Pesquisa Externa')
    setResearchModalSubtitle(query)
    setResearchModalVariant('external')
    setResearchModalSteps(steps)
    setResearchModalStats({ sourcesFound: 0, urlsExamined: 0, tribunalsQueried: 0, tokensUsed: 0, elapsedMs: 0 })
    setResearchModalCanClose(false)
    setResearchModalOpen(true)
    const abortController = new AbortController()
    researchAbortRef.current = abortController

    setExternalResearchLoading(true)
    const t0 = performance.now()
    try {
      // Step 1: Search
      updateModalStep('search', { status: 'active' })
      addModalSubstep('search', 'Pesquisando DuckDuckGo via Jina Reader...')
      const { results, diagnostics } = await searchWebResultsWithDiagnostics(query, abortController.signal)
      setResearchModalStats(prev => ({ ...prev, sourcesFound: results.length, elapsedMs: Math.round(performance.now() - t0) }))

      diagnostics.strategies
        .filter(s => s.errorType !== 'none' && s.errorType !== 'empty' && s.errorType !== 'aborted')
        .forEach(s => {
          addModalSubstep('search', `${s.strategy}: ${s.message || s.errorType}`)
        })

      addModalSubstep('search', `${results.length} resultado(s) encontrado(s)`)
      updateModalStep('search', { status: results.length > 0 ? 'done' : 'error', detail: results.length > 0 ? `${results.length} resultados` : 'Nenhum resultado' })

      if (results.length === 0) {
        setResearchModalCanClose(true)
        if (diagnostics.hadTechnicalError) {
          const mainFailure = diagnostics.strategies.find(s => s.errorType !== 'none' && s.errorType !== 'empty' && s.errorType !== 'aborted')
          const hint = webErrorHint(mainFailure?.errorType || 'http')
          updateModalStep('search', { status: 'error', detail: hint })
          toast.warning('Falha técnica na pesquisa externa', hint)
        } else {
          const hint = 'Nenhum resultado útil encontrado. Tente termos mais gerais ou sinônimos jurídicos.'
          updateModalStep('search', { status: 'error', detail: hint })
          toast.info(hint)
        }
        return
      }

      if (abortController.signal.aborted) return

      // Close progress modal, show results for user review
      setResearchModalOpen(false)
      setResearchModalCanClose(true)

      const reviewItems: SearchResultItem[] = results.map((r, i) => ({
        id: `ext-${i}`,
        title: r.title,
        subtitle: r.url,
        snippet: r.snippet,
        url: r.url,
        metadata: {},
        selected: true,
        _raw: r,
      }))

      setSearchResultsItems(reviewItems)
      setSearchResultsVariant('external')
      setSearchResultsCallback(() => async (selected: SearchResultItem[]) => {
        setSearchResultsModalOpen(false)

        if (selected.length === 0) {
          toast.info('Nenhum resultado selecionado.')
          return
        }

        // Re-open progress modal for synthesis
        const synthSteps = createExternalSearchSteps()
        synthSteps[0].status = 'done'
        synthSteps[0].detail = `${results.length} resultados`
        setResearchModalTitle('Pesquisa Externa')
        setResearchModalSubtitle(query)
        setResearchModalVariant('external')
        setResearchModalSteps(synthSteps)
        setResearchModalStats(prev => ({ ...prev, sourcesFound: selected.length }))
        setResearchModalCanClose(false)
        setResearchModalOpen(true)

        try {
          // Step 2: Analyze results
          updateModalStep('analyze', { status: 'active' })
          addModalSubstep('analyze', `Preparando ${selected.length} resultado(s) para síntese...`)

          const textContent = selected.map((r, i) =>
            `[${i + 1}] ${r.title}\nURL: ${r.url || ''}\nResumo: ${r.snippet}`,
          ).join('\n\n')

          const models = await loadResearchNotebookModels()
          const model = models.notebook_pesquisador_externo
          if (!model) {
            updateModalStep('analyze', { status: 'error', detail: 'Modelo não configurado' })
            setResearchModalCanClose(true)
            toast.warning('Modelo obrigatório não configurado', 'Configure no Admin (Caderno de Pesquisa) o agente "Pesquisador Externo".')
            return
          }
          addModalSubstep('analyze', `Usando modelo: ${model}`)
          updateModalStep('analyze', { status: 'done' })

          // Step 3: Synthesize
          updateModalStep('synthesize', { status: 'active' })
          addModalSubstep('synthesize', 'Solicitando síntese ao LLM...')
          const apiKey = await getOpenRouterKey()

          const externalResult = await callLLM(
            apiKey,
            'Você é um pesquisador jurídico externo. Sintetize resultados de busca web em texto objetivo para uso no caderno de pesquisa. Responda em português com seções: panorama, pontos-chave, fundamentos normativos/jurisprudenciais citados e lista de URLs.',
            `Consulta do usuário: "${query}"\n\nResultados selecionados (${selected.length}):\n${textContent}\n\nProduza uma síntese clara e acionável com foco jurídico.`,
            model,
            1800,
            0.2,
          )

          setResearchModalStats(prev => ({
            ...prev,
            tokensUsed: externalResult.tokens_in + externalResult.tokens_out,
            elapsedMs: Math.round(performance.now() - t0),
          }))
          addModalSubstep('synthesize', `Síntese gerada (${externalResult.tokens_out} tokens)`)
          updateModalStep('synthesize', { status: 'done', detail: 'Fonte criada com sucesso' })

          const source: NotebookSource = {
            id: generateId(),
            type: 'external',
            name: `Pesquisa externa: ${query}`,
            reference: query,
            content_type: 'text/plain',
            size_bytes: externalResult.content.length,
            text_content: externalResult.content.slice(0, MAX_SOURCE_TEXT_LENGTH),
            status: 'indexed',
            added_at: new Date().toISOString(),
          }

          const execution = createUsageExecutionRecord({
            source_type: 'caderno_pesquisa',
            source_id: notebookId,
            phase: 'notebook_pesquisador_externo',
            agent_name: 'Pesquisador Externo',
            model: externalResult.model,
            tokens_in: externalResult.tokens_in,
            tokens_out: externalResult.tokens_out,
            cost_usd: externalResult.cost_usd,
            duration_ms: externalResult.duration_ms,
          })

          await appendNotebookSourceWithExecution(notebookId, source, execution)
          setExternalSearchQuery('')
          setSuggestions([])
          toast.success(`Pesquisa externa adicionada com ${selected.length} resultado(s).`)
          autoCloseModal()
        } catch (err) {
          console.error('External search synthesis error:', err)
          failAllActiveSteps(err instanceof Error ? err.message : 'Erro inesperado')
          toast.error('Erro ao sintetizar pesquisa externa')
        } finally {
          setResearchModalCanClose(true)
        }
      })
      setSearchResultsModalOpen(true)
    } catch (err) {
      if (abortController.signal.aborted) return
      console.error('External search source error:', err)
      failAllActiveSteps(err instanceof Error ? err.message : 'Erro inesperado')
      toast.error('Erro ao adicionar pesquisa externa')
    } finally {
      setExternalResearchLoading(false)
      setResearchModalCanClose(true)
      researchAbortRef.current = null
    }
  }

  const handleAddDeepExternalSearchSource = async () => {
    if (!userId || !activeNotebook?.id || !externalSearchQuery.trim()) return
    const query = externalSearchQuery.trim()
    const notebookId = activeNotebook.id

    // Open modal
    const steps = createDeepSearchSteps()
    setResearchModalTitle('Pesquisa Profunda')
    setResearchModalSubtitle(query)
    setResearchModalVariant('deep')
    setResearchModalSteps(steps)
    setResearchModalStats({ sourcesFound: 0, urlsExamined: 0, tribunalsQueried: 0, tokensUsed: 0, elapsedMs: 0 })
    setResearchModalCanClose(false)
    setResearchModalOpen(true)
    const abortController = new AbortController()
    researchAbortRef.current = abortController

    setExternalDeepLoading(true)
    const t0 = performance.now()
    try {
      // Step 1: Search
      updateModalStep('search', { status: 'active' })
      addModalSubstep('search', 'Pesquisando na web com múltiplas estratégias...')

      const deepResult = await deepWebSearch(query, (progress) => {
        if (progress.phase === 'searching') {
          addModalSubstep('search', 'Consultando DuckDuckGo...')
        } else if (progress.phase === 'fetching') {
          setResearchModalStats(prev => ({
            ...prev,
            sourcesFound: progress.resultsFound,
            urlsExamined: progress.urlsFetched,
            elapsedMs: Math.round(performance.now() - t0),
          }))
          if (progress.currentUrl) {
            try {
              addModalSubstep('fetch', `Extraindo: ${new URL(progress.currentUrl).hostname}...`)
            } catch {
              addModalSubstep('fetch', `Extraindo conteúdo...`)
            }
          }
        }
      }, abortController.signal)

      updateModalStep('search', {
        status: deepResult.results.length > 0 ? 'done' : 'error',
        detail: `${deepResult.results.length} resultado(s)`,
      })

      deepResult.diagnostics?.strategies
        .filter(s => s.errorType !== 'none' && s.errorType !== 'empty' && s.errorType !== 'aborted')
        .forEach(s => {
          addModalSubstep('search', `${s.strategy}: ${s.message || s.errorType}`)
        })

      // Step 2: Fetch content
      const hasSnippetFallback = deepResult.results.length > 0 && deepResult.contents.length === 0
      updateModalStep('fetch', {
        status: deepResult.contents.length > 0 || hasSnippetFallback ? 'done' : 'error',
        detail: hasSnippetFallback
          ? 'Sem conteúdo completo; usando snippets da busca'
          : undefined,
      })
      addModalSubstep('fetch', `${deepResult.contents.length} página(s) com conteúdo extraído`)
      if (deepResult.fetchFailures > 0) {
        addModalSubstep('fetch', `${deepResult.fetchFailures} URL(s) falharam na extração`) 
      }

      if (deepResult.contents.length === 0 && deepResult.results.length === 0) {
        setResearchModalCanClose(true)
        if (deepResult.diagnostics?.hadTechnicalError) {
          const mainFailure = deepResult.diagnostics.strategies.find(s => s.errorType !== 'none' && s.errorType !== 'empty' && s.errorType !== 'aborted')
          const hint = webErrorHint(mainFailure?.errorType || 'http')
          updateModalStep('search', { status: 'error', detail: hint })
          toast.warning('Falha técnica na pesquisa profunda', hint)
        } else {
          toast.info('Nenhum resultado útil para pesquisa externa profunda. Tente ampliar os termos da consulta.')
        }
        return
      }

      if (abortController.signal.aborted) return

      // Close progress modal, show results for user review
      setResearchModalOpen(false)
      setResearchModalCanClose(true)

      // Build review items: prefer contents (fetched pages), fallback to search results
      const reviewItems: SearchResultItem[] = deepResult.contents.length > 0
        ? deepResult.contents.map((c, i) => ({
            id: `deep-${i}`,
            title: c.title,
            subtitle: c.url,
            snippet: c.content.slice(0, 300) + (c.content.length > 300 ? '...' : ''),
            fullContent: c.content.slice(0, 5000),
            url: c.url,
            metadata: { Chars: `${(c.content.length / 1000).toFixed(0)}K` },
            selected: true,
            _raw: c,
          }))
        : deepResult.results.map((r, i) => ({
            id: `deep-${i}`,
            title: r.title,
            subtitle: r.url,
            snippet: r.snippet,
            url: r.url,
            metadata: {},
            selected: true,
            _raw: r,
          }))

      setSearchResultsItems(reviewItems)
      setSearchResultsVariant('deep')
      setSearchResultsCallback(() => async (selected: SearchResultItem[]) => {
        setSearchResultsModalOpen(false)

        if (selected.length === 0) {
          toast.info('Nenhum resultado selecionado.')
          return
        }

        // Re-open progress modal for synthesis
        const synthSteps = createDeepSearchSteps()
        synthSteps[0].status = 'done'
        synthSteps[0].detail = `${deepResult.results.length} resultados`
        synthSteps[1].status = 'done'
        synthSteps[1].detail = `${selected.length} selecionados`
        setResearchModalTitle('Pesquisa Profunda')
        setResearchModalSubtitle(query)
        setResearchModalVariant('deep')
        setResearchModalSteps(synthSteps)
        setResearchModalStats(prev => ({ ...prev, sourcesFound: selected.length }))
        setResearchModalCanClose(false)
        setResearchModalOpen(true)

        try {
          // Step 3: Analyze
          updateModalStep('analyze', { status: 'active' })
          addModalSubstep('analyze', `Preparando ${selected.length} resultado(s) para análise profunda...`)

          const models = await loadResearchNotebookModels()
          const model = models.notebook_pesquisador_externo_profundo
          if (!model) {
            updateModalStep('analyze', { status: 'error', detail: 'Modelo não configurado' })
            setResearchModalCanClose(true)
            toast.warning('Modelo não configurado', 'Configure um modelo para o pesquisador externo profundo no Admin.')
            return
          }
          addModalSubstep('analyze', `Modelo: ${model}`)
          updateModalStep('analyze', { status: 'done' })

          // Step 4: Synthesize
          updateModalStep('synthesize', { status: 'active' })
          addModalSubstep('synthesize', 'Sintetizando conhecimento profundo...')
          const apiKey = await getOpenRouterKey()

          // Build prompt from selected items
          const hasFullContent = selected.some(s => s.fullContent && s.fullContent.length > 100)
          let compiled: string
          if (hasFullContent) {
            compiled = selected.map((s, i) =>
              `<fonte_${i + 1}>\nTÍTULO: ${s.title}\nURL: ${s.url || ''}\n${(s.fullContent || s.snippet).slice(0, MAX_DEEP_EXTERNAL_SOURCE_SNIPPET_CHARS)}\n</fonte_${i + 1}>`,
            ).join('\n\n')
          } else {
            compiled = selected.map((s, i) =>
              `[${i + 1}] ${s.title}\nURL: ${s.url || ''}\nResumo: ${s.snippet}`,
            ).join('\n\n')
          }

          const llmResult = await callLLM(
            apiKey,
            'Você é um pesquisador jurídico externo profundo. Sintetize fontes web em texto objetivo e acionável para caderno de pesquisa. Responda em português, com seções: panorama, pontos-chave, fundamentos normativos/jurisprudenciais citados e lista de URLs.',
            `Consulta do usuário: "${query}"\n\nFontes selecionadas (${selected.length}):\n${compiled}\n\nProduza uma síntese profunda com foco jurídico.`,
            model,
            2200,
            0.2,
          )

          setResearchModalStats(prev => ({
            ...prev,
            tokensUsed: llmResult.tokens_in + llmResult.tokens_out,
            elapsedMs: Math.round(performance.now() - t0),
          }))
          addModalSubstep('synthesize', `Síntese gerada (${llmResult.tokens_out} tokens)`)
          updateModalStep('synthesize', { status: 'done', detail: 'Fonte criada com sucesso' })

          const source: NotebookSource = {
            id: generateId(),
            type: 'external_deep',
            name: `Pesquisa externa profunda: ${query}`,
            reference: query,
            content_type: 'text/plain',
            size_bytes: llmResult.content.length,
            text_content: llmResult.content.slice(0, MAX_DEEP_EXTERNAL_TEXT_CHARS),
            status: 'indexed',
            added_at: new Date().toISOString(),
          }

          const execution = createUsageExecutionRecord({
            source_type: 'caderno_pesquisa',
            source_id: notebookId,
            phase: 'notebook_pesquisador_externo_profundo',
            agent_name: 'Pesquisador Externo Profundo',
            model: llmResult.model,
            tokens_in: llmResult.tokens_in,
            tokens_out: llmResult.tokens_out,
            cost_usd: llmResult.cost_usd,
            duration_ms: llmResult.duration_ms,
          })

          await appendNotebookSourceWithExecution(notebookId, source, execution)
          setExternalSearchQuery('')
          setSuggestions([])
          toast.success('Pesquisa externa profunda adicionada como fonte.')
          autoCloseModal()
        } catch (err) {
          console.error('Deep search synthesis error:', err)
          failAllActiveSteps(err instanceof Error ? err.message : 'Erro inesperado')
          toast.error('Erro na pesquisa externa profunda')
        } finally {
          setResearchModalCanClose(true)
        }
      })
      setSearchResultsModalOpen(true)
    } catch (err) {
      if (abortController.signal.aborted) return
      console.error('Deep external search source error:', err)
      failAllActiveSteps(err instanceof Error ? err.message : 'Erro inesperado')
      toast.error('Erro na pesquisa externa profunda')
    } finally {
      setExternalDeepLoading(false)
      setResearchModalCanClose(true)
      researchAbortRef.current = null
    }
  }

  // Opens the pre-search configuration modal for jurisprudence
  const handleAddJurisprudenceSource = () => {
    if (!userId || !activeNotebook?.id || !externalSearchQuery.trim()) return
    setJurisprudenceConfigOpen(true)
  }

  // Called from JurisprudenceConfigModal when user confirms config
  const handleJurisprudenceSearch = async (config: JurisprudenceSearchConfig) => {
    if (!userId || !activeNotebook?.id) return
    const notebookId = activeNotebook.id
    setJurisprudenceConfigOpen(false)

    // Open progress modal
    const steps = createJurisprudenceSteps()
    setResearchModalTitle('Pesquisa de Jurisprudência')
    setResearchModalSubtitle(config.query)
    setResearchModalVariant('jurisprudencia')
    setResearchModalSteps(steps)
    setResearchModalStats({ sourcesFound: 0, urlsExamined: 0, tribunalsQueried: 0, tokensUsed: 0, elapsedMs: 0 })
    setResearchModalCanClose(false)
    setResearchModalOpen(true)
    const abortController = new AbortController()
    researchAbortRef.current = abortController

    setJurisprudenceLoading(true)
    const t0 = performance.now()
    try {
      // Step 1: Query tribunals
      updateModalStep('query', { status: 'active' })
      addModalSubstep('query', `Consultando ${config.tribunals.length} tribunais em paralelo...`)

      const djResult = await searchDataJud(config.query, {
        tribunals: config.tribunals,
        maxPerTribunal: config.maxPerTribunal,
        dateFrom: config.dateFrom || undefined,
        dateTo: config.dateTo || undefined,
        graus: config.graus.length > 0 ? config.graus : undefined,
        onProgress: (progress) => {
          setResearchModalStats(prev => ({
            ...prev,
            tribunalsQueried: progress.tribunalsQueried,
            sourcesFound: progress.resultsFound,
            elapsedMs: Math.round(performance.now() - t0),
          }))
          if (progress.currentTribunal) {
            addModalSubstep('query', `${progress.currentTribunal} (${progress.tribunalsQueried}/${progress.tribunalsTotal})`)
          }
        },
        signal: abortController.signal,
      })

      updateModalStep('query', {
        status: djResult.results.length > 0 ? 'done' : 'error',
        detail: `${djResult.results.length} resultado(s) de ${djResult.tribunalsWithResults} tribunal(is)`,
      })

      if (djResult.errors.length > 0) {
        addModalSubstep('query', `${djResult.errors.length} tribunal(is) com erro (ignorados)`)
        const groupedErrors = djResult.errorDetails.reduce<Record<string, number>>((acc, item) => {
          const key = dataJudErrorLabel(item.type)
          acc[key] = (acc[key] || 0) + 1
          return acc
        }, {})
        Object.entries(groupedErrors).forEach(([kind, count]) => {
          addModalSubstep('query', `${count} tribunal(is) com ${kind}`)
        })
      }

      // Step 2: Filter results
      updateModalStep('filter', { status: 'active' })
      if (djResult.results.length === 0) {
        const hasTechnicalFailure = djResult.errorDetails.some(e => e.type !== 'aborted')
        const detail = hasTechnicalFailure
          ? 'Nenhum resultado devido a falhas técnicas nos tribunais consultados'
          : 'Nenhum resultado encontrado'
        updateModalStep('filter', { status: 'error', detail })
        setResearchModalCanClose(true)
        if (hasTechnicalFailure) {
          toast.warning('Falha técnica na consulta DataJud', 'Alguns tribunais falharam. Tente novamente em alguns segundos.')
        } else {
          toast.info('Nenhum resultado de jurisprudência encontrado no DataJud.')
        }
        return
      }

      addModalSubstep('filter', `${djResult.results.length} resultado(s) encontrado(s)`)
      updateModalStep('filter', { status: 'done', detail: `${djResult.results.length} resultados` })

      // Close progress modal and show results review
      setResearchModalOpen(false)
      setResearchModalCanClose(true)

      const reviewItems: SearchResultItem[] = djResult.results.map((r, i) => ({
        id: `dj-${i}`,
        title: `${r.classe} — ${r.numeroProcesso}`,
        subtitle: `${r.tribunalName} · ${r.orgaoJulgador}`,
        snippet: r.ementa
          ? r.ementa.slice(0, 200) + (r.ementa.length > 200 ? '…' : '')
          : (r.assuntos.join(', ') || 'Sem assuntos'),
        fullContent: [
          `Processo: ${r.numeroProcesso}`,
          `Classe: ${r.classe} (${r.classeCode})`,
          `Tribunal: ${r.tribunalName}`,
          `Órgão Julgador: ${r.orgaoJulgador}`,
          `Data de Ajuizamento: ${r.dataAjuizamento}`,
          `Grau: ${r.grau}`,
          `Formato: ${r.formato}`,
          `Assuntos: ${r.assuntos.join('; ') || '—'}`,
          r.ementa ? `Ementa:\n${r.ementa}` : '',
          r.inteiroTeor ? `Inteiro Teor:\n${r.inteiroTeor.slice(0, 3000)}${r.inteiroTeor.length > 3000 ? '\n[... texto truncado ...]' : ''}` : '',
          r.movimentos.length > 0 ? `Movimentos:\n${r.movimentos.slice(0, 5).map(m => `  - ${m.nome} (${m.dataHora})`).join('\n')}` : '',
        ].filter(Boolean).join('\n'),
        metadata: {
          ...(r.grau ? { Grau: r.grau } : {}),
          ...(r.dataAjuizamento ? { Data: r.dataAjuizamento.split('T')[0] } : {}),
          ...(r.ementa ? { Ementa: '✓' } : {}),
          ...(r.inteiroTeor ? { 'Inteiro Teor': '✓' } : {}),
        },
        selected: true,
        _raw: r,
      }))

      setSearchResultsItems(reviewItems)
      setSearchResultsVariant('jurisprudencia')
      setSearchResultsCallback(() => async (selected: SearchResultItem[]) => {
        setSearchResultsModalOpen(false)

        if (selected.length === 0) {
          toast.info('Nenhum resultado selecionado.')
          return
        }

        // Re-open progress modal for synthesis
        const synthSteps = createJurisprudenceSteps()
        // Mark query+filter as done
        synthSteps[0].status = 'done'
        synthSteps[0].detail = `${djResult.results.length} resultados`
        synthSteps[1].status = 'done'
        synthSteps[1].detail = `${selected.length} selecionados`
        setResearchModalTitle('Pesquisa de Jurisprudência')
        setResearchModalSubtitle(config.query)
        setResearchModalVariant('jurisprudencia')
        setResearchModalSteps(synthSteps)
        setResearchModalStats(prev => ({ ...prev, sourcesFound: selected.length }))
        setResearchModalCanClose(false)
        setResearchModalOpen(true)

        try {
          const models = await loadResearchNotebookModels()
          const openRouterApiKey = await getOpenRouterKey()
          const llmExecutions: ReturnType<typeof createUsageExecutionRecord>[] = []

          // Step 3: Rank results by relevance
          updateModalStep('rank', { status: 'active' })
          const rankModel = models.notebook_ranqueador_jurisprudencia
          let selectedResults = selected.map(s => s._raw as DataJudResult)

          if (rankModel) {
            addModalSubstep('rank', `Avaliando relevância com ${rankModel}...`)
            const rankTextContent = formatDataJudResults(selectedResults)
            const rankResult = await callLLM(
              openRouterApiKey,
              JURISPRUDENCE_RANKING_SYSTEM,
              `Consulta: "${config.query}"\n\nProcessos para avaliar:\n${rankTextContent}`,
              rankModel,
              800,
              0.1,
            )

            // Parse ranking and reorder results
            try {
              const cleaned = rankResult.content.replace(/```(?:json)?\s*/g, '').trim()
              const parsed = JSON.parse(cleaned) as { ranking: Array<{ index: number; score: number }> }
              if (parsed.ranking && Array.isArray(parsed.ranking)) {
                const sorted = parsed.ranking
                  .filter(r => r.index >= 1 && r.index <= selectedResults.length)
                  .sort((a, b) => b.score - a.score)

                const reordered = []
                const seenIndices = new Set<number>()
                let topScore: number | null = null

                for (const item of sorted) {
                  const resultIndex = item.index - 1
                  if (seenIndices.has(resultIndex)) continue
                  const process = selectedResults[resultIndex]
                  if (!process) continue
                  seenIndices.add(resultIndex)
                  reordered.push(process)
                  if (topScore === null) topScore = item.score
                }

                if (reordered.length > 0) {
                  selectedResults = reordered
                  addModalSubstep('rank', `Processos reordenados por relevância (top score: ${topScore ?? 'N/A'})`)
                } else {
                  addModalSubstep('rank', 'Ranking retornou índices inválidos/vazios — mantendo ordem original')
                }
              }
            } catch {
              addModalSubstep('rank', 'Parsing do ranking falhou — mantendo ordem original')
            }

            llmExecutions.push(createUsageExecutionRecord({
              source_type: 'caderno_pesquisa',
              source_id: notebookId,
              phase: 'notebook_ranqueador_jurisprudencia',
              agent_name: 'Ranqueador de Jurisprudência',
              model: rankResult.model,
              tokens_in: rankResult.tokens_in,
              tokens_out: rankResult.tokens_out,
              cost_usd: rankResult.cost_usd,
              duration_ms: rankResult.duration_ms,
            }))

            setResearchModalStats(prev => ({
              ...prev,
              tokensUsed: (prev.tokensUsed || 0) + rankResult.tokens_in + rankResult.tokens_out,
              elapsedMs: Math.round(performance.now() - t0),
            }))
            updateModalStep('rank', { status: 'done', detail: `${selectedResults.length} processos ranqueados` })
          } else {
            addModalSubstep('rank', 'Modelo não configurado — mantendo ordem original')
            updateModalStep('rank', { status: 'done', detail: 'Etapa ignorada (sem modelo)' })
          }

          // Step 4: Analyze
          updateModalStep('analyze', { status: 'active' })
          const synthesisModel = models.notebook_pesquisador_jurisprudencia
          if (!synthesisModel) {
            updateModalStep('analyze', { status: 'error', detail: 'Modelo não configurado' })
            setResearchModalCanClose(true)
            toast.warning('Modelo obrigatório não configurado', 'Configure no Admin (Caderno de Pesquisa) o agente "Pesquisador de Jurisprudência (DataJud)".')
            return
          }
          addModalSubstep('analyze', `Modelo: ${synthesisModel}`)
          updateModalStep('analyze', { status: 'done' })

          // Step 5: Synthesize
          updateModalStep('synthesize', { status: 'active' })
          addModalSubstep('synthesize', 'Gerando síntese jurisprudencial...')

          const textContent = formatDataJudResults(selectedResults)

          const jurisprudenceResult = await callLLM(
            openRouterApiKey,
            JURISPRUDENCE_SYNTHESIS_SYSTEM,
            `Consulta do usuário: "${config.query}"\n\nResultados DataJud (${selectedResults.length} processos selecionados, ordenados por relevância):\n${textContent}\n\nProduza uma síntese objetiva e acionável para o caderno de pesquisa. Destaque padrões nas movimentações processuais que indiquem tendências de julgamento.`,
            synthesisModel,
            2800,
            0.2,
          )

          setResearchModalStats(prev => ({
            ...prev,
            tokensUsed: (prev.tokensUsed || 0) + jurisprudenceResult.tokens_in + jurisprudenceResult.tokens_out,
            elapsedMs: Math.round(performance.now() - t0),
          }))
          addModalSubstep('synthesize', `Síntese gerada (${jurisprudenceResult.tokens_out} tokens)`)
          updateModalStep('synthesize', { status: 'done', detail: 'Fonte criada com sucesso' })

          const source: NotebookSource = {
            id: generateId(),
            type: 'jurisprudencia',
            name: `Jurisprudência DataJud: ${config.query}`,
            reference: config.query,
            content_type: 'text/plain',
            size_bytes: jurisprudenceResult.content.length,
            text_content: jurisprudenceResult.content.slice(0, MAX_SOURCE_TEXT_LENGTH),
            status: 'indexed',
            added_at: new Date().toISOString(),
          }

          llmExecutions.push(createUsageExecutionRecord({
            source_type: 'caderno_pesquisa',
            source_id: notebookId,
            phase: 'notebook_pesquisador_jurisprudencia',
            agent_name: 'Pesquisador de Jurisprudência (DataJud)',
            model: jurisprudenceResult.model,
            tokens_in: jurisprudenceResult.tokens_in,
            tokens_out: jurisprudenceResult.tokens_out,
            cost_usd: jurisprudenceResult.cost_usd,
            duration_ms: jurisprudenceResult.duration_ms,
          }))

          await appendNotebookSourceWithExecution(notebookId, source, llmExecutions)
          setExternalSearchQuery('')
          setSuggestions([])
          toast.success(`Jurisprudência adicionada com ${selected.length} resultado(s) selecionado(s).`)
          autoCloseModal()
        } catch (err) {
          console.error('Jurisprudence synthesis error:', err)
          failAllActiveSteps(err instanceof Error ? err.message : 'Erro inesperado')
          toast.error('Erro ao sintetizar jurisprudência')
        } finally {
          setResearchModalCanClose(true)
        }
      })
      setSearchResultsModalOpen(true)
    } catch (err) {
      if (abortController.signal.aborted) return
      console.error('Jurisprudence source error:', err)
      failAllActiveSteps(err instanceof Error ? err.message : 'Erro inesperado')
      toast.error('Erro ao consultar jurisprudência no DataJud')
    } finally {
      setJurisprudenceLoading(false)
      setResearchModalCanClose(true)
      researchAbortRef.current = null
    }
  }

  const handleUploadSourceFiles = async (files: FileList | null) => {
    if (!files || !userId || !activeNotebook?.id) return
    const notebookId = activeNotebook.id
    const list = Array.from(files)
    if (list.length === 0) return
    setSourceUploadLoading(true)
    try {
      const newSources: NotebookSource[] = []
      for (const file of list) {
        if (!isSupportedTextFile(file)) {
          toast.error(`Formato não suportado para fonte: ${file.name}`)
          continue
        }
        const textContent = await extractFileText(file)
        newSources.push({
          id: generateId(),
          type: 'upload',
          name: file.name,
          reference: file.name,
          content_type: file.type || 'text/plain',
          size_bytes: file.size,
          text_content: textContent.slice(0, MAX_SOURCE_TEXT_LENGTH),
          status: textContent.length > 0 ? 'indexed' : 'pending',
          added_at: new Date().toISOString(),
        })
      }
      if (newSources.length === 0) return
      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const updatedSources = [...freshNotebook.sources, ...newSources]
      await updateResearchNotebook(userId, notebookId, { sources: updatedSources })
      setActiveNotebook(prev => prev && prev.id === notebookId ? { ...prev, sources: updatedSources } : prev)
      setSuggestions([])
      toast.success(`${newSources.length} arquivo(s) adicionado(s) como fonte.`)
    } catch (err) {
      console.error('Upload notebook sources error:', err)
      toast.error('Erro ao adicionar arquivos como fontes')
    } finally {
      setSourceUploadLoading(false)
      if (sourceUploadInputRef.current) sourceUploadInputRef.current.value = ''
    }
  }

  // ── Remove source ───────────────────────────────────────────────────
  const handleRemoveSource = async (sourceId: string) => {
    if (!userId || !activeNotebook?.id) return
    const notebookId = activeNotebook.id
    try {
      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const updatedSources = freshNotebook.sources.filter(s => s.id !== sourceId)
      await updateResearchNotebook(userId, notebookId, { sources: updatedSources })
      setActiveNotebook(prev => prev && prev.id === notebookId ? { ...prev, sources: updatedSources } : prev)
      setSuggestions([])
    } catch (err) {
      console.error('Error removing source:', err)
      toast.error('Erro ao remover fonte')
    }
  }

  // (buildSourceContext defined earlier)

  // ── Chat: send message ──────────────────────────────────────────────
  const handleSendMessage = async () => {
    if (!userId || !activeNotebook?.id || !chatInput.trim() || chatLoading) return
    const notebookId = activeNotebook.id

    const userMsg: NotebookMessage = {
      id: generateId(),
      role: 'user',
      content: chatInput.trim(),
      created_at: new Date().toISOString(),
    }

    const updatedMessages = [...activeNotebook.messages, userMsg]
    setActiveNotebook(prev => prev && prev.id === notebookId ? { ...prev, messages: updatedMessages } : prev)
    setChatInput('')
    setChatLoading(true)

    try {
      const apiKey = await getOpenRouterKey()
      const models = await loadResearchNotebookModels()
      const model = models.notebook_assistente
      if (!model) {
        toast.warning('Modelo não configurado', `O agente "${AGENT_LABELS.notebook_assistente}" não possui modelo. Vá em Administração > Caderno de Pesquisa e selecione um.`)
        setChatLoading(false)
        return
      }
      const sourceContext = buildSourceContext()

      // Optional web search enrichment
      let webSnippet = ''
      if (useWebSearch) {
        try { webSnippet = await searchWebService(`${activeNotebook.topic} ${userMsg.content}`) } catch { /* non-critical */ }
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

      // Track usage
      const execution = createUsageExecutionRecord({
        source_type: 'caderno_pesquisa',
        source_id: notebookId,
        phase: 'notebook_assistente',
        agent_name: 'Assistente Conversacional',
        model: result.model,
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
        cost_usd: result.cost_usd,
        duration_ms: result.duration_ms,
      })

      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const baseMessages = freshNotebook.messages.some(m => m.id === userMsg.id)
        ? freshNotebook.messages
        : [...freshNotebook.messages, userMsg]
      const finalMessages = [...baseMessages, assistantMsg]
      const updatedExecutions = [...(freshNotebook.llm_executions || []), execution]

      await updateResearchNotebook(userId, notebookId, {
        messages: finalMessages,
        llm_executions: updatedExecutions,
      })
      setActiveNotebook(prev => prev && prev.id === notebookId
        ? { ...prev, messages: finalMessages, llm_executions: updatedExecutions }
        : prev)
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

  // ── Studio: generate artifact (multi-agent pipeline) ────────────────
  const handleGenerateArtifact = async (artifactType: StudioArtifactType) => {
    if (!userId || !activeNotebook?.id || studioLoading) return

    const abortController = new AbortController()
    studioAbortRef.current = abortController
    setStudioLoading(true)
    setSelectedArtifactType(artifactType)
    setStudioProgress(null)
    setStudioLastProgress(null)
    setStudioErrorMessage('')
    setShowStudioProgressModal(true)

    try {
      const apiKey = await getOpenRouterKey()
      const sourceContext = buildSourceContext()
      const artifactDef = ARTIFACT_TYPES.find(a => a.type === artifactType)

      const conversationContext = activeNotebook.messages
        .slice(-MAX_STUDIO_CONTEXT_MESSAGES)
        .map(m => `${m.role}: ${m.content}`)
        .join('\n')
        .slice(0, MAX_STUDIO_CONTEXT_CHARS)

      const onProgress: StudioProgressCallback = (step, total, phase) => {
        setStudioProgress({ step, total, phase })
        setStudioLastProgress({ step, total, phase })
      }

      const result = await runStudioPipeline({
        apiKey,
        topic: activeNotebook.topic,
        description: activeNotebook.description || undefined,
        sourceContext: sourceContext || '',
        conversationContext,
        customInstructions: studioCustomPrompt.trim() || undefined,
        artifactType,
        artifactLabel: artifactDef?.label || artifactType,
      }, onProgress, abortController.signal)
  setStudioLastProgress({ step: 3, total: 3, phase: 'Trilha concluída com sucesso.' })

      const artifact: StudioArtifact = {
        id: generateId(),
        type: artifactType,
        title: `${artifactDef?.label || artifactType} — ${activeNotebook.topic}`,
        content: result.content,
        format: 'markdown',
        created_at: new Date().toISOString(),
      }

      // For reviewable media types, show review modal before saving
      if (REVIEWABLE_ARTIFACT_TYPES.includes(artifactType)) {
        setPendingArtifact({ artifact, executions: result.executions })
        setPendingContent(result.content)
        setStudioCustomPrompt('')
        toast.success(`Proposta de ${artifactDef?.label || 'Artefato'} gerada! Revise e edite antes de salvar.`)
      } else {
        // Non-reviewable types: save immediately
        await saveArtifactToNotebook(artifact, result.executions)
        setActiveTab('artifacts')
        setStudioCustomPrompt('')
        toast.success(`${artifactDef?.label || 'Artefato'} gerado com sucesso! (pipeline de 3 agentes)`)
      }
    } catch (err) {
      console.error('Studio pipeline error:', err)
      setStudioErrorMessage(err instanceof Error ? err.message : 'Erro inesperado no pipeline do estúdio')
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.info('Geração cancelada')
        return
      }
      if (err instanceof ModelUnavailableError) {
        toast.warning(
          `Modelo indisponível: ${err.modelId}`,
          'Um modelo do pipeline do estúdio foi removido do OpenRouter. Vá em Administração > Caderno de Pesquisa e substitua-o.',
        )
      } else if (err instanceof Error && err.message.includes('Agente(s) sem modelo')) {
        toast.warning('Modelos não configurados', err.message)
      } else if (err instanceof Error && err.message.includes('429')) {
        toast.warning(
          'Limite de requisições atingido',
          'O modelo está sobrecarregado ou sua conta atingiu o limite. Aguarde 30 segundos e tente novamente. Considere usar modelos ✦ Grátis no painel administrativo.',
        )
      } else if (err instanceof Error && err.message.includes('API key')) {
        toast.error('Chave da API não configurada. Acesse Administração > Chaves de API.')
      } else {
        toast.error('Erro ao gerar artefato. Tente novamente ou troque o modelo do agente.')
      }
    } finally {
      studioAbortRef.current = null
      setStudioLoading(false)
      setSelectedArtifactType(null)
      setStudioProgress(null)
    }
  }

  // ── Save artifact to notebook (shared by direct save and review confirm) ──
  const saveArtifactToNotebook = async (
    artifact: StudioArtifact,
    executions: { phase: string; agent_name: string; model: string; tokens_in: number; tokens_out: number; cost_usd: number; duration_ms: number }[],
  ) => {
    if (!userId || !activeNotebook?.id) return
    const notebookId = activeNotebook.id

    const freshNotebook = await getFreshNotebookOrThrow(notebookId)
    const updatedArtifacts = [...freshNotebook.artifacts, artifact]

    // Use the correct cost function key so video/audio/presentation costs
    // appear in their dedicated sections on the CostTokensPage
    const costKey: UsageFunctionKey = ARTIFACT_COST_KEY[artifact.type] ?? 'caderno_pesquisa'

    const newExecutions = executions.map(ex =>
      createUsageExecutionRecord({
        source_type: costKey,
        source_id: notebookId,
        phase: ex.phase,
        agent_name: ex.agent_name,
        model: ex.model,
        tokens_in: ex.tokens_in,
        tokens_out: ex.tokens_out,
        cost_usd: ex.cost_usd,
        duration_ms: ex.duration_ms,
      })
    )

    const updatedExecutions = [...(freshNotebook.llm_executions || []), ...newExecutions]

    await updateResearchNotebook(userId, notebookId, {
      artifacts: updatedArtifacts,
      llm_executions: updatedExecutions,
    })

    setActiveNotebook(prev => prev && prev.id === notebookId
      ? { ...prev, artifacts: updatedArtifacts, llm_executions: updatedExecutions }
      : prev)

    // When the artifact is a formal document, persist it to the Documents page
    // so it appears alongside documents created via the NewDocument flow.
    if (artifact.type === 'documento' && IS_FIREBASE) {
      try {
        await saveNotebookDocumentToDocuments(userId, {
          topic: activeNotebook.topic || artifact.title,
          content: artifact.content,
          notebookId,
          notebookTitle: activeNotebook.title || '',
          llm_executions: newExecutions,
        })
        // Secondary toast shown separately after the primary artifact toast
        setTimeout(() => {
          toast.success('Documento salvo na página Documentos', 'Acesse Documentos para ver, editar e exportar este documento.')
        }, 600)
      } catch (err) {
        console.warn('Could not persist document artifact to Documents page:', err)
      }
    }
  }

  // ── Confirm pending artifact (after review/edit) ────────────────────
  const handleConfirmPendingArtifact = async () => {
    if (!pendingArtifact) return
    try {
      const finalArtifact: StudioArtifact = {
        ...pendingArtifact.artifact,
        content: pendingContent,
      }
      await saveArtifactToNotebook(finalArtifact, pendingArtifact.executions)
      const artifactDef = ARTIFACT_TYPES.find(a => a.type === finalArtifact.type)
      toast.success(`${artifactDef?.label || 'Artefato'} salvo com sucesso!`)

      // For video_script: show video generation cost modal after saving
      if (finalArtifact.type === 'video_script') {
        setVideoGenSavedArtifact(finalArtifact)
        setShowVideoGenCost(true)
      } else {
        setActiveTab('artifacts')
      }
    } catch (err) {
      console.error('Error saving reviewed artifact:', err)
      toast.error('Erro ao salvar artefato revisado.')
    } finally {
      setPendingArtifact(null)
      setPendingContent('')
    }
  }

  // ── Discard pending artifact ────────────────────────────────────────
  const handleDiscardPendingArtifact = () => {
    setPendingArtifact(null)
    setPendingContent('')
    toast.success('Proposta descartada.')
  }

  // ── Skip video generation (just keep the script) ───────────────────
  const handleSkipVideoGeneration = () => {
    setShowVideoGenCost(false)
    setVideoGenSavedArtifact(null)
    setActiveTab('artifacts')
  }

  // ── Generate full video from saved script ──────────────────────────
  const handleGenerateVideo = async (editedContent?: string) => {
    if (!videoGenSavedArtifact || !userId || !activeNotebook?.id) return

    // Create a deferred promise so startTask can track completion
    let resolveTask: (v: unknown) => void = () => {}
    let rejectTask: (e: unknown) => void = () => {}
    const taskPromise = new Promise((res, rej) => { resolveTask = res; rejectTask = rej })

    // Register as a persistent background task visible in the TaskBar
    const taskName = `Vídeo: ${activeNotebook.topic.slice(0, 40)}`
    startTask(taskName, (onTaskProgress) => {
      onTaskProgress({ progress: 0, phase: 'Preparando pipeline...' })
      return taskPromise
    })

    try {
      setVideoGenLoading(true)
      const apiKey = await getOpenRouterKey()
      if (!apiKey) {
        toast.error('Chave da API não configurada. Acesse Administração > Chaves de API.')
        return
      }
      // Store api key for use in VideoStudioEditor (image/TTS generation)
      setVideoStudioApiKey(apiKey)

      // Use edited content if provided, otherwise use original
      const scriptContent = editedContent || videoGenSavedArtifact.content

      // If content was edited, update the saved artifact too
      if (editedContent && editedContent !== videoGenSavedArtifact.content) {
        const freshNotebook = await getFreshNotebookOrThrow(activeNotebook.id)
        const updatedArtifacts = freshNotebook.artifacts.map(a =>
          a.id === videoGenSavedArtifact.id ? { ...a, content: editedContent } : a
        )
        await updateResearchNotebook(userId, activeNotebook.id, {
          artifacts: updatedArtifacts,
        })
        setActiveNotebook(prev => prev && prev.id === activeNotebook.id
          ? { ...prev, artifacts: updatedArtifacts }
          : prev)
      }

      const onProgress: VideoGenerationProgressCallback = (step, total, phase, agent) => {
        setVideoGenProgress({ step, total, phase, agent })
      }

      const result = await runVideoGenerationPipeline({
        apiKey,
        scriptContent,
        topic: activeNotebook.topic,
        sourceId: activeNotebook.id,
      }, onProgress)

      // Save video generation executions as cost records
      const costKey: UsageFunctionKey = 'video_pipeline'
      const newExecutions = result.executions.map(ex =>
        createUsageExecutionRecord({
          source_type: costKey,
          source_id: activeNotebook.id ?? '',
          phase: ex.phase,
          agent_name: ex.agent_name,
          model: ex.model,
          tokens_in: ex.tokens_in,
          tokens_out: ex.tokens_out,
          cost_usd: ex.cost_usd,
          duration_ms: ex.duration_ms,
        })
      )
      const freshNotebookForExec = await getFreshNotebookOrThrow(activeNotebook.id)
      const updatedExecutions = [...(freshNotebookForExec.llm_executions || []), ...newExecutions]
      await updateResearchNotebook(userId, activeNotebook.id!, {
        llm_executions: updatedExecutions,
      })
      setActiveNotebook(prev => prev && prev.id === activeNotebook.id
        ? { ...prev, llm_executions: updatedExecutions }
        : prev)

      // Show the video studio editor
      if (!result.package || !result.package.scenes || result.package.scenes.length === 0) {
        toast.warning('Produção incompleta', 'O pipeline não gerou cenas válidas. Tente novamente com outro modelo.')
        resolveTask(null)
      } else {
        setVideoProduction(result.package)
        setVideoStudioAutoGenerate(ENABLE_LITERAL_MEDIA_AUTOGENERATION)
        setShowVideoGenCost(false)
        setVideoGenSavedArtifact(null)
        toast.success(
          ENABLE_LITERAL_MEDIA_AUTOGENERATION
            ? 'Fase 1 concluída. O estúdio abrirá e iniciará automaticamente a Fase 2 (geração literal de mídia).'
            : 'Fase 1 concluída. O estúdio abrirá para você iniciar manualmente a Fase 2 (geração literal de mídia).',
        )
        resolveTask(result.package)
      }
    } catch (err) {
      console.error('Video generation error:', err)
      rejectTask(err)
      const errMsg = err instanceof Error ? err.message : String(err)
      if (errMsg.includes('429')) {
        toast.warning(
          'Limite de requisições atingido',
          'O modelo está sobrecarregado. Aguarde alguns minutos e tente novamente.',
        )
      } else if (errMsg.includes('401') || errMsg.toLowerCase().includes('auth')) {
        toast.error('Chave de API inválida', 'Verifique sua chave de API nas configurações.')
      } else if (errMsg.includes('timeout') || errMsg.includes('TIMEOUT')) {
        toast.error('Tempo esgotado', 'O modelo demorou muito para responder. Tente um modelo mais rápido.')
      } else if (errMsg.includes('model') || errMsg.includes('Model')) {
        toast.error('Modelo indisponível', 'O modelo configurado não está disponível. Altere nas configurações do pipeline.')
      } else {
        toast.error('Erro ao gerar vídeo', 'Verifique sua conexão, chave de API e configuração dos modelos.')
      }
    } finally {
      setVideoGenLoading(false)
      setVideoGenProgress(null)
    }
  }

  // ── Generate literal audio from saved audio script ─────────────────
  const handleGenerateAudioFromArtifact = async (artifact: StudioArtifact) => {
    if (!userId || !activeNotebook?.id || audioGenLoading) return

    const uid = userId
    const notebookId = activeNotebook.id
    setAudioGenLoading(true)
    setAudioGeneratingArtifactId(artifact.id)

    try {
      const apiKey = await getOpenRouterKey()
      if (!apiKey) {
        toast.error('Chave da API não configurada. Acesse Administração > Chaves de API.')
        return
      }

      const synthesis = await synthesizeAudioFromScript({
        apiKey,
        rawScriptContent: artifact.content,
      })

      const storedAudio = await uploadNotebookMediaArtifact(
        uid,
        notebookId,
        `${artifact.title}-audio-literal`,
        synthesis.audioBlob,
        'audios',
        getExtensionFromMimeType(synthesis.mimeType, '.mp3'),
      )

      const updatedArtifacts: StudioArtifact[] = activeNotebook.artifacts.map((current): StudioArtifact => {
        if (current.id !== artifact.id) return current

        try {
          const parsed = JSON.parse(current.content) as Record<string, unknown>
          return {
            ...current,
            format: 'json' as const,
            content: JSON.stringify({
              ...parsed,
              audioUrl: storedAudio.url,
              audioStoragePath: storedAudio.path,
              audioMimeType: synthesis.mimeType,
            }, null, 2),
          }
        } catch {
          const separator = current.content.trim().endsWith('\n') ? '' : '\n'
          return {
            ...current,
            content: `${current.content}${separator}\n\n## Audio Literal\n\nArquivo: ${storedAudio.url}`,
          }
        }
      })

      await updateResearchNotebook(uid, notebookId, { artifacts: updatedArtifacts })

      setActiveNotebook({
        ...activeNotebook,
        artifacts: updatedArtifacts,
      })

      if (viewingArtifact?.id === artifact.id) {
        const refreshed = updatedArtifacts.find(a => a.id === artifact.id)
        if (refreshed) setViewingArtifact(refreshed)
      }

      toast.success('Áudio literal gerado com sucesso!', `${synthesis.chunkCount} parte(s) sintetizada(s)`)    
    } catch (err) {
      console.error('Audio literal generation error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('429')) {
        toast.warning('Limite de TTS atingido', 'Aguarde alguns segundos e tente novamente.')
      } else {
        toast.error('Falha na geração literal de áudio', msg)
      }
    } finally {
      setAudioGenLoading(false)
      setAudioGeneratingArtifactId(null)
    }
  }

  // ── Save video studio production as notebook artifact ──────────────
  const handleSaveVideoStudioToNotebook = async (production: VideoProductionPackage) => {
    if (!userId || !activeNotebook?.id) return
    const uid = userId
    const notebookId = activeNotebook.id
    try {
      const uploadWithRetry = async <T,>(
        label: string,
        task: () => Promise<T>,
      ): Promise<T> => {
        let lastError: unknown
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            return await task()
          } catch (error) {
            lastError = error
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 800 * attempt))
              continue
            }
          }
        }
        throw new Error(`${label} falhou após múltiplas tentativas: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
      }

      let productionToSave = production
      const renderedVideoUrl = production.renderedVideo?.url || ''

      if (renderedVideoUrl && (renderedVideoUrl.startsWith('blob:') || renderedVideoUrl.startsWith('data:'))) {
        const videoBlob = await fetch(renderedVideoUrl).then(resp => resp.blob())
        const storedVideo = await uploadWithRetry(
          'Upload do vídeo final',
          () => uploadNotebookVideoArtifact(
            uid,
            notebookId,
            production.title,
            videoBlob,
          ),
        )
        productionToSave = {
          ...production,
          renderedVideo: {
            ...production.renderedVideo!,
            url: storedVideo.url,
            storagePath: storedVideo.path,
          },
        }
      }

      if (productionToSave.renderedScopes?.length) {
        const uploadedScopes = await Promise.all(productionToSave.renderedScopes.map(async renderedScope => {
          if (!renderedScope.url || (!renderedScope.url.startsWith('blob:') && !renderedScope.url.startsWith('data:'))) {
            return renderedScope
          }
          const scopedBlob = await fetch(renderedScope.url).then(resp => resp.blob())
          const stored = await uploadWithRetry(
            `Upload render de escopo ${renderedScope.scopeKey}`,
            () => uploadNotebookMediaArtifact(
              uid,
              notebookId,
              `${production.title}-${renderedScope.scopeKey}`,
              scopedBlob,
              'videos',
              getExtensionFromMimeType(renderedScope.mimeType || scopedBlob.type, '.webm'),
            ),
          )
          return {
            ...renderedScope,
            url: stored.url,
            storagePath: stored.path,
          }
        }))
        productionToSave = {
          ...productionToSave,
          renderedScopes: uploadedScopes,
        }
      }

      const uploadedSceneAssets = await Promise.all((productionToSave.sceneAssets || []).map(async sceneAsset => {
        let imageUrl = sceneAsset.imageUrl
        let imageStoragePath = sceneAsset.imageStoragePath
        let narrationUrl = sceneAsset.narrationUrl
        let narrationStoragePath = sceneAsset.narrationStoragePath
        let videoClips = sceneAsset.videoClips

        if (imageUrl && (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:'))) {
          const imageBlob = await fetch(imageUrl).then(resp => resp.blob())
          const stored = await uploadWithRetry(
            `Upload imagem cena ${sceneAsset.sceneNumber}`,
            () => uploadNotebookMediaArtifact(
              uid,
              notebookId,
              `${production.title}-scene-${sceneAsset.sceneNumber}-image`,
              imageBlob,
              'images',
              getExtensionFromMimeType(imageBlob.type, '.png'),
            ),
          )
          imageUrl = stored.url
          imageStoragePath = stored.path
        }

        if (narrationUrl && (narrationUrl.startsWith('blob:') || narrationUrl.startsWith('data:'))) {
          const narrationBlob = await fetch(narrationUrl).then(resp => resp.blob())
          const stored = await uploadWithRetry(
            `Upload narração cena ${sceneAsset.sceneNumber}`,
            () => uploadNotebookMediaArtifact(
              uid,
              notebookId,
              `${production.title}-scene-${sceneAsset.sceneNumber}-narration`,
              narrationBlob,
              'audios',
              getExtensionFromMimeType(narrationBlob.type, '.wav'),
            ),
          )
          narrationUrl = stored.url
          narrationStoragePath = stored.path
        }

        if (videoClips?.length) {
          videoClips = await Promise.all(videoClips.map(async clip => {
            if (!clip.url || (!clip.url.startsWith('blob:') && !clip.url.startsWith('data:'))) return clip
            const clipBlob = await fetch(clip.url).then(resp => resp.blob())
            const stored = await uploadWithRetry(
              `Upload clip cena ${clip.sceneNumber} parte ${clip.partNumber}`,
              () => uploadNotebookMediaArtifact(
                uid,
                notebookId,
                `${production.title}-scene-${clip.sceneNumber}-part-${clip.partNumber}`,
                clipBlob,
                'videos',
                getExtensionFromMimeType(clip.mimeType || clipBlob.type, '.webm'),
              ),
            )
            return {
              ...clip,
              url: stored.url,
              storagePath: stored.path,
            }
          }))
        }

        return {
          ...sceneAsset,
          imageUrl,
          imageStoragePath,
          narrationUrl,
          narrationStoragePath,
          videoClips,
        }
      }))

      let soundtrackAsset = productionToSave.soundtrackAsset
      if (soundtrackAsset?.url && (soundtrackAsset.url.startsWith('blob:') || soundtrackAsset.url.startsWith('data:'))) {
        const soundtrackBlob = await fetch(soundtrackAsset.url).then(resp => resp.blob())
        const stored = await uploadWithRetry(
          'Upload trilha sonora',
          () => uploadNotebookMediaArtifact(
            userId,
            notebookId,
            `${production.title}-soundtrack`,
            soundtrackBlob,
            'audios',
            getExtensionFromMimeType(soundtrackAsset?.mimeType || soundtrackBlob.type, '.wav'),
          ),
        )
        soundtrackAsset = {
          ...soundtrackAsset,
          url: stored.url,
          storagePath: stored.path,
        }
      }

      productionToSave = {
        ...productionToSave,
        sceneAssets: uploadedSceneAssets,
        soundtrackAsset,
      }

      const artifactTitle = `Estúdio de Vídeo: ${production.title}`
      const content = JSON.stringify(productionToSave)
      
      // Check if a video studio artifact with same title already exists — update instead of duplicate
      const existingIdx = activeNotebook.artifacts.findIndex(
        a => a.type === 'video_script' && a.format === 'json' && a.title === artifactTitle
      )
      
      let updatedArtifacts: StudioArtifact[]
      if (existingIdx >= 0) {
        // Update existing artifact
        updatedArtifacts = [...activeNotebook.artifacts]
        updatedArtifacts[existingIdx] = {
          ...updatedArtifacts[existingIdx],
          content,
          created_at: new Date().toISOString(),
        }
      } else {
        // Create new artifact
        const artifact: StudioArtifact = {
          id: `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'video_script',
          title: artifactTitle,
          content,
          format: 'json',
          created_at: new Date().toISOString(),
        }
        updatedArtifacts = [...activeNotebook.artifacts, artifact]
      }

      await updateResearchNotebook(userId, activeNotebook.id, {
        artifacts: updatedArtifacts,
      })
      setActiveNotebook(prev => prev && prev.id === activeNotebook.id ? { ...prev, artifacts: updatedArtifacts } : prev)
      toast.success(existingIdx >= 0 ? 'Estúdio de vídeo atualizado!' : 'Estúdio de vídeo salvo nos artefatos do caderno!')
      setVideoProduction(productionToSave)
    } catch (err) {
      console.error('Error saving video studio artifact:', err)
      toast.error('Erro ao salvar estúdio nos artefatos.')
    }
  }

  // ── Delete artifact ─────────────────────────────────────────────────
  const handleDeleteArtifact = async (artifactId: string) => {
    if (!activeNotebook) return
    const artifact = activeNotebook.artifacts.find(a => a.id === artifactId)
    if (!artifact) return
    setPendingArtifactDelete({ id: artifactId, title: artifact.title })
  }

  const confirmDeleteArtifact = async () => {
    if (!userId || !activeNotebook?.id || !pendingArtifactDelete?.id) return
    const notebookId = activeNotebook.id
    try {
      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const updated = freshNotebook.artifacts.filter(a => a.id !== pendingArtifactDelete.id)
      await updateResearchNotebook(userId, notebookId, { artifacts: updated })
      setActiveNotebook(prev => prev && prev.id === notebookId ? { ...prev, artifacts: updated } : prev)
      toast.success('Artefato removido')
    } catch (err) {
      console.error('Error deleting artifact:', err)
      toast.error('Erro ao remover artefato')
    } finally {
      setPendingArtifactDelete(null)
    }
  }

  // ── Clear chat history ──────────────────────────────────────────────
  const handleClearChat = async () => {
    if (!userId || !activeNotebook?.id) return
    setShowClearChatConfirm(true)
  }

  const confirmClearChat = async () => {
    if (!userId || !activeNotebook?.id) return
    const notebookId = activeNotebook.id
    setClearingChat(true)
    setShowClearChatConfirm(false)
    try {
      await updateResearchNotebook(userId, notebookId, { messages: [] })
      setActiveNotebook(prev => prev && prev.id === notebookId ? { ...prev, messages: [] } : prev)
      toast.success('Histórico de conversa limpo')
    } catch (err) {
      console.error('Error clearing chat:', err)
      toast.error('Erro ao limpar histórico')
    } finally {
      setClearingChat(false)
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

  const acervoTrailSteps = useMemo(() => {
    const currentIndex = ACERVO_TRAIL_STEPS.findIndex(step => step.key === acervoAnalysisPhase)
    const isConcluded = acervoAnalysisPhase === 'concluido'
    const errorIndex = currentIndex >= 0 ? currentIndex : 0

    return ACERVO_TRAIL_STEPS.map((step, index) => {
      let status: 'pending' | 'active' | 'completed' | 'error' = 'pending'

      if (isConcluded) {
        status = 'completed'
      } else if (index < currentIndex) {
        status = 'completed'
      } else if (acervoAnalysisLoading && index === currentIndex) {
        status = 'active'
      }

      if (acervoAnalysisError && index === errorIndex) {
        status = 'error'
      }

      return {
        key: step.key,
        label: step.label,
        status,
        detail: status === 'active' ? acervoAnalysisMessage : undefined,
      }
    })
  }, [acervoAnalysisError, acervoAnalysisLoading, acervoAnalysisMessage, acervoAnalysisPhase])

  const studioTrailSteps = useMemo(() => {
    const specialistLabel = selectedArtifactType ? STUDIO_SPECIALIST_LABEL[selectedArtifactType] : 'Especialista'
    const steps = [
      { key: 'studio_pesquisador', label: 'Pesquisador do Estúdio' },
      { key: 'studio_specialist', label: specialistLabel },
      { key: 'studio_revisor', label: 'Revisor de Qualidade' },
    ]
    const progress = studioProgress ?? studioLastProgress
    const progressStep = progress?.step ?? 0
    const errorIndex = progressStep > 0 ? Math.min(progressStep, steps.length) - 1 : 0

    return steps.map((step, index) => {
      let status: 'pending' | 'active' | 'completed' | 'error' = 'pending'
      const oneBased = index + 1

      if (progressStep >= steps.length && !studioLoading && !studioErrorMessage) {
        status = 'completed'
      } else if (oneBased < progressStep) {
        status = 'completed'
      } else if (studioLoading && oneBased === progressStep) {
        status = 'active'
      }

      if (studioErrorMessage && index === errorIndex) {
        status = 'error'
      }

      return {
        key: step.key,
        label: step.label,
        status,
        detail: status === 'active' ? (progress?.phase || undefined) : undefined,
      }
    })
  }, [selectedArtifactType, studioErrorMessage, studioLastProgress, studioLoading, studioProgress])

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
          <DraggablePanel
            open={showCreate}
            onClose={() => { setShowCreate(false); setSuggestedAcervoDocs([]); setSelectedAcervoIds(new Set()) }}
            title="Novo Caderno de Pesquisa"
            icon={<BookOpen size={16} />}
            initialWidth={500}
            initialHeight={550}
            minWidth={380}
            minHeight={300}
          >
              <div className="p-6 space-y-4">
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

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
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
          </DraggablePanel>
        )}

        <ConfirmDialog
          open={Boolean(pendingNotebookDelete)}
          title="Excluir caderno"
          description={pendingNotebookDelete ? `O caderno "${pendingNotebookDelete.title}" será removido permanentemente.` : ''}
          confirmText="Excluir permanentemente"
          cancelText="Cancelar"
          danger
          onCancel={() => setPendingNotebookDelete(null)}
          onConfirm={confirmDeleteNotebook}
        />
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
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {([
            { key: 'overview' as DetailTab, icon: BookMarked, label: 'Visão Geral' },
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
        <DraggablePanel
          open={showEditInfo}
          onClose={() => setShowEditInfo(false)}
          title="Editar Caderno"
          icon={<Edit3 size={16} />}
          initialWidth={500}
          initialHeight={420}
          minWidth={380}
          minHeight={280}
        >
            <div className="p-6 space-y-4">
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
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
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
        </DraggablePanel>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {/* ── Overview Tab ─────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="h-full overflow-y-auto p-4">
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Header */}
              <div className="text-center py-4">
                <BookMarked className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-gray-900">{activeNotebook.topic}</h3>
                {activeNotebook.description && (
                  <p className="text-sm text-gray-500 mt-2 max-w-lg mx-auto">{activeNotebook.description}</p>
                )}
              </div>

              {/* Notebook Info */}
              <div className="bg-white rounded-xl border p-5 space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Info className="w-4 h-4 text-brand-600" />
                  Informações do Caderno
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Título</p>
                    <p className="text-sm text-gray-800 mt-0.5">{activeNotebook.title}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Criado em</p>
                    <p className="text-sm text-gray-800 mt-0.5">{formatDate(activeNotebook.created_at)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Status</p>
                    <p className="text-sm text-gray-800 mt-0.5">{activeNotebook.status === 'active' ? '🟢 Ativo' : '📦 Arquivado'}</p>
                  </div>
                  {activeNotebook.updated_at && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Última atualização</p>
                      <p className="text-sm text-gray-800 mt-0.5">{formatDate(activeNotebook.updated_at)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Sources Summary */}
              <div className="bg-white rounded-xl border p-5 space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-brand-600" />
                  Fontes ({activeNotebook.sources.length})
                </h4>
                {activeNotebook.sources.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">
                    Nenhuma fonte adicionada ainda. Vá na aba &quot;Fontes&quot; para adicionar.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeNotebook.sources.map(source => {
                      const typeInfo = SOURCE_TYPE_LABELS[source.type] || SOURCE_TYPE_LABELS.upload
                      const TypeIcon = typeInfo.icon
                      return (
                        <div key={source.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                          <TypeIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 truncate">{source.name}</p>
                            <p className="text-[11px] text-gray-400">
                              {typeInfo.label}
                              {source.added_at && ` · ${formatDate(source.added_at)}`}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Activity Summary */}
              <div className="bg-white rounded-xl border p-5 space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-600" />
                  Atividade
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-brand-600">{activeNotebook.messages.length}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Mensagens no Chat</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-brand-600">{activeNotebook.sources.length}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Fontes Adicionadas</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-brand-600">{activeNotebook.artifacts.length}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Artefatos Gerados</p>
                  </div>
                </div>
              </div>

              {/* Audio Overview */}
              {activeNotebook.sources.length > 0 && (
                <div className="bg-gradient-to-r from-brand-600 to-purple-600 rounded-xl p-5 text-white">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-white/20 rounded-xl">
                      <Mic className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold">Audio Overview</h4>
                      <p className="text-xs opacity-80 mt-1">
                        Gere um podcast com dois hosts discutindo suas fontes — como o NotebookLM.
                      </p>
                      <button
                        onClick={() => handleGenerateArtifact('audio_script' as StudioArtifactType)}
                        disabled={studioLoading}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-white text-brand-700 rounded-lg text-xs font-bold hover:bg-white/90 transition-colors disabled:opacity-60"
                      >
                        {studioLoading && selectedArtifactType === 'audio_script' ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando...</>
                        ) : (
                          <><Mic className="w-3.5 h-3.5" /> Gerar Audio Overview</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="bg-white rounded-xl border p-5 space-y-4">
                <h4 className="text-sm font-semibold text-gray-900">Ações Rápidas</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setActiveTab('chat')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> Ir para Chat
                  </button>
                  <button
                    onClick={() => { setActiveTab('sources'); if (acervoDocs.length === 0) loadAcervoDocs() }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Database className="w-3.5 h-3.5" /> Adicionar Fontes
                  </button>
                  <button
                    onClick={() => setActiveTab('studio')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Ir para Estúdio
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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

              {/* Source file upload */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Upload de fontes ({SUPPORTED_TEXT_FILE_EXTENSIONS.join(', ')})</p>
                </div>
                <input
                  ref={sourceUploadInputRef}
                  type="file"
                  multiple
                  accept={SUPPORTED_TEXT_FILE_EXTENSIONS.join(',')}
                  onChange={e => handleUploadSourceFiles(e.target.files)}
                  className="w-full text-xs text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                />
                {sourceUploadLoading && (
                  <p className="text-[11px] text-brand-600 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Processando arquivos e indexando como fontes...
                  </p>
                )}
              </div>

              {/* External research */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Pesquisadores de fonte</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Tema para pesquisa externa / profunda / jurisprudência..."
                    value={externalSearchQuery}
                    onChange={e => setExternalSearchQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && externalSearchQuery.trim() && !isAnyResearchLoading) {
                        handleAddExternalSearchSource()
                      }
                    }}
                    disabled={isAnyResearchLoading}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none disabled:opacity-50 disabled:bg-gray-50"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleAddExternalSearchSource}
                    disabled={!externalSearchQuery.trim() || isAnyResearchLoading}
                    title="Busca rápida na web com síntese via IA"
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium transition-colors inline-flex items-center gap-1.5"
                  >
                    {externalResearchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                    Pesquisa Externa
                  </button>
                  <button
                    onClick={handleAddDeepExternalSearchSource}
                    disabled={!externalSearchQuery.trim() || isAnyResearchLoading}
                    title="Busca profunda: extrai conteúdo completo das páginas encontradas"
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium transition-colors inline-flex items-center gap-1.5"
                  >
                    {externalDeepLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                    Pesquisa Profunda
                  </button>
                  <button
                    onClick={handleAddJurisprudenceSource}
                    disabled={!externalSearchQuery.trim() || isAnyResearchLoading}
                    title="Pesquisa jurisprudência em 21 tribunais brasileiros via DataJud (CNJ)"
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium transition-colors inline-flex items-center gap-1.5"
                  >
                    {jurisprudenceLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Library className="w-3.5 h-3.5" />}
                    Jurisprudência (DataJud)
                  </button>
                </div>
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
                    <div key={source.id} className="bg-white rounded-lg border overflow-hidden">
                      <div className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
                        <TypeIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{source.name}</p>
                          <p className="text-[11px] text-gray-400">
                            {typeInfo.label} · {(source.text_content?.length ?? 0) >= MIN_SOURCE_CHARS
                              ? <span className="text-green-600">✓ {Math.round((source.text_content?.length ?? 0) / 1000)}K chars</span>
                              : source.status === 'indexed'
                                ? <span className="text-amber-600 inline-flex items-center gap-0.5"><AlertCircle className="w-3 h-3" />Pouco conteúdo</span>
                                : source.status === 'error'
                                  ? <span className="text-red-500">Erro</span>
                                  : <span className="text-gray-400">Pendente</span>}
                            {source.added_at && ` · ${formatDate(source.added_at)}`}
                          </p>
                        </div>
                        {source.text_content && (source.text_content.length ?? 0) >= MIN_SOURCE_CHARS && (
                          <button
                            onClick={() => setViewerSource(source)}
                            className="p-1 rounded hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors"
                            title="Visualizar conteúdo"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveSource(source.id)}
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
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

            {/* Pipeline progress indicator */}
            <div className="space-y-5">
              {ARTIFACT_CATEGORIES.map(category => {
                const colorMap: Record<string, { border: string; bg: string; text: string; hoverBorder: string }> = {
                  blue:    { border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700', hoverBorder: 'hover:border-blue-400' },
                  emerald: { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', hoverBorder: 'hover:border-emerald-400' },
                  purple:  { border: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-700', hoverBorder: 'hover:border-purple-400' },
                  amber:   { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', hoverBorder: 'hover:border-amber-400' },
                }
                const colors = colorMap[category.color] || colorMap.blue
                return (
                  <div key={category.label}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{category.emoji}</span>
                      <h4 className={`text-xs font-bold uppercase tracking-wider ${colors.text}`}>{category.label}</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {category.items.map(art => {
                        const ArtIcon = art.icon
                        const isGenerating = studioLoading && selectedArtifactType === art.type
                        return (
                          <button
                            key={art.type}
                            onClick={() => handleGenerateArtifact(art.type)}
                            disabled={studioLoading}
                            className={`flex items-start gap-3 p-3 rounded-xl border ${colors.border} ${colors.hoverBorder} hover:shadow-sm transition-all text-left group ${
                              studioLoading ? 'opacity-60 cursor-not-allowed' : ''
                            }`}
                          >
                            <div className={`p-2 rounded-lg ${colors.bg} group-hover:scale-105 transition-transform`}>
                              {isGenerating ? (
                                <Loader2 className={`w-4 h-4 animate-spin ${colors.text}`} />
                              ) : (
                                <ArtIcon className={`w-4 h-4 ${colors.text}`} />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-semibold text-gray-900 block">{art.label}</span>
                              <span className="text-[11px] text-gray-500 block mt-0.5 leading-snug">{art.description}</span>
                              {isGenerating && studioProgress && (
                                <span className="text-[10px] text-purple-600 font-medium block mt-1">{studioProgress.phase}</span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
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
                <button
                  key={artifact.id}
                  type="button"
                  onClick={() => setViewingArtifact(artifact)}
                  className="w-full flex items-center justify-between p-4 bg-white rounded-xl border hover:border-brand-300 hover:shadow-sm transition-all text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-brand-50 rounded-lg group-hover:bg-brand-100 transition-colors">
                      <ArtIcon className="w-5 h-5 text-brand-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{artifact.title}</p>
                      <p className="text-[11px] text-gray-400">{artDef?.label || artifact.type} · {formatDate(artifact.created_at)}</p>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-300 group-hover:text-brand-500 -rotate-90 transition-colors" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Artifact Viewer Modal ─────────────────────────────── */}
      {viewingArtifact && (() => {
        // Detect if this video_script artifact contains a full VideoProductionPackage (JSON with scenes/tracks)
        const isVideoStudio = viewingArtifact.type === 'video_script' && viewingArtifact.format === 'json' && (() => {
          try {
            const parsed = JSON.parse(viewingArtifact.content)
            return Array.isArray(parsed?.scenes) && Array.isArray(parsed?.tracks)
          } catch { return false }
        })()
        return (
          <ArtifactViewerModal
            artifact={viewingArtifact}
            onClose={() => setViewingArtifact(null)}
            onDelete={() => {
              handleDeleteArtifact(viewingArtifact.id)
              setViewingArtifact(null)
            }}
            onDownload={() => handleDownloadArtifact(viewingArtifact)}
            onGenerateVideo={viewingArtifact.type === 'video_script' && !isVideoStudio ? () => {
              setVideoGenSavedArtifact(viewingArtifact)
              setShowVideoGenCost(true)
              setViewingArtifact(null)
            } : undefined}
            onGenerateAudio={viewingArtifact.type === 'audio_script' ? () => {
              handleGenerateAudioFromArtifact(viewingArtifact)
            } : undefined}
            onOpenStudio={isVideoStudio ? () => {
              try {
                const pkg = JSON.parse(viewingArtifact.content)
                setVideoProduction(pkg)
                const shouldAutoResume = ENABLE_LITERAL_MEDIA_AUTOGENERATION && (
                  pkg?.literalGenerationState?.status === 'running' ||
                  pkg?.literalGenerationState?.status === 'failed'
                )
                setVideoStudioAutoGenerate(Boolean(shouldAutoResume))
                setViewingArtifact(null)
              } catch {
                toast.error('Erro ao abrir estúdio', 'O artefato de vídeo contém dados corrompidos.')
              }
            } : undefined}
          />
        )
      })()}

      {/* ── Script Review/Edit Modal (for media artifacts) ──── */}
      {pendingArtifact && (
        <DraggablePanel
          title={`Revisar ${ARTIFACT_TYPES.find(a => a.type === pendingArtifact.artifact.type)?.label || 'Artefato'}`}
          open={true}
          onClose={handleDiscardPendingArtifact}
          initialWidth={700}
          initialHeight={520}
        >
          <div className="flex flex-col h-full gap-3 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Revise e edite o conteúdo gerado antes de salvar no caderno.
            </p>
            <textarea
              className="flex-1 w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={pendingContent}
              onChange={e => setPendingContent(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={handleDiscardPendingArtifact}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Descartar
              </button>
              <button
                onClick={handleConfirmPendingArtifact}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Salvar Artefato
              </button>
            </div>
          </div>
        </DraggablePanel>
      )}

      {/* ── Video Generation Cost Modal ──────────────── */}
      {showVideoGenCost && videoGenSavedArtifact && (
        <VideoGenerationCostModal
          scriptContent={videoGenSavedArtifact.content}
          topic={activeNotebook?.topic || ''}
          onGenerate={handleGenerateVideo}
          onSkip={handleSkipVideoGeneration}
          isGenerating={videoGenLoading}
          generationProgress={videoGenProgress || undefined}
        />
      )}

      {/* ── Video Studio Editor ──────────────────────── */}
      {videoProduction && (
        <VideoStudioEditor
          production={videoProduction}
          apiKey={videoStudioApiKey}
          onClose={() => setVideoProduction(null)}
          onSaveToNotebook={handleSaveVideoStudioToNotebook}
          autoGenerateMedia={videoStudioAutoGenerate}
        />
      )}

      {/* ── Deep Research Modal ────────────────────────── */}
      <AgentTrailProgressModal
        isOpen={showAcervoProgressModal}
        title="Trilha de Análise Inteligente do Acervo"
        subtitle={activeNotebook?.topic}
        currentMessage={acervoAnalysisError || acervoAnalysisMessage || 'Preparando análise do acervo...'}
        percent={acervoAnalysisPercent}
        steps={acervoTrailSteps}
        isComplete={acervoAnalysisPhase === 'concluido' && !acervoAnalysisError}
        hasError={Boolean(acervoAnalysisError)}
        canClose
        onClose={() => {
          if (acervoAnalysisLoading) {
            acervoAbortRef.current?.abort()
          }
          setShowAcervoProgressModal(false)
        }}
      />

      <AgentTrailProgressModal
        isOpen={showStudioProgressModal}
        title="Trilha Multiagente do Estúdio"
        subtitle={selectedArtifactType ? (ARTIFACT_TYPES.find(a => a.type === selectedArtifactType)?.label || selectedArtifactType) : undefined}
        currentMessage={studioErrorMessage || studioProgress?.phase || studioLastProgress?.phase || 'Inicializando pipeline do estúdio...'}
        percent={studioProgress
          ? Math.round((studioProgress.step / Math.max(studioProgress.total, 1)) * 100)
          : studioLastProgress
            ? Math.round((studioLastProgress.step / Math.max(studioLastProgress.total, 1)) * 100)
            : 0}
        steps={studioTrailSteps}
        isComplete={!studioLoading && !studioErrorMessage && (studioLastProgress?.step ?? 0) >= 3}
        hasError={Boolean(studioErrorMessage)}
        canClose
        onClose={() => {
          if (studioLoading) {
            studioAbortRef.current?.abort()
          }
          setShowStudioProgressModal(false)
        }}
      />

      <DeepResearchModal
        isOpen={researchModalOpen}
        onClose={() => {
          researchAbortRef.current?.abort()
          setResearchModalOpen(false)
        }}
        title={researchModalTitle}
        subtitle={researchModalSubtitle}
        variant={researchModalVariant}
        steps={researchModalSteps}
        stats={researchModalStats}
        canClose={researchModalCanClose}
      />

      <JurisprudenceConfigModal
        isOpen={jurisprudenceConfigOpen}
        query={externalSearchQuery.trim()}
        onSearch={handleJurisprudenceSearch}
        onClose={() => setJurisprudenceConfigOpen(false)}
      />

      <SearchResultsModal
        isOpen={searchResultsModalOpen}
        items={searchResultsItems}
        variant={searchResultsVariant}
        onConfirm={(selected) => {
          if (searchResultsCallback) {
            searchResultsCallback(selected).catch(err => {
              console.error('SearchResultsModal callback error:', err)
            })
          }
        }}
        onClose={() => {
          setSearchResultsModalOpen(false)
        }}
      />

      <ConfirmDialog
        open={showClearChatConfirm}
        title="Limpar histórico de conversa"
        description="Todas as mensagens do chat serão removidas. As fontes e artefatos serão mantidos."
        confirmText="Limpar histórico"
        cancelText="Cancelar"
        danger
        loading={clearingChat}
        onCancel={() => setShowClearChatConfirm(false)}
        onConfirm={confirmClearChat}
      />

      <ConfirmDialog
        open={Boolean(pendingArtifactDelete)}
        title="Excluir artefato"
        description={pendingArtifactDelete ? `O artefato "${pendingArtifactDelete.title}" será removido permanentemente.` : ''}
        confirmText="Excluir artefato"
        cancelText="Cancelar"
        danger
        onCancel={() => setPendingArtifactDelete(null)}
        onConfirm={confirmDeleteArtifact}
      />

      {/* ── Source content viewer (floating, draggable panel) ───────────── */}
      <SourceContentViewer
        source={viewerSource}
        onClose={() => setViewerSource(null)}
      />
    </div>
  )
}

// ── Script Review Modal (review/edit before saving media artifacts) ───────────

const REVIEW_TYPE_LABELS: Record<string, { label: string; icon: React.ElementType; color: string; hint: string }> = {
  video_script:  { label: 'Planejamento de Vídeo (Fase 1)', icon: Video, color: 'text-rose-600', hint: 'Revise o planejamento textual (roteiro, cenas, narrações e visuais). A geração literal de arquivos reais acontece no Estúdio (Fase 2).' },
  audio_script:  { label: 'Roteiro de Áudio', icon: Mic, color: 'text-violet-600', hint: 'Revise e edite os segmentos, falas e notas de produção antes de salvar.' },
  apresentacao:  { label: 'Apresentação', icon: Presentation, color: 'text-sky-600', hint: 'Revise e edite os slides, tópicos e notas do apresentador antes de salvar.' },
}

function ScriptReviewModal({
  artifact,
  content,
  onContentChange,
  onConfirm,
  onDiscard,
}: {
  artifact: StudioArtifact
  content: string
  onContentChange: (c: string) => void
  onConfirm: () => void
  onDiscard: () => void
}) {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const typeInfo = REVIEW_TYPE_LABELS[artifact.type] || { label: artifact.type, icon: FileText, color: 'text-gray-600', hint: 'Revise o conteúdo antes de salvar.' }
  const TypeIcon = typeInfo.icon

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDiscard()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onDiscard])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onDiscard} />

      {/* Modal */}
      <div className="relative w-[95vw] max-w-5xl h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-amber-100 rounded-lg">
              <TypeIcon className={`w-5 h-5 ${typeInfo.color}`} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">
                Revisão: {typeInfo.label}
              </h2>
              <p className="text-xs text-amber-700 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {typeInfo.hint}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Toggle preview/edit */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setMode('preview')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === 'preview' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Visualizar
              </button>
              <button
                onClick={() => setMode('edit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === 'edit' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                Editar
              </button>
            </div>
            <button onClick={onDiscard} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {mode === 'preview' ? (
            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap font-mono text-xs leading-relaxed bg-gray-50 rounded-xl p-6 border">
              {content}
            </div>
          ) : (
            <textarea
              value={content}
              onChange={e => onContentChange(e.target.value)}
              className="w-full h-full min-h-[60vh] p-6 bg-gray-50 rounded-xl border font-mono text-xs leading-relaxed text-gray-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
              placeholder="Edite o conteúdo do roteiro/proposta aqui..."
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50/80">
          <p className="text-xs text-gray-500">
            Você pode editar livremente o conteúdo antes de salvar. O artefato será salvo com suas alterações.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onDiscard}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Descartar
            </button>
            <button
              onClick={onConfirm}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 transition-colors shadow-sm"
            >
              <Save className="w-4 h-4" />
              Salvar Artefato
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Artifact Card (collapsible — legacy, kept for reference) ─────────────────

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
    onDelete()
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

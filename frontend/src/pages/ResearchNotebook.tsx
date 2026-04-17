/**
 * Research Notebook (Caderno de Pesquisa) — an intelligent research assistant
 * and annotation tool inspired by NotebookLM. Users can create topic-based
 * notebooks that index content from the acervo and uploaded sources, then
 * chat with an AI assistant and use the Studio to generate artifacts.
 *
 * Stored permanently per-user in Firestore under /users/{uid}/research_notebooks.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, Search, BookOpen, MessageCircle, Sparkles, FileText, Trash2,
  ArrowLeft, Send, Database, Clock, Upload,
  MoreVertical, Loader2,
  PenTool, Map, CreditCard, BarChart3, Table, FileQuestion,
  Presentation, Mic, Video, X, CheckCircle2, Brain, Link2,
  Copy, Check as CheckIcon, Download, RotateCcw, Edit3, Info,
  Globe, BookMarked, AlertCircle, ChevronUp, ChevronDown,
  Library, ScanSearch, Save, Eye, Film, Scale, ThumbsUp, ThumbsDown,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTaskManager, type TaskOperationalSummary } from '../contexts/TaskManagerContext'
import { useToast } from '../components/Toast'
import { IS_FIREBASE } from '../lib/firebase'
import {
  listResearchNotebooks,
  createResearchNotebook,
  updateResearchNotebook,
  deleteResearchNotebook,
  getResearchNotebook,
  getUserSettings,
  listAcervoDocuments,
  saveUserSettings,
  saveNotebookDocumentToDocuments,
  type ResearchNotebookData,
  type NotebookSource,
  type NotebookMessage,
  type NotebookResearchAuditEntry,
  type NotebookSavedSearchEntry,
  type StudioArtifact,
  type StudioArtifactType,
  type AcervoDocumentData,
} from '../lib/firestore-service'
import { callLLM, callLLMWithFallback, callLLMWithMessages, ModelUnavailableError, type LLMResult } from '../lib/llm-client'
import { getOpenRouterKey } from '../lib/generation-service'
import { loadResearchNotebookModels } from '../lib/model-config'
import {
  createUsageExecutionRecord,
  type UsageFunctionKey,
} from '../lib/cost-analytics'
import { analyzeNotebookAcervo, type AnalyzedDocument, type AcervoAnalysisProgress } from '../lib/notebook-acervo-analyzer'
import {
  generateStructuredVisualArtifactMedia,
  runStudioPipeline,
  type StudioProgressCallback,
} from '../lib/notebook-studio-pipeline'
import {
  runVideoGenerationPipeline,
  type VideoProductionPackage,
  type VideoGenerationProgressCallback,
  type RenderedVideoAsset,
  type VideoCheckpoint,
} from '../lib/video-generation-pipeline'
import { buildVideoPipelineProgress, type VideoPipelineProgressState } from '../lib/video-pipeline-progress'
import {
  buildChatContextAudit,
  buildResearchContextAudit,
  buildStudioContextAudit,
  type ChatContextAuditSummary,
  type ResearchContextAuditSummary,
} from '../lib/notebook-context-audit'
import {
  buildAcervoModalProgressState,
  buildAcervoProgressState,
  buildAcervoTrailSteps,
  buildNotebookOperationalSummaries,
  buildStudioModalProgressState,
  buildStudioTaskPhaseMessage,
  buildStudioTrailSteps,
  type NotebookOperationalAggregate,
} from '../lib/notebook-pipeline-progress'
import {
  type StoredNotebookMedia,
  uploadNotebookMediaArtifact,
  uploadNotebookVideoArtifact,
} from '../lib/notebook-media-storage'
import {
  generateLiteralVideoClipAsset,
  generateLiteralMediaAssets,
  renderLiteralVideo,
} from '../lib/literal-video-production'
import { generateAudioLiteralMedia, runAudioGenerationPipeline } from '../lib/audio-generation-pipeline'
import { isExternalVideoProviderConfigured, requestExternalVideoClip } from '../lib/external-video-provider'
import { generatePresentationMediaAssets, runPresentationGenerationPipeline } from '../lib/presentation-generation-pipeline'
import { extractFileText, isSupportedTextFile, SUPPORTED_TEXT_FILE_EXTENSIONS } from '../lib/file-text-extractor'
import { generateImageViaOpenRouter, blobToDataUrl } from '../lib/image-generation-client'
import { generateTTSViaOpenRouter } from '../lib/tts-client'
import { loadVideoPipelineModels } from '../lib/model-config'
import { AREA_LABELS, AREA_COLORS } from '../lib/constants'
import ArtifactViewerModal from '../components/artifacts/ArtifactViewerModal'
import { isStructuredArtifactType, parseArtifactContent } from '../lib/artifact-parsers'
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
  buildJurisprudenceAnalytics,
  DEFAULT_TRIBUNALS,
  TRIBUNAL_GROUPS,
  DATAJUD_GRAUS,
  ALL_TRIBUNALS,
  type TribunalInfo,
  type DataJudSearchProgress,
  type DataJudErrorType,
  type DataJudResult,
  type DataJudEndpointAttempt,
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

// ── Citation Suffix Builder ──────────────────────────────────────────────────

/**
 * Build a citation suffix for DataJud results that already have metadata.
 * JusBrasil results already have citation appended in the ementa itself.
 * DataJud results have orgaoJulgador, dataAjuizamento, etc. that we can use.
 * Returns empty string if the ementa already ends with a parenthetical citation.
 */
function buildCitationSuffix(r: DataJudResult): string {
  // If ementa already ends with citation (parenthetical), skip
  if (r.ementa?.trimEnd().endsWith(')')) return ''
  // Only add citation for DataJud-sourced results that have metadata
  if (r.textSource === 'web' && !r.orgaoJulgador) return ''

  const parts: string[] = []
  if (r.classe && r.numeroProcesso && !r.numeroProcesso.startsWith('JB-')) {
    const numero = r.numeroProcesso.includes('-')
      ? r.numeroProcesso
      : r.numeroProcesso.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6')
    parts.push(`${r.classe} n. ${numero}`)
  }
  if (r.orgaoJulgador) parts.push(r.orgaoJulgador)
  if (r.tribunalName) parts.push(r.tribunalName)
  if (r.dataAjuizamento) parts.push(`data: ${r.dataAjuizamento}`)

  if (parts.length === 0) return ''
  return `\n(${parts.join(', ')}.)`
}

// ── Jurisprudence Prompts ────────────────────────────────────────────────────

const VALID_STANCES = ['favoravel', 'desfavoravel', 'neutro'] as const
const MAX_PERSISTED_RESEARCH_AUDITS = 12
const MAX_PERSISTED_SAVED_SEARCHES = 12

const JURISPRUDENCE_RANKING_SYSTEM = [
  'Você é um especialista em relevância jurisprudencial.',
  'Avalie cada processo quanto à relevância para a consulta do usuário.',
  'Retorne APENAS um JSON com um array "ranking" onde cada item tem:',
  '"index" (número do processo na lista, começando em 1),',
  '"score" (0 a 100, sendo 100 = máxima relevância),',
  '"stance" (classificação da posição do resultado em relação à tese/consulta do usuário:',
  '"favoravel" se o julgado apoia a tese, "desfavoravel" se contraria, "neutro" se inconclusivo).',
  'Ordene do mais relevante para o menos relevante.',
  'Considere prioritariamente: (1) aderência jurídica da EMENTA e do INTEIRO TEOR à consulta,',
  '(2) coincidência concreta entre a matéria pesquisada e os fundamentos do julgado,',
  '(3) grau hierárquico do tribunal, sem permitir que isso supere a aderência temática,',
  '(4) recência como critério secundário, nunca principal.',
  'Penalize fortemente resultados genéricos, tangenciais, com assuntos amplos demais ou sem texto decisório suficiente.',
  'Se faltar ementa ou inteiro teor, reduza a nota de forma agressiva; se ambos faltarem, trate como baixa confiança e evite score alto.',
  'Resultados apoiados apenas por metadados não podem superar julgados com texto decisório aderente à consulta.',
  'Quando o texto estiver incompleto, reflita isso também na stance e na pontuação final.',
  'Exemplo de resposta: {"ranking":[{"index":1,"score":85,"stance":"favoravel"}]}',
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

/** Delay (ms) before showing a secondary toast, to avoid overlapping with the primary toast. */
const SECONDARY_TOAST_DELAY_MS = 600
const STUDIO_PIPELINE_TOTAL_STEPS = 3

type ViewMode = 'list' | 'detail'
type DetailTab = 'overview' | 'chat' | 'sources' | 'studio' | 'artifacts'

type NotebookArtifactTaskMetadata = {
  taskKind: 'notebook-artifact'
  notebookId: string
  artifactType: StudioArtifactType
  artifactLabel: string
}

function getNotebookArtifactTaskMetadata(metadata: Record<string, unknown> | undefined): NotebookArtifactTaskMetadata | null {
  if (!metadata) return null
  if (metadata.taskKind !== 'notebook-artifact') return null
  if (typeof metadata.notebookId !== 'string') return null
  if (typeof metadata.artifactType !== 'string') return null
  if (typeof metadata.artifactLabel !== 'string') return null
  return {
    taskKind: 'notebook-artifact',
    notebookId: metadata.notebookId,
    artifactType: metadata.artifactType as StudioArtifactType,
    artifactLabel: metadata.artifactLabel,
  }
}

function createEmptyOperationalSummary(): TaskOperationalSummary {
  return {
    totalCostUsd: 0,
    totalDurationMs: 0,
    totalRetryCount: 0,
    fallbackCount: 0,
    degradationReasons: [],
    phaseCounts: {},
  }
}

function buildOperationalEventKey(update: {
  phase?: string
  costUsd?: number
  durationMs?: number
  retryCount?: number
  usedFallback?: boolean
  fallbackReason?: string
  fallbackFrom?: string
}): string | null {
  const hasSignal =
    (update.costUsd ?? 0) > 0 ||
    (update.durationMs ?? 0) > 0 ||
    (update.retryCount ?? 0) > 0 ||
    Boolean(update.usedFallback) ||
    Boolean(update.fallbackReason) ||
    Boolean(update.fallbackFrom)

  if (!hasSignal) return null

  return [
    update.phase ?? '',
    update.costUsd ?? 0,
    update.durationMs ?? 0,
    update.retryCount ?? 0,
    update.usedFallback ? 1 : 0,
    update.fallbackReason ?? '',
    update.fallbackFrom ?? '',
  ].join('|')
}

function accumulateOperationalSummary(
  current: TaskOperationalSummary,
  update: {
    phase?: string
    costUsd?: number
    durationMs?: number
    retryCount?: number
    usedFallback?: boolean
    fallbackReason?: string
    fallbackFrom?: string
  },
): TaskOperationalSummary {
  const degradationReason = update.fallbackReason
    || (update.fallbackFrom ? `Fallback de ${update.fallbackFrom.split('/').pop() || update.fallbackFrom}` : undefined)
    || (update.usedFallback ? 'Fallback ativado' : undefined)

  const degradationReasons = degradationReason
    ? Array.from(new Set([...(current.degradationReasons || []), degradationReason]))
    : (current.degradationReasons || [])

  const phaseCounts = {
    ...(current.phaseCounts || {}),
  }
  if (update.phase) {
    phaseCounts[update.phase] = (phaseCounts[update.phase] || 0) + 1
  }

  return {
    totalCostUsd: Number((current.totalCostUsd + (update.costUsd ?? 0)).toFixed(6)),
    totalDurationMs: current.totalDurationMs + Math.max(0, update.durationMs ?? 0),
    totalRetryCount: current.totalRetryCount + Math.max(0, update.retryCount ?? 0),
    fallbackCount: current.fallbackCount + (update.usedFallback ? 1 : 0),
    degradationReasons,
    phaseCounts,
  }
}

function formatContextChars(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k chars`
  return `${value} chars`
}

export default function ResearchNotebook() {
  const { userId } = useAuth()
  const toast = useToast()
  const { startTask, tasks } = useTaskManager()
  const [searchParams, setSearchParams] = useSearchParams()
  const mountedRef = useRef(true)

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
  const [lastChatContextAudit, setLastChatContextAudit] = useState<ChatContextAuditSummary | null>(null)
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
  const [lastResearchContextAudit, setLastResearchContextAudit] = useState<ResearchContextAuditSummary | null>(null)
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
  const [jurisprudenceConfigPreset, setJurisprudenceConfigPreset] = useState<Partial<JurisprudenceSearchConfig> | null>(null)
  const [lastJurisprudenceTribunalAliases, setLastJurisprudenceTribunalAliases] = useState<string[]>(DEFAULT_TRIBUNALS.map(t => t.alias))

  // Search results review modal (post-search)
  const [searchResultsModalOpen, setSearchResultsModalOpen] = useState(false)
  const [searchResultsItems, setSearchResultsItems] = useState<SearchResultItem[]>([])
  const [searchResultsVariant, setSearchResultsVariant] = useState<'external' | 'deep' | 'jurisprudencia'>('external')
  const [searchResultsCallback, setSearchResultsCallback] = useState<((selected: SearchResultItem[]) => Promise<void>) | null>(null)

  // Dynamic suggested questions
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)

  // Studio
  const [studioCustomPrompt, setStudioCustomPrompt] = useState('')
  const [showStudioProgressModal, setShowStudioProgressModal] = useState(false)
  const [selectedStudioTaskId, setSelectedStudioTaskId] = useState<string | null>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceSearch, setSourceSearch] = useState('')

  // Acervo analysis (multi-agent pipeline)
  const [acervoAnalysisLoading, setAcervoAnalysisLoading] = useState(false)
  const [acervoAnalysisPhase, setAcervoAnalysisPhase] = useState('')
  const [acervoAnalysisMessage, setAcervoAnalysisMessage] = useState('')
  const [acervoAnalysisStartedAt, setAcervoAnalysisStartedAt] = useState<number | null>(null)
  const [acervoAnalysisPercent, setAcervoAnalysisPercent] = useState(0)
  const [acervoAnalysisMeta, setAcervoAnalysisMeta] = useState('')
  const [acervoAnalysisError, setAcervoAnalysisError] = useState('')
  const [showAcervoProgressModal, setShowAcervoProgressModal] = useState(false)
  const [acervoAnalysisResults, setAcervoAnalysisResults] = useState<AnalyzedDocument[]>([])
  const [acervoOperationalSummary, setAcervoOperationalSummary] = useState<TaskOperationalSummary>(createEmptyOperationalSummary)
  const [selectedAnalysisIds, setSelectedAnalysisIds] = useState<Set<string>>(new Set())
  const acervoAbortRef = useRef<AbortController | null>(null)
  const acervoOperationalEventKeysRef = useRef<Set<string>>(new Set())

  // Script review/edit before saving (for media artifacts: video, audio, presentation)
  const [pendingArtifact, setPendingArtifact] = useState<{
    artifact: StudioArtifact
    executions: { phase: string; agent_name: string; model: string; tokens_in: number; tokens_out: number; cost_usd: number; duration_ms: number }[]
  } | null>(null)
  const [pendingContent, setPendingContent] = useState('')
  const [pendingArtifactDelete, setPendingArtifactDelete] = useState<{ id: string; title: string } | null>(null)
  const [pendingSavedSearchDelete, setPendingSavedSearchDelete] = useState<{ id: string; title: string } | null>(null)
  const [pendingSavedSearchBulkDeleteIds, setPendingSavedSearchBulkDeleteIds] = useState<string[]>([])
  const [selectedSavedSearchIds, setSelectedSavedSearchIds] = useState<Set<string>>(new Set())
  const [editingSavedSearchId, setEditingSavedSearchId] = useState<string | null>(null)
  const [editingSavedSearchTitle, setEditingSavedSearchTitle] = useState('')
  const [editingSavedSearchTags, setEditingSavedSearchTags] = useState('')
  const [showAllResearchAudits, setShowAllResearchAudits] = useState(false)
  const [showAllSavedSearches, setShowAllSavedSearches] = useState(false)
  const [savedSearchFilter, setSavedSearchFilter] = useState('')
  const [savedSearchVariantFilter, setSavedSearchVariantFilter] = useState<'all' | 'external' | 'deep' | 'jurisprudencia'>('all')
  const [bulkSavedSearchTagInput, setBulkSavedSearchTagInput] = useState('')
  const [clearingChat, setClearingChat] = useState(false)

  // Video generation flow
  const [showVideoGenCost, setShowVideoGenCost] = useState(false)
  const [videoGenSavedArtifact, setVideoGenSavedArtifact] = useState<StudioArtifact | null>(null)
  const [videoGenLoading, setVideoGenLoading] = useState(false)
  const [videoGenProgress, setVideoGenProgress] = useState<VideoPipelineProgressState | null>(null)
  const [videoGenStartedAt, setVideoGenStartedAt] = useState<number | null>(null)
  const [videoGenOperationalSummary, setVideoGenOperationalSummary] = useState<TaskOperationalSummary>(createEmptyOperationalSummary)
  const [videoProduction, setVideoProduction] = useState<VideoProductionPackage | null>(null)
  const [videoGenLastCheckpoint, setVideoGenLastCheckpoint] = useState<VideoCheckpoint | null>(null)
  const [videoStudioApiKey, setVideoStudioApiKey] = useState<string | undefined>(undefined)
  const [videoStudioLiteralLoading, setVideoStudioLiteralLoading] = useState(false)
  const [videoStudioLiteralProgress, setVideoStudioLiteralProgress] = useState<VideoPipelineProgressState | null>(null)
  const [videoStudioLiteralStartedAt, setVideoStudioLiteralStartedAt] = useState<number | null>(null)
  const [videoLiteralOperationalSummary, setVideoLiteralOperationalSummary] = useState<TaskOperationalSummary>(createEmptyOperationalSummary)
  const [audioGenLoading, setAudioGenLoading] = useState(false)
  const [audioGeneratingArtifactId, setAudioGeneratingArtifactId] = useState<string | null>(null)
  const [visualGenLoading, setVisualGenLoading] = useState(false)
  const [visualGeneratingArtifactId, setVisualGeneratingArtifactId] = useState<string | null>(null)
  const [showClearChatConfirm, setShowClearChatConfirm] = useState(false)
  const videoStudioUploadCacheRef = useRef<globalThis.Map<string, StoredNotebookMedia>>(new globalThis.Map<string, StoredNotebookMedia>())
  const videoGenOperationalEventKeysRef = useRef<Set<string>>(new Set())
  const videoLiteralOperationalEventKeysRef = useRef<Set<string>>(new Set())

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

  useEffect(() => {
    if (!userId || !IS_FIREBASE) return
    let cancelled = false

    getUserSettings(userId)
      .then(settings => {
        if (cancelled) return
        const aliases = settings.last_jurisprudence_tribunal_aliases
        if (!Array.isArray(aliases) || aliases.length === 0) return
        const validAliases = aliases.filter(alias => ALL_TRIBUNALS.some(t => t.alias === alias))
        if (validAliases.length > 0) {
          setLastJurisprudenceTribunalAliases(validAliases)
        }
      })
      .catch(() => {
        // Ignore settings load failures and fall back to defaults.
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  // ── Deep-link: ?open=<notebook_id> ─────────────────────────────────
  // Runs once after the notebook list is loaded. If the URL has ?open=<id>,
  // open that notebook directly (falling back to a direct Firestore fetch
  // when the id is not yet in the list).
  const deepLinkHandledRef = useRef(false)
  useEffect(() => {
    if (deepLinkHandledRef.current) return
    const openId = searchParams.get('open')
    if (!openId || !userId || loading) return
    deepLinkHandledRef.current = true
    // Clear the param from the URL immediately so a page refresh is clean.
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('open'); return next }, { replace: true })
    const resolve = getResearchNotebook(userId, openId)
    resolve.then(nb => {
      if (nb) {
        setActiveNotebook(nb)
        setViewMode('detail')
        setActiveTab('overview')
        setSuggestions([])
      }
    }).catch(() => {
      // silently ignore — notebook may have been deleted
    })
  }, [userId, loading, notebooks, searchParams, setSearchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure in-flight research tasks are canceled when leaving the page.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      researchAbortRef.current?.abort()
      researchAbortRef.current = null
      acervoAbortRef.current?.abort()
      acervoAbortRef.current = null
    }
  }, [])

  const getFreshNotebookOrThrow = useCallback(async (notebookId: string) => {
    if (!userId) throw new Error('Usuário não autenticado')
    const fresh = await getResearchNotebook(userId, notebookId)
    if (!fresh) throw new Error('Caderno não encontrado para atualização')
    return fresh
  }, [userId])

  const notebookArtifactTasks = useMemo(() => {
    if (!activeNotebook?.id) return []
    return tasks.filter(task => {
      const metadata = getNotebookArtifactTaskMetadata(task.metadata)
      return metadata?.notebookId === activeNotebook.id
    })
  }, [activeNotebook?.id, tasks])

  const runningArtifactTasksByType = useMemo(() => {
    const map = new globalThis.Map<StudioArtifactType, typeof notebookArtifactTasks[number]>()
    for (const task of notebookArtifactTasks) {
      const metadata = getNotebookArtifactTaskMetadata(task.metadata)
      if (!metadata || task.status !== 'running') continue
      map.set(metadata.artifactType, task)
    }
    return map
  }, [notebookArtifactTasks])

  const selectedStudioTask = useMemo(() => {
    if (selectedStudioTaskId) {
      const found = notebookArtifactTasks.find(task => task.id === selectedStudioTaskId)
      if (found) return found
    }
    return notebookArtifactTasks.find(task => task.status === 'running') || null
  }, [notebookArtifactTasks, selectedStudioTaskId])

  const selectedStudioTaskMetadata = selectedStudioTask
    ? getNotebookArtifactTaskMetadata(selectedStudioTask.metadata)
    : null

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
          toast.warning('Sugestões automáticas indisponíveis', 'Configure o agente Pesquisador de Fontes em Configurações para habilitar sugestões dinâmicas.')
        }
        return
      }
      const preview = sourceCtx.slice(0, 4_000)
      const result = await callLLMWithFallback(apiKey,
        'Você gera perguntas de pesquisa relevantes com base em fontes jurídicas.',
        `Tema: "${activeNotebook.topic}"
Resumo das fontes:\n${preview}\n\nGere exatamente 5 perguntas curtas e objetivas que o usuário poderia fazer ao assistente.\nFormato: uma pergunta por linha, sem numeração, sem prefixos.`,
        model, model, 300, 0.5)

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
        setActiveTab('overview')
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
    setAcervoAnalysisStartedAt(Date.now())
    setAcervoAnalysisResults([])
    setSelectedAnalysisIds(new Set())
    setAcervoAnalysisPhase('')
    setAcervoAnalysisMessage('Iniciando análise...')
    setAcervoAnalysisPercent(0)
    setAcervoAnalysisMeta('')
    setAcervoAnalysisError('')
    setAcervoOperationalSummary(createEmptyOperationalSummary())
    acervoOperationalEventKeysRef.current = new Set()
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
          const enriched = buildAcervoProgressState(progress)
          setAcervoAnalysisPhase(enriched.phase)
          setAcervoAnalysisMessage(enriched.message)
          setAcervoAnalysisPercent(enriched.percent)
          setAcervoAnalysisMeta(enriched.stageMeta || '')

          const eventKey = buildOperationalEventKey({
            phase: progress.phase,
            costUsd: progress.costUsd,
            durationMs: progress.durationMs,
            retryCount: progress.retryCount,
            usedFallback: progress.usedFallback,
            fallbackReason: progress.fallbackReason,
          })
          if (eventKey && !acervoOperationalEventKeysRef.current.has(eventKey)) {
            acervoOperationalEventKeysRef.current.add(eventKey)
            setAcervoOperationalSummary(prev => accumulateOperationalSummary(prev, {
              phase: progress.phase,
              costUsd: progress.costUsd,
              durationMs: progress.durationMs,
              retryCount: progress.retryCount,
              usedFallback: progress.usedFallback,
              fallbackReason: progress.fallbackReason,
            }))
          }
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
        setAcervoAnalysisMeta('Cancelado manualmente')
        toast.info('Análise de acervo cancelada')
        return
      }
      setAcervoAnalysisError(err instanceof Error ? err.message : 'Erro inesperado')
      setAcervoAnalysisMeta('Execução interrompida')
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
      setAcervoAnalysisStartedAt(null)
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

  const summarizeEndpointAttempts = (attempts: DataJudEndpointAttempt[]): string[] => {
    const grouped = new globalThis.Map<string, { errors: number; successes: number }>()

    for (const attempt of attempts) {
      const existing = grouped.get(attempt.endpointLabel) ?? { errors: 0, successes: 0 }
      if (attempt.outcome === 'success') existing.successes += 1
      else existing.errors += 1
      grouped.set(attempt.endpointLabel, existing)
    }

    return Array.from(grouped.entries()).map(([label, counts]) => {
      if (counts.errors > 0 && counts.successes > 0) return `${label}: ${counts.errors} falha(s), ${counts.successes} sucesso(s)`
      if (counts.errors > 0) return `${label}: ${counts.errors} falha(s)`
      return `${label}: ${counts.successes} sucesso(s)`
    })
  }

  const appendNotebookSourceWithExecution = async (
    notebookId: string,
    source: NotebookSource,
    execution: ReturnType<typeof createUsageExecutionRecord> | ReturnType<typeof createUsageExecutionRecord>[],
    researchAudit?: ResearchContextAuditSummary,
  ) => {
    if (!userId) throw new Error('Usuário não autenticado')
    const freshNotebook = await getFreshNotebookOrThrow(notebookId)
    const updatedSources = [...freshNotebook.sources, source]
    const executions = Array.isArray(execution) ? execution : [execution]
    const updatedExecutions = [...(freshNotebook.llm_executions || []), ...executions]
    const updatedResearchAudits = researchAudit
      ? [{
          ...researchAudit,
          created_at: new Date().toISOString(),
        } satisfies NotebookResearchAuditEntry, ...(freshNotebook.research_audits || [])].slice(0, MAX_PERSISTED_RESEARCH_AUDITS)
      : freshNotebook.research_audits

    await updateResearchNotebook(userId, notebookId, {
      sources: updatedSources,
      llm_executions: updatedExecutions,
      research_audits: updatedResearchAudits,
    })

    setActiveNotebook(prev => prev && prev.id === notebookId
      ? { ...prev, sources: updatedSources, llm_executions: updatedExecutions, research_audits: updatedResearchAudits }
      : prev)
  }

  const handleAddExternalSearchSource = async (queryOverride?: string) => {
    const effectiveQuery = queryOverride ?? externalSearchQuery
    if (!userId || !activeNotebook?.id || !effectiveQuery.trim()) return
    const query = effectiveQuery.trim()
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

          const researchAudit = buildResearchContextAudit({
            variant: 'external',
            mode: 'executed',
            query,
            resultCount: results.length,
            selectedCount: selected.length,
            compiledChars: textContent.length,
            sourceKindLabel: 'Pesquisa externa',
          })
          setLastResearchContextAudit(researchAudit)

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

          const externalResult = await callLLMWithFallback(
            apiKey,
            'Você é um pesquisador jurídico externo. Sintetize resultados de busca web em texto objetivo para uso no caderno de pesquisa. Responda em português com seções: panorama, pontos-chave, fundamentos normativos/jurisprudenciais citados e lista de URLs.',
            `Consulta do usuário: "${query}"\n\nResultados selecionados (${selected.length}):\n${textContent}\n\nProduza uma síntese clara e acionável com foco jurídico.`,
            model,
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

          await appendNotebookSourceWithExecution(notebookId, source, execution, researchAudit)
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

  const handleAddDeepExternalSearchSource = async (queryOverride?: string) => {
    const effectiveQuery = queryOverride ?? externalSearchQuery
    if (!userId || !activeNotebook?.id || !effectiveQuery.trim()) return
    const query = effectiveQuery.trim()
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

      // Surface deep search warnings
      if (deepResult.warnings?.length) {
        for (const w of deepResult.warnings) {
          if (w.kind === 'jina_fallback_used') {
            addModalSubstep('search', 'Resultados obtidos via Jina Search API (fallback)')
            toast.info('Pesquisa profunda usou provedor alternativo', 'DuckDuckGo não retornou resultados; Jina Search API foi usada como fallback.')
          } else if (w.kind === 'fallback_to_snippets') {
            addModalSubstep('fetch', 'Usando apenas snippets da busca (conteúdo completo indisponível)')
            toast.warning('Pesquisa profunda degradada', 'Não foi possível extrair o conteúdo completo das páginas. Os snippets da busca serão usados.')
          } else if (w.kind === 'all_providers_failed') {
            addModalSubstep('search', `Todos os provedores falharam: ${w.attempted.join(', ')}`)
          }
        }
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

          const researchAudit = buildResearchContextAudit({
            variant: 'deep',
            mode: 'executed',
            query,
            resultCount: deepResult.results.length,
            selectedCount: selected.length,
            extractedCount: deepResult.contents.length,
            compiledChars: compiled.length,
            usedSnippetFallback: !hasFullContent,
            sourceKindLabel: 'Pesquisa profunda',
          })
          setLastResearchContextAudit(researchAudit)

          const llmResult = await callLLMWithFallback(
            apiKey,
            'Você é um pesquisador jurídico externo profundo. Sintetize fontes web em texto objetivo e acionável para caderno de pesquisa. Responda em português, com seções: panorama, pontos-chave, fundamentos normativos/jurisprudenciais citados e lista de URLs.',
            `Consulta do usuário: "${query}"\n\nFontes selecionadas (${selected.length}):\n${compiled}\n\nProduza uma síntese profunda com foco jurídico.`,
            model,
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

          await appendNotebookSourceWithExecution(notebookId, source, execution, researchAudit)
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

  // Opens the pre-search configuration modal for jurisprudence.
  // Supports query/config overrides so history replays can reuse the same entrypoint.
  const handleAddJurisprudenceSource = (
    queryOverride?: string,
    presetOverride?: Partial<JurisprudenceSearchConfig> | null,
  ) => {
    if (!userId || !activeNotebook?.id) return
    const effectiveQuery = (queryOverride ?? externalSearchQuery).trim()
    if (!effectiveQuery) return

    setExternalSearchQuery(effectiveQuery)
    setJurisprudenceConfigPreset(presetOverride ?? null)
    setJurisprudenceConfigOpen(true)
  }

  const handleReplayResearchAudit = (audit: NotebookResearchAuditEntry | NotebookSavedSearchEntry) => {
    if (isAnyResearchLoading) return

    setExternalSearchQuery(audit.query)
    setLastResearchContextAudit(audit)

    if (audit.variant === 'external') {
      void handleAddExternalSearchSource(audit.query)
      return
    }

    if (audit.variant === 'deep') {
      void handleAddDeepExternalSearchSource(audit.query)
      return
    }

    const tribunals = ALL_TRIBUNALS.filter(tribunal => audit.tribunalAliases?.includes(tribunal.alias))
    setLastJurisprudenceTribunalAliases(audit.tribunalAliases && audit.tribunalAliases.length > 0
      ? audit.tribunalAliases
      : lastJurisprudenceTribunalAliases)
    void handleAddJurisprudenceSource(audit.query, {
      query: audit.query,
      tribunals,
      dateFrom: audit.dateFrom || '',
      dateTo: audit.dateTo || '',
      graus: audit.graus || [],
      maxPerTribunal: audit.maxPerTribunal || 5,
      legalArea: audit.legalArea || '',
    })
  }

  const triggerExternalSearch = () => {
    void handleAddExternalSearchSource()
  }

  const triggerDeepExternalSearch = () => {
    void handleAddDeepExternalSearchSource()
  }

  const triggerJurisprudenceSearch = () => {
    void handleAddJurisprudenceSource()
  }

  const buildSavedSearchTitle = (audit: NotebookResearchAuditEntry): string => {
    const prefix = audit.variant === 'jurisprudencia'
      ? 'Jurisprudência'
      : audit.variant === 'deep'
        ? 'Pesquisa profunda'
        : 'Pesquisa externa'
    const trimmedQuery = audit.query.trim()
    if (!trimmedQuery) return prefix
    const compact = trimmedQuery.length > 56 ? `${trimmedQuery.slice(0, 53)}...` : trimmedQuery
    return `${prefix}: ${compact}`
  }

  const buildSavedSearchTags = (audit: NotebookResearchAuditEntry): string[] => {
    const tags = new Set<string>()

    if (audit.variant === 'jurisprudencia') tags.add('jurisprudencia')
    else if (audit.variant === 'deep') tags.add('pesquisa-profunda')
    else tags.add('pesquisa-externa')

    if (audit.legalArea) {
      const areaLabel = AREA_LABELS[audit.legalArea] || audit.legalArea
      if (areaLabel) tags.add(areaLabel.toLowerCase())
    }

    if (audit.dateRangeLabel) tags.add('recorte-temporal')
    if ((audit.tribunalCount || 0) > 0) tags.add('tribunais')
    if (audit.usedSnippetFallback) tags.add('fallback-snippets')

    return Array.from(tags).slice(0, 5)
  }

  const saveResearchAuditPreset = async (audit: NotebookResearchAuditEntry) => {
    if (!userId || !activeNotebook?.id) return
    try {
      const notebookId = activeNotebook.id
      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const now = new Date().toISOString()
      const existing = freshNotebook.saved_searches || []
      const duplicate = existing.find(item =>
        item.variant === audit.variant
        && item.query.trim() === audit.query.trim()
        && (item.legalArea || '') === (audit.legalArea || '')
        && (item.dateFrom || '') === (audit.dateFrom || '')
        && (item.dateTo || '') === (audit.dateTo || '')
        && (item.maxPerTribunal || 0) === (audit.maxPerTribunal || 0),
      )

      const entry: NotebookSavedSearchEntry = duplicate
        ? {
            ...duplicate,
            ...audit,
            title: duplicate.title,
            tags: duplicate.tags && duplicate.tags.length > 0 ? duplicate.tags : buildSavedSearchTags(audit),
            created_at: duplicate.created_at,
            updated_at: now,
          }
        : {
            id: generateId(),
            title: buildSavedSearchTitle(audit),
            tags: buildSavedSearchTags(audit),
            ...audit,
            created_at: now,
            updated_at: now,
          }

      const updatedSavedSearches = [
        entry,
        ...existing.filter(item => item.id !== entry.id),
      ].slice(0, MAX_PERSISTED_SAVED_SEARCHES)

      await updateResearchNotebook(userId, notebookId, { saved_searches: updatedSavedSearches })
      setActiveNotebook(prev => prev && prev.id === notebookId
        ? { ...prev, saved_searches: updatedSavedSearches }
        : prev)
      toast.success(duplicate ? 'Busca salva atualizada' : 'Busca salva no caderno')
    } catch (error) {
      console.error('Failed to save research preset:', error)
      toast.error('Erro ao salvar busca')
    }
  }

  const persistSavedSearches = async (updater: (current: NotebookSavedSearchEntry[]) => NotebookSavedSearchEntry[]) => {
    if (!userId || !activeNotebook?.id) return false
    const notebookId = activeNotebook.id
    const freshNotebook = await getFreshNotebookOrThrow(notebookId)
    const updatedSavedSearches = updater(freshNotebook.saved_searches || []).slice(0, MAX_PERSISTED_SAVED_SEARCHES)
    await updateResearchNotebook(userId, notebookId, { saved_searches: updatedSavedSearches })
    setActiveNotebook(prev => prev && prev.id === notebookId
      ? { ...prev, saved_searches: updatedSavedSearches }
      : prev)
    return true
  }

  const startEditingSavedSearch = (search: NotebookSavedSearchEntry) => {
    setEditingSavedSearchId(search.id)
    setEditingSavedSearchTitle(search.title)
    setEditingSavedSearchTags((search.tags || []).join(', '))
  }

  const cancelEditingSavedSearch = () => {
    setEditingSavedSearchId(null)
    setEditingSavedSearchTitle('')
    setEditingSavedSearchTags('')
  }

  const confirmRenameSavedSearch = async () => {
    if (!editingSavedSearchId) return
    const trimmedTitle = editingSavedSearchTitle.trim()
    if (!trimmedTitle) {
      toast.info('Informe um título para a busca salva.')
      return
    }
    const normalizedTags = Array.from(new Set(
      editingSavedSearchTags
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(Boolean),
    )).slice(0, 8)
    try {
      const updated = await persistSavedSearches(current => current.map(search =>
        search.id === editingSavedSearchId
          ? { ...search, title: trimmedTitle, tags: normalizedTags, updated_at: new Date().toISOString() }
          : search,
      ))
      if (updated) {
        toast.success('Busca salva atualizada')
        cancelEditingSavedSearch()
      }
    } catch (error) {
      console.error('Failed to rename saved search:', error)
      toast.error('Erro ao renomear busca salva')
    }
  }

  const togglePinSavedSearch = async (searchId: string) => {
    try {
      let pinned = false
      const updated = await persistSavedSearches(current => current.map(search => {
        if (search.id !== searchId) return search
        pinned = !search.pinned
        return { ...search, pinned, updated_at: new Date().toISOString() }
      }))
      if (updated) {
        toast.success(pinned ? 'Busca salva fixada' : 'Busca salva desafixada')
      }
    } catch (error) {
      console.error('Failed to pin saved search:', error)
      toast.error('Erro ao fixar busca salva')
    }
  }

  const confirmDeleteSavedSearch = async () => {
    if (!userId || !activeNotebook?.id || !pendingSavedSearchDelete?.id) return
    try {
      const updated = await persistSavedSearches(current => current.filter(item => item.id !== pendingSavedSearchDelete.id))
      if (updated) toast.success('Busca salva removida')
    } catch (error) {
      console.error('Failed to delete saved search:', error)
      toast.error('Erro ao excluir busca salva')
    } finally {
      setPendingSavedSearchDelete(null)
    }
  }

  const toggleSavedSearchSelection = (searchId: string) => {
    setSelectedSavedSearchIds(current => {
      const next = new Set(current)
      if (next.has(searchId)) {
        next.delete(searchId)
      } else {
        next.add(searchId)
      }
      return next
    })
  }

  const toggleSelectAllVisibleSavedSearches = () => {
    setSelectedSavedSearchIds(current => {
      const next = new Set(current)
      if (allVisibleSavedSearchesSelected) {
        visibleSavedSearchIds.forEach(id => next.delete(id))
      } else {
        visibleSavedSearchIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const clearSelectedSavedSearches = () => {
    setSelectedSavedSearchIds(new Set())
  }

  const bulkSetPinnedSavedSearches = async (pinned: boolean) => {
    if (selectedSavedSearchIds.size === 0) return
    const selectedIds = new Set(selectedSavedSearchIds)
    try {
      const updated = await persistSavedSearches(current => current.map(search =>
        selectedIds.has(search.id)
          ? { ...search, pinned, updated_at: new Date().toISOString() }
          : search,
      ))
      if (updated) {
        toast.success(pinned ? 'Buscas selecionadas fixadas' : 'Buscas selecionadas desafixadas')
      }
    } catch (error) {
      console.error('Failed to bulk update saved searches:', error)
      toast.error('Erro ao atualizar buscas selecionadas')
    }
  }

  const bulkUpdateTagSavedSearches = async (mode: 'add' | 'remove') => {
    if (selectedSavedSearchIds.size === 0) return
    const normalizedTag = bulkSavedSearchTagInput.trim().toLowerCase()
    if (!normalizedTag) {
      toast.info('Informe uma tag para aplicar em lote.')
      return
    }
    const selectedIds = new Set(selectedSavedSearchIds)
    try {
      const updated = await persistSavedSearches(current => current.map(search => {
        if (!selectedIds.has(search.id)) return search
        const tags = new Set((search.tags || []).map(tag => tag.trim().toLowerCase()).filter(Boolean))
        if (mode === 'add') {
          tags.add(normalizedTag)
        } else {
          tags.delete(normalizedTag)
        }
        return {
          ...search,
          tags: Array.from(tags).slice(0, 8),
          updated_at: new Date().toISOString(),
        }
      }))
      if (updated) {
        toast.success(mode === 'add' ? 'Tag aplicada nas buscas selecionadas' : 'Tag removida das buscas selecionadas')
      }
    } catch (error) {
      console.error('Failed to bulk update saved search tags:', error)
      toast.error('Erro ao atualizar tags em lote')
    }
  }

  const confirmDeleteSelectedSavedSearches = async () => {
    if (!userId || !activeNotebook?.id || pendingSavedSearchBulkDeleteIds.length === 0) return
    const selectedIds = new Set(pendingSavedSearchBulkDeleteIds)
    try {
      const updated = await persistSavedSearches(current => current.filter(item => !selectedIds.has(item.id)))
      if (updated) {
        setSelectedSavedSearchIds(current => {
          const next = new Set(current)
          pendingSavedSearchBulkDeleteIds.forEach(id => next.delete(id))
          return next
        })
        toast.success('Buscas selecionadas removidas')
      }
    } catch (error) {
      console.error('Failed to delete selected saved searches:', error)
      toast.error('Erro ao excluir buscas selecionadas')
    } finally {
      setPendingSavedSearchBulkDeleteIds([])
    }
  }

  // Called from JurisprudenceConfigModal when user confirms config
  const handleJurisprudenceSearch = async (config: JurisprudenceSearchConfig) => {
    if (!userId || !activeNotebook?.id) return
    const notebookId = activeNotebook.id
    setJurisprudenceConfigOpen(false)

    const selectedTribunalAliases = config.tribunals.map(tribunal => tribunal.alias)
    setLastJurisprudenceTribunalAliases(selectedTribunalAliases)
    if (IS_FIREBASE) {
      try {
        await saveUserSettings(userId, {
          last_jurisprudence_tribunal_aliases: selectedTribunalAliases,
        })
      } catch (error) {
        console.warn('Failed to persist last jurisprudence tribunal selection:', error)
      }
    }

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
      // Step 1: Query tribunals + JusBrasil
      updateModalStep('query', { status: 'active' })
      addModalSubstep('query', `Consultando JusBrasil + ${config.tribunals.length} tribunais DataJud em paralelo...`)

      const djResult = await searchDataJud(config.query, {
        tribunals: config.tribunals,
        maxPerTribunal: config.maxPerTribunal,
        dateFrom: config.dateFrom || undefined,
        dateTo: config.dateTo || undefined,
        graus: config.graus.length > 0 ? config.graus : undefined,
        legalArea: config.legalArea || undefined,
        enrichMissingText: true,
        maxTextEnrichment: 10,
        onProgress: (progress) => {
          setResearchModalStats(prev => ({
            ...prev,
            tribunalsQueried: progress.tribunalsQueried,
            sourcesFound: progress.resultsFound,
            elapsedMs: Math.round(performance.now() - t0),
          }))
          if (progress.phase === 'processing') {
            addModalSubstep('filter', 'Refinando relevância jurídica e enriquecendo textos dos acórdãos...')
          } else if (progress.currentTribunal) {
            addModalSubstep('query', `${progress.currentTribunal} (${progress.tribunalsQueried}/${progress.tribunalsTotal})`)
          }
        },
        signal: abortController.signal,
      })

      updateModalStep('query', {
        status: djResult.results.length > 0 ? 'done' : 'error',
        detail: `${djResult.results.length} resultado(s) de ${djResult.tribunalsWithResults} tribunal(is)`,
      })

      summarizeEndpointAttempts(djResult.runtimeDiagnostics.endpointAttempts)
        .slice(0, 3)
        .forEach(summary => addModalSubstep('query', summary))

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
        djResult.errorDetails
          .filter(item => item.lastEndpointLabel)
          .slice(0, 3)
          .forEach(item => addModalSubstep('query', `${item.tribunalAlias}: última tentativa em ${item.lastEndpointLabel}`))
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
      addModalSubstep('filter', `${djResult.textStats.withBoth} com ementa + inteiro teor; ${djResult.textStats.missingBoth} sem texto decisório`)
      if (djResult.textStats.enrichedFromWeb > 0) {
        addModalSubstep('filter', `${djResult.textStats.enrichedFromWeb} resultado(s) complementados por fonte pública`)
      }
      updateModalStep('filter', { status: 'done', detail: `${djResult.results.length} resultados` })

      // Close progress modal and show results review
      setResearchModalOpen(false)
      setResearchModalCanClose(true)

      const reviewItems: SearchResultItem[] = djResult.results.map((r, i) => ({
        id: `dj-${i}`,
        title: `${r.classe} — ${r.numeroProcesso}`,
        subtitle: `${r.tribunalName} · ${r.orgaoJulgador}`,
        snippet: r.ementa
          ? r.ementa.slice(0, 260) + (r.ementa.length > 260 ? '…' : '')
          : r.inteiroTeor
            ? r.inteiroTeor.slice(0, 260) + (r.inteiroTeor.length > 260 ? '…' : '')
            : (r.assuntos.join(', ') || 'Sem assuntos'),
        fullContent: [
          `Processo: ${r.numeroProcesso}`,
          `Classe: ${r.classe} (${r.classeCode})`,
          `Tribunal: ${r.tribunalName}`,
          r.orgaoJulgador ? `Órgão Julgador: ${r.orgaoJulgador}` : '',
          r.dataAjuizamento ? `Data de Ajuizamento: ${r.dataAjuizamento}` : '',
          r.grau ? `Grau: ${r.grau}` : '',
          r.formato ? `Formato: ${r.formato}` : '',
          r.assuntos.length > 0 ? `Assuntos: ${r.assuntos.join('; ')}` : '',
          r.relevanceScore != null ? `Relevância local: ${r.relevanceScore}/100` : '',
          r.textCompleteness ? `Completude do texto: ${r.textCompleteness}` : '',
          r.textSource ? `Texto obtido via: ${r.textSource}${r.textSourceUrl ? ` (${r.textSourceUrl})` : ''}` : '',
          r.ementa ? `Ementa:\n${r.ementa}${buildCitationSuffix(r)}` : '',
          r.inteiroTeor ? `Inteiro Teor:\n${r.inteiroTeor.slice(0, 6000)}${r.inteiroTeor.length > 6000 ? '\n[... texto truncado ...]' : ''}` : '',
          r.movimentos.length > 0 ? `Movimentos:\n${r.movimentos.slice(0, 5).map(m => `  - ${m.nome} (${m.dataHora})`).join('\n')}` : '',
        ].filter(Boolean).join('\n'),
        metadata: {
          ...(r.grau ? { Grau: r.grau } : {}),
          ...(r.dataAjuizamento ? { Data: r.dataAjuizamento.split('T')[0] } : {}),
          ...(r.ementa ? { Ementa: '✓' } : {}),
          ...(r.inteiroTeor ? { 'Inteiro Teor': '✓' } : {}),
          ...(!r.ementa && !r.inteiroTeor ? { Texto: 'ausente' } : {}),
          ...(r.textSource ? { Origem: r.textSource === 'web' ? 'fonte pública' : 'DataJud' } : {}),
          ...(r.relevanceScore != null ? { Relevância: `${r.relevanceScore}/100` } : {}),
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
            const rankResult = await callLLMWithFallback(
              openRouterApiKey,
              JURISPRUDENCE_RANKING_SYSTEM,
              `Consulta: "${config.query}"\n\nProcessos para avaliar:\n${rankTextContent}`,
              rankModel,
              rankModel,
              800,
              0.1,
            )

            // Parse ranking and reorder results
            try {
              const cleaned = rankResult.content.replace(/```(?:json)?\s*/g, '').trim()
              const parsed = JSON.parse(cleaned) as { ranking: Array<{ index: number; score: number; stance?: string }> }
              if (parsed.ranking && Array.isArray(parsed.ranking)) {
                const sorted = parsed.ranking
                  .filter(r => r.index >= 1 && r.index <= selectedResults.length)
                  .sort((a, b) => b.score - a.score)

                const reordered: typeof selectedResults = []
                const seenIndices = new Set<number>()
                let topScore: number | null = null

                for (const item of sorted) {
                  const resultIndex = item.index - 1
                  if (seenIndices.has(resultIndex)) continue
                  const process = selectedResults[resultIndex]
                  if (!process) continue
                  seenIndices.add(resultIndex)
                  // Attach ranking metadata to the result
                  const enriched = { ...process, relevanceScore: item.score } as DataJudResult
                  const rawStance = item.stance?.toLowerCase().trim()
                  if (rawStance && VALID_STANCES.includes(rawStance as typeof VALID_STANCES[number])) {
                    enriched.stance = rawStance as DataJudResult['stance']
                  }
                  reordered.push(enriched)
                  if (topScore === null) topScore = item.score
                }

                if (reordered.length > 0) {
                  selectedResults = reordered
                  addModalSubstep('rank', `Processos reordenados por relevância (top score: ${topScore ?? 'N/A'})`)
                } else {
                  addModalSubstep('rank', 'Ranking retornou índices inválidos/vazios — mantendo ordem original')
                }
              }
            } catch (rankParseError) {
              console.warn('Jurisprudence ranking parse failed:', rankParseError)
              addModalSubstep('rank', 'Parsing do ranking falhou — mantendo ordem original')
              toast.warning('Ranking de jurisprudência falhou', 'O modelo retornou JSON inválido. Os resultados serão exibidos na ordem original.')
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

          const researchAudit = buildResearchContextAudit({
            variant: 'jurisprudencia',
            mode: 'executed',
            query: config.query,
            tribunalCount: config.tribunals.length,
            tribunalAliases: config.tribunals.map(tribunal => tribunal.alias),
            resultCount: djResult.results.length,
            selectedCount: selected.length,
            compiledChars: textContent.length,
            legalArea: config.legalArea || null,
            dateFrom: config.dateFrom || null,
            dateTo: config.dateTo || null,
            graus: config.graus,
            maxPerTribunal: config.maxPerTribunal,
            sourceKindLabel: 'Pesquisa de jurisprudência',
          })
          setLastResearchContextAudit(researchAudit)

          const jurisprudenceResult = await callLLMWithFallback(
            openRouterApiKey,
            JURISPRUDENCE_SYNTHESIS_SYSTEM,
            `Consulta do usuário: "${config.query}"\n\nResultados DataJud (${selectedResults.length} processos selecionados, ordenados por relevância):\n${textContent}\n\nProduza uma síntese objetiva e acionável para o caderno de pesquisa. Destaque padrões nas movimentações processuais que indiquem tendências de julgamento.`,
            synthesisModel,
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
            // Store raw results for rich per-process display in SourceContentViewer.
            // Persist fewer results would hurt review quality more than storing slightly
            // longer decision text, so keep up to 15 with 12 KB per inteiro teor.
            results_raw: JSON.stringify(
              selectedResults.slice(0, 15).map(r => ({
                ...r,
                inteiroTeorTruncated: Boolean(r.inteiroTeor && r.inteiroTeor.length > 12_000),
                inteiroTeor: r.inteiroTeor?.slice(0, 12_000),
              })),
            ),
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

          await appendNotebookSourceWithExecution(notebookId, source, llmExecutions, researchAudit)
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
        toast.warning('Modelo não configurado', `O agente "${AGENT_LABELS.notebook_assistente}" não possui modelo. Vá em Configurações > Caderno de Pesquisa e selecione um.`)
        setChatLoading(false)
        return
      }
      const baseChatContextAudit = buildChatContextAudit({
        sources: activeNotebook.sources,
        messages: updatedMessages.slice(0, -1),
        minSourceChars: MIN_SOURCE_CHARS,
        maxSourceCharsPerSource: MAX_CONTEXT_TEXT_LENGTH,
        maxConversationMessages: MAX_CONVERSATION_CONTEXT_MESSAGES,
        maxConversationChars: MAX_STUDIO_CONTEXT_CHARS,
        liveWebEnabled: useWebSearch,
      })

      // Optional web search enrichment
      let webSnippet = ''
      if (useWebSearch) {
        try { webSnippet = await searchWebService(`${activeNotebook.topic} ${userMsg.content}`) } catch { /* non-critical */ }
      }

      const effectiveChatContextAudit = buildChatContextAudit({
        sources: activeNotebook.sources,
        messages: updatedMessages.slice(0, -1),
        minSourceChars: MIN_SOURCE_CHARS,
        maxSourceCharsPerSource: MAX_CONTEXT_TEXT_LENGTH,
        maxConversationMessages: MAX_CONVERSATION_CONTEXT_MESSAGES,
        maxConversationChars: MAX_STUDIO_CONTEXT_CHARS,
        liveWebEnabled: useWebSearch,
        liveWebSnippet: webSnippet,
      })
      setLastChatContextAudit(effectiveChatContextAudit)

      const sourceContext = effectiveChatContextAudit.sourceText || baseChatContextAudit.sourceText
      const searchContext = effectiveChatContextAudit.searchHistoryText
        ? `\nHISTÓRICO DE PESQUISAS REALIZADAS NESTE CADERNO:\n${effectiveChatContextAudit.searchHistoryText}${effectiveChatContextAudit.searchSummary.truncated ? '…' : ''}\n(Use este contexto para sugerir refinamentos, complementos ou novas buscas ao usuário.)\n`
        : ''

      const systemPrompt = `Você é um assistente de pesquisa jurídica especializado no tema: "${activeNotebook.topic}".
${activeNotebook.description ? `Objetivo: ${activeNotebook.description}\n` : ''}
${sourceContext
  ? `FONTES DO USUÁRIO (use prioritariamente):\n${sourceContext}`
  : '(Nenhuma fonte adicionada — responda com base no seu conhecimento geral)'
}
${searchContext}${webSnippet ? `\nBUSCA WEB:\n${webSnippet}` : ''}

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
          `O modelo do agente "${AGENT_LABELS.notebook_assistente}" foi removido do OpenRouter. Vá em Configurações > Caderno de Pesquisa e substitua-o.`,
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
    if (!userId || !activeNotebook?.id) return

    const existingTask = runningArtifactTasksByType.get(artifactType)
    if (existingTask) {
      setSelectedStudioTaskId(existingTask.id)
      setShowStudioProgressModal(true)
      toast.info('Esta geração já está em andamento.', 'Abra o painel de progresso para acompanhar a trilha.')
      return
    }

    const artifactDef = ARTIFACT_TYPES.find(a => a.type === artifactType)
    const notebookSnapshot = {
      id: activeNotebook.id,
      topic: activeNotebook.topic,
      title: activeNotebook.title,
      description: activeNotebook.description || undefined,
      sourceContext: studioContextAudit.sourceText || '',
      conversationContext: studioContextAudit.conversationText,
      customInstructions: studioCustomPrompt.trim() || undefined,
    }

    const taskId = startTask(
      `Estúdio: ${artifactDef?.label || artifactType}`,
      async (onTaskProgress) => {
        let studioOperationalSummary = createEmptyOperationalSummary()
        const studioOperationalEventKeys = new Set<string>()

        try {
          onTaskProgress({
            progress: 0,
            phase: 'Inicializando pipeline do estúdio...',
            stageMeta: 'Preparando modelos e contexto',
            operationals: studioOperationalSummary,
            currentStep: 0,
            totalSteps: STUDIO_PIPELINE_TOTAL_STEPS,
          })

          const apiKey = await getOpenRouterKey()
          const onProgress: StudioProgressCallback = (step, total, phase, meta) => {
            const eventKey = buildOperationalEventKey({
              phase,
              costUsd: meta?.costUsd,
              durationMs: meta?.durationMs,
              retryCount: meta?.retryCount,
              usedFallback: meta?.usedFallback,
              fallbackFrom: meta?.fallbackFrom,
            })
            if (eventKey && !studioOperationalEventKeys.has(eventKey)) {
              studioOperationalEventKeys.add(eventKey)
              studioOperationalSummary = accumulateOperationalSummary(studioOperationalSummary, {
                phase,
                costUsd: meta?.costUsd,
                durationMs: meta?.durationMs,
                retryCount: meta?.retryCount,
                usedFallback: meta?.usedFallback,
                fallbackFrom: meta?.fallbackFrom,
              })
            }

            onTaskProgress({
              progress: Math.round((step / Math.max(total, 1)) * 100),
              phase: buildStudioTaskPhaseMessage(step, total, phase, artifactType),
              stageMeta: meta?.stageMeta,
              operationals: studioOperationalSummary,
              currentStep: step,
              totalSteps: total,
            })
          }

          const pipelineInput = {
            apiKey,
            topic: notebookSnapshot.topic,
            description: notebookSnapshot.description,
            sourceContext: notebookSnapshot.sourceContext,
            conversationContext: notebookSnapshot.conversationContext,
            customInstructions: notebookSnapshot.customInstructions,
            artifactType,
            artifactLabel: artifactDef?.label || artifactType,
          }

          const result = artifactType === 'audio_script'
            ? await runAudioGenerationPipeline(pipelineInput, onProgress)
            : artifactType === 'apresentacao'
              ? await runPresentationGenerationPipeline(pipelineInput, onProgress)
              : await runStudioPipeline(pipelineInput, onProgress)

          const artifact: StudioArtifact = {
            id: generateId(),
            type: artifactType,
            title: `${artifactDef?.label || artifactType} — ${notebookSnapshot.topic}`,
            content: result.content,
            format: isStructuredArtifactType(artifactType) ? 'json' : 'markdown',
            created_at: new Date().toISOString(),
          }

          onTaskProgress({
            progress: 95,
            phase: 'Salvando artefato no caderno...',
            stageMeta: 'Persistindo conteúdo e execuções no notebook',
            operationals: studioOperationalSummary,
            currentStep: STUDIO_PIPELINE_TOTAL_STEPS,
            totalSteps: STUDIO_PIPELINE_TOTAL_STEPS,
          })

          await saveArtifactToNotebook(artifact, result.executions, {
            notebookId: notebookSnapshot.id,
            notebookTopic: notebookSnapshot.topic,
            notebookTitle: notebookSnapshot.title,
          })

          if (mountedRef.current) {
            setStudioCustomPrompt('')
          }

          toast.success(
            REVIEWABLE_ARTIFACT_TYPES.includes(artifactType)
              ? `${artifactDef?.label || 'Artefato'} gerado e salvo. Abra em Artefatos para revisar ou continuar a produção.`
              : `${artifactDef?.label || 'Artefato'} gerado com sucesso!`,
          )

          return { artifactId: artifact.id, artifactType }
        } catch (err) {
          console.error('Studio pipeline error:', err)
          if (err instanceof ModelUnavailableError) {
            toast.warning(
              `Modelo indisponível: ${err.modelId}`,
              'Um modelo do pipeline do estúdio foi removido do OpenRouter. Vá em Configurações > Caderno de Pesquisa e substitua-o.',
            )
          } else if (err instanceof Error && err.message.includes('Agente(s) sem modelo')) {
            toast.warning('Modelos não configurados', err.message)
          } else if (err instanceof Error && err.message.includes('429')) {
            toast.warning(
              'Limite de requisições atingido',
              'O modelo está sobrecarregado ou sua conta atingiu o limite. Aguarde 30 segundos e tente novamente. Considere usar modelos gratuitos em Configurações.',
            )
          } else if (err instanceof Error && err.message.includes('API key')) {
            toast.error('Chave da API não configurada. Acesse Configurações > Chaves de API.')
          } else {
            toast.error('Erro ao gerar artefato. Tente novamente ou troque o modelo do agente.')
          }
          throw err
        }
      },
      {
        metadata: {
          taskKind: 'notebook-artifact',
          notebookId: notebookSnapshot.id,
          artifactType,
          artifactLabel: artifactDef?.label || artifactType,
        },
      },
    )

    setSelectedStudioTaskId(taskId)
    setShowStudioProgressModal(true)
  }

  // ── Save artifact to notebook (shared by direct save and review confirm) ──
  const saveArtifactToNotebook = async (
    artifact: StudioArtifact,
    executions: { phase: string; agent_name: string; model: string; tokens_in: number; tokens_out: number; cost_usd: number; duration_ms: number }[],
    options?: {
      notebookId?: string
      notebookTopic?: string
      notebookTitle?: string
      activateArtifactsTab?: boolean
    },
  ) => {
    if (!userId) return
    const notebookId = options?.notebookId ?? activeNotebook?.id
    if (!notebookId) return
    const notebookTopic = options?.notebookTopic ?? activeNotebook?.topic ?? artifact.title
    const notebookTitle = options?.notebookTitle ?? activeNotebook?.title ?? ''

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

    if (mountedRef.current) {
      setActiveNotebook(prev => prev && prev.id === notebookId
        ? { ...prev, artifacts: updatedArtifacts, llm_executions: updatedExecutions }
        : prev)
      if (options?.activateArtifactsTab !== false) {
        setActiveTab('artifacts')
      }
    }

    // When the artifact is a formal document, persist it to the Documents page
    // so it appears alongside documents created via the NewDocument flow.
    if (artifact.type === 'documento' && IS_FIREBASE) {
      try {
        await saveNotebookDocumentToDocuments(userId, {
          topic: notebookTopic,
          content: artifact.content,
          notebookId,
          notebookTitle,
          llm_executions: newExecutions,
        })
        // Secondary toast shown separately after the primary artifact toast
        setTimeout(() => {
          toast.success('Documento salvo na página Documentos', 'Acesse Documentos para ver, editar e exportar este documento.')
        }, SECONDARY_TOAST_DELAY_MS)
      } catch (err) {
        console.warn('Could not persist document artifact to Documents page:', err)
      }
    }
  }

  const appendNotebookExecutions = useCallback(async (
    notebookId: string,
    sourceType: UsageFunctionKey,
    executions: Array<{
      phase: string
      agent_name: string
      model: string
      tokens_in: number
      tokens_out: number
      cost_usd: number
      duration_ms: number
    }>,
  ) => {
    if (!userId || executions.length === 0) return
    const freshNotebook = await getFreshNotebookOrThrow(notebookId)
    const newExecutions = executions.map(ex =>
      createUsageExecutionRecord({
        source_type: sourceType,
        source_id: notebookId,
        phase: ex.phase,
        agent_name: ex.agent_name,
        model: ex.model,
        tokens_in: ex.tokens_in,
        tokens_out: ex.tokens_out,
        cost_usd: ex.cost_usd,
        duration_ms: ex.duration_ms,
      }),
    )
    const updatedExecutions = [...(freshNotebook.llm_executions || []), ...newExecutions]
    await updateResearchNotebook(userId, notebookId, { llm_executions: updatedExecutions })
    setActiveNotebook(prev => prev && prev.id === notebookId
      ? { ...prev, llm_executions: updatedExecutions }
      : prev)
  }, [getFreshNotebookOrThrow, userId])

  async function handleGenerateVisualArtifact(artifact: StudioArtifact) {
    if (!userId || !activeNotebook?.id || visualGenLoading) return
    if (!['apresentacao', 'mapa_mental', 'infografico', 'tabela_dados'].includes(artifact.type)) return

    const uid = userId
    const notebookId = activeNotebook.id
    setVisualGenLoading(true)
    setVisualGeneratingArtifactId(artifact.id)

    try {
      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const currentArtifact = freshNotebook.artifacts.find(item => item.id === artifact.id) ?? artifact
      const parsed = parseArtifactContent(currentArtifact.type, currentArtifact.content)

      let nextContent = currentArtifact.content
      let successMessage = 'Imagem final atualizada com sucesso.'
      const visualExecutions: Array<{
        phase: string
        agent_name: string
        model: string
        tokens_in: number
        tokens_out: number
        cost_usd: number
        duration_ms: number
      }> = []

      if (currentArtifact.type === 'apresentacao' && parsed.kind === 'presentation') {
        const apiKey = await getOpenRouterKey()
        const media = await generatePresentationMediaAssets({
          apiKey,
          topic: activeNotebook.topic,
          description: activeNotebook.description || undefined,
        }, currentArtifact.content)
        const original = JSON.parse(currentArtifact.content) as Record<string, unknown>
        const sourceSlides = Array.isArray(original.slides) ? original.slides as Record<string, unknown>[] : []
        const updatedSlides: Record<string, unknown>[] = []

        for (let index = 0; index < parsed.data.slides.length; index++) {
          const slide = parsed.data.slides[index]
          const baseSlide = sourceSlides[index] || {}
          const generatedSlide = media.slideVisuals.find(item => item.slideNumber === slide.number)
          if (!generatedSlide) {
            throw new Error(`Não foi possível gerar o visual do slide ${slide.number}.`)
          }

          const storedImage = await uploadNotebookMediaArtifact(
            uid,
            notebookId,
            `${currentArtifact.title}-slide-${slide.number}`,
            generatedSlide.blob,
            'images',
            generatedSlide.extension,
          )

          updatedSlides.push({
            ...baseSlide,
            number: slide.number,
            title: slide.title,
            bullets: slide.bullets,
            speakerNotes: slide.speakerNotes,
            visualSuggestion: slide.visualSuggestion,
            renderedImageUrl: storedImage.url,
            renderedImageStoragePath: storedImage.path,
          })
        }
        visualExecutions.push(...media.executions)

        nextContent = JSON.stringify({
          ...original,
          title: parsed.data.title,
          slides: updatedSlides,
        }, null, 2)
        successMessage = `${updatedSlides.length} slide(s) visual(is) gerado(s) com sucesso.`
      } else if (currentArtifact.type === 'infografico' && parsed.kind === 'infographic') {
        const original = JSON.parse(currentArtifact.content) as Record<string, unknown>
        const media = await generateStructuredVisualArtifactMedia(currentArtifact.type, currentArtifact.content)
        const storedImage = await uploadNotebookMediaArtifact(
          uid,
          notebookId,
          `${currentArtifact.title}-infografico-final`,
          media.rendered.blob,
          'images',
          media.rendered.extension,
        )
        nextContent = JSON.stringify({
          ...original,
          renderedImageUrl: storedImage.url,
          renderedImageStoragePath: storedImage.path,
        }, null, 2)
        visualExecutions.push(media.execution)
      } else if (currentArtifact.type === 'mapa_mental' && parsed.kind === 'mindmap') {
        const original = JSON.parse(currentArtifact.content) as Record<string, unknown>
        const media = await generateStructuredVisualArtifactMedia(currentArtifact.type, currentArtifact.content)
        const storedImage = await uploadNotebookMediaArtifact(
          uid,
          notebookId,
          `${currentArtifact.title}-mapa-mental-final`,
          media.rendered.blob,
          'images',
          media.rendered.extension,
        )
        nextContent = JSON.stringify({
          ...original,
          renderedImageUrl: storedImage.url,
          renderedImageStoragePath: storedImage.path,
        }, null, 2)
        visualExecutions.push(media.execution)
      } else if (currentArtifact.type === 'tabela_dados' && parsed.kind === 'datatable') {
        const original = JSON.parse(currentArtifact.content) as Record<string, unknown>
        const media = await generateStructuredVisualArtifactMedia(currentArtifact.type, currentArtifact.content)
        const storedImage = await uploadNotebookMediaArtifact(
          uid,
          notebookId,
          `${currentArtifact.title}-tabela-final`,
          media.rendered.blob,
          'images',
          media.rendered.extension,
        )
        nextContent = JSON.stringify({
          ...original,
          renderedImageUrl: storedImage.url,
          renderedImageStoragePath: storedImage.path,
        }, null, 2)
        visualExecutions.push(media.execution)
      } else {
        throw new Error('O artefato visual não possui estrutura válida para gerar imagem final.')
      }

      const updatedArtifacts: StudioArtifact[] = freshNotebook.artifacts.map((current) =>
        current.id === currentArtifact.id
          ? {
              ...current,
              format: 'json',
              content: nextContent,
            }
          : current,
      )

      await updateResearchNotebook(uid, notebookId, { artifacts: updatedArtifacts })

      setActiveNotebook(prev => prev && prev.id === notebookId
        ? { ...prev, artifacts: updatedArtifacts }
        : prev)

      await appendNotebookExecutions(
        notebookId,
        currentArtifact.type === 'apresentacao' ? 'presentation_pipeline' : 'caderno_pesquisa',
        visualExecutions,
      )

      if (viewingArtifact?.id === currentArtifact.id) {
        const refreshed = updatedArtifacts.find(item => item.id === currentArtifact.id)
        if (refreshed) setViewingArtifact(refreshed)
      }

      toast.success(successMessage)
    } catch (error) {
      console.error('Visual artifact generation error:', error)
      const message = error instanceof Error ? error.message : 'Falha ao gerar mídia visual.'
      const isCapabilityError = message.toLowerCase().includes('capability')
        || message.toLowerCase().includes('modalities')
        || /não atende.*capability/i.test(message)
      if (isCapabilityError) {
        toast.error(
          'Modelo incompatível com geração de imagem',
          `${message} — Acesse Configurações → Pipeline de Apresentação e escolha um modelo com capacidade de imagem para "Gerador de Imagens de Slides".`,
        )
      } else {
        toast.error('Falha na geração visual', message)
      }
    } finally {
      setVisualGenLoading(false)
      setVisualGeneratingArtifactId(null)
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
      } else if (finalArtifact.type === 'audio_script' && ENABLE_LITERAL_MEDIA_AUTOGENERATION) {
        setActiveTab('artifacts')
        void handleGenerateAudioFromArtifact(finalArtifact)
      } else if (
        ['apresentacao', 'mapa_mental', 'infografico', 'tabela_dados'].includes(finalArtifact.type)
        && ENABLE_LITERAL_MEDIA_AUTOGENERATION
      ) {
        setActiveTab('artifacts')
        void handleGenerateVisualArtifact(finalArtifact)
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
      let reportTaskProgress: (update: { progress: number; phase: string; stageMeta?: string; operationals?: TaskOperationalSummary }) => void = () => {}
      let videoTaskOperationalSummary = createEmptyOperationalSummary()
    startTask(taskName, (onTaskProgress) => {
        reportTaskProgress = onTaskProgress
        onTaskProgress({ progress: 0, phase: 'Preparando pipeline...', operationals: videoTaskOperationalSummary })
        return taskPromise
      })

    try {
      setVideoGenLoading(true)
      setVideoGenLastCheckpoint(null)
      setVideoGenStartedAt(Date.now())
      setVideoGenOperationalSummary(createEmptyOperationalSummary())
      videoGenOperationalEventKeysRef.current = new Set()
      const apiKey = await getOpenRouterKey()
      if (!apiKey) {
        toast.error('Chave da API não configurada. Acesse Configurações > Chaves de API.')
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

      const onProgress: VideoGenerationProgressCallback = (step, total, phase, agent, meta) => {
        const progress = buildVideoPipelineProgress(step, total, phase, agent, meta)
        setVideoGenProgress(progress)

        const eventKey = buildOperationalEventKey({
          phase,
          costUsd: progress.costUsd,
          durationMs: progress.durationMs,
          retryCount: progress.retryCount,
          usedFallback: progress.usedFallback,
          fallbackFrom: progress.fallbackFrom,
        })
        if (eventKey && !videoGenOperationalEventKeysRef.current.has(eventKey)) {
          videoGenOperationalEventKeysRef.current.add(eventKey)
          videoTaskOperationalSummary = accumulateOperationalSummary(videoTaskOperationalSummary, {
            phase,
            costUsd: progress.costUsd,
            durationMs: progress.durationMs,
            retryCount: progress.retryCount,
            usedFallback: progress.usedFallback,
            fallbackFrom: progress.fallbackFrom,
          })
          setVideoGenOperationalSummary(videoTaskOperationalSummary)
        }

        reportTaskProgress({
          progress: progress.percent,
          phase: progress.stageLabel ? `${progress.stageLabel}: ${progress.stageDescription || progress.phase}` : (agent ? `${agent}: ${phase}` : phase),
          stageMeta: progress.stageMeta,
          operationals: videoTaskOperationalSummary,
        })
      }

      const result = await runVideoGenerationPipeline({
        apiKey,
        scriptContent,
        topic: activeNotebook.topic,
        sourceId: activeNotebook.id,
        generateMedia: true,
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
      setVideoProduction(result.package)
      setShowVideoGenCost(false)
      setVideoGenSavedArtifact(null)

      // Report media generation status
      if (result.mediaErrors && result.mediaErrors.length > 0) {
        toast.warning(
          'Vídeo gerado com avisos',
          `${result.mediaErrors.length} erro(s) na geração de mídia. Verifique as notas de produção.`,
        )
      } else {
        const totalClips = result.package.scenes.reduce((sum, s) => sum + (s.clips?.length || 0), 0)
        const clipsWithImages = result.package.scenes.reduce((sum, s) => sum + (s.clips?.filter(c => c.generatedImageUrl).length || 0), 0)
        toast.success(`Vídeo gerado! ${clipsWithImages}/${totalClips} clips com imagem, narração pronta.`)
      }
      resolveTask(result.package)
    } catch (err) {
      console.error('Video generation error:', err)
      rejectTask(err)
      // Capture checkpoint from the thrown error for potential resume
      const checkpoint = (err as Error & { videoCheckpoint?: VideoCheckpoint }).videoCheckpoint ?? null
      if (checkpoint && checkpoint.completedStep > 0) {
        setVideoGenLastCheckpoint(checkpoint)
      }
      const errMsg = err instanceof Error ? err.message : String(err)
      if (errMsg.includes('429')) {
        toast.warning(
          'Limite de requisições atingido',
          checkpoint ? `Progresso salvo (${checkpoint.completedStep}/${checkpoint.totalSteps} etapas). Aguarde e tente novamente.` : 'O modelo está sobrecarregado. Aguarde alguns minutos e tente novamente.',
        )
      } else if (errMsg.includes('401') || errMsg.toLowerCase().includes('auth')) {
        toast.error('Chave de API inválida', 'Verifique sua chave de API nas configurações.')
      } else if (errMsg.includes('timeout') || errMsg.includes('TIMEOUT')) {
        toast.error('Tempo esgotado', checkpoint ? `Progresso salvo (${checkpoint.completedStep}/${checkpoint.totalSteps} etapas). Tente um modelo mais rápido.` : 'O modelo demorou muito para responder. Tente um modelo mais rápido.')
      } else if (errMsg.includes('model') || errMsg.includes('Model')) {
        toast.error('Modelo indisponível', 'O modelo configurado não está disponível. Altere nas configurações do pipeline.')
      } else {
        toast.error('Erro ao gerar vídeo', checkpoint ? `Progresso salvo (${checkpoint.completedStep}/${checkpoint.totalSteps} etapas). Verifique sua conexão e tente novamente.` : 'Verifique sua conexão, chave de API e configuração dos modelos.')
      }
    } finally {
      setVideoGenLoading(false)
      setVideoGenProgress(null)
      setVideoGenStartedAt(null)
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
        toast.error('Chave da API não configurada. Acesse Configurações > Chaves de API.')
        return
      }

      const synthesis = await generateAudioLiteralMedia({
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

      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const updatedArtifacts: StudioArtifact[] = freshNotebook.artifacts.map((current): StudioArtifact => {
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

      await appendNotebookExecutions(notebookId, 'audio_pipeline', [{
        ...synthesis.execution,
      }])

      setActiveNotebook(prev => prev && prev.id === notebookId
        ? { ...prev, artifacts: updatedArtifacts }
        : prev)

      if (viewingArtifact?.id === artifact.id) {
        const refreshed = updatedArtifacts.find(a => a.id === artifact.id)
        if (refreshed) setViewingArtifact(refreshed)
      }

      toast.success('Resumo em áudio gerado com sucesso!', `${synthesis.chunkCount} parte(s) sintetizada(s)`)    
    } catch (err) {
      console.error('Audio literal generation error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      const isCapabilityError = msg.toLowerCase().includes('capability')
        || msg.toLowerCase().includes('modalities')
        || /não atende.*capability/i.test(msg)
      if (isCapabilityError) {
        toast.error(
          'Modelo incompatível com geração de áudio',
          `${msg} — Acesse Configurações → Pipeline de Áudio e escolha um modelo com capacidade de áudio para "Narrador / TTS".`,
        )
      } else if (msg.includes('429')) {
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
  const isInlineMediaUrl = (value?: string): value is string => Boolean(value && (value.startsWith('blob:') || value.startsWith('data:')))

  const compactLiteralGenerationState = (state?: VideoProductionPackage['literalGenerationState']) => {
    if (!state) return undefined
    return {
      ...state,
      errors: state.errors.slice(-8),
      events: state.events?.slice(-12).map(event => ({
        at: event.at,
        type: event.type,
        phase: event.phase,
        sceneNumber: event.sceneNumber,
        partNumber: event.partNumber,
        attempt: event.attempt,
        message: event.message,
      })),
      scenes: state.scenes.map(scene => ({
        sceneNumber: scene.sceneNumber,
        imageStatus: scene.imageStatus,
        narrationStatus: scene.narrationStatus,
        clipsStatus: scene.clipsStatus,
        imageAttempts: scene.imageAttempts,
        narrationAttempts: scene.narrationAttempts,
        clipsAttempts: scene.clipsAttempts,
        clipPartsCompleted: scene.clipPartsCompleted,
        clipPartsTotal: scene.clipPartsTotal,
        lastError: scene.lastError,
        updatedAt: scene.updatedAt,
      })),
    }
  }

  const compactVideoProductionForPersistence = (production: VideoProductionPackage): VideoProductionPackage => {
    const sceneAssets = (production.sceneAssets || []).map(sceneAsset => ({
      sceneNumber: sceneAsset.sceneNumber,
      imageUrl: isInlineMediaUrl(sceneAsset.imageUrl) ? undefined : sceneAsset.imageUrl,
      narrationUrl: isInlineMediaUrl(sceneAsset.narrationUrl) ? undefined : sceneAsset.narrationUrl,
      imageStoragePath: sceneAsset.imageStoragePath,
      narrationStoragePath: sceneAsset.narrationStoragePath,
      videoClips: sceneAsset.videoClips?.map(clip => ({
        sceneNumber: clip.sceneNumber,
        partNumber: clip.partNumber,
        startTime: clip.startTime,
        endTime: clip.endTime,
        duration: clip.duration,
        url: isInlineMediaUrl(clip.url) ? '' : clip.url,
        mimeType: clip.mimeType,
        generatedAt: clip.generatedAt,
        source: clip.source,
        generationEngine: clip.generationEngine,
        providerName: clip.providerName,
        providerJobId: clip.providerJobId,
        storagePath: clip.storagePath,
      })).filter(clip => Boolean(clip.url)),
    }))
    const sceneAssetMap = new globalThis.Map(sceneAssets.map(asset => [asset.sceneNumber, asset] as const))

    return {
      ...production,
      scenes: production.scenes.map(scene => ({
        ...scene,
        generatedImageUrl: undefined,
        clips: scene.clips?.map(clip => ({
          ...clip,
          generatedImageUrl: undefined,
        })) || [],
      })),
      narration: production.narration.map(segment => ({
        ...segment,
        generatedAudioUrl: isInlineMediaUrl(segment.generatedAudioUrl) ? undefined : segment.generatedAudioUrl,
      })),
      tracks: production.tracks.map(track => ({
        ...track,
        segments: track.segments.map(segment => {
          let generatedMediaUrl: string | undefined = isInlineMediaUrl(segment.generatedMediaUrl) ? undefined : segment.generatedMediaUrl
          const sceneAsset = segment.sceneNumber ? sceneAssetMap.get(segment.sceneNumber) : undefined
          if (track.type === 'narration') {
            generatedMediaUrl = sceneAsset?.narrationUrl || generatedMediaUrl
          } else if (track.type === 'video') {
            const clipUrl = segment.clipNumber
              ? sceneAsset?.videoClips?.find((clip) => clip.partNumber === segment.clipNumber)?.url
              : undefined
            generatedMediaUrl = clipUrl || sceneAsset?.imageUrl || generatedMediaUrl
          }
          return {
            ...segment,
            generatedMediaUrl,
          }
        }),
      })),
      sceneAssets,
      soundtrackAsset: production.soundtrackAsset && !isInlineMediaUrl(production.soundtrackAsset.url)
        ? {
            url: production.soundtrackAsset.url,
            mimeType: production.soundtrackAsset.mimeType,
            generatedAt: production.soundtrackAsset.generatedAt,
            description: production.soundtrackAsset.description,
            storagePath: production.soundtrackAsset.storagePath,
          }
        : undefined,
      renderedVideo: production.renderedVideo && !isInlineMediaUrl(production.renderedVideo.url)
        ? {
            url: production.renderedVideo.url,
            mimeType: production.renderedVideo.mimeType,
            generatedAt: production.renderedVideo.generatedAt,
            storagePath: production.renderedVideo.storagePath,
          }
        : undefined,
      renderedScopes: production.renderedScopes?.map(scope => ({
        url: isInlineMediaUrl(scope.url) ? '' : scope.url,
        mimeType: scope.mimeType,
        generatedAt: scope.generatedAt,
        storagePath: scope.storagePath,
        scope: scope.scope,
        scopeKey: scope.scopeKey,
        label: scope.label,
        presetId: scope.presetId,
        sceneNumber: scope.sceneNumber,
        partNumber: scope.partNumber,
      })).filter(scope => Boolean(scope.url)),
      literalGenerationState: compactLiteralGenerationState(production.literalGenerationState),
    }
  }

  const handleSaveVideoStudioToNotebook = async (
    production: VideoProductionPackage,
    options?: { silent?: boolean; syncEditorState?: boolean },
  ): Promise<VideoProductionPackage> => {
    if (!userId || !activeNotebook?.id) {
      throw new Error('Usuário ou caderno indisponível para salvar produção de vídeo.')
    }
    const uid = userId
    const notebookId = activeNotebook.id
    try {
      const uploadCache = videoStudioUploadCacheRef.current
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

      const resolveMediaBlob = async (url: string, runtimeBlob?: Blob): Promise<Blob> => {
        if (runtimeBlob) return runtimeBlob
        const response = await fetch(url)
        return response.blob()
      }

      let productionToSave = production
      const renderedVideoUrl = production.renderedVideo?.url || ''

      if (renderedVideoUrl && (renderedVideoUrl.startsWith('blob:') || renderedVideoUrl.startsWith('data:'))) {
        const storedVideo = uploadCache.get(renderedVideoUrl) || await (async () => {
          const videoBlob = await resolveMediaBlob(renderedVideoUrl, production.renderedVideo?.blob)
          const stored = await uploadWithRetry(
            'Upload do vídeo final',
            () => uploadNotebookVideoArtifact(
              uid,
              notebookId,
              production.title,
              videoBlob,
            ),
          )
          uploadCache.set(renderedVideoUrl, stored)
          return stored
        })()
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
          const stored = uploadCache.get(renderedScope.url) || await (async () => {
            const scopedBlob = await resolveMediaBlob(renderedScope.url, renderedScope.blob)
            const uploaded = await uploadWithRetry(
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
            uploadCache.set(renderedScope.url, uploaded)
            return uploaded
          })()
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
          const stored = uploadCache.get(imageUrl) || await (async () => {
            const imageBlob = await fetch(imageUrl).then(resp => resp.blob())
            const uploaded = await uploadWithRetry(
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
            uploadCache.set(imageUrl, uploaded)
            return uploaded
          })()
          imageUrl = stored.url
          imageStoragePath = stored.path
        }

        if (narrationUrl && (narrationUrl.startsWith('blob:') || narrationUrl.startsWith('data:'))) {
          const stored = uploadCache.get(narrationUrl) || await (async () => {
            const narrationBlob = await resolveMediaBlob(narrationUrl, sceneAsset.narrationBlob)
            const uploaded = await uploadWithRetry(
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
            uploadCache.set(narrationUrl, uploaded)
            return uploaded
          })()
          narrationUrl = stored.url
          narrationStoragePath = stored.path
        }

        if (videoClips?.length) {
          videoClips = await Promise.all(videoClips.map(async clip => {
            if (!clip.url || (!clip.url.startsWith('blob:') && !clip.url.startsWith('data:'))) return clip
            const stored = uploadCache.get(clip.url) || await (async () => {
              const clipBlob = await resolveMediaBlob(clip.url, clip.blob)
              const uploaded = await uploadWithRetry(
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
              uploadCache.set(clip.url, uploaded)
              return uploaded
            })()
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
        const stored = uploadCache.get(soundtrackAsset.url) || await (async () => {
          const soundtrackBlob = await resolveMediaBlob(soundtrackAsset.url, soundtrackAsset.blob)
          const uploaded = await uploadWithRetry(
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
          uploadCache.set(soundtrackAsset.url, uploaded)
          return uploaded
        })()
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

      productionToSave = compactVideoProductionForPersistence(productionToSave)

      const artifactTitle = `Estúdio de Vídeo: ${production.title}`
      const content = JSON.stringify(productionToSave)
      const freshNotebook = await getFreshNotebookOrThrow(notebookId)

      // Check if a video studio artifact with same title already exists — update instead of duplicate
      const existingIdx = freshNotebook.artifacts.findIndex(
        a => a.type === 'video_script' && a.format === 'json' && a.title === artifactTitle
      )

      let updatedArtifacts: StudioArtifact[]
      if (existingIdx >= 0) {
        // Update existing artifact
        updatedArtifacts = [...freshNotebook.artifacts]
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
        updatedArtifacts = [...freshNotebook.artifacts, artifact]
      }

      await updateResearchNotebook(userId, notebookId, {
        artifacts: updatedArtifacts,
      })
      setActiveNotebook(prev => prev && prev.id === notebookId ? { ...prev, artifacts: updatedArtifacts } : prev)
      if (options?.syncEditorState !== false) {
        setVideoProduction(productionToSave)
      }
      if (!options?.silent) {
        toast.success(existingIdx >= 0 ? 'Estúdio de vídeo atualizado!' : 'Estúdio de vídeo salvo nos artefatos do caderno!')
      }
      return productionToSave
    } catch (err) {
      console.error('Error saving video studio artifact:', err)
      if (!options?.silent) {
        toast.error('Erro ao salvar estúdio nos artefatos.')
      }
      throw err
    }
  }

  const handleRunLiteralVideoStudioProduction = useCallback(async (production: VideoProductionPackage) => {
    if (!userId || !activeNotebook?.id || videoStudioLiteralLoading) return

    const notebookId = activeNotebook.id
    const apiKey = videoStudioApiKey || await getOpenRouterKey()
    if (!apiKey) {
      toast.error('Chave da API não configurada. Acesse Configurações > Chaves de API.')
      return
    }

    const taskName = `Vídeo literal: ${production.title.slice(0, 40)}`
    let reportTaskProgress: (update: { progress: number; phase: string; stageMeta?: string; operationals?: TaskOperationalSummary }) => void = () => {}
    let literalTaskOperationalSummary = createEmptyOperationalSummary()
    let resolveTask: (value: VideoProductionPackage) => void = () => {}
    let rejectTask: (reason?: unknown) => void = () => {}
    const taskPromise = new Promise<VideoProductionPackage>((resolve, reject) => {
      resolveTask = resolve
      rejectTask = reject
    })

    startTask(taskName, (onTaskProgress) => {
        reportTaskProgress = onTaskProgress
        onTaskProgress({ progress: 0, phase: 'Preparando geração literal...', stageMeta: 'Validando assets, checkpoints e provider de mídia', operationals: literalTaskOperationalSummary })
      return taskPromise
    })

    try {
      setVideoStudioLiteralLoading(true)
      setVideoStudioLiteralStartedAt(Date.now())
      setVideoStudioApiKey(apiKey)
      setVideoLiteralOperationalSummary(createEmptyOperationalSummary())
      videoLiteralOperationalEventKeysRef.current = new Set()

      const onProgress: VideoGenerationProgressCallback = (step, total, phase, agent, meta) => {
        const progress = buildVideoPipelineProgress(step, total, phase, agent, meta)
        setVideoStudioLiteralProgress(progress)
        const eventKey = buildOperationalEventKey({
          phase,
          costUsd: progress.costUsd,
          durationMs: progress.durationMs,
          retryCount: progress.retryCount,
          usedFallback: progress.usedFallback,
          fallbackFrom: progress.fallbackFrom,
        })
        if (eventKey && !videoLiteralOperationalEventKeysRef.current.has(eventKey)) {
          videoLiteralOperationalEventKeysRef.current.add(eventKey)
          literalTaskOperationalSummary = accumulateOperationalSummary(literalTaskOperationalSummary, {
            phase,
            costUsd: progress.costUsd,
            durationMs: progress.durationMs,
            retryCount: progress.retryCount,
            usedFallback: progress.usedFallback,
            fallbackFrom: progress.fallbackFrom,
          })
          setVideoLiteralOperationalSummary(literalTaskOperationalSummary)
        }
        reportTaskProgress({
          progress: progress.percent,
          phase: progress.stageLabel ? `${progress.stageLabel}: ${progress.stageDescription || progress.phase}` : (agent ? `${agent}: ${phase}` : phase),
          stageMeta: progress.stageMeta,
          operationals: literalTaskOperationalSummary,
        })
      }

      const media = await generateLiteralMediaAssets(
        apiKey,
        production,
        onProgress,
        async (partialProduction) => {
          const persisted = await handleSaveVideoStudioToNotebook(partialProduction, { silent: true, syncEditorState: false })
          setVideoProduction(persisted)
        },
      )

      await appendNotebookExecutions(notebookId, 'video_pipeline', media.executions)

      const renderStartedAt = Date.now()
      let renderedAsset: RenderedVideoAsset
      let renderModel = 'browser/video'
      let usedExternalProvider = false
      try {
        const localRendered = await renderLiteralVideo(media.production, onProgress)
        renderedAsset = localRendered.asset
        renderModel = `browser/${localRendered.asset.mimeType}`
      } catch (renderError) {
        // If local rendering fails (canvas OOM, MediaRecorder unsupported, quota exceeded),
        // try the external video provider as fallback when configured.
        const renderMsg = renderError instanceof Error ? renderError.message : String(renderError)
        const isRenderInfraError = /mediarecorder|canvas|quota|oom|memory|encodererror|securityerror/i.test(renderMsg)
          || renderMsg.includes('NotSupportedError')
          || renderMsg.includes('NotAllowedError')

        if (isRenderInfraError && isExternalVideoProviderConfigured()) {
          onProgress(0, 1, 'Renderer local falhou. Tentando provedor externo de vídeo...', 'Provedor Externo')
          toast.info('Renderer local indisponível', 'Tentando provedor externo de vídeo como fallback...')

          const firstScene = media.production.scenes?.[0]
          const clipResult = await requestExternalVideoClip({
            prompt: firstScene?.imagePrompt || media.production.title,
            durationSeconds: 30,
            aspectRatio: '16:9',
          })

          if (clipResult?.url) {
            const videoResp = await fetch(clipResult.url)
            const videoBlob = await videoResp.blob()
            const videoUrl = URL.createObjectURL(videoBlob)
            renderedAsset = {
              url: videoUrl,
              mimeType: clipResult.mimeType || 'video/mp4',
              generatedAt: new Date().toISOString(),
              blob: videoBlob,
            }
            renderModel = `external/${clipResult.provider}`
            usedExternalProvider = true
          } else {
            throw renderError
          }
        } else {
          throw renderError
        }
      }

      const persistedFinal = await handleSaveVideoStudioToNotebook({
        ...media.production,
        renderedVideo: renderedAsset,
      }, { silent: true, syncEditorState: false })

      await appendNotebookExecutions(notebookId, 'video_pipeline', [{
        phase: usedExternalProvider ? 'external_video_render' : 'media_video_render',
        agent_name: usedExternalProvider ? 'Provedor Externo de Vídeo' : 'Renderizador de Vídeo',
        model: renderModel,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        duration_ms: Date.now() - renderStartedAt,
      }])

      if (usedExternalProvider) {
        literalTaskOperationalSummary = accumulateOperationalSummary(literalTaskOperationalSummary, {
          phase: 'external_video_render',
          durationMs: Date.now() - renderStartedAt,
          usedFallback: true,
          fallbackReason: 'Render final enviado para provedor externo',
          fallbackFrom: 'browser-renderer',
        })
        setVideoLiteralOperationalSummary(literalTaskOperationalSummary)
        reportTaskProgress({
          progress: 100,
          phase: 'Render finalizado por provedor externo',
          stageMeta: renderModel,
          operationals: literalTaskOperationalSummary,
        })
      }

      setVideoProduction(persistedFinal)

      if (viewingArtifact?.type === 'video_script') {
        const freshNotebook = await getFreshNotebookOrThrow(notebookId)
        const refreshed = freshNotebook.artifacts.find(item => item.title === `Estúdio de Vídeo: ${persistedFinal.title}`)
        if (refreshed) setViewingArtifact(refreshed)
      }

      if (media.errors.length > 0) {
        toast.warning(
          'Vídeo literal retomado com avisos',
          `${media.errors.length} etapa(s) falharam. O checkpoint foi salvo para nova retomada sem perder progresso.`,
        )
      } else if (usedExternalProvider) {
        toast.success('Vídeo gerado via provedor externo', 'O renderer local não estava disponível; o vídeo foi produzido pelo provedor externo configurado.')
      } else {
        toast.success('Vídeo literal concluído e salvo com sucesso!')
      }

      resolveTask(persistedFinal)
    } catch (error) {
      console.error('Literal video studio generation error:', error)
      const message = error instanceof Error ? error.message : String(error)
      const isCapabilityError = message.toLowerCase().includes('capability')
        || message.toLowerCase().includes('modalities')
        || /não atende.*capability/i.test(message)
      if (isCapabilityError) {
        toast.error(
          'Modelo incompatível com geração de vídeo',
          `${message} — Acesse Configurações → Pipeline de Vídeo e escolha modelos compatíveis (imagem para "Gerador de Imagens", áudio para "Narrador TTS").`,
        )
      } else {
        toast.error(
          'Falha na geração literal do vídeo',
          `${message} — O progresso parcial foi salvo. Clique novamente em "Produzir vídeo literal" para retomar a partir da última cena concluída.`,
        )
      }
      rejectTask(error)
    } finally {
      setVideoStudioLiteralLoading(false)
      setVideoStudioLiteralProgress(null)
      setVideoStudioLiteralStartedAt(null)
    }
  }, [activeNotebook?.id, getFreshNotebookOrThrow, startTask, userId, videoStudioApiKey, videoStudioLiteralLoading, viewingArtifact?.type])

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

  const studioContextAudit = useMemo(() => buildStudioContextAudit({
    sources: activeNotebook?.sources || [],
    messages: activeNotebook?.messages || [],
    customInstructions: studioCustomPrompt,
    minSourceChars: MIN_SOURCE_CHARS,
    maxSourceCharsPerSource: MAX_CONTEXT_TEXT_LENGTH,
    maxConversationMessages: MAX_STUDIO_CONTEXT_MESSAGES,
    maxConversationChars: MAX_STUDIO_CONTEXT_CHARS,
  }), [activeNotebook?.messages, activeNotebook?.sources, studioCustomPrompt])

  const chatContextAuditPreview = useMemo(() => buildChatContextAudit({
    sources: activeNotebook?.sources || [],
    messages: activeNotebook?.messages || [],
    minSourceChars: MIN_SOURCE_CHARS,
    maxSourceCharsPerSource: MAX_CONTEXT_TEXT_LENGTH,
    maxConversationMessages: MAX_CONVERSATION_CONTEXT_MESSAGES,
    maxConversationChars: MAX_STUDIO_CONTEXT_CHARS,
    liveWebEnabled: useWebSearch,
  }), [activeNotebook?.messages, activeNotebook?.sources, useWebSearch])

  const researchContextAuditPreview = useMemo(() => buildResearchContextAudit({
    variant: 'external',
    mode: 'preview',
    query: externalSearchQuery,
    tribunalCount: lastJurisprudenceTribunalAliases.length,
    sourceKindLabel: 'Pesquisa externa',
  }), [externalSearchQuery, lastJurisprudenceTribunalAliases.length])

  const sortedSavedSearches = useMemo(() => {
    if (!activeNotebook?.saved_searches) return [] as NotebookSavedSearchEntry[]
    const filtered = activeNotebook.saved_searches.filter(search => {
      if (savedSearchVariantFilter !== 'all' && search.variant !== savedSearchVariantFilter) return false
      const needle = savedSearchFilter.trim().toLowerCase()
      if (!needle) return true
      return search.title.toLowerCase().includes(needle)
        || search.query.toLowerCase().includes(needle)
        || (search.sourceKindLabel || '').toLowerCase().includes(needle)
        || (search.tags || []).some(tag => tag.toLowerCase().includes(needle))
    })
    return [...filtered].sort((left, right) => {
      const pinDelta = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
      if (pinDelta !== 0) return pinDelta
      return right.updated_at.localeCompare(left.updated_at)
    })
  }, [activeNotebook?.saved_searches, savedSearchFilter, savedSearchVariantFilter])

  const savedSearchVariantCounts = useMemo(() => {
    const allSearches = activeNotebook?.saved_searches || []
    return {
      all: allSearches.length,
      external: allSearches.filter(search => search.variant === 'external').length,
      deep: allSearches.filter(search => search.variant === 'deep').length,
      jurisprudencia: allSearches.filter(search => search.variant === 'jurisprudencia').length,
    }
  }, [activeNotebook?.saved_searches])

  const visibleResearchAudits = useMemo(() => {
    const audits = activeNotebook?.research_audits || []
    return showAllResearchAudits ? audits : audits.slice(0, 3)
  }, [activeNotebook?.research_audits, showAllResearchAudits])

  const visibleSavedSearches = useMemo(() => {
    return showAllSavedSearches ? sortedSavedSearches : sortedSavedSearches.slice(0, 4)
  }, [showAllSavedSearches, sortedSavedSearches])

  const visibleSavedSearchIds = useMemo(
    () => visibleSavedSearches.map(search => search.id),
    [visibleSavedSearches],
  )

  const allVisibleSavedSearchesSelected = useMemo(
    () => visibleSavedSearchIds.length > 0 && visibleSavedSearchIds.every(id => selectedSavedSearchIds.has(id)),
    [selectedSavedSearchIds, visibleSavedSearchIds],
  )

  useEffect(() => {
    const allowedIds = new Set(sortedSavedSearches.map(search => search.id))
    setSelectedSavedSearchIds(current => {
      const next = new Set(Array.from(current).filter(id => allowedIds.has(id)))
      if (next.size === current.size) return current
      return next
    })
  }, [sortedSavedSearches])

  const pinnedSavedSearches = useMemo(
    () => visibleSavedSearches.filter(search => search.pinned),
    [visibleSavedSearches],
  )

  const regularSavedSearches = useMemo(
    () => visibleSavedSearches.filter(search => !search.pinned),
    [visibleSavedSearches],
  )

  // ── Jurisprudence analytics (derived from results_raw in sources) ──
  const jurisprudenceAnalytics = useMemo(() => {
    if (!activeNotebook) return null
    const allResults: DataJudResult[] = []
    for (const source of activeNotebook.sources) {
      if (source.type === 'jurisprudencia' && source.results_raw) {
        try {
          const parsed = JSON.parse(source.results_raw) as DataJudResult[]
          allResults.push(...parsed)
        } catch { /* ignore parse errors */ }
      }
    }
    if (allResults.length === 0) return null
    return buildJurisprudenceAnalytics(allResults)
  }, [activeNotebook?.sources])

  const acervoTrailSteps = useMemo(() => buildAcervoTrailSteps({
    phase: acervoAnalysisPhase,
    message: acervoAnalysisMessage,
    loading: acervoAnalysisLoading,
    stageMeta: acervoAnalysisMeta || undefined,
    error: acervoAnalysisError || undefined,
  }), [acervoAnalysisError, acervoAnalysisLoading, acervoAnalysisMessage, acervoAnalysisMeta, acervoAnalysisPhase])

  const acervoProgressState = useMemo(() => buildAcervoModalProgressState({
    phase: acervoAnalysisPhase,
    message: acervoAnalysisMessage,
    percent: acervoAnalysisPercent,
    loading: acervoAnalysisLoading,
    stageMeta: acervoAnalysisMeta || undefined,
    error: acervoAnalysisError || undefined,
  }), [acervoAnalysisError, acervoAnalysisLoading, acervoAnalysisMessage, acervoAnalysisMeta, acervoAnalysisPercent, acervoAnalysisPhase])

  const studioTrailSteps = useMemo(
    () => buildStudioTrailSteps(selectedStudioTask ?? undefined, selectedStudioTaskMetadata?.artifactType ?? null),
    [selectedStudioTask, selectedStudioTaskMetadata],
  )

  const studioProgressState = useMemo(
    () => buildStudioModalProgressState(selectedStudioTask ?? undefined, selectedStudioTaskMetadata?.artifactType ?? null),
    [selectedStudioTask, selectedStudioTaskMetadata],
  )

  const notebookOperationalSummaries = useMemo(() => buildNotebookOperationalSummaries({
    acervoLoading: acervoAnalysisLoading,
    acervoState: acervoProgressState,
    acervoStartedAt: acervoAnalysisStartedAt,
    acervoAggregate: acervoOperationalSummary as NotebookOperationalAggregate,
    studioTask: selectedStudioTask ?? undefined,
    studioArtifactLabel: selectedStudioTaskMetadata?.artifactLabel ?? null,
    videoGeneration: videoGenProgress,
    videoGenerationStartedAt: videoGenStartedAt,
    videoGenerationAggregate: videoGenOperationalSummary as NotebookOperationalAggregate,
    videoLiteral: videoStudioLiteralProgress,
    videoLiteralStartedAt: videoStudioLiteralStartedAt,
    videoLiteralAggregate: videoLiteralOperationalSummary as NotebookOperationalAggregate,
  }), [
    acervoAnalysisLoading,
    acervoAnalysisStartedAt,
    acervoOperationalSummary,
    acervoProgressState,
    selectedStudioTask,
    selectedStudioTaskMetadata,
    videoGenProgress,
    videoGenStartedAt,
    videoGenOperationalSummary,
    videoStudioLiteralProgress,
    videoStudioLiteralStartedAt,
    videoLiteralOperationalSummary,
  ])

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
            Configure o Firebase em Configurações para habilitar o Caderno de Pesquisa.
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

      {notebookOperationalSummaries.length > 0 && (
        <div className="border-b bg-gradient-to-r from-slate-50 via-white to-slate-50 px-4 py-3 shrink-0">
          <div className="max-w-7xl mx-auto space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <Sparkles className="w-3.5 h-3.5 text-brand-600" />
              Operações em execução
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {notebookOperationalSummaries.map(summary => {
                const toneClasses = summary.tone === 'amber'
                  ? 'border-amber-200 bg-amber-50'
                  : summary.tone === 'violet'
                    ? 'border-violet-200 bg-violet-50'
                    : summary.tone === 'rose'
                      ? 'border-rose-200 bg-rose-50'
                      : 'border-sky-200 bg-sky-50'
                const barClasses = summary.tone === 'amber'
                  ? 'bg-amber-500'
                  : summary.tone === 'violet'
                    ? 'bg-violet-500'
                    : summary.tone === 'rose'
                      ? 'bg-rose-500'
                      : 'bg-sky-500'

                return (
                  <div key={summary.id} className={`rounded-xl border px-4 py-3 ${toneClasses}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900">{summary.title}</p>
                        <p className="text-[11px] text-gray-600 truncate mt-0.5">{summary.stageLabel || summary.subtitle}</p>
                        <p className="text-[10px] text-gray-500 truncate mt-1">{summary.stageMeta || summary.subtitle}</p>
                        {summary.aggregateLabel && (
                          <p className="text-[10px] text-gray-600 mt-1">{summary.aggregateLabel}</p>
                        )}
                        {summary.detailLabel && (
                          <p className="text-[10px] text-gray-500 mt-1">{summary.detailLabel}</p>
                        )}
                        {summary.degradationLabel && (
                          <p className="text-[10px] text-amber-700 mt-1">{summary.degradationLabel}</p>
                        )}
                        {summary.etaLabel && (
                          <p className="text-[10px] text-gray-400 mt-1">ETA aprox.: {summary.etaLabel}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] font-semibold text-gray-700">{summary.progress}%</span>
                        {summary.kind === 'acervo' && (
                          <button
                            onClick={() => setShowAcervoProgressModal(true)}
                            className="px-2.5 py-1 rounded-lg bg-white/90 text-[11px] font-medium text-gray-700 hover:bg-white transition-colors border border-white/70"
                          >
                            Abrir trilha
                          </button>
                        )}
                        {summary.kind === 'studio' && selectedStudioTask && (
                          <button
                            onClick={() => {
                              setSelectedStudioTaskId(selectedStudioTask.id)
                              setShowStudioProgressModal(true)
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white/90 text-[11px] font-medium text-gray-700 hover:bg-white transition-colors border border-white/70"
                          >
                            Abrir modal
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2.5 w-full h-2 rounded-full bg-white/70 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barClasses}`}
                        style={{ width: `${Math.max(2, summary.progress)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

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

              <div className="bg-white rounded-xl border p-5 space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <BookMarked className="w-4 h-4 text-brand-600" />
                  Memória Auditável do Estúdio
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Fontes elegíveis</p>
                    <p className="text-sm text-gray-800 mt-0.5">
                      {studioContextAudit.sourceSummary.includedSources}/{studioContextAudit.sourceSummary.totalSources}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Fontes truncadas</p>
                    <p className="text-sm text-gray-800 mt-0.5">{studioContextAudit.sourceSummary.truncatedSources}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Janela de conversa</p>
                    <p className="text-sm text-gray-800 mt-0.5">
                      {studioContextAudit.conversationSummary.includedMessages}/{studioContextAudit.conversationSummary.totalMessages}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Contexto previsto</p>
                    <p className="text-sm text-gray-800 mt-0.5">{formatContextChars(studioContextAudit.totalContextChars)}</p>
                  </div>
                </div>
                <div className="space-y-2 text-[11px] text-gray-500">
                  <p>
                    Fontes incluídas: {formatContextChars(studioContextAudit.sourceSummary.includedChars)}
                    {studioContextAudit.sourceSummary.droppedSources > 0 ? ` · ${studioContextAudit.sourceSummary.droppedSources} fora da janela útil` : ''}
                  </p>
                  <p>
                    Conversa incluída: {formatContextChars(studioContextAudit.conversationSummary.includedChars)}
                    {studioContextAudit.conversationSummary.droppedMessages > 0 ? ` · ${studioContextAudit.conversationSummary.droppedMessages} mensagem(ns) antigas descartadas` : ''}
                    {studioContextAudit.conversationSummary.truncatedByChars ? ' · truncada por limite de caracteres' : ''}
                  </p>
                  <p>
                    Instruções adicionais: {studioContextAudit.customInstructionsChars > 0
                      ? formatContextChars(studioContextAudit.customInstructionsChars)
                      : 'nenhuma'}
                  </p>
                </div>
                {studioContextAudit.sourceEntries.some(entry => entry.included) && (
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Fontes atualmente promovidas ao estúdio</p>
                    <div className="space-y-2">
                      {studioContextAudit.sourceEntries.filter(entry => entry.included).slice(0, 4).map(entry => (
                        <div key={entry.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-800 truncate">{entry.name}</p>
                            <p className="text-[11px] text-gray-400">
                              {SOURCE_TYPE_LABELS[entry.type]?.label || entry.type} · {formatContextChars(entry.includedChars)}
                            </p>
                          </div>
                          {entry.truncated && (
                            <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full whitespace-nowrap">
                              truncada
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
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

              {/* Jurisprudence Analytics */}
              {jurisprudenceAnalytics && (
                <div className="bg-white rounded-xl border p-5 space-y-4">
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Scale className="w-4 h-4 text-emerald-600" />
                    Analytics de Jurisprudência
                    <span className="text-xs text-gray-400 font-normal">({jurisprudenceAnalytics.totalResults} resultados)</span>
                  </h4>

                  {/* Stance overview */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <ThumbsUp className="w-3.5 h-3.5 text-green-600" />
                        <p className="text-lg font-bold text-green-700">{jurisprudenceAnalytics.byStance.favoravel}</p>
                      </div>
                      <p className="text-[10px] text-green-600 font-medium uppercase tracking-wide">Favoráveis</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3 text-center border border-red-100">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <ThumbsDown className="w-3.5 h-3.5 text-red-600" />
                        <p className="text-lg font-bold text-red-700">{jurisprudenceAnalytics.byStance.desfavoravel}</p>
                      </div>
                      <p className="text-[10px] text-red-600 font-medium uppercase tracking-wide">Desfavoráveis</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                      <p className="text-lg font-bold text-gray-600 mb-1">{jurisprudenceAnalytics.byStance.neutro}</p>
                      <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Neutros</p>
                    </div>
                    {jurisprudenceAnalytics.avgRelevanceScore != null && (
                      <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-100">
                        <p className="text-lg font-bold text-amber-700 mb-1">{jurisprudenceAnalytics.avgRelevanceScore}<span className="text-xs font-normal text-amber-500">/100</span></p>
                        <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wide">Relevância Média</p>
                      </div>
                    )}
                  </div>

                  {/* Area distribution */}
                  {jurisprudenceAnalytics.byArea.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Distribuição por Área</p>
                      <div className="space-y-1.5">
                        {jurisprudenceAnalytics.byArea.map(({ area, count }) => {
                          const pct = Math.round((count / jurisprudenceAnalytics.totalResults) * 100)
                          const areaLabel = AREA_LABELS[area] || (area === 'outros' ? 'Outros' : area)
                          const colorClasses = AREA_COLORS[area] || 'bg-gray-100 text-gray-600 border-gray-200'
                          return (
                            <div key={area} className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap ${colorClasses}`}>
                                {areaLabel}
                              </span>
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${areaLabel}: ${pct}%`}>
                                <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[11px] text-gray-500 font-mono w-12 text-right">{count} ({pct}%)</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Year distribution */}
                  {jurisprudenceAnalytics.byYear.length > 1 && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Distribuição por Ano</p>
                      <div className="flex items-end gap-1 h-20">
                        {jurisprudenceAnalytics.byYear.map(({ year, count }) => {
                          const maxCount = Math.max(...jurisprudenceAnalytics.byYear.map(y => y.count))
                          const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
                          return (
                            <div key={year} className="flex-1 flex flex-col items-center gap-0.5" title={`${year}: ${count} processo(s)`}>
                              <span className="text-[10px] text-gray-500 font-mono">{count}</span>
                              <div className="w-full bg-emerald-400 rounded-t" style={{ height: `${Math.max(pct, 4)}%` }} />
                              <span className="text-[10px] text-gray-400">{year.slice(2)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Tribunal distribution */}
                  {jurisprudenceAnalytics.byTribunal.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Tribunais</p>
                      <div className="flex flex-wrap gap-1.5">
                        {jurisprudenceAnalytics.byTribunal.slice(0, 10).map(({ tribunal, count }) => (
                          <span key={tribunal} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                            {tribunal} <span className="text-gray-400">{count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                        onClick={() => {
                          const runningTask = runningArtifactTasksByType.get('audio_script')
                          if (runningTask) {
                            setSelectedStudioTaskId(runningTask.id)
                            setShowStudioProgressModal(true)
                            return
                          }
                          void handleGenerateArtifact('audio_script' as StudioArtifactType)
                        }}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-white text-brand-700 rounded-lg text-xs font-bold hover:bg-white/90 transition-colors disabled:opacity-60"
                      >
                        {runningArtifactTasksByType.get('audio_script') ? (
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
              <div className="bg-white border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <BookMarked className="w-4 h-4 text-brand-600" />
                      Janela Auditável da Próxima Resposta
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-1">
                      O chat usa fontes úteis do caderno, uma janela recente da conversa, histórico de buscas e, opcionalmente, busca web ao vivo.
                    </p>
                  </div>
                  <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap">
                    {formatContextChars((lastChatContextAudit || chatContextAuditPreview).totalContextChars)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Fontes</p>
                    <p className="text-sm text-gray-800 mt-0.5">
                      {(lastChatContextAudit || chatContextAuditPreview).sourceSummary.includedSources}/{(lastChatContextAudit || chatContextAuditPreview).sourceSummary.totalSources}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Conversa</p>
                    <p className="text-sm text-gray-800 mt-0.5">
                      {(lastChatContextAudit || chatContextAuditPreview).conversationSummary.includedMessages}/{(lastChatContextAudit || chatContextAuditPreview).conversationSummary.totalMessages}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Histórico de busca</p>
                    <p className="text-sm text-gray-800 mt-0.5">{(lastChatContextAudit || chatContextAuditPreview).searchSummary.totalEntries}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Busca web ao vivo</p>
                    <p className="text-sm text-gray-800 mt-0.5">
                      {(lastChatContextAudit || chatContextAuditPreview).liveWebEnabled ? 'Ativa' : 'Desligada'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-[11px] text-gray-500">
                  <p>
                    Fontes incluídas: {formatContextChars((lastChatContextAudit || chatContextAuditPreview).sourceSummary.includedChars)}
                    {(lastChatContextAudit || chatContextAuditPreview).sourceSummary.truncatedSources > 0 ? ` · ${(lastChatContextAudit || chatContextAuditPreview).sourceSummary.truncatedSources} truncada(s)` : ''}
                  </p>
                  <p>
                    Conversa incluída: {formatContextChars((lastChatContextAudit || chatContextAuditPreview).conversationSummary.includedChars)}
                    {(lastChatContextAudit || chatContextAuditPreview).conversationSummary.droppedMessages > 0 ? ` · ${(lastChatContextAudit || chatContextAuditPreview).conversationSummary.droppedMessages} mensagem(ns) antigas fora da janela` : ''}
                    {(lastChatContextAudit || chatContextAuditPreview).conversationSummary.truncatedByChars ? ' · truncada por caracteres' : ''}
                  </p>
                  <p>
                    Histórico de busca: {formatContextChars((lastChatContextAudit || chatContextAuditPreview).searchSummary.includedChars)}
                    {(lastChatContextAudit || chatContextAuditPreview).searchSummary.truncated ? ' · truncado por limite' : ''}
                    {(lastChatContextAudit || chatContextAuditPreview).liveWebEnabled
                      ? ` · web ao vivo ${((lastChatContextAudit || chatContextAuditPreview).liveWebChars > 0 ? `incluída (${formatContextChars((lastChatContextAudit || chatContextAuditPreview).liveWebChars)})` : 'aguardando execução da consulta')}`
                      : ''}
                  </p>
                </div>
              </div>

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
                        triggerExternalSearch()
                      }
                    }}
                    disabled={isAnyResearchLoading}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none disabled:opacity-50 disabled:bg-gray-50"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={triggerExternalSearch}
                    disabled={!externalSearchQuery.trim() || isAnyResearchLoading}
                    title="Busca rápida na web com síntese via IA"
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium transition-colors inline-flex items-center gap-1.5"
                  >
                    {externalResearchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                    Pesquisa Externa
                  </button>
                  <button
                    onClick={triggerDeepExternalSearch}
                    disabled={!externalSearchQuery.trim() || isAnyResearchLoading}
                    title="Busca profunda: extrai conteúdo completo das páginas encontradas"
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium transition-colors inline-flex items-center gap-1.5"
                  >
                    {externalDeepLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                    Pesquisa Profunda
                  </button>
                  <button
                    onClick={triggerJurisprudenceSearch}
                    disabled={!externalSearchQuery.trim() || isAnyResearchLoading}
                    title="Pesquisa jurisprudência em 21 tribunais brasileiros via DataJud (CNJ)"
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium transition-colors inline-flex items-center gap-1.5"
                  >
                    {jurisprudenceLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Library className="w-3.5 h-3.5" />}
                    Jurisprudência (DataJud)
                  </button>
                </div>
                <div className="bg-white border rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <BookMarked className="w-4 h-4 text-brand-600" />
                        Janela Auditável da Próxima Busca
                      </h4>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Resume a consulta atual e, quando houver, a última busca realmente sintetizada para o caderno.
                      </p>
                    </div>
                    <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap">
                      {formatContextChars((lastResearchContextAudit || researchContextAuditPreview).totalContextChars)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Consulta</p>
                      <p className="text-sm text-gray-800 mt-0.5">{(lastResearchContextAudit || researchContextAuditPreview).queryChars} chars</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Resultados</p>
                      <p className="text-sm text-gray-800 mt-0.5">{(lastResearchContextAudit || researchContextAuditPreview).resultCount ?? 0}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Selecionados</p>
                      <p className="text-sm text-gray-800 mt-0.5">{(lastResearchContextAudit || researchContextAuditPreview).selectedCount ?? 0}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Tribunais</p>
                      <p className="text-sm text-gray-800 mt-0.5">{(lastResearchContextAudit || researchContextAuditPreview).tribunalCount ?? lastJurisprudenceTribunalAliases.length}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-[11px] text-gray-500">
                    <p>
                      Modo atual: {(lastResearchContextAudit || researchContextAuditPreview).sourceKindLabel || 'Pesquisa externa'}
                      {(lastResearchContextAudit || researchContextAuditPreview).mode === 'executed' ? ' · última execução sintetizada' : ' · preview da próxima consulta'}
                    </p>
                    {(lastResearchContextAudit || researchContextAuditPreview).compiledChars != null && (
                      <p>
                        Conteúdo promovido para síntese: {formatContextChars((lastResearchContextAudit || researchContextAuditPreview).compiledChars || 0)}
                        {(lastResearchContextAudit || researchContextAuditPreview).usedSnippetFallback ? ' · usando snippets/fallback de conteúdo' : ''}
                      </p>
                    )}
                    {(lastResearchContextAudit || researchContextAuditPreview).dateRangeLabel && (
                      <p>Recorte temporal: {(lastResearchContextAudit || researchContextAuditPreview).dateRangeLabel}</p>
                    )}
                    {(lastResearchContextAudit || researchContextAuditPreview).legalArea && (
                      <p>Área jurídica: {AREA_LABELS[(lastResearchContextAudit || researchContextAuditPreview).legalArea || ''] || (lastResearchContextAudit || researchContextAuditPreview).legalArea}</p>
                    )}
                  </div>

                  {activeNotebook.research_audits && activeNotebook.research_audits.length > 0 && (
                    <div className="pt-2 border-t border-gray-100 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                          Últimas buscas auditadas · {activeNotebook.research_audits.length}
                        </p>
                        {activeNotebook.research_audits.length > 3 && (
                          <button
                            onClick={() => setShowAllResearchAudits(value => !value)}
                            className="text-[10px] font-medium text-brand-700 hover:text-brand-800"
                          >
                            {showAllResearchAudits ? 'Mostrar menos' : 'Mostrar todas'}
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {visibleResearchAudits.map(audit => (
                          <div key={`${audit.created_at}-${audit.query}`} className="bg-gray-50 rounded-lg px-3 py-2 text-[11px] text-gray-600">
                            <div className="flex items-start justify-between gap-3">
                              <p className="font-medium text-gray-800">
                                {audit.sourceKindLabel || 'Busca'} · {formatDate(audit.created_at)}
                              </p>
                              <button
                                onClick={() => handleReplayResearchAudit(audit)}
                                disabled={isAnyResearchLoading}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 bg-white text-[10px] font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <RotateCcw className="w-3 h-3" />
                                {audit.variant === 'jurisprudencia' ? 'Reabrir' : 'Reaplicar'}
                              </button>
                            </div>
                            <p className="mt-0.5 line-clamp-2">{audit.query || 'Consulta vazia'}</p>
                            <p className="mt-1 text-gray-500">
                              {audit.selectedCount ?? 0} selecionado(s)
                              {audit.resultCount != null ? ` · ${audit.resultCount} resultado(s)` : ''}
                              {audit.tribunalCount != null ? ` · ${audit.tribunalCount} tribunal(is)` : ''}
                              {audit.compiledChars != null ? ` · ${formatContextChars(audit.compiledChars)} em síntese` : ''}
                            </p>
                            <div className="mt-2 flex items-center justify-end">
                              <button
                                onClick={() => void saveResearchAuditPreset(audit)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-brand-700 bg-brand-50 hover:bg-brand-100"
                              >
                                <Save className="w-3 h-3" />
                                Salvar busca
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {sortedSavedSearches.length > 0 && (
                    <div className="pt-2 border-t border-gray-100 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                          Buscas salvas · {sortedSavedSearches.length}
                        </p>
                        {sortedSavedSearches.length > 4 && (
                          <button
                            onClick={() => setShowAllSavedSearches(value => !value)}
                            className="text-[10px] font-medium text-brand-700 hover:text-brand-800"
                          >
                            {showAllSavedSearches ? 'Mostrar menos' : 'Mostrar todas'}
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                        <input
                          type="text"
                          value={savedSearchFilter}
                          onChange={e => setSavedSearchFilter(e.target.value)}
                          placeholder="Filtrar buscas salvas..."
                          className="w-full pl-7 pr-3 py-2 rounded-lg border border-amber-200 bg-amber-50/40 text-[11px] text-gray-700 focus:ring-1 focus:ring-brand-500 outline-none"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { key: 'all', label: 'Todas', count: savedSearchVariantCounts.all },
                          { key: 'external', label: 'Externa', count: savedSearchVariantCounts.external },
                          { key: 'deep', label: 'Profunda', count: savedSearchVariantCounts.deep },
                          { key: 'jurisprudencia', label: 'Jurisprudência', count: savedSearchVariantCounts.jurisprudencia },
                        ].map(option => (
                          <button
                            key={option.key}
                            onClick={() => setSavedSearchVariantFilter(option.key as typeof savedSearchVariantFilter)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${
                              savedSearchVariantFilter === option.key
                                ? 'bg-amber-100 border-amber-300 text-amber-900'
                                : 'bg-white border-amber-200 text-gray-600 hover:bg-amber-50'
                            }`}
                          >
                            {option.label} · {option.count}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-2.5 py-2">
                        <label className="inline-flex items-center gap-1.5 text-[10px] text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allVisibleSavedSearchesSelected}
                            onChange={toggleSelectAllVisibleSavedSearches}
                            className="rounded border-amber-300 text-brand-600 focus:ring-brand-500"
                          />
                          Selecionar visíveis ({visibleSavedSearchIds.length})
                        </label>
                        <span className="text-[10px] text-gray-500">Selecionadas: {selectedSavedSearchIds.size}</span>
                        <button
                          onClick={() => void bulkSetPinnedSavedSearches(true)}
                          disabled={selectedSavedSearchIds.size === 0}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-200 bg-white text-[10px] font-medium text-gray-600 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <BookMarked className="w-3 h-3" />
                          Fixar
                        </button>
                        <button
                          onClick={() => void bulkSetPinnedSavedSearches(false)}
                          disabled={selectedSavedSearchIds.size === 0}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-200 bg-white text-[10px] font-medium text-gray-600 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <BookMarked className="w-3 h-3" />
                          Desafixar
                        </button>
                        <button
                          onClick={clearSelectedSavedSearches}
                          disabled={selectedSavedSearchIds.size === 0}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-200 bg-white text-[10px] font-medium text-gray-600 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <X className="w-3 h-3" />
                          Limpar seleção
                        </button>
                        <input
                          type="text"
                          value={bulkSavedSearchTagInput}
                          onChange={e => setBulkSavedSearchTagInput(e.target.value)}
                          placeholder="Tag em lote"
                          className="px-2 py-1 rounded-md border border-amber-200 bg-white text-[10px] text-gray-700 focus:ring-1 focus:ring-brand-500 outline-none"
                          maxLength={50}
                        />
                        <button
                          onClick={() => void bulkUpdateTagSavedSearches('add')}
                          disabled={selectedSavedSearchIds.size === 0}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-200 bg-white text-[10px] font-medium text-gray-600 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Save className="w-3 h-3" />
                          Adicionar tag
                        </button>
                        <button
                          onClick={() => void bulkUpdateTagSavedSearches('remove')}
                          disabled={selectedSavedSearchIds.size === 0}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-200 bg-white text-[10px] font-medium text-gray-600 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <X className="w-3 h-3" />
                          Remover tag
                        </button>
                        <button
                          onClick={() => setPendingSavedSearchBulkDeleteIds(Array.from(selectedSavedSearchIds))}
                          disabled={selectedSavedSearchIds.size === 0}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-200 bg-white text-[10px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3 h-3" />
                          Excluir selecionadas
                        </button>
                      </div>
                      {savedSearchFilter.trim() && sortedSavedSearches.length === 0 && (
                        <p className="text-[11px] text-gray-500">Nenhuma busca salva corresponde ao filtro atual.</p>
                      )}
                      {!savedSearchFilter.trim() && sortedSavedSearches.length === 0 && savedSearchVariantFilter !== 'all' && (
                        <p className="text-[11px] text-gray-500">Nenhuma busca salva nesse tipo de pesquisa.</p>
                      )}
                      {pinnedSavedSearches.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700">Fixadas</p>
                          {pinnedSavedSearches.map(search => (
                            <div key={search.id} className="bg-amber-50 rounded-lg px-3 py-2 text-[11px] text-gray-600 border border-amber-100">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  {editingSavedSearchId === search.id ? (
                                    <div className="space-y-2">
                                      <input
                                        value={editingSavedSearchTitle}
                                        onChange={e => setEditingSavedSearchTitle(e.target.value)}
                                        className="w-full px-2 py-1 rounded-md border border-amber-200 bg-white text-[11px] text-gray-800 focus:ring-1 focus:ring-brand-500 outline-none"
                                        maxLength={120}
                                      />
                                      <input
                                        value={editingSavedSearchTags}
                                        onChange={e => setEditingSavedSearchTags(e.target.value)}
                                        className="w-full px-2 py-1 rounded-md border border-amber-200 bg-white text-[11px] text-gray-800 focus:ring-1 focus:ring-brand-500 outline-none"
                                        placeholder="Tags separadas por vírgula"
                                        maxLength={160}
                                      />
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => void confirmRenameSavedSearch()}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-amber-200 text-[10px] font-medium text-brand-700 hover:bg-amber-100"
                                        >
                                          <Save className="w-3 h-3" />
                                          Salvar
                                        </button>
                                        <button
                                          onClick={cancelEditingSavedSearch}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-gray-200 text-[10px] font-medium text-gray-600 hover:bg-gray-100"
                                        >
                                          <X className="w-3 h-3" />
                                          Cancelar
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <p className="font-medium text-gray-800">{search.title}</p>
                                      <span className="px-1.5 py-0.5 rounded bg-amber-200 text-[10px] font-medium text-amber-900">Fixada</span>
                                    </div>
                                  )}
                                  <p className="text-gray-500 mt-0.5">{search.sourceKindLabel || 'Busca'} · atualizada em {formatDate(search.updated_at)}</p>
                                  {search.tags && search.tags.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {search.tags.map(tag => (
                                        <button
                                          key={tag}
                                          onClick={() => setSavedSearchFilter(tag)}
                                          className="px-1.5 py-0.5 rounded bg-white border border-amber-200 text-[10px] text-gray-600 hover:bg-amber-100"
                                        >
                                          {tag}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <label className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md border border-amber-200 bg-white text-[10px] font-medium text-gray-600 hover:bg-amber-100 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={selectedSavedSearchIds.has(search.id)}
                                      onChange={() => toggleSavedSearchSelection(search.id)}
                                      className="rounded border-amber-300 text-brand-600 focus:ring-brand-500"
                                    />
                                    Selecionar
                                  </label>
                                  <button
                                    onClick={() => void togglePinSavedSearch(search.id)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-200 bg-white text-[10px] font-medium text-gray-600 hover:bg-amber-100"
                                  >
                                    <BookMarked className="w-3 h-3" />
                                    Desafixar
                                  </button>
                                  <button
                                    onClick={() => startEditingSavedSearch(search)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-200 bg-white text-[10px] font-medium text-gray-600 hover:bg-amber-100"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    Renomear
                                  </button>
                                  <button
                                    onClick={() => handleReplayResearchAudit(search)}
                                    disabled={isAnyResearchLoading}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-200 bg-white text-[10px] font-medium text-gray-600 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    {search.variant === 'jurisprudencia' ? 'Abrir' : 'Usar'}
                                  </button>
                                  <button
                                    onClick={() => setPendingSavedSearchDelete({ id: search.id, title: search.title })}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-200 bg-white text-[10px] font-medium text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Excluir
                                  </button>
                                </div>
                              </div>
                              <p className="mt-1 line-clamp-2">{search.query || 'Consulta vazia'}</p>
                              <p className="mt-1 text-gray-500">
                                {search.selectedCount ?? 0} selecionado(s)
                                {search.resultCount != null ? ` · ${search.resultCount} resultado(s)` : ''}
                                {search.tribunalCount != null ? ` · ${search.tribunalCount} tribunal(is)` : ''}
                                {search.dateRangeLabel ? ` · ${search.dateRangeLabel}` : ''}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                      {regularSavedSearches.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Demais buscas salvas</p>
                          {regularSavedSearches.map(search => (
                          <div key={search.id} className="bg-amber-50 rounded-lg px-3 py-2 text-[11px] text-gray-600 border border-amber-100">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                {editingSavedSearchId === search.id ? (
                                  <div className="space-y-2">
                                    <input
                                      value={editingSavedSearchTitle}
                                      onChange={e => setEditingSavedSearchTitle(e.target.value)}
                                      className="w-full px-2 py-1 rounded-md border border-amber-200 bg-white text-[11px] text-gray-800 focus:ring-1 focus:ring-brand-500 outline-none"
                                      maxLength={120}
                                    />
                                    <input
                                      value={editingSavedSearchTags}
                                      onChange={e => setEditingSavedSearchTags(e.target.value)}
                                      className="w-full px-2 py-1 rounded-md border border-amber-200 bg-white text-[11px] text-gray-800 focus:ring-1 focus:ring-brand-500 outline-none"
                                      placeholder="Tags separadas por vírgula"
                                      maxLength={160}
                                    />
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => void confirmRenameSavedSearch()}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-amber-200 text-[10px] font-medium text-brand-700 hover:bg-amber-100"
                                      >
                                        <Save className="w-3 h-3" />
                                        Salvar
                                      </button>
                                      <button
                                        onClick={cancelEditingSavedSearch}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-gray-200 text-[10px] font-medium text-gray-600 hover:bg-gray-100"
                                      >
                                        <X className="w-3 h-3" />
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-gray-800">{search.title}</p>
                                    {search.pinned && (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-200 text-[10px] font-medium text-amber-900">Fixada</span>
                                    )}
                                  </div>
                                )}
                                <p className="text-gray-500 mt-0.5">{search.sourceKindLabel || 'Busca'} · atualizada em {formatDate(search.updated_at)}</p>
                                {search.tags && search.tags.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {search.tags.map(tag => (
                                      <button
                                        key={tag}
                                        onClick={() => setSavedSearchFilter(tag)}
                                        className="px-1.5 py-0.5 rounded bg-white border border-amber-200 text-[10px] text-gray-600 hover:bg-amber-100"
                                      >
                                        {tag}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <label className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md border border-amber-200 bg-white text-[10px] font-medium text-gray-600 hover:bg-amber-100 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedSavedSearchIds.has(search.id)}
                                    onChange={() => toggleSavedSearchSelection(search.id)}
                                    className="rounded border-amber-300 text-brand-600 focus:ring-brand-500"
                                  />
                                  Selecionar
                                </label>
                                <button
                                  onClick={() => void togglePinSavedSearch(search.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-200 bg-white text-[10px] font-medium text-gray-600 hover:bg-amber-100"
                                >
                                  <BookMarked className="w-3 h-3" />
                                  {search.pinned ? 'Desafixar' : 'Fixar'}
                                </button>
                                <button
                                  onClick={() => startEditingSavedSearch(search)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-200 bg-white text-[10px] font-medium text-gray-600 hover:bg-amber-100"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  Renomear
                                </button>
                                <button
                                  onClick={() => handleReplayResearchAudit(search)}
                                  disabled={isAnyResearchLoading}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-200 bg-white text-[10px] font-medium text-gray-600 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  {search.variant === 'jurisprudencia' ? 'Abrir' : 'Usar'}
                                </button>
                                <button
                                  onClick={() => setPendingSavedSearchDelete({ id: search.id, title: search.title })}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-200 bg-white text-[10px] font-medium text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Excluir
                                </button>
                              </div>
                            </div>
                            <p className="mt-1 line-clamp-2">{search.query || 'Consulta vazia'}</p>
                            <p className="mt-1 text-gray-500">
                              {search.selectedCount ?? 0} selecionado(s)
                              {search.resultCount != null ? ` · ${search.resultCount} resultado(s)` : ''}
                              {search.tribunalCount != null ? ` · ${search.tribunalCount} tribunal(is)` : ''}
                              {search.dateRangeLabel ? ` · ${search.dateRangeLabel}` : ''}
                            </p>
                          </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
                  {acervoAnalysisMeta && (
                    <p className="pl-5 text-[11px] text-brand-500">{acervoAnalysisMeta}</p>
                  )}
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

            <div className="mb-5 bg-white rounded-xl border p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <BookMarked className="w-4 h-4 text-brand-600" />
                    Contexto Auditável do Estúdio
                  </h4>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Esta é a janela de memória que o pipeline do estúdio usará nesta execução.
                  </p>
                </div>
                <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap">
                  {formatContextChars(studioContextAudit.totalContextChars)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Fontes</p>
                  <p className="text-sm text-gray-800 mt-0.5">
                    {studioContextAudit.sourceSummary.includedSources} incluídas
                    {studioContextAudit.sourceSummary.truncatedSources > 0 ? ` · ${studioContextAudit.sourceSummary.truncatedSources} truncadas` : ''}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">{formatContextChars(studioContextAudit.sourceSummary.includedChars)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Conversa</p>
                  <p className="text-sm text-gray-800 mt-0.5">
                    {studioContextAudit.conversationSummary.includedMessages} msg
                    {studioContextAudit.conversationSummary.droppedMessages > 0 ? ` · ${studioContextAudit.conversationSummary.droppedMessages} fora da janela` : ''}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {formatContextChars(studioContextAudit.conversationSummary.includedChars)}
                    {studioContextAudit.conversationSummary.truncatedByChars ? ' · truncada por caracteres' : ''}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Instruções extras</p>
                  <p className="text-sm text-gray-800 mt-0.5">
                    {studioContextAudit.customInstructionsChars > 0 ? 'Incluídas' : 'Ausentes'}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {studioContextAudit.customInstructionsChars > 0
                      ? formatContextChars(studioContextAudit.customInstructionsChars)
                      : 'Sem prompt adicional'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Fontes promovidas</p>
                  {studioContextAudit.sourceEntries.filter(entry => entry.included).length === 0 ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Nenhuma fonte textual suficiente entrou na memória do estúdio. O pipeline dependerá mais do tema, da descrição e das instruções adicionais.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {studioContextAudit.sourceEntries.filter(entry => entry.included).map(entry => (
                        <div key={entry.id} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm text-gray-800 truncate">{entry.name}</p>
                              <p className="text-[11px] text-gray-500 mt-0.5">
                                {SOURCE_TYPE_LABELS[entry.type]?.label || entry.type} · {formatContextChars(entry.includedChars)}
                              </p>
                            </div>
                            {entry.truncated && (
                              <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full whitespace-nowrap">
                                truncada
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Regras da janela atual</p>
                  <div className="space-y-2 text-xs text-gray-600 bg-gray-50 rounded-lg border border-gray-100 p-3">
                    <p>Somente fontes com pelo menos {MIN_SOURCE_CHARS} caracteres entram automaticamente.</p>
                    <p>Cada fonte textual e limitada a {formatContextChars(MAX_CONTEXT_TEXT_LENGTH)} por execucao.</p>
                    <p>A conversa do estúdio considera no maximo {MAX_STUDIO_CONTEXT_MESSAGES} mensagens recentes e ate {formatContextChars(MAX_STUDIO_CONTEXT_CHARS)}.</p>
                    <p>O prompt adicional entra inteiro apenas se voce o preencher neste painel.</p>
                  </div>
                </div>
              </div>
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
                        const runningTask = runningArtifactTasksByType.get(art.type)
                        return (
                          <button
                            key={art.type}
                            onClick={() => {
                              if (runningTask) {
                                setSelectedStudioTaskId(runningTask.id)
                                setShowStudioProgressModal(true)
                                return
                              }
                              void handleGenerateArtifact(art.type)
                            }}
                            className={`flex items-start gap-3 p-3 rounded-xl border ${colors.border} ${colors.hoverBorder} hover:shadow-sm transition-all text-left group ${
                              runningTask ? 'ring-1 ring-brand-200 bg-brand-50/40' : ''
                            }`}
                          >
                            <div className={`p-2 rounded-lg ${colors.bg} group-hover:scale-105 transition-transform`}>
                              {runningTask ? (
                                <Loader2 className={`w-4 h-4 animate-spin ${colors.text}`} />
                              ) : (
                                <ArtIcon className={`w-4 h-4 ${colors.text}`} />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-semibold text-gray-900 block">{art.label}</span>
                              <span className="text-[11px] text-gray-500 block mt-0.5 leading-snug">{art.description}</span>
                              {runningTask && (
                                <span className="text-[10px] text-purple-600 font-medium block mt-1">{runningTask.phase}</span>
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
                  onClick={() => {
                    // Open video_production artifacts directly in the VideoStudioEditor
                    if (artifact.type === 'video_production') {
                      try {
                        const pkg = JSON.parse(artifact.content) as VideoProductionPackage
                        // Ensure backwards compatibility: add empty clips array to scenes that lack it
                        if (pkg.scenes) {
                          pkg.scenes = pkg.scenes.map(s => ({ ...s, clips: s.clips || [] }))
                        }
                        setVideoProduction(pkg)
                      } catch {
                        toast.error('Erro ao carregar produção de vídeo')
                      }
                    } else {
                      setViewingArtifact(artifact)
                    }
                  }}
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
            onGenerateImage={['apresentacao', 'mapa_mental', 'infografico', 'tabela_dados'].includes(viewingArtifact.type)
              ? () => {
                  if (visualGenLoading && visualGeneratingArtifactId === viewingArtifact.id) return
                  handleGenerateVisualArtifact(viewingArtifact)
                }
              : undefined}
            onOpenStudio={isVideoStudio ? () => {
              try {
                const pkg = JSON.parse(viewingArtifact.content)
                setVideoProduction(pkg)
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
          lastCheckpoint={videoGenLastCheckpoint || undefined}
        />
      )}

      {/* ── Video Studio Editor ──────────────────────── */}
      {videoProduction && (
        <VideoStudioEditor
          production={videoProduction}
          onClose={() => setVideoProduction(null)}
          onSave={async (updated) => {
            await handleSaveVideoStudioToNotebook(updated)
          }}
          onGenerateLiteralMedia={(updatedProduction) => {
            void handleRunLiteralVideoStudioProduction(updatedProduction)
          }}
          onGenerateClipVideo={async (currentProduction, sceneNumber, clipNumber) => {
            try {
              const notebookId = activeNotebook?.id
              if (!userId || !notebookId) return null

              const apiKey = videoStudioApiKey || await getOpenRouterKey()
              if (!apiKey) {
                toast.error('Chave da API não configurada.')
                return null
              }

              const result = await generateLiteralVideoClipAsset(apiKey, currentProduction, sceneNumber, clipNumber)
              const persisted = await handleSaveVideoStudioToNotebook(result.production, { silent: true, syncEditorState: false })

              await appendNotebookExecutions(notebookId, 'video_pipeline', [result.execution])
              setVideoProduction(persisted)

              if (viewingArtifact?.type === 'video_script') {
                const freshNotebook = await getFreshNotebookOrThrow(notebookId)
                const refreshed = freshNotebook.artifacts.find(item => item.title === `Estúdio de Vídeo: ${persisted.title}`)
                if (refreshed) setViewingArtifact(refreshed)
              }

              toast.success(`Vídeo da cena ${sceneNumber}, clip ${clipNumber} gerado com sucesso!`)
              return persisted
            } catch (err) {
              console.error('Clip video regeneration error:', err)
              const message = err instanceof Error ? err.message : String(err)
              toast.error(`Erro ao gerar vídeo da cena ${sceneNumber}, clip ${clipNumber}`, message)
              return null
            }
          }}
          isLiteralGenerating={videoStudioLiteralLoading}
          literalProgress={videoStudioLiteralProgress || undefined}
          onRegenerateImage={async (sceneNumber) => {
            try {
              const apiKey = await getOpenRouterKey()
              if (!apiKey) { toast.error('Chave da API não configurada.'); return null }
              const scene = videoProduction.scenes.find(s => s.number === sceneNumber)
              if (!scene?.imagePrompt) { toast.error('Cena sem prompt de imagem.'); return null }
              const models = await loadVideoPipelineModels()
              const result = await generateImageViaOpenRouter({
                apiKey,
                prompt: scene.imagePrompt,
                model: models.video_image_generator || undefined,
                aspectRatio: '16:9',
              })
              toast.success(`Imagem da cena ${sceneNumber} gerada!`)
              return result.imageDataUrl
            } catch (err) {
              console.error('Image regeneration error:', err)
              toast.error(`Erro ao gerar imagem da cena ${sceneNumber}`)
              return null
            }
          }}
          onRegenerateTTS={async (sceneNumber) => {
            try {
              const apiKey = await getOpenRouterKey()
              if (!apiKey) { toast.error('Chave da API não configurada.'); return null }
              const narSeg = videoProduction.narration.find(n => n.sceneNumber === sceneNumber)
              if (!narSeg?.text) { toast.error('Cena sem texto de narração.'); return null }
              const cleanText = narSeg.text.replace(/\*([^*]+)\*/g, '$1').replace(/\[pausa?\]/gi, '...').trim()
              const models = await loadVideoPipelineModels()
              const result = await generateTTSViaOpenRouter({
                apiKey,
                text: cleanText,
                model: models.video_tts || 'openai/gpt-4o-audio-preview',
                voice: 'nova',
              })
              const audioDataUrl = await blobToDataUrl(result.audioBlob)
              toast.success(`Narração da cena ${sceneNumber} gerada!`)
              return audioDataUrl
            } catch (err) {
              console.error('TTS regeneration error:', err)
              toast.error(`Erro ao gerar narração da cena ${sceneNumber}`)
              return null
            }
          }}
        />
      )}

      {/* ── Deep Research Modal ────────────────────────── */}
      <AgentTrailProgressModal
        isOpen={showAcervoProgressModal}
        title="Trilha de Análise Inteligente do Acervo"
        subtitle={activeNotebook?.topic}
        currentMessage={acervoProgressState.currentMessage}
        percent={acervoProgressState.percent}
        steps={acervoTrailSteps}
        isComplete={acervoProgressState.isComplete}
        hasError={acervoProgressState.hasError}
        activeStageLabel={acervoProgressState.stageLabel}
        activeStageMeta={acervoProgressState.stageMeta}
        canClose
        onClose={() => setShowAcervoProgressModal(false)}
      />

      <AgentTrailProgressModal
        isOpen={showStudioProgressModal && Boolean(selectedStudioTask)}
        title="Trilha Multiagente do Estúdio"
        subtitle={selectedStudioTaskMetadata?.artifactLabel}
        currentMessage={studioProgressState.currentMessage}
        percent={studioProgressState.percent}
        steps={studioTrailSteps}
        isComplete={studioProgressState.isComplete}
        hasError={studioProgressState.hasError}
        activeStageLabel={studioProgressState.stageLabel}
        activeStageMeta={studioProgressState.stageMeta}
        canClose
        onClose={() => setShowStudioProgressModal(false)}
      />

      <DeepResearchModal
        isOpen={researchModalOpen}
        onClose={() => setResearchModalOpen(false)}
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
        initialSelectedAliases={lastJurisprudenceTribunalAliases}
        initialConfig={jurisprudenceConfigPreset}
        onSearch={handleJurisprudenceSearch}
        onClose={() => {
          setJurisprudenceConfigOpen(false)
          setJurisprudenceConfigPreset(null)
        }}
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

      <ConfirmDialog
        open={Boolean(pendingSavedSearchDelete)}
        title="Excluir busca salva"
        description={pendingSavedSearchDelete ? `A busca salva "${pendingSavedSearchDelete.title}" será removida do caderno.` : ''}
        confirmText="Excluir busca"
        cancelText="Cancelar"
        danger
        onCancel={() => setPendingSavedSearchDelete(null)}
        onConfirm={confirmDeleteSavedSearch}
      />

      <ConfirmDialog
        open={pendingSavedSearchBulkDeleteIds.length > 0}
        title="Excluir buscas selecionadas"
        description={`As ${pendingSavedSearchBulkDeleteIds.length} buscas selecionadas serão removidas do caderno.`}
        confirmText="Excluir selecionadas"
        cancelText="Cancelar"
        danger
        onCancel={() => setPendingSavedSearchBulkDeleteIds([])}
        onConfirm={confirmDeleteSelectedSavedSearches}
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

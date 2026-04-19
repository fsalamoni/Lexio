import { ChangeEvent, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight, BookMarked, BookOpen, Bot, Brain, CheckCircle2, Database, Edit3,
  Eye,
  ExternalLink, FileText, FolderOpen, Globe, Link2, Loader2,
  MessageSquareText, Library, Mic, Plus, RotateCcw, Save, Search,
  Send, Sparkles, Trash2, Upload, Wand2, X,
} from 'lucide-react'
import { DeepResearchModal, createDeepSearchSteps, createExternalSearchSteps, createJurisprudenceSteps, type ResearchStats, type ResearchStep } from '../../components/DeepResearchModal'
import JurisprudenceConfigModal, { type JurisprudenceSearchConfig } from '../../components/JurisprudenceConfigModal'
import SearchResultsModal from '../../components/SearchResultsModal'
import { SkeletonCard } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../contexts/AuthContext'
import { useTaskManager, type TaskOperationalSummary } from '../../contexts/TaskManagerContext'
import { IS_FIREBASE } from '../../lib/firebase'
import {
  createResearchNotebook,
  deleteResearchNotebook,
  getResearchNotebook,
  getUserSettings,
  listAcervoDocuments,
  listResearchNotebooks,
  saveNotebookDocumentToDocuments,
  saveUserSettings,
  updateResearchNotebook,
  type AcervoDocumentData,
  type NotebookSavedSearchEntry,
  type NotebookSource,
  type ResearchNotebookData,
  type StudioArtifact,
  type StudioArtifactType,
} from '../../lib/firestore-service'
import type { NotebookMessage, NotebookResearchAuditEntry } from '../../lib/firestore-types'
import { humanizeError } from '../../lib/error-humanizer'
import {
  buildResearchNotebookClassicPath,
  buildResearchNotebookWorkbenchPath,
  parseResearchNotebookV2Section,
  type ResearchNotebookV2Section,
} from '../../lib/research-notebook-routes'
import { getRedesignPreviewParams } from '../../lib/redesign-routes'
import {
  buildNotebookSourcePreview,
  buildNotebookSavedSearchTags,
  buildNotebookSavedSearchTitle,
  buildResearchNotebookV2Snapshot,
  canOpenNotebookSourceViewer,
  countNotebookSavedSearchesByVariant,
  filterNotebookAcervoCandidates,
  filterNotebookSavedSearches,
  normalizeNotebookSavedSearchTags,
  type SavedSearchVariantFilter,
} from '../../lib/research-notebook-v2'
import {
  buildChatContextAudit,
  buildResearchContextAudit,
  buildStudioContextAudit,
  type ChatContextAuditSummary,
  type ResearchContextAuditSummary,
} from '../../lib/notebook-context-audit'
import { getOpenRouterKey } from '../../lib/generation-service'
import { callLLMWithFallback, callLLMWithMessages, ModelUnavailableError } from '../../lib/llm-client'
import { loadResearchNotebookModels, loadVideoPipelineModels } from '../../lib/model-config'
import { analyzeNotebookAcervo, type AcervoAnalysisProgress, type AnalyzedDocument } from '../../lib/notebook-acervo-analyzer'
import {
  buildAcervoModalProgressState,
  buildAcervoTrailSteps,
  buildStudioModalProgressState,
  buildStudioTaskPhaseMessage,
  buildStudioTrailSteps,
} from '../../lib/notebook-pipeline-progress'
import { buildVideoPipelineProgress, type VideoPipelineProgressState } from '../../lib/video-pipeline-progress'
import {
  accumulateOperationalSummary,
  buildOperationalEventKey,
  createEmptyOperationalSummary,
  getNotebookArtifactTaskMetadata,
  STUDIO_PIPELINE_TOTAL_STEPS,
} from '../../lib/notebook-artifact-tasks'
import { buildWorkspaceSettingsPath } from '../../lib/workspace-routes'
import { createUsageExecutionRecord, type UsageFunctionKey } from '../../lib/cost-analytics'
import { AREA_LABELS } from '../../lib/constants'
import { isStructuredArtifactType } from '../../lib/artifact-parsers'
import type { StoredNotebookMedia } from '../../lib/notebook-media-storage'
import {
  ALL_TRIBUNALS,
  DATAJUD_GRAUS,
  DEFAULT_TRIBUNALS,
  formatDataJudResults,
  searchDataJud,
  type DataJudEndpointAttempt,
  type DataJudErrorType,
  type DataJudResult,
} from '../../lib/datajud-service'
import {
  deepWebSearch,
  fetchUrlContent as fetchUrlContentService,
  searchWebResultsWithDiagnostics,
  searchWeb as searchWebService,
  type WebSearchErrorType,
} from '../../lib/web-search-service'
import { extractFileText, isSupportedTextFile, SUPPORTED_TEXT_FILE_EXTENSIONS } from '../../lib/file-text-extractor'
import type {
  RenderedVideoAsset,
  VideoCheckpoint,
  VideoGenerationProgressCallback,
  VideoProductionPackage,
} from '../../lib/video-generation-pipeline'
import {
  AGENT_LABELS,
  ARTIFACT_COST_KEY,
  ARTIFACT_CATEGORIES,
  ARTIFACT_TYPES,
  CopyButton,
  MAX_CONTEXT_TEXT_LENGTH,
  MAX_CONVERSATION_CONTEXT_MESSAGES,
  MAX_DEEP_EXTERNAL_SOURCE_SNIPPET_CHARS,
  MAX_DEEP_EXTERNAL_TEXT_CHARS,
  MAX_SUGGESTION_LABEL_LENGTH,
  MAX_SOURCE_TEXT_LENGTH,
  MAX_STUDIO_CONTEXT_CHARS,
  MAX_STUDIO_CONTEXT_MESSAGES,
  MAX_WEB_SEARCH_CHARS,
  MIN_SOURCE_CHARS,
  REVIEWABLE_ARTIFACT_TYPES,
  SOURCE_TYPE_LABELS,
} from '../notebook'
import type { NotebookResearchVariant, SearchResultItem } from '../notebook/types'
import { formatDate, generateId, getExtensionFromMimeType, renderMarkdownToHtml } from '../notebook/utils'

const AgentTrailProgressModal = lazy(() => import('../../components/AgentTrailProgressModal'))
const ArtifactViewerModal = lazy(() => import('../../components/artifacts/ArtifactViewerModal'))
const SourceContentViewer = lazy(() => import('../../components/SourceContentViewer'))
const VideoGenerationCostModal = lazy(() => import('../../components/VideoGenerationCostModal'))
const VideoStudioEditor = lazy(() => import('../../components/artifacts/VideoStudioEditor'))

async function loadAudioGenerationRuntime() {
  return import('../../lib/audio-generation-pipeline')
}

async function loadPresentationGenerationRuntime() {
  return import('../../lib/presentation-generation-pipeline')
}

async function loadVideoGenerationRuntime() {
  return import('../../lib/video-generation-pipeline')
}

async function loadStudioPipelineRuntime() {
  return import('../../lib/notebook-studio-pipeline')
}

async function loadNotebookMediaStorageRuntime() {
  return import('../../lib/notebook-media-storage')
}

async function loadLiteralVideoRuntime() {
  return import('../../lib/literal-video-production')
}

async function loadExternalVideoProviderRuntime() {
  return import('../../lib/external-video-provider')
}

async function loadImageGenerationRuntime() {
  return import('../../lib/image-generation-client')
}

async function loadTtsRuntime() {
  return import('../../lib/tts-client')
}

async function loadArtifactParsersRuntime() {
  return import('../../components/artifacts/artifact-parsers')
}

const ARTIFACT_TYPE_MAP = new Map(ARTIFACT_TYPES.map((artifact) => [artifact.type, artifact] as const))
const MEDIA_ARTIFACT_TYPES = new Set<StudioArtifact['type']>(['audio_script', 'video_script', 'video_production'])
const VISUAL_ARTIFACT_TYPES = new Set<StudioArtifactType>(['apresentacao', 'mapa_mental', 'infografico', 'tabela_dados'])
const STUDIO_BRIDGE_PROMPT_LIMIT = 600
const SECONDARY_TOAST_DELAY_MS = 600
const STUDIO_CATEGORY_COLORS = {
  blue: {
    border: 'border-blue-200',
    hoverBorder: 'hover:border-blue-400',
    iconBg: 'bg-blue-50',
    text: 'text-blue-700',
  },
  emerald: {
    border: 'border-emerald-200',
    hoverBorder: 'hover:border-emerald-400',
    iconBg: 'bg-emerald-50',
    text: 'text-emerald-700',
  },
  purple: {
    border: 'border-purple-200',
    hoverBorder: 'hover:border-purple-400',
    iconBg: 'bg-purple-50',
    text: 'text-purple-700',
  },
  amber: {
    border: 'border-amber-200',
    hoverBorder: 'hover:border-amber-400',
    iconBg: 'bg-amber-50',
    text: 'text-amber-700',
  },
} as const

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

function formatCharVolume(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k chars`
  return `${value} chars`
}

function isValidHttpsUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) && !/\s/.test(value)
  } catch {
    return false
  }
}

function buildChatSuggestions(topic: string) {
  return [
    `Quais os principais conceitos sobre "${topic}"?`,
    `Faça um resumo executivo sobre "${topic}" com foco prático.`,
    `Quais são os pontos controversos em "${topic}"?`,
    `Liste legislação, doutrina e jurisprudência úteis para "${topic}".`,
  ]
}

function buildCitationSuffix(result: DataJudResult): string {
  if (result.ementa?.trimEnd().endsWith(')')) return ''
  if (result.textSource === 'web' && !result.orgaoJulgador) return ''

  const parts: string[] = []
  if (result.classe && result.numeroProcesso && !result.numeroProcesso.startsWith('JB-')) {
    const numero = result.numeroProcesso.includes('-')
      ? result.numeroProcesso
      : result.numeroProcesso.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6')
    parts.push(`${result.classe} n. ${numero}`)
  }
  if (result.orgaoJulgador) parts.push(result.orgaoJulgador)
  if (result.tribunalName) parts.push(result.tribunalName)
  if (result.dataAjuizamento) parts.push(`data: ${result.dataAjuizamento}`)

  if (parts.length === 0) return ''
  return `\n(${parts.join(', ')}.)`
}

function isVideoStudioArtifact(artifact: StudioArtifact | null | undefined) {
  if (!artifact || artifact.type !== 'video_script' || artifact.format !== 'json') return false

  try {
    const parsed = JSON.parse(artifact.content) as { scenes?: unknown; tracks?: unknown }
    return Array.isArray(parsed?.scenes) && Array.isArray(parsed?.tracks)
  } catch {
    return false
  }
}

function isVisualArtifactType(type: StudioArtifactType): type is 'apresentacao' | 'mapa_mental' | 'infografico' | 'tabela_dados' {
  return VISUAL_ARTIFACT_TYPES.has(type)
}

function normalizeVideoProductionPackage(production: VideoProductionPackage): VideoProductionPackage {
  return {
    ...production,
    scenes: production.scenes.map((scene) => ({
      ...scene,
      clips: scene.clips || [],
    })),
  }
}

function isInlineMediaUrl(value?: string): value is string {
  return Boolean(value && (value.startsWith('blob:') || value.startsWith('data:')))
}

function compactLiteralGenerationState(state?: VideoProductionPackage['literalGenerationState']) {
  if (!state) return undefined
  return {
    ...state,
    errors: state.errors.slice(-8),
    events: state.events?.slice(-12).map((event) => ({
      at: event.at,
      type: event.type,
      phase: event.phase,
      sceneNumber: event.sceneNumber,
      partNumber: event.partNumber,
      attempt: event.attempt,
      message: event.message,
    })),
    scenes: state.scenes.map((scene) => ({
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

function compactVideoProductionForPersistence(production: VideoProductionPackage): VideoProductionPackage {
  const sceneAssets = (production.sceneAssets || []).map((sceneAsset) => ({
    sceneNumber: sceneAsset.sceneNumber,
    imageUrl: isInlineMediaUrl(sceneAsset.imageUrl) ? undefined : sceneAsset.imageUrl,
    narrationUrl: isInlineMediaUrl(sceneAsset.narrationUrl) ? undefined : sceneAsset.narrationUrl,
    imageStoragePath: sceneAsset.imageStoragePath,
    narrationStoragePath: sceneAsset.narrationStoragePath,
    videoClips: sceneAsset.videoClips?.map((clip) => ({
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
    })).filter((clip) => Boolean(clip.url)),
  }))
  const sceneAssetMap = new globalThis.Map(sceneAssets.map((asset) => [asset.sceneNumber, asset] as const))

  return {
    ...production,
    scenes: production.scenes.map((scene) => ({
      ...scene,
      generatedImageUrl: undefined,
      clips: scene.clips?.map((clip) => ({
        ...clip,
        generatedImageUrl: undefined,
      })) || [],
    })),
    narration: production.narration.map((segment) => ({
      ...segment,
      generatedAudioUrl: isInlineMediaUrl(segment.generatedAudioUrl) ? undefined : segment.generatedAudioUrl,
    })),
    tracks: production.tracks.map((track) => ({
      ...track,
      segments: track.segments.map((segment) => {
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
    renderedScopes: production.renderedScopes?.map((scope) => ({
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
    })).filter((scope) => Boolean(scope.url)),
    literalGenerationState: compactLiteralGenerationState(production.literalGenerationState),
  }
}

export default function ResearchNotebookV2() {
  const { userId } = useAuth()
  const { startTask, tasks } = useTaskManager()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [notebooks, setNotebooks] = useState<ResearchNotebookData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectingNotebook, setSelectingNotebook] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeNotebook, setActiveNotebook] = useState<ResearchNotebookData | null>(null)
  const [activeSection, setActiveSection] = useState<ResearchNotebookV2Section>(
    parseResearchNotebookV2Section(searchParams.get('section')),
  )
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createTopic, setCreateTopic] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceUrlLoading, setSourceUrlLoading] = useState(false)
  const [sourceUploadLoading, setSourceUploadLoading] = useState(false)
  const [acervoDocs, setAcervoDocs] = useState<AcervoDocumentData[]>([])
  const [acervoLoading, setAcervoLoading] = useState(false)
  const [acervoAnalysisLoading, setAcervoAnalysisLoading] = useState(false)
  const [acervoAnalysisPhase, setAcervoAnalysisPhase] = useState('')
  const [acervoAnalysisMessage, setAcervoAnalysisMessage] = useState('')
  const [acervoAnalysisPercent, setAcervoAnalysisPercent] = useState(0)
  const [acervoAnalysisMeta, setAcervoAnalysisMeta] = useState('')
  const [acervoAnalysisError, setAcervoAnalysisError] = useState('')
  const [showAcervoProgressModal, setShowAcervoProgressModal] = useState(false)
  const [acervoAnalysisResults, setAcervoAnalysisResults] = useState<AnalyzedDocument[]>([])
  const [selectedAnalysisIds, setSelectedAnalysisIds] = useState<Set<string>>(new Set())
  const [sourceSearch, setSourceSearch] = useState('')
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [viewerSource, setViewerSource] = useState<NotebookSource | null>(null)
  const [viewingArtifact, setViewingArtifact] = useState<StudioArtifact | null>(null)
  const [audioGenLoading, setAudioGenLoading] = useState(false)
  const [audioGeneratingArtifactId, setAudioGeneratingArtifactId] = useState<string | null>(null)
  const [visualGenLoading, setVisualGenLoading] = useState(false)
  const [visualGeneratingArtifactId, setVisualGeneratingArtifactId] = useState<string | null>(null)
  const [showVideoGenCost, setShowVideoGenCost] = useState(false)
  const [videoGenSavedArtifact, setVideoGenSavedArtifact] = useState<StudioArtifact | null>(null)
  const [videoGenLoading, setVideoGenLoading] = useState(false)
  const [videoGenProgress, setVideoGenProgress] = useState<VideoPipelineProgressState | null>(null)
  const [videoGenLastCheckpoint, setVideoGenLastCheckpoint] = useState<VideoCheckpoint | null>(null)
  const [videoProduction, setVideoProduction] = useState<VideoProductionPackage | null>(null)
  const [videoStudioApiKey, setVideoStudioApiKey] = useState<string | undefined>(undefined)
  const [videoStudioLiteralLoading, setVideoStudioLiteralLoading] = useState(false)
  const [videoStudioLiteralProgress, setVideoStudioLiteralProgress] = useState<VideoPipelineProgressState | null>(null)
  const [studioCustomPrompt, setStudioCustomPrompt] = useState('')
  const [showStudioProgressModal, setShowStudioProgressModal] = useState(false)
  const [selectedStudioTaskId, setSelectedStudioTaskId] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [lastChatContextAudit, setLastChatContextAudit] = useState<ChatContextAuditSummary | null>(null)
  const [externalSearchQuery, setExternalSearchQuery] = useState('')
  const [externalResearchLoading, setExternalResearchLoading] = useState(false)
  const [externalDeepLoading, setExternalDeepLoading] = useState(false)
  const [jurisprudenceLoading, setJurisprudenceLoading] = useState(false)
  const [researchModalOpen, setResearchModalOpen] = useState(false)
  const [researchModalTitle, setResearchModalTitle] = useState('')
  const [researchModalSubtitle, setResearchModalSubtitle] = useState('')
  const [researchModalVariant, setResearchModalVariant] = useState<NotebookResearchVariant>('external')
  const [researchModalSteps, setResearchModalSteps] = useState<ResearchStep[]>([])
  const [researchModalStats, setResearchModalStats] = useState<ResearchStats>({
    sourcesFound: 0,
    urlsExamined: 0,
    tribunalsQueried: 0,
    tokensUsed: 0,
    elapsedMs: 0,
  })
  const [researchModalCanClose, setResearchModalCanClose] = useState(false)
  const [lastResearchContextAudit, setLastResearchContextAudit] = useState<ResearchContextAuditSummary | null>(null)
  const [jurisprudenceConfigOpen, setJurisprudenceConfigOpen] = useState(false)
  const [jurisprudenceConfigPreset, setJurisprudenceConfigPreset] = useState<Partial<JurisprudenceSearchConfig> | null>(null)
  const [lastJurisprudenceTribunalAliases, setLastJurisprudenceTribunalAliases] = useState<string[]>(DEFAULT_TRIBUNALS.map((tribunal) => tribunal.alias))
  const [searchResultsModalOpen, setSearchResultsModalOpen] = useState(false)
  const [searchResultsItems, setSearchResultsItems] = useState<SearchResultItem[]>([])
  const [searchResultsVariant, setSearchResultsVariant] = useState<NotebookResearchVariant>('external')
  const [searchResultsCallback, setSearchResultsCallback] = useState<((selected: SearchResultItem[]) => Promise<void>) | null>(null)
  const [showAllResearchAudits, setShowAllResearchAudits] = useState(false)
  const [showAllSavedSearches, setShowAllSavedSearches] = useState(false)
  const [savedSearchFilter, setSavedSearchFilter] = useState('')
  const [savedSearchVariantFilter, setSavedSearchVariantFilter] = useState<SavedSearchVariantFilter>('all')
  const [selectedSavedSearchIds, setSelectedSavedSearchIds] = useState<Set<string>>(new Set())
  const [bulkSavedSearchTagInput, setBulkSavedSearchTagInput] = useState('')
  const [editingSavedSearchId, setEditingSavedSearchId] = useState<string | null>(null)
  const [editingSavedSearchTitle, setEditingSavedSearchTitle] = useState('')
  const [editingSavedSearchTags, setEditingSavedSearchTags] = useState('')
  const sourceUploadRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const acervoAbortRef = useRef<AbortController | null>(null)
  const researchAbortRef = useRef<AbortController | null>(null)
  const videoStudioUploadCacheRef = useRef<globalThis.Map<string, StoredNotebookMedia>>(new globalThis.Map<string, StoredNotebookMedia>())
  const videoGenOperationalEventKeysRef = useRef<Set<string>>(new Set())
  const videoLiteralOperationalEventKeysRef = useRef<Set<string>>(new Set())

  const syncRoute = useCallback((notebookId?: string | null, section: ResearchNotebookV2Section = 'overview', replace = false) => {
    const next = getRedesignPreviewParams(location.search)
    if (notebookId) {
      next.set('open', notebookId)
      if (section !== 'overview') next.set('section', section)
      else next.delete('section')
    } else {
      next.delete('open')
      next.delete('section')
    }
    setSearchParams(next, { replace })
  }, [location.search, setSearchParams])

  const patchNotebook = useCallback((notebookId: string, patch: Partial<ResearchNotebookData>) => {
    setActiveNotebook((current) => (current && current.id === notebookId ? { ...current, ...patch } : current))
    setNotebooks((current) => current.map((notebook) => (notebook.id === notebookId ? { ...notebook, ...patch } : notebook)))
  }, [])

  const getFreshNotebookOrThrow = useCallback(async (notebookId: string) => {
    if (!userId) throw new Error('Usuário não autenticado')
    const notebook = await getResearchNotebook(userId, notebookId)
    if (!notebook) throw new Error('Caderno não encontrado')
    return notebook
  }, [userId])

  const notebookArtifactTasks = useMemo(() => {
    if (!activeNotebook?.id) return []
    return tasks.filter((task) => {
      const metadata = getNotebookArtifactTaskMetadata(task.metadata)
      return metadata?.notebookId === activeNotebook.id
    })
  }, [activeNotebook?.id, tasks])

  const runningArtifactTasksByType = useMemo(() => {
    const taskMap = new globalThis.Map<StudioArtifactType, typeof notebookArtifactTasks[number]>()
    for (const task of notebookArtifactTasks) {
      const metadata = getNotebookArtifactTaskMetadata(task.metadata)
      if (!metadata || task.status !== 'running') continue
      taskMap.set(metadata.artifactType, task)
    }
    return taskMap
  }, [notebookArtifactTasks])

  const selectedStudioTask = useMemo(() => {
    if (selectedStudioTaskId) {
      const found = notebookArtifactTasks.find((task) => task.id === selectedStudioTaskId)
      if (found) return found
    }
    return notebookArtifactTasks.find((task) => task.status === 'running') || null
  }, [notebookArtifactTasks, selectedStudioTaskId])

  const selectedStudioTaskMetadata = selectedStudioTask
    ? getNotebookArtifactTaskMetadata(selectedStudioTask.metadata)
    : null

  const hydrateNotebook = useCallback(async (
    notebookId: string,
    section: ResearchNotebookV2Section,
    syncSelection = true,
  ) => {
    if (!userId) return
    setSelectingNotebook(true)
    try {
      const notebook = await getResearchNotebook(userId, notebookId)
      if (!notebook) {
        toast.warning('Caderno não encontrado', 'A seleção solicitada não está mais disponível.')
        return
      }
      setActiveNotebook(notebook)
      setNotebooks((current) => current.map((item) => (item.id === notebook.id ? { ...item, ...notebook } : item)))
      setActiveSection(section)
      setSelectedSourceId((current) => current && notebook.sources.some((source) => source.id === current) ? current : (notebook.sources[0]?.id || null))
      if (syncSelection) syncRoute(notebook.id, section)
    } catch {
      toast.error('Erro ao abrir caderno')
    } finally {
      setSelectingNotebook(false)
    }
  }, [syncRoute, toast, userId])

  const loadNotebooks = useCallback(async () => {
    if (!userId || !IS_FIREBASE) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const result = await listResearchNotebooks(userId)
      setNotebooks(result.items)
    } catch {
      toast.error('Erro ao carregar cadernos de pesquisa')
    } finally {
      setLoading(false)
    }
  }, [toast, userId])

  const loadAcervo = useCallback(async () => {
    if (!userId || !IS_FIREBASE) return
    setAcervoLoading(true)
    try {
      const result = await listAcervoDocuments(userId)
      setAcervoDocs(result.items)
    } catch {
      toast.warning('Não foi possível carregar o acervo neste momento.')
    } finally {
      setAcervoLoading(false)
    }
  }, [toast, userId])

  useEffect(() => {
    void loadNotebooks()
  }, [loadNotebooks])

  useEffect(() => {
    if (!userId || !IS_FIREBASE) return

    let cancelled = false

    getUserSettings(userId)
      .then((settings) => {
        if (cancelled) return

        const aliases = settings.last_jurisprudence_tribunal_aliases
        if (!Array.isArray(aliases) || aliases.length === 0) return

        const validAliases = aliases.filter((alias) => ALL_TRIBUNALS.some((tribunal) => tribunal.alias === alias))
        if (validAliases.length > 0) {
          setLastJurisprudenceTribunalAliases(validAliases)
        }
      })
      .catch(() => {
        return
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (activeSection === 'sources' && acervoDocs.length === 0 && !acervoLoading) {
      void loadAcervo()
    }
  }, [activeSection, acervoDocs.length, acervoLoading, loadAcervo])

  useEffect(() => {
    if (loading) return

    const requestedNotebookId = searchParams.get('open')
    const requestedSection = parseResearchNotebookV2Section(searchParams.get('section'))

    if (!requestedNotebookId) {
      if (notebooks.length === 0) {
        setActiveNotebook(null)
        setSelectedSourceId(null)
        return
      }

      if (!activeNotebook || !notebooks.some((notebook) => notebook.id === activeNotebook.id)) {
        const firstNotebookId = notebooks[0]?.id
        if (firstNotebookId) {
          void hydrateNotebook(firstNotebookId, requestedSection, true)
        }
        return
      }

      if (activeSection !== requestedSection) {
        setActiveSection(requestedSection)
      }
      return
    }

    if (activeNotebook?.id !== requestedNotebookId) {
      void hydrateNotebook(requestedNotebookId, requestedSection, false)
      return
    }

    if (activeSection !== requestedSection) {
      setActiveSection(requestedSection)
    }
  }, [activeNotebook, activeSection, hydrateNotebook, loading, notebooks, searchParams])

  useEffect(() => {
    if (!activeNotebook) {
      setSelectedSourceId(null)
      return
    }

    if (!selectedSourceId || !activeNotebook.sources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(activeNotebook.sources[0]?.id || null)
    }
  }, [activeNotebook, selectedSourceId])

  useEffect(() => {
    setLastChatContextAudit(null)
    setLastResearchContextAudit(null)
    setChatInput('')
    acervoAbortRef.current?.abort()
    acervoAbortRef.current = null
    setAcervoAnalysisLoading(false)
    setAcervoAnalysisPhase('')
    setAcervoAnalysisMessage('')
    setAcervoAnalysisPercent(0)
    setAcervoAnalysisMeta('')
    setAcervoAnalysisError('')
    setAcervoAnalysisResults([])
    setSelectedAnalysisIds(new Set())
    setShowAcervoProgressModal(false)
    setViewerSource(null)
    setViewingArtifact(null)
    setShowVideoGenCost(false)
    setVideoGenSavedArtifact(null)
    setVideoGenLoading(false)
    setVideoGenProgress(null)
    setVideoGenLastCheckpoint(null)
    setVideoProduction(null)
    setVideoStudioLiteralLoading(false)
    setVideoStudioLiteralProgress(null)
    setShowAllResearchAudits(false)
    setShowAllSavedSearches(false)
    setSavedSearchFilter('')
    setSavedSearchVariantFilter('all')
    setSelectedSavedSearchIds(new Set())
    setBulkSavedSearchTagInput('')
    setEditingSavedSearchId(null)
    setEditingSavedSearchTitle('')
    setEditingSavedSearchTags('')
  }, [activeNotebook?.id])

  useEffect(() => {
    if (viewerSource && !activeNotebook?.sources.some((source) => source.id === viewerSource.id)) {
      setViewerSource(null)
    }
  }, [activeNotebook?.sources, viewerSource])

  useEffect(() => {
    if (viewingArtifact && !activeNotebook?.artifacts.some((artifact) => artifact.id === viewingArtifact.id)) {
      setViewingArtifact(null)
    }
  }, [activeNotebook?.artifacts, viewingArtifact])

  useEffect(() => {
    return () => {
      acervoAbortRef.current?.abort()
      acervoAbortRef.current = null
      researchAbortRef.current?.abort()
      researchAbortRef.current = null
    }
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [activeNotebook?.id, activeNotebook?.messages.length, chatLoading])

  const filteredNotebooks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) return notebooks
    return notebooks.filter((notebook) => {
      return notebook.title.toLowerCase().includes(normalizedQuery)
        || notebook.topic.toLowerCase().includes(normalizedQuery)
        || (notebook.description?.toLowerCase().includes(normalizedQuery) ?? false)
    })
  }, [notebooks, searchQuery])

  const snapshot = useMemo(
    () => (activeNotebook ? buildResearchNotebookV2Snapshot(activeNotebook) : null),
    [activeNotebook],
  )

  const chatAudit = useMemo(() => buildChatContextAudit({
    sources: activeNotebook?.sources || [],
    messages: activeNotebook?.messages || [],
    minSourceChars: MIN_SOURCE_CHARS,
    maxSourceCharsPerSource: MAX_CONTEXT_TEXT_LENGTH,
    maxConversationMessages: MAX_CONVERSATION_CONTEXT_MESSAGES,
    maxConversationChars: MAX_STUDIO_CONTEXT_CHARS,
    liveWebEnabled: false,
  }), [activeNotebook?.messages, activeNotebook?.sources])

  const studioAudit = useMemo(() => buildStudioContextAudit({
    sources: activeNotebook?.sources || [],
    messages: activeNotebook?.messages || [],
    minSourceChars: MIN_SOURCE_CHARS,
    maxSourceCharsPerSource: MAX_CONTEXT_TEXT_LENGTH,
    maxConversationMessages: MAX_STUDIO_CONTEXT_MESSAGES,
    maxConversationChars: MAX_STUDIO_CONTEXT_CHARS,
    customInstructions: studioCustomPrompt,
  }), [activeNotebook?.messages, activeNotebook?.sources, studioCustomPrompt])

  const studioTrailSteps = useMemo(
    () => buildStudioTrailSteps(selectedStudioTask ?? undefined, selectedStudioTaskMetadata?.artifactType ?? null),
    [selectedStudioTask, selectedStudioTaskMetadata],
  )

  const studioProgressState = useMemo(
    () => buildStudioModalProgressState(selectedStudioTask ?? undefined, selectedStudioTaskMetadata?.artifactType ?? null),
    [selectedStudioTask, selectedStudioTaskMetadata],
  )

  const selectedSource = useMemo(() => {
    if (!activeNotebook) return null
    return activeNotebook.sources.find((source) => source.id === selectedSourceId) || null
  }, [activeNotebook, selectedSourceId])

  const chatSuggestions = useMemo(
    () => activeNotebook ? buildChatSuggestions(activeNotebook.topic) : [],
    [activeNotebook],
  )

  const effectiveChatAudit = lastChatContextAudit || chatAudit
  const isAnyResearchLoading = externalResearchLoading || externalDeepLoading || jurisprudenceLoading

  const researchContextAuditPreview = useMemo(() => buildResearchContextAudit({
    variant: 'external',
    mode: 'preview',
    query: externalSearchQuery,
    tribunalCount: lastJurisprudenceTribunalAliases.length,
    sourceKindLabel: 'Pesquisa externa',
  }), [externalSearchQuery, lastJurisprudenceTribunalAliases.length])

  const visibleResearchAudits = useMemo(() => {
    const audits = activeNotebook?.research_audits || []
    return showAllResearchAudits ? audits : audits.slice(0, 4)
  }, [activeNotebook?.research_audits, showAllResearchAudits])

  const sortedSavedSearches = useMemo(
    () => filterNotebookSavedSearches(activeNotebook?.saved_searches || [], savedSearchFilter, savedSearchVariantFilter),
    [activeNotebook?.saved_searches, savedSearchFilter, savedSearchVariantFilter],
  )

  const savedSearchVariantCounts = useMemo(
    () => countNotebookSavedSearchesByVariant(activeNotebook?.saved_searches || []),
    [activeNotebook?.saved_searches],
  )

  const visibleSavedSearches = useMemo(
    () => showAllSavedSearches ? sortedSavedSearches : sortedSavedSearches.slice(0, 5),
    [showAllSavedSearches, sortedSavedSearches],
  )

  const visibleSavedSearchIds = useMemo(
    () => visibleSavedSearches.map((search) => search.id),
    [visibleSavedSearches],
  )

  const allVisibleSavedSearchesSelected = useMemo(
    () => visibleSavedSearchIds.length > 0 && visibleSavedSearchIds.every((id) => selectedSavedSearchIds.has(id)),
    [selectedSavedSearchIds, visibleSavedSearchIds],
  )

  const pinnedSavedSearches = useMemo(
    () => visibleSavedSearches.filter((search) => search.pinned),
    [visibleSavedSearches],
  )

  const regularSavedSearches = useMemo(
    () => visibleSavedSearches.filter((search) => !search.pinned),
    [visibleSavedSearches],
  )

  const researchSources = useMemo(
    () => (activeNotebook?.sources || []).filter((source) => source.type === 'external' || source.type === 'external_deep' || source.type === 'jurisprudencia').slice().reverse(),
    [activeNotebook?.sources],
  )

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

  const availableAcervoDocs = useMemo(
    () => filterNotebookAcervoCandidates(acervoDocs, activeNotebook, sourceSearch),
    [acervoDocs, activeNotebook, sourceSearch],
  )

  const addableAnalysisResults = useMemo(() => {
    const existingSourceIds = new Set(
      (activeNotebook?.sources || [])
        .filter((source) => source.type === 'acervo' && source.reference)
        .map((source) => source.reference),
    )

    return acervoAnalysisResults.filter((doc) => !existingSourceIds.has(doc.id))
  }, [activeNotebook?.sources, acervoAnalysisResults])

  const allAddableAnalysisResultsSelected = useMemo(
    () => addableAnalysisResults.length > 0 && addableAnalysisResults.every((doc) => selectedAnalysisIds.has(doc.id)),
    [addableAnalysisResults, selectedAnalysisIds],
  )

  useEffect(() => {
    const allowedIds = new Set(sortedSavedSearches.map((search) => search.id))
    setSelectedSavedSearchIds((current) => {
      const next = new Set(Array.from(current).filter((id) => allowedIds.has(id)))
      if (next.size === current.size) return current
      return next
    })
  }, [sortedSavedSearches])

  useEffect(() => {
    const allowedIds = new Set(addableAnalysisResults.map((doc) => doc.id))
    setSelectedAnalysisIds((current) => {
      const next = new Set(Array.from(current).filter((id) => allowedIds.has(id)))
      if (next.size === current.size) return current
      return next
    })
  }, [addableAnalysisResults])

  const handleCreateNotebook = async () => {
    if (!userId || !createTitle.trim() || !createTopic.trim()) return
    setCreating(true)
    try {
      const notebookId = await createResearchNotebook(userId, {
        title: createTitle.trim(),
        topic: createTopic.trim(),
        description: createDescription.trim() || '',
        sources: [],
        messages: [],
        artifacts: [],
        status: 'active',
      })
      await loadNotebooks()
      setCreateTitle('')
      setCreateTopic('')
      setCreateDescription('')
      setShowCreateForm(false)
      toast.success('Caderno criado com sucesso')
      await hydrateNotebook(notebookId, 'overview', true)
    } catch {
      toast.error('Erro ao criar caderno')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteNotebook = async (notebook: ResearchNotebookData) => {
    if (!userId || !notebook.id) return
    const confirmed = window.confirm(`Excluir o caderno "${notebook.title}" permanentemente?`)
    if (!confirmed) return

    try {
      await deleteResearchNotebook(userId, notebook.id)
      toast.success('Caderno excluído')
      const isCurrent = activeNotebook?.id === notebook.id
      await loadNotebooks()
      if (isCurrent) {
        setActiveNotebook(null)
        setSelectedSourceId(null)
      }
    } catch {
      toast.error('Erro ao excluir caderno')
    }
  }

  const handleChangeSection = (section: ResearchNotebookV2Section) => {
    setActiveSection(section)
    if (activeNotebook?.id) syncRoute(activeNotebook.id, section)
  }

  const handleOpenArtifact = (artifact: StudioArtifact) => {
    if (artifact.type === 'video_production') {
      openVideoStudioArtifact(artifact)
      return
    }

    setViewingArtifact(artifact)
  }

  const saveArtifactToNotebook = useCallback(async (
    artifact: StudioArtifact,
    executions: Array<{
      phase: string
      agent_name: string
      model: string
      tokens_in: number
      tokens_out: number
      cost_usd: number
      duration_ms: number
    }>,
    options?: {
      notebookId?: string
      notebookTopic?: string
      notebookTitle?: string
      activateArtifactsSection?: boolean
    },
  ) => {
    if (!userId) return

    const notebookId = options?.notebookId ?? activeNotebook?.id
    if (!notebookId) return

    const notebookTopic = options?.notebookTopic ?? activeNotebook?.topic ?? artifact.title
    const notebookTitle = options?.notebookTitle ?? activeNotebook?.title ?? ''
    const freshNotebook = await getFreshNotebookOrThrow(notebookId)
    const updatedArtifacts = [...freshNotebook.artifacts, artifact]

    const costKey: UsageFunctionKey = ARTIFACT_COST_KEY[artifact.type] ?? 'caderno_pesquisa'
    const newExecutions = executions.map((execution) =>
      createUsageExecutionRecord({
        source_type: costKey,
        source_id: notebookId,
        phase: execution.phase,
        agent_name: execution.agent_name,
        model: execution.model,
        tokens_in: execution.tokens_in,
        tokens_out: execution.tokens_out,
        cost_usd: execution.cost_usd,
        duration_ms: execution.duration_ms,
      }),
    )
    const updatedExecutions = [...(freshNotebook.llm_executions || []), ...newExecutions]

    await updateResearchNotebook(userId, notebookId, {
      artifacts: updatedArtifacts,
      llm_executions: updatedExecutions,
    })

    patchNotebook(notebookId, {
      artifacts: updatedArtifacts,
      llm_executions: updatedExecutions,
    })

    if (options?.activateArtifactsSection !== false) {
      setActiveSection('artifacts')
      syncRoute(notebookId, 'artifacts')
    }

    if (artifact.type === 'documento' && IS_FIREBASE) {
      try {
        await saveNotebookDocumentToDocuments(userId, {
          topic: notebookTopic,
          content: artifact.content,
          notebookId,
          notebookTitle,
          llm_executions: newExecutions,
        })
        setTimeout(() => {
          toast.success('Documento salvo na página Documentos', 'Acesse Documentos para ver, editar e exportar este documento.')
        }, SECONDARY_TOAST_DELAY_MS)
      } catch (error) {
        console.warn('Could not persist notebook document artifact:', error)
      }
    }
  }, [activeNotebook?.id, activeNotebook?.title, activeNotebook?.topic, getFreshNotebookOrThrow, patchNotebook, syncRoute, toast, userId])

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
    const newExecutions = executions.map((execution) =>
      createUsageExecutionRecord({
        source_type: sourceType,
        source_id: notebookId,
        phase: execution.phase,
        agent_name: execution.agent_name,
        model: execution.model,
        tokens_in: execution.tokens_in,
        tokens_out: execution.tokens_out,
        cost_usd: execution.cost_usd,
        duration_ms: execution.duration_ms,
      }),
    )
    const updatedExecutions = [...(freshNotebook.llm_executions || []), ...newExecutions]

    await updateResearchNotebook(userId, notebookId, { llm_executions: updatedExecutions })
    patchNotebook(notebookId, { llm_executions: updatedExecutions })
  }, [getFreshNotebookOrThrow, patchNotebook, userId])

  const openVideoStudioArtifact = useCallback((artifact: StudioArtifact) => {
    try {
      const parsed = JSON.parse(artifact.content) as VideoProductionPackage
      setVideoProduction(normalizeVideoProductionPackage(parsed))
      setViewingArtifact(null)
      setShowVideoGenCost(false)
      setVideoGenSavedArtifact(null)
    } catch (error) {
      console.error('Could not open video studio artifact:', error)
      toast.error('Erro ao abrir o estúdio de vídeo', 'O pacote salvo não pôde ser interpretado.')
    }
  }, [toast])

  const handleSkipVideoGeneration = useCallback(() => {
    setShowVideoGenCost(false)
    setVideoGenSavedArtifact(null)
    setVideoGenProgress(null)
    setVideoGenLastCheckpoint(null)
  }, [])

  const handleGenerateVideo = useCallback(async (editedContent?: string) => {
    if (!videoGenSavedArtifact || !userId || !activeNotebook?.id || videoGenLoading) return

    let resolveTask: (value: unknown) => void = () => {}
    let rejectTask: (reason?: unknown) => void = () => {}
    const taskPromise = new Promise((resolve, reject) => {
      resolveTask = resolve
      rejectTask = reject
    })

    const notebookId = activeNotebook.id
    const taskName = `Vídeo V2: ${activeNotebook.topic.slice(0, 40)}`
    let reportTaskProgress: (update: {
      progress: number
      phase: string
      stageMeta?: string
      operationals?: TaskOperationalSummary
    }) => void = () => {}
    let videoTaskOperationalSummary = createEmptyOperationalSummary()

    startTask(taskName, (onTaskProgress) => {
      reportTaskProgress = onTaskProgress
      onTaskProgress({ progress: 0, phase: 'Preparando pipeline...', operationals: videoTaskOperationalSummary })
      return taskPromise
    })

    try {
      setVideoGenLoading(true)
      setVideoGenLastCheckpoint(null)
      videoGenOperationalEventKeysRef.current = new Set()

      const apiKey = await getOpenRouterKey()
      if (!apiKey) {
        const error = new Error('Chave da API não configurada.')
        rejectTask(error)
        toast.error('Chave da API não configurada. Acesse Configurações > Chaves de API.')
        return
      }

      setVideoStudioApiKey(apiKey)

      let artifactToRun = videoGenSavedArtifact
      const scriptContent = editedContent || artifactToRun.content

      if (editedContent && editedContent !== artifactToRun.content) {
        const freshNotebook = await getFreshNotebookOrThrow(notebookId)
        const updatedArtifacts = freshNotebook.artifacts.map((artifact) =>
          artifact.id === artifactToRun.id
            ? {
                ...artifact,
                content: editedContent,
                created_at: new Date().toISOString(),
              }
            : artifact,
        )
        artifactToRun = updatedArtifacts.find((artifact) => artifact.id === artifactToRun.id) || { ...artifactToRun, content: editedContent }

        await updateResearchNotebook(userId, notebookId, { artifacts: updatedArtifacts })
        patchNotebook(notebookId, { artifacts: updatedArtifacts })
        setVideoGenSavedArtifact(artifactToRun)
        setViewingArtifact((current) => (current?.id === artifactToRun.id ? artifactToRun : current))
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
        }

        reportTaskProgress({
          progress: progress.percent,
          phase: progress.stageLabel
            ? `${progress.stageLabel}: ${progress.stageDescription || progress.phase}`
            : (agent ? `${agent}: ${phase}` : phase),
          stageMeta: progress.stageMeta,
          operationals: videoTaskOperationalSummary,
        })
      }

      const { runVideoGenerationPipeline } = await loadVideoGenerationRuntime()
      const result = await runVideoGenerationPipeline({
        apiKey,
        scriptContent,
        topic: activeNotebook.topic,
        sourceId: notebookId,
        generateMedia: true,
      }, onProgress)

      const costKey: UsageFunctionKey = 'video_pipeline'
      const newExecutions = result.executions.map((execution) =>
        createUsageExecutionRecord({
          source_type: costKey,
          source_id: notebookId,
          phase: execution.phase,
          agent_name: execution.agent_name,
          model: execution.model,
          tokens_in: execution.tokens_in,
          tokens_out: execution.tokens_out,
          cost_usd: execution.cost_usd,
          duration_ms: execution.duration_ms,
        }),
      )
      const freshNotebookForExecutions = await getFreshNotebookOrThrow(notebookId)
      const updatedExecutions = [...(freshNotebookForExecutions.llm_executions || []), ...newExecutions]
      await updateResearchNotebook(userId, notebookId, { llm_executions: updatedExecutions })
      patchNotebook(notebookId, { llm_executions: updatedExecutions })

      setVideoProduction(normalizeVideoProductionPackage(result.package))
      setShowVideoGenCost(false)
      setVideoGenSavedArtifact(null)

      if (result.mediaErrors && result.mediaErrors.length > 0) {
        toast.warning(
          'Vídeo gerado com avisos',
          `${result.mediaErrors.length} erro(s) na geração de mídia. Verifique as notas de produção.`,
        )
      } else {
        const totalClips = result.package.scenes.reduce((sum, scene) => sum + (scene.clips?.length || 0), 0)
        const clipsWithImages = result.package.scenes.reduce((sum, scene) => sum + (scene.clips?.filter((clip) => clip.generatedImageUrl).length || 0), 0)
        toast.success(`Vídeo gerado! ${clipsWithImages}/${totalClips} clips com imagem, narração pronta.`)
      }

      resolveTask(result.package)
    } catch (error) {
      console.error('Video generation error:', error)
      rejectTask(error)

      const checkpoint = (error as Error & { videoCheckpoint?: VideoCheckpoint }).videoCheckpoint ?? null
      if (checkpoint && checkpoint.completedStep > 0) {
        setVideoGenLastCheckpoint(checkpoint)
      }

      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('429')) {
        toast.warning(
          'Limite de requisições atingido',
          checkpoint
            ? `Progresso salvo (${checkpoint.completedStep}/${checkpoint.totalSteps} etapas). Aguarde e tente novamente.`
            : 'O modelo está sobrecarregado. Aguarde alguns minutos e tente novamente.',
        )
      } else if (message.includes('401') || message.toLowerCase().includes('auth')) {
        toast.error('Chave de API inválida', 'Verifique sua chave de API nas configurações.')
      } else if (message.includes('timeout') || message.includes('TIMEOUT')) {
        toast.error(
          'Tempo esgotado',
          checkpoint
            ? `Progresso salvo (${checkpoint.completedStep}/${checkpoint.totalSteps} etapas). Tente um modelo mais rápido.`
            : 'O modelo demorou muito para responder. Tente um modelo mais rápido.',
        )
      } else if (message.includes('model') || message.includes('Model')) {
        toast.error('Modelo indisponível', 'O modelo configurado não está disponível. Altere nas configurações do pipeline.')
      } else {
        toast.error(
          'Erro ao gerar vídeo',
          checkpoint
            ? `Progresso salvo (${checkpoint.completedStep}/${checkpoint.totalSteps} etapas). Verifique sua conexão e tente novamente.`
            : 'Verifique sua conexão, chave de API e configuração dos modelos.',
        )
      }
    } finally {
      setVideoGenLoading(false)
      setVideoGenProgress(null)
    }
  }, [activeNotebook?.id, activeNotebook?.topic, getFreshNotebookOrThrow, patchNotebook, startTask, toast, userId, videoGenLoading, videoGenSavedArtifact])

  const handleSaveVideoStudioToNotebook = useCallback(async (
    production: VideoProductionPackage,
    options?: { silent?: boolean; syncEditorState?: boolean },
  ): Promise<VideoProductionPackage> => {
    if (!userId || !activeNotebook?.id) {
      throw new Error('Usuário ou caderno indisponível para salvar produção de vídeo.')
    }

    const notebookId = activeNotebook.id

    try {
      const { uploadNotebookMediaArtifact, uploadNotebookVideoArtifact } = await loadNotebookMediaStorageRuntime()
      const uploadCache = videoStudioUploadCacheRef.current

      const uploadWithRetry = async <T,>(label: string, task: () => Promise<T>): Promise<T> => {
        let lastError: unknown
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            return await task()
          } catch (error) {
            lastError = error
            if (attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 800 * attempt))
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
            () => uploadNotebookVideoArtifact(userId, notebookId, production.title, videoBlob),
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
        const uploadedScopes = await Promise.all(productionToSave.renderedScopes.map(async (renderedScope) => {
          if (!renderedScope.url || (!renderedScope.url.startsWith('blob:') && !renderedScope.url.startsWith('data:'))) {
            return renderedScope
          }

          const stored = uploadCache.get(renderedScope.url) || await (async () => {
            const scopedBlob = await resolveMediaBlob(renderedScope.url, renderedScope.blob)
            const uploaded = await uploadWithRetry(
              `Upload render de escopo ${renderedScope.scopeKey}`,
              () => uploadNotebookMediaArtifact(
                userId,
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

      const uploadedSceneAssets = await Promise.all((productionToSave.sceneAssets || []).map(async (sceneAsset) => {
        let imageUrl = sceneAsset.imageUrl
        let imageStoragePath = sceneAsset.imageStoragePath
        let narrationUrl = sceneAsset.narrationUrl
        let narrationStoragePath = sceneAsset.narrationStoragePath
        let videoClips = sceneAsset.videoClips

        if (imageUrl && (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:'))) {
          const stored = uploadCache.get(imageUrl) || await (async () => {
            const imageBlob = await fetch(imageUrl).then((response) => response.blob())
            const uploaded = await uploadWithRetry(
              `Upload imagem cena ${sceneAsset.sceneNumber}`,
              () => uploadNotebookMediaArtifact(
                userId,
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
                userId,
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
          videoClips = await Promise.all(videoClips.map(async (clip) => {
            if (!clip.url || (!clip.url.startsWith('blob:') && !clip.url.startsWith('data:'))) return clip

            const stored = uploadCache.get(clip.url) || await (async () => {
              const clipBlob = await resolveMediaBlob(clip.url, clip.blob)
              const uploaded = await uploadWithRetry(
                `Upload clip cena ${clip.sceneNumber} parte ${clip.partNumber}`,
                () => uploadNotebookMediaArtifact(
                  userId,
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
          const soundtrackMimeType = soundtrackAsset?.mimeType || soundtrackBlob.type
          const uploaded = await uploadWithRetry(
            'Upload trilha sonora',
            () => uploadNotebookMediaArtifact(
              userId,
              notebookId,
              `${production.title}-soundtrack`,
              soundtrackBlob,
              'audios',
              getExtensionFromMimeType(soundtrackMimeType, '.wav'),
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

      productionToSave = compactVideoProductionForPersistence({
        ...productionToSave,
        sceneAssets: uploadedSceneAssets,
        soundtrackAsset,
      })

      const artifactTitle = `Estúdio de Vídeo: ${production.title}`
      const content = JSON.stringify(productionToSave)
      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const existingIdx = freshNotebook.artifacts.findIndex(
        (artifact) => artifact.type === 'video_script' && artifact.format === 'json' && artifact.title === artifactTitle,
      )

      let updatedArtifacts: StudioArtifact[]
      if (existingIdx >= 0) {
        updatedArtifacts = [...freshNotebook.artifacts]
        updatedArtifacts[existingIdx] = {
          ...updatedArtifacts[existingIdx],
          content,
          created_at: new Date().toISOString(),
        }
      } else {
        updatedArtifacts = [
          ...freshNotebook.artifacts,
          {
            id: `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: 'video_script',
            title: artifactTitle,
            content,
            format: 'json',
            created_at: new Date().toISOString(),
          },
        ]
      }

      const savedArtifact = existingIdx >= 0 ? updatedArtifacts[existingIdx] : updatedArtifacts[updatedArtifacts.length - 1]

      await updateResearchNotebook(userId, notebookId, { artifacts: updatedArtifacts })
      patchNotebook(notebookId, { artifacts: updatedArtifacts })
      setViewingArtifact((current) => (current?.id === savedArtifact.id ? savedArtifact : current))

      if (options?.syncEditorState !== false) {
        setVideoProduction(normalizeVideoProductionPackage(productionToSave))
      }

      if (!options?.silent) {
        toast.success(existingIdx >= 0 ? 'Estúdio de vídeo atualizado!' : 'Estúdio de vídeo salvo nos artefatos do caderno!')
      }

      return productionToSave
    } catch (error) {
      console.error('Error saving video studio artifact:', error)
      if (!options?.silent) {
        toast.error('Erro ao salvar estúdio nos artefatos.')
      }
      throw error
    }
  }, [activeNotebook?.id, getFreshNotebookOrThrow, patchNotebook, toast, userId])

  const handleRunLiteralVideoStudioProduction = useCallback(async (production: VideoProductionPackage) => {
    if (!userId || !activeNotebook?.id || videoStudioLiteralLoading) return

    const notebookId = activeNotebook.id
    const apiKey = videoStudioApiKey || await getOpenRouterKey()
    if (!apiKey) {
      toast.error('Chave da API não configurada. Acesse Configurações > Chaves de API.')
      return
    }

    const taskName = `Vídeo literal V2: ${production.title.slice(0, 40)}`
    let reportTaskProgress: (update: {
      progress: number
      phase: string
      stageMeta?: string
      operationals?: TaskOperationalSummary
    }) => void = () => {}
    let literalTaskOperationalSummary = createEmptyOperationalSummary()
    let resolveTask: (value: VideoProductionPackage) => void = () => {}
    let rejectTask: (reason?: unknown) => void = () => {}
    const taskPromise = new Promise<VideoProductionPackage>((resolve, reject) => {
      resolveTask = resolve
      rejectTask = reject
    })

    startTask(taskName, (onTaskProgress) => {
      reportTaskProgress = onTaskProgress
      onTaskProgress({
        progress: 0,
        phase: 'Preparando geração literal...',
        stageMeta: 'Validando assets, checkpoints e provider de mídia',
        operationals: literalTaskOperationalSummary,
      })
      return taskPromise
    })

    try {
      setVideoStudioLiteralLoading(true)
      setVideoStudioApiKey(apiKey)
      videoLiteralOperationalEventKeysRef.current = new Set()

      const { generateLiteralMediaAssets, renderLiteralVideo } = await loadLiteralVideoRuntime()

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
        }

        reportTaskProgress({
          progress: progress.percent,
          phase: progress.stageLabel
            ? `${progress.stageLabel}: ${progress.stageDescription || progress.phase}`
            : (agent ? `${agent}: ${phase}` : phase),
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
          setVideoProduction(normalizeVideoProductionPackage(persisted))
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
        const renderMessage = renderError instanceof Error ? renderError.message : String(renderError)
        const isRenderInfraError = /mediarecorder|canvas|quota|oom|memory|encodererror|securityerror/i.test(renderMessage)
          || renderMessage.includes('NotSupportedError')
          || renderMessage.includes('NotAllowedError')

        const { isExternalVideoProviderConfigured, requestExternalVideoClip } = await loadExternalVideoProviderRuntime()
        if (isRenderInfraError && isExternalVideoProviderConfigured()) {
          onProgress(0, 1, 'Renderer local falhou. Tentando provedor externo de vídeo...', 'Provedor Externo')
          toast.info('Renderer local indisponível', 'Tentando provedor externo de vídeo como fallback...')

          const firstScene = media.production.scenes?.[0]
          const clipResult = await requestExternalVideoClip({
            prompt: firstScene?.imagePrompt || media.production.title,
            durationSeconds: 30,
            aspectRatio: '16:9',
          })

          if (!clipResult?.url) {
            throw renderError
          }

          const videoResponse = await fetch(clipResult.url)
          const videoBlob = await videoResponse.blob()
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
        reportTaskProgress({
          progress: 100,
          phase: 'Render finalizado por provedor externo',
          stageMeta: renderModel,
          operationals: literalTaskOperationalSummary,
        })
      }

      setVideoProduction(normalizeVideoProductionPackage(persistedFinal))

      if (viewingArtifact?.type === 'video_script') {
        const freshNotebook = await getFreshNotebookOrThrow(notebookId)
        const refreshed = freshNotebook.artifacts.find((artifact) => artifact.title === `Estúdio de Vídeo: ${persistedFinal.title}`)
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
          `${message} — Acesse Configurações → Pipeline de Vídeo e escolha modelos compatíveis.`,
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
    }
  }, [activeNotebook?.id, appendNotebookExecutions, getFreshNotebookOrThrow, handleSaveVideoStudioToNotebook, startTask, toast, userId, videoStudioApiKey, videoStudioLiteralLoading, viewingArtifact?.type])

  const handleGenerateArtifact = async (artifactType: StudioArtifactType) => {
    if (!userId || !activeNotebook?.id) return

    const existingTask = runningArtifactTasksByType.get(artifactType)
    if (existingTask) {
      setSelectedStudioTaskId(existingTask.id)
      setShowStudioProgressModal(true)
      toast.info('Esta geração já está em andamento.', 'Abra o painel de progresso para acompanhar a trilha.')
      return
    }

    const artifactDef = ARTIFACT_TYPES.find((artifact) => artifact.type === artifactType)
    const notebookSnapshot = {
      id: activeNotebook.id,
      topic: activeNotebook.topic,
      title: activeNotebook.title,
      description: activeNotebook.description || undefined,
      sourceContext: studioAudit.sourceText || '',
      conversationContext: studioAudit.conversationText,
      customInstructions: studioCustomPrompt.trim() || undefined,
    }

    const taskId = startTask(
      `Estúdio V2: ${artifactDef?.label || artifactType}`,
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
          const onProgress = (step: number, total: number, phase: string, meta?: {
            stageMeta?: string
            costUsd?: number
            durationMs?: number
            retryCount?: number
            usedFallback?: boolean
            fallbackFrom?: string
          }) => {
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
            ? await loadAudioGenerationRuntime().then(({ runAudioGenerationPipeline }) => runAudioGenerationPipeline(pipelineInput, onProgress))
            : artifactType === 'apresentacao'
              ? await loadPresentationGenerationRuntime().then(({ runPresentationGenerationPipeline }) => runPresentationGenerationPipeline(pipelineInput, onProgress))
              : await loadStudioPipelineRuntime().then(({ runStudioPipeline }) => runStudioPipeline(pipelineInput, onProgress))

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

          setStudioCustomPrompt('')

          if (artifactType === 'video_script') {
            setShowStudioProgressModal(false)
            setVideoGenSavedArtifact(artifact)
            setShowVideoGenCost(true)
            toast.success('Roteiro de vídeo salvo. Revise o custo e confirme a produção no V2.')
          } else {
            toast.success(
              REVIEWABLE_ARTIFACT_TYPES.includes(artifactType)
                ? `${artifactDef?.label || 'Artefato'} gerado e salvo. Abra em Artefatos para revisar ou continuar a produção.`
                : `${artifactDef?.label || 'Artefato'} gerado com sucesso!`,
            )
          }

          return { artifactId: artifact.id, artifactType }
        } catch (error) {
          console.error('Studio pipeline error:', error)
          if (error instanceof ModelUnavailableError) {
            toast.warning(
              `Modelo indisponível: ${error.modelId}`,
              'Um modelo do pipeline do estúdio foi removido do OpenRouter. Vá em Configurações > Caderno de Pesquisa e substitua-o.',
            )
          } else if (error instanceof Error && error.message.includes('Agente(s) sem modelo')) {
            toast.warning('Modelos não configurados', error.message)
          } else if (error instanceof Error && error.message.includes('404')) {
            toast.warning(
              'Modelo ou provedor indisponível',
              'O provedor retornou 404 para um modelo do estúdio. Revise os modelos em Configurações > Caderno de Pesquisa e tente novamente.',
            )
          } else if (error instanceof Error && error.message.includes('429')) {
            toast.warning(
              'Limite de requisições atingido',
              'O modelo está sobrecarregado ou sua conta atingiu o limite. Aguarde 30 segundos e tente novamente. Considere usar modelos gratuitos em Configurações.',
            )
          } else if (error instanceof Error && error.message.includes('API key')) {
            toast.error('Chave da API não configurada. Acesse Configurações > Chaves de API.')
          } else {
            toast.error('Erro ao gerar artefato. Tente novamente ou troque o modelo do agente.')
          }
          throw error
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

  const handleDeleteArtifact = async (artifactId: string) => {
    if (!userId || !activeNotebook?.id) return

    const notebookId = activeNotebook.id
    const updatedAt = new Date().toISOString()

    try {
      const notebook = await getFreshNotebookOrThrow(notebookId)
      const updatedArtifacts = notebook.artifacts.filter((artifact) => artifact.id !== artifactId)

      await updateResearchNotebook(userId, notebookId, { artifacts: updatedArtifacts })
      patchNotebook(notebookId, { artifacts: updatedArtifacts, updated_at: updatedAt })
      setViewingArtifact((current) => (current?.id === artifactId ? null : current))
      toast.success('Artefato removido')
    } catch {
      toast.error('Erro ao remover artefato')
    }
  }

  const handleDownloadArtifact = (artifact: StudioArtifact) => {
    const extension = artifact.format === 'json'
      ? '.json'
      : artifact.format === 'html'
        ? '.html'
        : '.md'
    const mimeType = artifact.format === 'json'
      ? 'application/json;charset=utf-8'
      : artifact.format === 'html'
        ? 'text/html;charset=utf-8'
        : 'text/markdown;charset=utf-8'
    const blob = new Blob([artifact.content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = `${artifact.title.replace(/[^a-zA-Z0-9À-ÿ ]/g, '_').replace(/_{2,}/g, '_').trim()}${extension}`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  const handleGenerateVisualArtifact = async (artifact: StudioArtifact) => {
    if (!userId || !activeNotebook?.id || visualGenLoading) return
    if (!isVisualArtifactType(artifact.type)) return

    const uid = userId
    const notebookId = activeNotebook.id
    const notebookTopic = activeNotebook.topic
    const notebookDescription = activeNotebook.description || undefined
    setVisualGenLoading(true)
    setVisualGeneratingArtifactId(artifact.id)

    try {
      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const currentArtifact = freshNotebook.artifacts.find((item) => item.id === artifact.id) ?? artifact
      const [{ parseArtifactContent }, { uploadNotebookMediaArtifact }] = await Promise.all([
        loadArtifactParsersRuntime(),
        loadNotebookMediaStorageRuntime(),
      ])
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
        const { generatePresentationMediaAssets } = await loadPresentationGenerationRuntime()
        const media = await generatePresentationMediaAssets({
          apiKey,
          topic: notebookTopic,
          description: notebookDescription,
        }, currentArtifact.content)
        const original = JSON.parse(currentArtifact.content) as Record<string, unknown>
        const sourceSlides = Array.isArray(original.slides) ? original.slides as Record<string, unknown>[] : []
        const updatedSlides: Record<string, unknown>[] = []

        for (let index = 0; index < parsed.data.slides.length; index++) {
          const slide = parsed.data.slides[index]
          const baseSlide = sourceSlides[index] || {}
          const generatedSlide = media.slideVisuals.find((item) => item.slideNumber === slide.number)
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
      } else if (
        (currentArtifact.type === 'infografico' && parsed.kind === 'infographic')
        || (currentArtifact.type === 'mapa_mental' && parsed.kind === 'mindmap')
        || (currentArtifact.type === 'tabela_dados' && parsed.kind === 'datatable')
      ) {
        const { generateStructuredVisualArtifactMedia } = await loadStudioPipelineRuntime()
        const original = JSON.parse(currentArtifact.content) as Record<string, unknown>
        const media = await generateStructuredVisualArtifactMedia(currentArtifact.type, currentArtifact.content)
        const suffix = currentArtifact.type === 'infografico'
          ? 'infografico-final'
          : currentArtifact.type === 'mapa_mental'
            ? 'mapa-mental-final'
            : 'tabela-final'
        const storedImage = await uploadNotebookMediaArtifact(
          uid,
          notebookId,
          `${currentArtifact.title}-${suffix}`,
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

      const updatedArtifacts = freshNotebook.artifacts.map((current) => (
        current.id === currentArtifact.id
          ? {
              ...current,
              format: 'json' as const,
              content: nextContent,
            }
          : current
      ))

      await updateResearchNotebook(uid, notebookId, { artifacts: updatedArtifacts })
      patchNotebook(notebookId, { artifacts: updatedArtifacts })

      await appendNotebookExecutions(
        notebookId,
        currentArtifact.type === 'apresentacao' ? 'presentation_pipeline' : 'caderno_pesquisa',
        visualExecutions,
      )

      setViewingArtifact((current) => {
        if (current?.id !== currentArtifact.id) return current
        return updatedArtifacts.find((item) => item.id === currentArtifact.id) || current
      })

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

  const handleGenerateAudioFromArtifact = async (artifact: StudioArtifact) => {
    if (!userId || !activeNotebook?.id || audioGenLoading) return
    if (artifact.type !== 'audio_script') return

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

      const [{ generateAudioLiteralMedia }, { uploadNotebookMediaArtifact }] = await Promise.all([
        loadAudioGenerationRuntime(),
        loadNotebookMediaStorageRuntime(),
      ])

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
      const updatedArtifacts = freshNotebook.artifacts.map((current): StudioArtifact => {
        if (current.id !== artifact.id) return current

        try {
          const parsed = JSON.parse(current.content) as Record<string, unknown>
          return {
            ...current,
            format: 'json',
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
      patchNotebook(notebookId, { artifacts: updatedArtifacts })
      await appendNotebookExecutions(notebookId, 'audio_pipeline', [synthesis.execution])

      setViewingArtifact((current) => {
        if (current?.id !== artifact.id) return current
        return updatedArtifacts.find((item) => item.id === artifact.id) || current
      })

      toast.success('Resumo em áudio gerado com sucesso!', `${synthesis.chunkCount} parte(s) sintetizada(s)`)    
    } catch (error) {
      console.error('Audio literal generation error:', error)
      const message = error instanceof Error ? error.message : String(error)
      const isCapabilityError = message.toLowerCase().includes('capability')
        || message.toLowerCase().includes('modalities')
        || /não atende.*capability/i.test(message)

      if (isCapabilityError) {
        toast.error(
          'Modelo incompatível com geração de áudio',
          `${message} — Acesse Configurações → Pipeline de Áudio e escolha um modelo com capacidade de áudio para "Narrador / TTS".`,
        )
      } else if (message.includes('429')) {
        toast.warning('Limite de TTS atingido', 'Aguarde alguns segundos e tente novamente.')
      } else {
        toast.error('Falha na geração literal de áudio', message)
      }
    } finally {
      setAudioGenLoading(false)
      setAudioGeneratingArtifactId(null)
    }
  }

  const handleSendMessage = async () => {
    if (!userId || !activeNotebook?.id || !chatInput.trim() || chatLoading) return

    const notebookId = activeNotebook.id
    const previousMessages = activeNotebook.messages
    const previousExecutions = activeNotebook.llm_executions || []
    const previousUpdatedAt = activeNotebook.updated_at
    const userMsg: NotebookMessage = {
      id: generateId(),
      role: 'user',
      content: chatInput.trim(),
      created_at: new Date().toISOString(),
    }

    const optimisticMessages = [...previousMessages, userMsg]
    patchNotebook(notebookId, { messages: optimisticMessages, updated_at: userMsg.created_at })
    setChatInput('')
    setChatLoading(true)

    try {
      const apiKey = await getOpenRouterKey()
      const models = await loadResearchNotebookModels(userId)
      const model = models.notebook_assistente
      if (!model) {
        patchNotebook(notebookId, {
          messages: previousMessages,
          llm_executions: previousExecutions,
          updated_at: previousUpdatedAt,
        })
        setChatInput(userMsg.content)
        toast.warning(
          'Modelo não configurado',
          `O agente "${AGENT_LABELS.notebook_assistente}" não possui modelo. Vá em Configurações > Caderno de Pesquisa e selecione um.`,
        )
        return
      }

      const baseChatContextAudit = buildChatContextAudit({
        sources: activeNotebook.sources,
        messages: optimisticMessages.slice(0, -1),
        minSourceChars: MIN_SOURCE_CHARS,
        maxSourceCharsPerSource: MAX_CONTEXT_TEXT_LENGTH,
        maxConversationMessages: MAX_CONVERSATION_CONTEXT_MESSAGES,
        maxConversationChars: MAX_STUDIO_CONTEXT_CHARS,
        liveWebEnabled: useWebSearch,
      })

      let webSnippet = ''
      if (useWebSearch) {
        try {
          webSnippet = (await searchWebService(`${activeNotebook.topic} ${userMsg.content}`)).slice(0, MAX_WEB_SEARCH_CHARS)
        } catch {
          webSnippet = ''
        }
      }

      const nextChatContextAudit = buildChatContextAudit({
        sources: activeNotebook.sources,
        messages: optimisticMessages.slice(0, -1),
        minSourceChars: MIN_SOURCE_CHARS,
        maxSourceCharsPerSource: MAX_CONTEXT_TEXT_LENGTH,
        maxConversationMessages: MAX_CONVERSATION_CONTEXT_MESSAGES,
        maxConversationChars: MAX_STUDIO_CONTEXT_CHARS,
        liveWebEnabled: useWebSearch,
        liveWebSnippet: webSnippet,
      })
      setLastChatContextAudit(nextChatContextAudit)

      const sourceContext = nextChatContextAudit.sourceText || baseChatContextAudit.sourceText
      const searchContext = nextChatContextAudit.searchHistoryText
        ? `\nHISTÓRICO DE PESQUISAS REALIZADAS NESTE CADERNO:\n${nextChatContextAudit.searchHistoryText}${nextChatContextAudit.searchSummary.truncated ? '…' : ''}\n(Use este contexto para sugerir refinamentos, complementos ou novas buscas ao usuário.)\n`
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

      const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...optimisticMessages
          .slice(0, -1)
          .slice(-(MAX_CONVERSATION_CONTEXT_MESSAGES - 1))
          .map((message) => ({
            role: message.role as 'user' | 'assistant',
            content: message.content,
          })),
        { role: 'user', content: userMsg.content },
      ]

      const result = await callLLMWithMessages(apiKey, llmMessages, model, 4000, 0.3)

      const assistantMsg: NotebookMessage = {
        id: generateId(),
        role: 'assistant',
        content: result.content,
        agent: 'notebook_assistente',
        model: result.model,
        created_at: new Date().toISOString(),
      }

      const execution = createUsageExecutionRecord({
        source_type: 'caderno_pesquisa',
        source_id: notebookId,
        phase: 'notebook_assistente',
        agent_name: AGENT_LABELS.notebook_assistente,
        model: result.model,
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
        cost_usd: result.cost_usd,
        duration_ms: result.duration_ms,
      })

      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const baseMessages = freshNotebook.messages.some((message) => message.id === userMsg.id)
        ? freshNotebook.messages
        : [...freshNotebook.messages, userMsg]
      const finalMessages = [...baseMessages, assistantMsg]
      const updatedExecutions = [...(freshNotebook.llm_executions || []), execution]

      await updateResearchNotebook(userId, notebookId, {
        messages: finalMessages,
        llm_executions: updatedExecutions,
      })
      patchNotebook(notebookId, {
        messages: finalMessages,
        llm_executions: updatedExecutions,
        updated_at: assistantMsg.created_at,
      })
    } catch (error) {
      patchNotebook(notebookId, {
        messages: previousMessages,
        llm_executions: previousExecutions,
        updated_at: previousUpdatedAt,
      })
      setChatInput(userMsg.content)
      if (error instanceof ModelUnavailableError) {
        toast.warning(
          `Modelo indisponível: ${error.modelId}`,
          `O modelo do agente "${AGENT_LABELS.notebook_assistente}" foi removido do OpenRouter. Vá em Configurações > Caderno de Pesquisa e substitua-o.`,
        )
      } else {
        const humanized = humanizeError(error)
        toast.error('Erro ao gerar resposta', humanized.detail)
      }
    } finally {
      setChatLoading(false)
    }
  }

  const handleAddLinkSource = async () => {
    if (!userId || !activeNotebook?.id || !sourceUrl.trim()) return
    const trimmedUrl = sourceUrl.trim()
    if (!isValidHttpsUrl(trimmedUrl)) {
      toast.error('URL inválida — informe um link HTTPS válido.')
      return
    }

    setSourceUrlLoading(true)
    try {
      const textContent = await fetchUrlContentService(trimmedUrl)
      const source: NotebookSource = {
        id: generateId(),
        type: 'link',
        name: trimmedUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
        reference: trimmedUrl,
        content_type: 'text/html',
        size_bytes: textContent.length,
        text_content: textContent.slice(0, MAX_SOURCE_TEXT_LENGTH),
        status: textContent.length > 100 ? 'indexed' : 'pending',
        added_at: new Date().toISOString(),
      }
      const notebook = await getFreshNotebookOrThrow(activeNotebook.id)
      const updatedSources = [...notebook.sources, source]
      await updateResearchNotebook(userId, activeNotebook.id, { sources: updatedSources })
      patchNotebook(activeNotebook.id, { sources: updatedSources, updated_at: new Date().toISOString() })
      setSelectedSourceId(source.id)
      setSourceUrl('')
      toast.success('Link adicionado como fonte')
    } catch {
      toast.error('Erro ao adicionar link como fonte')
    } finally {
      setSourceUrlLoading(false)
    }
  }

  const handleUploadSourceFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || !userId || !activeNotebook?.id) return

    setSourceUploadLoading(true)
    try {
      const nextSources: NotebookSource[] = []
      for (const file of Array.from(files)) {
        if (!isSupportedTextFile(file)) {
          toast.error(`Formato não suportado para fonte: ${file.name}`)
          continue
        }
        const textContent = await extractFileText(file)
        nextSources.push({
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
      if (nextSources.length === 0) return
      const notebook = await getFreshNotebookOrThrow(activeNotebook.id)
      const updatedSources = [...notebook.sources, ...nextSources]
      await updateResearchNotebook(userId, activeNotebook.id, { sources: updatedSources })
      patchNotebook(activeNotebook.id, { sources: updatedSources, updated_at: new Date().toISOString() })
      setSelectedSourceId(nextSources[0]?.id || null)
      toast.success(`${nextSources.length} arquivo(s) adicionado(s) como fonte`)
    } catch {
      toast.error('Erro ao adicionar arquivos como fontes')
    } finally {
      setSourceUploadLoading(false)
      if (sourceUploadRef.current) sourceUploadRef.current.value = ''
    }
  }

  const handleAddAcervoSource = async (acervoDoc: AcervoDocumentData) => {
    if (!userId || !activeNotebook?.id) return
    const alreadyExists = activeNotebook.sources.some((source) => source.type === 'acervo' && source.reference === acervoDoc.id)
    if (alreadyExists) {
      toast.info('Documento já adicionado como fonte')
      return
    }

    try {
      const source: NotebookSource = {
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
      const notebook = await getFreshNotebookOrThrow(activeNotebook.id)
      const updatedSources = [...notebook.sources, source]
      await updateResearchNotebook(userId, activeNotebook.id, { sources: updatedSources })
      patchNotebook(activeNotebook.id, { sources: updatedSources, updated_at: new Date().toISOString() })
      setSelectedSourceId(source.id)
      toast.success(`Fonte "${acervoDoc.filename}" adicionada`)
    } catch {
      toast.error('Erro ao adicionar fonte do acervo')
    }
  }

  const handleAnalyzeAcervo = async () => {
    if (!userId || !activeNotebook?.id || acervoAnalysisLoading) return

    const notebook = activeNotebook
    const notebookId = notebook.id
    if (!notebookId) return
    const abortController = new AbortController()
    acervoAbortRef.current = abortController

    setAcervoAnalysisLoading(true)
    setAcervoAnalysisPhase('')
    setAcervoAnalysisMessage('Iniciando análise...')
    setAcervoAnalysisPercent(0)
    setAcervoAnalysisMeta('')
    setAcervoAnalysisError('')
    setAcervoAnalysisResults([])
    setSelectedAnalysisIds(new Set())
    setShowAcervoProgressModal(true)

    try {
      const existingSourceNames = notebook.sources.map((source) => source.name)
      const existingSourceIds = new Set(
        notebook.sources
          .filter((source) => source.type === 'acervo' && source.reference)
          .map((source) => source.reference as string),
      )

      const result = await analyzeNotebookAcervo(
        userId,
        notebookId,
        notebook.topic || notebook.title,
        notebook.description || '',
        existingSourceNames,
        existingSourceIds,
        (progress: AcervoAnalysisProgress) => {
          setAcervoAnalysisPhase(progress.phase)
          setAcervoAnalysisMessage(progress.message)
          setAcervoAnalysisPercent(progress.percent)
          setAcervoAnalysisMeta(progress.stageMeta || '')
        },
        abortController.signal,
      )

      if (result.executions.length > 0) {
        const freshNotebook = await getFreshNotebookOrThrow(notebookId)
        const updatedExecutions = [...(freshNotebook.llm_executions || []), ...result.executions]
        await updateResearchNotebook(userId, notebookId, { llm_executions: updatedExecutions })
        patchNotebook(notebookId, {
          llm_executions: updatedExecutions,
          updated_at: new Date().toISOString(),
        })
      }

      if (result.documents.length > 0) {
        setAcervoAnalysisResults(result.documents)
        setSelectedAnalysisIds(new Set(result.documents.map((doc) => doc.id)))
        toast.success(`${result.documents.length} documento(s) relevante(s) encontrado(s) no acervo.`)
      } else {
        toast.info('Nenhum documento relevante foi encontrado no acervo para este caderno.')
      }
    } catch (error) {
      console.error('Acervo analysis error:', error)
      if (error instanceof DOMException && error.name === 'AbortError') {
        setAcervoAnalysisError('')
        setAcervoAnalysisMessage('Análise de acervo cancelada pelo usuário.')
        setAcervoAnalysisMeta('Cancelado manualmente')
        toast.info('Análise de acervo cancelada.')
        return
      }

      const humanized = humanizeError(error)
      setAcervoAnalysisError(humanized.detail || humanized.title)
      setAcervoAnalysisMeta('Execução interrompida')
      if (error instanceof ModelUnavailableError) {
        toast.warning(
          'Modelo indisponível',
          `O modelo "${error.modelId}" não está disponível. Atualize os agentes do notebook acervo nas configurações.`,
        )
      } else {
        toast.error('Erro ao analisar acervo', humanized.detail)
      }
    } finally {
      setAcervoAnalysisLoading(false)
      acervoAbortRef.current = null
    }
  }

  const handleAddAnalysisResults = async () => {
    if (!userId || !activeNotebook?.id || selectedAnalysisIds.size === 0) return

    const notebookId = activeNotebook.id

    try {
      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const existingSourceIds = new Set(
        freshNotebook.sources
          .filter((source) => source.type === 'acervo' && source.reference)
          .map((source) => source.reference as string),
      )

      const docsToAdd = acervoAnalysisResults.filter((doc) => selectedAnalysisIds.has(doc.id) && !existingSourceIds.has(doc.id))
      if (docsToAdd.length === 0) {
        toast.info('As fontes selecionadas já foram adicionadas ao caderno.')
        return
      }

      const newSources: NotebookSource[] = docsToAdd.map((doc) => ({
        id: generateId(),
        type: 'acervo',
        name: doc.filename,
        reference: doc.id,
        content_type: doc.content_type || '',
        size_bytes: doc.size_bytes ?? 0,
        text_content: doc.text_content.slice(0, MAX_SOURCE_TEXT_LENGTH),
        status: 'indexed',
        added_at: new Date().toISOString(),
      }))

      const updatedSources = [...freshNotebook.sources, ...newSources]
      await updateResearchNotebook(userId, notebookId, { sources: updatedSources })
      patchNotebook(notebookId, {
        sources: updatedSources,
        updated_at: newSources[newSources.length - 1]?.added_at || new Date().toISOString(),
      })

      const addedIds = new Set(docsToAdd.map((doc) => doc.id))
      const remainingDocs = acervoAnalysisResults.filter((doc) => !addedIds.has(doc.id))
      setAcervoAnalysisResults(remainingDocs)
      setSelectedAnalysisIds(new Set(remainingDocs.map((doc) => doc.id)))
      setSelectedSourceId(newSources[0]?.id || null)
      toast.success(`${docsToAdd.length} fonte(s) adicionada(s) ao caderno.`)
    } catch (error) {
      console.error('Error adding analyzed acervo sources:', error)
      toast.error('Erro ao adicionar fontes recomendadas do acervo.')
    }
  }

  const handleRemoveSource = async (sourceId: string) => {
    if (!userId || !activeNotebook?.id) return
    const source = activeNotebook.sources.find((item) => item.id === sourceId)
    const confirmed = window.confirm(`Remover a fonte "${source?.name || 'selecionada'}" deste caderno?`)
    if (!confirmed) return

    try {
      const notebook = await getFreshNotebookOrThrow(activeNotebook.id)
      const updatedSources = notebook.sources.filter((item) => item.id !== sourceId)
      await updateResearchNotebook(userId, activeNotebook.id, { sources: updatedSources })
      patchNotebook(activeNotebook.id, { sources: updatedSources, updated_at: new Date().toISOString() })
      setSelectedSourceId(updatedSources[0]?.id || null)
      toast.success('Fonte removida')
    } catch {
      toast.error('Erro ao remover fonte')
    }
  }

  const updateModalStep = (stepId: string, update: Partial<ResearchStep>) => {
    setResearchModalSteps((current) => current.map((step) => step.id === stepId ? { ...step, ...update } : step))
  }

  const addModalSubstep = (stepId: string, substep: string) => {
    setResearchModalSteps((current) => current.map((step) => {
      if (step.id !== stepId) return step
      return {
        ...step,
        substeps: step.substeps[step.substeps.length - 1] === substep ? step.substeps : [...step.substeps, substep],
      }
    }))
  }

  const failAllActiveSteps = (errorDetail: string) => {
    setResearchModalSteps((current) => current.map((step) => (
      step.status === 'active' || step.status === 'pending'
        ? { ...step, status: 'error' as const, detail: step.status === 'active' ? errorDetail : undefined }
        : step
    )))
  }

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
    const grouped = new Map<string, { errors: number; successes: number }>()

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
    execution: ReturnType<typeof createUsageExecutionRecord> | Array<ReturnType<typeof createUsageExecutionRecord>>,
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

    patchNotebook(notebookId, {
      sources: updatedSources,
      llm_executions: updatedExecutions,
      research_audits: updatedResearchAudits,
      updated_at: source.added_at,
    })
    setSelectedSourceId(source.id)
  }

  const saveResearchAuditPreset = async (audit: NotebookResearchAuditEntry) => {
    if (!userId || !activeNotebook?.id) return

    try {
      const notebookId = activeNotebook.id
      const freshNotebook = await getFreshNotebookOrThrow(notebookId)
      const now = new Date().toISOString()
      const existing = freshNotebook.saved_searches || []
      const duplicate = existing.find((item) => (
        item.variant === audit.variant
          && item.query.trim() === audit.query.trim()
          && (item.legalArea || '') === (audit.legalArea || '')
          && (item.dateFrom || '') === (audit.dateFrom || '')
          && (item.dateTo || '') === (audit.dateTo || '')
          && (item.maxPerTribunal || 0) === (audit.maxPerTribunal || 0)
      ))

      const entry: NotebookSavedSearchEntry = duplicate
        ? {
            ...duplicate,
            ...audit,
            title: duplicate.title,
            tags: duplicate.tags && duplicate.tags.length > 0 ? duplicate.tags : buildNotebookSavedSearchTags(audit),
            created_at: duplicate.created_at,
            updated_at: now,
          }
        : {
            id: generateId(),
            title: buildNotebookSavedSearchTitle(audit),
            tags: buildNotebookSavedSearchTags(audit),
            ...audit,
            created_at: now,
            updated_at: now,
          }

      const updatedSavedSearches = [
        entry,
        ...existing.filter((item) => item.id !== entry.id),
      ].slice(0, MAX_PERSISTED_SAVED_SEARCHES)

      await updateResearchNotebook(userId, notebookId, { saved_searches: updatedSavedSearches })
      patchNotebook(notebookId, { saved_searches: updatedSavedSearches, updated_at: now })
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
    const updatedAt = new Date().toISOString()

    await updateResearchNotebook(userId, notebookId, { saved_searches: updatedSavedSearches })
    patchNotebook(notebookId, { saved_searches: updatedSavedSearches, updated_at: updatedAt })
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

  const confirmSaveSavedSearchEdits = async () => {
    if (!editingSavedSearchId) return

    const trimmedTitle = editingSavedSearchTitle.trim()
    if (!trimmedTitle) {
      toast.info('Informe um título para a busca salva.')
      return
    }

    try {
      const updated = await persistSavedSearches((current) => current.map((search) => (
        search.id === editingSavedSearchId
          ? {
              ...search,
              title: trimmedTitle,
              tags: normalizeNotebookSavedSearchTags(editingSavedSearchTags),
              updated_at: new Date().toISOString(),
            }
          : search
      )))

      if (updated) {
        toast.success('Busca salva atualizada')
        cancelEditingSavedSearch()
      }
    } catch (error) {
      console.error('Failed to update saved search:', error)
      toast.error('Erro ao atualizar busca salva')
    }
  }

  const togglePinSavedSearch = async (searchId: string) => {
    try {
      let pinned = false
      const updated = await persistSavedSearches((current) => current.map((search) => {
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

  const deleteSavedSearch = async (search: NotebookSavedSearchEntry) => {
    if (!window.confirm(`Remover a busca salva "${search.title}" deste caderno?`)) return

    try {
      const updated = await persistSavedSearches((current) => current.filter((item) => item.id !== search.id))
      if (updated) {
        setSelectedSavedSearchIds((current) => {
          const next = new Set(current)
          next.delete(search.id)
          return next
        })
        if (editingSavedSearchId === search.id) cancelEditingSavedSearch()
        toast.success('Busca salva removida')
      }
    } catch (error) {
      console.error('Failed to delete saved search:', error)
      toast.error('Erro ao excluir busca salva')
    }
  }

  const toggleSavedSearchSelection = (searchId: string) => {
    setSelectedSavedSearchIds((current) => {
      const next = new Set(current)
      if (next.has(searchId)) next.delete(searchId)
      else next.add(searchId)
      return next
    })
  }

  const toggleSelectAllVisibleSavedSearches = () => {
    setSelectedSavedSearchIds((current) => {
      const next = new Set(current)
      if (allVisibleSavedSearchesSelected) {
        visibleSavedSearchIds.forEach((id) => next.delete(id))
      } else {
        visibleSavedSearchIds.forEach((id) => next.add(id))
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
      const updated = await persistSavedSearches((current) => current.map((search) => (
        selectedIds.has(search.id)
          ? { ...search, pinned, updated_at: new Date().toISOString() }
          : search
      )))

      if (updated) {
        toast.success(pinned ? 'Buscas selecionadas fixadas' : 'Buscas selecionadas desafixadas')
      }
    } catch (error) {
      console.error('Failed to bulk pin saved searches:', error)
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
      const updated = await persistSavedSearches((current) => current.map((search) => {
        if (!selectedIds.has(search.id)) return search

        const tags = new Set((search.tags || []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))
        if (mode === 'add') tags.add(normalizedTag)
        else tags.delete(normalizedTag)

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

  const deleteSelectedSavedSearches = async () => {
    if (selectedSavedSearchIds.size === 0) return
    if (!window.confirm(`Excluir as ${selectedSavedSearchIds.size} buscas selecionadas deste caderno?`)) return

    const selectedIds = new Set(selectedSavedSearchIds)
    try {
      const updated = await persistSavedSearches((current) => current.filter((item) => !selectedIds.has(item.id)))
      if (updated) {
        setSelectedSavedSearchIds(new Set())
        if (editingSavedSearchId && selectedIds.has(editingSavedSearchId)) cancelEditingSavedSearch()
        toast.success('Buscas selecionadas removidas')
      }
    } catch (error) {
      console.error('Failed to bulk delete saved searches:', error)
      toast.error('Erro ao excluir buscas selecionadas')
    }
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

    const tribunals = ALL_TRIBUNALS.filter((tribunal) => audit.tribunalAliases?.includes(tribunal.alias))
    setLastJurisprudenceTribunalAliases(audit.tribunalAliases && audit.tribunalAliases.length > 0 ? audit.tribunalAliases : lastJurisprudenceTribunalAliases)
    setExternalSearchQuery(audit.query)
    setJurisprudenceConfigPreset({
      query: audit.query,
      tribunals,
      dateFrom: audit.dateFrom || '',
      dateTo: audit.dateTo || '',
      graus: audit.graus || [],
      maxPerTribunal: audit.maxPerTribunal || 5,
      legalArea: audit.legalArea || '',
    })
    setJurisprudenceConfigOpen(true)
  }

  const handleAddExternalSearchSource = async (queryOverride?: string) => {
    const effectiveQuery = queryOverride ?? externalSearchQuery
    if (!userId || !activeNotebook?.id || !effectiveQuery.trim()) return
    const query = effectiveQuery.trim()
    const notebookId = activeNotebook.id

    setResearchModalTitle('Pesquisa Externa')
    setResearchModalSubtitle(query)
    setResearchModalVariant('external')
    setResearchModalSteps(createExternalSearchSteps())
    setResearchModalStats({ sourcesFound: 0, urlsExamined: 0, tribunalsQueried: 0, tokensUsed: 0, elapsedMs: 0 })
    setResearchModalCanClose(false)
    setResearchModalOpen(true)
    const abortController = new AbortController()
    researchAbortRef.current = abortController

    setExternalResearchLoading(true)
    const t0 = performance.now()
    try {
      updateModalStep('search', { status: 'active' })
      addModalSubstep('search', 'Pesquisando DuckDuckGo via Jina Reader...')
      const { results, diagnostics } = await searchWebResultsWithDiagnostics(query, abortController.signal)
      setResearchModalStats((current) => ({ ...current, sourcesFound: results.length, elapsedMs: Math.round(performance.now() - t0) }))

      diagnostics.strategies
        .filter((strategy) => strategy.errorType !== 'none' && strategy.errorType !== 'empty' && strategy.errorType !== 'aborted')
        .forEach((strategy) => {
          addModalSubstep('search', `${strategy.strategy}: ${strategy.message || strategy.errorType}`)
        })

      addModalSubstep('search', `${results.length} resultado(s) encontrado(s)`)
      updateModalStep('search', { status: results.length > 0 ? 'done' : 'error', detail: results.length > 0 ? `${results.length} resultados` : 'Nenhum resultado' })

      if (results.length === 0) {
        setResearchModalCanClose(true)
        if (diagnostics.hadTechnicalError) {
          const mainFailure = diagnostics.strategies.find((strategy) => strategy.errorType !== 'none' && strategy.errorType !== 'empty' && strategy.errorType !== 'aborted')
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

      setResearchModalOpen(false)
      setResearchModalCanClose(true)

      const reviewItems: SearchResultItem[] = results.map((result, index) => ({
        id: `ext-${index}`,
        title: result.title,
        subtitle: result.url,
        snippet: result.snippet,
        url: result.url,
        metadata: {},
        selected: true,
        _raw: result,
      }))

      setSearchResultsItems(reviewItems)
      setSearchResultsVariant('external')
      setSearchResultsCallback(() => async (selected: SearchResultItem[]) => {
        setSearchResultsModalOpen(false)

        if (selected.length === 0) {
          toast.info('Nenhum resultado selecionado.')
          return
        }

        const synthSteps = createExternalSearchSteps()
        synthSteps[0].status = 'done'
        synthSteps[0].detail = `${results.length} resultados`
        setResearchModalTitle('Pesquisa Externa')
        setResearchModalSubtitle(query)
        setResearchModalVariant('external')
        setResearchModalSteps(synthSteps)
        setResearchModalStats((current) => ({ ...current, sourcesFound: selected.length }))
        setResearchModalCanClose(false)
        setResearchModalOpen(true)

        try {
          updateModalStep('analyze', { status: 'active' })
          addModalSubstep('analyze', `Preparando ${selected.length} resultado(s) para síntese...`)

          const textContent = selected.map((item, index) =>
            `[${index + 1}] ${item.title}\nURL: ${item.url || ''}\nResumo: ${item.snippet}`,
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
            toast.warning('Modelo obrigatório não configurado', 'Configure no Admin o agente "Pesquisador Externo".')
            return
          }
          addModalSubstep('analyze', `Usando modelo: ${model}`)
          updateModalStep('analyze', { status: 'done' })

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

          setResearchModalStats((current) => ({
            ...current,
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
          toast.success(`Pesquisa externa adicionada com ${selected.length} resultado(s).`)
          autoCloseModal()
        } catch (error) {
          console.error('External search synthesis error:', error)
          failAllActiveSteps(error instanceof Error ? error.message : 'Erro inesperado')
          toast.error('Erro ao sintetizar pesquisa externa')
        } finally {
          setResearchModalCanClose(true)
        }
      })
      setSearchResultsModalOpen(true)
    } catch (error) {
      if (abortController.signal.aborted) return
      console.error('External search source error:', error)
      failAllActiveSteps(error instanceof Error ? error.message : 'Erro inesperado')
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

    setResearchModalTitle('Pesquisa Profunda')
    setResearchModalSubtitle(query)
    setResearchModalVariant('deep')
    setResearchModalSteps(createDeepSearchSteps())
    setResearchModalStats({ sourcesFound: 0, urlsExamined: 0, tribunalsQueried: 0, tokensUsed: 0, elapsedMs: 0 })
    setResearchModalCanClose(false)
    setResearchModalOpen(true)
    const abortController = new AbortController()
    researchAbortRef.current = abortController

    setExternalDeepLoading(true)
    const t0 = performance.now()
    try {
      updateModalStep('search', { status: 'active' })
      addModalSubstep('search', 'Pesquisando na web com múltiplas estratégias...')

      const deepResult = await deepWebSearch(query, (progress) => {
        if (progress.phase === 'searching') {
          addModalSubstep('search', 'Consultando DuckDuckGo...')
        } else if (progress.phase === 'fetching') {
          setResearchModalStats((current) => ({
            ...current,
            sourcesFound: progress.resultsFound,
            urlsExamined: progress.urlsFetched,
            elapsedMs: Math.round(performance.now() - t0),
          }))
          if (progress.currentUrl) {
            try {
              addModalSubstep('fetch', `Extraindo: ${new URL(progress.currentUrl).hostname}...`)
            } catch {
              addModalSubstep('fetch', 'Extraindo conteúdo...')
            }
          }
        }
      }, abortController.signal)

      updateModalStep('search', { status: deepResult.results.length > 0 ? 'done' : 'error', detail: `${deepResult.results.length} resultado(s)` })

      deepResult.diagnostics?.strategies
        .filter((strategy) => strategy.errorType !== 'none' && strategy.errorType !== 'empty' && strategy.errorType !== 'aborted')
        .forEach((strategy) => {
          addModalSubstep('search', `${strategy.strategy}: ${strategy.message || strategy.errorType}`)
        })

      const hasSnippetFallback = deepResult.results.length > 0 && deepResult.contents.length === 0
      updateModalStep('fetch', {
        status: deepResult.contents.length > 0 || hasSnippetFallback ? 'done' : 'error',
        detail: hasSnippetFallback ? 'Sem conteúdo completo; usando snippets da busca' : undefined,
      })
      addModalSubstep('fetch', `${deepResult.contents.length} página(s) com conteúdo extraído`)
      if (deepResult.fetchFailures > 0) {
        addModalSubstep('fetch', `${deepResult.fetchFailures} URL(s) falharam na extração`)
      }

      if (deepResult.warnings?.length) {
        for (const warning of deepResult.warnings) {
          if (warning.kind === 'jina_fallback_used') {
            addModalSubstep('search', 'Resultados obtidos via Jina Search API (fallback)')
            toast.info('Pesquisa profunda usou provedor alternativo', 'DuckDuckGo não retornou resultados; Jina Search API foi usada como fallback.')
          } else if (warning.kind === 'fallback_to_snippets') {
            addModalSubstep('fetch', 'Usando apenas snippets da busca (conteúdo completo indisponível)')
            toast.warning('Pesquisa profunda degradada', 'Não foi possível extrair o conteúdo completo das páginas. Os snippets da busca serão usados.')
          } else if (warning.kind === 'all_providers_failed') {
            addModalSubstep('search', `Todos os provedores falharam: ${warning.attempted.join(', ')}`)
          }
        }
      }

      if (deepResult.contents.length === 0 && deepResult.results.length === 0) {
        setResearchModalCanClose(true)
        if (deepResult.diagnostics?.hadTechnicalError) {
          const mainFailure = deepResult.diagnostics.strategies.find((strategy) => strategy.errorType !== 'none' && strategy.errorType !== 'empty' && strategy.errorType !== 'aborted')
          const hint = webErrorHint(mainFailure?.errorType || 'http')
          updateModalStep('search', { status: 'error', detail: hint })
          toast.warning('Falha técnica na pesquisa profunda', hint)
        } else {
          toast.info('Nenhum resultado útil para pesquisa externa profunda. Tente ampliar os termos da consulta.')
        }
        return
      }

      if (abortController.signal.aborted) return

      setResearchModalOpen(false)
      setResearchModalCanClose(true)

      const reviewItems: SearchResultItem[] = deepResult.contents.length > 0
        ? deepResult.contents.map((content, index) => ({
            id: `deep-${index}`,
            title: content.title,
            subtitle: content.url,
            snippet: content.content.slice(0, 300) + (content.content.length > 300 ? '...' : ''),
            fullContent: content.content.slice(0, 5000),
            url: content.url,
            metadata: { Chars: `${(content.content.length / 1000).toFixed(0)}K` },
            selected: true,
            _raw: content,
          }))
        : deepResult.results.map((result, index) => ({
            id: `deep-${index}`,
            title: result.title,
            subtitle: result.url,
            snippet: result.snippet,
            url: result.url,
            metadata: {},
            selected: true,
            _raw: result,
          }))

      setSearchResultsItems(reviewItems)
      setSearchResultsVariant('deep')
      setSearchResultsCallback(() => async (selected: SearchResultItem[]) => {
        setSearchResultsModalOpen(false)

        if (selected.length === 0) {
          toast.info('Nenhum resultado selecionado.')
          return
        }

        const synthSteps = createDeepSearchSteps()
        synthSteps[0].status = 'done'
        synthSteps[0].detail = `${deepResult.results.length} resultados`
        synthSteps[1].status = 'done'
        synthSteps[1].detail = `${selected.length} selecionados`
        setResearchModalTitle('Pesquisa Profunda')
        setResearchModalSubtitle(query)
        setResearchModalVariant('deep')
        setResearchModalSteps(synthSteps)
        setResearchModalStats((current) => ({ ...current, sourcesFound: selected.length }))
        setResearchModalCanClose(false)
        setResearchModalOpen(true)

        try {
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

          updateModalStep('synthesize', { status: 'active' })
          addModalSubstep('synthesize', 'Sintetizando conhecimento profundo...')
          const apiKey = await getOpenRouterKey()

          const hasFullContent = selected.some((item) => item.fullContent && item.fullContent.length > 100)
          const compiled = hasFullContent
            ? selected.map((item, index) =>
                `<fonte_${index + 1}>\nTÍTULO: ${item.title}\nURL: ${item.url || ''}\n${(item.fullContent || item.snippet).slice(0, MAX_DEEP_EXTERNAL_SOURCE_SNIPPET_CHARS)}\n</fonte_${index + 1}>`,
              ).join('\n\n')
            : selected.map((item, index) => `[${index + 1}] ${item.title}\nURL: ${item.url || ''}\nResumo: ${item.snippet}`).join('\n\n')

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

          setResearchModalStats((current) => ({
            ...current,
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
          toast.success('Pesquisa externa profunda adicionada como fonte.')
          autoCloseModal()
        } catch (error) {
          console.error('Deep search synthesis error:', error)
          failAllActiveSteps(error instanceof Error ? error.message : 'Erro inesperado')
          toast.error('Erro na pesquisa externa profunda')
        } finally {
          setResearchModalCanClose(true)
        }
      })
      setSearchResultsModalOpen(true)
    } catch (error) {
      if (abortController.signal.aborted) return
      console.error('Deep external search source error:', error)
      failAllActiveSteps(error instanceof Error ? error.message : 'Erro inesperado')
      toast.error('Erro na pesquisa externa profunda')
    } finally {
      setExternalDeepLoading(false)
      setResearchModalCanClose(true)
      researchAbortRef.current = null
    }
  }

  const handleAddJurisprudenceSource = (queryOverride?: string, presetOverride?: Partial<JurisprudenceSearchConfig> | null) => {
    if (!userId || !activeNotebook?.id) return
    const effectiveQuery = (queryOverride ?? externalSearchQuery).trim()
    if (!effectiveQuery) return

    setExternalSearchQuery(effectiveQuery)
    setJurisprudenceConfigPreset(presetOverride ?? null)
    setJurisprudenceConfigOpen(true)
  }

  const handleJurisprudenceSearch = async (config: JurisprudenceSearchConfig) => {
    if (!userId || !activeNotebook?.id) return
    const notebookId = activeNotebook.id
    setJurisprudenceConfigOpen(false)

    const selectedTribunalAliases = config.tribunals.map((tribunal) => tribunal.alias)
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

    setResearchModalTitle('Pesquisa de Jurisprudência')
    setResearchModalSubtitle(config.query)
    setResearchModalVariant('jurisprudencia')
    setResearchModalSteps(createJurisprudenceSteps())
    setResearchModalStats({ sourcesFound: 0, urlsExamined: 0, tribunalsQueried: 0, tokensUsed: 0, elapsedMs: 0 })
    setResearchModalCanClose(false)
    setResearchModalOpen(true)
    const abortController = new AbortController()
    researchAbortRef.current = abortController

    setJurisprudenceLoading(true)
    const t0 = performance.now()
    try {
      updateModalStep('query', { status: 'active' })
      addModalSubstep('query', `Consultando JusBrasil + ${config.tribunals.length} tribunais DataJud em paralelo...`)

      const dataJudResult = await searchDataJud(config.query, {
        tribunals: config.tribunals,
        maxPerTribunal: config.maxPerTribunal,
        dateFrom: config.dateFrom || undefined,
        dateTo: config.dateTo || undefined,
        graus: config.graus.length > 0 ? config.graus : undefined,
        legalArea: config.legalArea || undefined,
        enrichMissingText: true,
        maxTextEnrichment: 10,
        onProgress: (progress) => {
          setResearchModalStats((current) => ({
            ...current,
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

      updateModalStep('query', { status: dataJudResult.results.length > 0 ? 'done' : 'error', detail: `${dataJudResult.results.length} resultado(s) de ${dataJudResult.tribunalsWithResults} tribunal(is)` })

      summarizeEndpointAttempts(dataJudResult.runtimeDiagnostics.endpointAttempts)
        .slice(0, 3)
        .forEach((summary) => addModalSubstep('query', summary))

      if (dataJudResult.errors.length > 0) {
        addModalSubstep('query', `${dataJudResult.errors.length} tribunal(is) com erro (ignorados)`)
        const groupedErrors = dataJudResult.errorDetails.reduce<Record<string, number>>((accumulator, item) => {
          const key = dataJudErrorLabel(item.type)
          accumulator[key] = (accumulator[key] || 0) + 1
          return accumulator
        }, {})
        Object.entries(groupedErrors).forEach(([kind, count]) => {
          addModalSubstep('query', `${count} tribunal(is) com ${kind}`)
        })
        dataJudResult.errorDetails
          .filter((item) => item.lastEndpointLabel)
          .slice(0, 3)
          .forEach((item) => addModalSubstep('query', `${item.tribunalAlias}: última tentativa em ${item.lastEndpointLabel}`))
      }

      updateModalStep('filter', { status: 'active' })
      if (dataJudResult.results.length === 0) {
        const hasTechnicalFailure = dataJudResult.errorDetails.some((item) => item.type !== 'aborted')
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

      addModalSubstep('filter', `${dataJudResult.results.length} resultado(s) encontrado(s)`)
      addModalSubstep('filter', `${dataJudResult.textStats.withBoth} com ementa + inteiro teor; ${dataJudResult.textStats.missingBoth} sem texto decisório`)
      if (dataJudResult.textStats.enrichedFromWeb > 0) {
        addModalSubstep('filter', `${dataJudResult.textStats.enrichedFromWeb} resultado(s) complementados por fonte pública`)
      }
      updateModalStep('filter', { status: 'done', detail: `${dataJudResult.results.length} resultados` })

      setResearchModalOpen(false)
      setResearchModalCanClose(true)

      const reviewItems: SearchResultItem[] = dataJudResult.results.map((result, index) => ({
        id: `dj-${index}`,
        title: `${result.classe} — ${result.numeroProcesso}`,
        subtitle: `${result.tribunalName} · ${result.orgaoJulgador}`,
        snippet: result.ementa
          ? result.ementa.slice(0, 260) + (result.ementa.length > 260 ? '…' : '')
          : result.inteiroTeor
            ? result.inteiroTeor.slice(0, 260) + (result.inteiroTeor.length > 260 ? '…' : '')
            : (result.assuntos.join(', ') || 'Sem assuntos'),
        fullContent: [
          `Processo: ${result.numeroProcesso}`,
          `Classe: ${result.classe} (${result.classeCode})`,
          `Tribunal: ${result.tribunalName}`,
          result.orgaoJulgador ? `Órgão Julgador: ${result.orgaoJulgador}` : '',
          result.dataAjuizamento ? `Data de Ajuizamento: ${result.dataAjuizamento}` : '',
          result.grau ? `Grau: ${result.grau}` : '',
          result.formato ? `Formato: ${result.formato}` : '',
          result.assuntos.length > 0 ? `Assuntos: ${result.assuntos.join('; ')}` : '',
          result.relevanceScore != null ? `Relevância local: ${result.relevanceScore}/100` : '',
          result.textCompleteness ? `Completude do texto: ${result.textCompleteness}` : '',
          result.textSource ? `Texto obtido via: ${result.textSource}${result.textSourceUrl ? ` (${result.textSourceUrl})` : ''}` : '',
          result.ementa ? `Ementa:\n${result.ementa}${buildCitationSuffix(result)}` : '',
          result.inteiroTeor ? `Inteiro Teor:\n${result.inteiroTeor.slice(0, 6000)}${result.inteiroTeor.length > 6000 ? '\n[... texto truncado ...]' : ''}` : '',
          result.movimentos.length > 0 ? `Movimentos:\n${result.movimentos.slice(0, 5).map((movement) => `  - ${movement.nome} (${movement.dataHora})`).join('\n')}` : '',
        ].filter(Boolean).join('\n'),
        metadata: {
          ...(result.grau ? { Grau: result.grau } : {}),
          ...(result.dataAjuizamento ? { Data: result.dataAjuizamento.split('T')[0] } : {}),
          ...(result.ementa ? { Ementa: '✓' } : {}),
          ...(result.inteiroTeor ? { 'Inteiro Teor': '✓' } : {}),
          ...(!result.ementa && !result.inteiroTeor ? { Texto: 'ausente' } : {}),
          ...(result.textSource ? { Origem: result.textSource === 'web' ? 'fonte pública' : 'DataJud' } : {}),
          ...(result.relevanceScore != null ? { Relevância: `${result.relevanceScore}/100` } : {}),
        },
        selected: true,
        _raw: result,
      }))

      setSearchResultsItems(reviewItems)
      setSearchResultsVariant('jurisprudencia')
      setSearchResultsCallback(() => async (selected: SearchResultItem[]) => {
        setSearchResultsModalOpen(false)

        if (selected.length === 0) {
          toast.info('Nenhum resultado selecionado.')
          return
        }

        const synthSteps = createJurisprudenceSteps()
        synthSteps[0].status = 'done'
        synthSteps[0].detail = `${dataJudResult.results.length} resultados`
        synthSteps[1].status = 'done'
        synthSteps[1].detail = `${selected.length} selecionados`
        setResearchModalTitle('Pesquisa de Jurisprudência')
        setResearchModalSubtitle(config.query)
        setResearchModalVariant('jurisprudencia')
        setResearchModalSteps(synthSteps)
        setResearchModalStats((current) => ({ ...current, sourcesFound: selected.length }))
        setResearchModalCanClose(false)
        setResearchModalOpen(true)

        try {
          const models = await loadResearchNotebookModels()
          const openRouterApiKey = await getOpenRouterKey()
          const llmExecutions: Array<ReturnType<typeof createUsageExecutionRecord>> = []

          updateModalStep('rank', { status: 'active' })
          const rankModel = models.notebook_ranqueador_jurisprudencia
          let selectedResults = selected.map((item) => item._raw as DataJudResult)

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

            try {
              const cleaned = rankResult.content.replace(/```(?:json)?\s*/g, '').trim()
              const parsed = JSON.parse(cleaned) as { ranking: Array<{ index: number; score: number; stance?: string }> }
              if (Array.isArray(parsed.ranking)) {
                const sorted = parsed.ranking
                  .filter((item) => item.index >= 1 && item.index <= selectedResults.length)
                  .sort((left, right) => right.score - left.score)

                const reordered: DataJudResult[] = []
                const seenIndices = new Set<number>()
                let topScore: number | null = null

                for (const item of sorted) {
                  const resultIndex = item.index - 1
                  if (seenIndices.has(resultIndex)) continue
                  const process = selectedResults[resultIndex]
                  if (!process) continue
                  seenIndices.add(resultIndex)
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

            setResearchModalStats((current) => ({
              ...current,
              tokensUsed: (current.tokensUsed || 0) + rankResult.tokens_in + rankResult.tokens_out,
              elapsedMs: Math.round(performance.now() - t0),
            }))
            updateModalStep('rank', { status: 'done', detail: `${selectedResults.length} processos ranqueados` })
          } else {
            addModalSubstep('rank', 'Modelo não configurado — mantendo ordem original')
            updateModalStep('rank', { status: 'done', detail: 'Etapa ignorada (sem modelo)' })
          }

          updateModalStep('analyze', { status: 'active' })
          const synthesisModel = models.notebook_pesquisador_jurisprudencia
          if (!synthesisModel) {
            updateModalStep('analyze', { status: 'error', detail: 'Modelo não configurado' })
            setResearchModalCanClose(true)
            toast.warning('Modelo obrigatório não configurado', 'Configure no Admin o agente "Pesquisador de Jurisprudência (DataJud)".')
            return
          }
          addModalSubstep('analyze', `Modelo: ${synthesisModel}`)
          updateModalStep('analyze', { status: 'done' })

          updateModalStep('synthesize', { status: 'active' })
          addModalSubstep('synthesize', 'Gerando síntese jurisprudencial...')
          const textContent = formatDataJudResults(selectedResults)

          const researchAudit = buildResearchContextAudit({
            variant: 'jurisprudencia',
            mode: 'executed',
            query: config.query,
            tribunalCount: config.tribunals.length,
            tribunalAliases: config.tribunals.map((tribunal) => tribunal.alias),
            resultCount: dataJudResult.results.length,
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

          setResearchModalStats((current) => ({
            ...current,
            tokensUsed: (current.tokensUsed || 0) + jurisprudenceResult.tokens_in + jurisprudenceResult.tokens_out,
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
            results_raw: JSON.stringify(
              selectedResults.slice(0, 15).map((result) => ({
                ...result,
                inteiroTeorTruncated: Boolean(result.inteiroTeor && result.inteiroTeor.length > 12_000),
                inteiroTeor: result.inteiroTeor?.slice(0, 12_000),
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
          toast.success(`Jurisprudência adicionada com ${selected.length} resultado(s) selecionado(s).`)
          autoCloseModal()
        } catch (error) {
          console.error('Jurisprudence synthesis error:', error)
          failAllActiveSteps(error instanceof Error ? error.message : 'Erro inesperado')
          toast.error('Erro ao sintetizar jurisprudência')
        } finally {
          setResearchModalCanClose(true)
        }
      })
      setSearchResultsModalOpen(true)
    } catch (error) {
      if (abortController.signal.aborted) return
      console.error('Jurisprudence source error:', error)
      failAllActiveSteps(error instanceof Error ? error.message : 'Erro inesperado')
      toast.error('Erro ao consultar jurisprudência no DataJud')
    } finally {
      setJurisprudenceLoading(false)
      setResearchModalCanClose(true)
      researchAbortRef.current = null
    }
  }

  const renderSavedSearchCard = (search: NotebookSavedSearchEntry) => {
    const isEditing = editingSavedSearchId === search.id
    const isSelected = selectedSavedSearchIds.has(search.id)

    return (
      <div
        key={search.id}
        className={`rounded-[1.2rem] border px-4 py-4 ${search.pinned ? 'border-[rgba(217,119,6,0.24)] bg-[rgba(245,158,11,0.08)]' : 'border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.84)]'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="space-y-2">
                <input
                  value={editingSavedSearchTitle}
                  onChange={(event) => setEditingSavedSearchTitle(event.target.value)}
                  placeholder="Título da busca salva"
                  className="v2-field"
                  maxLength={120}
                />
                <input
                  value={editingSavedSearchTags}
                  onChange={(event) => setEditingSavedSearchTags(event.target.value)}
                  placeholder="Tags separadas por vírgula"
                  className="v2-field"
                  maxLength={160}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void confirmSaveSavedSearchEdits()} className="v2-btn-primary">
                    <Save className="h-4 w-4" />
                    Salvar
                  </button>
                  <button type="button" onClick={cancelEditingSavedSearch} className="v2-btn-secondary">
                    <X className="h-4 w-4" />
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{search.title}</p>
                  {search.pinned && (
                    <span className="rounded-full bg-[rgba(217,119,6,0.16)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--v2-accent-warm)]">
                      Fixada
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">
                  {search.sourceKindLabel || 'Busca'} · atualizada em {formatDate(search.updated_at)}
                </p>
                {search.tags && search.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {search.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setSavedSearchFilter(tag)}
                        className="rounded-full border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.94)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--v2-ink-soft)] transition-colors hover:border-[rgba(15,118,110,0.28)] hover:text-[var(--v2-accent-strong)]"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="inline-flex items-center gap-2 rounded-full border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.94)] px-3 py-1.5 text-[11px] font-medium text-[var(--v2-ink-soft)]">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSavedSearchSelection(search.id)}
                className="rounded border-[var(--v2-line-strong)] text-[var(--v2-accent-strong)]"
              />
              Selecionar
            </label>
            {!isEditing && (
              <button type="button" onClick={() => void togglePinSavedSearch(search.id)} className="v2-btn-secondary">
                <BookMarked className="h-4 w-4" />
                {search.pinned ? 'Desafixar' : 'Fixar'}
              </button>
            )}
            {!isEditing && (
              <button type="button" onClick={() => startEditingSavedSearch(search)} className="v2-btn-secondary">
                <Edit3 className="h-4 w-4" />
                Editar
              </button>
            )}
            {!isEditing && (
              <button type="button" onClick={() => handleReplayResearchAudit(search)} disabled={isAnyResearchLoading} className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                <RotateCcw className="h-4 w-4" />
                {search.variant === 'jurisprudencia' ? 'Abrir' : 'Usar'}
              </button>
            )}
            {!isEditing && (
              <button type="button" onClick={() => void deleteSavedSearch(search)} className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </button>
            )}
          </div>
        </div>

        {!isEditing && (
          <>
            <p className="mt-3 text-xs leading-6 text-[var(--v2-ink-soft)] line-clamp-2">{search.query || 'Consulta vazia'}</p>
            <p className="mt-2 text-[11px] text-[var(--v2-ink-faint)]">
              {search.selectedCount ?? 0} selecionado(s)
              {search.resultCount != null ? ` · ${search.resultCount} resultado(s)` : ''}
              {search.tribunalCount != null ? ` · ${search.tribunalCount} tribunal(is)` : ''}
              {search.dateRangeLabel ? ` · ${search.dateRangeLabel}` : ''}
            </p>
          </>
        )}
      </div>
    )
  }

  const sourcePreviewText = buildNotebookSourcePreview(selectedSource)
  const recentSources = activeNotebook ? [...activeNotebook.sources].slice(-4).reverse() : []
  const recentArtifacts = activeNotebook ? [...activeNotebook.artifacts].slice(-4).reverse() : []
  const trimmedStudioCustomPrompt = studioCustomPrompt.trim()
  const studioBridgePrompt = trimmedStudioCustomPrompt.slice(0, STUDIO_BRIDGE_PROMPT_LIMIT)
  const includedStudioSources = studioAudit.sourceEntries.filter((entry) => entry.included)
  const buildLegacyStudioPath = (artifactType?: StudioArtifactType | null) => activeNotebook?.id
    ? buildResearchNotebookClassicPath({
        notebookId: activeNotebook.id,
        tab: 'studio',
        preserveSearch: location.search,
        artifactType: artifactType || null,
        studioPrompt: studioBridgePrompt || null,
      })
    : buildResearchNotebookClassicPath({ preserveSearch: location.search })
  const legacyStudioPath = buildLegacyStudioPath()
  const legacyArtifactsPath = activeNotebook?.id
    ? buildResearchNotebookClassicPath({ notebookId: activeNotebook.id, tab: 'artifacts', preserveSearch: location.search })
    : buildResearchNotebookClassicPath({ preserveSearch: location.search })
  const buildWorkbenchPath = (section?: ResearchNotebookV2Section | null) => activeNotebook?.id
    ? buildResearchNotebookWorkbenchPath({
        notebookId: activeNotebook.id,
        section: section || null,
        preserveSearch: location.search,
      })
    : buildResearchNotebookWorkbenchPath({ preserveSearch: location.search })
  const workbenchSourcesPath = buildWorkbenchPath('sources')
  const workbenchStudioPath = buildWorkbenchPath('studio')
  const workbenchBridgePath = buildWorkbenchPath('bridge')
  const structuredArtifactCount = activeNotebook?.artifacts.filter((artifact) => artifact.format === 'json').length || 0
  const mediaArtifactCount = activeNotebook?.artifacts.filter((artifact) => MEDIA_ARTIFACT_TYPES.has(artifact.type)).length || 0
  const legacyOnlyArtifactCount = 0

  if (!IS_FIREBASE) {
    return (
      <div className="space-y-6">
        <section className="v2-panel p-6 lg:p-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--v2-line-strong)] bg-[rgba(255,255,255,0.82)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--v2-ink-soft)]">
              <Sparkles className="h-3.5 w-3.5" />
              Notebook V2
            </div>
            <h1 className="v2-display text-4xl text-[var(--v2-ink-strong)]">O workbench do caderno precisa do Firebase ativo.</h1>
            <p className="max-w-3xl text-sm leading-7 text-[var(--v2-ink-soft)] sm:text-[15px]">
              Esta superfície reaproveita cadernos, fontes, histórico e artefatos reais do usuário. Ative o Firebase e volte para validar o redesign sobre dados verdadeiros.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link to={buildWorkspaceSettingsPath({ preserveSearch: location.search })} className="v2-btn-primary">Abrir configurações</Link>
              <Link to={buildResearchNotebookClassicPath({ preserveSearch: location.search })} className="v2-btn-secondary">Abrir notebook clássico</Link>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="v2-panel overflow-hidden p-6 lg:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-end">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--v2-line-strong)] bg-[rgba(255,255,255,0.82)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--v2-ink-soft)]">
              <Sparkles className="h-3.5 w-3.5" />
              Research Workbench V2
            </div>

            <div className="space-y-3">
              <h1 className="v2-display text-4xl leading-tight text-[var(--v2-ink-strong)]">O caderno entra no redesign como superfície flagship.</h1>
              <p className="max-w-3xl text-sm leading-7 text-[var(--v2-ink-soft)] sm:text-[15px]">
                Este corte reorganiza a operação do notebook em lista persistente, deck executivo, chat contextual, pesquisa auditável, governança de buscas/fontes, análise inteligente de acervo, geração do estúdio, viewer avançado, revisão de custo, timeline persistida e produção literal no próprio shell, mantendo a superfície clássica apenas como trilha opcional de contingência e comparação.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setShowCreateForm((current) => !current)} className="v2-btn-primary">
                <Plus className="h-4 w-4" />
                {showCreateForm ? 'Fechar criação' : 'Novo caderno'}
              </button>
              {activeNotebook?.id && (
                <Link to={workbenchBridgePath} className="v2-btn-secondary">
                  Abrir contingência clássica
                </Link>
              )}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-[var(--v2-line-strong)] bg-[rgba(255,255,255,0.74)] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Estado da superfície</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Cadernos ativos</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{notebooks.length}</p>
              </div>
              <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Caderno atual</p>
                <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">{activeNotebook?.title || 'Nenhum'}</p>
                <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">{activeNotebook?.topic || 'Selecione um item na coluna lateral.'}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="v2-panel p-5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Buscar cadernos</label>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--v2-ink-faint)]" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Título, tema ou descrição"
                className="v2-field pl-11"
              />
            </div>
          </div>

          {showCreateForm && (
            <div className="v2-panel p-5">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-[var(--v2-accent-strong)]" />
                <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">Criar novo caderno</p>
              </div>
              <div className="mt-4 space-y-3">
                <input value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} placeholder="Título do caderno" className="v2-field" />
                <input value={createTopic} onChange={(event) => setCreateTopic(event.target.value)} placeholder="Tema principal" className="v2-field" />
                <textarea
                  value={createDescription}
                  onChange={(event) => setCreateDescription(event.target.value)}
                  placeholder="Escopo, objetivo e recorte da pesquisa"
                  rows={4}
                  className="v2-field resize-none"
                />
                <button
                  type="button"
                  onClick={handleCreateNotebook}
                  disabled={!createTitle.trim() || !createTopic.trim() || creating}
                  className="v2-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {creating ? 'Criando...' : 'Criar agora'}
                </button>
              </div>
            </div>
          )}

          <div className="v2-panel p-4">
            <div className="flex items-center justify-between gap-3 px-2 pb-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Fila de cadernos</p>
                <p className="mt-1 text-sm text-[var(--v2-ink-soft)]">Seleção persistente com foco em retomada.</p>
              </div>
              {(loading || selectingNotebook) && <Loader2 className="h-4 w-4 animate-spin text-[var(--v2-accent-strong)]" />}
            </div>

            <div className="space-y-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)
              ) : filteredNotebooks.length === 0 ? (
                <div className="rounded-[1.4rem] border border-dashed border-[var(--v2-line-strong)] px-4 py-8 text-center text-sm text-[var(--v2-ink-soft)]">
                  Nenhum caderno encontrado para o filtro atual.
                </div>
              ) : (
                filteredNotebooks.map((notebook) => {
                  const itemSnapshot = buildResearchNotebookV2Snapshot(notebook)
                  const isActive = activeNotebook?.id === notebook.id

                  return (
                    <div
                      key={notebook.id}
                      className={`rounded-[1.4rem] border px-4 py-4 transition-all ${isActive ? 'border-[rgba(15,118,110,0.32)] bg-[rgba(15,118,110,0.08)] shadow-[var(--v2-shadow-soft)]' : 'border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] hover:-translate-y-0.5 hover:border-[var(--v2-line-strong)]'}`}
                    >
                      <button type="button" onClick={() => notebook.id && void hydrateNotebook(notebook.id, activeSection, true)} className="w-full text-left">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">{notebook.title}</p>
                            <p className="mt-1 truncate text-xs text-[var(--v2-ink-soft)]">{notebook.topic}</p>
                          </div>
                          <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">
                            {itemSnapshot.sourceCount} fontes
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--v2-ink-soft)]">
                          <span>{itemSnapshot.messageCount} msg</span>
                          <span>{itemSnapshot.artifactCount} artefatos</span>
                          <span>{itemSnapshot.savedSearchCount} buscas salvas</span>
                        </div>

                        <p className="mt-3 text-[11px] text-[var(--v2-ink-faint)]">
                          {itemSnapshot.latestActivityAt ? `Última atividade ${formatDate(itemSnapshot.latestActivityAt)}` : `Criado em ${formatDate(notebook.created_at)}`}
                        </p>
                      </button>

                      <div className="mt-3 flex items-center justify-end">
                        <button type="button" onClick={() => handleDeleteNotebook(notebook)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-6">
          {!activeNotebook || !snapshot ? (
            <div className="v2-panel p-8 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-[var(--v2-accent-strong)]" />
              <h2 className="mt-4 text-2xl font-semibold text-[var(--v2-ink-strong)]">Escolha um caderno para abrir o workbench.</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[var(--v2-ink-soft)]">
                A superfície V2 combina deck executivo, gestão de fontes, análise inteligente de acervo, estúdio completo e uma trilha opcional de contingência clássica. Assim que um item for selecionado, o contexto passa a refletir seus dados reais.
              </p>
            </div>
          ) : (
            <>
              <section className="v2-panel overflow-hidden p-6 lg:p-7">
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px] xl:items-start">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[var(--v2-line-strong)] bg-[rgba(255,255,255,0.76)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-soft)]">{activeNotebook.status}</span>
                      <span className="rounded-full bg-[rgba(15,118,110,0.1)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-accent-strong)]">{snapshot.sourceCount} fontes</span>
                    </div>

                    <div>
                      <p className="text-sm text-[var(--v2-ink-soft)]">Tema principal</p>
                      <h2 className="v2-display mt-2 text-4xl leading-tight text-[var(--v2-ink-strong)]">{activeNotebook.topic}</h2>
                      <p className="mt-3 text-lg font-semibold text-[var(--v2-ink-strong)]">{activeNotebook.title}</p>
                      {activeNotebook.description && (
                        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--v2-ink-soft)]">{activeNotebook.description}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={() => handleChangeSection('overview')} className={`v2-chip ${activeSection === 'overview' ? 'v2-chip-active' : ''}`}>Command deck</button>
                      <button type="button" onClick={() => handleChangeSection('chat')} className={`v2-chip ${activeSection === 'chat' ? 'v2-chip-active' : ''}`}>Chat contextual</button>
                      <button type="button" onClick={() => handleChangeSection('sources')} className={`v2-chip ${activeSection === 'sources' ? 'v2-chip-active' : ''}`}>Fontes e ingestão</button>
                      <button type="button" onClick={() => handleChangeSection('studio')} className={`v2-chip ${activeSection === 'studio' ? 'v2-chip-active' : ''}`}>Studio briefing</button>
                      <button type="button" onClick={() => handleChangeSection('artifacts')} className={`v2-chip ${activeSection === 'artifacts' ? 'v2-chip-active' : ''}`}>Artefatos e viewer</button>
                      <button type="button" onClick={() => handleChangeSection('bridge')} className={`v2-chip ${activeSection === 'bridge' ? 'v2-chip-active' : ''}`}>Contingência clássica</button>
                    </div>
                  </div>

                  <div className="rounded-[1.6rem] border border-[var(--v2-line-strong)] bg-[rgba(255,255,255,0.78)] p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Ações rápidas</p>
                    <div className="mt-4 grid gap-3">
                      <button type="button" onClick={() => handleChangeSection('chat')} className="flex items-center justify-between rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-sm font-semibold text-[var(--v2-ink-strong)] hover:-translate-y-0.5">
                        Abrir chat V2
                        <MessageSquareText className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => handleChangeSection('studio')} className="flex items-center justify-between rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-sm font-semibold text-[var(--v2-ink-strong)] hover:-translate-y-0.5">
                        Preparar estúdio V2
                        <Sparkles className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => handleChangeSection('artifacts')} className="flex items-center justify-between rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-sm font-semibold text-[var(--v2-ink-strong)] hover:-translate-y-0.5">
                        Abrir artefatos V2
                        <FileText className="h-4 w-4" />
                      </button>
                      <Link to={workbenchBridgePath} className="flex items-center justify-between rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-sm font-semibold text-[var(--v2-ink-strong)] hover:-translate-y-0.5">
                        Mapa de contingência
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </section>

              {activeSection === 'overview' && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: 'Fontes indexadas', value: `${snapshot.indexedSourceCount}/${snapshot.sourceCount}`, helper: `${snapshot.textReadySourceCount} com texto pronto`, icon: Database },
                      { label: 'Conversa ativa', value: snapshot.messageCount, helper: `${chatAudit.conversationSummary.includedMessages} msg na janela`, icon: MessageSquareText },
                      { label: 'Artefatos', value: snapshot.artifactCount, helper: `${snapshot.savedSearchCount} buscas salvas`, icon: FileText },
                      { label: 'Volume textual', value: formatCharVolume(snapshot.totalSourceChars), helper: snapshot.latestActivityAt ? `Última atividade ${formatDate(snapshot.latestActivityAt)}` : 'Sem histórico adicional', icon: Brain },
                    ].map((card) => (
                      <div key={card.label} className="v2-panel px-5 py-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">{card.label}</p>
                            <p className="mt-3 text-3xl font-semibold tracking-tight text-[var(--v2-ink-strong)]">{card.value}</p>
                            <p className="mt-2 text-sm text-[var(--v2-ink-soft)]">{card.helper}</p>
                          </div>
                          <card.icon className="h-5 w-5 text-[var(--v2-accent-strong)]" />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                    <section className="v2-panel p-5 lg:p-6">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Memória ativa</p>
                          <h3 className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">Janela de contexto do workbench</h3>
                        </div>
                        <Link to={workbenchSourcesPath} className="v2-btn-secondary">
                          Abrir fontes no V2
                        </Link>
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        <div className="rounded-[1.4rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.78)] p-4">
                          <div className="flex items-center gap-2 text-[var(--v2-accent-strong)]">
                            <Bot className="h-4 w-4" />
                            <p className="text-sm font-semibold">Chat</p>
                          </div>
                          <div className="mt-4 space-y-2 text-sm text-[var(--v2-ink-soft)]">
                            <p>{chatAudit.sourceSummary.includedSources}/{chatAudit.sourceSummary.totalSources} fontes úteis na janela.</p>
                            <p>{chatAudit.conversationSummary.includedMessages}/{chatAudit.conversationSummary.totalMessages} mensagens recentes.</p>
                            <p>{chatAudit.searchSummary.totalEntries} buscas do caderno reaproveitadas.</p>
                            <p>{formatCharVolume(chatAudit.totalContextChars)} previstos para a próxima resposta.</p>
                          </div>
                        </div>

                        <div className="rounded-[1.4rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.78)] p-4">
                          <div className="flex items-center gap-2 text-[var(--v2-accent-strong)]">
                            <Sparkles className="h-4 w-4" />
                            <p className="text-sm font-semibold">Estúdio</p>
                          </div>
                          <div className="mt-4 space-y-2 text-sm text-[var(--v2-ink-soft)]">
                            <p>{studioAudit.sourceSummary.includedSources}/{studioAudit.sourceSummary.totalSources} fontes promovidas.</p>
                            <p>{studioAudit.conversationSummary.includedMessages}/{studioAudit.conversationSummary.totalMessages} mensagens recentes.</p>
                            <p>{formatCharVolume(studioAudit.sourceSummary.includedChars)} de material textual.</p>
                            <p>{formatCharVolume(studioAudit.totalContextChars)} de contexto total previsto.</p>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="space-y-6">
                      <div className="v2-panel p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Composição do caderno</p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                          <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Acervo</p>
                            <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{snapshot.acervoSourceCount}</p>
                          </div>
                          <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Uploads</p>
                            <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{snapshot.uploadSourceCount}</p>
                          </div>
                          <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Web e jurisprudência</p>
                            <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{snapshot.webSourceCount}</p>
                          </div>
                        </div>
                      </div>

                      <div className="v2-panel p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Memória persistida</p>
                        <div className="mt-4 space-y-3 text-sm text-[var(--v2-ink-soft)]">
                          <p>{snapshot.savedSearchCount} busca(s) salva(s) disponível(is) para replay.</p>
                          <p>{snapshot.researchAuditCount} auditoria(s) de pesquisa preservada(s).</p>
                          <button type="button" onClick={() => handleChangeSection('sources')} className="inline-flex items-center gap-2 font-semibold text-[var(--v2-accent-strong)] hover:underline">
                            Abrir governança de busca no V2
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <section className="v2-panel p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Fontes recentes</p>
                          <h3 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Últimos materiais anexados</h3>
                        </div>
                        <button type="button" onClick={() => handleChangeSection('sources')} className="v2-btn-secondary">Gerir fontes</button>
                      </div>
                      <div className="mt-5 space-y-3">
                        {recentSources.length === 0 ? (
                          <p className="rounded-[1.2rem] border border-dashed border-[var(--v2-line-strong)] px-4 py-8 text-center text-sm text-[var(--v2-ink-soft)]">Nenhuma fonte ainda. Use a aba de ingestão para começar.</p>
                        ) : (
                          recentSources.map((source) => {
                            const sourceDef = SOURCE_TYPE_LABELS[source.type] || SOURCE_TYPE_LABELS.upload
                            const SourceIcon = sourceDef.icon
                            return (
                              <button key={source.id} type="button" onClick={() => { setSelectedSourceId(source.id); handleChangeSection('sources') }} className="flex w-full items-center gap-3 rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-left hover:-translate-y-0.5">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(15,118,110,0.12)] text-[var(--v2-accent-strong)]">
                                  <SourceIcon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">{source.name}</p>
                                  <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">{sourceDef.label} · {formatDate(source.added_at)}</p>
                                </div>
                                <ArrowRight className="h-4 w-4 text-[var(--v2-ink-faint)]" />
                              </button>
                            )
                          })
                        )}
                      </div>
                    </section>

                    <section className="v2-panel p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Artefatos recentes</p>
                          <h3 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Saídas do estúdio ainda válidas</h3>
                        </div>
                        <button type="button" onClick={() => handleChangeSection('artifacts')} className="v2-btn-secondary">Abrir artefatos</button>
                      </div>
                      <div className="mt-5 space-y-3">
                        {recentArtifacts.length === 0 ? (
                          <p className="rounded-[1.2rem] border border-dashed border-[var(--v2-line-strong)] px-4 py-8 text-center text-sm text-[var(--v2-ink-soft)]">Ainda não existem artefatos gerados para este caderno.</p>
                        ) : (
                          recentArtifacts.map((artifact) => {
                            const artifactDef = ARTIFACT_TYPE_MAP.get(artifact.type)
                            const ArtifactIcon = artifactDef?.icon || FileText

                            return (
                              <button key={artifact.id} type="button" onClick={() => handleOpenArtifact(artifact)} className="flex w-full items-center gap-3 rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-left hover:-translate-y-0.5">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(217,119,6,0.12)] text-[var(--v2-accent-warm)]">
                                  <ArtifactIcon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">{artifact.title}</p>
                                  <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">{artifactDef?.label || artifact.type} · {formatDate(artifact.created_at)}</p>
                                </div>
                                {artifact.type === 'video_production'
                                  ? <ExternalLink className="h-4 w-4 text-[var(--v2-ink-faint)]" />
                                  : <Eye className="h-4 w-4 text-[var(--v2-ink-faint)]" />}
                              </button>
                            )
                          })
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {activeSection === 'chat' && (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                  <section className="v2-panel flex min-h-[720px] flex-col overflow-hidden">
                    <div className="border-b border-[var(--v2-line-soft)] px-5 py-4 lg:px-6">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Assistente do workbench</p>
                          <h3 className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">Chat contextual com memória auditável</h3>
                          <p className="mt-2 text-sm leading-6 text-[var(--v2-ink-soft)]">
                            A conversa já opera no V2 com fontes do caderno, janela recente de mensagens, histórico de buscas e busca web opcional.
                          </p>
                        </div>

                        <button type="button" onClick={() => setUseWebSearch((current) => !current)} className={`v2-toggle ${useWebSearch ? 'v2-toggle-active' : ''}`}>
                          <span className="v2-toggle-track">
                            <span className="v2-toggle-thumb" />
                          </span>
                          <span className="inline-flex items-center gap-2 text-sm font-medium">
                            <Globe className="h-4 w-4" />
                            Busca web ao vivo
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 py-5 lg:px-6">
                      {activeNotebook.messages.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center text-center">
                          <Bot className="h-12 w-12 text-[var(--v2-accent-strong)]" />
                          <h4 className="mt-4 text-xl font-semibold text-[var(--v2-ink-strong)]">O chat já responde dentro do novo workbench.</h4>
                          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--v2-ink-soft)]">
                            Faça perguntas sobre "{activeNotebook.topic}". O assistente usará as fontes já anexadas e a memória recente desta conversa para orientar análise, próximos passos e bases normativas.
                          </p>
                          {activeNotebook.sources.length === 0 && (
                            <p className="mt-3 text-xs font-medium text-amber-700">
                              Nenhuma fonte anexada ainda. O assistente responde mesmo assim, mas a qualidade sobe quando o caderno já tem material indexado.
                            </p>
                          )}

                          <div className="mt-6 flex flex-wrap justify-center gap-2">
                            {chatSuggestions.map((suggestion) => (
                              <button
                                key={suggestion}
                                type="button"
                                onClick={() => setChatInput(suggestion)}
                                className="rounded-full border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.9)] px-3 py-1.5 text-xs font-medium text-[var(--v2-ink-soft)] transition-colors hover:border-[rgba(15,118,110,0.28)] hover:text-[var(--v2-accent-strong)]"
                              >
                                {suggestion.length > MAX_SUGGESTION_LABEL_LENGTH ? `${suggestion.slice(0, MAX_SUGGESTION_LABEL_LENGTH - 3)}...` : suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {activeNotebook.messages.map((message) => (
                            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[88%] rounded-[1.5rem] px-4 py-3 text-sm shadow-[var(--v2-shadow-soft)] ${message.role === 'user' ? 'rounded-br-md bg-[var(--v2-ink-strong)] text-white' : 'rounded-bl-md border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.9)] text-[var(--v2-ink-strong)]'}`}>
                                {message.role === 'assistant' ? (
                                  <div
                                    className="prose prose-sm max-w-none text-[var(--v2-ink-strong)] prose-p:my-2 prose-pre:my-3 prose-pre:whitespace-pre-wrap prose-code:text-xs prose-a:text-[var(--v2-accent-strong)]"
                                    dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(message.content) }}
                                  />
                                ) : (
                                  <div className="whitespace-pre-wrap break-words">{message.content}</div>
                                )}

                                <div className={`mt-2 flex items-center gap-2 text-[10px] ${message.role === 'user' ? 'text-white/65' : 'text-[var(--v2-ink-faint)]'}`}>
                                  <span>
                                    {formatDate(message.created_at)}
                                    {message.agent && <span className="ml-2">· {message.agent}</span>}
                                  </span>
                                  {message.role === 'assistant' && <CopyButton text={message.content} />}
                                </div>
                              </div>
                            </div>
                          ))}

                          {chatLoading && (
                            <div className="flex justify-start">
                              <div className="rounded-[1.5rem] rounded-bl-md border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-sm text-[var(--v2-ink-soft)] shadow-[var(--v2-shadow-soft)]">
                                <div className="flex items-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin text-[var(--v2-accent-strong)]" />
                                  Pesquisando, consolidando fontes e preparando a resposta...
                                </div>
                              </div>
                            </div>
                          )}

                          <div ref={chatEndRef} />
                        </div>
                      )}
                    </div>

                    <div className="border-t border-[var(--v2-line-soft)] bg-[rgba(255,252,247,0.72)] px-5 py-4 lg:px-6">
                      {activeNotebook.messages.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {chatSuggestions.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => setChatInput(suggestion)}
                              className="rounded-full border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.9)] px-3 py-1 text-xs font-medium text-[var(--v2-ink-soft)] transition-colors hover:border-[rgba(15,118,110,0.28)] hover:text-[var(--v2-accent-strong)]"
                            >
                              {suggestion.length > MAX_SUGGESTION_LABEL_LENGTH ? `${suggestion.slice(0, MAX_SUGGESTION_LABEL_LENGTH - 3)}...` : suggestion}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex items-end gap-3">
                        <textarea
                          value={chatInput}
                          onChange={(event) => setChatInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault()
                              void handleSendMessage()
                            }
                          }}
                          placeholder={`Pergunte algo sobre "${activeNotebook.topic}"...`}
                          rows={2}
                          className="v2-field min-h-[88px] resize-none"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSendMessage()}
                          disabled={!chatInput.trim() || chatLoading}
                          className="v2-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          {chatLoading ? 'Respondendo...' : 'Enviar'}
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[var(--v2-ink-faint)]">
                        <p>{snapshot.sourceCount} fonte(s) disponíveis · {activeNotebook.messages.length} mensagem(ns) persistida(s)</p>
                        <p>Enter envia · Shift+Enter quebra linha</p>
                      </div>
                    </div>
                  </section>

                  <aside className="space-y-6">
                    <section className="v2-panel p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Janela da próxima resposta</p>
                          <h3 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Auditoria ativa</h3>
                        </div>
                        <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">{formatCharVolume(effectiveChatAudit.totalContextChars)}</span>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Fontes</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{effectiveChatAudit.sourceSummary.includedSources}/{effectiveChatAudit.sourceSummary.totalSources}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">{formatCharVolume(effectiveChatAudit.sourceSummary.includedChars)} úteis</p>
                        </div>
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Conversa</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{effectiveChatAudit.conversationSummary.includedMessages}/{effectiveChatAudit.conversationSummary.totalMessages}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">{formatCharVolume(effectiveChatAudit.conversationSummary.includedChars)} recentes</p>
                        </div>
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Histórico de busca</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{effectiveChatAudit.searchSummary.totalEntries}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">{formatCharVolume(effectiveChatAudit.searchSummary.includedChars)} incluídos</p>
                        </div>
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Busca web</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{effectiveChatAudit.liveWebEnabled ? 'On' : 'Off'}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">{effectiveChatAudit.liveWebChars > 0 ? formatCharVolume(effectiveChatAudit.liveWebChars) : 'sem snippet'}</p>
                        </div>
                      </div>

                      <div className="mt-5 space-y-2 text-xs leading-6 text-[var(--v2-ink-soft)]">
                        <p>Fontes truncadas: {effectiveChatAudit.sourceSummary.truncatedSources}</p>
                        <p>Mensagens fora da janela: {effectiveChatAudit.conversationSummary.droppedMessages}</p>
                        <p>Histórico de busca truncado: {effectiveChatAudit.searchSummary.truncated ? 'sim' : 'não'}</p>
                        <p>Conversa truncada por caracteres: {effectiveChatAudit.conversationSummary.truncatedByChars ? 'sim' : 'não'}</p>
                      </div>
                    </section>

                    <section className="v2-panel p-5">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Fontes promovidas</p>
                        <h3 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Materiais na janela útil</h3>
                      </div>

                      <div className="mt-5 space-y-3">
                        {effectiveChatAudit.sourceEntries.length === 0 ? (
                          <p className="rounded-[1.2rem] border border-dashed border-[var(--v2-line-strong)] px-4 py-8 text-center text-sm text-[var(--v2-ink-soft)]">Ainda não existe fonte suficiente para a janela contextual.</p>
                        ) : (
                          effectiveChatAudit.sourceEntries.slice(0, 6).map((entry) => (
                            <div key={entry.id} className="rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.84)] px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">{entry.name}</p>
                                  <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">{SOURCE_TYPE_LABELS[entry.type]?.label || entry.type}</p>
                                </div>
                                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${entry.included ? 'bg-[rgba(15,118,110,0.12)] text-[var(--v2-accent-strong)]' : 'bg-[rgba(15,23,42,0.06)] text-[var(--v2-ink-faint)]'}`}>
                                  {entry.included ? 'ativa' : entry.exclusionReason === 'too_short' ? 'curta' : 'sem texto'}
                                </span>
                              </div>
                              <p className="mt-2 text-xs text-[var(--v2-ink-soft)]">
                                {entry.included ? `${formatCharVolume(entry.includedChars)} usados` : `${formatCharVolume(entry.originalChars)} disponíveis`}
                                {entry.truncated ? ' · truncada por limite' : ''}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </section>

                    <section className="v2-panel p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Contingência clássica</p>
                      <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--v2-ink-soft)]">
                        <p>O workbench novo agora já cobre seleção persistente, fontes auditáveis, acervo, chat, estúdio, viewer, custo de vídeo, timeline persistida e produção literal. O clássico fica preservado como contingência assistida e trilha de comparação, não mais como passo obrigatório.</p>
                        <Link to={workbenchBridgePath} className="inline-flex items-center gap-2 font-semibold text-[var(--v2-accent-strong)] hover:underline">
                          Explorar rotas clássicas
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </section>
                  </aside>
                </div>
              )}

              {activeSection === 'sources' && (
                <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                  <section className="space-y-6">
                    <div className="v2-panel p-5">
                      <div className="flex items-center gap-2 text-[var(--v2-accent-strong)]">
                        <Globe className="h-4 w-4" />
                        <p className="text-sm font-semibold">Pesquisadores de fonte</p>
                      </div>
                      <div className="mt-4 space-y-3">
                        <input
                          value={externalSearchQuery}
                          onChange={(event) => setExternalSearchQuery(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && externalSearchQuery.trim() && !isAnyResearchLoading) {
                              event.preventDefault()
                              void handleAddExternalSearchSource()
                            }
                          }}
                          disabled={isAnyResearchLoading}
                          placeholder="Tema para pesquisa externa / profunda / jurisprudência..."
                          className="v2-field disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        <div className="grid gap-2">
                          <button type="button" onClick={() => void handleAddExternalSearchSource()} disabled={!externalSearchQuery.trim() || isAnyResearchLoading} className="v2-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50">
                            {externalResearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                            {externalResearchLoading ? 'Pesquisando...' : 'Pesquisa Externa'}
                          </button>
                          <button type="button" onClick={() => void handleAddDeepExternalSearchSource()} disabled={!externalSearchQuery.trim() || isAnyResearchLoading} className="v2-btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-50">
                            {externalDeepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                            {externalDeepLoading ? 'Investigando...' : 'Pesquisa Profunda'}
                          </button>
                          <button type="button" onClick={() => handleAddJurisprudenceSource()} disabled={!externalSearchQuery.trim() || isAnyResearchLoading} className="v2-btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-50">
                            {jurisprudenceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Library className="h-4 w-4" />}
                            {jurisprudenceLoading ? 'Consultando tribunais...' : 'Jurisprudência (DataJud)'}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="v2-panel p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Janela auditável da próxima busca</p>
                          <h3 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Resumo operacional da pesquisa</h3>
                        </div>
                        <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">
                          {formatCharVolume((lastResearchContextAudit || researchContextAuditPreview).totalContextChars)}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Consulta</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{(lastResearchContextAudit || researchContextAuditPreview).queryChars}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">caracteres</p>
                        </div>
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Resultados</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{(lastResearchContextAudit || researchContextAuditPreview).resultCount ?? 0}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">itens encontrados</p>
                        </div>
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Selecionados</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{(lastResearchContextAudit || researchContextAuditPreview).selectedCount ?? 0}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">promovidos para síntese</p>
                        </div>
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Tribunais</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{(lastResearchContextAudit || researchContextAuditPreview).tribunalCount ?? lastJurisprudenceTribunalAliases.length}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">na consulta atual</p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2 text-xs leading-6 text-[var(--v2-ink-soft)]">
                        <p>
                          Modo atual: {(lastResearchContextAudit || researchContextAuditPreview).sourceKindLabel || 'Pesquisa externa'}
                          {(lastResearchContextAudit || researchContextAuditPreview).mode === 'executed' ? ' · última execução sintetizada' : ' · preview da próxima consulta'}
                        </p>
                        {(lastResearchContextAudit || researchContextAuditPreview).compiledChars != null && (
                          <p>
                            Conteúdo promovido para síntese: {formatCharVolume((lastResearchContextAudit || researchContextAuditPreview).compiledChars || 0)}
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
                    </div>

                    <div className="v2-panel p-5">
                      <div className="flex items-center gap-2 text-[var(--v2-accent-strong)]">
                        <Link2 className="h-4 w-4" />
                        <p className="text-sm font-semibold">Adicionar link</p>
                      </div>
                      <div className="mt-4 space-y-3">
                        <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://exemplo.com/artigo" className="v2-field" />
                        <button type="button" onClick={handleAddLinkSource} disabled={!sourceUrl.trim() || sourceUrlLoading} className="v2-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50">
                          {sourceUrlLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                          {sourceUrlLoading ? 'Indexando...' : 'Ingerir link'}
                        </button>
                      </div>
                    </div>

                    <div className="v2-panel p-5">
                      <div className="flex items-center gap-2 text-[var(--v2-accent-strong)]">
                        <Upload className="h-4 w-4" />
                        <p className="text-sm font-semibold">Upload textual</p>
                      </div>
                      <div className="mt-4 space-y-3">
                        <p className="text-xs text-[var(--v2-ink-soft)]">Formatos suportados: {SUPPORTED_TEXT_FILE_EXTENSIONS.join(', ')}</p>
                        <input
                          ref={sourceUploadRef}
                          type="file"
                          multiple
                          accept={SUPPORTED_TEXT_FILE_EXTENSIONS.join(',')}
                          onChange={handleUploadSourceFiles}
                          className="w-full text-xs text-[var(--v2-ink-soft)] file:mr-3 file:rounded-full file:border-0 file:bg-[rgba(15,118,110,0.12)] file:px-4 file:py-2 file:font-semibold file:text-[var(--v2-accent-strong)] hover:file:bg-[rgba(15,118,110,0.18)]"
                        />
                        {sourceUploadLoading && <p className="text-xs text-[var(--v2-accent-strong)]">Processando arquivos e preparando texto indexável...</p>}
                      </div>
                    </div>

                    <div className="v2-panel p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[var(--v2-accent-strong)]">
                          <Brain className="h-4 w-4" />
                          <p className="text-sm font-semibold">Análise inteligente do acervo</p>
                        </div>
                        {(acervoAnalysisLoading || acervoAnalysisPhase || acervoAnalysisResults.length > 0) && (
                          <button type="button" onClick={() => setShowAcervoProgressModal(true)} className="v2-btn-secondary">
                            <Sparkles className="h-4 w-4" />
                            Trilha
                          </button>
                        )}
                      </div>

                      <div className="mt-4 space-y-3">
                        <p className="text-xs leading-6 text-[var(--v2-ink-soft)]">
                          Rode o pipeline multiagente do notebook acervo para ranquear documentos do acervo por aderência ao tema do caderno e anexar as referências curadas em lote.
                        </p>

                        <div className="rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.84)] px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">
                            <span>{activeNotebook.topic || activeNotebook.title}</span>
                            <span className="rounded-full bg-[rgba(15,118,110,0.12)] px-2.5 py-1 text-[var(--v2-accent-strong)]">{availableAcervoDocs.length} docs elegíveis</span>
                            {acervoAnalysisLoading && (
                              <span className="rounded-full bg-[rgba(245,158,11,0.14)] px-2.5 py-1 text-[rgb(180,83,9)]">{acervoAnalysisPercent}%</span>
                            )}
                            {!acervoAnalysisLoading && acervoAnalysisResults.length > 0 && (
                              <span className="rounded-full bg-[rgba(15,118,110,0.12)] px-2.5 py-1 text-[var(--v2-accent-strong)]">{acervoAnalysisResults.length} recomendação(ões)</span>
                            )}
                          </div>

                          <p className="mt-3 text-xs leading-6 text-[var(--v2-ink-soft)]">
                            {acervoAnalysisLoading
                              ? `${acervoAnalysisMessage || 'Executando pipeline de análise do acervo...'}${acervoAnalysisMeta ? ` • ${acervoAnalysisMeta}` : ''}`
                              : acervoAnalysisError
                                ? `${acervoAnalysisError}${acervoAnalysisMeta ? ` • ${acervoAnalysisMeta}` : ''}`
                                : acervoAnalysisResults.length > 0
                                  ? 'Curadoria concluída. Revise as recomendações abaixo e adicione as fontes escolhidas em lote.'
                                  : 'A análise respeita as fontes de acervo já anexadas ao caderno e evita duplicatas no resultado.'}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleAnalyzeAcervo()}
                              disabled={acervoAnalysisLoading || sourceUploadLoading || sourceUrlLoading || isAnyResearchLoading}
                              className="v2-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {acervoAnalysisLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                              {acervoAnalysisResults.length > 0 ? 'Reexecutar análise' : 'Analisar acervo'}
                            </button>
                            {(acervoAnalysisLoading || acervoAnalysisResults.length > 0 || acervoAnalysisError) && (
                              <button type="button" onClick={() => setShowAcervoProgressModal(true)} className="v2-btn-secondary">
                                <Sparkles className="h-4 w-4" />
                                Abrir trilha
                              </button>
                            )}
                            {!acervoAnalysisLoading && acervoAnalysisResults.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setAcervoAnalysisResults([])
                                  setSelectedAnalysisIds(new Set())
                                }}
                                className="v2-btn-secondary"
                              >
                                <Trash2 className="h-4 w-4" />
                                Descartar curadoria
                              </button>
                            )}
                          </div>
                        </div>

                        {!acervoAnalysisLoading && acervoAnalysisResults.length > 0 && (
                          <div className="rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.84)] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">Curadoria recomendada</p>
                                <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">
                                  {selectedAnalysisIds.size} de {addableAnalysisResults.length} recomendação(ões) pronta(s) para anexação.
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {addableAnalysisResults.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (allAddableAnalysisResultsSelected) {
                                        setSelectedAnalysisIds(new Set())
                                      } else {
                                        setSelectedAnalysisIds(new Set(addableAnalysisResults.map((doc) => doc.id)))
                                      }
                                    }}
                                    className="v2-btn-secondary"
                                  >
                                    {allAddableAnalysisResultsSelected ? 'Desmarcar tudo' : 'Selecionar tudo'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void handleAddAnalysisResults()}
                                  disabled={selectedAnalysisIds.size === 0}
                                  className="v2-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Plus className="h-4 w-4" />
                                  Adicionar {selectedAnalysisIds.size} fonte(s)
                                </button>
                              </div>
                            </div>

                            <div className="mt-4 max-h-[340px] space-y-3 overflow-y-auto pr-1">
                              {acervoAnalysisResults.map((doc) => {
                                const alreadySource = activeNotebook.sources.some((source) => source.type === 'acervo' && source.reference === doc.id)
                                const isSelected = selectedAnalysisIds.has(doc.id)

                                return (
                                  <button
                                    key={doc.id}
                                    type="button"
                                    disabled={alreadySource}
                                    onClick={() => {
                                      if (alreadySource) return
                                      setSelectedAnalysisIds((current) => {
                                        const next = new Set(current)
                                        if (next.has(doc.id)) next.delete(doc.id)
                                        else next.add(doc.id)
                                        return next
                                      })
                                    }}
                                    className={`w-full rounded-[1.2rem] border px-4 py-4 text-left transition-all ${alreadySource
                                      ? 'cursor-default border-[rgba(15,118,110,0.18)] bg-[rgba(15,118,110,0.08)] opacity-75'
                                      : isSelected
                                        ? 'border-[rgba(15,118,110,0.32)] bg-[rgba(15,118,110,0.08)]'
                                        : 'border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.94)] hover:-translate-y-0.5'
                                    }`}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border ${alreadySource
                                        ? 'border-[rgba(15,118,110,0.18)] bg-[rgba(15,118,110,0.14)] text-[var(--v2-accent-strong)]'
                                        : isSelected
                                          ? 'border-[var(--v2-accent-strong)] bg-[var(--v2-accent-strong)] text-white'
                                          : 'border-[var(--v2-line-strong)] bg-white text-transparent'
                                      }`}>
                                        <CheckCircle2 className="h-4 w-4" />
                                      </div>

                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">{doc.filename}</p>
                                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${doc.score >= 0.7
                                            ? 'bg-[rgba(16,185,129,0.14)] text-[rgb(4,120,87)]'
                                            : doc.score >= 0.4
                                              ? 'bg-[rgba(245,158,11,0.16)] text-[rgb(180,83,9)]'
                                              : 'bg-[rgba(15,23,42,0.08)] text-[var(--v2-ink-soft)]'
                                          }`}>
                                            {Math.round(doc.score * 100)}%
                                          </span>
                                          {alreadySource && (
                                            <span className="rounded-full bg-[rgba(15,118,110,0.12)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--v2-accent-strong)]">
                                              Já anexado
                                            </span>
                                          )}
                                        </div>
                                        <p className="mt-2 text-xs leading-6 text-[var(--v2-ink-soft)] line-clamp-3">{doc.summary}</p>
                                        <p className="mt-2 text-[11px] text-[var(--v2-ink-faint)]">Curadoria multiagente concluída · {formatDate(doc.created_at)}</p>
                                      </div>
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="v2-panel p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[var(--v2-accent-strong)]">
                          <FolderOpen className="h-4 w-4" />
                          <p className="text-sm font-semibold">Biblioteca do acervo</p>
                        </div>
                        {acervoLoading && <Loader2 className="h-4 w-4 animate-spin text-[var(--v2-accent-strong)]" />}
                      </div>

                      <div className="mt-4 space-y-3">
                        <input value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} placeholder="Filtrar documentos do acervo" className="v2-field" />
                        <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
                          {availableAcervoDocs.length === 0 ? (
                            <div className="rounded-[1.2rem] border border-dashed border-[var(--v2-line-strong)] px-4 py-8 text-center text-sm text-[var(--v2-ink-soft)]">
                              {acervoLoading ? 'Carregando acervo...' : 'Nenhum documento elegível para o filtro atual.'}
                            </div>
                          ) : (
                            availableAcervoDocs.slice(0, 24).map((doc) => (
                              <button key={doc.id} type="button" onClick={() => void handleAddAcervoSource(doc)} className="w-full rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-left hover:-translate-y-0.5">
                                <p className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">{doc.filename}</p>
                                <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">{doc.assuntos?.slice(0, 2).join(' · ') || 'Documento do acervo sem tags adicionais'}</p>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-6">
                    <div className="v2-panel p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Fontes atuais</p>
                          <h3 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Inventário do workbench</h3>
                        </div>
                        <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">{snapshot.sourceCount} itens</span>
                      </div>

                      <div className="mt-5 space-y-3">
                        {activeNotebook.sources.length === 0 ? (
                          <div className="rounded-[1.2rem] border border-dashed border-[var(--v2-line-strong)] px-4 py-10 text-center text-sm text-[var(--v2-ink-soft)]">
                            Nenhuma fonte foi anexada ainda. Comece pelo link, upload ou acervo.
                          </div>
                        ) : (
                          activeNotebook.sources.map((source) => {
                            const sourceDef = SOURCE_TYPE_LABELS[source.type] || SOURCE_TYPE_LABELS.upload
                            const SourceIcon = sourceDef.icon
                            const isSelected = selectedSourceId === source.id
                            const textLength = source.text_content?.length || 0
                            const canOpenViewer = canOpenNotebookSourceViewer(source)

                            return (
                              <div key={source.id} className={`rounded-[1.3rem] border px-4 py-4 transition-all ${isSelected ? 'border-[rgba(15,118,110,0.32)] bg-[rgba(15,118,110,0.08)]' : 'border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.82)]'}`}>
                                <div className="flex items-start gap-3">
                                  <button type="button" onClick={() => setSelectedSourceId(source.id)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                                    <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(15,118,110,0.12)] text-[var(--v2-accent-strong)]">
                                      <SourceIcon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">{source.name}</p>
                                      <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">{sourceDef.label} · {formatDate(source.added_at)}</p>
                                      <p className="mt-2 text-[11px] text-[var(--v2-ink-faint)]">
                                        {textLength > 0 ? `${formatCharVolume(textLength)} indexados` : 'Sem texto legível nesta camada'}
                                        {source.status === 'indexed' && textLength < MIN_SOURCE_CHARS ? ' · abaixo da janela útil de contexto' : ''}
                                      </p>
                                    </div>
                                  </button>

                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    {canOpenViewer && (
                                      <button type="button" onClick={() => setViewerSource(source)} className="v2-btn-secondary">
                                        <Eye className="h-4 w-4" />
                                        Viewer
                                      </button>
                                    )}
                                    <button type="button" onClick={() => void handleRemoveSource(source.id)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50">
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Remover
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>

                    <div className="v2-panel p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Fonte selecionada</p>
                          <h3 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Leitura rápida e viewer avançado</h3>
                        </div>
                        {selectedSource && canOpenNotebookSourceViewer(selectedSource) && (
                          <button type="button" onClick={() => setViewerSource(selectedSource)} className="v2-btn-secondary">
                            <Eye className="h-4 w-4" />
                            Abrir viewer avançado
                          </button>
                        )}
                      </div>

                      <div className="mt-5 rounded-[1.4rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.84)] p-4">
                        {selectedSource && (
                          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--v2-ink-strong)]">
                            <Database className="h-4 w-4 text-[var(--v2-accent-strong)]" />
                            {selectedSource.name}
                          </div>
                        )}
                        <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-[var(--v2-ink-soft)]">{sourcePreviewText}</pre>
                      </div>
                    </div>

                    <div className="v2-panel p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Pesquisa persistida</p>
                          <h3 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Últimas buscas auditadas</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          {(activeNotebook.research_audits?.length || 0) > 4 && (
                            <button type="button" onClick={() => setShowAllResearchAudits((current) => !current)} className="text-[11px] font-semibold text-[var(--v2-accent-strong)] hover:underline">
                              {showAllResearchAudits ? 'Mostrar menos' : 'Mostrar todas'}
                            </button>
                          )}
                          <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">
                            {activeNotebook.research_audits?.length || 0}
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 space-y-3">
                        {visibleResearchAudits.length === 0 ? (
                          <div className="rounded-[1.2rem] border border-dashed border-[var(--v2-line-strong)] px-4 py-8 text-center text-sm text-[var(--v2-ink-soft)]">
                            Ainda não existem auditorias de busca neste caderno.
                          </div>
                        ) : (
                          visibleResearchAudits.map((audit) => (
                            <div key={`${audit.created_at}-${audit.query}`} className="rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.84)] px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{audit.sourceKindLabel || 'Busca'} · {formatDate(audit.created_at)}</p>
                                  <p className="mt-1 text-xs text-[var(--v2-ink-soft)] line-clamp-2">{audit.query || 'Consulta vazia'}</p>
                                  <p className="mt-2 text-[11px] text-[var(--v2-ink-faint)]">
                                    {audit.selectedCount ?? 0} selecionado(s)
                                    {audit.resultCount != null ? ` · ${audit.resultCount} resultado(s)` : ''}
                                    {audit.tribunalCount != null ? ` · ${audit.tribunalCount} tribunal(is)` : ''}
                                    {audit.compiledChars != null ? ` · ${formatCharVolume(audit.compiledChars)}` : ''}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <button type="button" onClick={() => void saveResearchAuditPreset(audit)} className="v2-btn-secondary">
                                    <Save className="h-4 w-4" />
                                    Salvar busca
                                  </button>
                                  <button type="button" onClick={() => handleReplayResearchAudit(audit)} disabled={isAnyResearchLoading} className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                                    <RotateCcw className="h-4 w-4" />
                                    Reaplicar
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="v2-panel p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Buscas salvas</p>
                          <h3 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Governança persistida no workbench</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          {sortedSavedSearches.length > 5 && (
                            <button type="button" onClick={() => setShowAllSavedSearches((current) => !current)} className="text-[11px] font-semibold text-[var(--v2-accent-strong)] hover:underline">
                              {showAllSavedSearches ? 'Mostrar menos' : 'Mostrar todas'}
                            </button>
                          )}
                          <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">
                            {activeNotebook.saved_searches?.length || 0}
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 space-y-3">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--v2-ink-faint)]" />
                          <input
                            value={savedSearchFilter}
                            onChange={(event) => setSavedSearchFilter(event.target.value)}
                            placeholder="Filtrar por título, consulta ou tag"
                            className="v2-field pl-11"
                          />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {[
                            { key: 'all', label: 'Todas', count: savedSearchVariantCounts.all },
                            { key: 'external', label: 'Externa', count: savedSearchVariantCounts.external },
                            { key: 'deep', label: 'Profunda', count: savedSearchVariantCounts.deep },
                            { key: 'jurisprudencia', label: 'Jurisprudência', count: savedSearchVariantCounts.jurisprudencia },
                          ].map((option) => (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => setSavedSearchVariantFilter(option.key as SavedSearchVariantFilter)}
                              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${savedSearchVariantFilter === option.key ? 'border-[rgba(15,118,110,0.28)] bg-[rgba(15,118,110,0.12)] text-[var(--v2-accent-strong)]' : 'border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.9)] text-[var(--v2-ink-soft)] hover:border-[rgba(15,118,110,0.18)]'}`}
                            >
                              {option.label} · {option.count}
                            </button>
                          ))}
                        </div>

                        <div className="rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(245,241,232,0.7)] px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--v2-ink-soft)]">
                            <label className="inline-flex items-center gap-2 rounded-full border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.94)] px-3 py-1.5 font-medium">
                              <input
                                type="checkbox"
                                checked={allVisibleSavedSearchesSelected}
                                onChange={toggleSelectAllVisibleSavedSearches}
                                className="rounded border-[var(--v2-line-strong)] text-[var(--v2-accent-strong)]"
                              />
                              Selecionar visíveis ({visibleSavedSearchIds.length})
                            </label>
                            <span>Selecionadas: {selectedSavedSearchIds.size}</span>
                            <button type="button" onClick={() => void bulkSetPinnedSavedSearches(true)} disabled={selectedSavedSearchIds.size === 0} className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                              <BookMarked className="h-4 w-4" />
                              Fixar
                            </button>
                            <button type="button" onClick={() => void bulkSetPinnedSavedSearches(false)} disabled={selectedSavedSearchIds.size === 0} className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                              <BookMarked className="h-4 w-4" />
                              Desafixar
                            </button>
                            <button type="button" onClick={clearSelectedSavedSearches} disabled={selectedSavedSearchIds.size === 0} className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                              <X className="h-4 w-4" />
                              Limpar seleção
                            </button>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <input
                              value={bulkSavedSearchTagInput}
                              onChange={(event) => setBulkSavedSearchTagInput(event.target.value)}
                              placeholder="Tag em lote"
                              className="v2-field min-w-[220px] flex-1"
                              maxLength={50}
                            />
                            <button type="button" onClick={() => void bulkUpdateTagSavedSearches('add')} disabled={selectedSavedSearchIds.size === 0} className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                              <Save className="h-4 w-4" />
                              Adicionar tag
                            </button>
                            <button type="button" onClick={() => void bulkUpdateTagSavedSearches('remove')} disabled={selectedSavedSearchIds.size === 0} className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                              <X className="h-4 w-4" />
                              Remover tag
                            </button>
                            <button type="button" onClick={() => void deleteSelectedSavedSearches()} disabled={selectedSavedSearchIds.size === 0} className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">
                              <Trash2 className="h-3.5 w-3.5" />
                              Excluir selecionadas
                            </button>
                          </div>
                        </div>

                        {sortedSavedSearches.length === 0 ? (
                          <div className="rounded-[1.2rem] border border-dashed border-[var(--v2-line-strong)] px-4 py-8 text-center text-sm text-[var(--v2-ink-soft)]">
                            {activeNotebook.saved_searches && activeNotebook.saved_searches.length > 0
                              ? 'Nenhuma busca salva corresponde ao filtro atual.'
                              : 'Salve auditorias de pesquisa para reaplicar consultas, fixar referências e organizar tags.'}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {pinnedSavedSearches.length > 0 && (
                              <div className="space-y-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-accent-warm)]">Fixadas</p>
                                {pinnedSavedSearches.map((search) => renderSavedSearchCard(search))}
                              </div>
                            )}

                            {regularSavedSearches.length > 0 && (
                              <div className="space-y-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Demais buscas salvas</p>
                                {regularSavedSearches.map((search) => renderSavedSearchCard(search))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="v2-panel p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Pesquisa web e jurisprudência</p>
                          <h3 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Fontes geradas por busca</h3>
                        </div>
                        <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">{researchSources.length}</span>
                      </div>

                      <div className="mt-5 space-y-3">
                        {researchSources.length === 0 ? (
                          <div className="rounded-[1.2rem] border border-dashed border-[var(--v2-line-strong)] px-4 py-8 text-center text-sm text-[var(--v2-ink-soft)]">
                            Nenhuma fonte sintética de pesquisa foi anexada ainda.
                          </div>
                        ) : (
                          researchSources.slice(0, 6).map((source) => {
                            const sourceDef = SOURCE_TYPE_LABELS[source.type] || SOURCE_TYPE_LABELS.upload
                            const SourceIcon = sourceDef.icon
                            return (
                              <button key={source.id} type="button" onClick={() => { setSelectedSourceId(source.id); if (canOpenNotebookSourceViewer(source)) setViewerSource(source) }} className="flex w-full items-center gap-3 rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.84)] px-4 py-3 text-left hover:-translate-y-0.5">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(15,118,110,0.12)] text-[var(--v2-accent-strong)]">
                                  <SourceIcon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">{source.name}</p>
                                  <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">{sourceDef.label} · {formatDate(source.added_at)}</p>
                                </div>
                                <ArrowRight className="h-4 w-4 text-[var(--v2-ink-faint)]" />
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {activeSection === 'studio' && (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <section className="space-y-6">
                    <section className="v2-panel p-5 lg:p-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Studio briefing</p>
                          <h3 className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">Prepare e execute a geração no V2</h3>
                          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--v2-ink-soft)]">
                            Auditoria de contexto, instruções adicionais, taxonomia de artefatos, trilha multiagente, revisão de custo de vídeo, timeline persistida e produção literal agora vivem no workbench novo. O clássico fica preservado apenas como contingência assistida e trilha de comparação.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Link to={workbenchBridgePath} className="v2-btn-secondary">
                            Ver rotas clássicas
                          </Link>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                        <div>
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]" htmlFor="studio-v2-custom-prompt">
                            Instruções adicionais
                          </label>
                          <textarea
                            id="studio-v2-custom-prompt"
                            value={studioCustomPrompt}
                            onChange={(event) => setStudioCustomPrompt(event.target.value)}
                            placeholder="Ex.: destaque implicações práticas, mantenha linguagem executiva e organize por tese, prova e risco."
                            rows={5}
                            className="mt-3 w-full rounded-[1.3rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.88)] px-4 py-3 text-sm leading-6 text-[var(--v2-ink-strong)] outline-none transition focus:border-[var(--v2-accent-strong)] focus:ring-2 focus:ring-[rgba(15,118,110,0.12)]"
                          />
                          <p className="mt-2 text-xs text-[var(--v2-ink-soft)]">
                            Se você optar pela contingência clássica, o briefing adicional acompanha essa trilha em até {STUDIO_BRIDGE_PROMPT_LIMIT} caracteres.
                            {trimmedStudioCustomPrompt.length > STUDIO_BRIDGE_PROMPT_LIMIT ? ' O excedente permanece apenas nesta superfície para a execução principal no V2.' : ''}
                          </p>
                        </div>

                        <div className="rounded-[1.4rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.82)] p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Janela ativa do estúdio</p>
                          <div className="mt-4 space-y-2 text-sm text-[var(--v2-ink-soft)]">
                            <p>{studioAudit.sourceSummary.includedSources}/{studioAudit.sourceSummary.totalSources} fontes promovidas para a execução.</p>
                            <p>{studioAudit.conversationSummary.includedMessages}/{studioAudit.conversationSummary.totalMessages} mensagens recentes entram no contexto.</p>
                            <p>{formatCharVolume(studioAudit.totalContextChars)} previstos para a próxima rodada do pipeline.</p>
                            <p>{studioAudit.customInstructionsChars > 0 ? `${formatCharVolume(studioAudit.customInstructionsChars)} de briefing adicional pronto para reaproveitar.` : 'Sem briefing adicional preenchido nesta rodada.'}</p>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="v2-panel p-5 lg:p-6">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Contexto auditável</p>
                          <h3 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Janela de memória que seguirá para a geração</h3>
                        </div>
                        <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">
                          {formatCharVolume(studioAudit.totalContextChars)}
                        </span>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Fontes</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{studioAudit.sourceSummary.includedSources}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">{studioAudit.sourceSummary.truncatedSources > 0 ? `${studioAudit.sourceSummary.truncatedSources} truncadas na janela` : 'sem truncamentos relevantes'}</p>
                        </div>
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Conversa</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{studioAudit.conversationSummary.includedMessages}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">{studioAudit.conversationSummary.droppedMessages > 0 ? `${studioAudit.conversationSummary.droppedMessages} fora da janela` : 'histórico recente aproveitado'}</p>
                        </div>
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Briefing</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{studioAudit.customInstructionsChars > 0 ? 'ON' : 'OFF'}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">{studioAudit.customInstructionsChars > 0 ? formatCharVolume(studioAudit.customInstructionsChars) : 'sem instruções extras'}</p>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Fontes promovidas</p>
                          {includedStudioSources.length === 0 ? (
                            <p className="mt-3 rounded-[1.2rem] border border-dashed border-[rgba(217,119,6,0.28)] bg-[rgba(255,247,237,0.82)] px-4 py-4 text-sm leading-6 text-[var(--v2-accent-warm)]">
                              Nenhuma fonte textual entrou na janela do estúdio nesta rodada. O pipeline dependerá mais do tema do caderno, da conversa recente e do briefing adicional.
                            </p>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {includedStudioSources.slice(0, 5).map((entry) => (
                                <div key={entry.id} className="rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.84)] px-4 py-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">{entry.name}</p>
                                      <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">
                                        {SOURCE_TYPE_LABELS[entry.type]?.label || entry.type} · {formatCharVolume(entry.includedChars)}
                                      </p>
                                    </div>
                                    {entry.truncated && (
                                      <span className="rounded-full bg-[rgba(217,119,6,0.14)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--v2-accent-warm)]">
                                        truncada
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Regras da janela atual</p>
                          <div className="mt-3 space-y-2 rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.82)] px-4 py-4 text-sm leading-6 text-[var(--v2-ink-soft)]">
                            <p>Somente fontes com pelo menos {MIN_SOURCE_CHARS} caracteres entram automaticamente.</p>
                            <p>Cada fonte textual pode ocupar até {formatCharVolume(MAX_CONTEXT_TEXT_LENGTH)} por execução.</p>
                            <p>A conversa considera no máximo {MAX_STUDIO_CONTEXT_MESSAGES} mensagens recentes e até {formatCharVolume(MAX_STUDIO_CONTEXT_CHARS)}.</p>
                            <p>O briefing adicional segue integralmente apenas quando couber dentro do limite de ponte desta rodada.</p>
                          </div>
                        </div>
                      </div>
                    </section>

                    <div className="space-y-5">
                      {ARTIFACT_CATEGORIES.map((category) => {
                        const colors = STUDIO_CATEGORY_COLORS[category.color as keyof typeof STUDIO_CATEGORY_COLORS] || STUDIO_CATEGORY_COLORS.blue

                        return (
                          <section key={category.label} className="v2-panel p-5 lg:p-6">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{category.emoji}</span>
                              <div>
                                <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${colors.text}`}>{category.label}</p>
                                <h3 className="mt-1 text-lg font-semibold text-[var(--v2-ink-strong)]">Escolha o artefato que deseja iniciar</h3>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              {category.items.map((artifact) => {
                                const ArtifactIcon = artifact.icon
                                const runningTask = runningArtifactTasksByType.get(artifact.type)

                                return (
                                  <div
                                    key={artifact.type}
                                    className={`rounded-[1.3rem] border ${colors.border} bg-[rgba(255,255,255,0.84)] px-4 py-4`}
                                  >
                                    <div className="flex items-start gap-4">
                                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${colors.iconBg} ${colors.text}`}>
                                        {runningTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArtifactIcon className="h-4 w-4" />}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{artifact.label}</p>
                                          {runningTask && (
                                            <span className="rounded-full bg-[rgba(15,118,110,0.12)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--v2-accent-strong)]">
                                              Em execução
                                            </span>
                                          )}
                                        </div>
                                        <p className="mt-2 text-xs leading-6 text-[var(--v2-ink-soft)]">{artifact.description}</p>
                                        {runningTask && (
                                          <p className="mt-2 text-xs font-medium text-[var(--v2-accent-strong)]">{runningTask.phase}</p>
                                        )}
                                      </div>
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (runningTask) {
                                            setSelectedStudioTaskId(runningTask.id)
                                            setShowStudioProgressModal(true)
                                            return
                                          }
                                          void handleGenerateArtifact(artifact.type)
                                        }}
                                        className="v2-btn-secondary"
                                      >
                                        {runningTask ? <Eye className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                                        {runningTask ? 'Abrir trilha' : 'Gerar no V2'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => navigate(buildLegacyStudioPath(artifact.type))}
                                        className="v2-btn-secondary"
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                        Abrir no clássico
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </section>
                        )
                      })}
                    </div>
                  </section>

                  <aside className="space-y-6">
                    <section className="v2-panel p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Leitura do briefing</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Categorias</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{ARTIFACT_CATEGORIES.length}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">blocos de geração mapeados</p>
                        </div>
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Artefatos</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{ARTIFACT_CATEGORIES.reduce((total, category) => total + category.items.length, 0)}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">tipos iniciáveis a partir do V2</p>
                        </div>
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Fontes úteis</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{includedStudioSources.length}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">fontes já promovidas para o estúdio</p>
                        </div>
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Contingência</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{studioBridgePrompt.length}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">chars prontos para uma comparação clássica</p>
                        </div>
                      </div>
                    </section>

                    <section className="v2-panel p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">O que ainda fica fora</p>
                      <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--v2-ink-soft)]">
                        <p>A geração base, a revisão de custo do vídeo, o editor de timeline e a produção literal já rodam aqui no V2 com persistência no próprio caderno.</p>
                        <p>A superfície clássica continua útil para comparação funcional, validações cruzadas e contingência manual, sem carregar a operação principal do workbench novo.</p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Link to={workbenchBridgePath} className="v2-btn-secondary">Mapa de contingência</Link>
                          <button type="button" onClick={() => handleChangeSection('artifacts')} className="v2-btn-secondary">Revisar artefatos no V2</button>
                        </div>
                      </div>
                    </section>
                  </aside>
                </div>
              )}

              {activeSection === 'artifacts' && (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <section className="space-y-6">
                    <section className="v2-panel p-5 lg:p-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Inventário de artefatos</p>
                          <h3 className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">Viewer, estúdio e pós-geração agora vivem no V2</h3>
                          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--v2-ink-soft)]">
                            Abra resumos, relatórios, documentos, apresentações, roteiros, pacotes de vídeo persistidos e demais saídas do estúdio diretamente nesta superfície. O V2 agora também assume a revisão de custo, a timeline e a produção literal de vídeo.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Link to={workbenchBridgePath} className="v2-btn-secondary">
                            Ver rotas clássicas
                          </Link>
                        </div>
                      </div>
                    </section>

                    <section className="v2-panel p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Artefatos persistidos</p>
                          <h3 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Saídas salvas neste caderno</h3>
                        </div>
                        <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">
                          {activeNotebook.artifacts.length}
                        </span>
                      </div>

                      {activeNotebook.artifacts.length === 0 ? (
                        <div className="mt-5 rounded-[1.2rem] border border-dashed border-[var(--v2-line-strong)] px-4 py-10 text-center text-sm text-[var(--v2-ink-soft)]">
                          Ainda não existem artefatos gerados para este caderno. Use o estúdio V2 para criar a primeira saída e depois volte para revisar o inventário aqui.
                        </div>
                      ) : (
                        <div className="mt-5 space-y-3">
                          {[...activeNotebook.artifacts].reverse().map((artifact) => {
                            const artifactDef = ARTIFACT_TYPE_MAP.get(artifact.type)
                            const ArtifactIcon = artifactDef?.icon || FileText
                            const viewerReady = artifact.type !== 'video_production'
                            const savedStudio = isVideoStudioArtifact(artifact)
                            const openInStudio = artifact.type === 'video_production' || savedStudio
                            const canGenerateVideo = artifact.type === 'video_script' && !savedStudio
                            const canGenerateAudio = artifact.type === 'audio_script'
                            const canGenerateVisual = isVisualArtifactType(artifact.type)
                            const isGeneratingAudio = audioGenLoading && audioGeneratingArtifactId === artifact.id
                            const isGeneratingVisual = visualGenLoading && visualGeneratingArtifactId === artifact.id

                            return (
                              <div key={artifact.id} className="rounded-[1.3rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.84)] px-4 py-4">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                  <button type="button" onClick={() => handleOpenArtifact(artifact)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(217,119,6,0.12)] text-[var(--v2-accent-warm)]">
                                      <ArtifactIcon className="h-4 w-4" />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">{artifact.title}</p>
                                        <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--v2-ink-faint)]">
                                          {artifactDef?.label || artifact.type}
                                        </span>
                                        {savedStudio && (
                                          <span className="rounded-full bg-[rgba(15,118,110,0.12)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--v2-accent-strong)]">
                                            Estúdio salvo
                                          </span>
                                        )}
                                        {artifact.type === 'video_production' && (
                                          <span className="rounded-full bg-[rgba(217,119,6,0.14)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--v2-accent-warm)]">
                                            Timeline
                                          </span>
                                        )}
                                      </div>

                                      <p className="mt-2 text-xs text-[var(--v2-ink-soft)]">
                                        {formatDate(artifact.created_at)} · {artifact.format.toUpperCase()} · {formatCharVolume(artifact.content.length)}
                                      </p>
                                      <p className="mt-2 text-xs leading-6 text-[var(--v2-ink-soft)] line-clamp-2">
                                        {artifact.type === 'video_production'
                                          ? 'Abra o estúdio V2 para editar timeline, revisar mídia literal e salvar o pacote persistido.'
                                          : savedStudio
                                            ? 'Use o viewer V2 para inspeção textual rápida ou abra o estúdio V2 para continuar a produção de vídeo.'
                                            : 'Abra no viewer V2 para inspecionar conteúdo, exportações suportadas e exclusão controlada.'}
                                      </p>
                                    </div>
                                  </button>

                                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                    {canGenerateVideo && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setVideoGenSavedArtifact(artifact)
                                          setShowVideoGenCost(true)
                                        }}
                                        disabled={videoGenLoading}
                                        className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {videoGenLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                        {videoGenLoading ? 'Gerando vídeo...' : 'Gerar vídeo'}
                                      </button>
                                    )}
                                    {canGenerateAudio && (
                                      <button
                                        type="button"
                                        onClick={() => void handleGenerateAudioFromArtifact(artifact)}
                                        disabled={isGeneratingAudio}
                                        className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {isGeneratingAudio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                                        {isGeneratingAudio ? 'Gerando áudio...' : 'Gerar áudio'}
                                      </button>
                                    )}
                                    {canGenerateVisual && (
                                      <button
                                        type="button"
                                        onClick={() => void handleGenerateVisualArtifact(artifact)}
                                        disabled={isGeneratingVisual}
                                        className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {isGeneratingVisual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                                        {isGeneratingVisual
                                          ? 'Gerando visual...'
                                          : artifact.type === 'apresentacao'
                                            ? 'Gerar slides'
                                            : 'Gerar imagem'}
                                      </button>
                                    )}
                                    {viewerReady && (
                                      <button type="button" onClick={() => handleOpenArtifact(artifact)} className="v2-btn-secondary">
                                        <Eye className="h-4 w-4" />
                                        Visualizar
                                      </button>
                                    )}
                                    {openInStudio && (
                                      <button type="button" onClick={() => openVideoStudioArtifact(artifact)} className="v2-btn-secondary">
                                        <Wand2 className="h-4 w-4" />
                                        Abrir estúdio
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </section>
                  </section>

                  <aside className="space-y-6">
                    <section className="v2-panel p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Leitura do inventário</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Total</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{activeNotebook.artifacts.length}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">artefato(s) persistido(s)</p>
                        </div>
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Estruturados</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{structuredArtifactCount}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">JSON com viewer rico</p>
                        </div>
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Mídia</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{mediaArtifactCount}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">áudio, vídeo e pacotes</p>
                        </div>
                        <div className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">Dependência legada</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{legacyOnlyArtifactCount}</p>
                          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">item(ns) ainda dependentes do legado</p>
                        </div>
                      </div>
                    </section>

                    <section className="v2-panel p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">O que ainda fica fora</p>
                      <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--v2-ink-soft)]">
                        <p>O inventário, o viewer, a revisão de custo do vídeo, os pacotes persistidos, o editor de timeline e a produção literal já rodam no V2 com TaskManager e persistência local do notebook.</p>
                        <p>O legado fica disponível apenas como trilha comparativa e contingência manual, não mais como dependência operacional dos fluxos principais de mídia no workbench novo.</p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Link to={workbenchStudioPath} className="v2-btn-secondary">Abrir estúdio V2</Link>
                          <Link to={workbenchBridgePath} className="v2-btn-secondary">Mapa de contingência</Link>
                        </div>
                      </div>
                    </section>
                  </aside>
                </div>
              )}

              {activeSection === 'bridge' && (
                <div className="space-y-6">
                  <section className="v2-panel p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Contingência operacional</p>
                        <h3 className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">Comparação e contingência clássica</h3>
                        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--v2-ink-soft)]">
                          O redesign já assume seleção persistente, deck executivo, chat contextual, pesquisas auditáveis, governança principal de buscas salvas, análise inteligente de acervo, viewer avançado de fontes, briefing do estúdio, geração base de artefatos, inventário persistido, revisão de custo de vídeo, editor de timeline e produção literal. O fluxo legado continua disponível para comparação, validação cruzada e contingência manual, sem carregar a regra de negócio principal.
                        </p>
                      </div>
                      <Link to={buildResearchNotebookClassicPath({ notebookId: activeNotebook.id, preserveSearch: location.search })} className="v2-btn-primary">Abrir notebook clássico completo</Link>
                    </div>
                  </section>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {[
                      { label: 'Chat clássico de contingência', description: 'Acesse a versão legada do chat apenas se precisar comparar comportamento ou validar algum detalhe fora do shell novo.', tab: 'chat' as const, icon: MessageSquareText },
                      { label: 'Estúdio clássico de contingência', description: 'Use o notebook clássico para comparação funcional, validação cruzada ou contingência manual.', tab: 'studio' as const, icon: Sparkles },
                      { label: 'Artefatos clássicos de contingência', description: 'Mantenha a versão legada por perto para verificar regressões ou abrir fluxos históricos já persistidos.', tab: 'artifacts' as const, icon: FileText },
                    ].map((item) => (
                      <Link key={item.tab} to={buildResearchNotebookClassicPath({ notebookId: activeNotebook.id, tab: item.tab, preserveSearch: location.search })} className="v2-panel flex h-full flex-col gap-4 px-5 py-5 hover:-translate-y-0.5">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(15,118,110,0.12)] text-[var(--v2-accent-strong)]">
                          <item.icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{item.label}</p>
                          <p className="mt-2 text-sm leading-6 text-[var(--v2-ink-soft)]">{item.description}</p>
                        </div>
                        <div className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-[var(--v2-accent-strong)]">
                          Abrir agora
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <DeepResearchModal
        isOpen={researchModalOpen}
        onClose={() => {
          if (!researchModalCanClose) {
            researchAbortRef.current?.abort()
            return
          }
          setResearchModalOpen(false)
        }}
        title={researchModalTitle}
        subtitle={researchModalSubtitle}
        variant={researchModalVariant}
        steps={researchModalSteps}
        stats={researchModalStats}
        canClose={researchModalCanClose || isAnyResearchLoading}
      />

      <JurisprudenceConfigModal
        isOpen={jurisprudenceConfigOpen}
        query={externalSearchQuery}
        initialSelectedAliases={lastJurisprudenceTribunalAliases}
        initialConfig={jurisprudenceConfigPreset}
        onSearch={(config) => { void handleJurisprudenceSearch(config) }}
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
            void searchResultsCallback(selected)
          }
        }}
        onClose={() => {
          setSearchResultsModalOpen(false)
          setSearchResultsCallback(null)
        }}
      />

      <Suspense fallback={null}>
        {showAcervoProgressModal && (
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
        )}
        {showStudioProgressModal && selectedStudioTask && (
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
        )}
        {viewingArtifact && (
          <ArtifactViewerModal
            artifact={viewingArtifact}
            onClose={() => setViewingArtifact(null)}
            onDelete={() => {
              void handleDeleteArtifact(viewingArtifact.id)
            }}
            onDownload={() => handleDownloadArtifact(viewingArtifact)}
            onGenerateVideo={viewingArtifact.type === 'video_script' && !isVideoStudioArtifact(viewingArtifact)
              ? () => {
                  if (videoGenLoading) return
                  setVideoGenSavedArtifact(viewingArtifact)
                  setShowVideoGenCost(true)
                  setViewingArtifact(null)
                }
              : undefined}
            onGenerateAudio={viewingArtifact.type === 'audio_script'
              ? () => {
                  if (audioGenLoading && audioGeneratingArtifactId === viewingArtifact.id) return
                  void handleGenerateAudioFromArtifact(viewingArtifact)
                }
              : undefined}
            onGenerateImage={isVisualArtifactType(viewingArtifact.type)
              ? () => {
                  if (visualGenLoading && visualGeneratingArtifactId === viewingArtifact.id) return
                  void handleGenerateVisualArtifact(viewingArtifact)
                }
              : undefined}
            onOpenStudio={isVideoStudioArtifact(viewingArtifact)
              ? () => {
                  openVideoStudioArtifact(viewingArtifact)
                }
              : undefined}
          />
        )}
        {showVideoGenCost && videoGenSavedArtifact && (
          <VideoGenerationCostModal
            scriptContent={videoGenSavedArtifact.content}
            topic={activeNotebook?.topic || 'Vídeo'}
            onGenerate={(editedContent) => {
              void handleGenerateVideo(editedContent)
            }}
            onSkip={handleSkipVideoGeneration}
            isGenerating={videoGenLoading}
            generationProgress={videoGenProgress || undefined}
            lastCheckpoint={videoGenLastCheckpoint || undefined}
          />
        )}
        {videoProduction && (
          <VideoStudioEditor
            production={videoProduction}
            onClose={() => setVideoProduction(null)}
            onSave={async (production) => {
              await handleSaveVideoStudioToNotebook(production)
            }}
            onGenerateLiteralMedia={(production) => {
              void handleRunLiteralVideoStudioProduction(production)
            }}
            onGenerateClipVideo={async (currentProduction, sceneNumber, clipNumber) => {
              try {
                if (!userId || !activeNotebook?.id) return null

                const apiKey = videoStudioApiKey || await getOpenRouterKey()
                if (!apiKey) {
                  toast.error('Chave da API não configurada.')
                  return null
                }

                const { generateLiteralVideoClipAsset } = await loadLiteralVideoRuntime()
                const result = await generateLiteralVideoClipAsset(apiKey, currentProduction, sceneNumber, clipNumber)
                const persisted = await handleSaveVideoStudioToNotebook(result.production, { silent: true, syncEditorState: false })

                await appendNotebookExecutions(activeNotebook.id, 'video_pipeline', [result.execution])
                setVideoProduction(normalizeVideoProductionPackage(persisted))

                if (viewingArtifact?.type === 'video_script') {
                  const freshNotebook = await getFreshNotebookOrThrow(activeNotebook.id)
                  const refreshed = freshNotebook.artifacts.find((artifact) => artifact.title === `Estúdio de Vídeo: ${persisted.title}`)
                  if (refreshed) setViewingArtifact(refreshed)
                }

                toast.success(`Vídeo da cena ${sceneNumber}, clip ${clipNumber} gerado com sucesso!`)
                return normalizeVideoProductionPackage(persisted)
              } catch (error) {
                console.error('Clip video regeneration error:', error)
                const message = error instanceof Error ? error.message : String(error)
                toast.error(`Erro ao gerar vídeo da cena ${sceneNumber}, clip ${clipNumber}`, message)
                return null
              }
            }}
            isLiteralGenerating={videoStudioLiteralLoading}
            literalProgress={videoStudioLiteralProgress || undefined}
            onRegenerateImage={async (sceneNumber) => {
              try {
                if (!videoProduction) return null

                const apiKey = videoStudioApiKey || await getOpenRouterKey()
                if (!apiKey) {
                  toast.error('Chave da API não configurada.')
                  return null
                }

                const scene = videoProduction.scenes.find((item) => item.number === sceneNumber)
                if (!scene?.imagePrompt) {
                  toast.error('Cena sem prompt de imagem.')
                  return null
                }

                const models = await loadVideoPipelineModels()
                const { generateImageViaOpenRouter } = await loadImageGenerationRuntime()
                const result = await generateImageViaOpenRouter({
                  apiKey,
                  prompt: scene.imagePrompt,
                  model: models.video_image_generator || undefined,
                  aspectRatio: '16:9',
                })
                toast.success(`Imagem da cena ${sceneNumber} gerada!`)
                return result.imageDataUrl
              } catch (error) {
                console.error('Image regeneration error:', error)
                const h = humanizeError(error)
                toast.error(`Erro ao gerar imagem da cena ${sceneNumber}`, h.detail || h.title)
                return null
              }
            }}
            onRegenerateTTS={async (sceneNumber) => {
              try {
                if (!videoProduction) return null

                const apiKey = videoStudioApiKey || await getOpenRouterKey()
                if (!apiKey) {
                  toast.error('Chave da API não configurada.')
                  return null
                }

                const narration = videoProduction.narration.find((segment) => segment.sceneNumber === sceneNumber)
                if (!narration?.text) {
                  toast.error('Cena sem texto de narração.')
                  return null
                }

                const cleanText = narration.text.replace(/\*([^*]+)\*/g, '$1').replace(/\[pausa?\]/gi, '...').trim()
                const models = await loadVideoPipelineModels()
                const [{ generateTTSViaOpenRouter, DEFAULT_OPENROUTER_TTS_MODEL }, { blobToDataUrl }] = await Promise.all([
                  loadTtsRuntime(),
                  loadImageGenerationRuntime(),
                ])
                const result = await generateTTSViaOpenRouter({
                  apiKey,
                  text: cleanText,
                  model: models.video_tts || DEFAULT_OPENROUTER_TTS_MODEL,
                  voice: 'nova',
                })
                const audioDataUrl = await blobToDataUrl(result.audioBlob)
                toast.success(`Narração da cena ${sceneNumber} gerada!`)
                return audioDataUrl
              } catch (error) {
                console.error('TTS regeneration error:', error)
                const h = humanizeError(error)
                toast.error(`Erro ao gerar narração da cena ${sceneNumber}`, h.detail || h.title)
                return null
              }
            }}
          />
        )}
        <SourceContentViewer source={viewerSource} onClose={() => setViewerSource(null)} />
      </Suspense>
    </div>
  )
}
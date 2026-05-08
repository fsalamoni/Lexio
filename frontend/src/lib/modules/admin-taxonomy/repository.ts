import { CLASSIFICATION_TIPOS, DEFAULT_AREA_ASSUNTOS } from '../../classification-data'
import { DEFAULT_DOC_STRUCTURES } from '../../document-structures'
import type {
  AdminClassificationTipos,
  AdminDocumentType,
  AdminLegalArea,
  ProfileData,
  UserSettingsData,
  WizardField,
} from '../../firestore-types'

export type TaxonomyDocumentType = {
  id: string
  name: string
  description: string
  templates: string[]
}

export type TaxonomyLegalArea = {
  id: string
  name: string
  description: string
}

export type AdminTaxonomyRepositoryDependencies = {
  isFirebase: boolean
  getCurrentUserId: () => string | null
  ensureUserSettingsMigrated: (uid: string) => Promise<UserSettingsData>
  saveUserSettings: (uid: string, data: Partial<UserSettingsData>) => Promise<void>
}

const DOCUMENT_TYPES = [
  { id: 'parecer', name: 'Parecer Jurídico', description: 'Opinião técnico-jurídica fundamentada sobre questão de direito', templates: ['mprs_caopp', 'generic'] },
  { id: 'peticao_inicial', name: 'Petição Inicial', description: 'Peça inaugural de ação judicial', templates: ['generic'] },
  { id: 'contestacao', name: 'Contestação', description: 'Resposta do réu à petição inicial', templates: ['generic'] },
  { id: 'recurso', name: 'Recurso', description: 'Peça recursal para reforma de decisão judicial', templates: ['generic'] },
  { id: 'acao_civil_publica', name: 'Ação Civil Pública', description: 'Ação para tutela de direitos difusos e coletivos', templates: ['generic'] },
  { id: 'sentenca', name: 'Sentença', description: 'Decisão judicial que resolve o mérito da causa', templates: ['generic'] },
  { id: 'mandado_seguranca', name: 'Mandado de Segurança', description: 'Remédio constitucional contra ato ilegal de autoridade pública', templates: ['generic'] },
  { id: 'habeas_corpus', name: 'Habeas Corpus', description: 'Remédio constitucional contra violação da liberdade de locomoção', templates: ['generic'] },
  { id: 'agravo', name: 'Agravo de Instrumento', description: 'Recurso contra decisões interlocutórias', templates: ['generic'] },
  { id: 'embargos_declaracao', name: 'Embargos de Declaração', description: 'Recurso para sanar omissão, contradição ou obscuridade', templates: ['generic'] },
]

const LEGAL_AREAS = [
  { id: 'administrative', name: 'Direito Administrativo', description: 'Licitações, contratos administrativos, improbidade, servidores públicos' },
  { id: 'constitutional', name: 'Direito Constitucional', description: 'Direitos fundamentais, controle de constitucionalidade, organização do Estado' },
  { id: 'civil', name: 'Direito Civil', description: 'Obrigações, contratos, responsabilidade civil, direitos reais, família e sucessões' },
  { id: 'tax', name: 'Direito Tributário', description: 'Tributos, contribuições, isenções, planejamento tributário' },
  { id: 'labor', name: 'Direito do Trabalho', description: 'Relações de trabalho, CLT, direitos trabalhistas, previdência' },
  { id: 'criminal', name: 'Direito Penal', description: 'Crimes, penas, execução penal, legislação penal especial' },
  { id: 'criminal_procedure', name: 'Processo Penal', description: 'Inquérito, ação penal, provas, recursos criminais, execução penal' },
  { id: 'civil_procedure', name: 'Processo Civil', description: 'Procedimentos, recursos, execução, tutelas provisórias, CPC/2015' },
  { id: 'consumer', name: 'Direito do Consumidor', description: 'Relações de consumo, CDC, responsabilidade do fornecedor, práticas abusivas' },
  { id: 'environmental', name: 'Direito Ambiental', description: 'Proteção ambiental, licenciamento, crimes ambientais, responsabilidade ambiental' },
  { id: 'business', name: 'Direito Empresarial', description: 'Sociedades, contratos mercantis, recuperação judicial, falência, propriedade intelectual' },
  { id: 'family', name: 'Direito de Família', description: 'Casamento, divórcio, guarda, alimentos, adoção, união estável' },
  { id: 'inheritance', name: 'Direito das Sucessões', description: 'Herança, testamento, inventário, partilha, sucessão legítima e testamentária' },
  { id: 'social_security', name: 'Direito Previdenciário', description: 'Aposentadoria, benefícios do INSS, auxílios, pensão por morte, BPC/LOAS' },
  { id: 'electoral', name: 'Direito Eleitoral', description: 'Eleições, partidos políticos, propaganda eleitoral, prestação de contas' },
  { id: 'international', name: 'Direito Internacional', description: 'Tratados, direito internacional público e privado, extradição, cooperação jurídica' },
  { id: 'digital', name: 'Direito Digital', description: 'LGPD, Marco Civil, crimes cibernéticos, proteção de dados, e-commerce' },
]

const DEFAULT_DOCUMENT_TYPE_MAP = new Map(DOCUMENT_TYPES.map(item => [item.id, item] as const))
const DEFAULT_LEGAL_AREA_MAP = new Map(LEGAL_AREAS.map(item => [item.id, item] as const))

function getDefaultAdminDocumentTypes(): AdminDocumentType[] {
  return DOCUMENT_TYPES.map(dt => ({ ...dt, is_enabled: true }))
}

function getDefaultAdminLegalAreas(): AdminLegalArea[] {
  return LEGAL_AREAS.map(la => ({ ...la, is_enabled: true }))
}

function sanitizeStringArray(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  return items.flatMap((item): string[] => {
    if (typeof item !== 'string') return []
    const normalized = item.trim()
    return normalized ? [normalized] : []
  })
}

export function sanitizeAdminDocumentTypes(items: unknown): AdminDocumentType[] {
  if (!Array.isArray(items)) return []

  return items.flatMap((item): AdminDocumentType[] => {
    if (!item || typeof item !== 'object') return []

    const source = item as Partial<AdminDocumentType>
    const id = typeof source.id === 'string' ? source.id.trim() : ''
    if (!id) return []

    const defaults = DEFAULT_DOCUMENT_TYPE_MAP.get(id)
    const name = typeof source.name === 'string' && source.name.trim()
      ? source.name.trim()
      : defaults?.name
    if (!name) return []

    const description = typeof source.description === 'string'
      ? source.description.trim()
      : (defaults?.description ?? '')
    const templates = sanitizeStringArray(source.templates)
    const structure = typeof source.structure === 'string' ? source.structure : undefined

    return [{
      id,
      name,
      description,
      templates: templates.length > 0 ? templates : (defaults?.templates ?? ['generic']),
      is_enabled: source.is_enabled !== false,
      ...(structure ? { structure } : {}),
    }]
  })
}

export function sanitizeAdminLegalAreas(items: unknown): AdminLegalArea[] {
  if (!Array.isArray(items)) return []

  return items.flatMap((item): AdminLegalArea[] => {
    if (!item || typeof item !== 'object') return []

    const source = item as Partial<AdminLegalArea>
    const id = typeof source.id === 'string' ? source.id.trim() : ''
    if (!id) return []

    const defaults = DEFAULT_LEGAL_AREA_MAP.get(id)
    const name = typeof source.name === 'string' && source.name.trim()
      ? source.name.trim()
      : defaults?.name
    if (!name) return []

    const description = typeof source.description === 'string'
      ? source.description.trim()
      : (defaults?.description ?? '')
    const assuntos = sanitizeStringArray(source.assuntos)

    return [{
      id,
      name,
      description,
      is_enabled: source.is_enabled !== false,
      ...(assuntos.length ? { assuntos } : {}),
    }]
  })
}

function mergeDefaultStructures(items: AdminDocumentType[]): AdminDocumentType[] {
  return sanitizeAdminDocumentTypes(items).map(item => {
    if (!item.structure?.trim() && DEFAULT_DOC_STRUCTURES[item.id]) {
      return { ...item, structure: DEFAULT_DOC_STRUCTURES[item.id] }
    }
    return item
  })
}

function mergeDefaultAssuntos(items: AdminLegalArea[]): AdminLegalArea[] {
  return sanitizeAdminLegalAreas(items).map(item => {
    if (!item.assuntos?.length && DEFAULT_AREA_ASSUNTOS[item.id]) {
      return { ...item, assuntos: DEFAULT_AREA_ASSUNTOS[item.id] }
    }
    return item
  })
}

const POSITION_DOCTYPE_MAP: Record<string, string[]> = {
  juiz: ['sentenca', 'embargos_declaracao'],
  juiza: ['sentenca', 'embargos_declaracao'],
  magistrado: ['sentenca', 'embargos_declaracao'],
  magistrada: ['sentenca', 'embargos_declaracao'],
  desembargador: ['sentenca', 'embargos_declaracao', 'recurso'],
  desembargadora: ['sentenca', 'embargos_declaracao', 'recurso'],
  promotor: ['parecer', 'acao_civil_publica', 'recurso', 'mandado_seguranca', 'habeas_corpus', 'agravo', 'embargos_declaracao'],
  promotora: ['parecer', 'acao_civil_publica', 'recurso', 'mandado_seguranca', 'habeas_corpus', 'agravo', 'embargos_declaracao'],
  procurador: ['parecer', 'acao_civil_publica', 'recurso', 'mandado_seguranca', 'contestacao', 'agravo', 'embargos_declaracao'],
  procuradora: ['parecer', 'acao_civil_publica', 'recurso', 'mandado_seguranca', 'contestacao', 'agravo', 'embargos_declaracao'],
  assessor: ['parecer', 'acao_civil_publica', 'recurso', 'mandado_seguranca', 'habeas_corpus', 'agravo', 'embargos_declaracao'],
  assessora: ['parecer', 'acao_civil_publica', 'recurso', 'mandado_seguranca', 'habeas_corpus', 'agravo', 'embargos_declaracao'],
  defensor: ['peticao_inicial', 'contestacao', 'recurso', 'habeas_corpus', 'mandado_seguranca', 'agravo', 'embargos_declaracao'],
  defensora: ['peticao_inicial', 'contestacao', 'recurso', 'habeas_corpus', 'mandado_seguranca', 'agravo', 'embargos_declaracao'],
  advogado: ['peticao_inicial', 'contestacao', 'recurso', 'acao_civil_publica', 'mandado_seguranca', 'habeas_corpus', 'agravo', 'embargos_declaracao'],
  advogada: ['peticao_inicial', 'contestacao', 'recurso', 'acao_civil_publica', 'mandado_seguranca', 'habeas_corpus', 'agravo', 'embargos_declaracao'],
}

const REQUEST_FIELDS: Record<string, WizardField[]> = {
  parecer: [
    { key: 'consulente', label: 'Consulente', type: 'text', placeholder: 'Quem solicitou o parecer' },
    { key: 'objeto', label: 'Objeto da consulta', type: 'textarea', placeholder: 'Descreva o objeto da consulta', required: true },
    { key: 'fatos', label: 'Fatos relevantes', type: 'textarea', placeholder: 'Relate os fatos pertinentes' },
    { key: 'legislacao', label: 'Legislação aplicável', type: 'text', placeholder: 'Leis, decretos, normas...' },
  ],
  peticao_inicial: [
    { key: 'autor', label: 'Autor', type: 'text', placeholder: 'Nome do(a) autor(a)', required: true },
    { key: 'reu', label: 'Réu', type: 'text', placeholder: 'Nome do(a) réu(ré)', required: true },
    { key: 'fatos', label: 'Fatos', type: 'textarea', placeholder: 'Narração dos fatos', required: true },
    { key: 'fundamentos', label: 'Fundamentos jurídicos', type: 'textarea', placeholder: 'Base legal e jurisprudencial' },
    { key: 'pedidos', label: 'Pedidos', type: 'textarea', placeholder: 'O que se pede ao juízo' },
    { key: 'valor_causa', label: 'Valor da causa', type: 'text', placeholder: 'R$ 0,00' },
  ],
  contestacao: [
    { key: 'autor', label: 'Autor', type: 'text', placeholder: 'Nome do(a) autor(a)' },
    { key: 'reu', label: 'Réu (cliente)', type: 'text', placeholder: 'Nome do(a) réu(ré)', required: true },
    { key: 'fatos_contestados', label: 'Fatos a contestar', type: 'textarea', placeholder: 'Pontos da inicial a serem contestados', required: true },
    { key: 'preliminares', label: 'Preliminares', type: 'textarea', placeholder: 'Matérias preliminares (se houver)' },
    { key: 'merito', label: 'Mérito da defesa', type: 'textarea', placeholder: 'Argumentos de mérito' },
  ],
  recurso: [
    { key: 'recorrente', label: 'Recorrente', type: 'text', placeholder: 'Nome do recorrente', required: true },
    { key: 'recorrido', label: 'Recorrido', type: 'text', placeholder: 'Nome do recorrido' },
    { key: 'decisao_recorrida', label: 'Decisão recorrida', type: 'textarea', placeholder: 'Resuma a decisão que se pretende reformar', required: true },
    { key: 'razoes', label: 'Razões do recurso', type: 'textarea', placeholder: 'Fundamentos para reforma' },
    { key: 'pedido', label: 'Pedido recursal', type: 'textarea', placeholder: 'O que se espera do tribunal' },
  ],
  acao_civil_publica: [
    { key: 'legitimado', label: 'Legitimado ativo', type: 'text', placeholder: 'MP, Defensoria, associação...' },
    { key: 'reu', label: 'Réu', type: 'text', placeholder: 'Nome do réu', required: true },
    { key: 'direito_tutelado', label: 'Direito tutelado', type: 'select', options: [
      { value: 'meio_ambiente', label: 'Meio Ambiente' },
      { value: 'consumidor', label: 'Direito do Consumidor' },
      { value: 'patrimonio_publico', label: 'Patrimônio Público' },
      { value: 'ordem_urbanistica', label: 'Ordem Urbanística' },
      { value: 'outro', label: 'Outro' },
    ]},
    { key: 'fatos', label: 'Fatos', type: 'textarea', placeholder: 'Descrição da lesão ao direito coletivo', required: true },
    { key: 'pedidos', label: 'Pedidos', type: 'textarea', placeholder: 'Obrigações de fazer/não fazer, indenização...' },
  ],
  sentenca: [
    { key: 'autor', label: 'Autor', type: 'text', placeholder: 'Nome do(a) autor(a)' },
    { key: 'reu', label: 'Réu', type: 'text', placeholder: 'Nome do(a) réu(ré)' },
    { key: 'tipo_acao', label: 'Tipo de ação', type: 'text', placeholder: 'Ex: Ação de indenização' },
    { key: 'resumo_fatos', label: 'Resumo dos fatos', type: 'textarea', placeholder: 'Síntese fática para fundamentação', required: true },
    { key: 'dispositivo', label: 'Dispositivo pretendido', type: 'select', options: [
      { value: 'procedente', label: 'Procedente' },
      { value: 'improcedente', label: 'Improcedente' },
      { value: 'parcialmente_procedente', label: 'Parcialmente procedente' },
    ]},
  ],
  mandado_seguranca: [
    { key: 'impetrante', label: 'Impetrante', type: 'text', placeholder: 'Nome do impetrante', required: true },
    { key: 'autoridade_coatora', label: 'Autoridade coatora', type: 'text', placeholder: 'Autoridade que praticou o ato', required: true },
    { key: 'ato_impugnado', label: 'Ato impugnado', type: 'textarea', placeholder: 'Descreva o ato ilegal ou abusivo', required: true },
    { key: 'direito_liquido_certo', label: 'Direito líquido e certo', type: 'textarea', placeholder: 'Fundamente o direito líquido e certo violado' },
    { key: 'pedido_liminar', label: 'Pedido liminar', type: 'boolean', default: true },
  ],
  habeas_corpus: [
    { key: 'paciente', label: 'Paciente', type: 'text', placeholder: 'Nome do paciente (pessoa presa/ameaçada)', required: true },
    { key: 'autoridade_coatora', label: 'Autoridade coatora', type: 'text', placeholder: 'Juiz, delegado ou autoridade responsável', required: true },
    { key: 'tipo_constrangimento', label: 'Tipo de constrangimento', type: 'select', options: [
      { value: 'prisao_ilegal', label: 'Prisão ilegal' },
      { value: 'excesso_prazo', label: 'Excesso de prazo' },
      { value: 'falta_fundamentacao', label: 'Falta de fundamentação' },
      { value: 'constrangimento_iminente', label: 'Constrangimento iminente' },
      { value: 'outro', label: 'Outro' },
    ]},
    { key: 'fatos', label: 'Fatos', type: 'textarea', placeholder: 'Descreva a situação de constrangimento ilegal', required: true },
    { key: 'pedido_liminar', label: 'Pedido liminar', type: 'boolean', default: true },
  ],
  agravo: [
    { key: 'agravante', label: 'Agravante', type: 'text', placeholder: 'Nome do agravante', required: true },
    { key: 'agravado', label: 'Agravado', type: 'text', placeholder: 'Nome do agravado' },
    { key: 'decisao_agravada', label: 'Decisão agravada', type: 'textarea', placeholder: 'Resuma a decisão interlocutória impugnada', required: true },
    { key: 'razoes', label: 'Razões do agravo', type: 'textarea', placeholder: 'Fundamentos para reforma da decisão' },
    { key: 'pedido_efeito_suspensivo', label: 'Pedido de efeito suspensivo', type: 'boolean', default: false },
  ],
  embargos_declaracao: [
    { key: 'embargante', label: 'Embargante', type: 'text', placeholder: 'Nome do embargante', required: true },
    { key: 'vicio', label: 'Vício apontado', type: 'select', options: [
      { value: 'omissao', label: 'Omissão' },
      { value: 'contradicao', label: 'Contradição' },
      { value: 'obscuridade', label: 'Obscuridade' },
      { value: 'erro_material', label: 'Erro material' },
    ], required: true },
    { key: 'ponto_omisso', label: 'Ponto omisso/contraditório/obscuro', type: 'textarea', placeholder: 'Descreva o vício na decisão', required: true },
    { key: 'efeitos_infringentes', label: 'Efeitos infringentes (modificativos)', type: 'boolean', default: false },
  ],
}

export function createAdminTaxonomyRepository(deps: AdminTaxonomyRepositoryDependencies) {
  function getDocumentTypes() {
    return DOCUMENT_TYPES
  }

  function getLegalAreas() {
    return LEGAL_AREAS
  }

  async function loadAdminDocumentTypes(): Promise<AdminDocumentType[]> {
    if (!deps.isFirebase) return mergeDefaultStructures(getDefaultAdminDocumentTypes())
    try {
      const resolvedUid = deps.getCurrentUserId()
      if (resolvedUid) {
        const userSettings = await deps.ensureUserSettingsMigrated(resolvedUid)
        if (Array.isArray(userSettings.document_types) && userSettings.document_types.length > 0) {
          return mergeDefaultStructures(userSettings.document_types)
        }
      }
    } catch { /* fallback to defaults */ }
    return mergeDefaultStructures(getDefaultAdminDocumentTypes())
  }

  async function saveAdminDocumentTypes(items: AdminDocumentType[]): Promise<void> {
    const resolvedUid = deps.getCurrentUserId()
    if (deps.isFirebase && resolvedUid) {
      await deps.saveUserSettings(resolvedUid, { document_types: sanitizeAdminDocumentTypes(items) })
      return
    }
    throw new Error('Usuário não autenticado.')
  }

  async function loadAdminLegalAreas(): Promise<AdminLegalArea[]> {
    if (!deps.isFirebase) return mergeDefaultAssuntos(getDefaultAdminLegalAreas())
    try {
      const resolvedUid = deps.getCurrentUserId()
      if (resolvedUid) {
        const userSettings = await deps.ensureUserSettingsMigrated(resolvedUid)
        if (Array.isArray(userSettings.legal_areas) && userSettings.legal_areas.length > 0) {
          return mergeDefaultAssuntos(userSettings.legal_areas)
        }
      }
    } catch { /* fallback to defaults */ }
    return mergeDefaultAssuntos(getDefaultAdminLegalAreas())
  }

  async function saveAdminLegalAreas(items: AdminLegalArea[]): Promise<void> {
    const resolvedUid = deps.getCurrentUserId()
    if (deps.isFirebase && resolvedUid) {
      await deps.saveUserSettings(resolvedUid, { legal_areas: sanitizeAdminLegalAreas(items) })
      return
    }
    throw new Error('Usuário não autenticado.')
  }

  async function loadAdminClassificationTipos(): Promise<AdminClassificationTipos> {
    const defaultTipos = CLASSIFICATION_TIPOS as Record<string, Record<string, string[]>>
    if (!deps.isFirebase) return { tipos: defaultTipos }
    try {
      const resolvedUid = deps.getCurrentUserId()
      if (resolvedUid) {
        const userSettings = await deps.ensureUserSettingsMigrated(resolvedUid)
        if (userSettings.classification_tipos && typeof userSettings.classification_tipos === 'object') {
          return { tipos: userSettings.classification_tipos }
        }
      }
    } catch { /* fallback to defaults */ }
    return { tipos: defaultTipos }
  }

  async function saveAdminClassificationTipos(tipos: Record<string, Record<string, string[]>>): Promise<void> {
    const resolvedUid = deps.getCurrentUserId()
    if (deps.isFirebase && resolvedUid) {
      await deps.saveUserSettings(resolvedUid, { classification_tipos: tipos })
      return
    }
    throw new Error('Usuário não autenticado.')
  }

  function getDocumentTypesForProfile<T extends TaxonomyDocumentType>(profile: ProfileData | null, source: T[] = DOCUMENT_TYPES as T[]): T[] {
    if (!profile?.position) return source

    const posLower = profile.position.toLowerCase()
    const sortedEntries = Object.entries(POSITION_DOCTYPE_MAP)
      .sort(([a], [b]) => b.length - a.length)

    for (const [keyword, allowedIds] of sortedEntries) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i')
      if (regex.test(posLower)) {
        const filtered = source.filter(docType => allowedIds.includes(docType.id))
        return filtered.length > 0 ? filtered : source
      }
    }
    return source
  }

  function getLegalAreasForProfile<T extends TaxonomyLegalArea>(profile: ProfileData | null, source: T[] = LEGAL_AREAS as T[]): T[] {
    if (!profile?.primary_areas || profile.primary_areas.length === 0) return source
    const primarySet = new Set(profile.primary_areas)
    const primary = source.filter(area => primarySet.has(area.id))
    const others = source.filter(area => !primarySet.has(area.id))
    return [...primary, ...others]
  }

  function getRequestFields(documentTypeId: string): { fields: WizardField[] } {
    return { fields: REQUEST_FIELDS[documentTypeId] ?? [] }
  }

  return {
    getDocumentTypes,
    getLegalAreas,
    sanitizeAdminDocumentTypes,
    sanitizeAdminLegalAreas,
    loadAdminDocumentTypes,
    saveAdminDocumentTypes,
    loadAdminLegalAreas,
    saveAdminLegalAreas,
    loadAdminClassificationTipos,
    saveAdminClassificationTipos,
    getDocumentTypesForProfile,
    getLegalAreasForProfile,
    getRequestFields,
  }
}
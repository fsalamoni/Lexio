export interface ProfileData {
  institution?: string
  position?: string
  jurisdiction?: string
  experience_years?: number | null
  primary_areas?: string[]
  specializations?: string[]
  formality_level?: string
  connective_style?: string
  citation_style?: string
  preferred_expressions?: string[]
  avoided_expressions?: string[]
  paragraph_length?: string
  default_document_type?: string
  default_template?: string
  signature_block?: string
  header_text?: string
  preferred_model?: string
  detail_level?: string
  argument_depth?: string
  include_opposing_view?: boolean
}

interface ProfileOption {
  value: string
  label: string
}

export interface ProfileField {
  key: keyof ProfileData & string
  label: string
  type: 'text' | 'number' | 'multiselect' | 'tags' | 'select' | 'textarea' | 'boolean'
  placeholder?: string
  options?: ProfileOption[]
}

export interface ProfileSection {
  id: string
  title: string
  description: string
  fields: ProfileField[]
}

const LEGAL_AREA_OPTIONS: ProfileOption[] = [
  { value: 'administrative', label: 'Direito Administrativo' },
  { value: 'constitutional', label: 'Direito Constitucional' },
  { value: 'civil', label: 'Direito Civil' },
  { value: 'tax', label: 'Direito Tributario' },
  { value: 'labor', label: 'Direito do Trabalho' },
  { value: 'criminal', label: 'Direito Penal' },
  { value: 'criminal_procedure', label: 'Processo Penal' },
  { value: 'civil_procedure', label: 'Processo Civil' },
  { value: 'consumer', label: 'Direito do Consumidor' },
  { value: 'environmental', label: 'Direito Ambiental' },
  { value: 'business', label: 'Direito Empresarial' },
  { value: 'family', label: 'Direito de Familia' },
  { value: 'inheritance', label: 'Direito das Sucessoes' },
  { value: 'social_security', label: 'Direito Previdenciario' },
  { value: 'electoral', label: 'Direito Eleitoral' },
  { value: 'international', label: 'Direito Internacional' },
  { value: 'digital', label: 'Direito Digital' },
]

export const PROFILE_SECTIONS: ProfileSection[] = [
  {
    id: 'professional',
    title: 'Perfil profissional',
    description: 'Informacoes sobre sua atuacao e contexto institucional.',
    fields: [
      { key: 'institution', label: 'Instituicao', type: 'text', placeholder: 'Ex: Ministerio Publico do Estado do RS' },
      { key: 'position', label: 'Cargo/Função', type: 'text', placeholder: 'Ex: Promotor de Justica' },
      { key: 'jurisdiction', label: 'Jurisdição/Comarca', type: 'text', placeholder: 'Ex: Comarca de Porto Alegre' },
      { key: 'experience_years', label: 'Anos de experiencia', type: 'number' },
    ],
  },
  {
    id: 'areas',
    title: 'Areas de atuacao',
    description: 'Selecione as frentes juridicas que mais orientam seu trabalho.',
    fields: [
      { key: 'primary_areas', label: 'Areas principais', type: 'multiselect', options: LEGAL_AREA_OPTIONS },
      { key: 'specializations', label: 'Especializacoes', type: 'tags', placeholder: 'Separe por virgula: licitacoes, improbidade...' },
    ],
  },
  {
    id: 'writing',
    title: 'Preferencias de redacao',
    description: 'Configure o tom, o ritmo e o estilo base dos documentos.',
    fields: [
      {
        key: 'formality_level',
        label: 'Nivel de formalidade',
        type: 'select',
        options: [
          { value: 'formal', label: 'Formal (linguagem juridica classica)' },
          { value: 'semiformal', label: 'Semiformal (claro e objetivo)' },
        ],
      },
      {
        key: 'connective_style',
        label: 'Estilo de conectivos',
        type: 'select',
        options: [
          { value: 'classico', label: 'Classico (destarte, outrossim, mormente)' },
          { value: 'moderno', label: 'Moderno (portanto, alem disso)' },
        ],
      },
      {
        key: 'paragraph_length',
        label: 'Tamanho dos paragrafos',
        type: 'select',
        options: [
          { value: 'curto', label: 'Curto (3-5 linhas)' },
          { value: 'medio', label: 'Medio (5-10 linhas)' },
          { value: 'longo', label: 'Longo (10+ linhas)' },
        ],
      },
      {
        key: 'citation_style',
        label: 'Estilo de citacoes',
        type: 'select',
        options: [
          { value: 'inline', label: 'Inline (no corpo do texto)' },
          { value: 'footnote', label: 'Notas de rodape' },
          { value: 'abnt', label: 'ABNT' },
        ],
      },
      { key: 'preferred_expressions', label: 'Expressoes preferidas', type: 'tags', placeholder: 'Separe por virgula' },
      { key: 'avoided_expressions', label: 'Expressoes a evitar', type: 'tags', placeholder: 'Separe por virgula' },
    ],
  },
  {
    id: 'document',
    title: 'Defaults de documento',
    description: 'Defina assinatura e cabecalho padrao para agilizar geracoes.',
    fields: [
      { key: 'signature_block', label: 'Assinatura padrao', type: 'textarea', placeholder: 'Nome\nCargo\nInstituicao' },
      { key: 'header_text', label: 'Cabecalho padrao', type: 'textarea', placeholder: 'Texto que aparece no cabecalho dos documentos' },
    ],
  },
  {
    id: 'ai',
    title: 'Preferencias de IA',
    description: 'Ajuste a profundidade e o comportamento base da assistencia.',
    fields: [
      {
        key: 'detail_level',
        label: 'Nivel de detalhamento',
        type: 'select',
        options: [
          { value: 'conciso', label: 'Conciso (direto ao ponto)' },
          { value: 'detalhado', label: 'Detalhado (analise completa)' },
          { value: 'exaustivo', label: 'Exaustivo (todas as possibilidades)' },
        ],
      },
      {
        key: 'argument_depth',
        label: 'Profundidade argumentativa',
        type: 'select',
        options: [
          { value: 'superficial', label: 'Superficial (principais argumentos)' },
          { value: 'moderado', label: 'Moderado (argumentos e contra-argumentos)' },
          { value: 'profundo', label: 'Profundo (analise exaustiva)' },
        ],
      },
      { key: 'include_opposing_view', label: 'Incluir visao contraria automaticamente', type: 'boolean' },
    ],
  },
]
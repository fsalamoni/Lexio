// =============================================================================
// classification-data.ts
// Complete classification tree for Brazilian legal documents.
// Maps: natureza → area → assuntos → tipos
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Natureza values (must match NATUREZA_OPTIONS in generation-service.ts)
// ---------------------------------------------------------------------------
export const NATUREZAS = [
  'consultivo',
  'executorio',
  'transacional',
  'negocial',
  'doutrinario',
  'decisorio',
] as const

export type Natureza = (typeof NATUREZAS)[number]

// ---------------------------------------------------------------------------
// 2. Area IDs (must match LEGAL_AREAS in firestore-service.ts)
// ---------------------------------------------------------------------------
export const AREA_IDS = [
  'administrative',
  'constitutional',
  'civil',
  'tax',
  'labor',
  'criminal',
  'criminal_procedure',
  'civil_procedure',
  'consumer',
  'environmental',
  'business',
  'family',
  'inheritance',
  'social_security',
  'electoral',
  'international',
  'digital',
] as const

export type AreaId = (typeof AREA_IDS)[number]

// ---------------------------------------------------------------------------
// 3. Assuntos per area (union of all subjects across all naturezas)
//    Comprehensive list of subjects for each legal area.
// ---------------------------------------------------------------------------
const AREA_ASSUNTOS: Record<AreaId, readonly string[]> = {
  // ── Direito Administrativo ──────────────────────────────────────────────
  administrative: [
    'Licitações',
    'Contratos administrativos',
    'Improbidade administrativa',
    'Bens públicos',
    'Concurso público',
    'Agentes públicos',
    'Serviço público',
    'Anticorrupção',
    'Desapropriação',
    'Responsabilidade do Estado',
    'Poder de polícia',
    'Processo administrativo',
    'Concessão e permissão',
    'Parcerias público-privadas',
    'Terceiro setor',
    'Regulação',
    'Pregão',
    'Regime disciplinar',
    'Tombamento',
    'Intervenção na propriedade',
    'Atos administrativos',
    'Convênios e transferências',
    'Servidores públicos',
    'Aposentadoria do servidor',
    'Controle da administração',
    'Agências reguladoras',
    'Consórcios públicos',
    'Organizações sociais',
    'Lei de Acesso à Informação',
    'Responsabilidade fiscal',
  ],

  // ── Direito Constitucional ──────────────────────────────────────────────
  constitutional: [
    'Direitos fundamentais',
    'Controle de constitucionalidade',
    'Organização do Estado',
    'Organização dos poderes',
    'Separação de poderes',
    'Federalismo',
    'Princípios constitucionais',
    'Direitos sociais',
    'Direitos políticos',
    'Nacionalidade',
    'Remédios constitucionais',
    'Processo legislativo',
    'Poder constituinte',
    'Hermenêutica constitucional',
    'Supremacia da constituição',
    'Cláusulas pétreas',
    'Estado de exceção',
    'Intervenção federal',
    'Ordem econômica',
    'Ordem social',
    'Meio ambiente (constitucional)',
    'Saúde pública (constitucional)',
    'Educação (constitucional)',
    'Segurança pública',
    'Administração pública (princípios)',
    'Tributação e orçamento (constitucional)',
    'Finanças públicas',
  ],

  // ── Direito Civil ──────────────────────────────────────────────────────
  civil: [
    'Responsabilidade civil',
    'Contratos',
    'Obrigações',
    'Direitos reais',
    'Posse',
    'Propriedade',
    'Usucapião',
    'Dano moral',
    'Dano material',
    'Dano estético',
    'Vícios redibitórios',
    'Prescrição e decadência',
    'Personalidade',
    'Capacidade civil',
    'Pessoa jurídica',
    'Fato jurídico',
    'Negócio jurídico',
    'Ato ilícito',
    'Enriquecimento sem causa',
    'Pagamento indevido',
    'Doação',
    'Compra e venda',
    'Locação',
    'Comodato',
    'Mútuo',
    'Fiança',
    'Hipoteca',
    'Penhor',
    'Servidão',
    'Direito de vizinhança',
    'Condomínio',
    'Incorporação imobiliária',
    'Direitos autorais',
    'Registro civil',
    'Domicílio',
    'Ausência',
    'Tutela e curatela',
    'Interdição',
    'Bem de família',
  ],

  // ── Direito Tributário ──────────────────────────────────────────────────
  tax: [
    'ICMS',
    'ISS',
    'IPTU',
    'IPVA',
    'ITBI',
    'ITCMD',
    'Imposto de Renda',
    'IPI',
    'IOF',
    'PIS/COFINS',
    'CSLL',
    'Contribuições sociais',
    'Contribuições de melhoria',
    'Taxas',
    'Imunidade tributária',
    'Isenção tributária',
    'Planejamento tributário',
    'Elisão e evasão fiscal',
    'Execução fiscal',
    'Crédito tributário',
    'Lançamento tributário',
    'Obrigação tributária',
    'Responsabilidade tributária',
    'Decadência tributária',
    'Prescrição tributária',
    'Substituição tributária',
    'Processo administrativo fiscal',
    'Regime especial',
    'Simples Nacional',
    'Guerra fiscal',
    'Repetição de indébito',
    'Compensação tributária',
    'Anistia fiscal',
    'Remissão',
    'Transação tributária',
    'Dívida ativa',
    'Certidão negativa',
    'Reforma tributária',
  ],

  // ── Direito do Trabalho ─────────────────────────────────────────────────
  labor: [
    'Vínculo empregatício',
    'Contrato de trabalho',
    'Jornada de trabalho',
    'Salário e remuneração',
    'Férias',
    'FGTS',
    '13º salário',
    'Aviso prévio',
    'Rescisão contratual',
    'Dispensa discriminatória',
    'Estabilidade',
    'Acidente de trabalho',
    'Doença ocupacional',
    'Insalubridade',
    'Periculosidade',
    'Trabalho intermitente',
    'Teletrabalho',
    'Terceirização',
    'Trabalho temporário',
    'Trabalho doméstico',
    'Trabalho infantil e do adolescente',
    'Direito coletivo do trabalho',
    'Convenção coletiva',
    'Acordo coletivo',
    'Dissídio coletivo',
    'Greve',
    'Sindicato',
    'Assédio moral',
    'Assédio sexual',
    'Equiparação salarial',
    'Desvio de função',
    'Horas extras',
    'Adicional noturno',
    'Segurança e saúde do trabalho',
    'Reforma trabalhista',
    'Dano moral trabalhista',
    'Trabalho análogo à escravidão',
    'Cooperativas de trabalho',
  ],

  // ── Direito Penal ──────────────────────────────────────────────────────
  criminal: [
    'Crimes contra a pessoa',
    'Crimes contra o patrimônio',
    'Crimes contra a dignidade sexual',
    'Crimes contra a administração pública',
    'Crimes contra a ordem tributária',
    'Crimes ambientais',
    'Dosimetria da pena',
    'Execução penal',
    'Lei de drogas',
    'Crimes de trânsito',
    'Organizações criminosas',
    'Lavagem de dinheiro',
    'Crimes cibernéticos',
    'Violência doméstica',
    'Crimes contra a honra',
    'Crimes contra a fé pública',
    'Crimes contra a ordem econômica',
    'Crimes contra o sistema financeiro',
    'Crimes hediondos',
    'Teoria do crime',
    'Tipicidade',
    'Ilicitude',
    'Culpabilidade',
    'Tentativa',
    'Concurso de crimes',
    'Concurso de pessoas',
    'Prescrição penal',
    'Extinção da punibilidade',
    'Penas alternativas',
    'Sursis',
    'Livramento condicional',
    'Medidas de segurança',
    'Porte e posse de arma de fogo',
    'Crimes contra a saúde pública',
    'Contravenções penais',
    'Abuso de autoridade',
    'Crimes eleitorais',
    'Corrupção ativa e passiva',
    'Peculato',
    'Crimes de responsabilidade',
  ],

  // ── Processo Penal ─────────────────────────────────────────────────────
  criminal_procedure: [
    'Inquérito policial',
    'Ação penal pública',
    'Ação penal privada',
    'Competência criminal',
    'Prisão em flagrante',
    'Prisão preventiva',
    'Prisão temporária',
    'Liberdade provisória',
    'Fiança',
    'Medidas cautelares',
    'Provas no processo penal',
    'Interceptação telefônica',
    'Busca e apreensão',
    'Perícia criminal',
    'Testemunhas',
    'Interrogatório',
    'Procedimento ordinário',
    'Procedimento sumário',
    'Procedimento sumaríssimo',
    'Tribunal do júri',
    'Recursos criminais',
    'Habeas corpus',
    'Revisão criminal',
    'Nulidades',
    'Sentença penal',
    'Citação e intimação',
    'Acordo de não persecução penal',
    'Colaboração premiada',
    'Arquivamento',
    'Ação penal nos crimes de menor potencial ofensivo',
    'Suspensão condicional do processo',
    'Execução penal (processual)',
    'Investigação criminal',
    'Delegacia digitalizada',
    'Audiência de custódia',
    'Cadeia de custódia da prova',
  ],

  // ── Processo Civil ─────────────────────────────────────────────────────
  civil_procedure: [
    'Petição inicial',
    'Contestação',
    'Reconvenção',
    'Tutela antecipada',
    'Tutela cautelar',
    'Tutela de urgência',
    'Tutela de evidência',
    'Recursos cíveis',
    'Apelação',
    'Agravo de instrumento',
    'Recurso especial',
    'Recurso extraordinário',
    'Embargos de declaração',
    'Embargos infringentes',
    'Cumprimento de sentença',
    'Execução de título extrajudicial',
    'Embargos à execução',
    'Penhora',
    'Hasta pública',
    'Procedimento comum',
    'Procedimentos especiais',
    'Produção antecipada de provas',
    'Ação monitória',
    'Mandado de segurança',
    'Ação popular',
    'Ação civil pública',
    'Intervenção de terceiros',
    'Litisconsórcio',
    'Competência cível',
    'Citação e intimação',
    'Audiência de conciliação',
    'Audiência de instrução',
    'Sentença cível',
    'Coisa julgada',
    'Liquidação de sentença',
    'Incidente de desconsideração da personalidade jurídica',
    'IRDR (Incidente de Resolução de Demandas Repetitivas)',
    'Negócios jurídicos processuais',
    'Honorários advocatícios',
    'Custas processuais',
    'Gratuidade de justiça',
  ],

  // ── Direito do Consumidor ──────────────────────────────────────────────
  consumer: [
    'Relação de consumo',
    'Responsabilidade pelo fato do produto',
    'Responsabilidade pelo fato do serviço',
    'Responsabilidade pelo vício do produto',
    'Responsabilidade pelo vício do serviço',
    'Práticas abusivas',
    'Publicidade enganosa',
    'Publicidade abusiva',
    'Cláusulas abusivas',
    'Direito de arrependimento',
    'Garantia legal',
    'Garantia contratual',
    'Recall',
    'Superendividamento',
    'Banco de dados e cadastro de consumidores',
    'Proteção contratual',
    'Inversão do ônus da prova',
    'Dano moral nas relações de consumo',
    'Cobrança indevida',
    'Negativação indevida',
    'Planos de saúde',
    'Serviços bancários',
    'Telecomunicações',
    'Transporte de passageiros',
    'Compras online',
    'Contratos de adesão',
    'Venda casada',
    'Desconsideração da personalidade jurídica (consumidor)',
    'Ações coletivas de consumo',
    'Defesa administrativa do consumidor (Procon)',
  ],

  // ── Direito Ambiental ──────────────────────────────────────────────────
  environmental: [
    'Licenciamento ambiental',
    'Estudo de impacto ambiental (EIA/RIMA)',
    'Crimes ambientais',
    'Responsabilidade ambiental',
    'Áreas de preservação permanente',
    'Reserva legal',
    'Unidades de conservação',
    'Recursos hídricos',
    'Poluição',
    'Resíduos sólidos',
    'Fauna e flora',
    'Desmatamento',
    'Mudanças climáticas',
    'Código Florestal',
    'Mineração',
    'CAR (Cadastro Ambiental Rural)',
    'Compensação ambiental',
    'Recuperação de áreas degradadas',
    'Direito urbanístico-ambiental',
    'Saneamento básico',
    'Agrotóxicos',
    'Patrimônio genético',
    'Biopirataria',
    'Termo de ajustamento de conduta (ambiental)',
    'Fiscalização ambiental',
    'Infrações administrativas ambientais',
    'Princípio do poluidor-pagador',
    'Princípio da precaução',
    'Zoneamento ambiental',
    'Crédito de carbono',
  ],

  // ── Direito Empresarial ────────────────────────────────────────────────
  business: [
    'Sociedades empresárias',
    'Sociedade limitada',
    'Sociedade anônima',
    'EIRELI e SLU',
    'Contratos mercantis',
    'Recuperação judicial',
    'Recuperação extrajudicial',
    'Falência',
    'Propriedade industrial',
    'Marcas',
    'Patentes',
    'Concorrência desleal',
    'Direito antitruste',
    'Títulos de crédito',
    'Duplicata',
    'Nota promissória',
    'Cheque',
    'Letra de câmbio',
    'Franquia',
    'Contratos bancários',
    'Leasing',
    'Factoring',
    'Direito societário',
    'Governança corporativa',
    'Responsabilidade dos sócios',
    'Dissolução de sociedade',
    'Transformação societária',
    'Fusão e aquisição',
    'Compliance empresarial',
    'Arbitragem comercial',
    'Estabelecimento empresarial',
    'Nome empresarial',
    'Registro empresarial',
    'Empresa individual',
    'Startup e inovação',
    'Mercado de capitais',
    'Valores mobiliários',
  ],

  // ── Direito de Família ─────────────────────────────────────────────────
  family: [
    'Casamento',
    'Divórcio',
    'Separação judicial',
    'União estável',
    'Guarda de filhos',
    'Guarda compartilhada',
    'Alimentos',
    'Revisão de alimentos',
    'Exoneração de alimentos',
    'Adoção',
    'Poder familiar',
    'Alienação parental',
    'Regime de bens',
    'Pacto antenupcial',
    'Partilha de bens',
    'Filiação',
    'Reconhecimento de paternidade',
    'Investigação de paternidade',
    'Multiparentalidade',
    'Família homoafetiva',
    'Violência doméstica (família)',
    'Medidas protetivas',
    'Dissolução de união estável',
    'Pensão compensatória',
    'Bem de família',
    'Nome civil',
    'Interdição e curatela',
    'Tomada de decisão apoiada',
    'Acolhimento institucional',
    'Visitação',
    'Planejamento familiar',
    'Reprodução assistida',
  ],

  // ── Direito das Sucessões ──────────────────────────────────────────────
  inheritance: [
    'Herança',
    'Testamento',
    'Inventário',
    'Partilha',
    'Sucessão legítima',
    'Sucessão testamentária',
    'Inventário judicial',
    'Inventário extrajudicial',
    'Arrolamento',
    'Herdeiros necessários',
    'Legítima',
    'Deserdação',
    'Indignidade',
    'Colação',
    'Sonegação de bens',
    'Cessão de direitos hereditários',
    'Petição de herança',
    'Herança jacente',
    'Herança vacante',
    'Usufruto do cônjuge',
    'Direito de representação',
    'Testamento público',
    'Testamento cerrado',
    'Testamento particular',
    'Codicilo',
    'Fideicomisso',
    'Legado',
    'Planejamento sucessório',
    'Holding familiar',
    'Imposto sobre herança (ITCMD)',
  ],

  // ── Direito Previdenciário ───────────────────────────────────────────
  social_security: [
    'Aposentadoria por idade',
    'Aposentadoria por tempo de contribuição',
    'Aposentadoria especial',
    'Aposentadoria por invalidez',
    'Aposentadoria rural',
    'Auxílio-doença',
    'Auxílio-acidente',
    'Auxílio-reclusão',
    'Pensão por morte',
    'Salário-maternidade',
    'Salário-família',
    'BPC/LOAS',
    'Revisão de benefício',
    'Cálculo de benefício',
    'Tempo de contribuição',
    'Contagem recíproca',
    'Averbação de tempo',
    'Contribuição previdenciária',
    'Segurado especial',
    'Carência',
    'Qualidade de segurado',
    'Decadência e prescrição previdenciária',
    'Desaposentação',
    'Regime próprio (RPPS)',
    'Regime geral (RGPS)',
    'Previdência complementar',
    'Reforma da previdência',
    'Custeio da seguridade social',
    'Perícia médica',
    'Reabilitação profissional',
  ],

  // ── Direito Eleitoral ──────────────────────────────────────────────────
  electoral: [
    'Registro de candidatura',
    'Propaganda eleitoral',
    'Prestação de contas',
    'Partidos políticos',
    'Inelegibilidade',
    'Abuso de poder',
    'Abuso de poder econômico',
    'Abuso de poder político',
    'Captação ilícita de sufrágio',
    'Condutas vedadas',
    'Impugnação de mandato eletivo',
    'Ação de investigação judicial eleitoral (AIJE)',
    'Recurso eleitoral',
    'Representação eleitoral',
    'Pesquisa eleitoral',
    'Fundo eleitoral',
    'Fundo partidário',
    'Fidelidade partidária',
    'Perda de mandato',
    'Direito de resposta (eleitoral)',
    'Crimes eleitorais',
    'Propaganda na internet',
    'Voto',
    'Coligações e federações',
    'Urna eletrônica',
    'Diplomação',
    'Cassação de mandato',
    'Financiamento de campanha',
  ],

  // ── Direito Internacional ──────────────────────────────────────────────
  international: [
    'Tratados internacionais',
    'Direito internacional público',
    'Direito internacional privado',
    'Extradição',
    'Cooperação jurídica internacional',
    'Carta rogatória',
    'Homologação de sentença estrangeira',
    'Direitos humanos',
    'Organizações internacionais',
    'Direito diplomático',
    'Direito do mar',
    'Direito internacional humanitário',
    'Direito dos refugiados',
    'Arbitragem internacional',
    'Comércio internacional',
    'Direito aduaneiro',
    'Nacionalidade e naturalização',
    'Imigração',
    'Conflito de leis no espaço',
    'Responsabilidade internacional dos Estados',
    'Direito internacional penal',
    'Tribunal Penal Internacional',
    'Mercosul',
    'OMC',
    'Proteção internacional de investimentos',
    'Sequestro internacional de crianças',
    'Dupla tributação',
    'Auxílio direto',
  ],

  // ── Direito Digital ────────────────────────────────────────────────────
  digital: [
    'LGPD (Lei Geral de Proteção de Dados)',
    'Marco Civil da Internet',
    'Crimes cibernéticos',
    'Proteção de dados pessoais',
    'Privacidade digital',
    'E-commerce',
    'Assinatura digital e certificação',
    'Propriedade intelectual digital',
    'Direito ao esquecimento',
    'Responsabilidade de provedores',
    'Remoção de conteúdo',
    'Fake news e desinformação',
    'Inteligência artificial',
    'Blockchain e criptoativos',
    'Contratos eletrônicos',
    'Prova digital',
    'Registro de domínio',
    'Software e licenciamento',
    'Dados sensíveis',
    'Transferência internacional de dados',
    'Encarregado de dados (DPO)',
    'Incidentes de segurança',
    'Consentimento digital',
    'Cookies e rastreamento',
    'Regulação de plataformas',
    'Telecomunicações (digital)',
    'Open banking',
    'PIX e meios de pagamento',
    'Neutralidade de rede',
    'Governança de dados',
  ],
} as const

// ---------------------------------------------------------------------------
// 4. CLASSIFICATION_TREE
//    Maps natureza → area → assuntos.
//    Every area carries its full assuntos list regardless of natureza because
//    subject matter is inherent to the area, not to the document's nature.
// ---------------------------------------------------------------------------
export const CLASSIFICATION_TREE: Record<Natureza, Record<AreaId, readonly string[]>> = {
  consultivo: Object.fromEntries(AREA_IDS.map((id) => [id, AREA_ASSUNTOS[id]])) as Record<AreaId, readonly string[]>,
  executorio: Object.fromEntries(AREA_IDS.map((id) => [id, AREA_ASSUNTOS[id]])) as Record<AreaId, readonly string[]>,
  transacional: Object.fromEntries(AREA_IDS.map((id) => [id, AREA_ASSUNTOS[id]])) as Record<AreaId, readonly string[]>,
  negocial: Object.fromEntries(AREA_IDS.map((id) => [id, AREA_ASSUNTOS[id]])) as Record<AreaId, readonly string[]>,
  doutrinario: Object.fromEntries(AREA_IDS.map((id) => [id, AREA_ASSUNTOS[id]])) as Record<AreaId, readonly string[]>,
  decisorio: Object.fromEntries(AREA_IDS.map((id) => [id, AREA_ASSUNTOS[id]])) as Record<AreaId, readonly string[]>,
}

// ---------------------------------------------------------------------------
// 5. CLASSIFICATION_TIPOS
//    Document types per natureza, with optional area-specific overrides.
//    Structure: natureza → "_default" | areaId → tipos[]
//    The "_default" key carries tipos that apply across all areas for that
//    natureza. Area keys carry additional tipos specific to that combination.
// ---------------------------------------------------------------------------
export const CLASSIFICATION_TIPOS: Record<string, Record<string, string[]>> = {
  // ── Consultivo ──────────────────────────────────────────────────────────
  consultivo: {
    _default: [
      'Parecer',
      'Manifestação',
      'Nota técnica',
      'Informação',
      'Consulta jurídica',
      'Memorando jurídico',
      'Informativo',
      'Orientação jurídica',
      'Relatório de análise',
    ],
    administrative: [
      'Parecer referencial',
      'Nota de auditoria',
      'Parecer de licitação',
    ],
    tax: [
      'Solução de consulta',
      'Parecer normativo',
    ],
    constitutional: [
      'Parecer constitucional',
      'Nota sobre constitucionalidade',
    ],
    labor: [
      'Parecer trabalhista',
    ],
    environmental: [
      'Parecer ambiental',
      'Nota técnica ambiental',
    ],
    business: [
      'Parecer societário',
      'Due diligence report',
    ],
    digital: [
      'Relatório de impacto à proteção de dados (RIPD)',
      'Parecer de conformidade LGPD',
    ],
  },

  // ── Executório ──────────────────────────────────────────────────────────
  executorio: {
    _default: [
      'Petição inicial',
      'Contestação',
      'Réplica',
      'Alegações finais',
      'Recurso',
      'Contrarrazões',
      'Memoriais',
      'Embargos de declaração',
      'Agravo',
      'Apelação',
      'Impugnação',
    ],
    administrative: [
      'Ação Civil Pública (inicial)',
      'Recomendação',
      'ANPC (Acordo de Não Persecução Cível)',
      'Ação de Improbidade Administrativa',
      'Mandado de segurança',
    ],
    criminal: [
      'Denúncia',
      'Queixa-crime',
      'Razões de recurso criminal',
      'Habeas corpus',
      'Pedido de liberdade provisória',
    ],
    criminal_procedure: [
      'Denúncia',
      'Alegações finais criminais',
      'Habeas corpus',
      'Recurso em sentido estrito',
      'Revisão criminal',
    ],
    civil_procedure: [
      'Cumprimento de sentença',
      'Execução de título extrajudicial',
      'Embargos à execução',
      'Ação monitória',
      'Ação rescisória',
    ],
    tax: [
      'Execução fiscal',
      'Embargos à execução fiscal',
      'Exceção de pré-executividade',
      'Mandado de segurança tributário',
      'Ação anulatória de débito fiscal',
    ],
    labor: [
      'Reclamação trabalhista',
      'Recurso ordinário trabalhista',
      'Recurso de revista',
      'Mandado de segurança trabalhista',
    ],
    consumer: [
      'Ação de indenização (consumidor)',
      'Ação coletiva de consumo',
      'Ação de obrigação de fazer',
    ],
    environmental: [
      'Ação Civil Pública ambiental',
      'Ação popular ambiental',
    ],
    family: [
      'Ação de divórcio',
      'Ação de alimentos',
      'Ação de guarda',
      'Ação de investigação de paternidade',
    ],
    inheritance: [
      'Inventário judicial',
      'Petição de herança',
      'Ação de anulação de testamento',
    ],
    social_security: [
      'Ação previdenciária',
      'Recurso ao CRPS',
      'Mandado de segurança previdenciário',
    ],
    electoral: [
      'AIJE (Ação de Investigação Judicial Eleitoral)',
      'AIME (Ação de Impugnação de Mandato Eletivo)',
      'Representação eleitoral',
      'Recurso eleitoral',
    ],
    constitutional: [
      'ADI (Ação Direta de Inconstitucionalidade)',
      'ADC (Ação Declaratória de Constitucionalidade)',
      'ADPF (Arguição de Descumprimento de Preceito Fundamental)',
      'Mandado de injunção',
    ],
    international: [
      'Pedido de cooperação jurídica',
      'Pedido de extradição',
      'Carta rogatória',
    ],
    digital: [
      'Ação de remoção de conteúdo',
      'Ação de indenização por vazamento de dados',
    ],
    business: [
      'Pedido de recuperação judicial',
      'Pedido de falência',
      'Ação de dissolução de sociedade',
    ],
  },

  // ── Transacional ────────────────────────────────────────────────────────
  transacional: {
    _default: [
      'TAC (Termo de Ajustamento de Conduta)',
      'ANPC (Acordo de Não Persecução Cível)',
      'ANPP (Acordo de Não Persecução Penal)',
      'Acordo processual',
      'Transação',
      'Termo de compromisso',
      'Mediação',
      'Conciliação',
      'Acordo extrajudicial',
    ],
    administrative: [
      'Acordo de leniência',
      'Termo de colaboração',
      'Termo de fomento',
    ],
    tax: [
      'Transação tributária',
      'Acordo de parcelamento',
      'Termo de confissão de dívida',
    ],
    labor: [
      'Acordo trabalhista (homologado)',
      'Acordo em dissídio coletivo',
      'Termo de quitação anual',
    ],
    environmental: [
      'TAC ambiental',
      'Acordo de compensação ambiental',
    ],
    criminal: [
      'Colaboração premiada',
      'Acordo de delação',
    ],
    criminal_procedure: [
      'Acordo de não persecução penal',
      'Suspensão condicional do processo',
      'Transação penal',
    ],
    consumer: [
      'Acordo de consumo',
      'Termo de compromisso (Procon)',
    ],
    family: [
      'Acordo de divórcio consensual',
      'Acordo de guarda e alimentos',
    ],
    business: [
      'Acordo de sócios',
      'Termo de mediação empresarial',
      'Acordo em recuperação judicial',
    ],
    international: [
      'Acordo de cooperação internacional',
      'Tratado bilateral',
    ],
    digital: [
      'Termo de compromisso de proteção de dados',
      'Acordo de incidente de segurança',
    ],
  },

  // ── Negocial ────────────────────────────────────────────────────────────
  negocial: {
    _default: [
      'Minuta de contrato',
      'Edital',
      'Termo de referência',
      'Convênio',
      'Protocolo de intenções',
      'Memorando de entendimento',
      'Notificação extrajudicial',
      'Carta de intenções',
    ],
    administrative: [
      'Edital de licitação',
      'Contrato administrativo',
      'Ata de registro de preços',
      'Termo aditivo',
      'Convênio administrativo',
      'Termo de cessão',
    ],
    business: [
      'Contrato social',
      'Estatuto social',
      'Acordo de acionistas',
      'Contrato de compra e venda de participações',
      'NDA (Acordo de confidencialidade)',
      'Contrato de prestação de serviços',
      'Contrato de franquia',
      'Contrato de licenciamento',
    ],
    labor: [
      'Contrato de trabalho',
      'Aditivo contratual trabalhista',
      'Regulamento interno',
      'Termo de confidencialidade',
      'Acordo de banco de horas',
    ],
    civil: [
      'Contrato de locação',
      'Contrato de compra e venda',
      'Contrato de comodato',
      'Contrato de mútuo',
      'Contrato de doação',
      'Escritura pública',
    ],
    digital: [
      'Política de privacidade',
      'Termos de uso',
      'Contrato de SaaS',
      'DPA (Data Processing Agreement)',
      'Contrato de licença de software',
    ],
    international: [
      'Contrato internacional',
      'Acordo de cooperação técnica',
      'Joint venture internacional',
    ],
    environmental: [
      'Contrato de concessão ambiental',
      'Termo de responsabilidade ambiental',
    ],
    family: [
      'Pacto antenupcial',
      'Contrato de união estável',
      'Contrato de convivência',
    ],
    tax: [
      'Contrato com cláusulas tributárias',
      'Planejamento tributário (instrumento)',
    ],
    consumer: [
      'Contrato de adesão',
      'Regulamento de promoção',
    ],
    inheritance: [
      'Testamento',
      'Codicilo',
      'Cessão de direitos hereditários',
      'Escritura de inventário extrajudicial',
    ],
  },

  // ── Doutrinário ─────────────────────────────────────────────────────────
  doutrinario: {
    _default: [
      'Artigo jurídico',
      'Tese acadêmica',
      'Dissertação',
      'Monografia',
      'Livro / capítulo de livro',
      'Resenha',
      'Comentário de jurisprudência',
      'Estudo de caso',
      'Parecer acadêmico',
      'Ensaio jurídico',
    ],
    constitutional: [
      'Análise de constitucionalidade',
    ],
    criminal: [
      'Estudo de política criminal',
    ],
    digital: [
      'Estudo de impacto regulatório',
    ],
    international: [
      'Análise de direito comparado',
    ],
  },

  // ── Decisório ───────────────────────────────────────────────────────────
  decisorio: {
    _default: [
      'Sentença',
      'Acórdão',
      'Decisão interlocutória',
      'Despacho',
      'Decisão monocrática',
      'Voto',
      'Ementa',
      'Súmula',
    ],
    administrative: [
      'Decisão administrativa',
      'Acórdão do TCU/TCE',
      'Decisão de processo disciplinar',
      'Decisão do CADE',
    ],
    tax: [
      'Decisão do CARF',
      'Decisão de Junta de Recursos Fiscais',
      'Solução de consulta COSIT',
    ],
    labor: [
      'Sentença trabalhista',
      'Acórdão do TRT',
      'Acórdão do TST',
      'Decisão em dissídio coletivo',
    ],
    criminal: [
      'Sentença penal condenatória',
      'Sentença penal absolutória',
      'Sentença do tribunal do júri',
    ],
    criminal_procedure: [
      'Decisão de pronúncia',
      'Decisão de impronúncia',
      'Decisão de absolvição sumária',
    ],
    consumer: [
      'Decisão do Procon',
      'Sentença de Juizado Especial',
    ],
    electoral: [
      'Acórdão do TSE',
      'Acórdão do TRE',
      'Decisão de diplomação',
    ],
    constitutional: [
      'Acórdão do STF',
      'Decisão em controle concentrado',
      'Súmula vinculante',
    ],
    social_security: [
      'Decisão do INSS',
      'Acórdão do CRPS',
    ],
    environmental: [
      'Decisão do IBAMA',
      'Decisão do CONAMA',
    ],
    international: [
      'Sentença arbitral internacional',
      'Decisão de tribunal internacional',
    ],
    business: [
      'Sentença de recuperação judicial',
      'Decisão falimentar',
      'Decisão arbitral',
    ],
  },
}

// ---------------------------------------------------------------------------
// 6. DEFAULT_AREA_ASSUNTOS
//    Union of all assuntos for a given area across all naturezas.
//    Since AREA_ASSUNTOS is the same for every natureza, this is just a
//    direct reference to the canonical list.
// ---------------------------------------------------------------------------
export const DEFAULT_AREA_ASSUNTOS: Record<string, string[]> = Object.fromEntries(
  AREA_IDS.map((id) => [id, [...AREA_ASSUNTOS[id]]]),
)

// ---------------------------------------------------------------------------
// 7. Helper functions
// ---------------------------------------------------------------------------

/**
 * Returns all unique assuntos available for the given natureza and area IDs.
 * If the natureza or area is not found, it is silently skipped.
 */
export function getAssuntosForAreas(natureza: string, areaIds: string[]): string[] {
  const tree = CLASSIFICATION_TREE[natureza as Natureza]
  if (!tree) return []

  const seen = new Set<string>()
  const result: string[] = []

  for (const areaId of areaIds) {
    const assuntos = tree[areaId as AreaId]
    if (!assuntos) continue
    for (const a of assuntos) {
      if (!seen.has(a)) {
        seen.add(a)
        result.push(a)
      }
    }
  }

  return result
}

/**
 * Returns all unique tipos (document types) available for the given
 * natureza + areas + assuntos combination.
 *
 * Resolution order:
 *   1. _default tipos for the natureza (always included)
 *   2. area-specific tipos for each matching areaId
 *
 * The `assuntos` parameter is accepted for future finer-grained filtering
 * but currently all tipos for the natureza+area pair are returned.
 */
export function getTiposForClassification(
  natureza: string,
  areaIds: string[],
  assuntos: string[],
  tiposSource?: Record<string, Record<string, string[]>>,
): string[] {
  const tipoMap = (tiposSource ?? CLASSIFICATION_TIPOS)[natureza]
  if (!tipoMap) return []

  // Reserved for future finer-grained filtering by assuntos
  void assuntos

  const seen = new Set<string>()
  const result: string[] = []

  const addTipos = (tipos: string[] | undefined) => {
    if (!tipos) return
    for (const t of tipos) {
      if (!seen.has(t)) {
        seen.add(t)
        result.push(t)
      }
    }
  }

  // Always include default tipos for this natureza
  addTipos(tipoMap._default)

  // Add area-specific tipos
  for (const areaId of areaIds) {
    addTipos(tipoMap[areaId])
  }

  return result
}

/**
 * Returns all assuntos across all naturezas for a given area.
 * Since each natureza maps to the same AREA_ASSUNTOS, this returns
 * the canonical assuntos list for the area.
 */
export function getAllAssuntosForArea(areaId: string): string[] {
  const assuntos = AREA_ASSUNTOS[areaId as AreaId]
  return assuntos ? [...assuntos] : []
}

/**
 * Lexio Demo Mode — Mock data and API interceptor for GitHub Pages.
 *
 * When VITE_DEMO_MODE=true, all API calls are intercepted and return
 * realistic mock data so the UI can be explored without a backend.
 */

// ── Mock user ─────────────────────────────────────────────────────────
export const DEMO_USER = {
  user_id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@lexio.app',
  full_name: 'Administrador Lexio',
  role: 'admin',
  access_token: 'demo-token-lexio-2026',
}

// ── Mock documents ────────────────────────────────────────────────────
export const DEMO_DOCUMENTS = [
  {
    id: 'a1b2c3d4-0001-0000-0000-000000000001',
    document_type_id: 'parecer',
    legal_area_ids: ['administrative'],
    original_request: 'Análise sobre a legalidade da dispensa de licitação com base no art. 75 da Lei 14.133/2021, considerando contratação emergencial de serviços de TI.',
    tema: 'Dispensa de Licitação — Emergência',
    status: 'concluido',
    quality_score: 92,
    origem: 'web',
    created_at: '2026-03-04T14:30:00Z',
    updated_at: '2026-03-04T14:45:00Z',
  },
  {
    id: 'a1b2c3d4-0002-0000-0000-000000000002',
    document_type_id: 'peticao_inicial',
    legal_area_ids: ['civil'],
    original_request: 'Petição inicial de ação de indenização por danos morais e materiais decorrentes de erro médico em procedimento cirúrgico.',
    tema: 'Responsabilidade Civil — Erro Médico',
    status: 'concluido',
    quality_score: 88,
    origem: 'web',
    created_at: '2026-03-03T10:00:00Z',
    updated_at: '2026-03-03T10:25:00Z',
  },
  {
    id: 'a1b2c3d4-0003-0000-0000-000000000003',
    document_type_id: 'contestacao',
    legal_area_ids: ['labor'],
    original_request: 'Contestação em reclamação trabalhista por verbas rescisórias, horas extras e danos morais. Empregador alega justa causa.',
    tema: 'Verbas Rescisórias — Justa Causa',
    status: 'concluido',
    quality_score: 95,
    origem: 'whatsapp',
    created_at: '2026-03-02T16:00:00Z',
    updated_at: '2026-03-02T16:30:00Z',
  },
  {
    id: 'a1b2c3d4-0004-0000-0000-000000000004',
    document_type_id: 'recurso',
    legal_area_ids: ['tax'],
    original_request: 'Recurso de apelação contra sentença que julgou improcedente mandado de segurança sobre ICMS-ST.',
    tema: 'ICMS-ST — Mandado de Segurança',
    status: 'processando',
    quality_score: null,
    origem: 'web',
    created_at: '2026-03-05T08:00:00Z',
    updated_at: '2026-03-05T08:00:00Z',
  },
  {
    id: 'a1b2c3d4-0005-0000-0000-000000000005',
    document_type_id: 'acao_civil_publica',
    legal_area_ids: ['constitutional', 'administrative'],
    original_request: 'ACP contra município por descumprimento do piso salarial de profissionais da educação previsto na Lei 11.738/2008.',
    tema: 'Piso Salarial — Educação',
    status: 'concluido',
    quality_score: 91,
    origem: 'web',
    created_at: '2026-03-01T09:00:00Z',
    updated_at: '2026-03-01T09:40:00Z',
  },
]

// ── Mock modules ──────────────────────────────────────────────────────
export const DEMO_MODULES = [
  { id: 'parecer', name: 'Parecer Jurídico', type: 'document_type', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Geração de pareceres jurídicos com pipeline multi-agente' },
  { id: 'peticao_inicial', name: 'Petição Inicial', type: 'document_type', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Petições iniciais com triagem, pesquisa e redação automáticas' },
  { id: 'contestacao', name: 'Contestação', type: 'document_type', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Contestações com impugnação específica de fatos (art. 341 CPC)' },
  { id: 'recurso', name: 'Recurso', type: 'document_type', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Recursos de apelação, agravo e embargos' },
  { id: 'sentenca', name: 'Sentença', type: 'document_type', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Sentenças com fundamentação art. 489 §1º CPC' },
  { id: 'acao_civil_publica', name: 'Ação Civil Pública', type: 'document_type', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'ACPs com legitimidade, tutela e pedidos estruturais' },
  { id: 'administrative', name: 'Direito Administrativo', type: 'legal_area', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Licitações (Lei 14.133/21), improbidade, servidores' },
  { id: 'constitutional', name: 'Direito Constitucional', type: 'legal_area', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Controle de constitucionalidade, direitos fundamentais' },
  { id: 'civil', name: 'Direito Civil', type: 'legal_area', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Responsabilidade civil, contratos, família e sucessões' },
  { id: 'tax', name: 'Direito Tributário', type: 'legal_area', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'ICMS, ISS, IR, contribuições, execução fiscal' },
  { id: 'labor', name: 'Direito do Trabalho', type: 'legal_area', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'CLT, verbas rescisórias, horas extras, danos morais' },
  { id: 'thesis_bank', name: 'Banco de Teses', type: 'feature', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Extração e reutilização automática de teses jurídicas' },
  { id: 'whatsapp_bot', name: 'WhatsApp Bot', type: 'feature', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Bot conversacional via WhatsApp (Evolution API)' },
  { id: 'anamnesis', name: 'Anamnese Jurídica', type: 'feature', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Perfil profissional e preferências de redação' },
]

// ── Mock health ───────────────────────────────────────────────────────
export const DEMO_HEALTH = {
  status: 'healthy',
  app: 'Lexio',
  version: '1.0.0',
  services: { postgres: 'ok', qdrant: 'ok', ollama: 'ok', searxng: 'ok' },
  modules: { total: 14, healthy: 14 },
}

// ── Mock stats ────────────────────────────────────────────────────────
export const DEMO_STATS = {
  total_documents: 47,
  completed_documents: 42,
  processing_documents: 2,
  average_quality_score: 91,
  total_cost_usd: 12.84,
}

// ── Mock document types ───────────────────────────────────────────────
export const DEMO_DOC_TYPES = [
  { id: 'parecer', name: 'Parecer Jurídico', description: 'Análise técnico-jurídica sobre questão específica', template_variants: ['generic', 'mprs', 'caopp'] },
  { id: 'peticao_inicial', name: 'Petição Inicial', description: 'Peça processual que inicia a ação judicial', template_variants: ['generic'] },
  { id: 'contestacao', name: 'Contestação', description: 'Defesa do réu com impugnação específica dos fatos', template_variants: ['generic'] },
  { id: 'recurso', name: 'Recurso', description: 'Recurso de apelação, agravo ou embargos', template_variants: ['generic'] },
  { id: 'sentenca', name: 'Sentença', description: 'Decisão judicial com fundamentação completa', template_variants: ['generic'] },
  { id: 'acao_civil_publica', name: 'Ação Civil Pública', description: 'Ação coletiva para tutela de interesses difusos', template_variants: ['generic'] },
]

// ── Mock legal areas ──────────────────────────────────────────────────
export const DEMO_LEGAL_AREAS = [
  { id: 'administrative', name: 'Direito Administrativo', specializations: ['Licitações', 'Improbidade', 'Servidores Públicos'] },
  { id: 'constitutional', name: 'Direito Constitucional', specializations: ['Controle de Constitucionalidade', 'Direitos Fundamentais'] },
  { id: 'civil', name: 'Direito Civil', specializations: ['Responsabilidade Civil', 'Contratos', 'Família'] },
  { id: 'tax', name: 'Direito Tributário', specializations: ['ICMS', 'ISS', 'Execução Fiscal'] },
  { id: 'labor', name: 'Direito do Trabalho', specializations: ['CLT', 'Verbas Rescisórias', 'Horas Extras'] },
]

// ── Mock admin settings ───────────────────────────────────────────────
export const DEMO_SETTINGS = {
  settings: [
    {
      key: 'openrouter_api_key',
      label: 'OpenRouter API Key',
      description: 'Chave para acesso aos modelos LLM (Claude Sonnet, GPT-4o, etc.) via OpenRouter.ai',
      placeholder: 'sk-or-v1-...',
      link: 'https://openrouter.ai/keys',
      guide: [
        'Acesse https://openrouter.ai e crie uma conta gratuita.',
        "No menu lateral, clique em 'API Keys'.",
        "Clique em 'Create Key', dê um nome (ex: Lexio) e confirme.",
        'Copie a chave gerada — ela começa com sk-or-v1-.',
        "Cole aqui no campo abaixo e clique em 'Salvar'.",
        "Opcional: em 'Credits', adicione créditos para consumo dos modelos.",
      ],
      is_auto: false,
      is_set: true,
      masked_value: 'sk-or-••••••••••3a9f',
      source: 'banco',
    },
    {
      key: 'evolution_api_key',
      label: 'Evolution API Key',
      description: 'Chave para integração WhatsApp via Evolution API (bot conversacional)',
      placeholder: 'Sua chave de API da Evolution',
      link: 'https://doc.evolution-api.com',
      guide: [
        'Instale a Evolution API no servidor: docker run atendai/evolution-api:latest',
        'Acesse o painel da Evolution API (porta 8080 por padrão).',
        "Vá em 'Instances' → clique em 'New Instance' → nomeie como 'lexio'.",
        "Na instância criada, copie o campo 'API Key' exibido.",
        "Cole aqui e clique em 'Salvar'.",
        'No arquivo .env, defina EVOLUTION_API_URL com a URL do servidor e WHATSAPP_ENABLED=true.',
        "Conecte o WhatsApp: na instância, clique em 'Connect' e escaneie o QR Code com o celular.",
        'Configure o webhook da instância para: http://seu-backend:8000/webhook/evolution',
      ],
      is_auto: false,
      is_set: false,
      masked_value: null,
      source: 'não configurado',
    },
    {
      key: 'datajud_api_key',
      label: 'DataJud API Key (CNJ)',
      description: 'Chave para consulta de jurisprudência via DataJud — API Pública do CNJ',
      placeholder: 'cnjKey=...',
      link: 'https://datajud-wiki.cnj.jus.br',
      guide: [
        'Esta chave já vem pré-configurada com a chave pública padrão do CNJ (cnjKey=2026).',
        'Se precisar de uma chave personalizada, acesse https://datajud-wiki.cnj.jus.br.',
        "Clique em 'Solicitar Acesso' e preencha o formulário de registro.",
        'Após aprovação, você receberá sua chave por e-mail no formato cnjKey=XXXXX.',
        "Substitua o valor padrão pela sua chave personalizada e clique em 'Salvar'.",
      ],
      is_auto: true,
      is_set: true,
      masked_value: 'cnjKey••••',
      source: 'banco',
    },
  ],
}

// ── Mock theses ───────────────────────────────────────────────────────
export const DEMO_THESES = [
  {
    id: 't001',
    title: 'Dispensa de licitação por emergência (art. 75, VIII, Lei 14.133/21)',
    summary: 'Fundamenta a contratação direta em situações de calamidade ou risco à segurança pública, afastando o procedimento licitatório ordinário.',
    legal_area_id: 'administrative',
    document_type_id: 'parecer',
    content: 'A contratação direta por dispensa de licitação em razão de emergência ou calamidade pública encontra fundamento no art. 75, VIII, da Lei 14.133/2021. Para sua configuração, exige-se: (i) situação emergencial devidamente comprovada; (ii) risco de dano à segurança pública ou ao interesse público; (iii) contratação limitada ao necessário para o enfrentamento da situação; e (iv) prazo de vigência não superior a 1 (um) ano. A jurisprudência do TCU (Acórdão 1.786/2020-Plenário) exige motivação fundamentada no processo administrativo, vedando o uso reiterado da hipótese para mascarar falhas de planejamento.',
    tags: ['licitação', 'emergência', 'contratação direta', 'Lei 14.133/21'],
    category: 'Contratos Públicos',
    quality_score: 94,
    usage_count: 12,
    source_type: 'auto_extracted',
    status: 'active',
    created_at: '2026-02-15T10:00:00Z',
  },
  {
    id: 't002',
    title: 'Responsabilidade civil objetiva por erro médico em hospital público',
    summary: 'Estado responde objetivamente por falha na prestação de serviço médico, independentemente de culpa do agente, com base no art. 37, §6º, CF/88.',
    legal_area_id: 'civil',
    document_type_id: 'peticao_inicial',
    content: 'A responsabilidade civil objetiva do Estado por erro médico ocorrido em hospital público fundamenta-se no art. 37, §6º, da Constituição Federal. O STJ (REsp 1.642.999/RS) consolidou o entendimento de que basta a comprovação do nexo causal entre a conduta omissiva ou comissiva do agente estatal e o dano sofrido, dispensando a demonstração de culpa. O dano moral é presumido quando demonstrada a falha no dever de cuidado (teoria do risco administrativo). O prazo prescricional é de 5 anos (Decreto 20.910/32) para demandas contra a Fazenda Pública.',
    tags: ['responsabilidade civil', 'erro médico', 'Estado', 'CF art. 37'],
    category: 'Responsabilidade Estatal',
    quality_score: 89,
    usage_count: 7,
    source_type: 'auto_extracted',
    status: 'active',
    created_at: '2026-02-20T14:00:00Z',
  },
  {
    id: 't003',
    title: 'Ônus da prova da justa causa (art. 818 CLT)',
    summary: 'O empregador tem o ônus de provar a falta grave que fundamenta a justa causa, por ser fato constitutivo de seu direito (art. 818, I, CLT).',
    legal_area_id: 'labor',
    document_type_id: 'contestacao',
    content: 'Cabe ao empregador o ônus de provar a ocorrência da falta grave que enseja a dispensa por justa causa, pois trata-se de fato constitutivo do direito do réu (art. 818, I, CLT c/c art. 373, II, CPC/2015). A Súmula 212 do TST reforça que o ônus da prova do término do contrato por justa causa é do empregador. A prova deve ser robusta e contemporânea ao ato faltoso, vedada a chamada "reserva de provas" (OJ 330 SDI-1/TST). As hipóteses taxativas de justa causa estão no art. 482 da CLT, sendo vedada interpretação extensiva.',
    tags: ['ônus da prova', 'justa causa', 'CLT', 'dispensa'],
    category: 'Rescisão Contratual',
    quality_score: 96,
    usage_count: 15,
    source_type: 'auto_extracted',
    status: 'active',
    created_at: '2026-01-10T08:00:00Z',
  },
  {
    id: 't004',
    title: 'Prequestionamento implícito e Tema 988/STJ — taxatividade mitigada',
    summary: 'O STJ admite agravo de instrumento fora do rol do art. 1.015 CPC quando a urgência for demonstrada, e o prequestionamento implícito é suficiente para REsp.',
    legal_area_id: 'constitutional',
    document_type_id: 'recurso',
    content: 'O Tema 988/STJ (REsp 1.696.396/MT) firmou a taxatividade mitigada do rol do art. 1.015 do CPC/2015, admitindo agravo de instrumento contra decisões interlocutórias não listadas quando demonstrada urgência e inutilidade do aguardo do recurso de apelação. Quanto ao prequestionamento, o STJ aceita a modalidade implícita (art. 1.025 CPC), dispensando a menção expressa do dispositivo legal, desde que a matéria tenha sido debatida no acórdão recorrido. A oposição de embargos de declaração para fins de prequestionamento evita o trânsito em julgado prematuro (Súmula 418/STJ, superada após CPC/2015).',
    tags: ['recurso', 'prequestionamento', 'Tema 988', 'agravo instrumento'],
    category: 'Direito Processual',
    quality_score: 91,
    usage_count: 9,
    source_type: 'manual',
    status: 'active',
    created_at: '2026-01-25T09:30:00Z',
  },
  {
    id: 't005',
    title: 'ICMS-ST — repetição de indébito pelo contribuinte substituído',
    summary: 'Substituído tributário tem legitimidade para pleitear restituição do ICMS-ST recolhido a maior, desde que não tenha transferido o encargo ao consumidor final.',
    legal_area_id: 'tax',
    document_type_id: 'recurso',
    content: 'O STF, no RE 593.849/MG (Tema 201, repercussão geral), assegurou ao contribuinte substituído o direito à restituição do ICMS-ST recolhido a maior quando a base de cálculo real da operação for inferior à presumida. A legitimidade ativa é do substituído (varejista), não do substituto (indústria/atacado), pois é quem suportou o ônus econômico. A ação de repetição de indébito prescreve em 5 anos (art. 168, I, CTN — prazo extintivo) a contar do pagamento indevido. Exige-se prova de que o encargo não foi transferido ao consumidor final (art. 166, CTN), usualmente demonstrada por documentação contábil-fiscal.',
    tags: ['ICMS-ST', 'repetição indébito', 'substituição tributária', 'Tema 201'],
    category: 'Tributos Indiretos',
    quality_score: 88,
    usage_count: 5,
    source_type: 'auto_extracted',
    status: 'active',
    created_at: '2026-03-01T11:00:00Z',
  },
]

export const DEMO_THESES_STATS = {
  total_theses: 5,
  by_area: { administrative: 1, civil: 1, labor: 1, constitutional: 1, tax: 1 },
  average_quality_score: 92,
  most_used: [
    { id: 't003', title: 'Ônus da prova da justa causa (art. 818 CLT)', usage_count: 15 },
    { id: 't001', title: 'Dispensa de licitação por emergência (art. 75, VIII, Lei 14.133/21)', usage_count: 12 },
    { id: 't004', title: 'Prequestionamento implícito e Tema 988/STJ', usage_count: 9 },
  ],
}

// ── Daily stats (last 14 days) ─────────────────────────────────────────────
export const DEMO_STATS_DAILY = Array.from({ length: 14 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - (13 - i))
  const dia = d.toISOString().split('T')[0]
  const total = Math.floor(Math.random() * 5) + 1
  return { dia, total, concluidos: total - (Math.random() > 0.8 ? 1 : 0), custo: +(Math.random() * 0.4).toFixed(4) }
})

// ── Agent stats ────────────────────────────────────────────────────────────
export const DEMO_STATS_AGENTS = [
  { agent_name: 'redator', chamadas: 42, tokens_in_medio: 9800, tokens_out_medio: 6200, custo_total: 4.12, tempo_medio_ms: 34200 },
  { agent_name: 'revisor', chamadas: 42, tokens_in_medio: 8100, tokens_out_medio: 5800, custo_total: 3.78, tempo_medio_ms: 28500 },
  { agent_name: 'jurista', chamadas: 42, tokens_in_medio: 7600, tokens_out_medio: 2800, custo_total: 2.04, tempo_medio_ms: 18700 },
  { agent_name: 'jurista_v2', chamadas: 42, tokens_in_medio: 6200, tokens_out_medio: 2400, custo_total: 1.68, tempo_medio_ms: 15900 },
  { agent_name: 'fact_checker', chamadas: 42, tokens_in_medio: 5400, tokens_out_medio: 1800, custo_total: 1.18, tempo_medio_ms: 12300 },
  { agent_name: 'moderador_plano', chamadas: 42, tokens_in_medio: 4800, tokens_out_meio: 1600, custo_total: 0.84, tempo_medio_ms: 10400 },
  { agent_name: 'advogado_diabo', chamadas: 42, tokens_in_medio: 4600, tokens_out_medio: 1500, custo_total: 0.79, tempo_medio_ms: 9800 },
  { agent_name: 'triagem', chamadas: 42, tokens_in_medio: 280, tokens_out_medio: 120, custo_total: 0.04, tempo_medio_ms: 1200 },
]

// ── Recent docs ─────────────────────────────────────────────────────────────
export const DEMO_STATS_RECENT = [
  { id: 'doc-1', document_type_id: 'parecer', tema: 'Nepotismo cruzado no serviço público municipal', status: 'concluido', quality_score: 95, created_at: new Date(Date.now() - 2e6).toISOString() },
  { id: 'doc-2', document_type_id: 'parecer', tema: 'Improbidade administrativa em contrato de locação', status: 'concluido', quality_score: 91, created_at: new Date(Date.now() - 8e6).toISOString() },
  { id: 'doc-3', document_type_id: 'peticao_inicial', tema: 'Irregularidades em licitação — Lei 14.133/21', status: 'concluido', quality_score: 88, created_at: new Date(Date.now() - 2e7).toISOString() },
  { id: 'doc-4', document_type_id: 'contestacao', tema: 'Defesa em ação de improbidade', status: 'processando', quality_score: null, created_at: new Date(Date.now() - 3e5).toISOString() },
  { id: 'doc-5', document_type_id: 'recurso', tema: 'Apelação — contrato irregular de serviços', status: 'concluido', quality_score: 82, created_at: new Date(Date.now() - 4e7).toISOString() },
]

// ── Executions for demo doc ─────────────────────────────────────────────────
export const DEMO_EXECUTIONS = [
  { id: 'ex-1', agent_name: 'triagem', phase: 'triagem', model: 'anthropic/claude-3.5-haiku', tokens_in: 280, tokens_out: 118, cost_usd: 0.0009, duration_ms: 1240, created_at: new Date(Date.now() - 60e4).toISOString() },
  { id: 'ex-2', agent_name: 'moderador_agenda', phase: 'deliberacao', model: 'anthropic/claude-sonnet-4', tokens_in: 6200, tokens_out: 1840, cost_usd: 0.0461, duration_ms: 12800, created_at: new Date(Date.now() - 58e4).toISOString() },
  { id: 'ex-3', agent_name: 'jurista', phase: 'deliberacao', model: 'anthropic/claude-sonnet-4', tokens_in: 7600, tokens_out: 2780, cost_usd: 0.0645, duration_ms: 18700, created_at: new Date(Date.now() - 45e4).toISOString() },
  { id: 'ex-4', agent_name: 'advogado_diabo', phase: 'deliberacao', model: 'anthropic/claude-sonnet-4', tokens_in: 4600, tokens_out: 1480, cost_usd: 0.0360, duration_ms: 9800, created_at: new Date(Date.now() - 36e4).toISOString() },
  { id: 'ex-5', agent_name: 'jurista_v2', phase: 'deliberacao', model: 'anthropic/claude-sonnet-4', tokens_in: 6200, tokens_out: 2400, cost_usd: 0.0546, duration_ms: 15900, created_at: new Date(Date.now() - 26e4).toISOString() },
  { id: 'ex-6', agent_name: 'fact_checker', phase: 'verificacao', model: 'anthropic/claude-sonnet-4', tokens_in: 5400, tokens_out: 1800, cost_usd: 0.0432, duration_ms: 12300, created_at: new Date(Date.now() - 20e4).toISOString() },
  { id: 'ex-7', agent_name: 'moderador_plano', phase: 'planejamento', model: 'anthropic/claude-sonnet-4', tokens_in: 4800, tokens_out: 1600, cost_usd: 0.0384, duration_ms: 10400, created_at: new Date(Date.now() - 14e4).toISOString() },
  { id: 'ex-8', agent_name: 'redator', phase: 'redacao', model: 'anthropic/claude-sonnet-4', tokens_in: 9800, tokens_out: 6200, cost_usd: 0.1224, duration_ms: 34200, created_at: new Date(Date.now() - 8e4).toISOString() },
  { id: 'ex-9', agent_name: 'revisor', phase: 'revisao', model: 'anthropic/claude-sonnet-4', tokens_in: 8100, tokens_out: 5800, cost_usd: 0.1113, duration_ms: 28500, created_at: new Date(Date.now() - 2e4).toISOString() },
]

/**
 * Client-side document generation service — Multi-agent pipeline.
 *
 * When IS_FIREBASE = true (no backend), this service handles the full
 * document generation pipeline directly in the browser via OpenRouter:
 *
 * Pipeline stages (mirrors backend orchestrator):
 * 1. Triagem       — Extract structured info (Haiku, fast)
 * 2. Pesquisador   — Legal research synthesis (Sonnet)
 * 3. Jurista       — Initial thesis development (Sonnet)
 * 4. Advogado Diabo — Counter-arguments critique (Sonnet)
 * 5. Jurista v2    — Refined theses after critique (Sonnet)
 * 6. Fact-checker  — Verify legal citations (Haiku, strict)
 * 7. Moderador     — Outline/plan the final document (Sonnet)
 * 8. Redator       — Write the full document (Sonnet, 10k tokens)
 *
 * The API key is read from Firestore /settings/platform (admin-only).
 */

import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { firestore } from './firebase'
import { callLLM } from './llm-client'
import { loadAgentModels, type AgentModelMap } from './model-config'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenerationProgress {
  phase: string
  message: string
  percent: number
}

type ProgressCallback = (p: GenerationProgress) => void

// ── API key retrieval ─────────────────────────────────────────────────────────

async function getOpenRouterKey(): Promise<string> {
  // Try environment variable first (works without Firestore admin setup)
  const envKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined
  if (envKey && envKey.startsWith('sk-')) return envKey

  // Fall back to Firestore /settings/platform
  if (!firestore) throw new Error('Firestore não configurado')
  const ref = doc(firestore, 'settings', 'platform')
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error(
      'Configurações não encontradas. Configure a API key do OpenRouter no Painel Administrativo ou defina VITE_OPENROUTER_API_KEY.',
    )
  }
  const data = snap.data()
  // API keys stored under api_keys nested object by settings-store
  const apiKeys = (data?.api_keys ?? {}) as Record<string, string>
  const key = apiKeys.openrouter_api_key ?? (data?.openrouter_api_key as string | undefined)
  if (!key || !key.startsWith('sk-')) {
    throw new Error(
      'API key do OpenRouter não configurada. Acesse o Painel Administrativo → Chaves de API.',
    )
  }
  return key
}

// ── Document type metadata ────────────────────────────────────────────────────

const DOC_TYPE_NAMES: Record<string, string> = {
  parecer: 'Parecer Jurídico',
  peticao_inicial: 'Petição Inicial',
  contestacao: 'Contestação',
  recurso: 'Recurso',
  acao_civil_publica: 'Ação Civil Pública',
  sentenca: 'Sentença',
  mandado_seguranca: 'Mandado de Segurança',
  habeas_corpus: 'Habeas Corpus',
  agravo: 'Agravo de Instrumento',
  embargos_declaracao: 'Embargos de Declaração',
}

const AREA_NAMES: Record<string, string> = {
  administrative: 'Direito Administrativo',
  constitutional: 'Direito Constitucional',
  civil: 'Direito Civil',
  tax: 'Direito Tributário',
  labor: 'Direito do Trabalho',
  criminal: 'Direito Penal',
  criminal_procedure: 'Processo Penal',
  civil_procedure: 'Processo Civil',
  consumer: 'Direito do Consumidor',
  environmental: 'Direito Ambiental',
  business: 'Direito Empresarial',
  family: 'Direito de Família',
  inheritance: 'Direito das Sucessões',
  social_security: 'Direito Previdenciário',
  electoral: 'Direito Eleitoral',
  international: 'Direito Internacional',
  digital: 'Direito Digital',
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildTriageSystem(docType: string): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  return [
    'Você é o TRIADOR JURÍDICO especialista em análise de demandas.',
    '',
    `Sua função é analisar a solicitação para elaboração de ${typeName}`,
    'e extrair as informações essenciais: tema principal, subtemas,',
    'palavras-chave para pesquisa, tipo de ação e fundamento legal.',
    '',
    'Responda APENAS JSON:',
    '{',
    '  "tema": "resumo em 1 frase do tema principal",',
    '  "subtemas": ["subtema1", "subtema2"],',
    '  "palavras_chave": ["palavra1", "palavra2"],',
    '  "area_direito": "área principal do direito",',
    '  "fundamento_legal": ["lei/artigo1", "lei/artigo2"],',
    '  "observacoes": "notas relevantes"',
    '}',
  ].join('\n')
}

function buildTriageUser(
  request: string,
  areas: string[],
  context?: Record<string, unknown> | null,
): string {
  const areaNames = areas.map(a => AREA_NAMES[a] ?? a).join(', ')
  const parts = [`<solicitacao>${request}</solicitacao>`]
  if (areaNames) parts.push(`<areas>${areaNames}</areas>`)
  if (context && Object.keys(context).length > 0) {
    parts.push(`<contexto>${JSON.stringify(context)}</contexto>`)
  }
  parts.push('Analise a solicitação e extraia as informações. Responda APENAS em JSON.')
  return parts.join('\n')
}

function buildRedatorSystem(
  docType: string,
  tema: string,
): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  return [
    `Você é REDATOR JURÍDICO SÊNIOR com vasta experiência, especialista em ${typeName}.`,
    '',
    '<regra_absoluta>',
    `CADA parágrafo deve tratar de "${tema}". Conteúdo genérico = REJEITADO.`,
    `O documento deve ser PERSUASIVO — escrito para CONVENCER o julgador.`,
    'A fundamentação deve ser DENSA e PROFUNDA, com citações precisas.',
    '</regra_absoluta>',
    '',
    '<anti_alucinacao>',
    'NUNCA invente leis, artigos, jurisprudência ou números de processo.',
    'Lei 8.666/93 REVOGADA — use 14.133/21.',
    'CPC/1973 REVOGADO — use CPC/2015 (Lei 13.105/15).',
    'CC/1916 REVOGADO — use CC/2002 (Lei 10.406/02).',
    'CLT: considere a reforma trabalhista (Lei 13.467/17).',
    'Use APENAS leis notórias que você sabe que existem.',
    'Para jurisprudência: cite súmulas por número e tribunal (ex: "Súmula 331 do TST"),',
    'teses fixadas (ex: "Tema 1.046 de repercussão geral do STF"),',
    'ou posição genérica (ex: "conforme jurisprudência consolidada do STJ").',
    'NUNCA invente número de REsp, RE, MS, AgInt ou relator.',
    '</anti_alucinacao>',
    '',
    '<citacoes_obrigatorias>',
    'O documento DEVE conter:',
    '- Pelo menos 5 referências a artigos de lei com número, ano e dispositivo',
    '- Pelo menos 3 menções a jurisprudência (súmulas, teses fixadas, entendimento)',
    '- Pelo menos 2 referências doutrinárias (autor e obra)',
    '- Menção a princípios constitucionais pertinentes com artigo da CF/88',
    'Integre as citações NATURALMENTE no texto, como em peça jurídica real.',
    '</citacoes_obrigatorias>',
    '',
    '<estrutura>',
    `Redija ${typeName} COMPLETO com:`,
    '- Qualificação das partes (use dados fornecidos ou ___ como placeholder)',
    '- Dos Fatos (narração cronológica, mínimo 4 parágrafos densos)',
    '- Do Direito (fundamentação legal robusta, mínimo 4 subseções):',
    '  * Fundamentação constitucional',
    '  * Fundamentação legal infraconstitucional',
    '  * Fundamentação jurisprudencial',
    '  * Fundamentação doutrinária',
    '- Dos Pedidos (claros, determinados, específicos, com base legal)',
    '- Valor da causa (se aplicável)',
    '</estrutura>',
    '',
    '<conectivos>',
    'USE conectivos VARIADOS. Cada conectivo NO MÁXIMO 2x:',
    'Nesse sentido | Outrossim | Com efeito | Nessa esteira | Dessa sorte |',
    'Ademais | Importa destacar | Cumpre observar | De outro lado | Por sua vez |',
    'Destarte | Vale dizer | Convém ressaltar | Sob essa ótica | Ante o exposto |',
    'Nessa toada | É cediço que | Data maxima venia | Salvo melhor juízo',
    '</conectivos>',
    '',
    '<formato>',
    'Texto PURO. Sem markdown. Títulos em MAIÚSCULAS.',
    'Parágrafos separados por duas quebras de linha.',
    'NÃO inclua endereçamento, fecho ("Nestes termos, pede deferimento"),',
    'data ou assinatura — esses elementos são adicionados externamente.',
    '</formato>',
  ].join('\n')
}

function buildRedatorUser(
  docType: string,
  request: string,
  triagem: string,
  areas: string[],
  context?: Record<string, unknown> | null,
  pesquisa?: string,
  tesesVerificadas?: string,
  plano?: string,
): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const areaNames = areas.map(a => AREA_NAMES[a] ?? a).join(', ')
  const parts = [
    `<tipo>${typeName}</tipo>`,
    `<solicitacao>${request}</solicitacao>`,
    `<triagem>${triagem}</triagem>`,
  ]
  if (areaNames) parts.push(`<areas>${areaNames}</areas>`)
  if (context && Object.keys(context).length > 0) {
    parts.push(`<contexto>${JSON.stringify(context)}</contexto>`)
  }
  if (pesquisa) parts.push(`<pesquisa>${pesquisa}</pesquisa>`)
  if (tesesVerificadas) parts.push(`<teses_verificadas>${tesesVerificadas}</teses_verificadas>`)
  if (plano) parts.push(`<plano>${plano}</plano>`)
  parts.push(
    `Redija ${typeName} COMPLETO sobre o tema indicado na triagem.`,
    'Siga a estrutura exigida. Texto puro, sem markdown.',
    'Separe cada parágrafo com linha em branco.',
  )
  return parts.join('\n')
}

// ── Advanced agent prompt builders ────────────────────────────────────────────

function buildPesquisadorSystem(docType: string, tema: string): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  return [
    `Você é PESQUISADOR JURÍDICO SÊNIOR, preparando material aprofundado para ${typeName}.`,
    '',
    `Tema: "${tema}"`,
    '',
    'Sua função é produzir uma PESQUISA JURÍDICA EXAUSTIVA:',
    '',
    '1. LEGISLAÇÃO APLICÁVEL (mínimo 5 referências):',
    '   - Cite artigos específicos da Constituição Federal/1988 com inciso e alínea',
    '   - Leis federais e estaduais aplicáveis com número e ano (ex: Lei 14.133/2021, art. 5º, II)',
    '   - Decretos regulamentadores, resoluções, portarias pertinentes',
    '   - Súmulas vinculantes e súmulas do STF/STJ aplicáveis',
    '',
    '2. JURISPRUDÊNCIA CONSOLIDADA (mínimo 3 referências):',
    '   - Teses fixadas em repercussão geral e recursos repetitivos',
    '   - Referências genéricas como "conforme jurisprudência pacífica do STF" ou "segundo entendimento consolidado do STJ"',
    '   - Súmulas vinculantes e súmulas do STJ aplicáveis (citar número)',
    '   - NUNCA invente números de processo, recurso ou relator',
    '',
    '3. DOUTRINA RELEVANTE (mínimo 2 referências):',
    '   - Cite autores reconhecidos e suas obras (ex: Hely Lopes Meirelles, Direito Administrativo Brasileiro)',
    '   - Celso Antônio Bandeira de Mello, Maria Sylvia Di Pietro, Luís Roberto Barroso, etc.',
    '   - Caio Mário, Pontes de Miranda, Nelson Nery Jr., Fredie Didier, Daniel Amorim, etc.',
    '   - Inclua a posição doutrinária de cada autor sobre o tema',
    '',
    '4. PRINCÍPIOS CONSTITUCIONAIS E GERAIS DO DIREITO:',
    '   - Princípios diretamente aplicáveis ao caso (legalidade, proporcionalidade, etc.)',
    '   - Fundamente cada princípio com artigo constitucional',
    '',
    'REGRA ABSOLUTA: NUNCA invente leis, artigos, números de processo ou autores.',
    'Use APENAS referências notórias que você tem certeza de que existem.',
    'Responda em texto estruturado com seções claras e bem fundamentadas.',
  ].join('\n')
}

function buildJuristaSystem(docType: string, tema: string): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  return [
    `Você é JURISTA SÊNIOR com décadas de experiência, desenvolvendo teses para ${typeName}.`,
    '',
    `Tema: "${tema}"`,
    '',
    'Desenvolva 3 a 5 teses jurídicas ROBUSTAS e BEM FUNDAMENTADAS:',
    '',
    'Para CADA tese, inclua obrigatoriamente:',
    '1. TÍTULO claro e objetivo da tese',
    '2. FUNDAMENTO LEGAL específico (lei, artigo, inciso, alínea)',
    '3. ARGUMENTAÇÃO jurídica aprofundada (mínimo 2 parágrafos)',
    '4. JURISPRUDÊNCIA de apoio (súmulas, teses fixadas, entendimento consolidado)',
    '5. DOUTRINA favorável (autor, obra, posição)',
    '6. PRINCÍPIOS constitucionais que sustentam a tese',
    '',
    'As teses devem ser COMPLEMENTARES, não redundantes.',
    'Ordene da mais forte (principal) para a subsidiária.',
    'Considere teses processuais E de mérito.',
    'Cada tese deve ser suficiente para sustentar o pedido sozinha.',
    '',
    'NUNCA invente leis, jurisprudência, números de processo ou autores.',
    'Use apenas referências notórias e verificáveis.',
  ].join('\n')
}

function buildAdvogadoDiaboSystem(tema: string): string {
  return [
    'Você é ADVOGADO DO DIABO — crítico implacável de argumentos jurídicos.',
    '',
    `Tema: "${tema}"`,
    '',
    'Analise as teses apresentadas e:',
    '1. Identifique FRAQUEZAS em cada argumento',
    '2. Aponte possíveis contra-argumentos da parte adversa',
    '3. Verifique se há leis revogadas ou jurisprudência superada',
    '4. Sugira MELHORIAS específicas para fortalecer cada tese',
    '',
    'Seja rigoroso mas construtivo. O objetivo é fortalecer o documento.',
  ].join('\n')
}

function buildJuristaV2System(docType: string, tema: string): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  return [
    `Você é JURISTA SÊNIOR (revisão), refinando teses para ${typeName}.`,
    '',
    `Tema: "${tema}"`,
    '',
    'Com base nas teses originais E nas críticas do advogado do diabo:',
    '1. FORTALEÇA cada tese incorporando as sugestões válidas',
    '2. DESCARTE teses que não resistiram à crítica',
    '3. ADICIONE novas teses se necessário',
    '4. Garanta que cada tese tenha fundamento legal sólido',
    '',
    'NUNCA invente leis ou jurisprudência. Use apenas referências notórias.',
    'Lei 8.666/93 REVOGADA — use 14.133/21.',
    'CPC/1973 REVOGADO — use CPC/2015.',
  ].join('\n')
}

function buildFactCheckerSystem(): string {
  return [
    'Você é FACT-CHECKER JURÍDICO com rigor máximo e expertise em legislação brasileira.',
    '',
    'Verifique as teses jurídicas apresentadas com EXTREMO RIGOR:',
    '',
    '1. Para CADA lei/artigo citado:',
    '   - CONFIRME se a lei existe e está VIGENTE',
    '   - Verifique se o artigo citado trata do assunto referido',
    '   - Identifique se houve alterações recentes no dispositivo',
    '',
    '2. Para CADA referência jurisprudencial:',
    '   - Verifique se a súmula citada existe e seu conteúdo é pertinente',
    '   - Verifique se o entendimento mencionado é atual',
    '   - Identifique se houve superação ou revisão de tese',
    '',
    '3. Para CADA referência doutrinária:',
    '   - Verifique se o autor é reconhecido na área',
    '   - Verifique se a obra citada existe',
    '',
    'Leis sabidamente REVOGADAS (verificar sempre):',
    '- Lei 8.666/93 → usar Lei 14.133/21 (Nova Lei de Licitações)',
    '- CPC/1973 (Lei 5.869/73) → usar CPC/2015 (Lei 13.105/15)',
    '- CC/1916 → usar CC/2002 (Lei 10.406/02)',
    '- CLT: verificar reformas de 2017 (Lei 13.467/17)',
    '- Lei 11.101/05: verificar alterações pela Lei 14.112/20',
    '- CDC (Lei 8.078/90): verificar atualizações',
    '',
    'Retorne as teses CORRIGIDAS, marcando alterações com [CORRIGIDO].',
    'ADICIONE citações faltantes onde necessário com [ADICIONADO].',
    'Se tudo estiver correto, retorne as teses com [VERIFICADO].',
  ].join('\n')
}

function buildModeradorSystem(docType: string, tema: string): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  return [
    `Você é MODERADOR/PLANEJADOR especialista em ${typeName}.`,
    '',
    `Tema: "${tema}"`,
    '',
    `Com base em toda a pesquisa e teses verificadas, elabore um PLANO DETALHADO para ${typeName}:`,
    '',
    '1. ESTRUTURA do documento (seções e subseções com títulos)',
    '2. Para cada seção:',
    '   - Quais argumentos e teses usar',
    '   - Quais leis e artigos ESPECÍFICOS citar (número, ano, dispositivo)',
    '   - Quais súmulas e jurisprudência mencionar',
    '   - Qual doutrina referenciar (autor + obra)',
    '   - Tom e linguagem adequados',
    '3. ORDEM de apresentação (do mais forte ao subsidiário)',
    '4. CONEXÕES lógicas entre seções (como cada parte reforça a seguinte)',
    '5. CITAÇÕES MÍNIMAS por seção:',
    '   - Dos Fatos: 1-2 referências legais contextuais',
    '   - Do Direito: 3-5 artigos de lei + 2-3 jurisprudência + 1-2 doutrina por subseção',
    '   - Dos Pedidos: referência legal para cada pedido',
    '',
    'O plano deve ser COMPLETO e DETALHADO — o redator seguirá este roteiro.',
    'Priorize PROFUNDIDADE e PRECISÃO nas referências legais.',
  ].join('\n')
}

// ── Main generation function ──────────────────────────────────────────────────

/**
 * Generate a legal document using OpenRouter LLM — full multi-agent pipeline.
 *
 * Pipeline stages:
 * 1. Triagem (Haiku) → structured extraction
 * 2. Pesquisador (Sonnet) → legal research
 * 3. Jurista (Sonnet) → initial theses
 * 4. Advogado do Diabo (Sonnet) → critique
 * 5. Jurista v2 (Sonnet) → refined theses
 * 6. Fact-checker (Haiku) → verify citations
 * 7. Moderador (Sonnet) → document plan
 * 8. Redator (Sonnet) → final document text
 */
export async function generateDocument(
  uid: string,
  docId: string,
  docType: string,
  request: string,
  areas: string[],
  context?: Record<string, unknown> | null,
  onProgress?: ProgressCallback,
): Promise<void> {
  if (!firestore) throw new Error('Firestore não configurado')

  const docRef = doc(firestore, 'users', uid, 'documents', docId)

  // Update status to "processando"
  await updateDoc(docRef, {
    status: 'processando',
    updated_at: new Date().toISOString(),
  })

  try {
    // 1. Get API key and model configuration
    onProgress?.({ phase: 'config', message: 'Carregando configurações...', percent: 2 })
    const apiKey = await getOpenRouterKey()
    const agentModels: AgentModelMap = await loadAgentModels()

    // Model shortcuts — use admin-configured models, falling back to defaults
    const modelTriagem      = agentModels.triagem       ?? 'anthropic/claude-3.5-haiku'
    const modelPesquisador  = agentModels.pesquisador    ?? 'anthropic/claude-sonnet-4'
    const modelJurista      = agentModels.jurista        ?? 'anthropic/claude-sonnet-4'
    const modelAdvDiabo     = agentModels.advogado_diabo ?? 'anthropic/claude-sonnet-4'
    const modelJuristaV2    = agentModels.jurista_v2     ?? 'anthropic/claude-sonnet-4'
    const modelFactChecker  = agentModels.fact_checker   ?? 'anthropic/claude-3.5-haiku'
    const modelModerador    = agentModels.moderador      ?? 'anthropic/claude-sonnet-4'
    const modelRedator      = agentModels.redator        ?? 'anthropic/claude-sonnet-4'

    // 2. Triage — extract structured info from the request
    onProgress?.({ phase: 'triagem', message: 'Analisando solicitação...', percent: 5 })
    const triageResult = await callLLM(
      apiKey,
      buildTriageSystem(docType),
      buildTriageUser(request, areas, context),
      modelTriagem, 800, 0.1,
    )

    // Extract tema from triage JSON
    let tema = ''
    try {
      const triageJson = JSON.parse(triageResult.content)
      tema = triageJson.tema || request.slice(0, 100)
    } catch {
      tema = request.slice(0, 100)
    }
    await updateDoc(docRef, { tema })

    // 3. Pesquisador — legal research synthesis
    onProgress?.({ phase: 'pesquisador', message: 'Pesquisando legislação e jurisprudência...', percent: 15 })
    const pesquisaResult = await callLLM(
      apiKey,
      buildPesquisadorSystem(docType, tema),
      `<triagem>${triageResult.content}</triagem>\n<solicitacao>${request}</solicitacao>\nRealize pesquisa jurídica EXAUSTIVA sobre o tema. Inclua legislação, jurisprudência, doutrina e princípios constitucionais.`,
      modelPesquisador, 4000, 0.3,
    )

    // 4. Jurista — initial thesis development
    onProgress?.({ phase: 'jurista', message: 'Desenvolvendo teses jurídicas...', percent: 28 })
    const juristaResult = await callLLM(
      apiKey,
      buildJuristaSystem(docType, tema),
      `<triagem>${triageResult.content}</triagem>\n<pesquisa>${pesquisaResult.content}</pesquisa>\nDesenvolva teses jurídicas ROBUSTAS e BEM FUNDAMENTADAS com citações legais precisas.`,
      modelJurista, 4000, 0.3,
    )

    // 5. Advogado do Diabo — critique
    onProgress?.({ phase: 'advogado_diabo', message: 'Analisando contra-argumentos...', percent: 40 })
    const criticaResult = await callLLM(
      apiKey,
      buildAdvogadoDiaboSystem(tema),
      `<teses>${juristaResult.content}</teses>\nCritique estas teses rigorosamente. Identifique fraquezas e sugira melhorias específicas.`,
      modelAdvDiabo, 2500, 0.4,
    )

    // 6. Jurista v2 — refined theses
    onProgress?.({ phase: 'jurista_v2', message: 'Refinando teses após crítica...', percent: 52 })
    const juristaV2Result = await callLLM(
      apiKey,
      buildJuristaV2System(docType, tema),
      `<teses_originais>${juristaResult.content}</teses_originais>\n<criticas>${criticaResult.content}</criticas>\nRefine as teses incorporando as críticas válidas. Fortaleça a fundamentação legal.`,
      modelJuristaV2, 4000, 0.3,
    )

    // 7. Fact-checker — verify legal citations
    onProgress?.({ phase: 'fact_checker', message: 'Verificando citações legais...', percent: 62 })
    const factCheckResult = await callLLM(
      apiKey,
      buildFactCheckerSystem(),
      `<teses>${juristaV2Result.content}</teses>\nVerifique TODAS as citações legais. Corrija imprecisões e adicione referências faltantes.`,
      modelFactChecker, 4000, 0.1,
    )

    // 8. Moderador — document plan
    onProgress?.({ phase: 'moderador', message: 'Planejando estrutura do documento...', percent: 72 })
    const planoResult = await callLLM(
      apiKey,
      buildModeradorSystem(docType, tema),
      `<pesquisa>${pesquisaResult.content}</pesquisa>\n<teses_verificadas>${factCheckResult.content}</teses_verificadas>\nElabore plano DETALHADO com citações específicas para cada seção.`,
      modelModerador, 2000, 0.2,
    )

    // 9. Redator — write the full document
    onProgress?.({ phase: 'redacao', message: 'Redigindo documento completo...', percent: 82 })
    const docResult = await callLLM(
      apiKey,
      buildRedatorSystem(docType, tema),
      buildRedatorUser(
        docType, request, triageResult.content, areas, context,
        pesquisaResult.content, factCheckResult.content, planoResult.content,
      ),
      modelRedator, 10000, 0.3,
    )

    // 10. Save the generated text
    onProgress?.({ phase: 'salvando', message: 'Salvando documento...', percent: 95 })
    await updateDoc(docRef, {
      texto_completo: docResult.content,
      status: 'concluido',
      quality_score: 80,
      updated_at: new Date().toISOString(),
    })

    onProgress?.({ phase: 'concluido', message: 'Documento gerado com sucesso!', percent: 100 })
  } catch (err) {
    // Update status to error
    await updateDoc(docRef, {
      status: 'erro',
      updated_at: new Date().toISOString(),
    }).catch(() => {}) // Ignore update errors
    throw err
  }
}

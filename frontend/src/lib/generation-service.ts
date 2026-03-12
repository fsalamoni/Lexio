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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenerationProgress {
  phase: string
  message: string
  percent: number
}

type ProgressCallback = (p: GenerationProgress) => void

// ── API key retrieval ─────────────────────────────────────────────────────────

async function getOpenRouterKey(): Promise<string> {
  if (!firestore) throw new Error('Firestore não configurado')
  const ref = doc(firestore, 'settings', 'platform')
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error(
      'Configurações não encontradas. Configure a API key do OpenRouter no Painel Administrativo.',
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
    `Você é REDATOR JURÍDICO SÊNIOR, especialista em ${typeName}.`,
    '',
    '<regra_absoluta>',
    `CADA parágrafo deve tratar de "${tema}". Conteúdo genérico = REJEITADO.`,
    `O documento deve ser PERSUASIVO — escrito para CONVENCER.`,
    '</regra_absoluta>',
    '',
    '<anti_alucinacao>',
    'NUNCA invente leis, artigos, jurisprudência ou números de processo.',
    'Lei 8.666/93 REVOGADA — use 14.133/21.',
    'CPC/1973 REVOGADO — use CPC/2015.',
    'CC/1916 REVOGADO — use CC/2002.',
    'Use APENAS leis notórias que você sabe que existem.',
    'Para jurisprudência: use "conforme jurisprudência consolidada do STF/STJ"',
    '— NUNCA invente número de REsp, RE, MS ou relator.',
    '</anti_alucinacao>',
    '',
    '<estrutura>',
    `Redija ${typeName} COMPLETO com:`,
    '- Qualificação das partes (use dados fornecidos ou ___ como placeholder)',
    '- Dos Fatos (narração cronológica, mínimo 4 parágrafos)',
    '- Do Direito (fundamentação legal robusta, mínimo 3 subseções)',
    '- Dos Pedidos (claros, determinados, específicos)',
    '- Valor da causa (se aplicável)',
    '</estrutura>',
    '',
    '<conectivos>',
    'USE conectivos VARIADOS. Cada conectivo NO MÁXIMO 2x:',
    'Nesse sentido | Outrossim | Com efeito | Nessa esteira | Dessa sorte |',
    'Ademais | Importa destacar | Cumpre observar | De outro lado | Por sua vez |',
    'Destarte | Vale dizer | Convém ressaltar | Sob essa ótica | Ante o exposto',
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
    `Você é PESQUISADOR JURÍDICO especialista, preparando material para ${typeName}.`,
    '',
    `Tema: "${tema}"`,
    '',
    'Sua função é sintetizar o conhecimento jurídico relevante:',
    '- Legislação aplicável (leis, artigos, incisos)',
    '- Jurisprudência consolidada do STF/STJ (sem inventar números)',
    '- Doutrina relevante (autores notórios como Hely Lopes, Celso Antônio, etc.)',
    '- Princípios constitucionais aplicáveis',
    '',
    'NUNCA invente leis, artigos ou números de processo.',
    'Use apenas referências notórias que você sabe que existem.',
    'Responda em texto estruturado com seções claras.',
  ].join('\n')
}

function buildJuristaSystem(docType: string, tema: string): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  return [
    `Você é JURISTA SÊNIOR, desenvolvendo teses para ${typeName}.`,
    '',
    `Tema: "${tema}"`,
    '',
    'Desenvolva 3 a 5 teses jurídicas robustas:',
    '- Cada tese deve ter: título, fundamento legal, argumentação, jurisprudência',
    '- As teses devem ser COMPLEMENTARES, não redundantes',
    '- Ordene da mais forte para a subsidiária',
    '- Considere teses processuais E de mérito',
    '',
    'NUNCA invente leis ou jurisprudência. Use apenas referências notórias.',
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
    'Você é FACT-CHECKER JURÍDICO com rigor máximo.',
    '',
    'Verifique as teses jurídicas apresentadas:',
    '1. CONFIRME se cada lei/artigo citado existe e está vigente',
    '2. IDENTIFIQUE referências a leis revogadas',
    '3. VALIDE se a jurisprudência mencionada é coerente',
    '4. CORRIJA qualquer imprecisão legal',
    '',
    'Leis sabidamente REVOGADAS:',
    '- Lei 8.666/93 → usar Lei 14.133/21',
    '- CPC/1973 → usar CPC/2015 (Lei 13.105/15)',
    '- CC/1916 → usar CC/2002 (Lei 10.406/02)',
    '- CLT: verificar reformas de 2017 (Lei 13.467/17)',
    '',
    'Retorne as teses CORRIGIDAS, marcando alterações com [CORRIGIDO].',
    'Se tudo estiver correto, retorne as teses com [VERIFICADO].',
  ].join('\n')
}

function buildModeradorSystem(docType: string, tema: string): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  return [
    `Você é MODERADOR/PLANEJADOR de ${typeName}.`,
    '',
    `Tema: "${tema}"`,
    '',
    `Com base em toda a pesquisa e teses verificadas, elabore um PLANO DETALHADO para ${typeName}:`,
    '',
    '1. ESTRUTURA do documento (seções e subseções)',
    '2. Para cada seção: quais argumentos e teses usar',
    '3. ORDEM de apresentação (do mais forte ao subsidiário)',
    '4. Quais leis e jurisprudência citar em cada parte',
    '5. Tom e estilo adequados ao tipo de documento',
    '',
    'O plano deve ser COMPLETO e DETALHADO — o redator seguirá este roteiro.',
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
    // 1. Get API key
    onProgress?.({ phase: 'config', message: 'Carregando configurações...', percent: 2 })
    const apiKey = await getOpenRouterKey()

    const HAIKU = 'anthropic/claude-3.5-haiku'
    const SONNET = 'anthropic/claude-sonnet-4'

    // 2. Triage — extract structured info from the request
    onProgress?.({ phase: 'triagem', message: 'Analisando solicitação...', percent: 5 })
    const triageResult = await callLLM(
      apiKey,
      buildTriageSystem(docType),
      buildTriageUser(request, areas, context),
      HAIKU, 800, 0.1,
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
      `<triagem>${triageResult.content}</triagem>\n<solicitacao>${request}</solicitacao>\nRealize pesquisa jurídica aprofundada sobre o tema.`,
      SONNET, 3000, 0.3,
    )

    // 4. Jurista — initial thesis development
    onProgress?.({ phase: 'jurista', message: 'Desenvolvendo teses jurídicas...', percent: 28 })
    const juristaResult = await callLLM(
      apiKey,
      buildJuristaSystem(docType, tema),
      `<triagem>${triageResult.content}</triagem>\n<pesquisa>${pesquisaResult.content}</pesquisa>\nDesenvolva teses jurídicas robustas.`,
      SONNET, 3000, 0.3,
    )

    // 5. Advogado do Diabo — critique
    onProgress?.({ phase: 'advogado_diabo', message: 'Analisando contra-argumentos...', percent: 40 })
    const criticaResult = await callLLM(
      apiKey,
      buildAdvogadoDiaboSystem(tema),
      `<teses>${juristaResult.content}</teses>\nCritique estas teses rigorosamente.`,
      SONNET, 2000, 0.4,
    )

    // 6. Jurista v2 — refined theses
    onProgress?.({ phase: 'jurista_v2', message: 'Refinando teses após crítica...', percent: 52 })
    const juristaV2Result = await callLLM(
      apiKey,
      buildJuristaV2System(docType, tema),
      `<teses_originais>${juristaResult.content}</teses_originais>\n<criticas>${criticaResult.content}</criticas>\nRefine as teses incorporando as críticas válidas.`,
      SONNET, 3000, 0.3,
    )

    // 7. Fact-checker — verify legal citations
    onProgress?.({ phase: 'fact_checker', message: 'Verificando citações legais...', percent: 62 })
    const factCheckResult = await callLLM(
      apiKey,
      buildFactCheckerSystem(),
      `<teses>${juristaV2Result.content}</teses>\nVerifique todas as citações legais e corrija imprecisões.`,
      HAIKU, 3000, 0.1,
    )

    // 8. Moderador — document plan
    onProgress?.({ phase: 'moderador', message: 'Planejando estrutura do documento...', percent: 72 })
    const planoResult = await callLLM(
      apiKey,
      buildModeradorSystem(docType, tema),
      `<pesquisa>${pesquisaResult.content}</pesquisa>\n<teses_verificadas>${factCheckResult.content}</teses_verificadas>\nElabore o plano detalhado do documento.`,
      SONNET, 1500, 0.2,
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
      SONNET, 10000, 0.3,
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

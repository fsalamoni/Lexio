/**
 * Client-side document generation service.
 *
 * When IS_FIREBASE = true (no backend), this service handles the document
 * generation pipeline directly in the browser:
 *
 * 1. Read the OpenRouter API key from Firestore `/settings/platform`
 * 2. Build prompts based on document type, legal areas, and user request
 * 3. Call OpenRouter LLM (triage + redator) in sequence
 * 4. Update the document in Firestore with the generated text
 *
 * This is a simplified pipeline compared to the full backend orchestrator
 * (no vector search, no DOCX generation), but produces real legal documents.
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
  parts.push(
    `Redija ${typeName} COMPLETO sobre o tema indicado na triagem.`,
    'Siga a estrutura exigida. Texto puro, sem markdown.',
    'Separe cada parágrafo com linha em branco.',
  )
  return parts.join('\n')
}

// ── Main generation function ──────────────────────────────────────────────────

/**
 * Generate a legal document using OpenRouter LLM.
 *
 * @param uid      - Firebase user ID
 * @param docId    - Firestore document ID
 * @param docType  - Document type ID (e.g. 'parecer')
 * @param request  - Original user request text
 * @param areas    - Selected legal area IDs
 * @param context  - Optional structured context fields
 * @param onProgress - Optional progress callback
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
    onProgress?.({ phase: 'config', message: 'Carregando configurações...', percent: 5 })
    const apiKey = await getOpenRouterKey()

    // 2. Triage — extract structured info from the request
    onProgress?.({ phase: 'triagem', message: 'Analisando solicitação...', percent: 15 })
    const triageResult = await callLLM(
      apiKey,
      buildTriageSystem(docType),
      buildTriageUser(request, areas, context),
      'anthropic/claude-3.5-haiku',
      800,
      0.1,
    )

    // Extract tema from triage JSON
    let tema = ''
    try {
      const triageJson = JSON.parse(triageResult.content)
      tema = triageJson.tema || request.slice(0, 100)
    } catch {
      tema = request.slice(0, 100)
    }

    // Update tema
    await updateDoc(docRef, { tema })

    // 3. Generate the full document
    onProgress?.({ phase: 'redacao', message: 'Redigindo documento...', percent: 40 })
    const docResult = await callLLM(
      apiKey,
      buildRedatorSystem(docType, tema),
      buildRedatorUser(docType, request, triageResult.content, areas, context),
      'anthropic/claude-sonnet-4',
      10000,
      0.3,
    )

    // 4. Save the generated text
    onProgress?.({ phase: 'salvando', message: 'Salvando documento...', percent: 90 })
    await updateDoc(docRef, {
      texto_completo: docResult.content,
      status: 'concluido',
      quality_score: 75, // Default baseline score for client-side generation
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

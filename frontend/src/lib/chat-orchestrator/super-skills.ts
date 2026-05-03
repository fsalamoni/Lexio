/**
 * PR3 — Super-Skills de Pipeline
 *
 * Expõe os pipelines de geração de documentos jurídicos como skills do
 * orquestrador de chat. O usuário pode solicitar "gere uma petição inicial
 * sobre..." e o orquestrador dispara o pipeline correspondente via API REST.
 *
 * Cada super-skill:
 *  1. Valida os argumentos (tipo de documento, conteúdo, template)
 *  2. Chama `POST /api/v1/documents/` com o payload apropriado
 *  3. Emite eventos `super_skill_call` na trilha
 *  4. Retorna o status do pipeline (processando, concluído, erro)
 */

import type { ChatTrailEvent } from '../firestore-types'
import type { Skill, SkillContext, SkillResult } from './types'
import { hybridSearch } from '../search-client'

// ── Tipos de documento suportados ─────────────────────────────────────────────

/** Todos os document_type_id disponíveis nos pipelines existentes. */
export const PIPELINE_DOCUMENT_TYPES = [
  'parecer',
  'peticao_inicial',
  'contestacao',
  'recurso',
  'sentenca',
  'acao_civil_publica',
  'mandado_seguranca',
  'habeas_corpus',
  'agravo',
  'embargos_declaracao',
] as const

export type PipelineDocumentType = (typeof PIPELINE_DOCUMENT_TYPES)[number]

/** Mapeamento amigável para exibição na UI. */
export const PIPELINE_DOCUMENT_LABELS: Record<PipelineDocumentType, string> = {
  parecer: 'Parecer Jurídico',
  peticao_inicial: 'Petição Inicial',
  contestacao: 'Contestação',
  recurso: 'Recurso',
  sentenca: 'Sentença',
  acao_civil_publica: 'Ação Civil Pública',
  mandado_seguranca: 'Mandado de Segurança',
  habeas_corpus: 'Habeas Corpus',
  agravo: 'Agravo',
  embargos_declaracao: 'Embargos de Declaração',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString()
}

function clip(text: string, max = 500): string {
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

/**
 * Resolve a base URL para chamadas à API.
 * Em produção, usa a mesma origem; em desenvolvimento, aponta para localhost:8000.
 */
function resolveApiBase(): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:8000'
  }
  return ''
}

// ── Super-Skill: Gerar Documento Jurídico ─────────────────────────────────────

interface GenerateDocumentArgs {
  document_type?: string
  title?: string
  description?: string
  /** Fatos, perguntas ou contexto jurídico fornecido pelo usuário. */
  content?: string
  /** Variante de template (ex.: "generic", "apelacao", "merito"). */
  template_variant?: string
  /** Área do direito (ex.: "civil", "penal", "trabalhista"). */
  legal_area?: string
}

const generateDocumentSkill: Skill<GenerateDocumentArgs> = {
  name: 'generate_document',
  description:
    'Gera um documento jurídico completo usando os pipelines especializados. ' +
    'Tipos disponíveis: ' +
    PIPELINE_DOCUMENT_TYPES.map(d => `${d} (${PIPELINE_DOCUMENT_LABELS[d]})`).join(', ') +
    '. Use quando o usuário solicitar a redação de um documento jurídico formal ' +
    '(petição, parecer, contestação, recurso, sentença, etc.).',
  argsHint: {
    document_type: `Tipo de documento. Um de: ${PIPELINE_DOCUMENT_TYPES.join(', ')}`,
    title: 'Título descritivo do documento (ex.: "Petição Inicial — Indenização por Danos Morais")',
    description: 'Breve descrição do objetivo do documento',
    content:
      'Fatos, perguntas jurídicas, teses e contexto que o pipeline deve usar. ' +
      'Quanto mais detalhado, melhor o resultado.',
    template_variant: 'Variante de template (opcional). Ex.: "apelacao", "merito", "generic".',
    legal_area: 'Área do direito (opcional). Ex.: "civil", "penal", "trabalhista".',
  },
  async run(args, ctx): Promise<SkillResult> {
    const documentType = String(args.document_type ?? '').trim().toLowerCase()
    const title = String(args.title ?? '').trim()
    const description = String(args.description ?? '').trim()
    const content = String(args.content ?? '').trim()
    const templateVariant = String(args.template_variant ?? '').trim() || 'generic'
    const legalArea = String(args.legal_area ?? '').trim()

    // ── Validação ─────────────────────────────────────────────────────────
    if (!documentType) {
      return { tool_message: 'Erro: "document_type" é obrigatório. Informe o tipo de documento jurídico a ser gerado.' }
    }
    if (!PIPELINE_DOCUMENT_TYPES.includes(documentType as PipelineDocumentType)) {
      return {
        tool_message: `Erro: tipo de documento "${documentType}" não reconhecido. Tipos disponíveis: ${PIPELINE_DOCUMENT_TYPES.join(', ')}.`,
      }
    }
    if (!content) {
      return { tool_message: 'Erro: "content" é obrigatório. Forneça os fatos, perguntas e contexto jurídico para o pipeline.' }
    }

    const label = PIPELINE_DOCUMENT_LABELS[documentType as PipelineDocumentType]

    // ── Emitir evento de início ────────────────────────────────────────────
    const startEvent: ChatTrailEvent = {
      type: 'super_skill_call',
      skill: `Pipeline: ${label}`,
      result_summary: `Iniciando geração de ${label}${title ? `: "${title}"` : ''}`,
      ts: nowIso(),
    }
    ctx.emit(startEvent)

    // ── Chamar API do pipeline ─────────────────────────────────────────────
    try {
      const base = resolveApiBase()
      const url = `${base}/api/v1/documents/`

      const payload: Record<string, unknown> = {
        document_type_id: documentType,
        title: title || `${label} — ${clip(content, 80)}`,
        description: description || clip(content, 200),
        content,
        template_variant: templateVariant,
      }
      if (legalArea) payload.legal_area = legalArea

      // Incluir token de autenticação se disponível (Firebase)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (!ctx.mock && ctx.apiKey) {
        headers['Authorization'] = `Bearer ${ctx.apiKey}`
      }

      let responseBody: unknown

      if (ctx.mock) {
        // Modo demo: simular resposta bem-sucedida
        responseBody = {
          id: `mock-doc-${Date.now()}`,
          document_type_id: documentType,
          title: title || `${label}`,
          status: 'processando',
          created_at: nowIso(),
        }
      } else {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: ctx.signal,
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Erro desconhecido')
          const errorEvent: ChatTrailEvent = {
            type: 'super_skill_call',
            skill: `Pipeline: ${label}`,
            result_summary: `Falha ao iniciar pipeline: HTTP ${response.status}`,
            ts: nowIso(),
          }
          ctx.emit(errorEvent)
          return {
            tool_message: `Falha ao iniciar pipeline de ${label} (HTTP ${response.status}): ${errorText.slice(0, 300)}`,
          }
        }

        responseBody = await response.json()
      }

      const doc = responseBody as Record<string, unknown>
      const docId = String(doc.id ?? 'desconhecido')
      const docStatus = String(doc.status ?? 'processando')

      // ── Emitir evento de conclusão ─────────────────────────────────────
      const completeEvent: ChatTrailEvent = {
        type: 'super_skill_call',
        skill: `Pipeline: ${label}`,
        result_summary: `Documento ${docId} criado com status "${docStatus}". Acesse o Estúdio de Artefatos para acompanhar.`,
        ts: nowIso(),
      }
      ctx.emit(completeEvent)

      return {
        tool_message:
          `✅ Documento de ${label} iniciado com sucesso!\n` +
          `- ID: ${docId}\n` +
          `- Status: ${docStatus}\n` +
          `- O pipeline está processando. Informe ao usuário que o documento estará disponível no Estúdio de Artefatos em breve.`,
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err // propaga cancelamento
      }
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      const errorEvent: ChatTrailEvent = {
        type: 'super_skill_call',
        skill: `Pipeline: ${label}`,
        result_summary: `Erro: ${message}`,
        ts: nowIso(),
      }
      ctx.emit(errorEvent)
      return {
        tool_message: `Falha ao conectar ao pipeline de ${label}: ${message}. Verifique se o servidor da API está rodando.`,
      }
    }
  },
}

// ── Super-Skill: Consultar Status de Documento ────────────────────────────────

interface CheckDocumentArgs {
  document_id?: string
}

const checkDocumentStatusSkill: Skill<CheckDocumentArgs> = {
  name: 'check_document_status',
  description:
    'Consulta o status de um documento gerado anteriormente por um pipeline. ' +
    'Use quando o usuário perguntar sobre o andamento de um documento.',
  argsHint: {
    document_id: 'ID do documento (retornado pelo generate_document)',
  },
  async run(args, ctx): Promise<SkillResult> {
    const documentId = String(args.document_id ?? '').trim()
    if (!documentId) {
      return { tool_message: 'Erro: "document_id" é obrigatório.' }
    }

    const startEvent: ChatTrailEvent = {
      type: 'super_skill_call',
      skill: 'Status de Documento',
      result_summary: `Consultando status do documento ${documentId}`,
      ts: nowIso(),
    }
    ctx.emit(startEvent)

    try {
      const base = resolveApiBase()
      const url = `${base}/api/v1/documents/${encodeURIComponent(documentId)}`
      const headers: Record<string, string> = {}
      if (!ctx.mock && ctx.apiKey) {
        headers['Authorization'] = `Bearer ${ctx.apiKey}`
      }

      let responseBody: unknown

      if (ctx.mock) {
        responseBody = {
          id: documentId,
          status: 'concluido',
          document_type_id: 'peticao_inicial',
          title: 'Documento Exemplo',
          updated_at: nowIso(),
        }
      } else {
        const response = await fetch(url, { headers, signal: ctx.signal })
        if (!response.ok) {
          return {
            tool_message: `Documento ${documentId} não encontrado ou inacessível (HTTP ${response.status}).`,
          }
        }
        responseBody = await response.json()
      }

      const doc = responseBody as Record<string, unknown>
      const status = String(doc.status ?? 'desconhecido')

      const statusLabels: Record<string, string> = {
        processando: '🔄 Em processamento',
        concluido: '✅ Concluído',
        erro: '❌ Erro',
        cancelado: '⏹️ Cancelado',
      }

      const statusEvent: ChatTrailEvent = {
        type: 'super_skill_call',
        skill: 'Status de Documento',
        result_summary: `Documento ${documentId}: ${statusLabels[status] ?? status}`,
        ts: nowIso(),
      }
      ctx.emit(statusEvent)

      return {
        tool_message:
          `Status do documento ${documentId}:\n` +
          `- Status: ${statusLabels[status] ?? status}\n` +
          `- Tipo: ${doc.document_type_id ?? '—'}\n` +
          `- Título: ${doc.title ?? '—'}\n` +
          (status === 'concluido'
            ? '- O documento está pronto. Informe ao usuário que ele pode acessá-lo no Estúdio de Artefatos.'
            : '- O documento ainda está em processamento. Sugira ao usuário que aguarde e verifique novamente.'),
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return { tool_message: `Erro ao consultar documento ${documentId}: ${message}` }
    }
  },
}

// ── Super-Skill: Pesquisa Jurisprudencial via DataJud ─────────────────────────

interface SearchJurisprudenceArgs {
  query?: string
  tribunal?: string
  max_results?: number
}

const searchJurisprudenceSkill: Skill<SearchJurisprudenceArgs> = {
  name: 'search_jurisprudence',
  description:
    'Pesquisa jurisprudência nos tribunais brasileiros via integração com DataJud. ' +
    'Use quando o usuário precisar de precedentes, súmulas ou decisões sobre um tema jurídico.',
  argsHint: {
    query: 'Termos de busca (ex.: "danos morais responsabilidade civil")',
    tribunal: 'Sigla do tribunal (opcional). Ex.: "STJ", "TJSP", "TRF4".',
    max_results: 'Número máximo de resultados (padrão: 5, máximo: 10)',
  },
  async run(args, ctx): Promise<SkillResult> {
    const query = String(args.query ?? '').trim()
    if (!query) {
      return { tool_message: 'Erro: "query" é obrigatória para pesquisa de jurisprudência.' }
    }
    const tribunal = String(args.tribunal ?? '').trim() || undefined
    const maxResults = Math.min(Number(args.max_results ?? 5) || 5, 10)

    const startEvent: ChatTrailEvent = {
      type: 'super_skill_call',
      skill: 'Pesquisa Jurisprudencial',
      result_summary: `Pesquisando: "${query}"${tribunal ? ` no ${tribunal}` : ''}`,
      ts: nowIso(),
    }
    ctx.emit(startEvent)

    try {
      const base = resolveApiBase()
      const params = new URLSearchParams({ query, max_results: String(maxResults) })
      if (tribunal) params.set('tribunal', tribunal)
      const url = `${base}/api/v1/datajud/search?${params.toString()}`
      const headers: Record<string, string> = {}
      if (!ctx.mock && ctx.apiKey) {
        headers['Authorization'] = `Bearer ${ctx.apiKey}`
      }

      let results: Array<Record<string, unknown>>

      if (ctx.mock) {
        results = [
          {
            numero_processo: '0001234-56.2023.8.26.0100',
            tribunal: 'TJSP',
            relator: 'Des. Exemplo',
            data_julgamento: '2024-03-15',
            ementa: 'EMENTA MOCK — Danos morais configurados. Valor fixado em R$ 10.000,00.',
          },
          {
            numero_processo: 'REsp 1.234.567/SP',
            tribunal: 'STJ',
            relator: 'Min. Exemplo',
            data_julgamento: '2024-02-20',
            ementa: 'EMENTA MOCK — Recurso especial. Responsabilidade civil subjetiva.',
          },
        ]
      } else {
        const response = await fetch(url, { headers, signal: ctx.signal })
        if (!response.ok) {
          return { tool_message: `Pesquisa indisponível (HTTP ${response.status}). O serviço DataJud pode estar offline.` }
        }
        const body = (await response.json()) as Record<string, unknown>
        results = (Array.isArray(body.results) ? body.results : []) as Array<Record<string, unknown>>
      }

      if (!results.length) {
        const emptyEvent: ChatTrailEvent = {
          type: 'super_skill_call',
          skill: 'Pesquisa Jurisprudencial',
          result_summary: `Nenhum resultado para "${query}"`,
          ts: nowIso(),
        }
        ctx.emit(emptyEvent)
        return { tool_message: `Nenhum resultado encontrado para "${query}". Sugira refinar a busca ou tentar termos mais amplos.` }
      }

      const summary = results
        .map(
          (r, i) =>
            `${i + 1}. **${r.numero_processo ?? 'N/A'}** (${r.tribunal ?? 'N/A'})\n` +
            `   Relator: ${r.relator ?? 'N/A'} | Data: ${r.data_julgamento ?? 'N/A'}\n` +
            `   ${clip(String(r.ementa ?? 'Ementa não disponível'), 300)}`,
        )
        .join('\n\n')

      const resultEvent: ChatTrailEvent = {
        type: 'super_skill_call',
        skill: 'Pesquisa Jurisprudencial',
        result_summary: `${results.length} resultado(s) para "${query}"`,
        ts: nowIso(),
      }
      ctx.emit(resultEvent)

      return {
        tool_message:
          `📚 Resultados da pesquisa para "${query}"${tribunal ? ` (${tribunal})` : ''}:\n\n${summary}\n\n` +
          `Use estes precedentes para fundamentar a resposta ao usuário.`,
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return { tool_message: `Erro na pesquisa jurisprudencial: ${message}` }
    }
  },
}

// ── Super-Skill: Análise de Tese Jurídica ─────────────────────────────────────

interface AnalyzeThesisArgs {
  thesis?: string
  legal_area?: string
}

const analyzeThesisSkill: Skill<AnalyzeThesisArgs> = {
  name: 'analyze_thesis',
  description:
    'Analisa uma tese jurídica consultando o Banco de Teses. ' +
    'Use quando o usuário quiser validar uma estratégia ou verificar a viabilidade de um argumento.',
  argsHint: {
    thesis: 'A tese jurídica a ser analisada (ex.: "A inversão do ônus da prova em relações de consumo")',
    legal_area: 'Área do direito (opcional). Ex.: "consumidor", "civil".',
  },
  async run(args, ctx): Promise<SkillResult> {
    const thesis = String(args.thesis ?? '').trim()
    if (!thesis) {
      return { tool_message: 'Erro: "thesis" é obrigatória.' }
    }
    const legalArea = String(args.legal_area ?? '').trim() || undefined

    const startEvent: ChatTrailEvent = {
      type: 'super_skill_call',
      skill: 'Análise de Tese',
      result_summary: `Analisando tese: "${clip(thesis, 120)}"`,
      ts: nowIso(),
    }
    ctx.emit(startEvent)

    try {
      const base = resolveApiBase()
      const url = `${base}/api/v1/thesis-bank/analyze`
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (!ctx.mock && ctx.apiKey) {
        headers['Authorization'] = `Bearer ${ctx.apiKey}`
      }

      let analysisText: string

      if (ctx.mock) {
        analysisText =
          `**Análise da Tese (modo demonstração)**\n\n` +
          `**Tese:** ${thesis}\n` +
          `**Área:** ${legalArea ?? 'Geral'}\n\n` +
          `**Viabilidade:** Média-Alta\n` +
          `**Fundamentos favoráveis:**\n` +
          `- Precedente STJ REsp 1.234.567/SP (2023)\n` +
          `- Súmula 618 do STJ\n` +
          `- Doutrina majoritária de Nelson Nery Jr.\n\n` +
          `**Riscos:**\n` +
          `- Divergência doutrinária em tribunais regionais\n` +
          `- Necessidade de distinção fática cuidadosa\n\n` +
          `**Recomendação:** Tese viável com boa fundamentação. Recomenda-se citar precedentes do STJ.`
      } else {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ thesis, legal_area: legalArea }),
          signal: ctx.signal,
        })
        if (!response.ok) {
          return { tool_message: `Banco de Teses indisponível (HTTP ${response.status}).` }
        }
        const body = (await response.json()) as Record<string, unknown>
        analysisText = String(body.analysis ?? body.result ?? 'Análise indisponível.')
      }

      const resultEvent: ChatTrailEvent = {
        type: 'super_skill_call',
        skill: 'Análise de Tese',
        result_summary: `Análise concluída para: "${clip(thesis, 80)}"`,
        ts: nowIso(),
      }
      ctx.emit(resultEvent)

      return {
        tool_message: `📊 Análise da tese jurídica:\n\n${analysisText}\n\nUse esta análise para fundamentar a resposta ao usuário.`,
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return { tool_message: `Erro na análise de tese: ${message}` }
    }
  },
}

// ── Super-Skill: Busca Híbrida (semântica + lexical via RRF) ──────────────────

interface HybridSearchArgs {
  query?: string
  top_k?: number
  semantic_weight?: number
  lexical_weight?: number
}

const hybridSearchSkill: Skill<HybridSearchArgs> = {
  name: 'hybrid_search',
  description:
    'Executa busca híbrida combinando similaridade semântica (Qdrant/embeddings) ' +
    'com correspondência textual (DataJud/Elasticsearch) via Reciprocal Rank Fusion. ' +
    'Use quando o usuário solicitar pesquisa de jurisprudência, precedentes, súmulas ' +
    'ou qualquer consulta que exija resultados precisos. ' +
    'Prefira esta skill a search_jurisprudence quando precisar de maior precisão e cobertura.',
  argsHint: {
    query: 'Termos de busca em linguagem natural (ex.: "responsabilidade civil por danos ambientais em áreas de preservação permanente")',
    top_k: 'Número máximo de resultados (padrão: 5, máximo: 20)',
    semantic_weight: 'Peso da busca semântica entre 0 e 1 (padrão: 0.5)',
    lexical_weight: 'Peso da busca lexical entre 0 e 1 (padrão: 0.5)',
  },
  async run(args, ctx): Promise<SkillResult> {
    const query = String(args.query ?? '').trim()
    if (!query) {
      return { tool_message: 'Erro: "query" é obrigatória para busca híbrida.' }
    }
    const topK = Math.min(Math.max(Number(args.top_k ?? 5) || 5, 1), 20)
    const semanticWeight = Math.min(Math.max(Number(args.semantic_weight ?? 0.5) || 0.5, 0), 1)
    const lexicalWeight = Math.min(Math.max(Number(args.lexical_weight ?? 0.5) || 0.5, 0), 1)

    const startEvent: ChatTrailEvent = {
      type: 'super_skill_call',
      skill: 'hybrid_search',
      args_summary: `"${clip(query, 100)}" (top_k=${topK}, sw=${semanticWeight}, lw=${lexicalWeight})`,
      result_summary: `🔍 Pesquisando: "${clip(query, 80)}"...`,
      ts: nowIso(),
    }
    ctx.emit(startEvent)

    try {
      let results: Array<{
        source: string
        content: string
        score: number
        origin: string
        origins?: string[]
        process_number?: string
      }>
      let stats: { fused_count: number; total_time_ms: number }

      if (ctx.mock) {
        results = [
          {
            source: 'DataJud',
            content: 'EMENTA — Responsabilidade civil. Dano ambiental em área de preservação permanente. Dever de reparação incondicional. Aplicação da teoria do risco integral.',
            score: 0.94,
            origin: 'datajud',
            process_number: 'REsp 1.950.500/SP',
          },
          {
            source: 'DataJud',
            content: 'EMENTA — Ação civil pública. Dano ambiental. Área de preservação permanente. Obrigação propter rem. Responsabilidade solidária.',
            score: 0.87,
            origin: 'datajud',
            process_number: 'AI 850.300/PR',
          },
          {
            source: 'Qdrant',
            content: 'SÚMULA 618/STJ — A inversão do ônus da prova aplica-se a ações de reparação por danos ambientais.',
            score: 0.82,
            origin: 'qdrant',
            origins: ['qdrant'],
          },
          {
            source: 'DataJud',
            content: 'EMENTA — Dano ambiental. Reparação. Área de preservação permanente. Nexo causal comprovado. Quantum indenizatório fixado em R$ 500.000,00.',
            score: 0.78,
            origin: 'datajud',
            process_number: 'AC 1001234-56.2021.8.26.0000',
          },
        ]
        stats = { fused_count: 4, total_time_ms: 1234 }
      } else {
        const apiResponse = await hybridSearch(query, {
          topK,
          semanticWeight,
          lexicalWeight,
          signal: ctx.signal,
          apiKey: ctx.apiKey,
        })
        results = apiResponse.results
        stats = apiResponse.stats
      }

      if (!results.length) {
        const emptyEvent: ChatTrailEvent = {
          type: 'super_skill_call',
          skill: 'hybrid_search',
          result_summary: `Nenhum resultado para "${clip(query, 80)}"`,
          ts: nowIso(),
        }
        ctx.emit(emptyEvent)
        return {
          tool_message:
            `Nenhum resultado encontrado na busca híbrida para "${query}".\n` +
            `Sugira ao usuário refinar os termos de busca com palavras-chave mais específicas.`,
        }
      }

      const summaryLines = results.map((r, i) => {
        const originLabel = r.origin === 'datajud' ? 'DataJud' : r.origin === 'qdrant' ? 'Qdrant' : r.origin
        const origins = r.origins && r.origins.length > 1 ? ` [fontes: ${r.origins.join(', ')}]` : ''
        const processNumber = r.process_number ? `\n   📋 Processo: ${r.process_number}` : ''
        return (
          `${i + 1}. **[${originLabel}]** (score: ${r.score.toFixed(3)})${origins}${processNumber}\n` +
          `   ${clip(r.content, 400)}`
        )
      })

      const count = results.length
      const timeSec = ((stats?.total_time_ms ?? 0) / 1000).toFixed(1)

      const resultEvent: ChatTrailEvent = {
        type: 'super_skill_call',
        skill: 'hybrid_search',
        result_summary: `${count} resultado(s) fusionados em ${timeSec}s para "${clip(query, 50)}"`,
        ts: nowIso(),
      }
      ctx.emit(resultEvent)

      return {
        tool_message:
          `📚 Resultados da busca híbrida (RRF) para "${query}" — ${count} itens em ${timeSec}s:\n\n` +
          `${summaryLines.join('\n\n')}\n\n` +
          `Use estes resultados para fundamentar a resposta ao usuário. Cite as fontes e os números dos processos quando disponíveis.`,
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return { tool_message: `Erro na busca híbrida: ${message}` }
    }
  },
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * PR3 super-skills — pipeline integrations available to the orchestrator.
 * Extend this array when adding new pipeline-backed capabilities.
 */
export function buildSuperSkills(): Skill[] {
  return [
    generateDocumentSkill,
    checkDocumentStatusSkill,
    searchJurisprudenceSkill,
    analyzeThesisSkill,
    hybridSearchSkill,
  ]
}
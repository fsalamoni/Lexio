// ── Shared label constants for document types and legal areas ────────────────
// Single source of truth — import from here instead of defining locally.

/** Full display labels for all 10 document types. */
export const DOCTYPE_LABELS: Record<string, string> = {
  parecer: 'Parecer',
  peticao_inicial: 'Petição Inicial',
  contestacao: 'Contestação',
  recurso: 'Recurso',
  sentenca: 'Sentença',
  acao_civil_publica: 'Ação Civil Pública',
  mandado_seguranca: 'Mandado de Segurança',
  habeas_corpus: 'Habeas Corpus',
  agravo: 'Agravo de Instrumento',
  embargos_declaracao: 'Embargos de Declaração',
}

/** Abbreviated labels for compact UI (Dashboard cards, tables). */
export const DOCTYPE_SHORT_LABELS: Record<string, string> = {
  parecer: 'Parecer',
  peticao_inicial: 'Petição Inicial',
  contestacao: 'Contestação',
  recurso: 'Recurso',
  sentenca: 'Sentença',
  acao_civil_publica: 'ACP',
  mandado_seguranca: 'MS',
  habeas_corpus: 'HC',
  agravo: 'Agravo',
  embargos_declaracao: 'Embargos',
}

/** Display labels for all 17 legal areas. */
export const AREA_LABELS: Record<string, string> = {
  administrative: 'Administrativo',
  constitutional: 'Constitucional',
  civil: 'Civil',
  tax: 'Tributário',
  labor: 'Trabalhista',
  criminal: 'Penal',
  criminal_procedure: 'Processo Penal',
  civil_procedure: 'Processo Civil',
  consumer: 'Consumidor',
  environmental: 'Ambiental',
  business: 'Empresarial',
  family: 'Família',
  inheritance: 'Sucessões',
  social_security: 'Previdenciário',
  electoral: 'Eleitoral',
  international: 'Internacional',
  digital: 'Digital',
}

/** Tailwind color classes for area badges. */
export const AREA_COLORS: Record<string, string> = {
  administrative: 'bg-purple-50 text-purple-700 border-purple-200',
  constitutional: 'bg-red-50    text-red-700    border-red-200',
  civil:          'bg-blue-50   text-blue-700   border-blue-200',
  tax:            'bg-orange-50 text-orange-700 border-orange-200',
  labor:          'bg-teal-50   text-teal-700   border-teal-200',
  criminal:       'bg-rose-50   text-rose-700   border-rose-200',
  criminal_procedure: 'bg-pink-50 text-pink-700  border-pink-200',
  civil_procedure: 'bg-sky-50   text-sky-700    border-sky-200',
  consumer:       'bg-amber-50  text-amber-700  border-amber-200',
  environmental:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  business:       'bg-indigo-50 text-indigo-700 border-indigo-200',
  family:         'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  inheritance:    'bg-violet-50 text-violet-700 border-violet-200',
  social_security: 'bg-cyan-50  text-cyan-700   border-cyan-200',
  electoral:      'bg-lime-50   text-lime-700   border-lime-200',
  international:  'bg-slate-50  text-slate-700  border-slate-200',
  digital:        'bg-zinc-50   text-zinc-700   border-zinc-200',
}

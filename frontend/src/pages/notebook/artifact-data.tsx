/**
 * Artifact and source definitions that depend on Lucide React icons.
 * Separated from constants.ts because they import React components.
 */
import React from 'react'
import {
  BookMarked, CreditCard, FileQuestion, FileText, BarChart3,
  Presentation, Map, PenTool, Table, Mic, Video, Film,
  Database, Upload, Link2, Globe, Brain, Library,
} from 'lucide-react'
import type { StudioArtifactType } from '../../lib/firestore-service'
import type { ArtifactDef, ArtifactCategory } from './constants'

// ── Artifact categories (with icons) ─────────────────────────────────────────

export const ARTIFACT_CATEGORIES: ArtifactCategory[] = [
  {
    label: 'Estudo', emoji: '📚', color: 'blue',
    items: [
      { type: 'guia_estruturado', label: 'Guia Estruturado', icon: BookMarked, description: 'Guia completo com principais conceitos e pontos das fontes' },
      { type: 'cartoes_didaticos', label: 'Cartões Didáticos', icon: CreditCard, description: 'Flashcards interativos para revisão e memorização' },
      { type: 'teste', label: 'Teste / Quiz', icon: FileQuestion, description: 'Quiz interativo com múltiplos tipos de questão e scoring' },
    ],
  },
  {
    label: 'Documentos', emoji: '📝', color: 'emerald',
    items: [
      { type: 'resumo', label: 'Resumo Executivo', icon: FileText, description: 'Síntese analítica completa do tema pesquisado' },
      { type: 'relatorio', label: 'Relatório Analítico', icon: BarChart3, description: 'Relatório detalhado com metodologia e recomendações' },
      { type: 'documento', label: 'Documento Formal', icon: FileText, description: 'Documento técnico/jurídico estruturado' },
    ],
  },
  {
    label: 'Visual', emoji: '🎨', color: 'purple',
    items: [
      { type: 'apresentacao', label: 'Apresentação', icon: Presentation, description: 'Slides profissionais com notas do apresentador' },
      { type: 'mapa_mental', label: 'Mapa Mental', icon: Map, description: 'Visualização interativa de conceitos e relações' },
      { type: 'infografico', label: 'Infográfico', icon: PenTool, description: 'Dados e estatísticas em layout visual impactante' },
      { type: 'tabela_dados', label: 'Tabela de Dados', icon: Table, description: 'Tabela interativa com ordenação e filtros' },
    ],
  },
  {
    label: 'Mídia', emoji: '🎬', color: 'amber',
    items: [
      { type: 'audio_script', label: 'Resumo em Áudio', icon: Mic, description: 'Resumo em áudio com roteiro, síntese falada e arquivo final persistido' },
      { type: 'video_script', label: 'Vídeo', icon: Video, description: 'Planejamento, imagens, narração e render final do vídeo em um único fluxo.' },
    ],
  },
]

/** Flat list for lookups */
export const ARTIFACT_TYPES: ArtifactDef[] = [
  ...ARTIFACT_CATEGORIES.flatMap(c => c.items),
  // Generated-only types (not user-creatable, but need icon/label for display)
  { type: 'video_production', label: 'Produção de Vídeo', icon: Film, description: 'Pacote de produção com cenas, clips, imagens e narração gerados' },
]

// ── Source type labels (with icons) ──────────────────────────────────────────

export const SOURCE_TYPE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  acervo:  { label: 'Acervo', icon: Database },
  upload:  { label: 'Upload', icon: Upload },
  link:    { label: 'Link', icon: Link2 },
  external: { label: 'Pesquisa Externa', icon: Globe },
  external_deep: { label: 'Pesquisa Externa Profunda', icon: Brain },
  jurisprudencia: { label: 'Jurisprudência (DataJud)', icon: Library },
}

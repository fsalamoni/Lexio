/**
 * Artifact and source definitions that depend on Lucide React icons.
 * Separated from constants.ts because they import React components.
 */
import React from 'react'
import {
  BookMarked, CreditCard, FileQuestion, FileText, BarChart3,
  Presentation, Map, PenTool, Table, Mic, Video,
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
      { type: 'audio_script', label: 'Roteiro de Áudio', icon: Mic, description: 'Script de podcast com timeline e notas de produção' },
      { type: 'video_script', label: 'Planejamento de Vídeo + Estúdio', icon: Video, description: 'Fase 1: planejamento textual completo. Fase 2: geração literal de imagem/áudio/vídeo no estúdio.' },
    ],
  },
]

/** Flat list for lookups */
export const ARTIFACT_TYPES: ArtifactDef[] = ARTIFACT_CATEGORIES.flatMap(c => c.items)

// ── Source type labels (with icons) ──────────────────────────────────────────

export const SOURCE_TYPE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  acervo:  { label: 'Acervo', icon: Database },
  upload:  { label: 'Upload', icon: Upload },
  link:    { label: 'Link', icon: Link2 },
  external: { label: 'Pesquisa Externa', icon: Globe },
  external_deep: { label: 'Pesquisa Externa Profunda', icon: Brain },
  jurisprudencia: { label: 'Jurisprudência (DataJud)', icon: Library },
}

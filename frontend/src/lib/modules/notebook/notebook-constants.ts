import type { StudioArtifactType } from '../../firestore-service'

export const STUDIO_SPECIALIST_LABEL: Record<StudioArtifactType, string> = {
  resumo: 'Escritor',
  relatorio: 'Escritor',
  documento: 'Escritor',
  cartoes_didaticos: 'Escritor',
  teste: 'Escritor',
  guia_estruturado: 'Escritor',
  apresentacao: 'Designer Visual',
  mapa_mental: 'Designer Visual',
  infografico: 'Designer Visual',
  tabela_dados: 'Designer Visual',
  audio_script: 'Roteirista de Áudio',
  video_script: 'Pipeline de Vídeo',
  video_production: 'Pipeline de Vídeo',
  outro: 'Escritor',
}

export const ACERVO_TRAIL_STEPS = [
  { key: 'nb_acervo_triagem', label: 'Triagem' },
  { key: 'nb_acervo_buscador', label: 'Buscador' },
  { key: 'nb_acervo_analista', label: 'Analista' },
  { key: 'nb_acervo_curador', label: 'Curador' },
] as const
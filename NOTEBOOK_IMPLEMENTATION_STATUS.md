# Caderno de Pesquisa — Status de Implementacao (NotebookLM+)

> Documento de tracking para agentes IA. Atualizado automaticamente.
> Branch: `claude/review-notebook-implementation-HoS5Q`

---

## Status Geral: Etapas 1-12 IMPLEMENTADAS

### Etapa 1 — Saida JSON Estruturada + Parser ✅
- **Arquivos**: `lib/notebook-studio-pipeline.ts`, `components/artifacts/artifact-parsers.ts`
- Prompts atualizados para gerar JSON para: apresentacao, mapa_mental, cartoes_didaticos, teste, tabela_dados, infografico, audio_script, video_script
- Parser com tipos TypeScript completos e fallback para Markdown
- Token limits aumentados: pesquisador 4000, especialista 8000, revisor 10000
- Revisor mantém formato JSON/Markdown conforme o artefato

### Etapa 2 — ArtifactViewerModal ✅
- **Arquivo**: `components/artifacts/ArtifactViewerModal.tsx`
- Modal full-width (95vw, 90vh) com backdrop blur
- Roteia para viewer correto por tipo via `parseArtifactContent()`
- Header com icone, titulo, data, acoes (copiar, exportar dropdown, excluir, fechar)
- Fecha com Escape, previne scroll do body

### Etapa 3 — FlashcardViewer + QuizPlayer ✅
- **FlashcardViewer**: flip 3D, navegacao, filtro categoria/dificuldade, modo estudo, shuffle, progresso
- **QuizPlayer**: multipla escolha, V/F, dissertativa, caso pratico, associacao, modos estudo/prova, scoring, resultados

### Etapa 4 — PresentationViewer ✅
- Carrossel de slides 16:9, navegacao setas/teclado, fullscreen overlay
- Speaker notes toggle, thumbnail strip, fade transitions

### Etapa 5 — MindMapViewer ✅
- Arvore horizontal puro CSS/React (sem D3)
- Collapse/expand nos, cores por ramo, emojis, expandir/recolher tudo

### Etapa 6 — DataTableViewer + InfographicRenderer ✅
- **DataTableViewer**: sort, filter, busca, paginacao, resumo, legenda, zebra
- **InfographicRenderer**: secoes coloridas, stats animados, layout magazine

### Etapa 7 — AudioScriptViewer + VideoScriptViewer ✅
- **AudioScriptViewer**: timeline vertical, segmentos coloridos por tipo, speaker, notas
- **VideoScriptViewer**: layout storyboard com cenas, visuais, transicoes, b-roll

### Etapa 8 — ReportViewer ✅
- TOC automatico via parse de headers Markdown
- Scroll spy com IntersectionObserver
- Toggle mostrar/ocultar indice

### Etapa 9 — Sistema de Exportacao ✅
- **Arquivo**: `components/artifacts/artifact-exporters.ts`
- Dropdown no modal com opcoes por tipo:
  - Flashcards: Markdown, CSV Anki, JSON
  - Quiz: Prova TXT, Gabarito TXT, JSON
  - Apresentacao: Texto slides, JSON
  - Tabela: CSV, JSON
  - Audio/Video: Roteiro TXT, JSON
  - Mind Map/Infografico: JSON
  - Textos: Markdown

### Etapa 10 — Audio Overview Pipeline ✅
- **Arquivos**: `lib/tts-client.ts`, `lib/notebook-audio-pipeline.ts`, `components/artifacts/AudioOverviewPlayer.tsx`
- TTS client: OpenRouter (openai/tts-1-hd) + Web Speech API fallback
- Pipeline gera script podcast 2 vozes (Host A / Host B)
- Player com controles, velocidade, download MP3, transcricao sincronizada
- Card de Audio Overview na aba Overview (estilo NotebookLM)

### Etapa 11 — Redesign do Estudio + UX ✅
- ARTIFACT_CATEGORIES: 4 categorias visuais (Estudo, Documentos, Visual, Midia)
- Cards com cores por categoria, emojis, descricoes melhoradas
- Grid responsivo por categoria

### Etapa 12 — Modelos Default + Token Limits ✅
- studio_pesquisador: Claude 3.5 Haiku (era Llama 4 Scout free)
- studio_escritor: Claude Sonnet 4 (era Llama 3.3 70B free)
- studio_roteirista: Claude Sonnet 4 (era Llama 3.3 70B free)
- studio_visual: Claude Sonnet 4 (era Llama 3.3 70B free)
- studio_revisor: Claude 3.5 Haiku (era Llama 3.3 70B free)

---

## Arquivos Criados/Modificados

### Novos (14 arquivos)
```
frontend/src/components/artifacts/
  artifact-parsers.ts          — Tipos e parser JSON com fallback
  artifact-exporters.ts        — Exportacao por tipo de artefato
  index.ts                     — Barrel exports
  ArtifactViewerModal.tsx      — Modal roteador de viewers
  FlashcardViewer.tsx          — Flashcards interativos
  QuizPlayer.tsx               — Quiz com scoring
  PresentationViewer.tsx       — Carrossel de slides
  MindMapViewer.tsx            — Mapa mental em arvore
  DataTableViewer.tsx          — Tabela com sort/filter
  InfographicRenderer.tsx      — Infografico visual
  AudioScriptViewer.tsx        — Timeline de audio
  VideoScriptViewer.tsx        — Storyboard de video
  ReportViewer.tsx             — Documento com TOC
  AudioOverviewPlayer.tsx      — Player de podcast

frontend/src/lib/
  tts-client.ts                — Cliente TTS OpenRouter + Web Speech
  notebook-audio-pipeline.ts   — Pipeline Audio Overview
```

### Modificados (3 arquivos)
```
frontend/src/lib/notebook-studio-pipeline.ts  — Prompts JSON + token limits
frontend/src/lib/model-config.ts              — Modelos default atualizados
frontend/src/pages/ResearchNotebook.tsx        — Modal, categorias, Audio Overview
```

---

## Melhorias Futuras (nao implementadas)
- [ ] PPTX export via pptxgenjs
- [ ] PDF export via jspdf
- [ ] D3.js para mind map (atualmente puro CSS)
- [ ] Spaced repetition algorithm para flashcards
- [ ] Drag-and-drop para associacao no quiz
- [ ] Waveform visualization no audio player
- [ ] Edicao inline de artefatos gerados
- [ ] Templates de instrucoes pre-definidos
- [ ] Versionamento de artefatos (re-gerar mantendo anterior)

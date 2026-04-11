# Schema do Banco de Dados — Firebase Firestore

> Lexio usa Firebase Firestore (NoSQL) como banco de dados. Não há PostgreSQL em produção.

## Coleções (8 caminhos)

| Caminho | Descrição |
|---------|-----------|
| `/users/{uid}` | Perfil do usuário + role (admin/user) |
| `/users/{uid}/profile/data` | Anamnese Layer 1 (perfil profissional) |
| `/users/{uid}/documents/{id}` | Documentos jurídicos gerados + `llm_executions[]` |
| `/users/{uid}/theses/{id}` | Banco de teses (CRUD + auto-extração) |
| `/users/{uid}/acervo/{id}` | Documentos de referência (classificados com ementa) |
| `/users/{uid}/research_notebooks/{id}` | Cadernos de pesquisa (chat + fontes + artefatos) |
| `/users/{uid}/settings/preferences` | Configurações pessoais persistidas: chaves, catálogo pessoal, modelos por agente, tipos e áreas customizadas |
| `/settings/platform` | Config global legada usada apenas como origem de migração, não como fonte runtime |

## Segurança
- Firebase Rules protegem todos os dados por `uid`
- Cada usuário só acessa suas subcoleções
- `/users/{uid}/settings/preferences` é owner-only e fonte de verdade runtime para configurações pessoais
- `/settings/platform` não deve voltar a ser dependência runtime da aplicação

## Subchaves de `/users/{uid}/settings/preferences`

| Chave | Conteúdo |
|-------|----------|
| `api_keys.openrouter_api_key` | Chave API OpenRouter do usuário |
| `api_keys.datajud_api_key` | Chave DataJud do usuário |
| `model_catalog` | Catálogo pessoal persistido, fonte de verdade para seletores e validações |
| `agent_models` | Config do pipeline de documentos (11 agentes) |
| `thesis_analyst_models` | Config do pipeline de teses (5 agentes) |
| `context_detail_models` | Config do context detail (1 agente) |
| `acervo_classificador_models` | Config do classificador de acervo (1 agente) |
| `acervo_ementa_models` | Config do gerador de ementas (1 agente) |
| `research_notebook_models` | Config do caderno de pesquisa (12 agentes) |
| `notebook_acervo_models` | Config do notebook acervo analyzer (4 agentes) |
| `video_pipeline_models` | Config do pipeline de vídeo (11 agentes) |
| `audio_pipeline_models` | Config do pipeline de áudio (6 agentes) |
| `presentation_pipeline_models` | Config do pipeline de apresentação (6 agentes) |
| `document_types`, `legal_areas`, `classification_tipos` | Customizações estruturais do usuário |
| `legacy_migrated_at` | Timestamp da migração única das configurações globais legadas |

## Tipos TypeScript (`firestore-types.ts`)

| Interface | Descrição |
|-----------|-----------|
| `ProfileData` | Perfil profissional + preferências de redação |
| `ContextDetailData` | Contexto refinado Q&A (Layer 2 anamnese) |
| `DocumentData` | Documento jurídico: conteúdo, metadata, llm_executions, quality_score |
| `ThesisData` | Tese: conteúdo, área, tags, quality_score, usage_count, source_type |
| `ThesisAnalysisSessionData` | Sessão de análise batch de teses |
| `AcervoDocumentData` | Metadados de documento de referência (natureza, área, ementa) |
| `NotebookSource` | Fonte do caderno (tipo: acervo/upload/link/external/external_deep/jurisprudencia) |
| `NotebookMessage` | Mensagem de chat no caderno |
| `StudioArtifact` | Artefato gerado (13 tipos: resumo, apresentação, mapa mental, etc.) |
| `ResearchNotebookData` | Caderno completo: topic, sources, messages, artifacts |
| `WizardData` | Estado do wizard de onboarding |
| `AdminDocumentType` | Tipo de documento gerenciado pelo admin |
| `AdminLegalArea` | Área do direito gerenciada pelo admin |
| `AdminClassificationTipos` | Árvore de classificação gerenciada pelo admin |

## Campos Notáveis

### DocumentData
- `document_type_id` — Tipo (`parecer`, `peticao_inicial`, etc.)
- `legal_area_ids` — Array de áreas selecionadas
- `content` — Conteúdo markdown do documento
- `quality_score` — Nota 0-100 do avaliador de qualidade
- `llm_executions` — Array de execuções LLM (modelo, tokens, custo)
- `metadata_` — JSONB com custo total, duração, config

### ProfileData (Anamnese Layer 1)
- `institution`, `position`, `jurisdiction` — Perfil profissional
- `formality_level`, `connective_style`, `citation_style` — Preferências de redação
- `preferred_expressions`, `avoided_expressions` — Vocabulário personalizado
- `signature_block`, `header_text` — Blocos de texto padrão
- `onboarding_completed` — Flag de onboarding

### ThesisData
- `source_type` — `auto_extracted` | `manual` | `imported`
- `legal_basis` — Array de fundamentação legal
- `quality_score`, `usage_count` — Métricas de qualidade e uso
- `status` — `active` | `archived` | `draft`

### ResearchNotebookData
- `topic` — Tema de pesquisa
- `sources` — Array de NotebookSource (fontes indexadas)
- `messages` — Array de NotebookMessage (chat)
- `artifacts` — Array de StudioArtifact (artefatos gerados)

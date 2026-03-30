# Schema do Banco de Dados

## Tabelas (11)
| Tabela | Descrição |
|--------|-----------|
| organizations | Entidade raiz multi-tenant |
| users | Usuários com auth e org_id |
| documents | Documentos jurídicos (generalizado) |
| executions | Registro de cada chamada LLM por agente |
| uploaded_documents | Arquivos para indexação vetorial |
| legal_areas | Registry de áreas do direito |
| document_types | Registry de tipos de documento |
| user_profiles | Perfil profissional (anamnese Layer 1, 1:1 com users) |
| theses | Banco de teses jurídicas reutilizáveis (auto-populado) |
| whatsapp_sessions | Estado da máquina de conversação WhatsApp |
| platform_settings | Configurações da plataforma gerenciadas pelo admin (chaves de API) |

## Multi-Tenant
Toda tabela de dados tem `organization_id` (UUID, FK para organizations).
Queries SEMPRE filtram por org_id via `OrgScopedMixin`.

## ERD Simplificado
```
organizations ──< users ──< user_profiles (1:1)
organizations ──< documents ──< executions
organizations ──< uploaded_documents
organizations ──< theses
organizations ──< whatsapp_sessions
documents ──> users (author_id)
theses ──> documents (source_document_id)
platform_settings (não tem org_id — configuração global)
```

## Campos Notáveis

### documents
- `document_type_id` — FK lógica para módulo (`parecer`, `peticao_inicial`, etc.)
- `legal_area_ids` — ARRAY de áreas selecionadas (`administrative`, `civil`, etc.)
- `template_variant` — variante de template (`mprs_caopp`, `generic`, etc.)
- `quality_score` — nota 0-100 do quality gate
- `quality_issues` — JSONB com lista de problemas detectados
- `metadata_` — JSONB com custo, duração e config do pipeline
- `origem` — canal de origem (`web`, `whatsapp`)

### user_profiles (anamnese Layer 1)
- `institution`, `position`, `jurisdiction` — perfil profissional
- `formality_level`, `connective_style`, `citation_style` — preferências de redação
- `preferred_expressions`, `avoided_expressions` — vocabulário
- `signature_block`, `header_text` — blocos de texto padrão
- `onboarding_completed` — flag de onboarding concluído

### theses (thesis bank)
- `source_type` — `auto_extracted` | `manual` | `imported`
- `legal_basis` — JSONB array `[{"law": "...", "article": "..."}]`
- `precedents` — JSONB array `[{"court": "...", "case_number": "..."}]`
- `quality_score`, `usage_count`, `success_rate` — métricas
- `status` — `active` | `archived` | `draft` (soft delete)

### whatsapp_sessions
- Estado da máquina: `welcome → awaiting_doc_type → awaiting_content → processing → complete/error`
- `expires_at` — expiração após 24h de inatividade

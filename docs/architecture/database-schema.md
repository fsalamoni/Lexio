# Schema do Banco de Dados

## Tabelas (7)
| Tabela | Descrição |
|--------|-----------|
| organizations | Entidade raiz multi-tenant |
| users | Usuários com auth e org_id |
| documents | Documentos jurídicos (generalizado) |
| executions | Registro de cada chamada LLM |
| uploaded_documents | Arquivos para indexação vetorial |
| legal_areas | Registry de áreas do direito |
| document_types | Registry de tipos de documento |

## Multi-Tenant
Toda tabela de dados tem `organization_id` (UUID, FK para organizations).
Queries SEMPRE filtram por org_id via `OrgScopedMixin`.

## ERD Simplificado
```
organizations ──< users
organizations ──< documents ──< executions
organizations ──< uploaded_documents
documents ──> users (author_id)
```

# Sistema de Módulos

## Estrutura
Cada módulo tem:
- `manifest.json` — Metadata (id, type, version, entry_point)
- `__init__.py` — Exporta MODULE_CLASS e create_module()
- `CLAUDE.md` — Contexto IA

## Tipos
- `document_type` — Define pipeline de geração
- `legal_area` — Define agentes especializados + guias
- `channel` — Canal de comunicação (WhatsApp, email)
- `service` — Serviços auxiliares (thesis_bank, admin)

## Ciclo de Vida
1. `discover_and_load_modules()` escaneia `packages/modules/`
2. Lê cada `manifest.json`
3. Importa o `entry_point`
4. Registra no `module_registry`
5. Emite evento `MODULE_LOADED`

## Health Check
- Cada módulo pode implementar `async health_check() -> dict`
- Admin pode verificar via `GET /api/v1/admin/modules/health`
- Admin pode toggle via `POST /api/v1/admin/modules/{id}/toggle`

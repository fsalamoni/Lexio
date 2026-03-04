# Como Adicionar uma Área do Direito

## 1. Criar diretório
```
packages/modules/legal_areas/{area_id}/
  __init__.py
  manifest.json
  area.py
  agents/
  guides/
  CLAUDE.md
```

## 2. Implementar BaseLegalArea
```python
from packages.modules.legal_areas.base import BaseLegalArea

class {Nome}Area(BaseLegalArea):
    def get_id(self) -> str: return "{area_id}"
    def get_name(self) -> str: return "Direito {Nome}"
    def get_specializations(self) -> list[str]: return [...]
    async def generate_theses(self, context, model=None) -> str: ...
```

## 3. Criar agentes especializados
- `agents/jurista.py` — Teses na perspectiva da área
- `agents/advogado_diabo.py` — Críticas especializadas
- `agents/fact_checker.py` — Verificação de normas da área

## 4. Criar guias normativos
Arquivos `.md` em `guides/` com:
- Base constitucional
- Legislação federal/estadual
- Jurisprudência relevante (STF, STJ)
- Pontos de atenção

## 5. Testar
```bash
curl localhost:8000/api/v1/admin/test-module/{area_id}
```

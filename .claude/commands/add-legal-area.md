# /add-legal-area — Adicionar nova área do direito

Adicione uma nova área jurídica ao Lexio.

## Template
```
packages/modules/legal_areas/{area_id}/
  __init__.py
  manifest.json
  area.py              → Implementa BaseLegalArea
  agents/
    __init__.py
    jurista.py         → Jurista especializado na área
    advogado_diabo.py  → Advogado do diabo especializado
    fact_checker.py    → Verificador especializado
  guides/
    {topic1}.md        → Guia normativo do tema 1
    {topic2}.md        → Guia normativo do tema 2
  CLAUDE.md
```

## Áreas pendentes (MVP)
- `constitutional` — Direito Constitucional
- `civil` — Direito Civil
- `tax` — Direito Tributário
- `labor` — Direito do Trabalho

## Implementação da area.py
```python
from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

class {Nome}Area(BaseLegalArea):
    def get_id(self) -> str: return "{area_id}"
    def get_name(self) -> str: return "Direito {Nome}"
    def get_specializations(self) -> list[str]: return [...]
    async def generate_theses(self, context, model=None) -> str: ...
```

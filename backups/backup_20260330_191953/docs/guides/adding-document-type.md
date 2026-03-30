# Como Adicionar um Tipo de Documento

## 1. Criar diretório
```
packages/modules/document_types/{nome}/
```

## 2. Criar manifest.json
```json
{
    "id": "{nome}",
    "name": "Nome Exibição",
    "type": "document_type",
    "version": "1.0.0",
    "entry_point": "__init__.py",
    "enabled": true
}
```

## 3. Implementar BaseDocumentType
```python
from packages.modules.document_types.base import BaseDocumentType
from packages.pipeline.pipeline_config import PipelineConfig, AgentConfig

class {Nome}DocumentType(BaseDocumentType):
    def get_id(self) -> str: return "{nome}"
    def get_name(self) -> str: return "Nome Exibição"
    def get_pipeline_config(self, variant=None) -> PipelineConfig:
        return PipelineConfig(
            document_type_id="{nome}",
            agents=[...],
        )
```

## 4. Criar prompts em templates/generic/
Cada agente precisa de `system_prompt(context)` e `user_prompt(context)`.

## 5. Criar quality_rules.py (opcional)
Lista QUALITY_RULES com checks específicos.

## 6. Testar
```bash
curl localhost:8000/api/v1/admin/test-module/{nome}
```

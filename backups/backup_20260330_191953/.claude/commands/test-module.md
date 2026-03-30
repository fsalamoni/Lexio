# /test-module — Testar módulo sem gastar tokens

Teste um módulo do Lexio sem consumir tokens LLM.

## Passos
1. Verificar que `manifest.json` existe e é válido
2. Verificar que o entry_point importa corretamente
3. Verificar que `create_module()` retorna instância válida
4. Verificar que `health_check()` retorna `{"healthy": true}`
5. Para document_type: verificar `get_pipeline_config()` retorna PipelineConfig válido
6. Para legal_area: verificar `get_specializations()` retorna lista não-vazia
7. Chamar endpoint: `curl localhost:8000/api/v1/admin/test-module/{nome}`

## Resultado esperado
```json
{
  "module_id": "...",
  "manifest_valid": true,
  "instance_loaded": true,
  "has_health_check": true,
  "health_check": {"healthy": true}
}
```

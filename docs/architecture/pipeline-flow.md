# Fluxo do Pipeline

## Sequência
```
Documento criado → Pesquisa → [Agente 1..N] → Integração → Quality Gate → DOCX
```

## Detalhes
1. **Pesquisa**: Embedding → Qdrant + DataJud + SearXNG (paralelo)
2. **Agentes**: Sequência definida pelo document_type via PipelineConfig
3. **Integração**: Header/footer + limpeza (custom ou default)
4. **Quality Gate**: Regras do document_type (ou default)
5. **DOCX**: Geração com formatação configurável

## Pipeline Config
```python
PipelineConfig(
    document_type_id="parecer",
    agents=[AgentConfig(name="triagem", prompt_module="...", ...)],
    quality_module="...",
    integrator_module="...",
)
```

## Progresso
- WebSocket em `/ws/document/{id}`
- Mensagens: `{phase, message, progress}`

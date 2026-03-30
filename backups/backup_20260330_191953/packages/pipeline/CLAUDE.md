# Pipeline Engine — Contexto IA

## Responsabilidade
Orquestrador genérico de pipeline multi-agente para geração de documentos.

## Arquivos
- `orchestrator.py` — Executa sequência de agentes via PipelineConfig
- `agent.py` — Classe base Agent (carrega prompts de módulo configurável)
- `pipeline_config.py` — Dataclass com configuração por document_type
- `quality_gate.py` — Avaliação de qualidade (regras plugáveis)
- `integrator.py` — Header/footer + pós-processamento
- `docx_generator.py` — Geração de DOCX parametrizada
- `multi_area_deliberation.py` — Deliberação entre múltiplas áreas

## Fluxo
1. Pesquisa (Qdrant + DataJud + SearXNG)
2. Agentes em sequência (config do document_type)
3. Integração (header/footer)
4. Quality gate
5. DOCX

## Regras
1. NUNCA hardcodar agentes — sempre via PipelineConfig
2. Prompts vêm do módulo document_type (import dinâmico)
3. Quality rules vêm do módulo document_type

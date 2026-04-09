# Sistema de Configuração de Pipelines

> Em produção, Lexio não usa módulos Python. Todos os pipelines são definidos em TypeScript no frontend.

## Definição de Agentes
Cada pipeline é definido como um array de `AgentModelDef` em `model-config.ts`:

```typescript
interface AgentModelDef {
  key: string           // Identificador único do agente
  label: string         // Nome de exibição
  description: string   // Descrição funcional
  defaultModel: string  // Modelo padrão (vazio = usa fallback)
  recommendedTier: 'fast' | 'balanced' | 'premium'
  icon: string          // Ícone Lucide
  agentCategory: 'extraction' | 'synthesis' | 'reasoning' | 'writing'
}
```

## Arrays de Definição (10 pipelines)

| Array | Pipeline | Agentes |
|-------|----------|---------|
| `DOCUMENT_AGENT_DEFS` | Geração de documentos | 11 |
| `THESIS_ANALYST_AGENT_DEFS` | Análise de teses | 5 |
| `CONTEXT_DETAIL_AGENT_DEFS` | Context detail | 1 |
| `ACERVO_CLASSIFICADOR_AGENT_DEFS` | Classificador acervo | 1 |
| `ACERVO_EMENTA_AGENT_DEFS` | Ementa acervo | 1 |
| `RESEARCH_NOTEBOOK_AGENT_DEFS` | Caderno de pesquisa | 11 |
| `NOTEBOOK_ACERVO_AGENT_DEFS` | Notebook acervo | 4 |
| `VIDEO_PIPELINE_AGENT_DEFS` | Vídeo | 8 |
| `AUDIO_PIPELINE_AGENT_DEFS` | Áudio | 6 |
| `PRESENTATION_PIPELINE_AGENT_DEFS` | Apresentação | 6 |

## Configuração de Modelos
1. Admin configura modelos por agente no Admin Panel
2. Config é salva no Firestore em `/settings/platform`
3. Cada pipeline tem funções `load*Models()`, `save*Models()`, `reset*Models()`
4. Se não há config salva, usa modelo default (vazio = OpenRouter seleciona automaticamente)

## Fluxo de Chamada LLM
```
AgentDef → loadModels() → Model ID → callLLM() / callLLMWithMessages() → OpenRouter API
```

Toda chamada LLM passa por `llm-client.ts`, que:
- Busca a API key do Firestore ou `.env.local`
- Adiciona headers de autenticação para OpenRouter
- Implementa retries e fallbacks automáticos
- Registra uso para analytics de custo

# Sistema de Configuração de Pipelines

> Em produção, Lexio não usa módulos Python. Todos os pipelines são definidos em TypeScript no frontend e devem respeitar fronteiras modulares entre núcleo compartilhado e módulos de domínio.

Para a estratégia completa de núcleo e módulos, consulte `docs/architecture/core-and-modules.md`. Para limites de dados Firestore e migração para database nomeado, consulte `docs/architecture/firestore-data-boundaries.md`.

## Definição de Agentes
Cada pipeline é definido como arrays de `AgentModelDef` registrados em `model-config.ts`, mas novas implementações devem evoluir para módulos por pipeline em subdiretórios próprios de `frontend/src/lib`.

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
1. Cada usuário configura seus próprios modelos por agente nas Configurações Pessoais
2. A configuração persistida vive em `/users/{uid}/settings/preferences`
3. Cada pipeline tem funções `load*Models()`, `save*Models()`, `reset*Models()` user-scoped
4. O catálogo pessoal persistido é a fonte de verdade para seletores e validações runtime

## Regra Arquitetural Obrigatória

- O núcleo compartilhado deve ficar em módulos reutilizáveis de `frontend/src/lib`.
- Código de negócio não pode importar nada de `frontend/src/components`.
- Qualquer novo pipeline, trilha, agente ou integração deve nascer em módulo próprio, com tipos, prompts, adaptadores e testes isolados.
- Não ampliar arquivos centrais monolíticos quando a mudança puder ser extraída para submódulo dedicado.
- Mudanças transversais de dados, Firebase, LLM, feature flags, erros e telemetria devem entrar primeiro como contratos/adaptadores de core; regras específicas de produto devem morar no módulo de domínio.
- Refatorações modulares não devem ser misturadas com cutover de banco de dados. Durante a migração Firestore, manter mudanças de código focadas em roteamento de databaseId, backup, auditoria, migração shadow e validação.

## Fluxo de Chamada LLM
```
AgentDef → loadModels() → Model ID → callLLM() / callLLMWithMessages() → OpenRouter API
```

Toda chamada LLM passa por `llm-client.ts`, que:
- Busca a API key do Firestore ou `.env.local`
- Adiciona headers de autenticação para OpenRouter
- Implementa retries e fallbacks automáticos
- Registra uso para analytics de custo

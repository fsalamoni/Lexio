# Lexio — Arquitetura

## Visão Geral
Lexio é um SaaS de produção jurídica com IA organizado como monorepo com módulos independentes.

## Camadas
```
Frontend (React) → API Gateway (FastAPI) → Pipeline Engine → Modules
                                         ↕
                              Core Engine (shared infra)
                                         ↕
                    PostgreSQL | Qdrant | Ollama | SearXNG | OpenRouter
```

## Princípios
1. **Módulos independentes** — Falha de um não afeta outros
2. **Pipeline pluggable** — Configuração vem do document_type
3. **Multi-tenant** — Tudo scoped por organization_id
4. **Event bus** — Comunicação desacoplada
5. **Prompts como dados** — Templates .md editáveis

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

## Fluxo Completo de Geração
```
1. Usuário preenche formulário (tipo + áreas + solicitação + contexto anamnese)
2. API valida tipo de documento no module_registry
3. build_pipeline_context() monta contexto com perfil do usuário + campos estruturados
4. PipelineOrchestrator(doc_id, config, anamnesis_context=ctx) é criado
5. Pipeline executa:
   a. Pesquisa paralela (Qdrant + DataJud + SearXNG)
   b. Deliberação multi-área (se ≥1 área selecionada) — LLM por área + moderador + revisor
   c. Agentes em sequência (triagem → jurista → advogado_diabo → redator → revisor…)
   d. Integração (header/footer/pós-processo)
   e. Quality gate (regras do document_type)
   f. Geração DOCX
6. Thesis bank auto-populado (fire-and-forget, 2-5 teses extraídas por LLM)
7. WebSocket emite progresso em tempo real para o frontend
```

## Princípios
1. **Módulos independentes** — Falha de um não afeta outros
2. **Pipeline pluggable** — Configuração vem do document_type
3. **Multi-tenant** — Tudo scoped por organization_id
4. **Event bus** — Comunicação desacoplada
5. **Prompts como dados** — Templates .md editáveis
6. **Anamnese 2 camadas** — Perfil persistente (Layer 1) + contexto por request (Layer 2)
7. **Deliberação multi-área** — Juristas especializados por área deliberam antes dos agentes principais
8. **Thesis bank orgânico** — Banco cresce automaticamente a cada documento gerado

## Módulos Implementados

### document_types (6)
| ID | Nome |
|----|------|
| parecer | Parecer Jurídico (9 agentes; template mprs_caopp intocável) |
| peticao_inicial | Petição Inicial (8 agentes; CPC/2015 arts. 319-320) |
| contestacao | Contestação |
| recurso | Recurso |
| sentenca | Sentença Judicial (CPC art. 489) |
| acao_civil_publica | Ação Civil Pública |

### legal_areas (5)
| ID | Nome |
|----|------|
| administrative | Direito Administrativo (Lei 14.133/21, 8.429/92) |
| civil | Direito Civil (CC/2002, CPC/2015) |
| constitutional | Direito Constitucional (CF/88) |
| labor | Direito do Trabalho (CLT, TST) |
| tax | Direito Tributário (CTN, execução fiscal) |

### services
- **anamnesis** — Perfil profissional + campos por doc_type
- **thesis_bank** — CRUD + auto-populate pós-pipeline
- **whatsapp_bot** — Máquina de estados via Evolution API

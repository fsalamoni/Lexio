# Lexio — Arquitetura

## Visão Geral
Lexio é um SaaS de produção jurídica com IA que roda **100% no browser**. Toda a lógica LLM executa no frontend TypeScript via OpenRouter API. Firebase fornece auth, banco (Firestore) e hosting. Não há backend Python em produção.

## Camadas
```
Frontend (React 18 + TypeScript + Vite 5)
    ↕
Firebase Auth ─── Firebase Firestore (NoSQL)
    ↕
OpenRouter API (40+ modelos LLM)
    ↕
Cloud Function (datajudProxy — proxy para API DataJud/CNJ)
```

## Fluxo Completo de Geração de Documento
```
1. Usuário preenche formulário (tipo + áreas + solicitação + teses + acervo)
2. Context Detail (Layer 2) gera perguntas refinamento (se ativado)
3. Pipeline sequencial de 11 agentes:
   a. Triagem — extrai tema, subtemas, palavras-chave
   b. [Condicional] Busca acervo → Compila base → Revisa base
   c. Pesquisador — legislação e jurisprudência
   d. Jurista — desenvolve teses legais
   e. Advogado do Diabo — critica e identifica fraquezas
   f. Jurista v2 — refina teses pós-crítica
   g. Fact-Checker — verifica citações
   h. Moderador — planeja estrutura do documento
   i. Redator — redige documento final (12k tokens)
4. Teses são auto-extraídas para o banco de teses
5. Documento salvo no Firestore com llm_executions[]
6. Export DOCX e PPTX disponível no browser
```

## Princípios
1. **Frontend-only** — Toda lógica roda no browser, sem backend Python
2. **Multi-pipeline** — 10 pipelines com 58 agentes configuráveis
3. **Modelo flexível** — Cada usuário escolhe o modelo LLM dos próprios agentes
4. **Anamnese 2 camadas** — Perfil persistente (Layer 1) + contexto por request (Layer 2)
5. **Catálogo dinâmico** — Modelos podem ser adicionados/removidos nas configurações pessoais; o catálogo persistido de cada usuário é a fonte de verdade para os seletores e validações dos próprios agentes
6. **Dual deploy** — GitHub Pages + Firebase Hosting com CI/CD automático

## Pipelines Implementados

### 10 pipelines · 58 agentes

| Pipeline | Agentes | Arquivo | Config Firestore |
|----------|---------|---------|-----------------|
| Geração de documentos | 11 (3 condicionais) | `generation-service.ts` | `agent_models` |
| Análise de teses | 5 | `thesis-analyzer.ts` | `thesis_analyst_models` |
| Context detail | 1 | — | `context_detail_models` |
| Classificador acervo | 1 | — | `acervo_classificador_models` |
| Ementa acervo | 1 | — | `acervo_ementa_models` |
| Caderno de pesquisa | 12 | `notebook-studio-pipeline.ts` | `research_notebook_models` |
| Notebook acervo | 4 | `notebook-acervo-analyzer.ts` | `notebook_acervo_models` |
| Vídeo | 11 | `video-generation-pipeline.ts` | `video_pipeline_models` |
| Áudio | 6 | `audio-generation-pipeline.ts` | `audio_pipeline_models` |
| Apresentação | 6 | `presentation-generation-pipeline.ts` | `presentation_pipeline_models` |

## Tipos de Documento (10)
| ID | Nome |
|----|------|
| `parecer` | Parecer Jurídico |
| `peticao_inicial` | Petição Inicial |
| `contestacao` | Contestação |
| `recurso` | Recurso |
| `sentenca` | Sentença |
| `acao_civil_publica` | Ação Civil Pública |
| `mandado_seguranca` | Mandado de Segurança |
| `habeas_corpus` | Habeas Corpus |
| `agravo` | Agravo de Instrumento |
| `embargos_declaracao` | Embargos de Declaração |

## Áreas do Direito (17)
| ID | Nome |
|----|------|
| `administrative` | Direito Administrativo |
| `constitutional` | Direito Constitucional |
| `civil` | Direito Civil |
| `tax` | Direito Tributário |
| `labor` | Direito do Trabalho |
| `criminal` | Direito Penal |
| `criminal_procedure` | Processo Penal |
| `civil_procedure` | Processo Civil |
| `consumer` | Direito do Consumidor |
| `environmental` | Direito Ambiental |
| `business` | Direito Empresarial |
| `family` | Direito de Família |
| `inheritance` | Direito das Sucessões |
| `social_security` | Direito Previdenciário |
| `electoral` | Direito Eleitoral |
| `international` | Direito Internacional |
| `digital` | Direito Digital |

## Serviços
- **Anamnese** — Perfil profissional 2 camadas (Layer 1 persistente + Layer 2 por geração)
- **Banco de Teses** — CRUD + auto-extração + análise batch com 5 agentes
- **Acervo** — Upload + classificação automática + ementa por IA
- **Caderno de Pesquisa** — Chat + 6 agentes pesquisa + estúdio de 13 artefatos
- **DataJud** — Pesquisa de jurisprudência via Cloud Function proxy
- **Pesquisa Web** — DuckDuckGo + Jina para scraping

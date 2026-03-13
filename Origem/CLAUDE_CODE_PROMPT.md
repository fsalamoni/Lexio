# OpenClaw MPRS — Plataforma Completa

## PROMPT PARA CLAUDE CODE

Você vai construir a plataforma OpenClaw — sistema de geração automática de pareceres jurídicos com IA multi-agente para o Ministério Público do Rio Grande do Sul (MPRS).

O sistema atual funciona via n8n + WhatsApp e está validado (score 95/100). Sua tarefa é migrar TODA a lógica para uma plataforma Python/FastAPI com frontend React, mantendo 100% da funcionalidade existente e adicionando: dashboard web, upload de documentos, formulário de geração, e sistema de aprovação.

---

## 1. CONTEXTO DO PROJETO

### O que existe hoje (funcional, validado):
- Pipeline de 10 agentes IA sequenciais orquestrado pelo n8n
- WhatsApp como interface (Evolution API)
- Qdrant como banco vetorial (28.246 documentos jurídicos indexados, collection `acervo_mprs`)
- Ollama local para embeddings (modelo `mxbai-embed-large`, dimensão 1024)
- OpenRouter como gateway LLM (Claude Sonnet 4 para agentes principais, Haiku para triagem)
- Flask/Python service para geração de DOCX
- Score de qualidade consistente: 95/100

### O que precisa ser construído:
- Backend FastAPI que substitui o n8n como orquestrador
- Frontend React com dashboard, formulário de geração, upload de documentos
- PostgreSQL para persistência (pareceres, usuários, execuções, métricas)
- Sistema de aprovação (!aprovar/!rejeitar) via WhatsApp e web
- WebSocket para streaming de progresso em tempo real
- O WhatsApp continua funcionando (Evolution API webhook vai para o FastAPI)

---

## 2. ARQUITETURA

```
┌──────────────────────────────────────────────────────┐
│                    FRONTEND                           │
│               React + Tailwind + shadcn/ui            │
│                                                       │
│  ┌───────────┐ ┌───────────┐ ┌─────────────────────┐ │
│  │Formulário │ │ Dashboard │ │ Upload documentos   │ │
│  │ parecer   │ │ métricas  │ │   PDF/DOCX          │ │
│  └─────┬─────┘ └─────┬─────┘ └──────────┬──────────┘ │
└────────┼─────────────┼──────────────────┼─────────────┘
         │             │                  │
         ▼             ▼                  ▼
┌──────────────────────────────────────────────────────┐
│                     FastAPI                            │
│              (backend unificado)                       │
│                                                       │
│  POST /api/pareceres         → gerar parecer          │
│  GET  /api/pareceres         → listar com filtros     │
│  GET  /api/pareceres/{id}    → detalhes + DOCX        │
│  PATCH /api/pareceres/{id}   → aprovar/rejeitar       │
│  POST /api/documentos/upload → upload + indexação      │
│  GET  /api/stats             → métricas e custos      │
│  GET  /api/health            → status dos serviços    │
│  WS   /ws/parecer/{id}      → progresso tempo real    │
│  POST /webhook/whatsapp      → recebe msgs WhatsApp   │
│                                                       │
│  ┌────────────────────────────────────────────────┐   │
│  │         Pipeline de Geração (async)            │   │
│  │  10 agentes sequenciais em Python              │   │
│  │  prompts em arquivos .py separados             │   │
│  └────────────────────────────────────────────────┘   │
│                                                       │
│  ┌───────────┐ ┌────────┐ ┌─────────────────────┐    │
│  │PostgreSQL │ │ Qdrant │ │ OpenRouter (LLM)    │    │
│  │           │ │        │ │                     │    │
│  │- users    │ │- acervo│ │- Claude Sonnet 4    │    │
│  │- pareceres│ │- uploads│ │- Claude Haiku 3.5  │    │
│  │- execuções│ │        │ │                     │    │
│  └───────────┘ └────────┘ └─────────────────────┘    │
└────────────┬────────────────────────┬────────────────┘
             │                        │
   ┌─────────▼──────────┐  ┌─────────▼──────────┐
   │  WhatsApp           │  │   DOCX Generator   │
   │  Evolution API      │  │   (módulo interno)  │
   │  !parecer           │  │   python-docx       │
   │  !aprovar           │  │                     │
   └────────────────────┘  └────────────────────┘
```

---

## 3. ESTRUTURA DO PROJETO

```
openclaw/
├── docker-compose.yml
├── .env.example
├── .env                          # ignorado pelo git
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                   # FastAPI app, rotas, startup
│   ├── config.py                 # Settings via pydantic-settings
│   ├── database.py               # SQLAlchemy async + modelos
│   ├── models.py                 # Pydantic schemas (request/response)
│   │
│   ├── pipeline/
│   │   ├── __init__.py
│   │   ├── orchestrator.py       # Executa os 10 agentes em sequência
│   │   ├── llm_client.py         # Wrapper OpenRouter (retry, log, custo)
│   │   ├── search.py             # Qdrant + DataJud + SearXNG
│   │   ├── embedding.py          # Ollama embed
│   │   ├── quality_gate.py       # Validação do parecer
│   │   ├── integrator.py         # Pós-processamento (markdown strip, headers)
│   │   └── docx_generator.py     # Geração DOCX (migrado do app.py Flask)
│   │
│   ├── prompts/
│   │   ├── __init__.py
│   │   ├── triagem.py
│   │   ├── moderador_agenda.py
│   │   ├── jurista.py
│   │   ├── advogado_diabo.py
│   │   ├── jurista_v2.py
│   │   ├── fact_checker.py
│   │   ├── moderador_plano.py
│   │   ├── redator.py
│   │   └── revisor.py
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── whatsapp.py           # Evolution API (enviar msg, enviar DOCX)
│   │   ├── document_upload.py    # Processar PDF/DOCX, extrair texto, indexar Qdrant
│   │   └── approval.py           # Lógica de aprovação/rejeição
│   │
│   └── websocket/
│       ├── __init__.py
│       └── progress.py           # WebSocket manager para streaming status
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── api/                  # Axios client + hooks
│       ├── pages/
│       │   ├── Dashboard.tsx     # Métricas, custos, gráficos
│       │   ├── Pareceres.tsx     # Lista com filtros
│       │   ├── ParecerDetail.tsx # Preview + aprovar/rejeitar
│       │   ├── NovoParecer.tsx   # Formulário de geração
│       │   └── Upload.tsx        # Upload de documentos
│       └── components/
│           ├── Layout.tsx
│           ├── Sidebar.tsx
│           ├── StatusBadge.tsx
│           ├── ProgressTracker.tsx  # WebSocket status
│           └── DocxPreview.tsx      # mammoth.js preview
│
└── database/
    └── schema.sql
```

---

## 4. VARIÁVEIS DE AMBIENTE (.env.example)

```env
# === LLM ===
OPENROUTER_API_KEY=sk-or-v1-XXXXX
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1/chat/completions
MODEL_TRIAGE=anthropic/claude-3.5-haiku
MODEL_MAIN=anthropic/claude-sonnet-4

# === Qdrant ===
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION=acervo_mprs
QDRANT_API_KEY=escrita_indexador_2026

# === Ollama (embeddings) ===
OLLAMA_URL=http://ollama:11434
EMBED_MODEL=mxbai-embed-large

# === PostgreSQL ===
DATABASE_URL=postgresql+asyncpg://openclaw:openclaw@postgres:5432/openclaw

# === Evolution API (WhatsApp) ===
EVOLUTION_URL=http://evolution-api:8080
EVOLUTION_APIKEY=B97A48B7-C050-4183-B18A-78B41D52C288
EVOLUTION_INSTANCE=Parecerista

# === DataJud (CNJ) ===
DATAJUD_API_KEY=cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==
DATAJUD_URL=https://api-publica.datajud.cnj.jus.br/api_publica_tjrs/_search

# === SearXNG ===
SEARXNG_URL=http://searxng:8080/search

# === App ===
APP_NAME=OpenClaw MPRS
APP_VERSION=3.0
SECRET_KEY=gerar-chave-segura-aqui
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## 5. DATABASE SCHEMA (PostgreSQL)

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Usuários (promotores)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(20) UNIQUE,
    email VARCHAR(255) UNIQUE,
    role VARCHAR(50) DEFAULT 'promotor' CHECK (role IN ('promotor', 'admin', 'viewer')),
    is_active BOOLEAN DEFAULT true,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pareceres
CREATE TABLE pareceres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    tema VARCHAR(500) NOT NULL,
    solicitacao TEXT,
    palavras_chave TEXT[],
    area_direito VARCHAR(100),
    status VARCHAR(20) DEFAULT 'gerando'
        CHECK (status IN ('gerando', 'rascunho', 'aprovado', 'rejeitado', 'revisao')),
    texto_completo TEXT,
    docx_path VARCHAR(500),
    quality_score INTEGER,
    quality_issues TEXT[],
    metadata JSONB DEFAULT '{}',
    -- metadata: {tokens_in, tokens_out, custo_total_usd, tempo_total_ms,
    --            fragmentos_qdrant, leis_citadas, conectivos_usados}
    feedback TEXT,
    origem VARCHAR(20) DEFAULT 'whatsapp' CHECK (origem IN ('whatsapp', 'web')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Execuções individuais (cada chamada LLM)
CREATE TABLE executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parecer_id UUID REFERENCES pareceres(id) ON DELETE CASCADE,
    agent_name VARCHAR(100) NOT NULL,
    phase VARCHAR(50),
    model VARCHAR(100),
    tokens_in INTEGER,
    tokens_out INTEGER,
    cost_usd DECIMAL(10,6),
    duration_ms INTEGER,
    input_preview TEXT,
    output_preview TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documentos enviados pelo promotor
CREATE TABLE uploaded_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    parecer_id UUID REFERENCES pareceres(id),
    filename VARCHAR(500) NOT NULL,
    original_name VARCHAR(500),
    mime_type VARCHAR(100),
    size_bytes INTEGER,
    extracted_text TEXT,
    qdrant_point_ids TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Views para dashboard
CREATE VIEW v_stats_diario AS
SELECT
    DATE(created_at) as dia,
    COUNT(*) as total_pareceres,
    AVG(quality_score) as score_medio,
    SUM((metadata->>'custo_total_usd')::decimal) as custo_total,
    AVG((metadata->>'tempo_total_ms')::integer) as tempo_medio_ms,
    COUNT(*) FILTER (WHERE status = 'aprovado') as aprovados,
    COUNT(*) FILTER (WHERE status = 'rejeitado') as rejeitados
FROM pareceres
GROUP BY DATE(created_at)
ORDER BY dia DESC;

CREATE VIEW v_stats_agente AS
SELECT
    agent_name,
    COUNT(*) as chamadas,
    AVG(tokens_in) as tokens_in_medio,
    AVG(tokens_out) as tokens_out_medio,
    SUM(cost_usd) as custo_total,
    AVG(duration_ms) as tempo_medio_ms
FROM executions
GROUP BY agent_name;

-- Índices
CREATE INDEX idx_pareceres_user ON pareceres(user_id);
CREATE INDEX idx_pareceres_status ON pareceres(status);
CREATE INDEX idx_pareceres_created ON pareceres(created_at DESC);
CREATE INDEX idx_executions_parecer ON executions(parecer_id);
CREATE INDEX idx_uploads_parecer ON uploaded_documents(parecer_id);
```

---

## 6. PIPELINE DE GERAÇÃO — OS 10 AGENTES

O pipeline é a transposição EXATA do workflow n8n validado. Cada agente faz uma chamada HTTP ao OpenRouter e recebe resposta. O fluxo é estritamente sequencial:

```
FASE 1: Triagem (Haiku) → tema, palavras-chave
FASE 2: Pesquisa paralela → Qdrant + DataJud + SearXNG
FASE 3: Deliberação (Sonnet) → 5 agentes:
    MOD1 Agenda → tópicos
    JURISTA → teses
    ADVOGADO DO DIABO → críticas
    JURISTA v2 → teses refinadas
    FACT-CHECKER → teses verificadas
    MOD2 Plano → plano de redação
FASE 4: Redação (Sonnet) → parecer bruto
FASE 5: Revisão (Sonnet) → parecer final
FASE 6: Quality Gate + Integrador + DOCX + Entrega
```

### 6.1 Chamada LLM (OpenRouter)

TODAS as chamadas LLM usam o mesmo formato (compatível OpenAI):

```python
POST https://openrouter.ai/api/v1/chat/completions
Headers:
    Authorization: Bearer {OPENROUTER_API_KEY}
    Content-Type: application/json
Body:
    {
        "model": "anthropic/claude-sonnet-4",  # ou claude-3.5-haiku
        "messages": [
            {"role": "system", "content": "...system prompt..."},
            {"role": "user", "content": "...user prompt..."}
        ],
        "max_tokens": 8000,
        "temperature": 0.3
    }
Response: data.choices[0].message.content
```

O `llm_client.py` deve:
- Fazer retry com backoff exponencial (3 tentativas)
- Logar tokens_in, tokens_out, custo, duração
- Salvar execução no PostgreSQL
- Calcular custo: Haiku = $1/$5 por M tokens, Sonnet = $3/$15 por M tokens
- Enviar progresso via WebSocket a cada etapa

### 6.2 Pesquisa Qdrant (Busca Acervo)

```python
POST http://qdrant:6333/collections/acervo_mprs/points/search
Headers:
    Content-Type: application/json
    api-key: escrita_indexador_2026
Body:
    {
        "vector": [...],  # 1024 dims do mxbai-embed-large
        "limit": 12,
        "with_payload": true
    }
```

O payload de cada ponto contém:
- `trecho` ou `text` ou `content`: texto do fragmento
- `arquivo`: nome do arquivo fonte
- `categoria` ou `pasta`: categoria do documento

Formatar resultado como:
```
[Fonte: {arquivo}] [{categoria}]
{trecho}

---

[Fonte: {arquivo2}] ...
```

### 6.3 Pesquisa DataJud (CNJ)

```python
POST https://api-publica.datajud.cnj.jus.br/api_publica_tjrs/_search
Headers:
    Authorization: APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==
    Content-Type: application/json
Body:
    {
        "query": {"bool": {"must": [{"match": {"assuntos.nome": "{tema}"}}]}},
        "size": 5,
        "sort": [{"dataAjuizamento": {"order": "desc"}}],
        "_source": ["numeroProcesso", "tribunal", "assuntos", "dataAjuizamento", "classeProcessual"]
    }
```

Formatar: `Processo: {numero} | Tribunal: {tribunal} | Classe: {classe} | Assuntos: {assuntos} | Data: {data}`

### 6.4 Pesquisa Legislação (SearXNG)

```python
GET http://searxng:8080/search?q={tema}+legislação+direito+brasil&format=json&language=pt-BR&pageno=1
Headers:
    Accept: application/json
```

Formatar: título + conteúdo + URL dos 5 primeiros resultados.

### 6.5 Embedding (Ollama)

```python
POST http://ollama:11434/api/embed
Body:
    {
        "model": "mxbai-embed-large",
        "input": "{msgOriginal} {tema} {palavras_chave}"
    }
Response: data.embeddings[0]  # vetor de 1024 dimensões
```

---

## 7. PROMPTS DOS AGENTES

ATENÇÃO: Estes prompts estão VALIDADOS e produzem score 95/100. NÃO modifique o conteúdo dos prompts. Apenas transponha-os para Python.

Cada arquivo em `prompts/` exporta duas funções:
```python
def system_prompt(context: dict) -> str: ...
def user_prompt(context: dict) -> str: ...
```

O `context` contém: tema, msgOriginal, fragmentosAcervo, processosJudiciarios, legislacao, topicos, teses, criticas, teses_v2, teses_verificadas, plano, parecer_bruto.

### 7.1 TRIAGEM (Haiku, temperature=0.1, max_tokens=400)

```
SYSTEM:
Você é o TRIADOR do CAOPP/MPRS. Extraia o tema jurídico da solicitação.
<regras>
- O "tema" DEVE refletir EXATAMENTE o assunto perguntado
- Se menciona "nepotismo cruzado", tema DEVE conter "nepotismo cruzado"
- NUNCA use frases genéricas
</regras>
Responda APENAS JSON: {"tema":"...","palavras_chave":["..."],"area_direito":"...","tipo_ilicito":"...","subtemas":["..."]}

USER:
<solicitacao>{msgOriginal}</solicitacao>
Extraia o tema.
```

Pós-processamento: extrair JSON da resposta com regex `\{[\s\S]*\}`. Validar tema (rejeitar genéricos como "resumo do tema", "orientação jurídica", "não especificado"). Fallback: usar msgOriginal como tema.

### 7.2 MODERADOR AGENDA (Sonnet, temperature=0.3, max_tokens=2000)

```
SYSTEM:
Você é o MODERADOR do colegiado CAOPP/MPRS.
Analise os materiais de pesquisa e defina os TÓPICOS de debate para o parecer sobre "${tema}".
Liste 5-8 tópicos jurídicos concretos, cada um com: título, questão central, normas relevantes.
Formato: texto corrido, sem JSON.

USER:
<tema>${tema}</tema>
<solicitacao>${msgOriginal}</solicitacao>
<fragmentos>${fragmentosAcervo (max 7000 chars)}</fragmentos>
<processos>${processosJudiciarios}</processos>
<legislacao>${legislacao (max 2000 chars)}</legislacao>
Defina os tópicos de debate.
```

### 7.3 JURISTA TESES (Sonnet, temperature=0.3, max_tokens=3000)

```
SYSTEM:
Você é JURISTA SÊNIOR do CAOPP/MPRS.
Desenvolva TESES JURÍDICAS sobre "${tema}" baseadas EXCLUSIVAMENTE nos fragmentos reais.
Para cada tese: (a) fundamento constitucional/legal com artigos, (b) jurisprudência dos fragmentos, (c) aplicação ao caso.
NUNCA invente leis ou jurisprudência. Use APENAS o que está nos <fragmentos>.
Cite [Fonte: arquivo] para cada referência.

USER:
<tema>${tema}</tema>
<topicos>${topicos}</topicos>
<fragmentos>${fragmentosAcervo (max 7000 chars)}</fragmentos>
<processos>${processosJudiciarios}</processos>
<legislacao>${legislacao (max 2000 chars)}</legislacao>
Desenvolva as teses jurídicas.
```

### 7.4 ADVOGADO DO DIABO (Sonnet, temperature=0.4, max_tokens=2000)

```
SYSTEM:
Você é o ADVOGADO DO DIABO do CAOPP/MPRS.
Ataque CADA tese do Jurista sobre "${tema}".
Para cada: identifique falhas lógicas, jurisprudência contrária, exceções legais, pontos fracos.
Seja rigoroso. Se uma tese é sólida, diga — mas busque brechas.

USER:
<tema>${tema}</tema>
<teses>${teses}</teses>
<fragmentos>${fragmentosAcervo (max 4000 chars)}</fragmentos>
Ataque cada tese.
```

### 7.5 JURISTA v2 (Sonnet, temperature=0.3, max_tokens=3000)

```
SYSTEM:
Você é JURISTA SÊNIOR do CAOPP/MPRS.
Refine suas teses sobre "${tema}" respondendo PONTO A PONTO às críticas do Advogado do Diabo.
Fortaleça argumentos, adicione fundamentos, rebata objeções.

USER:
<tema>${tema}</tema>
<teses_originais>${teses}</teses_originais>
<criticas>${criticas}</criticas>
<fragmentos>${fragmentosAcervo (max 4000 chars)}</fragmentos>
Refine as teses respondendo às críticas.
```

### 7.6 FACT-CHECKER (Sonnet, temperature=0.1, max_tokens=2000)

```
SYSTEM:
Você é VERIFICADOR DE FATOS do CAOPP/MPRS.
Verifique CADA lei, artigo, súmula e processo citado nas teses sobre "${tema}".
Confirme contra os fragmentos reais. Se uma citação NÃO aparece nos fragmentos, REMOVA ou substitua por "conforme jurisprudência consolidada do STF/STJ".
NUNCA deixe passar lei inventada. Lei 8.666/93 está REVOGADA — use 14.133/21.

USER:
<tema>${tema}</tema>
<teses>${teses_v2}</teses>
<fragmentos>${fragmentosAcervo (max 5000 chars)}</fragmentos>
<legislacao>${legislacao}</legislacao>
Verifique cada citação. Retorne versão limpa.
```

### 7.7 MODERADOR PLANO (Sonnet, temperature=0.3, max_tokens=2000)

```
SYSTEM:
Você é o MODERADOR do colegiado CAOPP/MPRS.
Com base nas teses verificadas sobre "${tema}", monte o PLANO DE REDAÇÃO do parecer.
Estruture: RELATÓRIO (o que descrever), FUNDAMENTAÇÃO JURÍDICA (seções e ordem dos argumentos), CONCLUSÃO (recomendações concretas).
Indique para cada seção: quais normas citar, quais fragmentos usar, qual conclusão parcial.

USER:
<tema>${tema}</tema>
<teses_verificadas>${teses_verificadas}</teses_verificadas>
<fragmentos>${fragmentosAcervo (max 4000 chars)}</fragmentos>
Monte o plano de redação.
```

### 7.8 REDATOR (Sonnet, temperature=0.3, max_tokens=8000)

```
SYSTEM:
Você é REDATOR JURÍDICO SÊNIOR do CAOPP/MPRS.

<regra_absoluta>
CADA parágrafo deve tratar de "${tema}". Conteúdo genérico = REJEITADO.
</regra_absoluta>

<anti_alucinacao>
NUNCA invente leis. Lei 8.666/93 REVOGADA — use 14.133/21.
Use APENAS fragmentos ou leis notórias. Transcreva artigos entre aspas.
Para jurisprudência: cite APENAS julgados que aparecem nos <fragmentos> ou <processos>. Se não há julgado específico nos dados fornecidos, use "conforme jurisprudência consolidada do STF/STJ sobre [tema]" — NUNCA invente número de REsp, RE, MS ou relator.
</anti_alucinacao>

<estrutura>
RELATÓRIO
- PRIMEIRA FRASE (copie LITERALMENTE, JAMAIS quebre ou trunque):
  "Trata-se de consulta apresentada a este Centro de Apoio Operacional Cível e do Patrimônio Público, nos seguintes termos:"
- Se truncar após "a este" = REJEITADO.
- Em seguida descreva: "${tema}" com contexto fático (2-3 parágrafos)
- "Nos termos da Ordem de Serviço n. 02/2015, as respostas formuladas pelos Centros de Apoio Operacional não produzem efeitos vinculantes e não devem fazer parte dos autos, podendo os argumentos ser acolhidos pelo consulente e utilizados como razões de decidir."
- Delimitação do escopo

FUNDAMENTAÇÃO JURÍDICA
- Subseções com TÍTULOS DESCRITIVOS EM MAIÚSCULAS (sem numeração 3.1, 3.2)
- Cada: tese + artigo transcrito + jurisprudência + aplicação
- Mínimo 8 parágrafos LONGOS (4+ linhas). Cite 3+ fragmentos [Fonte: arquivo]
- Camadas: CF > Federal > Estadual > Jurisprudência > Caso concreto

CONCLUSÃO
- Síntese + recomendação CONCRETA (IC/ACP/arquivamento/diligências/recomendação)
- "É o parecer, salvo melhor juízo."
</estrutura>

<conectivos>
USE conectivos VARIADOS. REGRA ESTRITA: cada conectivo NO MÁXIMO 2x. 3x o mesmo = REJEITADO.
Lista obrigatória (use pelo menos 6 diferentes):
Nesse sentido | Outrossim | Com efeito | Nessa esteira | Dessa sorte | Ademais | Importa destacar | Cumpre observar | De outro lado | Por sua vez | Nessa perspectiva | Destarte | Vale dizer | Em suma | Assim sendo | Convém ressaltar | Sob essa ótica | De igual modo
</conectivos>

<proibicoes>
NÃO inclua: cabeçalho, data, assinatura (adicionados externamente).
NÃO use markdown. Texto PURO. Complete CADA frase.
NÃO comece com "Senhor Promotor" (adicionado externamente).
Separe parágrafos com DUAS quebras de linha (\n\n).
</proibicoes>

USER:
<tema>${tema}</tema>
<solicitacao>${msgOriginal}</solicitacao>
<plano>${plano}</plano>
<teses>${teses_verificadas}</teses>
<fragmentos>${fragmentosAcervo (max 7000 chars)}</fragmentos>
<processos>${processosJudiciarios}</processos>
<legislacao>${legislacao (max 2000 chars)}</legislacao>
Redija parecer COMPLETO sobre "${tema}". Comece com "RELATÓRIO". Termine com "É o parecer, salvo melhor juízo." Separe cada parágrafo com linha em branco.
```

### 7.9 REVISOR (Sonnet, temperature=0.2, max_tokens=8000)

```
SYSTEM:
Você é REVISOR FINAL do CAOPP/MPRS.
<checklist>
1. TEMA: trata de "${tema}" em TODAS seções? Se não → REESCREVA.
2. ESTRUTURA: RELATÓRIO + FUNDAMENTAÇÃO JURÍDICA + CONCLUSÃO? Se não → ADICIONE.
3. ABERTURA: A PRIMEIRA frase do RELATÓRIO DEVE ser EXATAMENTE: "Trata-se de consulta apresentada a este Centro de Apoio Operacional Cível e do Patrimônio Público, nos seguintes termos:" Se truncada → COMPLETE. Correção MAIS IMPORTANTE.
4. LEIS: inventadas ou Lei 8.666/93? Se sim → REMOVA/substitua por 14.133/21.
5. JURISPRUDÊNCIA INVENTADA: REsp, RE, MS com números inventados? Se sim → substitua por "conforme jurisprudência consolidada do STF/STJ".
6. CONECTIVOS: algum aparece 3+ vezes? Se sim → SUBSTITUA extras por outros da lista: Nesse sentido, Outrossim, Com efeito, Nessa esteira, Dessa sorte, Ademais, Importa destacar, Cumpre observar, De outro lado, Por sua vez, Destarte, Vale dizer, Convém ressaltar, Sob essa ótica.
7. FORMATO: títulos MAIÚSCULAS, sem markdown? Se não → CORRIJA.
8. FECHO: "É o parecer, salvo melhor juízo."? Se não → ADICIONE.
9. CONCLUSÃO: recomendação CONCRETA? Se não → ESPECIFIQUE.
10. FONTES: 3+ citações [Fonte:]? Se não → ADICIONE dos fragmentos.
11. SAUDAÇÃO/DATA: "Senhor Promotor", data, assinatura NO CORPO? Se sim → REMOVA.
12. COMPLETUDE: frases truncadas ou cortadas no meio? Se sim → COMPLETE.
13. OS 02/2015: referência presente no RELATÓRIO? Se não → ADICIONE.
14. PARÁGRAFOS: separe CADA parágrafo com \n\n. Se texto está em bloco único → QUEBRE.
</checklist>
Retorne VERSÃO FINAL CORRIGIDA. Texto puro, sem markdown. Parágrafos separados por \n\n.

USER:
<tema>${tema}</tema>
<solicitacao>${msgOriginal}</solicitacao>
<parecer>${parecer_bruto}</parecer>
<fragmentos>${fragmentosAcervo (max 4000 chars)}</fragmentos>
Revise aplicando os 14 pontos. REMOVA saudação/data/assinatura do corpo. QUEBRE em parágrafos (\n\n). Versão final COMPLETA.
```

---

## 8. QUALITY GATE (validação programática)

O Quality Gate é uma verificação NÃO-LLM do parecer final. Roda APÓS o Revisor.

```python
def quality_gate(parecer: str, tema: str) -> dict:
    issues = []
    lower = parecer.lower()
    tema_words = [w for w in tema.lower().split() if len(w) > 3]

    # 1. Tema presente
    hits = [w for w in tema_words if w in lower]
    if not hits and tema_words:
        issues.append("TEMA_AUSENTE")

    # 2. Estrutura
    if "RELATÓRIO" not in parecer: issues.append("SEM_RELATORIO")
    if "FUNDAMENTAÇÃO" not in parecer: issues.append("SEM_FUNDAMENTACAO")
    if "CONCLUSÃO" not in parecer: issues.append("SEM_CONCLUSAO")

    # 3. Comprimento
    if len(parecer) < 2000: issues.append(f"CURTO:{len(parecer)}")

    # 4. Fontes
    fontes = len(re.findall(r'\[Fonte:[^\]]+\]', parecer))
    if fontes < 1: issues.append("SEM_FONTES")

    # 5. Lei revogada
    if "8.666" in parecer: issues.append("LEI_REVOGADA")

    # 6. Saudação indevida
    if re.match(r'^Senhor Promotor', parecer, re.I | re.M):
        issues.append("SAUDACAO")

    # 7. Abertura truncada (checar entre RELATÓRIO e FUNDAMENTAÇÃO)
    rel_idx = parecer.find("RELATÓRIO")
    fund_idx = parecer.find("FUNDAMENTAÇÃO")
    opening = parecer[rel_idx:fund_idx] if fund_idx > rel_idx else parecer[rel_idx:rel_idx+2000]
    if "Centro de Apoio Operacional Cível e do Patrimônio Público" not in opening:
        issues.append("ABERTURA_TRUNCADA")

    # 8. Conectivos
    CONECTIVOS = ['nesse sentido','outrossim','com efeito','nessa esteira',
        'dessa sorte','ademais','importa destacar','cumpre observar','de outro lado',
        'por sua vez','nessa perspectiva','destarte','vale dizer','em suma',
        'assim sendo','convém ressaltar','sob essa ótica','de igual modo']
    usados = [c for c in CONECTIVOS if c in lower]
    if len(usados) < 3: issues.append(f"POUCOS_CONECTIVOS:{len(usados)}")
    excessivos = [c for c in CONECTIVOS if len(re.findall(c, lower, re.I)) > 2]
    if excessivos: issues.append(f"CONECTIVOS_EXCESSO:{','.join(excessivos)}")

    # 9. Jurisprudência inventada
    resp_inventado = re.findall(r'REsp\s+[\d.]+/[A-Z]{2}', parecer)
    if resp_inventado and fontes < 1: issues.append("JURISP_INVENTADA")

    score = max(0, 100 - len(issues) * 12)
    return {
        "passed": len(issues) <= 1,
        "issues": issues,
        "score": score,
        "fontes": fontes,
        "tema_hits": len(hits),
        "conectivos_usados": len(usados),
        "length": len(parecer)
    }
```

---

## 9. INTEGRADOR (pós-processamento)

O Integrador prepara o texto do parecer para geração DOCX. Roda APÓS o Quality Gate.

```python
def integrar_parecer(parecer: str, tema: str) -> str:
    hoje = datetime.now().strftime("%d de %B de %Y").replace(
        "January","janeiro").replace("February","fevereiro")  # etc, usar locale pt_BR
    p = parecer

    # Strip markdown
    p = re.sub(r'#{1,6}\s*', '', p)
    p = re.sub(r'\*\*([^*]+)\*\*', r'\1', p)
    p = re.sub(r'\*([^*]+)\*', r'\1', p)
    p = re.sub(r'^[-*]\s+', '', p, flags=re.M)
    p = re.sub(r'```[\s\S]*?```', '', p)
    p = re.sub(r'`([^`]+)`', r'\1', p)
    p = p.strip()

    # Remove saudação/header/assinatura que o LLM possa ter incluído
    p = re.sub(r'^Senhor Promotor de Justiça:?\s*', '', p, flags=re.I)
    p = re.sub(r'^PARECER JURÍDICO\s*', '', p, flags=re.I)
    p = re.sub(r'Porto Alegre,.*\d{4}\.?\s*$', '', p, flags=re.M)
    p = re.sub(r'^Centro de Apoio Operacional[^\n]*$', '', p, flags=re.M)
    p = re.sub(r'^Ministério Público[^\n]*$', '', p, flags=re.M)
    p = re.sub(r'É o parecer,? salvo melhor juízo\.?\s*$', '', p, flags=re.I)
    p = p.strip()

    # Section headers
    for header in ['RELATÓRIO', 'FUNDAMENTAÇÃO JURÍDICA', 'CONCLUSÃO']:
        p = p.replace(header, f'\n\n{header}\n\n')

    # Fix revoked law
    p = re.sub(r'Lei\s+(?:n\.?\s*)?8\.666/93', 'Lei 14.133/21', p)

    # Normalize breaks
    p = re.sub(r'\n{3,}', '\n\n', p).strip()

    # Montar documento final
    doc = '\n'.join([
        'Senhor Promotor de Justiça:',
        '',
        p,
        '',
        'É o parecer, salvo melhor juízo.',
        '',
        f'Porto Alegre, {hoje}.',
        '',
        'Centro de Apoio Operacional Cível e do Patrimônio Público'
    ])

    return doc
```

---

## 10. GERADOR DOCX

Migrar a lógica do `app.py` (Flask, python-docx) para módulo interno do FastAPI. O código de referência completo está no arquivo `APP_PY_V23.py` que acompanha este prompt.

Constantes institucionais:
- `ORGAN_NAME = "CENTRO DE APOIO OPERACIONAL CÍVEL E DO PATRIMÔNIO PÚBLICO"`
- `ORGAN_NAME_TITLE = "Centro de Apoio Operacional Cível e do Patrimônio Público"`
- Fonte: Times New Roman 12pt, justificado
- Página: A4, margens 3/2/3/2 cm
- Subtítulos ALL-CAPS (>85% maiúsculas, >15 chars) → bold, alinhado esquerda
- Headers de seção (RELATÓRIO, FUNDAMENTAÇÃO JURÍDICA, CONCLUSÃO) → bold 13pt, centralizado

---

## 11. WHATSAPP (Evolution API)

### Receber mensagens (webhook)
O FastAPI expõe `POST /webhook/whatsapp` que recebe:
```json
{
    "data": {
        "key": {"remoteJid": "5551912345678@s.whatsapp.net"},
        "message": {"conversation": "!parecer sobre nepotismo cruzado"}
    }
}
```

Comandos:
- `!parecer sobre {tema}` → inicia geração
- `!aprovar {id}` → aprova parecer
- `!rejeitar {id} {motivo}` → rejeita parecer
- `!status` → status do último parecer
- `!ajuda` → lista comandos

### Enviar mensagem de texto
```python
POST {EVOLUTION_URL}/message/sendText/{EVOLUTION_INSTANCE}
Headers: apikey: {EVOLUTION_APIKEY}, Content-Type: application/json
Body: {"number": "5551912345678", "textMessage": {"text": "mensagem"}}
```

### Enviar documento DOCX
```python
POST {EVOLUTION_URL}/message/sendMedia/{EVOLUTION_INSTANCE}
Headers: apikey: {EVOLUTION_APIKEY}, Content-Type: application/json
Body: {
    "number": "5551912345678",
    "mediaMessage": {
        "mediatype": "document",
        "mimetype": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "caption": "📋 Parecer: {tema}",
        "fileName": "Parecer_MPRS_{slug}.docx",
        "media": "{base64_do_docx}"
    }
}
```

---

## 12. UPLOAD DE DOCUMENTOS

O promotor pode enviar PDFs/DOCXs pela interface web para enriquecer a análise.

Fluxo:
1. Frontend envia arquivo via `POST /api/documentos/upload` (multipart/form-data)
2. Backend extrai texto:
   - PDF: usar `pymupdf` (fitz) ou `pdfplumber`
   - DOCX: usar `python-docx`
3. Chunkar texto em blocos de ~500 tokens com overlap de 50
4. Gerar embedding de cada chunk via Ollama (`mxbai-embed-large`)
5. Inserir no Qdrant collection `acervo_mprs` com payload incluindo `parecer_id` e `tipo: "upload"`
6. Registrar no PostgreSQL (`uploaded_documents`)
7. Os fragmentos ficam disponíveis na busca Qdrant para o pipeline de geração

---

## 13. FRONTEND

### Stack: React 18 + Vite + Tailwind CSS + shadcn/ui + React Router

### Páginas:

**Dashboard (rota `/`)**
- Cards: total pareceres (mês), score médio, custo total, tempo médio
- Gráfico de pareceres por dia (últimos 30 dias) — usar Recharts
- Gráfico custo acumulado
- Lista de últimos 5 pareceres com status badge

**Lista de Pareceres (rota `/pareceres`)**
- Tabela com colunas: data, tema, status, score, custo, ações
- Filtros: status (dropdown), período (date range), busca textual
- Paginação
- Botão "Novo Parecer"

**Detalhe do Parecer (rota `/pareceres/:id`)**
- Preview do DOCX renderizado via mammoth.js
- Botão download DOCX
- Botões Aprovar / Rejeitar (com modal para feedback)
- Timeline de execuções (cada agente com tempo e custo)
- Metadata: tema, leis citadas, fontes usadas, quality score

**Novo Parecer (rota `/pareceres/novo`)**
- Campo: tema/solicitação (textarea)
- Upload de documentos (drag & drop, múltiplos arquivos)
- Botão "Gerar Parecer"
- Após clicar: ProgressTracker mostrando cada fase via WebSocket
- Quando concluir: redireciona para detalhe

**Upload de Documentos (rota `/upload`)**
- Área de drag & drop para PDFs/DOCXs
- Lista de documentos já enviados (com botão excluir)
- Status de indexação (processando / indexado)

### WebSocket Progress

O frontend se conecta em `ws://backend/ws/parecer/{id}` e recebe eventos:
```json
{"phase": "triagem", "status": "running", "message": "Analisando tema..."}
{"phase": "pesquisa", "status": "running", "message": "Buscando acervo (12 fragmentos)..."}
{"phase": "jurista", "status": "running", "message": "Desenvolvendo teses jurídicas..."}
{"phase": "advogado_diabo", "status": "running", "message": "Testando argumentos..."}
...
{"phase": "complete", "status": "done", "score": 95, "parecer_id": "uuid"}
```

---

## 14. DOCKER COMPOSE

```yaml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      - postgres
      - qdrant
    volumes:
      - ./backend:/app
      - docx_output:/app/output

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend

  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: openclaw
      POSTGRES_USER: openclaw
      POSTGRES_PASSWORD: openclaw
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql

  qdrant:
    image: qdrant/qdrant:v1.13.2
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

  evolution-api:
    image: atendai/evolution-api:v1.8.2
    ports:
      - "8080:8080"
    volumes:
      - evolution_data:/evolution/instances

  searxng:
    image: searxng/searxng:latest
    ports:
      - "8888:8080"

volumes:
  pgdata:
  qdrant_data:
  ollama_data:
  evolution_data:
  docx_output:
```

---

## 15. REQUISITOS TÉCNICOS

### Backend (requirements.txt)
```
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
sqlalchemy[asyncio]>=2.0.25
asyncpg>=0.29.0
pydantic>=2.5.0
pydantic-settings>=2.1.0
httpx>=0.26.0
python-multipart>=0.0.6
python-docx>=1.1.0
websockets>=12.0
pymupdf>=1.23.0
```

### Frontend (package.json dependencies)
```json
{
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.22.0",
    "axios": "^1.6.0",
    "recharts": "^2.10.0",
    "mammoth": "^1.6.0",
    "tailwindcss": "^3.4.0",
    "@radix-ui/react-dialog": "^1.0.0",
    "@radix-ui/react-dropdown-menu": "^2.0.0",
    "lucide-react": "^0.300.0",
    "date-fns": "^3.3.0",
    "clsx": "^2.1.0"
}
```

---

## 16. INSTRUÇÕES DE IMPLEMENTAÇÃO

### Ordem de construção (Claude Code deve seguir esta ordem):

1. **Criar estrutura de diretórios** conforme Seção 3
2. **Backend - config e database** (config.py, database.py, models.py, schema.sql)
3. **Backend - pipeline** (llm_client.py, search.py, embedding.py, quality_gate.py, integrator.py, docx_generator.py)
4. **Backend - prompts** (todos os 9 arquivos em prompts/)
5. **Backend - orchestrator** (pipeline/orchestrator.py — a sequência dos 10 agentes)
6. **Backend - services** (whatsapp.py, document_upload.py, approval.py)
7. **Backend - websocket** (progress.py)
8. **Backend - main.py** (FastAPI app com todas as rotas)
9. **Backend - Dockerfile e requirements.txt**
10. **Frontend - setup** (Vite + React + Tailwind + shadcn)
11. **Frontend - pages e components** (todas as 5 páginas + components)
12. **Frontend - Dockerfile**
13. **Docker compose + .env.example**
14. **README.md**

### Regras críticas:

- NUNCA modifique o conteúdo dos prompts dos agentes (Seção 7). São validados a 95/100.
- O nome do órgão é SEMPRE "Centro de Apoio Operacional Cível e do Patrimônio Público" (nunca "Moralidade Administrativa", nunca "Família e Sucessões", nunca "Proteção do Patrimônio").
- O DOCX DEVE usar encoding UTF-8. Acentos em português DEVEM renderizar corretamente.
- O pipeline DEVE ser async. Cada agente executa em sequência, mas a API não bloqueia.
- Calcular custo real: Haiku = $1/$5 por M tokens in/out, Sonnet = $3/$15 por M tokens in/out.
- Tokens in/out vêm do response OpenRouter: `data.usage.prompt_tokens`, `data.usage.completion_tokens`.
- WebSocket DEVE enviar atualizações a cada troca de fase.
- O frontend DEVE funcionar sem autenticação inicialmente (adicionar depois para SaaS).

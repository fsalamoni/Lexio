# Fluxo dos Pipelines

## Pipeline de Geração de Documentos (11 agentes)
```
Formulário → Triagem → [Acervo: Buscador → Compilador → Revisor] → Pesquisador →
Jurista → Advogado do Diabo → Jurista v2 → Fact-Checker → Moderador → Redator → Documento
```

### Detalhes
1. **Triagem** (extraction/fast): Extrai tema, subtemas, palavras-chave do input do usuário
2. **Acervo** (condicional — só executa se há documentos no acervo):
   - **Buscador**: Busca documentos relevantes no acervo do usuário
   - **Compilador**: Compila documentos encontrados em base unificada
   - **Revisor**: Revisa base compilada para coerência
3. **Pesquisador** (reasoning/balanced): Pesquisa legislação e jurisprudência
4. **Jurista** (reasoning/balanced): Desenvolve teses jurídicas robustas
5. **Advogado do Diabo** (reasoning/balanced): Critica e identifica fraquezas nos argumentos
6. **Jurista v2** (reasoning/balanced): Refina teses após a crítica
7. **Fact-Checker** (extraction/fast): Verifica citações e referências legais
8. **Moderador** (synthesis/balanced): Planeja estrutura e esboço do documento
9. **Redator** (writing/balanced): Redige documento final completo (12k tokens)

### Configuração
- Modelos configuráveis por agente via Admin Panel (`document_models`)
- Cada agente tem categoria e tier recomendado
- Categorias: extraction, synthesis, reasoning, writing
- Tiers: fast, balanced, premium

## Pipeline de Análise de Teses (5 agentes)
```
Banco de teses → Catalogador → Analista → Compilador → Curador → Revisor → Sugestões
```

## Pipeline do Caderno de Pesquisa (11 agentes)
```
Pesquisa: Pesquisador → Analista → Assistente + Pesq. Externo + Pesq. Profundo + Pesq. Jurisprudência
Estúdio: Pesquisador → [Escritor | Roteirista | Designer Visual] → Revisor → Artefato
```

## Pipeline de Vídeo (11 agentes)
```
Planejador → Roteirista → Diretor → Storyboarder → Designer → Compositor → Narrador → Revisor
```

## Pipeline de Áudio (6 agentes)
```
Planejador → Roteirista → Diretor → Produtor Sonoro → Narrador/TTS → Revisor
```

## Pipeline de Apresentação (6 agentes)
```
Planejador → Pesquisador → Redator → Designer → Revisor
```

## Progresso
- Todas as etapas reportam progresso via callbacks no frontend
- `AgentTrailProgressModal` exibe progresso visual das trilhas multi-agente
- `PipelineProgressPanel` exibe progresso do pipeline de documentos

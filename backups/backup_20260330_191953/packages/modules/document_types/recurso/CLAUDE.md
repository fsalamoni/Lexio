# Modulo Recurso Judicial -- Contexto IA

## O que e
Recurso Judicial -- peca processual que impugna decisao judicial perante orgao jurisdicional hierarquicamente superior (ou o mesmo orgao, no caso de embargos), buscando a reforma, anulacao ou esclarecimento da decisao recorrida. Fundamentado no CPC/2015, arts. 994-1.044.

## Templates
- `generic` -- Parametrizavel com {org_name}, {user_title}. Suporta todos os tipos de recurso.
- `apelacao` -- Apelacao contra sentenca (art. 1.009, CPC)
- `agravo_instrumento` -- Agravo contra decisao interlocutoria (art. 1.015, CPC)
- `embargos_declaracao` -- Embargos contra obscuridade/contradicao/omissao (art. 1.022, CPC)

## Pipeline (8 agentes)
1. Triagem (Haiku) -> identifica tipo de decisao, recurso cabivel, vicios, prazo em JSON
2. Pesquisador (Sonnet) -> pesquisa legislacao recursal, jurisprudencia e doutrina
3. Jurista (Sonnet) -> desenvolve teses recursais (error in judicando / in procedendo)
4. Advogado do Diabo (Sonnet) -> simula contrarrazoes do recorrido, ataca admissibilidade
5. Jurista v2 (Sonnet) -> refina teses, blinda admissibilidade, responde criticas
6. Fact-checker (Sonnet) -> verifica citacoes legais e jurisprudenciais (arts. 994-1.044)
7. Redator (Sonnet) -> redige recurso completo com estrutura recursal propria
8. Revisor (Sonnet) -> checklist final de admissibilidade e qualidade

## Fluxo de dados (output_keys)
triagem_json -> pesquisa -> teses -> criticas -> teses_v2 -> teses_verificadas -> recurso_bruto -> texto_revisado

## Estrutura do Recurso
1. Enderecamento ao tribunal (header externo via integrator)
2. Identificacao e qualificacao do recorrente
3. DA TEMPESTIVIDADE (prazo recursal)
4. DO CABIMENTO (admissibilidade + preparo)
5. DOS FATOS (sintese fatica e da decisao recorrida)
6. DAS RAZOES DO RECURSO (fundamentacao juridica — secao principal)
7. DO EFEITO SUSPENSIVO (se aplicavel)
8. DO PREQUESTIONAMENTO (se aplicavel — para REsp/RE)
9. DOS PEDIDOS (provimento/reforma ou anulacao)
10. Fecho: "Nestes termos, pede deferimento." (footer externo via integrator)

## Tipos de Recurso Suportados
- APELACAO (art. 1.009): contra sentenca, prazo 15 dias uteis
- AGRAVO DE INSTRUMENTO (art. 1.015): contra decisao interlocutoria, prazo 15 dias uteis
- EMBARGOS DE DECLARACAO (art. 1.022): obscuridade/contradicao/omissao, prazo 5 dias
- RECURSO ESPECIAL (art. 1.029): ao STJ, contra acordao que contraria lei federal
- RECURSO EXTRAORDINARIO (art. 1.029): ao STF, contra acordao que contraria CF
- RECURSO ORDINARIO (art. 1.027): contra acordao em MS/HD/MI

## Conceitos Recursais Chave
- Error in judicando: erro de julgamento (ma aplicacao do direito) -> pedido de REFORMA
- Error in procedendo: erro de procedimento (vicio processual) -> pedido de ANULACAO
- Tantum devolutum quantum appellatum: tribunal julga apenas o que foi impugnado
- Reformatio in pejus: tribunal nao pode agravar situacao do recorrente (sem recurso adverso)
- Prequestionamento: materia deve ter sido debatida no acordao para REsp/RE (art. 1.025)
- Taxatividade mitigada: Tema 988/STJ — agravo de instrumento fora do rol do art. 1.015
- Teoria da causa madura: tribunal pode julgar diretamente o merito (art. 1.013, §3)

## Quality Rules (17 regras)
- Tamanho minimo (2500 chars)
- Identifica tipo de recurso
- Tempestividade abordada
- Preparo referenciado
- Demonstracao de erro da decisao
- Prequestionamento (quando tribunais superiores)
- Citacoes legais presentes
- Secoes obrigatorias: FATOS, CABIMENTO, RAZOES, PEDIDOS
- Pedido de provimento/reforma explicito
- Sem truncamento
- Fontes citadas (2+ [Fonte:])
- Conectivos variados (max 2x cada)
- Paragrafos separados (6+)
- Lei 8.666/93 nao citada
- Referencia ao CPC/2015
- Relevancia ao tema

## Integrator Rules
- Header: Enderecamento ao tribunal conforme tipo de recurso
- Footer: "Nestes termos, pede deferimento." + cidade/data + assinatura/OAB
- Post-process: remove markdown, limpa duplicatas header/footer, padroniza titulos de secao

## Regras
1. Lei 8.666/93 REVOGADA -> usar 14.133/21
2. CPC/1973 REVOGADO -> usar CPC/2015
3. NUNCA inventar jurisprudencia
4. Conectivos: maximo 2x cada
5. Pedido deve ser de PROVIMENTO/REFORMA (nao "procedencia")
6. Artigos recursais do CPC: 994-1.044
7. Sumulas recursais relevantes: 7/STJ, 211/STJ, 282/STF, 356/STF
8. Tema 988/STJ: taxatividade mitigada do art. 1.015

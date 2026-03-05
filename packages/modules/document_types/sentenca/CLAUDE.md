# Modulo Sentenca — Contexto IA

## O que e
Sentenca Judicial — decisao do magistrado que resolve o merito (CPC art. 487) ou extingue o processo sem resolucao do merito (CPC art. 485).

## Templates
- `merito` — Sentenca com resolucao do merito (CPC art. 487, I)
- `extincao_sem_merito` — Extincao sem resolucao do merito (CPC art. 485)
- `generic` — Parametrizavel com {org_name}, {user_title}

## Pipeline (6 agentes)
1. Triagem (Haiku) — extrai tema, tipo de acao, partes, pedidos em JSON
2. Pesquisador (Sonnet) — analisa fragmentos e organiza jurisprudencia/legislacao
3. Jurista (Sonnet) — desenvolve fundamentacao completa (art. 489 par.1)
4. Fact-checker (Sonnet) — verifica cada citacao legal e jurisprudencial
5. Redator (Sonnet) — redige sentenca tripartite (RELATORIO + FUNDAMENTACAO + DISPOSITIVO)
6. Revisor (Sonnet) — checklist de conformidade CPC arts. 489-495

## Estrutura da Sentenca (CPC art. 489)
1. RELATORIO: partes, pedido, contestacao, ocorrencias processuais
2. FUNDAMENTACAO: questoes de fato e de direito (art. 489 par.1)
3. DISPOSITIVO: comando decisorio, custas, honorarios

## Regras
1. Art. 489 par.1 CPC e OBRIGATORIO em cada ponto da fundamentacao
2. Lei 8.666/93 REVOGADA — usar 14.133/21
3. NUNCA inventar jurisprudencia ou numeros de processos
4. Conectivos: maximo 2x cada
5. Dispositivo DEVE incluir custas e honorarios
6. Vedacao ultra/extra/citra petita (art. 492)
7. Coerencia obrigatoria entre fundamentacao e dispositivo

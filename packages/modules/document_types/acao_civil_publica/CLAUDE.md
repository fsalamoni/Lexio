# Modulo Acao Civil Publica — Contexto IA

## O que e
Acao Civil Publica — instrumento constitucional de tutela de interesses transindividuais (difusos, coletivos e individuais homogeneos). Regulamentada pela Lei 7.347/85, complementada pelo CDC (Lei 8.078/90).

## Templates
- `meio_ambiente` — ACP ambiental (CF art. 225, Lei 6.938/81)
- `consumidor` — ACP de consumo (CDC integral)
- `patrimonio_publico` — ACP patrimonial (Lei 8.429/92, Lei 14.133/21)
- `generic` — Parametrizavel com {org_name}, {user_title}

## Pipeline (8 agentes)
1. Triagem (Haiku) — extrai tema, tipo de interesse, legitimado, requerido em JSON
2. Pesquisador (Sonnet) — analisa fragmentos focando em LACP, CDC, legislacao setorial
3. Jurista (Sonnet) — desenvolve teses (legitimidade, fatos, direito, tutela)
4. Advogado do Diabo (Sonnet) — simula defesa do requerido
5. Jurista v2 (Sonnet) — refina teses respondendo as criticas
6. Fact-checker (Sonnet) — verifica cada citacao legal e jurisprudencial
7. Redator (Sonnet) — redige peticao completa com todas as secoes
8. Revisor (Sonnet) — checklist de conformidade LACP + CPC + CDC

## Estrutura da Peticao
1. Preambulo (qualificacao das partes)
2. DA LEGITIMIDADE ATIVA DO MINISTERIO PUBLICO
3. DA COMPETENCIA
4. DO INQUERITO CIVIL
5. DOS FATOS
6. DO DIREITO
7. DO DANO MORAL COLETIVO (quando aplicavel)
8. DA TUTELA DE URGENCIA (quando aplicavel)
9. DOS PEDIDOS
10. Valor da causa

## Regras
1. Lei 7.347/85 e OBRIGATORIA em toda ACP
2. CF art. 129, III DEVE ser citado (funcao do MP)
3. Tipo de interesse (CDC art. 81) DEVE ser corretamente classificado
4. Lei 8.666/93 REVOGADA — usar 14.133/21
5. NUNCA inventar jurisprudencia ou numeros de processos
6. Conectivos: maximo 2x cada
7. Pedidos devem ser ESPECIFICOS e proporcionais
8. Dano moral coletivo deve ser avaliado quando aplicavel

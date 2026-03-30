# Modulo Peticao Inicial -- Contexto IA

## O que e
Peticao Inicial -- documento que inaugura o processo judicial, formulando os pedidos do autor ao juiz com base nos fatos e fundamentos juridicos (CPC/2015 arts. 319-320).

## Templates
- `generic` -- Parametrizavel com {org_name}, {user_title}
- `ordinario` -- Procedimento comum ordinario (usa generic como base)
- `sumario` -- Procedimento sumario/especial (usa generic como base)

## Pipeline (8 agentes)
1. Triagem (Haiku) -> extrai tipo de acao, partes, fatos, base legal em JSON
2. Pesquisador (Sonnet) -> pesquisa jurisprudencia e legislacao aplicavel
3. Jurista (Sonnet) -> desenvolve teses e estrategia argumentativa
4. Advogado do Diabo (Sonnet) -> ataca teses, antecipa contestacao do reu
5. Jurista v2 (Sonnet) -> refina teses incorporando criticas
6. Fact-checker (Sonnet) -> verifica citacoes legais e jurisprudenciais
7. Redator (Sonnet) -> redige peticao completa conforme CPC arts. 319-320
8. Revisor (Sonnet) -> checklist final de conformidade e qualidade

## Estrutura da Peticao (CPC art. 319)
1. Enderecamento ao juizo (header externo via integrator)
2. Qualificacao das partes (autor e reu)
3. DOS FATOS (causa de pedir remota)
4. DO DIREITO (causa de pedir proxima)
5. DA TUTELA PROVISORIA (se aplicavel)
6. DOS PEDIDOS (determinados e especificos)
7. DO VALOR DA CAUSA (CPC art. 292)
8. DAS PROVAS (CPC art. 319, VI)
9. Fecho: "Nestes termos, pede deferimento." (footer externo via integrator)

## Quality Rules
- Qualificacao das partes presente
- Secoes obrigatorias: FATOS, DIREITO, PEDIDOS, VALOR DA CAUSA
- Citacoes legais verificadas
- Conectivos variados (max 2x cada)
- Estrutura argumentativa logica
- Conformidade CPC arts. 319-320

## Integrator Rules
- Header: "EXCELENTISSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA ___ VARA..."
- Footer: "Nestes termos, pede deferimento." + cidade/data + assinatura/OAB
- Post-process: remove markdown, limpa duplicatas de header/footer

## Regras
1. Lei 8.666/93 REVOGADA -> usar 14.133/21
2. CPC/1973 REVOGADO -> usar CPC/2015
3. NUNCA inventar jurisprudencia
4. Conectivos: maximo 2x cada
5. Pedidos devem ser DETERMINADOS (CPC art. 324)
6. Valor da causa OBRIGATORIO (CPC art. 291)

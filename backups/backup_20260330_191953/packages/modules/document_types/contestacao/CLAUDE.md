# Modulo Contestacao — Contexto IA

## O que e
Contestacao — peca de defesa do reu em processo judicial (arts. 335-342 CPC/2015).

## Templates
- `generic` — Parametrizavel com {org_name}, {user_title}

## Pipeline (8 agentes)
1. Triagem (Haiku) → analisa peticao inicial, extrai pedidos/preliminares em JSON
2. Pesquisador (Sonnet) → pesquisa jurisprudencia favoravel a defesa
3. Jurista (Sonnet) → desenvolve estrategia de defesa (preliminares + merito)
4. Advogado do Diabo (Sonnet) → testa teses de defesa, identifica vulnerabilidades
5. Jurista v2 (Sonnet) → fortalece defesa incorporando criticas
6. Fact-checker (Sonnet) → verifica citacoes legais e jurisprudenciais
7. Redator (Sonnet) → redige contestacao completa (CPC/2015)
8. Revisor (Sonnet) → checklist de 23 pontos, revisao final

## Estrutura da Contestacao
- DA SINTESE DA INICIAL (resumo objetivo da peticao do autor)
- DAS PRELIMINARES (art. 337 CPC — se cabiveis)
- DO MERITO (impugnacao especifica art. 341 CPC)
- DOS PEDIDOS (improcedencia + honorarios + provas)

## Regras
1. Lei 8.666/93 REVOGADA → usar 14.133/21
2. NUNCA inventar jurisprudencia
3. Conectivos: maximo 2x cada
4. Impugnacao ESPECIFICA de cada fato do autor (art. 341 CPC)
5. Principio da eventualidade (art. 336 CPC) — toda materia na contestacao
6. Preliminares so se tiverem fundamento solido (evitar litigancia de ma-fe)

## Referencias CPC/2015
- Art. 335: Prazo e forma da contestacao
- Art. 336: Principio da eventualidade
- Art. 337: Preliminares (incisos I a XIII)
- Art. 338-340: Regras especiais de defesa
- Art. 341: Onus da impugnacao especifica
- Art. 342: Excecoes ao onus da impugnacao
- Art. 343-346: Reconvencao
- Art. 373: Onus da prova

## Contexto de Integracao
- Cabecalho: Excelentissimo Senhor Doutor Juiz... (adicionado pelo integrator)
- Rodape: local, data, assinatura, OAB (adicionado pelo integrator)
- Post-processing: limpeza de markdown, formatacao de secoes

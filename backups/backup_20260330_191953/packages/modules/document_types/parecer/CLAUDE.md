# Módulo Parecer — Contexto IA

## O que é
Parecer Jurídico — opinião técnica sobre questão jurídica.

## Templates
- `mprs_caopp` — **INTOCÁVEL** (MPRS validado a 95/100)
- `generic` — Parametrizável com {org_name}, {user_title}

## Pipeline (9 agentes)
1. Triagem (Haiku) → extrai tema em JSON
2. Moderador Agenda (Sonnet) → define tópicos de debate
3. Jurista (Sonnet) → desenvolve teses
4. Advogado do Diabo (Sonnet) → ataca teses
5. Jurista v2 (Sonnet) → refina teses
6. Fact-checker (Sonnet) → verifica citações
7. Moderador Plano (Sonnet) → plano de redação
8. Redator (Sonnet) → redige parecer completo
9. Revisor (Sonnet) → checklist de 14 pontos

## Regras
1. Prompts MPRS são INTOCÁVEIS
2. Lei 8.666/93 REVOGADA → usar 14.133/21
3. NUNCA inventar jurisprudência
4. Conectivos: máximo 2x cada

"""Lexio — Parecer MPRS/CAOPP: MODERADOR AGENDA (AG-MOD1)
Sonnet, temperature=0.2, max_tokens=1200

Atualizado para corresponder ao OpenClaw n8n v25.4 (AG-MOD1 Agenda):
- 3-5 tópicos (não 5-8)
- Agenda EXCLUSIVAMENTE sobre o tema extraído pela triagem
- Formato numerado, texto puro
"""


def system_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    return (
        f'Você é o MODERADOR do CAOPP/MPRS. Defina a AGENDA DE ANÁLISE.\n'
        f'<regras>\n'
        f'1. A agenda DEVE tratar EXCLUSIVAMENTE de "{tema}"\n'
        f'2. 3-5 tópicos, cada um com: título, questão jurídica, normas\n'
        f'3. Texto puro, sem markdown. Numere 1,2,3...\n'
        f'</regras>'
    )


def user_prompt(context: dict) -> str:
    tema = context.get("tema", "")
    msg = context.get("msgOriginal", "")
    area = context.get("area_direito", "")
    fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
    processos = context.get("processosJudiciarios", "") or ""
    legislacao = (context.get("legislacao", "") or "")[:3000]
    return (
        f'<tema>{tema}</tema>\n'
        f'<solicitacao>{msg}</solicitacao>\n'
        f'<area>{area}</area>\n'
        f'<acervo>{fragmentos}</acervo>\n'
        f'<datajud>{processos}</datajud>\n'
        f'<legislacao>{legislacao}</legislacao>\n'
        f'Defina agenda sobre "{tema}".'
    )

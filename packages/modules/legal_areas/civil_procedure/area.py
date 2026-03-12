"""Lexio — Direito Processual Civil legal area module."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class CivilProcedureArea(BaseLegalArea):
    """Direito Processual Civil."""

    def get_id(self) -> str:
        return "civil_procedure"

    def get_name(self) -> str:
        return "Direito Processual Civil"

    def get_description(self) -> str:
        return (
            "Processo de conhecimento, cumprimento de sentença, execução, recursos e tutelas provisórias."
        )

    def get_specializations(self) -> list[str]:
        return ["processo_conhecimento", "cumprimento_sentenca", "execucao", "recursos_civeis", "tutelas_provisorias"]

    def get_guides(self) -> list[dict]:
        guides = []
        if GUIDES_DIR.exists():
            for guide_file in GUIDES_DIR.glob("*.md"):
                guides.append({
                    "id": guide_file.stem,
                    "name": guide_file.stem.replace("_", " ").title(),
                    "path": str(guide_file),
                })
        return guides

    def _load_guide(self, topic: str) -> str:
        """Load relevant guide content for a topic."""
        content = ""
        topic_lower = topic.lower()

        guide_mapping = {
            "conheciment": "processo_conhecimento.md",
            "contestac": "processo_conhecimento.md",
            "audiencia": "processo_conhecimento.md",
            "recurso": "recursos_civeis.md",
            "apelac": "recursos_civeis.md",
            "agravo": "recursos_civeis.md",
            "embargo": "recursos_civeis.md",
            "tutela": "tutelas_provisorias.md",
            "liminar": "tutelas_provisorias.md",
            "urgencia": "tutelas_provisorias.md",
            "evidencia": "tutelas_provisorias.md"
        }

        loaded = set()
        for keyword, filename in guide_mapping.items():
            if keyword in topic_lower and filename not in loaded:
                guide_path = GUIDES_DIR / filename
                if guide_path.exists():
                    content += guide_path.read_text(encoding="utf-8") + "\n\n"
                    loaded.add(filename)

        return content[:6000]

    def get_agent_configs(self) -> dict:
        """Return specialized agent configurations for Direito Processual Civil."""
        return {
            "jurista": {
                "module": "packages.modules.legal_areas.civil_procedure.agents.jurista",
                "role": "Jurista processualista civil",
                "description": "Desenvolve teses processuais civis",
            },
            "advogado_diabo": {
                "module": "packages.modules.legal_areas.civil_procedure.agents.advogado_diabo",
                "role": "Advogado do Diabo processual civil",
                "description": "Critica teses processuais",
            },
            "fact_checker": {
                "module": "packages.modules.legal_areas.civil_procedure.agents.fact_checker",
                "role": "Verificador processual civil",
                "description": "Verifica artigos do CPC, súmulas e precedentes",
            },
        }

    def generate_thesis_suggestions(self, topic: str) -> list[str]:
        """Return thesis suggestions for a given direito processual civil topic."""
        topic_lower = topic.lower()
        suggestions = []

        if any(kw in topic_lower for kw in ["tutela", "liminar", "urgencia"]):
            suggestions.extend([
                "Presença dos requisitos da tutela de urgência (art. 300 CPC)",
                "Perigo de dano irreparável ou de difícil reparação",
                "Probabilidade do direito invocado",
                "Reversibilidade dos efeitos da tutela",
            ])

        if any(kw in topic_lower for kw in ["recurso", "apelac", "agravo"]):
            suggestions.extend([
                "Tempestividade do recurso interposto",
                "Presença dos pressupostos recursais (legitimidade, interesse, cabimento)",
                "Error in judicando na decisão recorrida",
                "Error in procedendo na condução do feito",
            ])

        if any(kw in topic_lower for kw in ["nulidad", "sentenca", "fundamenta"]):
            suggestions.extend([
                "Nulidade da sentença por ausência de fundamentação (art. 489 §1º CPC)",
                "Violação ao princípio da congruência",
                "Julgamento extra/ultra/citra petita",
                "Cerceamento de defesa",
            ])

        if not suggestions:
            suggestions = [
                "Análise jurídica à luz do Direito Processual Civil",
                "Verificação de conformidade com a legislação aplicável",
                "Observância dos princípios de Direito Processual Civil",
                "Revisão da jurisprudência aplicável",
            ]

        return suggestions

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate direito processual civil theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO PROCESSUAL CIVIL.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito Processual Civil.\n'
                f'Direito Processual Civil. Foque em: CPC/2015 (Lei 13.105/15), precedentes vinculantes, tutelas provisórias. Cite jurisprudência do STJ/STF.\n'
                f'NUNCA invente leis ou decisões. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito Processual Civil.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

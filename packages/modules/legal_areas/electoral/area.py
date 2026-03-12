"""Lexio — Direito Eleitoral legal area module."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class ElectoralArea(BaseLegalArea):
    """Direito Eleitoral."""

    def get_id(self) -> str:
        return "electoral"

    def get_name(self) -> str:
        return "Direito Eleitoral"

    def get_description(self) -> str:
        return (
            "Eleições, partidos políticos, propaganda eleitoral, crimes eleitorais e inelegibilidade."
        )

    def get_specializations(self) -> list[str]:
        return ["processo_eleitoral", "propaganda_eleitoral", "crimes_eleitorais", "inelegibilidade"]

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
            "eleic": "processo_eleitoral.md",
            "registro": "processo_eleitoral.md",
            "candidatura": "processo_eleitoral.md",
            "propaganda": "propaganda_eleitoral.md",
            "campanha": "propaganda_eleitoral.md",
            "caixa dois": "propaganda_eleitoral.md",
            "inelegib": "inelegibilidade.md",
            "ficha limpa": "inelegibilidade.md",
            "impugnac": "inelegibilidade.md"
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
        """Return specialized agent configurations for Direito Eleitoral."""
        return {
            "jurista": {
                "module": "packages.modules.legal_areas.electoral.agents.jurista",
                "role": "Jurista eleitoralista",
                "description": "Desenvolve teses de Direito Eleitoral",
            },
            "advogado_diabo": {
                "module": "packages.modules.legal_areas.electoral.agents.advogado_diabo",
                "role": "Advogado do Diabo eleitoral",
                "description": "Critica teses eleitorais",
            },
            "fact_checker": {
                "module": "packages.modules.legal_areas.electoral.agents.fact_checker",
                "role": "Verificador eleitoral",
                "description": "Verifica legislação eleitoral e precedentes do TSE",
            },
        }

    def generate_thesis_suggestions(self, topic: str) -> list[str]:
        """Return thesis suggestions for a given direito eleitoral topic."""
        topic_lower = topic.lower()
        suggestions = []

        if any(kw in topic_lower for kw in ["eleic", "registro", "candidatura"]):
            suggestions.extend([
                "Impugnação de registro de candidatura (AIRC)",
                "Abuso de poder político nas eleições",
                "Abuso de poder econômico — captação ilícita de sufrágio (art. 41-A LE)",
                "Cassação de mandato por condutas vedadas (art. 73 LE)",
            ])

        if any(kw in topic_lower for kw in ["propaganda", "campanha"]):
            suggestions.extend([
                "Propaganda eleitoral antecipada (art. 36 LE)",
                "Propaganda eleitoral irregular na internet",
                "Direito de resposta eleitoral (art. 58 LE)",
                "Uso indevido dos meios de comunicação",
            ])

        if any(kw in topic_lower for kw in ["inelegib", "ficha limpa", "impugnac"]):
            suggestions.extend([
                "Inelegibilidade por condenação criminal (LC 64/90, art. 1º, I, 'e')",
                "Aplicação da Lei da Ficha Limpa (LC 135/10)",
                "Inelegibilidade por rejeição de contas (art. 1º, I, 'g' LC 64/90)",
                "Desincompatibilização (art. 1º, II LC 64/90)",
            ])

        if not suggestions:
            suggestions = [
                "Análise jurídica à luz do Direito Eleitoral",
                "Verificação de conformidade com a legislação aplicável",
                "Observância dos princípios de Direito Eleitoral",
                "Revisão da jurisprudência aplicável",
            ]

        return suggestions

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate direito eleitoral theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO ELEITORAL.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito Eleitoral.\n'
                f'Direito Eleitoral. Foque em: CE, Lei 9.504/97, LC 64/90, LC 135/10 (Ficha Limpa). Cite jurisprudência do TSE.\n'
                f'NUNCA invente leis ou decisões. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito Eleitoral.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

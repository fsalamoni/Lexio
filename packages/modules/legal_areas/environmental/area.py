"""Lexio — Direito Ambiental legal area module."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class EnvironmentalArea(BaseLegalArea):
    """Direito Ambiental."""

    def get_id(self) -> str:
        return "environmental"

    def get_name(self) -> str:
        return "Direito Ambiental"

    def get_description(self) -> str:
        return (
            "Proteção ambiental, licenciamento, responsabilidade ambiental e crimes ambientais."
        )

    def get_specializations(self) -> list[str]:
        return ["licenciamento_ambiental", "responsabilidade_ambiental", "crimes_ambientais", "areas_protegidas"]

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
            "licencia": "licenciamento.md",
            "eia": "licenciamento.md",
            "rima": "licenciamento.md",
            "responsa": "responsabilidade_ambiental.md",
            "dano ambiental": "responsabilidade_ambiental.md",
            "reparac": "responsabilidade_ambiental.md",
            "poluid": "responsabilidade_ambiental.md",
            "crime": "crimes_ambientais.md",
            "flora": "crimes_ambientais.md",
            "fauna": "crimes_ambientais.md",
            "desmat": "crimes_ambientais.md"
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
        """Return specialized agent configurations for Direito Ambiental."""
        return {
            "jurista": {
                "module": "packages.modules.legal_areas.environmental.agents.jurista",
                "role": "Jurista ambientalista",
                "description": "Desenvolve teses de Direito Ambiental",
            },
            "advogado_diabo": {
                "module": "packages.modules.legal_areas.environmental.agents.advogado_diabo",
                "role": "Advogado do Diabo ambiental",
                "description": "Critica teses ambientais",
            },
            "fact_checker": {
                "module": "packages.modules.legal_areas.environmental.agents.fact_checker",
                "role": "Verificador ambiental",
                "description": "Verifica legislação ambiental e precedentes",
            },
        }

    def generate_thesis_suggestions(self, topic: str) -> list[str]:
        """Return thesis suggestions for a given direito ambiental topic."""
        topic_lower = topic.lower()
        suggestions = []

        if any(kw in topic_lower for kw in ["licencia", "eia", "rima"]):
            suggestions.extend([
                "Nulidade do licenciamento por vício no EIA/RIMA",
                "Exigência de Estudo de Impacto Ambiental (art. 225 §1º IV CF)",
                "Princípio da precaução ambiental",
                "Princípio da prevenção",
            ])

        if any(kw in topic_lower for kw in ["dano", "reparac", "responsab"]):
            suggestions.extend([
                "Responsabilidade civil objetiva por dano ambiental (art. 14 §1º Lei 6.938/81)",
                "Obrigação propter rem de reparação ambiental",
                "Teoria do risco integral em matéria ambiental",
                "Princípio do poluidor-pagador",
            ])

        if any(kw in topic_lower for kw in ["crime", "flora", "fauna"]):
            suggestions.extend([
                "Tipicidade do crime ambiental (Lei 9.605/98)",
                "Responsabilidade penal da pessoa jurídica por crime ambiental",
                "Aplicação de penas restritivas de direitos (art. 8 Lei 9.605/98)",
                "Transação penal ambiental",
            ])

        if not suggestions:
            suggestions = [
                "Análise jurídica à luz do Direito Ambiental",
                "Verificação de conformidade com a legislação aplicável",
                "Observância dos princípios de Direito Ambiental",
                "Revisão da jurisprudência aplicável",
            ]

        return suggestions

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate direito ambiental theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO AMBIENTAL.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito Ambiental.\n'
                f'Direito Ambiental. Foque em: CF/88 art. 225, Lei 6.938/81, Lei 9.605/98, Código Florestal. Cite jurisprudência do STJ/STF.\n'
                f'NUNCA invente leis ou decisões. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito Ambiental.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

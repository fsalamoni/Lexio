"""Lexio — Direito das Sucessões legal area module."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class InheritanceArea(BaseLegalArea):
    """Direito das Sucessões."""

    def get_id(self) -> str:
        return "inheritance"

    def get_name(self) -> str:
        return "Direito das Sucessões"

    def get_description(self) -> str:
        return (
            "Sucessão legítima, testamentária, inventário, partilha e direito dos herdeiros."
        )

    def get_specializations(self) -> list[str]:
        return ["sucessao_legitima", "sucessao_testamentaria", "inventario_partilha", "direitos_herdeiros"]

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
            "herdeir": "sucessao_legitima.md",
            "legitim": "sucessao_legitima.md",
            "meacao": "sucessao_legitima.md",
            "testamen": "testamentos.md",
            "legado": "testamentos.md",
            "codicilo": "testamentos.md",
            "inventar": "inventario_partilha.md",
            "partilha": "inventario_partilha.md",
            "arrolament": "inventario_partilha.md"
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
        """Return specialized agent configurations for Direito das Sucessões."""
        return {
            "jurista": {
                "module": "packages.modules.legal_areas.inheritance.agents.jurista",
                "role": "Jurista sucessorista",
                "description": "Desenvolve teses de Direito Sucessório",
            },
            "advogado_diabo": {
                "module": "packages.modules.legal_areas.inheritance.agents.advogado_diabo",
                "role": "Advogado do Diabo sucessório",
                "description": "Critica teses sucessórias",
            },
            "fact_checker": {
                "module": "packages.modules.legal_areas.inheritance.agents.fact_checker",
                "role": "Verificador sucessório",
                "description": "Verifica artigos do CC/CPC e precedentes do STJ",
            },
        }

    def generate_thesis_suggestions(self, topic: str) -> list[str]:
        """Return thesis suggestions for a given direito das sucessões topic."""
        topic_lower = topic.lower()
        suggestions = []

        if any(kw in topic_lower for kw in ["herdeir", "legitim", "meacao"]):
            suggestions.extend([
                "Direito à legítima dos herdeiros necessários (art. 1.846 CC)",
                "Concorrência sucessória do cônjuge (art. 1.829 CC)",
                "Direito real de habitação do cônjuge sobrevivente",
                "Exclusão de herdeiro por indignidade (art. 1.814 CC)",
            ])

        if any(kw in topic_lower for kw in ["testamen", "legado", "clausula"]):
            suggestions.extend([
                "Nulidade do testamento por vício de forma",
                "Redução de disposição testamentária que excede a parte disponível",
                "Validade do testamento cerrado/público/particular",
                "Revogação de testamento anterior por testamento posterior",
            ])

        if any(kw in topic_lower for kw in ["inventar", "partilha", "arrolament"]):
            suggestions.extend([
                "Obrigatoriedade de abertura de inventário em prazo legal",
                "Partilha em vida (art. 2.018 CC)",
                "Colação de bens doados em vida (art. 2.002 CC)",
                "Sonegação de bens no inventário (art. 1.992 CC)",
            ])

        if not suggestions:
            suggestions = [
                "Análise jurídica à luz do Direito das Sucessões",
                "Verificação de conformidade com a legislação aplicável",
                "Observância dos princípios de Direito das Sucessões",
                "Revisão da jurisprudência aplicável",
            ]

        return suggestions

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate direito das sucessões theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO DAS SUCESSÕES.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito das Sucessões.\n'
                f'Direito das Sucessões. Foque em: CC/2002 (livro de sucessões), CPC (inventário e partilha). Cite jurisprudência do STJ.\n'
                f'NUNCA invente leis ou decisões. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito das Sucessões.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

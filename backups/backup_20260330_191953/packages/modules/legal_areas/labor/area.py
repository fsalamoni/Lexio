"""Lexio Module — Labor Law area implementation."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class LaborArea(BaseLegalArea):
    """Direito do Trabalho — Labor Law."""

    def get_id(self) -> str:
        return "labor"

    def get_name(self) -> str:
        return "Direito do Trabalho"

    def get_description(self) -> str:
        return (
            "Direito individual, coletivo, terceirização, processo do trabalho"
        )

    def get_specializations(self) -> list[str]:
        return [
            "individual",
            "coletivo",
            "terceirizacao",
            "processo_trabalho",
            "acidente_trabalho",
        ]

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
            "individual": "individual.md",
            "emprego": "individual.md",
            "contrato": "individual.md",
            "jornada": "individual.md",
            "rescis": "individual.md",
            "demiss": "individual.md",
            "salari": "individual.md",
            "remuner": "individual.md",
            "ferias": "individual.md",
            "fgts": "individual.md",
            "clt": "individual.md",
            "coletiv": "coletivo.md",
            "sindic": "coletivo.md",
            "greve": "coletivo.md",
            "convenc": "coletivo.md",
            "acordo coletivo": "coletivo.md",
            "dissidio": "coletivo.md",
            "negociac": "coletivo.md",
            "terceiriz": "terceirizacao.md",
            "outsourc": "terceirizacao.md",
            "6.019": "terceirizacao.md",
            "13.429": "terceirizacao.md",
            "sumula 331": "terceirizacao.md",
        }

        loaded = set()
        for keyword, filename in guide_mapping.items():
            if keyword in topic_lower and filename not in loaded:
                guide_path = GUIDES_DIR / filename
                if guide_path.exists():
                    content += guide_path.read_text(encoding="utf-8") + "\n\n"
                    loaded.add(filename)

        return content[:6000]

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate labor law theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO DO TRABALHO.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva trabalhista.\n'
                f'Foque em: CLT (pós-Reforma Lei 13.467/17), CF art. 7º, Súmulas/OJs do TST.\n'
                f'NUNCA invente leis. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito do Trabalho.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

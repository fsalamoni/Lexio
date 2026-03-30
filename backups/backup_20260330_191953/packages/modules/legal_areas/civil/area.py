"""Lexio Module — Civil Law area implementation."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class CivilArea(BaseLegalArea):
    """Direito Civil — Civil Law."""

    def get_id(self) -> str:
        return "civil"

    def get_name(self) -> str:
        return "Direito Civil"

    def get_description(self) -> str:
        return (
            "Obrigações, contratos, responsabilidade civil, direitos reais, "
            "família e sucessões"
        )

    def get_specializations(self) -> list[str]:
        return [
            "obrigacoes",
            "contratos",
            "responsabilidade_civil",
            "direitos_reais",
            "familia_sucessoes",
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
            "obrigac": "obrigacoes.md",
            "pagament": "obrigacoes.md",
            "inadimple": "obrigacoes.md",
            "mora": "obrigacoes.md",
            "contrat": "contratos.md",
            "compra e venda": "contratos.md",
            "locac": "contratos.md",
            "prestac": "contratos.md",
            "consumo": "contratos.md",
            "consumid": "contratos.md",
            "cdc": "contratos.md",
            "responsa": "responsabilidade_civil.md",
            "dano": "responsabilidade_civil.md",
            "indeniz": "responsabilidade_civil.md",
            "nexo": "responsabilidade_civil.md",
            "culpa": "responsabilidade_civil.md",
            "186": "responsabilidade_civil.md",
            "927": "responsabilidade_civil.md",
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
        """Generate civil law theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO CIVIL.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito Civil.\n'
                f'Foque em: CC/2002 (Lei 10.406/02), CDC (Lei 8.078/90), princípios civis, '
                f'boa-fé objetiva, função social do contrato, responsabilidade civil.\n'
                f'NUNCA invente leis. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito Civil.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

"""Lexio Module — Administrative Law area implementation."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class AdministrativeArea(BaseLegalArea):
    """Direito Administrativo — Administrative Law."""

    def get_id(self) -> str:
        return "administrative"

    def get_name(self) -> str:
        return "Direito Administrativo"

    def get_description(self) -> str:
        return (
            "Licitações e contratos (Lei 14.133/21), improbidade administrativa "
            "(Lei 8.429/92), servidores públicos, atos administrativos, "
            "concessões e regulação."
        )

    def get_specializations(self) -> list[str]:
        return [
            "licitacoes",
            "improbidade",
            "servidores_publicos",
            "atos_administrativos",
            "concessoes",
            "regulacao",
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
            "licitac": "licitacoes.md",
            "contrat": "licitacoes.md",
            "14.133": "licitacoes.md",
            "improb": "improbidade.md",
            "8.429": "improbidade.md",
            "servidor": "servidores.md",
            "estatut": "servidores.md",
            "funciona": "servidores.md",
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
        """Generate administrative law theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO ADMINISTRATIVO.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito Administrativo.\n'
                f'Foque em: CF art. 37, Lei 14.133/21, Lei 8.429/92, princípios administrativos.\n'
                f'NUNCA invente leis. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito Administrativo.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

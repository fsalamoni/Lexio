"""Lexio Module — Tax Law area implementation."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class TaxArea(BaseLegalArea):
    """Direito Tributário — Tax Law."""

    def get_id(self) -> str:
        return "tax"

    def get_name(self) -> str:
        return "Direito Tributário"

    def get_description(self) -> str:
        return (
            "ICMS, IR, execução fiscal, processo administrativo tributário, "
            "contribuições, imunidades e isenções tributárias."
        )

    def get_specializations(self) -> list[str]:
        return [
            "icms",
            "ir",
            "execucao_fiscal",
            "processo_administrativo_tributario",
            "contribuicoes",
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
            "icms": "icms.md",
            "kandir": "icms.md",
            "87/96": "icms.md",
            "substituic": "icms.md",
            "difal": "icms.md",
            "confaz": "icms.md",
            "imposto de renda": "ir.md",
            "irpf": "ir.md",
            "irpj": "ir.md",
            "renda": "ir.md",
            "lucro real": "ir.md",
            "lucro presumido": "ir.md",
            "7.713": "ir.md",
            "9.580": "ir.md",
            "execuc": "execucao_fiscal.md",
            "6.830": "execucao_fiscal.md",
            "cda": "execucao_fiscal.md",
            "fiscal": "execucao_fiscal.md",
            "penhora": "execucao_fiscal.md",
            "redirecion": "execucao_fiscal.md",
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
        """Generate tax law theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Voce e JURISTA especializado em DIREITO TRIBUTARIO.\n'
                f'Desenvolva teses juridicas sobre "{tema}" na perspectiva do Direito Tributario.\n'
                f'Foque em: CTN, CF arts. 145-162, LC 87/96, principios tributarios.\n'
                f'NUNCA invente leis. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referencia.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito Tributario.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

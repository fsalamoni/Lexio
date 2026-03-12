"""Lexio — Direito de Família legal area module."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class FamilyArea(BaseLegalArea):
    """Direito de Família."""

    def get_id(self) -> str:
        return "family"

    def get_name(self) -> str:
        return "Direito de Família"

    def get_description(self) -> str:
        return (
            "Casamento, divórcio, guarda, alimentos, regime de bens e união estável."
        )

    def get_specializations(self) -> list[str]:
        return ["casamento_divorcio", "guarda_alimentos", "regime_bens", "uniao_estavel"]

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
            "casament": "casamento_divorcio.md",
            "divorci": "casamento_divorcio.md",
            "separac": "casamento_divorcio.md",
            "guarda": "guarda_alimentos.md",
            "aliment": "guarda_alimentos.md",
            "pensao": "guarda_alimentos.md",
            "visitac": "guarda_alimentos.md",
            "regime": "regime_bens.md",
            "comunhao": "regime_bens.md",
            "partilha": "regime_bens.md",
            "uniao estavel": "regime_bens.md"
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
        """Return specialized agent configurations for Direito de Família."""
        return {
            "jurista": {
                "module": "packages.modules.legal_areas.family.agents.jurista",
                "role": "Jurista familiarista",
                "description": "Desenvolve teses de Direito de Família",
            },
            "advogado_diabo": {
                "module": "packages.modules.legal_areas.family.agents.advogado_diabo",
                "role": "Advogado do Diabo familiar",
                "description": "Critica teses de direito de família",
            },
            "fact_checker": {
                "module": "packages.modules.legal_areas.family.agents.fact_checker",
                "role": "Verificador familiar",
                "description": "Verifica artigos do CC, ECA e precedentes do STJ",
            },
        }

    def generate_thesis_suggestions(self, topic: str) -> list[str]:
        """Return thesis suggestions for a given direito de família topic."""
        topic_lower = topic.lower()
        suggestions = []

        if any(kw in topic_lower for kw in ["guarda", "visitac", "alienac"]):
            suggestions.extend([
                "Guarda compartilhada como regra (art. 1.584 §2º CC)",
                "Alienação parental (Lei 12.318/10)",
                "Melhor interesse da criança e do adolescente (art. 227 CF)",
                "Direito de convivência familiar",
            ])

        if any(kw in topic_lower for kw in ["aliment", "pensao"]):
            suggestions.extend([
                "Revisão de alimentos por mudança nas condições financeiras (art. 1.699 CC)",
                "Binômio necessidade-possibilidade na fixação de alimentos",
                "Alimentos gravídicos (Lei 11.804/08)",
                "Prisão civil por inadimplemento alimentar",
            ])

        if any(kw in topic_lower for kw in ["divorci", "partilha", "regime"]):
            suggestions.extend([
                "Partilha de bens no regime de comunhão parcial (art. 1.658 CC)",
                "Esforço comum na união estável (art. 1.725 CC)",
                "Culpa na dissolução do vínculo conjugal",
                "Direito real de habitação do cônjuge sobrevivente (art. 1.831 CC)",
            ])

        if not suggestions:
            suggestions = [
                "Análise jurídica à luz do Direito de Família",
                "Verificação de conformidade com a legislação aplicável",
                "Observância dos princípios de Direito de Família",
                "Revisão da jurisprudência aplicável",
            ]

        return suggestions

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate direito de família theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO DE FAMÍLIA.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito de Família.\n'
                f'Direito de Família. Foque em: CC/2002 (livro de família), ECA, Lei Maria da Penha. Cite jurisprudência do STJ.\n'
                f'NUNCA invente leis ou decisões. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito de Família.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

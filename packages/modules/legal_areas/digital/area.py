"""Lexio — Direito Digital legal area module."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class DigitalArea(BaseLegalArea):
    """Direito Digital."""

    def get_id(self) -> str:
        return "digital"

    def get_name(self) -> str:
        return "Direito Digital"

    def get_description(self) -> str:
        return (
            "Proteção de dados, crimes cibernéticos, Marco Civil da Internet e inteligência artificial."
        )

    def get_specializations(self) -> list[str]:
        return ["protecao_dados", "crimes_ciberneticos", "marco_civil_internet", "inteligencia_artificial"]

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
            "dados": "protecao_dados.md",
            "lgpd": "protecao_dados.md",
            "privacidade": "protecao_dados.md",
            "consentiment": "protecao_dados.md",
            "marco civil": "marco_civil.md",
            "internet": "marco_civil.md",
            "provedor": "marco_civil.md",
            "rede social": "marco_civil.md",
            "crime": "crimes_ciberneticos.md",
            "invasao": "crimes_ciberneticos.md",
            "hacker": "crimes_ciberneticos.md",
            "fraude": "crimes_ciberneticos.md"
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
        """Return specialized agent configurations for Direito Digital."""
        return {
            "jurista": {
                "module": "packages.modules.legal_areas.digital.agents.jurista",
                "role": "Jurista digitalista",
                "description": "Desenvolve teses de Direito Digital",
            },
            "advogado_diabo": {
                "module": "packages.modules.legal_areas.digital.agents.advogado_diabo",
                "role": "Advogado do Diabo digital",
                "description": "Critica teses de direito digital",
            },
            "fact_checker": {
                "module": "packages.modules.legal_areas.digital.agents.fact_checker",
                "role": "Verificador digital",
                "description": "Verifica LGPD, Marco Civil e precedentes do STJ",
            },
        }

    def generate_thesis_suggestions(self, topic: str) -> list[str]:
        """Return thesis suggestions for a given direito digital topic."""
        topic_lower = topic.lower()
        suggestions = []

        if any(kw in topic_lower for kw in ["dados", "lgpd", "privacidade"]):
            suggestions.extend([
                "Violação à LGPD (Lei 13.709/18) por tratamento indevido de dados pessoais",
                "Ausência de base legal para tratamento (art. 7 LGPD)",
                "Dano moral por vazamento de dados pessoais",
                "Direito de acesso/retificação/exclusão de dados (arts. 17-18 LGPD)",
            ])

        if any(kw in topic_lower for kw in ["marco civil", "internet", "provedor"]):
            suggestions.extend([
                "Responsabilidade do provedor por conteúdo de terceiros (art. 19 Marco Civil)",
                "Remoção de conteúdo mediante ordem judicial (art. 19 Lei 12.965/14)",
                "Direito ao esquecimento digital",
                "Neutralidade de rede (art. 9 Marco Civil)",
            ])

        if any(kw in topic_lower for kw in ["crime", "invasao", "cibernetic"]):
            suggestions.extend([
                "Invasão de dispositivo informático (art. 154-A CP)",
                "Estelionato digital (art. 171 §2º-A CP)",
                "Fraude eletrônica",
                "Responsabilidade por deep fakes e desinformação",
            ])

        if not suggestions:
            suggestions = [
                "Análise jurídica à luz do Direito Digital",
                "Verificação de conformidade com a legislação aplicável",
                "Observância dos princípios de Direito Digital",
                "Revisão da jurisprudência aplicável",
            ]

        return suggestions

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate direito digital theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO DIGITAL.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito Digital.\n'
                f'Direito Digital. Foque em: LGPD (Lei 13.709/18), Marco Civil (Lei 12.965/14), CP (crimes cibernéticos). Cite jurisprudência do STJ.\n'
                f'NUNCA invente leis ou decisões. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito Digital.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

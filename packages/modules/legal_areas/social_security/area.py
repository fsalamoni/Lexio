"""Lexio — Direito Previdenciário legal area module."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class SocialSecurityArea(BaseLegalArea):
    """Direito Previdenciário."""

    def get_id(self) -> str:
        return "social_security"

    def get_name(self) -> str:
        return "Direito Previdenciário"

    def get_description(self) -> str:
        return (
            "Benefícios previdenciários, aposentadoria, auxílio-doença, pensão por morte e LOAS."
        )

    def get_specializations(self) -> list[str]:
        return ["aposentadoria", "auxilio_doenca", "pensao_morte", "beneficio_assistencial"]

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
            "aposentador": "aposentadoria.md",
            "tempo de contribu": "aposentadoria.md",
            "idade": "aposentadoria.md",
            "reforma": "aposentadoria.md",
            "incapacidad": "beneficios_incapacidade.md",
            "auxilio": "beneficios_incapacidade.md",
            "invalidez": "beneficios_incapacidade.md",
            "acident": "beneficios_incapacidade.md",
            "loas": "beneficio_assistencial.md",
            "bpc": "beneficio_assistencial.md",
            "assistencial": "beneficio_assistencial.md"
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
        """Return specialized agent configurations for Direito Previdenciário."""
        return {
            "jurista": {
                "module": "packages.modules.legal_areas.social_security.agents.jurista",
                "role": "Jurista previdenciarista",
                "description": "Desenvolve teses previdenciárias",
            },
            "advogado_diabo": {
                "module": "packages.modules.legal_areas.social_security.agents.advogado_diabo",
                "role": "Advogado do Diabo previdenciário",
                "description": "Critica teses previdenciárias",
            },
            "fact_checker": {
                "module": "packages.modules.legal_areas.social_security.agents.fact_checker",
                "role": "Verificador previdenciário",
                "description": "Verifica legislação previdenciária e precedentes do STJ/TNU",
            },
        }

    def generate_thesis_suggestions(self, topic: str) -> list[str]:
        """Return thesis suggestions for a given direito previdenciário topic."""
        topic_lower = topic.lower()
        suggestions = []

        if any(kw in topic_lower for kw in ["aposentad", "tempo", "contribu"]):
            suggestions.extend([
                "Direito à aposentadoria por tempo de contribuição/idade",
                "Contagem de tempo especial (atividades insalubres)",
                "Direito adquirido às regras anteriores à EC 103/19",
                "Revisão da vida toda (tema 1102 STF)",
            ])

        if any(kw in topic_lower for kw in ["incapacidad", "auxilio", "invalidez"]):
            suggestions.extend([
                "Concessão de auxílio-doença por incapacidade laborativa",
                "Conversão de auxílio-doença em aposentadoria por invalidez",
                "Data de início do benefício retroativa à data do requerimento administrativo",
                "Auxílio-acidente por redução da capacidade laborativa",
            ])

        if any(kw in topic_lower for kw in ["loas", "bpc", "assistencial"]):
            suggestions.extend([
                "Concessão de BPC/LOAS a pessoa com deficiência (art. 20 Lei 8.742/93)",
                "Miserabilidade para fins de BPC — critério de renda per capita",
                "Flexibilização do critério de renda pelo STF",
                "BPC ao idoso (art. 20 LOAS + art. 34 Estatuto do Idoso)",
            ])

        if not suggestions:
            suggestions = [
                "Análise jurídica à luz do Direito Previdenciário",
                "Verificação de conformidade com a legislação aplicável",
                "Observância dos princípios de Direito Previdenciário",
                "Revisão da jurisprudência aplicável",
            ]

        return suggestions

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate direito previdenciário theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO PREVIDENCIÁRIO.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito Previdenciário.\n'
                f'Direito Previdenciário. Foque em: Lei 8.213/91, Lei 8.742/93 (LOAS), EC 103/19 (Reforma). Cite jurisprudência do STJ/TNU.\n'
                f'NUNCA invente leis ou decisões. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito Previdenciário.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

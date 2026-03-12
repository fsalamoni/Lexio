"""Lexio — Direito Empresarial legal area module."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class BusinessArea(BaseLegalArea):
    """Direito Empresarial."""

    def get_id(self) -> str:
        return "business"

    def get_name(self) -> str:
        return "Direito Empresarial"

    def get_description(self) -> str:
        return (
            "Sociedades, contratos empresariais, falência, recuperação judicial e propriedade intelectual."
        )

    def get_specializations(self) -> list[str]:
        return ["sociedades", "contratos_empresariais", "falencia_recuperacao", "propriedade_intelectual"]

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
            "socied": "sociedades.md",
            "socio": "sociedades.md",
            "ltda": "sociedades.md",
            "s.a": "sociedades.md",
            "falenc": "falencia_recuperacao.md",
            "recuperac": "falencia_recuperacao.md",
            "credito": "falencia_recuperacao.md",
            "patente": "propriedade_intelectual.md",
            "marca": "propriedade_intelectual.md",
            "propriedade intelectual": "propriedade_intelectual.md"
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
        """Return specialized agent configurations for Direito Empresarial."""
        return {
            "jurista": {
                "module": "packages.modules.legal_areas.business.agents.jurista",
                "role": "Jurista empresarialista",
                "description": "Desenvolve teses de Direito Empresarial",
            },
            "advogado_diabo": {
                "module": "packages.modules.legal_areas.business.agents.advogado_diabo",
                "role": "Advogado do Diabo empresarial",
                "description": "Critica teses empresariais",
            },
            "fact_checker": {
                "module": "packages.modules.legal_areas.business.agents.fact_checker",
                "role": "Verificador empresarial",
                "description": "Verifica legislação empresarial e precedentes do STJ",
            },
        }

    def generate_thesis_suggestions(self, topic: str) -> list[str]:
        """Return thesis suggestions for a given direito empresarial topic."""
        topic_lower = topic.lower()
        suggestions = []

        if any(kw in topic_lower for kw in ["socied", "socio", "ltda"]):
            suggestions.extend([
                "Desconsideração da personalidade jurídica (art. 50 CC)",
                "Responsabilidade dos sócios por dívidas sociais",
                "Dissolução parcial de sociedade (art. 1.029 CC)",
                "Apuração de haveres do sócio retirante",
            ])

        if any(kw in topic_lower for kw in ["falenc", "recuperac", "credito"]):
            suggestions.extend([
                "Viabilidade do plano de recuperação judicial",
                "Classificação de créditos na falência (art. 83 Lei 11.101/05)",
                "Suspensão de execuções (stay period — art. 6º Lei 11.101/05)",
                "Habilitação de crédito na falência",
            ])

        if any(kw in topic_lower for kw in ["patente", "marca", "propriedade"]):
            suggestions.extend([
                "Violação de marca registrada (Lei 9.279/96)",
                "Concorrência desleal (art. 195 Lei 9.279/96)",
                "Proteção de segredo industrial",
                "Contrafação de patente",
            ])

        if not suggestions:
            suggestions = [
                "Análise jurídica à luz do Direito Empresarial",
                "Verificação de conformidade com a legislação aplicável",
                "Observância dos princípios de Direito Empresarial",
                "Revisão da jurisprudência aplicável",
            ]

        return suggestions

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate direito empresarial theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO EMPRESARIAL.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito Empresarial.\n'
                f'Direito Empresarial. Foque em: CC/2002 (livro de empresa), Lei 11.101/05, Lei 9.279/96 (PI). Cite jurisprudência do STJ.\n'
                f'NUNCA invente leis ou decisões. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito Empresarial.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

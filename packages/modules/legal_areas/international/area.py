"""Lexio — Direito Internacional legal area module."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class InternationalArea(BaseLegalArea):
    """Direito Internacional."""

    def get_id(self) -> str:
        return "international"

    def get_name(self) -> str:
        return "Direito Internacional"

    def get_description(self) -> str:
        return (
            "Tratados internacionais, direito internacional público e privado, cooperação jurídica internacional."
        )

    def get_specializations(self) -> list[str]:
        return ["tratados_internacionais", "direito_internacional_privado", "cooperacao_juridica", "direitos_humanos_internacional"]

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
            "tratado": "tratados.md",
            "convencao": "tratados.md",
            "protocolo": "tratados.md",
            "cooperac": "cooperacao_juridica.md",
            "carta rogatoria": "cooperacao_juridica.md",
            "homologac": "cooperacao_juridica.md",
            "extradicao": "cooperacao_juridica.md",
            "direitos humanos": "direitos_humanos.md",
            "convencao americana": "direitos_humanos.md",
            "pacto": "direitos_humanos.md"
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
        """Return specialized agent configurations for Direito Internacional."""
        return {
            "jurista": {
                "module": "packages.modules.legal_areas.international.agents.jurista",
                "role": "Jurista internacionalista",
                "description": "Desenvolve teses de Direito Internacional",
            },
            "advogado_diabo": {
                "module": "packages.modules.legal_areas.international.agents.advogado_diabo",
                "role": "Advogado do Diabo internacional",
                "description": "Critica teses internacionais",
            },
            "fact_checker": {
                "module": "packages.modules.legal_areas.international.agents.fact_checker",
                "role": "Verificador internacional",
                "description": "Verifica tratados, resoluções e precedentes internacionais",
            },
        }

    def generate_thesis_suggestions(self, topic: str) -> list[str]:
        """Return thesis suggestions for a given direito internacional topic."""
        topic_lower = topic.lower()
        suggestions = []

        if any(kw in topic_lower for kw in ["tratado", "convencao", "protocolo"]):
            suggestions.extend([
                "Hierarquia supralegal dos tratados de direitos humanos (RE 466.343 STF)",
                "Controle de convencionalidade das leis internas",
                "Aplicação direta de tratado internacional ratificado pelo Brasil",
                "Princípio pacta sunt servanda",
            ])

        if any(kw in topic_lower for kw in ["cooperac", "rogatoria", "extradicao"]):
            suggestions.extend([
                "Requisitos para homologação de sentença estrangeira (art. 961 CPC)",
                "Cooperação jurídica internacional via carta rogatória",
                "Auxílio direto em matéria civil e penal",
                "Extradição — requisitos e limitações",
            ])

        if any(kw in topic_lower for kw in ["direitos humanos", "convencao americana"]):
            suggestions.extend([
                "Aplicação da Convenção Americana sobre Direitos Humanos (Pacto de São José)",
                "Jurisdição da Corte Interamericana de Direitos Humanos",
                "Proteção internacional dos direitos humanos como jus cogens",
                "Princípio pro homine na interpretação de normas de direitos humanos",
            ])

        if not suggestions:
            suggestions = [
                "Análise jurídica à luz do Direito Internacional",
                "Verificação de conformidade com a legislação aplicável",
                "Observância dos princípios de Direito Internacional",
                "Revisão da jurisprudência aplicável",
            ]

        return suggestions

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate direito internacional theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO INTERNACIONAL.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito Internacional.\n'
                f'Direito Internacional. Foque em: CF/88 art. 5§3, Tratados Internacionais, CADH, CPC (cooperação). Cite jurisprudência do STF/STJ/CorteIDH.\n'
                f'NUNCA invente leis ou decisões. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito Internacional.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

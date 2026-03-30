"""Lexio — Direito Penal legal area module."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class CriminalArea(BaseLegalArea):
    """Direito Penal."""

    def get_id(self) -> str:
        return "criminal"

    def get_name(self) -> str:
        return "Direito Penal"

    def get_description(self) -> str:
        return (
            "Crimes, penas, tipicidade, ilicitude, culpabilidade e política criminal."
        )

    def get_specializations(self) -> list[str]:
        return ["crimes_contra_pessoa", "crimes_contra_patrimonio", "crimes_contra_administracao", "legislacao_penal_especial"]

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
            "tipi": "tipicidade_ilicitude.md",
            "ilicit": "tipicidade_ilicitude.md",
            "fato tipico": "tipicidade_ilicitude.md",
            "dolo": "tipicidade_ilicitude.md",
            "culpa": "culpabilidade.md",
            "imputab": "culpabilidade.md",
            "pena": "dosimetria_pena.md",
            "dosimetr": "dosimetria_pena.md",
            "regime": "dosimetria_pena.md",
            "atenuant": "dosimetria_pena.md",
            "agravant": "dosimetria_pena.md"
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
        """Return specialized agent configurations for Direito Penal."""
        return {
            "jurista": {
                "module": "packages.modules.legal_areas.criminal.agents.jurista",
                "role": "Jurista penalista",
                "description": "Desenvolve teses de Direito Penal",
            },
            "advogado_diabo": {
                "module": "packages.modules.legal_areas.criminal.agents.advogado_diabo",
                "role": "Advogado do Diabo penal",
                "description": "Critica teses sob perspectiva penal",
            },
            "fact_checker": {
                "module": "packages.modules.legal_areas.criminal.agents.fact_checker",
                "role": "Verificador penal",
                "description": "Verifica artigos do CP, súmulas e precedentes do STF/STJ",
            },
        }

    def generate_thesis_suggestions(self, topic: str) -> list[str]:
        """Return thesis suggestions for a given direito penal topic."""
        topic_lower = topic.lower()
        suggestions = []

        if any(kw in topic_lower for kw in ["homic", "lesao", "violencia"]):
            suggestions.extend([
                "Ausência de dolo na conduta do agente",
                "Legítima defesa (art. 25 CP)",
                "Princípio da insignificância",
                "Atipicidade da conduta",
            ])

        if any(kw in topic_lower for kw in ["furto", "roubo", "estelionato", "patrimonio"]):
            suggestions.extend([
                "Princípio da insignificância no crime patrimonial",
                "Furto privilegiado (art. 155 §2º CP)",
                "Desclassificação para crime menos grave",
                "Arrependimento posterior (art. 16 CP)",
            ])

        if any(kw in topic_lower for kw in ["corrupc", "peculat", "prevaric"]):
            suggestions.extend([
                "Ausência de elementar subjetiva especial",
                "Inexigibilidade de conduta diversa",
                "Nulidade por vício processual",
                "Atipicidade por ausência de dolo específico",
            ])

        if not suggestions:
            suggestions = [
                "Análise jurídica à luz do Direito Penal",
                "Verificação de conformidade com a legislação aplicável",
                "Observância dos princípios de Direito Penal",
                "Revisão da jurisprudência aplicável",
            ]

        return suggestions

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate direito penal theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO PENAL.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito Penal.\n'
                f'Direito Penal. Foque em: CP (DL 2.848/40), tipos penais, excludentes de ilicitude e culpabilidade. Cite jurisprudência do STF/STJ.\n'
                f'NUNCA invente leis ou decisões. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito Penal.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

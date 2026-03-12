"""Lexio — Direito Processual Penal legal area module."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class CriminalProcedureArea(BaseLegalArea):
    """Direito Processual Penal."""

    def get_id(self) -> str:
        return "criminal_procedure"

    def get_name(self) -> str:
        return "Direito Processual Penal"

    def get_description(self) -> str:
        return (
            "Inquérito policial, ação penal, provas, medidas cautelares, recursos e execução penal."
        )

    def get_specializations(self) -> list[str]:
        return ["inquerito_policial", "acao_penal", "provas_penais", "medidas_cautelares_penais", "recursos_penais"]

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
            "inquerit": "inquerito_acao_penal.md",
            "acao penal": "inquerito_acao_penal.md",
            "denuncia": "inquerito_acao_penal.md",
            "prova": "provas_penais.md",
            "ilicit": "provas_penais.md",
            "testemunha": "provas_penais.md",
            "prisao": "prisao_cautelar.md",
            "cautelar": "prisao_cautelar.md",
            "fianca": "prisao_cautelar.md",
            "liberdade provis": "prisao_cautelar.md"
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
        """Return specialized agent configurations for Direito Processual Penal."""
        return {
            "jurista": {
                "module": "packages.modules.legal_areas.criminal_procedure.agents.jurista",
                "role": "Jurista processualista penal",
                "description": "Desenvolve teses processuais penais",
            },
            "advogado_diabo": {
                "module": "packages.modules.legal_areas.criminal_procedure.agents.advogado_diabo",
                "role": "Advogado do Diabo processual penal",
                "description": "Critica teses processuais penais",
            },
            "fact_checker": {
                "module": "packages.modules.legal_areas.criminal_procedure.agents.fact_checker",
                "role": "Verificador processual penal",
                "description": "Verifica artigos do CPP, súmulas e precedentes",
            },
        }

    def generate_thesis_suggestions(self, topic: str) -> list[str]:
        """Return thesis suggestions for a given direito processual penal topic."""
        topic_lower = topic.lower()
        suggestions = []

        if any(kw in topic_lower for kw in ["prova", "ilicit", "testemunha"]):
            suggestions.extend([
                "Ilicitude da prova obtida por meio ilícito (art. 157 CPP)",
                "Nulidade da prova derivada (teoria dos frutos da árvore envenenada)",
                "Quebra de cadeia de custódia",
                "Direito ao silêncio (art. 5º LXIII CF)",
            ])

        if any(kw in topic_lower for kw in ["prisao", "cautelar", "preventiv"]):
            suggestions.extend([
                "Ausência dos requisitos da prisão preventiva (art. 312 CPP)",
                "Desproporcionalidade da medida cautelar",
                "Cabimento de medidas cautelares diversas (art. 319 CPP)",
                "Excesso de prazo na prisão cautelar",
            ])

        if any(kw in topic_lower for kw in ["nulidad", "cerceamento", "defesa"]):
            suggestions.extend([
                "Cerceamento de defesa por indeferimento de diligência essencial",
                "Nulidade por ausência de fundamentação",
                "Violação ao contraditório (art. 5º LV CF)",
                "Inobservância de formalidade essencial",
            ])

        if not suggestions:
            suggestions = [
                "Análise jurídica à luz do Direito Processual Penal",
                "Verificação de conformidade com a legislação aplicável",
                "Observância dos princípios de Direito Processual Penal",
                "Revisão da jurisprudência aplicável",
            ]

        return suggestions

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate direito processual penal theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO PROCESSUAL PENAL.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito Processual Penal.\n'
                f'Direito Processual Penal. Foque em: CPP (DL 3.689/41), garantias processuais, provas, prisão cautelar. Cite jurisprudência do STF/STJ.\n'
                f'NUNCA invente leis ou decisões. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito Processual Penal.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

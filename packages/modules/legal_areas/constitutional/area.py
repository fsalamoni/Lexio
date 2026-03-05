"""Lexio — Direito Constitucional legal area module."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class ConstitutionalArea(BaseLegalArea):
    """Direito Constitucional — Constitutional Law."""

    def get_id(self) -> str:
        return "constitutional"

    def get_name(self) -> str:
        return "Direito Constitucional"

    def get_description(self) -> str:
        return (
            "Controle de constitucionalidade, direitos fundamentais, "
            "organização do Estado e processo legislativo."
        )

    def get_specializations(self) -> list[str]:
        return [
            "controle_constitucionalidade",
            "direitos_fundamentais",
            "organizacao_estado",
            "processo_legislativo",
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
            "constitucional": "controle_constitucionalidade.md",
            "controle": "controle_constitucionalidade.md",
            "adi": "controle_constitucionalidade.md",
            "adc": "controle_constitucionalidade.md",
            "adpf": "controle_constitucionalidade.md",
            "inconstitucional": "controle_constitucionalidade.md",
            "modulacao": "controle_constitucionalidade.md",
            "direito fundamental": "direitos_fundamentais.md",
            "direitos fundamental": "direitos_fundamentais.md",
            "proporcionalidade": "direitos_fundamentais.md",
            "razoabilidade": "direitos_fundamentais.md",
            "art. 5": "direitos_fundamentais.md",
            "liberdade": "direitos_fundamentais.md",
            "igualdade": "direitos_fundamentais.md",
            "dignidade": "direitos_fundamentais.md",
            "minimo existencial": "direitos_fundamentais.md",
            "reserva do possivel": "direitos_fundamentais.md",
            "federalis": "organizacao_estado.md",
            "competencia": "organizacao_estado.md",
            "separacao de poderes": "organizacao_estado.md",
            "intervencao": "organizacao_estado.md",
            "organizacao": "organizacao_estado.md",
            "art. 37": "organizacao_estado.md",
            "administracao publica": "organizacao_estado.md",
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
        """Return specialized agent configurations for Constitutional Law."""
        return {
            "jurista": {
                "module": "packages.modules.legal_areas.constitutional.agents.jurista",
                "role": "Jurista constitucionalista",
                "description": "Desenvolve teses de Direito Constitucional",
            },
            "advogado_diabo": {
                "module": "packages.modules.legal_areas.constitutional.agents.advogado_diabo",
                "role": "Advogado do Diabo constitucional",
                "description": "Critica teses sob perspectiva constitucional",
            },
            "fact_checker": {
                "module": "packages.modules.legal_areas.constitutional.agents.fact_checker",
                "role": "Verificador constitucional",
                "description": "Verifica artigos da CF, súmulas vinculantes e precedentes do STF",
            },
        }

    def generate_thesis_suggestions(self, topic: str) -> list[str]:
        """Return thesis suggestions for a given constitutional law topic."""
        topic_lower = topic.lower()
        suggestions = []

        if any(kw in topic_lower for kw in ["controle", "constitucionalidade", "adi", "adpf"]):
            suggestions.extend([
                "Inconstitucionalidade formal por vício no processo legislativo",
                "Inconstitucionalidade material por violação a direito fundamental",
                "Modulação de efeitos da declaração de inconstitucionalidade",
                "Cabimento de ADPF por inexistência de outro meio eficaz",
            ])

        if any(kw in topic_lower for kw in ["direito", "fundamental", "liberdade", "igualdade"]):
            suggestions.extend([
                "Violação ao princípio da proporcionalidade (adequação, necessidade, proporcionalidade estrita)",
                "Aplicação da eficácia horizontal dos direitos fundamentais",
                "Vedação do retrocesso social em direitos fundamentais",
                "Mínimo existencial como limite à reserva do possível",
            ])

        if any(kw in topic_lower for kw in ["federalis", "competencia", "organizacao"]):
            suggestions.extend([
                "Invasão de competência legislativa pela União/Estado/Município",
                "Inconstitucionalidade por violação ao pacto federativo",
                "Princípio da simetria na organização dos entes federativos",
                "Conflito de competência concorrente (art. 24 CF)",
            ])

        if not suggestions:
            suggestions = [
                "Análise de constitucionalidade à luz dos direitos fundamentais",
                "Compatibilidade com a ordem constitucional vigente (CF/88)",
                "Observância dos princípios constitucionais aplicáveis",
                "Verificação de conformidade com a jurisprudência do STF",
            ]

        return suggestions

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate constitutional law theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO CONSTITUCIONAL.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito Constitucional.\n'
                f'Foque em: CF/88, controle de constitucionalidade, direitos fundamentais, '
                f'organização do Estado, princípio da proporcionalidade.\n'
                f'Cite jurisprudência do STF (ADIs, ADCs, ADPFs, Súmulas Vinculantes).\n'
                f'NUNCA invente leis ou decisões. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito Constitucional.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

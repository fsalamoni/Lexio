"""Lexio — Direito do Consumidor legal area module."""

from pathlib import Path

from packages.modules.legal_areas.base import BaseLegalArea
from packages.core.llm.client import call_llm

GUIDES_DIR = Path(__file__).parent / "guides"


class ConsumerArea(BaseLegalArea):
    """Direito do Consumidor."""

    def get_id(self) -> str:
        return "consumer"

    def get_name(self) -> str:
        return "Direito do Consumidor"

    def get_description(self) -> str:
        return (
            "Relações de consumo, responsabilidade do fornecedor, práticas abusivas e defesa do consumidor."
        )

    def get_specializations(self) -> list[str]:
        return ["responsabilidade_fornecedor", "praticas_abusivas", "contratos_consumo", "direitos_basicos"]

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
            "responsa": "responsabilidade_fornecedor.md",
            "defeito": "responsabilidade_fornecedor.md",
            "vicio": "responsabilidade_fornecedor.md",
            "recall": "responsabilidade_fornecedor.md",
            "abusiv": "praticas_abusivas.md",
            "publicidade": "praticas_abusivas.md",
            "propaganda": "praticas_abusivas.md",
            "contrat": "contratos_consumo.md",
            "clausula": "contratos_consumo.md",
            "adesao": "contratos_consumo.md"
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
        """Return specialized agent configurations for Direito do Consumidor."""
        return {
            "jurista": {
                "module": "packages.modules.legal_areas.consumer.agents.jurista",
                "role": "Jurista consumerista",
                "description": "Desenvolve teses de Direito do Consumidor",
            },
            "advogado_diabo": {
                "module": "packages.modules.legal_areas.consumer.agents.advogado_diabo",
                "role": "Advogado do Diabo consumerista",
                "description": "Critica teses de direito do consumidor",
            },
            "fact_checker": {
                "module": "packages.modules.legal_areas.consumer.agents.fact_checker",
                "role": "Verificador consumerista",
                "description": "Verifica artigos do CDC, súmulas e precedentes do STJ",
            },
        }

    def generate_thesis_suggestions(self, topic: str) -> list[str]:
        """Return thesis suggestions for a given direito do consumidor topic."""
        topic_lower = topic.lower()
        suggestions = []

        if any(kw in topic_lower for kw in ["defeito", "vicio", "produto", "servico"]):
            suggestions.extend([
                "Responsabilidade objetiva do fornecedor por defeito do produto/serviço (art. 12/14 CDC)",
                "Vício do produto (art. 18 CDC) — direito à substituição, abatimento ou restituição",
                "Inversão do ônus da prova (art. 6º VIII CDC)",
                "Solidariedade da cadeia de fornecedores",
            ])

        if any(kw in topic_lower for kw in ["abusiv", "clausula", "contrat"]):
            suggestions.extend([
                "Nulidade de cláusula abusiva (art. 51 CDC)",
                "Abusividade da prática comercial (art. 39 CDC)",
                "Publicidade enganosa ou abusiva (art. 37 CDC)",
                "Direito de arrependimento em compras fora do estabelecimento (art. 49 CDC)",
            ])

        if any(kw in topic_lower for kw in ["dano", "moral", "indeniz"]):
            suggestions.extend([
                "Dano moral in re ipsa por falha na prestação de serviço",
                "Teoria do desvio produtivo do consumidor",
                "Dano moral coletivo (art. 6º VI CDC)",
                "Aplicação da teoria da perda de uma chance",
            ])

        if not suggestions:
            suggestions = [
                "Análise jurídica à luz do Direito do Consumidor",
                "Verificação de conformidade com a legislação aplicável",
                "Observância dos princípios de Direito do Consumidor",
                "Revisão da jurisprudência aplicável",
            ]

        return suggestions

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate direito do consumidor theses for multi-area deliberation."""
        tema = context.get("tema", "")
        fragmentos = (context.get("fragmentosAcervo", "") or "")[:5000]
        guide_content = self._load_guide(tema)

        result = await call_llm(
            system=(
                f'Você é JURISTA especializado em DIREITO DO CONSUMIDOR.\n'
                f'Desenvolva teses jurídicas sobre "{tema}" na perspectiva do Direito do Consumidor.\n'
                f'Direito do Consumidor. Foque em: CDC (Lei 8.078/90), responsabilidade objetiva, práticas abusivas. Cite jurisprudência do STJ.\n'
                f'NUNCA invente leis ou decisões. Use APENAS fragmentos fornecidos.\n'
                f'Cite [Fonte: arquivo] para cada referência.'
            ),
            user=(
                f'<tema>{tema}</tema>\n'
                f'<guia_area>{guide_content}</guia_area>\n'
                f'<fragmentos>{fragmentos}</fragmentos>\n'
                f'Desenvolva teses de Direito do Consumidor.'
            ),
            model=model,
            max_tokens=3000,
            temperature=0.3,
        )
        return result["content"]

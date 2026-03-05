"""Lexio Module — Petição Inicial document type implementation."""

from packages.modules.document_types.base import BaseDocumentType
from packages.pipeline.pipeline_config import PipelineConfig, AgentConfig


class PeticaoInicialDocumentType(BaseDocumentType):
    """Petição Inicial (Initial Petition) — Full multi-agent pipeline."""

    TEMPLATES = {
        "generic": "packages.modules.document_types.peticao_inicial.templates.generic",
        "ordinario": "packages.modules.document_types.peticao_inicial.templates.generic",
        "sumario": "packages.modules.document_types.peticao_inicial.templates.generic",
    }

    def get_id(self) -> str:
        return "peticao_inicial"

    def get_name(self) -> str:
        return "Petição Inicial"

    def get_category(self) -> str:
        return "advocacy"

    def get_description(self) -> str:
        return "Petição inicial para ação judicial"

    def get_pipeline_config(self, template_variant: str | None = None) -> PipelineConfig:
        variant = template_variant or "generic"
        prompt_base = self.TEMPLATES.get(variant, self.TEMPLATES["generic"])

        return PipelineConfig(
            document_type_id="peticao_inicial",
            name="Pipeline Petição Inicial",
            description=f"Pipeline completo para petição inicial (variante: {variant})",
            model_triage="anthropic/claude-3.5-haiku",
            model_main="anthropic/claude-sonnet-4",
            agents=[
                AgentConfig(
                    name="triagem",
                    phase="triagem",
                    prompt_module=f"{prompt_base}.triagem",
                    model="anthropic/claude-3.5-haiku",
                    temperature=0.1,
                    max_tokens=600,
                    output_key="triagem_json",
                ),
                AgentConfig(
                    name="pesquisador",
                    phase="pesquisador",
                    prompt_module=f"{prompt_base}.pesquisador",
                    temperature=0.2,
                    max_tokens=3000,
                    output_key="pesquisa",
                ),
                AgentConfig(
                    name="jurista",
                    phase="jurista_teses",
                    prompt_module=f"{prompt_base}.jurista",
                    temperature=0.3,
                    max_tokens=3000,
                    output_key="teses",
                ),
                AgentConfig(
                    name="advogado_diabo",
                    phase="advogado_diabo",
                    prompt_module=f"{prompt_base}.advogado_diabo",
                    temperature=0.4,
                    max_tokens=2000,
                    output_key="criticas",
                ),
                AgentConfig(
                    name="jurista_v2",
                    phase="jurista_v2",
                    prompt_module=f"{prompt_base}.jurista_v2",
                    temperature=0.3,
                    max_tokens=3000,
                    output_key="teses_v2",
                ),
                AgentConfig(
                    name="fact_checker",
                    phase="fact_checker",
                    prompt_module=f"{prompt_base}.fact_checker",
                    temperature=0.1,
                    max_tokens=2000,
                    output_key="teses_verificadas",
                ),
                AgentConfig(
                    name="redator",
                    phase="redator",
                    prompt_module=f"{prompt_base}.redator",
                    temperature=0.3,
                    max_tokens=10000,
                    output_key="peticao_bruta",
                ),
                AgentConfig(
                    name="revisor",
                    phase="revisor",
                    prompt_module=f"{prompt_base}.revisor",
                    temperature=0.2,
                    max_tokens=10000,
                    output_key="texto_revisado",
                ),
            ],
            quality_module="packages.modules.document_types.peticao_inicial.quality_rules",
            integrator_module="packages.modules.document_types.peticao_inicial.integrator_rules",
            search_datajud=True,
            search_web=True,
            min_score=60,
        )

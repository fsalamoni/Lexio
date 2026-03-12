"""Lexio Module — Embargos de Declaração document type implementation."""

from packages.modules.document_types.base import BaseDocumentType
from packages.pipeline.pipeline_config import PipelineConfig, AgentConfig


class EmbargosDeclaracaoDocumentType(BaseDocumentType):
    """Embargos de Declaração — Pipeline for embargos de declaração generation."""

    TEMPLATES = {
        "generic": "packages.modules.document_types.embargos_declaracao.templates.generic",
    }

    def get_id(self) -> str:
        return "embargos_declaracao"

    def get_name(self) -> str:
        return "Embargos de Declaração"

    def get_category(self) -> str:
        return "general"

    def get_description(self) -> str:
        return "Geração de embargos de declaração com pipeline multi-agente. Correção de omissão, contradição ou obscuridade — art. 1.022 CPC/2015."

    def get_pipeline_config(self, template_variant: str | None = None) -> PipelineConfig:
        variant = template_variant or "generic"
        prompt_base = self.TEMPLATES.get(variant, self.TEMPLATES["generic"])

        return PipelineConfig(
            document_type_id="embargos_declaracao",
            name="Pipeline Embargos de Declaração",
            description=f"Pipeline completo para embargos de declaração (variante: {variant})",
            model_triage="anthropic/claude-3.5-haiku",
            model_main="anthropic/claude-sonnet-4",
            agents=[
                AgentConfig(
                    name="triagem",
                    phase="triagem",
                    prompt_module=f"{prompt_base}.triagem",
                    model="anthropic/claude-3.5-haiku",
                    temperature=0.1,
                    max_tokens=500,
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
                    max_tokens=4000,
                    output_key="teses",
                ),
                AgentConfig(
                    name="fact_checker",
                    phase="fact_checker",
                    prompt_module=f"{prompt_base}.fact_checker",
                    temperature=0.1,
                    max_tokens=2500,
                    output_key="teses_verificadas",
                ),
                AgentConfig(
                    name="redator",
                    phase="redator",
                    prompt_module=f"{prompt_base}.redator",
                    temperature=0.3,
                    max_tokens=10000,
                    output_key="embargos_declaracao_bruta",
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
            quality_module="packages.modules.document_types.embargos_declaracao.quality_rules",
            integrator_module="packages.modules.document_types.embargos_declaracao.integrator_rules",
            search_collections=["acervo_mprs", "memoria_pessoal"],
            search_datajud=True,
            search_web=True,
            min_score=60,
        )

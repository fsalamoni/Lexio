"""Lexio Module — Acao Civil Publica document type implementation."""

from packages.modules.document_types.base import BaseDocumentType
from packages.pipeline.pipeline_config import PipelineConfig, AgentConfig


class AcaoCivilPublicaDocumentType(BaseDocumentType):
    """Acao Civil Publica (Public Civil Action) — Full multi-agent pipeline for MP actions."""

    TEMPLATES = {
        "meio_ambiente": "packages.modules.document_types.acao_civil_publica.templates.meio_ambiente",
        "consumidor": "packages.modules.document_types.acao_civil_publica.templates.consumidor",
        "patrimonio_publico": "packages.modules.document_types.acao_civil_publica.templates.patrimonio_publico",
        "generic": "packages.modules.document_types.acao_civil_publica.templates.generic",
    }

    def get_id(self) -> str:
        return "acao_civil_publica"

    def get_name(self) -> str:
        return "Ação Civil Pública"

    def get_category(self) -> str:
        return "mp"

    def get_description(self) -> str:
        return (
            "Geração de petições iniciais de Ação Civil Pública com pipeline de 8 agentes IA. "
            "Lei 7.347/85, CDC, CF art. 129."
        )

    def get_pipeline_config(self, template_variant: str | None = None) -> PipelineConfig:
        variant = template_variant or "generic"
        prompt_base = self.TEMPLATES.get(variant, self.TEMPLATES["generic"])

        return PipelineConfig(
            document_type_id="acao_civil_publica",
            name="Pipeline Ação Civil Pública",
            description=f"Pipeline completo para ACP (variante: {variant})",
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
                    name="advogado_diabo",
                    phase="advogado_diabo",
                    prompt_module=f"{prompt_base}.advogado_diabo",
                    temperature=0.4,
                    max_tokens=2500,
                    output_key="criticas",
                ),
                AgentConfig(
                    name="jurista_v2",
                    phase="jurista_v2",
                    prompt_module=f"{prompt_base}.jurista_v2",
                    temperature=0.3,
                    max_tokens=4000,
                    output_key="teses_v2",
                ),
                AgentConfig(
                    name="fact_checker",
                    phase="fact_checker",
                    prompt_module=f"{prompt_base}.fact_checker",
                    temperature=0.1,
                    max_tokens=3000,
                    output_key="teses_verificadas",
                ),
                AgentConfig(
                    name="redator",
                    phase="redator",
                    prompt_module=f"{prompt_base}.redator",
                    temperature=0.3,
                    max_tokens=12000,
                    output_key="acp_bruta",
                ),
                AgentConfig(
                    name="revisor",
                    phase="revisor",
                    prompt_module=f"{prompt_base}.revisor",
                    temperature=0.2,
                    max_tokens=12000,
                    output_key="texto_revisado",
                ),
            ],
            quality_module="packages.modules.document_types.acao_civil_publica.quality_rules",
            integrator_module="packages.modules.document_types.acao_civil_publica.integrator_rules",
            search_datajud=True,
            search_web=True,
            min_score=65,
        )

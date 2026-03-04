"""Lexio Module — Parecer document type implementation."""

from packages.modules.document_types.base import BaseDocumentType
from packages.pipeline.pipeline_config import PipelineConfig, AgentConfig


class ParecerDocumentType(BaseDocumentType):
    """Parecer Jurídico (Legal Opinion) — Full multi-agent pipeline."""

    TEMPLATES = {
        "mprs_caopp": "packages.modules.document_types.parecer.templates.mprs_caopp",
        "generic": "packages.modules.document_types.parecer.templates.generic",
    }

    def get_id(self) -> str:
        return "parecer"

    def get_name(self) -> str:
        return "Parecer Jurídico"

    def get_category(self) -> str:
        return "mp"

    def get_description(self) -> str:
        return "Geração de pareceres jurídicos com pipeline de 10 agentes IA"

    def get_pipeline_config(self, template_variant: str | None = None) -> PipelineConfig:
        variant = template_variant or "generic"
        prompt_base = self.TEMPLATES.get(variant, self.TEMPLATES["generic"])

        return PipelineConfig(
            document_type_id="parecer",
            name="Pipeline Parecer Jurídico",
            description=f"Pipeline completo para parecer (variante: {variant})",
            model_triage="anthropic/claude-3.5-haiku",
            model_main="anthropic/claude-sonnet-4",
            agents=[
                AgentConfig(
                    name="triagem",
                    phase="triagem",
                    prompt_module=f"{prompt_base}.triagem",
                    model="anthropic/claude-3.5-haiku",
                    temperature=0.1,
                    max_tokens=400,
                    output_key="triagem_json",
                ),
                AgentConfig(
                    name="moderador_agenda",
                    phase="moderador_agenda",
                    prompt_module=f"{prompt_base}.moderador_agenda",
                    temperature=0.3,
                    max_tokens=2000,
                    output_key="topicos",
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
                    name="moderador_plano",
                    phase="moderador_plano",
                    prompt_module=f"{prompt_base}.moderador_plano",
                    temperature=0.3,
                    max_tokens=2000,
                    output_key="plano",
                ),
                AgentConfig(
                    name="redator",
                    phase="redator",
                    prompt_module=f"{prompt_base}.redator",
                    temperature=0.3,
                    max_tokens=8000,
                    output_key="parecer_bruto",
                ),
                AgentConfig(
                    name="revisor",
                    phase="revisor",
                    prompt_module=f"{prompt_base}.revisor",
                    temperature=0.2,
                    max_tokens=8000,
                    output_key="texto_revisado",
                ),
            ],
            quality_module="packages.modules.document_types.parecer.quality_rules",
            integrator_module="packages.modules.document_types.parecer.integrator_rules",
            search_datajud=True,
            search_web=True,
            min_score=60,
        )

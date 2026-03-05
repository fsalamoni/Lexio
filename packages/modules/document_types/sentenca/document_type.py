"""Lexio Module — Sentenca document type implementation."""

from packages.modules.document_types.base import BaseDocumentType
from packages.pipeline.pipeline_config import PipelineConfig, AgentConfig


class SentencaDocumentType(BaseDocumentType):
    """Sentenca (Judicial Sentence) — Pipeline for judicial decisions."""

    TEMPLATES = {
        "merito": "packages.modules.document_types.sentenca.templates.merito",
        "extincao_sem_merito": "packages.modules.document_types.sentenca.templates.extincao_sem_merito",
        "generic": "packages.modules.document_types.sentenca.templates.generic",
    }

    def get_id(self) -> str:
        return "sentenca"

    def get_name(self) -> str:
        return "Sentença"

    def get_category(self) -> str:
        return "judiciary"

    def get_description(self) -> str:
        return "Geração de sentenças judiciais com pipeline de 6 agentes IA (CPC arts. 489-495)"

    def get_pipeline_config(self, template_variant: str | None = None) -> PipelineConfig:
        variant = template_variant or "generic"
        prompt_base = self.TEMPLATES.get(variant, self.TEMPLATES["generic"])

        return PipelineConfig(
            document_type_id="sentenca",
            name="Pipeline Sentença Judicial",
            description=f"Pipeline completo para sentença judicial (variante: {variant})",
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
                    max_tokens=3000,
                    output_key="teses_verificadas",
                ),
                AgentConfig(
                    name="redator",
                    phase="redator",
                    prompt_module=f"{prompt_base}.redator",
                    temperature=0.3,
                    max_tokens=10000,
                    output_key="sentenca_bruta",
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
            quality_module="packages.modules.document_types.sentenca.quality_rules",
            integrator_module="packages.modules.document_types.sentenca.integrator_rules",
            search_datajud=True,
            search_web=True,
            min_score=65,
        )

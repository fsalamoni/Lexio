"""Lexio Pipeline — Configuration per document type."""

from dataclasses import dataclass, field


@dataclass
class AgentConfig:
    """Configuration for a single pipeline agent."""
    name: str
    phase: str
    prompt_module: str  # Python import path to the prompt module
    model: str | None = None  # Override model, else uses pipeline default
    temperature: float = 0.3
    max_tokens: int = 4000
    context_keys: list[str] = field(default_factory=list)  # Which context keys this agent reads
    output_key: str = ""  # Key where this agent's output is stored in context
    is_required: bool = True  # If false, pipeline continues on failure


@dataclass
class PipelineConfig:
    """Full pipeline configuration for a document type."""
    document_type_id: str
    name: str
    description: str = ""

    # Agent sequence (executed in order)
    agents: list[AgentConfig] = field(default_factory=list)

    # Models
    model_triage: str = "anthropic/claude-3.5-haiku"
    model_main: str = "anthropic/claude-sonnet-4"

    # Quality gate
    quality_module: str | None = None  # Python import path to quality rules
    min_score: int = 60

    # Integrator
    integrator_module: str | None = None  # Python import path to integrator rules

    # DOCX
    docx_template: str | None = None  # Path to docx template config

    # Search
    search_collections: list[str] = field(default_factory=list)
    search_datajud: bool = True
    search_web: bool = True

    def get_agent(self, name: str) -> AgentConfig | None:
        for a in self.agents:
            if a.name == name:
                return a
        return None

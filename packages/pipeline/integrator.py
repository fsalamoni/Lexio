"""Lexio Pipeline — Document integrator (header/footer via template)."""

import importlib
import logging
from datetime import datetime

from packages.pipeline.pipeline_config import PipelineConfig

logger = logging.getLogger("lexio.pipeline.integrator")


# Default header/footer (when no custom integrator rules)
def _default_header(context: dict) -> str:
    org_name = context.get("org_name", "")
    user_title = context.get("user_title", "")
    header_parts = []
    if org_name:
        header_parts.append(org_name)
    if user_title:
        header_parts.append(user_title)
    return "\n".join(header_parts)


def _default_footer(context: dict) -> str:
    data = datetime.now().strftime("%d de %B de %Y").replace(
        "January", "janeiro"
    ).replace("February", "fevereiro").replace("March", "março").replace(
        "April", "abril"
    ).replace("May", "maio").replace("June", "junho").replace(
        "July", "julho"
    ).replace("August", "agosto").replace("September", "setembro").replace(
        "October", "outubro"
    ).replace("November", "novembro").replace("December", "dezembro")

    cidade = context.get("cidade", "")
    local_line = f"{cidade}, {data}" if cidade else data
    return f"\n\n{local_line}"


async def integrate_document(
    context: dict,
    config: PipelineConfig,
) -> str:
    """Apply post-processing and integrate header/footer into the document text."""

    # Get the raw text (from the last agent — usually 'revisor' or 'redator')
    text = context.get("texto_revisado") or context.get("parecer_bruto") or context.get("texto_final", "")

    if not text:
        logger.warning("No text found in context for integration")
        return ""

    # Try custom integrator
    header = ""
    footer = ""

    if config.integrator_module:
        try:
            mod = importlib.import_module(config.integrator_module)
            if hasattr(mod, "get_header"):
                header = mod.get_header(context)
            if hasattr(mod, "get_footer"):
                footer = mod.get_footer(context)
            if hasattr(mod, "post_process"):
                text = mod.post_process(text, context)
        except Exception as e:
            logger.warning(f"Custom integrator failed: {e}")

    if not header:
        header = _default_header(context)
    if not footer:
        footer = _default_footer(context)

    # Clean up text
    text = text.strip()

    # Remove any stray markdown
    for marker in ["```", "**", "##", "###"]:
        text = text.replace(marker, "")

    # Assemble final document
    parts = []
    if header:
        parts.append(header)
    parts.append(text)
    if footer:
        parts.append(footer)

    return "\n\n".join(parts)

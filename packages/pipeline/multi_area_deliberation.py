"""Lexio Pipeline — Multi-area deliberation engine.

When a request involves multiple legal areas, this module orchestrates
agents from each area to deliberate and produce an integrated argument.
"""

import logging
from typing import Any

from packages.core.llm.client import call_llm
from packages.core.module_loader import module_registry

logger = logging.getLogger("lexio.pipeline.deliberation")


async def deliberate_multi_area(
    legal_area_ids: list[str],
    context: dict,
    model: str | None = None,
) -> dict[str, Any]:
    """Orchestrate agents from multiple legal areas in a deliberation round.

    Flow:
    1. Each area's jurista produces theses independently
    2. A moderator synthesizes into an integrated argument strategy
    3. Each area refines its section based on the integrated strategy
    4. Result is merged into the pipeline context

    Returns dict with keys per area + 'estrategia_integrada'.
    """
    tema = context.get("tema", "")
    results: dict[str, str] = {}

    # Phase 1: Independent theses from each area
    for area_id in legal_area_ids:
        area_info = module_registry.get(area_id)
        if not area_info or not area_info.instance:
            logger.warning(f"Area module '{area_id}' not found or not loaded")
            continue

        area_instance = area_info.instance
        if hasattr(area_instance, "generate_theses"):
            try:
                theses = await area_instance.generate_theses(context, model=model)
                results[f"teses_{area_id}"] = theses
            except Exception as e:
                logger.error(f"Area '{area_id}' thesis generation failed: {e}")
                results[f"teses_{area_id}"] = f"[Erro na área {area_id}: {e}]"
        else:
            logger.warning(f"Area '{area_id}' does not implement generate_theses")

    if not results:
        return {"estrategia_integrada": "", "areas_participantes": []}

    # Phase 2: Moderator synthesizes
    all_theses = "\n\n---\n\n".join(
        f"### {k.replace('teses_', '').upper()}\n{v}" for k, v in results.items()
    )

    moderator_result = await call_llm(
        system=(
            f'Você é o MODERADOR de um colegiado jurídico multidisciplinar.\n'
            f'Analise as teses de {len(results)} áreas sobre "{tema}".\n'
            f'Defina uma ESTRATÉGIA ARGUMENTATIVA INTEGRADA que:\n'
            f'1. Identifique pontos de convergência entre as áreas\n'
            f'2. Resolva conflitos normativos (ex: norma especial vs geral)\n'
            f'3. Defina a ordem dos argumentos (do mais forte ao subsidiário)\n'
            f'4. Atribua seções a cada área\n'
            f'Formato: texto corrido, sem JSON.'
        ),
        user=f'<tema>{tema}</tema>\n<teses_por_area>\n{all_theses}\n</teses_por_area>\nDefina a estratégia integrada.',
        model=model,
        max_tokens=3000,
        temperature=0.3,
    )

    results["estrategia_integrada"] = moderator_result["content"]
    results["areas_participantes"] = legal_area_ids

    logger.info(f"Multi-area deliberation complete: {len(legal_area_ids)} areas")
    return results

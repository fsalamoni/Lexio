"""Lexio Pipeline — Multi-area deliberation engine.

When a request involves multiple legal areas, this module orchestrates
agents from each area to deliberate and produce an integrated argument.

5-phase process:
1. Independent theses from each area's jurista (parallel)
2. Moderator synthesizes into integrated strategy
3. Each area refines its section based on integrated strategy (parallel)
4. Cross-area review for consistency
5. Final integrated output merged into pipeline context
"""

import asyncio
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
    1. Each area's jurista produces theses independently (parallel)
    2. A moderator synthesizes into an integrated argument strategy
    3. Each area refines its section based on the integrated strategy (parallel)
    4. Cross-area reviewer checks consistency and resolves conflicts
    5. Result is merged into the pipeline context

    Returns dict with keys per area + 'estrategia_integrada' + 'fundamentacao_integrada'.
    """
    tema = context.get("tema", "")
    msg_original = context.get("msgOriginal", tema)
    results: dict[str, Any] = {}

    # ── Phase 1: Independent theses from each area (parallel) ──
    logger.info(f"Phase 1: Generating theses for {len(legal_area_ids)} areas")

    async def _generate_thesis(area_id: str) -> tuple[str, str]:
        area_info = module_registry.get(area_id)
        if not area_info or not area_info.instance:
            logger.warning(f"Area module '{area_id}' not found or not loaded")
            return area_id, ""

        area_instance = area_info.instance
        if hasattr(area_instance, "generate_theses"):
            try:
                theses = await area_instance.generate_theses(context, model=model)
                return area_id, theses
            except Exception as e:
                logger.error(f"Area '{area_id}' thesis generation failed: {e}")
                return area_id, f"[Erro na área {area_id}: {e}]"
        else:
            # Fallback: use LLM directly with area guides
            guides = ""
            if hasattr(area_instance, "get_guides"):
                try:
                    guides = area_instance.get_guides()
                except Exception:
                    pass

            area_name = getattr(area_instance, "name", area_id)
            guides_section = ("Guias de referência:\n" + guides[:3000]) if guides else ""
            thesis_result = await call_llm(
                system=(
                    f"Você é um JURISTA especialista em {area_name}.\n"
                    f"Analise a questão jurídica e desenvolva as TESES principais "
                    f"sob a ótica do {area_name}.\n"
                    f"Cite artigos de lei, jurisprudência e doutrina.\n"
                    f"Formato: texto corrido, organizado por tese.\n\n"
                    f"{guides_section}"
                ),
                user=f"Questão: {msg_original}",
                model=model,
                max_tokens=4000,
                temperature=0.3,
            )
            return area_id, thesis_result["content"]

    thesis_tasks = [_generate_thesis(area_id) for area_id in legal_area_ids]
    thesis_results = await asyncio.gather(*thesis_tasks, return_exceptions=True)

    for result in thesis_results:
        if isinstance(result, Exception):
            logger.error(f"Thesis generation exception: {result}")
            continue
        area_id, theses = result
        if theses:
            results[f"teses_{area_id}"] = theses

    if not results:
        return {"estrategia_integrada": "", "areas_participantes": []}

    # ── Phase 2: Moderator synthesizes strategy ──
    logger.info("Phase 2: Moderator synthesizing integrated strategy")

    all_theses = "\n\n---\n\n".join(
        f"### {k.replace('teses_', '').upper()}\n{v}" for k, v in results.items()
        if k.startswith("teses_")
    )

    moderator_result = await call_llm(
        system=(
            f"Você é o MODERADOR de um colegiado jurídico multidisciplinar.\n"
            f"Analise as teses de {len(legal_area_ids)} áreas do Direito sobre o tema.\n\n"
            f"Sua tarefa é definir uma ESTRATÉGIA ARGUMENTATIVA INTEGRADA que:\n"
            f"1. IDENTIFIQUE pontos de convergência entre as áreas\n"
            f"2. RESOLVA conflitos normativos (norma especial vs geral, hierarquia)\n"
            f"3. DEFINA a ordem dos argumentos (do mais forte ao subsidiário)\n"
            f"4. ATRIBUA seções específicas a cada área\n"
            f"5. INDIQUE como as áreas devem se complementar\n"
            f"6. ESTABELEÇA a linha argumentativa central unificada\n\n"
            f"Formato: texto corrido estruturado, sem JSON."
        ),
        user=(
            f"<tema>{tema}</tema>\n"
            f"<solicitacao>{msg_original[:2000]}</solicitacao>\n"
            f"<teses_por_area>\n{all_theses}\n</teses_por_area>\n\n"
            f"Defina a estratégia argumentativa integrada."
        ),
        model=model,
        max_tokens=4000,
        temperature=0.3,
    )

    estrategia = moderator_result["content"]
    results["estrategia_integrada"] = estrategia

    # ── Phase 3: Each area refines based on strategy (parallel) ──
    logger.info("Phase 3: Areas refining sections based on integrated strategy")

    async def _refine_section(area_id: str) -> tuple[str, str]:
        area_theses = results.get(f"teses_{area_id}", "")
        area_info = module_registry.get(area_id)
        area_name = area_id
        if area_info and area_info.instance:
            area_name = getattr(area_info.instance, "name", area_id)

        refine_result = await call_llm(
            system=(
                f"Você é o JURISTA de {area_name} em um colegiado multidisciplinar.\n"
                f"O MODERADOR definiu uma estratégia integrada. Agora você deve:\n"
                f"1. REFINAR suas teses para alinhar com a estratégia\n"
                f"2. REDIGIR sua seção da fundamentação jurídica\n"
                f"3. CONECTAR seus argumentos com os das outras áreas\n"
                f"4. MANTER profundidade técnica e citações\n\n"
                f"Formato: seção de fundamentação pronta para integração."
            ),
            user=(
                f"<tema>{tema}</tema>\n"
                f"<suas_teses_iniciais>\n{area_theses[:3000]}\n</suas_teses_iniciais>\n"
                f"<estrategia_integrada>\n{estrategia[:3000]}\n</estrategia_integrada>\n\n"
                f"Redija sua seção da fundamentação jurídica."
            ),
            model=model,
            max_tokens=5000,
            temperature=0.3,
        )
        return area_id, refine_result["content"]

    refine_tasks = [_refine_section(area_id) for area_id in legal_area_ids
                    if f"teses_{area_id}" in results]
    refine_results = await asyncio.gather(*refine_tasks, return_exceptions=True)

    secoes_refinadas = {}
    for result in refine_results:
        if isinstance(result, Exception):
            logger.error(f"Section refinement exception: {result}")
            continue
        area_id, section = result
        results[f"secao_{area_id}"] = section
        secoes_refinadas[area_id] = section

    # ── Phase 4: Cross-area review ──
    logger.info("Phase 4: Cross-area consistency review")

    all_sections = "\n\n---\n\n".join(
        f"### {aid.upper()}\n{sec}" for aid, sec in secoes_refinadas.items()
    )

    reviewer_result = await call_llm(
        system=(
            f"Você é o REVISOR INTEGRADOR de um documento jurídico multidisciplinar.\n"
            f"Analise as seções produzidas por {len(secoes_refinadas)} áreas e:\n"
            f"1. VERIFIQUE coerência argumentativa entre as seções\n"
            f"2. ELIMINE redundâncias e contradições\n"
            f"3. AJUSTE transições entre seções para fluência\n"
            f"4. GARANTA que a linha argumentativa central é mantida\n"
            f"5. UNIFIQUE o texto em uma fundamentação jurídica coesa\n\n"
            f"Produza a fundamentação jurídica integrada final."
        ),
        user=(
            f"<tema>{tema}</tema>\n"
            f"<estrategia>\n{estrategia[:2000]}\n</estrategia>\n"
            f"<secoes_por_area>\n{all_sections}\n</secoes_por_area>\n\n"
            f"Integre as seções em uma fundamentação jurídica coesa."
        ),
        model=model,
        max_tokens=8000,
        temperature=0.2,
    )

    results["fundamentacao_integrada"] = reviewer_result["content"]
    results["areas_participantes"] = legal_area_ids

    logger.info(
        f"Multi-area deliberation complete: {len(legal_area_ids)} areas, "
        f"4 phases executed"
    )
    return results

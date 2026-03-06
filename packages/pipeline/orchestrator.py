"""Lexio Pipeline — Generic orchestrator (evolved from OpenClaw orchestrator.py).

Loads pipeline configuration from the document_type module and executes
agents in sequence, managing shared context and progress reporting.
"""

import logging
import time
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.config import settings
from packages.core.database.engine import async_session
from packages.core.database.models.document import Document
from packages.core.database.models.execution import Execution
from packages.core.embedding import generate_embedding
from packages.core.search import search_qdrant, search_datajud, search_legislacao
from packages.core.websocket import progress_manager
from packages.core.llm.cost_tracker import CostTracker
from packages.core.events import event_bus, EventType
from packages.core.module_loader import module_registry

from packages.pipeline.agent import BaseAgent
from packages.pipeline.pipeline_config import PipelineConfig
from packages.pipeline.quality_gate import evaluate_quality
from packages.pipeline.integrator import integrate_document
from packages.pipeline.docx_generator import generate_docx
from packages.pipeline.multi_area_deliberation import deliberate_multi_area

logger = logging.getLogger("lexio.pipeline")


class PipelineOrchestrator:
    """Orchestrates the full document generation pipeline."""

    def __init__(
        self,
        document_id: str,
        pipeline_config: PipelineConfig,
        anamnesis_context: dict | None = None,
    ):
        self.document_id = document_id
        self.config = pipeline_config
        self.anamnesis_context = anamnesis_context or {}
        self.context: dict = {}
        self.cost_tracker = CostTracker()

    async def run(self):
        """Execute the full pipeline."""
        t0 = time.time()
        doc_id = self.document_id

        await self._send_progress("iniciando", "Iniciando pipeline...", 0)
        await event_bus.emit(EventType.PIPELINE_STARTED, {"document_id": doc_id})

        async with async_session() as db:
            try:
                # 1. Load document
                doc = await self._load_document(db)
                if not doc:
                    return

                self.context["msgOriginal"] = doc.original_request
                self.context["document_id"] = str(doc.id)
                self.context["document_type"] = self.config.document_type_id
                self.context["org_id"] = str(doc.organization_id)

                # Inject anamnesis context (profile prefs + enriched request)
                if self.anamnesis_context:
                    self.context.update(self.anamnesis_context)
                    # Prefer enriched request when available
                    if self.anamnesis_context.get("msgEnriquecida"):
                        self.context["msgOriginal"] = self.anamnesis_context["msgEnriquecida"]

                # 2. Research phase (search)
                await self._research_phase(db)

                # 2b. Multi-area deliberation (when ≥1 legal area selected)
                legal_area_ids = doc.legal_area_ids or []
                if legal_area_ids:
                    await self._send_progress(
                        "deliberacao",
                        f"Deliberação entre {len(legal_area_ids)} área(s) jurídica(s)...",
                        8,
                    )
                    try:
                        deliberation = await deliberate_multi_area(
                            legal_area_ids=legal_area_ids,
                            context=self.context,
                            model=self.config.model_main,
                        )
                        self.context.update(deliberation)
                        logger.info(
                            f"Multi-area deliberation complete: {legal_area_ids}"
                        )
                    except Exception as e:
                        logger.warning(f"Multi-area deliberation failed (non-fatal): {e}")

                # 3. Execute agents in sequence
                total_agents = len(self.config.agents)
                for i, agent_config in enumerate(self.config.agents):
                    progress_pct = int(((i + 1) / total_agents) * 90) + 5
                    phase_name = agent_config.phase

                    await self._send_progress(
                        phase_name,
                        f"Executando {agent_config.name}...",
                        progress_pct,
                    )
                    await event_bus.emit(EventType.PIPELINE_PHASE_CHANGED, {
                        "document_id": doc_id,
                        "phase": phase_name,
                        "agent": agent_config.name,
                    })

                    agent = BaseAgent(agent_config)
                    model = agent_config.model or self.config.model_main
                    if "triagem" in agent_config.name.lower():
                        model = self.config.model_triage

                    try:
                        result = await agent.execute(self.context, model_override=model)

                        # Store output in context
                        output_key = agent_config.output_key or agent_config.name
                        self.context[output_key] = result["content"]

                        # Track costs
                        self.cost_tracker.add(
                            model=result["model"],
                            tokens_in=result["tokens_in"],
                            tokens_out=result["tokens_out"],
                            cost=result["cost_usd"],
                            agent=agent_config.name,
                        )

                        # Save execution record
                        await self._save_execution(db, doc, result)

                    except Exception as e:
                        logger.error(f"Agent [{agent_config.name}] failed: {e}")
                        if agent_config.is_required:
                            raise
                        else:
                            logger.warning(f"Skipping optional agent [{agent_config.name}]")

                # 4. Integration (post-processing)
                await self._send_progress("integracao", "Integrando documento...", 92)
                texto_final = await integrate_document(self.context, self.config)
                self.context["texto_final"] = texto_final

                # 5. Quality gate
                await self._send_progress("qualidade", "Avaliando qualidade...", 95)
                quality = await evaluate_quality(texto_final, self.context, self.config)
                quality_score = quality.get("score", 0)
                quality_issues = quality.get("issues", [])

                # 6. DOCX generation
                await self._send_progress("docx", "Gerando DOCX...", 97)
                docx_path = await generate_docx(texto_final, self.context, self.config)

                # 7. Finalize
                duration_s = int(time.time() - t0)
                doc.texto_completo = texto_final
                doc.docx_path = docx_path
                doc.quality_score = quality_score
                doc.quality_issues = quality_issues
                doc.status = "concluido"
                doc.metadata_ = {
                    "cost": self.cost_tracker.summary(),
                    "duration_seconds": duration_s,
                    "pipeline_config": self.config.document_type_id,
                }
                await db.commit()

                await self._send_progress("concluido", "Documento concluído!", 100)
                await event_bus.emit(EventType.PIPELINE_COMPLETED, {
                    "document_id": doc_id,
                    "score": quality_score,
                    "cost": self.cost_tracker.total_cost,
                    "duration_s": duration_s,
                })

                logger.info(
                    f"Pipeline complete: doc={doc_id} score={quality_score} "
                    f"cost=${self.cost_tracker.total_cost:.4f} time={duration_s}s"
                )

                # Auto-populate thesis bank (fire-and-forget, non-blocking)
                asyncio.create_task(
                    self._auto_populate_theses(
                        document_id=doc_id,
                        organization_id=str(doc.organization_id),
                        author_id=str(doc.author_id) if doc.author_id else None,
                        text=texto_final,
                        document_type_id=self.config.document_type_id,
                        legal_area_ids=doc.legal_area_ids or [],
                    )
                )

            except Exception as e:
                logger.error(f"Pipeline failed for doc={doc_id}: {e}")
                doc = await self._load_document(db)
                if doc:
                    doc.status = "erro"
                    doc.metadata_ = {"error": str(e)}
                    await db.commit()
                await self._send_progress("erro", f"Erro: {str(e)[:200]}", 0)
                await event_bus.emit(EventType.PIPELINE_FAILED, {
                    "document_id": doc_id, "error": str(e),
                })

    async def _load_document(self, db: AsyncSession) -> Document | None:
        stmt = select(Document).where(Document.id == uuid.UUID(self.document_id))
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def _research_phase(self, db: AsyncSession):
        """Run all search services in parallel."""
        msg = self.context.get("msgOriginal", "")
        tema = self.context.get("tema", msg[:200])

        await self._send_progress("pesquisa", "Pesquisando acervo e jurisprudência...", 5)

        # Generate embedding for vector search
        try:
            vector = await generate_embedding(tema)
        except Exception as e:
            logger.warning(f"Embedding failed: {e}")
            vector = []

        # Search sources
        fragments = ""
        if vector:
            collections = self.config.search_collections or ["lexio_acervo"]
            for coll in collections:
                result = await search_qdrant(vector, collection=coll)
                if result:
                    fragments += result + "\n---\n"

        processos = ""
        if self.config.search_datajud:
            processos = await search_datajud(tema)

        legislacao = ""
        if self.config.search_web:
            legislacao = await search_legislacao(tema)

        self.context["fragmentosAcervo"] = fragments
        self.context["processosJudiciarios"] = processos
        self.context["legislacao"] = legislacao

    async def _save_execution(self, db: AsyncSession, doc: Document, result: dict):
        execution = Execution(
            document_id=doc.id,
            organization_id=doc.organization_id,
            agent_name=result.get("agent_name", "unknown"),
            phase=result.get("phase", "unknown"),
            model=result.get("model"),
            tokens_in=result.get("tokens_in", 0),
            tokens_out=result.get("tokens_out", 0),
            cost_usd=result.get("cost_usd", 0),
            duration_ms=result.get("total_duration_ms", 0),
            input_preview=result.get("input_preview", "")[:500],
            output_preview=result.get("content", "")[:500],
        )
        db.add(execution)
        await db.flush()

    async def _send_progress(self, phase: str, message: str, progress: int):
        await progress_manager.send(self.document_id, {
            "phase": phase,
            "message": message,
            "progress": progress,
        })

    async def _auto_populate_theses(
        self,
        document_id: str,
        organization_id: str,
        author_id: str | None,
        text: str,
        document_type_id: str,
        legal_area_ids: list[str],
    ):
        """Extract theses from completed document and store in thesis bank."""
        try:
            from packages.modules.thesis_bank.auto_populate import extract_theses_from_document
            async with async_session() as db:
                created = await extract_theses_from_document(
                    db=db,
                    organization_id=uuid.UUID(organization_id),
                    document_id=uuid.UUID(document_id),
                    document_text=text,
                    document_type_id=document_type_id,
                    legal_area_ids=legal_area_ids,
                    author_id=uuid.UUID(author_id) if author_id else None,
                )
            if created:
                logger.info(
                    f"Thesis bank auto-populated: {len(created)} theses "
                    f"from doc={document_id}"
                )
        except Exception as e:
            logger.warning(f"Thesis auto-populate failed for doc={document_id}: {e}")

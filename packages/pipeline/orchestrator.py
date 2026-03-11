"""Lexio Pipeline — Generic orchestrator (evolved from OpenClaw orchestrator.py).

Loads pipeline configuration from the document_type module and executes
agents in sequence, managing shared context and progress reporting.

CRITICAL FIX: Triagem must run FIRST (before research) so that the extracted
tema is used for semantic search. The JSON output is then parsed to populate
context["tema"], context["palavras_chave"], etc. before calling any search.
"""

import asyncio
import json
import logging
import re
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
from packages.pipeline.pipeline_config import AgentConfig, PipelineConfig
from packages.pipeline.quality_gate import evaluate_quality
from packages.pipeline.integrator import integrate_document
from packages.pipeline.docx_generator import generate_docx
from packages.pipeline.multi_area_deliberation import deliberate_multi_area

logger = logging.getLogger("lexio.pipeline")

# Temas genéricos/inválidos que o triador pode retornar — fallback para msgOriginal
_BAD_TEMAS = [
    'resumo', 'tema em', 'palavras', 'exemplo', 'proteção do patrimônio',
    'orientação jurídica', 'sem conteúdo', 'solicitação vazia', 'não especificado',
    'não identificado', 'campo vazio', 'tema jurídico', 'análise jurídica',
]


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
                self.context["org_uuid"] = doc.organization_id
                self.context["template_variant"] = doc.template_variant or ""
                self.context["legal_area_ids"] = doc.legal_area_ids or []

                # Inject anamnesis context (profile prefs + enriched request)
                if self.anamnesis_context:
                    self.context.update(self.anamnesis_context)
                    if self.anamnesis_context.get("msgEnriquecida"):
                        self.context["msgOriginal"] = self.anamnesis_context["msgEnriquecida"]

                # Separate triagem agent from the rest
                triagem_config = None
                remaining_agents = []
                for ac in self.config.agents:
                    if "triagem" in ac.name.lower() and triagem_config is None:
                        triagem_config = ac
                    else:
                        remaining_agents.append(ac)

                # 2. Run TRIAGEM FIRST — extract tema before search
                if triagem_config:
                    await self._run_triagem(db, doc, triagem_config)
                else:
                    # No triagem agent: fallback tema from msgOriginal
                    msg = self.context.get("msgOriginal", "")
                    self.context.setdefault("tema", msg[:300])
                    self.context.setdefault("area_direito", "direito administrativo")

                # 3. Research phase (now uses correctly extracted tema)
                await self._research_phase(db)

                # 4. Multi-area deliberation (when ≥1 legal area selected)
                legal_area_ids = doc.legal_area_ids or []
                if legal_area_ids:
                    await self._send_progress(
                        "deliberacao",
                        f"Deliberação entre {len(legal_area_ids)} área(s) jurídica(s)...",
                        12,
                    )
                    try:
                        deliberation = await deliberate_multi_area(
                            legal_area_ids=legal_area_ids,
                            context=self.context,
                            model=self.config.model_main,
                        )
                        self.context.update(deliberation)
                        logger.info(f"Multi-area deliberation complete: {legal_area_ids}")
                    except Exception as e:
                        logger.warning(f"Multi-area deliberation failed (non-fatal): {e}")

                # 5. Execute remaining agents in sequence
                total_agents = len(remaining_agents)
                for i, agent_config in enumerate(remaining_agents):
                    progress_pct = int(((i + 1) / max(total_agents, 1)) * 75) + 15
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

                    try:
                        result = await agent.execute(self.context, model_override=model)

                        output_key = agent_config.output_key or agent_config.name
                        self.context[output_key] = result["content"]

                        self.cost_tracker.add(
                            model=result["model"],
                            tokens_in=result["tokens_in"],
                            tokens_out=result["tokens_out"],
                            cost=result["cost_usd"],
                            agent=agent_config.name,
                        )

                        await self._save_execution(db, doc, result)

                    except Exception as e:
                        logger.error(f"Agent [{agent_config.name}] failed: {e}")
                        if agent_config.is_required:
                            raise
                        else:
                            logger.warning(f"Skipping optional agent [{agent_config.name}]")

                # 6. Integration (post-processing)
                await self._send_progress("integracao", "Integrando documento...", 92)
                texto_final = await integrate_document(self.context, self.config)
                self.context["texto_final"] = texto_final

                # 7. Quality gate
                await self._send_progress("qualidade", "Avaliando qualidade...", 95)
                quality = await evaluate_quality(texto_final, self.context, self.config)
                quality_score = quality.get("score", 0)
                quality_issues = quality.get("issues", [])

                # 8. DOCX generation
                await self._send_progress("docx", "Gerando DOCX...", 97)
                docx_path = await generate_docx(texto_final, self.context, self.config)

                # 9. Finalize
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

                # Create in-app notification for document author
                asyncio.create_task(
                    self._create_completion_notification(
                        document_id=doc_id,
                        author_id=str(doc.author_id) if doc.author_id else None,
                        organization_id=str(doc.organization_id),
                        quality_score=quality_score,
                        document_type_id=self.config.document_type_id,
                    )
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

    async def _run_triagem(self, db: AsyncSession, doc: Document, agent_config: AgentConfig):
        """Run triagem agent FIRST and parse JSON output to populate tema in context.

        This is the 'Parsear Triagem' step from OpenClaw n8n — without this,
        all subsequent agents receive tema="" which produces generic garbage output.
        """
        await self._send_progress("triagem", "Triagem: extraindo tema jurídico...", 2)
        await event_bus.emit(EventType.PIPELINE_PHASE_CHANGED, {
            "document_id": self.document_id,
            "phase": "triagem",
            "agent": agent_config.name,
        })

        agent = BaseAgent(agent_config)
        model = self.config.model_triage

        try:
            result = await agent.execute(self.context, model_override=model)
            raw_text = result["content"]

            # Store raw output
            output_key = agent_config.output_key or agent_config.name
            self.context[output_key] = raw_text

            # Parse JSON and populate context keys for all downstream agents
            self._parse_triagem_output(raw_text)

            self.cost_tracker.add(
                model=result["model"],
                tokens_in=result["tokens_in"],
                tokens_out=result["tokens_out"],
                cost=result["cost_usd"],
                agent=agent_config.name,
            )
            await self._save_execution(db, doc, result)

        except Exception as e:
            logger.error(f"Triagem agent failed: {e}")
            # Fallback: use msgOriginal as tema so pipeline can continue
            msg = self.context.get("msgOriginal", "")
            self.context["tema"] = msg[:300] if msg else "tema não identificado"
            self.context["palavras_chave"] = [w for w in msg.split() if len(w) > 3][:10]
            self.context["area_direito"] = "direito administrativo"
            self.context["tipo_ilicito"] = "a definir"
            self.context["subtemas"] = []

    def _parse_triagem_output(self, raw_text: str):
        """Parse triagem JSON output and set context keys with n8n-style fallbacks."""
        msg = self.context.get("msgOriginal", "")
        parsed: dict = {}

        try:
            m = re.search(r'\{[\s\S]*\}', raw_text)
            if m:
                parsed = json.loads(m.group(0))
        except Exception:
            logger.warning("Triagem JSON parse failed — using msgOriginal as fallback tema")

        # Validate tema (n8n 'Parsear Triagem' logic)
        tema = (parsed.get("tema") or "").strip()
        if not tema or len(tema) < 5 or any(bad in tema.lower() for bad in _BAD_TEMAS):
            tema = msg[:300] if msg else "tema não identificado"

        # Validate keywords
        kw = parsed.get("palavras_chave") or []
        if not isinstance(kw, list) or not kw:
            kw = [w for w in msg.split() if len(w) > 3][:10]

        self.context["tema"] = tema
        self.context["palavras_chave"] = kw
        self.context["area_direito"] = (parsed.get("area_direito") or "direito administrativo").strip()
        self.context["tipo_ilicito"] = (parsed.get("tipo_ilicito") or "a definir").strip()
        self.context["subtemas"] = parsed.get("subtemas") or []

        logger.info(
            f"Triagem → tema='{tema[:80]}' area='{self.context['area_direito']}' "
            f"kw={kw[:3]}"
        )

    async def _load_document(self, db: AsyncSession) -> Document | None:
        stmt = select(Document).where(Document.id == uuid.UUID(self.document_id))
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def _research_phase(self, db: AsyncSession):
        """Run all search services in parallel using the tema extracted from triagem."""
        msg = self.context.get("msgOriginal", "")
        tema = self.context.get("tema", msg[:200])
        kw = self.context.get("palavras_chave", [])

        # Build richer search query: tema + keywords (mirrors n8n embedding input)
        search_query = tema
        if kw:
            search_query = f"{tema} {' '.join(str(k) for k in kw[:5])}"

        await self._send_progress("pesquisa", "Pesquisando acervo e jurisprudência...", 5)

        # Generate embedding for vector search
        try:
            vector = await generate_embedding(search_query)
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

        # Inject relevant theses from thesis bank (non-blocking, non-fatal)
        await self._inject_theses(db)

    async def _inject_theses(self, db: AsyncSession):
        """Fetch relevant theses from thesis bank and prepend to fragmentosAcervo.

        Uses the organization's thesis bank to retrieve high-quality, active theses
        that match the current document type and/or legal area. Theses are prepended
        to fragmentosAcervo so all agents that use {fragmentosAcervo} benefit
        without any prompt modifications.
        """
        try:
            from packages.modules.thesis_bank.service import list_theses

            org_uuid = self.context.get("org_uuid")
            if not org_uuid:
                return

            doc_type = self.config.document_type_id
            legal_area_ids: list = self.context.get("legal_area_ids", [])
            primary_area = legal_area_ids[0] if legal_area_ids else None

            # Try area + type first; fallback to just area or just type
            theses_list, total = await list_theses(
                db=db,
                organization_id=org_uuid,
                legal_area_id=primary_area,
                document_type_id=doc_type,
                status="active",
                limit=5,
            )

            # If too few results, broaden query to area only
            if len(theses_list) < 3 and primary_area:
                broader, _ = await list_theses(
                    db=db,
                    organization_id=org_uuid,
                    legal_area_id=primary_area,
                    status="active",
                    limit=5,
                )
                # Merge, de-duplicate by id
                seen = {t.id for t in theses_list}
                for t in broader:
                    if t.id not in seen:
                        theses_list.append(t)
                        seen.add(t.id)
                        if len(theses_list) >= 5:
                            break

            if not theses_list:
                return

            # Format theses as context block
            thesis_lines = ["TESES JURÍDICAS REUTILIZÁVEIS (Banco da Organização):"]
            for i, thesis in enumerate(theses_list[:5], 1):
                thesis_lines.append(f"\n[Tese {i}] {thesis.title}")
                if thesis.summary:
                    thesis_lines.append(f"Resumo: {thesis.summary}")
                thesis_lines.append(f"Conteúdo: {thesis.content[:600]}")
                if thesis.legal_basis:
                    bases = [f"{b.get('law', '')} art. {b.get('article', '')}"
                             for b in thesis.legal_basis[:3] if isinstance(b, dict)]
                    if bases:
                        thesis_lines.append(f"Base legal: {', '.join(bases)}")
                if thesis.quality_score:
                    thesis_lines.append(f"Score de qualidade: {thesis.quality_score}/100")

            thesis_block = "\n".join(thesis_lines) + "\n---\n"

            # Prepend to fragmentosAcervo (all agents with {fragmentosAcervo} benefit)
            existing = self.context.get("fragmentosAcervo", "")
            self.context["fragmentosAcervo"] = thesis_block + existing

            logger.info(
                f"Injected {len(theses_list)} theses into fragmentosAcervo "
                f"(org={self.context.get('org_id')}, area={primary_area}, type={doc_type})"
            )

        except Exception as e:
            logger.warning(f"Thesis injection failed (non-fatal): {e}")

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

    async def _create_completion_notification(
        self,
        document_id: str,
        author_id: str | None,
        organization_id: str,
        quality_score: int,
        document_type_id: str,
    ):
        """Create an in-app notification when a document is successfully generated."""
        try:
            from packages.core.database.models.notification import Notification

            doc_type_labels = {
                "parecer": "Parecer Jurídico",
                "peticao_inicial": "Petição Inicial",
                "contestacao": "Contestação",
                "recurso": "Recurso",
                "sentenca": "Sentença",
                "acao_civil_publica": "Ação Civil Pública",
            }
            label = doc_type_labels.get(document_type_id, document_type_id)
            score_text = f" (score {quality_score}/100)" if quality_score else ""

            notif = Notification(
                organization_id=uuid.UUID(organization_id),
                user_id=uuid.UUID(author_id) if author_id else None,
                type="document_completed",
                title=f"{label} gerado com sucesso!",
                message=f"Seu documento foi gerado{score_text}. Revise e aprove ou envie para revisão.",
                document_id=uuid.UUID(document_id),
            )
            async with async_session() as db:
                db.add(notif)
                await db.commit()
        except Exception as e:
            logger.warning(f"Failed to create completion notification: {e}")

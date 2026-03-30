"""Lexio Thesis Bank — Extract thesis data from Qdrant vector collections.

Provides tooling to read the vectorized legal corpus stored in Qdrant and
seed the thesis bank with pre-classified legal arguments.

Usage (CLI)::

    python -m packages.modules.thesis_bank.qdrant_extractor

Usage (programmatic)::

    from packages.modules.thesis_bank.qdrant_extractor import seed_from_local_data
    created = await seed_from_local_data(db, organization_id)
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from packages.modules.thesis_bank.seed_data import SEED_THESES

logger = logging.getLogger("lexio.thesis_bank.qdrant_extractor")


async def seed_from_local_data(
    db: Any,
    organization_id: uuid.UUID,
    *,
    author_id: uuid.UUID | None = None,
    skip_existing: bool = True,
) -> list[dict[str, str]]:
    """Seed the thesis bank with pre-extracted theses from the Qdrant corpus.

    Parameters
    ----------
    db:
        An ``AsyncSession`` (SQLAlchemy) connected to the database.
    organization_id:
        UUID of the target organisation.
    author_id:
        Optional UUID of the user that should own the theses.
    skip_existing:
        When *True* (default), theses whose title already exists for
        the organisation are skipped, making the function idempotent.

    Returns
    -------
    list[dict]
        A list of ``{"id": ..., "title": ...}`` for every thesis created.
    """
    from packages.modules.thesis_bank.service import create_thesis, list_theses

    # If skip_existing, fetch existing titles for deduplication
    existing_titles: set[str] = set()
    if skip_existing:
        existing, _total = await list_theses(
            db,
            organization_id,
            limit=1000,
            status="active",
        )
        existing_titles = {t.title for t in existing}

    created: list[dict[str, str]] = []
    for thesis_data in SEED_THESES:
        title = thesis_data["title"]
        if title in existing_titles:
            logger.debug("Skipping existing thesis: %s", title)
            continue

        thesis = await create_thesis(
            db=db,
            organization_id=organization_id,
            data=thesis_data,
            author_id=author_id,
        )
        created.append({"id": str(thesis.id), "title": thesis.title})

    if created:
        await db.commit()
        logger.info(
            "Seeded %d theses for org %s (skipped %d existing)",
            len(created),
            organization_id,
            len(SEED_THESES) - len(created),
        )
    else:
        logger.info("No new theses to seed for org %s", organization_id)

    return created

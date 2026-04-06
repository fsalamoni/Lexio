"""Lexio Core — Document indexing into Qdrant (text extraction + embedding + upsert)."""

import io
import logging
import re
import uuid
from html.parser import HTMLParser

import httpx

from packages.core.config import settings
from packages.core.embedding import generate_embedding

logger = logging.getLogger("lexio.search.indexer")

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
COLLECTION = settings.qdrant_collection


def _strip_rtf(text: str) -> str:
    """Strip RTF control sequences and return plain text."""
    # Remove RTF groups and control words
    out = re.sub(r"\{\\[^{}]*\}", "", text)
    out = re.sub(r"\\[a-zA-Z]+[-]?\d*\s?", " ", out)
    out = re.sub(r"[{}]", "", out)
    out = out.replace("\\\\", "\\")
    out = re.sub(r"\\'[0-9a-fA-F]{2}", "", out)
    out = re.sub(r"\s+", " ", out).strip()
    return out


class _HTMLTextExtractor(HTMLParser):
    """Simple HTML parser that extracts visible text content."""

    _skip_tags = frozenset({"script", "style", "noscript", "svg", "head"})

    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in self._skip_tags:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in self._skip_tags and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0 and data.strip():
            self._parts.append(data.strip())

    def get_text(self) -> str:
        return " ".join(self._parts)


def _strip_html(html: str) -> str:
    """Strip HTML tags and return plain text."""
    parser = _HTMLTextExtractor()
    try:
        parser.feed(html)
        return parser.get_text()
    except Exception:
        # Regex fallback
        text = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.IGNORECASE)
        text = re.sub(r"<style[\s\S]*?</style>", "", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text


def _extract_text(content: bytes, content_type: str, filename: str) -> str:
    """Extract plain text from uploaded file bytes."""
    fname = filename.lower()
    normalized_content_type = content_type.lower()
    text_like_mime_types = {
        "text/plain",
        "text/markdown",
        "text/x-markdown",
        "application/json",
        "text/json",
        "application/ld+json",
        "application/x-ndjson",
        "text/csv",
        "application/vnd.ms-excel",
        "application/xml",
        "text/xml",
        "application/xhtml+xml",
        "application/x-yaml",
        "application/yaml",
        "text/yaml",
        "text/x-yaml",
        "text/html",
        "text/log",
        "text/x-log",
    }
    text_like_extensions = (
        ".txt",
        ".md",
        ".json",
        ".csv",
        ".xml",
        ".yaml",
        ".yml",
        ".html",
        ".htm",
        ".log",
    )

    # RTF — strip control sequences to get plain text
    if fname.endswith(".rtf") or normalized_content_type in ("application/rtf", "text/rtf"):
        try:
            raw = content.decode("utf-8", errors="replace")
            return _strip_rtf(raw)
        except Exception as e:
            logger.warning(f"RTF extraction failed: {e}")
            return ""

    # HTML / XHTML — strip tags to get plain text
    if (
        fname.endswith((".html", ".htm"))
        or normalized_content_type in ("text/html", "application/xhtml+xml")
    ):
        try:
            raw = content.decode("utf-8", errors="replace")
            return _strip_html(raw)
        except Exception as e:
            logger.warning(f"HTML extraction failed: {e}")
            return ""

    # Plain text-like formats (TXT, MD, JSON, CSV, XML, YAML, LOG, etc.)
    if (
        normalized_content_type in text_like_mime_types
        or normalized_content_type.startswith("text/")
        or fname.endswith(text_like_extensions)
    ):
        try:
            return content.decode("utf-8", errors="replace")
        except Exception:
            return content.decode("latin-1", errors="replace")

    # DOCX
    if fname.endswith(".docx") or "wordprocessingml" in normalized_content_type:
        try:
            from docx import Document as DocxDoc
            doc = DocxDoc(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as e:
            logger.warning(f"DOCX extraction failed: {e}")
            return ""

    # PDF
    if fname.endswith(".pdf") or "pdf" in normalized_content_type:
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            parts = []
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    parts.append(text)
            return "\n".join(parts)
        except Exception as e:
            logger.warning(f"PDF extraction failed: {e}")
            return ""

    logger.warning(f"Unsupported file type: {filename} ({content_type})")
    return ""


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks."""
    if not text.strip():
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
        if start >= len(text):
            break
    return [c for c in chunks if c.strip()]


async def _ensure_collection(client: httpx.AsyncClient, collection: str) -> None:
    """Create Qdrant collection if it does not exist."""
    resp = await client.get(
        f"{settings.qdrant_url}/collections/{collection}",
        headers={"api-key": settings.qdrant_api_key},
    )
    if resp.status_code == 200:
        return

    # Determine vector size from embed model (try a test embedding)
    try:
        test_vec = await generate_embedding("teste")
        vector_size = len(test_vec) or 1024
    except Exception:
        vector_size = 1024

    create_resp = await client.put(
        f"{settings.qdrant_url}/collections/{collection}",
        headers={"api-key": settings.qdrant_api_key},
        json={
            "vectors": {
                "size": vector_size,
                "distance": "Cosine",
            }
        },
    )
    if create_resp.status_code not in (200, 201):
        raise RuntimeError(f"Failed to create Qdrant collection '{collection}': {create_resp.text}")
    logger.info(f"Qdrant collection '{collection}' created (dim={vector_size})")


async def index_document(
    content: bytes,
    content_type: str,
    filename: str,
    organization_id: str,
    document_id: str,
    collection: str = COLLECTION,
) -> int:
    """Extract text, chunk, embed and upsert into Qdrant. Returns number of chunks indexed."""
    text = _extract_text(content, content_type, filename)
    if not text.strip():
        logger.warning(f"No text extracted from '{filename}'")
        return 0

    chunks = _chunk_text(text)
    if not chunks:
        return 0

    async with httpx.AsyncClient(timeout=60.0) as client:
        await _ensure_collection(client, collection)

        points = []
        for i, chunk in enumerate(chunks):
            try:
                vector = await generate_embedding(chunk)
            except Exception as e:
                logger.warning(f"Embedding failed for chunk {i}: {e}")
                continue

            points.append({
                "id": str(uuid.uuid4()),
                "vector": vector,
                "payload": {
                    "text": chunk,
                    "source": filename,
                    "document_id": document_id,
                    "organization_id": organization_id,
                    "chunk_index": i,
                },
            })

        if not points:
            return 0

        resp = await client.put(
            f"{settings.qdrant_url}/collections/{collection}/points",
            headers={"api-key": settings.qdrant_api_key},
            json={"points": points},
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Qdrant upsert failed: {resp.text}")

    logger.info(f"Indexed {len(points)} chunks from '{filename}' into '{collection}'")
    return len(points)

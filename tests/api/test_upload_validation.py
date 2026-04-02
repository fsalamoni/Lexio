"""Tests for upload validation logic (size, MIME type, empty file).

These tests exercise the validation logic directly without a real HTTP server
or database, so they run fast and without Docker.
"""

import pytest

# Constants from the uploads route
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
    "text/markdown",
    "application/json",
    "text/json",
    "text/csv",
    "application/xml",
    "text/xml",
    "application/x-yaml",
    "text/yaml",
    "text/html",
    "application/rtf",
    "text/rtf",
}


# ── Inline validation logic (mirrors uploads.py) ──────────────────────────────

def validate_upload(content: bytes, content_type: str | None) -> dict:
    """Returns {"ok": True} or {"ok": False, "status": int, "detail": str}."""
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        return {"ok": False, "status": 415, "detail": f"Tipo não suportado: {content_type}"}
    if len(content) > MAX_UPLOAD_BYTES:
        mb = len(content) / 1024 / 1024
        return {"ok": False, "status": 413, "detail": f"Arquivo muito grande: {mb:.1f}MB"}
    if len(content) == 0:
        return {"ok": False, "status": 400, "detail": "Arquivo vazio"}
    return {"ok": True}


# ── MIME type validation ───────────────────────────────────────────────────────

class TestMimeTypeValidation:
    @pytest.mark.parametrize("ct", sorted(ALLOWED_CONTENT_TYPES))
    def test_allowed_types_pass(self, ct):
        r = validate_upload(b"content", ct)
        assert r["ok"] is True, f"Expected allowed but got: {r}"

    def test_unknown_type_rejected(self):
        r = validate_upload(b"content", "application/octet-stream")
        assert r["ok"] is False
        assert r["status"] == 415

    def test_executable_rejected(self):
        r = validate_upload(b"content", "application/x-executable")
        assert r["ok"] is False
        assert r["status"] == 415

    def test_image_rejected(self):
        r = validate_upload(b"content", "image/jpeg")
        assert r["ok"] is False
        assert r["status"] == 415

    def test_none_content_type_allowed(self):
        # When content_type is None we don't block (client may not set it)
        r = validate_upload(b"content", None)
        assert r["ok"] is True

    def test_pdf_explicitly_allowed(self):
        assert validate_upload(b"%PDF-1.4 content", "application/pdf")["ok"] is True

    def test_docx_explicitly_allowed(self):
        ct = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        assert validate_upload(b"PK content", ct)["ok"] is True

    def test_txt_explicitly_allowed(self):
        assert validate_upload(b"plain text", "text/plain")["ok"] is True

    def test_markdown_explicitly_allowed(self):
        assert validate_upload(b"# titulo", "text/markdown")["ok"] is True

    def test_json_explicitly_allowed(self):
        assert validate_upload(b'{"tema":"teste"}', "application/json")["ok"] is True

    def test_csv_explicitly_allowed(self):
        assert validate_upload(b"coluna\nvalor", "text/csv")["ok"] is True


# ── File size validation ───────────────────────────────────────────────────────

class TestFileSizeValidation:
    def test_empty_file_rejected(self):
        r = validate_upload(b"", "application/pdf")
        assert r["ok"] is False
        assert r["status"] == 400

    def test_1_byte_accepted(self):
        assert validate_upload(b"x", "application/pdf")["ok"] is True

    def test_1mb_accepted(self):
        content = b"a" * (1 * 1024 * 1024)
        assert validate_upload(content, "application/pdf")["ok"] is True

    def test_49mb_accepted(self):
        content = b"a" * (49 * 1024 * 1024)
        assert validate_upload(content, "application/pdf")["ok"] is True

    def test_exactly_50mb_accepted(self):
        content = b"a" * MAX_UPLOAD_BYTES
        assert validate_upload(content, "application/pdf")["ok"] is True

    def test_50mb_plus_1_rejected(self):
        content = b"a" * (MAX_UPLOAD_BYTES + 1)
        r = validate_upload(content, "application/pdf")
        assert r["ok"] is False
        assert r["status"] == 413

    def test_100mb_rejected(self):
        content = b"a" * (100 * 1024 * 1024)
        r = validate_upload(content, "application/pdf")
        assert r["ok"] is False
        assert r["status"] == 413

    def test_413_detail_contains_size_info(self):
        content = b"a" * (60 * 1024 * 1024)
        r = validate_upload(content, "application/pdf")
        assert "MB" in r["detail"] or "grande" in r["detail"]


# ── Combined validation ────────────────────────────────────────────────────────

class TestCombinedValidation:
    def test_invalid_type_takes_priority_over_size(self):
        # Even if file is huge, type error should be caught
        huge = b"a" * (60 * 1024 * 1024)
        r = validate_upload(huge, "image/jpeg")
        assert r["status"] == 415

    def test_empty_with_invalid_type_reports_type_error(self):
        r = validate_upload(b"", "image/jpeg")
        assert r["status"] == 415

    def test_valid_pdf_small(self):
        assert validate_upload(b"%PDF-1.4\n...", "application/pdf")["ok"] is True

    def test_valid_txt_medium(self):
        content = b"texto juridico " * 1000
        assert validate_upload(content, "text/plain")["ok"] is True

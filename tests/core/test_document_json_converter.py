"""Tests for the document JSON converter module."""

from packages.core.search.document_json import (
    text_to_structured_json,
    serialize_structured_json,
    parse_structured_json,
    resolve_text_content,
)


SAMPLE_TEXT = """CAPÍTULO I — DOS DIREITOS FUNDAMENTAIS

Art. 1º Todo cidadão tem direito à vida, à liberdade e à igualdade.

Art. 2º São direitos sociais a educação, a saúde e o trabalho.

CAPÍTULO II — DAS GARANTIAS

Art. 3º O Estado garante a todos o acesso à justiça.

Este parágrafo trata dos procedimentos legais aplicáveis em casos de violação dos direitos fundamentais elencados no capítulo anterior."""


def test_converts_text_to_structured_json():
    result = text_to_structured_json(SAMPLE_TEXT, "constituicao.pdf", page_count=5)
    assert result["v"] == 1
    assert result["meta"]["filename"] == "constituicao.pdf"
    assert result["meta"]["format"] == "pdf"
    assert result["meta"]["pages"] == 5
    assert result["meta"]["paragraphs"] > 0
    assert result["meta"]["chars_original"] == len(SAMPLE_TEXT)
    assert result["meta"]["chars_stored"] > 0
    assert result["meta"]["compression_ratio"] >= 0
    assert len(result["sections"]) > 0
    assert result["full_text"]


def test_detects_section_headings():
    result = text_to_structured_json(SAMPLE_TEXT, "doc.pdf")
    titles = [s["title"] for s in result["sections"]]
    assert len(titles) >= 2
    assert any("CAPÍTULO" in t for t in titles)


def test_normalizes_whitespace():
    messy = "Hello   world.\n\n\n\n\nSecond   paragraph.\n\n\nThird."
    result = text_to_structured_json(messy, "test.txt")
    assert "   " not in result["full_text"]
    assert "\n\n\n" not in result["full_text"]


def test_compression():
    long_text = (
        "Este é um parágrafo de um documento jurídico com bastante    espaço   e\n"
        "quebras de linha    desnecessárias   que podem ser compactadas.\n\n\n\n"
    ) * 50
    result = text_to_structured_json(long_text, "documento.docx")
    assert result["meta"]["compression_ratio"] > 0
    assert result["meta"]["chars_stored"] < result["meta"]["chars_original"]


def test_serialize_parse_roundtrip():
    original = text_to_structured_json(SAMPLE_TEXT, "test.pdf", page_count=3)
    serialized = serialize_structured_json(original)
    parsed = parse_structured_json(serialized)
    assert parsed is not None
    assert parsed["v"] == 1
    assert parsed["meta"]["filename"] == "test.pdf"
    assert parsed["full_text"] == original["full_text"]
    assert len(parsed["sections"]) == len(original["sections"])


def test_parse_returns_none_for_plain_text():
    assert parse_structured_json("This is plain text") is None
    assert parse_structured_json("") is None
    assert parse_structured_json('{"v":2,"other":"data"}') is None
    assert parse_structured_json('{"name":"test"}') is None


def test_resolve_text_content_json():
    doc = text_to_structured_json(SAMPLE_TEXT, "test.txt")
    serialized = serialize_structured_json(doc)
    resolved = resolve_text_content(serialized)
    assert resolved == doc["full_text"]


def test_resolve_text_content_legacy():
    plain = "This is legacy plain text content."
    assert resolve_text_content(plain) == plain


def test_empty_text():
    result = text_to_structured_json("", "empty.txt")
    assert result["meta"]["paragraphs"] == 0
    assert result["full_text"] == ""


def test_format_detection():
    assert text_to_structured_json("x", "a.pdf")["meta"]["format"] == "pdf"
    assert text_to_structured_json("x", "b.docx")["meta"]["format"] == "docx"
    assert text_to_structured_json("x", "c.md")["meta"]["format"] == "md"
    assert text_to_structured_json("x", "d.json")["meta"]["format"] == "json"
    assert text_to_structured_json("x", "e.csv")["meta"]["format"] == "csv"
    assert text_to_structured_json("x", "f.xml")["meta"]["format"] == "xml"
    assert text_to_structured_json("x", "g.yaml")["meta"]["format"] == "yaml"
    assert text_to_structured_json("x", "h.html")["meta"]["format"] == "html"
    assert text_to_structured_json("x", "i.rtf")["meta"]["format"] == "rtf"
    assert text_to_structured_json("x", "j.log")["meta"]["format"] == "log"
    assert text_to_structured_json("x", "k.unknown")["meta"]["format"] == "txt"

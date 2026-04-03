"""Tests for search indexer text extraction support on common text formats."""

from packages.core.search.indexer import _extract_text


def test_extract_text_from_json_content_type():
    content = b'{"tema":"pesquisa","itens":[1,2]}'
    text = _extract_text(content, "application/json", "dados.json")
    assert "tema" in text
    assert "pesquisa" in text


def test_extract_text_from_yaml_extension():
    content = b"tema: jurisprudencia\ntribunal: TJRS\n"
    text = _extract_text(content, "application/octet-stream", "fonte.yaml")
    assert "tema:" in text
    assert "tribunal:" in text


def test_extract_text_from_csv_content_type():
    content = b"coluna,valor\nassunto,improbidade\n"
    text = _extract_text(content, "text/csv", "planilha.csv")
    assert "coluna,valor" in text
    assert "assunto" in text
    assert "improbidade" in text

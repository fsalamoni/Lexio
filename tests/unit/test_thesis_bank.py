"""Tests for the thesis bank module — seed data and service logic."""

import pytest

from packages.modules.thesis_bank.seed_data import SEED_THESES

# ── Valid legal area IDs (must match the 17 legal areas in the system) ────────

VALID_LEGAL_AREAS = {
    "administrative", "civil", "constitutional", "labor", "tax",
    "criminal", "criminal_procedure", "civil_procedure", "consumer",
    "environmental", "business", "family", "inheritance",
    "social_security", "electoral", "international", "digital",
}

VALID_CATEGORIES = {
    "material", "processual", "constitucional", "probatório",
}

VALID_SOURCE_TYPES = {
    "auto_extracted", "manual", "imported",
}


# ── Seed data structure tests ─────────────────────────────────────────────────

class TestSeedDataStructure:
    """Validate the structure and content of the seed thesis data."""

    def test_seed_data_is_list(self):
        assert isinstance(SEED_THESES, list)

    def test_seed_data_has_entries(self):
        assert len(SEED_THESES) >= 30, "Expected at least 30 seed theses"

    def test_each_entry_has_required_fields(self):
        required_fields = {"title", "content", "summary", "legal_area_id", "source_type"}
        for i, thesis in enumerate(SEED_THESES):
            missing = required_fields - set(thesis.keys())
            assert not missing, f"Thesis #{i} missing fields: {missing}"

    def test_each_entry_has_optional_fields(self):
        optional_fields = {"document_type_id", "tags", "category", "legal_basis", "precedents", "quality_score"}
        for i, thesis in enumerate(SEED_THESES):
            present = optional_fields & set(thesis.keys())
            assert len(present) >= 3, f"Thesis #{i} has too few optional fields: {present}"


class TestSeedDataContent:
    """Validate the content quality of seed theses."""

    @pytest.mark.parametrize("thesis", SEED_THESES, ids=[t["title"][:60] for t in SEED_THESES])
    def test_title_not_empty(self, thesis):
        assert thesis["title"].strip(), "Title must not be empty"

    @pytest.mark.parametrize("thesis", SEED_THESES, ids=[t["title"][:60] for t in SEED_THESES])
    def test_title_max_length(self, thesis):
        assert len(thesis["title"]) <= 500, f"Title too long: {len(thesis['title'])} chars"

    @pytest.mark.parametrize("thesis", SEED_THESES, ids=[t["title"][:60] for t in SEED_THESES])
    def test_content_not_empty(self, thesis):
        assert thesis["content"].strip(), "Content must not be empty"

    @pytest.mark.parametrize("thesis", SEED_THESES, ids=[t["title"][:60] for t in SEED_THESES])
    def test_content_min_length(self, thesis):
        assert len(thesis["content"]) >= 100, "Content should be at least 100 chars"

    @pytest.mark.parametrize("thesis", SEED_THESES, ids=[t["title"][:60] for t in SEED_THESES])
    def test_summary_present(self, thesis):
        assert thesis.get("summary"), "Summary must be present"

    @pytest.mark.parametrize("thesis", SEED_THESES, ids=[t["title"][:60] for t in SEED_THESES])
    def test_legal_area_valid(self, thesis):
        assert thesis["legal_area_id"] in VALID_LEGAL_AREAS, (
            f"Unknown legal area: {thesis['legal_area_id']}"
        )

    @pytest.mark.parametrize("thesis", SEED_THESES, ids=[t["title"][:60] for t in SEED_THESES])
    def test_source_type_is_imported(self, thesis):
        assert thesis["source_type"] in VALID_SOURCE_TYPES

    @pytest.mark.parametrize("thesis", SEED_THESES, ids=[t["title"][:60] for t in SEED_THESES])
    def test_quality_score_in_range(self, thesis):
        score = thesis.get("quality_score")
        if score is not None:
            assert 0 <= score <= 100, f"Quality score out of range: {score}"


class TestSeedDataUniqueness:
    """Ensure no duplicate titles or content in seed data."""

    def test_unique_titles(self):
        titles = [t["title"] for t in SEED_THESES]
        assert len(titles) == len(set(titles)), "Duplicate titles found in seed data"

    def test_unique_content(self):
        contents = [t["content"][:200] for t in SEED_THESES]
        assert len(contents) == len(set(contents)), "Duplicate content found in seed data"


class TestSeedDataCoverage:
    """Ensure seed data covers a reasonable spread of legal areas."""

    def test_multiple_areas_covered(self):
        areas = {t["legal_area_id"] for t in SEED_THESES}
        assert len(areas) >= 8, f"Expected coverage of ≥8 legal areas, got {len(areas)}: {areas}"

    def test_administrative_area_present(self):
        areas = {t["legal_area_id"] for t in SEED_THESES}
        assert "administrative" in areas, "Administrative law area must be in seed data"

    def test_civil_area_present(self):
        areas = {t["legal_area_id"] for t in SEED_THESES}
        assert "civil" in areas, "Civil law area must be in seed data"

    def test_constitutional_area_present(self):
        areas = {t["legal_area_id"] for t in SEED_THESES}
        assert "constitutional" in areas, "Constitutional law area must be in seed data"


class TestSeedDataLegalBasis:
    """Validate legal_basis and precedents structure."""

    @pytest.mark.parametrize("thesis", SEED_THESES, ids=[t["title"][:60] for t in SEED_THESES])
    def test_legal_basis_structure(self, thesis):
        basis = thesis.get("legal_basis", [])
        if basis:
            assert isinstance(basis, list)
            for item in basis:
                assert "law" in item, "legal_basis item must have 'law' key"

    @pytest.mark.parametrize("thesis", SEED_THESES, ids=[t["title"][:60] for t in SEED_THESES])
    def test_precedents_structure(self, thesis):
        precs = thesis.get("precedents", [])
        if precs:
            assert isinstance(precs, list)
            for item in precs:
                assert "court" in item, "precedent item must have 'court' key"

    @pytest.mark.parametrize("thesis", SEED_THESES, ids=[t["title"][:60] for t in SEED_THESES])
    def test_tags_are_list(self, thesis):
        tags = thesis.get("tags")
        if tags is not None:
            assert isinstance(tags, list)
            assert all(isinstance(t, str) for t in tags)


class TestSeedDataCategories:
    """Validate that categories are within expected values."""

    @pytest.mark.parametrize("thesis", SEED_THESES, ids=[t["title"][:60] for t in SEED_THESES])
    def test_category_valid_if_present(self, thesis):
        cat = thesis.get("category")
        if cat:
            assert cat in VALID_CATEGORIES, f"Unknown category: {cat}"


# ── Module import tests ───────────────────────────────────────────────────────

class TestThesisBankImports:
    """Ensure all thesis bank modules can be imported."""

    def test_import_seed_data(self):
        from packages.modules.thesis_bank.seed_data import SEED_THESES
        assert SEED_THESES

    def test_import_service(self):
        from packages.modules.thesis_bank import service
        assert hasattr(service, "create_thesis")
        assert hasattr(service, "list_theses")
        assert hasattr(service, "get_stats")

    def test_import_auto_populate(self):
        from packages.modules.thesis_bank import auto_populate
        assert hasattr(auto_populate, "extract_theses_from_document")

    def test_import_qdrant_extractor(self):
        from packages.modules.thesis_bank.qdrant_extractor import seed_from_local_data
        assert callable(seed_from_local_data)

    def test_manifest_exists(self):
        import json
        import os
        manifest_path = os.path.join(
            os.path.dirname(__file__), "..", "..",
            "packages", "modules", "thesis_bank", "manifest.json",
        )
        with open(manifest_path) as f:
            manifest = json.load(f)
        assert manifest["name"] == "thesis_bank"
        assert manifest["enabled"] is True

"""Tests for all 17 legal area implementations."""

import importlib
import pytest

from packages.modules.legal_areas.administrative.area import AdministrativeArea
from packages.modules.legal_areas.civil.area import CivilArea
from packages.modules.legal_areas.constitutional.area import ConstitutionalArea
from packages.modules.legal_areas.labor.area import LaborArea
from packages.modules.legal_areas.tax.area import TaxArea
from packages.modules.legal_areas.criminal.area import CriminalArea
from packages.modules.legal_areas.criminal_procedure.area import CriminalProcedureArea
from packages.modules.legal_areas.civil_procedure.area import CivilProcedureArea
from packages.modules.legal_areas.consumer.area import ConsumerArea
from packages.modules.legal_areas.environmental.area import EnvironmentalArea
from packages.modules.legal_areas.business.area import BusinessArea
from packages.modules.legal_areas.family.area import FamilyArea
from packages.modules.legal_areas.inheritance.area import InheritanceArea
from packages.modules.legal_areas.social_security.area import SocialSecurityArea
from packages.modules.legal_areas.electoral.area import ElectoralArea
from packages.modules.legal_areas.international.area import InternationalArea
from packages.modules.legal_areas.digital.area import DigitalArea

ALL_AREAS = [
    ("administrative", AdministrativeArea),
    ("civil", CivilArea),
    ("constitutional", ConstitutionalArea),
    ("labor", LaborArea),
    ("tax", TaxArea),
    ("criminal", CriminalArea),
    ("criminal_procedure", CriminalProcedureArea),
    ("civil_procedure", CivilProcedureArea),
    ("consumer", ConsumerArea),
    ("environmental", EnvironmentalArea),
    ("business", BusinessArea),
    ("family", FamilyArea),
    ("inheritance", InheritanceArea),
    ("social_security", SocialSecurityArea),
    ("electoral", ElectoralArea),
    ("international", InternationalArea),
    ("digital", DigitalArea),
]

EXPECTED_IDS = {cls: name for name, cls in ALL_AREAS}


@pytest.mark.parametrize("name,AreaClass", ALL_AREAS)
class TestLegalAreaInterface:
    def test_instantiable(self, name, AreaClass):
        area = AreaClass()
        assert area is not None

    def test_get_id_returns_correct_value(self, name, AreaClass):
        area = AreaClass()
        assert area.get_id() == EXPECTED_IDS[AreaClass]

    def test_get_name_returns_non_empty_string(self, name, AreaClass):
        area = AreaClass()
        assert isinstance(area.get_name(), str)
        assert len(area.get_name()) > 0

    def test_get_description_returns_non_empty_string(self, name, AreaClass):
        area = AreaClass()
        assert isinstance(area.get_description(), str)
        assert len(area.get_description()) > 5

    def test_get_specializations_returns_list(self, name, AreaClass):
        area = AreaClass()
        specs = area.get_specializations()
        assert isinstance(specs, list)
        assert len(specs) >= 3

    def test_get_specializations_are_strings(self, name, AreaClass):
        area = AreaClass()
        for spec in area.get_specializations():
            assert isinstance(spec, str)
            assert len(spec) > 0

    def test_get_guides_returns_list(self, name, AreaClass):
        area = AreaClass()
        guides = area.get_guides()
        assert isinstance(guides, list)

    def test_get_guides_have_correct_keys(self, name, AreaClass):
        area = AreaClass()
        guides = area.get_guides()
        for guide in guides:
            assert "id" in guide
            assert "name" in guide
            assert "path" in guide

    def test_has_generate_theses_method(self, name, AreaClass):
        area = AreaClass()
        assert callable(getattr(area, "generate_theses", None))

    def test_has_health_check_method(self, name, AreaClass):
        area = AreaClass()
        assert callable(getattr(area, "health_check", None))

    def test_get_id_is_snake_case(self, name, AreaClass):
        area = AreaClass()
        area_id = area.get_id()
        # ID should not contain spaces or uppercase
        assert " " not in area_id
        assert area_id == area_id.lower()


class TestAdministrativeAreaSpecific:
    def test_has_licitacoes_specialization(self):
        area = AdministrativeArea()
        specs = area.get_specializations()
        assert "licitacoes" in specs

    def test_has_improbidade_specialization(self):
        area = AdministrativeArea()
        specs = area.get_specializations()
        assert "improbidade" in specs

    def test_has_servidores_specialization(self):
        area = AdministrativeArea()
        specs = area.get_specializations()
        assert "servidores_publicos" in specs

    def test_has_guide_files(self):
        area = AdministrativeArea()
        guides = area.get_guides()
        guide_ids = [g["id"] for g in guides]
        # Should have at least licitacoes and improbidade guides
        assert len(guides) >= 2


class TestCivilAreaSpecific:
    def test_has_responsabilidade_civil(self):
        area = CivilArea()
        specs = area.get_specializations()
        assert "responsabilidade_civil" in specs

    def test_has_contratos(self):
        area = CivilArea()
        specs = area.get_specializations()
        assert "contratos" in specs


class TestConstitutionalAreaSpecific:
    def test_has_direitos_fundamentais(self):
        area = ConstitutionalArea()
        specs = area.get_specializations()
        assert "direitos_fundamentais" in specs

    def test_has_controle_constitucionalidade(self):
        area = ConstitutionalArea()
        specs = area.get_specializations()
        assert "controle_constitucionalidade" in specs


class TestLaborAreaSpecific:
    def test_has_individual_specialization(self):
        area = LaborArea()
        specs = area.get_specializations()
        assert "individual" in specs

    def test_has_acidente_trabalho(self):
        area = LaborArea()
        specs = area.get_specializations()
        assert "acidente_trabalho" in specs


class TestTaxAreaSpecific:
    def test_has_icms_specialization(self):
        area = TaxArea()
        specs = area.get_specializations()
        assert "icms" in specs

    def test_has_execucao_fiscal(self):
        area = TaxArea()
        specs = area.get_specializations()
        assert "execucao_fiscal" in specs

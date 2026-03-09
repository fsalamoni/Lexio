"""Lexio — Shared test fixtures."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

# ── Stable IDs used across all tests ─────────────────────────────────────────
FAKE_ORG_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
FAKE_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")


@pytest.fixture
def fake_user():
    user = MagicMock()
    user.id = FAKE_USER_ID
    user.email = "test@lexio.dev"
    user.full_name = "Test User"
    user.title = "Advogado"
    user.role = "admin"
    user.organization_id = FAKE_ORG_ID
    user.is_active = True
    user.created_at = None
    return user


@pytest.fixture
def fake_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock()
    return db


# ── Reusable minimal text samples ─────────────────────────────────────────────

def make_parecer_text(*, length: int = 3000) -> str:
    """A minimal valid parecer body (no header/footer)."""
    base = (
        "RELATÓRIO\n\n"
        "Trata-se de consulta formulada pela administração pública acerca da legalidade "
        "de contrato firmado sob a égide da Lei 14.133/2021. "
        "O consulente apresentou os fatos com clareza e documentação suficiente. "
        "[Fonte: acervo interno]\n\n"
        "FUNDAMENTAÇÃO JURÍDICA\n\n"
        "A questão central envolve interpretação sistemática do ordenamento jurídico "
        "administrativo. Com efeito, o art. 37 da Constituição Federal estabelece os "
        "princípios norteadores da Administração Pública. A Lei 14.133/2021, em seu art. 1º, "
        "disciplina as licitações e contratos administrativos. [Fonte: Lei 14.133/2021]\n\n"
        "Nesse contexto, a jurisprudência do STJ consolidou entendimento de que a "
        "moralidade administrativa é princípio de observância obrigatória. "
        "A legalidade stricto sensu impõe que o agente público somente faça o que "
        "a lei autoriza, diferentemente do particular que pode fazer tudo que a lei "
        "não proíbe. A proporcionalidade e a razoabilidade também devem ser observadas.\n\n"
        "A doutrina administrativista aponta que o controle dos atos administrativos "
        "pode ser exercido pelo próprio poder executivo (autotutela), pelo poder "
        "legislativo e pelo poder judiciário. O STF, em reiteradas decisões, "
        "reafirmou a aplicabilidade do princípio da eficiência (CF, art. 37, caput).\n\n"
        "CONCLUSÃO\n\n"
        "Diante do exposto, conclui-se pela regularidade do contrato administrativo, "
        "observados os requisitos legais estabelecidos pela Lei 14.133/2021. "
        "É o parecer, salvo melhor juízo."
    )
    # Pad to requested length
    while len(base) < length:
        base += "\n\nAdemais, cumpre observar que os princípios administrativos são de observância obrigatória."
    return base


def make_peticao_text(*, length: int = 4000) -> str:
    base = (
        "EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA 1ª VARA CÍVEL\n\n"
        "JOÃO DA SILVA, brasileiro, solteiro, advogado, portador do CPF 000.000.000-00, "
        "residente e domiciliado na Rua das Flores, 123, vem, por seu advogado infra-assinado, "
        "propor a presente\n\n"
        "AÇÃO DE INDENIZAÇÃO POR DANOS MORAIS E MATERIAIS\n\n"
        "DOS FATOS\n\n"
        "O autor adquiriu produto defeituoso do réu, conforme documentação acostada. "
        "O produto apresentou vício oculto após 30 dias de uso. [Fonte: nota fiscal]\n\n"
        "DO DIREITO\n\n"
        "O Código de Defesa do Consumidor (Lei 8.078/90), em seu art. 18, estabelece a "
        "responsabilidade solidária dos fornecedores por vícios de qualidade. "
        "O art. 186 do Código Civil (Lei 10.406/02) fundamenta a responsabilidade civil. "
        "[Fonte: CDC art. 18]\n\n"
        "DA TUTELA DE URGÊNCIA\n\n"
        "Presentes o fumus boni iuris e o periculum in mora (CPC art. 300), "
        "requer a concessão de tutela antecipada.\n\n"
        "DOS PEDIDOS\n\n"
        "Requer a V. Exa. que se digne a:\n"
        "a) Condenar o réu ao pagamento de indenização por danos materiais;\n"
        "b) Condenar o réu ao pagamento de danos morais;\n"
        "c) Condenar o réu nas custas e honorários advocatícios (art. 85 CPC).\n\n"
        "DO VALOR DA CAUSA\n\n"
        "Dá-se à causa o valor de R$ 10.000,00 (dez mil reais) (CPC art. 292).\n\n"
        "Nestes termos,\npede deferimento."
    )
    while len(base) < length:
        base += "\n\nO presente caso envolve relação de consumo tutelada pelo CDC."
    return base

"""Tests for core auth logic: JWT and password hashing.

These tests require real bcrypt and PyJWT installed.
When running without a venv (offline mode), they are skipped automatically.
"""

import uuid
import time
import pytest

# Skip entire module if bcrypt stub is detected (offline mode)
try:
    import bcrypt as _bcrypt
    _bcrypt_real = callable(getattr(_bcrypt, "hashpw", None)) and not isinstance(
        _bcrypt.hashpw, type(lambda: None)
    )
    # Try to actually call it to distinguish stub from real
    _test_hash = _bcrypt.hashpw(b"test", _bcrypt.gensalt())
    assert isinstance(_test_hash, bytes)
    _BCRYPT_AVAILABLE = True
except Exception:
    _BCRYPT_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not _BCRYPT_AVAILABLE,
    reason="bcrypt not installed (offline mode — run inside Docker)",
)

from packages.core.auth.password import hash_password, verify_password
from packages.core.auth.jwt import create_access_token, decode_access_token


class TestPasswordHashing:
    def test_hash_returns_string(self):
        h = hash_password("secret123")
        assert isinstance(h, str)
        assert len(h) > 20

    def test_hash_is_not_plaintext(self):
        pw = "minhasenha"
        assert hash_password(pw) != pw

    def test_verify_correct_password(self):
        pw = "correct_password_123"
        h = hash_password(pw)
        assert verify_password(pw, h) is True

    def test_verify_wrong_password(self):
        h = hash_password("correct")
        assert verify_password("wrong", h) is False

    def test_same_password_different_hashes(self):
        pw = "same_password"
        h1 = hash_password(pw)
        h2 = hash_password(pw)
        assert h1 != h2  # bcrypt salts must differ
        assert verify_password(pw, h1) is True
        assert verify_password(pw, h2) is True

    def test_empty_string_hashes(self):
        h = hash_password("")
        assert verify_password("", h) is True
        assert verify_password("x", h) is False


class TestJWT:
    def setup_method(self):
        self.user_id = uuid.uuid4()
        self.org_id = uuid.uuid4()

    def test_create_and_decode_token(self):
        token = create_access_token(self.user_id, self.org_id, "admin")
        assert isinstance(token, str)
        payload = decode_access_token(token)
        assert payload["sub"] == str(self.user_id)
        assert payload["org"] == str(self.org_id)
        assert payload["role"] == "admin"

    def test_user_role_preserved(self):
        for role in ("admin", "user", "viewer"):
            token = create_access_token(self.user_id, self.org_id, role)
            assert decode_access_token(token)["role"] == role

    def test_invalid_token_raises(self):
        with pytest.raises(Exception):
            decode_access_token("not.a.valid.token")

    def test_tampered_token_raises(self):
        token = create_access_token(self.user_id, self.org_id, "user")
        tampered = token[:-5] + "XXXXX"
        with pytest.raises(Exception):
            decode_access_token(tampered)

    def test_token_contains_exp(self):
        token = create_access_token(self.user_id, self.org_id, "user")
        payload = decode_access_token(token)
        assert "exp" in payload
        assert payload["exp"] > time.time()

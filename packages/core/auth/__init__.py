"""Lexio Core — Authentication & authorization."""

from packages.core.auth.jwt import create_access_token, decode_access_token
from packages.core.auth.password import hash_password, verify_password
from packages.core.auth.dependencies import get_current_user, get_current_admin
from packages.core.auth.permissions import Role, require_role

__all__ = [
    "create_access_token", "decode_access_token",
    "hash_password", "verify_password",
    "get_current_user", "get_current_admin",
    "Role", "require_role",
]
